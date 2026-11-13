import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase,callRpc} from '../scripts/database.mjs';
import {DailyPuzzleClock,type PuzzleClockState,type PuzzleClockUpdate} from '../src/daily-puzzle-clock';
import {elapsedPuzzleTime,pausedPuzzleClock,resumePracticeClock} from '../src/puzzle-clock';
import type {Attempt} from '../src/trivia-model';
const first='11111111-1111-4111-8111-111111111111',second='22222222-2222-4222-8222-222222222222';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
test('practice checkpoints exclude time away and resume without resetting earned time',()=>{
 const a={complete:false,started_at:new Date(1000).toISOString(),clock_version:1,active_ms:5000,active_since:new Date(1000).toISOString()} as Attempt;
 const saved=pausedPuzzleClock(a,4000);assert.equal(saved.active_ms,8000);assert.equal(elapsedPuzzleTime(saved,100000),8000);
 resumePracticeClock(saved,100000);assert.equal(elapsedPuzzleTime(saved,103000),11000);
 assert.equal(elapsedPuzzleTime({...saved,elapsed_ms:12345,complete:true},999999),12345);
 assert.equal(elapsedPuzzleTime({...a,active_until:new Date(3000).toISOString()},900000),7000);
});
test('leaving during a pending resume sends one ordered pause and ignores its stale retry',async()=>{
 const a={id:'attempt',player:'michal',complete:false,clock_revision:0,clock_version:1,active_ms:0} as Attempt;
 const requests:{p:PuzzleClockUpdate;resolve:(state:PuzzleClockState)=>void}[]=[];
 const clock=new DailyPuzzleClock(a,p=>new Promise(resolve=>requests.push({p,resolve})),()=>{},first);
 const response=(revision:number,running:boolean):PuzzleClockState=>({id:a.id,clock_version:1,clock_revision:revision,clock_owner:first,active_ms:1200,active_since:running?new Date().toISOString():null,active_until:running?new Date(Date.now()+30000).toISOString():null,server_now:new Date().toISOString(),complete:false});
 try{
  clock.setActive(true);clock.setActive(false);assert.equal(requests.length,1);
  requests[0].resolve(response(1,true));await tick();assert.equal(requests.length,2);assert.equal(requests[1].p.running,false);assert.equal(requests[1].p.revision,1);
  requests[1].resolve(response(2,false));await tick();assert.equal(requests.length,2);assert.equal(a.active_since,null);assert.equal(a.active_ms,1200);
 }finally{clock.finish();}
});
test('a stale pause never retries against the owner of a newer active visit',async()=>{
 const a={id:'attempt',player:'michal',complete:false,clock_revision:0,clock_version:1,active_ms:0} as Attempt;let calls=0;
 const clock=new DailyPuzzleClock(a,async p=>{calls++;return {id:a.id,clock_version:1,clock_revision:calls,clock_owner:p.running?first:second,active_ms:2000,active_since:new Date().toISOString(),active_until:new Date(Date.now()+30000).toISOString(),complete:false,server_now:new Date().toISOString()};},()=>{},first);
 try{clock.setActive(true);await tick();clock.setActive(false);await tick();assert.equal(calls,2);assert.equal(a.active_since,null);}finally{clock.finish();}
});
test('daily clocks accrue active intervals, bound abandoned sessions, reject stale owners and freeze scores',async()=>{
 const db=await openDatabase();try{
  assert.equal((await callRpc(db,'puzzle_clock_capabilities')).pause_resume,true);
  for(const game of ['sudoku','crossword']){
   const start=(player='michal')=>callRpc(db,'trivia_start',{p:{game,player,clock_version:1}});
   const change=(a:any,running:boolean,owner=first)=>callRpc(db,'puzzle_clock',{p:{id:a.id,player:a.player||'michal',revision:a.clock_revision,owner,running}});
   let a=await start();assert.equal(a.clock_version,1);assert.equal(a.active_since,null);
   let active=await change(a,true);const initial=active.active_ms;
   await db.query("UPDATE ledger_private.trivia_attempts SET active_since=clock_timestamp()-interval '5 seconds',active_until=clock_timestamp()+interval '25 seconds' WHERE id=$1",[a.id]);
   const paused=await change(active,false);assert.ok(paused.active_ms>=initial+5000&&paused.active_ms<initial+5300);assert.equal(paused.active_since,null);
   await db.query("UPDATE ledger_private.trivia_attempts SET started_at=clock_timestamp()-interval '3 days' WHERE id=$1",[a.id]);
   const reopened=await start();assert.equal(reopened.active_ms,paused.active_ms);assert.equal(reopened.active_since,null);
   active=await change(reopened,true,second);const stale=await change({...active,player:'michal'},false,first);assert.equal(stale.clock_revision,active.clock_revision);assert.equal(stale.clock_owner,second);assert.ok(stale.active_since);
   const retry=await change(reopened,true,second);assert.equal(retry.clock_revision,active.clock_revision);assert.equal(retry.active_ms,active.active_ms);
   await db.query("UPDATE ledger_private.trivia_attempts SET active_since=clock_timestamp()-interval '90 seconds',active_until=clock_timestamp()-interval '60 seconds' WHERE id=$1",[a.id]);
   const stopped=await change(active,false,second);assert.ok(stopped.active_ms>=paused.active_ms+30000&&stopped.active_ms<paused.active_ms+30002);
   const [{questions}]=(await db.query('SELECT questions FROM ledger_private.trivia_packs WHERE game=$1 AND slot=$2 AND version=$3',[game,a.slot,a.version])).rows;
   const answer={id:a.id,player:'michal',index:0,action:'answer',answer:questions[0].answer,elapsed_ms:1};
   const finished=await callRpc(db,'trivia_action',{p:answer});assert.equal(finished.elapsed_ms,stopped.active_ms);assert.equal(finished.score,1000);assert.equal(finished.active_since,null);
   const retryAnswer=await callRpc(db,'trivia_action',{p:answer});assert.equal(retryAnswer.elapsed_ms,finished.elapsed_ms);
   const after=await change({...finished,player:'michal'},true);assert.equal(after.clock_revision,finished.clock_revision);assert.equal(after.elapsed_ms,finished.elapsed_ms);
   const faster=await start('rina');await change(faster,true);const fastResult=await callRpc(db,'trivia_action',{p:{...answer,id:faster.id,player:'rina'}});assert.ok(fastResult.elapsed_ms<finished.elapsed_ms);
   const scores=await callRpc(db,'trivia_scores',{p:{game,period:'day'}});assert.equal(scores[0].player,'rina');assert.equal(scores[1].player,'michal');
   await assert.rejects(callRpc(db,'puzzle_clock',{p:{id:a.id,player:'rohil',revision:0,owner:first,running:true}}),/unavailable/);
  }
  await assert.rejects(db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE anon');await tx.query('SELECT * FROM ledger_private.trivia_attempts');}),/permission denied/);
 }finally{await db.close();}
});
