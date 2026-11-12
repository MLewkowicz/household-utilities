import {observatorySky} from './observatory-sky';
import cardAssets from './game-card-assets.json';
import {$,esc} from './ui';
import {GAMES} from './game-registry';
import {gameNavigationMarkup,mountGameNavigation} from './game-navigation';

let initialized=false,version=0,selected='geography',triviaRoute='';
let geography:typeof import('./geography-client')|undefined,trivia:typeof import('./trivia-client')|undefined;
let scene:Awaited<ReturnType<typeof import('./observatory')['mountObservatory']>>|undefined;
const navigation=mountGameNavigation();
let sceneLoading=false,turn=0;const step=Math.PI/3;
const sceneVisible=()=>!$('#games-page').hidden&&!$('#orbit-lobby').hidden&&!document.hidden&&!document.querySelector('dialog[open]');
function ensureScene(){if(scene||sceneLoading||new URLSearchParams(location.search).get('webgl')==='0')return;sceneLoading=true;void import('./observatory').then(m=>m.mountObservatory($('#observatory-scene'),turn*step)).then(s=>{scene=s;s.setAngle(turn*step);s.setActive(sceneVisible());}).catch(()=>{/* The illustrated fallback stays usable; another visit can retry. */}).finally(()=>{sceneLoading=false;});}
export async function initGames(){
 if(initialized)return;initialized=true;Object.assign(window,{__observatoryDiagnostics:()=>scene?.diagnostics()});
 $('#games-page').innerHTML=`${gameNavigationMarkup()}<section id="orbit-lobby" class="orbit-lobby">${observatorySky()}<header class="orbit-header"><h1 class="sr-only">Games</h1><a id="orbit-scores" class="orbit-sign" href="#games/scores" aria-label="Leaderboard">Scores ↗</a></header><div id="observatory-scene" tabindex="0" role="group" aria-label="Observatory. Drag or use Left and Right to aim at a game card. Click a card or press Enter to play."><svg class="observatory-fallback" viewBox="0 0 600 600" aria-hidden="true"><defs><linearGradient id="dome-metal"><stop stop-color="#83afa5"/><stop offset="1" stop-color="#355c65"/></linearGradient></defs><path d="M130 470 300 530 470 470 470 440 300 490 130 440Z" fill="#6d7183"/><path d="M130 440 300 380 470 440 300 490Z" fill="#d6cbb4"/><path d="M195 430V300Q300 250 405 300V430Q300 485 195 430Z" fill="#c7c2ad"/><path d="M195 300A105 105 0 0 1 405 300Z" fill="url(#dome-metal)"/><g stroke="#6a6d71" stroke-width="25"><path d="M230 425V350M300 440V360M370 425V350"/></g><path d="M270 445 250 480 310 500 335 458" fill="#e8dec6"/><g id="fallback-telescope" transform="rotate(-28 300 290)"><path d="M210 270H445V315H210Z" fill="#4c7e82"/><path d="M420 265H440V320H420Z" fill="#ddbc81"/><ellipse cx="445" cy="292" rx="9" ry="23" fill="#8ec7d2"/><path d="M200 280H210V305H200Z" fill="#d5b47d"/></g></svg><nav class="planet-navigation" aria-label="Game cards">${GAMES.map((g,i)=>`<button type="button" data-orbit-game="${g.id}" style="--planet:${g.color};--i:${i}" aria-label="Play ${g.title}" aria-pressed="${g.id===selected}"><span class="card-art" aria-hidden="true"><img src="${cardAssets[g.id]}" width="320" height="320" alt="" draggable="false"></span><span class="planet-label">${g.title}</span></button>`).join('')}</nav></div><footer class="observatory-controls"><button class="orbit-turn" data-turn="-1" aria-label="Previous game">←</button><span id="orbit-game-title" aria-live="polite">Geography</span><button class="orbit-turn" data-turn="1" aria-label="Next game">→</button></footer><p class="observatory-gesture">Choose a card to play</p></section><section id="geography-page" hidden></section><section id="trivia-page" hidden></section>`;
 $('#orbit-lobby').addEventListener('click',e=>{const el=(e.target as Element).closest<HTMLElement>('button');if(el?.dataset.orbitGame){const next=GAMES.findIndex(g=>g.id===el.dataset.orbitGame),current=((turn%6)+6)%6;let delta=next-current;if(delta>3)delta-=6;if(delta< -3)delta+=6;choose(turn+delta);location.hash='#games/'+selected;}else if(el?.dataset.turn)choose(turn+Number(el.dataset.turn));});
 const viewport=$('#observatory-scene');let drag:{id:number;x:number;start:number;moved:boolean}|undefined;
 function cancelDrag(){const d=drag;drag=undefined;if(d&&viewport.hasPointerCapture(d.id))viewport.releasePointerCapture(d.id);if(d)scene?.setAngle(turn*step);}
 viewport.addEventListener('pointerdown',e=>{if(drag||!e.isPrimary||(e.target as Element).closest('button')||e.button!==0||!sceneVisible())return;drag={id:e.pointerId,x:e.clientX,start:turn,moved:false};viewport.setPointerCapture(e.pointerId);});
 viewport.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;if(e.pointerType==='mouse'&&e.buttons===0){cancelDrag();return;}const dx=e.clientX-drag.x;if(Math.abs(dx)>8)drag.moved=true;if(drag.moved)scene?.setAngle((drag.start+dx/140)*step);});
 viewport.addEventListener('pointerup',e=>{if(!drag||e.pointerId!==drag.id)return;const d=drag;drag=undefined;if(viewport.hasPointerCapture(d.id))viewport.releasePointerCapture(d.id);const delta=(e.clientX-d.x)/140;choose(d.moved?d.start+Math.sign(delta)*Math.max(1,Math.round(Math.abs(delta))):d.start);});
 viewport.addEventListener('pointercancel',e=>{if(e.pointerId===drag?.id)cancelDrag();});
 viewport.addEventListener('lostpointercapture',e=>{if(e.target===viewport&&e.pointerId===drag?.id)cancelDrag();});
 window.addEventListener('blur',cancelDrag);window.addEventListener('hashchange',()=>{cancelDrag();$('#games-page').querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(dialog=>dialog.close());});
 viewport.addEventListener('keydown',e=>{if((e.target as Element).closest('button'))return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();choose(turn+(e.key==='ArrowRight'?1:-1));}else if(e.key==='Home'){e.preventDefault();choose(0);}else if(e.key==='Enter'){e.preventDefault();location.hash='#games/'+selected;}});
 viewport.querySelectorAll<HTMLElement>('[data-orbit-game]').forEach(card=>{const aim=()=>choose(GAMES.findIndex(g=>g.id===card.dataset.orbitGame));card.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse')aim();});card.addEventListener('focus',aim);});
 renderSelection();
 const syncScene=()=>{const visible=sceneVisible();if(!visible)cancelDrag();scene?.setActive(visible);};
 new MutationObserver(records=>{if(records.some(r=>r.target===$('#games-page')||r.target===$('#orbit-lobby')||r.target instanceof HTMLDialogElement))syncScene();}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['hidden','open']});document.addEventListener('visibilitychange',syncScene);
 if(!location.hash.startsWith('#games/'))ensureScene();
}
function choose(value:number){turn=((value%GAMES.length)+GAMES.length)%GAMES.length;selected=GAMES[((turn%6)+6)%6].id;renderSelection();scene?.setAngle(turn*step);}
function renderSelection(){const game=GAMES.find(g=>g.id===selected)!;$('#orbit-game-title').textContent=game.title;$('#orbit-scores').setAttribute('href',game.id==='geography'?'#games/scores':`#games/${game.id}/scores`);document.querySelectorAll<HTMLElement>('[data-orbit-game]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.orbitGame===selected)));$('#observatory-scene').dataset.selected=selected;}
export async function refreshGames(){
 const request=++version,part=location.hash.split('/')[1],isGeo=part==='geography'||part==='scores',isTrivia=GAMES.some(g=>g.id===part)&&!isGeo;
 if(!isTrivia)triviaRoute='';
 if(isGeo||isTrivia){selected=isGeo?'geography':part;turn=GAMES.findIndex(g=>g.id===selected);renderSelection();scene?.setAngle(turn*step);}
 $('#games-page').dataset.gameView=isGeo||isTrivia?'play':'hub';
 $('#orbit-lobby').hidden=isGeo||isTrivia;$('#geography-page').hidden=!isGeo;$('#trivia-page').hidden=!isTrivia;
 if(!isGeo&&!isTrivia)ensureScene();
 if(isGeo){geography??=await import('./geography-client');if(request!==version)return;await geography.initGames();if(request!==version)return;await geography.refreshGames();}
 else if(isTrivia){trivia??=await import('./trivia-client');if(request!==version)return;
  // The app refreshes every 45 seconds. Keep an active board and its input focus;
  // only navigation or a scores screen needs another trivia render.
  if(triviaRoute!==location.hash||location.hash.endsWith('/scores')){await trivia.renderTrivia();if(request===version)triviaRoute=location.hash;}
 }
 if(request===version)navigation.sync(location.hash);
}
export function enterGames(){/* The house journey now arrives at the observatory. */}
export function exportGames(){if(location.hash.startsWith('#games/geography')||location.hash==='#games/scores')geography?.exportGames();else trivia?.exportTrivia();}
