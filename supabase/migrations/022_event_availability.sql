BEGIN;
-- Polls let the host offer a window of days. Each roommate paints the days that
-- work; the host then locks in one day and time, which becomes an ordinary
-- confirmed event. Availability is append-only like every other revision.
CREATE TABLE ledger_private.event_availability (
 id text NOT NULL,member text NOT NULL,version integer NOT NULL,poll_version integer NOT NULL,
 days jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),request_id text UNIQUE NOT NULL,fingerprint text NOT NULL,
 PRIMARY KEY(id,member,version)
);
ALTER TABLE ledger_private.event_availability ENABLE ROW LEVEL SECURITY;
CREATE VIEW ledger_private.current_event_availability AS SELECT DISTINCT ON(id,member) * FROM ledger_private.event_availability ORDER BY id,member,version DESC;
REVOKE ALL ON ledger_private.event_availability,ledger_private.current_event_availability FROM PUBLIC,anon,authenticated;

CREATE FUNCTION ledger_private.event_poll_day(t text) RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
 IF t IS NULL OR t !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Choose the days to poll'; END IF;
 RETURN t::date;
EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RAISE EXCEPTION 'Choose the days to poll';
END; $$;
REVOKE ALL ON FUNCTION ledger_private.event_poll_day(text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.utilities_save_event(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old record; prior record; payload jsonb; details jsonb; v integer; a text:=p->>'action'; start_time timestamptz; end_time timestamptz; changed boolean;
 first_day date; last_day date; polling boolean;
BEGIN
 IF coalesce(p->>'actor','') NOT IN ('michal','rina','ohm','rohil') THEN RAISE EXCEPTION 'Choose who you are'; END IF;
 IF coalesce(p->>'id','') !~ '^[a-zA-Z0-9_-]{16,100}$' OR coalesce(p->>'request_id','') !~ '^[a-zA-Z0-9_-]{16,100}$' THEN RAISE EXCEPTION 'Invalid event or request identifier'; END IF;
 IF a IS NULL OR a NOT IN ('create','create_poll','edit','lock_in','confirm','cancel') THEN RAISE EXCEPTION 'Choose an event action'; END IF;
 LOCK TABLE ledger_private.household_events IN EXCLUSIVE MODE;
 SELECT * INTO prior FROM ledger_private.household_events WHERE request_id=p->>'request_id';
 IF FOUND THEN
  IF prior.fingerprint<>md5(p::text) THEN RAISE EXCEPTION 'This request was already used with different details'; END IF;
  RETURN prior.data||jsonb_build_object('id',prior.id,'version',prior.version);
 END IF;
 SELECT * INTO old FROM ledger_private.current_events WHERE id=p->>'id';
 IF a IN ('create','create_poll') THEN
  IF old.id IS NOT NULL THEN RAISE EXCEPTION 'This event already exists'; END IF;v:=1;
 ELSE
  IF old.id IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;
  IF old.data->>'host'<>p->>'actor' THEN RAISE EXCEPTION 'Only the host can change this event'; END IF;
  IF (p->>'expected_version')::integer IS DISTINCT FROM old.version THEN RAISE EXCEPTION 'This event changed. Refresh and review before saving'; END IF;
  IF old.data->>'state'='cancelled' THEN RAISE EXCEPTION 'This event is cancelled'; END IF;
  v:=old.version+1;
 END IF;
 polling:=a='create_poll' OR (a='edit' AND old.data->>'state'='polling');
 IF a IN ('create','create_poll','edit') THEN
  IF jsonb_typeof(p->'title') IS DISTINCT FROM 'string' OR length(trim(p->>'title')) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Write an event title of 1–100 characters'; END IF;
  IF length(coalesce(p->>'description',''))>600 OR length(coalesce(p->>'location',''))>120 THEN RAISE EXCEPTION 'Keep the description under 600 and location under 120 characters'; END IF;
  IF p ? 'icon_id' AND p->>'icon_id' IS NOT NULL AND NOT ledger_private.valid_event_icon_id(p->>'icon_id') THEN RAISE EXCEPTION 'Choose an event illustration'; END IF;
  details:=jsonb_build_object('title',trim(p->>'title'),'description',trim(coalesce(p->>'description','')),'location',trim(coalesce(p->>'location','')),
   'icon_id',CASE WHEN p ? 'icon_id' THEN p->>'icon_id' WHEN a='edit' THEN old.data->>'icon_id' ELSE NULL END,
   'host',CASE WHEN a='edit' THEN old.data->>'host' ELSE p->>'actor' END);
 END IF;
 IF polling THEN
  first_day:=ledger_private.event_poll_day(p->>'window_start');last_day:=ledger_private.event_poll_day(p->>'window_end');
  IF last_day<first_day THEN RAISE EXCEPTION 'The last day must be on or after the first day'; END IF;
  IF last_day-first_day>41 THEN RAISE EXCEPTION 'Poll at most six weeks of days'; END IF;
  IF length(coalesce(p->>'time_hint',''))>40 THEN RAISE EXCEPTION 'Keep the time of day under 40 characters'; END IF;
  -- Changing the window clears availability, the same way a new time clears responses.
  changed:=a='edit' AND (first_day IS DISTINCT FROM (old.data->>'window_start')::date OR last_day IS DISTINCT FROM (old.data->>'window_end')::date);
  payload:=details||jsonb_build_object('starts_at',NULL,'ends_at',NULL,'window_start',first_day,'window_end',last_day,'time_hint',trim(coalesce(p->>'time_hint','')),
   'interval_version',1,'poll_version',CASE WHEN a='create_poll' THEN 1 WHEN changed THEN (old.data->>'poll_version')::integer+1 ELSE (old.data->>'poll_version')::integer END,
   'state','polling');
 ELSIF a IN ('create','edit') THEN
  start_time:=ledger_private.event_local_time(p->>'starts_local');end_time:=ledger_private.event_local_time(p->>'ends_local');
  IF end_time<=start_time THEN RAISE EXCEPTION 'End time must be after start time'; END IF;
  changed:=a='edit' AND (start_time IS DISTINCT FROM (old.data->>'starts_at')::timestamptz OR end_time IS DISTINCT FROM (old.data->>'ends_at')::timestamptz);
  payload:=details||CASE WHEN a='edit' THEN old.data-'title'-'description'-'location'-'icon_id'-'host' ELSE '{}'::jsonb END||jsonb_build_object(
   'starts_at',start_time,'ends_at',end_time,
   'interval_version',CASE WHEN a='create' THEN 1 WHEN changed THEN (old.data->>'interval_version')::integer+1 ELSE (old.data->>'interval_version')::integer END,
   'state',CASE WHEN a='create' OR changed THEN 'proposed' ELSE old.data->>'state' END);
 ELSIF a='lock_in' THEN
  IF old.data->>'state'<>'polling' THEN RAISE EXCEPTION 'This event already has a time'; END IF;
  start_time:=ledger_private.event_local_time(p->>'starts_local');end_time:=ledger_private.event_local_time(p->>'ends_local');
  IF end_time<=start_time THEN RAISE EXCEPTION 'End time must be after start time'; END IF;
  IF (start_time AT TIME ZONE 'America/New_York')::date NOT BETWEEN (old.data->>'window_start')::date AND (old.data->>'window_end')::date THEN RAISE EXCEPTION 'Choose a day from the poll'; END IF;
  -- The poll window and availability stay in the record after the time is set.
  payload:=old.data||jsonb_build_object('starts_at',start_time,'ends_at',end_time,'state','confirmed');
 ELSIF a='confirm' THEN
  IF old.data->>'state'='polling' THEN RAISE EXCEPTION 'Lock in a day from the poll first'; END IF;
  payload:=old.data||jsonb_build_object('state','confirmed');
 ELSE payload:=old.data||jsonb_build_object('state','cancelled');
 END IF;
 INSERT INTO ledger_private.household_events VALUES(p->>'id',v,payload,p->>'actor',a,now(),p->>'request_id',md5(p::text));
 RETURN payload||jsonb_build_object('id',p->>'id','version',v);
END; $$;

CREATE FUNCTION public.utilities_save_event_availability(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE event_row record; prior record; old record; result jsonb; v integer; day text; mark text;
BEGIN
 IF coalesce(p->>'actor','') NOT IN ('michal','rina','ohm','rohil') THEN RAISE EXCEPTION 'Choose who you are'; END IF;
 IF coalesce(p->>'request_id','') !~ '^[a-zA-Z0-9_-]{16,100}$' THEN RAISE EXCEPTION 'Invalid request identifier'; END IF;
 IF jsonb_typeof(p->'days') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Mark the days that work for you'; END IF;
 LOCK TABLE ledger_private.household_events IN SHARE MODE;
 LOCK TABLE ledger_private.event_availability IN EXCLUSIVE MODE;
 SELECT * INTO prior FROM ledger_private.event_availability WHERE request_id=p->>'request_id';
 IF FOUND THEN
  IF prior.fingerprint<>md5(p::text) THEN RAISE EXCEPTION 'This request was already used with different details'; END IF;
  RETURN to_jsonb(prior)-'fingerprint'-'request_id';
 END IF;
 SELECT * INTO event_row FROM ledger_private.current_events WHERE id=p->>'id';
 IF event_row.id IS NULL OR event_row.data->>'state'<>'polling' THEN RAISE EXCEPTION 'This poll is closed'; END IF;
 IF (p->>'poll_version')::integer IS DISTINCT FROM (event_row.data->>'poll_version')::integer THEN RAISE EXCEPTION 'The poll days changed. Refresh before marking'; END IF;
 FOR day,mark IN SELECT key,value FROM jsonb_each_text(p->'days') LOOP
  IF mark NOT IN ('yes','maybe') THEN RAISE EXCEPTION 'Mark days as Works or If needed'; END IF;
  IF ledger_private.event_poll_day(day) NOT BETWEEN (event_row.data->>'window_start')::date AND (event_row.data->>'window_end')::date THEN RAISE EXCEPTION 'Choose days inside the poll'; END IF;
 END LOOP;
 SELECT * INTO old FROM ledger_private.current_event_availability WHERE id=p->>'id' AND member=p->>'actor';
 IF coalesce((p->>'expected_version')::integer,0)<>coalesce(old.version,0) THEN RAISE EXCEPTION 'Your days changed. Refresh before marking'; END IF;
 v:=coalesce(old.version,0)+1;
 INSERT INTO ledger_private.event_availability VALUES(p->>'id',p->>'actor',v,(p->>'poll_version')::integer,p->'days',now(),p->>'request_id',md5(p::text)) RETURNING to_jsonb(event_availability)-'fingerprint'-'request_id' INTO result;
 RETURN result;
END; $$;

-- Responses are attendance answers for a set time; polls collect days instead.
CREATE OR REPLACE FUNCTION public.utilities_save_event_response(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE event_row record; prior record; old record; result jsonb; r text:=p->>'response'; v integer;
BEGIN
 IF coalesce(p->>'actor','') NOT IN ('michal','rina','ohm','rohil') THEN RAISE EXCEPTION 'Choose who you are'; END IF;
 IF coalesce(p->>'request_id','') !~ '^[a-zA-Z0-9_-]{16,100}$' THEN RAISE EXCEPTION 'Invalid request identifier'; END IF;
 IF r IS NOT NULL AND r NOT IN ('yes','maybe','no') THEN RAISE EXCEPTION 'Choose Yes, Maybe, or No'; END IF;
 LOCK TABLE ledger_private.household_events IN SHARE MODE;
 LOCK TABLE ledger_private.event_responses IN EXCLUSIVE MODE;
 SELECT * INTO prior FROM ledger_private.event_responses WHERE request_id=p->>'request_id';
 IF FOUND THEN
  IF prior.fingerprint<>md5(p::text) THEN RAISE EXCEPTION 'This request was already used with different details'; END IF;
  RETURN to_jsonb(prior)-'fingerprint'-'request_id';
 END IF;
 SELECT * INTO event_row FROM ledger_private.current_events WHERE id=p->>'id';
 IF event_row.id IS NULL OR event_row.data->>'state'='cancelled' THEN RAISE EXCEPTION 'Event is unavailable'; END IF;
 IF event_row.data->>'state'='polling' THEN RAISE EXCEPTION 'Mark the days that work for you instead'; END IF;
 IF (event_row.data->>'ends_at')::timestamptz<=now() THEN RAISE EXCEPTION 'This event has ended'; END IF;
 IF (p->>'interval_version')::integer IS DISTINCT FROM (event_row.data->>'interval_version')::integer THEN RAISE EXCEPTION 'The event time changed. Refresh before responding'; END IF;
 SELECT * INTO old FROM ledger_private.current_event_responses WHERE id=p->>'id' AND member=p->>'actor';
 IF coalesce((p->>'expected_version')::integer,0)<>coalesce(old.version,0) THEN RAISE EXCEPTION 'Your response changed. Refresh before responding'; END IF;
 v:=coalesce(old.version,0)+1;
 INSERT INTO ledger_private.event_responses VALUES(p->>'id',p->>'actor',v,(p->>'interval_version')::integer,r,now(),p->>'request_id',md5(p::text)) RETURNING to_jsonb(event_responses)-'fingerprint'-'request_id' INTO result;
 RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.utilities_events_dashboard() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object(
 'events',coalesce((SELECT jsonb_agg(jsonb_build_object('icon_id',NULL,'window_start',NULL,'window_end',NULL,'time_hint','','poll_version',NULL)||data||jsonb_build_object('id',id,'version',version) ORDER BY coalesce(data->>'starts_at',data->>'window_start'),id) FROM ledger_private.current_events),'[]'::jsonb),
 'responses',coalesce((SELECT jsonb_agg(to_jsonb(r)-'fingerprint'-'request_id') FROM ledger_private.current_event_responses r),'[]'::jsonb),
 'availability',coalesce((SELECT jsonb_agg(to_jsonb(a)-'fingerprint'-'request_id') FROM ledger_private.current_event_availability a),'[]'::jsonb),
 'history',coalesce((SELECT jsonb_agg(jsonb_build_object('icon_id',NULL)||data||jsonb_build_object('id',id,'version',version,'actor',actor,'action',action,'created_at',created_at) ORDER BY created_at DESC) FROM ledger_private.household_events),'[]'::jsonb),
 'response_history',coalesce((SELECT jsonb_agg(to_jsonb(r)-'fingerprint'-'request_id' ORDER BY created_at DESC) FROM ledger_private.event_responses r),'[]'::jsonb),
 'availability_history',coalesce((SELECT jsonb_agg(to_jsonb(a)-'fingerprint'-'request_id' ORDER BY created_at DESC) FROM ledger_private.event_availability a),'[]'::jsonb),
 'updated_at',now(),'format_version',3);
$$;
REVOKE ALL ON FUNCTION public.utilities_save_event_availability(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.utilities_save_event_availability(jsonb) TO anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
