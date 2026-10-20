-- Explicitly authorized conversion of the household's one grouped trash routine.
-- Each item becomes an independent 0.5-point routine. Keep occurrence IDs,
-- dates, assignments, completions, and revision metadata, including old links.
BEGIN;
CREATE TABLE IF NOT EXISTS ledger_private.chore_routine_splits (
 source_id text PRIMARY KEY, routine_ids jsonb NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ledger_private.chore_routine_splits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ledger_private.chore_routine_splits FROM PUBLIC,anon,authenticated;
DO $$
DECLARE
 routine_source constant text:='10986bd6-79a1-4a69-b799-e4938953c007';
 out_id constant text:='1a7bbd79-0488-4b94-825d-6843207f75dc';
 bag_id constant text:='c136b2d1-4cc0-4cf8-9ca4-a2195c32fcff';
 bag_routine text:=md5(routine_source||':trash-bag')::uuid::text;
 revision record; out_item jsonb; bag_item jsonb; bag_data jsonb;
BEGIN
 LOCK TABLE ledger_private.chore_routine_events,ledger_private.chore_tasks,ledger_private.chore_task_events IN EXCLUSIVE MODE;
 IF EXISTS(SELECT 1 FROM ledger_private.chore_routine_splits s WHERE s.source_id=routine_source) THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM ledger_private.chore_routine_events e WHERE e.id=routine_source) THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM ledger_private.chore_routine_events e WHERE e.id=bag_routine) THEN RAISE EXCEPTION 'The new trash-bag routine already exists; review before converting'; END IF;
 FOR revision IN SELECT * FROM ledger_private.chore_routine_events e WHERE e.id=routine_source ORDER BY e.version LOOP
  SELECT value INTO out_item FROM jsonb_array_elements(revision.data->'steps') WHERE value->>'id'=out_id;
  SELECT value INTO bag_item FROM jsonb_array_elements(revision.data->'steps') WHERE value->>'id'=bag_id;
  IF jsonb_array_length(revision.data->'steps')<>2 OR out_item IS NULL OR bag_item IS NULL
   OR lower(trim(out_item->>'title'))<>'take out the trash' OR lower(trim(bag_item->>'title'))<>'put in new trash bag'
   THEN RAISE EXCEPTION 'The trash routine changed; review its items before converting'; END IF;
  out_item:=out_item||jsonb_build_object('points',0.5,'kind','chore');
  bag_item:=bag_item||jsonb_build_object('points',0.5,'kind','chore','icon_id','trash-bag');
  bag_data:=revision.data||jsonb_build_object('title',bag_item->>'title','steps',jsonb_build_array(bag_item),'occurrence_root',routine_source);
  INSERT INTO ledger_private.chore_routine_events(id,version,effective_on,data,actor,created_at,request_id,fingerprint)
   VALUES(bag_routine,revision.version,revision.effective_on,bag_data,revision.actor,revision.created_at,'split-trash-bag-'||md5(revision.request_id),md5(bag_data::text));
  UPDATE ledger_private.chore_routine_events SET data=revision.data||jsonb_build_object('title',out_item->>'title','steps',jsonb_build_array(out_item)) WHERE id=routine_source AND version=revision.version;
 END LOOP;
 -- Updating the snapshots in place retains task IDs and completion/event identity.
 -- No notification triggers run: those only capture newly inserted task events.
 UPDATE ledger_private.chore_tasks SET data=data||jsonb_build_object('points',0.5,'kind','chore')||
  CASE WHEN data->>'step_id'=bag_id THEN jsonb_build_object('routine_id',bag_routine,'routine_title','Put in new trash bag','icon_id','trash-bag') ELSE '{}'::jsonb END
  WHERE data->>'routine_id'=routine_source AND data->>'step_id' IN (out_id,bag_id);
 UPDATE ledger_private.chore_task_events SET data=data||jsonb_build_object('points',0.5,'kind','chore')||
  CASE WHEN data->>'step_id'=bag_id THEN jsonb_build_object('routine_id',bag_routine,'routine_title','Put in new trash bag','icon_id','trash-bag') ELSE '{}'::jsonb END
  WHERE data->>'routine_id'=routine_source AND data->>'step_id' IN (out_id,bag_id);
 INSERT INTO ledger_private.chore_routine_splits(source_id,routine_ids) VALUES(routine_source,jsonb_build_array(routine_source,bag_routine));
END; $$;
NOTIFY pgrst,'reload schema';
COMMIT;
