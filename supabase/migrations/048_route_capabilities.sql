-- Public release metadata must not require access to private game tables.
BEGIN;
CREATE OR REPLACE FUNCTION public.utilities_geography_route_capabilities()
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT '{"version":2,"puzzles":108,"global_routes":true}'::jsonb;
$$;
CREATE OR REPLACE FUNCTION ledger_private.route_capabilities_version()
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT 1; $$;
REVOKE ALL ON FUNCTION ledger_private.route_capabilities_version() FROM PUBLIC,anon,authenticated;
COMMIT;
