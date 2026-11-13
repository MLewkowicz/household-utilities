import {esc} from './ui';
import {sizeSilhouette,silhouetteCredit} from './size-silhouettes';
import type {Question} from './trivia-model';
import {clamp,fitSizeBoxes,formatSize,referenceMeters,sizeVerdict,zoomAt,type Camera,type Point,type SizeBox} from './size-game-math';
import {finishSizeFeedback,sizeSoundEnabled,startSizeChime,toggleSizeSound} from './size-feedback';

export type SizeView={reference:Point;target:Point;camera:Camera;width:number;height:number};
type Options={value:number;revealed:boolean;busy:boolean;points?:number;animate?:boolean;view?:SizeView;onChange:(value:number)=>void;onView:(view:SizeView)=>void};
const icons={fit:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',sound:'<path d="M11 5 6 9H3v6h3l5 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',resize:'<path d="M7 4h13v13M20 4 4 20"/>',zoomIn:'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6M7 10h6m-3-3v6"/>',zoomOut:'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6M7 10h6"/>'};
const icon=(name:keyof typeof icons)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const dimensionLabel=(dimension:string)=>dimension.replace(/^full silhouette /,'').replace(/^projected /,'');
function measureDetails(q:Question){
 return `<details class="size-credits"><summary>Measurements & artwork</summary><p>${esc(q.explanation||'').replaceAll('\n','<br>')}</p><p>${(q.sources||[]).filter(s=>s.startsWith('https://')).map((s,i)=>`<a href="${esc(s)}" target="_blank" rel="noopener noreferrer">Source ${i+1}</a>`).join(' · ')}</p><p>${silhouetteCredit(q.reference!.shape)}<br>${silhouetteCredit(q.target!.shape)}</p></details>`;
}
export function sizeGameMarkup(q:Question,revealed:boolean,value:number,points=0){
 const target=q.target!,reference=q.reference!,verdict=revealed?sizeVerdict(value,Number(q.answer)):undefined,m=referenceMeters(reference.measure);
 const object=(role:'reference'|'target')=>`<div class="scale-object ${role}" tabindex="0" role="button" aria-label="Move ${esc(q[role]!.name)}" aria-describedby="scale-instructions">${sizeSilhouette(q[role]!.shape)}</div>`;
 return `<div class="size-workspace ${revealed?'is-revealed':''}"><div class="scale-stage" tabindex="0" role="group" aria-label="Size comparison grid" aria-describedby="scale-instructions"><div class="size-ground" aria-hidden="true"></div><div class="size-world">${object('reference')}${object('target')}${revealed?`<div class="scale-correct">${sizeSilhouette(target.shape)}</div>`:''}</div>${!revealed?`<div class="scale-handle" tabindex="0" role="slider" aria-label="Size of ${esc(target.name)}" aria-describedby="scale-instructions" aria-valuemin="${q.bounds![0]}" aria-valuemax="${q.bounds![1]}" aria-valuenow="${value}">${icon('resize')}</div>`:''}<div class="size-view-tools"><button type="button" data-size-zoom="in" aria-label="Zoom in" title="Zoom in">${icon('zoomIn')}</button><button type="button" data-size-zoom="out" aria-label="Zoom out" title="Zoom out">${icon('zoomOut')}</button><button type="button" data-size-fit aria-label="Fit both silhouettes" title="Fit both silhouettes">${icon('fit')}</button></div><span class="size-zoom-label" aria-hidden="true">100%</span>${revealed?'<div class="size-legend"><span class="size-guess-key">Your guess</span><span class="size-actual-key">Actual size</span></div>':''}</div><div class="size-caption"><span><i class="size-swatch reference"></i><span><strong>${esc(reference.name)}</strong>${reference.qualifier?`<span class="size-qualifier">${esc(reference.qualifier)}</span>`:''}<small>${esc(reference.measure||'Reference')} · ${esc(dimensionLabel(reference.dimension))}</small></span></span><span><i class="size-swatch target"></i><span><strong>${esc(target.name)}</strong>${target.qualifier?`<span class="size-qualifier">${esc(target.qualifier)}</span>`:''}<small>${esc(dimensionLabel(target.dimension))}${revealed?'':' · resize this'}</small></span></span></div>${revealed?`<div class="trivia-feedback size-result" role="status" aria-label="${esc(verdict!.detail)}. ${points} of 200 points."><div class="size-score"><strong><span data-size-score>${points}</span><small> / 200</small></strong><span>points</span></div><div class="size-verdict"><h3>${esc(verdict!.title)}</h3><p>${esc(verdict!.detail)}</p><div class="size-measurements"><span>Your guess <b>${m?formatSize(m*value):value.toFixed(2)+'× reference'}</b></span><span>Actual size <b>${m?formatSize(m*Number(q.answer)):Number(q.answer).toFixed(2)+'× reference'}</b></span></div></div><div class="size-score-track" aria-hidden="true"><i style="--score:${points/2}%"></i></div></div>`:`<div class="size-adjust"><button type="button" data-size-adjust="smaller" aria-label="Make target smaller">− <span>Smaller</span></button><p id="scale-instructions">Drag to move · pull ↗ to resize<br><span>Scroll or pinch to zoom.</span><span class="sr-only">Use arrow keys on a silhouette to move it, or on the resize handle to change its size. Shift makes larger steps. Use plus or minus on the grid to zoom, and 0 to fit both.</span></p><button type="button" data-size-adjust="larger" aria-label="Make target larger"><span>Larger</span> +</button></div>`}${revealed?'<p id="scale-instructions" class="sr-only">Drag the grid to pan. Scroll or pinch to zoom. Use Fit both silhouettes to return to the comparison.</p>':''}</div>${revealed?measureDetails(q):''}`;
}
export function sizeSoundMarkup(){return `<button type="button" class="size-sound" data-size-sound aria-label="Sound ${sizeSoundEnabled()?'on':'off'}" aria-pressed="${sizeSoundEnabled()}" title="Toggle reveal sound">${icon('sound')}</button>`;}

/** One camera for the whole grid. Moving or zooming never changes the answer. */
export function mountSizeGame(root:HTMLElement,q:Question,options:Options){
 const stage=root.querySelector<HTMLElement>('.scale-stage')!,world=stage.querySelector<HTMLElement>('.size-world')!,ground=stage.querySelector<HTMLElement>('.size-ground')!;
 const reference=world.querySelector<HTMLElement>('.reference')!,target=world.querySelector<HTMLElement>('.target')!,correct=world.querySelector<HTMLElement>('.scale-correct'),handle=stage.querySelector<HTMLElement>('.scale-handle');
 const controller=new AbortController(),signal=controller.signal;
 const bounds=(object:HTMLElement)=>{const svg=object.querySelector('svg')!,g=svg.querySelector<SVGGraphicsElement>('.profile-shape')||svg;const b=(g as SVGGraphicsElement).getBBox();return {x:b.x,y:b.y,width:b.width||100,height:b.height||100};};
 const refBounds=bounds(reference),targetBounds=bounds(target),base=200;
 let ratio=clamp(Number.isFinite(options.value)?options.value:1,q.bounds![0],q.bounds![1]);
 let positions={reference:{x:0,y:0},target:{x:base*(refBounds.width+targetBounds.width)/200+65,y:0}},camera:Camera={x:0,y:0,zoom:1},animation=0,stopped=false;
 const validView=options.view&&[options.view.reference?.x,options.view.reference?.y,options.view.target?.x,options.view.target?.y,options.view.camera?.x,options.view.camera?.y,options.view.camera?.zoom].every(n=>Number.isFinite(n)&&Math.abs(n)<1e7)&&options.view.camera.zoom>=.002&&options.view.camera.zoom<=40;
 if(validView)positions={reference:{...options.view!.reference},target:{...options.view!.target}};
 const box=(role:'reference'|'target',value=ratio):SizeBox=>{const b=role==='reference'?refBounds:targetBounds,scale=base*(role==='reference'?1:value)/100,p=positions[role];return {x:p.x-b.width*scale/2,y:p.y,width:b.width*scale,height:b.height*scale};};
 const boxes=()=>[box('reference'),box('target'),...(options.revealed?[box('target',Number(q.answer))]:[])];
 const snapshot=():SizeView=>({...structuredClone(positions),camera:{...camera},width:stage.clientWidth,height:stage.clientHeight});
 const remember=()=>options.onView(snapshot());
 function paintObject(object:HTMLElement,b:ReturnType<typeof bounds>,role:'reference'|'target',value=ratio){
  const p=box(role,value),svg=object.querySelector('svg')!;object.style.left=`${p.x}px`;object.style.top=`${p.y-p.height}px`;object.style.width=`${p.width}px`;object.style.height=`${p.height}px`;
  svg.setAttribute('viewBox',`${b.x} ${b.y} ${b.width} ${b.height}`);svg.style.width='100%';svg.style.height='100%';
 }
 function paint(){
  world.style.transform=`translate(${camera.x}px,${camera.y}px) scale(${camera.zoom})`;
  paintObject(reference,refBounds,'reference');paintObject(target,targetBounds,'target');if(correct)paintObject(correct,targetBounds,'target',Number(q.answer));
  const spacing=40*camera.zoom*Math.pow(10,Math.ceil(Math.log10(.5/camera.zoom)));stage.style.setProperty('--grid-size',`${spacing}px`);stage.style.setProperty('--grid-x',`${camera.x}px`);stage.style.setProperty('--grid-y',`${camera.y}px`);
  ground.style.top=`${camera.y}px`;
  if(handle){const b=box('target'),x=(b.x+b.width)*camera.zoom+camera.x,y=(b.y-b.height)*camera.zoom+camera.y;const offscreen=x<22||x>stage.clientWidth-22||y<22||y>stage.clientHeight-22;let hx=clamp(x,22,stage.clientWidth-22),hy=clamp(y,22,stage.clientHeight-22);if(hx>stage.clientWidth-66&&hy<142)hx=stage.clientWidth-76;handle.style.left=`${hx}px`;handle.style.top=`${hy}px`;handle.classList.toggle('is-offscreen',offscreen);handle.setAttribute('aria-disabled',String(options.busy));handle.title=offscreen?'Zoom out or fit both to see the whole silhouette':'Drag to resize';handle.setAttribute('aria-valuenow',String(ratio));handle.setAttribute('aria-valuetext',`${Number(ratio.toPrecision(3))} times the reference`);}
  stage.querySelector('.size-zoom-label')!.textContent=`${Math.round(camera.zoom*100)}%`;
  stage.dataset.zoom=String(camera.zoom);target.dataset.ratio=String(ratio);
 }
 function fit(){camera=fitSizeBoxes(boxes(),stage.clientWidth,stage.clientHeight);paint();remember();}
 function setRatio(value:number){if(options.revealed||options.busy)return;ratio=clamp(value,q.bounds![0],q.bounds![1]);options.onChange(ratio);paint();}
 if(validView&&Math.abs(options.view!.width-stage.clientWidth)<2&&Math.abs(options.view!.height-stage.clientHeight)<2&&!options.revealed){camera={...options.view!.camera};paint();}else fit();
 let dimensions=`${stage.clientWidth}:${stage.clientHeight}`;
 const observer=new ResizeObserver(()=>{if(!stage.clientWidth||!stage.clientHeight)return;const next=`${stage.clientWidth}:${stage.clientHeight}`;if(next!==dimensions){dimensions=next;fit();}});observer.observe(stage);
 const point=(e:{clientX:number;clientY:number}):Point=>{const r=stage.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
 const pointers=new Map<number,Point>();
 type Drag={kind:'pan'|'reference'|'target'|'resize';id:number;start:Point;view:SizeView;ratio:number};
 let drag:Drag|undefined,pinch:{distance:number;center:Point;camera:Camera}|undefined;
 const pinchData=()=>{const [a,b]=[...pointers.values()];return {distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},camera:{...camera}};};
 stage.addEventListener('pointerdown',e=>{
  if(e.button!==0||(e.target as Element).closest('.size-view-tools')||options.busy)return;
  const p=point(e);pointers.set(e.pointerId,p);stage.setPointerCapture(e.pointerId);e.preventDefault();
  if(pointers.size>=2){pinch=pinchData();drag=undefined;return;}
  const el=(e.target as Element).closest<HTMLElement>('.scale-object,.scale-handle');
  const kind=el===handle?'resize':el===reference?'reference':el===target?'target':'pan';
  (el||stage).focus({preventScroll:true});drag={kind,id:e.pointerId,start:p,view:snapshot(),ratio};stage.classList.add('is-dragging');
 },{signal});
 stage.addEventListener('pointermove',e=>{
  if(!pointers.has(e.pointerId))return;const p=point(e);pointers.set(e.pointerId,p);
  if(pinch&&pointers.size>=2){const next=pinchData();camera=zoomAt(pinch.camera,pinch.center,pinch.camera.zoom*next.distance/pinch.distance);camera.x+=next.center.x-pinch.center.x;camera.y+=next.center.y-pinch.center.y;paint();return;}
  if(!drag||drag.id!==e.pointerId)return;
  const dx=p.x-drag.start.x,dy=p.y-drag.start.y;
  if(drag.kind==='pan')camera={...drag.view.camera,x:drag.view.camera.x+dx,y:drag.view.camera.y+dy};
  else if(drag.kind==='resize'){
   const width=base*drag.ratio*targetBounds.width/100*camera.zoom,height=base*drag.ratio*targetBounds.height/100*camera.zoom;
   const delta=(dx*width/2-dy*height)/Math.max(.01,width*width/4+height*height);setRatio(drag.ratio*(1+delta));
  }else{const start=drag.view[drag.kind];positions[drag.kind]={x:start.x+dx/camera.zoom,y:start.y+dy/camera.zoom};if(Math.abs(positions[drag.kind].y*camera.zoom)<9)positions[drag.kind].y=0;}
  paint();
 },{signal});
 function end(e:PointerEvent){
  if(!pointers.has(e.pointerId))return;
  if(e.type==='pointercancel'&&drag){positions={reference:drag.view.reference,target:drag.view.target};camera=drag.view.camera;setRatio(drag.ratio);}
  pointers.delete(e.pointerId);drag=undefined;pinch=undefined;stage.classList.remove('is-dragging');
  if(stage.hasPointerCapture(e.pointerId))stage.releasePointerCapture(e.pointerId);
  if(pointers.size===1){const [id,start]=[...pointers.entries()][0];drag={kind:'pan',id,start,view:snapshot(),ratio};}
  paint();remember();
 }
 for(const event of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(event,end as EventListener,{signal});
 stage.addEventListener('wheel',e=>{e.preventDefault();const factor=e.deltaMode===1?16:e.deltaMode===2?stage.clientHeight:1;camera=zoomAt(camera,point(e),camera.zoom*Math.exp(-clamp(e.deltaY*factor,-200,200)*.004));paint();remember();},{passive:false,signal});
 stage.addEventListener('keydown',e=>{
  const el=e.target as HTMLElement,arrow=['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'].includes(e.key);
  if(el===handle&&(arrow||['Home','End'].includes(e.key))){e.preventDefault();setRatio(e.key==='Home'?q.bounds![0]:e.key==='End'?q.bounds![1]:ratio*Math.pow(e.shiftKey?1.2:1.025,['ArrowUp','ArrowRight'].includes(e.key)?1:-1));remember();return;}
  if(arrow&&(el===reference||el===target)){e.preventDefault();const role=el===reference?'reference':'target',step=(e.shiftKey?24:6)/camera.zoom;positions[role].x+=(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0);positions[role].y+=(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0);paint();remember();return;}
  if(el!==stage)return;
  if(['+','=','-','0',...['ArrowUp','ArrowRight','ArrowDown','ArrowLeft']].includes(e.key)){e.preventDefault();if(e.key==='0')fit();else if(arrow){camera.x+=(e.key==='ArrowRight'?-24:e.key==='ArrowLeft'?24:0);camera.y+=(e.key==='ArrowDown'?-24:e.key==='ArrowUp'?24:0);}else camera=zoomAt(camera,{x:stage.clientWidth/2,y:stage.clientHeight/2},camera.zoom*(e.key==='-'?1/1.25:1.25));paint();remember();}
 },{signal});
 root.addEventListener('click',e=>{
  const button=(e.target as Element).closest<HTMLElement>('button');if(!button)return;
  if(button.hasAttribute('data-size-fit'))fit();
  if(button.dataset.sizeZoom){camera=zoomAt(camera,{x:stage.clientWidth/2,y:stage.clientHeight/2},camera.zoom*(button.dataset.sizeZoom==='in'?1.3:1/1.3));paint();remember();}
  if(button.dataset.sizeAdjust)setRatio(ratio*(button.dataset.sizeAdjust==='larger'?1.06:1/1.06));
  if(button.hasAttribute('data-size-sound')){const enabled=toggleSizeSound();button.setAttribute('aria-pressed',String(enabled));button.setAttribute('aria-label',`Sound ${enabled?'on':'off'}`);}
 },{signal});
 let stopChime=()=>{},settleReveal=()=>{};
 if(options.revealed&&options.animate){
  const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches,score=root.querySelector<HTMLElement>('[data-size-score]')!,total=root.querySelector<HTMLElement>('[data-size-total]'),points=options.points||0,finalTotal=Number(total?.textContent)||0,duration=reduced?0:850,start=performance.now();
  stopChime=startSizeChime(duration/1000);correct?.classList.add('is-arriving');
  const track=root.querySelector<HTMLElement>('.size-score-track i')!;
  score.textContent='0';if(total)total.textContent=String(finalTotal-points);track.style.width='0';
  settleReveal=()=>{cancelAnimationFrame(animation);score.textContent=String(points);if(total)total.textContent=String(finalTotal);track.style.width=`${points/2}%`;if(correct)paintObject(correct,targetBounds,'target',Number(q.answer));};
  const step=(now:number)=>{if(stopped)return;const progress=duration?clamp((now-start)/duration,0,1):1,eased=1-Math.pow(1-progress,3),value=Math.round(points*eased);score.textContent=String(value);if(total)total.textContent=String(finalTotal-points+value);track.style.width=`${points/2*eased}%`;if(correct)paintObject(correct,targetBounds,'target',ratio+(Number(q.answer)-ratio)*eased);if(progress<1)animation=requestAnimationFrame(step);else{root.querySelector('.size-score')?.classList.add('is-landed');finishSizeFeedback();}};
  animation=requestAnimationFrame(step);
 }
 function cleanup(){stopped=true;cancelAnimationFrame(animation);stopChime();observer.disconnect();controller.abort();pointers.clear();}
 const route=location.hash;window.addEventListener('hashchange',()=>{if(location.hash!==route){stopChime();settleReveal();}},{signal});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){stopChime();settleReveal();}},{signal});
 return cleanup;
}
