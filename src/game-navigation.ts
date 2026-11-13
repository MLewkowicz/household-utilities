import {dailyRunMarkup} from './daily-run';
import {HOUSE_SECTIONS,sectionFromHash} from './house-navigation';

const STORAGE_KEY='household-game-return',VIEW_KEY='household-game-return-scene';
const taskViews=new Set(['personal','assigned','unassigned','household','week','leaderboard']);
export const homeIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 10 9-7 9 7M5 9v11h5v-6h4v6h5V9"/></svg>';
export function gameNavigationMarkup(){return `<nav class="game-floating-nav" aria-label="Game navigation"><a href="#games" class="game-hub-return" aria-label="Games" title="Observatory"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m5 13 12-8 3 4-12 8ZM11 16l-4 6m6-8 4 8M17 5l1-2m2 6 2 1"/></svg></a><a data-game-return href="#chores" title="Return home">${homeIcon}</a>${dailyRunMarkup()}</nav>`;}
/** Store only known local routes, including the selected To-dos view. */
function destination(hash:string|null){
 if(!hash)return '#chores';
 const [route,view,...rest]=hash.replace(/^#/,'').split('/');
 if(!hash.startsWith('#')||rest.length||!HOUSE_SECTIONS.some(s=>s.route===route))return '#chores';
 if(view&&!(route==='chores'&&taskViews.has(view)))return '#chores';
 return hash;
}

let instance:{sync(hash:string):void}|undefined;
export function mountGameNavigation(){
 if(instance)return instance;
 let last='#chores',scene=false;
 try{last=destination(sessionStorage.getItem(STORAGE_KEY));scene=sessionStorage.getItem(VIEW_KEY)==='true';}catch{/* Navigation works without storage. */}
 return instance={sync(hash:string){
  const section=sectionFromHash(hash);
  if(section!=='games'){
   last=destination(hash||'#home');scene=!document.querySelector<HTMLElement>('#house-hero')!.hidden;
   try{sessionStorage.setItem(STORAGE_KEY,last);sessionStorage.setItem(VIEW_KEY,String(scene));}catch{/* Optional convenience only. */}
  }
  const label=HOUSE_SECTIONS.find(s=>s.route===sectionFromHash(last))!.label;
  document.querySelectorAll<HTMLAnchorElement>('[data-game-return]').forEach(link=>{
   link.href=last;link.dataset.houseReturn=String(scene);link.setAttribute('aria-label',`Back to ${label}`);
   link.innerHTML=homeIcon;link.title=`Back to ${label}`;
  });
  const shortcut=document.querySelector<HTMLElement>('#games-shortcut')!;
  // House scenes have their sky entrance. Feature pages get a direct shortcut.
  shortcut.hidden=section==='home'||section==='games';
 }};
}
