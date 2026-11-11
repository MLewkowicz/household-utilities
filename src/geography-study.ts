import {inPool,pacificRegion,projectCenter,type Country,type CountryScope,type Region} from './geography';
import {mountGlobeFallback} from './globe-fallback';
import {esc} from './ui';

/** A lightweight labeled atlas, independent of the player's round and 3D renderer. */
export function mountStudyMap(host:HTMLElement,countries:Country[],onSelect:(country:Country)=>void){
 const countryById=new Map(countries.map(c=>[c.id,c]));
 let region:Region='World',scope:CountryScope='countries',selected:Country|undefined;
 const surface=mountGlobeFallback(host,countries,c=>{if(c){focus(c);onSelect(c);}},'paper');
 const map=host.querySelector<SVGSVGElement>('svg')!;
 map.id='geo-study-map';map.setAttribute('aria-label','Labeled study map. Drag to pan, pinch or use the zoom buttons to zoom.');
 for(const group of map.querySelectorAll('[id]'))group.id='study-'+group.id;
 host.querySelector('.globe-fallback-notice')?.remove();
 const labels=document.createElement('div');labels.className='atlas-study-labels';host.append(labels);
 function layout(){
  const matrix=map.getScreenCTM(),rect=host.getBoundingClientRect();if(!matrix||!rect.width||!rect.height)return;
  for(const path of map.querySelectorAll<SVGElement>('[data-country]')){const country=countryById.get(path.dataset.country||'');if(country)path.setAttribute('aria-label',country.name);}
  const used:{x:number;y:number;w:number;h:number}[]=[];
  const pool=countries.filter(c=>inPool(c,region,scope)).sort((a,b)=>Number(b.id===selected?.id)-Number(a.id===selected?.id)||a.name.localeCompare(b.name));
  labels.innerHTML=pool.map(c=>{
   const [mx,my]=projectCenter(c,pacificRegion(region)),point=new DOMPoint(mx,my).matrixTransform(matrix),x=point.x-rect.left,y=point.y-rect.top;
   if(x<0||x>rect.width||y<0||y>rect.height)return '';
   const w=Math.min(rect.width-8,c.name.length*6.8+12),h=20;
   for(const offset of [0,22,-22,44,-44,66,-66,88,-88]){
    const box={x:Math.max(4,Math.min(rect.width-w-4,x+8)),y:Math.max(4,Math.min(rect.height-h-4,y-10+offset)),w,h};
    if(used.some(b=>box.x<b.x+b.w+3&&box.x+box.w+3>b.x&&box.y<b.y+b.h+2&&box.y+box.h+2>b.y))continue;
    used.push(box);const dx=box.x-x,dy=box.y+h/2-y;
    return `<i style="left:${x}px;top:${y}px;width:${Math.hypot(dx,dy)}px;transform:rotate(${Math.atan2(dy,dx)}rad)"></i><span data-study-label="${c.id}" style="left:${box.x}px;top:${box.y}px;max-width:${w}px">${esc(c.name)}</span>`;
   }
   return '';
  }).join('');
 }
 function update(){surface.setState({region,scope,correct:[],revealed:[],selected:selected?.id,playing:false});layout();}
 function focus(c:Country){selected=c;update();surface.focusCountry(c);layout();}
 const observer=new MutationObserver(layout);observer.observe(map,{attributes:true,attributeFilter:['viewBox']});
 const resize=new ResizeObserver(layout);resize.observe(host);
 return {setRegion(next:Region,nextScope:CountryScope){region=next;scope=nextScope;selected=undefined;update();surface.reset();layout();},focus,zoom(factor:number){surface.zoom(factor);layout();},reset(){selected=undefined;update();surface.reset();layout();},destroy(){observer.disconnect();resize.disconnect();surface.destroy();}};
}
