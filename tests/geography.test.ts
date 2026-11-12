import {hasCapital,isCapitalAnswer,capitalNames,capitalHints} from '../src/capital-answers';
import {inRound,isCapitalMode,isLearningMode} from '../src/geography';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import atlas from '../src/geography-data.json';
import {isAnswer,answerSuggestions,countryHints,useHint,revealCountry,inRegion,newRound,remainingSeconds,roundEnd,restoreRound,countryView,countryPath,regionView,REGIONS,inPool,COUNTRY_IDS,shuffledCountries,roundScore,prepareFindTarget,answerLocation,type Country} from '../src/geography';
const countries=atlas as Country[],find=(id:string)=>countries.find(c=>c.id===id)!;
test('atlas has usable geometry, context cards and the small Pacific countries',()=>{
 assert.equal(countries.length,242);assert.equal(new Set(countries.map(c=>c.id)).size,242);
 for(const c of countries){assert.ok(c.name&&c.capital&&c.population,c.name);assert.ok(countryPath(c).startsWith('M'));assert.ok(countryView(c).every(Number.isFinite));}
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


test('country sets include 195 countries and Antarctica only in expanded World, without its own quiz region',()=>{
 assert.equal(COUNTRY_IDS.size,195);assert.equal(countries.filter(c=>inPool(c,'World')).length,195);
 assert.equal(countries.filter(c=>inPool(c,'World','expanded')).length,242);
 for(const id of ['ISR','PSX','VAT','FRA','USA'])assert.ok(inPool(find(id),'World'),id);
 for(const id of ['GUM','TWN','KOS','ATA','GRL']){assert.equal(inPool(find(id),'World'),false,id);assert.ok(inPool(find(id),'World','expanded'),id);}
 assert.ok(!(REGIONS as readonly string[]).includes('Antarctica'));
 const migrated=restoreRound({...newRound(),region:'Antarctica',scope:'expanded',correct:['ATA'],ended:'won',finishedAt:1000},countries)!;assert.equal(migrated.region,'World');assert.equal(migrated.ended,null);assert.deepEqual(migrated.correct,['ATA']);
});
test('competitive rules are fixed, learning shuffles without repeats, and hints begin with the capital',()=>{
 const r=newRound('Europe',0,0,'countries','competitive');assert.equal(r.limit,300);assert.equal(r.maxLives,3);
 assert.equal(useHint(r,find('POL')),false);assert.equal(revealCountry(r,find('POL')),false);
 assert.equal(countryHints(find('POL'),'World')[0],'Capital: Warsaw');
 const eligible=countries.filter(c=>inPool(c,'Micronesia'));const order=shuffledCountries(eligible,()=>.2);assert.equal(new Set(order).size,eligible.length);assert.notDeepEqual(order,eligible.map(c=>c.id));
 assert.equal(roundScore({...r,correct:['POL','FRA'],mistakes:1}),175);
 assert.equal(roundScore({...r,correct:[],mistakes:3}),0);
 assert.equal(restoreRound({...r,limit:0},countries),null);
});
test('history avoids current officeholders, preserves context, and drops region-only hints',()=>{
 for(const c of countries)for(const fact of c.facts)assert.doesNotMatch(fact,/KISHIDA|current leader|became prime minister in 2021/);
 assert.match(find('JPN').facts[0],/military government/);assert.match(find('FRA').facts[0],/Versailles/);assert.match(find('PLW').facts[2],/nuclear-free constitution/);
 assert.ok(!countryHints(find('NGA'),'World').some(h=>h.startsWith('Region:')));
});

test('find competition advances after right and wrong guesses, restores its queue, and ends after every country is attempted',()=>{
 let r=newRound('Polynesia',0,0,'countries','competitive-find');prepareFindTarget(r,countries,100000);
 const order=[...r.findOrder];assert.equal(order.length,3);assert.equal(r.limit,300);assert.equal(r.maxLives,3);
 assert.equal(useHint(r,find(order[0])),false);assert.equal(revealCountry(r,find(order[0])),false);
 assert.deepEqual(answerLocation(r,undefined,countries,101000),{target:order[0],correct:false});assert.equal(r.findTarget,order[1]);assert.equal(r.mistakes,1);
 r=restoreRound(r,countries)!;assert.deepEqual(r.findOrder,order);assert.equal(r.findTarget,order[1]);assert.deepEqual(r.missed,[order[0]]);
 answerLocation(r,find(order[1]),countries,102000);assert.equal(r.findTarget,order[2]);assert.deepEqual(r.correct,[order[1]]);
 answerLocation(r,find('POL'),countries,103000);assert.equal(r.findTarget,undefined);assert.equal(roundEnd(r,3,103000),'complete');assert.equal(roundScore(r),50);
 assert.equal(answerLocation(r,find(order[2]),countries,104000),undefined);assert.equal(r.mistakes,2);
});
test('find competition stops at three mistakes and rejects guesses at the time limit',()=>{
 const r=newRound('Europe',0,0,'countries','competitive-find');prepareFindTarget(r,countries,100000);
 for(let i=0;i<3;i++)answerLocation(r,undefined,countries,101000+i);
 assert.equal(roundEnd(r,r.findOrder.length,102000),'lives');assert.equal(r.missed.length,3);assert.equal(answerLocation(r,undefined,countries,103000),undefined);
 const timed=newRound('Europe',0,0,'countries','competitive-find');prepareFindTarget(timed,countries,100000);assert.equal(answerLocation(timed,find(timed.findTarget!),countries,400000),undefined);assert.equal(timed.correct.length,0);
});

test('capital rounds use explicit answers, flexible aliases and pools that can be completed',()=>{
 for(const [id,answer] of [['POL','Warsaw'],['ATG','St Johns'],['MSR','Plymouth'],['MSR','Brades'],['USA','Washington DC'],['UKR','Kiev'],['ZAF','Cape Town'],['ZAF','Pretoria'],['BOL','La Paz'],['LKA','Kotte'],['MMR','Naypyidaw'],['GNQ','Ciudad de la Paz'],['BDI','Gitega']])assert.ok(isCapitalAnswer(find(id),answer),id+answer);
 assert.equal(isCapitalAnswer(find('MMR'),'Rangoon'),false);assert.equal(isCapitalAnswer(find('BDI'),'Bujumbura'),false);assert.equal(isCapitalAnswer(find('POL'),'Poland'),false);
 const r=newRound('Micronesia',0,0,'countries','capitals');assert.ok(isCapitalMode(r.mode));assert.equal(inRound(find('NRU'),r),false);assert.equal(inRound(find('PLW'),r),true);assert.ok(countries.filter(c=>inRound(c,r)).every(hasCapital));
 assert.equal(restoreRound({...r,correct:['NRU','PLW']},countries)?.correct.join(','),'PLW');assert.equal(useHint(r,find('PLW')),true);assert.ok(capitalHints(find('PLW'))[0].includes(capitalNames(find('PLW'))[0][0]));
 const ranked=newRound('World',0,0,'countries','competitive-capitals');assert.equal(ranked.limit,300);assert.equal(ranked.maxLives,3);assert.equal(useHint(ranked,find('POL')),false);
 const learning=newRound('World',300,3,'countries','learn-capitals');assert.equal(learning.limit,0);assert.equal(learning.maxLives,0);assert.ok(isLearningMode(learning.mode));assert.equal(restoreRound(learning,countries)?.mode,'learn-capitals');
});
