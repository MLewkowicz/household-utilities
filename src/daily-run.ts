import {identity,onIdentityChange} from './identity';
import {rpc} from './ui';
import {GAMES} from './game-registry';
import {newYorkDay,readLocal,writeLocal} from './game-library';
import {openSettings} from './settings';
type DailyStatus={day:string;games:{game:string;complete:boolean;started:boolean}[]};
const key=()=>`household-daily-run:${identity||'guest'}`;
export const runningDailies=()=>readLocal<string>(key())===newYorkDay();
export function dailyRunMarkup(){return '<button type="button" class="daily-run-shortcut" data-daily-run aria-label="Play unfinished daily challenges" title="Play unfinished dailies"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 2v6m10-6v6M3 10h18m-11 4 3 3 5-5"/></svg><span class="daily-run-count"></span></button>';}
let bound=false;
export function initDailyRun(){if(bound)return;bound=true;document.addEventListener('click',e=>{const b=(e.target as Element).closest<HTMLButtonElement>('[data-daily-run]');if(b)void nextDaily(b);});onIdentityChange(()=>void refreshDailyShortcut());}
export async function refreshDailyShortcut(){
 const buttons=document.querySelectorAll<HTMLButtonElement>('.daily-run-shortcut');buttons.forEach(b=>{b.hidden=!location.hash.match(/^#games\/?$/)&&!runningDailies();});
 if(!identity)return;
 const player=identity;
 try{const status=await rpc<DailyStatus>('game_daily_status',{p:{player}});if(identity!==player)return;const left=status.games.filter(g=>!g.complete).length;buttons.forEach(b=>{const n=b.querySelector('.daily-run-count');if(n)n.textContent=String(left);b.title=left?`${left} unfinished daily challenges`:'All daily challenges complete';b.setAttribute('aria-label',b.title);});}catch{/* Retain the shortcut so the player can retry. */}
}
export async function nextDaily(button?:HTMLButtonElement){
 if(!identity){openSettings();return;}const player=identity;if(button)button.disabled=true;
 try{const status=await rpc<DailyStatus>('game_daily_status',{p:{player}});if(player!==identity)return;writeLocal(key(),status.day);
  const current=location.hash.split('/')[1],start=GAMES.findIndex(g=>g.id===current),ordered=[...GAMES.slice(start+1),...GAMES.slice(0,start+1)],next=ordered.find(g=>status.games.some(s=>s.game===g.id&&!s.complete));
  if(next)location.hash=`#games/${next.id}/daily`;else{writeLocal(key(),null);location.hash='#games';}
 }catch{if(button){button.title='Could not load daily progress. Tap to retry.';button.setAttribute('aria-label',button.title);}}
 finally{if(button)button.disabled=false;void refreshDailyShortcut();}
}
