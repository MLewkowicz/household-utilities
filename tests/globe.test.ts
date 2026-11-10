import {countryBorderEdges,countryTapSequence} from '../src/globe-borders';
import {test} from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import data from '../src/earth-elevation.json';import countries from '../src/geography-data.json';
import {decodeElevation,elevationAt,reliefRadius,spherePoint,sphereCoordinate,globeRegionView,globeCountryView,containsCoordinate,globeDetailKeys} from '../src/globe-math';
import {HOUSE_SECTIONS,sectionFromHash,sceneFor} from '../src/house-navigation';
const grid=decodeElevation(data);
test('bundled ETOPO1 grid has real elevations, stable poles and a seamless date line',()=>{
 assert.equal(createHash('sha256').update(Buffer.from(data.values,'base64')).digest('hex'),data.sha256);assert.equal(grid.values.length,1441*721);
 assert.ok(elevationAt(grid,90,30)>3500);assert.ok(elevationAt(grid,-68,-20)>3000);assert.ok(elevationAt(grid,10,46)>1000);assert.ok(elevationAt(grid,-140,0)<-2000);
 assert.equal(elevationAt(grid,-180,20),elevationAt(grid,180,20));assert.equal(elevationAt(grid,60,90),elevationAt(grid,-30,90));
 assert.equal(reliefRadius(-5000),1);assert.ok(reliefRadius(6000)>1.023&&reliefRadius(6000)<1.024);
});
test('globe coordinates and regional camera presets handle both hemispheres and small islands',()=>{
 for(const [lon,lat] of [[0,0],[-73,40],[178,-20],[-160,12],[25,-85]]){const actual=sphereCoordinate(...spherePoint(lon,lat,1.03));assert.ok(Math.abs(actual[0]-lon)<1e-8);assert.ok(Math.abs(actual[1]-lat)<1e-8);}
 const world=globeRegionView('World');assert.ok(world.distance>3.4);assert.ok(globeRegionView('Oceania').lon>140);
 const palau=countries.find(c=>c.id==='PLW')!;assert.ok(globeCountryView(palau).distance<1.5);assert.equal(globeCountryView(palau).lon,palau.center[0]);
});
test('Games has a direct route without becoming a seventh rotating household destination',()=>{
 assert.equal(HOUSE_SECTIONS.length,6);assert.equal(sectionFromHash('#games'),'games');assert.equal(sectionFromHash('#games/geography'),'games');assert.equal(sceneFor('games'),'home');assert.equal(HOUSE_SECTIONS.at(-1)!.route,'utilities');
});

test('country picking uses geographic polygons rather than blended texture IDs',()=>{
 const nigeria=countries.find(c=>c.id==='NGA')!,niger=countries.find(c=>c.id==='NER')!;
 assert.ok(containsCoordinate(nigeria,7.5,9));assert.equal(containsCoordinate(niger,7.5,9),false);
 assert.equal(containsCoordinate(nigeria,0,0),false);
 for(const id of ['POL','IND','AUS','USA']){const c=countries.find(c=>c.id===id)!;assert.ok(containsCoordinate(c,c.center[0],c.center[1]),id);}
});

test('close-up terrain tiles stay bounded and wrap at the date line and poles',()=>{
 assert.deepEqual(globeDetailKeys(83.6,28.3),['8-2','9-2','8-1','9-1']);
 assert.deepEqual(globeDetailKeys(180,0),globeDetailKeys(-180,0));
 assert.deepEqual(globeDetailKeys(-179,0),['0-3','11-3','0-2','11-2']);
 for(const lat of [-90,-89,0,89,90])for(const lon of [-180,-1,179,180]){
  const keys=globeDetailKeys(lon,lat);assert.ok(keys.length>=2&&keys.length<=4);assert.equal(keys.length,new Set(keys).size);
  for(const key of keys){const [col,row]=key.split('-').map(Number);assert.ok(col>=0&&col<12&&row>=0&&row<6);}
 }
});


test('shared border segments are unique while retaining both country owners',()=>{
 const left={rings:[[[0,0],[1,0],[1,1],[0,1],[0,0]]]},right={rings:[[[1,0],[2,0],[2,1],[1,1],[1,0]]]};
 const edges=countryBorderEdges([left,right]);assert.equal(edges.length,7);
 assert.equal(edges.filter(e=>e.owners.length===2).length,1);assert.deepEqual(edges.find(e=>e.owners.length===2)!.owners,[0,1]);
 assert.equal(countryBorderEdges([{rings:[[[179,0],[-179,0],[179,0]]]}]).length,0);
});
test('triple click requires three nearby taps on the same country and ignores slow or cancelled sequences',()=>{
 const taps=countryTapSequence();assert.equal(taps.tap('POL',100,100,0),false);assert.equal(taps.tap('POL',102,99,100),false);assert.equal(taps.tap('POL',101,101,200),true);
 assert.equal(taps.tap('FRA',100,100,300),false);assert.equal(taps.tap('POL',100,100,400),false);assert.equal(taps.tap('POL',130,100,500),false);assert.equal(taps.tap('POL',130,100,1100),false);
 taps.reset();assert.equal(taps.tap('POL',130,100,1200),false);assert.equal(taps.tap('POL',130,100,1300),false);assert.equal(taps.tap('POL',130,100,1400),true);
});

test('native multi-click counts survive delayed rendering while still requiring the same country',()=>{
 const taps=countryTapSequence();assert.equal(taps.tap('POL',100,100,0,1),false);assert.equal(taps.tap('POL',100,100,1800,2),false);assert.equal(taps.tap('POL',100,100,3600,3),true);
 assert.equal(taps.tap('POL',100,100,5000,1),false);assert.equal(taps.tap('FRA',100,100,6000,2),false);assert.equal(taps.tap('POL',100,100,7000,3),false);
});
