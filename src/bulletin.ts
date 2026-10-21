import type {NoteReaction} from './note-reactions';
import type {Member} from './ledger';
export type BulletinNote={id:string;version:number;body:string;temperature:number;kind:'complaint'|'compliment';recipients:Member[];author:Member;posted_at:string;deleted:boolean;actor:Member;action:string;created_at:string};
export type BulletinStat={period:'all'|'week'|'month';member:Member;direction:'written'|'received';complaints:number;compliments:number};
export type Bulletin={reactions?:NoteReaction[];reaction_history?:NoteReaction[];notes:BulletinNote[];history:BulletinNote[];stats:BulletinStat[];updated_at:string|null;format_version:number};
export function temperatureLabel(value:number){
 if(value===0)return 'A little undecided';
 const magnitude=Math.abs(value),level=magnitude<25?0:magnitude<50?1:magnitude<75?2:3;
 return (value<0?['A small gripe','Getting heated','Properly steamed','About to burst']:['A little appreciation','Made my day','Feeling the love','Heart overflowing'])[level];
}
export function notePlacement(id:string){
 let hash=0;for(const c of id)hash=(Math.imul(hash,31)+c.charCodeAt(0))>>>0;
 return {rotation:((hash&1)?1:-1)*(2.4+(hash%27)/10),offset:(hash>>>5)%29,inset:(hash>>>9)%19};
}
