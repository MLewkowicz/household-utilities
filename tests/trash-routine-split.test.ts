import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {openDatabase,callRpc} from '../scripts/database.mjs';
import {addDays,weekStart} from '../src/chores';
import {suggestChoreIcon} from '../src/chore-icons';
import {previewPoints} from '../scripts/preview-points.mjs';
let db:any,day:string;
const call=(fn:string,p?:any)=>callRpc(db,fn,p?{p}:{});
const source='10986bd6-79a1-4a69-b799-e4938953c007',outId='1a7bbd79-0488-4b94-825d-6843207f75dc',bagId='c136b2d1-4cc0-4cf8-9ca4-a2195c32fcff';
const task=(extra={})=>({id:randomUUID(),request_id:randomUUID(),actor:'rina',action:'create',title:'A quick chore',icon_id:'trash-bag',note:'',points:0.5,kind:'chore',assignee:'rina',pinned:false,...extra});
const edit=(t:any,action:string,extra={})=>call('save_chore',{...t,actor:'rina',action,expected_version:t.version,request_id:randomUUID(),...extra});
before(async()=>{db=await openDatabase();day=(await call('chores_dashboard')).local_day;});
after(async()=>{await db.close();});

test('half-point chores retain exact credit for one to four helpers, edits, correction, undo, and export',async()=>{
 for(const people of [['rina'],['rina','ohm'],['rina','ohm','michal'],['rina','ohm','michal','rohil']]){
  let t=await call('save_chore',task());const completion={contributors:people,completed_at:day+'T00:00'};
  t=await edit(t,'complete',{completion});let d=await call('chores_dashboard');
  const entries=d.leaderboard.filter((r:any)=>r.period==='all').flatMap((r:any)=>r.entries.filter((e:any)=>e.id===t.id));
  assert.equal(entries.length,people.length);assert.ok(entries.every((e:any)=>e.units===6/people.length));assert.equal(entries.reduce((n:number,e:any)=>n+e.units,0),6);
  t=await edit(t,'edit',{title:'A half-point edit'});assert.equal(t.points,0.5);
  t=await edit(t,'complete',{points:1,completion});d=await call('export_chores');
  assert.equal(d.tasks.find((x:any)=>x.id===t.id).points,1);
  t=await edit(t,'complete',{points:0.5,completion});assert.equal(t.points,0.5);
  t=await edit(t,'undo');d=await call('chores_dashboard');assert.ok(d.leaderboard.every((r:any)=>!r.entries.some((e:any)=>e.id===t.id)));
 }
 assert.equal(suggestChoreIcon('Put in new trash bag'),'trash-bag');
 assert.equal(suggestChoreIcon('Take out the trash'),'trash');
 for(const points of [0.25,0.75,1.5,'0.5',-0.5])await assert.rejects(call('save_chore',task({points})));
 await assert.rejects(call('save_chore',task({kind:'request'})),/no points/);
 const d=await call('chores_dashboard');assert.doesNotThrow(()=>previewPoints(d,{from:day,through:day}));
});

