import {clamp,lerp,smooth} from './mood.mjs';
import {CHARACTERS} from './characters.mjs';

const TAU=Math.PI*2;
// Every note by the same author shares the expensive, immutable skin overlays.
const preparedFaces=new WeakMap();
let steamSprite;
function path(ctx,points){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();}
function heart(ctx,x,y,size,angle=0){ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(size/32,size/32);ctx.beginPath();ctx.moveTo(0,13);ctx.bezierCurveTo(-5,7,-17,0,-15,-8);ctx.bezierCurveTo(-13,-17,-3,-18,0,-10);ctx.bezierCurveTo(3,-18,13,-17,15,-8);ctx.bezierCurveTo(17,0,5,7,0,13);ctx.closePath();ctx.fill();ctx.restore();}
// Matching point order lets the open eye continuously become a heart without
// stacking a heart over a baked-in eye or dissolving between whole portraits.
function eyeShape(ctx,cx,cy,heartAmount,blink,angry,side,delight=0){
  const points=[];const hw=70,hh=34;
  for(let i=0;i<96;i++){
    const t=TAU*i/96;
    const nx=-Math.sin(t),ny=-Math.cos(t);
    const ex=cx+nx*hw,ey=cy+ny*hh*(1-blink*.94)*(1-angry*.3)-side*nx*angry*18-delight*42*Math.max(0,ny)*(1-blink*.94);
    const hx=cx-16*Math.pow(Math.sin(t),3)*4.45;
    const hy=cy-(13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t))*3.5;
    points.push([lerp(ex,hx,heartAmount),lerp(ey,hy,heartAmount)]);
  }
  path(ctx,points);
}

