// Author the initial baseline once. Later online releases use the import RPC;
// never overwrite this migration after it has shipped.
import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {buildRelease,readJSON} from './online/catalog.mjs';
const root=new URL('../../',import.meta.url),migration=new URL('supabase/migrations/041_trivia_online_seed.sql',root);
try{await readFile(migration);throw new Error('Migration 041 already exists; released seed content must stay immutable.');}
catch(error){if(error.code!=='ENOENT')throw error;}
const catalog=await readJSON(new URL('.local/game-sync/catalog.json',root));
const {release,practice}=buildRelease(catalog,await readJSON(new URL('src/geography-data.json',root)));
await copyFile(new URL('.local/game-sync/catalog.json',root),new URL('scripts/trivia/online/catalog.json',root));
for(const [game,bank] of Object.entries(practice))await writeFile(new URL(`src/trivia/${game}-online.json`,root),JSON.stringify(bank,null,2)+'\n');
await writeFile(migration,`-- Initial frozen Wikidata catalog; future syncs append immutable releases via the import RPC.\nBEGIN;\nSELECT public.utilities_trivia_import('${JSON.stringify(release).replaceAll("'","''")}'::jsonb);\nCREATE FUNCTION ledger_private.trivia_online_seed_version() RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT 1;$$;\nCREATE OR REPLACE FUNCTION public.utilities_trivia_capabilities() RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$ SELECT '{"version":5,"games":5,"groups":true,"size_objects":32,"online_sync":true,"online_seed":1}'::jsonb;$$;\nCOMMIT;\n`);
console.log('Authored migration 041 and frozen practice banks. No database writes.');
