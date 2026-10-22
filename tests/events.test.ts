import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {EVENT_PRESETS,eventIconSvg} from '../src/event-icons';
import {openDatabase,callRpc} from '../scripts/database.mjs';
let db:any;const call=(fn:string,p?:any)=>callRpc(db,fn,p?{p}:{});
const draft=(extra={})=>({id:randomUUID(),request_id:randomUUID(),action:'create',actor:'rina',title:'Dinner together',starts_local:'2027-06-15T19:00',ends_local:'2027-06-15T21:00',...extra});
before(async()=>{db=await openDatabase();});after(async()=>{await db.close();});
test('event lifecycle, response versions and retries preserve history',async()=>{
 const p=draft(),e=await call('save_event',p);assert.deepEqual(await call('save_event',p),e);
 const vote={id:e.id,actor:'ohm',request_id:randomUUID(),interval_version:1,expected_version:0,response:'yes'};
 const r=await call('save_event_response',vote);assert.equal(r.version,1);assert.deepEqual(await call('save_event_response',vote),r);
 await call('save_event_response',{...vote,actor:'michal',request_id:randomUUID()});
 await assert.rejects(call('save_event_response',{...vote,request_id:randomUUID()}),/changed/);
 await assert.rejects(call('save_event',{id:e.id,actor:'ohm',action:'confirm',expected_version:1,request_id:randomUUID()}),/host/);
 const confirmed=await call('save_event',{id:e.id,actor:'rina',action:'confirm',expected_version:1,request_id:randomUUID()});assert.equal(confirmed.state,'confirmed');
 const edited=await call('save_event',{...p,action:'edit',expected_version:2,request_id:randomUUID(),title:'Dinner and games'});assert.equal(edited.interval_version,1);assert.equal(edited.state,'confirmed');
 const changed=await call('save_event',{...p,action:'edit',expected_version:3,request_id:randomUUID(),ends_local:'2027-06-15T22:00'});assert.equal(changed.interval_version,2);assert.equal(changed.state,'proposed');
 await assert.rejects(call('save_event_response',{...vote,expected_version:1,request_id:randomUUID()}),/time changed/);
 await call('save_event_response',{...vote,interval_version:2,expected_version:1,response:null,request_id:randomUUID()});
 const d=await call('export_events');assert.equal(d.history.filter((x:any)=>x.id===e.id).length,4);assert.equal(d.response_history.filter((x:any)=>x.id===e.id).length,3);
 await call('save_event',{id:e.id,actor:'rina',action:'cancel',expected_version:4,request_id:randomUUID()});
 await assert.rejects(call('save_event_response',{...vote,interval_version:2,expected_version:2,request_id:randomUUID()}),/unavailable/);
});
test('New York intervals reject invalid or nonexistent times and allow midnight',async()=>{
 await assert.rejects(call('save_event',draft({starts_local:'2027-03-14T02:30',ends_local:'2027-03-14T04:00'})),/does not exist/);
 await assert.rejects(call('save_event',draft({ends_local:'2027-06-15T18:00'})),/after/);
 const e=await call('save_event',draft({ends_local:'2027-06-16T01:00'}));assert.equal(new Date(e.ends_at).toISOString(),'2027-06-16T05:00:00.000Z');
 const fall=await call('save_event',draft({starts_local:'2027-11-07T01:30',ends_local:'2027-11-07T02:30'}));assert.equal(new Date(fall.starts_at).toISOString(),'2027-11-07T06:30:00.000Z');
 await assert.rejects(db.transaction(async(tx:any)=>{await tx.exec('SET LOCAL ROLE anon');await tx.query('SELECT * FROM ledger_private.household_events');}),/permission denied/);
});

test('six presets have illustrations and event icons persist through edits, history and exports',async()=>{
 assert.deepEqual(EVENT_PRESETS.map(p=>p.title),['Movie night','Board games','Go for a walk','Skiing','Eat out','Cook together']);
 for(const preset of EVENT_PRESETS){
  assert.match(eventIconSvg(preset.icon),/<svg/);
  const p=draft({title:preset.title,icon_id:preset.icon});const saved=await call('save_event',p);
  assert.equal(saved.icon_id,preset.icon);assert.deepEqual(await call('save_event',p),saved);
  const {icon_id,...cachedClient}=p;
  const edited=await call('save_event',{...cachedClient,action:'edit',expected_version:1,request_id:randomUUID(),title:preset.title+' tonight'});
  assert.equal(edited.icon_id,preset.icon);assert.equal(edited.interval_version,1);
  const changed=await call('save_event',{...p,action:'edit',expected_version:2,request_id:randomUUID(),icon_id:'calendar'});
  assert.equal(changed.icon_id,'calendar');assert.equal(changed.interval_version,1);
  const exportData=await call('export_events');
  assert.equal(exportData.events.find((e:any)=>e.id===saved.id).icon_id,'calendar');
  assert.deepEqual(exportData.history.filter((e:any)=>e.id===saved.id).map((e:any)=>e.icon_id),['calendar',preset.icon,preset.icon]);
 }
 await assert.rejects(call('save_event',draft({icon_id:'unknown'})),/illustration/);
 const old=await call('save_event',draft());assert.equal(old.icon_id,null);
 assert.equal(eventIconSvg(undefined),eventIconSvg('calendar'));
 assert.equal(eventIconSvg('unknown'),eventIconSvg('calendar'));
});

