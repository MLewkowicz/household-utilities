import {AVATAR_ASSETS,type AvatarMember} from './avatars/catalog';
import {esc,name} from './ui';
export const NOTE_REACTIONS=[['crying-laughing','Crying laughing'],['confused','Confused'],['mogging','Mogging'],['vomit','Vomit'],['gentle-laughing','Gentle laughing'],['disappointed','Disappointed']] as const;
export type NoteExpression=typeof NOTE_REACTIONS[number][0];
export type NoteReaction={note_id:string;member:AvatarMember;version:number;expression:NoteExpression|null;created_at:string};
export const expressionLabel=(expression:string)=>NOTE_REACTIONS.find(([id])=>id===expression)?.[1]||expression;
export function reactionPortrait(member:AvatarMember,expression:NoteExpression){return `<span class="reaction-portrait" data-reaction-member="${member}" data-reaction-expression="${expression}" role="img" aria-label="${name(member)} · ${esc(expressionLabel(expression))}"><img src="./avatars/v1/${AVATAR_ASSETS[member].happy128}" alt="" width="96" height="96" loading="lazy" decoding="async"></span>`;}
let runtime:Promise<typeof import('./avatars')>|undefined;
const load=()=>runtime??=import('./avatars').catch(e=>{runtime=undefined;throw e;});
const observers=new WeakMap<HTMLElement,IntersectionObserver>();
export function paintReactionThumbnails(root:HTMLElement){
 observers.get(root)?.disconnect();
 const observer=new IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;observer.unobserve(entry.target);const el=entry.target as HTMLElement,member=el.dataset.reactionMember as AvatarMember,expression=el.dataset.reactionExpression as NoteExpression;
 void load().then(m=>m.reactionThumbnail(member,expression)).then(url=>{if(el.isConnected)el.querySelector('img')!.src=url;}).catch(()=>{/* Named portrait remains available. */});
 }});observers.set(root,observer);root.querySelectorAll('[data-reaction-member]').forEach(el=>observer.observe(el));
}
let animation:AbortController|undefined;
export function stopReactionAnimation(){animation?.abort();animation=undefined;}
export async function animateReaction(el:HTMLElement){
 stopReactionAnimation();if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const abort=new AbortController();animation=abort;let timer:ReturnType<typeof setTimeout>|undefined;
 const canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');el.append(canvas);
 const cleanup=()=>{if(timer)clearTimeout(timer);canvas.remove();};abort.signal.addEventListener('abort',cleanup,{once:true});
 try{const module=await load();abort.signal.throwIfAborted();if(!el.isConnected){abort.abort();return;}await module.mountAvatar(canvas,{member:el.dataset.reactionMember as AvatarMember,expression:el.dataset.reactionExpression as NoteExpression,temperature:0,effects:{hearts:false,steam:false,blush:false},signal:abort.signal});timer=setTimeout(()=>abort.abort(),1400);}catch{abort.abort();}
}
window.addEventListener('hashchange',stopReactionAnimation);
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopReactionAnimation();});
