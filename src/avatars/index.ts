import {AVATAR_ASSETS, type AvatarMember} from './catalog';
import {AvatarRenderer,type AvatarEffects} from './renderer.mjs';
import {clamp,describe,ease,moodFromValue} from './mood.mjs';

export {AVATAR_ASSETS};
export type {AvatarMember,AvatarEffects};
export interface AvatarOptions {
 member:AvatarMember;
 temperature?:number;
 effects?:Partial<AvatarEffects>;
 /** Directory containing this pack's images, relative to the document or absolute. */
 assetBaseUrl?:string;
 signal?:AbortSignal;
 paused?:boolean;
}
// One clock for all visible characters, capped at 30 drawn frames per second.
const playing=new Set<(now:number)=>void>();
let sharedFrame=0,lastFrame=0;
function tickAll(now:number){
 sharedFrame=0;
 if(now-lastFrame>=1000/30-1){lastFrame=now;for(const tick of playing)tick(now);}
 if(playing.size)sharedFrame=requestAnimationFrame(tickAll);
}
function play(tick:(now:number)=>void){playing.add(tick);if(!sharedFrame)sharedFrame=requestAnimationFrame(tickAll);}
function stopPlaying(tick:(now:number)=>void){playing.delete(tick);if(!playing.size){cancelAnimationFrame(sharedFrame);sharedFrame=0;lastFrame=0;}}
const decoded=new Map<string,Promise<HTMLImageElement>>();
function image(url:string):Promise<HTMLImageElement>{
 let pending=decoded.get(url);
 if(!pending){pending=new Promise<HTMLImageElement>((resolve,reject)=>{const img=new Image();img.decoding='async';img.onload=()=>resolve(img);img.onerror=()=>{decoded.delete(url);reject(new Error('Could not load avatar artwork'));};img.src=url;});decoded.set(url,pending);}
 return pending;
}

/** Opt-in animation for a visible canvas. Ordinary tiles should use happy128. */
export async function mountAvatar(canvas:HTMLCanvasElement,options:AvatarOptions){
 const asset=AVATAR_ASSETS[options.member];
 if(!asset)throw new Error('Unknown avatar member');
 options.signal?.throwIfAborted();
 const baseUrl=new URL(options.assetBaseUrl??'./avatars/v1/',document.baseURI);
 const base=await image(new URL(asset.faceplate,baseUrl).href);
 options.signal?.throwIfAborted();
 const renderer=new AvatarRenderer(canvas,null,base,base,options.member);
 const effects:AvatarEffects={steam:true,hearts:true,blush:true,...options.effects};
 const motion=matchMedia('(prefers-reduced-motion: reduce)');
 let target=clamp(Number.isFinite(options.temperature)?options.temperature!:0,-100,100),shown=target;
 let paused=options.paused??false,disposed=false,inView=false,previous=0;
 const canAnimate=()=>!disposed&&!paused&&!motion.matches&&!document.hidden&&inView&&canvas.isConnected;
 const draw=(dt=0)=>{if(!disposed)renderer.draw(moodFromValue(shown),effects,{dt,animate:canAnimate()});};
 const label=()=>{canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`${asset.name}, ${describe(target)[0].toLowerCase()}`);};
 function schedule(){if(canAnimate())play(tick);}
 function stop(){stopPlaying(tick);previous=0;}
 function tick(now:number){if(!canAnimate()){stop();return;}const dt=previous?Math.min(now-previous,50):1000/30;previous=now;shown=ease(shown,target,dt);draw(dt);}
 function refresh(){stop();if(!canAnimate()){shown=target;renderer.resetParticles();}draw();schedule();}
 function visibility(){stop();if(!document.hidden){shown=target;renderer.resetParticles();draw();schedule();}}
 const intersection=new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;if(inView){draw();schedule();}else stop();},{threshold:.01});
 const resize=new ResizeObserver(()=>{if(!disposed){renderer.resize();draw();}});
 function destroy(){if(disposed)return;disposed=true;stop();intersection.disconnect();resize.disconnect();motion.removeEventListener('change',refresh);document.removeEventListener('visibilitychange',visibility);options.signal?.removeEventListener('abort',destroy);renderer.resetParticles();}
 intersection.observe(canvas);resize.observe(canvas);motion.addEventListener('change',refresh);document.addEventListener('visibilitychange',visibility);options.signal?.addEventListener('abort',destroy,{once:true});
 label();draw();
 return {
  setTemperature(value:number,immediate=false){if(disposed)return;target=clamp(Number.isFinite(value)?value:0,-100,100);label();if(immediate||!canAnimate()){shown=target;draw();}schedule();},
  setEffects(next:Partial<AvatarEffects>){if(disposed)return;Object.assign(effects,next);if(!effects.steam)renderer.resetSteam();if(!effects.hearts)renderer.floating.length=0;draw();},
  pause(){if(disposed||paused)return;paused=true;refresh();},
  resume(){if(disposed||!paused)return;paused=false;refresh();},
  destroy,
  getState:()=>({member:options.member,shown,target,paused,disposed,inView,reducedMotion:motion.matches,...renderer.metrics}),
 };
}
export type AvatarController=Awaited<ReturnType<typeof mountAvatar>>;
