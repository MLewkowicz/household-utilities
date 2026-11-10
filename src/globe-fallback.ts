import {countryPath,countryView,regionView,inRegion,pacificRegion,type Country,type View} from './geography';
import {countryTapSequence} from './globe-borders';
import type {GlobeState,GlobeSurface,GlobeStyle} from './globe';
/** A plain, unlabeled map keeps the quiz playable when WebGL is unavailable. */
export function mountGlobeFallback(host:HTMLElement,countries:Country[],onSelect:(c:Country,reveal?:boolean)=>void,initialStyle:GlobeStyle='terrain'):GlobeSurface{
 let state:GlobeState={region:'World',correct:[],revealed:[],playing:false},view:View=regionView('World');
 host.innerHTML='<svg id="geo-map" role="group" aria-label="Unlabeled world map. Use Tab and Enter to choose a country." xmlns="http://www.w3.org/2000/svg"><g id="geo-land"></g></svg><p class="globe-fallback-notice">3D graphics are unavailable. You can still play on this map.</p>';
 const svg=host.querySelector<SVGSVGElement>('svg')!,land=svg.querySelector('g')!;
 const setView=(v:View)=>{view=v;svg.setAttribute('viewBox',v.join(' '));};
 let paintedRegion='';
 function paint(){const pacific=pacificRegion(state.region);if(paintedRegion===state.region){land.querySelectorAll<SVGPathElement>('[data-country]').forEach(p=>{const id=p.dataset.country!;p.classList.toggle('is-correct',state.correct.includes(id));p.classList.toggle('is-revealed',state.revealed.includes(id));p.classList.toggle('is-selected',state.selected===id);});return;}paintedRegion=state.region;land.innerHTML=countries.map((c,i)=>`<path d="${countryPath(c,pacific)}" fill-rule="evenodd" vector-effect="non-scaling-stroke" data-country="${c.id}" class="atlas-country ${inRegion(c,state.region)?'':'outside-region'} ${state.correct.includes(c.id)?'is-correct':''} ${state.revealed.includes(c.id)?'is-revealed':''} ${state.selected===c.id?'is-selected':''}" ${inRegion(c,state.region)?`tabindex="0" role="button" aria-label="Unnamed country or territory ${i+1}"`:'aria-hidden="true"'}/>`).join('');}
 svg.dataset.style=initialStyle;const taps=countryTapSequence();
 const abort=new AbortController(),signal=abort.signal;
 const select=(target:EventTarget|null,event?:MouseEvent)=>{const id=(target as Element).closest('[data-country]')?.getAttribute('data-country'),c=countries.find(c=>c.id===id);if(c&&inRegion(c,state.region))onSelect(c,event?taps.tap(c.id,event.clientX,event.clientY,event.timeStamp,event.detail):false);};
 svg.addEventListener('click',e=>select(e.target,e),{signal});svg.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(e.target);}},{signal});
 function zoom(factor:number){const [x,y,w,h]=view,nw=Math.max(8,Math.min(1500,w*factor)),nh=h*nw/w;setView([x+(w-nw)/2,y+(h-nh)/2,nw,nh]);}
 svg.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY>0?1.1:.9);},{signal,passive:false});
 setView(view);paint();return {async setStyle(style){svg.dataset.style=style;taps.reset();},setState(s){state=s;paint();},reset(){taps.reset();setView(regionView(state.region));},focusCountry(c){setView(countryView(c,pacificRegion(state.region)));},zoom,entrance(){},setActive(){},destroy(){abort.abort();host.replaceChildren();}};
}
