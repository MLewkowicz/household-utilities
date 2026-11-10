import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {callRpc,openDatabase} from '../scripts/database.mjs';
import {deadlineState,taskPriority} from '../src/task-deadlines';
import {orderedFeed,type FeedEntry} from '../src/home';
import {sweepPreset} from '../src/point-presets';
import {suggestTaskIcon} from '../src/chore-icons';
const now=Date.parse('2026-11-09T17:00:00Z');
test('deadlines enter high priority at 48 hours and completed tasks leave it',()=>{
 const task={due_at:'2026-11-11T17:00:00Z'};
 assert.equal(deadlineState(task,now),'soon');assert.equal(deadlineState(task,now-1),null);
 assert.equal(deadlineState({...task,due_at:'2026-11-09T16:59:00Z'},now),'overdue');
 assert.equal(deadlineState({...task,completed_at:'2026-11-09T16:00:00Z'},now),null);
 assert.equal(deadlineState({...task,state:'completed'},now),null);
 assert.equal(taskPriority({...task,pinned:true},now),0);
 const feed=[{key:'later',source:'personal',task:{pinned:false}},{key:'urgent',source:'personal',task:{pinned:false,due_at:new Date(Date.now()+3600000).toISOString()}}] as FeedEntry[];
 assert.deepEqual(orderedFeed(feed,['later','urgent']).map(x=>x.key),['urgent','later']);
});
test('suggestions respond to title words and sweeping combinations charge each selected room once',()=>{
 assert.equal(suggestTaskIcon(''),undefined);
 assert.equal(suggestTaskIcon('take out tra'),'trash');assert.equal(suggestTaskIcon('sweep kitchen'),'sweep');assert.equal(suggestTaskIcon('repair request landlord'),'repair-request');
 assert.equal(sweepPreset(['kitchen'])?.points,1);assert.equal(sweepPreset(['living-room','kitchen','kitchen'])?.points,2);assert.equal(sweepPreset(['corridor','living-room','kitchen'])?.points,3);assert.equal(sweepPreset([]),undefined);
});
test('personal deadlines survive retries, pin, group rename, completion, undo and older client edits',async()=>{
 const db=await openDatabase();const call=(fn:string,p:any)=>callRpc(db,fn,{p});
 const base={id:randomUUID(),request_id:randomUUID(),actor:'michal',action:'create',title:'Book tickets',group_name:'Travel',due_on:'2027-03-14',due_time:'09:30'};
 try{
  let t=await call('save_personal_task',base);assert.equal(Date.parse(t.due_at),Date.parse('2027-03-14T13:30:00Z'));assert.deepEqual(await call('save_personal_task',base),t);
  for(const action of ['pin','complete','undo','edit']){t=await call('save_personal_task',{id:t.id,request_id:randomUUID(),actor:'michal',action,expected_version:t.version,pinned:true,title:'Book train tickets'});assert.equal(t.due_time,'09:30');assert.equal(t.due_on,'2027-03-14');}
  await call('rename_personal_group',{actor:'michal',request_id:randomUUID(),group_name:'Travel',new_name:'Holiday',expected_tasks:[{id:t.id,version:t.version}]});
  t=(await call('personal_tasks',{member:'michal'})).tasks[0];assert.equal(t.due_on,'2027-03-14');assert.equal(t.group_name,'Holiday');
  await assert.rejects(call('save_personal_task',{...base,id:randomUUID(),request_id:randomUUID(),due_on:null,due_time:'09:00'}),/date/i);
  t=await call('save_personal_task',{id:t.id,request_id:randomUUID(),actor:'michal',action:'edit',expected_version:t.version,title:t.title,due_on:null,due_time:null});assert.equal(t.due_at,null);
 }finally{await db.close();}
});
test('sweeping upgrade retains Michal’s two points, the original revision and completion, and changes future room values',async()=>{
 const db=new PGlite();await db.waitReady;
 try{
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')&&f<'027').sort())await db.exec(await readFile('supabase/migrations/'+f,'utf8'));
  const call=(fn:string,p?:any)=>callRpc(db,fn,p?{p}:{});
  const draft={id:randomUUID(),request_id:randomUUID(),actor:'michal',action:'create',kind:'chore',title:'Sweep kitchen',points:2,preset_id:'sweep-kitchen',icon_id:'sweep',pinned:false,assignee:'michal',completion:{contributors:['michal'],completed_at:'2026-11-02T12:00'}};
  const before=await call('save_chore',draft);
  const unrelated=await call('save_chore',{...draft,id:randomUUID(),request_id:randomUUID(),title:'Sweep outside',preset_id:null});
  await db.exec(await readFile('supabase/migrations/027_sweeping_spaces.sql','utf8'));
  const d=await call('chores_dashboard'),after=d.tasks.find((t:any)=>t.id===before.id);
  assert.equal(after.title,'Sweep kitchen + living room');assert.equal(after.preset_id,'sweep-kitchen-living-room');assert.equal(after.points,2);assert.deepEqual(after.completion,before.completion);assert.equal(after.version,2);
  assert.equal(d.history.find((t:any)=>t.id===before.id&&t.version===1).title,'Sweep kitchen');assert.equal(d.tasks.find((t:any)=>t.id===unrelated.id).version,1);
  assert.equal(d.leaderboard.find((s:any)=>s.member==='michal'&&s.period==='all').entries.find((e:any)=>e.id===before.id).units,24);
  const single=await call('save_chore',{...draft,id:randomUUID(),request_id:randomUUID(),points:1,completion:undefined});assert.equal(single.points,1);
  await assert.rejects(call('save_chore',{...draft,id:randomUUID(),request_id:randomUUID()}),/fixed/);
  const three=await call('save_chore',{...draft,id:randomUUID(),request_id:randomUUID(),preset_id:'sweep-kitchen-living-room-corridor',points:3});assert.equal(three.points,3);
 }finally{await db.close();}
});
