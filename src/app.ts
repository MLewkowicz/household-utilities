import { $, saved, remember } from './ui';
import { refreshUtilities, exportUtilities } from './client';
import { initMisc, refreshMisc, exportMisc } from './misc-client';

initMisc();
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
async function refresh() {if(active==='miscellaneous')await refreshMisc();else await refreshUtilities();}
function route() {
 active=location.hash==='#miscellaneous'?'miscellaneous':'utilities';
 $('#utilities-page').hidden=active!=='utilities';$('#misc-page').hidden=active!=='miscellaneous';
 document.querySelectorAll<HTMLAnchorElement>('[data-ledger]').forEach(link=>{
  if(link.dataset.ledger===active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
 });
 document.title=`Household ledger · ${active==='utilities'?'Utilities':'Miscellaneous'}`;
 void refresh();
}
window.addEventListener('hashchange',route);
$('#refresh').addEventListener('click',()=>void refresh());
$('#export').addEventListener('click',()=>active==='miscellaneous'?exportMisc():exportUtilities());
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&!document.querySelector('dialog[open]'))void refresh();});
route();
