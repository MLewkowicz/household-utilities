import type {Member} from './ledger';
import {localDateTime} from './chores';
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
/** A local day, start time and length become the interval the server stores. */
export function eventSpan(day:string,time:string,minutes:number){
 const [y,m,d]=day.split('-').map(Number),[h,mi]=time.split(':').map(Number),start=Date.UTC(y,m-1,d,h,mi);
 const local=(t:number)=>new Date(t).toISOString().slice(0,16);
 return {starts_local:local(start),ends_local:local(start+minutes*60000)};
}
export const eventMinutes=(e:HouseholdEvent)=>Math.round((Date.parse(e.ends_at)-Date.parse(e.starts_at))/60000);
export function durationLabel(minutes:number){
 const h=Math.floor(minutes/60),m=minutes%60;
 return h&&m?`${h}h ${m}m`:h?`${h}h`:`${m}m`;
}
export const clockLabel=(time:string)=>{const [h,m]=time.split(':').map(Number);return `${h%12||12}${m?':'+String(m).padStart(2,'0'):''} ${h<12?'AM':'PM'}`;};
/** "Tonight at 7 PM", "Tomorrow at 10 AM", "Sat at 2 PM", or a date further out. */
export function dayAndTime(day:string,time:string,today:string){
 const diff=Math.round((Date.parse(day+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/864e5),at=clockLabel(time),hour=Number(time.slice(0,2));
 const date=new Date(day+'T12:00:00Z');
 if(diff===0)return `${hour>=17?'Tonight':'Today'} at ${at}`;
 if(diff===1)return `Tomorrow at ${at}`;
 if(diff>1&&diff<7)return `${date.toLocaleDateString('en-US',{weekday:'long',timeZone:'UTC'})} at ${at}`;
 return `${date.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'})} at ${at}`;
}
/** The card's headline time, in New York time, e.g. "Starts tonight at 7 PM · 2h 30m". */
export function startsLabel(e:HouseholdEvent,now=Date.now()){
 const start=localDateTime(e.starts_at),when=dayAndTime(start.slice(0,10),start.slice(11,16),eventDay(new Date(now).toISOString()));
 const verb=Date.parse(e.ends_at)<=now?'Was':Date.parse(e.starts_at)<=now?'Started':'Starts';
 return `${verb} ${when.replace(/^(Tonight|Today|Tomorrow)/,s=>s.toLowerCase())} · ${durationLabel(eventMinutes(e))}`;
}
