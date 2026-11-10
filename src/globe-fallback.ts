import {countryPath,countryView,regionView,inPool,pacificRegion,projectCenter,type Country,type View} from './geography';
import {smallCountry} from './globe-math';
import {countryTapSequence} from './globe-borders';
import type {GlobeState,GlobeSurface,GlobeStyle} from './globe';
/** A plain map retains pinch, pan, island targets and learning when WebGL is unavailable. */
export function mountGlobeFallback(host:HTMLElement,countries:Country[],onSelect:(c:Country,reveal?:boolean)=>void,initialStyle:GlobeStyle='terrain'):GlobeSurface{
 let state:GlobeState={region:'World',correct:[],revealed:[],playing:false},view:View=regionView('World'),paintedRegion='';
 host.innerHTML='<svg id="geo-map" role="group" aria-label="Unlabeled world map. Drag to pan, pinch to zoom. Use Tab and Enter to choose a country." xmlns="http://www.w3.org/2000/svg"><g id="geo-land"></g><g id="geo-islands"></g></svg><span class="globe-country-label" hidden></span><p class="globe-fallback-notice">3D graphics are unavailable. You can still play on this map.</p>';
 const svg=host.querySelector<SVGSVGElement>('svg')!,land=svg.querySelector('#geo-land')!,islands=svg.querySelector('#geo-islands')!,label=host.querySelector<HTMLElement>('.globe-country-label')!;
 const tiny=countries.filter(smallCountry),taps=countryTapSequence(),abort=new AbortController(),signal=abort.signal;
 function layout(){
  const scale=svg.getScreenCTM()?.a||1;islands.querySelectorAll('circle').forEach(c=>c.setAttribute('r',String(9/scale)));
  const country=countries.find(c=>c.id===state.label);label.hidden=!country;
  if(country){const [x,y]=projectCenter(country,pacificRegion(state.region)),m=svg.getScreenCTM(),r=host.getBoundingClientRect();if(m){const p=new DOMPoint(x,y).matrixTransform(m);label.style.left=`${p.x-r.left}px`;label.style.top=`${p.y-r.top}px`;label.textContent=country.name;label.hidden=p.x<r.left||p.x>r.right||p.y<r.top||p.y>r.bottom;}}
 }
 const setView=(v:View)=>{view=v;svg.setAttribute('viewBox',v.join(' '));layout();};
 function paint(){
  const pacific=pacificRegion(state.region),key=state.region+state.scope;
  if(paintedRegion!==key){paintedRegion=key;land.innerHTML=countries.map((c,i)=>`<path d="${countryPath(c,pacific)}" fill-rule="evenodd" vector-effect="non-scaling-stroke" data-country="${c.id}" class="atlas-country ${inPool(c,state.region,state.scope)?'':'outside-region'}" ${inPool(c,state.region,state.scope)?`tabindex="0" role="button" aria-label="Unnamed country ${i+1}"`:'aria-hidden="true"'}/>`).join('');
   islands.innerHTML=tiny.filter(c=>inPool(c,state.region,state.scope)).map(c=>{const [x,y]=projectCenter(c,pacific);return `<circle cx="${x}" cy="${y}" data-island="${c.id}" class="atlas-country atlas-island" vector-effect="non-scaling-stroke" aria-hidden="true"/>`;}).join('');
  }
  host.querySelectorAll<SVGElement>('[data-country],[data-island]').forEach(p=>{const id=p.dataset.country||p.dataset.island!;p.classList.toggle('is-correct',state.correct.includes(id));p.classList.toggle('is-revealed',state.revealed.includes(id));p.classList.toggle('is-selected',state.selected===id);});layout();
 }
 function select(target:EventTarget|null,event?:MouseEvent){const el=(target as Element).closest<SVGElement>('[data-country],[data-island]'),c=countries.find(c=>c.id===(el?.dataset.country||el?.dataset.island));if(c&&inPool(c,state.region,state.scope))onSelect(c,event?taps.tap(c.id,event.clientX,event.clientY,event.timeStamp,event.detail):false);}
 let moved=false,pinch=0,drag:{x:number;y:number;view:View}|undefined;const pointers=new Map<number,{x:number;y:number}>();
 svg.addEventListener('click',e=>{if(!moved)select(e.target,e);},{signal});svg.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(e.target);}},{signal});
 function zoom(factor:number){taps.reset();const [x,y,w,h]=view,nw=Math.max(2,Math.min(1500,w*factor)),nh=h*nw/w;setView([x+(w-nw)/2,y+(h-nh)/2,nw,nh]);}
 svg.addEventListener('wheel',e=>{e.preventDefault();zoom(Math.exp(Math.max(-.4,Math.min(.4,e.deltaY*.0018))));},{signal,passive:false});
 svg.addEventListener('pointerdown',e=>{if(e.button!==0)return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});drag={x:e.clientX,y:e.clientY,view:[...view]};moved=pointers.size>1;if(pointers.size===2){const [a,b]=[...pointers.values()];pinch=Math.hypot(a.x-b.x,a.y-b.y);}},{signal});
 svg.addEventListener('pointermove',e=>{
  if(!pointers.has(e.pointerId)||!drag)return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size===2){const [a,b]=[...pointers.values()],distance=Math.hypot(a.x-b.x,a.y-b.y);if(distance&&pinch)zoom(pinch/distance);pinch=distance;moved=true;return;}
  const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>5)moved=true;
  if(moved){svg.setPointerCapture(e.pointerId);taps.reset();const scale=svg.getScreenCTM()?.a||1;setView([drag.view[0]-dx/scale,drag.view[1]-dy/scale,drag.view[2],drag.view[3]]);}
 },{signal});
 function end(e:PointerEvent){pointers.delete(e.pointerId);if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);if(pointers.size){const p=[...pointers.values()][0];drag={...p,view:[...view]};moved=true;}else drag=undefined;}
 svg.addEventListener('pointerup',end,{signal});svg.addEventListener('pointercancel',e=>{moved=true;taps.reset();end(e);},{signal});
 const resize=new ResizeObserver(layout);resize.observe(host);svg.dataset.style=initialStyle;setView(view);paint();
 return {async setStyle(style){svg.dataset.style=style;taps.reset();},setState(s){state=s;paint();},reset(){taps.reset();setView(regionView(state.region));},focusCountry(c){setView(countryView(c,pacificRegion(state.region)));},zoom,entrance(){},setActive(){layout();},destroy(){resize.disconnect();abort.abort();host.replaceChildren();}};
}
