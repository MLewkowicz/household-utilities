import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDatabase,callRpc} from '../scripts/database.mjs';
let db:any;const call=(fn:string,p?:any)=>callRpc(db,fn,p?{p}:{});
const draft=(extra={})=>({id:randomUUID(),request_id:randomUUID(),actor:'michal',title:'Buy milk',schedule:'as_needed',start_week:'2026-01-01',interval_weeks:1,owners:['michal','rohil','rina'],start_index:0,enabled:true,steps:[{id:'milk',title:'Buy milk',icon_id:'milk',kind:'request',points:0,note:'For Michal, Rohil and Rina',weekday:0,time:null}],...extra});
const tasks=async(id:string)=>(await call('chores_dashboard')).tasks.filter((t:any)=>t.routine_id===id);
const active=async(id:string)=>(await tasks(id)).filter((t:any)=>t.state==='active');
const change=(t:any,action:string,extra={})=>call('save_chore',{id:t.id,expected_version:t.version,actor:t.assignee,request_id:randomUUID(),action,...extra});
before(async()=>{db=await openDatabase();});after(async()=>db.close());
test('one undated next turn rotates only after completion, with safe retries and exact undo',async()=>{
 const p=draft(),r=await call('save_chore_routine',p);assert.deepEqual(await call('save_chore_routine',p),r);
 let [t]=await active(r.id);assert.equal((await tasks(r.id)).length,1);assert.equal(t.assignee,'michal');assert.equal(t.due_at,null);assert.equal(t.cycle_end,null);assert.equal(t.projected,false);
 const complete={id:t.id,expected_version:t.version,actor:'michal',action:'quick_complete',request_id:randomUUID()};
 const done=await call('save_chore',complete);assert.deepEqual(await call('save_chore',complete),done);
 let [next]=await active(r.id);assert.equal(next.assignee,'rohil');assert.equal((await active(r.id)).length,1);
 const undone=await change(done,'undo');assert.equal((await active(r.id))[0].id,t.id);assert.equal((await tasks(r.id)).find((x:any)=>x.id===next.id).rotation_withdrawn,true);
 await change(undone,'quick_complete');[next]=await active(r.id);assert.equal(next.assignee,'rohil');
 const concurrent=await Promise.allSettled([change(next,'quick_complete'),change(next,'quick_complete')]);assert.equal(concurrent.filter(x=>x.status==='fulfilled').length,1);
 [next]=await active(r.id);assert.equal(next.assignee,'rina');await change(next,'quick_complete');assert.equal((await active(r.id))[0].assignee,'michal');
 await assert.rejects(change((await tasks(r.id)).find((x:any)=>x.id===t.id),'undo'),/later turn/);
});
test('pausing withdraws pending work, resume preserves the next person, and skipping advances',async()=>{
 const p=draft(),r=await call('save_chore_routine',p);const [first]=await active(r.id);await change(first,'quick_complete');
 const pause={...p,enabled:false,expected_version:r.version,request_id:randomUUID()};const paused=await call('save_chore_routine',pause);assert.equal((await active(r.id)).length,0);
 const resumed=await call('save_chore_routine',{...p,expected_version:paused.version,request_id:randomUUID()});const [next]=await active(r.id);assert.equal(next.assignee,'rohil');
 await change(next,'cancel');assert.equal((await active(r.id))[0].assignee,'rina');
 await assert.rejects(call('save_chore_routine',{...p,schedule:'scheduled',expected_version:resumed.version,request_id:randomUUID()}),/repeat schedule/);
});
test('editing a current turn does not reset the rotation or allow date-based expiry',async()=>{
 const p=draft(),r=await call('save_chore_routine',p);const [t]=await active(r.id);
 const edited=await change(t,'edit',{...t,title:'Buy whole milk'});assert.equal((await active(r.id)).length,1);
 await assert.rejects(change(edited,'edit',{...edited,due_on:'2027-01-01'}),/no due date/);
 await change(edited,'quick_complete');assert.equal((await active(r.id))[0].assignee,'rohil');
});
