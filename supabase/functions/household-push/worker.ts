type Environment={url:string;serviceKey:string;senderSecret:string;publicKey:string;privateKey:string;subject:string};
type Delivery={event_id:string;device_id:string;lease_token:string;subscription:{endpoint:string;keys:{p256dh:string;auth:string}};payload:Record<string,unknown>;ttl:number};
type PushRequest={endpoint:string;headers:Record<string,string>;body?:Uint8Array};
type Encrypt=(subscription:Delivery['subscription'],payload:string,options:Record<string,unknown>)=>PushRequest;
export function allowedEndpoint(value:string){
 try{
  const url=new URL(value);
  return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&
   /^(web\.push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)$/.test(url.hostname);
 }catch{return false;}
}
export function createHandler(env:Environment,encrypt:Encrypt,fetcher:typeof fetch=fetch){
 async function rpc(name:string,p?:unknown){
  const response=await fetcher(`${env.url}/rest/v1/rpc/utilities_push_${name}`,{
   method:'POST',headers:{apikey:env.serviceKey,Authorization:`Bearer ${env.serviceKey}`,'Content-Type':'application/json'},
   body:JSON.stringify(p===undefined?{}:{p}),signal:AbortSignal.timeout(10000),
  });
  if(!response.ok)throw new Error(`Database operation failed (${response.status})`);
  return response.status===204?null:await response.json();
 }
 return async(request:Request)=>{
  if(request.method!=='POST')return new Response('Method not allowed',{status:405});
  if(!env.senderSecret||request.headers.get('x-household-sender')!==env.senderSecret)return new Response('Unauthorized',{status:401});
  if(!env.privateKey||!env.publicKey||!env.serviceKey)return new Response('Setup incomplete',{status:503});
  // Setup can verify boot/auth without claiming jobs or delivering real alerts.
  try{
   if(new URL(request.url).searchParams.get('health')==='1'){
    await rpc('config');
    return Response.json({ready:true});
   }
   const deliveries=await rpc('claim') as Delivery[];
   let sent=0,failed=0;
   async function deliver(job:Delivery){
    let status=0;
    if(!allowedEndpoint(job.subscription.endpoint))status=400;
    else{
     try{
      const outbound=encrypt(job.subscription,JSON.stringify(job.payload),{
       TTL:Math.max(1,Math.min(3600,job.ttl)),urgency:'normal',
       vapidDetails:{subject:env.subject,publicKey:env.publicKey,privateKey:env.privateKey},
      });
      if(!allowedEndpoint(outbound.endpoint))throw new Error('Invalid endpoint');
      const response=await fetcher(outbound.endpoint,{method:'POST',headers:outbound.headers,body:outbound.body as BodyInit,
       redirect:'error',signal:AbortSignal.timeout(10000)});
      status=response.status;await response.body?.cancel();
     }catch{status=0;}
    }
    await rpc('finish',{event_id:job.event_id,device_id:job.device_id,lease_token:job.lease_token,status});
    if(status>=200&&status<300)sent++;else failed++;
   }
   // Bounded concurrency stays within the Edge Function's execution limit.
   for(let start=0;start<deliveries.length;start+=5)await Promise.all(deliveries.slice(start,start+5).map(deliver));
   return Response.json({claimed:deliveries.length,sent,failed});
  }catch{
   // Never log subscription URLs, encryption keys, or note contents.
   console.error('Household push worker could not finish its batch; unacknowledged leases will retry.');
   return new Response('Delivery batch will retry',{status:503});
  }
 };
}
