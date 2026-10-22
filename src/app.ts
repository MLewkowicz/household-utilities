import {$,rpc,toast} from './ui';
import {identity,onIdentityChange} from './identity';
import {initNotifications,missingNotification} from './notifications';
import {initSettings} from './settings';
import {initAvatarFallback} from './people';
import {initPaperTiles} from './tile-corner';
import type {Member} from './ledger';
import {mountHouseEntry} from './house-entry';
import {sectionFromHash,type Section,type Feature} from './house-navigation';

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
   if(route==='events'){const m=await import('./events-client');m.initEvents();return{refresh:m.refreshEvents,export:m.exportEvents};}
   const m=await import('./bulletin-client');m.initBulletin();return{refresh:m.refreshBulletin,export:m.exportBulletin,focus:m.focusBulletinNotification};
  })().catch(error=>{pages.delete(route);throw error;});
  pages.set(route,pending);
 }
 return pending;
}
initSettings();initNotifications();initAvatarFallback();initPaperTiles();
let active:Section='home',routeVersion=0;
const house=mountHouseEntry(section=>navigate(section,'house'));
const refreshing=new Map<Route,Promise<Page>>();
function refreshPage(route:Route){
 let pending=refreshing.get(route);
 if(!pending){pending=load(route).then(async page=>{await page.refresh();return page;}).finally(()=>refreshing.delete(route));refreshing.set(route,pending);}
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
async function refresh(){
 if(active==='home'){$('#main').setAttribute('aria-busy','false');$('#refresh').setAttribute('disabled','');void refreshBadge();return;}
 const route=active,version=routeVersion;
 try{
  const page=await refreshPage(route);
  if(version!==routeVersion)return;
  const url=new URL(location.href),item=url.searchParams.get('notice');
  if(item){if(!page.focus?.(item))missingNotification();url.hash=location.hash;url.searchParams.delete('notice');history.replaceState(null,'',url);}
  // The active page never waits for the background badge request.
  void refreshBadge();
 }catch(error){toast('Could not load this section. '+(error as Error).message,{label:'Retry',run:()=>void refresh()});}
 finally{if(version===routeVersion){$('#main').setAttribute('aria-busy','false');$('#refresh').removeAttribute('disabled');}}
}
type NavigationSource='initial'|'house'|'shortcut'|'history';
function route(source:NavigationSource='history'){
 // Preserve the old task deep links; the bare Home route is now the exterior.
 if(/^#home\/(personal|assigned)$/.test(location.hash)||location.hash==='#home'&&new URL(location.href).searchParams.has('notice'))history.replaceState(history.state,'',location.href.replace(/#home/, '#chores'));
 active=sectionFromHash(location.hash);routeVersion++;
 $('#feature-area').hidden=active==='home';
 for(const [key,id] of Object.entries({utilities:'utilities-page',miscellaneous:'misc-page',chores:'chores-page',bulletin:'bulletin-page',events:'events-page'}))$('#'+id).hidden=key!==active;
 document.querySelectorAll<HTMLAnchorElement>('[data-ledger]').forEach(link=>{if(link.dataset.ledger===active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
 const label=active==='home'?'Home':active==='utilities'?'Utilities':active==='chores'?'To-dos':active==='events'?'Events':active==='bulletin'?'Bulletin':'Expenses';
 document.title=`Household · ${label}`;
 const showHouse=active==='home'||source==='house'||source==='history'&&history.state?.houseView===true;
 house.select(active,source==='house',!showHouse);
 $('#export').setAttribute('disabled','');$('#main').setAttribute('aria-busy',active==='home'?'false':'true');
 // Shortcuts enter the feature directly. Scrolling beyond a scene also removes
 // the house from the scroll path; Home restores the animation menu.
 if(source==='shortcut'||source==='initial'){
  if(active==='home')window.scrollTo({top:0,behavior:'instant'});
  else $('#feature-area').scrollIntoView({block:'start',behavior:'instant'});
 }
 void refresh();
}
function navigate(section:Section,source:'house'|'shortcut'){
 const hash='#'+section;
 if(location.hash!==hash)history.pushState({houseView:source==='house'},'',hash);
 route(source);
 if(source==='shortcut'&&section!=='home')$('#main').focus({preventScroll:true});
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
