import {test,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createECDH} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {openDatabase,callRpc} from '../scripts/database.mjs';
let db:any;
const clock='2027-01-05T15:00:00Z';
const token=()=>randomBytes(32).toString('hex');
const subscription=(host='fcm.googleapis.com')=>{
 const key=createECDH('prime256v1');key.generateKeys();
 return {endpoint:`https://${host}/send/${randomUUID()}`,keys:{p256dh:key.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}};
};
const rpc=(fn:string,p?:any,role='anon')=>callRpc(db,fn,p?{p}:{},role);
async function register(member='michal',extra={}){
 const p={action:'register',member,token:token(),subscription:subscription(),...extra};
 await rpc('push_device',p);
 await db.exec("UPDATE ledger_private.push_devices SET enrolled_at='2027-01-01Z'");
 return p;
}
const task=(extra={})=>({id:randomUUID(),request_id:randomUUID(),actor:'rohil',action:'create',title:'Dishes',icon_id:'tidy',note:'',assignee:'michal',points:0,pinned:true,due_on:null,due_time:null,expires_on:null,expires_time:null,...extra});
const note=(extra={})=>({id:randomUUID(),request_id:randomUUID(),actor:'rina',action:'create',body:'Do not include this private preview',temperature:-80,recipients:['michal'],...extra});
const change=(t:any,extra={})=>({...t,action:'edit',actor:'rohil',expected_version:t.version,request_id:randomUUID(),...extra});
async function normalize(at=clock){
 await db.query("UPDATE ledger_private.push_events SET created_at=$1::timestamptz,expires_at=$1::timestamptz+interval '1 day'",[at]);
}
async function claim(at=clock){return (await db.query('SELECT ledger_private.push_claim($1::timestamptz) AS value',[at])).rows[0].value;}
const finish=(job:any,status=201)=>rpc('push_finish',{...job,status},'service_role');
beforeEach(async()=>{
 db=await openDatabase();
 await db.exec("UPDATE ledger_private.push_config SET enabled=true,public_key='test-public-key',installed_at='2027-01-01Z'");
});
afterEach(async()=>{await db.close();});

