import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDatabase,callRpc} from '../scripts/database.mjs';
import {combinedFeed,orderedFeed,moveEntry,reconcileOrder,type PersonalTask} from '../src/home.ts';
let db:any;
const call=(n:string,p?:unknown)=>callRpc(db,n,p?{p}:{});
const task=(extra={})=>({id:randomUUID(),request_id:randomUUID(),actor:'michal',action:'create',expected_version:0,title:'Personal task',...extra});
const change=(t:any,action:string,extra={})=>call('save_personal_task',{id:t.id,expected_version:t.version,actor:t.owner,action,request_id:randomUUID(),...extra});
before(async()=>{db=await openDatabase();});after(async()=>db.close());
test('personal history is scoped, versioned and idempotent without changing points, money or notifications',async()=>{
 const before=await Promise.all(['dashboard','misc_dashboard','chores_dashboard'].map(n=>call(n)));
 const notifications=await db.query('SELECT count(*) FROM ledger_private.push_events');
 const p=task(),a=await call('save_personal_task',p);assert.deepEqual(await call('save_personal_task',p),a);
 await assert.rejects(call('save_personal_task',{...p,title:'different'}),/already used/);
 const edited=await change(a,'edit',{title:'Read a book'});await assert.rejects(change(a,'edit',{title:'Stale'}),/changed/);
 const outcomes=await Promise.allSettled([change(edited,'complete'),change(edited,'complete')]);assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
 const complete=(outcomes.find(x=>x.status==='fulfilled') as PromiseFulfilledResult<any>).value;assert.ok(complete.completed_at);
 const undo=await change(complete,'undo'),pin=await change(undo,'pin',{pinned:true}),deleted=await change(pin,'delete');
 assert.equal(deleted.title,'Read a book');assert.equal(deleted.pinned,true);assert.equal(deleted.deleted,true);
 await assert.rejects(change(deleted,'edit',{title:'Cannot edit deleted'}),/Restore/);
 const restored=await change(deleted,'restore');assert.equal(restored.version,7);
 await assert.rejects(change(restored,'delete',{actor:'rina'}),/owner/);
 const mine=await call('personal_tasks',{member:'michal'}),other=await call('personal_tasks',{member:'rina'});
 assert.equal(mine.tasks.find((t:any)=>t.id===a.id).version,7);assert.equal(mine.history.filter((t:any)=>t.id===a.id).length,7);assert.equal(other.tasks.length,0);
 const exported=await call('export_personal_tasks',{});assert.equal(exported.history.length,7);assert.ok(!JSON.stringify(exported).includes('fingerprint'));assert.ok(!JSON.stringify(exported).includes('request_id'));
 const after=await Promise.all(['dashboard','misc_dashboard','chores_dashboard'].map(n=>call(n)));
 for(let i=0;i<before.length;i++){delete before[i].updated_at;delete after[i].updated_at;assert.deepEqual(after[i],before[i]);}
 assert.deepEqual(await db.query('SELECT count(*) FROM ledger_private.push_events'),notifications);
 for(const table of ['personal_task_events','current_personal_tasks','home_order_events'])await assert.rejects(db.transaction(async(tx:any)=>{await tx.exec('SET LOCAL ROLE anon');await tx.query('SELECT * FROM ledger_private.'+table);}),/permission denied/);
});
test('per-member Home ordering rejects stale/conflicting writes and survives duplicate retries',async()=>{
 const original=await call('home_order',{member:'michal'});assert.equal(original.version,0);
 const p={actor:'michal',expected_version:0,request_id:randomUUID(),keys:['personal:'+randomUUID(),'shared:occurrence:test']};
 const saved=await call('save_home_order',p);assert.deepEqual(await call('save_home_order',p),saved);
 assert.deepEqual((await call('home_order',{member:'michal'})).keys,p.keys);assert.equal((await call('home_order',{member:'rina'})).version,0);
 await assert.rejects(call('save_home_order',{...p,request_id:randomUUID()}),/changed/);
 await assert.rejects(call('save_home_order',{...p,keys:[]}),/different/);
 for(const keys of [['oops'],['shared:a','shared:a'],[null],{}])await assert.rejects(call('save_home_order',{...p,expected_version:1,request_id:randomUUID(),keys}));
 await assert.rejects(call('personal_tasks',{member:'nobody'}),/whose/);
 await assert.rejects(call('home_order',{member:'nobody'}),/whose/);
 assert.equal((await call('export_personal_tasks',{})).orders.length,1);
});
test('combined feed excludes other owners, unassigned work, projections, and unavailable routines',()=>{
 const personal=[{id:'a',owner:'michal',pinned:false,added_at:'2026-10-20',completed_at:null,deleted:false},{id:'b',owner:'rina',added_at:'2026-10-20'},{id:'c',owner:'michal',completed_at:'2026-10-20'}] as PersonalTask[];
 const shared:any={local_day:'2026-10-21',tasks:[{id:'now',assignee:'michal',status:'active',created_at:'2026-10-21',pinned:true},{id:'future',assignee:'michal',status:'active',routine_id:'r',due_on:'2026-10-22',cycle_start:'2026-10-21'},{id:'anyone',assignee:null,status:'active'},{id:'preview',assignee:'michal',status:'active',projected:true}]};
 const feed=combinedFeed('michal',personal,shared);assert.deepEqual(feed.map(e=>e.key),['shared:now','personal:a']);
 const arrivals=[...feed,{...feed[1],key:'personal:new'}];assert.deepEqual(orderedFeed(arrivals,['personal:a','shared:now']).map(e=>e.key),['shared:now','personal:new','personal:a']);
 assert.deepEqual(reconcileOrder(arrivals,['personal:a','shared:now','shared:missing']),['personal:new','personal:a','shared:now','shared:missing']);
 assert.equal(moveEntry(arrivals,'personal:a','shared:now'),null);assert.deepEqual(moveEntry(arrivals,'personal:a','personal:new'),['shared:now','personal:new','personal:a']);
});

