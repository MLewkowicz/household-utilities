import type {Section} from './house-navigation';

/** A fresh upward gesture from any visible house scene enters Games. */
export function mountSkyPortal(state:()=>{section:Section;homeVisible:boolean;ready:boolean},prepare:()=>Promise<void>,enter:()=>void,lift:(amount:number)=>void){
 const button=document.querySelector<HTMLButtonElement>('#sky-games-launch')!,hero=document.querySelector<HTMLElement>('#house-hero')!;
 const overlay=document.createElement('div');overlay.id='sky-flight';overlay.hidden=true;
 overlay.innerHTML='<span role="status">Opening Games…</span><button type="button" aria-label="Cancel sky journey">Cancel</button>';document.body.append(overlay);
 let running=false,version=0,raf=0,finishFlight:(()=>void)|undefined;
 function cancel(){
  version++;running=false;cancelAnimationFrame(raf);finishFlight?.();finishFlight=undefined;
  overlay.hidden=true;overlay.className='';overlay.style.removeProperty('--sky-cover');
  document.body.classList.remove('sky-travelling');lift(0);
 }
 const atScene=()=>{const s=state();return s.section!=='games'&&s.homeVisible&&s.ready&&scrollY<=3&&!hero.querySelector('[aria-busy=true]');};
 const blocked=()=>Boolean(document.querySelector('dialog[open]'))||(window.visualViewport?.scale??1)>1.01;
 const eligible=(target:EventTarget|null)=>atScene()&&!blocked()&&!running&&target instanceof Element&&!target.closest('.house-chrome,input,textarea,select,button,a,[contenteditable=true]');
 function sync(){button.hidden=state().section==='games'||!state().homeVisible;}
 // Returning from a feature inserts its scene without changing the route.
 const visibility=new MutationObserver(sync);visibility.observe(hero,{attributes:true,attributeFilter:['hidden']});
 async function launch(){
  if(running||!atScene()||blocked())return;
  const token=++version,reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  running=true;overlay.hidden=false;overlay.className='is-rising';overlay.style.setProperty('--sky-cover',reduce?'1':'0');document.body.classList.add('sky-travelling');
  const start=performance.now();
  const journey=new Promise<void>(resolve=>{
   finishFlight=resolve;if(reduce){resolve();return;}
   const tick=(now:number)=>{
    if(token!==version)return;
    const progress=Math.min(1,(now-start)/2200);lift(progress);
    // Keep the modeled ascent visible; veil only the final handoff to the globe.
    const cover=Math.max(0,(progress-.86)/.14);overlay.style.setProperty('--sky-cover',String(cover*cover*(3-2*cover)));
    if(progress<1)raf=requestAnimationFrame(tick);else{overlay.classList.add('is-waiting');finishFlight=undefined;resolve();}
   };
   raf=requestAnimationFrame(tick);
  });
  try{
   await Promise.all([prepare(),journey]);
   if(token!==version)return;overlay.className='is-arriving';enter();
   await new Promise(resolve=>setTimeout(resolve,reduce?0:650));if(token!==version)return;
   cancel();document.querySelector<HTMLElement>('[data-orbit-game][aria-pressed=true]')?.focus({preventScroll:true});
  }catch{if(token!==version)return;cancel();button.textContent='Retry Games';button.focus();}
 }
 button.addEventListener('click',()=>void launch());overlay.querySelector('button')!.addEventListener('click',()=>{cancel();button.focus();});
 let wheel:{at:number;amount:number;eligible:boolean}|undefined;
 document.addEventListener('wheel',e=>{
  if(running){if(e.cancelable&&!e.ctrlKey)e.preventDefault();return;}
  const now=performance.now();if(!wheel||now-wheel.at>240)wheel={at:now,amount:0,eligible:eligible(e.target)};wheel.at=now;
  if(!wheel.eligible||e.defaultPrevented||e.ctrlKey||Math.abs(e.deltaX)>Math.abs(e.deltaY))return;
  if(e.deltaY>=0){wheel.eligible=false;return;}
  if(e.cancelable)e.preventDefault();wheel.amount-=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?innerHeight:1);
  if(wheel.amount>=85){wheel.eligible=false;void launch();}
 },{passive:false});
 let touch:{x:number;y:number;id:number;section:Section}|undefined;
 document.addEventListener('touchstart',e=>{touch=undefined;if(e.touches.length===1&&eligible(e.target)){const p=e.touches[0];touch={x:p.clientX,y:p.clientY,id:p.identifier,section:state().section};}},{passive:true});
 document.addEventListener('touchmove',e=>{
  if(!touch)return;if(e.touches.length!==1||blocked()){touch=undefined;return;}
  const p=e.touches[0],dy=p.clientY-touch.y,dx=p.clientX-touch.x;
  if(Math.abs(dx)>20&&Math.abs(dx)>Math.abs(dy)){touch=undefined;return;}
  if(dy>8&&dy>Math.abs(dx)*1.3&&e.cancelable)e.preventDefault();
 },{passive:false});
 document.addEventListener('touchend',e=>{const t=touch;touch=undefined;if(!t||t.section!==state().section)return;const p=[...e.changedTouches].find(p=>p.identifier===t.id);if(p&&p.clientY-t.y>=65&&p.clientY-t.y>Math.abs(p.clientX-t.x)*1.3&&eligible(e.target))void launch();},{passive:true});
 document.addEventListener('touchcancel',()=>{touch=undefined;},{passive:true});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&running){e.preventDefault();cancel();button.focus();}else if(e.key==='PageUp'&&!e.repeat&&!e.defaultPrevented&&eligible(e.target)){e.preventDefault();void launch();}});
 return {cancel,sync,get running(){return running;}};
}
