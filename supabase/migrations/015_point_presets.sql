BEGIN;
CREATE TABLE ledger_private.point_presets(id text PRIMARY KEY,title text NOT NULL,points numeric NOT NULL,policy_version text NOT NULL);
INSERT INTO ledger_private.point_presets VALUES
 ('trash-out','Take out trash',0.5,'household-v1'),('trash-bag','Replace trash bag',0.5,'household-v1'),
 ('recycling-out','Take out recycling',0.5,'household-v1'),('bins-return','Return bins',0.5,'household-v1'),('bins-out','Take out bins',0.5,'household-v1'),
 ('dishwasher-start','Start dishwasher',0.5,'household-v1'),('sweep-kitchen','Sweep kitchen',2,'household-v1'),('sweep-living-room','Sweep living room',2,'household-v1'),
 ('sweep-corridor','Sweep corridor',1,'household-v1'),('bananas','Collect bananas',1,'household-v1'),('shared-groceries','Pick up shared groceries',2,'household-v1'),
 ('furniture-pickup','Pick up furniture',3,'household-v1'),('shared-repair','Repair a commonly used household item',3,'household-v1');
CREATE TABLE ledger_private.point_adjustments(id text PRIMARY KEY,task_id text NOT NULL,before_version integer NOT NULL,after_version integer NOT NULL,before_data jsonb NOT NULL,after_data jsonb NOT NULL,actor text NOT NULL,reason text NOT NULL,policy_version text NOT NULL,reverses text,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE ledger_private.point_policy_runs(request_id text PRIMARY KEY,fingerprint text NOT NULL,result jsonb NOT NULL);
ALTER TABLE ledger_private.point_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_private.point_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_private.point_policy_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ledger_private.point_presets,ledger_private.point_adjustments,ledger_private.point_policy_runs FROM PUBLIC,anon,authenticated;
CREATE FUNCTION ledger_private.chore_preset(p jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE preset record; pid text:=nullif(p->>'preset_id','');
BEGIN
 IF pid IS NULL THEN RETURN jsonb_build_object('preset_id',NULL,'point_policy',NULL); END IF;
 SELECT * INTO preset FROM ledger_private.point_presets WHERE id=pid;
 IF NOT FOUND THEN RAISE EXCEPTION 'Choose an existing point preset'; END IF;
 IF coalesce(p->>'kind','chore')<>'chore' OR (p->>'points')::numeric IS DISTINCT FROM preset.points THEN RAISE EXCEPTION 'Preset points are fixed. Choose Custom effort for a different job'; END IF;
 RETURN jsonb_build_object('preset_id',pid,'point_policy',preset.policy_version);
END; $$;
CREATE OR REPLACE FUNCTION ledger_private.chore_fields(p jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE due_at timestamptz; expires_at timestamptz; kind text;
BEGIN
 kind:=coalesce(p->>'kind',CASE WHEN p->>'points'='0' THEN 'reminder' ELSE 'chore' END);
 IF kind NOT IN ('reminder','request','chore') THEN RAISE EXCEPTION 'Choose a task type'; END IF;
 IF kind IN ('reminder','request') AND p->>'points' IS DISTINCT FROM '0' THEN RAISE EXCEPTION 'Reminders and requests earn no points'; END IF;
 IF jsonb_typeof(p->'title') IS DISTINCT FROM 'string' OR length(trim(p->>'title')) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Use a title of 1–120 characters'; END IF;
 IF jsonb_typeof(coalesce(p->'note','""'::jsonb)) IS DISTINCT FROM 'string' OR length(coalesce(p->>'note',''))>1000 THEN RAISE EXCEPTION 'Keep notes under 1,000 characters'; END IF;
 IF NOT ledger_private.valid_misc_icon_id(p->>'icon_id') THEN RAISE EXCEPTION 'Choose an icon'; END IF;
 IF coalesce(p->>'assignee','') NOT IN ('','michal','rina','ohm','rohil') THEN RAISE EXCEPTION 'Choose a roommate or Anyone'; END IF;
 IF jsonb_typeof(p->'pinned') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Choose whether to pin the chore'; END IF;
 due_at:=ledger_private.chore_deadline(p->>'due_on',p->>'due_time');
 expires_at:=ledger_private.chore_deadline(p->>'expires_on',p->>'expires_time');
 IF due_at IS NOT NULL AND expires_at IS NOT NULL AND expires_at<due_at THEN RAISE EXCEPTION 'Expiry must be at or after the deadline'; END IF;
 RETURN jsonb_build_object('kind',kind,'title',trim(p->>'title'),'note',coalesce(p->>'note',''),'icon_id',p->>'icon_id','assignee',nullif(p->>'assignee',''),
 'points',ledger_private.chore_effort(p->'points'),'pinned',p->'pinned','due_on',nullif(p->>'due_on',''),'due_time',nullif(p->>'due_time',''),'due_at',due_at,
 'expires_on',nullif(p->>'expires_on',''),'expires_time',nullif(p->>'expires_time',''),'expires_at',expires_at)||ledger_private.chore_preset(p);
END; $$;

CREATE OR REPLACE FUNCTION public.utilities_save_chore(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old record; prior record; payload jsonb; fp text:=md5(p::text); next_version integer; act text:=p->>'action'; item record;
BEGIN
 PERFORM ledger_private.materialize_chores();
 IF coalesce(p->>'actor','') NOT IN ('michal','rina','ohm','rohil') THEN RAISE EXCEPTION 'Choose who you are'; END IF;
 IF coalesce(p->>'id','') !~ '^[a-zA-Z0-9:_-]{16,180}$' OR coalesce(p->>'request_id','') !~ '^[a-zA-Z0-9_-]{16,100}$' THEN RAISE EXCEPTION 'Invalid request identifier'; END IF;
 SELECT * INTO prior FROM ledger_private.chore_task_events WHERE request_id=p->>'request_id';
 IF FOUND THEN
  IF prior.fingerprint<>fp THEN RAISE EXCEPTION 'This request was already used'; END IF;
  RETURN prior.data||jsonb_build_object('id',prior.id,'version',prior.version);
 END IF;
 IF act NOT IN ('create','edit','claim','hand_back','complete','quick_complete','undo','cancel','reopen') OR act IS NULL THEN RAISE EXCEPTION 'Choose a chore action'; END IF;
 SELECT * INTO old FROM ledger_private.current_chores WHERE id=p->>'id';
 IF NOT FOUND AND act<>'create' THEN
  -- An individually edited future occurrence keeps its snapshot across routine edits.
  SELECT * INTO item FROM ledger_private.chore_occurrences(((now() AT TIME ZONE 'America/New_York')::date+365)) WHERE id=p->>'id';
  IF FOUND THEN
   INSERT INTO ledger_private.chore_tasks VALUES(item.id,item.data,item.created_at) ON CONFLICT(id) DO NOTHING;
   SELECT * INTO old FROM ledger_private.current_chores WHERE id=p->>'id';
  END IF;
 END IF;
 IF act='create' THEN
  IF old.id IS NOT NULL OR (p->>'id') LIKE '%:%' THEN RAISE EXCEPTION 'This chore already exists'; END IF;
  payload:=ledger_private.chore_fields(p)||jsonb_build_object('requester',p->>'actor','routine_id',NULL,'cycle_start',NULL,'cycle_end',NULL,'state','active','completion',NULL,'reminder_group_id',p->>'reminder_group_id');
  IF p->'completion' IS NOT NULL AND p->'completion'<>'null'::jsonb THEN
   payload:=payload||jsonb_build_object('state','completed','completion',ledger_private.chore_completion(p->'completion'));
  END IF;
  INSERT INTO ledger_private.chore_tasks(id,data) VALUES(p->>'id',payload);
  next_version:=1;
 ELSE
  IF old.id IS NULL THEN RAISE EXCEPTION 'This chore could not be found'; END IF;
  IF (p->>'expected_version')::integer IS DISTINCT FROM old.version THEN RAISE EXCEPTION 'This chore changed. Refresh and review before saving'; END IF;
  payload:=old.data;next_version:=old.version+1;
  IF act='edit' THEN
   IF payload->>'reminder_group_id' IS NOT NULL AND coalesce(p->>'kind',CASE WHEN p->>'points'='0' THEN 'reminder' ELSE 'chore' END)<>'reminder' THEN RAISE EXCEPTION 'A recipient reminder must remain a reminder'; END IF;
   payload:=payload||ledger_private.chore_fields(p);
  ELSIF act IN ('claim','hand_back') THEN
   IF payload->>'state'<>'active' THEN RAISE EXCEPTION 'Reopen this chore before assigning it'; END IF;
   payload:=payload||jsonb_build_object('assignee',CASE WHEN act='claim' THEN p->>'actor' ELSE NULL END);
  ELSIF act='quick_complete' THEN
   IF ledger_private.chore_status(payload,now()) NOT IN ('active','overdue') THEN RAISE EXCEPTION 'This task is no longer open'; END IF;
   IF payload->>'assignee' IS NOT NULL AND payload->>'assignee'<>p->>'actor' THEN RAISE EXCEPTION 'Use completion details to cover another roommate'; END IF;
   payload:=payload||jsonb_build_object('state','completed','assignee',p->>'actor',
    'completion',jsonb_build_object('contributors',jsonb_build_array(p->>'actor'),'completed_at',now()));
  ELSIF act='complete' THEN
   IF payload->>'state'='cancelled' THEN RAISE EXCEPTION 'Reopen this chore before completing it'; END IF;
   IF (payload->>'kind'='request' OR payload->>'reminder_group_id' IS NOT NULL OR p->>'kind'='reminder') AND p->>'points' IS DISTINCT FROM '0' THEN RAISE EXCEPTION 'Reminders and requests earn no points'; END IF;
   PERFORM ledger_private.chore_preset(payload||jsonb_build_object('points',p->'points'));
   payload:=payload||jsonb_build_object('kind',CASE WHEN payload->>'kind'='request' THEN 'request' WHEN p->>'points'='0' THEN 'reminder' ELSE 'chore' END,'state','completed','points',ledger_private.chore_effort(p->'points'),'completion',ledger_private.chore_completion(p->'completion'));
  ELSIF act='undo' THEN
   IF payload->>'state'<>'completed' THEN RAISE EXCEPTION 'This chore has no completion to undo'; END IF;
   payload:=payload||jsonb_build_object('state','active','completion',NULL);
  ELSIF act='cancel' THEN payload:=payload||jsonb_build_object('state','cancelled','completion',NULL);
  ELSIF act='reopen' THEN
   IF payload->>'state'<>'cancelled' THEN RAISE EXCEPTION 'This chore is not cancelled'; END IF;
   payload:=payload||jsonb_build_object('state','active','completion',NULL);
  END IF;
 END IF;
 IF length(coalesce(p->>'change_note',''))>500 THEN RAISE EXCEPTION 'Keep the change note under 500 characters'; END IF;
 INSERT INTO ledger_private.chore_task_events VALUES(p->>'id',next_version,payload,p->>'actor',act,coalesce(p->>'change_note',''),now(),p->>'request_id',fp);
 RETURN payload||jsonb_build_object('id',p->>'id','version',next_version);
END; $$;

CREATE OR REPLACE FUNCTION ledger_private.chore_occurrences(until_day date)
RETURNS TABLE(id text,data jsonb,created_at timestamptz) LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE first_version record; revision record; cycle_day date; step jsonb; owner_name text; idx integer; interval_days integer; cycle_number integer;
BEGIN
 FOR first_version IN SELECT DISTINCT ON(e.id) e.* FROM ledger_private.chore_routine_events e ORDER BY e.id,e.version LOOP
  interval_days:=(first_version.data->>'interval_weeks')::integer*7;
  cycle_day:=(first_version.data->>'start_week')::date;
  WHILE cycle_day<=until_day LOOP
   SELECT e.* INTO revision FROM ledger_private.chore_routine_events e WHERE e.id=first_version.id AND e.effective_on<=cycle_day ORDER BY e.version DESC LIMIT 1;
   IF FOUND AND (revision.data->>'enabled')::boolean THEN
    cycle_number:=(cycle_day-(first_version.data->>'start_week')::date)/interval_days;
    idx:=mod(cycle_number+(revision.data->>'start_index')::integer,jsonb_array_length(revision.data->'owners'));
    owner_name:=revision.data->'owners'->>idx;
    FOR step IN SELECT value FROM jsonb_array_elements(revision.data->'steps') LOOP
     id:=coalesce(first_version.data->>'occurrence_root',first_version.id)||':'||cycle_day::text||':'||(step->>'id');
     data:=jsonb_build_object('kind',coalesce(step->>'kind',CASE WHEN step->>'points'='0' THEN 'reminder' ELSE 'chore' END),'title',step->>'title','note',step->>'note','icon_id',step->>'icon_id','points',(step->>'points')::numeric,
      'assignee',owner_name,'requester',first_version.actor,'pinned',false,'state','active','completion',NULL,
      'due_on',(cycle_day+(step->>'weekday')::integer)::text,'due_time',nullif(step->>'time',''),
      'due_at',ledger_private.chore_deadline((cycle_day+(step->>'weekday')::integer)::text,step->>'time'),
      'expires_on',NULL,'expires_time',NULL,'expires_at',NULL,
      'routine_id',first_version.id,'routine_title',revision.data->>'title','cycle_start',cycle_day,
      'cycle_end',(cycle_day+interval_days)::timestamp AT TIME ZONE 'America/New_York','schedule_version',revision.version,'step_id',step->>'id');
     IF step->>'preset_id' IS NOT NULL THEN data:=data||ledger_private.chore_preset(step); END IF;
     created_at:=first_version.created_at;
     RETURN NEXT;
    END LOOP;
   END IF;
   cycle_day:=cycle_day+interval_days;
  END LOOP;
 END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.utilities_save_chore_routine(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old record; prior record; first_version record; payload jsonb; steps jsonb:='[]'; step jsonb; owners jsonb; fp text:=md5(p::text);
 start_day date; effective_day date; interval_days integer; next_version integer; next_step jsonb;
BEGIN
 PERFORM ledger_private.materialize_chores();
 IF coalesce(p->>'actor','') NOT IN ('michal','rina','ohm','rohil') THEN RAISE EXCEPTION 'Choose who you are'; END IF;
 IF coalesce(p->>'id','') !~ '^[a-zA-Z0-9_-]{16,100}$' OR coalesce(p->>'request_id','') !~ '^[a-zA-Z0-9_-]{16,100}$' THEN RAISE EXCEPTION 'Invalid request identifier'; END IF;
 SELECT * INTO prior FROM ledger_private.chore_routine_events WHERE request_id=p->>'request_id';
 IF FOUND THEN
  IF prior.fingerprint<>fp THEN RAISE EXCEPTION 'This request was already used'; END IF;
  RETURN prior.data||jsonb_build_object('id',prior.id,'version',prior.version,'effective_on',prior.effective_on);
 END IF;
 SELECT * INTO old FROM ledger_private.chore_routine_events WHERE id=p->>'id' ORDER BY version DESC LIMIT 1;
 IF FOUND THEN
  IF (p->>'expected_version')::integer IS DISTINCT FROM old.version THEN RAISE EXCEPTION 'This routine changed. Refresh and review before saving'; END IF;
  IF p->>'start_week' IS DISTINCT FROM old.data->>'start_week' OR p->'interval_weeks' IS DISTINCT FROM old.data->'interval_weeks' THEN RAISE EXCEPTION 'Keep the original cycle anchor; create another routine to change its interval'; END IF;
  next_version:=old.version+1;
 ELSE
  IF coalesce((p->>'expected_version')::integer,0)<>0 THEN RAISE EXCEPTION 'This routine could not be found'; END IF;
  next_version:=1;
 END IF;
 IF jsonb_typeof(p->'title') IS DISTINCT FROM 'string' OR length(trim(p->>'title')) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Name the routine in 1–120 characters'; END IF;
 start_day:=ledger_private.chore_routine_start(p->>'start_week');
 IF jsonb_typeof(p->'interval_weeks') IS DISTINCT FROM 'number' OR p->>'interval_weeks' !~ '^([1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Repeat every 1–12 weeks'; END IF;
 interval_days:=(p->>'interval_weeks')::integer*7;
 owners:=ledger_private.chore_members(p->'owners');
 IF coalesce(p->>'start_index','') !~ '^[0-3]$' OR (p->>'start_index')::integer>=jsonb_array_length(owners) THEN RAISE EXCEPTION 'Choose who starts the rotation'; END IF;
 IF jsonb_typeof(p->'enabled') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Choose whether the routine is active'; END IF;
 IF jsonb_typeof(p->'steps') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'steps') NOT BETWEEN 1 AND 14 THEN RAISE EXCEPTION 'Add 1–14 steps'; END IF;
 FOR step IN SELECT value FROM jsonb_array_elements(p->'steps') LOOP
  IF coalesce(step->>'id','') !~ '^[a-zA-Z0-9_-]{1,64}$' OR EXISTS(SELECT 1 FROM jsonb_array_elements(steps) x WHERE x->>'id'=step->>'id') THEN RAISE EXCEPTION 'Use unique step identifiers'; END IF;
  IF jsonb_typeof(step->'weekday') IS DISTINCT FROM 'number' OR step->>'weekday' !~ '^[0-6]$' THEN RAISE EXCEPTION 'Choose a weekday'; END IF;
  PERFORM ledger_private.chore_fields(step||jsonb_build_object('assignee',NULL,'pinned',false,'due_on',(start_day+(step->>'weekday')::integer)::text,'due_time',step->>'time'));
  next_step:=jsonb_build_object('kind',coalesce(step->>'kind',CASE WHEN step->>'points'='0' THEN 'reminder' ELSE 'chore' END),'id',step->>'id','title',trim(step->>'title'),'note',coalesce(step->>'note',''),'icon_id',step->>'icon_id','points',(step->>'points')::numeric,'weekday',(step->>'weekday')::integer,'time',nullif(step->>'time',''))||ledger_private.chore_preset(step);
  steps:=steps||jsonb_build_array(next_step);
 END LOOP;
 effective_day:=start_day;
 IF next_version>1 AND start_day<=(now() AT TIME ZONE 'America/New_York')::date THEN
  effective_day:=start_day+(((now() AT TIME ZONE 'America/New_York')::date-start_day)/interval_days+1)*interval_days;
 END IF;
 payload:=jsonb_build_object('title',trim(p->>'title'),'start_week',start_day,'interval_weeks',(p->>'interval_weeks')::integer,'owners',owners,'start_index',(p->>'start_index')::integer,'steps',steps,'enabled',p->'enabled');
 -- A split routine retains its original occurrence keys for history and links.
 IF old.data ? 'occurrence_root' THEN payload:=payload||jsonb_build_object('occurrence_root',old.data->>'occurrence_root'); END IF;
 INSERT INTO ledger_private.chore_routine_events VALUES(p->>'id',next_version,effective_day,payload,p->>'actor',now(),p->>'request_id',fp);
 RETURN payload||jsonb_build_object('id',p->>'id','version',next_version,'effective_on',effective_day);
END; $$;

CREATE OR REPLACE FUNCTION public.utilities_chores_dashboard() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; local_day date:=(now() AT TIME ZONE 'America/New_York')::date;
BEGIN
 PERFORM ledger_private.materialize_chores();
 WITH actual AS (SELECT c.id,c.version,c.data,c.created_at,c.actor,false AS projected FROM ledger_private.current_chores c),
 projected AS (SELECT o.id,0 AS version,o.data,o.created_at,o.data->>'requester' AS actor,true AS projected FROM ledger_private.chore_occurrences(local_day+84) o WHERE NOT EXISTS(SELECT 1 FROM actual a WHERE a.id=o.id)),
 tasks AS (SELECT * FROM actual UNION ALL SELECT * FROM projected),
 credits AS (
  SELECT c.id,c.data->>'title' AS title,m.value AS member,ledger_private.chore_credit_amount(c.data) AS units,
   c.data->'completion'->>'completed_at' AS completed_at
  FROM actual c CROSS JOIN LATERAL jsonb_array_elements_text(c.data->'completion'->'contributors') m WHERE ledger_private.chore_credit_amount(c.data)>0
 ), periods AS (SELECT 'week' AS period,date_trunc('week',local_day::timestamp) AT TIME ZONE 'America/New_York' AS starts UNION ALL SELECT 'month',date_trunc('month',local_day::timestamp) AT TIME ZONE 'America/New_York' UNION ALL SELECT 'all',NULL::timestamptz),
 scores AS (SELECT p.period,m.member,coalesce(sum(c.units),0)::numeric AS units,coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.completed_at DESC,c.id) FILTER(WHERE c.id IS NOT NULL),'[]'::jsonb) AS entries
  FROM periods p CROSS JOIN unnest(ARRAY['michal','rina','ohm','rohil']) m(member) LEFT JOIN credits c ON c.member=m.member AND (p.starts IS NULL OR c.completed_at::timestamptz>=p.starts) GROUP BY p.period,m.member),
 ranked AS (SELECT *,rank() OVER(PARTITION BY period ORDER BY units DESC) AS rank FROM scores)
 SELECT jsonb_build_object('tasks',coalesce((SELECT jsonb_agg(data||jsonb_build_object('id',id,'version',version,'created_at',created_at,'actor',actor,'projected',projected,'status',ledger_private.chore_status(data,now())) ORDER BY created_at,id) FROM tasks),'[]'::jsonb),
 'routines',coalesce((SELECT jsonb_agg(data||jsonb_build_object('id',id,'version',version,'actor',actor,'effective_on',effective_on,'created_at',created_at) ORDER BY created_at,id) FROM (SELECT DISTINCT ON(id) * FROM ledger_private.chore_routine_events ORDER BY id,version DESC) r),'[]'::jsonb),
 'history',coalesce((SELECT jsonb_agg(data||jsonb_build_object('id',id,'version',version,'actor',actor,'action',action,'change_note',change_note,'created_at',created_at) ORDER BY created_at DESC,id,version DESC) FROM ledger_private.chore_task_events),'[]'::jsonb),
 'routine_history',coalesce((SELECT jsonb_agg(data||jsonb_build_object('id',id,'version',version,'actor',actor,'effective_on',effective_on,'created_at',created_at) ORDER BY created_at DESC,id,version DESC) FROM ledger_private.chore_routine_events),'[]'::jsonb),
 'point_adjustments',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY created_at) FROM ledger_private.point_adjustments a),'[]'::jsonb),
 'leaderboard',coalesce((SELECT jsonb_agg(to_jsonb(ranked) ORDER BY period,rank,member) FROM ranked),'[]'::jsonb),
 'updated_at',now(),'local_day',local_day,'projection_until',local_day+84,'format_version',1) INTO result;
 RETURN result;
