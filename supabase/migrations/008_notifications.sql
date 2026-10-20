BEGIN;
-- Device credentials and delivery records never enter the public ledgers.
CREATE TABLE ledger_private.push_config (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 public_key text NOT NULL DEFAULT '', enabled boolean NOT NULL DEFAULT false,
 installed_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO ledger_private.push_config DEFAULT VALUES;
CREATE TABLE ledger_private.push_devices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), token_hash text UNIQUE NOT NULL,
 member text NOT NULL CHECK(member IN ('michal','rina','ohm','rohil')),
 subscription jsonb NOT NULL, endpoint text UNIQUE NOT NULL,
 categories jsonb NOT NULL DEFAULT '["bills","chores","notes"]',
 enabled boolean NOT NULL DEFAULT true, enrolled_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), last_test_at timestamptz,
 last_sent_at timestamptz, last_error text
);
CREATE TABLE ledger_private.push_events (
 id text PRIMARY KEY, kind text NOT NULL, category text NOT NULL,
 member text NOT NULL, object_id text NOT NULL, data jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '1 day'
);
CREATE TABLE ledger_private.push_deliveries (
 event_id text NOT NULL REFERENCES ledger_private.push_events(id),
 device_id uuid NOT NULL REFERENCES ledger_private.push_devices(id),
 state text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(), lease_token uuid,
 last_error text, sent_at timestamptz, PRIMARY KEY(event_id,device_id)
);
ALTER TABLE ledger_private.push_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_private.push_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_private.push_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_private.push_deliveries ENABLE ROW LEVEL SECURITY;
CREATE INDEX push_delivery_pending ON ledger_private.push_deliveries(available_at) WHERE state IN ('pending','leased');

CREATE FUNCTION ledger_private.push_reminder_at(p jsonb) RETURNS timestamptz LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE WHEN p->>'due_on' IS NULL THEN NULL ELSE
 ((p->>'due_on')::date+coalesce(nullif(p->>'due_time',''),'09:00')::time) AT TIME ZONE 'America/New_York' END;
$$;
CREATE FUNCTION ledger_private.push_after_quiet(t timestamptz) RETURNS timestamptz LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE WHEN (t AT TIME ZONE 'America/New_York')::time >= time '22:00'
 THEN (((t AT TIME ZONE 'America/New_York')::date+1)+time '08:00') AT TIME ZONE 'America/New_York'
 WHEN (t AT TIME ZONE 'America/New_York')::time < time '08:00'
 THEN ((t AT TIME ZONE 'America/New_York')::date+time '08:00') AT TIME ZONE 'America/New_York'
 ELSE t END;
$$;
CREATE FUNCTION public.utilities_push_config() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('enabled',enabled,'public_key',public_key) FROM ledger_private.push_config;
$$;

-- An unguessable, device-local token owns only this subscription. No verified
-- household identity is implied; choosing a name keeps the existing trust model.
CREATE FUNCTION public.utilities_push_device(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
  cats:=coalesce(p->'categories','["bills","chores","notes"]'::jsonb);
  IF jsonb_typeof(cats) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Choose notification categories'; END IF;
  IF jsonb_array_length(cats)>3 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(cats) c WHERE c NOT IN ('bills','chores','notes') OR c IS NULL) THEN RAISE EXCEPTION 'Invalid notification category'; END IF;
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

CREATE FUNCTION ledger_private.push_capture() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE old_data jsonb; recipient text; ids jsonb;
BEGIN
 IF NOT (SELECT enabled FROM ledger_private.push_config) THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='bulletin_note_events' THEN
  IF NEW.deleted OR NEW.action NOT IN ('create','edit') THEN RETURN NEW; END IF;
  SELECT data INTO old_data FROM ledger_private.bulletin_note_events WHERE id=NEW.id AND version=NEW.version-1;
  FOR recipient IN SELECT value FROM jsonb_array_elements_text(NEW.data->'recipients') LOOP
   IF recipient<>NEW.data->>'author' AND NOT coalesce(old_data->'recipients' ? recipient,false) THEN
    INSERT INTO ledger_private.push_events(id,kind,category,member,object_id)
     VALUES('note:'||NEW.id||':'||NEW.version||':'||recipient,'note','notes',recipient,NEW.id) ON CONFLICT DO NOTHING;
   END IF;
  END LOOP;
 ELSIF TG_TABLE_NAME='chore_task_events' THEN
  SELECT data INTO old_data FROM ledger_private.chore_task_events WHERE id=NEW.id AND version=NEW.version-1;
  IF old_data IS NULL AND NEW.action<>'create' THEN SELECT data INTO old_data FROM ledger_private.chore_tasks WHERE id=NEW.id; END IF;
  recipient:=NEW.data->>'assignee';
  IF recipient IS NOT NULL AND recipient<>NEW.actor AND NEW.data->>'state'='active'
    AND (NEW.action='create' OR recipient IS DISTINCT FROM old_data->>'assignee') THEN
   INSERT INTO ledger_private.push_events(id,kind,category,member,object_id)
    VALUES('assignment:'||NEW.id||':'||NEW.version,'assignment','chores',recipient,NEW.id) ON CONFLICT DO NOTHING;
  END IF;
 ELSE
  FOR recipient IN SELECT unnest(ARRAY['michal','rina','ohm','rohil']) LOOP
   SELECT jsonb_agg(x->>'id') INTO ids FROM jsonb_array_elements(NEW.result) x
    WHERE x->>'status'='created' AND EXISTS(SELECT 1 FROM ledger_private.allocations a
     WHERE a.bill_id=x->>'id' AND a.version=(x->>'version')::integer AND a.member=recipient AND a.cents<>0);
   IF ids IS NOT NULL THEN
    INSERT INTO ledger_private.push_events(id,kind,category,member,object_id,data)
     VALUES('bills:'||NEW.request_id||':'||recipient,'bills','bills',recipient,ids->>0,jsonb_build_object('bill_ids',ids)) ON CONFLICT DO NOTHING;
   END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER push_note AFTER INSERT ON ledger_private.bulletin_note_events FOR EACH ROW EXECUTE FUNCTION ledger_private.push_capture();
