BEGIN;
-- Separate from financial ledgers. All changes are append-only revisions.
CREATE TABLE ledger_private.chore_routine_events (
 id text NOT NULL, version integer NOT NULL, effective_on date NOT NULL, data jsonb NOT NULL,
 actor text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 request_id text UNIQUE NOT NULL, fingerprint text NOT NULL, PRIMARY KEY(id,version)
);
CREATE TABLE ledger_private.chore_tasks (
 id text PRIMARY KEY, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ledger_private.chore_task_events (
 id text NOT NULL REFERENCES ledger_private.chore_tasks(id), version integer NOT NULL,
 data jsonb NOT NULL, actor text NOT NULL, action text NOT NULL, change_note text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), request_id text UNIQUE NOT NULL,
 fingerprint text NOT NULL, PRIMARY KEY(id,version)
);
ALTER TABLE ledger_private.chore_routine_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_private.chore_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_private.chore_task_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ledger_private.chore_routine_events,ledger_private.chore_tasks,ledger_private.chore_task_events FROM PUBLIC,anon,authenticated;

CREATE FUNCTION ledger_private.chore_members(p jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'array' OR jsonb_array_length(p) NOT BETWEEN 1 AND 4 THEN RAISE EXCEPTION 'Choose one to four roommates'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p) x WHERE x IS NULL OR x NOT IN ('michal','rina','ohm','rohil')) OR (SELECT count(DISTINCT x) FROM jsonb_array_elements_text(p) x)<>jsonb_array_length(p) THEN RAISE EXCEPTION 'Choose each roommate once'; END IF;
 RETURN p;
END; $$;
CREATE FUNCTION ledger_private.chore_points(p jsonb) RETURNS integer LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'number' OR p::text NOT IN ('1','2','3') THEN RAISE EXCEPTION 'Effort must be 1, 2, or 3 points'; END IF;
 RETURN p::text::integer;
END; $$;
CREATE FUNCTION ledger_private.chore_deadline(day_text text,time_text text) RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE d date;
BEGIN
 IF day_text IS NULL OR day_text='' THEN
   IF coalesce(time_text,'')<>'' THEN RAISE EXCEPTION 'Choose a date for the time'; END IF;
   RETURN NULL;
 END IF;
 IF day_text !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Choose a valid date'; END IF;
 d:=day_text::date;
 IF coalesce(time_text,'')='' THEN RETURN (d+1)::timestamp AT TIME ZONE 'America/New_York'; END IF;
 IF time_text !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION 'Choose a valid time'; END IF;
 RETURN (d+time_text::time) AT TIME ZONE 'America/New_York';
