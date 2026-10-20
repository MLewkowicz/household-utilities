-- Allow a recurring item to start on its selected date, on any weekday.
-- Keep the existing storage contract and occurrence IDs for older clients and
-- grouped routines. No saved tasks, routine revisions, or scores are rewritten.
BEGIN;
CREATE OR REPLACE FUNCTION ledger_private.chore_routine_start(value text)
RETURNS date LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE start_day date;
BEGIN
 IF coalesce(value,'') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Choose a starting date'; END IF;
 start_day:=value::date;
 IF start_day<'2020-01-01' OR start_day>(now() AT TIME ZONE 'America/New_York')::date+365 THEN RAISE EXCEPTION 'Choose a date from 2020 through the next year'; END IF;
 RETURN start_day;
END; $$;
REVOKE ALL ON FUNCTION ledger_private.chore_routine_start(text) FROM PUBLIC,anon,authenticated;

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
  next_step:=jsonb_build_object('kind',coalesce(step->>'kind',CASE WHEN step->>'points'='0' THEN 'reminder' ELSE 'chore' END),'id',step->>'id','title',trim(step->>'title'),'note',coalesce(step->>'note',''),'icon_id',step->>'icon_id','points',(step->>'points')::integer,'weekday',(step->>'weekday')::integer,'time',nullif(step->>'time',''));
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
NOTIFY pgrst,'reload schema';
COMMIT;