CREATE TRIGGER push_assignment AFTER INSERT ON ledger_private.chore_task_events FOR EACH ROW EXECUTE FUNCTION ledger_private.push_capture();
CREATE TRIGGER push_bills AFTER INSERT ON ledger_private.import_requests FOR EACH ROW EXECUTE FUNCTION ledger_private.push_capture();

CREATE FUNCTION ledger_private.push_event_valid(e ledger_private.push_events,t timestamptz) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT e.expires_at>t AND CASE
 WHEN e.kind IN ('due','assignment') THEN EXISTS(SELECT 1 FROM ledger_private.current_chores c WHERE c.id=e.object_id
  AND c.data->>'assignee'=e.member AND ledger_private.chore_status(c.data,t) IN ('active','overdue')
  AND (e.kind<>'due' OR ledger_private.push_reminder_at(c.data)=(e.data->>'reminder_at')::timestamptz))
 WHEN e.kind='note' THEN EXISTS(SELECT 1 FROM ledger_private.current_bulletin_notes n WHERE n.id=e.object_id AND NOT n.deleted AND n.data->'recipients' ? e.member)
 WHEN e.kind='bills' THEN EXISTS(SELECT 1 FROM ledger_private.current_bills b JOIN ledger_private.allocations a USING(bill_id,version)
  WHERE NOT b.deleted AND e.data->'bill_ids' ? b.bill_id AND a.member=e.member AND a.cents<>0)
 WHEN e.kind='test' THEN true ELSE false END;
$$;
CREATE FUNCTION ledger_private.push_payload(e ledger_private.push_events) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE body text; tab text; title text;
BEGIN
 IF e.kind IN ('assignment','due') THEN
  SELECT (CASE WHEN e.kind='due' THEN 'Chore reminder: ' ELSE 'Assigned to you: ' END)|| (data->>'title') INTO body FROM ledger_private.current_chores WHERE id=e.object_id;
  tab:='chores';title:='Household · Chores';
 ELSIF e.kind='note' THEN
  SELECT initcap(data->>'author')||' left you a note. Tap to visit the board.' INTO body FROM ledger_private.current_bulletin_notes WHERE id=e.object_id;
  tab:='bulletin';title:='Household · A note for you';
 ELSIF e.kind='bills' THEN body:='New utility bills are ready. Tap to see your share.';tab:='utilities';title:='Household · New bills';
 ELSE body:='You’re connected. Tap to visit the household website.';tab:='utilities';title:='Household · Notifications enabled';
 END IF;
 RETURN jsonb_build_object('title',title,'body',body,'tab',tab,'item',CASE WHEN e.kind='test' THEN '' ELSE e.object_id END,'tag',e.id);
END; $$;

-- Service-only worker entry point. Time is injected into the private helper for
-- deterministic tests; callers cannot change the production clock.
CREATE FUNCTION ledger_private.push_claim(t timestamptz) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
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
CREATE FUNCTION public.utilities_push_claim() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT ledger_private.push_claim(now()); $$;
CREATE FUNCTION public.utilities_push_finish(p jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q ledger_private.push_deliveries; code integer:=(p->>'status')::integer;
BEGIN
 SELECT * INTO q FROM ledger_private.push_deliveries WHERE event_id=p->>'event_id' AND device_id=(p->>'device_id')::uuid AND lease_token=(p->>'lease_token')::uuid AND state='leased' FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 UPDATE ledger_private.push_deliveries SET
  state=CASE WHEN code BETWEEN 200 AND 299 THEN 'sent' WHEN code IN (404,410) OR attempts>=5 OR (code BETWEEN 400 AND 499 AND code NOT IN (408,429)) THEN 'failed' ELSE 'pending' END,
  available_at=now()+make_interval(secs=>least(3600,60*(2^attempts)::integer)),
  sent_at=CASE WHEN code BETWEEN 200 AND 299 THEN now() ELSE NULL END,
  last_error=CASE WHEN code BETWEEN 200 AND 299 THEN NULL ELSE 'push_http_'||code END
 WHERE event_id=q.event_id AND device_id=q.device_id;
 UPDATE ledger_private.push_devices SET
  enabled=CASE WHEN code IN (404,410) THEN false ELSE enabled END,
  last_sent_at=CASE WHEN code BETWEEN 200 AND 299 THEN now() ELSE last_sent_at END,
  last_error=CASE WHEN code BETWEEN 200 AND 299 THEN NULL ELSE 'push_http_'||code END WHERE id=q.device_id;
END; $$;
REVOKE ALL ON ledger_private.push_config,ledger_private.push_devices,ledger_private.push_events,ledger_private.push_deliveries FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION ledger_private.push_reminder_at(jsonb),ledger_private.push_after_quiet(timestamptz),ledger_private.push_capture(),
 ledger_private.push_event_valid(ledger_private.push_events,timestamptz),ledger_private.push_payload(ledger_private.push_events),ledger_private.push_claim(timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.utilities_push_config(),public.utilities_push_device(jsonb),public.utilities_push_claim(),public.utilities_push_finish(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.utilities_push_config(),public.utilities_push_device(jsonb) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.utilities_push_claim(),public.utilities_push_finish(jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
