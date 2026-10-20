// Horizontal gestures begin on the handle; vertical movement remains page scroll.
export function bindCompletionSwipe(root: HTMLElement, complete: (id:string)=>void, dragging:(active:boolean)=>void) {
 let gesture: {button:HTMLButtonElement;track:HTMLElement;id:number;x:number;y:number;progress:number}|null=null;
 function reset() {
  if(gesture){gesture.track.style.setProperty('--progress','0');gesture.button.releasePointerCapture?.(gesture.id);}
  gesture=null;dragging(false);
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
  if(Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)){reset();return;}
  const width=gesture.track.clientWidth-gesture.button.offsetWidth-8;
  gesture.progress=Math.max(0,Math.min(1,dx/Math.max(1,width)));
  gesture.track.style.setProperty('--progress',String(gesture.progress));
 });
 root.addEventListener('pointerup',event=>{
  if(!gesture||event.pointerId!==gesture.id)return;
  const {button,progress}=gesture;reset();if(progress>=.9)complete(button.dataset.swipeComplete!);
 });
 root.addEventListener('pointercancel',reset);
 root.addEventListener('lostpointercapture',()=>{if(gesture){gesture=null;dragging(false);}});
 root.addEventListener('click',event=>{
  const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-swipe-complete]');
  if(button&&!button.disabled&&event.detail===0)complete(button.dataset.swipeComplete!);
 });
}
