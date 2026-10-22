import {entryMeta,latestRevision} from './entry-meta';
import {initMyTasks,renderMyTasks,resetMyTasks,refreshMyTasks,reconcileMyTaskOrder,setMyTaskFilter,myTasksInUse,personalAvailable,personalExportAvailable,createPersonalTask,exportMyTasks,focusMyTaskNotification} from './my-tasks-client';
import {choreSource,onChoresChange,loadChores,saveSharedTask,completeSharedTask} from './chore-store';
import {pointPreset,presetOptions} from './point-presets';
import {choreCard} from './chore-cards';
import {bindCompletionSwipe} from './swipe';
import {avatar} from './people';
import {MEMBERS,type Member} from './ledger';
import {highlightNotification} from './notifications';

export function focusChoreNotification(id:string){
 if(!ledger?.tasks.some(t=>t.id===id&&!t.projected))return false;
 if(view==='mine'&&focusMyTaskNotification(id))return true;
 window.history.replaceState(null,'','#chores/household');view='household';householdFilter='all';statusFilter='all';typeFilter='all';render();
 return highlightNotification(`[data-chore-id="${CSS.escape(id)}"]`);
}
import {$,esc,name,date,today,toast,download} from './ui';
import {identity,setIdentity,onIdentityChange} from './identity';
import {taskKind,type TaskKind,type Chore,type Routine,type RoutineStep,type ChoreLedger,addDays,weekStart,activeChore,queueReady,queueVisibility,type QueueVisibility,urgentChore,queueOrder,points,localDateTime} from './chores';
import {CHORE_ICONS,TASK_ICONS,TASK_CATEGORIES,searchTaskIcons,choreIcon,suggestTaskIcon,suggestChoreIcon} from './chore-icons';

