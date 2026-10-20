import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {openDatabase,callRpc} from '../scripts/database.mjs';
let db:any,utilities:any,misc:any,day:string,monday:string;
const call=(fn:string,p?:any)=>callRpc(db,fn,p?{p}:{});
const dash=()=>call('chores_dashboard');
const addDays=(d:string,n:number)=>new Date(Date.parse(d+'T12:00:00Z')+n*864e5).toISOString().slice(0,10);
const task=(extra={})=>({id:randomUUID(),request_id:randomUUID(),actor:'rohil',action:'create',title:'Pick up bananas',icon_id:'bananas',note:'At the end of the day',assignee:'michal',points:1,pinned:false,due_on:null,due_time:null,expires_on:null,expires_time:null,...extra});
const edit=(t:any,action:string,extra={})=>call('save_chore',{...t,id:t.id,expected_version:t.version,actor:'ohm',action,request_id:randomUUID(),...extra});
const routine=(extra={})=>({id:randomUUID(),request_id:randomUUID(),actor:'rina',title:'Trash cycle',start_week:monday,interval_weeks:1,owners:['michal','rina','ohm','rohil'],start_index:0,enabled:true,steps:[{id:'out',title:'Trash out',icon_id:'trash',note:'For collection',points:2,weekday:0,time:'20:00'},{id:'in',title:'Bring bins back',icon_id:'bins',note:'',points:1,weekday:1,time:null}],...extra});
const completion=(contributors=['michal'])=>({contributors,completed_at:day+'T00:00'});
before(async()=>{
 db=await openDatabase();
 const seed=JSON.parse(await readFile(new URL('../data/initial-bills.json',import.meta.url),'utf8'));
 await callRpc(db,'import_bills',{p:{request_id:randomUUID(),bills:seed}},'service_role');
 await call('save_misc_expense',{id:randomUUID(),request_id:randomUUID(),actor:'rina',action:'create',payer:'rina',description:'Preserve this purchase',icon_id:'milk',amount_cents:400,paid_on:'2026-01-01',participants:['rina','ohm'],split_mode:'equal'});
 utilities=await call('dashboard');misc=await call('misc_dashboard');
 day=(await dash()).local_day;
 monday=(await db.query("SELECT date_trunc('week',now() AT TIME ZONE 'America/New_York')::date::text AS d")).rows[0].d;
});
after(async()=>{
 const u=await call('dashboard'),m=await call('misc_dashboard');
 for(const k of ['bills','allocations','history','bill_history'])assert.deepEqual(u[k],utilities[k]);
 for(const k of ['expenses','expense_history','settlements','settlement_history','pairs','rounding_cursor'])assert.deepEqual(m[k],misc[k]);
 await db.close();
});
test('starts empty, tables and helpers stay private',async()=>{
 const d=await dash();assert.deepEqual(d.tasks,[]);assert.equal(d.leaderboard.length,12);
 for(const table of ['chore_tasks','chore_task_events','chore_routine_events','current_chores'])await assert.rejects(db.transaction(async(tx:any)=>{await tx.exec('SET LOCAL ROLE anon');await tx.query(`SELECT * FROM ledger_private.${table}`);}),/permission denied/);
 await assert.rejects(db.transaction(async(tx:any)=>{await tx.exec('SET LOCAL ROLE anon');await tx.query("SELECT ledger_private.materialize_chores()");}),/permission denied/);
});
test('requests, claiming, hand-back and cancellation preserve actors, retries and revisions',async()=>{
 const p=task({assignee:null,pinned:true});let t=await call('save_chore',p);
 assert.deepEqual(await call('save_chore',p),t);
 await assert.rejects(call('save_chore',{...p,title:'changed retry'}),/already used/);
 t=await edit(t,'claim');assert.equal(t.assignee,'ohm');assert.equal(t.requester,'rohil');
 t=await edit(t,'hand_back',{change_note:'Can someone cover?'});assert.equal(t.assignee,null);
 t=await edit(t,'edit',{title:'Bananas for everyone',assignee:'rina'});assert.equal(t.assignee,'rina');
 await assert.rejects(edit({...t,version:1},'cancel'),/changed/);
 t=await edit(t,'cancel');assert.equal(t.state,'cancelled');
 t=await edit(t,'reopen');assert.equal(t.state,'active');
 const revisions=(await dash()).history.filter((h:any)=>h.id===t.id);assert.equal(revisions.length,6);assert.ok(revisions.some((h:any)=>h.change_note==='Can someone cover?'));
});
test('shared credit is exact for two, three, and four contributors; corrections and undo reverse it',async()=>{
 for(const people of [['michal','rina'],['michal','rina','ohm'],['michal','rina','ohm','rohil']]){
  let t=await call('save_chore',task({points:1,completion:completion(people)}));
  let d=await dash();
  for(const who of people)assert.equal(d.leaderboard.find((r:any)=>r.period==='all'&&r.member===who).entries.find((e:any)=>e.id===t.id).units,12/people.length);
  t=await edit(t,'complete',{points:3,completion:completion(['ohm'])});
  d=await dash();assert.equal(d.leaderboard.find((r:any)=>r.period==='all'&&r.member==='ohm').entries.find((e:any)=>e.id===t.id).units,36);
  assert.ok(!d.leaderboard.find((r:any)=>r.period==='all'&&r.member==='michal').entries.some((e:any)=>e.id===t.id));
  t=await edit(t,'undo');d=await dash();assert.ok(d.leaderboard.every((r:any)=>!r.entries.some((e:any)=>e.id===t.id)));
 }
});
test('dates use New York midnight across DST; expired work is retained and undo restores expiry',async()=>{
 const sql="SELECT (ledger_private.chore_deadline($1,NULL) AT TIME ZONE 'UTC')::text AS t";
 assert.match((await db.query(sql,['2026-03-08'])).rows[0].t,/2026-03-09 04:00:00/);
 assert.match((await db.query(sql,['2026-11-01'])).rows[0].t,/2026-11-02 05:00:00/);
 let t=await call('save_chore',task({due_on:'2026-01-01',expires_on:'2026-01-02'}));
 assert.equal((await dash()).tasks.find((x:any)=>x.id===t.id).status,'expired');
 t=await edit(t,'complete',{points:1,completion:{contributors:['rina'],completed_at:'2026-01-01T18:00'}});
 let d=await dash();assert.equal(d.tasks.find((x:any)=>x.id===t.id).status,'completed');
 assert.ok(d.leaderboard.find((r:any)=>r.member==='rina'&&r.period==='all').entries.some((e:any)=>e.id===t.id));
 assert.ok(!d.leaderboard.find((r:any)=>r.member==='rina'&&r.period==='month').entries.some((e:any)=>e.id===t.id));
 t=await edit(t,'undo');assert.equal((await dash()).tasks.find((x:any)=>x.id===t.id).status,'expired');
});
test('weekly grouped chores rotate on schedule, missed weeks are retained, and cover does not shift ownership',async()=>{
 const p=routine({start_week:addDays(monday,-14)});const r=await call('save_chore_routine',p);
 assert.deepEqual(await call('save_chore_routine',p),r);
 let d=await dash(),tasks=d.tasks.filter((t:any)=>t.routine_id===r.id);
 for(const [cycle,owner] of [[-14,'michal'],[-7,'rina'],[0,'ohm'],[7,'rohil']] as const){
  const pair=tasks.filter((t:any)=>t.cycle_start===addDays(monday,cycle));assert.equal(pair.length,2);assert.ok(pair.every((t:any)=>t.assignee===owner));
  if(cycle<0)assert.ok(pair.every((t:any)=>t.status==='missed'));
 }
 const nowTask=tasks.find((t:any)=>t.cycle_start===monday);
 await edit(nowTask,'complete',{points:2,completion:completion(['michal','rohil'])});
 d=await dash();assert.equal(d.tasks.find((t:any)=>t.routine_id===r.id&&t.cycle_start===addDays(monday,7)).assignee,'rohil');
 const count=d.tasks.length;await dash();assert.equal((await dash()).tasks.length,count);
});
test('routine edits apply next cycle, with explicit future overrides and completed history preserved',async()=>{
 const p=routine(),r=await call('save_chore_routine',p);let d=await dash();
 const next=d.tasks.find((t:any)=>t.routine_id===r.id&&t.cycle_start===addDays(monday,7)&&t.step_id==='out');
 await edit(next,'edit',{title:'Special collection',assignee:'rohil'});
 const before=(await dash()).tasks.filter((t:any)=>t.routine_id===r.id&&t.cycle_start===monday);
 const update={...p,expected_version:1,request_id:randomUUID(),owners:['ohm'],title:'Revised routine',steps:p.steps.map(s=>({...s,title:'Updated '+s.title}))};
 const revised=await call('save_chore_routine',update);assert.equal(revised.effective_on,addDays(monday,7));
 d=await dash();assert.deepEqual(d.tasks.filter((t:any)=>t.routine_id===r.id&&t.cycle_start===monday),before);
 const future=d.tasks.filter((t:any)=>t.routine_id===r.id&&t.cycle_start===addDays(monday,7));
 assert.equal(future.find((t:any)=>t.step_id==='out').title,'Special collection');assert.equal(future.find((t:any)=>t.step_id==='out').assignee,'rohil');
 assert.equal(future.find((t:any)=>t.step_id==='in').assignee,'ohm');
 await assert.rejects(call('save_chore_routine',{...update,request_id:randomUUID()}),/changed/);
 await call('save_chore_routine',{...update,expected_version:2,request_id:randomUUID(),enabled:false});
 d=await dash();assert.equal(d.tasks.filter((t:any)=>t.routine_id===r.id&&t.cycle_start===addDays(monday,14)).length,0);
 assert.ok(d.tasks.some((t:any)=>t.id===next.id));
});
test('every-N-week rotation, initial owner and leaderboard ties are deterministic',async()=>{
 const r=await call('save_chore_routine',routine({interval_weeks:2,start_index:2}));
 const d=await dash(),ts=d.tasks.filter((t:any)=>t.routine_id===r.id);
 assert.ok(ts.filter((t:any)=>t.cycle_start===monday).every((t:any)=>t.assignee==='ohm'));
 assert.equal(ts.filter((t:any)=>t.cycle_start===addDays(monday,7)).length,0);
 assert.ok(ts.filter((t:any)=>t.cycle_start===addDays(monday,14)).every((t:any)=>t.assignee==='rohil'));
 const ranks=d.leaderboard.filter((r:any)=>r.period==='all');
 for(const a of ranks)for(const b of ranks)if(a.units===b.units)assert.equal(a.rank,b.rank);
});
test('invalid submissions fail atomically; concurrent completions award once and export has revisions',async()=>{
 const before=await dash();
 for(const bad of [{actor:'stranger'},{assignee:'stranger'},{points:1.5},{points:0},{pinned:'yes'},{title:''},{icon_id:'<script>'},{due_on:'2026-02-30'},{due_time:'99:00'},{expires_on:'2020-01-01',due_on:'2026-01-01'},{completion:completion([])},{completion:completion(['rina','rina'])},{completion:{contributors:['rina'],completed_at:'2099-01-01T10:00'}}])await assert.rejects(call('save_chore',task(bad)));
 for(const bad of [{owners:[]},{owners:['ohm','ohm']},{steps:[]},{interval_weeks:0},{start_week:addDays(monday,1)},{start_index:4},{steps:[{id:'bad',title:'Oops',points:1,icon_id:'trash',weekday:7,time:null}]}])await assert.rejects(call('save_chore_routine',routine(bad)));
 const after=await dash();for(const k of ['tasks','history','routines','routine_history','leaderboard'])assert.deepEqual(after[k],before[k]);
 const t=await call('save_chore',task());
 const results=await Promise.allSettled([['rina'],['ohm']].map(people=>edit(t,'complete',{points:1,completion:completion(people)})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const d=await dash();assert.equal(d.leaderboard.filter((r:any)=>r.period==='all').flatMap((r:any)=>r.entries.filter((e:any)=>e.id===t.id)).length,1);
 const exported=await call('export_chores');assert.deepEqual(exported.history,d.history);assert.deepEqual(exported.routine_history,d.routine_history);
});
