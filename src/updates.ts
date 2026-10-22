import {$,esc,date,saved,remember} from './ui';

export type Release={id:string;date:string;title:string;items:string[]};
/** Newest first. A new id here brings the lawn notice board back on every device. */
export const RELEASES:Release[]=[
 {id:'2026-10-polish',date:'2026-10-22',title:'Smoother pages and shared plans',items:[
  'Keep scrolling past the end of a page to slide into the next one.',
  'Plan events together: mark the days that work for you, and the host picks the best one.',
  'Get a heads-up when events are posted, changed or about to start. Turn it on in Notifications.',
  'Payments look tidier. Lift a card’s corner to see the details.',
  'Finishing a task now gives a little buzz and a check mark.',
 ]},
];
const SEEN_KEY='household-updates-seen',listeners=new Set<()=>void>();
export const latestRelease=()=>RELEASES[0];
export const hasUnseenUpdates=()=>saved(SEEN_KEY)!==latestRelease().id;
/** Runs once the dialog that marked the latest release seen has closed. */
export function onUpdatesSeen(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}

function release(item:Release){
 return `<section class="updates-release"><h3>${esc(item.title)}</h3><time datetime="${item.date}">${date(item.date,true)}</time><ul>${item.items.map(text=>`<li>${esc(text)}</li>`).join('')}</ul></section>`;
}
export function openUpdates(history=false){
 const dialog=$<HTMLDialogElement>('#updates-dialog'),earlier=RELEASES.length>1&&!history;
 $('#updates-title').textContent=history?'Update history':'What’s new';
 $('#updates-list').innerHTML=(history?RELEASES:[latestRelease()]).map(release).join('')
  +(earlier?'<p class="updates-footnote">Earlier updates are in Settings → What’s new.</p>':'');
 const fresh=hasUnseenUpdates();remember(SEEN_KEY,latestRelease().id);
 if(fresh)dialog.addEventListener('close',()=>listeners.forEach(listener=>listener()),{once:true});
 syncUpdatesButton();if(!dialog.open)dialog.showModal();
}
function syncUpdatesButton(){$('#updates-board-button').hidden=!hasUnseenUpdates();}
export function initUpdates(){
 $('#updates-close').addEventListener('click',()=>$<HTMLDialogElement>('#updates-dialog').close());
 $('#updates-done').addEventListener('click',()=>$<HTMLDialogElement>('#updates-dialog').close());
 $('#updates-board-button').addEventListener('click',()=>openUpdates());
 syncUpdatesButton();
}
