import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createECDH} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import webpush from 'web-push';
import {allowedEndpoint,createHandler} from '../supabase/functions/household-push/worker.ts';
const keys=webpush.generateVAPIDKeys();
const env={url:'https://example.supabase.co',serviceKey:'test-service',senderSecret:'test-sender',publicKey:keys.publicKey,privateKey:keys.privateKey,subject:'https://example.org/household/'};
const req=(secret='test-sender',query='')=>new Request('https://example.supabase.co/functions/v1/household-push'+query,{method:'POST',headers:{'x-household-sender':secret}});
function job(){
 const ecdh=createECDH('prime256v1');ecdh.generateKeys();
 return {event_id:'event-1',device_id:'device-1',lease_token:'lease-1',ttl:60,
  subscription:{endpoint:'https://web.push.apple.com/test-endpoint',keys:{p256dh:ecdh.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}},
  payload:{title:'Household',body:'Rina left you a note',tab:'bulletin',item:'note-1',tag:'event-1'}};
}
test('worker encrypts real web-push payloads, acknowledges outcomes, and rejects public callers',async()=>{
 const delivery=job(),requests:{url:string;options:any}[]=[];
 const handler=createHandler(env,webpush.generateRequestDetails.bind(webpush),async(url:any,options:any)=>{
  requests.push({url:String(url),options});
  if(String(url).endsWith('push_claim'))return Response.json([delivery]);
  if(String(url).endsWith('push_finish'))return new Response(null,{status:204});
  assert.equal(options.redirect,'error');assert.equal(options.headers['Content-Encoding'],'aes128gcm');
  assert.match(options.headers.Authorization,/vapid/);
  assert.ok(!Buffer.from(options.body).toString().includes('Rina'));
  return new Response(null,{status:201});
 });
 assert.equal((await handler(req('wrong'))).status,401);assert.equal(requests.length,0);
 const response=await handler(req());assert.deepEqual(await response.json(),{claimed:1,sent:1,failed:0});
 assert.equal(JSON.parse(requests.at(-1)!.options.body).p.status,201);
});
test('health check reads configuration without claiming or sending; network failures get retried',async()=>{
 const calls:string[]=[];
 const health=createHandler(env,()=>{throw new Error('Must not encrypt');},async(url:any)=>{calls.push(String(url));return Response.json({enabled:false});});
 assert.deepEqual(await (await health(req('test-sender','?health=1'))).json(),{ready:true});
 assert.equal(calls.length,1);assert.match(calls[0],/push_config$/);
 for(const code of [410,429,503,0]){
  let result:any;
  const handler=createHandler(env,webpush.generateRequestDetails.bind(webpush),async(url:any,options:any)=>{
   if(String(url).endsWith('push_claim'))return Response.json([job()]);
   if(String(url).endsWith('push_finish')){result=JSON.parse(options.body).p;return new Response(null,{status:204});}
   if(code===0)throw new Error('offline');
   return new Response(null,{status:code});
  });
  assert.equal((await handler(req())).status,200);assert.equal(result.status,code);
 }
});
test('worker allows only push providers and never follows arbitrary URLs',()=>{
 for(const host of ['web.push.apple.com','fcm.googleapis.com','updates.push.services.mozilla.com','wns.notify.windows.com'])assert.ok(allowedEndpoint(`https://${host}/send/id`));
 for(const url of ['http://web.push.apple.com/id','https://127.0.0.1/a','https://evil.example/a','https://web.push.apple.com.evil.example/id','https://web.push.apple.com:4000/id','https://me@web.push.apple.com/id'])assert.equal(allowedEndpoint(url),false);
});
async function workerHarness(){
 const handlers:Record<string,Function>={},notifications:any[]=[],opened:string[]=[],navigated:string[]=[];
 const scope='https://example.org/household-utilities/';
 const self={registration:{scope,showNotification:async(...args:any[])=>{notifications.push(args);}},
  clients:{claim:async()=>{},matchAll:async()=>[] as any[],openWindow:async(url:string)=>{opened.push(url);}},
  skipWaiting:async()=>{},addEventListener:(type:string,fn:Function)=>{handlers[type]=fn;}};
 vm.runInNewContext(await readFile('public/sw.js','utf8'),{self,URL});
 async function dispatch(type:string,event:any){let promise:Promise<any>=Promise.resolve();handlers[type]({...event,waitUntil:(p:Promise<any>)=>{promise=p;}});await promise;}
 return {self,handlers,notifications,opened,navigated,dispatch,scope};
}
test('service worker always shows a visible alert and opens the right item inside its Pages scope',async()=>{
 const h=await workerHarness();
 assert.equal(h.handlers.fetch,undefined);
 await h.dispatch('push',{data:{json:()=>job().payload}});
 const [title,options]=h.notifications[0];assert.equal(title,'Household');
 assert.equal(options.data.url,h.scope+'?notice=note-1#bulletin');
 assert.equal(options.icon,h.scope+'icon-192.png');
 await h.dispatch('notificationclick',{notification:{data:options.data,close(){}}});assert.deepEqual(h.opened,[options.data.url]);
 h.self.clients.matchAll=async()=>[{url:h.scope,async navigate(url:string){h.navigated.push(url);},async focus(){}}];
 await h.dispatch('notificationclick',{notification:{data:options.data,close(){}}});assert.deepEqual(h.navigated,[options.data.url]);
 await h.dispatch('push',{data:{json:()=>{throw new Error('bad payload');}}});assert.equal(h.notifications.length,2);
 await h.dispatch('notificationclick',{notification:{data:{url:'https://evil.example/'},close(){}}});assert.equal(h.navigated.at(-1),h.scope);
});
