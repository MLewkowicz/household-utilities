import type {Member} from './ledger';
export type TaskKind='reminder'|'request'|'chore';
export const taskKind=(task:{kind?:TaskKind;points:number}):TaskKind=>task.kind||(task.points===0?'reminder':'chore');
export type ChoreStatus='active'|'overdue'|'completed'|'cancelled'|'expired'|'missed';
export type Completion={contributors:Member[];completed_at:string};
export type Chore={kind?:TaskKind;reminder_group_id?:string|null;id:string;version:number;title:string;note:string;icon_id:string;assignee:Member|null;requester:Member;points:number;pinned:boolean;due_on:string|null;due_time:string|null;due_at:string|null;expires_on:string|null;expires_time:string|null;expires_at:string|null;state:'active'|'completed'|'cancelled';status:ChoreStatus;completion:Completion|null;routine_id:string|null;routine_title?:string;cycle_start:string|null;cycle_end:string|null;step_id?:string;projected:boolean;created_at:string;actor:Member};
export type ChoreRevision=Chore&{action:string;change_note:string};
// weekday is a day offset from start_week, which may now be any date.
export type RoutineStep={kind?:TaskKind;id:string;title:string;note:string;icon_id:string;points:number;weekday:number;time:string|null};
export type Routine={id:string;version:number;title:string;start_week:string;interval_weeks:number;owners:Member[];start_index:number;enabled:boolean;steps:RoutineStep[];effective_on:string;actor:Member;created_at:string};
export type Score={member:Member;period:'week'|'month'|'all';rank:number;units:number;entries:{id:string;title:string;member:Member;units:number;completed_at:string}[]};
export type ChoreLedger={tasks:Chore[];routines:Routine[];history:ChoreRevision[];routine_history:Routine[];leaderboard:Score[];updated_at:string|null;local_day:string;projection_until:string;format_version:number};
export const addDays=(day:string,n:number)=>new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
export function weekStart(day:string){const weekday=new Date(day+'T12:00:00Z').getUTCDay();return addDays(day,-((weekday+6)%7));}
export const activeChore=(task:Chore)=>task.status==='active'||task.status==='overdue';
export const urgentChore=(task:Chore,day:string)=>activeChore(task)&&(task.pinned||task.status==='overdue'||task.due_on===day);
export function queueOrder(day:string){
 const priority=(t:Chore)=>t.pinned?0:t.status==='overdue'?1:t.due_on===day?2:t.due_at?3:4;
 return(a:Chore,b:Chore)=>priority(a)-priority(b)||(a.due_at||'z').localeCompare(b.due_at||'z')||a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id);
}
export const points=(units:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(units/12);
export function localDateTime(instant=new Date().toISOString()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant));
 const v=(k:string)=>parts.find(p=>p.type===k)!.value;
 return `${v('year')}-${v('month')}-${v('day')}T${v('hour')}:${v('minute')}`;
}