END; $$;
CREATE FUNCTION ledger_private.chore_fields(p jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE due_at timestamptz; expires_at timestamptz;
BEGIN
 IF jsonb_typeof(p->'title') IS DISTINCT FROM 'string' OR length(trim(p->>'title')) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Use a title of 1–120 characters'; END IF;
 IF jsonb_typeof(coalesce(p->'note','""'::jsonb)) IS DISTINCT FROM 'string' OR length(coalesce(p->>'note',''))>1000 THEN RAISE EXCEPTION 'Keep notes under 1,000 characters'; END IF;
 IF NOT ledger_private.valid_misc_icon_id(p->>'icon_id') THEN RAISE EXCEPTION 'Choose an icon'; END IF;
 IF coalesce(p->>'assignee','') NOT IN ('','michal','rina','ohm','rohil') THEN RAISE EXCEPTION 'Choose a roommate or Anyone'; END IF;
 IF jsonb_typeof(p->'pinned') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Choose whether to pin the chore'; END IF;
 due_at:=ledger_private.chore_deadline(p->>'due_on',p->>'due_time');
 expires_at:=ledger_private.chore_deadline(p->>'expires_on',p->>'expires_time');
 IF due_at IS NOT NULL AND expires_at IS NOT NULL AND expires_at<due_at THEN RAISE EXCEPTION 'Expiry must be at or after the deadline'; END IF;
 RETURN jsonb_build_object('title',trim(p->>'title'),'note',coalesce(p->>'note',''),'icon_id',p->>'icon_id','assignee',nullif(p->>'assignee',''),
 'points',ledger_private.chore_points(p->'points'),'pinned',p->'pinned','due_on',nullif(p->>'due_on',''),'due_time',nullif(p->>'due_time',''),'due_at',due_at,
 'expires_on',nullif(p->>'expires_on',''),'expires_time',nullif(p->>'expires_time',''),'expires_at',expires_at);
END; $$;

-- Generate cycle snapshots deterministically; no scheduled job is required.
CREATE FUNCTION ledger_private.chore_occurrences(until_day date)
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
     id:=first_version.id||':'||cycle_day::text||':'||(step->>'id');
     data:=jsonb_build_object('title',step->>'title','note',step->>'note','icon_id',step->>'icon_id','points',(step->>'points')::integer,
      'assignee',owner_name,'requester',first_version.actor,'pinned',false,'state','active','completion',NULL,
      'due_on',(cycle_day+(step->>'weekday')::integer)::text,'due_time',nullif(step->>'time',''),
      'due_at',ledger_private.chore_deadline((cycle_day+(step->>'weekday')::integer)::text,step->>'time'),
      'expires_on',NULL,'expires_time',NULL,'expires_at',NULL,
      'routine_id',first_version.id,'routine_title',revision.data->>'title','cycle_start',cycle_day,
      'cycle_end',(cycle_day+interval_days)::timestamp AT TIME ZONE 'America/New_York','schedule_version',revision.version,'step_id',step->>'id');
     created_at:=first_version.created_at;
     RETURN NEXT;
    END LOOP;
   END IF;
   cycle_day:=cycle_day+interval_days;
  END LOOP;
 END LOOP;
END; $$;
CREATE FUNCTION ledger_private.materialize_chores() RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 LOCK TABLE ledger_private.chore_routine_events,ledger_private.chore_tasks,ledger_private.chore_task_events IN EXCLUSIVE MODE;
 INSERT INTO ledger_private.chore_tasks(id,data,created_at)
 SELECT o.id,o.data,o.created_at FROM ledger_private.chore_occurrences((now() AT TIME ZONE 'America/New_York')::date) o ON CONFLICT(id) DO NOTHING;
END; $$;
CREATE VIEW ledger_private.current_chores AS
 SELECT t.id,coalesce(e.version,0) AS version,coalesce(e.data,t.data) AS data,t.created_at,
 coalesce(e.actor,t.data->>'requester') AS actor,e.created_at AS revised_at
 FROM ledger_private.chore_tasks t LEFT JOIN LATERAL (SELECT v.* FROM ledger_private.chore_task_events v WHERE v.id=t.id ORDER BY version DESC LIMIT 1) e ON true;
REVOKE ALL ON ledger_private.current_chores FROM PUBLIC,anon,authenticated;
CREATE FUNCTION ledger_private.chore_status(p jsonb,at_time timestamptz) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN p->>'state' IN ('completed','cancelled') THEN p->>'state'
 WHEN (p->>'cycle_end')::timestamptz<=at_time THEN 'missed'
 WHEN (p->>'expires_at')::timestamptz<=at_time THEN 'expired'
 WHEN (p->>'due_at')::timestamptz<=at_time THEN 'overdue' ELSE 'active' END;
$$;
CREATE FUNCTION ledger_private.chore_completion(p jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE at_time timestamptz; contributors jsonb;
BEGIN
 contributors:=ledger_private.chore_members(p->'contributors');
 IF coalesce(p->>'completed_at','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$' THEN RAISE EXCEPTION 'Choose when this was done (New York time)'; END IF;
 at_time:=(p->>'completed_at')::timestamp AT TIME ZONE 'America/New_York';
 IF at_time>now() OR at_time<'2020-01-01'::timestamptz THEN RAISE EXCEPTION 'Completion must be in the past, from 2020 onward'; END IF;
 RETURN jsonb_build_object('contributors',contributors,'completed_at',at_time);
END; $$;

CREATE FUNCTION public.utilities_save_chore(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
 IF act NOT IN ('create','edit','claim','hand_back','complete','undo','cancel','reopen') OR act IS NULL THEN RAISE EXCEPTION 'Choose a chore action'; END IF;
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
  payload:=ledger_private.chore_fields(p)||jsonb_build_object('requester',p->>'actor','routine_id',NULL,'cycle_start',NULL,'cycle_end',NULL,'state','active','completion',NULL);
  IF p->'completion' IS NOT NULL AND p->'completion'<>'null'::jsonb THEN
   payload:=payload||jsonb_build_object('state','completed','completion',ledger_private.chore_completion(p->'completion'));
  END IF;
  INSERT INTO ledger_private.chore_tasks(id,data) VALUES(p->>'id',payload);
  next_version:=1;
 ELSE
  IF old.id IS NULL THEN RAISE EXCEPTION 'This chore could not be found'; END IF;
  IF (p->>'expected_version')::integer IS DISTINCT FROM old.version THEN RAISE EXCEPTION 'This chore changed. Refresh and review before saving'; END IF;
  payload:=old.data;next_version:=old.version+1;
  IF act='edit' THEN payload:=payload||ledger_private.chore_fields(p);
  ELSIF act IN ('claim','hand_back') THEN
   IF payload->>'state'<>'active' THEN RAISE EXCEPTION 'Reopen this chore before assigning it'; END IF;
   payload:=payload||jsonb_build_object('assignee',CASE WHEN act='claim' THEN p->>'actor' ELSE NULL END);
  ELSIF act='complete' THEN
   IF payload->>'state'='cancelled' THEN RAISE EXCEPTION 'Reopen this chore before completing it'; END IF;
   payload:=payload||jsonb_build_object('state','completed','points',ledger_private.chore_points(p->'points'),'completion',ledger_private.chore_completion(p->'completion'));
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

CREATE FUNCTION public.utilities_save_chore_routine(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
 IF coalesce(p->>'start_week','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Choose a starting Monday'; END IF;
 start_day:=(p->>'start_week')::date;
 IF extract(isodow FROM start_day)<>1 OR start_day<'2020-01-01' OR start_day>(now() AT TIME ZONE 'America/New_York')::date+365 THEN RAISE EXCEPTION 'Choose a Monday from 2020 through the next year'; END IF;
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
  next_step:=jsonb_build_object('id',step->>'id','title',trim(step->>'title'),'note',coalesce(step->>'note',''),'icon_id',step->>'icon_id','points',(step->>'points')::integer,'weekday',(step->>'weekday')::integer,'time',nullif(step->>'time',''));
  steps:=steps||jsonb_build_array(next_step);
 END LOOP;
 effective_day:=start_day;
 IF next_version>1 AND start_day<=(now() AT TIME ZONE 'America/New_York')::date THEN
  effective_day:=start_day+(((now() AT TIME ZONE 'America/New_York')::date-start_day)/interval_days+1)*interval_days;
 END IF;
 payload:=jsonb_build_object('title',trim(p->>'title'),'start_week',start_day,'interval_weeks',(p->>'interval_weeks')::integer,'owners',owners,'start_index',(p->>'start_index')::integer,'steps',steps,'enabled',p->'enabled');
 INSERT INTO ledger_private.chore_routine_events VALUES(p->>'id',next_version,effective_day,payload,p->>'actor',now(),p->>'request_id',fp);
 RETURN payload||jsonb_build_object('id',p->>'id','version',next_version,'effective_on',effective_day);
END; $$;

CREATE FUNCTION public.utilities_chores_dashboard() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; local_day date:=(now() AT TIME ZONE 'America/New_York')::date;
BEGIN
 PERFORM ledger_private.materialize_chores();
 WITH actual AS (SELECT c.id,c.version,c.data,c.created_at,c.actor,false AS projected FROM ledger_private.current_chores c),
 projected AS (SELECT o.id,0 AS version,o.data,o.created_at,o.data->>'requester' AS actor,true AS projected FROM ledger_private.chore_occurrences(local_day+84) o WHERE NOT EXISTS(SELECT 1 FROM actual a WHERE a.id=o.id)),
 tasks AS (SELECT * FROM actual UNION ALL SELECT * FROM projected),
 credits AS (
  SELECT c.id,c.data->>'title' AS title,m.value AS member,(c.data->>'points')::integer*12/jsonb_array_length(c.data->'completion'->'contributors') AS units,
   c.data->'completion'->>'completed_at' AS completed_at
  FROM actual c CROSS JOIN LATERAL jsonb_array_elements_text(c.data->'completion'->'contributors') m WHERE c.data->>'state'='completed'
 ), periods AS (SELECT 'week' AS period,date_trunc('week',local_day::timestamp) AT TIME ZONE 'America/New_York' AS starts UNION ALL SELECT 'month',date_trunc('month',local_day::timestamp) AT TIME ZONE 'America/New_York' UNION ALL SELECT 'all',NULL::timestamptz),
 scores AS (SELECT p.period,m.member,coalesce(sum(c.units),0)::integer AS units,coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.completed_at DESC,c.id) FILTER(WHERE c.id IS NOT NULL),'[]'::jsonb) AS entries
  FROM periods p CROSS JOIN unnest(ARRAY['michal','rina','ohm','rohil']) m(member) LEFT JOIN credits c ON c.member=m.member AND (p.starts IS NULL OR c.completed_at::timestamptz>=p.starts) GROUP BY p.period,m.member),
 ranked AS (SELECT *,rank() OVER(PARTITION BY period ORDER BY units DESC) AS rank FROM scores)
 SELECT jsonb_build_object('tasks',coalesce((SELECT jsonb_agg(data||jsonb_build_object('id',id,'version',version,'created_at',created_at,'actor',actor,'projected',projected,'status',ledger_private.chore_status(data,now())) ORDER BY created_at,id) FROM tasks),'[]'::jsonb),
 'routines',coalesce((SELECT jsonb_agg(data||jsonb_build_object('id',id,'version',version,'actor',actor,'effective_on',effective_on,'created_at',created_at) ORDER BY created_at,id) FROM (SELECT DISTINCT ON(id) * FROM ledger_private.chore_routine_events ORDER BY id,version DESC) r),'[]'::jsonb),
 'history',coalesce((SELECT jsonb_agg(data||jsonb_build_object('id',id,'version',version,'actor',actor,'action',action,'change_note',change_note,'created_at',created_at) ORDER BY created_at DESC,id,version DESC) FROM ledger_private.chore_task_events),'[]'::jsonb),
 'routine_history',coalesce((SELECT jsonb_agg(data||jsonb_build_object('id',id,'version',version,'actor',actor,'effective_on',effective_on,'created_at',created_at) ORDER BY created_at DESC,id,version DESC) FROM ledger_private.chore_routine_events),'[]'::jsonb),
 'leaderboard',coalesce((SELECT jsonb_agg(to_jsonb(ranked) ORDER BY period,rank,member) FROM ranked),'[]'::jsonb),
 'updated_at',now(),'local_day',local_day,'projection_until',local_day+84,'format_version',1) INTO result;
 RETURN result;
END; $$;
CREATE FUNCTION public.utilities_export_chores() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT public.utilities_chores_dashboard()||jsonb_build_object('exported_at',now()); $$;
REVOKE ALL ON FUNCTION ledger_private.chore_members(jsonb),ledger_private.chore_points(jsonb),ledger_private.chore_deadline(text,text),ledger_private.chore_fields(jsonb),ledger_private.chore_occurrences(date),ledger_private.materialize_chores(),ledger_private.chore_status(jsonb,timestamptz),ledger_private.chore_completion(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.utilities_save_chore(jsonb),public.utilities_save_chore_routine(jsonb),public.utilities_chores_dashboard(),public.utilities_export_chores() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.utilities_save_chore(jsonb),public.utilities_save_chore_routine(jsonb),public.utilities_chores_dashboard(),public.utilities_export_chores() TO anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
