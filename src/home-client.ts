import {$,esc,name,rpc,toast,download} from './ui';
import {MEMBERS,type Member} from './ledger';
import {identity,setIdentity,onIdentityChange} from './identity';
import {avatar} from './people';
import {cornerTab} from './tile-corner';
import {urgentChore} from './chores';
import {info} from './disclosure';
import {choreCard} from './chore-cards';
import {bindCompletionSwipe} from './swipe';
import {choreSource,onChoresChange,loadChores,completeSharedTask} from './chore-store';
import {combinedFeed,orderedFeed,reconcileOrder,moveEntry,type PersonalTask,type PersonalLedger,type HomeOrder,type FeedEntry} from './home';
import {highlightNotification} from './notifications';

let personal:PersonalLedger|undefined,personalLive=false,order:HomeOrder|undefined,orderLive=false;
let personalNotice='',orderNotice='',filter='all',showHistory=false,busy=false,dragging=false,pending=false,readVersion=0;
let draft:PersonalTask|undefined,quickId=crypto.randomUUID(),orderDraft:string[]|undefined;
const retries=new Map<string,string>();
const keyFor=(p:Record<string,unknown>)=>{const fingerprint=JSON.stringify(p);if(!retries.has(fingerprint))retries.set(fingerprint,crypto.randomUUID());return retries.get(fingerprint)!;};
const inUse=()=>busy||dragging||!!document.querySelector('dialog[open]')||!!document.activeElement?.closest('#home-quick');
const entries=()=>identity?combinedFeed(identity,personal?.tasks||[],choreSource.ledger,showHistory):[];
const sorted=()=>orderedFeed(entries(),orderDraft||order?.keys||[]);
const matchesFilter=(e:FeedEntry)=>filter==='all'||(filter==='personal'?e.source==='personal':e.source==='shared');
const stamp=(s:string)=>new Date(s).toLocaleString('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'});

