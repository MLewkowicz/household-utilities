-- Immutable online content releases. Existing attempts retain both slot and version.
BEGIN;
ALTER TABLE ledger_private.trivia_packs DROP CONSTRAINT trivia_packs_slot_check;
ALTER TABLE ledger_private.trivia_packs ADD CONSTRAINT trivia_packs_slot_check CHECK(slot BETWEEN 0 AND 365);
CREATE TABLE ledger_private.trivia_catalog_releases(
 version integer PRIMARY KEY,
 fingerprint text NOT NULL UNIQUE,
 manifest jsonb NOT NULL,
 installed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ledger_private.trivia_catalog_releases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ledger_private.trivia_catalog_releases FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.utilities_trivia_import(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g jsonb;pack jsonb;q jsonb;card jsonb;previous_year integer;year integer;
 v integer;v_fingerprint text;slot integer;total integer:=0;game text;
BEGIN
 IF p->>'schema' IS DISTINCT FROM '1' OR p->>'provider' IS DISTINCT FROM 'wikidata'
  OR jsonb_typeof(p->'games') IS DISTINCT FROM 'array' OR length(p::text)>8000000
  OR p->'catalog'->>'license' IS DISTINCT FROM 'CC0-1.0' THEN RAISE EXCEPTION 'Invalid catalog envelope';END IF;
 IF jsonb_array_length(p->'games')<>2 OR
  (SELECT count(DISTINCT x->>'game') FROM jsonb_array_elements(p->'games') x)<>2 THEN RAISE EXCEPTION 'Incomplete catalog';END IF;
 v_fingerprint:=md5((p->'games')::text);
 PERFORM pg_advisory_xact_lock(hashtext('trivia-catalog-import'));
 SELECT r.version INTO v FROM ledger_private.trivia_catalog_releases r WHERE r.fingerprint=v_fingerprint;
 IF FOUND THEN RETURN jsonb_build_object('version',v,'changed',false);END IF;
 IF EXISTS(SELECT 1 FROM ledger_private.trivia_catalog_releases WHERE (manifest->>'fetchedAt')::timestamptz>(p->'catalog'->>'fetchedAt')::timestamptz) THEN RAISE EXCEPTION 'Stale catalog; fetch a fresh candidate';END IF;
 SELECT greatest(coalesce(max(version),4),4)+1 INTO v FROM ledger_private.trivia_packs;
 FOR g IN SELECT value FROM jsonb_array_elements(p->'games') LOOP
  game:=g->>'game';slot:=0;
  IF game IS NULL OR game NOT IN ('before-or-after','passport-puzzle') OR jsonb_typeof(g->'packs') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid catalog game';END IF;
  IF jsonb_array_length(g->'packs') NOT BETWEEN 30 AND 366 THEN RAISE EXCEPTION 'Invalid catalog size';END IF;
  FOR pack IN SELECT value FROM jsonb_array_elements(g->'packs') LOOP
   IF jsonb_typeof(pack) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid pack';END IF;
   IF jsonb_array_length(pack)<>(CASE WHEN game='before-or-after' THEN 1 ELSE 5 END) THEN RAISE EXCEPTION 'Incomplete pack';END IF;
   FOR q IN SELECT value FROM jsonb_array_elements(pack) LOOP
    IF coalesce(length(q->>'id'),0)=0 OR q->>'version' IS DISTINCT FROM '5' OR coalesce(length(q->>'explanation'),0)=0
      OR jsonb_typeof(q->'sources') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Missing question provenance';END IF;
    IF jsonb_array_length(q->'sources')=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(q->'sources') s WHERE s !~ '^https://www[.]wikidata[.]org/wiki/Q[0-9]+$') THEN RAISE EXCEPTION 'Invalid question sources';END IF;
    IF game='before-or-after' THEN
     IF q->>'kind' IS DISTINCT FROM 'timeline' OR jsonb_typeof(q->'cards') IS DISTINCT FROM 'array'
      OR jsonb_typeof(q->'answer') IS DISTINCT FROM 'array' OR jsonb_typeof(q->'reveal') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid timeline';END IF;
     IF jsonb_array_length(q->'cards')<>5 OR jsonb_array_length(q->'answer')<>5
      OR (SELECT count(DISTINCT c->>'id') FROM jsonb_array_elements(q->'cards') c)<>5
      OR (SELECT count(DISTINCT a) FROM jsonb_array_elements_text(q->'answer') a)<>5 THEN RAISE EXCEPTION 'Invalid timeline cards';END IF;
     previous_year:=NULL;
     FOR card IN SELECT value FROM jsonb_array_elements(q->'answer') LOOP
      IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(q->'cards') c WHERE c->'id'=card)
       OR coalesce(q->'reveal'->>(card#>>'{}'),'') !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'Invalid timeline answer';END IF;
      year:=(q->'reveal'->>(card#>>'{}'))::integer;
      IF previous_year IS NOT NULL AND previous_year>=year THEN RAISE EXCEPTION 'Ambiguous timeline dates';END IF;
      previous_year:=year;
     END LOOP;
    ELSE
     IF q->>'kind' IS DISTINCT FROM 'clues' OR jsonb_typeof(q->'clues') IS DISTINCT FROM 'array'
      OR jsonb_typeof(q->'answer') IS DISTINCT FROM 'string' OR coalesce(length(q->>'answer'),0)=0
      OR coalesce(q->'outline'->>'path','') !~ '^M[0-9., MLZ-]+$' THEN RAISE EXCEPTION 'Invalid country question';END IF;
     IF jsonb_array_length(q->'clues')<>4 THEN RAISE EXCEPTION 'Incomplete clues';END IF;
    END IF;
   END LOOP;
   INSERT INTO ledger_private.trivia_packs(game,slot,version,questions) VALUES(game,slot,v,pack);
   slot:=slot+1;total:=total+1;
  END LOOP;
 END LOOP;
 INSERT INTO ledger_private.trivia_catalog_releases VALUES(v,v_fingerprint,p->'catalog',now());
 RETURN jsonb_build_object('version',v,'changed',true,'packs',total);
END;$$;
REVOKE ALL ON FUNCTION public.utilities_trivia_import(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.utilities_trivia_import(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.utilities_trivia_start(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a ledger_private.trivia_attempts;d date:=(now() AT TIME ZONE 'America/New_York')::date;s integer;v integer;n integer;
BEGIN
 IF coalesce(p->>'player','') NOT IN ('michal','rina','ohm','rohil') THEN RAISE EXCEPTION 'Choose a household player for Daily';END IF;
 PERFORM pg_advisory_xact_lock(hashtext('trivia:'||(p->>'game')||':'||d::text));
 -- Preserve the actual slot too: new releases can contain more days than old ones.
 SELECT slot,version INTO s,v FROM ledger_private.trivia_attempts WHERE game=p->>'game' AND day=d LIMIT 1;
 IF v IS NULL THEN
  SELECT max(version) INTO v FROM ledger_private.trivia_packs WHERE game=p->>'game';
  IF v IS NULL THEN RAISE EXCEPTION 'Unknown game';END IF;
  SELECT count(*) INTO n FROM ledger_private.trivia_packs WHERE game=p->>'game' AND version=v;
  SELECT slot INTO s FROM ledger_private.trivia_packs WHERE game=p->>'game' AND version=v
   ORDER BY slot OFFSET (((d-DATE '2026-11-09')%n+n)%n) LIMIT 1;
 END IF;
 INSERT INTO ledger_private.trivia_attempts(player,game,day,slot,version) VALUES(p->>'player',p->>'game',d,s,v) ON CONFLICT(player,game,day) DO NOTHING;
 SELECT * INTO a FROM ledger_private.trivia_attempts WHERE player=p->>'player' AND game=p->>'game' AND day=d;
 RETURN ledger_private.trivia_state(a);
END;$$;
CREATE OR REPLACE FUNCTION public.utilities_trivia_capabilities() RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('version',5,'games',5,'groups',true,'size_objects',32,'online_sync',true);
$$;
CREATE FUNCTION ledger_private.trivia_online_catalog_version() RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT 1;$$;
COMMIT;
