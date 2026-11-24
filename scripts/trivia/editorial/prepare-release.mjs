// One-time authoring tool. Pass a new migration path when preparing a later edition.
import {readFile,writeFile} from 'node:fs/promises';
import {wordPacks} from './word-games.mjs';
import {primarySources} from './timelines.mjs';
import {validateRelease} from '../online/catalog.mjs';

const [candidate,target]=process.argv.slice(2);
if(!candidate||!target)throw new Error('Usage: node prepare-release.mjs release.json new-migration.sql');
const release=JSON.parse(await readFile(candidate,'utf8'));
validateRelease(release);
const quote=s=>"'"+s.replaceAll("'","''")+"'";
const json=v=>quote(JSON.stringify(v))+'::jsonb';

// Retain the structural checks, transaction lock, archive and idempotency semantics
// of the original importer. Extend only its supported envelope and source policy.
const original=await readFile(new URL('../../../supabase/migrations/040_trivia_online_catalog.sql',import.meta.url),'utf8');
let importer=original.slice(original.indexOf('CREATE FUNCTION public.utilities_trivia_import'),original.indexOf('REVOKE ALL ON FUNCTION'));
importer=importer.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION');
const header=importer.indexOf(' IF p->'),end=importer.indexOf(' IF jsonb_array_length',header);
importer=importer.slice(0,header)+` IF NOT (
   (p->>'schema' IS NOT DISTINCT FROM '2' AND p->>'provider' IS NOT DISTINCT FROM 'household-editorial' AND p->'catalog'->>'wikidataLicense' IS NOT DISTINCT FROM 'CC0-1.0')
   OR (p->>'schema' IS NOT DISTINCT FROM '1' AND p->>'provider' IS NOT DISTINCT FROM 'wikidata' AND p->'catalog'->>'license' IS NOT DISTINCT FROM 'CC0-1.0'))
   OR jsonb_typeof(p->'games') IS DISTINCT FROM 'array' OR length(p::text)>8000000 THEN RAISE EXCEPTION 'Invalid catalog envelope';END IF;
`+importer.slice(end);
importer=importer.replace(' IF EXISTS(SELECT 1 FROM ledger_private.trivia_catalog_releases',` IF p->>'schema'='1' THEN RAISE EXCEPTION 'Build a reviewed editorial candidate before installing new content';END IF;
 IF EXISTS(SELECT 1 FROM ledger_private.trivia_catalog_releases`);
importer=importer.replace("WHERE s !~ '^https://www[.]wikidata[.]org/wiki/Q[0-9]+$'", ()=>"WHERE s IS NULL OR (s !~ '^https://www[.]wikidata[.]org/wiki/Q[0-9]+$' AND NOT (game='before-or-after' AND ledger_private.editorial_source(s)))");

const packs=await wordPacks();
const inserts=[];
for(const [game,boards] of Object.entries(packs)){
 for(const [slot,q] of boards.entries())inserts.push(`(${quote(game)},${slot},v,${json(q)})`);
}
const sql=`-- Reviewed daily word boards and mixed-source timelines. Pinned packs remain available.
BEGIN;
CREATE FUNCTION ledger_private.editorial_source(url text) RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path='' AS $$
 SELECT url IN (\n  ${[...primarySources].map(quote).join(',\n  ')}\n );
$$;
REVOKE ALL ON FUNCTION ledger_private.editorial_source(text) FROM PUBLIC,anon,authenticated,service_role;
${importer}
DO $edition$
DECLARE v integer;
BEGIN
 SELECT (public.utilities_trivia_import(${json(release)})->>'version')::integer INTO v;
 INSERT INTO ledger_private.trivia_packs(game,slot,version,questions) VALUES
 ${inserts.join(',\n ')};
END;
$edition$;
CREATE OR REPLACE FUNCTION public.utilities_games_refresh_capabilities() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT '{"passport_penalties":true,"outline_first":true,"historical_scores":true,"average_scores":true,"editorial_rotation":1}'::jsonb;
$$;
COMMIT;
`;
await writeFile(target,sql,{flag:'wx'});
