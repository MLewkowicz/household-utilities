import {HOUSE_SECTIONS,type Section} from './house-navigation';

type State={section:Section;featureOnly:boolean;ready:boolean};
type Edge={section:Section;top:boolean;bottom:boolean};
/** A new gesture at an edge changes section; arriving at the edge never does. */
export function bindSectionScroll(state:()=>State,navigate:(section:Section,direction:1|-1)=>void){
 const blocked=()=>Boolean(document.querySelector('dialog[open]'))||document.body.classList.contains('task-reordering')||(window.visualViewport?.scale??1)>1.01;
 function edge(target:EventTarget|null):Edge|null{
  const current=state();
  if(!current.featureOnly||!current.ready||blocked()||!(target instanceof Element))return null;
  // A swipe may start on a regular button without becoming a tap. Text fields,
  // sliders and navigation controls retain their own interactions.
  if(target.closest('.house-chrome,input,textarea,select,[contenteditable="true"],[data-swipe-complete]'))return null;
  // Tables, calendars, pickers and other nested scrollers own their gestures.
  for(let el:Element|null=target;el&&el!==document.body;el=el.parentElement){
   const css=getComputedStyle(el);
   if(/auto|scroll/.test(css.overflowY+css.overflowX)&&(el.scrollHeight>el.clientHeight+2||el.scrollWidth>el.clientWidth+2))return null;
  }
  const bottom=Math.max(0,document.documentElement.scrollHeight-innerHeight);
  return {section:current.section,top:scrollY<=3,bottom:scrollY>=bottom-3};
 }
 function destination(start:Edge,direction:1|-1){
  const current=state();
  if(blocked()||!current.ready||!current.featureOnly||current.section!==start.section||!(direction===1?start.bottom:start.top))return;
  const index=HOUSE_SECTIONS.findIndex(item=>item.route===start.section);
  return HOUSE_SECTIONS[index+direction]?.route;
 }
 let touch:{id:number;x:number;y:number;dx:number;dy:number;edge:Edge}|null=null;
 function touchStart(event:TouchEvent){
  touch=null;if(event.touches.length!==1)return;
  const start=edge(event.target),point=event.touches[0];
  if(start)touch={id:point.identifier,x:point.clientX,y:point.clientY,dx:0,dy:0,edge:start};
 }
 function touchMove(event:TouchEvent){
  if(!touch)return;
  if(event.touches.length!==1||event.defaultPrevented||blocked()){touch=null;return;}
  const point=[...event.touches].find(point=>point.identifier===touch!.id);if(!point)return;
  touch.dx=point.clientX-touch.x;touch.dy=touch.y-point.clientY;
  if(Math.abs(touch.dx)>12&&Math.abs(touch.dx)>Math.abs(touch.dy)){touch=null;return;}
  if(Math.abs(touch.dy)>6&&Math.abs(touch.dy)>Math.abs(touch.dx)*1.2&&destination(touch.edge,touch.dy>0?1:-1)&&event.cancelable)event.preventDefault();
 }
 function touchEnd(event:TouchEvent){
  const ended=touch;touch=null;if(!ended||!event.changedTouches.length||blocked())return;
  const point=[...event.changedTouches].find(point=>point.identifier===ended.id);if(!point)return;
  const dx=point.clientX-ended.x,dy=ended.y-point.clientY,direction=dy>0?1:-1;
  if(Math.abs(dy)<48||Math.abs(dy)<Math.abs(dx)*1.2)return;
  const section=destination(ended.edge,direction);if(section)navigate(section,direction);
 }
 const cancel=()=>{touch=null;};
 let wheel:{at:number;edge:Edge|null;distance:number;used:boolean}|undefined;
 function onWheel(event:WheelEvent){
  const now=performance.now();
  if(!wheel||now-wheel.at>240)wheel={at:now,edge:edge(event.target),distance:0,used:false};
  wheel.at=now;
  if(blocked()||event.ctrlKey||event.defaultPrevented||Math.abs(event.deltaX)>Math.abs(event.deltaY)||!wheel.edge)return;
  if(wheel.used){if(event.cancelable)event.preventDefault();return;}
  const direction=event.deltaY>0?1:-1,section=destination(wheel.edge,direction);if(!section)return;
  const amount=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?innerHeight:1);
  wheel.distance=Math.sign(amount)===Math.sign(wheel.distance)?wheel.distance+amount:amount;
  if(event.cancelable)event.preventDefault();
  if(Math.abs(wheel.distance)>=72){wheel.used=true;navigate(section,direction);}
 }
 function key(event:KeyboardEvent){
  if(event.repeat||event.defaultPrevented||!['PageDown','PageUp'].includes(event.key))return;
  const start=edge(event.target);if(!start)return;
  const direction=event.key==='PageDown'?1:-1,section=destination(start,direction);
  if(section){event.preventDefault();navigate(section,direction);}
 }
 document.addEventListener('touchstart',touchStart,{passive:true});
 document.addEventListener('touchmove',touchMove,{passive:false});
 document.addEventListener('touchend',touchEnd,{passive:true});
 document.addEventListener('touchcancel',cancel,{passive:true});
 document.addEventListener('wheel',onWheel,{passive:false});
 document.addEventListener('keydown',key);
 return ()=>{document.removeEventListener('touchstart',touchStart);document.removeEventListener('touchmove',touchMove);document.removeEventListener('touchend',touchEnd);document.removeEventListener('touchcancel',cancel);document.removeEventListener('wheel',onWheel);document.removeEventListener('keydown',key);};
}
