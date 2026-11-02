BEGIN;
-- One undated turn; completion or skipping advances, never elapsed time.
CREATE OR REPLACE FUNCTION ledger_private.chore_occurrences(until_day date)
RETURNS TABLE(id text,data jsonb,created_at timestamptz) LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE first_version record; revision record; cycle_day date; step jsonb; owner_name text; idx integer; interval_days integer; cycle_number integer;
BEGIN
 FOR first_version IN SELECT DISTINCT ON(e.id) e.* FROM ledger_private.chore_routine_events e ORDER BY e.id,e.version LOOP
  IF first_version.data->>'schedule'='as_needed' THEN CONTINUE; END IF;
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
     IF step->>'preset_id' IS NOT NULL THEN data:=data||jsonb_build_object('preset_id',step->>'preset_id','point_policy',step->>'point_policy'); END IF;
     IF step->>'queue_visibility' IS NOT NULL THEN data:=data||jsonb_build_object('queue_visibility',step->>'queue_visibility'); END IF;
     created_at:=first_version.created_at;
     RETURN NEXT;
    END LOOP;
   END IF;
   cycle_day:=cycle_day+interval_days;
  END LOOP;
 END LOOP;
END; $$;
CREATE FUNCTION ledger_private.materialize_rotations() RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE routine record; step jsonb; number integer; turns integer; owner_name text; payload jsonb;
BEGIN
 -- Called under the same lock as scheduled materialization and chore writes.
 FOR routine IN SELECT * FROM (SELECT DISTINCT ON(id) * FROM ledger_private.chore_routine_events ORDER BY id,version DESC) r WHERE r.data->>'schedule'='as_needed' LOOP
  IF NOT (routine.data->>'enabled')::boolean THEN
   INSERT INTO ledger_private.chore_task_events(id,version,data,actor,action,change_note,request_id,fingerprint)
    SELECT c.id,c.version+1,c.data||jsonb_build_object('state','cancelled','rotation_withdrawn',true),routine.actor,'rotation_pause','Routine paused',md5(routine.id||':'||routine.version||':pause:'||c.id),md5(routine.data::text)
    FROM ledger_private.current_chores c WHERE c.data->>'routine_id'=routine.id AND c.data->>'state'='active';
   CONTINUE;
  END IF;
  IF EXISTS(SELECT 1 FROM ledger_private.current_chores c WHERE c.data->>'routine_id'=routine.id AND c.data->>'state'='active') THEN CONTINUE; END IF;
  SELECT coalesce(max((c.data->>'turn_number')::integer),0)+1,count(*) FILTER(WHERE NOT coalesce((c.data->>'rotation_withdrawn')::boolean,false)) INTO number,turns FROM ledger_private.current_chores c WHERE c.data->>'routine_id'=routine.id;
  owner_name:=routine.data->'owners'->>mod(turns+(routine.data->>'start_index')::integer,jsonb_array_length(routine.data->'owners'));
  step:=routine.data->'steps'->0;
  payload:=ledger_private.chore_fields(step||jsonb_build_object('assignee',owner_name,'pinned',false,'due_on',NULL,'due_time',NULL,'expires_on',NULL,'expires_time',NULL,'queue_visibility','immediately'))||jsonb_build_object(
   'requester',routine.actor,'routine_id',routine.id,'routine_title',routine.data->>'title','cycle_start',NULL,'cycle_end',NULL,'state','active','completion',NULL,'schedule','as_needed','turn_number',number,'step_id',step->>'id','schedule_version',routine.version);
  INSERT INTO ledger_private.chore_tasks(id,data) VALUES(routine.id||':turn:'||number,payload) ON CONFLICT(id) DO NOTHING;
 END LOOP;
END; $$;
CREATE OR REPLACE FUNCTION ledger_private.materialize_chores() RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 LOCK TABLE ledger_private.chore_routine_events,ledger_private.chore_tasks,ledger_private.chore_task_events IN EXCLUSIVE MODE;
 INSERT INTO ledger_private.chore_tasks(id,data,created_at)
 SELECT o.id,o.data,o.created_at FROM ledger_private.chore_occurrences((now() AT TIME ZONE 'America/New_York')::date) o ON CONFLICT(id) DO NOTHING;
 PERFORM ledger_private.materialize_rotations();
