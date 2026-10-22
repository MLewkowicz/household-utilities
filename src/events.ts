import type {Member} from './ledger';
export type EventResponse={id:string;member:Member;version:number;interval_version:number;response:'yes'|'maybe'|'no'|null;created_at:string};
export type HouseholdEvent={id:string;version:number;title:string;description:string;location:string;icon_id?:string|null;host:Member;starts_at:string;ends_at:string;interval_version:number;state:'polling'|'proposed'|'confirmed'|'cancelled';window_start?:string|null;window_end?:string|null;time_hint?:string;poll_version?:number|null};
/** Days a roommate marked in a poll: "yes" works, "maybe" if needed. */
export type EventAvailability={id:string;member:Member;version:number;poll_version:number;days:Record<string,'yes'|'maybe'>;created_at:string};
export type EventsLedger={events:HouseholdEvent[];responses:EventResponse[];availability?:EventAvailability[];availability_history?:EventAvailability[];history:(HouseholdEvent&{actor:Member;action:string;created_at:string})[];response_history:EventResponse[];updated_at:string|null;format_version:number};
export const eventDay=(instant:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(instant));
export const eventTime=(instant:string)=>new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(instant));
export function onEventDay(event:HouseholdEvent,day:string){return eventDay(event.starts_at)<=day&&eventDay(new Date(Date.parse(event.ends_at)-1).toISOString())>=day;}
export const polling=(e:HouseholdEvent)=>e.state==='polling';
/** Upcoming until the last poll day or the end time has passed. */
export function eventOpen(e:HouseholdEvent,now=Date.now(),day=eventDay(new Date(now).toISOString())){return e.state!=='cancelled'&&(polling(e)?e.window_end!>=day:Date.parse(e.ends_at)>now);}
export const eventSortKey=(e:HouseholdEvent)=>polling(e)?Date.parse(e.window_start+'T12:00:00Z'):Date.parse(e.starts_at);
export function pollDays(e:HouseholdEvent){
 const days:string[]=[];if(!e.window_start||!e.window_end)return days;
 for(let d=new Date(e.window_start+'T12:00:00Z');d.toISOString().slice(0,10)<=e.window_end;d.setUTCDate(d.getUTCDate()+1))days.push(d.toISOString().slice(0,10));
 return days;
}
/** Everyone's current marks for this poll, and the days that suit the household. */
export function pollSummary(e:HouseholdEvent,marks:EventAvailability[],members:readonly Member[]){
 const current=marks.filter(m=>m.id===e.id&&m.poll_version===e.poll_version);
 const days=pollDays(e).map(day=>{
  const yes=current.filter(m=>m.days[day]==='yes').map(m=>m.member),maybe=current.filter(m=>m.days[day]==='maybe').map(m=>m.member);
  return {day,yes,maybe,score:yes.length+maybe.length/2,valid:members.every(m=>yes.includes(m)||maybe.includes(m))};
 });
 const ranked=[...days].filter(d=>d.score>0).sort((a,b)=>Number(b.valid)-Number(a.valid)||b.score-a.score||b.yes.length-a.yes.length||a.day.localeCompare(b.day));
 return {days,ranked,answered:current.filter(m=>Object.keys(m.days).length).map(m=>m.member)};
}
