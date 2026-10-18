import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocateBill, normalizeBill, summarize, MEMBERS, type Bill } from '../src/ledger.ts';
const base:Bill={id:'electricity:test',utility:'electricity',start_date:'2026-08-21',end_date:'2026-09-17',source_hash:'a'.repeat(64),note:'',opening_before:null,charges:[{kind:'recurring',amount_cents:11200,label:'Service'}]};
test('28-day bill: 11 days among three and 17 among four, allocated to usage months',()=>{
 const a=allocateBill(base);
 assert.equal(a.reduce((s,x)=>s+x.cents,0),11200);
 assert.equal(a.filter(x=>x.month==='2026-08').reduce((s,x)=>s+x.cents,0),4400);
 assert.equal(a.filter(x=>x.member==='rohil').reduce((s,x)=>s+x.cents,0),1700);
 assert.equal(a.filter(x=>x.member==='rohil'&&x.month==='2026-08').length,0);
 assert.deepEqual(MEMBERS.map(m=>a.filter(x=>x.member===m).reduce((s,x)=>s+x.cents,0)),[3167,3167,3166,1700]);
});
test('boundary dates, credits, leap days, and one-time fees conserve every cent',()=>{
 for(const amount of [-5094,-1,0,1,2,3,5094])for(const [start,end]of[['2026-08-31','2026-08-31'],['2026-09-01','2026-09-01'],['2028-02-28','2028-03-01']]){
  const a=allocateBill({...base,start_date:start,end_date:end,charges:[{kind:'recurring',amount_cents:amount,label:'Service'}]});
  assert.equal(a.reduce((s,x)=>s+x.cents,0),amount);
  assert.deepEqual(a,allocateBill({...base,start_date:start,end_date:end,charges:[{kind:'recurring',amount_cents:amount,label:'Service'}]}));
 }
 const fees=allocateBill({...base,start_date:'2026-08-01',end_date:'2026-08-31',charges:[{kind:'one_time',amount_cents:10000,label:'Router'}]});
 assert.equal(fees.find(a=>a.member==='rohil')!.cents,2500);
 assert.throws(()=>normalizeBill({...base,start_date:'2026-02-30'}));
});
test('only latest nondeleted payment revisions reduce balance, overpayments remain credits',()=>{
 const bills=[{...base,version:1,deleted:false,created_at:'2026-10-01',actor:'michal'}];
 const event={payment_id:'p',version:1,member_id:'rina' as const,amount_cents:5000,method:'venmo' as const,other:'',paid_on:'2026-10-01',deleted:0,actor:'rina' as const,created_at:'2026-10-01'};
 assert.equal(summarize(bills,[event]).members.find(m=>m.id==='rina')!.balance_cents,-1833);
 assert.equal(summarize(bills,[event,{...event,version:2,amount_cents:1000}]).members.find(m=>m.id==='rina')!.balance_cents,2167);
 assert.equal(summarize(bills,[event,{...event,version:2,deleted:true}]).members.find(m=>m.id==='rina')!.balance_cents,3167);
});
