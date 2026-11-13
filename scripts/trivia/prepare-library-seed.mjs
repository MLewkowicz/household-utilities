import {readFile,writeFile,access} from 'node:fs/promises';
const path='supabase/migrations/043_game_library_seed.sql';
try{await access(path);throw new Error('The initial library seed already exists. Do not rewrite installed migrations.');}catch(error){if(error.code!=='ENOENT')throw error;}
const games=['odd-one-out','passport-puzzle','clue-cascade','before-or-after','how-much-ish','sudoku','crossword'];
const json=async path=>JSON.parse(await readFile(path,'utf8')),quote=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb";
let sql='-- Original grid games and ten stable starters per game.\nBEGIN;\n';
for(const game of games){
 let bank=await json(`src/trivia/${game}.json`);if(game==='before-or-after')bank.push(...await json(`src/trivia/${game}-online.json`));
 const count=['before-or-after','clue-cascade','sudoku','crossword'].includes(game)?1:5;
 for(let slot=1;slot<=10;slot++){const questions=Array.from({length:count},(_,i)=>bank[((slot-1)*(count===5?3:1)+i)%bank.length]);sql+=`INSERT INTO ledger_private.game_starter_packs VALUES('${game}',${slot},${quote(questions)});\n`;}
 if(game==='sudoku'||game==='crossword')for(const [slot,pack] of (await json(`scripts/trivia/${game}-daily.json`)).entries())sql+=`INSERT INTO ledger_private.trivia_packs(game,slot,version,questions) VALUES('${game}',${slot},6,${quote(pack)});\n`;
}
sql+="CREATE FUNCTION ledger_private.game_library_seed_version() RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT 1;$$;\nCOMMIT;\n";
await writeFile(path,sql);console.log('Prepared ten starters for seven games and 270 original daily grid puzzles.');
