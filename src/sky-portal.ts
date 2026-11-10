import type {Section} from './house-navigation';
/** A fresh upward gesture on Home enters the sky; ordinary downward scroll still reaches To-dos. */
export function mountSkyPortal(state:()=>{section:Section;homeVisible:boolean;ready:boolean},prepare:()=>Promise<void>,enter:()=>void,lift:(amount:number)=>void){
 const button=document.querySelector<HTMLButtonElement>('#sky-games-launch')!,hero=document.querySelector<HTMLElement>('#house-hero')!;
 const overlay=document.createElement('div');overlay.id='sky-flight';overlay.hidden=true;overlay.setAttribute('role','status');overlay.innerHTML='<div class="sky-flight-clouds"></div><span>Opening Games…</span><button type="button" aria-label="Cancel sky journey">Cancel</button>';document.body.append(overlay);
 let running=false,version=0,raf=0,animation:Animation|undefined;
 function cancel(){version++;running=false;cancelAnimationFrame(raf);animation?.cancel();overlay.hidden=true;overlay.className='';document.body.classList.remove('sky-travelling');lift(0);}
 const eligible=(target:EventTarget|null)=>{const s=state();return s.section==='home'&&s.homeVisible&&s.ready&&scrollY<=3&&!document.querySelector('dialog[open]')&&!running&&target instanceof Element&&!target.closest('.house-chrome,input,textarea,select,button,a,[contenteditable=true]');};
 async function launch(){
  if(running||state().section!=='home'||document.querySelector('dialog[open]'))return;
  const token=++version,reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;running=true;overlay.hidden=false;overlay.className='is-rising';document.body.classList.add('sky-travelling');
  const start=performance.now();
  if(!reduce){animation=hero.animate([{filter:'brightness(1)'},{filter:'brightness(.35)'}],{duration:1000,fill:'forwards'});const tick=(now:number)=>{const p=Math.min(1,(now-start)/1100);lift(p*p*(3-2*p));if(p<1&&token===version)raf=requestAnimationFrame(tick);};raf=requestAnimationFrame(tick);}
  try{
   await Promise.all([prepare(),new Promise(resolve=>setTimeout(resolve,reduce?0:1100))]);
   if(token!==version)return;overlay.className='is-arriving';enter();
   await new Promise(resolve=>setTimeout(resolve,reduce?0:650));if(token!==version)return;
   cancel();document.querySelector<HTMLElement>('#geo-launch')?.focus({preventScroll:true});
  }catch{if(token!==version)return;cancel();button.textContent='Retry Games';button.focus();}
 }
 button.addEventListener('click',()=>void launch());overlay.querySelector('button')!.addEventListener('click',cancel);
 let wheel:{at:number;amount:number;eligible:boolean}|undefined;
 document.addEventListener('wheel',e=>{
  if(running){if(e.cancelable)e.preventDefault();return;}
  const now=performance.now();if(!wheel||now-wheel.at>240)wheel={at:now,amount:0,eligible:eligible(e.target)};wheel.at=now;
  if(!wheel.eligible||e.ctrlKey||Math.abs(e.deltaX)>Math.abs(e.deltaY))return;
  if(e.deltaY>=0){wheel.eligible=false;return;}if(e.cancelable)e.preventDefault();wheel.amount-=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?innerHeight:1);if(wheel.amount>=85){wheel.eligible=false;void launch();}
 },{passive:false});
 let touch:{x:number;y:number;id:number}|undefined;
 document.addEventListener('touchstart',e=>{touch=undefined;if(e.touches.length===1&&eligible(e.target)){const p=e.touches[0];touch={x:p.clientX,y:p.clientY,id:p.identifier};}},{passive:true});
 document.addEventListener('touchmove',e=>{if(!touch)return;if(e.touches.length!==1){touch=undefined;return;}const p=e.touches[0],dy=p.clientY-touch.y,dx=p.clientX-touch.x;if(Math.abs(dx)>20&&Math.abs(dx)>Math.abs(dy)){touch=undefined;return;}if(dy>8&&dy>Math.abs(dx)*1.3&&e.cancelable)e.preventDefault();},{passive:false});
 document.addEventListener('touchend',e=>{const t=touch;touch=undefined;if(!t)return;const p=[...e.changedTouches].find(p=>p.identifier===t.id);if(p&&p.clientY-t.y>=65&&p.clientY-t.y>Math.abs(p.clientX-t.x)*1.3&&eligible(e.target))void launch();},{passive:true});
 document.addEventListener('touchcancel',()=>{touch=undefined;},{passive:true});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&running){e.preventDefault();cancel();button.focus();}else if(e.key==='PageUp'&&!e.repeat&&eligible(e.target)){e.preventDefault();void launch();}});
 return {cancel,sync(){button.hidden=state().section!=='home'||!state().homeVisible;},get running(){return running;}};
}
