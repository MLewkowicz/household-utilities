// Author the reviewed Passport replacement once; preserve all installed releases.
import {readFile,writeFile} from 'node:fs/promises';
import {buildRelease,readJSON,passportFacts} from './online/catalog.mjs';
const root=new URL('../../',import.meta.url),migration=new URL('supabase/migrations/045_passport_culture_catalog.sql',root);
try{await readFile(migration);throw new Error('Migration 045 already exists; use a new release to revise installed content.');}
catch(error){if(error.code!=='ENOENT')throw error;}
const catalog=await readJSON(new URL('.local/game-sync/catalog.json',root));
// Keep the reviewed wording in sync with the resolved source records.
for(const fact of catalog.passportFacts){const reviewed=passportFacts.find(f=>f.country===fact.country&&f.title===fact.title);if(!reviewed)throw new Error('Unreviewed country fact');fact.text=reviewed.text;}
const {release,practice}=buildRelease(catalog,await readJSON(new URL('src/geography-data.json',root)));
await writeFile(new URL('scripts/trivia/online/catalog.json',root),JSON.stringify(catalog,null,2)+'\n');
await writeFile(new URL('src/trivia/passport-puzzle.json',root),JSON.stringify(practice['passport-puzzle'],null,2)+'\n');
await writeFile(new URL('src/trivia/before-or-after-online.json',root),JSON.stringify(practice['before-or-after'],null,2)+'\n');
const quote=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb";
let sql=`-- Contextual culture, sport and history clues; retain all previously pinned attempts.\nBEGIN;\nSELECT public.utilities_trivia_import(${quote(release)});\n`;
const groups=new Map();
for(const q of practice['passport-puzzle']){if(!groups.has(q.answer))groups.set(q.answer,[]);groups.get(q.answer).push(q);}
const countries=[...groups.values()];
// Five different countries per starter, cycling through each country's clue pairs.
for(let slot=0;slot<10;slot++){
 const questions=Array.from({length:5},(_,i)=>{const index=slot*5+i,bank=countries[index%countries.length];return bank[Math.floor(index/countries.length)%bank.length];});
 sql+=`UPDATE ledger_private.game_starter_packs SET questions=${quote(questions)} WHERE game='passport-puzzle' AND slot=${slot+1};\n`;
}
sql+="CREATE FUNCTION ledger_private.passport_editorial_version() RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT 2;$$;\nCREATE OR REPLACE FUNCTION public.utilities_trivia_capabilities() RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$ SELECT jsonb_build_object('version',6,'games',7,'groups',true,'size_objects',59,'online_sync',true,'online_seed',1,'archive',true,'grid_puzzles',true,'photo_silhouettes',true,'passport_editorial',2);$$;\nCOMMIT;\n";
await writeFile(migration,sql);
console.log('Prepared 90 contextual Passport dailies and ten distinct-country starters. No database writes.');
