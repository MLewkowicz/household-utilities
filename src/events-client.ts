import {entryMeta,latestRevision} from './entry-meta';
import {$,esc,name,date,today,rpc,toast,download} from './ui';
import {identity,onIdentityChange,setIdentity} from './identity';
import {MEMBERS,type Member} from './ledger';
import {avatar} from './people';
import {localDateTime,addDays} from './chores';
import {eventDay,eventTime,onEventDay,polling,eventOpen,eventSortKey,pollSummary,type EventsLedger,type HouseholdEvent} from './events';
import {availabilityGrid,bindAvailability,type Mark} from './event-availability';
import {highlightNotification} from './notifications';
import {EVENT_PRESETS,EVENT_ICONS,eventIconSvg} from './event-icons';
let ledger:EventsLedger|undefined,live=false,busy=false,loading=false,again=false;
let brush:Mark='yes',mode:'poll'|'time'='poll';
let view='agenda',past=false,month=today().slice(0,7),selectedDay=today(),editing:HouseholdEvent|undefined;
let request:string=crypto.randomUUID(),eventId:string=crypto.randomUUID(),fingerprint='';
const retries=new Map<string,{fingerprint:string;request:string}>();
const field=(id:string)=>$<HTMLInputElement>('#event-'+id);
const dialog=()=>$<HTMLDialogElement>('#event-dialog');
function responses(e:HouseholdEvent){return ledger!.responses.filter(r=>r.id===e.id&&r.interval_version===e.interval_version&&r.response);}
const place=(e:HouseholdEvent)=>e.location?`<p class="event-location"><svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 18s6-6 6-11a6 6 0 0 0-12 0c0 5 6 11 6 11Z"/><circle cx="10" cy="7" r="2"/></svg> ${esc(e.location)}</p>`:'';
const mine=(id:string)=>({...(ledger?.availability||[]).find(a=>a.id===id&&a.member===identity&&a.poll_version===ledger?.events.find(e=>e.id===id)?.poll_version)?.days});
// A poll card: everyone paints the days that work, then the host locks one in.
function pollCard(e:HouseholdEvent){
 const marks=ledger!.availability||[],host=identity===e.host,open=eventOpen(e),best=pollSummary(e,marks,MEMBERS).ranked.slice(0,3);
 const short=(day:string)=>new Date(day+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',timeZone:'UTC'});
 return `<article class="event-card event-polling" data-event-id="${e.id}"><div class="event-date">${eventIconSvg(e.icon_id)}<span>${short(e.window_start!)}</span><strong>?</strong><span>Poll</span></div><div class="event-body"><div class="event-kicker"><span>Finding a day</span><span>Hosted by ${name(e.host)}</span></div><h3>${esc(e.title)}</h3><p class="event-time">${date(e.window_start!)} – ${date(e.window_end!)}${e.time_hint?` · ${esc(e.time_hint)}`:''}</p>${place(e)}${availabilityGrid(e,marks,identity,brush,Boolean(identity)&&live&&open&&!busy)}${best.length?`<p class="avail-best">${[['Everyone can make',best.filter(d=>d.valid)],[best[0].valid?'Next best':'Best so far',best.filter(d=>!d.valid)]].filter(([,days])=>days.length).map(([label,days])=>`<strong>${label}:</strong> ${(days as typeof best).map(d=>`${date(d.day)}${d.valid?'':` (${d.yes.length+d.maybe.length} of ${MEMBERS.length})`}`).join(', ')}`).join(' · ')}</p>`:''}${host&&open&&live?`<div class="event-actions"><button class="button primary" data-event-action="lock" ${busy?'disabled':''}>Lock in a day</button></div>`:''}<details class="event-details"><summary>Details${host?' & hosting':''}</summary>${e.description?`<p>${esc(e.description)}</p>`:''}${host&&e.state!=='cancelled'?`<div class="event-actions"><button class="text-button" data-event-action="edit">Edit</button><button class="text-button" data-event-action="cancel">Cancel event</button></div>`:''}${entryMeta(latestRevision(ledger!.history,e.id))}</details></div></article>`;
}
function card(e:HouseholdEvent){
 if(polling(e))return pollCard(e);
 const votes=responses(e),mine=votes.find(r=>r.member===identity)?.response;
 const active=e.state!=='cancelled'&&Date.parse(e.ends_at)>Date.now(),host=identity===e.host;
 return `<article class="event-card event-${e.state}" data-event-id="${e.id}"><div class="event-date">${eventIconSvg(e.icon_id)}<span>${new Date(e.starts_at).toLocaleDateString('en-US',{month:'short',timeZone:'America/New_York'})}</span><strong>${eventDay(e.starts_at).slice(-2)}</strong><span>${new Date(e.starts_at).toLocaleDateString('en-US',{weekday:'short',timeZone:'America/New_York'})}</span></div><div class="event-body"><div class="event-kicker"><span>${name(e.state)}</span><span>Hosted by ${name(e.host)}</span></div><h3>${esc(e.title)}</h3><p class="event-time">${eventTime(e.starts_at)} – ${eventDay(e.ends_at)!==eventDay(e.starts_at)?date(eventDay(e.ends_at))+' · ':''}${eventTime(e.ends_at)}</p>${place(e)}<div class="event-guests" aria-label="People who said yes">${votes.filter(r=>r.response==='yes').map(r=>`<span title="${name(r.member)} · Yes">${avatar(r.member)}<span class="sr-only">${name(r.member)} · Yes</span></span>`).join('')||'<span class="quiet">Who’s in?</span>'}</div>${active?`<div class="event-votes" role="group" aria-label="Your response to ${esc(e.title)}">${['yes','maybe','no'].map(r=>`<button data-event-vote="${r}" aria-pressed="${mine===r}" ${!identity||!live||busy?'disabled':''}>${r==='yes'?'✓ Yes':r==='maybe'?'Maybe':'Can’t'}</button>`).join('')}</div>`:''}<details class="event-details"><summary>Details${host?' & hosting':''}</summary>${e.description?`<p>${esc(e.description)}</p>`:''}<div class="event-response-list">${MEMBERS.map(m=>`<span>${avatar(m)}${name(m)} <strong>${name(votes.find(r=>r.member===m)?.response||'unanswered')}</strong></span>`).join('')}</div>${host&&e.state!=='cancelled'?`<div class="event-actions">${e.state==='proposed'&&active?'<button class="button primary" data-event-action="confirm">Confirm event</button>':''}<button class="text-button" data-event-action="edit">Edit</button><button class="text-button" data-event-action="cancel">Cancel event</button></div>`:''}${entryMeta(latestRevision(ledger!.history,e.id))}</details></div></article>`;
}
function calendar(){
 const first=month+'-01',offset=(new Date(first+'T12:00Z').getUTCDay()+6)%7,start=addDays(first,-offset);
 const events=ledger!.events.filter(e=>e.state!=='cancelled'&&!polling(e));
 return `<div class="event-calendar-tools"><button class="icon-button" data-event-month="-1" aria-label="Previous month">←</button><h2>${new Date(first+'T12:00Z').toLocaleDateString('en-US',{month:'long',year:'numeric',timeZone:'UTC'})}</h2><button class="icon-button" data-event-month="1" aria-label="Next month">→</button></div><div class="event-calendar">${['M','T','W','T','F','S','S'].map((s,i)=>`<span aria-label="${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][i]}">${s}</span>`).join('')}${Array.from({length:42},(_,i)=>{const day=addDays(start,i),items=events.filter(e=>onEventDay(e,day));return `<button data-event-day="${day}" class="${day.startsWith(month)?'':'outside'} ${day===today()?'today':''}" aria-pressed="${selectedDay===day}" aria-label="${date(day,true)}, ${items.length} events"><span>${Number(day.slice(-2))}</span><span class="event-dots">${items.slice(0,4).map(e=>`<i class="${e.state}"></i>`).join('')}</span></button>`;}).join('')}</div><h3 class="event-day-title">${date(selectedDay,true)}</h3>`;
}
function render(){
 $('#events-identity').innerHTML=identity?`<span>${avatar(identity)} You’re ${name(identity)}</span><button class="text-button" data-event-person="">Switch person</button>`:`<span>Choose your name</span>${MEMBERS.map(m=>`<button class="text-button" data-event-person="${m}">${avatar(m)}${name(m)}</button>`).join('')}`;
 $('#event-new').toggleAttribute('disabled',!live||!identity||busy);
 if(!ledger)return;
 let events=ledger.events.filter(e=>view==='calendar'?e.state!=='cancelled'&&!polling(e)&&onEventDay(e,selectedDay):past?!eventOpen(e):eventOpen(e));
 events=events.sort((a,b)=>(past?-1:1)*(eventSortKey(a)-eventSortKey(b)));
 $('#events-content').innerHTML=(view==='calendar'?calendar():'')+`<div class="event-grid">${events.map(card).join('')||'<p class="empty-state">No events.</p>'}</div>`;
 document.querySelectorAll<HTMLElement>('[data-event-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.eventView===view)));
 $('#event-history-label').hidden=view==='calendar';
 if(location.hash==='#events')$('#export').removeAttribute('disabled');
}
export async function refreshEvents(){
 if(busy||loading){again=true;return;}loading=true;
 try{ledger=await rpc<EventsLedger>('events_dashboard');live=true;$('#events-notice').hidden=true;$('#events-status').textContent='Up to date';}
 catch{live=false;if(!ledger)try{const r=await fetch('./events.json',{cache:'no-store'});if(r.ok)ledger=await r.json();}catch{/* Keep offline notice. */}$('#events-notice').hidden=false;$('#events-notice').textContent='Events are unavailable. Showing the last saved view; changes are disabled.';$('#events-status').textContent='Saved view';}
 finally{loading=false;render();}
 if(again){again=false;await refreshEvents();}
}
export function focusEventNotification(id:string){
 const e=ledger?.events.find(x=>x.id===id);if(!e)return false;
 view='agenda';past=!eventOpen(e);$<HTMLInputElement>('#event-history').checked=past;render();
 return highlightNotification(`[data-event-id="${CSS.escape(id)}"]`);
}
export function exportEvents(){if(ledger)download({...ledger,exported_at:new Date().toISOString()},'household-events');}
function openEvent(e?:HouseholdEvent){
 if(!live||!identity||busy)return;editing=e;eventId=e?.id||crypto.randomUUID();request=crypto.randomUUID();fingerprint='';
 $<HTMLFormElement>('#event-form').reset();field('title').value=e?.title||'';field('location').value=e?.location||'';field('description').value=e?.description||'';
 $<HTMLSelectElement>('#event-icon').value=e?.icon_id||'calendar';$('#event-icon-preview').innerHTML=eventIconSvg(e?.icon_id);
 $('#event-time-warning').hidden=!e||polling(e);$('#event-window-warning').hidden=!e||!polling(e);$('#event-presets').hidden=!!e;document.querySelectorAll('[data-event-preset]').forEach(b=>b.setAttribute('aria-pressed','false'));
 setMode(e?(polling(e)?'poll':'time'):'poll',!e);
 const from=view==='calendar'?selectedDay:today();
 field('start').value=e&&!polling(e)?localDateTime(e.starts_at):from+'T19:00';field('end').value=e&&!polling(e)?localDateTime(e.ends_at):from+'T21:00';
 field('window-start').value=e?.window_start||from;field('window-end').value=e?.window_end||addDays(from,13);field('time-hint').value=e?.time_hint||'';
 $('#event-form-title').textContent=e?'Edit event':'Add event';$('#event-form-error').hidden=true;dialog().showModal();
}
function setMode(next:'poll'|'time',choosable=true){
 mode=next;$('#event-mode').hidden=!choosable;
 document.querySelectorAll<HTMLElement>('[data-event-mode]').forEach(b=>b.setAttribute('aria-checked',String(b.dataset.eventMode===mode)));
 $('#event-poll-fields').hidden=mode!=='poll';$('#event-time-fields').hidden=mode!=='time';
 for(const id of ['start','end'])field(id).required=mode==='time';for(const id of ['window-start','window-end'])field(id).required=mode==='poll';
}
function openLock(e:HouseholdEvent){
 if(!live||busy||identity!==e.host)return;editing=e;request=crypto.randomUUID();fingerprint='';
 const {days,ranked}=pollSummary(e,ledger!.availability||[],MEMBERS),order=[...ranked,...days.filter(d=>!d.score)];
 $('#event-lock-day').innerHTML=order.map(d=>`<option value="${d.day}">${date(d.day)} · ${d.valid?'everyone':d.score?`${d.yes.length+d.maybe.length} of ${MEMBERS.length}`:'nobody marked'}</option>`).join('');
 $('#event-lock-title').textContent=`Lock in ${e.title}`;$('#event-lock-error').hidden=true;$<HTMLDialogElement>('#event-lock-dialog').showModal();
}
async function mutate(fn:string,p:Record<string,unknown>,key:string){
 const serial=JSON.stringify(p),prior=retries.get(key),id=prior?.fingerprint===serial?prior.request:crypto.randomUUID();retries.set(key,{fingerprint:serial,request:id});
 busy=true;render();
 try{await rpc(fn,{p:{...p,request_id:id}});retries.delete(key);}
 finally{busy=false;await refreshEvents();}
}
export function initEvents(){
 $('#events-page').innerHTML=`<section class="intro"><div><h1>Events</h1></div><div class="intro-side"><span id="events-status" class="status">Loading events</span><button id="event-new" class="button primary" disabled>＋ Add event</button></div></section><div id="events-notice" class="ledger-notice" role="status" hidden></div><div id="events-identity" class="identity-bar"></div><div class="event-toolbar"><nav class="chore-views" aria-label="Event views"><button data-event-view="agenda" aria-pressed="true">Agenda</button><button data-event-view="calendar" aria-pressed="false">Calendar</button></nav><label id="event-history-label" class="inline-check"><input id="event-history" type="checkbox"> Past & cancelled</label></div><div id="events-content"></div>`;
 document.body.insertAdjacentHTML('beforeend',`<dialog id="event-dialog" class="chore-dialog" aria-labelledby="event-form-title"><form id="event-form"><div class="dialog-top"><h2 id="event-form-title" tabindex="-1" autofocus>Add event</h2><button class="icon-button" type="button" id="event-close" aria-label="Close event form">×</button></div><fieldset id="event-presets" class="event-presets"><legend>Start with a plan</legend><div class="event-preset-grid">${EVENT_PRESETS.map(p=>`<button class="event-preset" type="button" data-event-preset="${p.id}" aria-pressed="false">${eventIconSvg(p.icon)}<span>${p.title}</span></button>`).join('')}</div></fieldset><div id="event-mode" class="segmented event-mode" role="radiogroup" aria-label="How to schedule"><button type="button" role="radio" data-event-mode="poll" aria-checked="true">Find a day together</button><button type="button" role="radio" data-event-mode="time" aria-checked="false">I know the time</button></div><label for="event-title">Title</label><input id="event-title" maxlength="100" required><label for="event-icon">Illustration</label><div class="event-icon-field"><span id="event-icon-preview" class="event-icon-preview">${eventIconSvg()}</span><select id="event-icon">${EVENT_ICONS.map(i=>`<option value="${i.id}">${i.label}</option>`).join('')}</select></div><div id="event-poll-fields"><div class="chore-two-fields"><label>From<input id="event-window-start" type="date"></label><label>To<input id="event-window-end" type="date"></label></div><p class="field-help">Everyone marks the days that work. Up to six weeks.</p><p id="event-window-warning" class="field-help" hidden>Changing the days clears everyone’s marks.</p><label for="event-time-hint">Rough time <span class="quiet">(optional)</span></label><input id="event-time-hint" maxlength="40" placeholder="e.g. Evening, All day"></div><div id="event-time-fields" hidden><div class="chore-two-fields"><label>Starts<input id="event-start" type="datetime-local"></label><label>Ends<input id="event-end" type="datetime-local"></label></div><p class="field-help">New York time.</p><p id="event-time-warning" class="field-help" hidden>Changing the time clears responses and reopens voting. During the repeated autumn hour, times use standard time.</p></div><label for="event-location">Where? <span class="quiet">(optional)</span></label><input id="event-location" maxlength="120"><label for="event-description">Details <span class="quiet">(optional)</span></label><textarea id="event-description" maxlength="600" rows="3"></textarea><p id="event-form-error" class="form-error" role="alert" hidden></p><div class="dialog-actions"><button class="button primary" type="submit">Save event</button></div></form></dialog><dialog id="event-lock-dialog" class="chore-dialog" aria-labelledby="event-lock-title"><form id="event-lock-form"><div class="dialog-top"><h2 id="event-lock-title" tabindex="-1" autofocus>Lock in a day</h2><button class="icon-button" type="button" id="event-lock-close" aria-label="Close">×</button></div><label for="event-lock-day">Day</label><select id="event-lock-day" required></select><div class="chore-two-fields"><label>Starts<input id="event-lock-start" type="time" value="19:00" required></label><label>Ends<input id="event-lock-end" type="time" value="21:00" required></label></div><p class="field-help">New York time. Everyone gets a heads-up, and the poll stays in the history.</p><p id="event-lock-error" class="form-error" role="alert" hidden></p><div class="dialog-actions"><button class="button primary" type="submit">Lock it in</button></div></form></dialog>`);
 document.querySelectorAll<HTMLElement>('[data-event-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.eventMode as 'poll'|'time'));
 $('#event-lock-close').onclick=()=>{if(!busy)$<HTMLDialogElement>('#event-lock-dialog').close();};
 $('#event-lock-form').addEventListener('submit',async e=>{
  e.preventDefault();const event=editing;if(busy||!live||!identity||!event)return;
  const day=$<HTMLSelectElement>('#event-lock-day').value,start=field('lock-start').value,end=field('lock-end').value;
  const p={id:event.id,actor:identity,action:'lock_in',expected_version:event.version,starts_local:`${day}T${start}`,ends_local:`${end>start?day:addDays(day,1)}T${end}`};
  const serial=JSON.stringify(p);if(fingerprint&&serial!==fingerprint)request=crypto.randomUUID();fingerprint=serial;
  busy=true;try{await rpc('save_event',{p:{...p,request_id:request}});$<HTMLDialogElement>('#event-lock-dialog').close();toast(`${event.title} is on for ${date(day)}.`);}
  catch(error){$('#event-lock-error').textContent=(error as Error).message;$('#event-lock-error').hidden=false;}
  finally{busy=false;await refreshEvents();}
 });
 bindAvailability($('#events-page'),{brush:()=>brush,mine:id=>mine(id),commit:(id,days)=>{
  const e=ledger?.events.find(x=>x.id===id);if(!e||!identity||!live||busy)return;
  const list=ledger!.availability||(ledger!.availability=[]),old=list.find(a=>a.id===id&&a.member===identity);
  // Show the new marks immediately; a failed save refreshes back to the server's.
  const optimistic={id,member:identity,version:old?.version||0,poll_version:e.poll_version!,days,created_at:new Date().toISOString()};
  ledger!.availability=[...list.filter(a=>a!==old),optimistic];
  void mutate('save_event_availability',{id,actor:identity,poll_version:e.poll_version,expected_version:old?.version||0,days},`avail:${id}:${identity}`).catch(error=>toast((error as Error).message));
 }});
 $('#event-icon').onchange=()=>{$('#event-icon-preview').innerHTML=eventIconSvg($<HTMLSelectElement>('#event-icon').value);document.querySelectorAll('[data-event-preset]').forEach(b=>b.setAttribute('aria-pressed','false'));};
 $('#event-presets').onclick=e=>{const button=(e.target as HTMLElement).closest<HTMLElement>('[data-event-preset]'),preset=EVENT_PRESETS.find(p=>p.id===button?.dataset.eventPreset);if(!preset||busy)return;field('title').value=preset.title;$<HTMLSelectElement>('#event-icon').value=preset.icon;$('#event-icon-preview').innerHTML=eventIconSvg(preset.icon);document.querySelectorAll('[data-event-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));};
 $('#event-new').onclick=()=>openEvent();$('#event-close').onclick=()=>{if(!busy)dialog().close();};dialog().addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 $('#events-identity').onclick=e=>{const b=(e.target as HTMLElement).closest<HTMLElement>('[data-event-person]');if(b&&!busy)setIdentity((b.dataset.eventPerson||null) as Member|null);};onIdentityChange(render);
 $('#event-history').onchange=()=>{past=$<HTMLInputElement>('#event-history').checked;render();};
 $('#events-page').addEventListener('click',async e=>{
 const b=(e.target as HTMLElement).closest<HTMLElement>('button');if(!b||busy)return;
 if(b.dataset.eventView){view=b.dataset.eventView;render();return;}
 if(b.dataset.availBrush){brush=b.dataset.availBrush as Mark;render();document.querySelector<HTMLElement>(`[data-event-id="${b.closest<HTMLElement>('[data-event-id]')?.dataset.eventId}"] [data-avail-brush="${brush}"]`)?.focus();return;}
 if(b.dataset.eventMonth){const d=new Date(month+'-01T12:00Z');d.setUTCMonth(d.getUTCMonth()+Number(b.dataset.eventMonth));month=d.toISOString().slice(0,7);selectedDay=month+'-01';render();return;}
 if(b.dataset.eventDay){selectedDay=b.dataset.eventDay;render();return;}
 const id=b.closest<HTMLElement>('[data-event-id]')?.dataset.eventId,event=ledger?.events.find(x=>x.id===id);if(!event||!live||!identity)return;
 try{
 if(b.dataset.eventVote){const old=ledger!.responses.find(r=>r.id===id&&r.member===identity),current=old?.interval_version===event.interval_version?old.response:null;await mutate('save_event_response',{id,actor:identity,interval_version:event.interval_version,expected_version:old?.version||0,response:current===b.dataset.eventVote?null:b.dataset.eventVote},`${id}:${identity}`);}
 else if(b.dataset.eventAction==='edit')openEvent(event);
 else if(b.dataset.eventAction==='lock')openLock(event);
 else if(b.dataset.eventAction){if(b.dataset.eventAction==='cancel'&&!confirm('Cancel this event? It will move to Past & cancelled.'))return;await mutate('save_event',{id,actor:identity,action:b.dataset.eventAction,expected_version:event.version},id!);}
 }catch(error){toast((error as Error).message);}
 });
 $('#event-form').addEventListener('submit',async e=>{
 e.preventDefault();if(busy||!live||!identity)return;
 const common={id:eventId,expected_version:editing?.version||0,actor:identity,title:field('title').value,icon_id:$<HTMLSelectElement>('#event-icon').value,description:field('description').value,location:field('location').value};
 const p=mode==='poll'?{...common,action:editing?'edit':'create_poll',window_start:field('window-start').value,window_end:field('window-end').value,time_hint:field('time-hint').value}:{...common,action:editing?'edit':'create',starts_local:field('start').value,ends_local:field('end').value};
 const serial=JSON.stringify(p);if(fingerprint&&serial!==fingerprint)request=crypto.randomUUID();fingerprint=serial;
 busy=true;const inputs=Array.from(dialog().querySelectorAll<HTMLInputElement>('input,textarea,select,button'));inputs.forEach(i=>i.disabled=true);
 try{await rpc('save_event',{p:{...p,request_id:request}});dialog().close();toast(editing?'Event updated.':mode==='poll'?'Poll posted. Mark your days!':'Event added.');}catch(error){$('#event-form-error').textContent=(error as Error).message;$('#event-form-error').hidden=false;}
 finally{busy=false;inputs.forEach(i=>i.disabled=false);await refreshEvents();}
 });render();
}
