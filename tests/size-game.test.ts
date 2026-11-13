import {test} from 'node:test';
import assert from 'node:assert/strict';
import {zoomAt,fitSizeBoxes,sizeVerdict,referenceMeters,formatSize} from '../src/size-game-math';
import {openDatabase,callRpc} from '../scripts/database.mjs';

test('zoom keeps the world point beneath the pointer fixed, including clamped zooms',()=>{
 const camera={x:120,y:300,zoom:.7},pointer={x:380,y:140};
 for(const zoom of [.0001,.02,1,5,500]){
  const next=zoomAt(camera,pointer,zoom);
  assert.ok(Math.abs((pointer.x-camera.x)/camera.zoom-(pointer.x-next.x)/next.zoom)<1e-8);
  assert.ok(Math.abs((pointer.y-camera.y)/camera.zoom-(pointer.y-next.y)/next.zoom)<1e-8);
 }
});
test('fit contains unequal silhouettes and moved objects on narrow and wide screens',()=>{
 const boxes=[{x:-200,y:40,width:400,height:100},{x:480,y:-30,width:800,height:3000}];
 for(const width of [280,360,880]){
  const height=300,camera=fitSizeBoxes(boxes,width,height);
  for(const box of boxes){assert.ok(box.x*camera.zoom+camera.x>=0);assert.ok((box.x+box.width)*camera.zoom+camera.x<=width);assert.ok((box.y-box.height)*camera.zoom+camera.y>=0);assert.ok(box.y*camera.zoom+camera.y<=height);}
 }
});
test('size feedback states direction, uses the actual size as denominator, and formats scales',()=>{
 assert.equal(sizeVerdict(2,1).detail,'100% too big');assert.equal(sizeVerdict(.5,1).detail,'50% too small');assert.equal(sizeVerdict(1,1).title,'Spot on!');
 assert.equal(referenceMeters('12,756 km'),12756000);assert.equal(referenceMeters('8.5 cm · width'),.085);assert.equal(referenceMeters('unknown'),undefined);
 assert.equal(formatSize(.00004),'40 µm');assert.equal(formatSize(250000),'250 km');assert.equal(formatSize(2.04),'2.04 m');
});
test('size categories sync independently, reject retired boards, and keep mixed daily answers hidden',async()=>{
 const db=await openDatabase();try{
  const p={game:'how-much-ish',player:'rina',size_version:11},library=await callRpc(db,'game_library',{p});
  assert.equal(library.entries.filter((e:any)=>e.entry.startsWith('size-')).length,90);
  assert.ok((await callRpc(db,'trivia_capabilities')).size_categories);
  const pop={...p,entry:'size-v11-pop-culture-1'},geo={...p,entry:'size-v11-geography-1'};
  const board=await callRpc(db,'game_archive',{p:pop});assert.ok(board.state.attempt.questions.every((q:any)=>q.category==='pop-culture'));
  board.state.drafts['0']=.72;
  const saved=await callRpc(db,'game_archive_save',{p:{...pop,revision:0,state:board.state}});
  assert.equal(saved.revision,1);assert.equal((await callRpc(db,'game_archive',{p:pop})).state.drafts['0'],.72);
  assert.equal((await callRpc(db,'game_archive',{p:geo})).revision,0);
  assert.equal((await callRpc(db,'game_archive',{p:{...pop,player:'ohm'}})).revision,0);
  assert.equal((await callRpc(db,'game_archive_save',{p:{...pop,revision:0,state:board.state}})).revision,1);
  await assert.rejects(callRpc(db,'game_archive_save',{p:{...pop,revision:0,state:{...board.state,drafts:{'0':.8}}}}),/another device/);
  await assert.rejects(callRpc(db,'game_archive',{p:{...pop,entry:'size-v11-pop-culture-31'}}),/retired/);
  await assert.rejects(callRpc(db,'game_archive',{p:{...p,entry:'starter-1'}}),/retired/);
  const daily=await callRpc(db,'trivia_start',{p});assert.equal(daily.version,11);assert.equal(new Set(daily.questions.map((q:any)=>q.category)).size,3);
  assert.ok(daily.questions.every((q:any)=>q.answer===undefined&&q.explanation===undefined&&!q.target.measure));
 }finally{await db.close();}
});
