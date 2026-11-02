BEGIN;
-- Detail and poll edits notify; cosmetic edits, no-op saves and votes stay quiet.
CREATE FUNCTION ledger_private.event_details_changed(before_data jsonb,after_data jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM unnest(ARRAY['title','description','location','window_start','window_end','time_hint']) field WHERE before_data->field IS DISTINCT FROM after_data->field);
$$;
CREATE OR REPLACE FUNCTION ledger_private.push_capture_event() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE old_data jsonb; recipient text; kind text;
BEGIN
 IF NOT (SELECT enabled FROM ledger_private.push_config) THEN RETURN NEW; END IF;
 SELECT data INTO old_data FROM ledger_private.household_events WHERE id=NEW.id AND version=NEW.version-1;
 kind:=CASE
  WHEN NEW.action IN ('create','create_poll') THEN 'event_new'
  WHEN NEW.action IN ('lock_in','confirm') THEN 'event_locked'
  WHEN NEW.action='cancel' THEN 'event_cancelled'
  WHEN NEW.action='edit' AND NEW.data->>'state'<>'polling' AND (NEW.data->>'interval_version')::integer>(old_data->>'interval_version')::integer THEN 'event_changed'
  WHEN NEW.action='edit' AND ledger_private.event_details_changed(old_data,NEW.data) THEN 'event_updated'
  END;
 IF kind IS NULL THEN RETURN NEW; END IF;
 FOR recipient IN SELECT unnest(ARRAY['michal','rina','ohm','rohil']) LOOP
  IF recipient<>NEW.actor THEN
   INSERT INTO ledger_private.push_events(id,kind,category,member,object_id,data)
    VALUES(kind||':'||NEW.id||':'||NEW.version||':'||recipient,kind,'events',recipient,NEW.id,jsonb_build_object('interval_version',(NEW.data->>'interval_version')::integer,'event_version',NEW.version,'actor',NEW.actor)) ON CONFLICT DO NOTHING;
  END IF;
 END LOOP;
 RETURN NEW;
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
  WHEN e.kind='event_updated' THEN v.version=(e.data->>'event_version')::integer AND coalesce((v.data->>'starts_at')::timestamptz>t,(v.data->>'window_end')::date>=(t AT TIME ZONE 'America/New_York')::date)
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
   WHEN 'event_updated' THEN initcap(e.data->>'actor')||' updated '||label||'. Tap to see the changes.'
   WHEN 'event_changed' THEN label||' moved to '||ledger_private.event_when(ev)||'.'
   WHEN 'event_cancelled' THEN host||' cancelled '||label||'.'
   ELSE label||' starts at '||to_char((ev->>'starts_at')::timestamptz AT TIME ZONE 'America/New_York','FMHH12:MI AM')||'.' END;
 ELSIF e.kind='bills' THEN body:='New utility bills are ready. Tap to see your share.';tab:='utilities';title:='Household · New bills';
 ELSE body:='You’re connected. Tap to visit the household website.';tab:='utilities';title:='Household · Notifications enabled';
 END IF;
 RETURN jsonb_build_object('title',title,'body',body,'tab',tab,'item',CASE WHEN e.kind='test' THEN '' ELSE e.object_id END,'tag',e.id);
END; $$;
REVOKE ALL ON FUNCTION ledger_private.event_details_changed(jsonb,jsonb) FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
