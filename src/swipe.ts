import {tick,success} from './haptics';

const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const check='<svg viewBox="0 0 20 20" aria-hidden="true"><path class="completion-check" d="M5 10.5l3.2 3.2L15 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
// Horizontal gestures begin on the handle; vertical movement remains page scroll.
export function bindCompletionSwipe(root: HTMLElement, complete: (id:string)=>unknown, dragging:(active:boolean)=>void) {
 let gesture: {button:HTMLButtonElement;track:HTMLElement;id:number;x:number;y:number;progress:number}|null=null;
 function reset(spring=false) {
  if(gesture){
   const {track}=gesture;
   // A short slide eases home instead of snapping.
   if(spring&&gesture.progress>0){track.classList.add('is-returning');setTimeout(()=>track.classList.remove('is-returning'),220);}
   track.classList.remove('is-armed');track.style.setProperty('--progress','0');gesture.button.releasePointerCapture?.(gesture.id);
  }
  gesture=null;dragging(false);
 }
 // The check settles and the card folds away before the list re-renders.
 function celebrate(button:HTMLButtonElement){
  const track=button.parentElement!,card=button.closest<HTMLElement>('article,.chore-card')||track,id=button.dataset.swipeComplete!,original=button.innerHTML;
  success();dragging(true);button.disabled=true;
  track.classList.remove('is-armed','is-returning');track.style.setProperty('--progress','1');track.classList.add('is-complete');button.innerHTML=check;
  const finish=()=>{
   // Re-renders wait until the save settles so the folded card never reappears.
   void Promise.resolve(complete(id)).finally(()=>{
    // A failed save leaves the card where it was, ready to retry.
    if(button.isConnected){card.classList.remove('is-completing');track.classList.remove('is-complete');track.style.setProperty('--progress','0');button.innerHTML=original;button.disabled=false;}
    dragging(false);
   });
  };
  if(reduced()){finish();return;}
  setTimeout(()=>{card.style.setProperty('--card-height',card.offsetHeight+'px');card.classList.add('is-completing');setTimeout(finish,240);},320);
 }
 root.addEventListener('pointerdown',event=>{
  const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-swipe-complete]');
  if(!button||button.disabled||!event.isPrimary||event.button!==0)return;
  gesture={button,track:button.parentElement!,id:event.pointerId,x:event.clientX,y:event.clientY,progress:0};
  button.setPointerCapture(event.pointerId);dragging(true);
 });
 root.addEventListener('pointermove',event=>{
  if(!gesture||event.pointerId!==gesture.id)return;
  const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
  if(Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)){reset(true);return;}
  const width=gesture.track.clientWidth-gesture.button.offsetWidth-8,was=gesture.progress>=.9;
  gesture.progress=Math.max(0,Math.min(1,dx/Math.max(1,width)));
  gesture.track.style.setProperty('--progress',String(gesture.progress));
  // One tick when release would complete the task.
  const armed=gesture.progress>=.9;if(armed!==was){gesture.track.classList.toggle('is-armed',armed);if(armed)tick();}
 });
 root.addEventListener('pointerup',event=>{
  if(!gesture||event.pointerId!==gesture.id)return;
  const {button,progress}=gesture;
  if(progress>=.9){gesture.button.releasePointerCapture?.(gesture.id);gesture=null;celebrate(button);}else reset(true);
 });
 root.addEventListener('pointercancel',()=>reset(true));
 root.addEventListener('lostpointercapture',()=>{if(gesture){gesture=null;dragging(false);}});
 root.addEventListener('click',event=>{
  const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-swipe-complete]');
  if(button&&!button.disabled&&event.detail===0)celebrate(button);
 });
}
