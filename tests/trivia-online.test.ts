import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {openDatabase,callRpc} from '../scripts/database.mjs';
import {eventYear,wikidata,buildRelease,validateRelease} from '../scripts/trivia/online/catalog.mjs';
import {scoreAnswer,type Question} from '../src/trivia-model';
const json=async(file:string)=>JSON.parse(await readFile(file,'utf8'));
const generated=async()=>buildRelease(await json('scripts/trivia/online/catalog.json'),await json('src/geography-data.json'));
const date=(year:number,extra={})=>({rank:'normal',mainsnak:{snaktype:'value',datavalue:{value:{time:`+${year}-01-01T00:00:00Z`,precision:9,before:0,after:0,calendarmodel:'http://www.wikidata.org/entity/Q1985727',...extra}}}});
const importRelease=(db:any,p:any,role='service_role')=>db.transaction(async(tx:any)=>{await tx.exec(`SET LOCAL ROLE ${role}`);return (await tx.query('SELECT public.utilities_trivia_import($1::jsonb) AS result',[JSON.stringify(p)])).rows[0].result;});

test('online dates reject uncertainty, conflict, future years and unsupported calendars',()=>{
 const entity=(...dates:any[])=>({claims:{P585:dates}});
 assert.equal(eventYear(entity(date(1969)),'P585',2026),1969);
 assert.equal(eventYear(entity(date(1969),date(1970)),'P585',2026),null);
 assert.equal(eventYear(entity(date(1969,{precision:8})),'P585',2026),null);
 assert.equal(eventYear(entity(date(1969,{before:1})),'P585',2026),null);
 assert.equal(eventYear(entity({...date(1969),qualifiers:{P1480:[]}}),'P585',2026),null);
 assert.equal(eventYear(entity(date(1969,{calendarmodel:'http://www.wikidata.org/entity/Q1985786'})),'P585',2026),null);
 assert.equal(eventYear(entity(date(2026)),'P585',2026),null);
 assert.equal(eventYear(entity({...date(1969),rank:'deprecated'}),'P585',2026),null);
 assert.equal(eventYear({claims:{P577:[date(1813),date(1920)]}},'P577',2026),1813);
});
test('online fetch respects rate limits and maxlag; malformed or exhausted responses fail closed',async()=>{
 const waits:number[]=[],responses=[new Response('',{status:429,headers:{'retry-after':'3'}}),Response.json({error:{code:'maxlag'}}),Response.json({entities:{Q1:{id:'Q1'}}})];
 let requests=0;
 const result=await wikidata({ids:'Q1'},{fetcher:async(url:URL,options:any)=>{assert.equal(url.searchParams.get('maxlag'),'5');assert.ok(options.headers['User-Agent']);requests++;return responses.shift()!;},sleep:async(ms:number)=>{waits.push(ms);}});
 assert.equal(result.Q1.id,'Q1');assert.equal(requests,3);assert.deepEqual(waits,[3000,4000]);
 await assert.rejects(wikidata({ids:'Q1'},{fetcher:async()=>Response.json({bad:true}),sleep:async()=>{}}),/invalid response/);
 let retries=0;await assert.rejects(wikidata({ids:'Q1'},{fetcher:async()=>{retries++;return new Response('',{status:503});},sleep:async()=>{}}),/unavailable/);assert.equal(retries,4);
 await assert.rejects(wikidata({ids:'Q1'},{fetcher:async()=>new Response('',{status:429,headers:{'retry-after':'120'}}),sleep:async()=>{assert.fail('Must not retry early');}}),/longer pause/);
});
test('synced boards are deterministic, scoreable, varied and keep practice facts out of daily',async()=>{
 const a=await generated(),b=await generated();assert.deepEqual(a,b);
 assert.equal(a.release.games[0].packs.length,180);assert.equal(a.release.games[1].packs.length,90);
 const events=new Set(a.release.games[0].packs.flatMap((p:any)=>p[0].cards.map((c:any)=>c.id)));
 for(const q of a.practice['before-or-after'])assert.ok(q.cards.every((c:any)=>!events.has(c.id)));
 const dailyCountries=new Set(a.release.games[1].packs.flatMap((p:any)=>p.map((q:any)=>q.answer)));
 for(const q of a.practice['passport-puzzle'])assert.ok(!dailyCountries.has(q.answer));
 for(const g of a.release.games)for(const pack of g.packs){
  if(g.game==='passport-puzzle')assert.equal(new Set(pack.map((q:any)=>q.answer)).size,5);
  for(const q of pack as Question[])assert.equal(scoreAnswer(q,q.answer!),q.kind==='timeline'?1000:200);
 }
 const bad=structuredClone(a.release);bad.games[0].packs[0][0].reveal[bad.games[0].packs[0][0].answer[1]]=bad.games[0].packs[0][0].reveal[bad.games[0].packs[0][0].answer[0]];
 assert.throws(()=>validateRelease(bad),/chronological/);
});
test('catalog import is private, atomic and idempotent; refreshes preserve today and saved answers',async()=>{
 const db=await openDatabase();try{
  const {release}=await generated();
  const initial=await callRpc(db,'trivia_start',{p:{game:'before-or-after',player:'michal'}});assert.equal(initial.version,5);
  assert.ok(initial.questions.every((q:any)=>!q.answer&&!q.reveal&&!q.sources));
  assert.equal((await importRelease(db,release)).changed,false);
  await assert.rejects(importRelease(db,release,'anon'),/permission denied/);
  await assert.rejects(importRelease(db,release,'authenticated'),/permission denied/);
  const revision=structuredClone(release);revision.games[0].packs[0][0].prompt='Arrange these moments chronologically.';
  const broken=structuredClone(revision);broken.games[1].packs.at(-1).pop();
  await assert.rejects(importRelease(db,broken),/Incomplete pack/);
  assert.equal((await db.query('SELECT max(version) AS v FROM ledger_private.trivia_packs')).rows[0].v,5);
  assert.deepEqual(await importRelease(db,revision),{version:6,changed:true,packs:270});
  assert.deepEqual(await importRelease(db,revision),{version:6,changed:false});
  const stale=structuredClone(revision);stale.catalog.fetchedAt='2000-01-01T00:00:00Z';stale.games[0].packs[0][0].prompt='Old candidate';await assert.rejects(importRelease(db,stale),/Stale catalog/);
  const resumed=await callRpc(db,'trivia_start',{p:{game:'before-or-after',player:'michal'}});assert.deepEqual(resumed,initial);
  const roommate=await callRpc(db,'trivia_start',{p:{game:'before-or-after',player:'rina'}});assert.equal(roommate.version,5);assert.equal(roommate.slot,initial.slot);assert.deepEqual(roommate.questions,initial.questions);
  const pack=(await db.query('SELECT questions FROM ledger_private.trivia_packs WHERE game=$1 AND version=$2 AND slot=$3',[initial.game,initial.version,initial.slot])).rows[0].questions;
  const answer=pack[0].answer;const finished=await callRpc(db,'trivia_action',{p:{id:initial.id,player:'michal',index:0,action:'answer',answer}});assert.equal(finished.score,1000);
  await db.exec('UPDATE ledger_private.trivia_attempts SET day=day-1');
  const next=await callRpc(db,'trivia_start',{p:{game:'before-or-after',player:'michal'}});assert.equal(next.version,6);assert.notEqual(next.id,initial.id);
  assert.equal((await db.query('SELECT answers FROM ledger_private.trivia_attempts WHERE id=$1',[initial.id])).rows[0].answers[0].points,1000);
  // Resume an old 14-slot cohort even when the new rotation uses 180 days.
  await db.exec('DELETE FROM ledger_private.trivia_attempts');
  const legacySlot=2;
  await db.query("INSERT INTO ledger_private.trivia_attempts(player,game,day,slot,version) VALUES('michal','before-or-after',(now() AT TIME ZONE 'America/New_York')::date,$1,2)",[legacySlot]);
  const oldRoommate=await callRpc(db,'trivia_start',{p:{game:'before-or-after',player:'rina'}});assert.equal(oldRoommate.version,2);assert.equal(oldRoommate.slot,legacySlot);
  // Freeze a later day inside this disposable database to exercise slots beyond fourteen.
  const definition=(await db.query("SELECT pg_get_functiondef('public.utilities_trivia_start(jsonb)'::regprocedure) AS sql")).rows[0].sql;
  await db.exec(definition.replace("(now() AT TIME ZONE 'America/New_York')::date","DATE '2027-03-01'"));
  const later=await callRpc(db,'trivia_start',{p:{game:'before-or-after',player:'ohm'}});assert.equal(later.slot,112);assert.equal(later.version,6);
 }finally{await db.close();}
});
