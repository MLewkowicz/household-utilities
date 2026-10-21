import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {openDatabase,callRpc} from '../scripts/database.mjs';
import {type Chore,addDays,queueReady,urgentChore,localDateTime} from '../src/chores';
let db:any,day:string;
const call=(fn:string,p?:any)=>callRpc(db,fn,p?{p}:{});
const task=(extra={})=>({id:randomUUID(),request_id:randomUUID(),actor:'rina',action:'create',kind:'chore',title:'A scheduled job',icon_id:'trash',note:'',assignee:'michal',points:0.5,pinned:false,...extra});
const routine=(start:string,extra={})=>({id:randomUUID(),request_id:randomUUID(),actor:'rina',title:'Scheduled trash',start_week:start,interval_weeks:1,owners:['michal','rina'],start_index:0,enabled:true,steps:[{id:'item',kind:'chore',title:'Scheduled trash',icon_id:'trash',note:'',points:0.5,weekday:0,time:'20:00'}],...extra});
const change=(t:any,action:string,extra={})=>call('save_chore',{...t,actor:'michal',action,expected_version:t.version,request_id:randomUUID(),...extra});
const readySQL=async(t:any,date:string)=>(await db.query('SELECT ledger_private.chore_queue_ready($1::jsonb,$2::date) AS ready',[JSON.stringify(t),date])).rows[0].ready;
before(async()=>{db=await openDatabase();day=(await call('chores_dashboard')).local_day;});
after(async()=>db.close());

test('edited future trash and untouched preview follow the same due-day rule',async()=>{
 const start=addDays(day,6),a=await call('save_chore_routine',routine(start)),b=await call('save_chore_routine',routine(start,{title:'Replace bag'}));
 let d=await call('chores_dashboard');const bag=d.tasks.find((t:any)=>t.routine_id===b.id);
 await change(bag,'edit',{title:'Put in new trash bag',pinned:true});
 d=await call('chores_dashboard');const pair=d.tasks.filter((t:any)=>[a.id,b.id].includes(t.routine_id)&&t.cycle_start===start);
 assert.deepEqual(pair.map((t:any)=>t.projected).sort(),[false,true]);
 for(const t of pair){
  for(const [date,ready] of [[day,false],[addDays(start,-1),false],[start,true],[addDays(start,1),true]] as const){assert.equal(queueReady(t,date),ready);assert.equal(await readySQL(t,date),ready);}
  assert.equal(urgentChore(t,day),false);
  for(const action of ['quick_complete','complete'])await assert.rejects(change(t,action,{completion:{contributors:['michal'],completed_at:day+'T00:00'}}),/upcoming/);
 }
 assert.equal((await call('chores_summary')).counts.michal||0,0);
 assert.equal((await call('chores_dashboard')).history.filter((h:any)=>pair.some((t:any)=>t.id===h.id)).length,1);
});

test('day-offset routines wait for the due day unless explicitly set to cycle start',async()=>{
 const p=routine(day);p.steps[0].weekday=1;
 const r=await call('save_chore_routine',p);
 const t=(await call('chores_dashboard')).tasks.find((t:any)=>t.routine_id===r.id&&!t.projected);
 assert.equal(t.due_on,addDays(day,1));assert.equal(await readySQL(t,day),false);assert.equal(queueReady(t,day),false);
 await assert.rejects(change(t,'quick_complete'),/upcoming/);
 const available=await change(t,'edit',{queue_visibility:'immediately'});
 assert.equal(queueReady(available,day),true);assert.equal(await readySQL(available,day),true);
 const done=await change(available,'quick_complete');assert.equal(done.state,'completed');assert.equal(done.points,0.5);
 // Even "cycle start" cannot surface a saved occurrence from a future cycle.
 const future={...available,cycle_start:addDays(day,7),due_on:addDays(day,8)};
 assert.equal(queueReady(future,day),false);assert.equal(await readySQL(future,day),false);
});

test('one-offs and recipient reminders persist queue choices; pins do not bypass them',async()=>{
 const immediate=await call('save_chore',task({due_on:addDays(day,2)}));
 assert.equal(immediate.queue_visibility,'immediately');assert.equal(queueReady(immediate,day),true);
 await change(immediate,'quick_complete');
 const batch=await call('save_reminders',{...task({points:0,pinned:true,due_on:addDays(day,2),queue_visibility:'due_date'}),recipients:['michal','rina']});
 assert.equal(batch.length,2);
 for(const t of batch){assert.equal(t.queue_visibility,'due_date');assert.equal(await readySQL(t,day),false);assert.equal(queueReady(t,day),false);}
 const t=batch[0],{queue_visibility,...olderClient}=t;
 const edited=await change(olderClient,'edit',{note:'Preserve timing from an older client'});assert.equal(edited.queue_visibility,'due_date');
 const today=await change(edited,'edit',{due_on:day,due_time:'23:59'});
 const p={...today,action:'quick_complete',actor:today.assignee,expected_version:today.version,request_id:randomUUID()};
 const done=await call('save_chore',p);assert.equal(done.state,'completed');assert.deepEqual(await call('save_chore',p),done);
 const undo=await change(done,'undo');assert.equal(queueReady(undo,day),true);assert.equal(undo.queue_visibility,'due_date');
 const overdue=await call('save_chore',task({due_on:addDays(day,-1),queue_visibility:'due_date'}));assert.equal(queueReady(overdue,day),true);
 const d=await call('chores_dashboard'),summary=await call('chores_summary');
 for(const member of ['michal','rina','ohm','rohil'])assert.equal(summary.counts[member]||0,d.tasks.filter((t:Chore)=>!t.projected&&t.assignee===member&&urgentChore(t,day)).length);
});

