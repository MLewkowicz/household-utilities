import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {callRpc} from '../scripts/database.mjs';
test('dishwasher upgrade corrects existing tasks without losing contributors, credit or routine snapshots',async()=>{
 const db=new PGlite();await db.waitReady;
 try{
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')&&f<'025').sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  const call=(fn:string,p?:any)=>callRpc(db,fn,p?{p}:{});
  const completion={contributors:['michal','rohil'],completed_at:'2026-01-01T12:00'};
  const draft=(extra={})=>({id:randomUUID(),request_id:randomUUID(),actor:'michal',action:'create',kind:'chore',icon_id:'dishes',pinned:false,assignee:null,title:'Start dishwasher',preset_id:'dishwasher-start',points:.5,completion,...extra});
  const start=await call('save_chore',draft()),empty=await call('save_chore',draft({title:'Unloading Dishwasher',points:2,preset_id:null})),ambiguous=await call('save_chore',draft({title:'Do the dishes',points:0,preset_id:null,kind:'reminder'}));
  const routine=await call('save_chore_routine',{id:randomUUID(),request_id:randomUUID(),actor:'michal',title:'Run dishwasher',start_week:'2026-01-01',interval_weeks:12,owners:['michal'],start_index:0,enabled:true,steps:[{id:'run',title:'Run dishwasher',icon_id:'dishes',kind:'chore',points:.5,preset_id:'dishwasher-start',weekday:0,time:null}]});
  const money=await call('dashboard');
  await db.exec(await readFile('supabase/migrations/025_dishwasher_points.sql','utf8'));
  const after=await call('chores_dashboard'),run=after.tasks.find((t:any)=>t.id===start.id),unload=after.tasks.find((t:any)=>t.id===empty.id);
  assert.equal(run.points,.25);assert.equal(run.point_policy,'dishwasher-v2');assert.deepEqual(run.completion,start.completion);assert.equal(run.version,2);
  assert.equal(unload.points,1);assert.equal(unload.preset_id,'dishwasher-empty');assert.deepEqual(unload.completion,empty.completion);
  assert.equal(after.tasks.find((t:any)=>t.id===ambiguous.id).version,1);
  assert.equal(after.history.find((t:any)=>t.id===start.id&&t.version===1).points,.5);
  for(const member of ['michal','rohil'])assert.equal(after.leaderboard.find((s:any)=>s.member===member&&s.period==='all').entries.find((e:any)=>e.id===start.id).units,1.5);
  assert.equal(after.routines.find((r:any)=>r.id===routine.id).steps[0].points,.25);
  assert.equal(after.routine_history.find((r:any)=>r.id===routine.id&&r.version===1).steps[0].points,.5);
  const currentMoney=await call('dashboard');delete money.updated_at;delete currentMoney.updated_at;assert.deepEqual(currentMoney,money);
  const newRun=await call('save_chore',draft({points:.25,completion:undefined}));assert.equal(newRun.points,.25);
  await assert.rejects(call('save_chore',draft()),/fixed/);
 }finally{await db.close();}
});
