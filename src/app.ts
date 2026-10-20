import { $, saved, remember } from './ui';
import { refreshUtilities, exportUtilities } from './client';
import { initMisc, refreshMisc, exportMisc } from './misc-client';
import { initChores, refreshChores, exportChores } from './chores-client';

import { initBulletin, refreshBulletin, exportBulletin } from './bulletin-client';

initMisc();initChores();initBulletin();
const systemTheme=matchMedia('(prefers-color-scheme: dark)');
const selector=$<HTMLSelectElement>('#theme-select');
const preference=saved('household-theme');
selector.value=preference==='light'||preference==='dark'?preference:'system';
function applyTheme() {
 document.documentElement.dataset.theme=selector.value==='system'?(systemTheme.matches?'dark':'light'):selector.value;
}
selector.addEventListener('change',()=>{remember('household-theme',selector.value);applyTheme();});
systemTheme.addEventListener('change',applyTheme);applyTheme();
let active='';
async function refresh() {await Promise.all([refreshChores(),active==='miscellaneous'?refreshMisc():active==='utilities'?refreshUtilities():active==='bulletin'?refreshBulletin():Promise.resolve()]);}
function route() {
 active=location.hash==='#bulletin'?'bulletin':location.hash==='#chores'?'chores':location.hash==='#miscellaneous'?'miscellaneous':'utilities';
 $('#utilities-page').hidden=active!=='utilities';$('#misc-page').hidden=active!=='miscellaneous';$('#chores-page').hidden=active!=='chores';$('#bulletin-page').hidden=active!=='bulletin';
 document.querySelectorAll<HTMLAnchorElement>('[data-ledger]').forEach(link=>{
  if(link.dataset.ledger===active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
 });
 document.title=`Household ledger · ${active==='utilities'?'Utilities':active==='chores'?'Chores':active==='bulletin'?'Bulletin':'Miscellaneous'}`;
 void refresh();
}
window.addEventListener('hashchange',route);
$('#refresh').addEventListener('click',()=>void refresh());
$('#export').addEventListener('click',()=>active==='miscellaneous'?exportMisc():active==='chores'?exportChores():active==='bulletin'?exportBulletin():exportUtilities());
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&!document.querySelector('dialog[open]'))void refresh();});
route();
setInterval(()=>{if(document.visibilityState==='visible'&&!document.querySelector('dialog[open]')){void refreshChores();if(active==='bulletin')void refreshBulletin();}},45000);
