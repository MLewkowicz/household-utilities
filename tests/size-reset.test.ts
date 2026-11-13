import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {callRpc} from '../scripts/database.mjs';
import {retireSizeHistory} from '../src/size-history';

test('the size reset removes every player’s history and current daily, preserves other games, and blocks resurrection',async()=>{
 const db=new PGlite();await db.waitReady;
 try{
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')&&f<'052').sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  const players=['michal','rina','ohm','rohil'],oldIds:string[]=[];
  const other=await callRpc(db,'trivia_start',{p:{game:'sudoku',player:'rina',clock_version:1}});
  const otherArchive=await callRpc(db,'game_archive',{p:{game:'before-or-after',player:'ohm',entry:'starter-3'}});
  otherArchive.state.drafts['0']=['keep-this-draft'];
  await callRpc(db,'game_archive_save',{p:{game:'before-or-after',player:'ohm',entry:'starter-3',state:otherArchive.state,revision:0}});
  for(const player of players){
   const p={game:'how-much-ish',player};
   const a=await callRpc(db,'trivia_start',{p});oldIds.push(a.id);
   await db.query("UPDATE ledger_private.trivia_attempts SET score=600,answers='[{},{},{}]'::jsonb WHERE id=$1",[a.id]);
   for(const entry of ['starter-1','size-classic-1','size-pop-culture-3','size-geography-10']){
    const b=await callRpc(db,'game_archive',{p:{...p,entry}});b.state.attempt.score=1000;b.state.attempt.complete=true;
    await callRpc(db,'game_archive_save',{p:{...p,entry,state:b.state,revision:0}});
   }
  }
  await db.exec("INSERT INTO ledger_private.trivia_attempts(player,game,day,slot,version,score) SELECT player,'how-much-ish',(now() AT TIME ZONE 'America/New_York')::date-1,0,9,400 FROM unnest(ARRAY['michal','rina','ohm','rohil']) player");
  const before=async()=>({attempts:(await db.query("SELECT to_jsonb(a) AS data FROM ledger_private.trivia_attempts a WHERE game<>'how-much-ish' ORDER BY id")).rows,archives:(await db.query("SELECT to_jsonb(a) AS data FROM ledger_private.game_archive_progress a WHERE game<>'how-much-ish' ORDER BY player,game,entry")).rows});
  const kept=await before();
  await db.exec(await readFile('supabase/migrations/052_size_catalog_reset.sql','utf8'));
  assert.deepEqual(await before(),kept);
  for(const table of ['trivia_attempts','game_archive_progress','game_starter_packs'])assert.equal((await db.query(`SELECT count(*) AS n FROM ledger_private.${table} WHERE game='how-much-ish'`)).rows[0].n,0,table);
  assert.deepEqual((await db.query("SELECT DISTINCT version FROM ledger_private.trivia_packs WHERE game='how-much-ish'")).rows,[{version:11}]);
  for(const period of ['day','week','all'])assert.deepEqual(await callRpc(db,'trivia_scores',{p:{game:'how-much-ish',period}}),[]);
  for(const player of players){
   const p={game:'how-much-ish',player,size_version:11};
   const library=await callRpc(db,'game_library',{p});assert.equal(library.entries.length,90);assert.ok(library.entries.every((e:any)=>e.entry.startsWith('size-v11-')&&!e.started&&!e.complete&&e.score===0));
   assert.ok((await callRpc(db,'trivia_export',{p:{player}})).every((a:any)=>a.game!=='how-much-ish'));
   await assert.rejects(callRpc(db,'trivia_start',{p:{game:p.game,player}}),/Reload/);
   await assert.rejects(callRpc(db,'trivia_action',{p:{id:oldIds[players.indexOf(player)],player,index:3,action:'answer',answer:1}}),/unavailable/);
   for(const entry of ['starter-1','size-classic-1','legacy','2026-11-09'])await assert.rejects(callRpc(db,'game_archive',{p:{...p,entry}}),/retired|new size catalog/);
   const entry='size-v11-classic-30',b=await callRpc(db,'game_archive',{p:{...p,entry}});
   const stale=structuredClone(b.state);stale.attempt.questions[0].version=10;
   await assert.rejects(callRpc(db,'game_archive_save',{p:{...p,entry,state:stale,revision:0}}),/changed/);
   await assert.rejects(callRpc(db,'game_archive_save',{p:{game:p.game,player,entry,state:b.state,revision:0}}),/Reload/);
  }
  const p={game:'how-much-ish',player:'michal',size_version:11};
  const daily=await callRpc(db,'trivia_start',{p}),roommate=await callRpc(db,'trivia_start',{p:{...p,player:'rina'}});
  assert.equal(daily.version,11);assert.ok(!oldIds.includes(daily.id));assert.deepEqual(daily.questions,roommate.questions);assert.equal(daily.score,0);assert.equal(new Set(daily.questions.map((q:any)=>q.category)).size,3);
  assert.equal((await callRpc(db,'trivia_start',{p:{game:'sudoku',player:'rina',clock_version:1}})).id,other.id);
  // Once a new daily becomes historical, it can be reopened and saved normally.
  await db.exec("UPDATE ledger_private.game_pack_versions SET available_from=available_from-1 WHERE game='how-much-ish'; UPDATE ledger_private.trivia_attempts SET day=day-1 WHERE game='how-much-ish'");
  const day=(await db.query("SELECT day::text AS day FROM ledger_private.trivia_attempts WHERE id=$1",[daily.id])).rows[0].day;
  const past=await callRpc(db,'game_archive',{p:{...p,entry:day}});past.state.drafts['0']=.75;
  assert.equal((await callRpc(db,'game_archive_save',{p:{...p,entry:day,state:past.state,revision:0}})).revision,1);
  assert.ok((await callRpc(db,'game_library',{p})).entries.some((e:any)=>e.entry===day));
  await assert.rejects(db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE anon');await tx.query('SELECT ledger_private.trivia_start_before_size_reset($1::jsonb)',['{}']);}),/permission denied/);
 }finally{await db.close();}
});

test('local reset clears old size data across identities and versions while keeping new progress and other games',()=>{
 const items=new Map<string,string>();
 for(const player of ['guest','michal','rina','ohm','rohil'])for(const version of [1,2,3,4,10])for(const family of ['trivia','game-library'])items.set(`household-${family}-v${version}:${player}:how-much-ish:draft`,'old');
 const keep=['household-trivia-v11:rina:how-much-ish:practice','household-game-library-v11:guest:how-much-ish:selected','household-game-library-v1:rina:sudoku:starter-1','household-size-sound'];
 keep.forEach(key=>items.set(key,'keep'));
 retireSizeHistory({get length(){return items.size;},key:index=>[...items.keys()][index]??null,removeItem:key=>{items.delete(key);}});
 assert.deepEqual([...items.keys()],keep);
 assert.doesNotThrow(()=>retireSizeHistory()); // Storage is absent in this runtime.
});
