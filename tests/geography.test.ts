import {test} from 'node:test';
import assert from 'node:assert/strict';
import atlas from '../src/geography-data.json';
import {isAnswer,answerSuggestions,countryHints,useHint,revealCountry,inRegion,newRound,remainingSeconds,roundEnd,restoreRound,countryView,countryPath,regionView,REGIONS,type Country} from '../src/geography';
const countries=atlas as Country[],find=(id:string)=>countries.find(c=>c.id===id)!;
test('atlas has usable geometry, context cards and the small Pacific countries',()=>{
 assert.equal(countries.length,242);assert.equal(new Set(countries.map(c=>c.id)).size,242);
 for(const c of countries){assert.ok(c.name&&c.capital&&c.population&&c.facts.length>=2,c.name);assert.ok(countryPath(c).startsWith('M'));assert.ok(countryView(c).every(Number.isFinite));}
 for(const id of ['FSM','PLW','MHL','NRU','KIR','GUM'])assert.equal(inRegion(find(id),'Micronesia'),true,id);
 assert.equal(inRegion(find('TUV'),'Polynesia'),true);assert.equal(inRegion(find('FJI'),'Melanesia'),true);
 for(const region of REGIONS)assert.ok(countries.some(c=>inRegion(c,region)),region);
});
test('answers accept common aliases and suggestions filter the entire chosen region',()=>{
 assert.ok(isAnswer(find('USA'),'United States of America'));assert.ok(isAnswer(find('TUR'),'turkiye'));assert.ok(isAnswer(find('TUR'),'Turkey'));assert.ok(isAnswer(find('CIV'),'Ivory Coast'));
 assert.equal(answerSuggestions(countries,'Fiji','Micronesia').length,0);assert.equal(answerSuggestions(countries,'Pal','Micronesia')[0].id,'PLW');assert.equal(answerSuggestions(countries,'Polnad','World')[0].id,'POL');
 assert.equal(isAnswer(find('COG'),'DR Congo'),false);assert.equal(isAnswer(find('COD'),'DR Congo'),true);
});
test('time and lives end rounds; restoring progress rejects damaged state and keeps region totals honest',()=>{
 const r={...newRound('Micronesia',60,3),startedAt:100000};
 assert.equal(remainingSeconds(r,130000),30);assert.equal(roundEnd(r,7,160000),'time');assert.equal(roundEnd({...r,mistakes:3},7,130000),'lives');assert.equal(roundEnd({...r,correct:['a','b']},2,130000),'won');
 assert.equal(remainingSeconds(newRound(),1e9),null);assert.equal(roundEnd(newRound('World',60),242,1e9),null);
 assert.deepEqual(restoreRound({...r,correct:['PLW','PLW','FRA','fake']},countries)?.correct,['PLW']);assert.equal(restoreRound({...r,limit:-3},countries),null);
 assert.ok(countryView(find('PLW'),true)[2]<regionView('Micronesia')[2]);
});

test('untimed hints and reveals keep score, lives and completion honest',()=>{
 const r=newRound('Europe',0,3),poland=find('POL');
 assert.equal(useHint(r,poland),true);assert.equal(r.hints.POL,1);assert.deepEqual(r.correct,[]);assert.equal(r.mistakes,0);
 const hints=countryHints(poland,r.region);assert.ok(hints.some(h=>h.includes('Warsaw')));assert.ok(hints.at(-1)?.includes('P·····'));
 for(let i=0;i<10;i++)useHint(r,poland);assert.equal(r.hints.POL,hints.length);
 assert.equal(revealCountry(r,poland),true);assert.equal(revealCountry(r,poland),false);assert.equal(useHint(r,poland),false);
 assert.deepEqual(r.revealed,['POL']);assert.deepEqual(r.correct,[]);assert.equal(r.mistakes,0);assert.equal(roundEnd(r,1),'complete');
 assert.equal(revealCountry(r,find('NGA')),false);assert.equal(countryHints(find('PLW'),'Micronesia').some(h=>h.startsWith('Region:')),false);
 const timed=newRound('World',60,3);assert.equal(useHint(timed,poland),false);assert.equal(revealCountry(timed,poland),false);
 const finished={...newRound(),ended:'lives' as const};assert.equal(revealCountry(finished,poland),false);
});

test('assistance restores per-country progress and remains compatible with older saves',()=>{
 const old={...newRound('Europe'),correct:['POL']};delete (old as any).revealed;delete (old as any).hints;
 const restored=restoreRound(old,countries)!;assert.deepEqual(restored.correct,['POL']);assert.deepEqual(restored.revealed,[]);assert.deepEqual(restored.hints,{});
 const r=restoreRound({...newRound('Europe'),correct:['POL'],revealed:['POL','FRA','FRA','NGA','fake'],hints:{FRA:99,POL:1,NGA:1,fake:1,DEU:-1}},countries)!;
 assert.deepEqual(r.revealed,['FRA']);assert.equal(r.hints.FRA,countryHints(find('FRA'),'Europe').length);assert.equal(r.hints.NGA,undefined);assert.equal(r.hints.DEU,undefined);
 const timed=restoreRound({...r,limit:60},countries)!;assert.deepEqual(timed.revealed,[]);assert.deepEqual(timed.hints,{});
});
