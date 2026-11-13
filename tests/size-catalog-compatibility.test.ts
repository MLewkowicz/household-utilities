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

