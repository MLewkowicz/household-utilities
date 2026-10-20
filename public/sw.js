/* Push only: deliberately no fetch handler or cache of household data. */
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
 let data={};
 try{data=event.data?.json()||{};}catch{/* Always show a visible fallback. */}
 const tab=['utilities','chores','bulletin'].includes(data.tab)?data.tab:'utilities';
 const url=new URL(self.registration.scope);
 if(typeof data.item==='string'&&data.item.length<=180&&data.item)url.searchParams.set('notice',data.item);
 url.hash=tab;
 event.waitUntil(self.registration.showNotification(typeof data.title==='string'?data.title:'Household',{
  body:typeof data.body==='string'?data.body:'There’s something new. Tap to visit the household website.',
  icon:new URL('icon-192.png',self.registration.scope).href,
  tag:typeof data.tag==='string'?data.tag:'household',
  data:{url:url.href},
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  let url=new URL(self.registration.scope);
  try{
   const candidate=new URL(event.notification.data?.url);
   if(candidate.origin===url.origin&&candidate.pathname===url.pathname)url=candidate;
  }catch{/* Use the household home page. */}
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const current=windows.find(client=>new URL(client.url).origin===url.origin&&new URL(client.url).pathname===url.pathname);
  if(current){await current.navigate(url.href);await current.focus();}
  else await self.clients.openWindow(url.href);
 })());
});
