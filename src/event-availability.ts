import {esc,name,date} from './ui';
import {MEMBERS,type Member} from './ledger';
import {avatar} from './people';
import {pollSummary,type EventAvailability,type HouseholdEvent} from './events';

export type Mark='yes'|'maybe';
const weekdays=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const shift=(day:string,by:number)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+by);return d.toISOString().slice(0,10);};

/** A month-style grid of the poll window: heat for the household, marks for me. */
export function availabilityGrid(e:HouseholdEvent,marks:EventAvailability[],me:Member|null,brush:Mark,enabled:boolean){
 const {days,answered}=pollSummary(e,marks,MEMBERS),mine=marks.find(m=>m.id===e.id&&m.member===me&&m.poll_version===e.poll_version)?.days||{};
 const first=e.window_start!,offset=(new Date(first+'T12:00:00Z').getUTCDay()+6)%7,start=shift(first,-offset);
 const cells=Math.ceil((offset+days.length)/7)*7,byDay=new Map(days.map(d=>[d.day,d]));
 const grid=Array.from({length:cells},(_,i)=>{
  const day=shift(start,i),info=byDay.get(day);
  if(!info)return '<span class="avail-cell outside" aria-hidden="true"></span>';
  const mark=mine[day],who=[...info.yes.map(m=>`${name(m)} works`),...info.maybe.map(m=>`${name(m)} if needed`)].join(', ')||'Nobody yet';
  return `<button type="button" class="avail-cell${info.valid?' valid':''}" data-avail-day="${day}" data-mark="${mark||''}" style="--heat:${(info.score/MEMBERS.length).toFixed(3)}" aria-pressed="${mark?'true':'false'}" aria-label="${date(day)}: ${mark==='yes'?'works for you':mark==='maybe'?'if needed for you':'not marked'}. ${esc(who)}${info.valid?'. Everyone can make it':''}" title="${esc(who)}" ${enabled?'':'disabled'}><span>${Number(day.slice(-2))}</span>${info.yes.length+info.maybe.length?`<i>${info.yes.length+info.maybe.length}</i>`:''}</button>`;
 }).join('');
 const waiting=MEMBERS.filter(m=>!answered.includes(m));
 return `<div class="avail" data-availability-grid data-event-poll="${e.id}">
 ${enabled?`<div class="avail-brush" role="radiogroup" aria-label="Mark days as"><button type="button" role="radio" data-avail-brush="yes" aria-checked="${brush==='yes'}">Works</button><button type="button" role="radio" data-avail-brush="maybe" aria-checked="${brush==='maybe'}">If needed</button><span class="quiet">Drag across days · tap again to clear</span></div>`:''}
 <div class="avail-grid" role="group" aria-label="Days for ${esc(e.title)}">${weekdays.map(d=>`<span class="avail-weekday" aria-hidden="true">${d[0]}</span>`).join('')}${grid}</div>
 <div class="avail-legend"><span><i class="swatch heat"></i>More people free</span><span><i class="swatch valid"></i>Everyone can make it</span></div>
 <p class="avail-waiting">${answered.length?`<span class="avail-faces">${answered.map(m=>avatar(m)).join('')}</span>`:''}${waiting.length?`Waiting on ${waiting.map(name).join(', ')}`:'Everyone has marked their days'}</p>
 </div>`;
}

/**
 * Drag to paint days; the first cell decides whether the stroke adds the brush
 * or clears it. One stroke saves once, when the pointer lifts.
 */
export function bindAvailability(root:HTMLElement,options:{brush:()=>Mark;mine:(eventId:string)=>Record<string,Mark>;commit:(eventId:string,days:Record<string,Mark>)=>void}){
 let stroke:{grid:HTMLElement;id:string;pointer:number;erase:boolean;days:Record<string,Mark>;touched:Set<string>}|null=null;
 function paint(cell:HTMLElement){
  if(!stroke||stroke.touched.has(cell.dataset.availDay!))return;
  const day=cell.dataset.availDay!;stroke.touched.add(day);
  if(stroke.erase)delete stroke.days[day];else stroke.days[day]=options.brush();
  cell.dataset.mark=stroke.days[day]||'';cell.setAttribute('aria-pressed',String(Boolean(stroke.days[day])));
 }
 const cellAt=(x:number,y:number)=>(document.elementFromPoint(x,y) as HTMLElement|null)?.closest<HTMLElement>('[data-avail-day]:not(:disabled)');
 root.addEventListener('pointerdown',event=>{
  const cell=(event.target as HTMLElement).closest<HTMLElement>('[data-avail-day]:not(:disabled)'),grid=cell?.closest<HTMLElement>('[data-event-poll]');
  if(!cell||!grid||!event.isPrimary||event.button!==0)return;
  const id=grid.dataset.eventPoll!,days={...options.mine(id)},current=days[cell.dataset.availDay!];
  stroke={grid,id,pointer:event.pointerId,erase:current===options.brush(),days,touched:new Set()};
  cell.releasePointerCapture?.(event.pointerId);event.preventDefault();paint(cell);
 });
 root.addEventListener('pointermove',event=>{
  if(!stroke||event.pointerId!==stroke.pointer)return;
  const cell=cellAt(event.clientX,event.clientY);
  if(cell&&stroke.grid.contains(cell))paint(cell);
 });
 const finish=(event:PointerEvent)=>{
  if(!stroke||event.pointerId!==stroke.pointer)return;
  const {id,days}=stroke;stroke=null;options.commit(id,days);
 };
 root.addEventListener('pointerup',finish);root.addEventListener('pointercancel',finish);
 // Keyboard: Enter/Space toggles a day; arrows move by day and week.
 root.addEventListener('click',event=>{
  const cell=(event.target as HTMLElement).closest<HTMLElement>('[data-avail-day]:not(:disabled)');if(!cell||event.detail!==0)return;
  const id=cell.closest<HTMLElement>('[data-event-poll]')!.dataset.eventPoll!,days={...options.mine(id)},day=cell.dataset.availDay!;
  if(days[day]===options.brush())delete days[day];else days[day]=options.brush();
  options.commit(id,days);
 });
 root.addEventListener('keydown',event=>{
  const cell=(event.target as HTMLElement).closest<HTMLElement>('[data-avail-day]');if(!cell)return;
  const by={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[event.key];if(!by)return;
  const next=cell.closest('[data-event-poll]')!.querySelector<HTMLElement>(`[data-avail-day="${shift(cell.dataset.availDay!,by)}"]`);
  if(next){event.preventDefault();next.focus();}
 });
}
