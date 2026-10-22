// Best-effort touch feedback. Android exposes vibrate(); iOS Safari 18+ has no
// vibration API but plays the system haptic when a switch control toggles.
let iosSwitch:HTMLLabelElement|undefined;
function pulse(pattern:number[]){
 try{
  if(typeof navigator.vibrate==='function'){navigator.vibrate(pattern);return;}
  if(!matchMedia('(pointer:coarse)').matches)return;
  if(!iosSwitch){
   iosSwitch=document.createElement('label');iosSwitch.className='haptic-switch';iosSwitch.setAttribute('aria-hidden','true');
   iosSwitch.innerHTML='<input type="checkbox" switch tabindex="-1">';document.body.append(iosSwitch);
  }
  iosSwitch.click();
 }catch{/* Feedback is optional. */}
}
export const tick=()=>pulse([8]);
export const success=()=>pulse([12,40,18]);
