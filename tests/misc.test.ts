import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {openDatabase,callRpc} from '../scripts/database.mjs';
import {equalShares,pairBalances,parseAmount} from '../src/misc-ledger.ts';
import {MEMBERS} from '../src/ledger.ts';
let db:any,original:any;
const call=(fn:string,p?:any)=>callRpc(db,fn,p?{p}:{});
const dashboard=()=>call('misc_dashboard');
const draft=(extra={})=>({id:randomUUID(),request_id:randomUUID(),action:'create',actor:'rina',payer:'rina',description:'Paper towels',icon_id:'paper-towels',amount_cents:2400,paid_on:'2026-10-01',split_mode:'equal',participants:[...MEMBERS],...extra});
const save=async(p:any)=>call('save_misc_expense',{expected_rounding_cursor:(await dashboard()).rounding_cursor,...p});
before(async()=>{
 db=await openDatabase();
 const seed=JSON.parse(await readFile(new URL('../data/initial-bills.json',import.meta.url),'utf8'));
 await callRpc(db,'import_bills',{p:{request_id:randomUUID(),bills:seed}},'service_role');
 original=await call('dashboard');
});
after(async()=>{
 const current=await call('dashboard');
 for (const field of ['bills','bill_history','history','allocations']) assert.deepEqual(current[field],original[field],`Miscellaneous changed utility ${field}`);
 await db.close();
});
test('miscellaneous starts empty and private tables cannot be read or modified anonymously',async()=>{
 const d=await dashboard();assert.deepEqual(d.expenses,[]);assert.deepEqual(d.pairs,[]);
 for(const table of ['misc_expense_events','misc_settlement_events','misc_rounding']) {
  await assert.rejects(db.transaction(async(tx:any)=>{await tx.exec('SET LOCAL ROLE anon');await tx.query(`SELECT * FROM ledger_private.${table}`);}),/permission denied/);
 }
 await assert.rejects(db.transaction(async(tx:any)=>{await tx.exec('SET LOCAL ROLE anon');await tx.query("SELECT ledger_private.save_misc('expense','{}')");}),/permission denied/);
});
test('equal and custom shares create debts only between the participating people and payer',async()=>{
 const first=await save(draft());assert.deepEqual(first.shares,{michal:600,rina:600,ohm:600,rohil:600});
 assert.deepEqual((await dashboard()).pairs,pairBalances([first],[]));
 const second=await save(draft({payer:'ohm',amount_cents:1200,participants:['rina','ohm']}));
 let d=await dashboard();assert.ok(!d.pairs.some((p:any)=>[p.sender,p.recipient].sort().join(',')==='ohm,rina'));
 assert.deepEqual(d.pairs,pairBalances(d.expenses,d.settlements));
 const excluded=await save(draft({payer:'michal',participants:['rina'],amount_cents:700,paid_on:'2026-08-01'}));
 assert.deepEqual(excluded.shares,{rina:700});
 const custom=await save(draft({split_mode:'custom',amount_cents:1001,participants:['rohil','ohm'],shares:{rohil:800,ohm:201}}));
 assert.deepEqual(custom.shares,{rohil:800,ohm:201});
 d=await dashboard();assert.deepEqual(d.pairs,pairBalances(d.expenses,d.settlements));
});
test('pennies rotate, retries do not consume turns, and descriptive edits preserve exact shares',async()=>{
 const start=(await dashboard()).rounding_cursor;
 const winners=[];
 for(let i=0;i<4;i++){
  const p={...draft({amount_cents:1}),expected_rounding_cursor:(await dashboard()).rounding_cursor};
  const result=await call('save_misc_expense',p);
  assert.deepEqual(result.shares,equalShares(1,[...MEMBERS],p.expected_rounding_cursor));
  winners.push(Object.entries(result.shares).find(([,c])=>c===1)![0]);
  const cursor=(await dashboard()).rounding_cursor;
  assert.deepEqual(await call('save_misc_expense',p),result);
  assert.equal((await dashboard()).rounding_cursor,cursor);
  const edit=await save({...p,action:'edit',expected_version:1,request_id:randomUUID(),description:'Paper towels corrected',icon_id:'sponge'});
  assert.deepEqual(edit.shares,result.shares);assert.equal((await dashboard()).rounding_cursor,cursor);
  await assert.rejects(call('save_misc_expense',{...p,description:'Changed retry'}),/already used/);
 }
 assert.equal(new Set(winners).size,4);assert.equal((await dashboard()).rounding_cursor,start);
 const before=await dashboard();const p=draft({amount_cents:7,participants:['michal','rina','ohm']});
 const created=await save(p);assert.equal(Object.values(created.shares).reduce((a:any,b:any)=>a+b,0),7);
 const after=await dashboard();
 for(const previous of before.expenses) assert.deepEqual(after.expenses.find((e:any)=>e.id===previous.id),previous);
});
test('edits and deletion recalculate only the affected expense, keep history, and reject stale writes',async()=>{
 const p=draft({amount_cents:100,participants:['rina','ohm']});
 await save(p);
 const revised=await save({...p,action:'edit',expected_version:1,request_id:randomUUID(),payer:'michal',split_mode:'custom',shares:{rina:70,ohm:30}});
 assert.equal(revised.version,2);assert.deepEqual(revised.shares,{rina:70,ohm:30});
 await assert.rejects(save({...p,action:'edit',expected_version:1,request_id:randomUUID()}),/changed/);
 const removed=await save({action:'delete',id:p.id,expected_version:2,request_id:randomUUID(),actor:'ohm'});
 assert.equal(removed.deleted,true);
 const d=await dashboard();assert.equal(d.expense_history.filter((e:any)=>e.id===p.id).length,3);
 assert.deepEqual(d.pairs,pairBalances(d.expenses,d.settlements));
});
test('repayments support partial amounts, overpayments, edits, deletion, and idempotence',async()=>{
 const p={action:'create',id:randomUUID(),request_id:randomUUID(),actor:'ohm',sender:'ohm',recipient:'rina',amount_cents:100000,paid_on:'2026-10-01',method:'other',other:'cash'};
 const first=await call('save_misc_settlement',p);
 assert.deepEqual(await call('save_misc_settlement',p),first);
 let d=await dashboard();assert.ok(d.pairs.some((p:any)=>p.sender==='rina'&&p.recipient==='ohm'));
 assert.deepEqual(d.pairs,pairBalances(d.expenses,d.settlements));
 await call('save_misc_settlement',{...p,action:'edit',expected_version:1,request_id:randomUUID(),amount_cents:50,method:'venmo'});
 d=await dashboard();assert.deepEqual(d.pairs,pairBalances(d.expenses,d.settlements));
 await assert.rejects(call('save_misc_settlement',{...p,action:'edit',expected_version:1,request_id:randomUUID()}),/changed/);
 await call('save_misc_settlement',{action:'delete',id:p.id,expected_version:2,request_id:randomUUID(),actor:'rina'});
 d=await dashboard();assert.equal(d.settlement_history.filter((e:any)=>e.id===p.id).length,3);
 assert.deepEqual(d.pairs,pairBalances(d.expenses,d.settlements));
});
test('invalid entries and stale penny previews fail atomically',async()=>{
 const before=await dashboard();
 for(const bad of [{participants:[]},{participants:['rina','rina']},{participants:['stranger']},{participants:[null]},{amount_cents:-1},{amount_cents:1.2},{amount_cents:0},{description:''},{description:'x'.repeat(161)},{icon_id:'<svg>'},{paid_on:'2026-02-30'},{paid_on:'2099-01-01'},{actor:'other'},{payer:'other'},{split_mode:'custom',shares:{michal:600,rina:600,ohm:600,rohil:599}},{split_mode:'custom',shares:{michal:600,rina:600,ohm:600,rohil:600,other:0}},{split_mode:'custom',shares:{michal:600,rina:600,ohm:601,rohil:-1}}]) await assert.rejects(save(draft(bad)));
 await assert.rejects(save(draft({amount_cents:1,expected_rounding_cursor:(before.rounding_cursor+1)%4})),/preview changed/);
 for(const bad of [{sender:'rina',recipient:'rina'},{method:'other',other:''},{amount_cents:0}]) await assert.rejects(call('save_misc_settlement',{action:'create',id:randomUUID(),request_id:randomUUID(),actor:'rina',sender:'rina',recipient:'ohm',amount_cents:100,method:'zelle',other:'',paid_on:'2026-10-01',...bad}));
 const after=await dashboard();for(const k of ['expenses','settlements','expense_history','settlement_history','pairs','rounding_cursor'])assert.deepEqual(after[k],before[k]);
});
test('concurrent revisions allow one winner, and all data exports with its history',async()=>{
 const p=draft();await save(p);
 const outcomes=await Promise.allSettled(['First','Second'].map(description=>save({...p,description,action:'edit',expected_version:1,request_id:randomUUID()})));
 assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);
 assert.equal(outcomes.filter(o=>o.status==='rejected').length,1);
 const exported=await call('export_misc_ledger');const d=await dashboard();
 assert.deepEqual(exported.expense_history,d.expense_history);assert.deepEqual(exported.pairs,d.pairs);
});
test('amount parsing uses integer cents and rejects ambiguous formats',()=>{
 assert.equal(parseAmount('12.34'),1234);assert.equal(parseAmount('0',true),0);
 for(const s of ['-1','1.234','1e3','NaN','0','1000000.01'])assert.throws(()=>parseAmount(s));
});
