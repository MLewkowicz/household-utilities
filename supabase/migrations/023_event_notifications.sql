BEGIN;
-- Events join the opt-in categories. Posting, locking in, rescheduling and
-- cancelling alert everyone but the person who acted; people who said Yes or
-- Maybe get a reminder two hours ahead. Quiet hours and revalidation apply as
-- for every other alert. Availability taps never notify.
ALTER TABLE ledger_private.push_devices ALTER COLUMN categories SET DEFAULT '["bills","chores","notes","events"]';
-- Devices that already opted in to alerts receive events too; they can untick it.
UPDATE ledger_private.push_devices SET categories=categories||'["events"]'::jsonb WHERE NOT categories ? 'events';

CREATE FUNCTION ledger_private.event_when(ev jsonb) RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT to_char((ev->>'starts_at')::timestamptz AT TIME ZONE 'America/New_York','Dy, Mon FMDD, FMHH12:MI AM');
$$;
CREATE FUNCTION ledger_private.push_capture_event() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE old_data jsonb; recipient text; kind text;
BEGIN
 IF NOT (SELECT enabled FROM ledger_private.push_config) THEN RETURN NEW; END IF;
 SELECT data INTO old_data FROM ledger_private.household_events WHERE id=NEW.id AND version=NEW.version-1;
 kind:=CASE
  WHEN NEW.action IN ('create','create_poll') THEN 'event_new'
  WHEN NEW.action IN ('lock_in','confirm') THEN 'event_locked'
  WHEN NEW.action='cancel' THEN 'event_cancelled'
  WHEN NEW.action='edit' AND NEW.data->>'state'<>'polling' AND (NEW.data->>'interval_version')::integer>(old_data->>'interval_version')::integer THEN 'event_changed'
  END;
 IF kind IS NULL THEN RETURN NEW; END IF;
 FOR recipient IN SELECT unnest(ARRAY['michal','rina','ohm','rohil']) LOOP
  IF recipient<>NEW.actor THEN
   INSERT INTO ledger_private.push_events(id,kind,category,member,object_id,data)
    VALUES(kind||':'||NEW.id||':'||NEW.version||':'||recipient,kind,'events',recipient,NEW.id,jsonb_build_object('interval_version',(NEW.data->>'interval_version')::integer)) ON CONFLICT DO NOTHING;
  END IF;
 END LOOP;
 RETURN NEW;
END; $$;
CREATE TRIGGER push_event AFTER INSERT ON ledger_private.household_events FOR EACH ROW EXECUTE FUNCTION ledger_private.push_capture_event();

