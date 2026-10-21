import {cornerTab} from './tile-corner';
import {type Chore, activeChore, queueReady, queueOpensOn, taskKind, points} from './chores';
import {type Member} from './ledger';
import {esc, name, date} from './ui';
import {avatar} from './people';
import {choreIcon} from './chore-icons';

export function choreCard(t:Chore, context:{identity:Member|null;live:boolean;day:string}) {
 const {identity,live,day}=context;
 const ready=queueReady(t,day),opens=queueOpensOn(t);
 const writable=!!identity&&live,quick=writable&&activeChore(t)&&ready&&!t.projected&&(!t.assignee||t.assignee===identity);
 const kind=taskKind(t),owner=t.assignee||t.requester;
 const due=t.due_on===day?'today':t.due_on?date(t.due_on):'';
 const status=activeChore(t)?'':t.status==='completed'?'✓ Completed':name(t.status);
 return `<article class="chore-card member-${owner} ${t.pinned?'is-pinned':''} ${!t.assignee?'is-unassigned':''}" data-chore-id="${esc(t.id)}">
  <div class="chore-card-top"><span class="entry-illustration">${choreIcon(t.icon_id)}</span><div class="chore-card-title"><div class="chore-tags"><span>${name(kind)}</span>${t.points?`<span class="chore-points">${t.points} pt${t.points===1?'':'s'}</span>`:''}${t.pinned?'<span class="chore-pin">↑ Pinned</span>':''}${due?`<span class="chore-due ${t.status==='overdue'?'is-overdue':''}">${t.status==='overdue'?'Overdue ·':'Due'} <time datetime="${t.due_on}">${due}</time>${t.due_time?' · '+esc(t.due_time):''}</span>`:''}</div><h3>${esc(t.title)}</h3></div></div>
  <div class="chore-card-people"><span class="chore-recipient">${t.assignee?`For ${name(t.assignee)}`:'Unassigned'}</span><span class="chore-sender member-${t.requester}">${avatar(t.requester)}<span>From ${name(t.requester)}</span></span>${status?`<span class="chore-state state-${t.status}">${status}</span>`:''}</div>
  ${quick?`<div class="completion-track"><span>Slide to complete</span><button class="completion-handle" data-swipe-complete="${esc(t.id)}" aria-label="Complete ${esc(t.title)}" title="Drag across, or press Enter"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 6l4 4-4 4m5-8l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>`:''}
  <details class="tile-details chore-details" data-task-details="${esc(t.id)}">${cornerTab(t.title)}<div class="tile-details-body">
   ${t.routine_id||t.reminder_group_id?`<p class="quiet">${t.routine_id?'Routine by '+name(t.requester):'Your own reminder'}</p>`:''}
   ${t.note?`<p class="chore-description">${esc(t.note)}</p>`:''}
   ${t.due_on?`<p class="chore-timing">Due ${date(t.due_on,true)}${t.due_time?' · '+t.due_time:' · end of day'}</p>`:''}
   ${activeChore(t)&&!ready&&opens?`<p class="chore-timing">In queue from ${date(opens,true)}</p>`:''}
   ${t.expires_at?`<p class="chore-timing">Expires ${new Date(t.expires_at).toLocaleString('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'})}</p>`:''}
   ${t.completion?`<p class="chore-done-by">Completed by ${t.completion.contributors.map(name).join(', ')} · ${t.points?points(t.points*12/t.completion.contributors.length)+' pts each':'No points'} · ${new Date(t.completion.completed_at).toLocaleString('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'})}</p>`:''}
   ${writable?`<div class="chore-card-actions">
    ${ready&&t.status!=='completed'&&t.status!=='cancelled'?`<button class="button secondary" data-chore-command="complete">${activeChore(t)?'Mark done':'Log completion'}</button>`:''}
    ${t.status==='completed'?'<button class="text-button" data-chore-command="complete">Correct completion</button><button class="text-button" data-chore-command="undo">Undo</button>':''}
    ${ready&&activeChore(t)&&!t.assignee?'<button class="text-button" data-chore-command="claim">Claim</button>':''}
    <button class="text-button" data-chore-command="edit">Edit</button>
    ${ready&&activeChore(t)&&t.assignee?'<button class="text-button" data-chore-command="hand_back">Hand back</button>':''}
    ${t.status==='cancelled'?'<button class="text-button" data-chore-command="reopen">Reopen</button>':t.status!=='completed'?'<button class="text-button" data-chore-command="cancel">Cancel chore</button>':''}
   </div>`:''}<div data-task-history="${esc(t.id)}"></div>
  </div></details>
 </article>`;
}