test('polls collect day availability, validate the window and lock in one day with history intact',async()=>{
 const id=randomUUID(),poll={id,request_id:randomUUID(),action:'create_poll',actor:'rina',title:'Ski trip',icon_id:'skis',window_start:'2027-02-01',window_end:'2027-02-14',time_hint:'Weekend'};
 const created=await call('save_event',poll);assert.equal(created.state,'polling');assert.equal(created.starts_at,null);assert.equal(created.poll_version,1);
 assert.deepEqual(await call('save_event',poll),created);
 await assert.rejects(call('save_event',{...poll,id:randomUUID(),request_id:randomUUID(),window_end:'2027-04-01'}),/six weeks/);
 await assert.rejects(call('save_event',{...poll,id:randomUUID(),request_id:randomUUID(),window_end:'2027-01-01'}),/on or after/);
 const mark=(actor:string,days:Record<string,string>,expected=0,extra={})=>call('save_event_availability',{id,actor,request_id:randomUUID(),poll_version:1,expected_version:expected,days,...extra});
 const first=await mark('ohm',{'2027-02-06':'yes','2027-02-07':'maybe'});assert.equal(first.version,1);
 await mark('michal',{'2027-02-06':'yes'});
 await assert.rejects(mark('ohm',{'2027-02-06':'yes'}),/changed/);
 await assert.rejects(mark('ohm',{'2027-03-01':'yes'},1),/inside the poll/);
 await assert.rejects(mark('ohm',{'2027-02-06':'no'},1),/Works or If needed/);
 await assert.rejects(call('save_event_response',{id,actor:'ohm',request_id:randomUUID(),interval_version:1,expected_version:0,response:'yes'}),/days that work/);
 await assert.rejects(call('save_event',{id,actor:'rina',action:'confirm',expected_version:1,request_id:randomUUID()}),/Lock in/);
 await assert.rejects(call('save_event',{id,actor:'ohm',action:'lock_in',expected_version:1,request_id:randomUUID(),starts_local:'2027-02-06T09:00',ends_local:'2027-02-06T17:00'}),/host/);
 await assert.rejects(call('save_event',{id,actor:'rina',action:'lock_in',expected_version:1,request_id:randomUUID(),starts_local:'2027-02-20T09:00',ends_local:'2027-02-20T17:00'}),/from the poll/);
 // A window change reopens marking, like a new time reopens responses.
 const moved=await call('save_event',{...poll,action:'edit',expected_version:1,request_id:randomUUID(),window_end:'2027-02-21'});assert.equal(moved.poll_version,2);
 await assert.rejects(mark('ohm',{'2027-02-06':'yes'},1),/poll days changed/);
 await mark('ohm',{'2027-02-20':'yes'},1,{poll_version:2});
 const locked=await call('save_event',{id,actor:'rina',action:'lock_in',expected_version:2,request_id:randomUUID(),starts_local:'2027-02-20T09:00',ends_local:'2027-02-20T17:00'});
 assert.equal(locked.state,'confirmed');assert.equal(locked.window_start,'2027-02-01');assert.equal(new Date(locked.starts_at).toISOString(),'2027-02-20T14:00:00.000Z');
 await assert.rejects(mark('michal',{'2027-02-20':'yes'},1,{poll_version:2}),/closed/);
 assert.equal((await call('save_event_response',{id,actor:'ohm',request_id:randomUUID(),interval_version:1,expected_version:0,response:'yes'})).response,'yes');
 const d=await call('export_events');assert.equal(d.format_version,3);
 assert.equal(d.availability.filter((a:any)=>a.id===id).length,2);assert.equal(d.availability_history.filter((a:any)=>a.id===id).length,3);
 assert.deepEqual(d.history.filter((h:any)=>h.id===id).map((h:any)=>h.action),['lock_in','edit','create_poll']);
});