test('invalid queue policies and dates fail atomically; routine edits and exports retain the setting',async()=>{
 const before=(await call('chores_dashboard')).history;
 for(const extra of [{queue_visibility:'tomorrow'},{queue_visibility:'due_date'},{queue_visibility:'due_date',due_on:'2026-02-30'}])await assert.rejects(call('save_chore',task(extra)));
 assert.deepEqual((await call('chores_dashboard')).history,before);
 const p=routine(addDays(day,7)),r=await call('save_chore_routine',p);assert.equal(r.steps[0].queue_visibility,'due_date');
 await assert.rejects(call('save_chore_routine',{...p,id:randomUUID(),request_id:randomUUID(),steps:[{...p.steps[0],queue_visibility:'never'}]}),/queue/);
 const edited=await call('save_chore_routine',{...r,actor:'rina',expected_version:r.version,request_id:randomUUID(),steps:[{...r.steps[0],queue_visibility:'immediately'}]});
 const d=await call('export_chores');assert.equal(d.routines.find((x:any)=>x.id===r.id).steps[0].queue_visibility,'immediately');
 assert.ok(d.tasks.filter((t:any)=>t.routine_id===edited.id).every((t:any)=>t.queue_visibility==='immediately'));
 await assert.rejects(db.transaction(async(tx:any)=>{await tx.exec('SET LOCAL ROLE anon');await tx.query("SELECT ledger_private.chore_queue_ready('{}',current_date)");}),/permission denied/);
});

test('queue release uses New York calendar days across midnight and daylight saving time',async()=>{
 for(const [before,after,date] of [['2026-10-26T03:59:59Z','2026-10-26T04:00:00Z','2026-10-26'],['2026-03-08T04:59:59Z','2026-03-08T05:00:00Z','2026-03-08'],['2026-11-02T04:59:59Z','2026-11-02T05:00:00Z','2026-11-02']]){
  const t={queue_visibility:'due_date',due_on:date,routine_id:null} as Chore;
  for(const [instant,ready] of [[before,false],[after,true]] as const){
   assert.equal(queueReady(t,localDateTime(instant).slice(0,10)),ready);
   const r=await db.query("SELECT ledger_private.chore_queue_ready($1::jsonb,($2::timestamptz AT TIME ZONE 'America/New_York')::date) AS ready",[JSON.stringify(t),instant]);assert.equal(r.rows[0].ready,ready);
  }
 }
});

test('installing queue timing preserves legacy records, projections, points and other ledgers',async()=>{
 const legacy=new PGlite();await legacy.waitReady;
 try{
  await legacy.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;');
  for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')&&Number(f.slice(0,3))<16).sort())await legacy.exec(await readFile('supabase/migrations/'+f,'utf8'));
  const rpc=(name:string,p?:any)=>callRpc(legacy,name,p?{p}:{});
  const r=await rpc('save_chore_routine',routine(addDays(day,6))),t=(await rpc('chores_dashboard')).tasks.find((t:any)=>t.routine_id===r.id);
  await rpc('save_chore',{...t,actor:'rina',action:'edit',expected_version:t.version,request_id:randomUUID(),note:'Individually edited before upgrade'});
  await rpc('save_chore',task({completion:{contributors:['rina'],completed_at:day+'T00:00'}}));
  const before=await rpc('chores_dashboard'),others=await Promise.all(['dashboard','misc_dashboard','bulletin_dashboard','events_dashboard'].map(n=>rpc(n)));
  const records=async()=>Promise.all(['chore_tasks','chore_task_events','chore_routine_events'].map(t=>legacy.query(`SELECT * FROM ledger_private.${t} ORDER BY id${t.endsWith('_events')?',version':''}`)));
  const raw=await records(),migration=await readFile('supabase/migrations/016_chore_queue_timing.sql','utf8');
  for(let i=0;i<2;i++){
   await legacy.exec(migration);assert.deepEqual(await records(),raw);
   const after=await rpc('chores_dashboard');assert.equal(after.queue_timing_version,1);
   for(const key of ['tasks','history','routines','routine_history','leaderboard','point_adjustments'])assert.deepEqual(after[key],before[key],key);
   const updated=await Promise.all(['dashboard','misc_dashboard','bulletin_dashboard','events_dashboard'].map(n=>rpc(n)));
   for(let k=0;k<others.length;k++){delete others[k].updated_at;delete updated[k].updated_at;assert.deepEqual(updated[k],others[k]);}
  }
 }finally{await legacy.close();}
});
