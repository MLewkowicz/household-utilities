import {HOUSE_SECTIONS,sectionFromHash} from './house-navigation';

const STORAGE_KEY='household-game-return',VIEW_KEY='household-game-return-scene';
const taskViews=new Set(['personal','assigned','unassigned','household','week','leaderboard']);
/** Store only known local routes, including the selected To-dos view. */
function destination(hash:string|null){
 if(!hash)return '#chores';
 const [route,view,...rest]=hash.replace(/^#/,'').split('/');
 if(!hash.startsWith('#')||rest.length||!HOUSE_SECTIONS.some(s=>s.route===route))return '#chores';
 if(view&&!(route==='chores'&&taskViews.has(view)))return '#chores';
 return hash;
}

export function mountGameNavigation(){
 let last='#chores',scene=false;
 try{last=destination(sessionStorage.getItem(STORAGE_KEY));scene=sessionStorage.getItem(VIEW_KEY)==='true';}catch{/* Navigation works without storage. */}
 return {sync(hash:string){
  const section=sectionFromHash(hash);
  if(section!=='games'){
   last=destination(hash||'#home');scene=!document.querySelector<HTMLElement>('#house-hero')!.hidden;
   try{sessionStorage.setItem(STORAGE_KEY,last);sessionStorage.setItem(VIEW_KEY,String(scene));}catch{/* Optional convenience only. */}
  }
  const label=HOUSE_SECTIONS.find(s=>s.route===sectionFromHash(last))!.label;
  document.querySelectorAll<HTMLAnchorElement>('[data-game-return]').forEach(link=>{
   link.href=last;link.dataset.houseReturn=String(scene);link.setAttribute('aria-label',`Back to ${label}`);
   link.innerHTML=`<span aria-hidden="true">←</span><span>${label}</span>`;
  });
  const shortcut=document.querySelector<HTMLElement>('#games-shortcut')!;
  // House scenes have their sky entrance. Feature pages get a direct shortcut.
  shortcut.hidden=section==='home'||section==='games';
 }};
}
