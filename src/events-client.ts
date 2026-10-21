import {$,esc,name,date,today,rpc,toast,download} from './ui';
import {identity,onIdentityChange,setIdentity} from './identity';
import {MEMBERS,type Member} from './ledger';
import {avatar} from './people';
import {localDateTime,addDays} from './chores';
import {eventDay,eventTime,onEventDay,type EventsLedger,type HouseholdEvent} from './events';
import {info} from './disclosure';
let ledger:EventsLedger|undefined,live=false,busy=false,loading=false,again=false;
let view='agenda',past=false,month=today().slice(0,7),selectedDay=today(),editing:HouseholdEvent|undefined;
let request:string=crypto.randomUUID(),eventId:string=crypto.randomUUID(),fingerprint='';
const retries=new Map<string,{fingerprint:string;request:string}>();
const field=(id:string)=>$<HTMLInputElement>('#event-'+id);
const dialog=()=>$<HTMLDialogElement>('#event-dialog');
function responses(e:HouseholdEvent){return ledger!.responses.filter(r=>r.id===e.id&&r.interval_version===e.interval_version&&r.response);}
function card(e:HouseholdEvent){
 const votes=responses(e),mine=votes.find(r=>r.member===identity)?.response;
 const active=e.state!=='cancelled'&&Date.parse(e.ends_at)>Date.now(),host=identity===e.host;
 return `<article class="event-card event-${e.state}" data-event-id="${e.id}"><div class="event-date"><span>${new Date(e.starts_at).toLocaleDateString('en-US',{month:'short',timeZone:'America/New_York'})}</span><strong>${eventDay(e.starts_at).slice(-2)}</strong><span>${new Date(e.starts_at).toLocaleDateString('en-US',{weekday:'short',timeZone:'America/New_York'})}</span></div><div class="event-body"><div class="event-kicker"><span>${name(e.state)}</span><span>Hosted by ${name(e.host)}</span></div><h3>${esc(e.title)}</h3><p class="event-time">${eventTime(e.starts_at)} – ${eventDay(e.ends_at)!==eventDay(e.starts_at)?date(eventDay(e.ends_at))+' · ':''}${eventTime(e.ends_at)}</p>${e.location?`<p class="event-location"><svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 18s6-6 6-11a6 6 0 0 0-12 0c0 5 6 11 6 11Z"/><circle cx="10" cy="7" r="2"/></svg> ${esc(e.location)}</p>`:''}<div class="event-guests" aria-label="People who said yes">${votes.filter(r=>r.response==='yes').map(r=>`<span title="${name(r.member)} · Yes">${avatar(r.member)}<span class="sr-only">${name(r.member)} · Yes</span></span>`).join('')||'<span class="quiet">Who’s in?</span>'}</div>${active?`<div class="event-votes" role="group" aria-label="Your response to ${esc(e.title)}">${['yes','maybe','no'].map(r=>`<button data-event-vote="${r}" aria-pressed="${mine===r}" ${!identity||!live||busy?'disabled':''}>${r==='yes'?'✓ Yes':r==='maybe'?'Maybe':'Can’t'}</button>`).join('')}</div>`:''}<details class="event-details"><summary>Details${host?' & hosting':''}</summary>${e.description?`<p>${esc(e.description)}</p>`:''}<div class="event-response-list">${MEMBERS.map(m=>`<span>${avatar(m)}${name(m)} <strong>${name(votes.find(r=>r.member===m)?.response||'unanswered')}</strong></span>`).join('')}</div>${host&&e.state!=='cancelled'?`<div class="event-actions">${e.state==='proposed'&&active?'<button class="button primary" data-event-action="confirm">Confirm event</button>':''}<button class="text-button" data-event-action="edit">Edit</button><button class="text-button" data-event-action="cancel">Cancel event</button></div>`:''}<details><summary>History</summary>${ledger!.history.filter(h=>h.id===e.id).map(h=>`<p class="quiet">${name(h.action)} · ${name(h.actor)} · ${date(eventDay(h.created_at),true)}${h.action==='edit'?' · '+eventTime(h.starts_at):''}</p>`).join('')}</details></details></div></article>`;
}
function calendar(){
 const first=month+'-01',offset=(new Date(first+'T12:00Z').getUTCDay()+6)%7,start=addDays(first,-offset);
 const events=ledger!.events.filter(e=>e.state!=='cancelled');
 return `<div class="event-calendar-tools"><button class="icon-button" data-event-month="-1" aria-label="Previous month">←</button><h2>${new Date(first+'T12:00Z').toLocaleDateString('en-US',{month:'long',year:'numeric',timeZone:'UTC'})}</h2><button class="icon-button" data-event-month="1" aria-label="Next month">→</button></div><div class="event-calendar">${['M','T','W','T','F','S','S'].map((s,i)=>`<span aria-label="${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][i]}">${s}</span>`).join('')}${Array.from({length:42},(_,i)=>{const day=addDays(start,i),items=events.filter(e=>onEventDay(e,day));return `<button data-event-day="${day}" class="${day.startsWith(month)?'':'outside'} ${day===today()?'today':''}" aria-pressed="${selectedDay===day}" aria-label="${date(day,true)}, ${items.length} events"><span>${Number(day.slice(-2))}</span><span class="event-dots">${items.slice(0,4).map(e=>`<i class="${e.state}"></i>`).join('')}</span></button>`;}).join('')}</div><h3 class="event-day-title">${date(selectedDay,true)}</h3>`;
}
function render(){
 $('#events-identity').innerHTML=identity?`<span>${avatar(identity)} You’re ${name(identity)}</span><button class="text-button" data-event-person="">Switch person</button>`:`<span>Choose your name</span>${MEMBERS.map(m=>`<button class="text-button" data-event-person="${m}">${avatar(m)}${name(m)}</button>`).join('')}`;
 $('#event-new').toggleAttribute('disabled',!live||!identity||busy);
 if(!ledger)return;
 let events=ledger.events.filter(e=>view==='calendar'?e.state!=='cancelled'&&onEventDay(e,selectedDay):past?e.state==='cancelled'||Date.parse(e.ends_at)<=Date.now():e.state!=='cancelled'&&Date.parse(e.ends_at)>Date.now());
 events=events.sort((a,b)=>(past?-1:1)*(Date.parse(a.starts_at)-Date.parse(b.starts_at)));
 $('#events-content').innerHTML=(view==='calendar'?calendar():'')+`<div class="event-grid">${events.map(card).join('')||'<p class="empty-state">A little room for a good plan.</p>'}</div>`;
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
export function exportEvents(){if(ledger)download({...ledger,exported_at:new Date().toISOString()},'household-events');}
function openEvent(e?:HouseholdEvent){
 if(!live||!identity||busy)return;editing=e;eventId=e?.id||crypto.randomUUID();request=crypto.randomUUID();fingerprint='';
 $<HTMLFormElement>('#event-form').reset();field('title').value=e?.title||'';field('location').value=e?.location||'';field('description').value=e?.description||'';
 field('start').value=e?localDateTime(e.starts_at):(view==='calendar'?selectedDay:today())+'T19:00';field('end').value=e?localDateTime(e.ends_at):(view==='calendar'?selectedDay:today())+'T21:00';
 $('#event-form-title').textContent=e?'Edit event':'Make a plan';$('#event-form-error').hidden=true;dialog().showModal();
}
async function mutate(fn:string,p:Record<string,unknown>,key:string){
 const serial=JSON.stringify(p),prior=retries.get(key),id=prior?.fingerprint===serial?prior.request:crypto.randomUUID();retries.set(key,{fingerprint:serial,request:id});
 busy=true;render();
 try{await rpc(fn,{p:{...p,request_id:id}});retries.delete(key);}
 finally{busy=false;await refreshEvents();}
}
export function initEvents(){
 $('#events-page').innerHTML=`<section class="intro"><div><div class="eyebrow">MAKE SOME TIME</div><h1>Good company<span class="brand-period">.</span></h1></div><div class="intro-side"><span id="events-status" class="status">Loading events</span><button id="event-new" class="button primary" disabled>＋ Propose an event</button></div></section><div id="events-notice" class="ledger-notice" role="status" hidden></div><div id="events-identity" class="identity-bar"></div><div class="event-toolbar"><nav class="chore-views" aria-label="Event views"><button data-event-view="agenda" aria-pressed="true">Agenda</button><button data-event-view="calendar" aria-pressed="false">Calendar</button></nav><label id="event-history-label" class="inline-check"><input id="event-history" type="checkbox"> Past & cancelled</label></div><div id="events-content"></div>`;
 document.body.insertAdjacentHTML('beforeend',`<dialog id="event-dialog" class="chore-dialog" aria-labelledby="event-form-title"><form id="event-form"><div class="dialog-top"><h2 id="event-form-title" tabindex="-1" autofocus>Make a plan</h2><button class="icon-button" type="button" id="event-close" aria-label="Close event form">×</button></div><label for="event-title">What’s the plan?</label><input id="event-title" maxlength="100" required><div class="chore-two-fields"><label>Starts<input id="event-start" type="datetime-local" required></label><label>Ends<input id="event-end" type="datetime-local" required></label></div>${info('Event times','New York time. Changing an event’s time clears its responses and reopens it for voting. During the repeated autumn hour, times use standard time.')}<label for="event-location">Where? <span class="quiet">(optional)</span></label><input id="event-location" maxlength="120"><label for="event-description">Details <span class="quiet">(optional)</span></label><textarea id="event-description" maxlength="600" rows="3"></textarea><p id="event-form-error" class="form-error" role="alert" hidden></p><div class="dialog-actions"><button class="button primary" type="submit">Save event</button></div></form></dialog>`);
 $('#event-new').onclick=()=>openEvent();$('#event-close').onclick=()=>{if(!busy)dialog().close();};dialog().addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 $('#events-identity').onclick=e=>{const b=(e.target as HTMLElement).closest<HTMLElement>('[data-event-person]');if(b&&!busy)setIdentity((b.dataset.eventPerson||null) as Member|null);};onIdentityChange(render);
 $('#event-history').onchange=()=>{past=$<HTMLInputElement>('#event-history').checked;render();};
 $('#events-page').addEventListener('click',async e=>{
 const b=(e.target as HTMLElement).closest<HTMLElement>('button');if(!b||busy)return;
 if(b.dataset.eventView){view=b.dataset.eventView;render();return;}
 if(b.dataset.eventMonth){const d=new Date(month+'-01T12:00Z');d.setUTCMonth(d.getUTCMonth()+Number(b.dataset.eventMonth));month=d.toISOString().slice(0,7);selectedDay=month+'-01';render();return;}
 if(b.dataset.eventDay){selectedDay=b.dataset.eventDay;render();return;}
 const id=b.closest<HTMLElement>('[data-event-id]')?.dataset.eventId,event=ledger?.events.find(x=>x.id===id);if(!event||!live||!identity)return;
 try{
 if(b.dataset.eventVote){const old=ledger!.responses.find(r=>r.id===id&&r.member===identity),current=old?.interval_version===event.interval_version?old.response:null;await mutate('save_event_response',{id,actor:identity,interval_version:event.interval_version,expected_version:old?.version||0,response:current===b.dataset.eventVote?null:b.dataset.eventVote},`${id}:${identity}`);}
 else if(b.dataset.eventAction==='edit')openEvent(event);
 else if(b.dataset.eventAction){if(b.dataset.eventAction==='cancel'&&!confirm('Cancel this event? Its history will remain.'))return;await mutate('save_event',{id,actor:identity,action:b.dataset.eventAction,expected_version:event.version},id!);}
 }catch(error){toast((error as Error).message);}
 });
 $('#event-form').addEventListener('submit',async e=>{
 e.preventDefault();if(busy||!live||!identity)return;
 const p={id:eventId,action:editing?'edit':'create',expected_version:editing?.version||0,actor:identity,title:field('title').value,description:field('description').value,location:field('location').value,starts_local:field('start').value,ends_local:field('end').value};
 const serial=JSON.stringify(p);if(fingerprint&&serial!==fingerprint)request=crypto.randomUUID();fingerprint=serial;
 busy=true;const inputs=Array.from(dialog().querySelectorAll<HTMLInputElement>('input,textarea,button'));inputs.forEach(i=>i.disabled=true);
 try{await rpc('save_event',{p:{...p,request_id:request}});dialog().close();toast(editing?'Event updated.':'Let’s make a plan.');}catch(error){$('#event-form-error').textContent=(error as Error).message;$('#event-form-error').hidden=false;}
 finally{busy=false;inputs.forEach(i=>i.disabled=false);await refreshEvents();}
 });render();
}
