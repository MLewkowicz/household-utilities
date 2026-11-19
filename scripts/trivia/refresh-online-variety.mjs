// Prepare a new release from the reviewed, frozen source catalog. No network or database writes.
import {readFile,writeFile} from 'node:fs/promises';
import {buildRelease} from './online/catalog.mjs';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const {release,practice}=buildRelease(await read('scripts/trivia/online/catalog.json'),await read('src/geography-data.json'));
const passport=[...new Map([...practice['passport-puzzle'],...release.games.find(g=>g.game==='passport-puzzle').packs.flat()].map(q=>[q.answer,q])).values()];
await writeFile('src/trivia/passport-puzzle.json',JSON.stringify(passport,null,2)+'\n');
await writeFile('src/trivia/before-or-after-online.json',JSON.stringify(practice['before-or-after'],null,2)+'\n');
const quote=v=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
let sql=await readFile('supabase/migrations/054_games_variety.sql','utf8');
if(sql.includes('-- Online variety release'))throw new Error('Run refresh-variety.py first; do not append this release twice.');
let additions=`-- Online variety release\nSELECT public.utilities_trivia_import(${quote(release)});\n`;
for(let slot=0;slot<10;slot++)additions+=`UPDATE ledger_private.game_starter_packs SET questions=${quote(passport.slice(slot*5,slot*5+5))} WHERE game='passport-puzzle' AND slot=${slot+1};\n`;
if(passport.length<50)throw new Error('Need fifty distinct destinations');
await writeFile('supabase/migrations/054_games_variety.sql',sql.replace('COMMIT;',additions+'COMMIT;'));
console.log(`${passport.length} distinct Passport destinations; refreshed history-heavy daily timelines.`);
