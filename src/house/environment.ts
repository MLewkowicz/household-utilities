import * as T from 'three';
import {batch,group,mesh,cylinder} from './scene-geometry';

const random=(seed:number)=>{const n=Math.sin(seed*127.1+311.7)*43758.5453;return n-Math.floor(n);};

/** A modeled landscape in the house's coordinate system, outside its turn pivot. */
export function createEnvironment(scene:T.Scene,camera:T.OrthographicCamera) {
  const root=new T.Group();root.name='house-landscape-3d';scene.add(root);
  // Align the clearing with the view, while retaining the house's own azimuth.
  const land=group(root);land.rotation.y=Math.atan2(6,24.9);
  const stationary=group(land),ranges=group(land,0,-2.1,0,true),wind:{crown:T.Group;phase:number}[]=[];
  const ground=mesh(stationary,new T.PlaneGeometry(180,180),'#82986c',0,-.365,68);
  ground.rotation.x=-Math.PI/2;ground.castShadow=false;

  function rock(parent:T.Object3D,color:string,x:number,y:number,z:number,sx:number,sy:number,sz:number,seed:number) {
    const geometry=new T.IcosahedronGeometry(1,1);geometry.computeVertexNormals();
    const object=mesh(parent,geometry,color,x,y,z);
    object.scale.set(sx,sy,sz);object.rotation.y=seed;object.castShadow=false;return object;
  }
  function mountain(x:number,z:number,width:number,height:number,seed:number) {
    const vertices:number[]=[],colors:number[]=[],uv:number[]=[];
    const stone=['#7c9082','#8c9b8d','#a49f91','#8a999d','#a7b0ac'].map(c=>new T.Color(c));
    const snow=new T.Color('#eff2ec'),snowShade=new T.Color('#d5e2e7');
    const sides=14,snowy=height>=3.9,snowline=Math.max(.62,3.4/height);
    const radii=[1,.86,.72,.57,.43,.30,.16,0];
    const drift=(random(seed+45)-.5)*width*.42;
    const point=(ring:number,side:number)=>{
      const angle=side*Math.PI*2/sides;
      // Alternating spurs and gullies run down each face. The snow boundary
      // follows those gullies instead of forming a horizontal painted stripe.
      const line=T.MathUtils.clamp(snowline+Math.sin(angle*3+seed)*.07+Math.cos(angle*5-seed)*.045,.57,.88);
      const levels=[0,.13,.28,.42,.51,line,(line+1)/2,1];
      const t=levels[ring],rib=1+(side%2?.10:-.09);
      const radius=radii[ring]*rib*(.91+random(seed+side*7)*.18);
      const shoulder=ring>0&&ring<5?(random(seed+side*3)-.5)*.065:0;
      return new T.Vector3(Math.cos(angle)*width*radius+drift*t*t,
        height*(t+shoulder),Math.sin(angle)*width*.47*radius+width*.09*Math.sin(seed)*t);
    };
    for(let r=0;r<radii.length-1;r++)for(let side=0;side<sides;side++) {
      const a=point(r,side),b=point(r,(side+1)%sides),c=point(r+1,(side+1)%sides),d=point(r+1,side);
      // One fan at the summit avoids duplicate, zero-area triangles.
      const triangles=r===radii.length-2?[[a,d,b]]:[[a,d,b],[b,d,c]];
      for(const triangle of triangles){
        const shade=snowy&&r>=5?snow.clone().lerp(snowShade,(side%4)*.13):stone[r<2?r:2+Math.floor((side+seed)%6/2)].clone();
        shade.multiplyScalar(.96+random(seed+side*13+r)*.08);
        for(const p of triangle){vertices.push(p.x,p.y,p.z);colors.push(shade.r,shade.g,shade.b);uv.push(0,0);}
      }
    }
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();
    const peak=new T.Mesh(geometry,new T.MeshLambertMaterial({vertexColors:true}));peak.position.set(x,-.40,z);ranges.add(peak);
  }
  // Unequal summits and lower side ridges make a continuous range. All snow
  // and rock faces are joined in one mesh, with no overlaid texture or shell.
  const summits=[[-27,-28,7,5.2],[-17,-27,6.3,5.9],[-6.6,-26,5.6,5.2],[.4,-29,5.9,4.2],[7.2,-27,5.8,5.7],[17,-29,7.2,5.3],[28,-28,7.8,6.1]];
  const shoulders=[[-11,-25,3.2,3.6],[-3.8,-26,2.9,4.1],[4.6,-26,3.1,4.3],[12,-27,3.8,3.7]];
  [...summits,...shoulders].forEach(([x,z,w,h],i)=>mountain(x,z,w,h,20+i));
  batch(ranges);
  // Keep the front of the mountain/foothill geometry behind the treeline.
  // Their previous footprints overlapped, cutting through the left pines.
  for(let i=0;i<12;i++)rock(stationary,i%2?'#91a385':'#879c82',-32+i*6,-.5,-23-random(i)*2,5.2,1.2+random(i+20),2.6,i);

  function tree(x:number,z:number,height:number,seed:number,pine:boolean,animated=false) {
    const trunk=group(stationary,x,-.35,z);
    cylinder(trunk,'#92765c',height*.055,height*.65,0,height*.325,0,height*.035);
    const crown=group(animated?land:trunk,animated?x:0,animated?-.35:0,animated?z:0,animated);
    if(pine){
      for(let tier=0;tier<5;tier++) {
        const radius=height*(.31-tier*.047),length=height*(.35-tier*.024);
        const profile=[[0,0],[radius*.80,0],[radius,length*.10],[radius*.69,length*.32],[radius*.44,length*.65],[0,length]].map(([r,y])=>new T.Vector2(r,y-length/2));
        const foliageGeometry=new T.LatheGeometry(profile,7);foliageGeometry.computeVertexNormals();
        const foliage=mesh(crown,foliageGeometry,'#'+['66896b','739678','80a081','8da98a','9bb493'][tier],0,height*(.34+tier*.135),0);
        foliage.rotation.y=tier*.47+seed;
      }
    } else {
      for(let i=0;i<6;i++) {
        const angle=i*2.4,radius=i===5?0:height*.19;
        const leaf=rock(crown,['#849d69','#9caf79','#a5b780'][i%3],Math.cos(angle)*radius,height*(.65+(i===5?.21:random(seed+i)*.16)),Math.sin(angle)*radius,height*.27,height*.30,height*.27,seed+i);
        leaf.castShadow=true;
      }
      for(let i=0;i<3;i++){
        const branch=cylinder(trunk,'#92765c',height*.027,height*.30,Math.sin(i*2.1)*height*.07,height*.55,Math.cos(i*2.1)*height*.07,height*.014);
        branch.rotation.z=Math.sin(i*2.1)*.6;branch.rotation.x=Math.cos(i*2.1)*.6;
      }
    }
    if(animated){batch(crown);wind.push({crown,phase:seed});}
  }
  // Trees frame the clearing without occupying the space swept by the house.
  [[-7.5,-5,4.8,0],[-8.7,-9,5.7,1],[-6.5,-12,3.8,1],[7.9,-6.5,5.1,1],[7,-11,3.9,0],[10,-10,5.6,1]].forEach(([x,z,h,pine],i)=>tree(x,z,h,i+1,!!pine,i<4));
  for(let i=0;i<22;i++){
    const x=-26+i*2.5,z=-13.8-random(i+40)*1.4;
    tree(x,z,1.1+random(i+90)*1.8,40+i,i%4!==0);
  }
  // Small ground details have the same quiet bevels and facets as the house.
  for(const [x,z,size] of [[-6.9,3.6,.54],[7.2,1,.68],[-8,-2,.44],[9,4,.7],[-10,7,.65],[7.5,7,.35],[-5.8,13,.46],[6,16,.6]]){
    rock(stationary,'#c2bea5',x,-.26+size*.30,z,size,size*.54,size*.7,x);
    rock(stationary,'#b2b49b',x+.65,-.30+size*.17,z+.2,size*.40,size*.28,size*.45,z);
    for(let j=0;j<4;j++){
      const blade=mesh(stationary,new T.ConeGeometry(.055,.28+random(j)*.16,3),'#819760',x-.5+j*.13,-.15,z+.2+Math.sin(j)*.18);blade.rotation.z=(j-1.5)*.18;blade.castShadow=false;
    }
  }
  batch(stationary);

  // Sky is rendered with the same WebGL frame, without a bitmap or CSS overlay.
  const skyMaterial=new T.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,uniforms:{top:{value:new T.Color('#bfd5d9')},bottom:{value:new T.Color('#f0dfbd')}},vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,1.0,1.0);}',fragmentShader:'uniform vec3 top;uniform vec3 bottom;varying vec2 vUv;void main(){gl_FragColor=vec4(mix(bottom,top,smoothstep(0.2,1.0,vUv.y)),1.0);\n#include <colorspace_fragment>\n}'});
  const sky=new T.Mesh(new T.PlaneGeometry(2,2),skyMaterial);sky.frustumCulled=false;sky.renderOrder=-100;root.add(sky);
  const skyDay=new T.Color('#bfd5d9'),horizonDay=new T.Color('#f0dfbd'),skyNight=new T.Color('#14243c'),horizonNight=new T.Color('#596479');
  const sunMaterial=new T.MeshBasicMaterial({color:'#ffe7a1',toneMapped:false});
  const sun=new T.Mesh(new T.IcosahedronGeometry(.46,2),sunMaterial);root.add(sun);
  const moon=group(root);moon.name='modeled-moon';
  const moonBody=mesh(moon,new T.IcosahedronGeometry(.42,2),'#dce3df');moonBody.castShadow=false;moonBody.receiveShadow=false;moonBody.material.emissive.set('#8796ac');moonBody.material.emissiveIntensity=.35;
  for(const [x,y,r] of [[-.13,.13,.075],[.15,-.05,.10],[-.04,-.18,.045]]){
    const crater=mesh(moon,new T.CircleGeometry(r,9),'#aebdc5',x,y,Math.sqrt(.42**2-x*x-y*y)+.002);crater.castShadow=false;crater.receiveShadow=false;
  }
  const starsMaterial=new T.MeshBasicMaterial({color:'#dce8f4',transparent:true,opacity:0,depthWrite:false,toneMapped:false});
  const stars=new T.InstancedMesh(new T.IcosahedronGeometry(.021,0),starsMaterial,54);stars.name='modeled-stars';root.add(stars);
  const meteorMaterial=new T.MeshBasicMaterial({color:'#cfdeeb',transparent:true,opacity:0,depthWrite:false,toneMapped:false});
  const meteor=new T.Mesh(new T.ConeGeometry(.017,1.25,5),meteorMaterial);meteor.name='shooting-star';root.add(meteor);
  const clouds:T.Group[]=[];
  for(let i=0;i<3;i++){
    const cloud=group(root);cloud.name='modeled-cloud';
    for(let j=0;j<5;j++){
      const puff=rock(cloud,'#e4e3d4',(j-2)*.34,Math.sin(j*1.9)*.10,0,.50,.19+random(j+i)*.16,.24,i+j);puff.receiveShadow=false;
    }
    batch(cloud);clouds.push(cloud);
  }
  const right=new T.Vector3(),up=new T.Vector3(),forward=new T.Vector3(),dummy=new T.Object3D();
  const skyDepth=camera.position.distanceTo(new T.Vector3(0,3.95,.1))+42;
  const cloudPositions=[[-.73,.85],[.2,.91],[.84,.72]];
  function screenPosition(object:T.Object3D,x:number,y:number,depth:number) {
    object.position.copy(camera.position).addScaledVector(forward,depth).addScaledVector(right,x*(camera.right-camera.left)/2).addScaledVector(up,y*(camera.top-camera.bottom)/2);
  }
  let lastSpan=0,lastWidth=0;
  function tick(time:number,night:number,cinema:number,still:boolean) {
    const shade=Math.max(night,cinema*.78),span=camera.top-camera.bottom,width=camera.right-camera.left,portrait=span>18;
    camera.getWorldDirection(forward);right.setFromMatrixColumn(camera.matrixWorld,0);up.setFromMatrixColumn(camera.matrixWorld,1);
    skyMaterial.uniforms.top.value.copy(skyDay).lerp(skyNight,shade);
    skyMaterial.uniforms.bottom.value.copy(horizonDay).lerp(horizonNight,shade);
    screenPosition(sun,-.73,(portrait?.47:.67)-T.MathUtils.smoothstep(night,0,.60)*1.1,skyDepth);
    screenPosition(moon,-.73,(portrait?.47:.67)-(1-T.MathUtils.smoothstep(night,.40,1))*1.1,skyDepth);moon.quaternion.copy(camera.quaternion);
    sun.visible=night<.60;moon.visible=night>.40;
    starsMaterial.opacity=T.MathUtils.smoothstep(shade,.35,1)*.78;stars.visible=starsMaterial.opacity>0;
    if(lastSpan!==span||lastWidth!==width){
      for(let i=0;i<54;i++){
        screenPosition(dummy,random(i+100)*1.92-.96,.20+random(i+200)*.76,skyDepth+6);dummy.scale.setScalar(.6+random(i+300));dummy.updateMatrix();stars.setMatrixAt(i,dummy.matrix);
      }
      stars.instanceMatrix.needsUpdate=true;lastSpan=span;lastWidth=width;
    }
    // Keep the ridge visible above the roof on tall screens. Its base stays
    // planted behind the same foothills; only the distant summit heights vary.
    ranges.scale.y=T.MathUtils.lerp(.95,1.45,T.MathUtils.smoothstep(span,16,29));
    const passing=(time+7)%23;
    meteor.visible=!still&&night>.9&&passing<1.2;
    if(meteor.visible){screenPosition(meteor,.5+passing*.27,.79-passing*.18,skyDepth+4);meteor.quaternion.copy(camera.quaternion);meteor.rotateZ(-2.2);meteorMaterial.opacity=Math.sin(passing/1.2*Math.PI)*.6;}
    clouds.forEach((cloud,i)=>{screenPosition(cloud,cloudPositions[i][0]+(still?0:Math.sin(time*.025+i)*.045),cloudPositions[i][1],skyDepth-2);cloud.quaternion.copy(camera.quaternion);});
    wind.forEach(({crown,phase})=>{crown.rotation.z=still?0:Math.sin(time*.55+phase)*.012;});
  }
  return {tick,destroy(){stars.dispose();},diagnostics:()=>({kind:'modeled-3d',trees:28,mountains:summits.length+shoulders.length,groundY:-.365,windTrees:wind.length,sunVisible:sun.visible,moonVisible:moon.visible,starsOpacity:starsMaterial.opacity,meteorVisible:meteor.visible})};
}
