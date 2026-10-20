import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {openDatabase,callRpc} from '../scripts/database.mjs';
let db:any,beforeOther:any[];
const call=(fn:string,p?:any)=>callRpc(db,fn,p?{p}:{});
const dash=()=>call('bulletin_dashboard');
const draft=(extra={})=>({id:randomUUID(),request_id:randomUUID(),action:'create',actor:'rina',body:'Thank you for cleaning the kitchen!',temperature:65,recipients:['michal'],...extra});
const change=(n:any,action:string,extra={})=>call('save_bulletin_note',{...n,actor:'ohm',action,expected_version:n.version,request_id:randomUUID(),...extra});
before(async()=>{
 db=await openDatabase();
 await callRpc(db,'import_bills',{p:{request_id:randomUUID(),bills:JSON.parse(await readFile(new URL('../data/initial-bills.json',import.meta.url),'utf8'))}},'service_role');
 await call('save_misc_expense',{id:randomUUID(),request_id:randomUUID(),action:'create',actor:'michal',payer:'michal',description:'Preserve groceries',icon_id:'milk',amount_cents:100,participants:['rina','michal'],paid_on:'2026-01-01',split_mode:'equal'});
 await call('save_chore',{id:randomUUID(),request_id:randomUUID(),action:'create',actor:'michal',title:'Preserve this chore',note:'',icon_id:'trash',points:1,pinned:true,assignee:'ohm'});
 beforeOther=await Promise.all(['dashboard','misc_dashboard','chores_dashboard'].map(fn=>call(fn)));
});
after(async()=>{
 const after=await Promise.all(['dashboard','misc_dashboard','chores_dashboard'].map(fn=>call(fn)));
 for(let i=0;i<after.length;i++){delete after[i].updated_at;delete beforeOther[i].updated_at;assert.deepEqual(after[i],beforeOther[i]);}
 await db.close();
});
test('bulletin starts empty and only its functions expose private notes',async()=>{
 const d=await dash();assert.deepEqual(d.notes,[]);assert.deepEqual(d.history,[]);assert.equal(d.stats.length,24);
 for(const table of ['bulletin_note_events','current_bulletin_notes'])await assert.rejects(db.transaction(async(tx:any)=>{await tx.exec('SET LOCAL ROLE anon');await tx.query(`SELECT * FROM ledger_private.${table}`);}),/permission denied/);
});
test('temperature determines the corner; multiple recipients count once each, and retries count once',async()=>{
 const p=draft({recipients:['ohm','michal','rina']});const note=await call('save_bulletin_note',p);assert.equal(note.kind,'compliment');assert.equal(note.author,'rina');assert.deepEqual(note.recipients,['michal','rina','ohm']);
 assert.deepEqual(await call('save_bulletin_note',p),note);await assert.rejects(call('save_bulletin_note',{...p,temperature:66}),/already used/);
 const complaint=await call('save_bulletin_note',draft({actor:'rohil',temperature:-90,recipients:['ohm','michal'],body:'Please wash your own dishes.'}));assert.equal(complaint.kind,'complaint');
 const d=await dash(),get=(member:string,direction:string)=>d.stats.find((s:any)=>s.period==='all'&&s.member===member&&s.direction===direction);
 assert.equal(get('rina','written').compliments,1);assert.equal(get('rohil','written').complaints,1);
 for(const m of ['ohm','michal']){assert.equal(get(m,'received').complaints,1);assert.equal(get(m,'received').compliments,1);}
 assert.equal(get('rina','received').complaints,0);
});
test('edits keep attribution and placement dates; revised temperature and recipients update counts without duplicates',async()=>{
 const n=await call('save_bulletin_note',draft({temperature:-20,recipients:['ohm']}));
 const revised=await change(n,'edit',{temperature:80,recipients:['rohil'],body:'Thanks for taking care of it.',author:'michal',posted_at:'2000-01-01'});
 assert.equal(revised.author,'rina');assert.equal(revised.actor,'ohm');assert.equal(revised.posted_at,n.posted_at);assert.equal(revised.kind,'compliment');
 const d=await dash();assert.equal(d.notes.filter((x:any)=>x.id===n.id).length,1);assert.equal(d.history.filter((x:any)=>x.id===n.id).length,2);
 await assert.rejects(change(n,'edit'),/changed/);
});
test('deletion removes activity counts but retains revisions, and restoration recovers the note',async()=>{
 const before=await dash();const n=await call('save_bulletin_note',draft({temperature:-100}));
 const deleted=await change(n,'delete');assert.equal(deleted.deleted,true);assert.deepEqual((await dash()).stats,before.stats);
 await assert.rejects(change(deleted,'edit'),/Restore/);
 const restored=await change(deleted,'restore');assert.equal(restored.deleted,false);assert.equal(restored.author,n.author);assert.equal(restored.posted_at,n.posted_at);
 assert.equal((await dash()).history.filter((x:any)=>x.id===n.id).length,3);
});
test('old notes stay on the board and period charts use original posting time in New York',async()=>{
 const n=await call('save_bulletin_note',draft({temperature:-5}));
 await db.query("UPDATE ledger_private.bulletin_note_events SET data=jsonb_set(data,'{posted_at}','\"2020-01-01T12:00:00Z\"'::jsonb) WHERE id=$1",[n.id]);
 const d=await dash();assert.ok(d.notes.some((x:any)=>x.id===n.id&&!x.deleted));
 const all=d.stats.find((s:any)=>s.period==='all'&&s.member==='rina'&&s.direction==='written'),month=d.stats.find((s:any)=>s.period==='month'&&s.member==='rina'&&s.direction==='written');
 assert.equal(all.complaints,month.complaints+1);
});
test('invalid notes fail atomically and concurrent edits allow exactly one winner',async()=>{
 const before=await dash();for(const bad of [{body:''},{body:' '.repeat(10)},{body:'x'.repeat(601)},{temperature:0},{temperature:101},{temperature:-101},{temperature:1.5},{temperature:'20'},{temperature:null},{recipients:[]},{recipients:['ohm','ohm']},{recipients:['other']},{actor:'other'}])await assert.rejects(call('save_bulletin_note',draft(bad)));
 const d=await dash();for(const k of ['notes','history','stats'])assert.deepEqual(d[k],before[k]);
 const n=await call('save_bulletin_note',draft());const results=await Promise.allSettled(['First edit','Second edit'].map(body=>change(n,'edit',{body})));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
 const exported=await call('export_bulletin'),current=await dash();assert.deepEqual(exported.notes,current.notes);assert.deepEqual(exported.history,current.history);assert.deepEqual(exported.stats,current.stats);
});
