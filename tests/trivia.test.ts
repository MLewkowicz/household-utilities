import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openDatabase,callRpc} from '../scripts/database.mjs';
import {scoreAnswer,normalize,type Question} from '../src/trivia-model';
const games=['odd-one-out','passport-puzzle','clue-cascade','before-or-after','how-much-ish'];
test('practice and daily content are disjoint, complete, sourced and scoreable',async()=>{
 const packs=[...JSON.parse(await readFile('scripts/trivia/daily-packs.json','utf8')).filter(p=>!['clue-cascade','how-much-ish'].includes(p.game)),...JSON.parse(await readFile('scripts/trivia/daily-packs-v3.json','utf8')).filter(p=>p.game!=='how-much-ish'),...JSON.parse(await readFile('scripts/trivia/daily-packs-v4.json','utf8'))];
 for(const game of games.filter(g=>g!=='how-much-ish')){const daily=packs.filter(p=>p.game===game);assert.equal(daily.length,14);const bank:Question[]=JSON.parse(await readFile(`src/trivia/${game}.json`,'utf8'));assert.equal(bank.length,game==='passport-puzzle'?27:game==='how-much-ish'?50:game==='clue-cascade'?12:game==='before-or-after'?4:20);const ids=new Set(daily.flatMap(p=>p.questions.map(q=>q.id)));assert.ok(bank.every(q=>!ids.has(q.id)));
 for(const q of [...bank,...daily.flatMap(p=>p.questions)] as Question[]){assert.ok(q.sources?.length);assert.ok(q.explanation);assert.equal(scoreAnswer(q,q.answer!),q.kind==='timeline'||q.kind==='groups'?1000:200);if(q.kind==='scale'){assert.ok(Number(q.answer)>=q.bounds![0]&&Number(q.answer)<=q.bounds![1]);assert.equal(scoreAnswer(q,Number(q.answer)*2),100);assert.equal(scoreAnswer(q,Number(q.answer)/2),100);}if(q.kind==='clues')assert.equal(scoreAnswer(q,q.answer!,3),50);}}
 assert.equal(normalize('Côte d’Ivoire'),'cotedivoire');
});
test('daily attempts hide answers, resume, lock clues and answers, and use server scoring',async()=>{
 const db=await openDatabase();try{
 for(const game of games.filter(g=>g!=='clue-cascade')){let a=await callRpc(db,'trivia_start',{p:{game,player:'michal',...(game==='how-much-ish'?{size_version:11}:{})}});assert.equal(a.score,0);const concurrent=await Promise.all([callRpc(db,'trivia_start',{p:{game,player:'michal',...(game==='how-much-ish'?{size_version:11}:{})}}),callRpc(db,'trivia_start',{p:{game,player:'michal',...(game==='how-much-ish'?{size_version:11}:{})}})]);assert.equal(concurrent[0].id,concurrent[1].id);assert.ok(a.questions.every(q=>!('answer' in q)&&!('explanation' in q)&&!('aliases' in q)&&!('reveal' in q)));assert.equal((await callRpc(db,'trivia_start',{p:{game,player:'michal',...(game==='how-much-ish'?{size_version:11}:{})}})).id,a.id);
 const pack=(await db.query('SELECT questions FROM ledger_private.trivia_packs WHERE game=$1 AND slot=$2 AND version=$3',[game,a.slot,a.version])).rows[0].questions;
 if(game==='passport-puzzle'){const p={id:a.id,player:'michal',index:0,action:'clue',level:1};a=await callRpc(db,'trivia_action',{p});assert.equal(a.questions[0].clues.length,2);a=await callRpc(db,'trivia_action',{p});assert.equal(a.hints['0'],1);await assert.rejects(callRpc(db,'trivia_action',{p:{...p,level:3}}),/Invalid clue/);}
 for(let i=0;i<pack.length;i++){const p={id:a.id,player:'michal',index:i,action:'answer',answer:pack[i].answer};const retries=await Promise.all([callRpc(db,'trivia_action',{p}),callRpc(db,'trivia_action',{p})]);a=retries[0];assert.deepEqual(retries[1],a);assert.equal(a.answers[i].points,scoreAnswer(pack[i],pack[i].answer,a.hints[i]||0));assert.ok(a.questions[i].explanation);await assert.rejects(callRpc(db,'trivia_action',{p:{...p,answer:'different'}}),/already locked/);}
 assert.equal(a.complete,true);const scores=await callRpc(db,'trivia_scores',{p:{game,period:'day'}});assert.equal(scores[0].score,a.score);assert.equal(scores[0].rank,1);
 }
 await assert.rejects(callRpc(db,'trivia_start',{p:{game:games[0],player:'guest'}}),/Choose/);
 await assert.rejects(db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE anon');await tx.query('SELECT * FROM ledger_private.trivia_packs');}),/permission denied/);
 }finally{await db.close();}
});
test('expired rounds retain earned points; weekly standings sum best five and share ranks',async()=>{
 const db=await openDatabase();try{
 const today='2026-11-15';
 // Use a complete prior week fixture and query the window by shifting transaction time.
 const a=await callRpc(db,'trivia_start',{p:{game:'odd-one-out',player:'michal'}});
 await db.query("UPDATE ledger_private.trivia_attempts SET day=day-1,score=400 WHERE id=$1",[a.id]);
 await assert.rejects(callRpc(db,'trivia_action',{p:{id:a.id,player:'michal',index:0,action:'answer',answer:'x'}}),/ended/);
 const expired=(await db.query('SELECT ledger_private.trivia_state(a) AS data FROM ledger_private.trivia_attempts a WHERE id=$1',[a.id])).rows[0].data;assert.equal(expired.complete,true);assert.equal(expired.score,400);
 // Seed completed attempts across this week's available days; equal players share rank.
 await db.exec('DELETE FROM ledger_private.trivia_attempts');
 await db.query(`INSERT INTO ledger_private.trivia_attempts(player,game,day,slot,score,answers)
 SELECT player,'odd-one-out',d::date,0,(100+i*100), '[{},{},{},{},{}]'::jsonb FROM unnest(ARRAY['michal','rina']) player CROSS JOIN generate_series(date_trunc('week',$1::date::timestamp),$1::date::timestamp,'1 day') WITH ORDINALITY AS dates(d,i)`,[today]);
 const rows=(await db.query("SELECT ledger_private.trivia_standings($1::jsonb,$2::date) AS result",[JSON.stringify({game:'odd-one-out',period:'week'}),today])).rows[0].result;assert.equal(rows.length,2);assert.equal(rows[0].rank,1);assert.equal(rows[1].rank,1);assert.equal(rows[0].score,rows[1].score);assert.equal(rows[0].days,5);assert.equal(rows[0].score,3000);
 }finally{await db.close();}
});
test('v2 boards carry their own visual content and practice timelines never expose daily events',async()=>{
 const packs=JSON.parse(await readFile('scripts/trivia/daily-packs.json','utf8'));
 const qs=packs.flatMap(p=>p.questions) as Question[];
 assert.ok(packs.every(p=>p.version===2));assert.equal(new Set(qs.map(q=>q.id)).size,qs.length);
 for(const q of qs){
  if(q.kind==='timeline'){assert.equal(Object.keys(q.reveal!).length,5);assert.equal(new Set(Object.values(q.reveal!)).size,5);assert.ok(q.cards!.every(c=>c.art&&q.reveal![c.id]));}
  if(q.outline){assert.match(q.outline.path,/^M/);assert.ok((q.outline.path.match(/,/g)||[]).length>=3);assert.equal(q.kind,'clues');assert.equal(q.clues!.length,4);}
  if(q.kind==='scale'){assert.ok(q.reference!.measure);assert.notEqual(q.target!.shape,'sphere');}
 }
 const dailyEvents=new Set(qs.filter(q=>q.kind==='timeline').flatMap(q=>q.cards!.map(c=>c.id)));
 const practice=JSON.parse(await readFile('src/trivia/before-or-after.json','utf8')) as Question[];
 assert.ok(practice.every(q=>q.cards!.every(c=>!dailyEvents.has(c.id))));
 const odd=qs.filter(q=>q.kind==='choice');assert.ok(odd.every(q=>q.tag));assert.ok(odd.every(q=>!q.prompt.includes('perfect square')&&!q.prompt.includes('continent')));
});
test('v2 preserves pinned attempts and keeps roommates on the same pack during rollout',async()=>{
 const db=await openDatabase();try{
  const first=await callRpc(db,'trivia_start',{p:{game:'odd-one-out',player:'michal'}});assert.equal(first.version,2);
  await db.query('UPDATE ledger_private.trivia_attempts SET version=1 WHERE id=$1',[first.id]);
  const before=(await db.query('SELECT questions FROM ledger_private.trivia_packs WHERE game=$1 AND slot=$2 AND version=1',['odd-one-out',first.slot])).rows[0].questions;
  const resumed=await callRpc(db,'trivia_start',{p:{game:'odd-one-out',player:'michal'}});assert.equal(resumed.id,first.id);assert.equal(resumed.version,1);assert.equal(resumed.questions[0].id,before[0].id);
  const answered=await callRpc(db,'trivia_action',{p:{id:first.id,player:'michal',index:0,action:'answer',answer:before[0].answer}});assert.equal(answered.score,200);
  const next=await callRpc(db,'trivia_start',{p:{game:'odd-one-out',player:'rina'}});assert.equal(next.version,1);assert.equal(next.questions[0].id,resumed.questions[0].id);
  await db.exec('UPDATE ledger_private.trivia_attempts SET day=day-1');
  const fresh=await callRpc(db,'trivia_start',{p:{game:'odd-one-out',player:'ohm'}});assert.equal(fresh.version,2);assert.notEqual(fresh.questions[0].id,resumed.questions[0].id);
  assert.equal((await callRpc(db,'trivia_capabilities')).version,7);
 }finally{await db.close();}
});

test('word boards score groups, persist progress and make retries idempotent',async()=>{
 const {emptyGroups,guessGroup}=await import('../src/group-puzzle');
 const db=await openDatabase();try{
  let a=await callRpc(db,'trivia_start',{p:{game:'clue-cascade',player:'michal'}});assert.equal(a.version,3);assert.equal(a.questions.length,1);assert.equal(a.questions[0].words.length,16);assert.equal(a.questions[0].groups,undefined);
  const q=(await db.query('SELECT questions->0 AS q FROM ledger_private.trivia_packs WHERE game=$1 AND slot=$2 AND version=$3',[a.game,a.slot,a.version])).rows[0].q;
  const send=(answer:unknown)=>callRpc(db,'trivia_action',{p:{id:a.id,player:a.player,index:0,action:'group',answer}});
  await assert.rejects(send(['not a word','x','y','z']),/four remaining/);
  await assert.rejects(send(Array(4).fill(q.words[0])),/four remaining/);
  await assert.rejects(callRpc(db,'trivia_action',{p:{id:a.id,player:a.player,index:0,action:'answer',answer:q.answer}}),/Unknown question/);
  const wrong=[...q.groups[0].words.slice(0,3),q.groups[1].words[0]];
  let practice=guessGroup(q.groups,emptyGroups(),wrong);a=await send(wrong);assert.deepEqual(a.progress,practice);assert.equal(a.progress.notice,'One word away.');assert.equal(a.progress.mistakes,1);
  const retries=await Promise.all([send([...wrong].reverse()),send(wrong)]);assert.equal(retries[0].progress.mistakes,1);assert.equal(retries[1].progress.guesses.length,1);
  for(const g of q.groups){practice=guessGroup(q.groups,practice,g.words);a=await send(g.words);assert.deepEqual(a.progress,practice);assert.equal(a.score,practice.solved.length*250);if(!a.complete)assert.equal(a.questions[0].groups,undefined);const resumed=await callRpc(db,'trivia_start',{p:{game:a.game,player:a.player}});assert.deepEqual(resumed,a);}
  assert.equal(a.complete,true);assert.equal(a.score,1000);assert.equal(a.questions[0].groups.length,4);assert.equal((await send(q.groups[0].words)).score,1000);
  const scores=await callRpc(db,'trivia_scores',{p:{game:a.game,period:'day'}});assert.equal(scores[0].score,1000);
  await assert.rejects(db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE anon');await tx.query('SELECT ledger_private.trivia_action_v2($1::jsonb)',['{}']);}),/permission denied/);
 }finally{await db.close();}
});
test('four distinct wrong word groups end a round and reveal the remaining groups',async()=>{
 const db=await openDatabase();try{
  let a=await callRpc(db,'trivia_start',{p:{game:'clue-cascade',player:'rina'}});
  const q=(await db.query('SELECT questions->0 AS q FROM ledger_private.trivia_packs WHERE game=$1 AND slot=$2 AND version=$3',[a.game,a.slot,a.version])).rows[0].q;
  for(let i=0;i<4;i++)a=await callRpc(db,'trivia_action',{p:{id:a.id,player:a.player,index:0,action:'group',answer:q.groups.map(g=>g.words[i])}});
  assert.equal(a.complete,true);assert.equal(a.progress.mistakes,4);assert.equal(a.score,0);assert.equal(a.answers.length,1);assert.equal(a.questions[0].groups.length,4);
 }finally{await db.close();}
});
