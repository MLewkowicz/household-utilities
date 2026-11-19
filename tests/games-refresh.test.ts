import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openDatabase,callRpc} from '../scripts/database.mjs';
import {passportClues,type Question} from '../src/trivia-model';
import {cityPrompt} from '../src/globe-cities';
import {routePuzzles,shortestRoute} from '../src/geography-route';
test('fresh practice content avoids repeat questions, destinations, and timeline events',async()=>{
 const read=async(name:string)=>JSON.parse(await readFile(`src/trivia/${name}.json`,'utf8'));
 const odd=await read('odd-one-out');assert.ok(odd.length>=50);assert.equal(new Set(odd.slice(0,50).map(q=>q.options.slice().sort().join('|'))).size,50);
 const passport=await read('passport-puzzle');assert.equal(new Set(passport.slice(0,50).map(q=>q.answer)).size,50);
 const timeline=await read('before-or-after');assert.equal(new Set(timeline.slice(0,10).flatMap(q=>q.cards.map(c=>c.id))).size,50);
 assert.deepEqual(passportClues({answer:'Kenya',aliases:['Republic of Kenya'],clues:['Mount Kenya National Park','Region: Eastern Africa']} as Question),['Region: Eastern Africa']);
 for(const p of routePuzzles.filter(p=>p.id>=108))assert.equal(shortestRoute(p.start,p.end).length-1,p.minimum);
 assert.equal(cityPrompt({name:'Paris',capital:true} as any,{name:'France'} as any),'Find Paris');
});
test('Passport starts without clues, deducts each mistake, retries safely, and retains penalties after solving',async()=>{
 const db=await openDatabase();try{
 let a=await callRpc(db,'trivia_start',{p:{game:'passport-puzzle',player:'michal'}});
 assert.deepEqual(a.questions[0].clues,[]);assert.ok(a.questions[0].outline);assert.ok(a.questions[0].clue_count>=2);
 const p={id:a.id,player:a.player,index:0,action:'answer',answer:'definitely misspelled',request_id:'test-1'};
 a=await callRpc(db,'trivia_action',{p});assert.equal(a.score,-50);assert.equal(a.answers.length,0);
 a=await callRpc(db,'trivia_action',{p});assert.equal(a.score,-50);
 a=await callRpc(db,'trivia_action',{p:{...p,request_id:'test-2'}});assert.equal(a.score,-100);
 a=await callRpc(db,'trivia_action',{p:{...p,action:'clue',level:1}});assert.equal(a.score,-150);assert.equal(a.questions[0].clues.length,1);
 a=await callRpc(db,'trivia_action',{p:{...p,action:'clue',level:1}});assert.equal(a.score,-150);
 const pack=(await db.query('SELECT questions FROM ledger_private.trivia_packs WHERE game=$1 AND slot=$2 AND version=$3',[a.game,a.slot,a.version])).rows[0].questions;
 a=await callRpc(db,'trivia_action',{p:{...p,request_id:'solved',answer:pack[0].answer}});assert.equal(a.score,50);assert.equal(a.answers.length,1);
 const starter=await callRpc(db,'game_archive',{p:{game:'geography',player:'michal',entry:'starter-1'}});assert.equal(starter.state.attempt.puzzle_id,108);
 }finally{await db.close();}
});
test('historical standings and all-time averages use the selected date and completed attempts',async()=>{
 const db=await openDatabase();try{
 const a=await callRpc(db,'trivia_start',{p:{game:'odd-one-out',player:'michal'}});
 await db.query("UPDATE ledger_private.trivia_attempts SET day=day-2,score=600,answers='[{},{},{},{},{}]' WHERE id=$1",[a.id]);
 await db.query("INSERT INTO ledger_private.trivia_attempts(player,game,day,slot,version,score,answers) SELECT player,game,day+1,slot,version,1000,'[{},{},{},{},{}]' FROM ledger_private.trivia_attempts WHERE id=$1",[a.id]);
 const rows=await callRpc(db,'trivia_scores',{p:{game:'odd-one-out',period:'all'}});assert.equal(rows[0].score,800);assert.equal(rows[0].days,2);
 const day=(await db.query('SELECT day::text FROM ledger_private.trivia_attempts WHERE id=$1',[a.id])).rows[0].day;
 const historical=await callRpc(db,'trivia_scores',{p:{game:'odd-one-out',period:'date',day}});assert.equal(historical[0].score,600);
 assert.deepEqual(await callRpc(db,'game_history_scores',{p:{challenge:'route',period:'all'}}),[]);
 }finally{await db.close();}
});
