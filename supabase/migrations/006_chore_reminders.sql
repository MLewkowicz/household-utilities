-- Optional zero-point reminders. Existing tasks, routines, and revisions stay intact.
BEGIN;
CREATE OR REPLACE FUNCTION ledger_private.chore_points(p jsonb) RETURNS integer LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'number' OR p::text NOT IN ('0','1','2','3') THEN RAISE EXCEPTION 'Choose no points, or 1, 2, or 3 points'; END IF;
 RETURN p::text::integer;
END; $$;
-- Credit per contributor; uncompleted work and reminders earn none.
CREATE OR REPLACE FUNCTION ledger_private.chore_credit_units(p jsonb) RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN p->>'state'='completed' AND jsonb_array_length(p->'completion'->'contributors') BETWEEN 1 AND 4
 THEN (p->>'points')::integer*12/jsonb_array_length(p->'completion'->'contributors') ELSE 0 END;
$$;
REVOKE ALL ON FUNCTION ledger_private.chore_points(jsonb),ledger_private.chore_credit_units(jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.utilities_chores_dashboard() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; local_day date:=(now() AT TIME ZONE 'America/New_York')::date;
BEGIN
 PERFORM ledger_private.materialize_chores();
 WITH actual AS (SELECT c.id,c.version,c.data,c.created_at,c.actor,false AS projected FROM ledger_private.current_chores c),
 projected AS (SELECT o.id,0 AS version,o.data,o.created_at,o.data->>'requester' AS actor,true AS projected FROM ledger_private.chore_occurrences(local_day+84) o WHERE NOT EXISTS(SELECT 1 FROM actual a WHERE a.id=o.id)),
 tasks AS (SELECT * FROM actual UNION ALL SELECT * FROM projected),
 credits AS (
  SELECT c.id,c.data->>'title' AS title,m.value AS member,ledger_private.chore_credit_units(c.data) AS units,
   c.data->'completion'->>'completed_at' AS completed_at
  FROM actual c CROSS JOIN LATERAL jsonb_array_elements_text(c.data->'completion'->'contributors') m WHERE ledger_private.chore_credit_units(c.data)>0
 ), periods AS (SELECT 'week' AS period,date_trunc('week',local_day::timestamp) AT TIME ZONE 'America/New_York' AS starts UNION ALL SELECT 'month',date_trunc('month',local_day::timestamp) AT TIME ZONE 'America/New_York' UNION ALL SELECT 'all',NULL::timestamptz),
 scores AS (SELECT p.period,m.member,coalesce(sum(c.units),0)::integer AS units,coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.completed_at DESC,c.id) FILTER(WHERE c.id IS NOT NULL),'[]'::jsonb) AS entries
  FROM periods p CROSS JOIN unnest(ARRAY['michal','rina','ohm','rohil']) m(member) LEFT JOIN credits c ON c.member=m.member AND (p.starts IS NULL OR c.completed_at::timestamptz>=p.starts) GROUP BY p.period,m.member),
 ranked AS (SELECT *,rank() OVER(PARTITION BY period ORDER BY units DESC) AS rank FROM scores)
 SELECT jsonb_build_object('tasks',coalesce((SELECT jsonb_agg(data||jsonb_build_object('id',id,'version',version,'created_at',created_at,'actor',actor,'projected',projected,'status',ledger_private.chore_status(data,now())) ORDER BY created_at,id) FROM tasks),'[]'::jsonb),
 'routines',coalesce((SELECT jsonb_agg(data||jsonb_build_object('id',id,'version',version,'actor',actor,'effective_on',effective_on,'created_at',created_at) ORDER BY created_at,id) FROM (SELECT DISTINCT ON(id) * FROM ledger_private.chore_routine_events ORDER BY id,version DESC) r),'[]'::jsonb),
 'history',coalesce((SELECT jsonb_agg(data||jsonb_build_object('id',id,'version',version,'actor',actor,'action',action,'change_note',change_note,'created_at',created_at) ORDER BY created_at DESC,id,version DESC) FROM ledger_private.chore_task_events),'[]'::jsonb),
 'routine_history',coalesce((SELECT jsonb_agg(data||jsonb_build_object('id',id,'version',version,'actor',actor,'effective_on',effective_on,'created_at',created_at) ORDER BY created_at DESC,id,version DESC) FROM ledger_private.chore_routine_events),'[]'::jsonb),
 'leaderboard',coalesce((SELECT jsonb_agg(to_jsonb(ranked) ORDER BY period,rank,member) FROM ranked),'[]'::jsonb),
 'updated_at',now(),'local_day',local_day,'projection_until',local_day+84,'format_version',1) INTO result;
 RETURN result;
END; $$;
NOTIFY pgrst,'reload schema';
COMMIT;