END; $$;
CREATE OR REPLACE FUNCTION public.utilities_save_chore_routine(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old record; prior record; first_version record; payload jsonb; steps jsonb:='[]'; step jsonb; owners jsonb; fp text:=md5(p::text);
 start_day date; effective_day date; interval_days integer; next_version integer; next_step jsonb; schedule text:=coalesce(p->>'schedule','scheduled');
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
 IF schedule NOT IN ('scheduled','as_needed') THEN RAISE EXCEPTION 'Choose a repeat schedule'; END IF;
 IF old.id IS NOT NULL AND schedule<>coalesce(old.data->>'schedule','scheduled') THEN RAISE EXCEPTION 'Create another routine to change its repeat schedule'; END IF;
 IF schedule='as_needed' AND jsonb_array_length(p->'steps')<>1 THEN RAISE EXCEPTION 'As-needed routines have one task'; END IF;
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
  IF schedule='as_needed' THEN step:=step||jsonb_build_object('weekday',0,'time',NULL,'queue_visibility','immediately');
  ELSE step:=step||jsonb_build_object('queue_visibility',coalesce(step->>'queue_visibility','due_date')); END IF;
  PERFORM ledger_private.chore_fields(step||jsonb_build_object('assignee',NULL,'pinned',false,'due_on',(start_day+(step->>'weekday')::integer)::text,'due_time',step->>'time'));
  next_step:=jsonb_build_object('queue_visibility',step->>'queue_visibility','kind',coalesce(step->>'kind',CASE WHEN step->>'points'='0' THEN 'reminder' ELSE 'chore' END),'id',step->>'id','title',trim(step->>'title'),'note',coalesce(step->>'note',''),'icon_id',step->>'icon_id','points',(step->>'points')::numeric,'weekday',(step->>'weekday')::integer,'time',nullif(step->>'time',''))||ledger_private.chore_preset(step);
  steps:=steps||jsonb_build_array(next_step);
 END LOOP;
 effective_day:=start_day;
 IF schedule='scheduled' AND next_version>1 AND start_day<=(now() AT TIME ZONE 'America/New_York')::date THEN
  effective_day:=start_day+(((now() AT TIME ZONE 'America/New_York')::date-start_day)/interval_days+1)*interval_days;
 END IF;
 IF schedule='as_needed' THEN effective_day:=(now() AT TIME ZONE 'America/New_York')::date; END IF;
 payload:=jsonb_build_object('schedule',schedule,'title',trim(p->>'title'),'start_week',start_day,'interval_weeks',(p->>'interval_weeks')::integer,'owners',owners,'start_index',(p->>'start_index')::integer,'steps',steps,'enabled',p->'enabled');
 -- A split routine retains its original occurrence keys for history and links.
 IF old.data ? 'occurrence_root' THEN payload:=payload||jsonb_build_object('occurrence_root',old.data->>'occurrence_root'); END IF;
 INSERT INTO ledger_private.chore_routine_events VALUES(p->>'id',next_version,effective_day,payload,p->>'actor',now(),p->>'request_id',fp);
 PERFORM ledger_private.materialize_rotations();
 RETURN payload||jsonb_build_object('id',p->>'id','version',next_version,'effective_on',effective_day);
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
  IF payload->>'schedule'='as_needed' THEN
   IF coalesce((payload->>'rotation_withdrawn')::boolean,false) THEN RAISE EXCEPTION 'This turn was withdrawn. Open the current turn instead'; END IF;
   IF act IN ('undo','reopen') THEN
    IF EXISTS(SELECT 1 FROM ledger_private.current_chores c WHERE c.data->>'routine_id'=payload->>'routine_id' AND (c.data->>'turn_number')::integer>(payload->>'turn_number')::integer AND NOT coalesce((c.data->>'rotation_withdrawn')::boolean,false) AND (c.data->>'state'<>'active' OR c.version>0)) THEN RAISE EXCEPTION 'A later turn has already changed. Correct the completion details instead'; END IF;
    IF NOT (SELECT (r.data->>'enabled')::boolean FROM ledger_private.chore_routine_events r WHERE r.id=payload->>'routine_id' ORDER BY r.version DESC LIMIT 1) THEN RAISE EXCEPTION 'Resume the routine before reopening a turn'; END IF;
    INSERT INTO ledger_private.chore_task_events(id,version,data,actor,action,change_note,request_id,fingerprint)
     SELECT c.id,c.version+1,c.data||jsonb_build_object('state','cancelled','rotation_withdrawn',true),p->>'actor','rotation_withdraw','Previous completion undone',md5((p->>'request_id')||':withdraw:'||c.id),md5(p::text)
     FROM ledger_private.current_chores c WHERE c.data->>'routine_id'=payload->>'routine_id' AND c.id<>old.id AND c.data->>'state'='active';
   END IF;
   IF act='edit' AND (nullif(p->>'due_on','') IS NOT NULL OR nullif(p->>'expires_on','') IS NOT NULL OR coalesce(p->>'queue_visibility','immediately')<>'immediately') THEN RAISE EXCEPTION 'As-needed turns have no due date or expiry'; END IF;
  END IF;
  IF act IN ('quick_complete','complete') AND payload->>'state'<>'completed'
   AND NOT ledger_private.chore_queue_ready(payload,(now() AT TIME ZONE 'America/New_York')::date) THEN
   RAISE EXCEPTION 'This task is upcoming. It can be completed when it enters the queue';
  END IF;
  IF act='edit' THEN
   IF payload->>'reminder_group_id' IS NOT NULL AND coalesce(p->>'kind',CASE WHEN p->>'points'='0' THEN 'reminder' ELSE 'chore' END)<>'reminder' THEN RAISE EXCEPTION 'A recipient reminder must remain a reminder'; END IF;
   payload:=payload||ledger_private.chore_fields(p||jsonb_build_object('queue_visibility',coalesce(p->>'queue_visibility',payload->>'queue_visibility',CASE WHEN payload->>'routine_id' IS NOT NULL THEN 'due_date' ELSE 'immediately' END)));
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
REVOKE ALL ON FUNCTION ledger_private.materialize_rotations() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.utilities_app_capabilities() RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT '{"event_edit_notifications":true,"quarter_points":true,"as_needed_routines":true}'::jsonb;
$$;
REVOKE ALL ON FUNCTION public.utilities_app_capabilities() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.utilities_app_capabilities() TO anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