END; $$;
-- Only explicit title matches are eligible for the one-time historical adoption.
-- Illustrations never determine credit.
CREATE FUNCTION ledger_private.match_point_preset(p jsonb) RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE WHEN coalesce(p->>'kind',CASE WHEN (p->>'points')::numeric=0 THEN 'reminder' ELSE 'chore' END)<>'chore' THEN NULL ELSE
 CASE lower(trim(p->>'title'))
 WHEN 'take out the trash' THEN 'trash-out' WHEN 'take out trash' THEN 'trash-out'
 WHEN 'put in new trash bag' THEN 'trash-bag' WHEN 'put in a new trash bag' THEN 'trash-bag' WHEN 'replace trash bag' THEN 'trash-bag'
 WHEN 'take out recycling' THEN 'recycling-out' WHEN 'bring bins back' THEN 'bins-return' WHEN 'return bins' THEN 'bins-return'
 WHEN 'take out bins' THEN 'bins-out' WHEN 'start dishwasher' THEN 'dishwasher-start'
 WHEN 'sweep kitchen' THEN 'sweep-kitchen' WHEN 'sweep living room' THEN 'sweep-living-room' WHEN 'sweep corridor' THEN 'sweep-corridor'
 WHEN 'pick up bananas' THEN 'bananas' WHEN 'collect bananas' THEN 'bananas'
 WHEN 'grocery pick up' THEN 'shared-groceries' WHEN 'pick up shared groceries' THEN 'shared-groceries'
 WHEN 'pick up furniture' THEN 'furniture-pickup' WHEN 'furniture pick-up' THEN 'furniture-pickup'
 WHEN 'repair a commonly used household item' THEN 'shared-repair' END END;