test('named groups survive cached edits, completion and exports, and reject malformed metadata',async()=>{
 const p=task({group_name:'  MIT  project  '}),a=await call('save_personal_task',p);assert.equal(a.group_name,'MIT project');assert.deepEqual(await call('save_personal_task',p),a);
 const b=await call('save_personal_task',task({group_name:'mit project'}));assert.equal(b.group_name,'MIT project');
 const oldClient=await change(a,'edit',{title:'Legacy client edit'});assert.equal(oldClient.group_name,'MIT project');
 const completed=await change(oldClient,'complete');assert.equal(completed.group_name,'MIT project');
 const moved=await change(completed,'edit',{title:'New project',group_name:'Research'});assert.equal(moved.group_name,'Research');
 const ungrouped=await change(moved,'group',{group_name:null});assert.equal(ungrouped.group_name,null);
 for(const group_name of ['x'.repeat(61),'line\nbreak',{},5])await assert.rejects(call('save_personal_task',task({group_name})),/group/i);
 const exported=await call('export_personal_tasks',{});assert.equal(exported.format_version,2);assert.equal(exported.history.find((t:any)=>t.id===a.id&&t.version===1).group_name,'MIT project');
});
test('dragging a personal task across groups saves its group and order atomically with safe retries',async()=>{
 const t=await call('save_personal_task',task({group_name:'MIT'})),order=await call('home_order',{member:'michal'});
 const p={actor:'michal',expected_version:order.version,request_id:randomUUID(),keys:['personal:'+t.id,...order.keys],move:{id:t.id,expected_version:t.version,group_name:'Project'}};
 const saved=await call('save_home_order',p);assert.deepEqual(await call('save_home_order',p),saved);
 let personal=await call('personal_tasks',{member:'michal'});assert.equal(personal.tasks.find((x:any)=>x.id===t.id).group_name,'Project');assert.equal(personal.history.filter((x:any)=>x.id===t.id).length,2);
 await assert.rejects(call('save_home_order',{...p,expected_version:saved.version,request_id:randomUUID(),keys:[],move:{...p.move,group_name:'Stale'}}),/changed/);
 assert.deepEqual((await call('home_order',{member:'michal'})).keys,saved.keys);
 await assert.rejects(call('save_home_order',{...p,actor:'rina',expected_version:0,request_id:randomUUID(),move:{...p.move,expected_version:2}}),/owner/);
 assert.equal((await call('home_order',{member:'rina'})).version,0);
});
