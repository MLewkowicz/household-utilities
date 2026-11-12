import * as T from 'three';
import {actor,loadBitmojis,faceCamera,type CastMember} from './house/bitmoji-cast';
import {box,ball,cylinder,group,dispose,ring,mesh,line} from './house/scene-geometry';
import {GAMES} from './game-registry';
import {buildObservatoryCosmos} from './observatory-cosmos';
const TAU=Math.PI*2;
/** A single physical azimuth selects both the telescope direction and game. */
export async function mountObservatory(host:HTMLElement,initialAngle=0){
 const renderer=new T.WebGLRenderer({alpha:true,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.setClearColor(0,0);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
 const canvas=renderer.domElement;canvas.setAttribute('aria-hidden','true');
 const scene=new T.Scene(),camera=new T.OrthographicCamera(-15,15,13,-10,.1,150);camera.position.set(17,15,24);camera.lookAt(0,4,0);
 scene.add(new T.HemisphereLight('#d8e8ff','#70607a',2.3));const sun=new T.DirectionalLight('#ffe5b0',3.7);sun.position.set(-10,19,12);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-14,right:14,top:18,bottom:-14});sun.shadow.bias=-.002;scene.add(sun);
 const fill=new T.DirectionalLight('#8daef7',1.4);fill.position.set(8,4,-12);scene.add(fill);
 const root=new T.Group();scene.add(root);const building=group(root,0,0,0,true),ivory='#dfd5be',stone='#a8a3a0',trim='#eee3c8',copper='#558e88',brass='#c8a265';
 // A stepped island and a twelve-sided foundation, deliberately architectural.
 cylinder(building,'#555c72',5.5,.8,0,-1.3,0,6.1);cylinder(building,stone,5.8,.35,0,-.72);cylinder(building,trim,5.45,.25,0,-.43);
 cylinder(building,'#bcb4a2',4.7,.25,0,-.17);cylinder(building,ivory,3.65,2.45,0,1.2);cylinder(building,trim,3.86,.2,0,2.48);cylinder(building,'#b8b5a4',3.72,.18,0,2.66);
 // Recessed arches, pilasters, cornices and a stair climbing toward the instrument.
 for(let i=0;i<12;i++){const a=i/12*TAU,wall=group(building,Math.sin(a)*3.66,0,Math.cos(a)*3.66);wall.rotation.y=a;
  box(wall,'#394754',.9,1.3,.06,0,.9,.025);const arch=mesh(wall,new T.CircleGeometry(.45,24,0,Math.PI),'#394754',0,1.55,.06);arch.rotation.z=0;
  box(wall,trim,.14,1.8,.2,-.55,1.08,.08);box(wall,trim,.14,1.8,.2,.55,1.08,.08);
  const cap=mesh(wall,new T.TorusGeometry(.53,.075,6,24,Math.PI),trim,0,1.55,.1);
  if(i%3===0){box(wall,'#edd6a1',.58,.9,.02,0,1.05,.065);for(const x of [-.16,.16])box(wall,'#6d7d7c',.045,.9,.04,x,1.05,.08);}
 }
 for(let i=0;i<13;i++)box(building,i%2?trim:ivory,2.2,.18,1.15,0,-.22+i*.19,5.45-i*.235);
 // Open upper loggia: the telescope stands above a ring of columns.
 cylinder(building,ivory,3.38,.26,0,2.9);for(let i=0;i<10;i++){const a=i/10*TAU;const x=Math.sin(a)*3.02,z=Math.cos(a)*3.02;cylinder(building,trim,.20,2.3,x,4.05,z);cylinder(building,ivory,.31,.16,x,3,z);cylinder(building,ivory,.34,.2,x,5.17,z);}
 cylinder(building,trim,3.65,.22,0,5.38);cylinder(building,brass,3.6,.10,0,5.53);
 // The dome has a broad open slit for the enormous refractor.
 const dome=mesh(building,new T.SphereGeometry(3.56,48,20,.32,TAU-.64,0,Math.PI/2),copper,0,5.55,0);dome.rotation.y=Math.PI/2;
 for(let i=0;i<11;i++){const phi=.4+i*(TAU-.8)/10;const pts=[];for(let j=0;j<=18;j++){const t=j/18*Math.PI/2;pts.push([Math.sin(phi)*Math.sin(t)*3.59,5.55+Math.cos(t)*3.59,Math.cos(phi)*Math.sin(t)*3.59]);}line(building,'#a8ba9e',pts,.025);}
 cylinder(building,brass,.22,.55,0,9.25);ball(building,'#e5c48b',.22,.22,.22,0,9.6);
 // Massive telescope, raised through the dome's slot. Local +Z is its aim.
 const mount=group(building,0,5.6,0);cylinder(mount,'#415767',.65,1.1,0,.25);const yoke=ring(mount,brass,1.05,.18,0,1.05,0);yoke.rotation.y=Math.PI/2;
 const telescope=group(mount,0,1.05,0,true);telescope.rotation.x=-.28;
 const barrel=(color:string,r:number,length:number,z:number)=>{const p=cylinder(telescope,color,r,length,0,0,z);p.rotation.x=Math.PI/2;return p;};
 barrel('#416c70',.82,8.5,2.25);barrel(brass,.9,.25,-1.9);barrel(brass,1,.35,6.45);barrel('#d1b27d',.88,.18,4.4);barrel('#142e47',.84,.04,6.64);barrel('#6fbbc9',.68,.045,6.67);barrel('#e1b978',.22,.75,-2.1);
 const glint=ball(telescope,'#c4f0e8',.16,.12,.025,.3,.3,6.7);glint.material.emissive.set('#8fd9ce');
 box(telescope,brass,.14,.14,6,0,.84,2);for(const z of [-.5,1.9])box(telescope,brass,.14,.35,.14,0,.84,z);
 // A balcony and a crank give the roommates something physical to operate.
 for(let i=0;i<15;i++){const a=i/14*Math.PI*1.5-.75*Math.PI;cylinder(building,brass,.035,.7,Math.sin(a)*3.8,3.35,Math.cos(a)*3.8);}
 const balcony=ring(building,brass,3.8,.045,0,3.72,0);balcony.rotation.x=Math.PI/2;
 const crank=ring(building,'#866a4a',.38,.055,2.65,3.8,1.65);crank.rotation.y=Math.PI/2;box(building,brass,.14,.14,.7,2.65,3.8,1.65);
 let faces;try{faces=await loadBitmojis();}catch(e){dispose(root);renderer.dispose();throw e;}
 const people:CastMember[]=[];
 const engineer=actor(building,faces,'ohm',3.1,1.45,{y:2.98,scale:.65});engineer.leftArm.rotation.x=-1.1;people.push(engineer);
 const astronomer=actor(building,faces,'michal',-2.8,1.5,{y:2.98,scale:.7});astronomer.rightArm.rotation.x=-1.1;people.push(astronomer);
 const reader=actor(building,faces,'rina',-3.55,2.35,{scale:.72});reader.leftArm.rotation.x=-1;reader.rightArm.rotation.x=-1;box(reader.root,'#ae7865',.42,.04,.32,0,.7,.35);people.push(reader);
 const visitor=actor(building,faces,'rohil',2.8,3.45,{scale:.72});visitor.rightArm.rotation.z=-1.2;people.push(visitor);
 // The cards and telescope share screen-space targets, so the lens always
 // points at the highlighted card, at every viewport size.
 const targets=GAMES.map(()=>new T.Vector3());
 const aimingPlane=new T.Plane(),aimRay=new T.Raycaster(),cameraNormal=new T.Vector3();
 let selectionAngle=initialAngle,pitch=-.28,targetPitch=pitch;
 const cosmos=buildObservatoryCosmos(scene);
 const beamGeometry=new T.BufferGeometry().setFromPoints([new T.Vector3(),new T.Vector3()]);const beam=new T.Line(beamGeometry,new T.LineBasicMaterial({color:'#f0dca9',transparent:true,opacity:.25}));scene.add(beam);
 host.append(canvas);let active=false,frame=0,lost=false,destroyed=false,angle=0,target=0,last:number|undefined;const reduce=matchMedia('(prefers-reduced-motion: reduce)');
 const cards=GAMES.map(g=>host.querySelector<HTMLElement>(`[data-orbit-game="${g.id}"]`)!);let focused=-1;
 function requestDraw(){if(!frame&&active&&!lost&&!destroyed)frame=requestAnimationFrame(draw);}
 // All paints use the same animation clock, including resize and resume.
 function draw(now:number){frame=0;if(!active||lost||destroyed)return;if(!host.clientWidth||!host.clientHeight){last=undefined;return;}
  const dt=last===undefined?0:T.MathUtils.clamp((now-last)/1000,0,.05);last=now;
  angle=reduce.matches?target:T.MathUtils.damp(angle,target,8,dt);if(Math.abs(angle-target)<.001)angle=target;
  const turns=Math.round(angle/TAU)*TAU;angle-=turns;target-=turns;building.rotation.y=angle;
  const selected=((Math.round(selectionAngle/(TAU/6))%6)+6)%6;
  pitch=reduce.matches?targetPitch:T.MathUtils.damp(pitch,targetPitch,8,dt);telescope.rotation.x=pitch;
  const nextFocus=Math.abs(angle-target)<.05&&Math.abs(pitch-targetPitch)<.04?selected:-1;
  if(nextFocus!==focused){focused=nextFocus;cards.forEach((card,i)=>card.dataset.focused=String(i===focused));}
  telescope.updateWorldMatrix(true,false);const start=telescope.localToWorld(new T.Vector3(0,0,6.67));beam.geometry.setFromPoints([start,targets[selected]]);beam.visible=Math.abs(angle-target)<.03;
  if(active&&!reduce.matches){engineer.rightArm.rotation.x=-1+Math.sin(now/1100)*.12;visitor.rightArm.rotation.z=-1.2+Math.sin(now/1900)*.08;crank.rotation.x=now/3500;}
  cosmos.update(now,dt,!reduce.matches);faceCamera(people,camera);renderer.render(scene,camera);host.classList.add('has-scene');host.dataset.ready='true';host.dataset.sky='3d';if(!reduce.matches)requestDraw();
 }
 function aim(){
  const index=((Math.round(selectionAngle/(TAU/6))%6)+6)%6,p=targets[index];
  const heading=Math.atan2(p.x,p.z);
  target=angle+T.MathUtils.euclideanModulo(heading-angle+Math.PI,TAU)-Math.PI;
  targetPitch=-Math.atan2(p.y-6.65,Math.hypot(p.x,p.z));
  if(!active){angle=target;pitch=targetPitch;}
 }
 function resize(){
  if(lost||destroyed)return;const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;
  renderer.setSize(w,h);const aspect=w/h,halfW=aspect<.85?13:18,halfH=halfW/aspect;
  camera.left=-halfW;camera.right=halfW;camera.top=halfH;camera.bottom=-halfH;camera.lookAt(0,4.5,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();
  camera.getWorldDirection(cameraNormal);aimingPlane.setFromNormalAndCoplanarPoint(cameraNormal,new T.Vector3(0,8,0));
  const bounds=host.getBoundingClientRect();GAMES.forEach((g,i)=>{const card=host.querySelector<HTMLElement>(`[data-orbit-game="${g.id}"]`)!.getBoundingClientRect();aimRay.setFromCamera(new T.Vector2((card.left+card.width/2-bounds.left)/w*2-1,1-(card.top+card.height/2-bounds.top)/h*2),camera);aimRay.ray.intersectPlane(aimingPlane,targets[i]);});
  aim();cosmos.resize(camera);requestDraw();
 }
 const pointerMove=(e:PointerEvent)=>{if(!active||e.pointerType!=='mouse')return;const r=host.getBoundingClientRect();if(!r.width||!r.height)return;cosmos.setPointer(T.MathUtils.clamp((e.clientX-r.left)/r.width*2-1,-1,1),T.MathUtils.clamp(1-(e.clientY-r.top)/r.height*2,-1,1));};
 const pointerLeave=()=>cosmos.setPointer(0,0);host.addEventListener('pointermove',pointerMove);host.addEventListener('pointerleave',pointerLeave);
 const observer=new ResizeObserver(resize);observer.observe(host);
 const motion=()=>{cancelAnimationFrame(frame);frame=0;last=undefined;requestDraw();};reduce.addEventListener('change',motion);
 function fallback(){focused=-1;cards.forEach(card=>card.dataset.focused='false');host.classList.remove('has-scene');delete host.dataset.sky;delete host.dataset.ready;host.querySelectorAll<HTMLElement>('[data-orbit-game]').forEach(label=>{label.style.removeProperty('left');label.style.removeProperty('top');});}
 const contextLost=(e:Event)=>{e.preventDefault();lost=true;cancelAnimationFrame(frame);frame=0;last=undefined;fallback();};
 const contextRestored=()=>{if(destroyed)return;lost=false;last=undefined;resize();};
 canvas.addEventListener('webglcontextlost',contextLost);canvas.addEventListener('webglcontextrestored',contextRestored);resize();
 return {
  setAngle(value:number){
   if(!Number.isFinite(value)||destroyed)return;
   // Equivalent headings never require replaying complete revolutions on return.
   selectionAngle=value;aim();
   if(!active)angle=target;requestDraw();host.dataset.selected=GAMES[((Math.round(value/(TAU/6))%6)+6)%6].id;
  },
  setActive(value:boolean){if(active===value||destroyed)return;active=value;cancelAnimationFrame(frame);frame=0;last=undefined;if(active)resize();else pointerLeave();},
  diagnostics:()=>({angle,target,active:active&&!lost,lost,cosmos:cosmos.diagnostics(),frames:renderer.info.render.frame,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,selected:GAMES[((Math.round(selectionAngle/(TAU/6))%6)+6)%6].id,aim:targets[((Math.round(selectionAngle/(TAU/6))%6)+6)%6].toArray(),pitch,targetPitch}),
  destroy(){destroyed=true;active=false;cancelAnimationFrame(frame);observer.disconnect();reduce.removeEventListener('change',motion);host.removeEventListener('pointermove',pointerMove);host.removeEventListener('pointerleave',pointerLeave);canvas.removeEventListener('webglcontextlost',contextLost);canvas.removeEventListener('webglcontextrestored',contextRestored);dispose(root);cosmos.destroy();beamGeometry.dispose();(beam.material as T.Material).dispose();sun.shadow.dispose();renderer.dispose();canvas.remove();fallback();}
 };
}