export function initHome(){
 $('#home-page').innerHTML=`<section class="intro"><div class="home-heading"><h1>Home</h1>${info('About personal tasks','Personal tasks belong to the selected name and are publicly readable, like other household records. They earn no points and send no assignment alerts.')}</div><button id="home-add-task" class="button primary" disabled>＋ Add task</button></section>
 <div id="home-identity" class="identity-panel"><h2>Choose your name</h2><div class="identity-choices">${MEMBERS.map(m=>`<button class="person-tile member-${m}" data-home-person="${m}">${avatar(m)}${name(m)}</button>`).join('')}</div></div>
 <div id="home-identity-bar" class="identity-bar" hidden><span id="home-identity-name"></span><button id="home-switch" class="text-button">Switch person</button></div>
 <form id="home-quick" class="home-quick"><label class="sr-only" for="personal-title">Personal task</label><input id="personal-title" maxlength="120" required placeholder="Add a personal task…" autocomplete="off"><button id="personal-add" class="button primary">Add</button></form>
 <p id="home-personal-notice" class="ledger-notice" role="status" hidden></p><p id="home-shared-notice" class="ledger-notice" role="status" hidden></p>
 <p id="home-order-notice" class="ledger-notice" role="status" hidden></p><button id="home-order-retry" class="text-button" hidden>Retry saving order</button>
 <div class="home-toolbar"><div class="segmented" role="group" aria-label="Task sources">${['all','personal','assigned'].map(f=>`<button data-home-filter="${f}" aria-pressed="${f==='all'}">${name(f)}</button>`).join('')}</div><label class="chore-inline-check"><input id="home-history" type="checkbox"> Completed & history</label></div>
 <div id="home-feed" aria-live="polite"></div>`;
 document.body.insertAdjacentHTML('beforeend',`<dialog id="personal-dialog" aria-labelledby="personal-heading"><form id="personal-form"><div class="dialog-top"><h2 id="personal-heading">Edit personal task</h2><button class="icon-button" type="button" data-personal-close aria-label="Close">×</button></div><label for="personal-edit-title">Title</label><input id="personal-edit-title" maxlength="120" required><p id="personal-error" class="form-error" role="alert" hidden></p><div class="dialog-actions"><button type="button" class="button secondary" data-personal-close>Cancel</button><button class="button primary" id="personal-save">Save changes</button></div></form></dialog>`);
 $('#home-page').addEventListener('click',click);
 $('#home-quick').addEventListener('submit',event=>{event.preventDefault();void addPersonal();});
 $('#home-quick').addEventListener('focusout',()=>setTimeout(()=>{if(pending&&!inUse())render();},0));
 $('#home-history').addEventListener('change',()=>{showHistory=$<HTMLInputElement>('#home-history').checked;render();});
 $('#personal-form').addEventListener('submit',event=>{event.preventDefault();if(draft)void changePersonal(draft,'edit',{title:$<HTMLInputElement>('#personal-edit-title').value.trim()},true);});
 document.querySelectorAll('[data-personal-close]').forEach(b=>b.addEventListener('click',()=>{if(!busy)$<HTMLDialogElement>('#personal-dialog').close();}));
 $('#personal-dialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 document.addEventListener('close',()=>{if(pending&&!inUse()&&!$('#home-page').hidden)render();},true);
 bindCompletionSwipe($('#home-feed'),id=>{const e=entries().find(e=>e.task.id===id);if(e?.source==='personal')void changePersonal(e.task,'complete');else if(e&&identity)void completeSharedTask(e.task,identity);},value=>{dragging=value;if(!value)queueMicrotask(()=>{if(pending&&!inUse())render();});});
 bindDrag();
 onChoresChange(()=>render());
 onIdentityChange(()=>{readVersion++;personal=undefined;order=undefined;orderDraft=undefined;personalLive=false;orderLive=false;personalNotice='';orderNotice='';quickId=crypto.randomUUID();$<HTMLInputElement>('#personal-title').value='';render();if(!$('#home-page').hidden)void refreshHome();});
 render();
}
function notice(id:string,text:string){$('#'+id).textContent=text;$('#'+id).hidden=!text;}
function render(){
 $('#home-identity').hidden=!!identity;$('#home-identity-bar').hidden=!identity;
 if(identity)$('#home-identity-name').innerHTML=`${avatar(identity)} <span class="actor-chip member-${identity}">${name(identity)}</span>`;
 $('#home-quick').hidden=!identity;
 $('#personal-add').toggleAttribute('disabled',!personalLive||busy);$<HTMLInputElement>('#personal-title').disabled=false;
 $('#home-add-task').toggleAttribute('disabled',!identity||!choreSource.live);
 if(choreSource.ledger){const count=identity?choreSource.ledger.tasks.filter(t=>!t.projected&&t.assignee===identity&&urgentChore(t,choreSource.ledger!.local_day)).length:0;$('#chore-badge').textContent=String(count);$('#chore-badge').hidden=!count;}
 notice('home-personal-notice',personalNotice);notice('home-shared-notice',choreSource.notice);notice('home-order-notice',orderNotice);
 $('#home-order-retry').hidden=!orderDraft||!orderNotice||!orderLive;
 if(!$('#home-page').hidden)$('#export').toggleAttribute('disabled',!identity||(!personal&&!choreSource.ledger));
 if(busy||dragging||document.querySelector('dialog[open]')){pending=true;return;}pending=false;
 document.querySelectorAll('[data-home-filter]').forEach(b=>b.setAttribute('aria-pressed',String((b as HTMLElement).dataset.homeFilter===filter)));
 const feed=$('#home-feed'),opened=[...feed.querySelectorAll<HTMLDetailsElement>('details[open]')].map(d=>d.dataset.homeDetails||d.dataset.taskDetails).filter(Boolean);
 const focused=document.activeElement as HTMLElement;const focusKey=focused?.closest<HTMLElement>('[data-home-key]')?.dataset.homeKey,focusMove=focused?.dataset.homeMove;
 const all=sorted(),visible=all.filter(matchesFilter);
 feed.innerHTML=!identity?'':visible.length?visible.map(e=>{
  const group=all.filter(x=>x.task.pinned===e.task.pinned&&matchesFilter(x)),index=group.indexOf(e),movable=orderLive&&!showHistory&&!busy;
  return `<div class="home-entry" data-home-key="${esc(e.key)}" data-pinned="${e.task.pinned}">${e.source==='personal'?personalCard(e.task):choreCard(e.task,{identity,live:choreSource.live,day:choreSource.ledger!.local_day})}${!showHistory?`<div class="home-moves"><button class="text-button home-drag" aria-label="Drag ${esc(e.task.title)}" title="Drag to reorder" ${!movable?'disabled':''}>⠿</button><button class="text-button" data-home-move="-1" aria-label="Move ${esc(e.task.title)} up" ${!movable||index===0?'disabled':''}>↑ Move up</button><button class="text-button" data-home-move="1" aria-label="Move ${esc(e.task.title)} down" ${!movable||index===group.length-1?'disabled':''}>↓ Move down</button></div>`:''}</div>`;
 }).join(''):'<p class="home-empty">No tasks in this view.</p>';
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
 <details class="tile-details chore-details" data-home-details="${esc(t.id)}">${cornerTab(t.title)}<div class="tile-details-body"><div class="chore-card-actions">${t.deleted?`<button class="text-button" data-personal-action="restore" ${!enabled?'disabled':''}>Restore</button>`:`<button class="text-button" data-personal-action="edit" ${!enabled?'disabled':''}>Edit</button><button class="text-button" data-personal-action="pin" ${!enabled?'disabled':''}>${t.pinned?'Unpin':'Pin'}</button><button class="text-button" data-personal-action="${t.completed_at?'undo':'complete'}" ${!enabled?'disabled':''}>${t.completed_at?'Undo':'Mark done'}</button><button class="text-button" data-personal-action="delete" ${!enabled?'disabled':''}>Delete</button>`}</div><details data-home-details="history-${esc(t.id)}"><summary>History · ${history.length}</summary>${history.map(h=>`<p>${esc(name(h.action))} by ${name(h.actor)} · ${stamp(h.created_at)}<br>${esc(h.title)}</p>`).join('')}</details></div></details></article>`;
}
async function loadPersonal(member:Member,version:number){
 try{const data=await rpc<PersonalLedger>('personal_tasks',{p:{member}});if(identity!==member||version!==readVersion)return;personal=data;personalLive=true;personalNotice='';}
 catch(error){if(identity!==member||version!==readVersion)return;personalLive=false;
  try{if(!personal){const r=await fetch('./personal-tasks.json',{cache:'no-store'});if(r.ok){const data=await r.json() as PersonalLedger;if(identity===member&&version===readVersion)personal={...data,tasks:data.tasks.filter(t=>t.owner===member),history:data.history.filter(t=>t.owner===member)};}}}catch{/* Keep last known tasks. */}
  if(identity!==member||version!==readVersion)return;
  personalNotice=(personal?'Personal tasks offline. Showing saved tasks; changes are disabled. Use Refresh to retry.':'Personal tasks unavailable. Use Refresh to retry.')+' '+(error as Error).message;
 }finally{if(identity===member&&version===readVersion)render();}
}
async function loadOrder(member:Member,version:number){
 try{const result=await rpc<HomeOrder>('home_order',{p:{member}});if(identity!==member||version!==readVersion)return;order=result;orderLive=true;if(!orderDraft)orderNotice='';}
 catch{if(identity!==member||version!==readVersion)return;orderLive=false;orderNotice='Task order unavailable. Reordering is disabled.';}
}
export async function refreshHome(){
 filter=location.hash==='#home/assigned'?'assigned':location.hash==='#home/personal'?'personal':'all';
 if(inUse()){pending=true;return;}
 const member=identity,version=++readVersion;
 await Promise.allSettled([loadChores(),...(member?[loadPersonal(member,version),loadOrder(member,version)]:[])]);
 if(version!==readVersion)return;render();
 if(member&&orderLive&&personalLive&&choreSource.live&&!orderDraft){const keys=reconcileOrder(combinedFeed(member,personal!.tasks,choreSource.ledger),order?.keys||[]);if(JSON.stringify(keys)!==JSON.stringify(order?.keys||[]))await persistOrder(keys);}
}
async function addPersonal(){
 if(!identity||!personalLive||busy)return;
 const field=$<HTMLInputElement>('#personal-title'),title=field.value.trim();if(!title)return;
 const actor=identity,p={id:quickId,expected_version:0,actor,action:'create',title};busy=true;$('#personal-add').toggleAttribute('disabled',true);
 try{await rpc('save_personal_task',{p:{...p,request_id:keyFor(p)}});if(identity===actor&&field.value.trim()===title)field.value='';quickId=crypto.randomUUID();toast('Personal task added.');}
 catch(error){toast((error as Error).message);}
 finally{busy=false;await loadPersonal(actor,readVersion);render();field.focus();}
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
 finally{busy=false;$('#personal-save').removeAttribute('disabled');$<HTMLInputElement>('#personal-edit-title').disabled=false;await loadPersonal(actor,readVersion);render();}
}
async function click(event:MouseEvent){
 const b=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!b||b.disabled||busy)return;
 if(b.dataset.homePerson){setIdentity(b.dataset.homePerson as Member);return;}
 if(b.id==='home-switch'){setIdentity(null);return;}
 if(b.dataset.homeFilter){filter=b.dataset.homeFilter;history.replaceState(null,'',filter==='all'?'#home':'#home/'+filter);render();return;}
 if(b.id==='home-order-retry'){if(orderDraft)void persistOrder(orderDraft);return;}
 if(b.id==='home-add-task'){const m=await import('./chores-client');m.openSharedTask();return;}
 const key=b.closest<HTMLElement>('[data-home-key]')?.dataset.homeKey,e=entries().find(e=>e.key===key);if(!e)return;
 if(b.dataset.homeMove){const group=sorted().filter(x=>x.task.pinned===e.task.pinned&&matchesFilter(x)),target=group[group.findIndex(x=>x.key===key)+Number(b.dataset.homeMove)];if(target)void move(key!,target.key);return;}
 if(e.source==='personal'&&b.dataset.personalAction){
  if(b.dataset.personalAction==='edit'){draft=e.task;$<HTMLInputElement>('#personal-edit-title').value=e.task.title;notice('personal-error','');$<HTMLDialogElement>('#personal-dialog').showModal();$('#personal-edit-title').focus();}
  else void changePersonal(e.task,b.dataset.personalAction);
 }else if(e.source==='shared'&&b.dataset.choreCommand){const m=await import('./chores-client');m.openSharedTask(e.task,b.dataset.choreCommand);}
}
async function move(key:string,target:string){
 const moved=moveEntry(sorted(),key,target);if(!moved)return;
 const retained=(orderDraft||order?.keys||[]).filter(k=>!moved.includes(k));await persistOrder([...moved,...retained]);
}
async function persistOrder(keys:string[]){
 if(!identity||!orderLive||busy)return;
 const actor=identity,p={actor,expected_version:order?.version||0,keys};orderDraft=keys;busy=true;
 try{const result=await rpc<HomeOrder>('save_home_order',{p:{...p,request_id:keyFor(p)}});if(identity===actor){order=result;orderDraft=undefined;orderNotice='';}}
 catch(error){if(identity===actor){orderNotice=(error as Error).message;await loadOrder(actor,readVersion);}}
 finally{busy=false;render();}
}
function bindDrag(){
 const root=$('#home-feed');let gesture:{pointer:number;x:number;y:number;key:string;target:string;button:HTMLElement}|undefined;
 root.addEventListener('pointerdown',event=>{const b=(event.target as HTMLElement).closest<HTMLButtonElement>('.home-drag');if(!b||b.disabled||event.button!==0)return;const key=b.closest<HTMLElement>('[data-home-key]')!.dataset.homeKey!;gesture={pointer:event.pointerId,x:event.clientX,y:event.clientY,key,target:key,button:b};b.setPointerCapture(event.pointerId);dragging=true;});
 root.addEventListener('pointermove',event=>{if(!gesture||gesture.pointer!==event.pointerId)return;const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;if(Math.abs(dx)<8&&Math.abs(dy)<8)return;const target=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-home-key]');root.querySelectorAll('.home-drop').forEach(e=>e.classList.remove('home-drop'));if(target){gesture.target=target.dataset.homeKey!;target.classList.add('home-drop');}});
 const finish=(event:PointerEvent)=>{if(!gesture)return;const g=gesture;gesture=undefined;dragging=false;g.button.releasePointerCapture?.(g.pointer);root.querySelectorAll('.home-drop').forEach(e=>e.classList.remove('home-drop'));if(event.type==='pointerup')void move(g.key,g.target);if(pending&&!inUse())render();};
 root.addEventListener('pointerup',finish);root.addEventListener('pointercancel',finish);
}
export function focusHomeNotification(id:string){
 if(!entries().some(e=>e.task.id===id))return false;filter='all';render();return highlightNotification(`[data-home-key="shared:${CSS.escape(id)}"]`);
}
export function exportHome(){
 if(!identity)return;const member=identity,assigned=choreSource.ledger;const assignedIds=new Set([...(assigned?.tasks||[]),...(assigned?.history||[])].filter(t=>t.assignee===member).map(t=>t.id));
 download({member,exported_at:new Date().toISOString(),personal_tasks:personal?{...personal,tasks:personal.tasks.filter(t=>t.owner===member),history:personal.history.filter(t=>t.owner===member)}:null,assigned_tasks:assigned?{tasks:assigned.tasks.filter(t=>t.assignee===member&&!t.projected),history:assigned.history.filter(t=>assignedIds.has(t.id)),updated_at:assigned.updated_at}:null,home_order:order||null},'household-home-'+member);
}
