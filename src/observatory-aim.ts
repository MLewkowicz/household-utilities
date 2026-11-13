const TAU=Math.PI*2;
export const telescopeElevation=.14;
export const wrapAngle=(angle:number)=>((angle+Math.PI)%TAU+TAU)%TAU-Math.PI;
/** Project a safe, fixed-elevation telescope direction into the camera's plane. */
export function projectedAim(yaw:number,azimuth:number,elevation:number){
 const relative=yaw-azimuth;
 return {x:Math.cos(telescopeElevation)*Math.sin(relative),y:Math.sin(telescopeElevation)*Math.cos(elevation)-Math.cos(telescopeElevation)*Math.cos(relative)*Math.sin(elevation)};
}
/** Every screen direction has a heading; the barrel never dips into the roof. */
export function headingForCard(x:number,y:number,azimuth:number,elevation:number){
 if(Math.hypot(x,y)<.001)return azimuth;
 const wanted=Math.atan2(y,x);
 const error=(yaw:number)=>{const p=projectedAim(yaw,azimuth,elevation);return Math.abs(wrapAngle(Math.atan2(p.y,p.x)-wanted));};
 let best=0;
 for(let i=1;i<128;i++)if(error(i*TAU/128)<error(best))best=i*TAU/128;
 let lo=best-TAU/128,hi=best+TAU/128;
 for(let i=0;i<32;i++){const a=lo+(hi-lo)/3,b=hi-(hi-lo)/3;if(error(a)<error(b))hi=b;else lo=a;}
 return (lo+hi)/2;
}
/** Interpolate between adjacent cards, including across the circular seam. */
export function headingAlongCards(headings:number[],position:number){
 const index=Math.floor(position),fraction=position-index,n=headings.length;
 const a=headings[((index%n)+n)%n],b=headings[(((index+1)%n)+n)%n];
 return a+wrapAngle(b-a)*fraction;
}
