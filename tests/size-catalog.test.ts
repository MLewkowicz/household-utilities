import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const json=async(file:string)=>JSON.parse(await readFile(file,'utf8'));

test('new size artwork has reviewed provenance and calibrated, inert geometry',async()=>{
 const catalog=await json('src/size-catalog.json'),manifest=await json('scripts/size-art/catalog-manifest.json');
 assert.equal(Object.keys(catalog).length,90);
 assert.equal(manifest.entries.length,Object.keys(catalog).length);
 for(const entry of manifest.entries){
  const profile=catalog[entry.id];assert.ok(profile,entry.id);
  assert.notEqual(entry.rightsBasis,'Owned');
  assert.match(entry.pathSha256,/^[a-f0-9]{64}$/);assert.match(entry.puzzleSha256,/^[a-f0-9]{64}$/);
  assert.ok(profile.source.startsWith('https://'));assert.ok(profile.measurementSource.startsWith('https://'));
  assert.ok(profile.meters>0&&Number.isFinite(profile.meters));
  assert.equal(profile.bounds[profile.axis==='height'?'height':'width'],100,entry.id);
  assert.ok(profile.bounds.width>0&&profile.bounds.height>0,entry.id);
  assert.match(profile.art,/<path\b/);
  const geometry=/\bd="([^"]+)"/.exec(profile.art)![1];
  assert.equal((geometry.match(/[Mm]/g)||[]).length,entry.contourCount,`${entry.id} must preserve every component and hole`);
  assert.doesNotMatch(profile.art,/<(?:script|image|foreignObject|use)\b|\bon\w+=|(?:javascript|https?):/i,entry.id);
  if(entry.rightsBasis.includes('no ownership claimed'))assert.equal(profile.license,entry.rightsBasis);
 }
});

test('size collections and daily boards use distinct, correctly measured comparisons',async()=>{
 const catalog=await json('src/size-catalog.json'),collections=await json('src/trivia/size-collections.json'),daily=await json('scripts/trivia/size-daily-v10.json');
 assert.deepEqual(Object.keys(collections),['classic','pop-culture','geography']);
 assert.equal(daily.length,60);assert.ok(daily.every((board:any[])=>board.length===5&&new Set(board.map(q=>q.category)).size===3));
 for(const questions of Object.values(collections))assert.equal((questions as any[]).length,50);
 const questions=[...Object.values(collections).flat(),...daily.flat()] as any[];
 assert.equal(new Set(questions.map(q=>q.id)).size,450);
 const seenPairs=new Set<string>(),seenObjects=new Set<string>();
 for(const question of questions){
  assert.equal(question.version,10);assert.equal(question.kind,'scale');
  const ids=[question.target.shape,question.reference.shape].map((shape:string)=>{assert.ok(shape.startsWith('catalog:'));return shape.slice(8);});
  const [target,reference]=ids.map((id:string)=>{seenObjects.add(id);assert.ok(catalog[id]);return catalog[id];});
  assert.equal(target.category,question.category);assert.equal(reference.category,question.category);
  assert.ok(Math.abs(question.answer-target.meters/reference.meters)<1e-12);
  assert.ok(question.answer>=question.bounds[0]&&question.answer<=question.bounds[1]);
  assert.equal(question.target.measure,undefined);assert.equal(question.target.meters,undefined);
  assert.match(question.reference.measure,/^[\d.]+ (?:µm|mm|cm|m|km)$/);
  const pair=ids.sort().join('|');assert.ok(!seenPairs.has(pair),pair);seenPairs.add(pair);
 }
 assert.equal(seenObjects.size,Object.keys(catalog).length);
});
