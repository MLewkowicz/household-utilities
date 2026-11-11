import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase,callRpc} from '../scripts/database.mjs';
import atlas from '../src/geography-data.json';
import {COUNTRY_IDS} from '../src/geography';
import {bestScores,compareScores,type GeoScore} from '../src/geography-scores';
const example=(p:Partial<GeoScore>):GeoScore=>({id:'test-score',player:'michal',region:'Europe',scope:'countries',correct:5,total:43,mistakes:3,elapsed_ms:70000,score:425,finished_at:'2026-11-10T00:00:00Z',...p});
test('leaderboard isolates region and scope, keeps each player’s best and breaks ties by time',()=>{
 const rows=[example({id:'slow'}),example({id:'fast',elapsed_ms:50000}),example({id:'other',player:'rina',score:525,correct:6}),example({id:'expanded',scope:'expanded',score:1000}),example({id:'asia',region:'Asia',score:900}),example({id:'find',challenge:'find',score:1000})];
 assert.deepEqual(bestScores(rows,'Europe','countries').map(s=>s.id),['other','fast']);assert.ok(compareScores(rows[0],rows[1])>0);assert.deepEqual(bestScores(rows,'Europe','countries','find').map(s=>s.id),['find']);
});
test('shared scores validate completed rounds, retry idempotently and retain one best per category',async()=>{
 const db=await openDatabase();try{
  const ledger=await callRpc(db,'dashboard');
  const catalog=await db.query('SELECT * FROM ledger_private.geography_catalog ORDER BY id');
  assert.deepEqual(catalog.rows,atlas.map(c=>({id:c.id,continent:c.continent,region:c.region,official:COUNTRY_IDS.has(c.id)})).sort((a,b)=>a.id.localeCompare(b.id)));
  const sizes=await db.query("SELECT count(*)::integer AS n FROM ledger_private.geography_catalog WHERE official AND continent='Europe'");
  const p={id:'geography-score-0001',player:'michal',region:'Europe',scope:'countries',correct:5,total:sizes.rows[0].n,mistakes:3,elapsed_ms:60000};
  const result=await callRpc(db,'save_geography_score',{p});assert.equal(result.score,425);
  assert.deepEqual(await callRpc(db,'save_geography_score',{p}),result);
  await assert.rejects(callRpc(db,'save_geography_score',{p:{...p,correct:6}}),/different results/);
  await assert.rejects(callRpc(db,'save_geography_score',{p:{...p,id:'unfinished-round-0001',mistakes:0}}),/Finish/);
  await assert.rejects(callRpc(db,'save_geography_score',{p:{...p,id:'invalid-pool-0000001',total:242}}),/Country set/);
  await assert.rejects(callRpc(db,'save_geography_score',{p:{...p,id:'negative-score-00001',correct:-1}}));
  await assert.rejects(callRpc(db,'save_geography_score',{p:{...p,id:'bad-player-00000001',player:'guest'}}),/household player/);
  await assert.rejects(callRpc(db,'save_geography_score',{p:{...p,id:'bad-region-00000001',region:'Antarctica'}}),/quiz region/);
  await callRpc(db,'save_geography_score',{p:{...p,id:'geography-score-0002',elapsed_ms:40000}});
  await callRpc(db,'save_geography_score',{p:{...p,id:'geography-score-0003',correct:6,player:'rina'}});
  const rows=await callRpc(db,'geography_scores');assert.equal(rows.length,2);assert.equal(rows[0].player,'rina');assert.equal(rows[1].id,'geography-score-0002');
  assert.deepEqual(await callRpc(db,'geography_score_modes'),['name','find']);
  const location={...p,id:'location-score-0001',challenge:'find',region:'Polynesia',total:3,correct:1,mistakes:2};
  const saved=await callRpc(db,'save_geography_score',{p:location});assert.equal(saved.challenge,'find');assert.equal(saved.score,50);
  assert.deepEqual(await callRpc(db,'save_geography_score',{p:location}),saved);
  await assert.rejects(callRpc(db,'save_geography_score',{p:{...location,id:'location-score-0002',correct:0}}),/Finish/);
  await assert.rejects(callRpc(db,'save_geography_score',{p:{...location,id:'location-score-0003',correct:2}}),/only be attempted once/);
  await assert.rejects(callRpc(db,'save_geography_score',{p:{...location,id:'location-score-0004',challenge:'invalid'}}),/quiz challenge/);
  await callRpc(db,'save_geography_score',{p:{...p,id:'location-score-0005',challenge:'find'}});
  assert.equal((await callRpc(db,'geography_scores')).filter(s=>s.player==='michal'&&s.region==='Europe').length,2);
  const after=await callRpc(db,'dashboard');delete after.updated_at;delete ledger.updated_at;assert.deepEqual(after,ledger);
  await assert.rejects(db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE anon');await tx.query('SELECT * FROM ledger_private.geography_scores');}),/permission denied/);
 }finally{await db.close();}
});
