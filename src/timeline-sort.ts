/** Pointer, touch and keyboard sorting for the five event cards. */
export function mountTimelineSort(list:HTMLOListElement,onChange:(order:string[])=>void){
 const controller=new AbortController(),options={signal:controller.signal};
 const status=list.parentElement!.querySelector<HTMLElement>('.timeline-status')!;
 const scroller=list.closest<HTMLElement>('#trivia-page')!;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const cards=()=>Array.from(list.querySelectorAll<HTMLElement>(':scope > [data-card]'));
 const order=()=>cards().map(card=>card.dataset.card!);
 const button=(card:HTMLElement)=>card.querySelector<HTMLButtonElement>('.timeline-tile')!;
 let picked:HTMLElement|undefined,original:string[]=[],pointer:{id:number;x:number;y:number;startX:number;startY:number;card:HTMLElement;offsetX:number;offsetY:number}|undefined;
 let preview:HTMLElement|undefined,frame=0,lastTime=0,suppressClick=false,clickTimer=0;
 const announce=(message:string)=>{status.textContent=message;};
 function sync(){cards().forEach((card,i)=>button(card).setAttribute('aria-label',`${card.querySelector('.timeline-label')!.textContent}. Position ${i+1} of ${cards().length}.`));}
 function pick(card:HTMLElement){
  picked=card;original=order();card.classList.add('is-picked');button(card).setAttribute('aria-pressed','true');
  announce(`${card.querySelector('.timeline-label')!.textContent} picked up. Use arrow keys to move, then Space to place. Escape cancels.`);
 }
 function place(cancel=false){
  if(!picked)return;
  const card=picked,focused=card.contains(document.activeElement);picked=undefined;card.classList.remove('is-picked');button(card).setAttribute('aria-pressed','false');
  if(cancel){const all=cards();for(const id of original)list.append(all.find(item=>item.dataset.card===id)!);onChange(order());sync();if(focused)button(card).focus({preventScroll:true});}
  announce(cancel?'Move cancelled.':`${card.querySelector('.timeline-label')!.textContent} placed at position ${cards().indexOf(card)+1} of ${cards().length}.`);
 }
 function move(card:HTMLElement,to:number){
  const all=cards(),from=all.indexOf(card);to=Math.max(0,Math.min(all.length-1,to));if(to===from)return;
  // Finish any previous slide before measuring the next set of positions.
  for(const item of all)item.getAnimations().forEach(animation=>animation.cancel());
  const before=all.map(item=>item.getBoundingClientRect());
  list.insertBefore(card,to>from?all[to].nextSibling:all[to]);sync();onChange(order());
  if(!reduced.matches)all.forEach((item,i)=>{if(item===card&&preview)return;const after=item.getBoundingClientRect();item.animate([{transform:`translate(${before[i].left-after.left}px,${before[i].top-after.top}px)`},{transform:'translate(0,0)'}],{duration:160,easing:'ease-out'});});
  if(!preview){button(card).focus({preventScroll:true});button(card).scrollIntoView({block:'nearest',inline:'nearest'});announce(`Position ${to+1} of ${all.length}.`);}
 }
 function position(){
  if(!pointer||!preview)return;
  preview.style.left=`${pointer.x-pointer.offsetX}px`;preview.style.top=`${pointer.y-pointer.offsetY}px`;
  const vertical=getComputedStyle(list).flexDirection==='column',coordinate=vertical?pointer.y:pointer.x;
  // Use layout positions, unaffected by the neighboring tiles' slide animations.
  const all=cards(),bounds=list.getBoundingClientRect();let next=0,distance=Infinity;
  all.forEach((card,i)=>{const center=vertical?bounds.top+card.offsetTop+card.offsetHeight/2:bounds.left+card.offsetLeft+card.offsetWidth/2,d=Math.abs(coordinate-center);if(d<distance){distance=d;next=i;}});
  move(pointer.card,next);
 }
 function tick(time:number){
  if(!pointer||!preview)return;
  const dt=Math.min(32,lastTime?time-lastTime:16);lastTime=time;
  const bounds=scroller.getBoundingClientRect(),edge=64;
  const velocity=pointer.y<bounds.top+edge?-Math.min(1,(bounds.top+edge-pointer.y)/edge):pointer.y>bounds.bottom-edge?Math.min(1,(pointer.y-bounds.bottom+edge)/edge):0;
  if(velocity)scroller.scrollTop+=velocity*dt*.65;
  position();frame=requestAnimationFrame(tick);
 }
 function finish(cancel=false){
  const active=pointer;pointer=undefined;cancelAnimationFrame(frame);lastTime=0;
  if(!preview)return;
  preview.remove();preview=undefined;active?.card.classList.remove('is-dragging');list.classList.remove('is-sorting');
  if(active&&list.hasPointerCapture(active.id))list.releasePointerCapture(active.id);
  place(cancel);active&&button(active.card).focus({preventScroll:true});
  suppressClick=true;clearTimeout(clickTimer);clickTimer=window.setTimeout(()=>{suppressClick=false;},0);
 }
 list.addEventListener('pointerdown',event=>{
  if(!event.isPrimary||event.button!==0||pointer)return;
  const tile=(event.target as Element).closest<HTMLButtonElement>('.timeline-tile');
  const card=tile?.closest<HTMLElement>('[data-card]');if(!card)return;
  const rect=card.getBoundingClientRect();pointer={id:event.pointerId,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,card,offsetX:event.clientX-rect.left,offsetY:event.clientY-rect.top};
 },options);
 window.addEventListener('pointermove',event=>{
  if(!pointer||event.pointerId!==pointer.id)return;
  pointer.x=event.clientX;pointer.y=event.clientY;
  if(!preview&&Math.hypot(pointer.x-pointer.startX,pointer.y-pointer.startY)<6)return;
  event.preventDefault();
  if(!preview){
   if(picked)place();pick(pointer.card);
   const rect=pointer.card.getBoundingClientRect();preview=pointer.card.cloneNode(true) as HTMLElement;
   preview.removeAttribute('data-card');preview.classList.remove('is-picked');preview.classList.add('timeline-drag-preview');preview.setAttribute('aria-hidden','true');preview.inert=true;
   preview.style.width=`${rect.width}px`;preview.style.height=`${rect.height}px`;list.append(preview);
   pointer.card.classList.add('is-dragging');list.classList.add('is-sorting');list.setPointerCapture(pointer.id);frame=requestAnimationFrame(tick);
  }
  position();
 },{...options,passive:false});
 window.addEventListener('pointerup',event=>{if(event.pointerId===pointer?.id)finish();},options);
 window.addEventListener('pointercancel',event=>{if(event.pointerId===pointer?.id)finish(true);},options);
 list.addEventListener('lostpointercapture',event=>{if(event.target===list&&event.pointerId===pointer?.id)finish(true);},options);
 list.addEventListener('dragstart',event=>event.preventDefault(),options);
 list.addEventListener('click',event=>{
  if(suppressClick){event.preventDefault();return;}
  const card=(event.target as Element).closest<HTMLElement>('[data-card]');if(!card)return;
  if(picked){const selected=picked;move(selected,cards().indexOf(card));place();}else pick(card);
 },options);
 list.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();finish(true);place(true);return;}
  if(!picked||preview)return;
  const direction=['ArrowLeft','ArrowUp'].includes(event.key)?-1:['ArrowRight','ArrowDown'].includes(event.key)?1:0;
  if(direction||event.key==='Home'||event.key==='End'){
   event.preventDefault();move(picked,event.key==='Home'?0:event.key==='End'?cards().length-1:cards().indexOf(picked)+direction);
  }
 },options);
 const cancel=()=>{finish(true);place(true);};
 window.addEventListener('blur',cancel,options);window.addEventListener('resize',cancel,options);window.addEventListener('hashchange',cancel,options);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();},options);
 sync();
 return ()=>{finish();place();controller.abort();clearTimeout(clickTimer);};
}
