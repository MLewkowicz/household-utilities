import {$,esc,name,rpc,toast,download} from './ui';
import {type Member} from './ledger';
import {identity} from './identity';
import {cornerTab} from './tile-corner';
import {choreCard} from './chore-cards';
import {bindCompletionSwipe} from './swipe';
import {bindTaskReorder} from './task-reorder';
import {choreSource,completeSharedTask} from './chore-store';
import {combinedFeed,orderedFeed,reconcileOrder,moveEntry,groupedFeed,taskGroup,type PersonalTask,type PersonalLedger,type HomeOrder,type FeedEntry} from './home';
import {highlightNotification} from './notifications';

let personal:PersonalLedger|undefined,personalLive=false,order:HomeOrder|undefined,orderLive=false;
let personalNotice='',orderNotice='',filter='all',showHistory=false,busy=false,dragging=false,pending=false,readVersion=0;
let draft:PersonalTask|undefined,quickId=crypto.randomUUID(),orderDraft:string[]|undefined;
let groupDraft:{actor:Member;name:string;expected_tasks:{id:string;version:number}[]}|undefined;
const retries=new Map<string,string>();
const keyFor=(p:Record<string,unknown>)=>{const fingerprint=JSON.stringify(p);if(!retries.has(fingerprint))retries.set(fingerprint,crypto.randomUUID());return retries.get(fingerprint)!;};
const inUse=()=>busy||dragging||!!document.querySelector('dialog[open]')||!!document.activeElement?.closest('#home-quick');
const entries=()=>identity?combinedFeed(identity,personal?.tasks||[],choreSource.ledger,showHistory):[];
const sorted=()=>orderedFeed(entries(),orderDraft||order?.keys||[]);
const matchesFilter=(e:FeedEntry)=>filter==='all'||(filter==='personal'?e.source==='personal':e.source==='shared');
const stamp=(s:string)=>new Date(s).toLocaleString('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'});

