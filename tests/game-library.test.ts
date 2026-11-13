import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openDatabase,callRpc} from '../scripts/database.mjs';
import {validSudoku,gridCells} from '../src/grid-puzzle';
import {headingForCard,headingAlongCards,projectedAim,wrapAngle,telescopeElevation} from '../src/observatory-aim';
const json=async(path:string)=>JSON.parse(await readFile(path,'utf8'));
function sudokuSolutionCount(givens:string){
 const cells=[...givens].map(v=>Number(v)||0),rows=Array(9).fill(0),cols=Array(9).fill(0),boxes=Array(9).fill(0);
 const box=(i:number)=>Math.floor(i/27)*3+Math.floor(i%9/3);
 for(let i=0;i<81;i++)if(cells[i]){const bit=1<<cells[i];rows[Math.floor(i/9)]|=bit;cols[i%9]|=bit;boxes[box(i)]|=bit;}
 function search():number{let index=-1,options:number[]=[];for(let i=0;i<81;i++)if(!cells[i]){const used=rows[Math.floor(i/9)]|cols[i%9]|boxes[box(i)],available=Array.from({length:9},(_,n)=>n+1).filter(n=>!(used&(1<<n)));if(!available.length)return 0;if(index<0||available.length<options.length){index=i;options=available;}if(options.length===1)break;}if(index<0)return 1;
  const row=Math.floor(index/9),col=index%9,b=box(index);let total=0;
  for(const n of options){const bit=1<<n;cells[index]=n;rows[row]|=bit;cols[col]|=bit;boxes[b]|=bit;total+=search();rows[row]^=bit;cols[col]^=bit;boxes[b]^=bit;cells[index]=0;if(total>1)return total;}return total;
 }return search();
}
test('safe observatory heading faces every screen quadrant and interpolates through the seam',()=>{
 const azimuth=Math.atan2(17,24),elevation=Math.atan2(10.5,Math.hypot(17,24));
 for(const x of [-3,-1,.1,1,3])for(const y of [-4,-1,.1,1,4]){
  const yaw=headingForCard(x,y,azimuth,elevation),projected=projectedAim(yaw,azimuth,elevation);
  assert.ok((projected.x*x+projected.y*y)/Math.hypot(projected.x,projected.y)/Math.hypot(x,y)>.99999);
 }
 assert.ok(telescopeElevation>0&&telescopeElevation<elevation);
 assert.ok(Math.abs(wrapAngle(headingAlongCards([3,-3],.5)-Math.PI))<.001);
 assert.notEqual(headingAlongCards([0,1,2],.2),headingAlongCards([0,1,2],.3));
});
test('original crosswords have complete crossing clues; Sudoku givens match valid solutions',async()=>{
 for(const game of ['crossword','sudoku']){
  const practice=await json(`src/trivia/${game}.json`),daily=(await json(`scripts/trivia/${game}-daily.json`)).flat();
  assert.equal(practice.length,10);assert.equal(daily.length,game==='crossword'?90:180);
  const all=[...practice,...daily];assert.equal(new Set(all.map(q=>q.answer)).size,all.length);
  for(const q of all){const g=q.grid;assert.equal(g.givens.length,g.size*g.size);assert.equal(q.answer.length,g.givens.length);
   if(game==='sudoku'){assert.ok(validSudoku(q.answer));assert.equal(sudokuSolutionCount(g.givens),1,q.id);[...g.givens].forEach((v,i)=>{if(v!==' ')assert.equal(v,q.answer[i]);});}
   else{const counts=new Map<number,number>();for(const c of g.clues){assert.ok(c.length>=3&&c.text.length>0);for(const i of gridCells(c,g.size)){assert.notEqual(q.answer[i],'#');counts.set(i,(counts.get(i)||0)+1);}}[...q.answer].forEach((v,i)=>assert.equal(counts.get(i)||0,v==='#'?0:2));}
  }
 }
});
test('personal shelves isolate people, preserve missed and completed dailies, and reject stale writes',async()=>{
 const db=await openDatabase();try{
  const player='michal',game='before-or-after',p={player,game,entry:'starter-1'};
  const shelf=await callRpc(db,'game_library',{p});assert.equal(shelf.entries.filter((e:any)=>e.starter).length,10);
  const photos=await json('src/size-photo-assets.json'),practice=await json('src/trivia/how-much-ish.json'),dailyPhotos=(await db.query("SELECT questions FROM ledger_private.trivia_packs WHERE game='how-much-ish' AND version=7")).rows.flatMap((row:any)=>row.questions);assert.equal(dailyPhotos.length,900);const photoIds=new Set(dailyPhotos.map((q:any)=>q.id));assert.ok(practice.every((q:any)=>!photoIds.has(q.id)));const objects=new Set<string>();for(const q of [...practice,...dailyPhotos])for(const item of [q.reference,q.target]){assert.ok(item.shape.startsWith('photo:'));const id=item.shape.slice(6);assert.ok(photos[id]);objects.add(id);}assert.equal(objects.size,59);
  const packs=await db.query('SELECT game,count(DISTINCT questions) AS n FROM ledger_private.game_starter_packs GROUP BY game');for(const row of packs.rows)assert.equal(Number(row.n),10,row.game);
  const opened=await callRpc(db,'game_archive',{p});assert.equal(opened.revision,0);assert.ok(opened.state.attempt.questions[0].answer);
  const saved=structuredClone(opened.state);saved.drafts['0']=saved.attempt.questions[0].answer;
  const first=await callRpc(db,'game_archive_save',{p:{...p,state:saved,revision:0}});assert.equal(first.revision,1);
  assert.equal((await callRpc(db,'game_archive_save',{p:{...p,state:saved,revision:0}})).revision,1);
  assert.equal((await callRpc(db,'game_archive',{p:{...p,player:'rina'}})).revision,0);
  const changed=structuredClone(saved);changed.attempt.complete=true;changed.attempt.score=1000;
  await assert.rejects(callRpc(db,'game_archive_save',{p:{...p,state:changed,revision:0}}),/another device/);
  await callRpc(db,'game_archive_save',{p:{...p,state:changed,revision:1}});
  const status=await callRpc(db,'game_daily_status',{p:{player}});assert.ok(status.games.every((g:any)=>!g.complete));
  await assert.rejects(callRpc(db,'game_archive',{p:{...p,entry:status.day}}),/Only past/);
  await db.exec("INSERT INTO ledger_private.trivia_attempts(player,game,day,slot,version) VALUES('michal','before-or-after',(now() AT TIME ZONE 'America/New_York')::date-1,1,2)");
  const past=(await db.query("SELECT day::text FROM ledger_private.trivia_attempts WHERE player='michal'")).rows[0].day;
  const old=await callRpc(db,'game_archive',{p:{...p,entry:past}});assert.equal(old.state.attempt.questions[0].version,2);assert.equal(old.state.attempt.complete,false);
  assert.equal((await db.query('SELECT count(*) AS n FROM ledger_private.trivia_attempts')).rows[0].n,1);
  const geo=await callRpc(db,'game_archive',{p:{player,game:'geography',entry:'starter-2'}});assert.equal(geo.state.attempt.puzzle_id,1);assert.equal(geo.state.attempt.complete,false);
  await callRpc(db,'game_archive_save',{p:{player,game:'geography',entry:'starter-2',revision:0,state:geo.state}});
 }finally{await db.close();}
});
test('daily grid boards hide solutions, allow correction, and award a locked completion once',async()=>{
 const db=await openDatabase();try{
  for(const game of ['sudoku','crossword']){
   const a=await callRpc(db,'trivia_start',{p:{player:'ohm',game}});assert.ok(!a.questions[0].answer);assert.equal(a.questions.length,1);
   const p={id:a.id,player:'ohm',index:0,action:'answer'};
   await assert.rejects(callRpc(db,'trivia_action',{p:{...p,answer:'wrong'}}),/not quite right/);
   const pack=(await db.query('SELECT questions FROM ledger_private.trivia_packs WHERE game=$1 AND version=$2 AND slot=$3',[game,a.version,a.slot])).rows[0].questions;
   const done=await callRpc(db,'trivia_action',{p:{...p,answer:pack[0].answer}});assert.equal(done.score,1000);assert.ok(done.complete);
   assert.deepEqual(await callRpc(db,'trivia_action',{p:{...p,answer:pack[0].answer}}),done);
  }
  const status=await callRpc(db,'game_daily_status',{p:{player:'ohm'}});assert.equal(status.games.filter((g:any)=>g.complete).length,2);
 }finally{await db.close();}
});
