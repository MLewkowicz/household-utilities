import {readFile,writeFile} from 'node:fs/promises';
const collections=JSON.parse(await readFile('src/trivia/size-collections.json','utf8'));
const daily=JSON.parse(await readFile('scripts/trivia/size-daily-v11.json','utf8'));
const catalog=JSON.parse(await readFile('src/size-catalog.json','utf8'));
const sqlJson=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb";
let sql=`-- Authorized reset of How Much-ish only: all prior attempts, scores, archives and packs.
-- This is a one-time migration. Never rerun it after players start the new catalog.
BEGIN;
LOCK TABLE ledger_private.trivia_attempts,ledger_private.trivia_packs,ledger_private.game_pack_versions,ledger_private.game_starter_packs,ledger_private.game_archive_progress,ledger_private.size_category_packs IN ACCESS EXCLUSIVE MODE;
DELETE FROM ledger_private.trivia_attempts WHERE game='how-much-ish';
DELETE FROM ledger_private.game_archive_progress WHERE game='how-much-ish';
DELETE FROM ledger_private.game_starter_packs WHERE game='how-much-ish';
DELETE FROM ledger_private.trivia_packs WHERE game='how-much-ish';
DELETE FROM ledger_private.game_pack_versions WHERE game='how-much-ish';
DELETE FROM ledger_private.size_category_packs;
ALTER TABLE ledger_private.size_category_packs DROP CONSTRAINT size_category_packs_slot_check;
ALTER TABLE ledger_private.size_category_packs ADD CONSTRAINT size_category_packs_slot_check CHECK(slot BETWEEN 1 AND 30);
`;
for(const [category,questions] of Object.entries(collections))for(let slot=1;slot<=30;slot++){
 const pack=questions.slice((slot-1)*5,slot*5);if(pack.length!==5||pack.some(q=>q.version!==11))throw new Error('Incomplete size v11 practice board');
 sql+=`INSERT INTO ledger_private.size_category_packs VALUES('size-v11-${category}-${slot}','${category}',${slot},${sqlJson(pack)});\n`;
}
if(daily.length!==180)throw new Error('Expected 180 daily mixes');
daily.forEach((questions,slot)=>{if(questions.length!==5||questions.some(q=>q.version!==11)||new Set(questions.map(q=>q.category)).size!==3)throw new Error('Incomplete daily mix');sql+=`INSERT INTO ledger_private.trivia_packs(game,slot,version,questions) VALUES('how-much-ish',${slot},11,${sqlJson(questions)});\n`;});
sql+=`
-- Stale tabs must reload; they cannot recreate the retired shelves or daily attempts.
CREATE FUNCTION ledger_private.require_size_catalog(p jsonb) RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
 IF p->>'game'='how-much-ish' AND p->>'size_version' IS DISTINCT FROM '11' THEN RAISE EXCEPTION 'How Much-ish has a new catalog. Reload the site to start fresh.';END IF;
END;$$;
REVOKE ALL ON FUNCTION ledger_private.require_size_catalog(jsonb) FROM PUBLIC,anon,authenticated,service_role;

ALTER FUNCTION public.utilities_trivia_start(jsonb) SET SCHEMA ledger_private;
ALTER FUNCTION ledger_private.utilities_trivia_start(jsonb) RENAME TO trivia_start_before_size_reset;
REVOKE ALL ON FUNCTION ledger_private.trivia_start_before_size_reset(jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.utilities_trivia_start(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM ledger_private.require_size_catalog(p);
 RETURN ledger_private.trivia_start_before_size_reset(p);
END;$$;

ALTER FUNCTION public.utilities_game_library(jsonb) SET SCHEMA ledger_private;
ALTER FUNCTION ledger_private.utilities_game_library(jsonb) RENAME TO game_library_before_size_reset;
REVOKE ALL ON FUNCTION ledger_private.game_library_before_size_reset(jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.utilities_game_library(p jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;entries jsonb;
BEGIN
 PERFORM ledger_private.require_size_catalog(p);
 result:=ledger_private.game_library_before_size_reset(p);
 IF p->>'game'='how-much-ish' THEN
  SELECT coalesce(jsonb_agg(e.value ORDER BY e.ordinality),'[]'::jsonb) INTO entries FROM jsonb_array_elements(result->'entries') WITH ORDINALITY e(value,ordinality) WHERE e.value->>'entry' NOT LIKE 'starter-%';
  result:=jsonb_set(result,'{entries}',entries);
 END IF;
 RETURN result;
END;$$;

-- Derive canonical questions independently of saved client state.
CREATE FUNCTION ledger_private.size_pack_for_entry(p jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE v_entry text:=p->>'entry';chosen date;first_day date;s integer;v integer;n integer;pack jsonb;
BEGIN
 IF coalesce(p->>'player','') NOT IN ('michal','rina','ohm','rohil') THEN RAISE EXCEPTION 'Choose a household player in Settings';END IF;
 IF coalesce(v_entry,'') ~ '^size-v11-(classic|pop-culture|geography)-(30|[12][0-9]|[1-9])$' THEN
  SELECT questions INTO pack FROM ledger_private.size_category_packs WHERE size_category_packs.entry=v_entry;
 ELSIF coalesce(v_entry,'') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
  chosen:=v_entry::date;
  SELECT min(available_from) INTO first_day FROM ledger_private.game_pack_versions WHERE game='how-much-ish';
  IF chosen<first_day OR chosen>=(now() AT TIME ZONE 'America/New_York')::date THEN RAISE EXCEPTION 'Only past dailies from the new size catalog are available';END IF;
  SELECT slot,version INTO s,v FROM ledger_private.trivia_attempts WHERE game='how-much-ish' AND day=chosen LIMIT 1;
  IF v IS NULL THEN
   SELECT max(version) INTO v FROM ledger_private.game_pack_versions WHERE game='how-much-ish' AND available_from<=chosen;
   SELECT count(*) INTO n FROM ledger_private.trivia_packs WHERE game='how-much-ish' AND version=v;
   IF n>0 THEN SELECT slot INTO s FROM ledger_private.trivia_packs WHERE game='how-much-ish' AND version=v ORDER BY slot OFFSET (((chosen-DATE '2026-11-09')%n+n)%n) LIMIT 1;END IF;
  END IF;
  SELECT questions INTO pack FROM ledger_private.trivia_packs WHERE game='how-much-ish' AND slot=s AND version=v;
 ELSE RAISE EXCEPTION 'This size board has been retired. Choose a new board.';
 END IF;
 IF pack IS NULL THEN RAISE EXCEPTION 'Unknown size board';END IF;
 RETURN pack;
END;$$;
REVOKE ALL ON FUNCTION ledger_private.size_pack_for_entry(jsonb) FROM PUBLIC,anon,authenticated,service_role;

ALTER FUNCTION public.utilities_game_archive(jsonb) SET SCHEMA ledger_private;
ALTER FUNCTION ledger_private.utilities_game_archive(jsonb) RENAME TO game_archive_before_size_reset;
REVOKE ALL ON FUNCTION ledger_private.game_archive_before_size_reset(jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.utilities_game_archive(p jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE pack jsonb;stored ledger_private.game_archive_progress;attempt jsonb;
BEGIN
 IF p->>'game' IS DISTINCT FROM 'how-much-ish' THEN RETURN ledger_private.game_archive_before_size_reset(p);END IF;
 PERFORM ledger_private.require_size_catalog(p);
 pack:=ledger_private.size_pack_for_entry(p);
 IF p->>'entry' NOT LIKE 'size-v11-%' THEN RETURN ledger_private.game_archive_before_size_reset(p);END IF;
 SELECT * INTO stored FROM ledger_private.game_archive_progress WHERE game='how-much-ish' AND player=p->>'player' AND entry=p->>'entry';
 IF FOUND THEN RETURN jsonb_build_object('state',stored.state,'revision',stored.revision);END IF;
 attempt:=jsonb_build_object('id','archive:how-much-ish:'||(p->>'entry'),'game','how-much-ish','player',p->>'player','day',p->>'entry','questions',pack,'answers','[]'::jsonb,'hints','{}'::jsonb,'score',0,'complete',false);
 RETURN jsonb_build_object('state',jsonb_build_object('attempt',attempt,'drafts','{}'::jsonb),'revision',0);
END;$$;

ALTER FUNCTION public.utilities_game_archive_save(jsonb) SET SCHEMA ledger_private;
ALTER FUNCTION ledger_private.utilities_game_archive_save(jsonb) RENAME TO game_archive_save_before_size_reset;
REVOKE ALL ON FUNCTION ledger_private.game_archive_save_before_size_reset(jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.utilities_game_archive_save(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM ledger_private.require_size_catalog(p);
 IF p->>'game'='how-much-ish' THEN
  IF p->'state'->'attempt'->>'id' IS DISTINCT FROM ('archive:how-much-ish:'||(p->>'entry')) OR p->'state'->'attempt'->'questions' IS DISTINCT FROM ledger_private.size_pack_for_entry(p) THEN RAISE EXCEPTION 'This size board has changed. Reopen it to continue.';END IF;
 END IF;
 RETURN ledger_private.game_archive_save_before_size_reset(p);
END;$$;
REVOKE ALL ON FUNCTION public.utilities_trivia_start(jsonb),public.utilities_game_library(jsonb),public.utilities_game_archive(jsonb),public.utilities_game_archive_save(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.utilities_trivia_start(jsonb),public.utilities_game_library(jsonb),public.utilities_game_archive(jsonb),public.utilities_game_archive_save(jsonb) TO anon,authenticated,service_role;
CREATE FUNCTION ledger_private.size_catalog_reset_version() RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT 11;$$;
CREATE OR REPLACE FUNCTION public.utilities_trivia_capabilities() RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$ SELECT jsonb_build_object('version',7,'games',7,'groups',true,'size_objects',${Object.keys(catalog).length},'online_sync',true,'online_seed',1,'archive',true,'grid_puzzles',true,'photo_silhouettes',false,'passport_editorial',2,'timed_grids',true,'size_editorial',11,'size_categories',true,'size_history_version',11);$$;
NOTIFY pgrst,'reload schema';
COMMIT;
`;
await writeFile('supabase/migrations/052_size_catalog_reset.sql',sql);
console.log('Built size v11 reset: 90 practice boards, 180 daily mixes, '+Object.keys(catalog).length+' silhouettes.');
