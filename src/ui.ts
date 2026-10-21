export const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
export const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const money = (cents: number) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
export const name = (id: string) => id[0].toUpperCase()+id.slice(1);
export const date = (d: string,year=false) => new Date(d.slice(0,10)+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',...(year?{year:'numeric'} as const:{}),timeZone:'UTC'});
export const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function saved(key: string) {try{return localStorage.getItem(key);}catch{return null;}}
export function remember(key: string,value: string) {try{localStorage.setItem(key,value);}catch{/* Usable without local storage. */}}
let toastTimer: ReturnType<typeof setTimeout>;
export function toast(message: string, action?: {label:string;run:()=>void}) {
 clearTimeout(toastTimer);const el=$('#toast');el.textContent=message;el.hidden=false;
 if(action){const button=document.createElement('button');button.className='text-button';button.textContent=action.label;button.onclick=()=>{el.hidden=true;action.run();};el.append(' ',button);}
 toastTimer=setTimeout(()=>el.hidden=true,action?12000:4500);
}
export function download(data: unknown,prefix: string) {
 const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=`${prefix}-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
async function fetchRpc<T>(functionName: string,params: Record<string,unknown>={}): Promise<T> {
 const config=window.UTILITIES_CONFIG;
 if(!config?.url||!config.key)throw new Error('The shared database is not connected.');
 const headers: Record<string,string>={'Content-Type':'application/json',apikey:config.key};
 if(config.key.startsWith('eyJ'))headers.Authorization=`Bearer ${config.key}`;
 const res=await fetch(`${config.url.replace(/\/$/,'')}/rest/v1/rpc/utilities_${functionName}`,{method:'POST',headers,body:JSON.stringify(params),signal:AbortSignal.timeout(15000)});
 const body=await res.json().catch(()=>({message:'Could not read the server response.'}));
 if(!res.ok)throw new Error(body.message||`Could not save (${res.status}). Please try again.`);
 return body as T;
}

// Deduplicate reads only. Mutation idempotency remains the server's request-ID contract.
const reads=new Map<string,Promise<unknown>>();
let dataEpoch=0;
export function rpc<T>(functionName:string,params:Record<string,unknown>={}):Promise<T>{
 const scopedRead=['personal_tasks','home_order','export_personal_tasks'].includes(functionName);
 if(Object.keys(params).length&&!scopedRead){
  if(!functionName.startsWith('save_'))return fetchRpc<T>(functionName,params);
  dataEpoch++;reads.clear();
  return fetchRpc<T>(functionName,params).finally(()=>{dataEpoch++;reads.clear();});
 }
 const readKey=functionName+JSON.stringify(params);
 let pending=reads.get(readKey);
 if(!pending){
  const read=async():Promise<T>=>{
   const epoch=dataEpoch;
   try{const result=await fetchRpc<T>(functionName,params);return epoch===dataEpoch?result:read();}
   catch(error){if(epoch!==dataEpoch)return read();throw error;}
  };
  pending=read().finally(()=>{if(reads.get(readKey)===pending)reads.delete(readKey);});reads.set(readKey,pending);
 }
 return pending as Promise<T>;
}
