BEGIN;
-- Optional illustration metadata is kept in every immutable event revision.
-- Cached clients that omit icon_id retain an event's existing illustration.
CREATE FUNCTION ledger_private.valid_event_icon_id(id text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT id IN ('calendar','movie','board-game','walking','skis','restaurant','cooking');
$$;
REVOKE ALL ON FUNCTION ledger_private.valid_event_icon_id(text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.utilities_save_event(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
  IF p ? 'icon_id' AND p->>'icon_id' IS NOT NULL AND NOT ledger_private.valid_event_icon_id(p->>'icon_id') THEN RAISE EXCEPTION 'Choose an event illustration'; END IF;
  start_time:=ledger_private.event_local_time(p->>'starts_local');end_time:=ledger_private.event_local_time(p->>'ends_local');
  IF end_time<=start_time THEN RAISE EXCEPTION 'End time must be after start time'; END IF;
  changed:=a='edit' AND (start_time IS DISTINCT FROM (old.data->>'starts_at')::timestamptz OR end_time IS DISTINCT FROM (old.data->>'ends_at')::timestamptz);
  payload:=jsonb_build_object('title',trim(p->>'title'),'description',trim(coalesce(p->>'description','')),'location',trim(coalesce(p->>'location','')),
   'icon_id',CASE WHEN p ? 'icon_id' THEN p->>'icon_id' WHEN a='edit' THEN old.data->>'icon_id' ELSE NULL END,
   'starts_at',start_time,'ends_at',end_time,'host',CASE WHEN a='create' THEN p->>'actor' ELSE old.data->>'host' END,
   'interval_version',CASE WHEN a='create' THEN 1 WHEN changed THEN (old.data->>'interval_version')::integer+1 ELSE (old.data->>'interval_version')::integer END,
   'state',CASE WHEN a='create' OR changed THEN 'proposed' ELSE old.data->>'state' END);
 ELSE payload:=old.data||jsonb_build_object('state',CASE WHEN a='confirm' THEN 'confirmed' ELSE 'cancelled' END);
 END IF;
 INSERT INTO ledger_private.household_events VALUES(p->>'id',v,payload,p->>'actor',a,now(),p->>'request_id',md5(p::text));
 RETURN payload||jsonb_build_object('id',p->>'id','version',v);
END; $$;
CREATE OR REPLACE FUNCTION public.utilities_events_dashboard() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object(
 'events',coalesce((SELECT jsonb_agg(jsonb_build_object('icon_id',NULL)||data||jsonb_build_object('id',id,'version',version) ORDER BY data->>'starts_at',id) FROM ledger_private.current_events),'[]'::jsonb),
 'responses',coalesce((SELECT jsonb_agg(to_jsonb(r)-'fingerprint'-'request_id') FROM ledger_private.current_event_responses r),'[]'::jsonb),
 'history',coalesce((SELECT jsonb_agg(jsonb_build_object('icon_id',NULL)||data||jsonb_build_object('id',id,'version',version,'actor',actor,'action',action,'created_at',created_at) ORDER BY created_at DESC) FROM ledger_private.household_events),'[]'::jsonb),
 'response_history',coalesce((SELECT jsonb_agg(to_jsonb(r)-'fingerprint'-'request_id' ORDER BY created_at DESC) FROM ledger_private.event_responses r),'[]'::jsonb),
 'updated_at',now(),'format_version',2);
$$;
NOTIFY pgrst,'reload schema';
COMMIT;
