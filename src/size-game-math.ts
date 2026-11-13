export type Point={x:number;y:number};
export type Camera=Point&{zoom:number};
export type SizeBox=Point&{width:number;height:number};
export const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
export function zoomAt(camera:Camera,point:Point,zoom:number):Camera{
 const next=clamp(zoom,.002,40),factor=next/camera.zoom;
 return {zoom:next,x:point.x-(point.x-camera.x)*factor,y:point.y-(point.y-camera.y)*factor};
}
/** Fit visible ink, not the square SVG canvases around it. */
export function fitSizeBoxes(boxes:SizeBox[],width:number,height:number):Camera{
 const left=Math.min(...boxes.map(b=>b.x)),right=Math.max(...boxes.map(b=>b.x+b.width));
 const top=Math.min(...boxes.map(b=>b.y-b.height)),bottom=Math.max(...boxes.map(b=>b.y));
 const padding=width<500?36:64,zoom=clamp(Math.min((width-padding*2)/Math.max(1,right-left),(height-100)/Math.max(1,bottom-top)),.002,3);
 return {zoom,x:width/2-(left+right)/2*zoom,y:(height+30)/2-(top+bottom)/2*zoom};
}
export function sizeVerdict(guess:number,actual:number){
 const difference=(guess/actual-1)*100,off=Math.abs(difference);
 const percent=off<1?'<1':Math.round(off).toLocaleString('en-US');
 return {difference,off,title:off<.5?'Spot on!':off<5?'Beautifully judged.':off<15?'So close.':off<35?'Getting a feel for it.':'A different scale.',detail:off<.5?'Right on the mark':`${percent}% too ${difference>0?'big':'small'}`};
}
export function formatSize(meters:number){
 if(!Number.isFinite(meters)||meters<=0)return '—';
 const [value,unit]=meters>=1000?[meters/1000,'km']:meters>=1?[meters,'m']:meters>=.01?[meters*100,'cm']:meters>=.001?[meters*1000,'mm']:[meters*1e6,'µm'];
 return `${Number(value.toPrecision(3)).toLocaleString('en-US',{maximumFractionDigits:4})} ${unit}`;
}
export function referenceMeters(measure:string|undefined){
 const match=measure?.replaceAll(',','').match(/^\s*([\d.]+)\s*(km|cm|mm|µm|m)\b/);
 return match?Number(match[1])*({km:1000,m:1,cm:.01,mm:.001,'µm':.000001}[match[2]]||1):undefined;
}
