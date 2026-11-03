'use strict';
const {paperGeometry,cornerTab,tick,success}=TodoPreviewInteractions;
const SWIPE_INSET=8;

// A disposable interaction study. No storage, network requests or notifications.
const sampleToday='2026-11-03';
const me='Michal';
const people=['Michal','Rina','Ohm','Rohil'];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const svg=(path,cls='')=>`<svg class="${cls}" viewBox="0 0 20 20" aria-hidden="true">${path}</svg>`;
const chevron=()=>svg('<path d="m6 8 4 4 4-4"/>','chevron');
const icons={
 personal:'<path d="M5 3h11v14H4V5h1M7 7h6M7 10h6M7 13h3"/>',
 reminders:'<path d="M4 13h12l-1.5-2V8a4.5 4.5 0 0 0-9 0v3L4 13Zm4 3h4"/>',
 household:'<path d="m3 9 7-6 7 6v8H4V9m4 8v-5h4v5"/>',
 turns:'<path d="M16 7a6 6 0 0 0-10-3L3 7m0-4v4h4M4 13a6 6 0 0 0 10 3l3-3m0 4v-4h-4"/>'
};
const lanes=[
 {id:'personal',title:'Personal',hint:'Your tasks, in your own groups'},
 {id:'reminders',title:'Reminders',hint:'From you and from others, together'},
 {id:'household',title:'Household',hint:'Assigned to you or open to anyone'},
 {id:'turns',title:'Taking turns',hint:'Your next turns'}
];
const personalSamples=[
 ['Send project notes','Research','Today'],['Book a haircut','Life admin','This week'],
 ['Finish the experiment write-up','Research','Today'],['Read the next chapter','Learning','No date'],
 ['Review the latest results','Research','This week'],['Renew library books','Life admin','This week'],
 ['Outline the presentation','Research','This week'],['Practice Italian','Learning','No date'],
 ['Sort travel receipts','Life admin','No date'],['Organize reference papers','Research','No date'],
 ['Watch the next lecture','Learning','No date'],['Back up project files','Research','No date']
];
const extraPersonal=[
 'Check the experiment logs','Update the reading list','Review draft figures','Plan next week’s experiments',
 'Write up meeting notes','Tidy the bibliography','Compare the baseline results','Prepare a demo',
 'Book a dentist appointment','Return the spare cable','Compare phone plans','Scan old receipts',
 'Finish the practice exercises','Review chapter notes','Try the next tutorial','Read a saved article',
 'Clean up the project folder','Answer the open questions','Send the revised abstract','Make a packing list'
];
function sampleTasks(profile){
 const personal=personalSamples.map(([title,group,when],i)=>({id:'p'+i,lane:'personal',title,group,when,note:`Part of your ${group} list.`}));
 if(profile==='busy')extraPersonal.forEach((title,i)=>personal.push({id:'extra'+i,lane:'personal',title,group:i<8?'Research':i<12?'Life admin':i<16?'Learning':'Projects',when:'No date',note:'An extra personal task to try a fuller list.'}));
 if(profile==='quiet')return personal;
 return [...personal,
  {id:'rem-lunch',lane:'reminders',title:'Order lunch for the lab meeting',sender:me,date:'2026-11-04',time:'10:00',repeat:7,note:'Check the headcount before placing the order. This reminder repeats every Wednesday.'},
  {id:'rem-finish',lane:'reminders',title:'Finish the methods section',sender:me,date:'2026-11-05',time:'16:00',repeat:0,note:'A one-time reminder you set for yourself.'},
  {id:'rem-rina',lane:'reminders',title:'Put your dishes away',sender:'Rina',date:sampleToday,time:'19:00',repeat:0,note:'Rina asked you to put away your dishes before dinner. Complete it here, just like a reminder you set yourself.'},
  {id:'h-dishes',lane:'household',title:'Empty dishwasher',owner:me,sender:'Rina',points:1,note:'Empty the clean dishes and put everything away.'},
  {id:'h-recycling',lane:'household',title:'Take out recycling',owner:null,sender:'Rohil',points:0.5,note:'Open to anyone in the household.'},
  {id:'turn-milk',lane:'turns',title:'Buy milk',owner:me,owners:[me,'Rohil','Rina'],turn:0,note:'One turn at a time, whenever milk runs out. No deadline and no points.'}
 ];
}
let tasks=sampleTasks('typical'),mode='task',group='All',undoState=null,toastTimer;
let completionHistory=[],archive=[],showHistory=false,pendingTask=null,settling=null;
const openedTiles=new Set();
let openLanes=new Set(['personal','reminders']),fullLanes=new Set();
const $=selector=>document.querySelector(selector);
const laneTasks=id=>(showHistory?archive:tasks).filter(t=>t.lane===id&&(showHistory||id!=='turns'||t.owner===me)).sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned));
const groups=()=>[...new Set(laneTasks('personal').map(t=>t.group))];
const dateLabel=value=>new Date(value+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
const weekday=value=>new Date(value+'T12:00:00Z').toLocaleDateString('en-US',{weekday:'long',timeZone:'UTC'});
const timeLabel=value=>{const [h,m]=value.split(':').map(Number);return `${h%12||12}${m?':'+String(m).padStart(2,'0'):''} ${h<12?'AM':'PM'}`;};
function shiftDate(value,days){const d=new Date(value+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function repeatLabel(task){return task.repeat===7?`Every ${weekday(task.date)}`:task.repeat===14?`Every other ${weekday(task.date)}`:'Once';}
const needsPeople=task=>task.lane==='household'||task.lane==='turns';
const pointsLabel=points=>`${points} ${points===1?'point':'points'}`;
function creditLabel(points,count){
 if(!points)return 'No points for this task.';
 if(!count)return `${pointsLabel(points)} total. Choose who helped.`;
 if(count===1)return `${pointsLabel(points)} to the selected person.`;
 const each=points/count,rounded=Math.round(each*100)/100;
 return `${pointsLabel(points)} split equally · ${rounded!==each?'≈ ':''}${pointsLabel(rounded)} each.`;
}
function meta(task){
 if(task.archived)return [task.archived,...(task.contributors?.length?[task.contributors.join(' + ')]:[])];
 if(task.lane==='personal')return [task.group,task.when];
 if(task.lane==='reminders')return [task.sender===me?'Set by you':`From ${task.sender}`,`${task.date===sampleToday?'Today':dateLabel(task.date)} · ${timeLabel(task.time)}`,task.repeat?repeatLabel(task):'One time'];
 if(task.lane==='household')return [task.owner===me?'Assigned to you':task.owner?'Assigned to '+task.owner:'Anyone',`From ${task.sender}`,pointsLabel(task.points)];
 return ['You’re next','As needed','Then '+task.owners[(task.turn+1)%task.owners.length]];
}
function taskRow(task){
 const open=openedTiles.has(task.id),id=esc(task.id);
 return `<article class="task-row${task.pinned?' is-pinned':''}${task.archived?' is-archived':''}" data-task-id="${id}" aria-labelledby="task-title-${id}">
  <svg class="paper-frame" aria-hidden="true" focusable="false"><path class="paper-fill" data-paper-shape/><path class="row-fill" data-paper-shape/><path class="paper-curl"/><path class="paper-crease"/><path class="paper-outline" data-paper-shape/></svg>
  <div class="task-face">
  ${task.archived?'<span class="archive-mark" aria-hidden="true">'+(task.archived==='Completed'?'✓':'−')+'</span>':`<button type="button" class="task-grip" data-swipe="${id}" aria-label="${needsPeople(task)?'Choose who completed':'Complete'} ${esc(task.title)}" aria-describedby="gesture-hint" title="Drag right, or press Enter" ${open?'disabled':''}><span class="grip-dot" aria-hidden="true"></span>${svg('<path d="m5 6 4 4-4 4m6-8 4 4-4 4"/>')}</button>`}
  <div class="task-content"><h3 class="task-title" id="task-title-${id}">${esc(task.title)}</h3><p class="task-meta">${task.pinned?'<span class="pinned-label">↑ Pinned</span>':''}${meta(task).map(s=>`<span>${esc(s)}</span>`).join('')}</p></div>
  <span class="swipe-label" aria-hidden="true">Slide to ${needsPeople(task)?'choose people':'complete'}</span></div>
  <details class="tile-tools" ${open?'open':''}>${cornerTab(task.title)}<div class="tile-tools-panel">
   <p class="tile-note">${esc(task.note)}</p>
   <div class="tile-actions">${task.archived?`${!task.sourceId?`<button type="button" data-restore="${id}">${task.archived==='Completed'?'Undo completion':'Restore'}</button>`:undoState?.target===task.sourceId?'<button type="button" data-undo-change>Undo last change</button>':''}`:`<button type="button" data-edit="${id}">${task.lane==='turns'?'Edit this turn':'Edit'}</button><button type="button" data-pin="${id}" aria-pressed="${!!task.pinned}">${task.pinned?'Unpin':'Pin'}</button><button type="button" data-review-complete="${id}">${needsPeople(task)?'Complete together…':'Mark done'}</button>${task.lane==='household'?`<button type="button" data-claim="${id}">${task.owner===me?'Hand back':'Claim'}</button>`:''}<button type="button" class="remove-action" data-remove="${id}">${task.lane==='turns'?'Skip turn':task.lane==='household'?'Cancel chore':task.lane==='reminders'?'Cancel reminder':'Delete'}</button>`}<button type="button" data-history="${id}" aria-haspopup="dialog">History</button></div>
   <p class="tile-attribution">${task.sender?'Requested by '+esc(task.sender):'Your personal task'}${task.history?.length?' · '+esc(task.history.at(-1).text):''}</p>
  </div></details>
 </article>`;
}
const tileResize=new ResizeObserver(entries=>entries.forEach(({target})=>drawPaper(target)));
function drawPaper(tile){
 const width=tile.offsetWidth,height=tile.offsetHeight;if(!width||!height)return;
 const shape=paperGeometry(width,height,10),frame=tile.querySelector('.paper-frame');frame.setAttribute('viewBox',`0 0 ${width} ${height}`);
 frame.querySelectorAll('[data-paper-shape]').forEach(path=>path.setAttribute('d',shape.outer));frame.querySelector('.paper-curl').setAttribute('d',shape.flap);frame.querySelector('.paper-crease').setAttribute('d',shape.curl);
 tile.style.setProperty('--swipe-travel',`${Math.max(0,tile.clientWidth-44-2*SWIPE_INSET)}px`);
}
function laneMarkup(lane){
 const all=laneTasks(lane.id);if(!all.length)return '';
 const list=lane.id==='personal'&&group!=='All'?all.filter(t=>t.group===group):all;
 const limit=lane.id==='personal'?4:3,shown=fullLanes.has(lane.id)?list:list.slice(0,limit),open=openLanes.has(lane.id);
 const caption=open?lane.hint:all[0].title+(all.length>1?` · +${all.length-1} more`:'');
 return `<section class="lane ${lane.id}" data-lane="${lane.id}" data-open="${open}" aria-labelledby="title-${lane.id}">
  <div class="lane-heading"><h2 class="sr-only" id="title-${lane.id}">${lane.title}</h2><button type="button" class="lane-toggle" data-lane-toggle="${lane.id}" aria-expanded="${open}" aria-controls="body-${lane.id}" aria-label="${open?'Collapse':'Expand'} ${lane.title}">
   <span class="lane-icon">${svg(icons[lane.id])}</span><span class="heading-copy"><span class="lane-title">${lane.title}</span><span class="lane-caption">${esc(caption)}</span></span><span class="lane-count" aria-label="${all.length} tasks">${all.length}</span>${chevron()}
  </button>${['personal','reminders'].includes(lane.id)?`<button type="button" class="lane-add" data-add-to="${lane.id}" aria-label="Add ${lane.id==='reminders'?'a reminder':'a personal task'}">＋</button>`:''}</div>
  <div class="lane-body" id="body-${lane.id}" ${open?'':'hidden'}>
   ${lane.id==='personal'?`<div class="group-filters" role="group" aria-label="Personal task groups">${['All',...groups()].map(g=>`<button type="button" data-group="${esc(g)}" aria-pressed="${group===g}">${esc(g)}<span>${g==='All'?all.length:all.filter(t=>t.group===g).length}</span></button>`).join('')}</div>`:''}
   <div class="task-list">${shown.map(taskRow).join('')}</div>
   ${list.length>limit?`<div class="lane-footer"><button type="button" class="show-more" data-more="${lane.id}" aria-expanded="${fullLanes.has(lane.id)}">${fullLanes.has(lane.id)?'Show fewer':`Show ${list.length-shown.length} more${lane.id==='personal'&&group!=='All'?' in '+esc(group):''}`}</button></div>`:''}
   ${lane.id==='turns'?'<p class="lane-context">Finish your turn to pass it on. This lane appears when it’s your turn again.</p>':''}
  </div>
 </section>`;
}
function renderBoard(){
 cancelDrag();
 if(group!=='All'&&!groups().includes(group))group='All';
 $('#personal-groups').innerHTML=groups().map(g=>`<option value="${esc(g)}">`).join('');
 const count=lanes.reduce((n,l)=>n+laneTasks(l.id).length,0),reminders=laneTasks('reminders').length;
 $('#task-summary').textContent=showHistory?`${count} completed or removed`:`${count} open${reminders?` · ${reminders} reminders`:''}`;
 $('#show-history').checked=showHistory;
 tileResize.disconnect();
 $('#lanes').innerHTML=lanes.map(laneMarkup).join('')||`<p class="empty">${showHistory?'No completed or removed tasks yet.':'All clear for now.<br>Add a task or a reminder above.'}</p>`;
 document.querySelectorAll('[data-task-id]').forEach(tile=>{drawPaper(tile);tileResize.observe(tile);});
 const last=completionHistory.at(-1);$('#completion-receipt').hidden=!last;
 $('#completion-receipt').innerHTML=last?`<span class="receipt-check" aria-hidden="true">✓</span><div><p class="receipt-title">${esc(last.title)} · completed</p><p>${last.contributors.map(esc).join(' + ')}${last.shared?' · '+creditLabel(last.points,last.contributors.length):''}</p></div>`:'';
}
function focus(selector){$(selector)?.focus({preventScroll:true});}
function setMode(next){
 mode=next;const reminder=mode==='reminder';
 document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
 $('#group-field').hidden=reminder;$('#reminder-owner').hidden=!reminder;$('#reminder-options').hidden=!reminder;
 $('#quick-title').placeholder=reminder?'Remind me to…':'What needs doing?';$('#quick-save').textContent=reminder?'Set reminder':'Add task';
 $('#quick-date').required=reminder;$('#quick-time').required=reminder;
 scheduleSummary();
}
function scheduleSummary(){
 const date=$('#quick-date').value,time=$('#quick-time').value,repeat=Number($('#quick-repeat').value);
 if(!date||!time){$('#schedule-summary').textContent='Choose a date and time. New York time.';return;}
 $('#schedule-summary').textContent=repeat?`${repeatLabel({date,repeat})} at ${timeLabel(time)}, starting ${dateLabel(date)}. New York time.`:`${dateLabel(date)} at ${timeLabel(time)}. New York time.`;
}
function toast(message,undo=false){
 clearTimeout(toastTimer);$('#toast span').textContent=message;$('#undo').hidden=!undo;$('#toast').hidden=false;
 toastTimer=setTimeout(()=>{$('#toast').hidden=true;},10000);
}
function openTaskDialog(title,body){
 const dialog=$('#task-dialog');
 dialog.innerHTML=`<div class="dialog-heading"><h2 id="dialog-title" tabindex="-1" autofocus>${esc(title)}</h2><button type="button" class="dialog-close" data-close-dialog aria-label="Close">×</button></div>${body}`;
 if(!dialog.open)dialog.showModal();focus('#dialog-title');
}
function checkpoint(label,target){
 undoState={label,target,tasks:structuredClone(tasks),archive:structuredClone(archive),group,showHistory,completionHistory:structuredClone(completionHistory),openLanes:[...openLanes],fullLanes:[...fullLanes]};
}
function logTask(task,text){(task.history??=[]).push({text,actor:me,at:new Date().toISOString()});}
function archiveTask(task,state,contributors=[],advanced=false){
 const entry=structuredClone(task);entry.archived=state;entry.contributors=[...contributors];
 if(advanced){entry.sourceId=task.id;entry.id='archive-'+crypto.randomUUID();}
 archive.unshift(entry);
}
function showEdit(id){
 if(settling)return;const task=tasks.find(t=>t.id===id);if(!task)return;pendingTask=task;
 openTaskDialog(task.lane==='turns'?'Edit this turn':'Edit task',`<form id="edit-task-form"><label class="edit-field">Title<input id="edit-title" value="${esc(task.title)}" maxlength="120" required></label>
 ${task.lane==='personal'?`<label class="edit-field">Group<input id="edit-group" value="${esc(task.group)}" maxlength="40" list="personal-groups"></label>`:''}
 <label class="edit-field">Details<textarea id="edit-note" maxlength="600" rows="3">${esc(task.note)}</textarea></label>
 ${task.lane==='household'?`<label class="edit-field">Assigned to<select id="edit-owner"><option value="">Anyone</option>${people.map(p=>`<option ${p===task.owner?'selected':''}>${p}</option>`).join('')}</select></label>`:''}
 ${task.lane==='reminders'?`<div class="schedule-fields"><label>On<input id="edit-date" type="date" value="${task.date}" required></label><label>At<input id="edit-time" type="time" value="${task.time}" required></label><label>Repeat<select id="edit-repeat">${[[0,'Just once'],[7,'Every week'],[14,'Every 2 weeks']].map(([value,title])=>`<option value="${value}" ${task.repeat===value?'selected':''}>${title}</option>`).join('')}</select></label></div>`:''}
 <div class="dialog-actions"><button class="primary" type="submit">Save changes</button><button class="secondary" type="button" data-close-dialog>Cancel</button></div></form>`);
}
function showTaskHistory(id){
 const task=[...tasks,...archive].find(t=>t.id===id);if(!task)return;pendingTask=task;
 openTaskDialog('Task history',`<p class="completion-task-name">${esc(task.title)}</p><ol class="task-history"><li><strong>Created</strong><span>${esc(task.sender||me)} · Sample task</span></li>${(task.history||[]).map(h=>`<li><strong>${esc(h.text)}</strong><span>${esc(h.actor)} · ${new Date(h.at).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</span></li>`).join('')}</ol><div class="dialog-actions"><button type="button" class="secondary" data-close-dialog>Close</button></div>`);
}
function removeTask(id){
 if(settling)return;const task=tasks.find(t=>t.id===id);if(!task)return;
 checkpoint('Removal',id);
 const state=task.lane==='turns'?'Skipped':task.lane==='personal'?'Deleted':'Cancelled';logTask(task,state);
 archiveTask(task,state,[],task.lane==='turns');
 if(task.lane==='turns'){task.turn++;task.owner=task.owners[task.turn%task.owners.length];}else tasks=tasks.filter(t=>t!==task);
 renderBoard();toast(state==='Skipped'?'Turn skipped without points':task.title+' removed',true);
}
function restoreTask(id){
 const task=archive.find(t=>t.id===id);if(!task||task.sourceId||tasks.some(t=>t.id===id))return;
 checkpoint('Restoration',id);archive=archive.filter(t=>t!==task);
 const restored=structuredClone(task),completed=restored.archived==='Completed';delete restored.archived;delete restored.contributors;
 logTask(restored,completed?'Completion undone':'Restored');tasks.unshift(restored);
 if(completed)completionHistory=completionHistory.filter(h=>h.id!==id);
 showHistory=false;openLanes.add(restored.lane);if(restored.lane==='personal')group=restored.group;renderBoard();toast('Task restored',true);
}
function undoChange(){
 if(!undoState||settling||$('#task-dialog').open)return;
 const label=undoState.label;({tasks,archive,group,showHistory,completionHistory}=undoState);openLanes=new Set(undoState.openLanes);fullLanes=new Set(undoState.fullLanes);undoState=null;renderBoard();toast(label+' undone');
}
function requestComplete(id,feedback=true){
 if(settling)return;const task=tasks.find(t=>t.id===id);if(!task)return;
 if(!needsPeople(task)){pendingTask=null;$('#task-dialog').close();complete(id,[me],feedback);return;}
 pendingTask=task;
 openTaskDialog('Who helped?',`<p class="completion-task-name">${esc(task.title)}</p><p class="dialog-meta">Select everyone who did the work, even if the task was assigned to someone else.</p>
  <form id="contributors-form"><fieldset class="people-field"><legend>Completed by</legend><div class="people-options">${people.map((person,i)=>`<label class="person-option person-${i}"><input type="checkbox" name="contributor" value="${person}" ${person===me?'checked':''}><span class="person-avatar" aria-hidden="true">${person[0]}</span><span>${person}${person===me?' (you)':''}</span><span class="person-check" aria-hidden="true">✓</span></label>`).join('')}</div></fieldset>
  <p id="credit-summary" class="credit-summary" role="status">${creditLabel(task.points||0,1)}</p>
  ${task.lane==='turns'?`<p class="dialog-meta">Next turn: ${esc(task.owners[(task.turn+1)%task.owners.length])}. The turn advances once, even when you complete it together.</p>`:''}
  <div class="dialog-actions"><button class="primary" id="confirm-completion" type="submit">${task.lane==='turns'?'Finish this turn':'Complete chore'}</button><button class="secondary" type="button" data-close-dialog>Cancel</button></div></form>`);
}
$('#task-dialog').addEventListener('change',event=>{
 if(event.target.name!=='contributor'||!pendingTask)return;
 const count=$('#task-dialog').querySelectorAll('input[name="contributor"]:checked').length;
 $('#confirm-completion').disabled=!count;
 $('#credit-summary').textContent=count?creditLabel(pendingTask.points||0,count):'Choose at least one person who helped.';
});
$('#task-dialog').addEventListener('submit',event=>{
 if(event.target.id==='edit-task-form'){
  event.preventDefault();const task=pendingTask,title=$('#edit-title').value.trim();if(!task||!tasks.includes(task)||!title)return;
  checkpoint('Edit',task.id);const oldTitle=task.title;task.title=title;task.note=$('#edit-note').value.trim();
  if(task.lane==='personal'){task.group=$('#edit-group').value.trim()||'Ungrouped';group=task.group;}
  if(task.lane==='household')task.owner=$('#edit-owner').value||null;
  if(task.lane==='reminders'){task.date=$('#edit-date').value;task.time=$('#edit-time').value;task.repeat=Number($('#edit-repeat').value);}
  logTask(task,oldTitle===title?'Edited task details':`Renamed “${oldTitle}” to “${title}”`);pendingTask=null;$('#task-dialog').close();renderBoard();toast('Changes saved in this preview',true);return;
 }
 if(event.target.id!=='contributors-form')return;event.preventDefault();
 const task=pendingTask,contributors=[...event.target.querySelectorAll('input[name="contributor"]:checked')].map(input=>input.value);
 if(!task||!tasks.includes(task)||!contributors.length)return;
 pendingTask=null;$('#task-dialog').close();complete(task.id,contributors);
});
$('#task-dialog').addEventListener('close',()=>{
 const task=pendingTask;pendingTask=null;
 if(task){resetRow($(`[data-task-id="${task.id}"]`));focus(`[data-swipe="${task.id}"]`);}
});
function complete(id,contributors=[me],feedback=true){
 const task=tasks.find(t=>t.id===id);if(!task)return;
 if(needsPeople(task)&&(!contributors.length||contributors.some(p=>!people.includes(p))))return;
 checkpoint('Completion',id);
 logTask(task,'Completed by '+contributors.join(' + '));archiveTask(task,'Completed',contributors,task.lane==='turns'||!!task.repeat);
 if(feedback)success();
 completionHistory.push({id:task.id,title:task.title,shared:needsPeople(task),contributors:[...new Set(contributors)],points:task.points||0});
 let message='Completed in this preview';
 if(task.lane==='turns'){
  task.turn++;task.owner=task.owners[task.turn%task.owners.length];message=`Your turn is done. ${task.owner} is next.`;
 }else if(task.lane==='reminders'&&task.repeat){
  task.date=shiftDate(task.date,task.repeat);message=`Done. Next reminder: ${dateLabel(task.date)}.`;
 }else{tasks=tasks.filter(t=>t.id!==id);if(needsPeople(task))message=`Completed by ${contributors.join(' + ')}.`;}
 renderBoard();toast(message,true);
 focus(`[data-lane-toggle="${task.lane}"]`);if(!laneTasks(task.lane).length)focus('#quick-title');
}
function reset(){
 clearTimeout(settling);settling=null;pendingTask=null;$('#task-dialog').close();
 tasks=sampleTasks($('#sample-day').value);archive=[];showHistory=false;openedTiles.clear();group='All';undoState=null;completionHistory=[];openLanes=new Set(['personal','reminders']);fullLanes=new Set();
 renderBoard();toast('Sample reset');
}

$('#quick-add').addEventListener('submit',event=>{
 event.preventDefault();const title=$('#quick-title').value.trim();if(!title)return;
 const id='new-'+crypto.randomUUID(),lane=mode==='reminder'?'reminders':'personal';
 const task=mode==='reminder'?{id,lane,title,sender:me,date:$('#quick-date').value,time:$('#quick-time').value,repeat:Number($('#quick-repeat').value),note:'A reminder you set for yourself.'}:{id,lane,title,group:$('#quick-group').value.trim()||'Ungrouped',when:'No date',note:'Added to your personal list in this preview.'};
 tasks.unshift(task);showHistory=false;openLanes.add(lane);if(lane==='personal')group=task.group;fullLanes.delete(lane);
 $('#quick-title').value='';renderBoard();toast(mode==='reminder'?'Reminder added to this preview':'Task added to this preview');focus('#quick-title');
});
document.addEventListener('click',event=>{
 const button=event.target.closest('button');if(!button)return;
 const data=button.dataset;
 if(data.mode){setMode(data.mode);focus('#quick-title');}
 if(data.addTo){setMode(data.addTo==='reminders'?'reminder':'task');$('#quick-add').scrollIntoView({block:'nearest',behavior:'instant'});focus('#quick-title');}
 if(data.laneToggle){if(openLanes.has(data.laneToggle))openLanes.delete(data.laneToggle);else openLanes.add(data.laneToggle);renderBoard();focus(`[data-lane-toggle="${data.laneToggle}"]`);}
 if(data.edit)showEdit(data.edit);
 if(data.history)showTaskHistory(data.history);
 if(data.remove)removeTask(data.remove);
 if(data.restore)restoreTask(data.restore);
 if(button.hasAttribute('data-undo-change'))undoChange();
 if(data.pin&&!settling){const task=tasks.find(t=>t.id===data.pin);if(task){checkpoint('Pin change',task.id);task.pinned=!task.pinned;logTask(task,task.pinned?'Pinned':'Unpinned');renderBoard();toast(task.pinned?'Pinned to the top':'Unpinned',true);focus(`[data-pin="${task.id}"]`);}}
 if(data.claim&&!settling){const task=tasks.find(t=>t.id===data.claim);if(task){checkpoint('Assignment',task.id);task.owner=task.owner===me?null:me;logTask(task,task.owner?'Claimed by '+me:'Handed back');renderBoard();toast(task.owner?'Assigned to you':'Available to anyone',true);}}
 if(data.group){group=data.group;fullLanes.delete('personal');renderBoard();focus(`[data-group="${CSS.escape(group)}"]`);}
 if(data.more){if(fullLanes.has(data.more))fullLanes.delete(data.more);else fullLanes.add(data.more);renderBoard();focus(`[data-more="${data.more}"]`);}
 if(data.reviewComplete)requestComplete(data.reviewComplete);
 if(button.hasAttribute('data-close-dialog'))$('#task-dialog').close();
 if(data.swipe&&event.detail===0)requestComplete(data.swipe);
});
$('#undo').addEventListener('click',undoChange);
$('#show-history').addEventListener('change',()=>{showHistory=$('#show-history').checked;group='All';openLanes=new Set(lanes.map(l=>l.id));renderBoard();});
$('#lanes').addEventListener('toggle',event=>{
 const details=event.target;if(!details.matches('.tile-tools'))return;
 const row=details.closest('[data-task-id]');if(!row?.isConnected)return;
 if(details.open){openedTiles.add(row.dataset.taskId);cancelDrag();}else openedTiles.delete(row.dataset.taskId);
 const grip=row.querySelector('.task-grip');if(grip)grip.disabled=details.open;
 drawPaper(row);
},true);
$('#sample-day').addEventListener('change',reset);$('#reset-sample').addEventListener('click',reset);
for(const id of ['quick-date','quick-time','quick-repeat'])$('#'+id).addEventListener('input',scheduleSummary);

// Start at the bullet or anywhere on the row. Wait for horizontal intent so
// scrolling stays native. Shared work is completed only after people confirm.
let drag=null;
function resetRow(row){
 if(!row)return;row.classList.remove('is-dragging','is-armed','is-settling');row.classList.add('is-returning');row.style.setProperty('--progress','0');row.style.setProperty('--near','0');
 const grip=row.querySelector('.task-grip');if(grip)grip.disabled=row.querySelector('.tile-tools').open;
 const task=tasks.find(t=>t.id===row.dataset.taskId);
 if(task)row.querySelector('.swipe-label').textContent=`Slide to ${needsPeople(task)?'choose people':'complete'}`;
}
function cancelDrag(){
 const stroke=drag;drag=null;if(!stroke)return;
 if(stroke.row.hasPointerCapture(stroke.pointer))stroke.row.releasePointerCapture(stroke.pointer);
 resetRow(stroke.row);
}
document.addEventListener('pointerdown',event=>{
 const row=event.target.closest('[data-task-id]');
 if(!row||settling||$('#task-dialog').open||event.target.closest('.tile-tools')||row.querySelector('.tile-tools').open||showHistory||event.button!==0||!event.isPrimary)return;
 cancelDrag();row.classList.remove('is-returning');
 drag={id:row.dataset.taskId,row,pointer:event.pointerId,x:event.clientX,y:event.clientY,travel:Math.max(60,row.getBoundingClientRect().right-event.clientX-22-SWIPE_INSET),progress:0,active:false};
});
document.addEventListener('pointermove',event=>{
 if(!drag||event.pointerId!==drag.pointer)return;
 const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
 if(Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)){cancelDrag();return;}
 if(!drag.active){if(dx<8||dx<=Math.abs(dy))return;drag.active=true;drag.row.setPointerCapture(event.pointerId);drag.row.classList.add('is-dragging');}
 const wasArmed=drag.progress>=.9;
 drag.progress=Math.max(0,Math.min(1,dx/drag.travel));drag.row.style.setProperty('--progress',String(drag.progress));
 drag.row.style.setProperty('--near',String(Math.max(0,Math.min(1,(drag.progress-.65)/.25))));
 drag.row.classList.toggle('is-armed',drag.progress>=.9);if(!wasArmed&&drag.progress>=.9)tick();
 const task=tasks.find(t=>t.id===drag.id);
 drag.row.querySelector('.swipe-label').textContent=`${drag.progress>=.9?'Release':'Slide'} to ${needsPeople(task)?'choose people':'complete'}`;
});
function finishDrag(event){
 if(!drag||event.pointerId!==drag.pointer)return;
 const stroke=drag;drag=null;
 if(stroke.row.hasPointerCapture(event.pointerId))stroke.row.releasePointerCapture(event.pointerId);
 if(event.type==='pointerup'&&stroke.progress>=.9){
  const task=tasks.find(t=>t.id===stroke.id);
  if(!needsPeople(task))success();
  stroke.row.style.setProperty('--progress','1');stroke.row.style.setProperty('--near','1');stroke.row.classList.remove('is-dragging','is-armed');stroke.row.classList.add('is-settling');stroke.row.querySelector('.task-grip').disabled=true;
  stroke.row.querySelector('.swipe-label').textContent=needsPeople(task)?'Choose who helped…':'Completed';
  // Let the gesture finish before a modal or another row replaces its target.
  settling=setTimeout(()=>{settling=null;if(tasks.includes(task))requestComplete(stroke.id,false);},500);
 }else resetRow(stroke.row);
}
document.addEventListener('pointerup',finishDrag);document.addEventListener('pointercancel',finishDrag);
// Moving capture from the touched bullet to its row is part of the gesture.
document.addEventListener('lostpointercapture',event=>{if(drag&&event.target===drag.row)finishDrag(event);});
setMode('task');renderBoard();
