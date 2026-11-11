BEGIN;
ALTER TABLE ledger_private.geography_scores ADD COLUMN challenge text NOT NULL DEFAULT 'name' CHECK(challenge IN ('name','find'));
CREATE OR REPLACE FUNCTION public.utilities_save_geography_score(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE prior ledger_private.geography_scores; saved ledger_private.geography_scores; pool_size integer;
BEGIN
 IF coalesce(p->>'id','') !~ '^[a-zA-Z0-9_-]{16,100}$' THEN RAISE EXCEPTION 'Invalid round identifier'; END IF;
 IF coalesce(p->>'player','') NOT IN ('michal','rina','ohm','rohil') THEN RAISE EXCEPTION 'Choose a household player'; END IF;
 IF coalesce(p->>'scope','') NOT IN ('countries','expanded') THEN RAISE EXCEPTION 'Choose a country set'; END IF;
 IF coalesce(p->>'challenge','name') NOT IN ('name','find') THEN RAISE EXCEPTION 'Choose a quiz challenge'; END IF;
 IF coalesce(p->>'region','') NOT IN ('World','Africa','Asia','Europe','North America','South America','Oceania','Micronesia','Polynesia','Melanesia','Caribbean','Central America') THEN RAISE EXCEPTION 'Choose a quiz region'; END IF;
 SELECT count(*) INTO pool_size FROM ledger_private.geography_catalog c WHERE (p->>'region'='World' OR c.continent=p->>'region' OR c.region=p->>'region') AND (p->>'scope'='expanded' OR c.official);
 IF (p->>'total')::integer IS DISTINCT FROM pool_size THEN RAISE EXCEPTION 'Country set has changed. Start a new round'; END IF;
 IF coalesce(p->>'challenge','name')='find' AND (p->>'correct')::integer+(p->>'mistakes')::integer>pool_size THEN RAISE EXCEPTION 'Each country can only be attempted once'; END IF;
 IF NOT (coalesce(p->>'challenge','name')='find' AND (p->>'correct')::integer+(p->>'mistakes')::integer=pool_size) AND (p->>'correct')::integer IS DISTINCT FROM pool_size AND (p->>'mistakes')::integer IS DISTINCT FROM 3 AND (p->>'elapsed_ms')::integer IS DISTINCT FROM 300000 THEN RAISE EXCEPTION 'Finish the competitive round before saving'; END IF;
 -- Serialize duplicate retries, including simultaneous requests from multiple tabs.
 PERFORM pg_advisory_xact_lock(hashtext(p->>'id'));
 SELECT * INTO prior FROM ledger_private.geography_scores WHERE id=p->>'id';
 IF FOUND THEN
  IF prior.fingerprint<>md5(p::text) THEN RAISE EXCEPTION 'This round was already saved with different results'; END IF;
  RETURN to_jsonb(prior)-'fingerprint';
 END IF;
 INSERT INTO ledger_private.geography_scores(id,player,region,scope,challenge,correct,total,mistakes,elapsed_ms,fingerprint)
 VALUES(p->>'id',p->>'player',p->>'region',p->>'scope',coalesce(p->>'challenge','name'),(p->>'correct')::integer,pool_size,(p->>'mistakes')::integer,(p->>'elapsed_ms')::integer,md5(p::text)) RETURNING * INTO saved;
 RETURN to_jsonb(saved)-'fingerprint';
END; $$;
CREATE OR REPLACE FUNCTION public.utilities_geography_scores() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(s)-'fingerprint' ORDER BY s.score DESC,s.correct DESC,s.elapsed_ms,s.finished_at),'[]'::jsonb)
 FROM (SELECT DISTINCT ON(player,region,scope,challenge) * FROM ledger_private.geography_scores ORDER BY player,region,scope,challenge,score DESC,correct DESC,elapsed_ms,finished_at) s;
$$;
REVOKE ALL ON FUNCTION public.utilities_save_geography_score(jsonb),public.utilities_geography_scores() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.utilities_save_geography_score(jsonb),public.utilities_geography_scores() TO anon,authenticated,service_role;
CREATE FUNCTION public.utilities_geography_score_modes() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT '["name","find"]'::jsonb; $$;
REVOKE ALL ON FUNCTION public.utilities_geography_score_modes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.utilities_geography_score_modes() TO anon,authenticated,service_role;
COMMIT;
