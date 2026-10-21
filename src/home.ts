import type {Member} from './ledger';
import {activeChore,queueReady,queueOrder,type Chore,type ChoreLedger} from './chores';
export type PersonalTask={id:string;version:number;owner:Member;title:string;group_name?:string|null;pinned:boolean;completed_at:string|null;deleted:boolean;actor:Member;action:string;created_at:string;added_at:string};
export type PersonalLedger={member?:Member;tasks:PersonalTask[];history:PersonalTask[];updated_at:string|null;format_version:number;orders?:HomeOrder[]};
export type HomeOrder={member:Member;version:number;keys:string[]};
export type FeedEntry={source:'personal';key:string;task:PersonalTask}|{source:'shared';key:string;task:Chore};
export function combinedFeed(member:Member,personal:PersonalTask[],shared:ChoreLedger|undefined,history=false):FeedEntry[]{
 const own=personal.filter(t=>t.owner===member&&(history?true:!t.deleted&&!t.completed_at)).map(task=>({source:'personal' as const,key:'personal:'+task.id,task}));
 const assigned=(shared?.tasks||[]).filter(t=>t.assignee===member&&!t.projected&&(history?true:activeChore(t)&&queueReady(t,shared!.local_day))).map(task=>({source:'shared' as const,key:'shared:'+task.id,task}));
 return [...own,...assigned].sort((a,b)=>Number(b.task.pinned)-Number(a.task.pinned)||(a.source==='personal'&&b.source==='personal'?b.task.added_at.localeCompare(a.task.added_at)||a.key.localeCompare(b.key):a.source==='shared'&&b.source==='shared'?queueOrder(shared!.local_day)(a.task,b.task):a.source==='personal'?-1:1));
}
// Unknown arrivals enter the top of their priority group. Retained keys preserve
// order through completion/undo, filters, a source outage and identity changes.
export function orderedFeed(entries:FeedEntry[],keys:string[]):FeedEntry[]{
 const index=new Map(keys.map((key,i)=>[key,i]));
 return [...entries].sort((a,b)=>Number(b.task.pinned)-Number(a.task.pinned)||Number(index.has(a.key))-Number(index.has(b.key))||((index.get(a.key)??0)-(index.get(b.key)??0)));
}
export function reconcileOrder(entries:FeedEntry[],keys:string[]):string[]{return [...entries.filter(e=>!keys.includes(e.key)).map(e=>e.key),...keys];}
export function moveEntry(entries:FeedEntry[],key:string,target:string):string[]|null{
 const from=entries.findIndex(e=>e.key===key),to=entries.findIndex(e=>e.key===target);
 if(from<0||to<0||from===to||entries[from].task.pinned!==entries[to].task.pinned)return null;
 const copy=[...entries];copy.splice(to,0,copy.splice(from,1)[0]);return copy.map(e=>e.key);
}

export function taskGroup(entry:FeedEntry):string{return entry.source==='personal'?entry.task.group_name||'':'';}
export function groupedFeed(entries:FeedEntry[]){
 const groups=new Map<string,{key:string;name:string;pinned:boolean;entries:FeedEntry[]}>();
 for(const entry of entries){const name=taskGroup(entry),key=JSON.stringify([entry.task.pinned,name]);let group=groups.get(key);if(!group){group={key,name,pinned:entry.task.pinned,entries:[]};groups.set(key,group);}group.entries.push(entry);}
 return [...groups.values()];
}
