import {$,saved,remember,rpc,toast} from './ui';
import {identity,onIdentityChange} from './identity';
import {initNotifications,missingNotification} from './notifications';
import {initDisclosures} from './disclosure';
import type {Member} from './ledger';

type Route='utilities'|'miscellaneous'|'chores'|'bulletin'|'events';
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
initNotifications();initDisclosures();
const systemTheme=matchMedia('(prefers-color-scheme: dark)'),selector=$<HTMLSelectElement>('#theme-select');
const preference=saved('household-theme');selector.value=preference==='light'||preference==='dark'?preference:'system';
function applyTheme(){document.documentElement.dataset.theme=selector.value==='system'?(systemTheme.matches?'dark':'light'):selector.value;}
selector.addEventListener('change',()=>{remember('household-theme',selector.value);applyTheme();});systemTheme.addEventListener('change',applyTheme);applyTheme();
let active:Route='utilities',routeVersion=0;
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
 const route=active,version=routeVersion;
 try{
  const page=await refreshPage(route);
  if(version!==routeVersion)return;
  const url=new URL(location.href),item=url.searchParams.get('notice');
  if(item){if(!page.focus?.(item))missingNotification();url.searchParams.delete('notice');history.replaceState(null,'',url);}
  // The active page never waits for the background badge request.
  void refreshBadge();
 }catch(error){toast('Could not load this section. '+(error as Error).message,{label:'Retry',run:()=>void refresh()});}
 finally{if(version===routeVersion){$('#main').setAttribute('aria-busy','false');$('#refresh').removeAttribute('disabled');}}
}
function route(){
 active=location.hash==='#events'?'events':location.hash==='#bulletin'?'bulletin':location.hash==='#chores'?'chores':location.hash==='#miscellaneous'?'miscellaneous':'utilities';routeVersion++;
 for(const [key,id] of Object.entries({utilities:'utilities-page',miscellaneous:'misc-page',chores:'chores-page',bulletin:'bulletin-page',events:'events-page'}))$('#'+id).hidden=key!==active;
 document.querySelectorAll<HTMLAnchorElement>('[data-ledger]').forEach(link=>{if(link.dataset.ledger===active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
 document.title=`Household ledger · ${active==='utilities'?'Utilities':active==='chores'?'To-dos':active==='events'?'Events':active==='bulletin'?'Bulletin':'Expenses'}`;
 $('#export').setAttribute('disabled','');$('#main').setAttribute('aria-busy','true');void refresh();
}
window.addEventListener('hashchange',route);
$('#refresh').addEventListener('click',()=>void refresh());
$('#export').addEventListener('click',()=>{void load(active).then(page=>page.export()).catch(()=>toast('Open the section again to export.'));});
onIdentityChange(()=>void refreshBadge());
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&!document.querySelector('dialog[open]'))void refresh();});
route();
setInterval(()=>{if(document.visibilityState==='visible'&&!document.querySelector('dialog[open]'))void refresh();},45000);
