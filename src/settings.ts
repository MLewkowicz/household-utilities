import {$,saved,remember} from './ui';
import {initUpdates,openUpdates} from './updates';

export function initSettings() {
 const dialog=$<HTMLDialogElement>('#settings-dialog'),toggle=$<HTMLButtonElement>('#theme-toggle');
 const systemTheme=matchMedia('(prefers-color-scheme: dark)'),selector=$<HTMLSelectElement>('#theme-select');
 const preference=saved('household-theme');selector.value=preference==='light'||preference==='dark'?preference:'system';
 let fading:ReturnType<typeof setTimeout>|undefined;
 function applyTheme(animate=false){
  const theme=selector.value==='system'?(systemTheme.matches?'dark':'light'):selector.value;
  const root=document.documentElement;
  if(root.dataset.theme!==theme){
   // In a section one snapshot cross-fade keeps the docked nav, cards and page in
   // step. Over the lawn the live scene blends its own lighting, so surfaces
   // share one CSS fade instead of freezing the canvas in a snapshot.
   const swap=()=>{root.dataset.theme=theme;};
   const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
   if(!animate||reduce)swap();
   else if('startViewTransition' in document&&$('#house-hero').hidden)document.startViewTransition(swap);
   else{clearTimeout(fading);root.classList.add('theme-fade');swap();fading=setTimeout(()=>root.classList.remove('theme-fade'),500);}
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#182437':'#f5f2e9');
  const action=theme==='dark'?'Switch to light mode':'Switch to dark mode';
  toggle.setAttribute('aria-label',action);toggle.title=action;
 }
 function saveTheme(){remember('household-theme',selector.value);applyTheme(true);}
 selector.addEventListener('change',saveTheme);
 toggle.addEventListener('click',()=>{selector.value=document.documentElement.dataset.theme==='dark'?'light':'dark';saveTheme();});
 systemTheme.addEventListener('change',()=>applyTheme(true));applyTheme();
 $('#settings-open').addEventListener('click',()=>dialog.showModal());
 $('#settings-close').addEventListener('click',()=>dialog.close());
 // Close this modal before opening Notifications or refreshing the section.
 for(const id of ['#notifications','#refresh','#whats-new'])$(id).addEventListener('click',()=>dialog.close());
 $('#whats-new').addEventListener('click',()=>openUpdates(true));
 initUpdates();
}