let ledger:ChoreLedger|undefined,live=false,busy=false;
let view='mine',filter='all',householdFilter='all',statusFilter='active',period='month',week=weekStart(today());
let taskDraft:Chore|undefined,taskId='',taskMode='request',chosenIcon='tidy',manualIcon=false;
let draftKind:TaskKind='chore';
let completionTask:Chore|undefined,actionTask:Chore|undefined,actionKind='';
let routineDraft:Routine|undefined,routineId='',owners:Member[]=[],steps:RoutineStep[]=[];
let pendingTask:string|null=null;
let typeFilter='all',dragging=false,pendingRender=false;
let retry:{fingerprint:string;id:string}|null=null;
const input=<T extends HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement=HTMLInputElement>(id:string)=>$<T>('#'+id);
const memberChip=(m:Member)=>`<span class="actor-chip member-${m}">${name(m)}</span>`;
const options=(withAll=false)=>`${withAll?'<option value="all">Everyone</option><option value="anyone">Unassigned</option>':''}${MEMBERS.map(m=>`<option value="${m}">${name(m)}</option>`).join('')}`;
const effort=(id:string)=>`<label for="${id}">Effort</label><select id="${id}"><option value="0">No points · reminder</option><option value="0.5">Quick · 0.5 points</option><option value="1">Small · 1 point</option><option value="2">Medium · 2 points</option><option value="3">Large · 3 points</option></select>`;
const errorText=(id:string,text:string)=>{const el=$('#'+id);el.textContent=text;el.hidden=!text;};
const effortLabel=(value:number)=>value===0?'No points':`${value} pt${value===1?'':'s'}`;
const disabled=()=>!identity||!live?'disabled':'';
const day=()=>ledger?.local_day||today();
const noResults=(title:string,copy:string)=>`<div class="chore-empty"><span class="chore-empty-art">${choreIcon('plant')}</span><h3>${title}</h3><p>${copy}</p></div>`;
const localStamp=(value:string)=>new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value));
function dialog(id:string,title:string,body:string,submit:string){return `<dialog id="${id}-dialog" class="chore-dialog" aria-labelledby="${id}-heading"><form id="${id}-form"><div class="dialog-top"><h2 id="${id}-heading" tabindex="-1" autofocus>${title}</h2><button type="button" class="icon-button" data-chore-close="${id}" aria-label="Close">×</button></div>${body}<p class="form-error" id="${id}-error" role="alert" hidden></p><div class="dialog-actions"><button type="button" class="button secondary" data-chore-close="${id}">Cancel</button><button type="submit" id="${id}-save" class="button primary">${submit}</button></div></form></dialog>`;}
const contributors=(id:string)=>`<fieldset class="chore-contributors"><legend>Who helped?</legend><p class="field-help">Any points are shared equally between the people who did it.</p><div class="chore-member-options">${MEMBERS.map(m=>`<label class="chore-check-tile member-${m}"><input type="checkbox" name="${id}" value="${m}">${avatar(m)}${name(m)}</label>`).join('')}</div></fieldset>`;
export function initChores(){
 $('#chores-page').innerHTML=`<section class="intro"><div><h1>To-dos<span class="brand-period">.</span></h1></div><div class="intro-side"><span class="status"><span class="status-dot"></span><span id="chores-status">Loading to-dos</span></span><div class="misc-primary-actions"><button id="chore-new" class="button primary" disabled>＋ Add task</button><button id="chore-log" class="button secondary" disabled>✓ Log something done</button></div></div></section>
 <div id="chores-notice" class="ledger-notice" role="status" hidden></div>
 <section id="chore-identity" class="identity-panel"><div><p id="chore-identity-error" class="form-error" role="alert" hidden></p><h2>Choose your name</h2></div><div class="identity-choices">${MEMBERS.map(m=>`<button class="person-tile member-${m}" data-chore-person="${m}">${avatar(m)}<span>I’m ${name(m)}</span></button>`).join('')}</div></section>
 <div id="chore-identity-bar" class="identity-bar" hidden><span id="chore-identity-name"></span><button id="chore-switch" class="text-button">Switch person</button></div>
 <nav class="chore-views" aria-label="To-do views">${[['mine','My tasks'],['household','Household'],['week','Week'],['leaderboard','Leaderboard']].map(([v,label])=>`<button data-chore-view="${v}" aria-pressed="${v==='mine'}">${label}</button>`).join('')}</nav>
 <div id="my-tasks"></div><div id="chore-content" aria-live="polite" hidden></div>`;
 initMyTasks(renderChrome);initChoreDialogs();bindBoard();
 onIdentityChange(()=>{resetMyTasks();render();if(!$('#chores-page').hidden)void refreshChores();});
 onChoresChange(()=>{ledger=choreSource.ledger;live=choreSource.live;render();});render();
 document.addEventListener('close',()=>{if(!document.querySelector('dialog[open]'))render();},true);
}
function renderChrome(){
 $('#chore-identity').hidden=!!identity;$('#chore-identity-bar').hidden=!identity;
 if(identity)$('#chore-identity-name').innerHTML=`${avatar(identity)} You’re ${name(identity)}`;
 $('#chore-new').toggleAttribute('disabled',!live&&!personalAvailable());$('#chore-log').toggleAttribute('disabled',!live);
 $('#chores-status').textContent=live?'Shared to-dos · up to date':ledger?'Viewing saved to-dos':'To-dos unavailable';errorText('chores-notice',choreSource.notice);
 if(!$('#chores-page').hidden)$('#export').toggleAttribute('disabled',view==='mine'?!personalExportAvailable():!ledger);
 if(identity)errorText('chore-identity-error','');
 document.querySelectorAll<HTMLElement>('[data-chore-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.choreView===view)));
 const count=identity&&ledger?ledger.tasks.filter(t=>!t.projected&&t.assignee===identity&&urgentChore(t,day())).length:0;
 $('#chore-badge').textContent=String(count);$('#chore-badge').hidden=!count;
 $('#my-tasks').hidden=view!=='mine';$('#chore-content').hidden=view==='mine';
 if($('#chore-task-dialog'))updateTaskAvailability();
}
function selectRoute(){
 const part=location.hash.startsWith('#chores/')?location.hash.split('/')[1]:'';
 view=['household','week','leaderboard'].includes(part)?part:'mine';
 setMyTaskFilter(['personal','assigned'].includes(part)?part:'all');
}

let editorInitialized=false;
export function initChoreDialogs(){
 if(editorInitialized)return;editorInitialized=true;
 ledger=choreSource.ledger;live=choreSource.live;
 document.body.insertAdjacentHTML('beforeend',
 dialog('chore-task','Add task',`<label for="chore-kind">Type</label><select id="chore-kind"><option value="personal">Personal</option><option value="chore">Chore · points for shared work</option><option value="reminder">Reminder · each person completes</option><option value="request">Request · a favor, no points</option><option value="routine">Routine · one recurring item</option></select>
 <label for="chore-title">What needs doing?</label><input id="chore-title" required maxlength="120" placeholder="Task title">
 <div id="personal-task-group-field"><label for="chore-personal-group">Group <span class="quiet">(optional)</span></label><input id="chore-personal-group" list="personal-groups" maxlength="60" placeholder="Choose or name a group" autocomplete="off"></div><div id="shared-task-fields"><div class="chore-shortcuts" id="chore-shortcuts">${['bananas','trash','recycling','bins'].map(id=>`<button type="button" data-chore-shortcut="${id}">${choreIcon(id)}<span>${CHORE_ICONS.find(i=>i.id===id)!.label}</span></button>`).join('')}</div><details class="chore-icon-picker"><summary><span id="chore-selected-icon"></span><span>Choose an illustration</span></summary><div class="picker-controls"><input id="chore-icon-search" type="search" aria-label="Search task illustrations" placeholder="Search illustrations"><select id="chore-icon-category" aria-label="Illustration category"><option value="">All categories</option>${TASK_CATEGORIES.map(c=>`<option>${esc(c)}</option>`).join('')}</select></div><div class="chore-icon-grid" id="chore-icon-grid"></div><label class="chore-inline-check"><input type="checkbox" id="chore-fill-title" checked> Use icon name as the title</label></details>
 <fieldset id="chore-assignee-fields" class="chore-contributors"><legend>For whom?</legend><div class="chore-member-options"><label class="chore-check-tile"><input type="radio" name="chore-assignee" value="" checked>Anyone</label>${MEMBERS.map(m=>`<label class="chore-check-tile member-${m}"><input type="radio" name="chore-assignee" value="${m}">${avatar(m)}${name(m)}</label>`).join('')}</div></fieldset>
 <fieldset id="reminder-recipients" class="chore-contributors" hidden><legend>Remind whom?</legend><div class="chore-member-options">${MEMBERS.map(m=>`<label class="chore-check-tile member-${m}"><input type="checkbox" name="reminder-recipient" value="${m}">${avatar(m)}${name(m)}</label>`).join('')}</div></fieldset>
 <div id="chore-points-fields"><label for="chore-preset">Household job</label><select id="chore-preset">${presetOptions()}</select>${effort('chore-effort')}</div><details id="chore-more" class="form-details"><summary>Context & advanced settings</summary><label for="chore-note">Details <span class="quiet">(optional)</span></label><textarea id="chore-note" rows="2" maxlength="1000" placeholder="Where, what, or why…"></textarea>
 </details><div class="chore-two-fields"><div><label for="chore-due">Due date <span class="quiet">(optional)</span></label><input id="chore-due" type="date"></div><div><label for="chore-time">Time <span class="quiet">(optional)</span></label><input id="chore-time" type="time"></div></div><p class="field-help">New York time. Without a time, the deadline is the end of the day.</p>
 <div id="chore-queue-fields"><label for="chore-queue">Show in queue</label><select id="chore-queue"><option value="immediately">Immediately</option><option value="due_date">On due date</option></select><p class="field-help">On due date: available from midnight in New York. Upcoming tasks appear in Week.</p></div>
 <details id="chore-scheduling" class="form-details"><summary>Priority & expiry</summary><label class="chore-inline-check"><input id="chore-pinned" type="checkbox"> Pin as high priority</label>
 <label class="chore-inline-check"><input id="chore-tonight" type="checkbox"> Expire tonight</label>
 <details id="chore-expiry-details"><summary>Choose another expiry</summary><div class="chore-two-fields"><div><label for="chore-expiry">Expiry date</label><input id="chore-expiry" type="date"></div><div><label for="chore-expiry-time">Expiry time <span class="quiet">(optional)</span></label><input id="chore-expiry-time" type="time"></div></div></details><p class="field-help">Expired tasks appear under Household → Expired.</p></details>
 <div id="chore-log-fields" hidden>${contributors('chore-log-contributor')}<label for="chore-log-time">When was it done? · New York time</label><input id="chore-log-time" type="datetime-local"></div></div><p id="chore-task-actor" class="field-help"></p><p id="task-source-notice" class="ledger-notice" role="status" hidden></p>`,'Save chore')+
 dialog('chore-complete','Complete task',`<div id="chore-complete-summary" class="chore-complete-summary"></div>${contributors('chore-contributor')}${effort('chore-complete-effort')}<label for="chore-completed-at">When was it done? · New York time</label><input id="chore-completed-at" type="datetime-local" required><label for="chore-completion-note">Change note <span class="quiet">(optional)</span></label><input id="chore-completion-note" maxlength="500">`,'Save completion')+
 dialog('chore-action','Update chore',`<p id="chore-action-copy" class="section-copy"></p><label for="chore-action-note">A note for the household <span class="quiet">(optional)</span></label><textarea id="chore-action-note" maxlength="500" rows="2"></textarea>`,'Confirm')+
 dialog('chore-routine','Add routine',`<label for="routine-title">What repeats?</label><input id="routine-title" required maxlength="120" placeholder="Take the bins out"><div class="chore-two-fields"><div><label for="routine-start">First due date</label><input id="routine-start" type="date" required></div><div><label for="routine-interval">Repeat every</label><select id="routine-interval">${Array.from({length:12},(_,i)=>`<option value="${i+1}">${i+1} week${i?'s':''}</option>`).join('')}</select></div></div><div id="routine-anchor-note"><p class="field-help">Repeats from the first due date, using New York time.</p></div>
 <div id="routine-items"></div><fieldset class="chore-contributors"><legend>For whom? <span class="field-help">Choose one person, or several to take turns.</span></legend><div id="routine-owner-tiles" class="chore-member-options"></div></fieldset><details id="routine-rotation" class="form-details"><summary>Rotation order</summary><ol id="routine-order" class="routine-order"></ol><label for="routine-first">First person</label><select id="routine-first"></select></details>
 <label class="chore-inline-check"><input id="routine-enabled" type="checkbox" checked> Keep this routine running</label><div id="routine-effective" hidden><p class="field-help">Changes apply from the next occurrence. To change the start date or interval, pause this routine and create another.</p></div>`,'Save routine')+
 `<dialog id="chore-routines-dialog" class="chore-dialog" aria-labelledby="chore-routines-heading"><div class="dialog-top"><h2 id="chore-routines-heading" tabindex="-1" autofocus>Household routines</h2><button class="icon-button" data-chore-close="chore-routines" aria-label="Close">×</button></div><div id="chore-routine-list"></div><button id="routine-new" class="button primary">＋ New routine</button></dialog>`);
 bindEditor();
}
function render(){
 if(!$('#chore-content'))return;
 if(dragging){pendingRender=true;return;}pendingRender=false;
 const content=$('#chore-content');
 const openDetails=[...content.querySelectorAll<HTMLDetailsElement>('[data-task-details][open]')].map(el=>el.dataset.taskDetails);
 const openScores=[...content.querySelectorAll<HTMLDetailsElement>('.chore-score[open]')].map(el=>el.dataset.scoreMember);
 const focused=document.activeElement as HTMLElement|null;
 const focusedId=focused&&content.contains(focused)?focused.id:'';
 const weekShift=focused&&content.contains(focused)?focused.dataset.weekShift:undefined;
 renderChrome();renderMyTasks();
 if(view==='mine'){$('#chore-content').replaceChildren();return;}
 if(busy||document.querySelector('dialog[open]'))return;
 $('#chore-content').innerHTML=view==='week'?weekView():view==='leaderboard'?leaderboardView():queueView();restoreFilters();
 content.querySelectorAll<HTMLDetailsElement>('[data-task-details]').forEach(el=>{if(openDetails.includes(el.dataset.taskDetails)){el.open=true;}});
 content.querySelectorAll<HTMLDetailsElement>('.chore-score').forEach(el=>el.open=openScores.includes(el.dataset.scoreMember));
 if(focusedId)document.getElementById(focusedId)?.focus({preventScroll:true});
 else if(weekShift!==undefined)content.querySelector<HTMLElement>(`[data-week-shift="${weekShift}"]`)?.focus({preventScroll:true});
}
function card(t:Chore){return choreCard(t,{identity,live,day:day(),revision:latestRevision(ledger?.history||[],t.id)});}
function updateTaskAvailability(){
 const personal=input('chore-kind').value==='personal',available=personal?personalAvailable():live;
 $('#chore-task-save').toggleAttribute('disabled',busy||!available);
 $('#task-source-notice').hidden=available;$('#task-source-notice').textContent=available?'':(personal?'Personal':'Shared')+' tasks unavailable. Close this form and use Refresh to retry.';
}
function updateTaskKind(resetPoints=false){
 const kind=input('chore-kind').value;
 $('#personal-task-group-field').hidden=kind!=='personal';
 $('#shared-task-fields').hidden=kind==='personal';
 $('#shared-task-fields').querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>('input,select,textarea').forEach(el=>el.disabled=kind==='personal');
 updateTaskAvailability();
 if(kind==='personal'){$('#chore-task-save').textContent='Add personal task';input('chore-due').required=false;return;}
 input('chore-effort').disabled=!!input('chore-preset').value;updateQueueTiming();
 if(kind==='routine'){if(!live)return;$<HTMLDialogElement>('#chore-task-dialog').close();openRoutine(undefined,true);return;}
 draftKind=kind as TaskKind;
 input('chore-icon-category').innerHTML='<option value="">All categories</option>'+(kind==='chore'?['Chores']:TASK_CATEGORIES).map(c=>`<option>${esc(c)}</option>`).join('');
 renderTaskIcons();
 const group=kind==='reminder'&&!taskDraft&&taskMode!=='log';
 $('#reminder-recipients').hidden=!group;$('#chore-assignee-fields').hidden=group;
 $('#chore-points-fields').hidden=kind!=='chore';
 if(kind!=='chore'){input('chore-effort').value='0';input('chore-preset').value='';input('chore-effort').disabled=false;}else if(resetPoints&&input('chore-effort').value==='0')input('chore-effort').value='1';
 $('#chore-task-save').textContent=taskMode==='log'?'Log completion':taskDraft?'Save changes':kind==='reminder'?'Create reminders':kind==='request'?'Create request':'Create chore';
}
async function quickComplete(task:Chore){if(identity)await completeSharedTask(task,identity);}
function queueView(){
 const candidates=(ledger?.tasks||[]).filter(t=>!t.projected&&(typeFilter==='all'||taskKind(t)===typeFilter)).filter(t=>householdFilter==='all'||(householdFilter==='anyone'?!t.assignee:t.assignee===householdFilter)).filter(t=>statusFilter==='active'?activeChore(t)&&queueReady(t,day()):statusFilter==='all'?true:t.status===statusFilter);
 candidates.sort(statusFilter==='active'?queueOrder(day()):(a,b)=>(b.completion?.completed_at||b.created_at).localeCompare(a.completion?.completed_at||a.created_at));
 return `<div class="chore-section-top"><h2>Household</h2><div class="chore-filters"><label>Type<select id="chore-type-filter">${[["all","All types"],["reminder","Reminders"],["request","Requests"],["chore","Chores"]].map(([v,l])=>`<option value="${v}" ${typeFilter===v?"selected":""}>${l}</option>`).join("")}</select></label><label>Assignee<select id="chore-household-filter">${options(true)}</select></label><label>Show<select id="chore-status-filter">${[['active','To do'],['all','All tasks'],['completed','Completed'],['missed','Missed'],['expired','Expired'],['cancelled','Cancelled']].map(([v,l])=>`<option value="${v}" ${v===statusFilter?'selected':''}>${l}</option>`).join('')}</select></label></div></div>${candidates.length?`<div class="chore-grid">${candidates.map(t=>card(t)).join('')}</div>`:noResults('No tasks in this view.',householdFilter==='anyone'?'Choose Everyone or a roommate to see assigned tasks.':'')}`;
}
function weekView(){
 const days=Array.from({length:7},(_,i)=>addDays(week,i));
 return `<div class="chore-section-top"><div><h2>${date(week)} – ${date(addDays(week,6),true)}</h2><p class="section-copy">New York time</p></div><button id="chore-manage-routines" class="button secondary" ${disabled()}>Manage routines</button></div><div class="chore-week-tools"><div class="chore-week-nav"><button class="button secondary" data-week-shift="-7" aria-label="Previous week">←</button><button class="button secondary" data-week-shift="0">Today</button><button class="button secondary" data-week-shift="7" aria-label="Next week" ${addDays(week,7)>(ledger?.projection_until||addDays(today(),84))?'disabled':''}>→</button></div><label>Assignee<select id="chore-filter">${options(true)}</select></label></div><div class="chore-week">${days.map(d=>{const tasks=(ledger?.tasks||[]).filter(t=>(t.due_on||(t.completion?localDateTime(t.completion.completed_at).slice(0,10):null))===d&&(filter==='all'||(filter==='anyone'?!t.assignee:t.assignee===filter))).sort(queueOrder(day()));return `<section class="chore-day ${d===day()?'is-today':''}"><div class="chore-day-heading"><h3>${new Date(d+'T12:00:00Z').toLocaleDateString('en-US',{weekday:'short',timeZone:'UTC'})}</h3><span>${Number(d.slice(-2))}</span>${d===day()?'<small>Today</small>':''}</div>${tasks.length?tasks.map(t=>card(t)).join(''):'<p class="chore-day-empty">—</p>'}</section>`;}).join('')}</div><p class="chore-bottom-note">Future routines are previewed for 12 weeks. Undated requests stay on the household board.</p>`;
}
function leaderboardView(){
 const scores=ledger?.leaderboard.filter(s=>s.period===period)||[];
 return `<div class="chore-section-top"><div><h2>Leaderboard</h2></div><label>Time frame<select id="chore-period"><option value="week" ${period==='week'?'selected':''}>This week</option><option value="month" ${period==='month'?'selected':''}>This month</option><option value="all" ${period==='all'?'selected':''}>All time</option></select></label></div><div class="chore-scores">${scores.map(s=>`<details class="chore-score member-${s.member}" data-score-member="${s.member}" style="--race-width:${Math.round(s.units/Math.max(1,...scores.map(x=>x.units))*100)}%"><summary><span class="chore-rank">${s.units?'#'+s.rank:'—'}</span>${avatar(s.member)}<span>${name(s.member)}<small>${s.entries.length} contribution${s.entries.length===1?'':'s'}</small></span><strong>${points(s.units)}<small>points</small></strong><span class="quiet">⌄</span><span class="race-track" aria-hidden="true"><span class="race-bar"></span></span></summary><div class="chore-score-entries">${s.entries.length?s.entries.map(e=>`<div><span>${esc(e.title)}<small>${localStamp(e.completed_at)}</small></span><strong>+${points(e.units)}</strong></div>`).join(''):'<p>No contributions in this period yet.</p>'}</div></details>`).join('')}</div>`;
}
export async function refreshChores(){
 selectRoute();render();
 if(busy||dragging||myTasksInUse())return;
 await Promise.allSettled([loadChores(),refreshMyTasks()]);ledger=choreSource.ledger;live=choreSource.live;
 selectRoute();await reconcileMyTaskOrder();render();
}
export function openSharedTask(task?:Chore,command='edit'){
 initChoreDialogs();ledger=choreSource.ledger;live=choreSource.live;
 if(!identity){toast('Choose your name first.');return;}
 if(!task||command==='edit')openTask('request',task);else if(command==='complete')openCompletion(task);else openAction(task,command);
}
export function exportChores(){if(view==='mine'){exportMyTasks();return;}if(ledger)download({...ledger,exported_at:new Date().toISOString()},'household-chores');else toast('No chore data is available to export yet.');}
function restoreFilters(){
 const weekFilter=$<HTMLSelectElement>('#chore-filter');if(weekFilter)weekFilter.value=filter;
 const boardFilter=$<HTMLSelectElement>('#chore-household-filter');if(boardFilter)boardFilter.value=householdFilter;
}
function show(id:string){retry=null;errorText(id+'-error','');const d=$<HTMLDialogElement>('#'+id+'-dialog');d.showModal();$('#'+id+'-heading').focus({preventScroll:true});}
function setChecks(group:string,selected:Member[]){document.querySelectorAll<HTMLInputElement>(`input[name="${group}"]`).forEach(el=>el.checked=selected.includes(el.value as Member));}
function selectedContributors(group:string){const people=[...document.querySelectorAll<HTMLInputElement>(`input[name="${group}"]:checked`)].map(el=>el.value as Member);if(!people.length)throw new Error('Choose at least one person who helped.');return people;}
function renderTaskIcons(){
 $('#chore-icon-grid').innerHTML=searchTaskIcons(input('chore-icon-search').value,input('chore-icon-category').value).filter(i=>draftKind!=='chore'||i.category==='Chores').map(i=>`<button type="button" data-chore-icon="${i.id}" aria-label="${esc(i.label)} icon" aria-pressed="${manualIcon&&i.id===chosenIcon}">${choreIcon(i.id)}<span>${esc(i.label)}</span></button>`).join('')||'<p>No illustrations found.</p>';
}
function renderChosenIcon(){
 $('#chore-selected-icon').innerHTML=choreIcon(chosenIcon);
 document.querySelectorAll<HTMLElement>('[data-chore-icon]').forEach(b=>b.setAttribute('aria-pressed',String(manualIcon&&b.dataset.choreIcon===chosenIcon)));
}
function updateQueueTiming(){
 const required=taskMode!=='log'&&input('chore-queue').value==='due_date';
 input('chore-due').required=required;
 $('#chore-task-form label[for="chore-due"] .quiet').hidden=required;
}
function openTask(mode:string,task?:Chore){
 if(busy||(!live&&!personalAvailable()))return;
 if(!identity){pendingTask=mode;errorText('chore-identity-error','Choose your name before '+(mode==='log'?'logging a completion.':'adding a task.'));$('#chore-identity').scrollIntoView({block:'center',behavior:'smooth'});$('#chore-identity button').focus({preventScroll:true});return;}
 taskDraft=task;taskMode=mode;taskId=task?.id||crypto.randomUUID();chosenIcon=task?.icon_id||'tidy';manualIcon=!!task;
 $<HTMLFormElement>('#chore-task-form').reset();
 $('#chore-task-heading').textContent=task?'Edit task':mode==='log'?'Log completed work':'Add task';
 input('chore-kind').querySelector<HTMLOptionElement>('option[value=personal]')!.disabled=!!task||mode==='log';
 input('chore-kind').value=task?taskKind(task):mode==='log'?'chore':'personal';input('chore-kind').disabled=!!task?.reminder_group_id;
 setChecks('reminder-recipient',[identity]);
 $<HTMLDetailsElement>('#chore-more').open=!!task?.note;
 $<HTMLDetailsElement>('#chore-scheduling').open=!!task?.expires_on||!!task?.pinned;
 input('chore-title').value=task?.title||'';input('chore-note').value=task?.note||'';input('chore-effort').value=String(task?.points??1);input('chore-preset').value=task?.preset_id||'';input('chore-effort').disabled=!!task?.preset_id;
 $<HTMLInputElement>(`input[name="chore-assignee"][value="${task?.assignee||''}"]`).checked=true;
 input('chore-queue').value=task?queueVisibility(task):'immediately';
 input('chore-queue').querySelector('option[value=immediately]')!.textContent=task?.routine_id?'At cycle start':'Immediately';
 $('#chore-queue-fields').hidden=mode==='log';
 updateQueueTiming();
 input('chore-due').value=task?.due_on||'';input('chore-time').value=task?.due_time||'';input('chore-pinned').checked=task?.pinned||false;
 input('chore-expiry').value=task?.expires_on||'';input('chore-expiry-time').value=task?.expires_time||'';
 input('chore-tonight').checked=false;$<HTMLDetailsElement>('#chore-expiry-details').open=!!task?.expires_on;
 input('chore-log-time').value=localDateTime();setChecks('chore-log-contributor',[identity]);
 $('#chore-log-fields').hidden=mode!=='log';input('chore-log-time').required=mode==='log';$('#chore-shortcuts').hidden=!!task;
 $('#chore-task-actor').textContent=`${task?'Editing':'Adding'} as ${name(identity)}${task?.routine_id?' · only this occurrence changes':''}.`;
 $('#chore-task-save').textContent=mode==='log'?'Log completion':'Save chore';
 $('#chore-task-done').hidden=!task||task.state==='cancelled'||(!task.completion&&!queueReady(task,day()));$('#chore-task-done').textContent=task?.completion?'Correct completion':'Mark done';
 updateTaskKind();renderTaskIcons();renderChosenIcon();show('chore-task');
}
function openCompletion(task:Chore){
 if(!identity||!live||busy||(!task.completion&&!queueReady(task,day())))return;completionTask=task;
 $<HTMLFormElement>('#chore-complete-form').reset();
 $('#chore-complete-summary').innerHTML=`${choreIcon(task.icon_id)}<div><h3>${esc(task.title)}</h3><p>${task.points===0?'This is a reminder. Completing it earns no points.':task.completion?'Update this completion. Credit will be recalculated.':'Confirm who completed this task.'}</p></div>`;
 setChecks('chore-contributor',task.completion?.contributors||[identity]);
 input('chore-complete-effort').value=String(task.points);input('chore-complete-effort').disabled=taskKind(task)!=='chore'||!!task.preset_id;input('chore-completed-at').value=localDateTime(task.completion?.completed_at);
 updateCompletionHint();show('chore-complete');
}
function updateCompletionHint(){
 const noPoints=input('chore-complete-effort').value==='0';
 $('#chore-complete-heading').textContent=noPoints?'Mark this done.':'Complete task';
 $('#chore-complete-summary p').textContent=noPoints?'This is a reminder. Completing it earns no points.':completionTask?.completion?'Update this completion. Credit will be recalculated.':'Confirm who completed this task.';
}
function openAction(task:Chore,action:string){
 if(!identity||!live||busy)return;actionTask=task;actionKind=action;
 const labels:Record<string,[string,string]>={hand_back:['Hand this back?',`“${task.title}” will be unassigned so someone else can claim it.`],claim:['Lend a hand?',`Assign “${task.title}” to ${name(identity)}.`],cancel:['Cancel this chore?',`“${task.title}” will move to Household → Cancelled.`],undo:['Undo this completion?',`Credit for “${task.title}” will be reversed. Its deadline and expiry still apply.`],reopen:['Reopen this chore?',`“${task.title}” will return to its scheduled status. Its deadline and expiry still apply.`]};
 $('#chore-action-heading').textContent=labels[action][0];$('#chore-action-copy').textContent=labels[action][1];input('chore-action-note').value='';show('chore-action');
}
async function save(id:string,fn:string,p:Record<string,unknown>){
 if(busy||!live||!identity)return;const fingerprint=JSON.stringify(p);
 if(!retry||retry.fingerprint!==fingerprint)retry={fingerprint,id:crypto.randomUUID()};
 busy=true;errorText(id+'-error','');
 const fields=[...document.querySelectorAll<HTMLInputElement|HTMLButtonElement|HTMLSelectElement|HTMLTextAreaElement>(`#${id}-dialog input,#${id}-dialog button,#${id}-dialog select,#${id}-dialog textarea`)];
 const states=fields.map(el=>el.disabled);fields.forEach(el=>el.disabled=true);
 try{await saveSharedTask({...p,request_id:retry.id},fn);$<HTMLDialogElement>('#'+id+'-dialog').close();toast(fn==='save_chore_routine'?'Routine saved.':'Chore board updated.');retry=null;}
 catch(error){errorText(id+'-error',error instanceof Error?error.message:'Could not save. Please try again.');}
 finally{busy=false;fields.forEach((el,i)=>el.disabled=states[i]);await refreshChores();}
}
function newStep():RoutineStep{return{queue_visibility:'due_date',kind:'chore',id:crypto.randomUUID(),title:'',icon_id:'tidy',note:'',points:1,weekday:0,time:null};}
// Older grouped routines retain their item IDs and offsets. New routines have
// one item with offset zero, so their selected date is also the actual due date.
const routineWeekday=(start:string,offset=0)=>new Intl.DateTimeFormat('en-US',{weekday:'long',timeZone:'UTC'}).format(new Date(addDays(start,offset)+'T12:00:00Z'));
function readRoutineItems(){
 steps=steps.map(s=>{const row=$<HTMLElement>(`[data-routine-item="${s.id}"]`);const value=(key:string)=>row.querySelector<HTMLInputElement|HTMLSelectElement>(`[data-routine-field="${key}"]`)!.value;return{...s,queue_visibility:value('queue_visibility') as QueueVisibility,preset_id:value('kind')==='chore'?value('preset_id')||null:null,title:steps.length===1?input('routine-title').value.trim():value('title'),note:value('note'),icon_id:value('icon_id'),kind:value('kind') as TaskKind,points:value('kind')==='chore'?Number(value('points')):0,weekday:steps.length===1?s.weekday:Number(value('weekday')),time:value('time')||null};});
}
function renderRoutineItems(){
 const grouped=steps.length>1;
 $('#routine-items').innerHTML=steps.map((s,i)=>{
  const prefix=`routine-item-${i}`;
  return `<${grouped?'fieldset class="routine-item"':'div'} data-routine-item="${s.id}">${grouped?`<legend>Item ${i+1}</legend><label for="${prefix}-title">Task</label><input id="${prefix}-title" data-routine-field="title" value="${esc(s.title)}" maxlength="120" required><label for="${prefix}-day">Day</label><select id="${prefix}-day" data-routine-field="weekday">${Array.from({length:7},(_,n)=>`<option value="${n}" ${n===s.weekday?'selected':''}>${routineWeekday(routineDraft!.start_week,n)}</option>`).join('')}</select>`:''}
  <div class="chore-two-fields"><div><label for="${prefix}-kind">Type</label><select id="${prefix}-kind" data-routine-field="kind">${['chore','reminder','request'].map(k=>`<option value="${k}" ${k===taskKind(s)?'selected':''}>${name(k)}</option>`).join('')}</select></div><div data-routine-points ${taskKind(s)!=='chore'?'hidden':''}><label for="${prefix}-preset">Household job</label><select id="${prefix}-preset" data-routine-field="preset_id">${presetOptions(s.preset_id)}</select><label for="${prefix}-points">Effort</label><select id="${prefix}-points" data-routine-field="points" ${taskKind(s)!=='chore'||s.preset_id?'disabled':''}>${[[0,'No points'],[0.5,'Quick · 0.5 points'],[1,'Small · 1 point'],[2,'Medium · 2 points'],[3,'Large · 3 points']].map(([value,label])=>`<option value="${value}" ${value===s.points?'selected':''}>${label}</option>`).join('')}</select></div></div>
  <label for="${prefix}-queue">Show in queue</label><select id="${prefix}-queue" data-routine-field="queue_visibility"><option value="due_date" ${s.queue_visibility!=='immediately'?'selected':''}>On due date</option><option value="immediately" ${s.queue_visibility==='immediately'?'selected':''}>At cycle start</option></select>
  <details class="form-details routine-context"><summary><span data-routine-icon>${choreIcon(s.icon_id)}</span> Time, illustration & context</summary><div class="chore-two-fields"><div><label for="${prefix}-time">Time (optional)</label><input id="${prefix}-time" data-routine-field="time" type="time" value="${s.time||''}"></div><div><label for="${prefix}-icon">Illustration</label><select id="${prefix}-icon" data-routine-field="icon_id">${(taskKind(s)==='chore'?[...CHORE_ICONS,...TASK_ICONS.filter(i=>i.id===s.icon_id&&!CHORE_ICONS.some(c=>c.id===i.id))]:TASK_ICONS).map(icon=>`<option value="${icon.id}" ${icon.id===s.icon_id?'selected':''}>${icon.label}</option>`).join('')}</select></div></div><label for="${prefix}-note">Context (optional)</label><textarea id="${prefix}-note" data-routine-field="note" maxlength="1000" rows="2">${esc(s.note)}</textarea></details></${grouped?'fieldset':'div'}>`;
 }).join('');
}
function renderOwners(first?:Member){
 const selected=first||input('routine-first').value as Member;
 $('#routine-owner-tiles').innerHTML=MEMBERS.map(m=>`<button type="button" class="person-tile member-${m}" data-routine-owner="${m}" aria-pressed="${owners.includes(m)}">${avatar(m)}${name(m)}</button>`).join('');
 $('#routine-order').innerHTML=owners.map((m,i)=>`<li>${memberChip(m)}<span>${i+1}</span><button type="button" class="text-button" data-owner-move="${m}" data-direction="-1" aria-label="Move ${name(m)} earlier" ${i===0?'disabled':''}>↑</button><button type="button" class="text-button" data-owner-move="${m}" data-direction="1" aria-label="Move ${name(m)} later" ${i===owners.length-1?'disabled':''}>↓</button></li>`).join('');
 $('#routine-rotation').hidden=owners.length<2;
 input('routine-first').innerHTML=owners.map(m=>`<option value="${m}">${name(m)}</option>`).join('');if(owners.includes(selected))input('routine-first').value=selected;
}
function openRoutine(routine?:Routine,fromTask=false){
 if(!identity||!live||busy)return;routineDraft=routine;routineId=routine?.id||crypto.randomUUID();
 const manager=$<HTMLDialogElement>('#chore-routines-dialog');if(manager.open)manager.close();
 $<HTMLFormElement>('#chore-routine-form').reset();
 owners=[...(routine?.owners||[identity])];steps=routine?structuredClone(routine.steps):[newStep()];
 if(fromTask){
  const points=Number(input('chore-effort').value);
  steps=[{...newStep(),preset_id:input('chore-preset').value||null,kind:draftKind==='chore'&&points===0?'reminder':draftKind,points,title:input('chore-title').value,note:input('chore-note').value,icon_id:chosenIcon,time:input('chore-time').value||null}];
  const assignee=$<HTMLInputElement>('input[name="chore-assignee"]:checked').value;
  if(assignee)owners=[assignee as Member];
 }
 $('#chore-routine-heading').textContent=routine?'Edit routine':'Add routine';
 $('#chore-routine-form label[for="routine-title"]').textContent=steps.length===1?'What repeats?':'Routine name';
 input('routine-title').value=steps.length===1?steps[0].title:routine!.title;
 input('routine-start').value=routine?addDays(routine.start_week,steps.length===1?steps[0].weekday:0):(fromTask?input('chore-due').value:'')||day();
 input('routine-interval').value=String(routine?.interval_weeks||1);
 input('routine-start').disabled=!!routine;input('routine-interval').disabled=!!routine;
 $('#routine-anchor-note').hidden=!!routine;
 renderOwners(routine?routine.owners[routine.start_index]:identity);renderRoutineItems();input('routine-enabled').checked=routine?.enabled??true;
 $<HTMLDetailsElement>('#routine-rotation').open=false;
 $('#routine-effective').hidden=!routine;
 show('chore-routine');
}
async function savePersonal(){
 if(busy||!identity||!personalAvailable())return;
 busy=true;errorText('chore-task-error','');
 const fields=[...$('#chore-task-form').querySelectorAll<HTMLInputElement|HTMLButtonElement|HTMLSelectElement|HTMLTextAreaElement>('input,button,select,textarea')],states=fields.map(el=>el.disabled);
 fields.forEach(el=>el.disabled=true);
 try{await createPersonalTask(taskId,input('chore-title').value.trim(),input('chore-personal-group').value.trim()||null);$<HTMLDialogElement>('#chore-task-dialog').close();toast('Personal task added.');}
 catch(error){errorText('chore-task-error',(error as Error).message);}
 finally{busy=false;fields.forEach((el,i)=>el.disabled=states[i]);render();}
}
function renderRoutineList(){
 $('#chore-routine-list').innerHTML=ledger?.routines.length?ledger.routines.map(r=>`<article class="routine-summary"><div><h3>${esc(r.title)}</h3><p class="section-copy">Every ${r.interval_weeks===1?'week':r.interval_weeks+' weeks'} · ${r.owners.map(name).join(' → ')}</p><p class="quiet">${r.effective_on>day()?`${r.enabled?'Changes start':'Pauses'} ${date(r.effective_on)}`:r.enabled?'Running':'Paused'}</p></div><button class="text-button" data-edit-routine="${r.id}">Edit routine</button><details><summary>Schedule</summary><p>Starts with ${name(r.owners[r.start_index])} on ${date(r.start_week)}.</p><ul>${r.steps.map(step=>`<li>${routineWeekday(r.start_week,step.weekday)}${step.time?' '+step.time:''} · ${esc(step.title)} · ${effortLabel(step.points)}${step.note?' · '+esc(step.note):''}</li>`).join('')}</ul>${entryMeta(r)}</details></article>`).join(''):noResults('No routines yet.','Add a weekly routine and choose who takes turns.');
}
function bindBoard(){
 bindCompletionSwipe($('#chore-content'),id=>{const task=ledger?.tasks.find(t=>t.id===id);if(task)void quickComplete(task);},value=>{dragging=value;if(!value)queueMicrotask(()=>{if(pendingRender&&!busy)render();});});
 $('#chores-page').addEventListener('click',event=>{
  const b=(event.target as HTMLElement).closest<HTMLElement>('button');if(!b||b.hasAttribute('disabled')||busy)return;
  if(b.dataset.chorePerson){setIdentity(b.dataset.chorePerson as Member);const next=pendingTask;pendingTask=null;if(next)openTask(next);return;}
  if(b.id==='chore-switch'){setIdentity(null);$('#chore-identity button').focus();return;}
  if(b.dataset.choreView){location.hash=b.dataset.choreView==='mine'?'#chores':'#chores/'+b.dataset.choreView;return;}
  if(b.id==='chore-new')openTask('request');if(b.id==='chore-log')openTask('log');
  if(b.dataset.weekShift){week=b.dataset.weekShift==='0'?weekStart(day()):addDays(week,Number(b.dataset.weekShift));render();restoreFilters();}
  if(b.id==='chore-manage-routines'){renderRoutineList();$<HTMLDialogElement>('#chore-routines-dialog').showModal();$('#chore-routines-heading').focus({preventScroll:true});}
  if(b.dataset.choreCommand&&!b.closest('#my-tasks')){const id=b.closest<HTMLElement>('[data-chore-id]')!.dataset.choreId;const task=ledger?.tasks.find(t=>t.id===id);if(!task)return;const action=b.dataset.choreCommand;if(action==='edit')openTask('request',task);else if(action==='complete')openCompletion(task);else openAction(task,action);}
 });
 $('#chores-page').addEventListener('change',event=>{const el=event.target as HTMLSelectElement;if(el.id==='chore-type-filter')typeFilter=el.value;else if(el.id==='chore-filter')filter=el.value;else if(el.id==='chore-household-filter')householdFilter=el.value;else if(el.id==='chore-status-filter')statusFilter=el.value;else if(el.id==='chore-period')period=el.value;else return;render();restoreFilters();});
}
function bindEditor(){
 $('#chore-preset').addEventListener('change',()=>{const p=pointPreset(input('chore-preset').value);input('chore-effort').disabled=!!p;if(p){input('chore-title').value=p.title;input('chore-effort').value=String(p.points);chosenIcon=p.icon;manualIcon=true;renderChosenIcon();}});
 $('#chore-icon-search').addEventListener('input',renderTaskIcons);
 $('#chore-icon-category').addEventListener('change',renderTaskIcons);
 $('#chore-kind').addEventListener('change',()=>updateTaskKind(true));
 $('#chore-queue').addEventListener('change',updateQueueTiming);
 $('#chore-task-save').insertAdjacentHTML('beforebegin','<button id="chore-task-done" type="button" class="button secondary" hidden>Mark done</button>');
 document.querySelectorAll<HTMLDialogElement>('.chore-dialog').forEach(d=>d.addEventListener('cancel',event=>{if(busy)event.preventDefault();}));
 document.querySelectorAll<HTMLButtonElement>('[data-chore-close]').forEach(b=>b.addEventListener('click',()=>{if(!busy)$<HTMLDialogElement>('#'+b.dataset.choreClose+'-dialog').close();}));
 $('#chore-task-done').addEventListener('click',()=>{if(taskDraft){$<HTMLDialogElement>('#chore-task-dialog').close();openCompletion(taskDraft);}});
 $('#chore-title').addEventListener('input',()=>{if(!manualIcon){chosenIcon=(draftKind==='chore'?suggestChoreIcon:suggestTaskIcon)(input('chore-title').value)||'tidy';renderChosenIcon();}});
 $('#chore-task-form').addEventListener('click',event=>{const b=(event.target as HTMLElement).closest<HTMLElement>('[data-chore-icon],[data-chore-shortcut]');if(!b)return;chosenIcon=b.dataset.choreIcon||b.dataset.choreShortcut!;manualIcon=true;if(b.dataset.choreShortcut||input('chore-fill-title').checked)input('chore-title').value=TASK_ICONS.find(i=>i.id===chosenIcon)!.label;if(b.dataset.choreShortcut&&input('chore-kind').value==='chore'){const id=({bananas:'bananas',trash:'trash-out',recycling:'recycling-out',bins:'bins-return'} as Record<string,string>)[b.dataset.choreShortcut];const preset=pointPreset(id);if(preset){input('chore-preset').value=preset.id;input('chore-effort').value=String(preset.points);input('chore-effort').disabled=true;}}renderChosenIcon();});
 $('#chore-tonight').addEventListener('change',()=>{if(input('chore-tonight').checked){input('chore-expiry').value=day();input('chore-expiry-time').value='';}else{input('chore-expiry').value='';input('chore-expiry-time').value='';}});
 for(const id of ['chore-expiry','chore-expiry-time'])$('#'+id).addEventListener('change',()=>input('chore-tonight').checked=false);
 $('#chore-task-form').addEventListener('submit',event=>{
  event.preventDefault();try{
   if(input('chore-kind').value==='personal'){void savePersonal();return;}
   const kind=input('chore-kind').value as TaskKind;
   const p={kind,queue_visibility:input('chore-queue').value,id:taskId,actor:identity,action:taskDraft?'edit':'create',expected_version:taskDraft?.version||0,title:input('chore-title').value.trim(),icon_id:chosenIcon,note:input('chore-note').value,assignee:$<HTMLInputElement>('input[name="chore-assignee"]:checked').value||null,preset_id:kind==='chore'?input('chore-preset').value||null:null,points:kind==='chore'?Number(input('chore-effort').value):0,pinned:input('chore-pinned').checked,due_on:input('chore-due').value||null,due_time:input('chore-time').value||null,expires_on:input('chore-expiry').value||null,expires_time:input('chore-expiry-time').value||null,...(taskMode==='log'?{completion:{contributors:selectedContributors('chore-log-contributor'),completed_at:input('chore-log-time').value}}:{})};
   if(kind==='reminder'&&!taskDraft&&taskMode!=='log'){const recipients=selectedContributors('reminder-recipient');void save('chore-task','save_reminders',{...p,recipients});}
   else void save('chore-task','save_chore',p);
  }catch(error){errorText('chore-task-error',(error as Error).message);}
 });
 $('#chore-complete-effort').addEventListener('change',updateCompletionHint);
 $('#chore-complete-form').addEventListener('submit',event=>{
  event.preventDefault();if(!completionTask)return;try{void save('chore-complete','save_chore',{id:completionTask.id,actor:identity,action:'complete',expected_version:completionTask.version,kind:taskKind(completionTask),points:Number(input('chore-complete-effort').value),completion:{contributors:selectedContributors('chore-contributor'),completed_at:input('chore-completed-at').value},change_note:input('chore-completion-note').value});}catch(error){errorText('chore-complete-error',(error as Error).message);}
 });
 $('#chore-action-form').addEventListener('submit',event=>{event.preventDefault();if(actionTask)void save('chore-action','save_chore',{id:actionTask.id,actor:identity,action:actionKind,expected_version:actionTask.version,change_note:input('chore-action-note').value});});
 $('#routine-new').addEventListener('click',()=>openRoutine());
 $('#chore-routine-list').addEventListener('click',event=>{const b=(event.target as HTMLElement).closest<HTMLElement>('[data-edit-routine]');if(b)openRoutine(ledger!.routines.find(r=>r.id===b.dataset.editRoutine));});
 $('#routine-owner-tiles').addEventListener('click',event=>{const b=(event.target as HTMLElement).closest<HTMLElement>('[data-routine-owner]');if(!b)return;const m=b.dataset.routineOwner as Member;owners=owners.includes(m)?owners.filter(p=>p!==m):[...owners,m];renderOwners();});
 $('#routine-order').addEventListener('click',event=>{const b=(event.target as HTMLElement).closest<HTMLElement>('[data-owner-move]');if(!b||b.hasAttribute('disabled'))return;const i=owners.indexOf(b.dataset.ownerMove as Member),to=i+Number(b.dataset.direction);[owners[i],owners[to]]=[owners[to],owners[i]];renderOwners();});
 $('#routine-items').addEventListener('change',event=>{const el=event.target as HTMLSelectElement;if(el.dataset.routineField!=='preset_id')return;const p=pointPreset(el.value),row=el.closest<HTMLElement>('[data-routine-item]')!,points=row.querySelector<HTMLSelectElement>('[data-routine-field="points"]')!;points.disabled=!!p;if(p){points.value=String(p.points);row.querySelector<HTMLSelectElement>('[data-routine-field="icon_id"]')!.value=p.icon;if(steps.length===1)input('routine-title').value=p.title;else row.querySelector<HTMLInputElement>('[data-routine-field="title"]')!.value=p.title;}});
 $('#routine-items').addEventListener('change',event=>{
  const el=event.target as HTMLSelectElement,row=el.closest<HTMLElement>('[data-routine-item]');if(!row)return;
  if(el.dataset.routineField==='kind'){const points=row.querySelector<HTMLSelectElement>('[data-routine-field="points"]')!;const preset=row.querySelector<HTMLSelectElement>('[data-routine-field="preset_id"]')!;if(el.value!=='chore')preset.value='';points.disabled=el.value!=='chore'||!!preset.value;row.querySelector<HTMLElement>('[data-routine-points]')!.hidden=el.value!=='chore';}
  else if(el.dataset.routineField==='icon_id')row.querySelector('[data-routine-icon]')!.innerHTML=choreIcon(el.value);
 });
 $('#chore-routine-form').addEventListener('submit',event=>{event.preventDefault();readRoutineItems();if(!owners.length){errorText('chore-routine-error','Choose at least one person.');return;}void save('chore-routine','save_chore_routine',{id:routineId,expected_version:routineDraft?.version||0,actor:identity,title:input('routine-title').value.trim(),start_week:routineDraft?.start_week||input('routine-start').value,interval_weeks:Number(input('routine-interval').value),owners,start_index:owners.indexOf(input('routine-first').value as Member),steps,enabled:input('routine-enabled').checked});});
}
