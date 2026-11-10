import * as T from 'three';
import {createGlobeDetail} from './globe-detail';
import {countryBorderEdges} from './globe-borders';
import {LineSegments2} from 'three/addons/lines/LineSegments2.js';
import {LineSegmentsGeometry} from 'three/addons/lines/LineSegmentsGeometry.js';
import {LineMaterial} from 'three/addons/lines/LineMaterial.js';
import elevationData from './earth-elevation.json';
import assets from '../public/globe/manifest.json';
import {decodeElevation,elevationAt,reliefRadius,spherePoint} from './globe-math';
import {inPool,type Country} from './geography';
import type {GlobeState,GlobeStyle} from './globe';

/** Cartographic outlines stay readable over ridges; the far hemisphere is explicitly clipped. */
function borderMaterial(width:number,vertexColors=false){
 const material=new LineMaterial({linewidth:width,vertexColors,depthTest:false,depthWrite:false,alphaToCoverage:true});
 material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying float globeFacing;').replace('void main() {',`void main() {
   vec3 p=(position.y<0.5)?instanceStart:instanceEnd;
   vec3 world=(modelMatrix*vec4(p,1.0)).xyz;
   vec3 center=(modelMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
   globeFacing=dot(normalize(world-center),normalize(cameraPosition-world));`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float globeFacing;').replace('void main() {','void main() {\nif(globeFacing<=0.001)discard;');
 };
 material.customProgramCacheKey=()=>'globe-outline-v3';return material;
}

/** Precomputed albedo and slope normals keep expensive raster work out of the browser. */
export async function createGlobeTerrain(renderer:T.WebGLRenderer,countries:Country[],requestDraw:()=>void,initialStyle:GlobeStyle){
 const memory=(navigator as Navigator&{deviceMemory?:number}).deviceMemory;
 const detailed=renderer.capabilities.maxTextureSize>=8192&&innerWidth>720&&(!memory||memory>4),anisotropy=renderer.capabilities.getMaxAnisotropy();
 let color:T.Texture|undefined,normal:T.Texture|undefined,loading:Promise<void>|undefined,destroyed=false,style=initialStyle,version=0;
 async function loadTopography(){
  if(color)return;if(loading)return loading;
  loading=(async()=>{
   const loader=new T.TextureLoader(),loaded=await Promise.allSettled([
    loader.loadAsync(new URL(`./globe/${assets.textures[detailed?'color-8k':'color-4k']}`,document.baseURI).href),
    loader.loadAsync(new URL(`./globe/${assets.textures[detailed?'normal-4k':'normal-2k']}`,document.baseURI).href)
   ]);
   if(destroyed||loaded.some(r=>r.status==='rejected')){for(const r of loaded)if(r.status==='fulfilled')r.value.dispose();throw new Error('Globe textures could not load.');}
   color=(loaded[0] as PromiseFulfilledResult<T.Texture>).value;normal=(loaded[1] as PromiseFulfilledResult<T.Texture>).value;color.colorSpace=T.SRGBColorSpace;
   for(const texture of [color,normal]){texture.anisotropy=anisotropy;texture.wrapS=T.RepeatWrapping;}
  })();try{await loading;}finally{loading=undefined;}
 }
 if(style==='terrain')await loadTopography();
 const grid=decodeElevation(elevationData),segments=detailed?960:640,rows=segments/2;
 const raised=new Float32Array((segments+1)*(rows+1)*3),smooth=new Float32Array(raised.length),uvs=new Float32Array((segments+1)*(rows+1)*2),indices=new Uint32Array(segments*rows*6);
 for(let j=0;j<=rows;j++)for(let i=0;i<=segments;i++){
  const lon=-180+i/segments*360,lat=90-j/rows*180,n=j*(segments+1)+i;
  raised.set(spherePoint(lon,lat,reliefRadius(elevationAt(grid,lon,lat))),n*3);smooth.set(spherePoint(lon,lat),n*3);uvs.set([i/segments,1-j/rows],n*2);
 }
 for(let j=0;j<rows;j++)for(let i=0;i<segments;i++){const a=j*(segments+1)+i,b=a+segments+1;indices.set([a,b,a+1,b,b+1,a+1],(j*segments+i)*6);}
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(raised.slice(),3));geometry.setAttribute('uv',new T.BufferAttribute(uvs,2));geometry.setIndex(new T.BufferAttribute(indices,1));geometry.computeVertexNormals();
 // A smooth paper sphere needs far fewer triangles than the raised terrain.
 const paperGeometry=new T.SphereGeometry(1,256,128,-Math.PI/2);
 const W=detailed?4096:2048,H=W/2,canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
 const ctx=canvas.getContext('2d')!,overlay=new T.CanvasTexture(canvas);overlay.colorSpace=T.SRGBColorSpace;overlay.anisotropy=anisotropy;
 const paths=countries.map(c=>{const p=new Path2D();for(const ring of c.rings){ring.forEach(([lon,lat],i)=>{const x=(lon+180)/360*W,y=(90-lat)/180*H;i?p.lineTo(x,y):p.moveTo(x,y);});p.closePath();}return p;});
 const detail=createGlobeDetail(anisotropy,requestDraw);
 const material=new T.MeshStandardMaterial({map:color,normalMap:normal,normalMapType:T.ObjectSpaceNormalMap,roughness:.92,metalness:0});
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,detail.uniforms);shader.uniforms.quizOverlay={value:overlay};
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D quizOverlay;\n'+detail.declarations).replace('#include <map_fragment>','#include <map_fragment>\n'+detail.colorShader+'\nvec4 quizColor=texture2D(quizOverlay,vMapUv);\ndiffuseColor.rgb=mix(diffuseColor.rgb,quizColor.rgb,quizColor.a);').replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\n'+detail.normalShader);
 };
 material.customProgramCacheKey=()=>'globe-terrain-detail-v2';
 const paperTexture=new T.DataTexture(new Uint8Array([231,222,199,255]),1,1);paperTexture.colorSpace=T.SRGBColorSpace;paperTexture.needsUpdate=true;
 const paperMaterial=new T.MeshStandardMaterial({map:paperTexture,roughness:1,metalness:0});
 paperMaterial.onBeforeCompile=shader=>{
  shader.uniforms.quizOverlay={value:overlay};shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D quizOverlay;').replace('#include <map_fragment>',`#include <map_fragment>
   float grain=fract(sin(dot(floor(vMapUv*vec2(8192.0,4096.0)),vec2(12.9898,78.233)))*43758.5453);
   diffuseColor.rgb*=0.992+0.016*grain;
   vec4 quizColor=texture2D(quizOverlay,vMapUv);diffuseColor.rgb=mix(diffuseColor.rgb,quizColor.rgb,quizColor.a);`);
 };
 paperMaterial.customProgramCacheKey=()=>'globe-paper-v1';
 const earth=new T.Mesh(geometry,material);
 function onSurface(x:number,y:number,positions:Float32Array){
  const i=Math.min(segments-1,Math.max(0,Math.floor(x))),j=Math.min(rows-1,Math.max(0,Math.floor(y))),tx=x-i,ty=y-j,a=j*(segments+1)+i,b=a+segments+1;
  const vertices=tx+ty<=1?[a,b,a+1]:[b,b+1,a+1],weights=tx+ty<=1?[1-tx-ty,ty,tx]:[1-tx,tx+ty-1,1-ty];
  const point=[0,0,0];for(let k=0;k<3;k++)for(let n=0;n<3;n++)point[n]+=positions[vertices[k]*3+n]*weights[k];return point;
 }
 const edges=countryBorderEdges(countries),raisedLines:number[]=[],smoothLines:number[]=[],ranges:{start:number;count:number}[]=[];
 for(const {a,b} of edges){
  const start=raisedLines.length,x0=(a[0]+180)/360*segments,y0=(90-a[1])/180*rows,x1=(b[0]+180)/360*segments,y1=(90-b[1])/180*rows,times=[0,1];
  for(const [v0,v1] of [[x0,x1],[y0,y1],[x0+y0,x1+y1]])if(Math.abs(v1-v0)>1e-9){for(let k=Math.floor(Math.min(v0,v1))+1;k<Math.max(v0,v1);k++)times.push((k-v0)/(v1-v0));}
  times.sort((a,b)=>a-b);
  for(let n=1;n<times.length;n++){
   if(times[n]-times[n-1]<1e-8)continue;
   const points=[times[n-1],times[n]].map(t=>{const x=x0+(x1-x0)*t,y=y0+(y1-y0)*t;return {raised:onSurface(x,y,raised),smooth:onSurface(x,y,smooth)};});
   if(Math.hypot(...points[0].smooth.map((v,i)=>v-points[1].smooth[i]))<1e-8)continue;
   for(const p of points){raisedLines.push(...p.raised);smoothLines.push(...p.smooth);}
  }
  ranges.push({start,count:raisedLines.length-start});
 }
 const terrainPositions=new Float32Array(raisedLines),paperPositions=new Float32Array(smoothLines),borderColors=new Float32Array(raisedLines.length);
 const borderGeometry=new LineSegmentsGeometry().setPositions(terrainPositions.slice()).setColors(borderColors),outlines=borderMaterial(1.25,true),borders=new LineSegments2(borderGeometry,outlines);borders.renderOrder=20;
 const selectedMaterial=borderMaterial(2),selectedBorder=new LineSegments2(new LineSegmentsGeometry(),selectedMaterial);selectedBorder.visible=false;selectedBorder.renderOrder=21;
 let state:GlobeState={region:'World',correct:[],revealed:[],playing:false};
 function paint(next:GlobeState){
  state=next;ctx.clearRect(0,0,W,H);const paper=style==='paper';
  countries.forEach((c,i)=>{
   const correct=state.correct.includes(c.id),revealed=state.revealed.includes(c.id),selected=state.selected===c.id;
   if(!inPool(c,state.region,state.scope)){ctx.fillStyle=paper?'#a49b8960':'#152a40a6';ctx.fill(paths[i],'evenodd');}
   if(correct){ctx.fillStyle=paper?'#66ad828c':'#38bb7c80';ctx.fill(paths[i],'evenodd');}
   else if(revealed){ctx.fillStyle=paper?'#c48a3f66':'#d7a34f66';ctx.fill(paths[i],'evenodd');}
   else if(selected){ctx.fillStyle=paper?'#c5975240':'#ffe1a120';ctx.fill(paths[i],'evenodd');}
  });
  edges.forEach((edge,i)=>{
   const owners=edge.owners.map(n=>countries[n]),correct=owners.some(c=>state.correct.includes(c.id)),revealed=owners.some(c=>state.revealed.includes(c.id)),inside=owners.some(c=>inPool(c,state.region,state.scope));
   const tint=new T.Color(correct?(paper?'#276b48':'#9feab1'):revealed?(paper?'#986326':'#ecc17b'):paper?(inside?'#625845':'#a59b87'):(inside?'#294e4b':'#29404b')),{start,count}=ranges[i];
   for(let n=start;n<start+count;n+=3){borderColors[n]=tint.r;borderColors[n+1]=tint.g;borderColors[n+2]=tint.b;}
  });
  overlay.needsUpdate=true;(borderGeometry.attributes.instanceColorStart as T.InterleavedBufferAttribute).data.needsUpdate=true;
  const index=countries.findIndex(c=>c.id===state.selected);selectedBorder.visible=index>=0;
  if(index>=0){const positions=style==='paper'?paperPositions:terrainPositions,selection:number[]=[];
   edges.forEach((edge,i)=>{if(edge.owners.includes(index)){const {start,count}=ranges[i];for(let n=start;n<start+count;n++)selection.push(positions[n]);}});
   selectedBorder.geometry.dispose();selectedBorder.geometry=new LineSegmentsGeometry().setPositions(selection);selectedMaterial.color.set(state.correct.includes(state.selected!)?(paper?'#276b48':'#a0f4ae'):paper?'#976025':'#ffe4a2');
  }
 }
 function applyStyle(next:GlobeStyle){
  const previous=style;style=next;const paper=style==='paper';
  earth.geometry=paper?paperGeometry:geometry;earth.material=paper?paperMaterial:material;const lines=(borderGeometry.attributes.instanceStart as T.InterleavedBufferAttribute).data;lines.array.set(paper?paperPositions:terrainPositions);lines.needsUpdate=true;outlines.linewidth=paper?1:1.25;
  if(paper&&previous!=='paper')detail.suspend();paint(state);
 }
 applyStyle(initialStyle);
 return {earth,borders,selectedBorder,grid,paint,detail,get style(){return style;},textureWidth:detailed?8192:4096,normalWidth:detailed?4096:2048,get triangles(){return style==='paper'?paperGeometry.index!.count/3:indices.length/3;},borderEdges:edges.length,
  async setStyle(next:GlobeStyle){const token=++version;if(next==='terrain'){await loadTopography();if(destroyed||token!==version)return;material.map=color!;material.normalMap=normal!;material.needsUpdate=true;}applyStyle(next);requestDraw();},
  destroy(){destroyed=true;version++;detail.destroy();geometry.dispose();paperGeometry.dispose();material.dispose();paperMaterial.dispose();paperTexture.dispose();color?.dispose();normal?.dispose();overlay.dispose();borderGeometry.dispose();outlines.dispose();selectedBorder.geometry.dispose();selectedMaterial.dispose();}
 };
}
