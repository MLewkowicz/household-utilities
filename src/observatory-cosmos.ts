import * as T from 'three';
import {mesh,group,line,batch,dispose} from './house/scene-geometry';

/** A miniature celestial landscape, built from the same lit geometry as the house. */
export function buildObservatoryCosmos(scene:T.Scene){
 const root=new T.Group();root.name='celestial-background';scene.add(root);
 const far=group(root,0,0,-30,true),middle=group(root,0,0,-12,true),near=group(root,0,0,4,true);
 const anchors:{object:T.Object3D;x:number;y:number;phoneX?:number;phoneY?:number;scale:number;phoneScale:number}[]=[];
 const anchor=(object:T.Object3D,x:number,y:number,scale=1,phoneX=x,phoneY=y,phoneScale=scale)=>anchors.push({object,x,y,scale,phoneX,phoneY,phoneScale});
 const moon=group(middle,0,0,8,true);
 // Depressions are cut into the sphere itself; the raised crater rims catch the light.
 const moonGeometry=new T.IcosahedronGeometry(1,12),positions=moonGeometry.getAttribute('position'),craters=[[-.32,.36,.25,.075],[.29,.18,.19,.06],[-.12,-.33,.29,.09],[.51,-.38,.13,.045],[-.61,-.16,.12,.04],[.08,.66,.10,.035]];
 const axes=craters.map(([x,y])=>new T.Vector3(x,y,Math.sqrt(Math.max(0,1-x*x-y*y))).normalize());
 const color=new T.Color(),moonColors=new Float32Array(positions.count*3),v=new T.Vector3();
 for(let i=0;i<positions.count;i++){
  v.fromBufferAttribute(positions,i).normalize();let height=1,shade=0;
  craters.forEach(([, ,radius,depth],j)=>{const d=v.distanceTo(axes[j])/radius;if(d<1.3){const bowl=Math.pow(Math.max(0,1-d*d),1.2);height-=depth*bowl;height+=.022*Math.exp(-Math.pow((d-.98)*7,2));shade=Math.max(shade,bowl*.22);}});
  positions.setXYZ(i,v.x*height,v.y*height,v.z*height);color.set('#9299af').multiplyScalar(1-shade);color.toArray(moonColors,i*3);
 }
 moonGeometry.setAttribute('color',new T.BufferAttribute(moonColors,3));moonGeometry.computeVertexNormals();const moonMaterial=new T.MeshLambertMaterial({vertexColors:true,flatShading:true});moon.add(new T.Mesh(moonGeometry,moonMaterial));moon.rotation.set(.18,-.14,-.26);anchor(moon,-.88,.67,.6,-.78,.75,.32);
 craters.forEach(([, ,radius],i)=>{const rim=mesh(moon,new T.TorusGeometry(radius,.008,5,40),'#a5acc0');rim.position.copy(axes[i]).multiplyScalar(Math.sqrt(1-radius*radius)+.012);rim.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),axes[i]);});batch(moon);

 // A tilted, substantial ring is partly hidden by the planet, giving a clear depth cue.
 const saturn=group(middle,0,0,2,true),body=mesh(saturn,new T.SphereGeometry(1,24,14),'#749095');body.scale.set(1, .94,1);
 for(let i=0;i<7;i++){const band=mesh(saturn,new T.SphereGeometry(1.005,48,3,0,Math.PI*2,.32+i*.35,.045+(i%3)*.025),i%2?'#7b979e':'#657e90');band.scale.y=.94;}
 const rings=group(saturn);rings.rotation.set(1.08,.18,-.4);
 for(const [radius,width,tint] of [[1.27,.035,'#b39f91'],[1.43,.12,'#b7a592'],[1.62,.035,'#7e8593'],[1.78,.09,'#bba796']] as const){
  const ring=mesh(rings,new T.TorusGeometry(radius,width,5,80),tint);ring.scale.z=.3;
 }
 mesh(saturn,new T.IcosahedronGeometry(.14,2),'#c3af9b',2,.8,.6);batch(saturn);
 anchor(saturn,.88,.69,.45,.86,.73,.23);

 // Low, uneven banks of nebular cloud feel like the house's modeled clouds.
 const cloud=(parent:T.Group,tint:string,seed:number)=>{
  const bank=group(parent);for(let i=0;i<9;i++){const x=(i-4)*.43,y=Math.sin(i*1.8+seed)*.11,z=Math.sin(i*2.6+seed)*.12;
   const puff=mesh(bank,new T.IcosahedronGeometry(1,2),tint,x,y,z);puff.scale.set(.68+Math.sin(i+seed)*.12,.22+Math.cos(i*.8)*.07,.35);puff.rotation.z=Math.sin(i)*.08;}
  batch(bank);return bank;
 };
 const violetCloud=cloud(far,'#525d78',2);violetCloud.rotation.z=.34;anchor(violetCloud,-1.02,-.61,1.5,-1.04,-.65,.85);
 const blueCloud=cloud(far,'#416178',5);blueCloud.rotation.z=-.35;anchor(blueCloud,1.08,.03,1.4,1.16,-.06,.9);

 // A crescent of orbiting rocks below the observatory, with small pieces farther away.
 const belt=group(near,0,0,-8,true),rocks:T.Mesh[]=[];
 for(let i=0;i<13;i++){
  const a=i/12*Math.PI*1.35+.25,size=.045+Math.pow((Math.sin(i*63.7)+1)/2,3)*.16;
  const rock=mesh(belt,new T.IcosahedronGeometry(size,i%5===0?1:0),['#71818c','#878894','#9b9187'][i%3]);rock.position.set(Math.cos(a)*6.2,Math.sin(a)*1.35,Math.sin(i*12.7)*1.5);rock.rotation.set(i*.7,i*1.1,i*.3);rock.scale.set(1.4,.8,1);rocks.push(rock);
 }
 belt.rotation.z=.24;anchor(belt,.02,-.80,1.2,-.06,-.69,.7);batch(belt);

 // Constellations are tiny brass rods and cut crystal stars, not painted lines.
 const starGeometry=new T.OctahedronGeometry(.10,0);
 function constellation(points:number[][],parent:T.Group){
  const c=group(parent);for(let i=0;i<points.length;i++){const p=points[i],star=mesh(c,starGeometry.clone(),'#b6b5ba',...p as [number,number,number]);star.scale.set(.75,i%2?1:1.5,.7);if(i)line(c,'#667487',[points[i-1],p],.011);}
  batch(c);return c;
 }
 const left=constellation([[-1.4,.1,0],[-.5,.9,.5],[.6,.65,0],[1.5,1.6,-.4],[2.2,1.3,.3]],middle);left.rotation.z=.16;anchor(left,-.82,-.12,.95,-.95,-.15,.5);
 const right=constellation([[-1.2,-.9,0],[-.3,-.1,.5],[.8,-.4,-.4],[1.2,.8,0],[.25,1.4,.3],[-.3,-.1,.5]],near);anchor(right,.85,-.48,.85,.88,-.48,.45);

 const starMaterial=new T.MeshLambertMaterial({color:'#adbac9',emissive:'#555b72',emissiveIntensity:.2}),stars=new T.InstancedMesh(new T.OctahedronGeometry(1,0),starMaterial,260);
 const specks=Array.from({length:260},(_,i)=>({x:((i*733+137)%1009)/1009*2-1,y:((i*i*211+71)%1013)/1013*2-1,z:-12-(i%7)*4,size:i%17===0?.055:i%5===0?.027:.014}));far.add(stars);stars.frustumCulled=false;
 const matrix=new T.Object3D(),layers=[far,middle,near],pointer=new T.Vector2(),drift=new T.Vector2();let halfW=17,halfH=12,phone=false;
 function resize(camera:T.OrthographicCamera){
  halfW=camera.right;halfH=camera.top;phone=halfW<10;
  root.position.copy(camera.position).addScaledVector(camera.getWorldDirection(new T.Vector3()),65);root.quaternion.copy(camera.quaternion);
  for(const a of anchors){a.object.position.x=(phone?a.phoneX!:a.x)*halfW;a.object.position.y=(phone?a.phoneY!:a.y)*halfH;a.object.scale.setScalar(phone?a.phoneScale:a.scale);}
  specks.forEach((s,i)=>{matrix.position.set(s.x*halfW*1.15,s.y*halfH*1.15,s.z);matrix.scale.setScalar(s.size*(phone?.8:1));matrix.rotation.set(i*.7,i*.5,i*.4);matrix.updateMatrix();stars.setMatrixAt(i,matrix.matrix);});stars.instanceMatrix.needsUpdate=true;
 }
 function update(time:number,dt:number,animated:boolean){
  if(!animated)drift.set(0,0);else{drift.x=T.MathUtils.damp(drift.x,pointer.x,3,dt);drift.y=T.MathUtils.damp(drift.y,pointer.y,3,dt);}
  layers.forEach((layer,i)=>{const amount=[.08,.20,.42][i];layer.position.x=drift.x*amount;layer.position.y=drift.y*amount;});
  saturn.rotation.y=animated?Math.sin(time*.000045)*.12:0;
 }
 root.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=false;o.receiveShadow=false;}});starGeometry.dispose();
 return {resize,update,setPointer(x:number,y:number){pointer.set(x,y);},diagnostics:()=>({objects:anchors.length,stars:stars.count,depths:layers.map(g=>g.position.z),parallax:drift.toArray(),phone}),destroy(){scene.remove(root);dispose(root);}};
}
