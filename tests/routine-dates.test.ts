import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {openDatabase,callRpc} from '../scripts/database.mjs';
import {addDays,weekStart} from '../src/chores';
let db:any,day:string;
const call=(fn:string,p?:any)=>callRpc(db,fn,p?{p}:{});
const routine=(start:string,extra={})=>({id:randomUUID(),request_id:randomUUID(),actor:'rina',title:'Water the plants',start_week:start,interval_weeks:1,owners:['rina','ohm'],start_index:0,enabled:true,steps:[{id:'item',kind:'chore',title:'Water the plants',icon_id:'plant',note:'',points:1,weekday:0,time:'18:00'}],...extra});
before(async()=>{db=await openDatabase();day=(await call('chores_dashboard')).local_day;});
after(async()=>{await db.close();});

test('a recurring item starts on any selected weekday, with no earlier occurrence or extra items',async()=>{
 for(let offset=0;offset<7;offset++){
  const start=addDays(weekStart(day),7+offset),p=routine(start,{interval_weeks:2,start_index:1});
  const saved=await call('save_chore_routine',p);assert.deepEqual(await call('save_chore_routine',p),saved);
  const tasks=(await call('chores_dashboard')).tasks.filter((t:any)=>t.routine_id===saved.id).sort((a:any,b:any)=>a.due_on.localeCompare(b.due_on));
  assert.ok(tasks.length>=5);
  for(const [i,t] of tasks.entries()){
   assert.equal(t.due_on,addDays(start,i*14));assert.equal(t.cycle_start,t.due_on);
   assert.equal(t.assignee,i%2===0?'ohm':'rina');assert.equal(t.projected,true);
   assert.equal(t.step_id,'item');assert.equal(t.title,'Water the plants');
  }
  const before=await db.query('SELECT id FROM ledger_private.chore_occurrences($1::date) WHERE data->>\'routine_id\'=$2',[addDays(start,-1),saved.id]);
  assert.deepEqual(before.rows,[]);
  const actual=await db.query('SELECT id FROM ledger_private.chore_tasks WHERE data->>\'routine_id\'=$1',[saved.id]);
  assert.deepEqual(actual.rows,[]);
 }
});

test('non-Monday edits, pauses, and rotations preserve completed work and individual overrides',async()=>{
 let start=addDays(weekStart(day),1);if(start>day)start=addDays(start,-7);
 const p=routine(start),r=await call('save_chore_routine',p);
 let tasks=(await call('chores_dashboard')).tasks.filter((t:any)=>t.routine_id===r.id);
 const current=tasks.find((t:any)=>t.cycle_start===start),next=tasks.find((t:any)=>t.cycle_start===addDays(start,7));
 await call('save_chore',{...current,actor:'rina',expected_version:current.version,request_id:randomUUID(),action:'complete',completion:{contributors:['rina'],completed_at:day+'T00:00'}});
 await call('save_chore',{...next,title:'Special watering',actor:'ohm',expected_version:next.version,request_id:randomUUID(),action:'edit'});
 const before=await call('chores_dashboard');
 const updated={...p,title:'Water all the plants',steps:p.steps.map(s=>({...s,title:'Water all the plants'})),expected_version:1,request_id:randomUUID()};
 const edited=await call('save_chore_routine',updated);assert.equal(edited.effective_on,addDays(start,7));
 let after=await call('chores_dashboard');
 assert.deepEqual(after.tasks.find((t:any)=>t.id===current.id),before.tasks.find((t:any)=>t.id===current.id));
 assert.deepEqual(after.tasks.find((t:any)=>t.id===next.id),before.tasks.find((t:any)=>t.id===next.id));
 assert.equal(after.tasks.find((t:any)=>t.routine_id===r.id&&t.cycle_start===addDays(start,14)).title,'Water all the plants');
 assert.deepEqual(after.leaderboard,before.leaderboard);
 await assert.rejects(call('save_chore_routine',{...updated,request_id:randomUUID()}),/changed/);
 await call('save_chore_routine',{...updated,expected_version:2,enabled:false,request_id:randomUUID()});
 after=await call('chores_dashboard');
 tasks=after.tasks.filter((t:any)=>t.routine_id===r.id);assert.equal(tasks.length,2);
 assert.deepEqual(after.history,before.history);assert.deepEqual(after.leaderboard,before.leaderboard);
});

test('selected-date recurrence keeps local time across daylight saving changes',async()=>{
 const p=routine('2026-03-01',{owners:['rina']});await call('save_chore_routine',p);
 const result=await db.query("SELECT data->>'due_on' AS day,extract(epoch FROM (data->>'due_at')::timestamptz) AS due_epoch FROM ledger_private.chore_occurrences('2026-03-08') WHERE data->>'routine_id'=$1 ORDER BY data->>'due_on'",[p.id]);
 assert.equal(new Date(Number(result.rows[0].due_epoch)*1000).toISOString(),'2026-03-01T23:00:00.000Z');
 assert.equal(new Date(Number(result.rows[1].due_epoch)*1000).toISOString(),'2026-03-08T22:00:00.000Z');
 await assert.rejects(call('save_chore_routine',routine('2026-02-30')));
 await assert.rejects(call('save_chore_routine',routine(addDays(day,366))),/next year/);
 await assert.rejects(db.transaction(async(tx:any)=>{await tx.exec('SET LOCAL ROLE anon');await tx.query("SELECT ledger_private.chore_routine_start('2026-10-20')");}),/permission denied/);
});

test('the date upgrade preserves legacy grouped schedules, saved occurrences, revisions, and scores on repeated installation',async()=>{
 const legacy=new PGlite();await legacy.waitReady;
 try{
  await legacy.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;');
  for(const file of ['001_utilities','002_rotating_rounding','003_miscellaneous','004_expand_icon_catalog','005_chores','006_chore_reminders','007_bulletin','008_notifications','009_task_refresh'])await legacy.exec(await readFile(new URL(`../supabase/migrations/${file}.sql`,import.meta.url),'utf8'));
  const p=routine(addDays(weekStart(day),-7));p.steps.push({...p.steps[0],id:'second',title:'Refill watering can',weekday:2});
  await callRpc(legacy,'save_chore_routine',{p});
  const tasks=(await callRpc(legacy,'chores_dashboard')).tasks;
  const first=tasks.find((t:any)=>!t.projected),future=tasks.find((t:any)=>t.projected);
  await callRpc(legacy,'save_chore',{p:{...first,actor:'rina',expected_version:first.version,action:'complete',request_id:randomUUID(),completion:{contributors:['rina'],completed_at:day+'T00:00'}}});
  await callRpc(legacy,'save_chore',{p:{...future,title:'One special occurrence',actor:'rina',expected_version:future.version,action:'edit',request_id:randomUUID()}});
  const before=await callRpc(legacy,'chores_dashboard');
  const raw=async()=>Promise.all(['chore_tasks','chore_task_events','chore_routine_events'].map(t=>legacy.query(`SELECT * FROM ledger_private.${t} ORDER BY id${t.endsWith('_events')?',version':''}`)));
  const records=await raw(),migration=await readFile(new URL('../supabase/migrations/010_routine_start_dates.sql',import.meta.url),'utf8');
  for(let i=0;i<2;i++){
   await legacy.exec(migration);assert.deepEqual(await raw(),records);
   const after=await callRpc(legacy,'chores_dashboard');
   for(const k of ['tasks','routines','history','routine_history','leaderboard'])assert.deepEqual(after[k],before[k],k);
  }
 }finally{await legacy.close();}
});
