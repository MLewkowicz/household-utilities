import type {Country} from './geography';
export type BorderEdge={a:number[];b:number[];owners:number[]};
/** Draw a shared source edge once, regardless of which direction each country uses. */
export function countryBorderEdges(countries:Pick<Country,'rings'>[]):BorderEdge[]{
 const edges=new Map<string,BorderEdge>();
 countries.forEach((country,owner)=>{for(const ring of country.rings)for(let i=0;i<ring.length;i++){
  const a=ring[i],b=ring[(i+1)%ring.length];
  if(a[0]===b[0]&&a[1]===b[1]||Math.abs(a[0]-b[0])>180)continue;
  const first=a.join(','),second=b.join(','),key=first<second?`${first}|${second}`:`${second}|${first}`;
  const edge=edges.get(key);if(edge){if(!edge.owners.includes(owner))edge.owners.push(owner);}else edges.set(key,{a,b,owners:[owner]});
 }});
 return [...edges.values()];
}

/** Consecutive taps must hit the same country and position; dragging resets the gesture. */
export function countryTapSequence(){
 let last:{id:string;x:number;y:number;at:number;count:number}|undefined;
 return {reset(){last=undefined;},tap(id:string,x:number,y:number,at:number,nativeCount=0){
  const count=last&&last.id===id&&(at-last.at<500||nativeCount===last.count+1)&&Math.hypot(x-last.x,y-last.y)<14?last.count+1:1;
  last=count===3?undefined:{id,x,y,at,count};return count===3;
 }};
}