export class AvatarRenderer{
  constructor(canvas,small,base,original,character='michal'){
    this.expression=null;this.character=CHARACTERS[character];if(!this.character)throw new Error('Unknown avatar character');
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.small=small;this.smallCtx=small?.getContext('2d');this.base=base;this.original=original;
    this.steam=[];this.vapor=[];this.floating=[];this.emit=0;this.vaporEmit=0;this.heartEmit=0;this.time=0;this.frames=0;this.lastMini=0;this.width=0;this.height=0;
    if(!steamSprite){
      steamSprite=document.createElement('canvas');steamSprite.width=96;steamSprite.height=96;
      const s=steamSprite.getContext('2d');const g=s.createRadialGradient(48,48,0,48,48,48);g.addColorStop(0,'rgba(253,255,252,.80)');g.addColorStop(.38,'rgba(244,253,249,.64)');g.addColorStop(.72,'rgba(225,244,238,.18)');g.addColorStop(1,'rgba(225,244,238,0)');s.fillStyle=g;s.fillRect(0,0,96,96);
    }
    this.sprite=steamSprite;
    let prepared=preparedFaces.get(base);
    if(!prepared){const angerTint=this.makeAngerTint();prepared={angerTint,foreground:this.foreground};preparedFaces.set(base,prepared);}
    this.angerTint=prepared.angerTint;this.foreground=prepared.foreground;
    this.metrics={frames:0,steam:0,hearts:0,lastDrawMs:0,earAnchors:[],lastParticleSamples:[]};
    this.resize();
  }
  resize(){const width=this.canvas.clientWidth,height=this.canvas.clientHeight;this.width=width;this.height=height;const dpr=Math.min(devicePixelRatio||1,1.7);this.canvas.width=Math.max(1,Math.round(width*dpr));this.canvas.height=Math.max(1,Math.round(height*dpr));this.dpr=dpr;this.scale=Math.min(width*.70,height*.88)/1000;this.cx=width/2;this.cy=height*.52;}
  makeAngerTint(){
    // Build once from the faceplate's skin colors. The cached overlay follows
    // forehead, cheeks, nose and ears without coloring hair or the background.
    const size=Math.min(1000,this.base.naturalWidth||1000);
    const layer=document.createElement('canvas');layer.width=size;layer.height=size;
    const ctx=layer.getContext('2d',{willReadFrequently:true});ctx.drawImage(this.base,0,0,size,size);
    const pixels=ctx.getImageData(0,0,size,size),data=pixels.data;
    const foreground=new ImageData(new Uint8ClampedArray(data),size,size);
    const [r0,r1,rg0,rg1,gb0,gb1]=this.character.skin;
    for(let i=0;i<data.length;i+=4){
      const r=data[i],g=data[i+1],b=data[i+2],y=Math.floor(i/4/size)*1000/size;
      const skin=smooth(r0,r1,r)*smooth(rg0,rg1,r-g)*smooth(gb0,gb1,g-b)*smooth(230,275,y);
      // Keep bangs and glasses in front of the moving features.
      foreground.data[i+3]=Math.round(foreground.data[i+3]*(1-smooth(85,125,r)));
      data[i]=Math.round(r*.96);data[i+1]=Math.round(g*.27);data[i+2]=Math.round(b*.32);
      data[i+3]=Math.round(data[i+3]*skin);
    }
    ctx.putImageData(pixels,0,0);
    this.foreground=document.createElement('canvas');this.foreground.width=size;this.foreground.height=size;
    this.foreground.getContext('2d').putImageData(foreground,0,0);return layer;
  }
  resetSteam(){this.steam.length=0;this.vapor.length=0;this.emit=0;this.vaporEmit=0;}
  resetParticles(){this.resetSteam();this.floating.length=0;this.heartEmit=0;}
  emitSteam(power){
    for(const side of [-1,1]){
      if(this.steam.length>=160)break;
      const spread=(Math.random()-.5)*(32+power*28);
      this.steam.push({side,x:this.character.ears[side<0?0:1],y:this.character.ears[2]+Math.random()*6,vx:side*(440+power*440+Math.random()*170),vy:spread,age:0,life:.45+Math.random()*.36,size:9+Math.random()*10,seed:Math.random()*TAU});
    }
  }
  emitVapor(power){
    for(const [x,y] of this.character.vapor){
      if(this.vapor.length>=48)break;
      this.vapor.push({x:x+(Math.random()-.5)*18,y,vx:(Math.random()-.5)*18,vy:-(105+power*45+Math.random()*25),age:0,life:1.15+Math.random()*.30,size:11+Math.random()*9,seed:Math.random()*TAU});
    }
  }
  update(dt,mood,effects){
    this.time+=dt;
    const power=effects.steam?mood.steam:0;
    if(power>.01){
      // Closely spaced pulses form a narrow outward jet at each ear. Expansion
      // happens downstream; upward curl begins only after the horizontal burst.
      const pulse=.72+.28*Math.pow(Math.sin(this.time*.012),2);
      this.emit+=dt/1000*(9+power*64)*pulse;
      while(this.emit>=1){this.emit--;this.emitSteam(power);}
    }else this.emit=0;
    for(const p of this.steam){p.age+=dt/1000;p.x+=p.vx*dt/1000;p.y+=p.vy*dt/1000;if(p.age>.16)p.vy-=155*dt/1000;p.vx*=Math.exp(-dt/2300);}
    this.steam=this.steam.filter(p=>p.age<p.life&&Math.abs(p.x-500)<1500);
    const rising=effects.steam?mood.risingSteam:0;
    if(rising>.01){this.vaporEmit+=dt/1000*(3+rising*7);while(this.vaporEmit>=1){this.vaporEmit--;this.emitVapor(rising);}}
    else this.vaporEmit=0;
    for(const p of this.vapor){p.age+=dt/1000;p.x+=p.vx*dt/1000;p.y+=p.vy*dt/1000;p.vy-=18*dt/1000;}
    this.vapor=this.vapor.filter(p=>p.age<p.life);
    if(effects.hearts&&mood.love>.25){this.heartEmit+=dt/1000*(.7+mood.love*4.5);while(this.heartEmit>=1){this.heartEmit--;if(this.floating.length<20)this.floating.push({side:Math.random()>.5?1:-1,x:500+(Math.random()>.5?1:-1)*(260+Math.random()*70),y:460+Math.random()*190,age:0,life:1.6+Math.random()*.6,size:21+Math.random()*23,seed:Math.random()*TAU});}}
    else this.heartEmit=0;
    for(const p of this.floating){p.age+=dt/1000;p.y-=(95+mood.love*45)*dt/1000;}
    this.floating=this.floating.filter(p=>p.age<p.life);
    if(!effects.steam)this.resetSteam();if(!effects.hearts)this.floating.length=0;
  }
  draw(mood,effects,{dt=0,animate=false,compare=false}={}){
    const start=performance.now();if(animate)this.update(Math.min(dt,50),mood,effects);
    const ctx=this.ctx;ctx.setTransform(this.dpr,0,0,this.dpr,0,0);ctx.clearRect(0,0,this.width,this.height);
    const shake=animate&&effects.steam?Math.sin(this.time*.055)*mood.steam*mood.steam*2:0;
    const bob=animate?Math.sin(this.time*.0017)*(1+mood.love*4):0;
    const reactionTilt=this.expression==='disappointed'&&animate?Math.sin(this.time*.012)*.09:this.expression==='crying-laughing'&&animate?Math.sin(this.time*.018)*.045:0;
    const tilt=compare?0:reactionTilt+mood.love*(.025+(animate?Math.sin(this.time*.0018)*.04:0));
    ctx.save();ctx.translate(this.cx+shake,this.cy+bob);ctx.rotate(tilt);ctx.scale(this.scale,this.scale);ctx.translate(-500,-500);
    const power=effects.steam?mood.steam:0;
    if(!compare&&power>.01)this.drawSteam(ctx,power,animate);
    if(!compare&&effects.steam&&mood.risingSteam>.01)this.drawRisingSteam(ctx,mood.risingSteam,animate);
    ctx.drawImage(compare?this.original:this.base,0,0,1000,1000);
    if(!compare){
      if(effects.blush)this.drawBlush(ctx,mood);
      this.drawFace(ctx,mood,effects,animate);
      if(effects.hearts&&mood.love>.22)this.drawHearts(ctx,mood,animate);
    }
    ctx.restore();
    if(this.small&&(this.time-this.lastMini>65||!animate||this.frames===0)){this.drawMini(mood,effects,compare,animate);this.lastMini=this.time;}
    this.frames++;this.metrics={frames:this.frames,steam:this.steam.length,risingSteam:this.vapor.length,hearts:this.floating.length,lastDrawMs:performance.now()-start,earAnchors:[{x:this.character.ears[0],y:this.character.ears[2]},{x:this.character.ears[1],y:this.character.ears[2]}],lastParticleSamples:this.steam.slice(-4).map(({side,x,y,vx,age})=>({side,x,y,vx,age})),lastRisingSamples:this.vapor.slice(-3).map(({x,y,vy,age})=>({x,y,vy,age}))};
  }
  drawSteam(ctx,power,animate){
    ctx.save();
    for(const side of [-1,1]){
      const ex=this.character.ears[side<0?0:1],ey=this.character.ears[2]+2;
      ctx.save();ctx.translate(ex,ey);ctx.scale(side,1);
      const pulse=animate?.88+.12*Math.sin(this.time*.024):1;
      const length=(45+power*125)*pulse;
      const cone=ctx.createLinearGradient(0,0,length,0);cone.addColorStop(0,`rgba(255,255,245,${.62*power})`);cone.addColorStop(.18,`rgba(246,255,251,${.60*power})`);cone.addColorStop(.75,`rgba(234,250,244,${.20*power})`);cone.addColorStop(1,'rgba(234,250,244,0)');
      ctx.fillStyle=cone;ctx.beginPath();ctx.moveTo(-5,-4);ctx.bezierCurveTo(length*.35,-6,length*.65,-10-power*9,length,-18-power*13);ctx.lineTo(length,18+power*13);ctx.bezierCurveTo(length*.65,10+power*9,length*.35,6,-5,4);ctx.closePath();ctx.fill();
      ctx.lineWidth=1.8;ctx.lineCap='round';
      for(let j=0;j<3;j++){ctx.strokeStyle=`rgba(255,255,249,${(.18+power*.24)*(1-j*.16)})`;ctx.beginPath();ctx.moveTo(3,j*3-3);ctx.quadraticCurveTo(length*.45,j*5-5,length*(.64+j*.11),j*11-11);ctx.stroke();}
      if(!animate){for(let j=0;j<7;j++){const x=24+j*(18+power*11),y=-Math.pow(j,1.65)*1.1,r=12+j*5;ctx.globalAlpha=power*(.7-j*.075);ctx.drawImage(this.sprite,x-r,y-r,r*2,r*2);}}
      ctx.restore();
    }
    if(animate)for(const p of this.steam){const age=p.age/p.life;const r=p.size+p.age*(64+power*42);const curl=Math.sin(p.seed+p.age*11)*p.age*18;ctx.globalAlpha=clamp((1-age)*power*.80)*smooth(0,.035,p.age);ctx.drawImage(this.sprite,p.x-r,p.y+curl-r,r*2,r*2);}
    ctx.restore();
  }
  drawRisingSteam(ctx,power,animate){
    ctx.save();ctx.lineCap='round';
    // These softer curls rise behind the hair; the ear jets stay horizontal.
    for(const [i,[x,y]] of this.character.vapor.entries()){
      ctx.save();ctx.translate(x,y);
      const sway=animate?Math.sin(this.time*.0022+i*1.8)*13:0;
      const g=ctx.createLinearGradient(0,0,0,-245);
      g.addColorStop(0,'rgba(235,251,244,0)');g.addColorStop(.23,`rgba(235,251,244,${power*.25})`);g.addColorStop(.62,`rgba(246,255,250,${power*.19})`);g.addColorStop(1,'rgba(246,255,250,0)');
      ctx.strokeStyle=g;ctx.lineWidth=17;
      ctx.beginPath();ctx.moveTo(0,12);ctx.bezierCurveTo(-40+sway,-50,40+sway,-95,8,-138);ctx.bezierCurveTo(-28-sway,-179,24-sway,-206,8,-245);ctx.stroke();
      ctx.lineWidth=6;ctx.stroke();
      if(!animate)for(let j=0;j<8;j++){const r=17+j*4;ctx.globalAlpha=power*Math.sin(j/8*Math.PI)*.5;ctx.drawImage(this.sprite,Math.sin(j*1.2+i)*15-r,-j*28-r,r*2,r*2);}
      ctx.restore();
    }
    if(animate)for(const p of this.vapor){
      const age=p.age/p.life,r=p.size+p.age*32;
      const curl=Math.sin(p.seed+p.age*5)*p.age*22;
      ctx.globalAlpha=smooth(0,.13,age)*(1-smooth(.42,1,age))*power*.68;
      ctx.drawImage(this.sprite,p.x+curl-r,p.y-r,r*2,r*2);
    }
    ctx.restore();
  }
  drawBlush(ctx,m){
    if(m.heat>.001){ctx.save();ctx.globalAlpha=m.heat*.85;ctx.drawImage(this.angerTint,0,0,1000,1000);ctx.restore();}
    const strength=m.blush*.92+m.heat*.38;if(strength<.005)return;
    const color=m.anger?'221,44,32':'222,52,111';
    const [left,right,cheekY]=this.character.cheeks;
    for(const x of [left,right]){
      const radius=91+m.blush*9;
      const g=ctx.createRadialGradient(x,cheekY,0,x,cheekY,radius);
      g.addColorStop(0,`rgba(${color},${strength})`);
      g.addColorStop(.38,`rgba(${color},${strength*.9})`);
      g.addColorStop(.68,`rgba(${color},${strength*.46})`);
      g.addColorStop(1,`rgba(${color},0)`);
      ctx.save();ctx.translate(x,cheekY);ctx.scale(1,.64);ctx.translate(-x,-cheekY);
      ctx.fillStyle=g;ctx.fillRect(x-radius,cheekY-radius,radius*2,radius*2);ctx.restore();
    }
    // A small rosy nose glow connects the two cheek patches at full affection.
    if(m.blush>.01){const [x,y]=this.character.nose;const g=ctx.createRadialGradient(x,y,2,x,y,31);g.addColorStop(0,`rgba(224,63,105,${m.blush*.23})`);g.addColorStop(1,'rgba(224,63,105,0)');ctx.fillStyle=g;ctx.fillRect(x-31,y-31,62,62);}
  }
  drawFace(ctx,m,effects,animate){
    if(this.expression){this.drawReactionFace(ctx,this.expression,animate);return;}
    const heartAmount=effects.hearts?m.hearts:0;
    const phase=(this.time%5200)/5200;
    const blink=animate&&phase>.945?Math.pow(Math.sin((phase-.945)/.055*Math.PI),2)*(1-heartAmount):0;
    const delight=smooth(.05,.65,m.love);
    const beat=animate?Math.pow(Math.max(0,Math.sin(this.time*.0055)),6):0;
    for(const side of [-1,1]){
      const cx=this.character.eyeX+side*this.character.eyeGap,cy=this.character.eyeY;
      ctx.save();ctx.translate(cx,cy);const pulse=(1+heartAmount*beat*.075)*this.character.eyeScale;ctx.scale(pulse,pulse);ctx.translate(-cx,-cy);
      ctx.save();eyeShape(ctx,cx,cy,heartAmount,blink,m.anger,side,delight);
      ctx.fillStyle=`rgb(${Math.round(lerp(250,223,heartAmount))},${Math.round(lerp(241,73,heartAmount))},${Math.round(lerp(224,107,heartAmount))})`;ctx.fill();
      ctx.save();ctx.clip();ctx.globalAlpha=1-smooth(.28,.85,heartAmount);
      const g=ctx.createRadialGradient(cx-8,cy-10,1,cx,cy,34);g.addColorStop(0,this.character.iris[0]);g.addColorStop(1,this.character.iris[1]);ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(cx,cy,33,37*(1-blink*.9),0,0,TAU);ctx.fill();ctx.fillStyle='#201e17';ctx.beginPath();ctx.ellipse(cx,cy-5,19,25*(1-blink*.9),0,0,TAU);ctx.fill();ctx.fillStyle='#fffdf5';ctx.beginPath();ctx.ellipse(cx-12,cy-19,9,9*(1-blink*.9),0,0,TAU);ctx.fill();ctx.restore();
      ctx.globalAlpha=1-heartAmount;ctx.strokeStyle='#211c18';ctx.lineWidth=13;ctx.lineCap='round';ctx.beginPath();const slant=-m.anger*side*18;ctx.moveTo(cx-65,cy-5-slant);ctx.quadraticCurveTo(cx,cy-72*(1-blink*.94)+m.anger*30,cx+65,cy-5+slant);ctx.stroke();ctx.restore();
      if(heartAmount>.01){ctx.save();ctx.globalAlpha=heartAmount*.55;ctx.fillStyle='#ffd3df';ctx.beginPath();ctx.ellipse(cx-26,cy-21,7,13,-.5,0,TAU);ctx.fill();ctx.restore();}
      ctx.restore();
      this.drawBrow(ctx,side,m,animate);
    }
    this.drawMouth(ctx,m,animate);
    if(this.character.occlusion)ctx.drawImage(this.foreground,0,0,1000,1000);
  }
  drawReactionFace(ctx,expression,animate){
    const c=this.character,laugh=expression==='crying-laughing'||expression==='gentle-laughing',big=expression==='crying-laughing';
    const pulse=animate?Math.sin(this.time*.018):0;
    ctx.save();ctx.strokeStyle='#35251f';ctx.lineWidth=12;ctx.lineCap='round';ctx.lineJoin='round';
    for(const side of [-1,1]){
      const x=c.eyeX+side*c.eyeGap,y=c.eyeY;
      ctx.save();ctx.translate(x,y);ctx.scale(c.eyeScale,c.eyeScale);
      if(laugh||expression==='disappointed'||expression==='vomit'){
        ctx.beginPath();ctx.moveTo(-58,5);ctx.quadraticCurveTo(0,laugh?-50:expression==='vomit'?-18:25,58,5);ctx.stroke();
      }else{
        const h=expression==='mogging'?14:side<0?30:18;
        ctx.fillStyle='#fff5e5';ctx.beginPath();ctx.ellipse(0,0,61,h,0,0,TAU);ctx.fill();ctx.stroke();ctx.fillStyle=c.iris[0];ctx.beginPath();ctx.ellipse(expression==='confused'?14:0,0,18,h*.85,0,0,TAU);ctx.fill();ctx.fillStyle='#211b17';ctx.beginPath();ctx.arc(expression==='confused'?14:0,0,9,0,TAU);ctx.fill();
      }
      if(big){ctx.fillStyle='#74c5e0';ctx.beginPath();const drop=20+(animate?(1+pulse)*12:0);ctx.moveTo(side*64,20);ctx.bezierCurveTo(side*100,drop+35,side*94,drop+80,side*62,drop+70);ctx.bezierCurveTo(side*42,drop+60,side*49,drop+30,side*64,20);ctx.fill();}
      ctx.restore();
      const raised=expression==='confused'&&side<0;
      ctx.save();ctx.translate(x,c.browY-(raised?48:laugh?18:0));ctx.rotate(expression==='mogging'?-side*.12:expression==='disappointed'?side*.16:raised?-.12:0);ctx.strokeStyle=c.browColor[0];ctx.lineWidth=c.browStyle==='bold'?24:17;ctx.beginPath();ctx.moveTo(-65,8);ctx.quadraticCurveTo(0,raised?-32:-15,65,6);ctx.stroke();ctx.restore();
    }
    if(c.occlusion&&expression==='vomit')ctx.drawImage(this.foreground,0,0,1000,1000);
    ctx.save();ctx.translate(c.mouthX,c.mouthY);ctx.scale(c.mouthScale,c.mouthScaleY||c.mouthScale);
    ctx.strokeStyle='#513424';ctx.lineWidth=12;ctx.beginPath();
    if(laugh){const w=big?112:78,h=big?125+pulse*10:48;ctx.moveTo(-w,-10);ctx.quadraticCurveTo(0,15,w,-10);ctx.quadraticCurveTo(0,h,-w,-10);ctx.fillStyle='#482c28';ctx.fill();ctx.stroke();ctx.fillStyle='#fff8e8';ctx.beginPath();ctx.moveTo(-w+8,-5);ctx.quadraticCurveTo(0,18,w-8,-5);ctx.lineTo(w-20,15);ctx.quadraticCurveTo(0,37,-w+20,15);ctx.fill();}
    else if(expression==='vomit'){ctx.fillStyle='#514a28';ctx.ellipse(0,8,50,35,0,0,TAU);ctx.fill();ctx.stroke();ctx.fillStyle='#a0bc5e';ctx.beginPath();ctx.moveTo(-33,15);ctx.bezierCurveTo(-20,70,-70,100,-50,145+pulse*10);ctx.quadraticCurveTo(0,173,55,147);ctx.bezierCurveTo(75,105,23,65,33,15);ctx.closePath();ctx.fill();ctx.strokeStyle='#cfdf8b';ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(-8,36);ctx.quadraticCurveTo(-27,95,-14,122);ctx.stroke();}
    else if(expression==='mogging'){ctx.moveTo(-72,4);ctx.quadraticCurveTo(15,30,91,-23);ctx.stroke();ctx.lineWidth=6;ctx.globalAlpha=.48;ctx.beginPath();ctx.moveTo(-150,0);ctx.lineTo(-105,120);ctx.lineTo(0,155);ctx.lineTo(105,120);ctx.lineTo(150,0);ctx.stroke();}
    else if(expression==='confused'){ctx.moveTo(-62,15);ctx.quadraticCurveTo(0,-4,62,8);ctx.stroke();}
    else{ctx.moveTo(-70,14);ctx.quadraticCurveTo(0,-28,70,14);ctx.stroke();}
    ctx.restore();if(c.occlusion&&expression!=='vomit')ctx.drawImage(this.foreground,0,0,1000,1000);ctx.restore();
  }
  drawBrow(ctx,side,m,animate){
    const cx=this.character.eyeX+side*this.character.eyeGap;
    const lift=m.love*(43+(side<0?9:0)+(animate?Math.sin(this.time*.0026+side*.4)*6:0));
    ctx.save();ctx.translate(cx,this.character.browY-lift+m.anger*19);ctx.rotate(-side*m.anger*.31+side*m.love*.10);ctx.scale(this.character.browScale,this.character.browScale);
    const left=[[-91,26],[-56,-25],[-24,-16],[14,-7],[80,2],[86,26],[82,32],[14,22],[-27,17],[-58,13],[-87,32]];
    const right=[[-86,15],[-20,0],[55,-19],[90,23],[88,30],[58,17],[22,25],[-78,39],[-86,35]];
    if(this.character.browStyle==='michal')path(ctx,side<0?left:right);
    else {const thick=this.character.browStyle==='bold'?26:14;ctx.scale(side<0?1:-1,1);ctx.beginPath();ctx.moveTo(-78,12);ctx.bezierCurveTo(-62,-21,18,-23,70,-11);ctx.bezierCurveTo(83,-8,85,thick,69,thick-1);ctx.bezierCurveTo(8,thick-9,-40,thick-12,-72,thick+5);ctx.quadraticCurveTo(-88,thick+10,-78,12);ctx.closePath();}
    const g=ctx.createLinearGradient(0,-28,0,36);g.addColorStop(0,this.character.browColor[0]);g.addColorStop(1,this.character.browColor[1]);ctx.fillStyle=g;ctx.fill();ctx.restore();
  }
  drawMouth(ctx,m,animate){
    const angry=m.anger,love=m.love,half=82+love*35+angry*8;
    const corner=-love*13+angry*12,curve=love*28-angry*65;
    const opening=smooth(.10,.94,love)*(136+(animate?Math.sin(this.time*.0034)*6*love:0));
    ctx.save();ctx.translate(this.character.mouthX,this.character.mouthY+angry*(this.character.mouthAngryDrop||0));ctx.scale(this.character.mouthScale,this.character.mouthScaleY||this.character.mouthScale);ctx.lineCap='round';ctx.lineJoin='round';
    ctx.lineWidth=14-love*2;ctx.strokeStyle='#513424';
    ctx.beginPath();ctx.moveTo(-half,corner);ctx.quadraticCurveTo(0,corner+curve,half,corner);
    if(opening>.02){
      // A single closed mouth shape replaces the old overlapping smile arcs.
      ctx.quadraticCurveTo(0,corner+curve+opening,-half,corner);ctx.closePath();
      ctx.fillStyle='#482c28';ctx.fill();ctx.stroke();ctx.save();ctx.clip();
      ctx.fillStyle='#fff8e8';ctx.beginPath();ctx.moveTo(-half+2,corner-5);
      ctx.quadraticCurveTo(0,corner+curve-5,half-2,corner-5);ctx.lineTo(half-7,corner+8);
      ctx.quadraticCurveTo(0,corner+curve+34,-half+7,corner+8);ctx.closePath();ctx.fill();
      ctx.globalAlpha=smooth(.55,1,love);ctx.fillStyle='#cb7484';ctx.beginPath();
      ctx.ellipse(0,corner+(curve+opening)/2-3,half*.43,14,0,0,TAU);ctx.fill();ctx.restore();
    }else ctx.stroke();
    ctx.restore();
  }
  drawHearts(ctx,m,animate){
    ctx.save();
    if(animate){for(const p of this.floating){const age=p.age/p.life;ctx.globalAlpha=smooth(0,.12,age)*(1-smooth(.60,1,age))*m.love;ctx.fillStyle=p.side<0?'#e7a2b1':'#edc4ba';heart(ctx,p.x+Math.sin(p.seed+p.age*3)*18,p.y,p.size,Math.sin(p.seed+p.age*2)*.2);}}
    else{ctx.globalAlpha=m.love*.75;ctx.fillStyle='#e6a1b5';heart(ctx,195,430,24,-.2);heart(ctx,819,370,33,.2);heart(ctx,806,695,18,-.2);}
    const joy=smooth(.38,.95,m.love);
    for(const [i,[x,y]] of [[200,355],[792,272],[852,525]].entries()){
      const glimmer=animate?.48+.52*Math.pow(Math.sin(this.time*.0022+i*1.8),2):.8;
      const size=(12+i*3)*(.65+glimmer*.35);
      ctx.globalAlpha=joy*glimmer;ctx.fillStyle='#ffe8b9';
      path(ctx,[[x,y-size],[x+size*.23,y-size*.23],[x+size,y],[x+size*.23,y+size*.23],[x,y+size],[x-size*.23,y+size*.23],[x-size,y],[x-size*.23,y-size*.23]]);ctx.fill();
    }
    ctx.restore();
  }
  drawMini(mood,effects,compare,animate){
    const ctx=this.smallCtx;ctx.clearRect(0,0,144,144);ctx.save();ctx.scale(144/1000,144/1000);ctx.translate(-70,-50);ctx.scale(1.14,1.14);ctx.drawImage(compare?this.original:this.base,0,0,1000,1000);if(!compare){if(effects.blush)this.drawBlush(ctx,mood);this.drawFace(ctx,mood,effects,animate);}ctx.restore();
  }
}
