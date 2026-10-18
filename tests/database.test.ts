import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {openDatabase,callRpc} from '../scripts/database.mjs';
import {allocateBill} from '../src/ledger.ts';
let db:any;
const seed=JSON.parse(await readFile(new URL('../data/initial-bills.json',import.meta.url),'utf8'));
const call=(fn:string,p?:any,role='anon')=>callRpc(db,fn,p?{p}: {},role);
const importBills=(bills:any[])=>call('import_bills',{request_id:randomUUID(),bills},'service_role');
before(async()=>{db=await openDatabase();});after(async()=>{await db.close();});
test('anonymous visitors can read and record payments, but cannot import or access tables',async()=>{
 assert.deepEqual((await call('dashboard')).bills,[]);
 await assert.rejects(call('import_bills',{request_id:randomUUID(),bills:seed}),/permission denied/);
 await assert.rejects(db.transaction(async(tx:any)=>{await tx.exec('SET LOCAL ROLE anon');await tx.query('SELECT * FROM ledger_private.bill_versions');}),/permission denied/);
});
test('initial import is atomic and database allocations exactly match independent TypeScript calculations',async()=>{
 const result=await importBills(seed);assert.equal(result.length,7);
 const dashboard=await call('dashboard');
 assert.equal(dashboard.bills.length,7);assert.equal(dashboard.allocations.reduce((s:number,a:any)=>s+a.cents,0),42753);
 const order=(a:any,b:any)=>(a.bill_id+a.charge_index+a.month+a.member).localeCompare(b.bill_id+b.charge_index+b.month+b.member);
 assert.deepEqual(dashboard.allocations.sort(order),seed.flatMap(allocateBill).sort(order));
 assert.equal(dashboard.history.length,0);
 const bad={...seed[0],id:'invalid',start_date:'2026-02-30'};
 await assert.rejects(importBills([{...seed[0],id:'future',start_date:'2027-01-01',end_date:'2027-01-31'},bad]));
 assert.equal((await call('dashboard')).bills.length,7);
});
test('reimports are harmless; changed bills need the right version and cannot overlap',async()=>{
 const p={request_id:randomUUID(),bills:seed};const r=await call('import_bills',p,'service_role');
 assert.ok(r.every((x:any)=>x.status==='unchanged'));
 assert.deepEqual(await call('import_bills',p,'service_role'),r);
 await assert.rejects(call('import_bills',{...p,bills:seed.slice(0,1)},'service_role'),/reused/);
 await assert.rejects(importBills([{...seed[0],note:'Correction'}]),/changed since preview/);
 await assert.rejects(importBills([{...seed[0],id:'duplicate-period'}]),/overlap/);
});
test('payments support cross-session reads, edits, idempotence, stale-write rejection, and soft deletion',async()=>{
 const p={action:'create',payment_id:randomUUID(),request_id:randomUUID(),member_id:'rina',actor:'rina',amount_cents:1234,method:'venmo',other:'',paid_on:'2026-10-01'};
 const first=await call('save_payment',p);assert.equal(first.version,1);
 assert.deepEqual(await call('save_payment',p),first);
 assert.equal((await call('dashboard')).history.length,1);
 await assert.rejects(call('save_payment',{...p,amount_cents:999}),/already used/);
 const edited=await call('save_payment',{...p,request_id:randomUUID(),action:'edit',expected_version:1,amount_cents:2345,actor:'michal'});
 assert.equal(edited.version,2);
 await assert.rejects(call('save_payment',{...p,request_id:randomUUID(),action:'edit',expected_version:1}),/changed/);
 const removed=await call('save_payment',{action:'delete',payment_id:p.payment_id,request_id:randomUUID(),expected_version:2,actor:'rina'});
 assert.equal(removed.deleted,true);assert.equal((await call('dashboard')).history.length,3);
 await assert.rejects(call('save_payment',{...p,request_id:randomUUID(),action:'edit',expected_version:3}),/no longer exists/);
 for(const bad of [{amount_cents:-1},{amount_cents:1.5},{amount_cents:0},{method:'other',other:''},{paid_on:'2026-02-30'},{paid_on:'2099-01-01'},{member_id:'michal'}]){
  await assert.rejects(call('save_payment',{...p,payment_id:randomUUID(),request_id:randomUUID(),...bad}));
 }
});
test('opening balances require explicit versioned reconciliation and keep their original audit record',async()=>{
 const opening={...seed.find((b:any)=>b.utility==='gas'),id:'test-opening-gas',start_date:null,end_date:null,opening_before:'2026-08-01',charges:[{kind:'opening',amount_cents:100,label:'Earlier service'}]};
 await importBills([opening]);
 const prior={...opening,id:'gas:earlier',start_date:'2026-07-01',end_date:'2026-07-31',opening_before:null,charges:[{kind:'recurring',amount_cents:100,label:'Earlier service'}]};
 await assert.rejects(importBills([prior]),/Reconcile opening/);
 await importBills([{...prior,replaces_opening:[{id:'test-opening-gas',expected_version:1}]}]);
 const dashboard=await call('dashboard');
 assert.ok(!dashboard.bills.some((b:any)=>b.id==='test-opening-gas'));
 assert.ok(dashboard.bill_history.some((b:any)=>b.bill_id==='test-opening-gas'&&b.deleted));
 assert.equal(dashboard.allocations.reduce((s:number,a:any)=>s+a.cents,0),42853);
});
test('confirming August opening-charge dates preserves every roommate balance and payment history',async()=>{
 const isolated=await openDatabase();
 try {
  const earlier=seed.filter((b:any)=>b.utility!=='wifi'&&b.start_date==='2026-08-01');
  assert.equal(earlier.length,2);
  const legacy=seed.map((b:any)=>earlier.includes(b)?{...b,id:'opening-'+b.utility,start_date:null,end_date:null,opening_before:'2026-08-21',charges:b.charges.map((c:any)=>({...c,kind:'opening'}))}:b);
  await callRpc(isolated,'import_bills',{p:{request_id:randomUUID(),bills:legacy}},'service_role');
  await callRpc(isolated,'save_payment',{p:{action:'create',payment_id:randomUUID(),request_id:randomUUID(),member_id:'rina',actor:'rina',amount_cents:123,method:'venmo',paid_on:'2026-10-01'}});
  const before=await callRpc(isolated,'dashboard');
  await callRpc(isolated,'import_bills',{p:{request_id:randomUUID(),bills:earlier.map((b:any)=>({...b,replaces_opening:[{id:'opening-'+b.utility,expected_version:1}]}))}},'service_role');
  const after=await callRpc(isolated,'dashboard');
  const totals=(d:any)=>['michal','rina','ohm','rohil'].map(member=>d.allocations.filter((a:any)=>a.member===member).reduce((s:number,a:any)=>s+a.cents,0));
  assert.deepEqual(totals(before),totals(after));
  assert.deepEqual(before.history,after.history);
  assert.ok(after.allocations.every((a:any)=>a.month!=='opening'));
  assert.equal(after.bill_history.filter((b:any)=>b.deleted&&b.bill_id.startsWith('opening-')).length,2);
 } finally {await isolated.close();}
});
test('concurrent payment edits permit one winner and preserve the other revision',async()=>{
 const p={action:'create',payment_id:randomUUID(),request_id:randomUUID(),member_id:'ohm',actor:'ohm',amount_cents:500,method:'other',other:'cash',paid_on:'2026-10-01'};
 await call('save_payment',p);
 const results=await Promise.allSettled([700,900].map(amount_cents=>call('save_payment',{...p,action:'edit',expected_version:1,amount_cents,request_id:randomUUID()})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(results.filter(r=>r.status==='rejected').length,1);
});
