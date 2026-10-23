import {HOUSE_SECTIONS,type Section,type Feature} from './house-navigation';

type State={section:Section;featureOnly:boolean;ready:boolean};
type Edge={section:Section;top:boolean;bottom:boolean};
type Options={page:(section:Feature)=>HTMLElement;prefetch:(section:Feature)=>Promise<unknown>};
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const settle='cubic-bezier(.2,.8,.2,1)';
/**
 * A new gesture at an edge changes section; arriving at the edge never does.
 * The neighbouring section follows the gesture in as a peek, then either
 * springs back or settles where ordinary scrolling would have put it.
 */
export function bindSectionScroll(state:()=>State,navigate:(section:Section,direction:1|-1)=>void,options:Options){
 const area=document.querySelector<HTMLElement>('#feature-area')!,main=document.querySelector<HTMLElement>('#main')!;
 const blocked=()=>Boolean(document.querySelector('dialog[open]'))||document.body.classList.contains('task-reordering')||(window.visualViewport?.scale??1)>1.01;
 function edge(target:EventTarget|null):Edge|null{
  const current=state();
  if(!current.featureOnly||!current.ready||blocked()||!(target instanceof Element))return null;
  // A swipe may start on a regular button without becoming a tap. Text fields,
  // sliders and navigation controls retain their own interactions.
  if(target.closest('.house-chrome,input,textarea,select,[contenteditable="true"],[data-swipe-complete],[data-availability-grid]'))return null;
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

 // The peek is the neighbour's real page, laid out beside the current one.
 let peek:{section:Feature;direction:1|-1;page:HTMLElement;target:number;pull:number;settling:boolean;returning?:boolean}|null=null;
 function openPeek(section:Section,direction:1|-1){
  if(peek)return peek.section===section&&peek.direction===direction?peek:null;
  if(section==='home'||reduced())return null;
  const page=options.page(section),landing=main.getBoundingClientRect().top+scrollY;
  // A plain gap separates the two pages; `trailing` is the padding ordinary
  // scrolling leaves below a section's last item.
  const trailing=parseFloat(getComputedStyle(area).paddingBottom)||0,gap=48;
  // Its own compositor layer keeps each frame of the drag to a transform. A
  // warmed page is already laid out, so revealing it only paints.
  area.style.willChange='transform';page.hidden=false;page.classList.remove('section-staged');page.classList.add('section-peek');
  const height=page.offsetHeight,mainTop=main.getBoundingClientRect().top;
  let target:number;
  if(direction===1){
   // Below this page, from the bottom of the screen when the page is short;
   // settles at the landing position of a fresh section.
   const top=Math.max(main.offsetHeight+gap,area.getBoundingClientRect().bottom-mainTop);page.style.top=top+'px';target=mainTop+top-landing;
  }else{
   // Above the current page; settles where a scroll to its bottom would land.
   page.style.top=-(height+gap)+'px';target=Math.min(innerHeight-trailing,landing+height)-(mainTop-gap);
  }
  peek={section,direction,page,target:Math.max(1,target),pull:0,settling:false};
  void options.prefetch(section).catch(()=>{/* Landing retries visibly. */});
  return peek;
 }
 function setPull(pull:number,ms=0,then?:()=>void){
  if(!peek)return;
  peek.pull=Math.max(0,Math.min(peek.target,pull));
  area.style.transition=ms?`transform ${ms}ms ${settle}`:'';
  area.style.transform=peek.pull?`translate3d(0,${-peek.direction*peek.pull}px,0)`:'';
  if(!then)return;
  peek.settling=true;let done=false;const current=peek;
  // A peek replaced mid-animation must not be torn down by the old one finishing.
  const finish=(event?:Event)=>{if(done||event&&event.target!==area)return;done=true;area.removeEventListener('transitionend',finish);if(peek===current)then();};
  area.addEventListener('transitionend',finish);setTimeout(()=>finish(),ms+80);
 }
 function clearPeek(){
  if(!peek)return;
  const {page,section}=peek;peek=null;
  area.style.transition='';area.style.transform='';area.style.willChange='';
  page.classList.remove('section-peek');page.style.top='';
  // A peek that sprang back stays warm for the next attempt.
  if(state().section!==section)page.classList.add('section-staged');
 }
 function springBack(){if(peek&&!peek.settling){peek.returning=true;setPull(0,220,clearPeek);}}
 function commit(){
  if(!peek||peek.settling)return;
  const {section,direction,target}=peek,start=state().section;
  setPull(target,Math.round(180+120*(1-peek.pull/target)),()=>{
   // Swap in the same frame the transform is removed so nothing jumps.
   clearPeek();if(state().section===start)navigate(section,direction);
  });
 }
 // Commit thresholds scale with the viewport so phones and desktops feel alike.
 const committed=(pull:number,velocity=0)=>pull>innerHeight*.28||(pull>24&&velocity>.45);

 let touch:{id:number;x:number;y:number;dx:number;dy:number;edge:Edge;samples:[number,number][]}|null=null;
 // Release speed over the last ~100ms, so one slow frame does not decide a flick.
 const velocity=(samples:[number,number][])=>{const [t1,d1]=samples.at(-1)!,[t0,d0]=samples.find(([t])=>t1-t<=100)!;return t1>t0?Math.abs(d1-d0)/(t1-t0):0;};
 function touchStart(event:TouchEvent){
  // A new touch cuts a spring-back short instead of being ignored.
  if(peek?.returning)clearPeek();
  touch=null;if(event.touches.length!==1||peek?.settling)return;
  const start=edge(event.target),point=event.touches[0];
  if(start)touch={id:point.identifier,x:point.clientX,y:point.clientY,dx:0,dy:0,edge:start,samples:[[performance.now(),0]]};
 }
 function touchMove(event:TouchEvent){
  if(!touch)return;
  if(event.touches.length!==1||event.defaultPrevented||blocked()){touch=null;springBack();return;}
  const point=[...event.touches].find(point=>point.identifier===touch!.id);if(!point)return;
  const now=performance.now();
  touch.dx=point.clientX-touch.x;touch.dy=touch.y-point.clientY;
  touch.samples.push([now,touch.dy]);if(touch.samples.length>12)touch.samples.shift();
  if(!peek&&Math.abs(touch.dx)>12&&Math.abs(touch.dx)>Math.abs(touch.dy)){touch=null;return;}
  if(Math.abs(touch.dy)<=6||Math.abs(touch.dy)<=Math.abs(touch.dx)*1.2&&!peek)return;
  const direction=touch.dy>0?1:-1,section=destination(touch.edge,direction);
  if(!section){if(peek&&peek.direction!==direction)setPull(0);return;}
  if(event.cancelable)event.preventDefault();
  // The peek follows the finger exactly, like ordinary scrolling.
  if(openPeek(section,direction))setPull(Math.abs(touch.dy)-6);
 }
 function touchEnd(event:TouchEvent){
  const ended=touch;touch=null;if(!ended||!event.changedTouches.length)return;
  if(blocked()){springBack();return;}
  const point=[...event.changedTouches].find(point=>point.identifier===ended.id);if(!point){springBack();return;}
  const dx=point.clientX-ended.x,dy=ended.y-point.clientY,direction=dy>0?1:-1;
  if(peek){if(peek.direction===direction&&committed(peek.pull,velocity(ended.samples)))commit();else springBack();return;}
  // Without a peek (the house above To-dos, or reduced motion) keep the one-shot swipe.
  if(Math.abs(dy)<48||Math.abs(dy)<Math.abs(dx)*1.2)return;
  const section=destination(ended.edge,direction);if(section)navigate(section,direction);
 }
 const cancel=()=>{touch=null;springBack();};

 let wheel:{at:number;began:number;edge:Edge|null;distance:number;used:boolean}|undefined,idle:ReturnType<typeof setTimeout>|undefined;
 function onWheel(event:WheelEvent){
  const now=performance.now();
  // An open peek keeps collecting slower mouse-wheel notches.
  if(!wheel||now-wheel.at>(peek&&!peek.settling?400:240))wheel={at:now,began:now,edge:edge(event.target),distance:0,used:false};
  wheel.at=now;
  if(blocked()||event.ctrlKey||event.defaultPrevented||Math.abs(event.deltaX)>Math.abs(event.deltaY)||!wheel.edge)return;
  if(peek?.returning&&!wheel.used)clearPeek();
  if(wheel.used||peek?.settling){if(event.cancelable)event.preventDefault();return;}
  const amount=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?innerHeight:1);
  const direction=(peek?Math.sign(wheel.distance+amount)||peek.direction:Math.sign(amount)) as 1|-1;
  const section=destination(wheel.edge,direction);
  if(!section){if(peek){wheel.distance=0;setPull(0,160,clearPeek);}return;}
  wheel.distance=peek||Math.sign(amount)===Math.sign(wheel.distance)?wheel.distance+amount:amount;
  if(event.cancelable)event.preventDefault();
  clearTimeout(idle);
  const pulled=Math.abs(wheel.distance),open=openPeek(section,direction);
  if(!open){
   if(pulled>=72){wheel.used=true;navigate(section,direction);}
   return;
  }
  setPull(pulled);
  // A fast flick at the edge is an aggressive scroll and commits outright.
  const velocity=pulled/Math.max(16,now-wheel.began);
  if(pulled>=innerHeight*.35||pulled>=120&&velocity>3){wheel.used=true;commit();return;}
  idle=setTimeout(()=>{if(peek&&!peek.settling){wheel=undefined;springBack();}},400);
 }
 function key(event:KeyboardEvent){
  if(event.repeat||event.defaultPrevented||!['PageDown','PageUp'].includes(event.key))return;
  const start=edge(event.target);if(!start)return;
  const direction=event.key==='PageDown'?1:-1,section=destination(start,direction);
  if(!section)return;
  event.preventDefault();
  if(openPeek(section,direction))commit();else navigate(section,direction);
 }
 // After landing, both neighbours load and lay out invisibly in idle time, so
 // a peek reveals finished pages instead of building them mid-gesture.
 function warm(){
  const current=state();if(!current.featureOnly||reduced())return;
  const index=HOUSE_SECTIONS.findIndex(item=>item.route===current.section);
  for(const offset of [1,-1]){
   const next=HOUSE_SECTIONS[index+offset]?.route;if(!next||next==='home')continue;
   void options.prefetch(next).then(()=>{
    const now=state();if(now.section!==current.section||!now.featureOnly||peek?.section===next)return;
    const page=options.page(next);page.classList.add('section-staged');page.hidden=false;
   }).catch(()=>{/* The peek loads it on demand instead. */});
  }
 }
 document.addEventListener('touchstart',touchStart,{passive:true});
 document.addEventListener('touchmove',touchMove,{passive:false});
 document.addEventListener('touchend',touchEnd,{passive:true});
 document.addEventListener('touchcancel',cancel,{passive:true});
 document.addEventListener('wheel',onWheel,{passive:false});
 document.addEventListener('keydown',key);
 return {warm,destroy:()=>{clearPeek();document.removeEventListener('touchstart',touchStart);document.removeEventListener('touchmove',touchMove);document.removeEventListener('touchend',touchEnd);document.removeEventListener('touchcancel',cancel);document.removeEventListener('wheel',onWheel);document.removeEventListener('keydown',key);}};
}
