import type {Section} from './house-navigation';

type State={section:Section;featureOnly:boolean;ready:boolean};
/** Only an upward scroll at the top leaves a feature, returning to its house scene. */
export function bindSectionScroll(state:()=>State,returnToScene:()=>void){
 const blocked=()=>Boolean(document.querySelector('dialog[open]'))||document.body.classList.contains('task-reordering')||(window.visualViewport?.scale??1)>1.01;
 function eligible(target:EventTarget|null){
  const current=state();
  if(!current.featureOnly||!current.ready||blocked()||scrollY>3||!(target instanceof Element))return false;
  if(target.closest('.house-chrome,input,textarea,select,[contenteditable="true"],[data-swipe-complete],[data-availability-grid]'))return false;
  for(let el:Element|null=target;el&&el!==document.body&&el!==document.documentElement;el=el.parentElement){
   const css=getComputedStyle(el);
   if(/auto|scroll/.test(css.overflowY+css.overflowX)&&(el.scrollHeight>el.clientHeight+2||el.scrollWidth>el.clientWidth+2))return false;
  }
  return true;
 }
 let touch:{id:number;x:number;y:number;section:Section}|null=null;
 function start(event:TouchEvent){
  touch=null;
  if(event.touches.length!==1||!eligible(event.target))return;
  const point=event.touches[0];touch={id:point.identifier,x:point.clientX,y:point.clientY,section:state().section};
 }
 function move(event:TouchEvent){
  if(!touch)return;
  if(event.touches.length!==1||blocked()||event.defaultPrevented){touch=null;return;}
  const point=[...event.touches].find(p=>p.identifier===touch!.id);if(!point)return;
  const dx=point.clientX-touch.x,dy=point.clientY-touch.y;
  if(Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)){touch=null;return;}
  if(dy>6&&dy>Math.abs(dx)*1.2&&event.cancelable)event.preventDefault();
 }
 function end(event:TouchEvent){
  const initial=touch;touch=null;if(!initial||blocked()||initial.section!==state().section||!state().featureOnly)return;
  const point=[...event.changedTouches].find(p=>p.identifier===initial.id);if(!point)return;
  const dy=point.clientY-initial.y,dx=point.clientX-initial.x;
  if(dy>=48&&dy>Math.abs(dx)*1.2)returnToScene();
 }
 const cancel=()=>{touch=null;};
 let wheel:{at:number;eligible:boolean;section:Section;distance:number;used:boolean}|undefined;
 function onWheel(event:WheelEvent){
  const now=performance.now();
  if(!wheel||now-wheel.at>240)wheel={at:now,eligible:eligible(event.target),section:state().section,distance:0,used:false};
  wheel.at=now;
  if(blocked()||event.ctrlKey||event.defaultPrevented||Math.abs(event.deltaX)>Math.abs(event.deltaY)||!wheel.eligible)return;
  // Consume the rest of this upward burst while the house scrolls into view.
  if(wheel.used){if(event.deltaY<0&&event.cancelable)event.preventDefault();return;}
  if(event.deltaY>=0){wheel.eligible=false;return;}
  if(!state().featureOnly||state().section!==wheel.section)return;
  if(event.cancelable)event.preventDefault();
  wheel.distance-=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?innerHeight:1);
  if(wheel.distance>=72){wheel.used=true;returnToScene();}
 }
 function key(event:KeyboardEvent){
  if(event.key!=='PageUp'||event.repeat||event.defaultPrevented||!eligible(event.target))return;
  event.preventDefault();returnToScene();
 }
 document.addEventListener('touchstart',start,{passive:true});
 document.addEventListener('touchmove',move,{passive:false});
 document.addEventListener('touchend',end,{passive:true});
 document.addEventListener('touchcancel',cancel,{passive:true});
 document.addEventListener('wheel',onWheel,{passive:false});
 document.addEventListener('keydown',key);
 return {destroy:()=>{document.removeEventListener('touchstart',start);document.removeEventListener('touchmove',move);document.removeEventListener('touchend',end);document.removeEventListener('touchcancel',cancel);document.removeEventListener('wheel',onWheel);document.removeEventListener('keydown',key);}};
}
