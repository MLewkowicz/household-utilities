BEGIN;
SELECT ledger_private.materialize_chores();
UPDATE ledger_private.point_presets SET points=1,policy_version='sweeping-v2' WHERE id IN ('sweep-kitchen','sweep-living-room','sweep-corridor');
INSERT INTO ledger_private.point_presets VALUES
 ('sweep-kitchen-living-room','Sweep kitchen + living room',2,'sweeping-v2'),
 ('sweep-kitchen-corridor','Sweep kitchen + corridor',2,'sweeping-v2'),
 ('sweep-living-room-corridor','Sweep living room + corridor',2,'sweeping-v2'),
 ('sweep-kitchen-living-room-corridor','Sweep kitchen + living room + corridor',3,'sweeping-v2');
-- Historical correction is narrowly scoped to the work described by Michal.
-- Credit, contributors, timestamps and original revisions remain intact.
CREATE FUNCTION ledger_private.is_michal_combined_sweep(p jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT p->>'points'='2' AND p->'completion'->'contributors'='["michal"]'::jsonb
 AND (p->>'preset_id'='sweep-kitchen' OR lower(trim(p->>'title')) IN ('sweep kitchen','sweep the kitchen','sweeping kitchen'));
$$;
DO $$
DECLARE item record; changed jsonb; saved jsonb; new_steps jsonb; preset record;
BEGIN
 FOR item IN SELECT * FROM ledger_private.current_chores WHERE ledger_private.is_michal_combined_sweep(data)
 OR (data->>'state'='active' AND data->>'preset_id' IN ('sweep-kitchen','sweep-living-room','sweep-corridor')) LOOP
  SELECT * INTO preset FROM ledger_private.point_presets WHERE id=CASE WHEN ledger_private.is_michal_combined_sweep(item.data) THEN 'sweep-kitchen-living-room' ELSE item.data->>'preset_id' END;
  changed:=item.data||jsonb_build_object('title',preset.title,'points',preset.points,'preset_id',preset.id,'point_policy',preset.policy_version);
  saved:=public.utilities_save_chore(changed||jsonb_build_object('id',item.id,'expected_version',item.version,'action','edit','actor','michal','request_id',md5('sweeping-v2:'||item.id),'change_note','Sweeping is 1 point per space. Michal’s existing 2-point kitchen sweeps covered kitchen + living room; completion and total credit retained.'));
  INSERT INTO ledger_private.point_adjustments VALUES(md5('sweeping-v2:'||item.id),item.id,item.version,(saved->>'version')::integer,item.data,saved-'id'-'version','michal','Sweeping spaces correction','sweeping-v2',NULL,now());
 END LOOP;
 FOR item IN SELECT DISTINCT ON(id) * FROM ledger_private.chore_routine_events ORDER BY id,version DESC LOOP
  SELECT jsonb_agg(CASE WHEN p.id IS NULL THEN s ELSE s||jsonb_build_object('points',p.points,'point_policy',p.policy_version) END ORDER BY ord) INTO new_steps
  FROM jsonb_array_elements(item.data->'steps') WITH ORDINALITY x(s,ord) LEFT JOIN ledger_private.point_presets p ON p.id=s->>'preset_id' AND p.id IN ('sweep-kitchen','sweep-living-room','sweep-corridor');
  IF new_steps IS DISTINCT FROM item.data->'steps' THEN
   PERFORM public.utilities_save_chore_routine(item.data||jsonb_build_object('steps',new_steps,'id',item.id,'expected_version',item.version,'actor','michal','request_id',md5('sweeping-v2:routine:'||item.id)));
  END IF;
 END LOOP;
END; $$;
REVOKE ALL ON FUNCTION ledger_private.is_michal_combined_sweep(jsonb) FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
