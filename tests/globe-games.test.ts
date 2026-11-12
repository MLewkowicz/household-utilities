import {test} from 'node:test';
import assert from 'node:assert/strict';
import atlas from '../src/geography-data.json';
import {globeCities,cityPrompt} from '../src/globe-cities';
import {newRound,inRound,roundLocations,prepareFindTarget,answerLocation,restoreRound,type Country} from '../src/geography';
import {createRoute,stepRoute,restoreRoute,shortestRoute,routePuzzles,neighbors} from '../src/geography-route';
import {openDatabase,callRpc} from '../scripts/database.mjs';
const countries=atlas as Country[];
test('city catalog keeps urban centers and removes satellite clusters with population context',()=>{
 const polish=Object.values(globeCities).filter(c=>c.countryId==='POL');
 assert.deepEqual(polish.map(c=>c.id),['POL','POL_KRAKOW','POL_GDANSK','POL_LODZ','POL_KATOWICE']);
 assert.ok(globeCities.NLD_ROTTERDAM.note?.includes('major port'));
 assert.ok(Object.values(globeCities).filter(c=>c.population).length>480);
 for(const city of Object.values(globeCities))if(city.population){assert.ok(city.population>0);assert.match(city.populationBasis!,/archived.*not city proper/);}
 const removed='POL_GLIWICE',r=newRound('Europe',0,0,'countries','cities');r.cityVersion=2;r.correct=['POL',removed];r.learningTarget=removed;r.learningOrder=[removed,'POL_KRAKOW'];
 const restored=restoreRound(r,countries)!;assert.deepEqual(restored.correct,['POL']);assert.notEqual(restored.learningTarget,removed);assert.ok(!restored.learningOrder.includes(removed));
});
test('capital dots use actual cities, correct modern capitals and a consistent quiz pool',()=>{
 assert.ok(globeCities.POL.lon>20.9&&globeCities.POL.lon<21.2);assert.ok(globeCities.KIR.lon>170);assert.ok(globeCities.MMR.lat>19&&globeCities.MMR.lat<20);assert.ok(globeCities.GNQ.lon>10);assert.ok(globeCities.BDI.lat<0);assert.ok(globeCities.CYN.lat>globeCities.CYP.lat);
 for(const c of Object.values(globeCities)){assert.ok(c.lat>=-90&&c.lat<=90&&c.lon>=-180&&c.lon<=180);assert.ok(c.source.startsWith('https://'));assert.ok(countries.some(v=>v.id===c.countryId));}
 const r=newRound('Micronesia',0,0,'countries','competitive-cities'),pool=roundLocations(countries,r);assert.equal(pool.length,4);assert.ok(!pool.some(c=>c.id==='NRU'));prepareFindTarget(r,countries,1000);const target=r.findTarget;answerLocation(r,pool.find(c=>c.id===target),countries,2000);assert.equal(r.correct.length,1);assert.notEqual(r.findTarget,target);assert.deepEqual(restoreRound(r,countries)?.correct,[target]);
});
test('city questions and saved progress distinguish multiple cities in the same country',()=>{
 const r=newRound('Europe',0,0,'countries','cities'),locations=roundLocations(countries,r),krakow=locations.find(c=>c.id==='POL_KRAKOW')!,warsaw=locations.find(c=>c.id==='POL')!;
 assert.ok(krakow&&warsaw);assert.equal(krakow.name,'Poland');assert.notDeepEqual(krakow.center,warsaw.center);assert.ok(globeCities.USA_NEWYORK&&!globeCities.USA_NEWYORK.capital);assert.ok(globeCities.CHN_SHANGHAI);assert.ok(globeCities.IND_MUMBAI);assert.equal(cityPrompt(globeCities.IND_MUMBAI,countries.find(c=>c.id==='IND')!),'Find Mumbai · India');assert.match(cityPrompt(globeCities.ZAF,countries.find(c=>c.id==='ZAF')!),/administrative capital/);assert.ok(globeCities.NLD_ROTTERDAM);assert.equal(globeCities.ZAF_BLOEMFONTEIN.capitalRole,'judicial');
 r.learningTarget=krakow.id;r.learningOrder=['POL',krakow.id];r.correct=['POL'];const saved=restoreRound(r,countries)!;assert.equal(saved.learningTarget,krakow.id);assert.deepEqual(saved.correct,['POL']);assert.ok(saved.learningOrder.includes('FRA_LYON'));
 const old={...r,cityVersion:undefined,ended:'won' as const};const upgraded=restoreRound(old,countries)!;assert.equal(upgraded.ended,null);assert.equal(upgraded.cityVersion,3);assert.deepEqual(upgraded.correct,['POL']);
 const ranked=newRound('Europe',0,0,'countries','competitive-cities');ranked.findOrder=[krakow.id,warsaw.id];prepareFindTarget(ranked,countries,1000);assert.equal(answerLocation(ranked,warsaw,countries,2000)?.correct,false);assert.deepEqual(ranked.missed,[krakow.id]);assert.equal(ranked.correct.length,0);
 const oldRanked=restoreRound({...ranked,cityVersion:undefined},countries)!;assert.notEqual(oldRanked.id,ranked.id);assert.equal(oldRanked.cityVersion,3);assert.equal(oldRanked.mistakes,0);
});
test('route catalog has symmetric land borders and all shortest paths are valid',()=>{
 for(const [a,ns] of Object.entries(neighbors))for(const b of ns)assert.ok(neighbors[b].includes(a),a+'-'+b);
 for(const p of routePuzzles){assert.equal(shortestRoute(p.start,p.end).length-1,p.minimum);assert.equal(p.solution[0],p.start);assert.equal(p.solution.at(-1),p.end);let r=createRoute(p);for(const id of p.solution.slice(1))r=stepRoute(r,id);assert.equal(r.won,true);assert.equal(r.score,1000);assert.deepEqual(restoreRoute(r),r);}
 assert.ok(neighbors.BWA.includes('ZMB'));assert.ok(neighbors.ITA.includes('VAT'));assert.ok(!neighbors.FRA.includes('BRA'));assert.ok(!neighbors.POL.includes('RUS'));assert.equal(shortestRoute('JPN','CHN').length,0);
});
test('routes accept alternatives, reveal only valid tiles, charge detours and survive restoration',()=>{
 const p=routePuzzles[0];assert.equal(p.start,'PRT');let r=createRoute(p);assert.deepEqual(r.discovered,[p.start,p.end]);r=stepRoute(r,'JPN');assert.equal(r.mistakes,1);assert.ok(!r.discovered.includes('JPN'));r=stepRoute(r,'ESP');r=stepRoute(r,'back');assert.equal(r.steps,2);assert.deepEqual(r.path,['PRT']);assert.ok(r.discovered.includes('ESP'));
 for(const id of ['ESP','FRA','BEL','DEU','POL'])r=stepRoute(r,id);assert.ok(r.won);assert.equal(r.score,Math.max(0,1000-(r.steps-p.minimum)*100-100));assert.deepEqual(restoreRoute(r),r);assert.equal(stepRoute(r,'JPN'),r);assert.equal(restoreRoute({...r,path:['PRT','JPN']}),undefined);
 let lost=createRoute(p);for(let i=0;i<5;i++)lost=stepRoute(lost,'JPN');assert.ok(lost.complete);assert.equal(lost.won,false);assert.equal(lost.score,0);
});
test('daily trails share a puzzle, validate each border and make retries idempotent',async()=>{
 const db=await openDatabase();try{
  const start=(player:string)=>callRpc(db,'geography_route_start',{p:{player}}),act=(s:any,choice:string)=>callRpc(db,'geography_route_action',{p:{id:s.id,player:s.player,revision:s.revision,choice}});
  let a=await start('michal');const b=await start('rina');assert.equal(a.puzzle_id,b.puzzle_id);assert.deepEqual(await start('michal'),a);const puzzle=routePuzzles.find(p=>p.id===a.puzzle_id)!;
  await assert.rejects(start('guest'),/household player/);await assert.rejects(callRpc(db,'geography_route_action',{p:{id:a.id,player:'rina',revision:0,choice:'JPN'}}),/not found/);
  await assert.rejects(callRpc(db,'geography_route_action',{p:{id:a.id,player:a.player,revision:20,choice:'JPN'}}),/Refresh/);
  const before=a;a=await act(a,'JPN');assert.equal(a.mistakes,1);assert.deepEqual(await act(before,'JPN'),a);assert.deepEqual(a.discovered,[puzzle.start,puzzle.end]);assert.equal((await callRpc(db,'geography_route_scores')).length,0);
  a=await act(a,puzzle.solution[1]);assert.ok(a.discovered.includes(puzzle.solution[1]));a=await act(a,'back');assert.equal(a.steps,2);assert.ok(a.discovered.includes(puzzle.solution[1]));
  for(const id of puzzle.solution.slice(1))a=await act(a,id);assert.ok(a.complete&&a.won);assert.equal(a.score,700);assert.deepEqual(await start('michal'),a);assert.deepEqual(await act(a,'JPN'),a);
  const scores=await callRpc(db,'geography_route_scores');assert.equal(scores.length,1);assert.equal(scores[0].score,700);assert.equal(scores[0].path,undefined);
  const lost=await act(b,'give-up');assert.equal(lost.score,0);assert.ok(lost.complete&&!lost.won);
  const edges=await db.query('SELECT a,b FROM ledger_private.geography_route_edges');assert.equal(edges.rows.length,Object.values(neighbors).reduce((n,x)=>n+x.length,0)/2);for(const e of edges.rows)assert.ok(neighbors[e.a].includes(e.b));
  const saved=await db.query('SELECT * FROM ledger_private.geography_route_puzzles ORDER BY id');assert.deepEqual(saved.rows,routePuzzles.map(p=>({id:p.id,start:p.start,finish:p.end,minimum:p.minimum,solution:p.solution})));
  await assert.rejects(db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE anon');await tx.query('SELECT * FROM ledger_private.geography_routes');}),/permission denied/);
 }finally{await db.close();}
});
