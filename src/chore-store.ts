import {rpc,today,toast} from './ui';
import {queueReady,type Chore,type ChoreLedger} from './chores';
import type {Member} from './ledger';

// Data and writes are shared by Home and To-dos, independently of either page.
export const choreSource:{ledger?:ChoreLedger;live:boolean;notice:string}={live:false,notice:''};
const listeners=new Set<()=>void>();
export const onChoresChange=(listener:()=>void)=>{listeners.add(listener);return()=>listeners.delete(listener);};
const emit=()=>listeners.forEach(fn=>fn());
let loading:Promise<void>|undefined;
export function loadChores():Promise<void>{
 if(loading)return loading;
 loading=(async()=>{
  try{choreSource.ledger=await rpc<ChoreLedger>('chores_dashboard');choreSource.live=true;choreSource.notice='';}
  catch{choreSource.live=false;try{if(!choreSource.ledger){const response=await fetch('./chores.json',{cache:'no-store'});if(response.ok)choreSource.ledger=await response.json();}}catch{/* Keep last known copy. */}
   choreSource.notice=choreSource.ledger?'Shared tasks offline. Showing saved tasks; changes are disabled.':'Shared tasks unavailable. Use Refresh to retry.';
  }finally{loading=undefined;emit();}
 })();return loading;
}
export async function saveSharedTask(p:Record<string,unknown>,operation='save_chore'){
 if(!choreSource.live)throw new Error('Shared tasks are offline. Refresh before saving.');
 const result=await rpc<Chore>(operation,{p});
 void loadChores();return result;
}
const quickRequests=new Map<string,string>();
const saving=new Set<string>();
export async function completeSharedTask(task:Chore,actor:Member){
 if(!choreSource.live||saving.has(task.id)||!queueReady(task,choreSource.ledger?.local_day||today()))return;
 const key=`${task.id}:${task.version}:${actor}`;
 if(!quickRequests.has(key))quickRequests.set(key,crypto.randomUUID());saving.add(task.id);
 try{
  const result=await saveSharedTask({id:task.id,expected_version:task.version,actor,action:'quick_complete',request_id:quickRequests.get(key)});
  if(choreSource.ledger)choreSource.ledger.tasks=choreSource.ledger.tasks.map(t=>t.id===result.id?{...t,...result,status:'completed',projected:false}:t);
  emit();quickRequests.delete(key);const request=crypto.randomUUID();
  toast('✓ '+task.title,{label:'Undo',run:()=>void undoSharedTask(result,actor,request)});
 }catch(error){toast((error as Error).message,{label:'Retry',run:()=>void completeSharedTask(task,actor)});}
 finally{saving.delete(task.id);}
}
async function undoSharedTask(task:Chore,actor:Member,request:string){
 try{await saveSharedTask({id:task.id,expected_version:task.version,actor,action:'undo',request_id:request});toast('Completion undone.');}
 catch(error){toast((error as Error).message,{label:'Retry',run:()=>void undoSharedTask(task,actor,request)});}
}
