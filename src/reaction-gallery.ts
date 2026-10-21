import {AVATAR_ASSETS,mountAvatar,reactionThumbnail,type AvatarController,type AvatarMember} from './avatars';
import {NOTE_REACTIONS,type NoteExpression} from './avatars/reactions';

const gallery=document.querySelector<HTMLElement>('#gallery')!;
const pause=document.querySelector<HTMLButtonElement>('#pause')!,replay=document.querySelector<HTMLButtonElement>('#replay')!,status=document.querySelector<HTMLElement>('#motion-status')!;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let paused=false,selected:HTMLElement|undefined,controller:AvatarController|undefined,abort:AbortController|undefined;
gallery.innerHTML=NOTE_REACTIONS.flatMap(([expression,label])=>Object.entries(AVATAR_ASSETS).map(([member,asset])=>`<article class="reaction-example" data-member="${member}" data-expression="${expression}"><h2>${label}</h2><p>${asset.name}</p><div class="comparison"><figure class="frame animated"><img alt="${asset.name}: ${label}" width="128" height="128" src="./avatars/v1/${asset.happy128}"><figcaption>Selected animation</figcaption></figure><figure class="frame still"><img alt="${asset.name}: ${label}, still frame" width="128" height="128" src="./avatars/v1/${asset.happy128}"><figcaption>Still frame</figcaption></figure></div><button type="button" aria-label="Play ${asset.name}: ${label}">Play</button></article>`)).join('');
function updateStatus(){
 pause.setAttribute('aria-pressed',String(paused));pause.textContent=paused?'Resume motion':'Pause motion';
 status.textContent=reduced.matches?'Reduced motion: stable expressions.':paused?'Motion paused.':selected?'Only the selected expression animates.':'All 56 expressions are still.';
}
async function select(card:HTMLElement){
 abort?.abort();controller?.destroy();controller=undefined;
 selected?.classList.remove('active');selected?.querySelector('canvas')?.remove();selected=card;card.classList.add('active');
 replay.disabled=false;const signal=new AbortController();abort=signal;
 const canvas=document.createElement('canvas');card.querySelector('.animated')!.prepend(canvas);
 try{
  const mounted=await mountAvatar(canvas,{member:card.dataset.member as AvatarMember,expression:card.dataset.expression as NoteExpression,temperature:0,effects:{hearts:false,steam:false,blush:false},paused,signal:signal.signal});
  if(signal.signal.aborted){mounted.destroy();return;}controller=mounted;
 }catch(error){if(!signal.signal.aborted){canvas.remove();status.textContent='Animation unavailable. Still frame remains visible.';return;}}
 updateStatus();
}
gallery.onclick=event=>{const card=(event.target as HTMLElement).closest<HTMLElement>('.reaction-example');if(card&&(event.target as HTMLElement).closest('button'))void select(card);};
pause.onclick=()=>{paused=!paused;if(paused)controller?.pause();else controller?.resume();updateStatus();};
replay.onclick=()=>{if(selected)void select(selected);};
reduced.addEventListener('change',updateStatus);
window.addEventListener('pagehide',()=>{abort?.abort();controller?.destroy();});
updateStatus();
// Sequential preparation bounds memory while keeping all stills reviewable.
for(const card of gallery.querySelectorAll<HTMLElement>('.reaction-example')){
 try{const url=await reactionThumbnail(card.dataset.member as AvatarMember,card.dataset.expression as NoteExpression);card.querySelectorAll('img').forEach(img=>img.src=url);card.dataset.ready='true';}
 catch{card.dataset.ready='false';}
}
