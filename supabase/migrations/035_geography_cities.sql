BEGIN;
ALTER TABLE ledger_private.geography_catalog ADD COLUMN has_city boolean NOT NULL DEFAULT false;
UPDATE ledger_private.geography_catalog SET has_city=true WHERE id IN ('AFG','ALB','DZA','ASM','AND','AGO','AIA','ATG','ARG','ARM','ABW','AUS','AUT','AZE','BHR','BGD','BRB','BLR','BEL','BLZ','BEN','BMU','BTN','BOL','BIH','BWA','BRA','VGB','BRN','BGR','BFA','BDI','KHM','CMR','CAN','CPV','CYM','CAF','TCD','CHL','COL','COM','COK','CRI','HRV','CUB','CUW','CYP','CZE','COD','DNK','DJI','DMA','DOM','TLS','ECU','EGY','SLV','ERI','EST','SWZ','ETH','FLK','FRO','FSM','FJI','FIN','FRA','PYF','GAB','GEO','DEU','GHA','GRC','GRL','GRD','GUM','GTM','GGY','GIN','GNB','GUY','HTI','HND','HUN','ISL','IND','IDN','IRN','IRQ','IRL','IMN','ISR','ITA','CIV','JAM','JPN','JEY','JOR','KAZ','KEN','KIR','KOS','KWT','KGZ','LAO','LVA','LBN','LSO','LBR','LBY','LIE','LTU','LUX','MDG','MWI','MYS','MDV','MLI','MLT','MHL','MRT','MUS','MEX','MDA','MCO','MNG','MNE','MSR','MAR','MOZ','MMR','NAM','NPL','NLD','NCL','NZL','NIC','NER','NGA','NIU','NFK','PRK','MKD','MNP','NOR','OMN','PAK','PLW','PAN','PNG','PRY','CHN','PER','PHL','PCN','POL','PRT','PRI','QAT','COG','ROU','RUS','RWA','BLM','SHN','KNA','LCA','MAF','SPM','VCT','WSM','SMR','SAU','SEN','SRB','SYC','SLE','SGP','SXM','SVK','SVN','SLB','SOM','SOL','ZAF','KOR','SDS','ESP','LKA','SDN','SUR','SWE','CHE','SYR','STP','TWN','TJK','TZA','THA','BHS','GMB','TGO','TON','TTO','TUN','TKM','TCA','TUV','TUR','UGA','UKR','ARE','GBR','VIR','USA','URY','UZB','VUT','VAT','VEN','VNM','WLF','YEM','ZMB','ZWE','ALD','CYN','GNQ');
ALTER TABLE ledger_private.geography_scores DROP CONSTRAINT geography_scores_challenge_check;
ALTER TABLE ledger_private.geography_scores ADD CONSTRAINT geography_scores_challenge_check CHECK(challenge IN ('name','find','capitals','cities'));
CREATE OR REPLACE FUNCTION public.utilities_save_geography_score(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE prior ledger_private.geography_scores; saved ledger_private.geography_scores; pool_size integer;
BEGIN
 IF coalesce(p->>'id','') !~ '^[a-zA-Z0-9_-]{16,100}$' THEN RAISE EXCEPTION 'Invalid round identifier'; END IF;
 IF coalesce(p->>'player','') NOT IN ('michal','rina','ohm','rohil') THEN RAISE EXCEPTION 'Choose a household player'; END IF;
 IF coalesce(p->>'scope','') NOT IN ('countries','expanded') THEN RAISE EXCEPTION 'Choose a country set'; END IF;
 IF coalesce(p->>'challenge','name') NOT IN ('name','find','capitals','cities') THEN RAISE EXCEPTION 'Choose a quiz challenge'; END IF;
 IF coalesce(p->>'region','') NOT IN ('World','Africa','Asia','Europe','North America','South America','Oceania','Micronesia','Polynesia','Melanesia','Caribbean','Central America') THEN RAISE EXCEPTION 'Choose a quiz region'; END IF;
 SELECT count(*) INTO pool_size FROM ledger_private.geography_catalog c WHERE (p->>'region'='World' OR c.continent=p->>'region' OR c.region=p->>'region') AND (p->>'scope'='expanded' OR c.official) AND (coalesce(p->>'challenge','name')<>'capitals' OR c.has_capital) AND (coalesce(p->>'challenge','name')<>'cities' OR c.has_city);
 IF (p->>'total')::integer IS DISTINCT FROM pool_size THEN RAISE EXCEPTION 'Country set has changed. Start a new round'; END IF;
 IF coalesce(p->>'challenge','name') IN ('find','cities') AND (p->>'correct')::integer+(p->>'mistakes')::integer>pool_size THEN RAISE EXCEPTION 'Each country can only be attempted once'; END IF;
 IF NOT (coalesce(p->>'challenge','name') IN ('find','cities') AND (p->>'correct')::integer+(p->>'mistakes')::integer=pool_size) AND (p->>'correct')::integer IS DISTINCT FROM pool_size AND (p->>'mistakes')::integer IS DISTINCT FROM 3 AND (p->>'elapsed_ms')::integer IS DISTINCT FROM 300000 THEN RAISE EXCEPTION 'Finish the competitive round before saving'; END IF;
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
CREATE OR REPLACE FUNCTION public.utilities_geography_score_modes() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT '["name","find","capitals","cities"]'::jsonb;$$;
CREATE FUNCTION ledger_private.geography_cities_version() RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT 1;$$;
COMMIT;
