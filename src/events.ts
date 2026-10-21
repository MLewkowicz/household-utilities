import type {Member} from './ledger';
export type EventResponse={id:string;member:Member;version:number;interval_version:number;response:'yes'|'maybe'|'no'|null;created_at:string};
export type HouseholdEvent={id:string;version:number;title:string;description:string;location:string;icon_id?:string|null;host:Member;starts_at:string;ends_at:string;interval_version:number;state:'proposed'|'confirmed'|'cancelled'};
export type EventsLedger={events:HouseholdEvent[];responses:EventResponse[];history:(HouseholdEvent&{actor:Member;action:string;created_at:string})[];response_history:EventResponse[];updated_at:string|null;format_version:number};
export const eventDay=(instant:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(instant));
export const eventTime=(instant:string)=>new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(instant));
export function onEventDay(event:HouseholdEvent,day:string){return eventDay(event.starts_at)<=day&&eventDay(new Date(Date.parse(event.ends_at)-1).toISOString())>=day;}