$$;
CREATE FUNCTION public.utilities_point_policy_preview() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 WITH tasks AS (
  SELECT c.id,c.version,c.data AS before_data,c.data||jsonb_build_object('preset_id',p.id,'point_policy',p.policy_version,'points',p.points) AS after_data
  FROM ledger_private.current_chores c JOIN ledger_private.point_presets p ON p.id=ledger_private.match_point_preset(c.data)
  WHERE c.data->>'state'<>'cancelled' AND c.data->>'preset_id' IS NULL
 ), routines AS (
  SELECT r.id,r.version,r.data AS before_data,r.data||jsonb_build_object('steps',(
   SELECT jsonb_agg(CASE WHEN p.id IS NULL OR s->>'preset_id' IS NOT NULL THEN s ELSE s||jsonb_build_object('preset_id',p.id,'point_policy',p.policy_version,'points',p.points) END ORDER BY ord)
   FROM jsonb_array_elements(r.data->'steps') WITH ORDINALITY x(s,ord) LEFT JOIN ledger_private.point_presets p ON p.id=ledger_private.match_point_preset(s))) AS after_data
  FROM (SELECT DISTINCT ON(id) * FROM ledger_private.chore_routine_events ORDER BY id,version DESC) r
 ) SELECT jsonb_build_object('policy_version','household-v1','tasks',coalesce((SELECT jsonb_agg(to_jsonb(tasks) ORDER BY id) FROM tasks),'[]'::jsonb),
 'routines',coalesce((SELECT jsonb_agg(to_jsonb(routines) ORDER BY id) FROM routines WHERE before_data<>after_data),'[]'::jsonb));