CREATE OR REPLACE FUNCTION public.utilities_push_device(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d ledger_private.push_devices; h text; action text:=p->>'action'; ep text; cats jsonb; sub jsonb;
BEGIN
 IF coalesce(p->>'token','') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'This device needs a notification token'; END IF;
 h:=encode(sha256(convert_to(p->>'token','UTF8')),'hex');
 SELECT * INTO d FROM ledger_private.push_devices WHERE token_hash=h FOR UPDATE;
 IF action='status' THEN
  IF d.id IS NULL THEN RETURN jsonb_build_object('registered',false); END IF;
 ELSIF action='register' THEN
  IF NOT (SELECT enabled FROM ledger_private.push_config) THEN RAISE EXCEPTION 'Phone notifications are not configured yet'; END IF;
  IF coalesce(p->>'member','') NOT IN ('michal','rina','ohm','rohil') THEN RAISE EXCEPTION 'Choose whose notifications this phone should receive'; END IF;
  ep:=p->'subscription'->>'endpoint';
  -- Only real browser push services; no arbitrary outbound URLs, ports, or redirects.
  IF coalesce(ep,'') !~ '^https://(web\.push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)/[A-Za-z0-9_/?=&%+.:~-]+$' OR length(ep)>2048 THEN RAISE EXCEPTION 'Unsupported browser push endpoint'; END IF;
  IF coalesce(p->'subscription'->'keys'->>'p256dh','') !~ '^[A-Za-z0-9_-]{87}={0,1}$'
     OR coalesce(p->'subscription'->'keys'->>'auth','') !~ '^[A-Za-z0-9_-]{22}={0,2}$' THEN RAISE EXCEPTION 'Invalid browser subscription'; END IF;
  cats:=coalesce(p->'categories','["bills","chores","notes","events"]'::jsonb);
  IF jsonb_typeof(cats) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Choose notification categories'; END IF;
  IF jsonb_array_length(cats)>4 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(cats) c WHERE c NOT IN ('bills','chores','notes','events') OR c IS NULL) THEN RAISE EXCEPTION 'Invalid notification category'; END IF;
  sub:=jsonb_build_object('endpoint',ep,'keys',jsonb_build_object('p256dh',p->'subscription'->'keys'->>'p256dh','auth',p->'subscription'->'keys'->>'auth'));
  IF EXISTS(SELECT 1 FROM ledger_private.push_devices WHERE endpoint=ep AND token_hash<>h) THEN RAISE EXCEPTION 'Reset this browser subscription before connecting it again'; END IF;
  IF d.id IS NULL AND (SELECT count(*) FROM ledger_private.push_devices WHERE enabled)>=32 THEN RAISE EXCEPTION 'The household device limit has been reached'; END IF;
  IF d.id IS NOT NULL AND (d.member<>p->>'member' OR NOT d.enabled OR d.endpoint<>ep) THEN
   UPDATE ledger_private.push_deliveries SET state='skipped' WHERE device_id=d.id AND state IN ('pending','leased');
  END IF;
  INSERT INTO ledger_private.push_devices(token_hash,member,subscription,endpoint,categories) VALUES(h,p->>'member',sub,ep,cats)
  ON CONFLICT(token_hash) DO UPDATE SET member=excluded.member,subscription=excluded.subscription,endpoint=excluded.endpoint,
   categories=excluded.categories,enabled=true,updated_at=now(),last_error=NULL,
   enrolled_at=CASE WHEN push_devices.member<>excluded.member OR NOT push_devices.enabled OR push_devices.endpoint<>excluded.endpoint THEN now() ELSE push_devices.enrolled_at END
  RETURNING * INTO d;
 ELSIF action='disable' AND d.id IS NOT NULL THEN
  UPDATE ledger_private.push_devices SET enabled=false,updated_at=now() WHERE id=d.id RETURNING * INTO d;
  UPDATE ledger_private.push_deliveries SET state='skipped' WHERE device_id=d.id AND state IN ('pending','leased');
 ELSIF action='test' AND d.id IS NOT NULL AND d.enabled THEN
  IF d.last_test_at>now()-interval '1 minute' THEN RAISE EXCEPTION 'Please wait a minute before sending another test'; END IF;
  IF NOT (SELECT enabled FROM ledger_private.push_config) THEN RAISE EXCEPTION 'Phone notifications are not configured yet'; END IF;
  INSERT INTO ledger_private.push_events(id,kind,category,member,object_id,data,expires_at)
   VALUES('test:'||gen_random_uuid(),'test','test',d.member,d.id::text,jsonb_build_object('device_id',d.id),now()+interval '5 minutes');
  UPDATE ledger_private.push_devices SET last_test_at=now() WHERE id=d.id RETURNING * INTO d;
 ELSE RAISE EXCEPTION 'Enable notifications on this device first';
 END IF;
 RETURN jsonb_build_object('registered',true,'enabled',d.enabled,'member',d.member,'categories',d.categories,
  'last_sent_at',d.last_sent_at,'last_error',d.last_error);
END; $$;

