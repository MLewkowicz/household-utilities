import {esc,name} from './ui';

type EntryRevision={created_at?:string;actor?:string;version?:number;deleted?:boolean|number;action?:string};
export function latestRevision<T extends {id:string;version:number}>(rows:T[],id:string):T|undefined{
 return rows.reduce<T|undefined>((latest,row)=>row.id===id&&(!latest||row.version>latest.version)?row:latest,undefined);
}
/** One current timestamp, without exposing the revision log. */
export function entryMeta(entry?:EntryRevision){
 if(!entry?.created_at||!Number.isFinite(Date.parse(entry.created_at)))return '';
 const label=entry.deleted?'Deleted':entry.action==='edit'?'Edited':entry.version===1?'Added':'Updated';
 const timestamp=new Date(entry.created_at).toLocaleString('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'});
 return `<p class="entry-updated">${label}${entry.actor?' by '+esc(name(entry.actor)):''} · <time datetime="${esc(entry.created_at)}">${esc(timestamp)}</time></p>`;
}
