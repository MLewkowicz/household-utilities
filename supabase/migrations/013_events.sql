BEGIN;
CREATE TABLE ledger_private.household_events (
 id text NOT NULL,version integer NOT NULL,data jsonb NOT NULL,
 actor text NOT NULL,action text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 request_id text UNIQUE NOT NULL,fingerprint text NOT NULL,PRIMARY KEY(id,version)
);
CREATE TABLE ledger_private.event_responses (
 id text NOT NULL,member text NOT NULL,version integer NOT NULL,interval_version integer NOT NULL,
 response text,created_at timestamptz NOT NULL DEFAULT now(),request_id text UNIQUE NOT NULL,fingerprint text NOT NULL,
 PRIMARY KEY(id,member,version)
);
ALTER TABLE ledger_private.household_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_private.event_responses ENABLE ROW LEVEL SECURITY;
CREATE VIEW ledger_private.current_events AS SELECT DISTINCT ON(id) * FROM ledger_private.household_events ORDER BY id,version DESC;
CREATE VIEW ledger_private.current_event_responses AS SELECT DISTINCT ON(id,member) * FROM ledger_private.event_responses ORDER BY id,member,version DESC;
REVOKE ALL ON ledger_private.household_events,ledger_private.event_responses,ledger_private.current_events,ledger_private.current_event_responses FROM PUBLIC,anon,authenticated;
CREATE FUNCTION ledger_private.event_local_time(t text) RETURNS timestamptz LANGUAGE plpgsql SET search_path='' AS $$
DECLARE local_value timestamp; instant timestamptz;
BEGIN
 IF t IS NULL OR t !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$' THEN RAISE EXCEPTION 'Choose a date and time'; END IF;
 local_value:=t::timestamp;instant:=local_value AT TIME ZONE 'America/New_York';
 IF to_char(instant AT TIME ZONE 'America/New_York','YYYY-MM-DD"T"HH24:MI')<>t THEN RAISE EXCEPTION 'That time does not exist in New York because the clocks change'; END IF;
 RETURN instant;