type GroupMove={id:string;expected_version:number;group_name:string|null};
let pendingGroupMove:GroupMove|undefined,cancelDrag=()=>{};
let orderAttempt:{intent:string;p:Record<string,unknown>}|undefined;
let stateChanged=()=>{};
const groupNames=()=>[...new Set((personal?.tasks||[]).filter(t=>!t.deleted).map(t=>t.group_name).filter((v):v is string=>!!v))].sort((a,b)=>a.localeCompare(b));
const groupField=(id:string)=>`<label class="sr-only" for="${id}">Group</label><input id="${id}" class="personal-group-input" list="personal-groups" maxlength="60" placeholder="Group (optional)" autocomplete="off">`;
export function initMyTasks(onChange:()=>void){
 stateChanged=onChange;
 $('#my-tasks').innerHTML=` <form id="home-quick" class="home-quick"><label class="sr-only" for="personal-title">Personal task</label><input id="personal-title" maxlength="120" required placeholder="Add a personal task…" autocomplete="off">${groupField('personal-quick-group')}<button id="personal-add" class="button primary">Add</button></form>
 <datalist id="personal-groups"></datalist><p id="home-personal-notice" class="ledger-notice" role="status" hidden></p>
 <p id="home-order-notice" class="ledger-notice" role="status" hidden></p><button id="home-order-retry" class="text-button" hidden>Retry saving order</button>
 <div class="home-toolbar"><div class="segmented" role="group" aria-label="Task sources">${['all','personal','assigned'].map(f=>`<button data-home-filter="${f}" aria-pressed="${f==='all'}">${name(f)}</button>`).join('')}</div><label class="chore-inline-check"><input id="home-history" type="checkbox"> Completed & history</label></div>
 <div id="home-feed" aria-live="polite"></div>`;
 document.body.insertAdjacentHTML('beforeend',`<dialog id="personal-dialog" aria-labelledby="personal-heading"><form id="personal-form"><div class="dialog-top"><h2 id="personal-heading">Edit personal task</h2><button class="icon-button" type="button" data-personal-close aria-label="Close">×</button></div><label for="personal-edit-title">Title</label><input id="personal-edit-title" maxlength="120" required>${groupField('personal-edit-group')}<p id="personal-error" class="form-error" role="alert" hidden></p><div class="dialog-actions"><button type="button" class="button secondary" data-personal-close>Cancel</button><button class="button primary" id="personal-save">Save changes</button></div></form></dialog>`);
 document.body.insertAdjacentHTML('beforeend',`<dialog id="group-rename-dialog" aria-labelledby="group-rename-heading"><form id="group-rename-form"><div class="dialog-top"><h2 id="group-rename-heading">Rename group</h2><button class="icon-button" type="button" data-group-rename-close aria-label="Close">×</button></div><label for="group-rename-name">Group name</label><input id="group-rename-name" maxlength="60" required autocomplete="off"><p id="group-rename-error" class="form-error" role="alert" hidden></p><div class="dialog-actions"><button type="button" class="button secondary" data-group-rename-close>Cancel</button><button class="button primary" id="group-rename-save">Rename group</button></div></form></dialog>`);
 $('#my-tasks').addEventListener('click',click);
 $('#home-quick').addEventListener('submit',event=>{event.preventDefault();void addPersonal();});
 $('#home-quick').addEventListener('focusout',()=>setTimeout(()=>{if(pending&&!inUse())renderMyTasks();},0));
 $('#home-history').addEventListener('change',()=>{showHistory=$<HTMLInputElement>('#home-history').checked;renderMyTasks();});
 $('#personal-form').addEventListener('submit',event=>{event.preventDefault();if(draft)void changePersonal(draft,'edit',{title:$<HTMLInputElement>('#personal-edit-title').value.trim(),group_name:$<HTMLInputElement>('#personal-edit-group').value.trim()||null},true);});
 document.querySelectorAll('[data-personal-close]').forEach(b=>b.addEventListener('click',()=>{if(!busy)$<HTMLDialogElement>('#personal-dialog').close();}));
 $('#personal-dialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 $('#group-rename-form').addEventListener('submit',event=>{event.preventDefault();void renameGroup();});
 document.querySelectorAll('[data-group-rename-close]').forEach(b=>b.addEventListener('click',()=>{if(!busy)$<HTMLDialogElement>('#group-rename-dialog').close();}));
 $('#group-rename-dialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 document.addEventListener('close',()=>{if(pending&&!inUse()&&!$('#my-tasks').hidden)renderMyTasks();},true);
 bindCompletionSwipe($('#home-feed'),id=>{const e=entries().find(e=>e.task.id===id);if(e?.source==='personal')void changePersonal(e.task,'complete');else if(e&&identity)void completeSharedTask(e.task,identity);},value=>{dragging=value;if(!value)queueMicrotask(()=>{if(pending&&!inUse())renderMyTasks();});});
 cancelDrag=bindTaskReorder($('#home-feed'),{enabled:()=>orderLive&&!showHistory&&!busy,active:value=>{dragging=value;if(!value)queueMicrotask(()=>{if(pending&&!inUse())renderMyTasks();});},commit:(key,keys,group)=>void dropTask(key,keys,group)});

 renderMyTasks();
}
function notice(id:string,text:string){$('#'+id).textContent=text;$('#'+id).hidden=!text;}
export function renderMyTasks(){
 $('#home-quick').hidden=!identity;
 $('#personal-add').toggleAttribute('disabled',!personalLive||busy);
 notice('home-personal-notice',personalNotice);notice('home-order-notice',orderNotice);
 $('#home-order-retry').hidden=!orderDraft||!orderNotice||!orderLive;
 stateChanged();
 $('#personal-groups').innerHTML=groupNames().map(g=>`<option value="${esc(g)}"></option>`).join('');
 if($('#my-tasks').hidden){$('#home-feed').replaceChildren();return;}
 if(busy||dragging||document.querySelector('dialog[open]')){pending=true;return;}pending=false;
 document.querySelectorAll('[data-home-filter]').forEach(b=>b.setAttribute('aria-pressed',String((b as HTMLElement).dataset.homeFilter===filter)));
 const feed=$('#home-feed'),opened=[...feed.querySelectorAll<HTMLDetailsElement>('details[open]')].map(d=>d.dataset.homeDetails||d.dataset.taskDetails).filter(Boolean);
 const focused=document.activeElement as HTMLElement;const focusKey=focused?.closest<HTMLElement>('[data-home-key]')?.dataset.homeKey,focusMove=focused?.dataset.homeMove;
 const all=sorted(),visible=all.filter(matchesFilter),groups=groupedFeed(visible),hasGroups=visible.some(e=>taskGroup(e));
 feed.innerHTML=!identity?'':visible.length?groups.map(section=>`<section class="home-task-group" data-task-group="${esc(section.name)}" data-pinned="${section.pinned}">${hasGroups||section.pinned?`<div class="home-group-header"><h2 class="home-group-heading">${esc(section.name|| (section.pinned?'Pinned':'Other tasks'))}${section.pinned&&section.name?'<span>Pinned</span>':''}</h2>${section.name?`<button class="text-button home-group-rename" data-rename-group="${esc(section.name)}" aria-label="Rename ${esc(section.name)} group" ${!personalLive||!(personal?.group_rename_version)||busy?'disabled':''}>Rename</button>`:''}</div>`:''}<div class="home-group-list">${section.entries.map(e=>{
  const group=section.entries,index=group.indexOf(e),movable=orderLive&&!showHistory&&!busy;
  return `<div class="home-entry" data-home-key="${esc(e.key)}" data-pinned="${e.task.pinned}" data-source="${e.source}" data-group-editable="${e.source==='personal'&&personalLive}" data-reorderable="${movable}">${e.source==='personal'?personalCard(e.task):choreCard(e.task,{identity,live:choreSource.live,day:choreSource.ledger!.local_day})}${!showHistory?`<div class="home-moves"><button class="text-button" data-home-move="-1" aria-label="Move ${esc(e.task.title)} up" ${!movable||index===0?'disabled':''}>↑ Move up</button><button class="text-button" data-home-move="1" aria-label="Move ${esc(e.task.title)} down" ${!movable||index===group.length-1?'disabled':''}>↓ Move down</button></div>`:''}</div>`;
 }).join('')}</div></section>`).join(''):'<p class="home-empty">No tasks in this view.</p>';
 feed.querySelectorAll<HTMLDetailsElement>('details').forEach(d=>{if(opened.includes(d.dataset.homeDetails||d.dataset.taskDetails))d.open=true;});
 feed.querySelectorAll<HTMLElement>('[data-task-history]').forEach(el=>{
  const rows=choreSource.ledger?.history.filter(h=>h.id===el.dataset.taskHistory)||[];
  el.innerHTML=`<details><summary>History · ${rows.length}</summary>${rows.map(h=>`<p>${esc(name(h.action))} by ${name(h.actor)} · ${stamp(h.created_at)}<br>${esc(h.title)}</p>`).join('')}</details>`;
 });
 if(focusKey&&focusMove){
  const row=feed.querySelector<HTMLElement>(`[data-home-key="${CSS.escape(focusKey)}"]`),button=row?.querySelector<HTMLButtonElement>(`[data-home-move="${focusMove}"]`);
  (button&&!button.disabled?button:row?.querySelector<HTMLElement>('[data-home-move]:not(:disabled)'))?.focus({preventScroll:true});
 }
}
function personalCard(t:PersonalTask){
 const enabled=personalLive&&!busy&&identity===t.owner;
 const history=personal?.history.filter(h=>h.id===t.id)||[];
 return `<article class="chore-card member-${t.owner} ${t.pinned?'is-pinned':''}" data-personal-id="${esc(t.id)}"><div class="chore-tags"><span>Personal</span>${t.pinned?'<span>↑ Pinned</span>':''}${t.deleted?'<span>Deleted</span>':t.completed_at?'<span>✓ Completed</span>':''}</div><h3>${esc(t.title)}</h3>
 ${!t.deleted&&!t.completed_at?`<div class="completion-track"><span>Slide to complete</span><button class="completion-handle" data-swipe-complete="${esc(t.id)}" aria-label="Complete ${esc(t.title)}" title="Drag across, or press Enter" ${!enabled?'disabled':''}>»</button></div>`:''}
 <details class="tile-details chore-details" data-home-details="${esc(t.id)}">${cornerTab(t.title)}<div class="tile-details-body"><div class="chore-card-actions">${t.deleted?`<button class="text-button" data-personal-action="restore" ${!enabled?'disabled':''}>Restore</button>`:`<button class="text-button" data-personal-action="edit" ${!enabled?'disabled':''}>Edit</button><button class="text-button" data-personal-action="pin" ${!enabled?'disabled':''}>${t.pinned?'Unpin':'Pin'}</button><button class="text-button" data-personal-action="${t.completed_at?'undo':'complete'}" ${!enabled?'disabled':''}>${t.completed_at?'Undo':'Mark done'}</button><button class="text-button" data-personal-action="delete" ${!enabled?'disabled':''}>Delete</button>`}</div><details data-home-details="history-${esc(t.id)}"><summary>History · ${history.length}</summary>${history.map(h=>`<p>${esc(h.action==='rename_group'?'Group renamed':name(h.action))} by ${name(h.actor)} · ${stamp(h.created_at)}<br>${esc(h.title)}${h.group_name?` · ${esc(h.group_name)}`:''}</p>`).join('')}</details></div></details></article>`;
}
async function loadPersonal(member:Member,version:number){
 try{const data=await rpc<PersonalLedger>('personal_tasks',{p:{member}});if(identity!==member||version!==readVersion)return;personal=data;personalLive=true;personalNotice='';}
 catch(error){if(identity!==member||version!==readVersion)return;personalLive=false;
  try{if(!personal){const r=await fetch('./personal-tasks.json',{cache:'no-store'});if(r.ok){const data=await r.json() as PersonalLedger;if(identity===member&&version===readVersion)personal={...data,tasks:data.tasks.filter(t=>t.owner===member),history:data.history.filter(t=>t.owner===member)};}}}catch{/* Keep last known tasks. */}
  if(identity!==member||version!==readVersion)return;
  personalNotice=(personal?'Personal tasks offline. Showing saved tasks; changes are disabled. Use Refresh to retry.':'Personal tasks unavailable. Use Refresh to retry.')+' '+(error as Error).message;
 }finally{if(identity===member&&version===readVersion)renderMyTasks();}
}
async function loadOrder(member:Member,version:number){
 try{const result=await rpc<HomeOrder>('home_order',{p:{member}});if(identity!==member||version!==readVersion)return;order=result;orderLive=true;if(!orderDraft)orderNotice='';}
 catch{if(identity!==member||version!==readVersion)return;orderLive=false;orderNotice='Task order unavailable. Reordering is disabled.';}
}
export function setMyTaskFilter(value:string){filter=value;}
export function personalAvailable(){return personalLive;}
export function personalExportAvailable(){return !!identity&&!!(personal||choreSource.ledger);}
export const myTasksInUse=inUse;
export function resetMyTasks(){
 cancelDrag();pendingGroupMove=undefined;orderAttempt=undefined;groupDraft=undefined;$<HTMLInputElement>('#personal-quick-group').value='';
 readVersion++;personal=undefined;order=undefined;orderDraft=undefined;personalLive=false;orderLive=false;personalNotice='';orderNotice='';quickId=crypto.randomUUID();$<HTMLInputElement>('#personal-title').value='';renderMyTasks();
}
export async function refreshMyTasks(){
 if(inUse()){pending=true;return;}
 const member=identity,version=++readVersion;
 await Promise.allSettled(member?[loadPersonal(member,version),loadOrder(member,version)]:[]);
 if(version!==readVersion)return;renderMyTasks();
}
export async function reconcileMyTaskOrder(){
 const member=identity;
 if(member&&orderLive&&personalLive&&choreSource.live&&!orderDraft){const keys=reconcileOrder(combinedFeed(member,personal!.tasks,choreSource.ledger),order?.keys||[]);if(JSON.stringify(keys)!==JSON.stringify(order?.keys||[]))await persistOrder(keys);}
}
async function addPersonal(){
 if(!identity||!personalLive||busy)return;
 const field=$<HTMLInputElement>('#personal-title'),title=field.value.trim();if(!title)return;
 const actor=identity,p={id:quickId,expected_version:0,actor,action:'create',title,group_name:$<HTMLInputElement>('#personal-quick-group').value.trim()||null};busy=true;$('#personal-add').toggleAttribute('disabled',true);
 try{await rpc('save_personal_task',{p:{...p,request_id:keyFor(p)}});if(identity===actor&&field.value.trim()===title)field.value='';quickId=crypto.randomUUID();toast('Personal task added.');}
 catch(error){toast((error as Error).message);}
 finally{busy=false;await loadPersonal(actor,readVersion);renderMyTasks();field.focus();}
}
async function changePersonal(task:PersonalTask,action:string,extra:Record<string,unknown>={},editing=false){
 if(!identity||!personalLive||busy)return;const actor=identity;
 const p={id:task.id,expected_version:task.version,actor,action,...(action==='pin'?{pinned:!task.pinned}:{}),...extra};busy=true;
 $('#personal-save').toggleAttribute('disabled',true);$<HTMLInputElement>('#personal-edit-title').disabled=true;notice('personal-error','');
 try{
  const result=await rpc<PersonalTask>('save_personal_task',{p:{...p,request_id:keyFor(p)}});
  if(editing)$<HTMLDialogElement>('#personal-dialog').close();
  if(action==='complete')toast('✓ '+task.title,{label:'Undo',run:()=>void changePersonal(result,'undo')});
  else toast(action==='delete'?'Task deleted; history retained.':'Personal task updated.');
 }catch(error){if(editing)notice('personal-error',(error as Error).message);else toast((error as Error).message,{label:'Retry',run:()=>void changePersonal(task,action,extra)});}
 finally{busy=false;$('#personal-save').removeAttribute('disabled');$<HTMLInputElement>('#personal-edit-title').disabled=false;await loadPersonal(actor,readVersion);renderMyTasks();}
}
async function click(event:MouseEvent){
 const b=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!b||b.disabled||busy)return;
 if(b.dataset.homeFilter){filter=b.dataset.homeFilter;history.replaceState(null,'',filter==='all'?'#chores':'#chores/'+filter);renderMyTasks();return;}
 if(b.id==='home-order-retry'){if(orderDraft)void persistOrder(orderDraft,pendingGroupMove);return;}
 if(b.dataset.renameGroup&&identity&&personalLive){
  const group=b.dataset.renameGroup;
  groupDraft={actor:identity,name:group,expected_tasks:(personal?.tasks||[]).filter(t=>t.group_name?.toLowerCase()===group.toLowerCase()).map(t=>({id:t.id,version:t.version}))};
  $<HTMLInputElement>('#group-rename-name').value=group;notice('group-rename-error','');$<HTMLDialogElement>('#group-rename-dialog').showModal();$<HTMLInputElement>('#group-rename-name').select();return;
 }
 const key=b.closest<HTMLElement>('[data-home-key]')?.dataset.homeKey,e=entries().find(e=>e.key===key);if(!e)return;
 if(b.dataset.homeMove){const group=sorted().filter(x=>x.task.pinned===e.task.pinned&&taskGroup(x)===taskGroup(e)&&matchesFilter(x)),target=group[group.findIndex(x=>x.key===key)+Number(b.dataset.homeMove)];if(target)void move(key!,target.key);return;}
 if(e.source==='personal'&&b.dataset.personalAction){
  if(b.dataset.personalAction==='edit'){draft=e.task;$<HTMLInputElement>('#personal-edit-title').value=e.task.title;$<HTMLInputElement>('#personal-edit-group').value=e.task.group_name||'';notice('personal-error','');$<HTMLDialogElement>('#personal-dialog').showModal();$('#personal-edit-title').focus();}
  else void changePersonal(e.task,b.dataset.personalAction);
 }else if(e.source==='shared'&&b.dataset.choreCommand){const m=await import('./chores-client');m.openSharedTask(e.task,b.dataset.choreCommand);}
}
async function renameGroup(){
 if(!groupDraft||!identity||groupDraft.actor!==identity||!personalLive||busy)return;
 const field=$<HTMLInputElement>('#group-rename-name'),newName=field.value.trim();
 if(!newName){notice('group-rename-error','Write a group name.');return;}
 const {actor,name:oldName,expected_tasks}=groupDraft,p={actor,group_name:oldName,new_name:newName,expected_tasks};
 busy=true;field.disabled=true;$('#group-rename-save').toggleAttribute('disabled',true);notice('group-rename-error','');
 try{
  const result=await rpc<{group_name:string}>('rename_personal_group',{p:{...p,request_id:keyFor(p)}});
  const quick=$<HTMLInputElement>('#personal-quick-group');if(quick.value.trim().toLowerCase()===oldName.toLowerCase())quick.value=result.group_name;
  $<HTMLDialogElement>('#group-rename-dialog').close();groupDraft=undefined;toast('Group renamed.');
 }catch(error){notice('group-rename-error',(error as Error).message);}
 finally{busy=false;field.disabled=false;$('#group-rename-save').removeAttribute('disabled');await loadPersonal(actor,readVersion);renderMyTasks();}
}
async function move(key:string,target:string){
 const moved=moveEntry(sorted(),key,target);if(!moved)return;
 const retained=(orderDraft||order?.keys||[]).filter(k=>!moved.includes(k));await persistOrder([...moved,...retained]);
}
async function persistOrder(keys:string[],groupMove?:GroupMove){
 if(!identity||!orderLive||busy)return;
 const actor=identity,intent=JSON.stringify({actor,keys,groupMove});
 if(orderAttempt?.intent!==intent){const p={actor,expected_version:order?.version||0,keys,...(groupMove?{move:groupMove}:{})};orderAttempt={intent,p:{...p,request_id:keyFor(p)}};}
 const p=orderAttempt.p;pendingGroupMove=groupMove;orderDraft=keys;busy=true;
 try{const result=await rpc<HomeOrder>('save_home_order',{p});if(identity===actor){order=result;orderDraft=undefined;pendingGroupMove=undefined;orderAttempt=undefined;orderNotice='';if(groupMove)await loadPersonal(actor,readVersion);}}
 catch(error){if(identity===actor){orderNotice=(error as Error).message;await loadOrder(actor,readVersion);}}
 finally{busy=false;renderMyTasks();}
}
async function dropTask(key:string,visibleKeys:string[],group:string){
 const all=sorted(),entry=all.find(e=>e.key===key);if(!entry)return;
 const visible=new Set(visibleKeys),queue=[...visibleKeys];
 const keys=all.map(e=>visible.has(e.key)?queue.shift()!:e.key);
 const retained=(orderDraft||order?.keys||[]).filter(k=>!keys.includes(k));
 const groupMove=entry.source==='personal'&&taskGroup(entry)!==group?{id:entry.task.id,expected_version:entry.task.version,group_name:group||null}:undefined;
 if(!groupMove&&keys.every((k,i)=>k===all[i].key)){if(pending)renderMyTasks();return;}
 await persistOrder([...keys,...retained],groupMove);
}
export function focusMyTaskNotification(id:string){
 if(!entries().some(e=>e.task.id===id))return false;filter='all';history.replaceState(null,'','#chores');renderMyTasks();return highlightNotification(`[data-home-key="shared:${CSS.escape(id)}"]`);
}
export function exportMyTasks(){
 if(!identity)return;const member=identity,assigned=choreSource.ledger;const assignedIds=new Set([...(assigned?.tasks||[]),...(assigned?.history||[])].filter(t=>t.assignee===member).map(t=>t.id));
 download({member,exported_at:new Date().toISOString(),personal_tasks:personal?{...personal,tasks:personal.tasks.filter(t=>t.owner===member),history:personal.history.filter(t=>t.owner===member)}:null,assigned_tasks:assigned?{tasks:assigned.tasks.filter(t=>t.assignee===member&&!t.projected),history:assigned.history.filter(t=>assignedIds.has(t.id)),updated_at:assigned.updated_at}:null,home_order:order||null},'household-tasks-'+member);
}

export async function createPersonalTask(id:string,title:string,group:string|null=null){
 if(!identity||!personalLive)throw new Error('Personal tasks unavailable. Use Refresh to retry.');
 const actor=identity,p={id,expected_version:0,actor,action:'create',title,group_name:group};
 await rpc('save_personal_task',{p:{...p,request_id:keyFor(p)}});
 await loadPersonal(actor,readVersion);
}
