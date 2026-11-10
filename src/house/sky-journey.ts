import * as T from 'three';
import {batch,group,mesh} from './scene-geometry';

/** Small modeled cloud banks share the house renderer, lights and disposal path. */
export function createSkyJourney(scene:T.Scene,camera:T.OrthographicCamera){
 const root=group(scene);root.name='house-sky-journey';root.visible=false;
 const banks:{root:T.Group;x:number;start:number;depth:number;size:number}[]=[];
 const palette=['#eee7d7','#e0e5de','#d5e0df'];
 // Stagger near/far banks; a clear centre keeps the route readable on phones.
 for(let layer=0;layer<3;layer++)for(const side of [-1,1]){
  const bank=group(root);bank.name='flight-cloud-bank';
  for(let puff=0;puff<7;puff++){
   const shape=mesh(bank,new T.IcosahedronGeometry(1,1),palette[(puff+layer)%3],(puff-3)*.62,Math.sin(puff*1.7+layer)*.24,(puff%3)*.18);
   shape.scale.set(.90,.38+(puff%3)*.11,.53);shape.rotation.y=puff*.51;
   shape.castShadow=false;shape.receiveShadow=false;
  }
  batch(bank);
  banks.push({root:bank,x:side*(.80+layer*.12),start:1.5+layer*1.5+(side===1?.18:0),depth:35+layer*17,size:1+layer*.12});
 }
 // A few warm, beveled stars carry the house's small brass details into orbit.
 const outline=new T.Shape();
 for(let i=0;i<10;i++){const a=Math.PI/2+i*Math.PI/5,r=i%2?.10:.23,x=Math.cos(a)*r,y=Math.sin(a)*r;if(i)outline.lineTo(x,y);else outline.moveTo(x,y);}
 outline.closePath();
 const stars=group(root);stars.name='flight-stars';
 for(let i=0;i<7;i++){
  const star=mesh(stars,new T.ExtrudeGeometry(outline,{depth:.08,bevelEnabled:true,bevelThickness:.025,bevelSize:.025,bevelSegments:1,steps:1}),'#e6c790');
  star.castShadow=false;star.receiveShadow=false;star.userData.phase=i;
 }
 const right=new T.Vector3(),up=new T.Vector3(),forward=new T.Vector3();
 function place(object:T.Object3D,x:number,y:number,depth:number){
  object.position.copy(camera.position).addScaledVector(forward,depth).addScaledVector(right,x*(camera.right-camera.left)/2).addScaledVector(up,y*(camera.top-camera.bottom)/2);
  object.quaternion.copy(camera.quaternion);
 }
 function update(progress:number){
  root.visible=progress>0;if(!root.visible)return;
  camera.updateMatrixWorld();camera.getWorldDirection(forward);right.setFromMatrixColumn(camera.matrixWorld,0);up.setFromMatrixColumn(camera.matrixWorld,1);
  const span=camera.top-camera.bottom,travel=progress*6.4;
  for(const bank of banks){
   place(bank.root,bank.x,bank.start-travel,bank.depth);
   bank.root.scale.setScalar(span*.105*bank.size*(1+progress*.25));
  }
  stars.visible=progress>.42;
  stars.children.forEach((star,i)=>{
   const phase=i*2.399;
   place(star,Math.cos(phase)*(.37+i*.065),1.55+(i%3)*.48-progress*2.4,24+i);
   star.rotateY(Math.sin(progress*1.7+i*.7)*.32);star.rotateZ(i*.43-progress*.35);
   star.scale.setScalar(T.MathUtils.smoothstep(progress,.42,.64)*span*.045*(.7+(i%3)*.2));
  });
 }
 return {update,diagnostics:()=>({visible:root.visible,cloudBanks:banks.length,stars:stars.children.length})};
}
