import {$,esc,name,rpc,download} from './ui';
import {GAMES,type GameId,type TriviaId} from './game-registry';
import {renderPodium} from './game-podium';
import {identity,onIdentityChange} from './identity';
import {REGIONS,type Region,type CountryScope,type ScoreChallenge} from './geography';
import {loadScores,bestScores,type GeoScore} from './geography-scores';
import {formatPuzzleTime,timedGame} from './puzzle-clock';
import {leaderboardFocus} from './leaderboard-route';
import {settingsButtonMarkup,themeToggleMarkup} from './settings';

type Standing={player:string;score:number;rank?:number;days?:number;elapsed_ms?:number|null;steps?:number;mistakes?:number;won?:boolean};
const challenges={name:'Name countries',find:'Find countries',urban:'Cities',route:'Border Trail',places:'Cities · previous catalog',cities:'Capital dots · previous game',capitals:'Name capitals · previous game'};
type Challenge=keyof typeof challenges;
const legacy=['places','cities','capitals'];
let initialized=false,lastRoute='',period:'day'|'week'='day',challenge:Challenge='name',region:Region='World',scope:CountryScope='countries';
let geoRows:GeoScore[]=[];
const requests=new Map<GameId,number>(),boards=new Map<GameId,{category:string;rows:Standing[]}>();
const active=()=>leaderboardFocus(location.hash)!==null&&!$('#games-page').hidden;
const list=(game:GameId)=>$(`[data-standings="${game}"]`);
function remember(){try{sessionStorage.setItem('household-leaderboards',JSON.stringify({period,challenge,region,scope}));}catch{}}
function restore(){try{const saved=JSON.parse(sessionStorage.getItem('household-leaderboards')||'{}');if(saved.period==='week')period='week';if(Object.hasOwn(challenges,saved.challenge))challenge=saved.challenge;if(REGIONS.includes(saved.region))region=saved.region;if(saved.scope==='expanded')scope='expanded';}catch{}}
function initialize(){
 if(initialized)return;initialized=true;restore();
 $('#leaderboards-page').innerHTML=`<div class="leaderboards-wrap"><header class="leaderboards-header"><div><a class="orbit-sign" href="#games">← Observatory</a><h1 id="leaderboards-title" class="scores-title">Leaderboards</h1><p>Every game, its own standings.</p></div><div class="leaderboards-tools">${themeToggleMarkup('leaderboards-theme')}${settingsButtonMarkup()}</div></header><div class="leaderboards-controls"><label>Jump to game<select id="leaderboards-jump"><option value="">All games</option>${GAMES.map(g=>`<option value="${g.id}">${g.title}</option>`).join('')}</select></label><label>Daily games<select id="leaderboards-period"><option value="day">Today</option><option value="week">This week</option></select></label><p id="leaderboards-period-note"></p></div><div class="leaderboards-grid">${GAMES.map(g=>`<article id="leaderboard-${g.id}" class="leaderboard-card" style="--board-color:${g.color}" aria-labelledby="leaderboard-title-${g.id}" tabindex="-1"><header><span class="leaderboard-icon" aria-hidden="true">${g.icon}</span><h2 id="leaderboard-title-${g.id}">${g.title}</h2><a href="#games/${g.id}" aria-label="Play ${g.title}">Play ↗</a></header>${g.id==='geography'?`<div class="leaderboard-filters"><label>Challenge<select id="geo-score-challenge">${Object.entries(challenges).map(([value,label])=>`<option value="${value}" ${legacy.includes(value)?'hidden':''}>${label}</option>`).join('')}</select></label><label>Region<select id="geo-score-region">${REGIONS.map(r=>`<option>${r}</option>`).join('')}</select></label><label>Country set<select id="geo-score-scope"><option value="countries">Countries only</option><option value="expanded">Countries & territories</option></select></label></div><p id="geo-score-selection" class="leaderboard-caption"></p><p id="geo-score-status" class="leaderboard-caption" role="status"></p>`:`<p class="leaderboard-caption" data-period-label>${timedGame(g.id)?'Equal points use the fastest active time.':'Equal scores share rank.'}</p>`}<div ${g.id==='geography'?'id="geo-score-list"':''} data-standings="${g.id}" aria-live="polite"><p>Loading scores…</p></div><footer>${g.id==='geography'?'<p id="geo-score-footnote"></p>':timedGame(g.id)?'<p>Timers pause while you’re away.</p>':''}<button type="button" ${g.id==='geography'?'id="geo-score-retry"':''} data-refresh-board="${g.id}" class="text-button">Refresh scores</button></footer></article>`).join('')}</div></div>`;
 $('#leaderboards-page').addEventListener('change',e=>{
  const el=e.target as HTMLSelectElement;
  if(el.id==='leaderboards-jump'){location.hash='#games/leaderboards'+(el.value?'/'+el.value:'');return;}
  if(el.id==='leaderboards-period'){period=el.value as typeof period;remember();syncPeriod();for(const g of GAMES)if(g.id!=='geography')void refreshBoard(g.id);return;}
  if(el.id==='geo-score-challenge')challenge=el.value as Challenge;
  else if(el.id==='geo-score-region')region=el.value as Region;
  else if(el.id==='geo-score-scope')scope=el.value as CountryScope;else return;
  remember();syncGeoFilters();void refreshBoard('geography');
 });
 $('#leaderboards-page').addEventListener('click',e=>{const game=(e.target as Element).closest<HTMLElement>('[data-refresh-board]')?.dataset.refreshBoard as GameId|undefined;if(game)void refreshBoard(game);});
 onIdentityChange(()=>{if(active())refreshLeaderboards();});
}
function syncPeriod(){
 $<HTMLSelectElement>('#leaderboards-period').value=period;
 $('#leaderboards-period-note').textContent=period==='day'?'Completed daily rounds · resets at midnight in New York.':'Five best days per game · Monday–Sunday in New York.';
}
function syncGeoFilters(){
 $<HTMLSelectElement>('#geo-score-challenge').value=challenge;$<HTMLSelectElement>('#geo-score-region').value=region;$<HTMLSelectElement>('#geo-score-scope').value=scope;
 for(const id of ['geo-score-region','geo-score-scope'])$("#"+id).closest<HTMLElement>('label')!.hidden=challenge==='route';
 $('#geo-score-selection').textContent=challenge==='route'?'Border Trail · today':`${challenges[challenge]} · ${region} · ${scope==='countries'?'countries only':'countries & territories'} · all-time best`;
 $('#geo-score-footnote').textContent=challenge==='route'?'One daily trail per player. Resets at midnight in New York.':'Each player’s best round for these settings. Ties use correct answers, then fastest time. Guest scores stay on this device.';
}
function details(rows:Standing[],extra:(row:Standing)=>string){return `<details class="score-disclosure"><summary>Score details</summary><ol class="leaderboard-details">${rows.map((r,i)=>`<li><span>${r.rank??i+1}</span><strong>${esc(name(r.player))}${r.player===identity?' · you':''}</strong><span>${r.score.toLocaleString()} pts<small>${esc(extra(r))}</small></span></li>`).join('')}</ol></details>`;}
function renderRows(game:GameId,rows:Standing[],empty:string,extra:(row:Standing)=>string){list(game).innerHTML=rows.length?renderPodium(rows,timedGame(game))+details(rows,extra):`<p class="leaderboard-empty">${empty}</p>`;}
async function refreshBoard(game:GameId){
 const token=(requests.get(game)||0)+1;requests.set(game,token);
 const valid=()=>active()&&requests.get(game)===token;
 const selectedPeriod=period,selectedChallenge=challenge,selectedRegion=region,selectedScope=scope;
 list(game).setAttribute('aria-busy','true');
 try{
  if(game==='geography'){
   $('#geo-score-status').textContent='Loading scores…';
   if(selectedChallenge==='route'){
    const rows=await rpc<Standing[]>('geography_route_scores');if(!valid())return;
    $('#geo-score-status').textContent='Today’s household trail';boards.set(game,{category:'Border Trail · today',rows});
    renderRows(game,rows,'No completed trails today.',r=>`${r.won?r.steps+' guesses':'Trail ended'} · ${r.mistakes} mistakes`);
   }else{
    const result=await loadScores();if(!valid())return;geoRows=result.rows;
    for(const value of legacy)$('#geo-score-challenge').querySelector<HTMLOptionElement>(`option[value="${value}"]`)!.hidden=value!==selectedChallenge&&!geoRows.some(r=>r.challenge===value);
    const rows=bestScores(geoRows,selectedRegion,selectedScope,selectedChallenge as ScoreChallenge);
    $('#geo-score-status').textContent=result.shared?'Shared household scores':'Shared scores unavailable. Showing this device; pending scores will retry.';
    boards.set(game,{category:$('#geo-score-selection').textContent!,rows});
    renderRows(game,rows,'No completed rounds for these settings.',row=>{const r=row as GeoScore;return `${r.correct}/${r.total} · ${r.mistakes} mistakes · ${formatPuzzleTime(r.elapsed_ms)}${r.pending?' · pending':''}`;});
   }
  }else{
   const rows=await rpc<Standing[]>('trivia_scores',{p:{game:game as TriviaId,period:selectedPeriod}});if(!valid())return;
   boards.set(game,{category:selectedPeriod,rows});
   renderRows(game,rows,selectedPeriod==='day'?'No completed daily rounds today.':'No completed daily rounds this week.',r=>[timedGame(game)&&r.elapsed_ms!=null?formatPuzzleTime(r.elapsed_ms):'',selectedPeriod==='week'?`${r.days} days`:''].filter(Boolean).join(' · '));
  }
 }catch{if(valid()){boards.delete(game);list(game).innerHTML='<p class="leaderboard-empty">Scores couldn’t load. Use Refresh scores to retry.</p>';if(game==='geography')$('#geo-score-status').textContent='Shared scores unavailable.';}}
 finally{if(valid())list(game).setAttribute('aria-busy','false');}
}
export function refreshLeaderboards(){
 initialize();const focus=leaderboardFocus(location.hash);if(focus===null)return;
 const changed=lastRoute!==location.hash;lastRoute=location.hash;
 if(changed&&focus==='geography'){
  const parts=location.hash.split('/');let requestedRegion='';try{requestedRegion=decodeURIComponent(parts[4]||'');}catch{}
  if(parts[1]==='leaderboards'&&Object.hasOwn(challenges,parts[3]))challenge=parts[3] as Challenge;
  if(REGIONS.includes(requestedRegion as Region))region=requestedRegion as Region;
  if(parts[5]==='countries'||parts[5]==='expanded')scope=parts[5];remember();
 }
 syncPeriod();syncGeoFilters();$<HTMLSelectElement>('#leaderboards-jump').value=focus;
 for(const g of GAMES)void refreshBoard(g.id);
 if(changed){if(focus){const card=$('#leaderboard-'+focus);card.scrollIntoView({block:'start'});card.focus({preventScroll:true});}else $('#leaderboards-page').scrollTop=0;}
}
export function exportLeaderboards(){download(Object.fromEntries(boards),'household-leaderboards');}
