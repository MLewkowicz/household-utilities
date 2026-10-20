import {AVATAR_ASSETS,type AvatarMember} from './avatars/catalog';
import type {AvatarController} from './avatars';
import {temperatureLabel} from './bulletin';
import {esc,name} from './ui';

function portrait(member:AvatarMember,temperature:number){
 const asset=AVATAR_ASSETS[member];
 const expression=temperature<=-65?'angry':temperature<-8?'annoyed':temperature<9?'neutral':temperature<65?'grateful':'loving';
 return `./avatars/v1/${asset[expression]}`;
}
export function bulletinCharacter(member:AvatarMember,temperature:number){
 return `<span class="bulletin-character" data-character-member="${member}" data-character-temperature="${temperature}" role="img" aria-label="${name(member)}: ${esc(temperatureLabel(temperature))}"><img src="${portrait(member,temperature)}" alt="" width="256" height="256" loading="lazy" decoding="async"></span>`;
}

let runtime:Promise<typeof import('./avatars')>|undefined;
const loadRuntime=()=>runtime??=(import('./avatars').catch(error=>{runtime=undefined;throw error;}));
type Entry={element:HTMLElement;member:AvatarMember;temperature:number;visible:boolean;abort?:AbortController;canvas?:HTMLCanvasElement;controller?:AvatarController};

/** Only visible notes get a canvas; all others retain a cheap static portrait. */
export function watchBulletinCharacters(root:HTMLElement){
 const entries=new Map<HTMLElement,Entry>();
 let active=false,paused=false;
 function fallback(entry:Entry){const img=entry.element.querySelector('img')!,src=portrait(entry.member,entry.temperature);if(img.getAttribute('src')!==src)img.src=src;}
 function unmount(entry:Entry){
  entry.abort?.abort();entry.controller?.destroy();entry.canvas?.remove();
  entry.element.classList.remove('has-character-canvas');
  entry.abort=undefined;entry.controller=undefined;entry.canvas=undefined;
  fallback(entry);
 }
 function reconcile(entry:Entry){
  if(!active||!entry.visible){unmount(entry);return;}
  if(entry.abort)return;
  const abort=new AbortController(),canvas=document.createElement('canvas');
  canvas.setAttribute('aria-hidden','true');entry.element.append(canvas);entry.abort=abort;entry.canvas=canvas;
  void loadRuntime().then(module=>{
   abort.signal.throwIfAborted();
   return module.mountAvatar(canvas,{member:entry.member,temperature:entry.temperature,paused,signal:abort.signal});
  }).then(controller=>{
   if(abort.signal.aborted){controller.destroy();return;}
   entry.controller=controller;controller.setTemperature(entry.temperature,true);
   if(paused)controller.pause();else controller.resume();
   entry.element.classList.add('has-character-canvas');
  }).catch(()=>{/* The approved static expression remains visible if motion cannot load. */});
 }
 const observer=new IntersectionObserver(changes=>{
  for(const change of changes){const entry=entries.get(change.target as HTMLElement);if(entry){entry.visible=change.isIntersecting;reconcile(entry);}}
 },{threshold:.01});
 return {
  sync(immediate=false){
   for(const [element,entry] of entries)if(!root.contains(element)||element.dataset.characterMember!==entry.member){unmount(entry);observer.unobserve(element);entries.delete(element);}
   root.querySelectorAll<HTMLElement>('[data-character-member]').forEach(element=>{
    const member=element.dataset.characterMember as AvatarMember,temperature=Number(element.dataset.characterTemperature);
    let entry=entries.get(element);
    if(!entry){entry={element,member,temperature,visible:false};entries.set(element,entry);observer.observe(element);}
    else if(temperature!==entry.temperature){entry.temperature=temperature;entry.controller?.setTemperature(temperature,immediate);if(!entry.controller)fallback(entry);}
   });
  },
  setActive(value:boolean){if(active===value)return;active=value;for(const entry of entries.values())reconcile(entry);},
  setPaused(value:boolean){if(paused===value)return;paused=value;for(const entry of entries.values())if(value)entry.controller?.pause();else entry.controller?.resume();},
  destroy(){observer.disconnect();for(const entry of entries.values())unmount(entry);entries.clear();},
 };
}
