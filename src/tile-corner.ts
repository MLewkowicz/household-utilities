import {esc} from './ui';
// Interaction stays in HTML; one SVG frame owns every visible paper edge.
export const cornerTab=(label:string)=>`<summary class="chore-corner-tab" aria-label="Details for ${esc(label)}" title="Lift corner for details & actions"></summary>`;

export function paperGeometry(width:number,height:number,radius=12){
 const x=1,y=1,w=Math.max(32,width-1),h=Math.max(32,height-1),r=Math.min(radius,(w-x)/2,(h-y)/2),c=26;
 const outer=`M${x+r} ${y}H${w-r}Q${w} ${y} ${w} ${y+r}V${h-c}C${w-4} ${h-12} ${w-12} ${h-4} ${w-c} ${h}H${x+r}Q${x} ${h} ${x} ${h-r}V${y+r}Q${x} ${y} ${x+r} ${y}Z`;
 const curl=`M${w} ${h-c}C${w-8} ${h-21} ${w-15} ${h-20} ${w-21} ${h-21}C${w-20} ${h-15} ${w-21} ${h-8} ${w-c} ${h}`;
 return {outer,curl,flap:curl+`C${w-12} ${h-4} ${w-4} ${h-12} ${w} ${h-c}Z`};
}

export function initPaperTiles(){
 const frames=new Map<HTMLElement,SVGSVGElement>();let queued=false,serial=0;
 function draw(tile:HTMLElement,svg:SVGSVGElement){
  // Layout dimensions exclude bulletin rotation and browser transforms.
  const width=tile.offsetWidth,height=tile.offsetHeight;if(!width||!height)return;
  const radius=tile.matches('.bulletin-note')?1:parseFloat(getComputedStyle(tile).borderRadius)||12;
  const {outer,curl,flap}=paperGeometry(width,height,radius);
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
  svg.querySelectorAll('[data-paper-shape]').forEach(p=>p.setAttribute('d',outer));
  svg.querySelector('.paper-curl')!.setAttribute('d',flap);svg.querySelector('.paper-crease')!.setAttribute('d',curl);
 }
 const resize=new ResizeObserver(entries=>{for(const {target} of entries){const tile=target as HTMLElement,svg=frames.get(tile);if(svg)draw(tile,svg);}});
 function sync(){
  queued=false;
  for(const [tile,svg] of frames)if(!tile.isConnected){resize.unobserve(tile);frames.delete(tile);svg.remove();}
  document.querySelectorAll<HTMLElement>('.chore-card,.expense-card,.bulletin-note').forEach(tile=>{
   if(frames.has(tile)||!tile.querySelector('.chore-corner-tab'))return;
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),id='paper-texture-'+(++serial);
   svg.classList.add('paper-frame');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
   svg.innerHTML=`<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2=".3"><stop stop-color="#fff9e4" stop-opacity=".14"/><stop offset=".4" stop-opacity="0"/><stop offset="1" stop-color="#846b44" stop-opacity=".06"/></linearGradient></defs><path class="paper-fill" data-paper-shape/><path class="paper-texture" data-paper-shape fill="url(#${id})"/><path class="paper-curl"/><path class="paper-crease"/><path class="paper-outline" data-paper-shape/>`;
   tile.classList.add('paper-tile');tile.prepend(svg);frames.set(tile,svg);draw(tile,svg);resize.observe(tile);
  });
 }
 const mutations=new MutationObserver(records=>{
  if(queued||!records.some(r=>!(r.target instanceof SVGElement)))return;
  queued=true;queueMicrotask(sync);
 });
 mutations.observe(document.body,{childList:true,subtree:true});sync();
 return ()=>{mutations.disconnect();resize.disconnect();frames.clear();};
}
