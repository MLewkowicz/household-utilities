import * as T from 'three';
import {ball,box,cylinder,group,mesh,ring,batch} from './house/scene-geometry';
import type {GameId} from './game-registry';
/** Small worlds whose objects explain the game before its label is read. */
export function buildGamePlanet(parent:T.Group,id:GameId){
 const world=group(parent),cream='#f1e2b8',ink='#315466',gold='#dab779';let animate=(time:number)=>{};
 const globe=(color:string)=>ball(world,color,1.03,1.03,1.03);
 const tree=(p:T.Group,x:number,z:number,color:string)=>{cylinder(p,'#947559',.035,.24,x,.12,z);ball(p,color,.16,.23,.16,x,.37,z);};
 const flag=(p:T.Group,x:number,y:number,z:number,color:string)=>{cylinder(p,cream,.022,.46,x,y+.23,z);box(p,color,.24,.15,.025,x+.12,y+.37,z);};
 if(id==='sudoku'||id==='crossword'){
  globe(id==='sudoku'?'#8d7c9e':'#a17e63');const desk=group(world,0,.83,0);box(desk,cream,1.65,.15,1.65);
  const size=id==='sudoku'?3:5,step=1.5/size;
  for(let row=0;row<size;row++)for(let col=0;col<size;col++){const blocked=id==='crossword'&&[[0,0],[0,1],[1,0],[4,4],[4,3],[3,4]].some(([r,c])=>r===row&&c===col);box(desk,blocked?ink:'#f8efda',step-.025,.06,step-.025,(col-(size-1)/2)*step,.12,(row-(size-1)/2)*step);if(!blocked&&(row+col)%2===0){const dot=ball(desk,gold,.04,.03,.04,(col-(size-1)/2)*step,.18,(row-(size-1)/2)*step);}}
  const pencil=group(world,1.05,.95,.3);pencil.rotation.z=-.3;cylinder(pencil,gold,.07,1.3);mesh(pencil,new T.ConeGeometry(.07,.23,6),ink,0,-.76,0).rotation.z=Math.PI;
 }
 if(id==='geography'){
  globe('#568fa4');
  for(const [x,y,z,s] of [[-.45,.45,.85,.48],[.35,-.25,.9,.4],[.6,.55,.55,.25],[-.6,-.45,.5,.3]])ball(world,'#a1b57a',s,s*.65,.1,x,y,z);
  const meridian=ring(world,gold,1.16,.022);meridian.rotation.y=.4;
  for(const y of [-.48,0,.48]){const latitude=ring(world,'#b7d8cf',Math.sqrt(1.03**2-y*y)+.014,.012,0,y);latitude.rotation.x=Math.PI/2;}
  flag(world,.25,.94,.1,'#e1b66b');
  const compass=group(world,-.85,-.55,.8);mesh(compass,new T.OctahedronGeometry(.19),cream).scale.set(.45,1.7,.3);
  for(const x of [-.22,0,.22])ball(world,'#e3ece0',.19,.08,.12,x,1.22,-.1);
 }
 if(id==='odd-one-out'){
  globe('#b86f5d');const stage=cylinder(world,'#d49b7f',.86,.13,0,.72,0);stage.rotation.x=.14;
  for(const [i,x,z] of [[0,-.43,-.3],[1,.43,-.3],[2,-.43,.36],[3,.43,.36]]){
   cylinder(world,cream,.24,.1,x,.84,z);
   if(i<3){const cube=box(world,'#f0ce91',.35,.35,.35,x,1.08,z);cube.rotation.y=.25;}
   else{mesh(world,new T.ConeGeometry(.27,.55,4),'#75c5b6',x,1.18,z).rotation.y=.8;const orbit=ring(world,'#f2d6ae',.36,.016,x,1.02,z);orbit.rotation.x=Math.PI/2;}
  }
  for(let i=0;i<7;i++)ball(world,'#935a51',.11,.11,.04,Math.cos(i)*.6,-.38+Math.sin(i)*.24,.89);
 }
 if(id==='passport-puzzle'){
  globe('#b8aa73');const island=group(world,0,.82,0);cylinder(island,'#e4d09e',.79,.14);
  // An airport, pyramids and a tiny arch make this a world of destinations.
  for(const [x,z,h] of [[-.4,.13,.4],[-.05,.4,.28]])mesh(island,new T.ConeGeometry(h*.65,h,4),'#d59c5f',x,h*.5,z).rotation.y=Math.PI/4;
  box(island,cream,.16,.55,.16,.35,.28,-.1);box(island,cream,.16,.55,.16,.7,.28,-.1);box(island,cream,.53,.16,.18,.52,.58,-.1);
  tree(island,-.47,-.33,'#577b64');flag(island,.12,0,-.4,'#bd725b');
  const flight=group(world,0,0,0,true),plane=group(flight,1.55,.35,0);box(plane,cream,.12,.1,.6);box(plane,cream,.58,.055,.15,0,0,.04);box(plane,'#b9604e',.26,.06,.1,0,.04,-.23);box(plane,'#b9604e',.04,.2,.12,0,.12,-.23);
  const route=ring(world,'#e8d29e',1.55,.012);route.rotation.x=Math.PI/2-.2;
  animate=time=>{flight.rotation.y=time*.00018;flight.rotation.z=.2;};
 }
 if(id==='clue-cascade'){
  globe('#617c70');const garden=group(world,0,.77,0);cylinder(garden,cream,.88,.11);
  const colors=['#dfba64','#89b481','#7babc1','#ab91ba'];
  for(let i=0;i<4;i++){const x=i%2? .43:-.43,z=i<2?-.4:.4,p=group(garden,x,.15,z);box(p,colors[i],.65,.14,.59);for(let j=0;j<4;j++)box(p,cream,.14,.04,.14,j%2?.14:-.14,.1,j<2?-.13:.13);tree(p,.25,-.23,colors[i]);}
  for(const z of [-.4,.4])box(garden,gold,.3,.06,.15,0,.15,z);for(const x of [-.43,.43])box(garden,gold,.15,.06,.3,x,.15,0);
  for(let i=0;i<4;i++)box(world,colors[i],.27,.27,.09,-.45+i*.3,-.2,.98);
 }
 if(id==='before-or-after'){
  globe('#78664d');const dial=group(world,0,.05,.93);cylinder(dial,gold,.91,.12).rotation.x=Math.PI/2;cylinder(dial,'#f1dfb6',.79,.14,0,0,.03).rotation.x=Math.PI/2;
  for(let i=0;i<12;i++){const a=i*Math.PI/6,tick=box(dial,ink,.035,.12,.025,Math.sin(a)*.67,Math.cos(a)*.67,.12);tick.rotation.z=-a;}
  const hands=group(dial,0,0,.15,true);box(hands,ink,.045,.57,.025,0,.22);const hour=box(dial,ink,.04,.37,.025,.12,.12,.17);hour.rotation.z=-.7;ball(dial,gold,.07,.07,.04,0,0,.2);
  for(let i=0;i<16;i++){const a=i*Math.PI/8,tooth=box(world,gold,.19,.18,.2,Math.sin(a)*1.1,Math.cos(a)*1.1,0);tooth.rotation.z=-a;}
  const crown=cylinder(world,gold,.17,.17,0,1.25);box(world,gold,.26,.04,.15,0,1.36);
  world.rotation.y=.55;animate=time=>{hands.rotation.z=-time*.00014;};
 }
 if(id==='how-much-ish'){
  globe('#81a398');const platform=group(world,0,.78,0);cylinder(platform,cream,.85,.11);
  // A tiny house beneath an outsized giraffe; a ruler runs up the world's side.
  box(platform,'#dfbb88',.4,.3,.35,-.36,.2,.28);const roof=mesh(platform,new T.ConeGeometry(.35,.24,4),'#a56b58',-.36,.47,.28);roof.rotation.y=Math.PI/4;box(platform,ink,.1,.17,.02,-.36,.15,.46);
  const animal=group(platform,.29,.15,-.13);ball(animal,'#d7a755',.21,.22,.33,0,.37,0);cylinder(animal,'#d7a755',.075,.65,0,.75,.23);ball(animal,'#d7a755',.11,.1,.2,0,1.1,.28);
  for(const x of [-.14,.14])for(const z of [-.2,.2])cylinder(animal,'#bd8d43',.036,.4,x,.19,z);
  const ruler=group(world,-1.16,0,.4);box(ruler,'#e8d7a5',.2,2.35,.065);for(let i=0;i<12;i++)box(ruler,'#64776c',i%3===0?.14:.08,.018,.02,.03,-1.05+i*.19,.045);
  ball(world,'#d4c7a4',.2,.2,.2,1.45,-.3,0);const orbit=ring(world,'#c5d8b8',1.48,.012);orbit.rotation.x=1.1;
 }
 batch(world);world.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=false;o.receiveShadow=false;}});
 return {animate};
}