CREATE OR REPLACE FUNCTION ledger_private.push_event_valid(e ledger_private.push_events,t timestamptz) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT e.expires_at>t AND CASE
 WHEN e.kind IN ('due','assignment') THEN EXISTS(SELECT 1 FROM ledger_private.current_chores c WHERE c.id=e.object_id
  AND c.data->>'assignee'=e.member AND ledger_private.chore_status(c.data,t) IN ('active','overdue')
  AND (e.kind<>'due' OR ledger_private.push_reminder_at(c.data)=(e.data->>'reminder_at')::timestamptz))
 WHEN e.kind='note' THEN EXISTS(SELECT 1 FROM ledger_private.current_bulletin_notes n WHERE n.id=e.object_id AND NOT n.deleted AND n.data->'recipients' ? e.member)
 WHEN e.kind='bills' THEN EXISTS(SELECT 1 FROM ledger_private.current_bills b JOIN ledger_private.allocations a USING(bill_id,version)
  WHERE NOT b.deleted AND e.data->'bill_ids' ? b.bill_id AND a.member=e.member AND a.cents<>0)
 WHEN e.kind LIKE 'event%' THEN EXISTS(SELECT 1 FROM ledger_private.current_events v WHERE v.id=e.object_id AND CASE
  WHEN e.kind='event_cancelled' THEN v.data->>'state'='cancelled'
  WHEN v.data->>'state'='cancelled' THEN false
  WHEN e.kind='event_locked' THEN v.data->>'state'='confirmed' AND (v.data->>'starts_at')::timestamptz>t
  WHEN e.kind IN ('event_changed','event_reminder') THEN (v.data->>'interval_version')::integer=(e.data->>'interval_version')::integer AND (v.data->>'starts_at')::timestamptz>t
   AND (e.kind<>'event_reminder' OR EXISTS(SELECT 1 FROM ledger_private.current_event_responses r WHERE r.id=v.id AND r.member=e.member AND r.interval_version=(v.data->>'interval_version')::integer AND r.response IN ('yes','maybe')))
  ELSE coalesce((v.data->>'ends_at')::timestamptz>t,(v.data->>'window_end')::date>=(t AT TIME ZONE 'America/New_York')::date) END)
 WHEN e.kind='test' THEN true ELSE false END;
$$;

CREATE OR REPLACE FUNCTION ledger_private.push_payload(e ledger_private.push_events) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE body text; tab text; title text; ev jsonb; label text; host text;
BEGIN
 IF e.kind IN ('assignment','due') THEN
  SELECT (CASE WHEN e.kind='due' THEN 'Chore reminder: ' ELSE 'Assigned to you: ' END)|| (data->>'title') INTO body FROM ledger_private.current_chores WHERE id=e.object_id;
  tab:='chores';title:='Household · Chores';
 ELSIF e.kind='note' THEN
  SELECT initcap(data->>'author')||' left you a note. Tap to visit the board.' INTO body FROM ledger_private.current_bulletin_notes WHERE id=e.object_id;
  tab:='bulletin';title:='Household · A note for you';
 ELSIF e.kind LIKE 'event%' THEN
  SELECT data INTO ev FROM ledger_private.current_events WHERE id=e.object_id;
  label:='“'||(ev->>'title')||'”';host:=initcap(ev->>'host');tab:='events';title:='Household · Events';
  body:=CASE e.kind
   WHEN 'event_new' THEN CASE WHEN ev->>'state'='polling' THEN host||' is planning '||label||'. Mark the days that work for you.' ELSE host||' posted '||label||' · '||ledger_private.event_when(ev) END
   WHEN 'event_locked' THEN label||' is set for '||ledger_private.event_when(ev)||'.'
   WHEN 'event_changed' THEN label||' moved to '||ledger_private.event_when(ev)||'.'
   WHEN 'event_cancelled' THEN host||' cancelled '||label||'.'
   ELSE label||' starts at '||to_char((ev->>'starts_at')::timestamptz AT TIME ZONE 'America/New_York','FMHH12:MI AM')||'.' END;
 ELSIF e.kind='bills' THEN body:='New utility bills are ready. Tap to see your share.';tab:='utilities';title:='Household · New bills';
 ELSE body:='You’re connected. Tap to visit the household website.';tab:='utilities';title:='Household · Notifications enabled';
 END IF;
 RETURN jsonb_build_object('title',title,'body',body,'tab',tab,'item',CASE WHEN e.kind='test' THEN '' ELSE e.object_id END,'tag',e.id);
END; $$;

CREATE OR REPLACE FUNCTION ledger_private.push_claim(t timestamptz) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE output jsonb;
BEGIN
 IF NOT (SELECT enabled FROM ledger_private.push_config) THEN RETURN '[]'::jsonb; END IF;
 PERFORM ledger_private.materialize_chores();
 INSERT INTO ledger_private.push_events(id,kind,category,member,object_id,data,created_at,expires_at)
 SELECT 'due:'||c.id||':'||(c.data->>'assignee')||':'||r.at::text,'due','chores',c.data->>'assignee',c.id,
  jsonb_build_object('reminder_at',r.at),r.at,r.at+interval '1 day'
 FROM ledger_private.current_chores c CROSS JOIN LATERAL (SELECT ledger_private.push_reminder_at(c.data) AS at) r
 WHERE c.data->>'assignee' IS NOT NULL AND r.at<=t AND r.at>t-interval '1 day'
  AND r.at>=(SELECT installed_at FROM ledger_private.push_config)
  AND ledger_private.chore_status(c.data,t) IN ('active','overdue') ON CONFLICT DO NOTHING;
