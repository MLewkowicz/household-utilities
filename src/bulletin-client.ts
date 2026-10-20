import {avatar} from './people';
import {info} from './disclosure';
import {MEMBERS,type Member} from './ledger';
import {highlightNotification} from './notifications';

export function focusBulletinNotification(id:string){
 if(!ledger?.notes.some(n=>n.id===id&&!n.deleted))return false;
 view='board';kind='all';recipient='all';showDeleted=false;render();
 return highlightNotification(`[data-note-id="${CSS.escape(id)}"]`);
}
import {$,esc,name,date,rpc,toast,download,saved,remember} from './ui';
import {identity,setIdentity,onIdentityChange} from './identity';
import {localDateTime} from './chores';
import {type Bulletin,type BulletinNote,temperatureLabel,notePlacement} from './bulletin';
import {reactionSVG} from './reactions';
import {bulletinCharacter,watchBulletinCharacters} from './bulletin-avatars';
import {thumbtack,noteFold,boardStand} from './bulletin-art';

let ledger:Bulletin|undefined,live=false,loading=false,busy=false;
let view='board',kind='all',recipient='all',period='all',showDeleted=false,pendingNew=false;
let draft:BulletinNote|undefined,noteId='',actionNote:BulletinNote|undefined,action='delete';
let retry:{fingerprint:string;id:string}|null=null;
let boardCharacters:ReturnType<typeof watchBulletinCharacters>,previewCharacters:ReturnType<typeof watchBulletinCharacters>;
let animateCharacters=saved('household-note-motion')!=='off';
const field=<T extends HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement=HTMLInputElement>(id:string)=>$<T>('#'+id);
const chip=(m:Member)=>`<span class="actor-chip member-${m}">${name(m)}</span>`;
const stamp=(value:string)=>new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value));
function error(id:string,message:string){$('#'+id).textContent=message;$('#'+id).hidden=!message;}
const tempText=(value:number)=>`${value<0?'Complaint':value>0?'Compliment':'Neutral'} · ${Math.abs(value)}/100`;
function dialog(id:string,title:string,content:string,button:string){return `<dialog id="${id}-dialog" class="bulletin-dialog" aria-labelledby="${id}-heading"><form id="${id}-form"><div class="dialog-top"><h2 id="${id}-heading" tabindex="-1" autofocus>${title}</h2><button type="button" class="icon-button" data-bulletin-close="${id}" aria-label="Close">×</button></div>${content}<p id="${id}-error" class="form-error" role="alert" hidden></p><div class="dialog-actions"><button type="button" class="button secondary" data-bulletin-close="${id}">Cancel</button><button type="submit" id="${id}-save" class="button primary">${button}</button></div></form></dialog>`;}
export function initBulletin(){
 $('#bulletin-page').innerHTML=`<section class="intro"><div><div class="eyebrow">LITTLE NOTES, BIG FEELINGS</div><h1>The bulletin board<span class="brand-period">.</span></h1><p class="intro-copy">A corner for your gripes. A corner for your gratitude.</p></div><div class="intro-side"><span class="status"><span class="status-dot"></span><span id="bulletin-status">Loading notes</span></span><button id="bulletin-new" class="button primary" disabled>＋ Pin a note</button></div></section>
 <div id="bulletin-notice" class="ledger-notice" role="status" hidden></div>
 <section id="bulletin-identity" class="identity-panel"><div><div class="eyebrow">MAKE YOURSELF AT HOME</div><h2>Who are you?</h2><p class="section-copy">Put a name to your note.</p><p id="bulletin-identity-error" class="form-error" role="alert" hidden></p></div><div class="identity-choices">${MEMBERS.map(m=>`<button class="person-tile member-${m}" data-bulletin-person="${m}">${avatar(m)}<span>I’m ${name(m)}</span></button>`).join('')}</div></section>
 <div id="bulletin-identity-bar" class="identity-bar" hidden><span id="bulletin-identity-name"></span><button id="bulletin-switch" class="text-button">Switch person</button><span class="identity-caption">A little honesty. A little kindness.</span></div>
 <nav class="chore-views bulletin-views" aria-label="Bulletin views">${[['board','The board'],['activity','By the numbers']].map(([v,label])=>`<button data-bulletin-view="${v}" aria-pressed="${v==='board'}">${label}</button>`).join('')}</nav><div id="bulletin-content"></div>`;
 document.body.insertAdjacentHTML('beforeend',dialog('bulletin-note','Pin a little feeling.',`
 <div class="temperature-control"><div id="bulletin-reaction" class="bulletin-reaction"></div><div class="temperature-caption"><strong id="bulletin-expression"></strong><output id="bulletin-temperature-output" for="bulletin-temperature"></output></div>
 <label for="bulletin-temperature" class="sr-only">Temperature</label><input type="range" id="bulletin-temperature" min="-100" max="100" step="1" value="35" aria-describedby="bulletin-temperature-help"><div class="temperature-ends"><span>← Complaint</span><span>Compliment →</span></div><p id="bulletin-temperature-help" class="field-help">Slide to find the feeling.</p></div>
 <fieldset class="chore-contributors"><legend>Who’s this for?</legend><div class="chore-member-options">${MEMBERS.map(m=>`<label class="chore-check-tile member-${m}"><input type="checkbox" name="bulletin-recipient" value="${m}">${avatar(m)}${name(m)}</label>`).join('')}</div></fieldset>
 <label for="bulletin-body">Your note</label><textarea id="bulletin-body" rows="4" maxlength="600" required placeholder="Something on your mind…"></textarea><div class="bulletin-writing-help"><span>Public to anyone with the link. Keep personal details out.</span><span id="bulletin-character-count">0 / 600</span></div><p id="bulletin-actor" class="field-help"></p>`,'Pin note')+
 dialog('bulletin-action','Take this note down?',`<p id="bulletin-action-copy" class="section-copy"></p>`,'Delete note'));
 boardCharacters=watchBulletinCharacters($('#bulletin-content'));
 previewCharacters=watchBulletinCharacters($('#bulletin-reaction'));
 window.addEventListener('hashchange',updateAvatarActivity);
 document.addEventListener('visibilitychange',updateAvatarActivity);
 $('#bulletin-page').addEventListener('click',event=>{
  const b=(event.target as HTMLElement).closest<HTMLElement>('button');if(!b||b.hasAttribute('disabled'))return;
  if(b.dataset.bulletinPerson){setIdentity(b.dataset.bulletinPerson as Member);if(pendingNew){pendingNew=false;openNote();}return;}
  if(b.id==='bulletin-switch'){setIdentity(null);$('#bulletin-identity button').focus();return;}
  if(b.id==='bulletin-new'){openNote();return;}
  if(b.id==='bulletin-motion'){animateCharacters=!animateCharacters;remember('household-note-motion',animateCharacters?'on':'off');updateAvatarActivity();return;}
  if(b.dataset.bulletinView){view=b.dataset.bulletinView;render();return;}
  if(b.dataset.bulletinCommand){const n=ledger?.notes.find(n=>n.id===b.closest<HTMLElement>('[data-note-id]')?.dataset.noteId);if(!n)return;if(b.dataset.bulletinCommand==='edit')openNote(n);else openAction(n,b.dataset.bulletinCommand);}
 });
 $('#bulletin-page').addEventListener('change',event=>{const el=event.target as HTMLInputElement;if(el.id==='bulletin-recipient-filter')recipient=el.value;else if(el.id==='bulletin-kind-filter')kind=el.value;else if(el.id==='bulletin-period')period=el.value;else if(el.id==='bulletin-show-deleted')showDeleted=el.checked;else return;render();});
 field('bulletin-temperature').addEventListener('input',()=>updateTemperature());
 field('bulletin-body').addEventListener('input',()=>$('#bulletin-character-count').textContent=`${field('bulletin-body').value.length} / 600`);
 document.querySelectorAll<HTMLDialogElement>('.bulletin-dialog').forEach(d=>{d.addEventListener('cancel',e=>{if(busy)e.preventDefault();});d.addEventListener('close',updateAvatarActivity);});
 document.querySelectorAll<HTMLElement>('[data-bulletin-close]').forEach(b=>b.addEventListener('click',()=>{if(!busy)$<HTMLDialogElement>('#'+b.dataset.bulletinClose+'-dialog').close();}));
 $('#bulletin-note-form').addEventListener('submit',event=>{
  event.preventDefault();const recipients=[...document.querySelectorAll<HTMLInputElement>('input[name=bulletin-recipient]:checked')].map(el=>el.value);
  if(!recipients.length){error('bulletin-note-error','Choose at least one person this note is for.');return;}
  if(!field('bulletin-body').value.trim()){error('bulletin-note-error','Write a little note first.');return;}
  const temperature=Number(field('bulletin-temperature').value);if(!temperature){error('bulletin-note-error','Slide toward a complaint or a compliment before pinning.');return;}
  void save('bulletin-note',{id:noteId,expected_version:draft?.version||0,action:draft?'edit':'create',actor:identity,body:field('bulletin-body').value.trim(),recipients,temperature});
 });
 $('#bulletin-action-form').addEventListener('submit',event=>{event.preventDefault();if(actionNote)void save('bulletin-action',{id:actionNote.id,expected_version:actionNote.version,action,actor:identity});});
 onIdentityChange(render);render();
}
function render(){
 const content=$('#bulletin-content'),opened=[...content.querySelectorAll<HTMLDetailsElement>('details[open]')].map(d=>d.id);
 const focused=document.activeElement as HTMLElement|null,focusId=focused&&content.contains(focused)?focused.id:'';
 $('#bulletin-identity').hidden=!!identity;$('#bulletin-identity-bar').hidden=!identity;
 if(identity){$('#bulletin-identity-name').innerHTML=`${avatar(identity)} ${chip(identity)}`;error('bulletin-identity-error','');}
 $('#bulletin-new').toggleAttribute('disabled',!live);
 document.querySelectorAll<HTMLElement>('[data-bulletin-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.bulletinView===view)));
 content.innerHTML=view==='activity'?charts():board();
 content.querySelectorAll<HTMLDetailsElement>('details').forEach(d=>d.open=opened.includes(d.id));
 boardCharacters.sync();updateAvatarActivity();
 if(focusId)document.getElementById(focusId)?.focus({preventScroll:true});
}
function history(note:BulletinNote){
 const revisions=ledger?.history.filter(h=>h.id===note.id)||[];
 return `<details class="bulletin-history" id="note-history-${esc(note.id)}"><summary>History${revisions.length>1?' · '+revisions.length:''}</summary>${revisions.map(h=>`<div class="bulletin-revision"><p><strong>${({create:'Pinned',edit:'Edited',delete:'Deleted',restore:'Restored'} as Record<string,string>)[h.action]||'Updated'}</strong> by ${chip(h.actor)} <time datetime="${esc(h.created_at)}">${stamp(h.created_at)}</time></p><p>${tempText(h.temperature)} · To ${h.recipients.map(name).join(', ')}</p><p class="bulletin-revision-body">${esc(h.body)}</p></div>`).join('')}</details>`;
}
function noteCard(note:BulletinNote){
 const p=notePlacement(note.id),writable=!!identity&&live;
 // Long pieces of paper need a gentler angle to stay within their column.
 const turn=p.rotation*Math.min(1,240/Math.max(1,note.body.length));
 return `<article class="bulletin-note note-${note.kind} note-member-${note.author} ${note.deleted?'note-deleted':''}" data-note-id="${esc(note.id)}" aria-label="Note from ${name(note.author)} to ${note.recipients.map(name).join(', ')}" style="--note-turn:${turn}deg;--note-offset:${p.offset}px;--note-inset:${p.inset}px">
 ${thumbtack}<div class="note-top"><div class="note-to"><span>To</span> ${note.recipients.map(chip).join(' ')}</div><span class="note-reaction">${bulletinCharacter(note.author,note.temperature)}</span></div>
 <p class="note-body">${esc(note.body)}</p><div class="note-byline"><span>From ${chip(note.author)}</span><time datetime="${esc(note.posted_at)}" title="${stamp(note.posted_at)}">${date(localDateTime(note.posted_at))}</time></div>
 <details class="note-tools" id="note-tools-${esc(note.id)}"><summary class="note-fold" id="note-fold-${esc(note.id)}" aria-label="Note details and actions" title="Lift for details & editing">${noteFold}</summary><div class="note-tools-panel">
 <p class="note-extra">${note.deleted?'Taken down · ':''}${tempText(note.temperature)}<br>${temperatureLabel(note.temperature)}</p>
 ${writable?`<div class="note-actions">${note.deleted?'<button class="text-button" data-bulletin-command="restore">Restore</button>':'<button class="text-button" data-bulletin-command="edit">Edit note</button><button class="text-button" data-bulletin-command="delete">Delete note</button>'}</div>`:!identity&&live?'<p class="note-extra">Choose your name above to edit this note.</p>':''}
 ${history(note)}</div></details></article>`;
}
function board(){
 const notes=(ledger?.notes||[]).filter(n=>(showDeleted||!n.deleted)&&(kind==='all'||n.kind===kind)&&(recipient==='all'||n.recipients.includes(recipient as Member)));
 const title='Notes from home.';
 return `<div class="bulletin-section-top"><div><div class="bulletin-heading"><h2>${title}</h2>${notes.length?'<button id="bulletin-motion" class="bulletin-motion-toggle" type="button" aria-label="Pause character animations"></button>':''}</div><p class="section-copy">${notes.length} note${notes.length===1?'':'s'} pinned · lift a paper corner for details.</p></div><div class="bulletin-filters"><label>Notes<select id="bulletin-kind-filter">${[['all','All notes'],['complaint','Complaints only'],['compliment','Compliments only']].map(([v,l])=>`<option value="${v}" ${kind===v?'selected':''}>${l}</option>`).join('')}</select></label><label>Directed to<select id="bulletin-recipient-filter"><option value="all">Everyone</option>${MEMBERS.map(m=>`<option value="${m}" ${recipient===m?'selected':''}>${name(m)}</option>`).join('')}</select></label><label class="chore-inline-check"><input type="checkbox" id="bulletin-show-deleted" ${showDeleted?'checked':''}> Show deleted</label></div></div><div class="bulletin-display"><div class="bulletin-board" aria-label="Pinned notes">${notes.length?`<div class="bulletin-columns">${notes.map(noteCard).join('')}</div>`:`<div class="bulletin-empty"><div class="empty-papers" aria-hidden="true"><span>${thumbtack}${reactionSVG(-48)}</span><span>${thumbtack}${reactionSVG(70)}</span></div><h3>${recipient!=='all'?'No notes for '+name(recipient)+' here yet.':'A fresh patch of board.'}</h3><p>${kind==='complaint'?'A small gripe or a big feeling—put it into words.':kind==='compliment'?'Someone made your day? Leave them a little love.':'A thank-you, a pet peeve, a little something to say.'}</p></div>`}</div>${boardStand}</div><p class="bulletin-end">${notes.length?'You’ve reached the last note.':'Your next note has a place here.'} <a href="./credits.txt" class="bulletin-credit" target="_blank" rel="noopener">Art credits</a></p>`;
}
function charts(){
 const stats=ledger?.stats.filter(s=>s.period===period)||[];
 const chart=(direction:'written'|'received')=>{
  const rows=MEMBERS.map(m=>stats.find(s=>s.member===m&&s.direction===direction)||{member:m,complaints:0,compliments:0});
  const max=Math.max(1,...rows.map(r=>r.complaints+r.compliments));
  return `<section class="bulletin-chart"><h3>Notes ${direction}</h3><p class="section-copy">${direction==='written'?'Who’s putting feelings into words.':'Who those little notes are for.'}</p>${rows.map(r=>`<div class="bulletin-chart-row member-${r.member}"><div>${chip(r.member)}<span>${r.complaints+r.compliments} note${r.complaints+r.compliments===1?'':'s'}</span></div><div class="bulletin-bar" role="img" aria-label="${name(r.member)}: ${r.complaints} complaints and ${r.compliments} compliments ${direction}"><span class="bar-complaint" style="width:${r.complaints/max*100}%"></span><span class="bar-compliment" style="width:${r.compliments/max*100}%"></span></div><small>${r.complaints} complaints · ${r.compliments} compliments</small></div>`).join('')}</section>`;
 };
 const leaders=(direction:string,kind:'complaints'|'compliments')=>{const rows=stats.filter(s=>s.direction===direction),max=Math.max(0,...rows.map(r=>r[kind]));return max?`<div class="bulletin-leader-people">${rows.filter(r=>r[kind]===max).map(r=>chip(r.member)).join(' ')}</div><span>${max} ${max===1?kind.slice(0,-1):kind}</span>`:'<p>No notes yet</p>';};
 return `<div class="bulletin-section-top"><div><h2>The household temperature.</h2><p class="section-copy">Little patterns in what we say to each other.</p></div><label>Time frame<select id="bulletin-period">${[['all','All time'],['month','This month'],['week','This week']].map(([v,l])=>`<option value="${v}" ${period===v?'selected':''}>${l}</option>`).join('')}</select></label></div><div class="bulletin-legend"><span><i class="bar-complaint"></i> Complaints</span><span><i class="bar-compliment"></i> Compliments</span></div><div class="bulletin-charts">${chart('written')}${chart('received')}</div><div class="bulletin-leaders">${[['written','complaints','Most complaints written'],['received','complaints','Most complaints received'],['written','compliments','Most compliments written'],['received','compliments','Most compliments received']].map(([d,k,l])=>`<div><h3>${l}</h3>${leaders(d,k as 'complaints'|'compliments')}</div>`).join('')}</div><p class="bulletin-end">Each note counts once for its author and once for each recipient. Edits don’t add counts; deleted notes don’t count. Time frames use the original posting date in New York.</p>`;
}
function updateTemperature(immediate=false){
 const value=Number(field('bulletin-temperature').value);
 const character=$<HTMLElement>('#bulletin-reaction .bulletin-character');
 if(character){character.dataset.characterTemperature=String(value);character.setAttribute('aria-label',`${name(draft?.author||identity!)}: ${temperatureLabel(value)}`);previewCharacters.sync(immediate);}
 $('#bulletin-expression').textContent=temperatureLabel(value);$('#bulletin-temperature-output').textContent=tempText(value);
 field('bulletin-temperature').setAttribute('aria-valuetext',`${tempText(value)}. ${temperatureLabel(value)}`);
 $('#bulletin-temperature-help').textContent=value?'Slide to find the feeling.':'Choose a side of the slider before pinning your note.';
 $('#bulletin-note-save').toggleAttribute('disabled',value===0||busy);
}
function openNote(note?:BulletinNote){
 if(!live||busy)return;
 if(!identity){pendingNew=true;error('bulletin-identity-error','Choose your name before pinning a note.');$('#bulletin-identity button').focus();return;}
 draft=note;noteId=note?.id||crypto.randomUUID();$<HTMLFormElement>('#bulletin-note-form').reset();
 $('#bulletin-note-heading').textContent=note?'A little change of words.':'Pin a little feeling.';
 field('bulletin-body').value=note?.body||'';field('bulletin-temperature').value=String(note?.temperature||(kind==='complaint'?-35:35));
 $('#bulletin-reaction').innerHTML=bulletinCharacter(note?.author||identity,Number(field('bulletin-temperature').value));previewCharacters.sync();
 document.querySelectorAll<HTMLInputElement>('input[name=bulletin-recipient]').forEach(el=>el.checked=note?.recipients.includes(el.value as Member)||false);
 $('#bulletin-character-count').textContent=`${field('bulletin-body').value.length} / 600`;
 $('#bulletin-actor').textContent=note?`Editing as ${name(identity)}. Originally pinned by ${name(note.author)}.`:`Pinning as ${name(identity)}.`;
 $('#bulletin-note-save').textContent=note?'Save changes':'Pin note';updateTemperature(true);show('bulletin-note');
}
function openAction(note:BulletinNote,next:string){
 if(!identity||!live||busy)return;actionNote=note;action=next;
 $('#bulletin-action-heading').textContent=next==='delete'?'Take this note down?':'Pin this note back up?';
 $('#bulletin-action-copy').textContent=next==='delete'?'This note will leave the board and the counts. You can still find it and its history under Show deleted.':'This note will return to the board with its original date and count toward the charts again.';
 $('#bulletin-action-save').textContent=next==='delete'?'Delete note':'Restore note';show('bulletin-action');
}
function show(id:string){retry=null;error(id+'-error','');$<HTMLDialogElement>('#'+id+'-dialog').showModal();$('#'+id+'-heading').focus({preventScroll:true});updateAvatarActivity();}
function updateAvatarActivity(){
 const active=location.hash==='#bulletin'&&!document.hidden;
 const editing=$<HTMLDialogElement>('#bulletin-note-dialog').open;
 boardCharacters.setPaused(!animateCharacters||!!document.querySelector('.bulletin-dialog[open]'));
 boardCharacters.setActive(active&&view==='board');
 previewCharacters.setPaused(!animateCharacters);previewCharacters.setActive(active&&editing);
 const toggle=$('#bulletin-motion');
 if(toggle){toggle.setAttribute('aria-label',animateCharacters?'Pause character animations':'Play character animations');toggle.title=toggle.getAttribute('aria-label')!;toggle.setAttribute('aria-pressed',String(!animateCharacters));toggle.innerHTML=animateCharacters?'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 5v10M13 5v10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>':'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 9 6-9 6Z" fill="currentColor"/></svg>';}
}
async function save(id:string,p:Record<string,unknown>){
 if(busy||!live)return;if(!identity){error(id+'-error','Choose your name again before saving.');return;}
 const fingerprint=JSON.stringify(p);if(!retry||retry.fingerprint!==fingerprint)retry={fingerprint,id:crypto.randomUUID()};
 busy=true;error(id+'-error','');const fields=[...document.querySelectorAll<HTMLInputElement|HTMLButtonElement|HTMLSelectElement|HTMLTextAreaElement>(`#${id}-dialog input,#${id}-dialog button,#${id}-dialog select,#${id}-dialog textarea`)];const states=fields.map(el=>el.disabled);fields.forEach(el=>el.disabled=true);
 try{await rpc('save_bulletin_note',{p:{...p,request_id:retry.id}});$<HTMLDialogElement>('#'+id+'-dialog').close();toast(p.action==='delete'?'Note taken down.':p.action==='edit'?'Note updated.':'Note pinned.');retry=null;}
 catch(e){error(id+'-error',e instanceof Error?e.message:'Could not save your note. Please try again.');}
 finally{busy=false;fields.forEach((el,i)=>el.disabled=states[i]);await refreshBulletin();}
}
export async function refreshBulletin(){
 if(loading||busy)return;loading=true;const previous=JSON.stringify(ledger&&{...ledger,updated_at:null}),wasLive=live;
 try{ledger=await rpc<Bulletin>('bulletin_dashboard');live=true;$('#bulletin-status').textContent='Shared notes · up to date';error('bulletin-notice','');}
 catch{live=false;try{const res=await fetch('./bulletin.json',{cache:'no-store'});if(res.ok&&!ledger)ledger=await res.json() as Bulletin;}catch{/* Keep the most recent view. */}
 $('#bulletin-status').textContent=ledger?'Viewing saved notes':'Board unavailable';error('bulletin-notice',`The live bulletin board is unavailable. ${ledger?.updated_at?'Showing the last saved view from '+stamp(ledger.updated_at)+'.':'No saved notes are available.'} Adding and editing are disabled until the connection returns.`);}
 finally{loading=false;if(location.hash==='#bulletin')$('#export').toggleAttribute('disabled',!ledger);if(wasLive!==live||previous!==JSON.stringify(ledger&&{...ledger,updated_at:null}))render();}
}
export function exportBulletin(){if(ledger)download({...ledger,exported_at:new Date().toISOString()},'household-bulletin');else toast('No notes are available to export yet.');}
