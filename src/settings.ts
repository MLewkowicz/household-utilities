import {$,saved,remember} from './ui';

export function initSettings() {
 const dialog=$<HTMLDialogElement>('#settings-dialog'),toggle=$<HTMLButtonElement>('#theme-toggle');
 const systemTheme=matchMedia('(prefers-color-scheme: dark)'),selector=$<HTMLSelectElement>('#theme-select');
 const preference=saved('household-theme');selector.value=preference==='light'||preference==='dark'?preference:'system';
 function applyTheme(){
  const theme=selector.value==='system'?(systemTheme.matches?'dark':'light'):selector.value;
  document.documentElement.dataset.theme=theme;
  const action=theme==='dark'?'Switch to light mode':'Switch to dark mode';
  toggle.setAttribute('aria-label',action);toggle.title=action;
 }
 function saveTheme(){remember('household-theme',selector.value);applyTheme();}
 selector.addEventListener('change',saveTheme);
 toggle.addEventListener('click',()=>{selector.value=document.documentElement.dataset.theme==='dark'?'light':'dark';saveTheme();});
 systemTheme.addEventListener('change',applyTheme);applyTheme();
 $('#settings-open').addEventListener('click',()=>dialog.showModal());
 $('#settings-close').addEventListener('click',()=>dialog.close());
 // Close this modal before opening Notifications or refreshing the section.
 for(const id of ['#notifications','#refresh'])$(id).addEventListener('click',()=>dialog.close());
}