-- Two hours before a set time, a reminder for everyone who said Yes or Maybe.
 INSERT INTO ledger_private.push_events(id,kind,category,member,object_id,data,created_at,expires_at)
 SELECT 'event_reminder:'||v.id||':'||(v.data->>'interval_version')||':'||r.member,'event_reminder','events',r.member,v.id,
  jsonb_build_object('interval_version',(v.data->>'interval_version')::integer),s.at-interval '2 hours',s.at
 FROM ledger_private.current_events v CROSS JOIN LATERAL (SELECT (v.data->>'starts_at')::timestamptz AS at) s
 JOIN ledger_private.current_event_responses r ON r.id=v.id AND r.interval_version=(v.data->>'interval_version')::integer AND r.response IN ('yes','maybe')
 WHERE v.data->>'state' IN ('proposed','confirmed') AND s.at-interval '2 hours'<=t AND s.at>t
  AND s.at-interval '2 hours'>=(SELECT installed_at FROM ledger_private.push_config) ON CONFLICT DO NOTHING;
 INSERT INTO ledger_private.push_deliveries(event_id,device_id,available_at)
 SELECT e.id,d.id,CASE WHEN e.kind='test' THEN t ELSE ledger_private.push_after_quiet(e.created_at) END
 FROM ledger_private.push_events e JOIN ledger_private.push_devices d ON d.member=e.member AND d.enabled AND d.enrolled_at<=e.created_at
 WHERE e.expires_at>t AND (d.categories ? e.category OR (e.kind='test' AND e.data->>'device_id'=d.id::text))
 ON CONFLICT DO NOTHING;
 -- Revalidate after quiet hours, reassignment, edits, expiry, or opting out.
 UPDATE ledger_private.push_deliveries q SET state='skipped'
 FROM ledger_private.push_events e,ledger_private.push_devices d
 WHERE q.event_id=e.id AND q.device_id=d.id AND q.state IN ('pending','leased') AND (
  NOT d.enabled OR d.member<>e.member OR d.enrolled_at>e.created_at OR NOT ledger_private.push_event_valid(e,t)
  OR (e.kind<>'test' AND NOT d.categories ? e.category)
  OR (e.kind='due' AND EXISTS(SELECT 1 FROM ledger_private.push_deliveries done JOIN ledger_private.push_events previous ON previous.id=done.event_id
    WHERE done.device_id=d.id AND done.state='sent' AND previous.kind='due' AND previous.object_id=e.object_id AND previous.member=e.member)));
 WITH candidates AS (
  SELECT q.event_id,q.device_id FROM ledger_private.push_deliveries q JOIN ledger_private.push_events e ON e.id=q.event_id
  WHERE q.state IN ('pending','leased') AND q.available_at<=t AND (e.kind='test' OR ledger_private.push_after_quiet(t)=t)
  ORDER BY e.created_at LIMIT 20 FOR UPDATE OF q SKIP LOCKED
 ), claimed AS (
  UPDATE ledger_private.push_deliveries q SET state='leased',lease_token=gen_random_uuid(),attempts=q.attempts+1,available_at=t+interval '3 minutes'
  FROM candidates c WHERE q.event_id=c.event_id AND q.device_id=c.device_id
  RETURNING q.*
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('event_id',q.event_id,'device_id',q.device_id,'lease_token',q.lease_token,
  'subscription',d.subscription,'payload',ledger_private.push_payload(e),
  'ttl',greatest(1,least(3600,extract(epoch FROM e.expires_at-t)::integer,
    CASE WHEN e.kind IN ('assignment','due') THEN coalesce((SELECT extract(epoch FROM least((c.data->>'expires_at')::timestamptz,(c.data->>'cycle_end')::timestamptz)-t)::integer FROM ledger_private.current_chores c WHERE c.id=e.object_id),3600) ELSE 3600 END)))), '[]'::jsonb)
 INTO output FROM claimed q JOIN ledger_private.push_events e ON e.id=q.event_id JOIN ledger_private.push_devices d ON d.id=q.device_id;
 RETURN output;
END; $$;
REVOKE ALL ON FUNCTION ledger_private.event_when(jsonb),ledger_private.push_capture_event() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
