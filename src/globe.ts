import {cityLocation,type GlobeCity} from './globe-cities';
import * as T from 'three';
import {createGlobeTerrain} from './globe-terrain';
import {countryTapSequence} from './globe-borders';
import {inPool,type Country,type Region,type CountryScope} from './geography';
import {elevationAt,reliefRadius,spherePoint,sphereCoordinate,globeRegionView,globeCountryView,smallCountry,wrapLongitude,containsCoordinate,type GlobeView} from './globe-math';
export type GlobeStyle='terrain'|'paper';
export type GlobeState={labels?:boolean;cities?:GlobeCity[];route?:{path:string[];discovered:string[];destination:string};region:Region;scope?:CountryScope;label?:string;correct:string[];revealed:string[];selected?:string;playing:boolean};
export type GlobeSurface={setState:(s:GlobeState)=>void;setStyle:(style:GlobeStyle)=>Promise<void>;reset:()=>void;focusCountry:(c:Country)=>void;focusCity:(city:GlobeCity)=>void;zoom:(factor:number)=>void;entrance:()=>void;setActive:(v:boolean)=>void;destroy:()=>void};
export async function mountGlobe(host:HTMLElement,countries:Country[],onSelect:(c:Country|undefined,reveal?:boolean)=>void,initialStyle:GlobeStyle='terrain'):Promise<GlobeSurface>{
 const renderer=new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'default'});
 renderer.outputColorSpace=T.SRGBColorSpace;renderer.setClearColor(0x000000,0);
 const el=renderer.domElement;el.id='geo-globe';el.tabIndex=0;el.setAttribute('role','application');el.setAttribute('aria-label','Unlabeled Earth globe. Drag or use arrow keys to rotate, scroll or pinch to zoom. Enter selects the country at the center; Home resets the view.');
 let terrain:Awaited<ReturnType<typeof createGlobeTerrain>>;
 try{terrain=await createGlobeTerrain(renderer,countries,requestDraw,initialStyle);}catch(error){renderer.dispose();throw error;}
 const {grid,earth}=terrain;host.replaceChildren(el);
 const label=document.createElement('span');label.className='globe-country-label';label.hidden=true;host.append(label);
 const labelLayer=document.createElement('div');labelLayer.className='globe-review-labels';host.append(labelLayer);
 const countryLabels=new Map(countries.map(c=>{const button=document.createElement('button');button.type='button';button.textContent=c.name;button.hidden=true;button.addEventListener('click',()=>onSelect(c));labelLayer.append(button);return [c.id,button];}));
 const recovery=document.createElement('div');recovery.className='globe-recovery';recovery.hidden=true;recovery.setAttribute('role','status');recovery.innerHTML='<p>Restoring the globe…</p><button type="button">Retry graphics</button>';recovery.querySelector('button')!.addEventListener('click',()=>renderer.forceContextRestore());host.append(recovery);
 const centers=new Map(countries.map(c=>[c.id,new T.Vector3(...spherePoint(c.center[0],c.center[1],1.005))]));
 const geographicBounds=new Map(countries.map(c=>{const points=c.rings.flat();return [c.id,{west:Math.min(...points.map(p=>p[0])),east:Math.max(...points.map(p=>p[0])),south:Math.min(...points.map(p=>p[1])),north:Math.max(...points.map(p=>p[1]))}];}));

 const scene=new T.Scene(),camera=new T.PerspectiveCamera(36,1,.005,80),planet=new T.Group();scene.add(planet);
 const ambient=new T.AmbientLight(0xe2e9de,1.05);scene.add(ambient);const key=new T.DirectionalLight(0xfff0de,2.6),fill=new T.DirectionalLight(0x8cc7dd,.45);scene.add(key,fill);
 planet.add(earth,terrain.borders,terrain.selectedBorder);
 const glowMaterial=new T.ShaderMaterial({transparent:true,depthWrite:false,blending:T.AdditiveBlending,uniforms:{tint:{value:new T.Color('#6bbbd7')}},vertexShader:'varying vec3 n; varying vec3 v; void main(){vec4 p=modelViewMatrix*vec4(position,1.0);n=normalize(normalMatrix*normal);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',fragmentShader:'uniform vec3 tint; varying vec3 n; varying vec3 v; void main(){float rim=pow(1.0-max(0.0,dot(normalize(n),normalize(v))),3.5);gl_FragColor=vec4(tint,rim*0.4);}' });
 const atmosphere=new T.Mesh(new T.SphereGeometry(1.028,96,64),glowMaterial);planet.add(atmosphere);
 const dot=document.createElement('canvas');dot.width=dot.height=32;const dotContext=dot.getContext('2d')!;dotContext.fillStyle='#fff';dotContext.beginPath();dotContext.arc(16,16,12,0,Math.PI*2);dotContext.fill();const dotTexture=new T.CanvasTexture(dot);
 const markerMaterial=new T.PointsMaterial({map:dotTexture,alphaTest:.2,size:8,sizeAttenuation:false,vertexColors:true,transparent:true,opacity:.9,depthWrite:false}),markers=new T.Points(new T.BufferGeometry(),markerMaterial);planet.add(markers);let tiny:Country[]=[];const markerCenters=new Map<string,T.Vector3>();
 const routeMaterial=new T.LineBasicMaterial({color:'#f5ce8b',transparent:true,opacity:.8,depthWrite:false}),routeLine=new T.LineSegments(new T.BufferGeometry(),routeMaterial);planet.add(routeLine);
 let state:GlobeState={region:'World',correct:[],revealed:[],playing:false},view=globeRegionView('World'),active=!host.closest('[hidden]'),visible=true,frame=0,last=0,interacted=false,lost=false;
 let motion:{from:GlobeView;to:GlobeView;at:number;duration:number}|undefined;
 const reduce=matchMedia('(prefers-reduced-motion: reduce)'),ray=new T.Raycaster(),pointer=new T.Vector2();
 function redrawTexture(){
  terrain.paint(state.cities?{...state,correct:[],revealed:[],selected:undefined}:state);
  tiny=state.cities?state.cities.map(city=>cityLocation(city,countries.find(c=>c.id===city.countryId)!)):countries.filter(c=>inPool(c,state.region,state.scope)&&(state.route?state.route.discovered.includes(c.id):smallCountry(c)));markerCenters.clear();markerMaterial.size=state.cities?11:8;const points:number[]=[],colors:number[]=[];
  const paper=terrain.style==='paper';
  for(const c of tiny){const city=state.cities?.find(city=>city.id===c.id),coords:[number,number]=city?[city.lon,city.lat]:c.center as [number,number],pos=new T.Vector3(...spherePoint(...coords,(paper?1:reliefRadius(elevationAt(grid,...coords)))+.006));markerCenters.set(c.id,pos);points.push(...pos.toArray());const color=new T.Color(state.correct.includes(c.id)?(paper?'#276b48':'#72eeac'):state.revealed.includes(c.id)?(paper?'#986326':'#ecc17b'):c.id===state.route?.destination?'#ffcc78':paper?'#625845':c.id===state.selected?'#ffe3a1':'#f5e8c4');colors.push(color.r,color.g,color.b);}
  const routePoints:number[]=[];const path=state.route?.path||[];
  for(let i=1;i<path.length;i++){const a=centers.get(path[i-1])!.clone().normalize(),b=centers.get(path[i])!.clone().normalize();for(let j=0;j<24;j++){for(const t of [j/24,(j+1)/24]){const p=a.clone().lerp(b,t).normalize();const [lon,lat]=sphereCoordinate(p.x,p.y,p.z);p.multiplyScalar((paper?1:reliefRadius(elevationAt(grid,lon,lat)))+.008);routePoints.push(...p.toArray());}}}
  routeLine.geometry.dispose();routeLine.geometry=new T.BufferGeometry();routeLine.geometry.setAttribute('position',new T.Float32BufferAttribute(routePoints,3));
  markers.geometry.dispose();markers.geometry=new T.BufferGeometry();markers.geometry.setAttribute('position',new T.Float32BufferAttribute(points,3));markers.geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));requestDraw();
 }
 function positionCamera(){camera.position.set(...spherePoint(view.lon,view.lat,view.distance));camera.lookAt(0,0,0);camera.updateMatrixWorld();const right=new T.Vector3(1,0,0).applyQuaternion(camera.quaternion),up=new T.Vector3(0,1,0).applyQuaternion(camera.quaternion);key.position.copy(camera.position).addScaledVector(right,-3).addScaledVector(up,3);fill.position.copy(camera.position).addScaledVector(right,5);}
 function draw(now:number){
  frame=0;if(!active||!visible||document.hidden||lost)return;
  if(motion){const t=Math.min(1,(now-motion.at)/motion.duration),ease=1-Math.pow(1-t,3);view={lon:motion.from.lon+wrapLongitude(motion.to.lon-motion.from.lon)*ease,lat:T.MathUtils.lerp(motion.from.lat,motion.to.lat,ease),distance:T.MathUtils.lerp(motion.from.distance,motion.to.distance,ease)};if(t===1){view={...motion.to};motion=undefined;}}
  else if(!state.playing&&!interacted&&!reduce.matches&&last)view.lon+=Math.min(50,now-last)*.0018;
  last=now;if(state.cities)markerMaterial.size=Math.max(6,Math.min(12,11/(view.distance-.3)));positionCamera();if(terrain.style==='terrain')terrain.detail.update(view,!motion&&pointers.size===0);renderer.render(scene,camera);
  const target=state.label&&(state.cities?markerCenters:centers).get(state.label);label.hidden=!target;
  if(target){const front=target.dot(camera.position.clone().sub(target))>0,p=target.clone().project(camera);label.hidden=!front||Math.abs(p.x)>1||Math.abs(p.y)>1;label.textContent=state.cities?.find(c=>c.id===state.label)?.name||countries.find(c=>c.id===state.label)!.name;label.style.left=`${(p.x+1)/2*el.clientWidth}px`;label.style.top=`${(1-p.y)/2*el.clientHeight}px`;}

  labelLayer.hidden=!state.labels;
  if(state.labels){
   const occupied:{x:number;y:number;w:number}[]=[],width=el.clientWidth,height=el.clientHeight;
   const ordered=[...countries].sort((a,b)=>Number(b.id===state.selected)-Number(a.id===state.selected)||(geographicBounds.get(b.id)!.east-geographicBounds.get(b.id)!.west)*(geographicBounds.get(b.id)!.north-geographicBounds.get(b.id)!.south)-(geographicBounds.get(a.id)!.east-geographicBounds.get(a.id)!.west)*(geographicBounds.get(a.id)!.north-geographicBounds.get(a.id)!.south));
   for(const c of ordered){
    const button=countryLabels.get(c.id)!,center=centers.get(c.id)!,point=center.clone().project(camera),x=(point.x+1)/2*width,y=(1-point.y)/2*height,w=c.name.length*6.5+16;
    button.hidden=center.dot(camera.position.clone().sub(center))<=.08||x<w/2||x>width-w/2||y<20||y>height-20||occupied.some(p=>Math.abs(p.x-x)<(p.w+w)/2+4&&Math.abs(p.y-y)<25);
    if(!button.hidden){occupied.push({x,y,w});button.style.left=`${x}px`;button.style.top=`${y}px`;button.dataset.selected=String(c.id===state.selected);}
   }
  }
  el.dataset.ready='true';el.dataset.longitude=view.lon.toFixed(2);el.dataset.latitude=view.lat.toFixed(2);el.dataset.distance=view.distance.toFixed(3);
  if(motion||!state.playing&&!interacted&&!reduce.matches)requestDraw();
 }
 function requestDraw(){if(!frame&&active&&visible&&!document.hidden&&!lost)frame=requestAnimationFrame(draw);}
 function go(to:GlobeView,duration=700){taps.reset();interacted=true;if(reduce.matches){view={...to};motion=undefined;}else motion={from:{...view},to,at:performance.now(),duration};requestDraw();}
 function resize(){const {width,height}=host.getBoundingClientRect();if(!width||!height)return;renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<=720?1.75:2,Math.sqrt(4000000/(width*height))));renderer.setSize(width,height,false);camera.aspect=width/height;camera.fov=Math.min(75,36/Math.min(1,camera.aspect));camera.updateProjectionMatrix();requestDraw();}
 const ro=new ResizeObserver(resize);ro.observe(host);
 const io=new IntersectionObserver(entries=>{visible=entries.some(e=>e.isIntersecting);if(visible){last=0;requestDraw();}else{cancelAnimationFrame(frame);frame=0;}},{threshold:0});io.observe(host);
 const abort=new AbortController(),signal=abort.signal;
 document.addEventListener('visibilitychange',()=>{last=0;if(document.hidden){cancelAnimationFrame(frame);frame=0;}else requestDraw();},{signal});
 function atPoint(clientX:number,clientY:number){
  const r=el.getBoundingClientRect();pointer.set((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1);ray.setFromCamera(pointer,camera);
  // Screen-space targets stay easy to tap at every zoom level. Nearest wins.
  let nearest:Country|undefined,best=matchMedia('(pointer:coarse)').matches?22:16;
  for(const c of tiny){const center=markerCenters.get(c.id)!;if(center.dot(camera.position.clone().sub(center))<=0)continue;
   const p=center.clone().project(camera),d=Math.hypot(r.left+(p.x+1)/2*r.width-clientX,r.top+(1-p.y)/2*r.height-clientY);
   if(d<best){best=d;nearest=c;}
  }
  if(nearest)return nearest;
  if(state.route)return;
  if(state.cities)return;
  // Analytic intersections avoid scanning up to 900,000 terrain triangles per tap.
  const hit=new T.Vector3(),sphere=new T.Sphere(new T.Vector3(),1);
  if(!ray.ray.intersectSphere(sphere,hit))return;
  if(terrain.style==='terrain')for(let i=0;i<3;i++){const [lon,lat]=sphereCoordinate(hit.x,hit.y,hit.z);sphere.radius=reliefRadius(elevationAt(grid,lon,lat));if(!ray.ray.intersectSphere(sphere,hit))return;}
  const [lon,lat]=sphereCoordinate(hit.x,hit.y,hit.z);
  return countries.find(c=>{const b=geographicBounds.get(c.id)!;return inPool(c,state.region,state.scope)&&lon>=b.west&&lon<=b.east&&lat>=b.south&&lat<=b.north&&containsCoordinate(c,lon,lat);});
 }
 const taps=countryTapSequence();let tapped:Country|undefined;
 const pointers=new Map<number,{x:number;y:number}>();let drag:{x:number;y:number;lon:number;lat:number}|undefined,moved=false,pinch=0;
 function stopMotion(){motion=undefined;interacted=true;}
 function zoom(factor:number){taps.reset();stopMotion();view.distance=Math.max(1.04,Math.min(6,1+(view.distance-1)*factor));requestDraw();}
 el.addEventListener('pointerdown',e=>{if(e.button!==0)return;tapped=undefined;stopMotion();el.focus({preventScroll:true});pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});drag={x:e.clientX,y:e.clientY,lon:view.lon,lat:view.lat};moved=pointers.size>1;if(pointers.size===2){const [a,b]=[...pointers.values()];pinch=Math.hypot(a.x-b.x,a.y-b.y);}el.setPointerCapture(e.pointerId);},{signal});
 el.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId)||!drag)return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){const [a,b]=[...pointers.values()],d=Math.hypot(a.x-b.x,a.y-b.y);if(d>0&&pinch>0)zoom(pinch/d);pinch=d;moved=true;return;}const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>4)moved=true;if(moved){taps.reset();const scale=Math.min(1,(view.distance-1)/2)*180/Math.min(el.clientWidth,el.clientHeight);view.lon=drag.lon-dx*scale;view.lat=Math.max(-85,Math.min(85,drag.lat+dy*scale));requestDraw();}},{signal});
 function end(e:PointerEvent,cancel=false){const tap=!moved&&!cancel;pointers.delete(e.pointerId);if(el.hasPointerCapture(e.pointerId))el.releasePointerCapture(e.pointerId);if(pointers.size){const p=[...pointers.values()][0];drag={x:p.x,y:p.y,lon:view.lon,lat:view.lat};moved=true;}else drag=undefined;requestDraw();if(tap){const c=atPoint(e.clientX,e.clientY);tapped=c;onSelect(c);if(!c)taps.reset();}else{tapped=undefined;taps.reset();}}
 el.addEventListener('click',e=>{if(tapped&&!moved&&taps.tap(tapped.id,e.clientX,e.clientY,e.timeStamp,e.detail))onSelect(tapped,true);},{signal});
 el.addEventListener('pointerup',e=>end(e),{signal});el.addEventListener('pointercancel',e=>end(e,true),{signal});el.addEventListener('wheel',e=>{e.preventDefault();zoom(Math.exp(Math.max(-.4,Math.min(.4,e.deltaY*.0018))));},{passive:false,signal});
 el.addEventListener('keydown',e=>{taps.reset();if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();stopMotion();const step=Math.max(1,(view.distance-1)*6);view.lon+=(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0);view.lat=Math.max(-85,Math.min(85,view.lat+(e.key==='ArrowUp'?step:e.key==='ArrowDown'?-step:0)));requestDraw();}else if(e.key==='Home'){e.preventDefault();go(globeRegionView(state.region));}else if(['+','=','-'].includes(e.key)){e.preventDefault();zoom(e.key==='-'?1.25:.8);}else if(e.key==='Enter'||e.key===' '){e.preventDefault();const r=el.getBoundingClientRect(),c=atPoint(r.x+r.width/2,r.y+r.height/2);onSelect(c);}},{signal});
 el.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;cancelAnimationFrame(frame);frame=0;terrain.detail.suspend();recovery.hidden=false;labelLayer.hidden=true;delete el.dataset.ready;},{signal});
 el.addEventListener('webglcontextrestored',()=>{lost=false;last=0;recovery.hidden=true;updateStyle();resize();requestDraw();},{signal});
 Object.assign(window,{__globeDiagnostics:()=>({view:{...view},lost,labels:!!state.labels,animating:!!motion,active,visible,route:state.route?{...state.route}:undefined,cityIds:state.cities?.map(c=>c.id),projectCity:(id:string)=>{const p=markerCenters.get(id)?.clone();if(!p)return null;const front=p.dot(camera.position.clone().sub(p))>0;p.project(camera);const r=el.getBoundingClientRect();return {x:r.x+(p.x+1)/2*r.width,y:r.y+(1-p.y)/2*r.height,visible:front&&Math.abs(p.x)<1&&Math.abs(p.y)<1};},region:state.region,scope:state.scope,label:state.label,correct:[...state.correct],revealed:[...state.revealed],style:terrain.style,borderEdges:terrain.borderEdges,borderSample:Array.from((terrain.borders.geometry.attributes.instanceStart as T.InterleavedBufferAttribute).data.array.slice(0,12)),borderWidth:terrain.borders.material.linewidth,selected:state.selected,triangles:terrain.triangles,textureWidth:terrain.textureWidth,normalWidth:terrain.normalWidth,pixelRatio:renderer.getPixelRatio(),drawCalls:renderer.info.render.calls,frames:renderer.info.render.frame,detail:terrain.detail.diagnostics(),elevation:'ETOPO1',playing:state.playing,project:(id:string)=>{const c=countries.find(c=>c.id===id);if(!c)return null;const p=new T.Vector3(...spherePoint(...c.center as [number,number],1.01)),front=p.dot(camera.position.clone().sub(p))>0;p.project(camera);const r=el.getBoundingClientRect();return {x:r.x+(p.x+1)/2*r.width,y:r.y+(1-p.y)/2*r.height,visible:front&&Math.abs(p.x)<1&&Math.abs(p.y)<1};}})});
 function updateStyle(){const paper=terrain.style==='paper';atmosphere.visible=!paper;ambient.intensity=paper?1.4:1.05;key.intensity=paper?1.35:2.6;fill.intensity=paper?.2:.45;el.dataset.style=terrain.style;redrawTexture();}
 updateStyle();resize();
 return {async setStyle(style){taps.reset();await terrain.setStyle(style);updateStyle();},setState(next){if(next.labels&&!state.labels)interacted=false;const paint=next.cities?.map(c=>c.id).join()!==state.cities?.map(c=>c.id).join()||next.route?.path.join()!==state.route?.path.join()||next.route?.discovered.join()!==state.route?.discovered.join()||next.route?.destination!==state.route?.destination||next.region!==state.region||next.scope!==state.scope||next.selected!==state.selected||next.correct.join()!==state.correct.join()||next.revealed.join()!==state.revealed.join();state={...next,route:next.route?{...next.route,path:[...next.route.path],discovered:[...next.route.discovered]}:undefined,correct:[...next.correct],revealed:[...next.revealed]};el.setAttribute('aria-label',state.route?'Revealed trail on a paper globe. Drag or use arrow keys to rotate; scroll to zoom. Name a neighboring country in the answer field.':`${state.labels?'Labeled':'Unlabeled'} Earth globe. Drag or use arrow keys to rotate, scroll or pinch to zoom. Enter selects the ${state.cities?'city dot':'country'} at the center; Home resets the view.`);if(paint)redrawTexture();requestDraw();},reset(){go(globeRegionView(state.region));},focusCountry(c){go(globeCountryView(c));},focusCity(city){go({lon:city.lon,lat:city.lat,distance:1.18});},zoom,entrance(){view={...globeRegionView('World'),distance:8};go(globeRegionView('World'),1900);},setActive(value){active=value;last=0;if(value){resize();requestDraw();}else{terrain.detail.suspend();cancelAnimationFrame(frame);frame=0;}},destroy(){abort.abort();ro.disconnect();io.disconnect();cancelAnimationFrame(frame);terrain.destroy();atmosphere.geometry.dispose();glowMaterial.dispose();markers.geometry.dispose();markerMaterial.dispose();dotTexture.dispose();routeLine.geometry.dispose();routeMaterial.dispose();renderer.dispose();el.remove();label.remove();labelLayer.remove();recovery.remove();}};
}
