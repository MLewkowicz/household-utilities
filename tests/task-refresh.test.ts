import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {openDatabase,callRpc} from '../scripts/database.mjs';
let db:any;
const call=(name:string,p?:unknown)=>callRpc(db,name,p?{p}:{});
const task=(extra={})=>({id:randomUUID(),request_id:randomUUID(),actor:'rohil',action:'create',title:'Shared work',icon_id:'tidy',note:'',assignee:null,points:2,pinned:false,...extra});
before(async()=>{db=await openDatabase();});after(async()=>db.close());

test('quick completion claims and credits in one revision, retries once, and rejects stale/other-owner work',async()=>{
 const t=await call('save_chore',task());
 const p={id:t.id,expected_version:t.version,actor:'michal',action:'quick_complete',request_id:randomUUID()};
 const result=await call('save_chore',p);assert.equal(result.assignee,'michal');assert.equal(result.state,'completed');assert.deepEqual(result.completion.contributors,['michal']);assert.equal(result.points,2);
 assert.deepEqual(await call('save_chore',p),result);
 await assert.rejects(call('save_chore',{...p,actor:'rina',request_id:randomUUID()}),/changed/);
 const events=(await call('chores_dashboard')).history.filter((h:any)=>h.id===t.id);assert.equal(events.length,2);
 const undo=await call('save_chore',{id:t.id,expected_version:2,actor:'michal',action:'undo',request_id:randomUUID()});assert.equal(undo.assignee,'michal');assert.equal(undo.completion,null);
 await assert.rejects(call('save_chore',{...p,expected_version:3,actor:'rina',request_id:randomUUID()}),/another roommate/);
 const expired=await call('save_chore',task({expires_on:'2020-01-01'}));
 await assert.rejects(call('save_chore',{...p,id:expired.id,request_id:randomUUID()}),/no longer open/);
});
test('competing quick completions have one winner',async()=>{
 const t=await call('save_chore',task());
 const results=await Promise.allSettled(['rina','ohm'].map(actor=>call('save_chore',{id:t.id,expected_version:1,actor,action:'quick_complete',request_id:randomUUID()})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal((await call('chores_dashboard')).history.filter((h:any)=>h.id===t.id&&h.action==='quick_complete').length,1);
});
test('group reminders are independent, atomic, idempotent and unscored',async()=>{
 const p={...task({points:0}),recipients:['michal','rina','ohm']};
 const result=await call('save_reminders',p);assert.equal(result.length,3);assert.ok(result.every((t:any)=>t.kind==='reminder'&&t.points===0&&t.reminder_group_id===p.id));
 assert.deepEqual(await call('save_reminders',p),result);
 await assert.rejects(call('save_reminders',{...p,recipients:['michal']}),/already used/);
 await call('save_chore',{id:result[0].id,expected_version:1,actor:'michal',action:'quick_complete',request_id:randomUUID()});
 const d=await call('chores_dashboard'),group=d.tasks.filter((t:any)=>t.reminder_group_id===p.id);
 assert.equal(group.filter((t:any)=>t.state==='completed').length,1);assert.ok(d.leaderboard.every((s:any)=>s.entries.every((e:any)=>!group.some((t:any)=>t.id===e.id))));
 await assert.rejects(call('save_chore',{...result[1],action:'edit',kind:'chore',points:2,expected_version:1,actor:'rina',request_id:randomUUID()}),/remain a reminder/);
 const invalid={...task({actor:'unknown'}),recipients:['rina','ohm']};await assert.rejects(call('save_reminders',invalid));
 assert.ok(!(await call('chores_dashboard')).tasks.some((t:any)=>t.reminder_group_id===invalid.id));
});
test('typed requests remain unscored; summary counts match the urgent queue',async()=>{
 await assert.rejects(call('save_chore',task({kind:'request',points:1})),/no points/);
 await call('save_chore',task({kind:'request',points:0,pinned:true,assignee:'rohil'}));
 const d=await call('chores_dashboard'),summary=await call('chores_summary');
 const count=d.tasks.filter((t:any)=>!t.projected&&t.assignee==='rohil'&&['active','overdue'].includes(t.status)&&(t.pinned||t.status==='overdue'||t.due_on===d.local_day)).length;
 assert.equal(summary.counts.rohil,count);assert.deepEqual(Object.keys(summary).sort(),['counts','local_day']);
 await assert.rejects(db.transaction(async(tx:any)=>{await tx.exec('SET LOCAL ROLE anon');await tx.query('SELECT * FROM ledger_private.reminder_batches');}),/permission denied/);
});
test('upgrade preserves existing task revisions, scores and all financial records',async()=>{
 const legacy=new PGlite();await legacy.waitReady;
 try{
  await legacy.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  for(const file of ['001_utilities','002_rotating_rounding','003_miscellaneous','004_expand_icon_catalog','005_chores','006_chore_reminders','007_bulletin','008_notifications'])await legacy.exec(await readFile(new URL(`../supabase/migrations/${file}.sql`,import.meta.url),'utf8'));
  await callRpc(legacy,'save_chore',{p:task({points:0,assignee:'ohm'})});
  const before=await Promise.all(['dashboard','misc_dashboard','chores_dashboard','bulletin_dashboard'].map(n=>callRpc(legacy,n)));
  await legacy.exec(await readFile(new URL('../supabase/migrations/009_task_refresh.sql',import.meta.url),'utf8'));
  const after=await Promise.all(['dashboard','misc_dashboard','chores_dashboard','bulletin_dashboard'].map(n=>callRpc(legacy,n)));
  for(let i=0;i<before.length;i++){delete before[i].updated_at;delete after[i].updated_at;assert.deepEqual(after[i],before[i]);}
 }finally{await legacy.close();}
});
