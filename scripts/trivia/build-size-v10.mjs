import {readFile,writeFile} from 'node:fs/promises';
const collections=JSON.parse(await readFile('src/trivia/size-collections.json','utf8'));
const daily=JSON.parse(await readFile('scripts/trivia/size-daily-v10.json','utf8'));
const sqlJson=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb";
let sql=`-- New size catalog and category shelves. Existing attempts and archive records retain their own questions.
BEGIN;
CREATE TABLE ledger_private.size_category_packs(entry text PRIMARY KEY,category text NOT NULL CHECK(category IN ('classic','pop-culture','geography')),slot integer NOT NULL CHECK(slot BETWEEN 1 AND 10),questions jsonb NOT NULL,UNIQUE(category,slot));
ALTER TABLE ledger_private.size_category_packs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ledger_private.size_category_packs FROM PUBLIC,anon,authenticated;
`;
for(const [category,questions] of Object.entries(collections))for(let slot=1;slot<=10;slot++){
 const pack=questions.slice((slot-1)*5,slot*5);if(pack.length!==5)throw new Error('Incomplete size practice board');
 sql+=`INSERT INTO ledger_private.size_category_packs VALUES('size-${category}-${slot}','${category}',${slot},${sqlJson(pack)});\n`;
}
daily.forEach((questions,slot)=>{if(questions.length!==5)throw new Error('Incomplete daily board');sql+=`INSERT INTO ledger_private.trivia_packs(game,slot,version,questions) VALUES('how-much-ish',${slot},10,${sqlJson(questions)});\n`;});
sql+=`
ALTER FUNCTION public.utilities_game_library(jsonb) SET SCHEMA ledger_private;
ALTER FUNCTION ledger_private.utilities_game_library(jsonb) RENAME TO game_library_before_size_categories;
REVOKE ALL ON FUNCTION ledger_private.game_library_before_size_categories(jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.utilities_game_library(p jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;extra jsonb;
BEGIN
 result:=ledger_private.game_library_before_size_categories(p);
 IF p->>'game'<>'how-much-ish' THEN RETURN result;END IF;
 SELECT jsonb_agg(jsonb_build_object('entry',c.entry,'day',NULL,'starter',c.slot,'complete',coalesce((s.state->'attempt'->>'complete')::boolean,false),'started',s.entry IS NOT NULL,'score',coalesce((s.state->'attempt'->>'score')::integer,0)) ORDER BY c.category,c.slot) INTO extra
 FROM ledger_private.size_category_packs c LEFT JOIN ledger_private.game_archive_progress s ON s.entry=c.entry AND s.game='how-much-ish' AND s.player=p->>'player';
 RETURN jsonb_set(result,'{entries}',(result->'entries')||coalesce(extra,'[]'::jsonb));
END;$$;

ALTER FUNCTION public.utilities_game_archive(jsonb) SET SCHEMA ledger_private;
ALTER FUNCTION ledger_private.utilities_game_archive(jsonb) RENAME TO game_archive_before_size_categories;
REVOKE ALL ON FUNCTION ledger_private.game_archive_before_size_categories(jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.utilities_game_archive(p jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE pack jsonb;stored ledger_private.game_archive_progress;attempt jsonb;
BEGIN
 IF p->>'game' IS DISTINCT FROM 'how-much-ish' OR coalesce(p->>'entry','') !~ '^size-(classic|pop-culture|geography)-(10|[1-9])$' THEN RETURN ledger_private.game_archive_before_size_categories(p);END IF;
 IF coalesce(p->>'player','') NOT IN ('michal','rina','ohm','rohil') THEN RAISE EXCEPTION 'Choose a household player in Settings';END IF;
 SELECT * INTO stored FROM ledger_private.game_archive_progress WHERE game='how-much-ish' AND player=p->>'player' AND entry=p->>'entry';
 IF FOUND THEN RETURN jsonb_build_object('state',stored.state,'revision',stored.revision);END IF;
 SELECT questions INTO pack FROM ledger_private.size_category_packs WHERE entry=p->>'entry';
 IF pack IS NULL THEN RAISE EXCEPTION 'Unknown size category board';END IF;
 attempt:=jsonb_build_object('id','archive:how-much-ish:'||(p->>'entry'),'game','how-much-ish','player',p->>'player','day',p->>'entry','questions',pack,'answers','[]'::jsonb,'hints','{}'::jsonb,'score',0,'complete',false);
 RETURN jsonb_build_object('state',jsonb_build_object('attempt',attempt,'drafts','{}'::jsonb),'revision',0);
END;$$;
GRANT EXECUTE ON FUNCTION public.utilities_game_library(jsonb),public.utilities_game_archive(jsonb) TO anon,authenticated;
CREATE FUNCTION ledger_private.size_categories_version() RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT 10;$$;
CREATE OR REPLACE FUNCTION public.utilities_trivia_capabilities() RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$ SELECT jsonb_build_object('version',7,'games',7,'groups',true,'size_objects',90,'online_sync',true,'online_seed',1,'archive',true,'grid_puzzles',true,'photo_silhouettes',true,'passport_editorial',2,'timed_grids',true,'size_editorial',10,'size_categories',true);$$;
COMMIT;
`;
await writeFile('supabase/migrations/050_size_categories.sql',sql);
console.log('Built size v10: 30 category practice boards and '+daily.length+' daily mixes.');
