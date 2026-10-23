import {$,rpc,toast} from './ui';
import {identity,onIdentityChange} from './identity';
import {initNotifications,missingNotification} from './notifications';
import {initSettings} from './settings';
import {initAvatarFallback} from './people';
import {initPaperTiles} from './tile-corner';
import type {Member} from './ledger';
import {mountHouseEntry} from './house-entry';
import {sectionFromHash,type Section,type Feature} from './house-navigation';
import {bindSectionScroll} from './section-scroll';

type Route=Feature;
type Page={refresh:()=>Promise<void>;export:()=>void;focus?:(id:string)=>boolean};
const pages=new Map<Route,Promise<Page>>();
function load(route:Route):Promise<Page>{
 let pending=pages.get(route);
 if(!pending){
  pending=(async()=>{
   if(route==='utilities'){const m=await import('./client');return{refresh:m.refreshUtilities,export:m.exportUtilities,focus:m.focusUtilityNotification};}
   if(route==='miscellaneous'){const m=await import('./misc-client');m.initMisc();return{refresh:m.refreshMisc,export:m.exportMisc};}
   if(route==='chores'){const m=await import('./chores-client');m.initChores();return{refresh:m.refreshChores,export:m.exportChores,focus:m.focusChoreNotification};}
   if(route==='events'){const m=await import('./events-client');m.initEvents();return{refresh:m.refreshEvents,export:m.exportEvents,focus:m.focusEventNotification};}
   const m=await import('./bulletin-client');m.initBulletin();return{refresh:m.refreshBulletin,export:m.exportBulletin,focus:m.focusBulletinNotification};
  })().catch(error=>{pages.delete(route);throw error;});
  pages.set(route,pending);
 }
 return pending;
}
initSettings();initNotifications();initAvatarFallback();initPaperTiles();
let active:Section='home',routeVersion=0;
const house=mountHouseEntry(section=>navigate(section,'house'),section=>{if(active==='home')navigate(section,'entry');});
const PAGE_IDS:Record<Route,string>={utilities:'utilities-page',miscellaneous:'misc-page',chores:'chores-page',bulletin:'bulletin-page',events:'events-page'};
const sections=bindSectionScroll(()=>({section:active,featureOnly:Boolean($('#house-hero').hidden),ready:$('#main').getAttribute('aria-busy')!=='true'}),(section,direction)=>navigate(section,'scroll',direction),{
 page:section=>$('#'+PAGE_IDS[section]),
 prefetch:section=>refreshPage(section,20000),
});
const refreshing=new Map<Route,Promise<Page>>();
// A section peeked or prefetched moments ago is already current; re-rendering
// it as the gesture lands would stall the settle animation.
const freshAt=new Map<Route,number>();
function refreshPage(route:Route,maxAge=0){
 let pending=refreshing.get(route);
 if(!pending&&maxAge&&performance.now()-(freshAt.get(route)??-Infinity)<maxAge)return load(route);
 if(!pending){pending=load(route).then(async page=>{await page.refresh();freshAt.set(route,performance.now());return page;}).finally(()=>refreshing.delete(route));refreshing.set(route,pending);}
 return pending;
}
async function refreshBadge(){
 if(active==='chores')return;
 if(!identity){$('#chore-badge').hidden=true;return;}
 try{
  const result=await rpc<{counts:Partial<Record<Member,number>>}>('chores_summary');
  if((active as Route)==='chores')return;
  const count=identity?result.counts[identity]||0:0;
  $('#chore-badge').textContent=String(count);$('#chore-badge').hidden=!count;$('#chore-badge').removeAttribute('title');
 }catch{$('#chore-badge').title='Count unavailable. Open To-dos to refresh.';}
}
async function refresh(maxAge=0){
 if(active==='home'){$('#main').setAttribute('aria-busy','false');$('#refresh').setAttribute('disabled','');void refreshBadge();return;}
 const route=active,version=routeVersion;
 try{
  const page=await refreshPage(route,maxAge);
  if(version!==routeVersion)return;
  const url=new URL(location.href),item=url.searchParams.get('notice');
  if(item){if(!page.focus?.(item))missingNotification();url.hash=location.hash;url.searchParams.delete('notice');history.replaceState(null,'',url);}
  // The active page never waits for the background badge request.
  void refreshBadge();
  const idle=window.requestIdleCallback??((run:()=>void)=>setTimeout(run,200));
  idle(()=>{if(version===routeVersion)sections.warm();});
 }catch(error){toast('Could not load this section. '+(error as Error).message,{label:'Retry',run:()=>void refresh()});}
 finally{if(version===routeVersion){$('#main').setAttribute('aria-busy','false');$('#refresh').removeAttribute('disabled');}}
}
// Home has To-dos below it, loaded only as that content enters the viewport.
let previewPending=false;
const previewObserver=new IntersectionObserver(entries=>{
 if(active!=='home'||previewPending||!entries.some(entry=>entry.isIntersecting&&entry.intersectionRatio>0))return;
 previewPending=true;
 void refreshPage('chores').catch(()=>{/* Entering the section uses the normal retry UI. */}).finally(()=>{previewPending=false;});
},{threshold:.01});
previewObserver.observe($('#feature-area'));
type NavigationSource='initial'|'house'|'shortcut'|'history'|'scroll'|'entry';
function route(source:NavigationSource='history',direction:1|-1=1){
 // Preserve the old task deep links; the bare Home route is now the exterior.
 if(/^#home\/(personal|assigned)$/.test(location.hash)||location.hash==='#home'&&new URL(location.href).searchParams.has('notice'))history.replaceState(history.state,'',location.href.replace(/#home/, '#chores'));
 active=sectionFromHash(location.hash);routeVersion++;
 $('#feature-area').hidden=false;
 const content=active==='home'?'chores':active;
 for(const [key,id] of Object.entries(PAGE_IDS)){const page=$('#'+id);page.hidden=key!==content;page.classList.remove('section-staged');}
 document.querySelectorAll<HTMLAnchorElement>('[data-ledger]').forEach(link=>{if(link.dataset.ledger===active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
 const label=active==='home'?'Home':active==='utilities'?'Utilities':active==='chores'?'To-dos':active==='events'?'Events':active==='bulletin'?'Bulletin':'Expenses';
 document.title=`Household · ${label}`;
 const showHouse=active==='home'||source==='house'||source==='history'&&history.state?.houseView===true;
 house.select(active,source==='house',!showHouse);
 $('#export').setAttribute('disabled','');$('#main').setAttribute('aria-busy',active==='home'?'false':'true');
 // Shortcuts and forward section gestures land at the top. A backward gesture
 // lands at the preceding section's bottom.
 if(active==='home'){
  // A notification's focused card and smooth scroll can survive a hash change.
  // Move focus out of the feature, then finish landing after the new layout.
  if($('#feature-area').contains(document.activeElement))document.querySelector<HTMLElement>('[data-ledger=home]')?.focus({preventScroll:true});
  window.scrollTo({top:0,behavior:'instant'});
  const landingVersion=routeVersion;
  requestAnimationFrame(()=>{if(routeVersion===landingVersion&&active==='home')window.scrollTo({top:0,behavior:'instant'});});
 }
 else if(source==='shortcut'||source==='initial'||source==='scroll')$('#feature-area').scrollIntoView({block:'start',behavior:'instant'});
 // Shortcuts rise the new page in briefly instead of cutting.
 if(source==='shortcut'&&active!=='home'){const main=$('#main');main.classList.remove('is-entering');void main.offsetWidth;main.classList.add('is-entering');}
 void refresh(source==='scroll'?20000:0);
 // A backward gesture lands at the bottom, where the peek already showed it.
 if(source==='scroll'&&direction===-1&&active!=='home')window.scrollTo({top:document.documentElement.scrollHeight-innerHeight,behavior:'instant'});
}
function navigate(section:Section,source:'house'|'shortcut'|'scroll'|'entry',direction:1|-1=1){
 const hash='#'+section;
 if(location.hash!==hash)history.pushState({houseView:source==='house'},'',hash);
 route(source,direction);
 if((source==='shortcut'||source==='scroll')&&section!=='home')$('#main').focus({preventScroll:true});
}
document.addEventListener('click',event=>{
 const link=(event.target as HTMLElement).closest<HTMLAnchorElement>('[data-ledger],.brand');
 if(!link||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
 event.preventDefault();navigate(sectionFromHash(link.hash),'shortcut');
});
window.addEventListener('hashchange',()=>route('history'));
$('#refresh').addEventListener('click',()=>void refresh());
$('#export').addEventListener('click',()=>{if(active==='home')return;void load(active).then(page=>page.export()).catch(()=>toast('Open the section again to export.'));});
onIdentityChange(()=>void refreshBadge());
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&!document.querySelector('dialog[open]'))void refresh();});
route('initial');
setInterval(()=>{if(document.visibilityState==='visible'&&!document.querySelector('dialog[open]'))void refresh();},45000);