test('the authorized trash conversion yields two half-point routines without duplicate tasks, lost history, notifications, or unrelated changes',async()=>{
 // Rehearse the conversion against its original schema: legacy records could
 // include early completions, which the later queue-timing guard now prevents.
 await db.close();db=new PGlite();await db.waitReady;
 await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;');
 for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')&&Number(f.slice(0,3))<=11).sort())await db.exec(await readFile('supabase/migrations/'+f,'utf8'));
 const start=addDays(weekStart(day),7);
 const p={id:source,request_id:randomUUID(),actor:'rina',title:'Take out the trash',start_week:start,interval_weeks:1,owners:['ohm','michal','rina','rohil'],start_index:0,enabled:true,steps:[{id:outId,title:'Take out the trash',points:1,weekday:0,time:null,icon_id:'trash',note:''},{id:bagId,title:'Put in new trash bag',points:1,weekday:0,time:null,icon_id:'tidy',note:''}]};
 await call('save_chore_routine',p);
 await call('save_chore_routine',{...p,expected_version:1,request_id:randomUUID(),steps:p.steps.map(s=>s.id===bagId?{...s,points:0}:s)});
 let d=await call('chores_dashboard');
 const out=d.tasks.find((t:any)=>t.routine_id===source&&t.cycle_start===start&&t.step_id===outId),bag=d.tasks.find((t:any)=>t.routine_id===source&&t.cycle_start===start&&t.step_id===bagId);
 await edit(out,'complete',{completion:{contributors:['rina','ohm'],completed_at:day+'T00:00'}});
 await edit(bag,'edit',{note:'Keep this individual note'});
 const before=await call('chores_dashboard');
 const otherLedgers=await Promise.all(['dashboard','misc_dashboard','bulletin_dashboard'].map(n=>call(n)));
 const notifications=await db.query('SELECT * FROM ledger_private.push_events ORDER BY id');
 const ids=before.tasks.filter((t:any)=>t.routine_id===source).map((t:any)=>t.id).sort();
 const migration=await readFile(new URL('../supabase/migrations/012_split_trash_routine.sql',import.meta.url),'utf8');
 await db.exec(migration);d=await call('chores_dashboard');
 const bagRoutine=d.routines.find((r:any)=>r.title==='Put in new trash bag'),outRoutine=d.routines.find((r:any)=>r.id===source);
 assert.ok(bagRoutine);assert.notEqual(bagRoutine.id,source);assert.equal(bagRoutine.occurrence_root,source);
 for(const r of [bagRoutine,outRoutine]){assert.equal(r.steps.length,1);assert.equal(r.steps[0].points,0.5);assert.equal(r.steps[0].kind,'chore');assert.equal(r.start_week,start);assert.deepEqual(r.owners,p.owners);assert.equal(r.version,2);}
 assert.equal(bagRoutine.steps[0].icon_id,'trash-bag');
 const afterTasks=d.tasks.filter((t:any)=>[source,bagRoutine.id].includes(t.routine_id));assert.deepEqual(afterTasks.map((t:any)=>t.id).sort(),ids);assert.equal(new Set(ids).size,ids.length);
 for(const old of before.tasks.filter((t:any)=>t.routine_id===source)){
  const next=afterTasks.find((t:any)=>t.id===old.id);assert.equal(next.points,0.5);
  for(const key of ['id','version','created_at','actor','title','note','due_on','due_at','assignee','state','completion','cycle_start','cycle_end'])assert.deepEqual(next[key],old[key],key);
 }
 for(const old of before.history){const next=d.history.find((t:any)=>t.id===old.id&&t.version===old.version);for(const key of ['id','version','actor','action','change_note','created_at','completion'])assert.deepEqual(next[key],old[key],key);}
 assert.deepEqual(d.tasks.filter((t:any)=>!ids.includes(t.id)),before.tasks.filter((t:any)=>!ids.includes(t.id)));
 for(const who of ['rina','ohm'])assert.equal(d.leaderboard.find((r:any)=>r.period==='all'&&r.member===who).entries.find((e:any)=>e.id===out.id).units,3);
 assert.deepEqual(await db.query('SELECT * FROM ledger_private.push_events ORDER BY id'),notifications);
 const ledgers=await Promise.all(['dashboard','misc_dashboard','bulletin_dashboard'].map(n=>call(n)));for(let i=0;i<ledgers.length;i++){delete otherLedgers[i].updated_at;delete ledgers[i].updated_at;assert.deepEqual(ledgers[i],otherLedgers[i]);}
 const converted=structuredClone(d);await db.exec(migration);d=await call('chores_dashboard');delete converted.updated_at;delete d.updated_at;assert.deepEqual(d,converted);
 // Future routine edits retain the original occurrence keys, and a forged root
 // supplied by the browser cannot redirect a routine onto other tasks.
 await call('save_chore_routine',{...bagRoutine,actor:'rina',request_id:randomUUID(),expected_version:2,title:'Fresh liner',occurrence_root:'forged-root',steps:bagRoutine.steps.map((s:any)=>({...s,title:'Fresh liner'}))});
 d=await call('chores_dashboard');const updated=d.routines.find((r:any)=>r.id===bagRoutine.id);assert.equal(updated.occurrence_root,source);
 assert.deepEqual(d.tasks.filter((t:any)=>[source,bagRoutine.id].includes(t.routine_id)).map((t:any)=>t.id).sort(),ids);
 assert.equal(d.tasks.find((t:any)=>t.id===bag.id).note,'Keep this individual note');
 assert.ok(d.tasks.some((t:any)=>t.title==='Fresh liner'));
 await assert.rejects(db.transaction(async(tx:any)=>{await tx.exec('SET LOCAL ROLE anon');await tx.query('SELECT * FROM ledger_private.chore_routine_splits');}),/permission denied/);
});