test('subscription management stays private and cannot invoke the sender or take over another device',async()=>{
 const p=await register();
 assert.equal((await rpc('push_device',{token:p.token,action:'status'})).member,'michal');
 assert.deepEqual(await rpc('push_device',{token:token(),action:'status'}),{registered:false});
 await assert.rejects(rpc('push_device',{...p,token:token()}),/Reset this browser/);
 for(const endpoint of ['http://fcm.googleapis.com/send/a','https://localhost/send/a','https://fcm.googleapis.com.evil.test/send/a','https://fcm.googleapis.com:8443/send/a','https://user@fcm.googleapis.com/send/a'])
  await assert.rejects(rpc('push_device',{...p,subscription:{...p.subscription,endpoint}}),/Unsupported/);
 await assert.rejects(rpc('push_claim'),/permission denied/);
 await assert.rejects(rpc('push_finish',{status:200}),/permission denied/);
 for(const table of ['push_devices','push_events','push_deliveries','push_config']){
  await assert.rejects(db.transaction(async(tx:any)=>{await tx.exec('SET LOCAL ROLE anon');await tx.query(`SELECT * FROM ledger_private.${table}`);}),/permission denied/);
 }
 for(const host of ['web.push.apple.com','updates.push.services.mozilla.com','wns2-by3p.notify.windows.com'])await register('rina',{subscription:subscription(host)});
});
test('new notes target recipients, suppress the author, and never expose the note or temperature',async()=>{
 await register('michal');await register('rina');
 const n=await rpc('save_bulletin_note',note({recipients:['michal','rina']}));
 await normalize();let jobs=await claim();assert.equal(jobs.length,1);
 assert.equal(jobs[0].payload.body,'Rina left you a note. Tap to visit the board.');
 assert.equal(jobs[0].payload.item,n.id);
 assert.ok(!JSON.stringify(jobs).includes(n.body));assert.ok(!JSON.stringify(jobs).includes('temperature'));
 await finish(jobs[0]);assert.deepEqual(await claim(),[]);
 await rpc('save_bulletin_note',change(n,{actor:'rina',body:'Edited text'}));await normalize();assert.deepEqual(await claim(),[]);
 await register('ohm');
 await rpc('save_bulletin_note',change({...n,version:2},{actor:'rina',recipients:['michal','rina','ohm']}));
 await normalize();jobs=await claim();assert.equal(jobs.length,1);
});
test('deleted notes and removed recipients cancel queued alerts',async()=>{
 await register();
 const n=await rpc('save_bulletin_note',note());
 await normalize('2027-01-06T04:00:00Z');assert.deepEqual(await claim('2027-01-06T04:00:00Z'),[]);
 await rpc('save_bulletin_note',change(n,{action:'delete'}));
 assert.deepEqual(await claim('2027-01-06T13:00:00Z'),[]);
});
test('assignments skip unassigned and self-assigned tasks, and follow reassignment',async()=>{
 await register('michal');await register('ohm');
 await rpc('save_chore',task({assignee:null}));
 await rpc('save_chore',task({actor:'michal'}));
 const t=await rpc('save_chore',task());await normalize();
 await rpc('save_chore',change(t,{assignee:'ohm'}));await normalize();
 const jobs=await claim();assert.equal(jobs.length,1);assert.equal(jobs[0].payload.item,t.id);
 const d=(await db.query('SELECT member FROM ledger_private.push_devices WHERE id=$1',[jobs[0].device_id])).rows[0];assert.equal(d.member,'ohm');
});
test('due reminders include zero-point tasks, fire once, and recheck completion and expiry',async()=>{
 await register();
 const t=await rpc('save_chore',task({actor:'michal',due_on:'2027-01-05'}));
 assert.deepEqual(await claim('2027-01-05T13:59:00Z'),[]);
 let jobs=await claim('2027-01-05T14:00:00Z');assert.equal(jobs.length,1);assert.match(jobs[0].payload.body,/Chore reminder/);
 await finish(jobs[0]);assert.deepEqual(await claim(),[]);
 await rpc('save_chore',change(t,{actor:'michal',due_on:'2027-01-06'}));
 assert.deepEqual(await claim('2027-01-06T14:00:00Z'),[]);
 await rpc('save_chore',task({actor:'michal',due_on:'2027-01-05',due_time:'10:00',expires_on:'2027-01-05',expires_time:'10:00'}));
 assert.deepEqual(await claim(),[]);
 const done=await rpc('save_chore',task({actor:'michal',due_on:'2027-01-05'}));
 await rpc('save_chore',change(done,{action:'cancel'}));assert.deepEqual(await claim(),[]);
});
test('quiet hours defer delivery, with correct winter/summer/DST boundaries',async()=>{
 for(const [at,expected] of [
  ['2027-01-06T04:00:00Z','2027-01-06T13:00:00.000Z'],
  ['2027-07-06T03:00:00Z','2027-07-06T12:00:00.000Z'],
  ['2027-03-14T06:00:00Z','2027-03-14T12:00:00.000Z'],
  ['2027-11-07T05:00:00Z','2027-11-07T13:00:00.000Z'],
 ]){
  const row=(await db.query('SELECT ledger_private.push_after_quiet($1::timestamptz) AS t',[at])).rows[0];assert.equal(new Date(row.t).toISOString(),expected);
 }
 await register();await rpc('save_chore',task());await normalize('2027-01-06T04:00:00Z');
 assert.deepEqual(await claim('2027-01-06T04:00:00Z'),[]);assert.equal((await claim('2027-01-06T13:00:00Z')).length,1);
});
test('bill imports group created statements, respect shares, and do not repeat on reimport',async()=>{
 for(const member of ['michal','rina','ohm','rohil'])await register(member);
 const seed=JSON.parse(await readFile(new URL('../data/initial-bills.json',import.meta.url),'utf8'));
 await rpc('import_bills',{request_id:randomUUID(),bills:seed},'service_role');await normalize();
 const jobs=await claim();assert.equal(jobs.length,4);
 for(const j of jobs)await finish(j);
 await rpc('import_bills',{request_id:randomUUID(),bills:seed},'service_role');assert.deepEqual(await claim(),[]);
 assert.equal((await rpc('dashboard')).history.length,0);
});
test('late enrollment, category opt-outs, and disabling never replay historical alerts',async()=>{
 const p=await register();await rpc('save_bulletin_note',note());await normalize();
 await db.exec("UPDATE ledger_private.push_devices SET enrolled_at='2027-01-05T16:00Z'");assert.deepEqual(await claim(),[]);
 await db.exec("UPDATE ledger_private.push_devices SET enrolled_at='2027-01-01Z'");
 await rpc('push_device',{...p,categories:['bills']});assert.deepEqual(await claim(),[]);
 await rpc('push_device',{token:p.token,action:'disable'});assert.deepEqual(await claim(),[]);
});
test('leases prevent concurrent duplicates, stale acknowledgements are ignored, and permanent failures retire subscriptions',async()=>{
 const p=await register();await rpc('save_bulletin_note',note());await normalize();
 const [job]=await claim();assert.deepEqual(await claim(),[]);
 await finish({...job,lease_token:randomUUID()});assert.deepEqual(await claim(),[]);
 await finish(job,503);
 // Move the retry into the deterministic test clock.
 await db.exec("UPDATE ledger_private.push_deliveries SET available_at='2027-01-05T15:05Z'");
 assert.deepEqual(await claim(),[]);
 const [retry]=await claim('2027-01-05T15:06Z');assert.ok(retry);assert.notEqual(retry.lease_token,job.lease_token);
 await finish(retry,410);
 assert.equal((await rpc('push_device',{token:p.token,action:'status'})).enabled,false);
});
test('test notifications affect only the requesting phone and have a cooldown',async()=>{
 const p=await register();await register();
 await rpc('push_device',{token:p.token,action:'test'});await normalize('2027-01-06T04:00Z');
 const jobs=await claim('2027-01-06T04:00Z');assert.equal(jobs.length,1);assert.match(jobs[0].payload.title,/enabled/);
 await assert.rejects(rpc('push_device',{token:p.token,action:'test'}),/wait a minute/);
});
test('recurring chores materialize without a dashboard visit and routine edits do not act like assignments',async()=>{
 await register();
 await db.exec("UPDATE ledger_private.push_config SET installed_at='2020-01-01Z'; UPDATE ledger_private.push_devices SET enrolled_at='2020-01-01Z'");
 const dates=(await db.query("SELECT date_trunc('week',now() AT TIME ZONE 'America/New_York')::date::text AS monday,(extract(isodow FROM now() AT TIME ZONE 'America/New_York')::integer-1) AS weekday,((now() AT TIME ZONE 'America/New_York')::date+time '18:00') AT TIME ZONE 'America/New_York' AS due")).rows[0];
 await rpc('save_chore_routine',{id:randomUUID(),request_id:randomUUID(),actor:'rina',title:'Weekly bins',start_week:dates.monday,interval_weeks:1,owners:['michal','ohm'],start_index:0,enabled:true,steps:[{id:'out',title:'Bins out',note:'',icon_id:'trash',points:1,weekday:dates.weekday,time:'18:00'}]});
 assert.equal((await db.query('SELECT count(*)::integer AS n FROM ledger_private.chore_tasks')).rows[0].n,0);
 const jobs=await claim(new Date(dates.due).toISOString());assert.equal(jobs.length,1);assert.match(jobs[0].payload.body,/Chore reminder: Bins out/);
 await finish(jobs[0]);
 const t=(await rpc('chores_dashboard')).tasks.find((t:any)=>t.id===jobs[0].payload.item);
 await rpc('save_chore',change(t,{title:'Bins outside',actor:'rina'}));
 assert.equal((await db.query("SELECT count(*)::integer AS n FROM ledger_private.push_events WHERE kind='assignment'")).rows[0].n,0);
});
test('a completed task cancels a held assignment and financial/board exports never include subscriptions',async()=>{
 await register();
 const t=await rpc('save_chore',task());await normalize('2027-01-06T04:00Z');assert.deepEqual(await claim('2027-01-06T04:00Z'),[]);
 const local=(await rpc('chores_dashboard')).local_day;
 await rpc('save_chore',change(t,{action:'complete',completion:{contributors:['michal'],completed_at:local+'T00:00'}}));
 assert.deepEqual(await claim('2027-01-06T13:00Z'),[]);
 for(const fn of ['export_ledger','export_misc_ledger','export_chores','export_bulletin']){
  const data=JSON.stringify(await rpc(fn));assert.ok(!data.includes('subscription'));assert.ok(!data.includes('token_hash'));assert.ok(!data.includes('fcm.googleapis.com'));
 }
});
const outing=(extra={})=>({id:randomUUID(),request_id:randomUUID(),actor:'rina',action:'create',title:'Dinner together',starts_local:'2027-01-08T19:00',ends_local:'2027-01-08T21:00',...extra});
test('events alert everyone but the actor when posted, locked in, moved or cancelled',async()=>{
 const devices=await Promise.all(['michal','rina','ohm'].map(m=>register(m)));
 assert.ok((await rpc('push_device',{token:devices[0].token,action:'status'})).categories.includes('events'));
 const e=await rpc('save_event',outing());
 await normalize();let jobs=await claim();
 assert.deepEqual(jobs.map((j:any)=>j.payload.tab).sort(),['events','events']);
 assert.equal(jobs[0].payload.item,e.id);assert.equal(jobs[0].payload.body,'Rina posted “Dinner together” · Fri, Jan 8, 7:00 PM');
 for(const job of jobs)await finish(job);
 // A title edit is quiet; a new time and a cancellation are not.
 const renamed=await rpc('save_event',{...outing(),id:e.id,action:'edit',expected_version:1,request_id:randomUUID(),title:'Dinner'});
 await normalize();assert.deepEqual(await claim(),[]);
 const moved=await rpc('save_event',{...outing(),id:e.id,action:'edit',expected_version:renamed.version,request_id:randomUUID(),title:'Dinner',starts_local:'2027-01-09T18:00',ends_local:'2027-01-09T20:00'});
 await normalize();jobs=await claim();assert.equal(jobs.length,2);assert.equal(jobs[0].payload.body,'“Dinner” moved to Sat, Jan 9, 6:00 PM.');
 for(const job of jobs)await finish(job);
 await rpc('save_event',{id:e.id,actor:'rina',action:'cancel',expected_version:moved.version,request_id:randomUUID()});
 await normalize();jobs=await claim();assert.equal(jobs.length,2);assert.equal(jobs[0].payload.body,'Rina cancelled “Dinner”.');
});
test('event polls invite marking days, availability is quiet, and lock-in announces the time',async()=>{
 await register('michal');await register('ohm');
 const poll=await rpc('save_event',{id:randomUUID(),request_id:randomUUID(),actor:'rina',action:'create_poll',title:'Ski trip',window_start:'2027-01-10',window_end:'2027-01-20'});
 await normalize();let jobs=await claim();assert.equal(jobs.length,2);assert.equal(jobs[0].payload.body,'Rina is planning “Ski trip”. Mark the days that work for you.');
 for(const job of jobs)await finish(job);
 await rpc('save_event_availability',{id:poll.id,actor:'michal',request_id:randomUUID(),poll_version:1,expected_version:0,days:{'2027-01-12':'yes'}});
 await normalize();assert.deepEqual(await claim(),[]);
 // Opting out of events silences the rest for that phone only.
 const ohm=(await db.query("SELECT token_hash FROM ledger_private.push_devices WHERE member='ohm'")).rows[0];
 await db.query(`UPDATE ledger_private.push_devices SET categories='["chores"]' WHERE token_hash=$1`,[ohm.token_hash]);
 await rpc('save_event',{id:poll.id,actor:'rina',action:'lock_in',expected_version:1,request_id:randomUUID(),starts_local:'2027-01-12T08:00',ends_local:'2027-01-12T17:00'});
 await normalize();jobs=await claim();assert.equal(jobs.length,1);assert.equal(jobs[0].payload.body,'“Ski trip” is set for Tue, Jan 12, 8:00 AM.');
});
test('event reminders reach Yes and Maybe two hours ahead, after quiet hours, and only for the current time',async()=>{
 await register('michal');await register('ohm');await register('rohil');
 const e=await rpc('save_event',outing());await db.exec('DELETE FROM ledger_private.push_events');
 for(const [actor,response] of [['michal','yes'],['ohm','no'],['rohil','maybe']])await rpc('save_event_response',{id:e.id,actor,request_id:randomUUID(),interval_version:1,expected_version:0,response});
 assert.deepEqual(await claim('2027-01-08T21:30:00Z'),[]);
 const jobs=await claim('2027-01-08T22:05:00Z');
 assert.deepEqual(jobs.map((j:any)=>j.payload.body),['“Dinner together” starts at 7:00 PM.','“Dinner together” starts at 7:00 PM.']);
 for(const job of jobs)await finish(job);assert.deepEqual(await claim('2027-01-08T22:30:00Z'),[]);
 // A morning event's reminder waits for quiet hours to end, and is dropped once it has started.
 const early=await rpc('save_event',outing({starts_local:'2027-01-09T08:30',ends_local:'2027-01-09T09:30'}));await db.exec("DELETE FROM ledger_private.push_events WHERE kind<>'event_reminder'");
 await rpc('save_event_response',{id:early.id,actor:'michal',request_id:randomUUID(),interval_version:1,expected_version:0,response:'yes'});
 assert.deepEqual(await claim('2027-01-09T12:00:00Z'),[]);
 assert.equal((await claim('2027-01-09T13:00:00Z')).length,1);
});