$$;
CREATE FUNCTION public.utilities_apply_point_policy(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE preview jsonb; item jsonb; result jsonb; prior record; saved jsonb; request text:=p->>'request_id'; actor text:=p->>'actor';
BEGIN
 IF coalesce(actor,'') NOT IN ('michal','rina','ohm','rohil') OR coalesce(request,'') !~ '^[a-zA-Z0-9_-]{16,100}$' THEN RAISE EXCEPTION 'Choose actor and request identifier'; END IF;
 PERFORM ledger_private.materialize_chores();
 LOCK TABLE ledger_private.chore_task_events,ledger_private.chore_routine_events,ledger_private.point_policy_runs IN EXCLUSIVE MODE;
 SELECT * INTO prior FROM ledger_private.point_policy_runs WHERE request_id=request;
 IF FOUND THEN
  IF prior.fingerprint<>md5(p::text) THEN RAISE EXCEPTION 'This request was already used'; END IF;
  RETURN prior.result;
 END IF;
 preview:=public.utilities_point_policy_preview();
 IF p->'expected_preview' IS DISTINCT FROM preview THEN RAISE EXCEPTION 'The point preview changed. Export and review the current preview'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(preview->'tasks') LOOP
  saved:=public.utilities_save_chore(item->'after_data'||jsonb_build_object('action','edit','id',item->>'id','expected_version',item->'version','actor',actor,
   'request_id',md5(request||':task:'||(item->>'id')),'change_note','Adopt household-v1 standardized points; original completion preserved'));
  INSERT INTO ledger_private.point_adjustments VALUES(md5(request||':adjustment:'||(item->>'id')),item->>'id',(item->>'version')::integer,(saved->>'version')::integer,item->'before_data',saved-'id'-'version',actor,'Adopt household-v1 standardized points','household-v1',NULL,now());
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(preview->'routines') LOOP
  PERFORM public.utilities_save_chore_routine(item->'after_data'||jsonb_build_object('id',item->>'id','expected_version',item->'version','actor',actor,'request_id',md5(request||':routine:'||(item->>'id'))));
 END LOOP;
 result:=jsonb_build_object('policy_version','household-v1','tasks',jsonb_array_length(preview->'tasks'),'routines',jsonb_array_length(preview->'routines'));
 INSERT INTO ledger_private.point_policy_runs VALUES(request,md5(p::text),result);
 RETURN result;
END; $$;
CREATE FUNCTION public.utilities_reverse_point_adjustment(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE adjustment record; current_task record; saved jsonb; prior record;
BEGIN
 IF coalesce(p->>'actor','') NOT IN ('michal','rina','ohm','rohil') OR coalesce(p->>'request_id','') !~ '^[a-zA-Z0-9_-]{16,100}$' THEN RAISE EXCEPTION 'Choose actor and request identifier'; END IF;
 PERFORM ledger_private.materialize_chores();
 LOCK TABLE ledger_private.chore_task_events,ledger_private.point_policy_runs IN EXCLUSIVE MODE;
 SELECT * INTO prior FROM ledger_private.point_policy_runs WHERE request_id=p->>'request_id';
 IF FOUND THEN
  IF prior.fingerprint<>md5(p::text) THEN RAISE EXCEPTION 'This request was already used'; END IF;RETURN prior.result;
 END IF;
 SELECT * INTO adjustment FROM ledger_private.point_adjustments WHERE id=p->>'adjustment_id';
 IF NOT FOUND THEN RAISE EXCEPTION 'Adjustment not found'; END IF;
 SELECT * INTO current_task FROM ledger_private.current_chores WHERE id=adjustment.task_id;
 IF current_task.version<>adjustment.after_version OR EXISTS(SELECT 1 FROM ledger_private.point_adjustments WHERE reverses=adjustment.id) THEN RAISE EXCEPTION 'This task changed after the adjustment; review it before correcting points'; END IF;
 saved:=public.utilities_save_chore(adjustment.before_data||jsonb_build_object('preset_id',adjustment.before_data->'preset_id','action','edit','id',adjustment.task_id,'expected_version',current_task.version,'actor',p->>'actor','request_id',p->>'request_id','change_note','Reverse household-v1 point adjustment'));
 INSERT INTO ledger_private.point_adjustments VALUES(md5(p->>'request_id'),adjustment.task_id,current_task.version,(saved->>'version')::integer,current_task.data,saved-'id'-'version',p->>'actor','Reverse household-v1 point adjustment','household-v1',adjustment.id,now());
 INSERT INTO ledger_private.point_policy_runs VALUES(p->>'request_id',md5(p::text),saved);RETURN saved;
END; $$;
REVOKE ALL ON FUNCTION ledger_private.chore_preset(jsonb),ledger_private.match_point_preset(jsonb),public.utilities_point_policy_preview(),public.utilities_apply_point_policy(jsonb),public.utilities_reverse_point_adjustment(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.utilities_point_policy_preview(),public.utilities_apply_point_policy(jsonb),public.utilities_reverse_point_adjustment(jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