END; $$;
CREATE FUNCTION public.utilities_save_event(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old record; prior record; payload jsonb; v integer; a text:=p->>'action'; start_time timestamptz; end_time timestamptz; changed boolean;
BEGIN
 IF coalesce(p->>'actor','') NOT IN ('michal','rina','ohm','rohil') THEN RAISE EXCEPTION 'Choose who you are'; END IF;
 IF coalesce(p->>'id','') !~ '^[a-zA-Z0-9_-]{16,100}$' OR coalesce(p->>'request_id','') !~ '^[a-zA-Z0-9_-]{16,100}$' THEN RAISE EXCEPTION 'Invalid event or request identifier'; END IF;
 IF a IS NULL OR a NOT IN ('create','edit','confirm','cancel') THEN RAISE EXCEPTION 'Choose an event action'; END IF;
 LOCK TABLE ledger_private.household_events IN EXCLUSIVE MODE;
 SELECT * INTO prior FROM ledger_private.household_events WHERE request_id=p->>'request_id';
 IF FOUND THEN
  IF prior.fingerprint<>md5(p::text) THEN RAISE EXCEPTION 'This request was already used with different details'; END IF;
  RETURN prior.data||jsonb_build_object('id',prior.id,'version',prior.version);
 END IF;
 SELECT * INTO old FROM ledger_private.current_events WHERE id=p->>'id';
 IF a='create' THEN
  IF old.id IS NOT NULL THEN RAISE EXCEPTION 'This event already exists'; END IF;v:=1;
 ELSE
  IF old.id IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;
  IF old.data->>'host'<>p->>'actor' THEN RAISE EXCEPTION 'Only the host can change this event'; END IF;
  IF (p->>'expected_version')::integer IS DISTINCT FROM old.version THEN RAISE EXCEPTION 'This event changed. Refresh and review before saving'; END IF;
  IF old.data->>'state'='cancelled' THEN RAISE EXCEPTION 'This event is cancelled'; END IF;
  v:=old.version+1;
 END IF;
 IF a IN ('create','edit') THEN
  IF jsonb_typeof(p->'title') IS DISTINCT FROM 'string' OR length(trim(p->>'title')) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Write an event title of 1–100 characters'; END IF;
  IF length(coalesce(p->>'description',''))>600 OR length(coalesce(p->>'location',''))>120 THEN RAISE EXCEPTION 'Keep the description under 600 and location under 120 characters'; END IF;
  start_time:=ledger_private.event_local_time(p->>'starts_local');end_time:=ledger_private.event_local_time(p->>'ends_local');
  IF end_time<=start_time THEN RAISE EXCEPTION 'End time must be after start time'; END IF;
  changed:=a='edit' AND (start_time IS DISTINCT FROM (old.data->>'starts_at')::timestamptz OR end_time IS DISTINCT FROM (old.data->>'ends_at')::timestamptz);
  payload:=jsonb_build_object('title',trim(p->>'title'),'description',trim(coalesce(p->>'description','')),'location',trim(coalesce(p->>'location','')),
   'starts_at',start_time,'ends_at',end_time,'host',CASE WHEN a='create' THEN p->>'actor' ELSE old.data->>'host' END,
   'interval_version',CASE WHEN a='create' THEN 1 WHEN changed THEN (old.data->>'interval_version')::integer+1 ELSE (old.data->>'interval_version')::integer END,
   'state',CASE WHEN a='create' OR changed THEN 'proposed' ELSE old.data->>'state' END);
 ELSE payload:=old.data||jsonb_build_object('state',CASE WHEN a='confirm' THEN 'confirmed' ELSE 'cancelled' END);
 END IF;
 INSERT INTO ledger_private.household_events VALUES(p->>'id',v,payload,p->>'actor',a,now(),p->>'request_id',md5(p::text));
 RETURN payload||jsonb_build_object('id',p->>'id','version',v);
END; $$;
CREATE FUNCTION public.utilities_save_event_response(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
 IF (event_row.data->>'ends_at')::timestamptz<=now() THEN RAISE EXCEPTION 'This event has ended'; END IF;
 IF (p->>'interval_version')::integer IS DISTINCT FROM (event_row.data->>'interval_version')::integer THEN RAISE EXCEPTION 'The event time changed. Refresh before responding'; END IF;
 SELECT * INTO old FROM ledger_private.current_event_responses WHERE id=p->>'id' AND member=p->>'actor';
 IF coalesce((p->>'expected_version')::integer,0)<>coalesce(old.version,0) THEN RAISE EXCEPTION 'Your response changed. Refresh before responding'; END IF;
 v:=coalesce(old.version,0)+1;
 INSERT INTO ledger_private.event_responses VALUES(p->>'id',p->>'actor',v,(p->>'interval_version')::integer,r,now(),p->>'request_id',md5(p::text)) RETURNING to_jsonb(event_responses)-'fingerprint'-'request_id' INTO result;
 RETURN result;
END; $$;
CREATE FUNCTION public.utilities_events_dashboard() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object(
 'events',coalesce((SELECT jsonb_agg(data||jsonb_build_object('id',id,'version',version) ORDER BY data->>'starts_at',id) FROM ledger_private.current_events),'[]'::jsonb),
 'responses',coalesce((SELECT jsonb_agg(to_jsonb(r)-'fingerprint'-'request_id') FROM ledger_private.current_event_responses r),'[]'::jsonb),
 'history',coalesce((SELECT jsonb_agg(data||jsonb_build_object('id',id,'version',version,'actor',actor,'action',action,'created_at',created_at) ORDER BY created_at DESC) FROM ledger_private.household_events),'[]'::jsonb),
 'response_history',coalesce((SELECT jsonb_agg(to_jsonb(r)-'fingerprint'-'request_id' ORDER BY created_at DESC) FROM ledger_private.event_responses r),'[]'::jsonb),
 'updated_at',now(),'format_version',1);
$$;
CREATE FUNCTION public.utilities_export_events() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT public.utilities_events_dashboard()||jsonb_build_object('exported_at',now()); $$;
REVOKE ALL ON FUNCTION ledger_private.event_local_time(text),public.utilities_save_event(jsonb),public.utilities_save_event_response(jsonb),public.utilities_events_dashboard(),public.utilities_export_events() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.utilities_save_event(jsonb),public.utilities_save_event_response(jsonb),public.utilities_events_dashboard(),public.utilities_export_events() TO anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
