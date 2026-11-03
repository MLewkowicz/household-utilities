import {tick,success} from './haptics';

const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const check='<svg viewBox="0 0 20 20" aria-hidden="true"><path class="completion-check" d="M5 10.5l3.2 3.2L15 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
// Start on the bullet. The card fills while vertical movement stays native scroll.
export function bindCompletionSwipe(root:HTMLElement,complete:(id:string)=>unknown,dragging:(active:boolean)=>void){
 type Gesture={button:HTMLButtonElement;track:HTMLElement;id:number;x:number;y:number;travel:number;progress:number;active:boolean};
 let gesture:Gesture|null=null,settling=false;
 const trackFor=(button:HTMLButtonElement)=>button.closest<HTMLElement>('.todo-tile')||button.parentElement!;
 const enabled=(button:HTMLButtonElement)=>!button.disabled&&!settling&&!document.querySelector('dialog[open]')&&!button.closest('.todo-tile')?.querySelector('.tile-details[open]');
 function progress(g:Gesture,value:number){
  const armed=value>=.9,was=g.progress>=.9;g.progress=value;
  g.track.style.setProperty('--progress',String(value));g.track.style.setProperty('--near',String(Math.max(0,Math.min(1,(value-.65)/.25))));
  g.track.classList.toggle('is-armed',armed);if(armed&&!was)tick();
 }
 function reset(spring=false){
  const g=gesture;gesture=null;
  if(g){if(spring&&g.progress>0&&!reduced()){g.track.classList.add('is-returning');setTimeout(()=>g.track.classList.remove('is-returning'),220);}
   g.track.classList.remove('is-armed','is-dragging');g.track.style.setProperty('--progress','0');g.track.style.setProperty('--near','0');
   if(g.button.hasPointerCapture(g.id))g.button.releasePointerCapture(g.id);
  }
  dragging(false);
 }
 async function finish(button:HTMLButtonElement){
  const id=button.dataset.swipeComplete!;
  // Shared work is accepted only by the contributor form. No success/fold on opening it.
  if(button.hasAttribute('data-swipe-review')){reset();await complete(id);return;}
  const track=trackFor(button),card=button.closest<HTMLElement>('article')||track,original=button.innerHTML;
  settling=true;dragging(true);button.disabled=true;track.classList.remove('is-returning','is-armed','is-dragging');track.style.setProperty('--progress','1');track.style.setProperty('--near','1');
  try{
   const result=await complete(id);if(result===false)return;
   success();button.innerHTML=check;track.classList.add('is-complete');
   if(!reduced())await new Promise<void>(resolve=>setTimeout(()=>{card.style.setProperty('--card-height',card.offsetHeight+'px');card.classList.add('is-completing');setTimeout(resolve,240);},320));
  }finally{
   if(button.isConnected){card.classList.remove('is-completing');track.classList.remove('is-complete');track.style.setProperty('--progress','0');track.style.setProperty('--near','0');button.innerHTML=original;button.disabled=false;}
   settling=false;dragging(false);
  }
 }
 root.addEventListener('pointerdown',event=>{
  const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-swipe-complete]');
  if(!button||!enabled(button)||gesture||!event.isPrimary||event.button!==0)return;
  const track=trackFor(button),compact=track.matches('.todo-tile'),inset=compact?8:4;
  const travel=Math.max(0,(compact?button.parentElement!:track).clientWidth-button.offsetWidth-2*inset);
  track.style.setProperty('--swipe-travel',travel+'px');
  gesture={button,track,id:event.pointerId,x:event.clientX,y:event.clientY,travel,progress:0,active:false};dragging(true);
 });
 root.addEventListener('pointermove',event=>{
  const g=gesture;if(!g||event.pointerId!==g.id)return;
  const dx=event.clientX-g.x,dy=event.clientY-g.y;
  if(!g.active){if(Math.abs(dy)>8&&Math.abs(dy)>Math.abs(dx)){reset();return;}if(dx<8||dx<=Math.abs(dy))return;g.active=true;g.button.setPointerCapture(g.id);g.track.classList.add('is-dragging');}
  event.preventDefault();progress(g,Math.max(0,Math.min(1,dx/Math.max(1,g.travel))));
 });
 root.addEventListener('pointerup',event=>{
  const g=gesture;if(!g||event.pointerId!==g.id)return;
  const accepted=g.progress>=.9;reset(!accepted);if(accepted)void finish(g.button);
 });
 root.addEventListener('pointercancel',()=>reset(true));
 root.addEventListener('lostpointercapture',event=>{if(gesture&&event.target===gesture.button)reset(true);});
 root.addEventListener('click',event=>{const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-swipe-complete]');if(button&&enabled(button)&&event.detail===0)void finish(button);});
 root.addEventListener('toggle',event=>{if(gesture&&(event.target as Element).matches('.tile-details'))reset();},true);
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&gesture)reset(true);});
 window.addEventListener('blur',()=>{if(gesture)reset();});window.addEventListener('hashchange',()=>{if(gesture)reset();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&gesture)reset();});
}
