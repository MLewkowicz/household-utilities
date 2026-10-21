/** Long press leaves ordinary touch scrolling and all tile controls available. */
export function bindTaskReorder(root:HTMLElement, options:{enabled:()=>boolean;active:(value:boolean)=>void;commit:(key:string,keys:string[],group:string)=>void}){
 type Gesture={pointer:number;pointerType:string;x:number;y:number;startX:number;startY:number;entry:HTMLElement;parent:HTMLElement;next:Element|null;group:string;keys:string[];timer:number;active:boolean;ghost?:HTMLElement;left:number;top:number;frame:number};
 let gesture:Gesture|undefined,suppressClick=false;
 const rows=()=>[...root.querySelectorAll<HTMLElement>('[data-home-key]')];
 function finish(save=false){
  const g=gesture;if(!g)return;gesture=undefined;clearTimeout(g.timer);cancelAnimationFrame(g.frame);
  if(root.hasPointerCapture(g.pointer))root.releasePointerCapture(g.pointer);
  g.ghost?.remove();g.entry.classList.remove('is-reordering');document.body.classList.remove('task-reordering');
  if(!save&&g.active)g.parent.insertBefore(g.entry,g.next?.parentElement===g.parent?g.next:null);
  const keys=rows().map(e=>e.dataset.homeKey!),group=g.entry.closest<HTMLElement>('[data-task-group]')?.dataset.taskGroup||'';
  if(g.active){suppressClick=true;setTimeout(()=>{suppressClick=false;},0);}
  options.active(false);
  if(save&&g.active&&(group!==g.group||keys.some((key,i)=>key!==g.keys[i])))options.commit(g.entry.dataset.homeKey!,keys,group);
 }
 function reposition(){
  const g=gesture;if(!g?.active)return;
  g.ghost!.style.transform=`translate(${g.x-g.left}px,${g.y-g.top}px)`;
  const contains=(r:{left:number;right:number;top:number;bottom:number})=>g.x>=r.left&&g.x<=r.right&&g.y>=r.top&&g.y<=r.bottom;
  const section=[...root.querySelectorAll<HTMLElement>('[data-task-group]')].find(s=>contains(s.getBoundingClientRect()));
  // Use layout slots, not the animated faces of neighboring tiles, for hit testing.
  const target=section&&[...section.querySelectorAll<HTMLElement>('[data-home-key]')].find(el=>{
   const r=el.getBoundingClientRect(),css=getComputedStyle(el).transform,matrix=new DOMMatrixReadOnly(css==='none'?undefined:css);
   return contains({left:r.left-matrix.m41,right:r.right-matrix.m41,top:r.top-matrix.m42,bottom:r.bottom-matrix.m42});
  });
  if(!section||!root.contains(section)||section.dataset.pinned!==g.entry.dataset.pinned)return;
  if(g.entry.dataset.source==='shared'&&section.dataset.taskGroup)return;
  if(section.dataset.taskGroup!==g.group&&g.entry.dataset.groupEditable!=='true')return;
  if(target===g.entry)return;
  const list=section.querySelector<HTMLElement>('.home-group-list')!;
  if(!target&&section===g.entry.closest('[data-task-group]'))return;
  const before=new Map(rows().map(e=>[e,e.getBoundingClientRect()]));
  if(target){
   const all=rows(),from=all.indexOf(g.entry),to=all.indexOf(target);
   if(from<to)target.after(g.entry);else target.before(g.entry);
  }else list.append(g.entry);
  for(const [el,rect] of before){
   el.getAnimations().forEach(a=>a.cancel());
   if(el===g.entry||matchMedia('(prefers-reduced-motion: reduce)').matches)continue;
   const next=el.getBoundingClientRect(),x=rect.x-next.x,y=rect.y-next.y;
   if(x||y)el.animate([{transform:`translate(${x}px,${y}px)`},{transform:'translate(0,0)'}],{duration:180,easing:'ease-out'});
  }
 }
 function scroll(){
  const g=gesture;if(!g?.active)return;
  const edge=72,dy=g.y<edge?-Math.min(14,(edge-g.y)/5):g.y>innerHeight-edge?Math.min(14,(g.y-innerHeight+edge)/5):0;
  if(dy){window.scrollBy(0,dy);reposition();}
  g.frame=requestAnimationFrame(scroll);
 }
 function lift(g:Gesture){
  if(gesture!==g||!g.entry.isConnected||!options.enabled()){finish();return;}
  g.active=true;const rect=g.entry.getBoundingClientRect();g.left=g.startX-rect.left;g.top=g.startY-rect.top;
  const ghost=g.entry.cloneNode(true) as HTMLElement;
  for(const el of [ghost,...ghost.querySelectorAll('*')])for(const attribute of [...el.attributes])if(attribute.name==='id'||attribute.name.startsWith('data-'))el.removeAttribute(attribute.name);
  ghost.querySelectorAll('.paper-frame').forEach(frame=>frame.remove());
  ghost.classList.add('task-drag-preview');ghost.setAttribute('aria-hidden','true');ghost.inert=true;ghost.style.width=rect.width+'px';
  g.ghost=ghost;document.body.append(ghost);g.entry.classList.add('is-reordering');document.body.classList.add('task-reordering');root.setPointerCapture(g.pointer);reposition();scroll();
 }
 root.addEventListener('pointerdown',event=>{
  if(gesture||!options.enabled()||!event.isPrimary||event.button!==0)return;
  const target=event.target as HTMLElement,entry=target.closest<HTMLElement>('[data-reorderable=true]');
  if(!entry||target.closest('button,a,input,select,textarea,summary'))return;
  const g:Gesture={pointer:event.pointerId,pointerType:event.pointerType,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,entry,parent:entry.parentElement!,next:entry.nextElementSibling,group:entry.closest<HTMLElement>('[data-task-group]')!.dataset.taskGroup!,keys:rows().map(e=>e.dataset.homeKey!),timer:0,active:false,left:0,top:0,frame:0};
  gesture=g;options.active(true);g.timer=window.setTimeout(()=>lift(g),event.pointerType==='mouse'?120:220);
 });
 document.addEventListener('pointermove',event=>{
  const g=gesture;if(!g||event.pointerId!==g.pointer)return;g.x=event.clientX;g.y=event.clientY;
  if(!g.active){
   const distance=Math.hypot(g.x-g.startX,g.y-g.startY);
   if(g.pointerType==='mouse'&&distance>=4){event.preventDefault();clearTimeout(g.timer);lift(g);}
   else if(distance>12)finish();
   return;
  }
  event.preventDefault();reposition();
 });
 // Prevent scrolling only after the hold. Changing touch-action mid-gesture is too late.
 root.addEventListener('touchmove',event=>{if(gesture?.active)event.preventDefault();},{passive:false});
 document.addEventListener('pointerup',event=>{if(gesture?.pointer===event.pointerId)finish(true);});
 document.addEventListener('pointercancel',event=>{if(gesture?.pointer===event.pointerId)finish();});
 // Touch initially captures the tile child. Its capture loss bubbles here when
 // lift transfers control to the feed; only losing the feed's own capture cancels.
 root.addEventListener('lostpointercapture',event=>{if(event.target===root&&gesture?.pointer===event.pointerId&&!root.hasPointerCapture(event.pointerId))finish();});
 root.addEventListener('dragstart',event=>{if(gesture)event.preventDefault();});
 root.addEventListener('contextmenu',event=>{if(gesture)event.preventDefault();});
 root.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopImmediatePropagation();}},{capture:true});
 document.addEventListener('keydown',event=>{if(gesture&&event.key==='Escape'){event.preventDefault();finish();}});
 window.addEventListener('blur',()=>finish());window.addEventListener('hashchange',()=>finish());
 document.addEventListener('visibilitychange',()=>{if(document.hidden)finish();});
 return ()=>finish();
}
