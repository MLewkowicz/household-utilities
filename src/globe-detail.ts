import * as T from 'three';
import assets from '../public/globe/manifest.json';
import {globeDetailKeys,type GlobeView} from './globe-math';
type Tile={west:number;north:number;size:number;gutter:number;pixels:number;color:string;normal:string};
type Slot={key:string;color:T.Texture;normal:T.Texture;tile:Tile;loadedAt:number};
/** A bounded set of local terrain tiles supplies native ETOPO1 detail only at close zoom. */
export function createGlobeDetail(anisotropy:number,requestDraw:()=>void){
 const tiles=(assets as unknown as {detailTiles:Record<string,Tile>}).detailTiles;
 const placeholder=new T.DataTexture(new Uint8Array([128,128,255,255]),1,1);placeholder.needsUpdate=true;
 const reduce=matchMedia('(prefers-reduced-motion: reduce)');
 const uniforms:Record<string,T.IUniform>={terrainDetailBlend:{value:0}};
 for(let i=0;i<4;i++){
  uniforms[`terrainDetailColor${i}`]={value:placeholder};uniforms[`terrainDetailNormal${i}`]={value:placeholder};
  uniforms[`terrainDetailBounds${i}`]={value:new T.Vector4(0,0,0,0)};uniforms[`terrainDetailOpacity${i}`]={value:0};
 }
 let slots:Slot[]=[],wanted:string[]=[],controller:AbortController|undefined,disposed=false,pending=0,blend=0;
 const url=(file:string)=>new URL(`./globe/${file}`,document.baseURI).href;
 async function load(file:string,signal:AbortSignal,color=false){
  const response=await fetch(url(file),{signal});if(!response.ok)throw new Error('Detail texture unavailable');
  const bitmap=await createImageBitmap(await response.blob(),{imageOrientation:'flipY',premultiplyAlpha:'none',colorSpaceConversion:'none'});
  if(signal.aborted||disposed){bitmap.close();throw new Error('Detail loading cancelled');}
  const texture=new T.Texture(bitmap);texture.colorSpace=color?T.SRGBColorSpace:T.NoColorSpace;texture.anisotropy=anisotropy;texture.needsUpdate=true;return texture;
 }
 function release(slot:Slot){for(const t of [slot.color,slot.normal]){t.dispose();(t.image as ImageBitmap).close();}}
 function sync(){
  for(let i=0;i<4;i++){
   const slot=slots[i];uniforms[`terrainDetailColor${i}`].value=slot?.color||placeholder;uniforms[`terrainDetailNormal${i}`].value=slot?.normal||placeholder;
   // Bounds use UV coordinates; the image includes two native samples of gutter.
   const t=slot?.tile,g=t?t.gutter/t.pixels*t.size:0;
   (uniforms[`terrainDetailBounds${i}`].value as T.Vector4).set(t?(t.west-g+180)/360:0,t?(t.north-t.size-g+90)/180:0,t?(t.size+2*g)/360:0,t?(t.size+2*g)/180:0);
  }
  requestDraw();
 }
 function update(view:GlobeView,settled:boolean){
  for(let i=0;i<4;i++){const opacity=slots[i]?(reduce.matches?1:Math.min(1,(performance.now()-slots[i].loadedAt)/350)):0;uniforms[`terrainDetailOpacity${i}`].value=opacity;if(slots[i]&&opacity<1)requestDraw();}
  blend=T.MathUtils.smoothstep(2.0-view.distance,0,.45);uniforms.terrainDetailBlend.value=blend;
  if(!settled)return;
  if(!blend){if(!wanted.length&&!slots.length&&!controller)return;controller?.abort();controller=undefined;wanted=[];slots.forEach(release);slots=[];sync();return;}
  const keys=globeDetailKeys(view.lon,view.lat).filter(k=>tiles?.[k]);
  if(keys.join()===wanted.join())return;
  wanted=keys;controller?.abort();controller=new AbortController();const signal=controller.signal;
  for(const slot of slots)if(!keys.includes(slot.key))release(slot);
  slots=slots.filter(s=>keys.includes(s.key));sync();
  for(const key of keys){if(slots.some(s=>s.key===key))continue;pending++;
   const tile=tiles[key];void Promise.allSettled([load(tile.color,signal,true),load(tile.normal,signal)]).then(results=>{
    pending--;
    if(disposed||signal.aborted||results.some(r=>r.status==='rejected')){for(const r of results)if(r.status==='fulfilled'){r.value.dispose();(r.value.image as ImageBitmap).close();}return;}
    slots.push({key,tile,loadedAt:performance.now(),color:(results[0] as PromiseFulfilledResult<T.Texture>).value,normal:(results[1] as PromiseFulfilledResult<T.Texture>).value});sync();
   });
  }
 }
 const declarations=Array.from({length:4},(_,i)=>`uniform sampler2D terrainDetailColor${i}; uniform sampler2D terrainDetailNormal${i}; uniform vec4 terrainDetailBounds${i}; uniform float terrainDetailOpacity${i};`).join('\n')+'\nuniform float terrainDetailBlend;';
 const sample=(kind:'color'|'normal')=>Array.from({length:4},(_,i)=>`{
  vec4 bounds=terrainDetailBounds${i};
  vec2 uv=(vMapUv-bounds.xy)/max(bounds.zw,vec2(0.000001));
  if(terrainDetailBlend>0.0 && bounds.z>0.0 && uv.x>=0.0005 && uv.x<=0.9995 && uv.y>=0.0005 && uv.y<=0.9995){
   float feather=smoothstep(0.0005,0.0011,min(min(uv.x,1.0-uv.x),min(uv.y,1.0-uv.y)))*terrainDetailBlend*terrainDetailOpacity${i};
   ${kind==='color'?`diffuseColor.rgb=mix(diffuseColor.rgb,texture2D(terrainDetailColor${i},uv).rgb,feather);`:`normal=normalize(mix(normal,normalize(normalMatrix*(texture2D(terrainDetailNormal${i},uv).xyz*2.0-1.0)),feather));`}
  }
 }`).join('\n');
 return {uniforms,declarations,colorShader:sample('color'),normalShader:sample('normal'),update,diagnostics:()=>({keys:slots.map(s=>s.key),pending,blend}),suspend(){controller?.abort();controller=undefined;wanted=[];slots.forEach(release);slots=[];sync();},destroy(){disposed=true;controller?.abort();slots.forEach(release);slots=[];placeholder.dispose();}};
}
