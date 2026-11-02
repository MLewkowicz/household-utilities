BEGIN;
-- Freeze existing scheduled occurrences before changing the dishwasher catalog.
SELECT ledger_private.materialize_chores();
CREATE OR REPLACE FUNCTION ledger_private.chore_effort(p jsonb) RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'number' OR p::text::numeric NOT IN (0,0.25,0.5,1,2,3) THEN RAISE EXCEPTION 'Choose 0, 0.25, 0.5, 1, 2, or 3 points'; END IF;
 RETURN p::text::numeric;
END; $$;
-- Stored routine snapshots retain the catalog values from their revision.
CREATE OR REPLACE FUNCTION ledger_private.chore_occurrences(until_day date)
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


UPDATE ledger_private.point_presets SET points=0.25,policy_version='dishwasher-v2' WHERE id='dishwasher-start';
INSERT INTO ledger_private.point_presets VALUES('dishwasher-empty','Empty dishwasher',1,'dishwasher-v2');
CREATE FUNCTION ledger_private.dishwasher_preset(p jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN coalesce(p->>'kind',CASE WHEN (p->>'points')::numeric=0 THEN 'reminder' ELSE 'chore' END)<>'chore' THEN NULL
 WHEN p->>'preset_id' IN ('dishwasher-start','dishwasher-empty') THEN p->>'preset_id'
 WHEN p->>'preset_id' IS NOT NULL THEN NULL
 WHEN lower(trim(p->>'title')) IN ('start dishwasher','start the dishwasher','run dishwasher','run the dishwasher','running dishwasher','running the dishwasher') THEN 'dishwasher-start'
 WHEN lower(trim(p->>'title')) IN ('empty dishwasher','empty the dishwasher','unload dishwasher','unload the dishwasher','unloading dishwasher','unloading the dishwasher','take stuff out of the dishwasher') THEN 'dishwasher-empty'
 END;
$$;
-- User-authorized correction: append revisions, retaining completion and contributors.
DO $$
DECLARE item record; preset record; changed jsonb; saved jsonb; steps jsonb;
BEGIN
 FOR item IN SELECT * FROM ledger_private.current_chores WHERE ledger_private.dishwasher_preset(data) IS NOT NULL LOOP
  SELECT * INTO preset FROM ledger_private.point_presets WHERE id=ledger_private.dishwasher_preset(item.data);
  changed:=item.data||jsonb_build_object('points',preset.points,'preset_id',preset.id,'point_policy',preset.policy_version);
  IF changed=item.data THEN CONTINUE; END IF;
  saved:=public.utilities_save_chore(changed||jsonb_build_object('id',item.id,'expected_version',item.version,'action','edit','actor','michal','request_id',md5('dishwasher-v2:'||item.id),'change_note','Dishwasher policy: running 0.25 points; emptying 1 point. Original completion retained.'));
  INSERT INTO ledger_private.point_adjustments VALUES(md5('dishwasher-v2:'||item.id),item.id,item.version,(saved->>'version')::integer,item.data,saved-'id'-'version','michal','Dishwasher point correction','dishwasher-v2',NULL,now());
 END LOOP;
 FOR item IN SELECT DISTINCT ON(id) * FROM ledger_private.chore_routine_events ORDER BY id,version DESC LOOP
  SELECT jsonb_agg(CASE WHEN p.id IS NULL THEN s ELSE s||jsonb_build_object('points',p.points,'preset_id',p.id,'point_policy',p.policy_version) END ORDER BY ord) INTO steps
   FROM jsonb_array_elements(item.data->'steps') WITH ORDINALITY x(s,ord) LEFT JOIN ledger_private.point_presets p ON p.id=ledger_private.dishwasher_preset(s);
  IF steps IS DISTINCT FROM item.data->'steps' THEN
   PERFORM public.utilities_save_chore_routine(item.data||jsonb_build_object('steps',steps,'id',item.id,'expected_version',item.version,'actor','michal','request_id',md5('dishwasher-v2:routine:'||item.id)));
  END IF;
 END LOOP;
END; $$;
REVOKE ALL ON FUNCTION ledger_private.dishwasher_preset(jsonb) FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
