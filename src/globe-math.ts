import type {Country,Region} from './geography';
export type Elevation={width:number;height:number;step:number;south:number;west:number;values:Int16Array};
export function decodeElevation(data:{width:number;height:number;step:number;south:number;west:number;values:string}):Elevation{
 const raw=Uint8Array.from(atob(data.values),c=>c.charCodeAt(0)),view=new DataView(raw.buffer),values=new Int16Array(data.width*data.height);
 if(raw.length!==values.length*2)throw new Error('The elevation grid is incomplete.');
 for(let i=0;i<values.length;i++)values[i]=view.getInt16(i*2,true);
 return {...data,values};
}
export const wrapLongitude=(lon:number)=>((lon+180)%360+360)%360-180;
export function elevationAt(grid:Elevation,lon:number,lat:number){
 const x=(wrapLongitude(lon)-grid.west)/grid.step,y=(Math.max(-90,Math.min(90,lat))-grid.south)/grid.step;
 const a=Math.floor(x),b=Math.floor(y),tx=x-a,ty=y-b;
 const get=(i:number,j:number)=>grid.values[Math.min(grid.height-1,j)*grid.width+Math.min(grid.width-1,i)];
 return (get(a,b)*(1-tx)+get(a+1,b)*tx)*(1-ty)+(get(a,b+1)*(1-tx)+get(a+1,b+1)*tx)*ty;
}
// About 25× vertical exaggeration makes real mountain ranges legible on a globe.
export const reliefRadius=(meters:number)=>1+Math.max(0,meters)*25/6371000;
export function spherePoint(lon:number,lat:number,radius=1):[number,number,number]{const a=lon*Math.PI/180,b=lat*Math.PI/180;return [radius*Math.cos(b)*Math.sin(a),radius*Math.sin(b),radius*Math.cos(b)*Math.cos(a)];}
export function sphereCoordinate(x:number,y:number,z:number):[number,number]{return [Math.atan2(x,z)*180/Math.PI,Math.asin(Math.max(-1,Math.min(1,y/Math.hypot(x,y,z))))*180/Math.PI];}
export type GlobeView={lon:number;lat:number;distance:number};
export const DEFAULT_GLOBE_VIEW:GlobeView={lon:18,lat:18,distance:3.65};
export function globeRegionView(region:Region):GlobeView{
 const centers:Partial<Record<Region,[number,number,number]>>={Africa:[20,2,2.65],Asia:[95,30,3],Europe:[20,51,2.2],'North America':[-105,40,2.9],'South America':[-60,-20,2.65],Oceania:[160,-14,3],Micronesia:[158,10,2.5],Polynesia:[-150,-10,2.7],Melanesia:[157,-12,2.4],Caribbean:[-72,18,1.7],'Central America':[-86,15,1.7]};
 const c=centers[region];return c?{lon:c[0],lat:c[1],distance:c[2]}:{...DEFAULT_GLOBE_VIEW};
}
export function globeCountryView(c:Country):GlobeView{
 const [lon,lat]=c.center,points=c.rings.flat().filter(p=>Math.abs(wrapLongitude(p[0]-lon))<80&&Math.abs(p[1]-lat)<65);
 const extent=Math.max(.2,...points.map(p=>Math.hypot(wrapLongitude(p[0]-lon)*Math.cos(lat*Math.PI/180),p[1]-lat)));
 return {lon,lat:Math.max(-85,Math.min(85,lat)),distance:Math.min(3.2,1.045+extent*.036)};
}
export function smallCountry(c:Country){return c.rings.reduce((sum,ring)=>sum+Math.abs(ring.reduce((area,p,i)=>{const q=ring[(i+1)%ring.length];return area+p[0]*q[1]-q[0]*p[1];},0)/2),0)<.4;}
/** Test the source polygons directly: antialiased texture pixels can mix country IDs at a border. */
export function containsCoordinate(country:Country,lon:number,lat:number){
 let inside=false;
 for(const ring of country.rings)for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const [ax,ay]=ring[i],[bx,by]=ring[j];
  if((ay>lat)!==(by>lat)&&lon<(bx-ax)*(lat-ay)/(by-ay)+ax)inside=!inside;
 }
 return inside;
}

/** The two nearest 30° columns/rows cover a close view, including the date line. */
export function globeDetailKeys(lon:number,lat:number){
 const x=(wrapLongitude(lon)+180)/30,y=(90-Math.max(-90,Math.min(90,lat)))/30,col=Math.floor(x),row=Math.min(5,Math.floor(y));
 const columns=[col,(col+(x-col<.5?-1:1)+12)%12],rows=[row,row+(y-row<.5?-1:1)].filter(r=>r>=0&&r<6);
 return rows.flatMap(r=>columns.map(c=>`${c}-${r}`));
}
