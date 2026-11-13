import {centerArchive,calendarMarkup,loadLibrary,nextArchiveEntry,selectedArchive,rememberArchive,openArchive,storeArchive,updateCalendar,newYorkDay,type CalendarEntry,type ArchiveBoard} from './game-library';
import type {Attempt} from './trivia-model';
import {renderPodium} from './game-podium';
import {countryHistory} from './geography-history';
import {globeCities,cityLocation,cityPrompt,cityDescription} from './globe-cities';
import {stepRoute,routeGuessLimit,routePuzzle,routeBranches,type RouteRound} from './geography-route';
import {capitals,capitalNames,capitalLabel,capitalSuggestions,isCapitalAnswer,capitalHints} from './capital-answers';
import {mountGameNavigation} from './game-navigation';
import {$,esc,name,toast,download,rpc} from './ui';
import {identity,onIdentityChange,setIdentity} from './identity';
import {MEMBERS,type Member} from './ledger';
import {REGIONS,COUNTRY_IDS,roundLocations,projectCenter,isCityMode,isRouteMode,isLocationChallenge,inRound,isCapitalMode,isLearningMode,type Country,type Region,type Round,type CountryScope,type GameMode,newRound,inPool,answerSuggestions,isAnswer,restoreRound,remainingSeconds,roundEnd,resolvedCountry,countryHints,useHint,revealCountry,pacificRegion,countryPath,countryView,shuffledCountries,roundScore,isCompetitive,prepareFindTarget,answerLocation,type ScoreChallenge} from './geography';
import {recordScore,syncScores,loadScores,bestScores,type GeoScore} from './geography-scores';
import atlas from './geography-data.json';
import type {GlobeSurface,GlobeStyle} from './globe';
import {mountGlobeFallback} from './globe-fallback';
let compareTrail=false,routeBusy=false,routeRequest=0,checkedDaily='';
let routeScores:{player:string;score:number;steps:number;mistakes:number;won:boolean}[]=[];
let reviewing=false,reviewCities=false,trailEntries:CalendarEntry[]=[],trailEntry='',trailBoard:ArchiveBoard|undefined,lastTrailSnapshot='';
const countries=atlas as Country[],countryById=new Map(countries.map(c=>[c.id,c]));
let initialized=false,round:Round=newRound(),selected:Country|undefined,suggestions:{name:string}[]=[],activeOption=-1,savedNotice=false,surface:GlobeSurface|undefined,playing=false;
let surfaceStyle:GlobeStyle|undefined;
let mapStyle:GlobeStyle='terrain',pendingStyle:GlobeStyle|undefined,styleRequest=0,scoreRequest=0,scoreRows:GeoScore[]=[],lastTick=performance.now(),lastSavedSecond=-1;
try{if(localStorage.getItem('household-globe-style-v1')==='paper')mapStyle='paper';}catch{}
const field=<T extends HTMLElement=HTMLInputElement>(id:string)=>$<T>('#'+id);
const pool=()=>roundLocations(countries,round);
const targetById=(id:string)=>{const city=isCityMode(round.mode)&&globeCities[id];return city?cityLocation(city,countryById.get(city.countryId)!):countryById.get(id);};
const storageKey=()=>`household-geography-v1:${identity||'guest'}`;
const hasProgress=()=>round.startedAt!==null||round.correct.length>0||round.revealed.length>0;
const clock=(seconds:number)=>`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
const regionOptions=()=>REGIONS.map(r=>`<option>${r}</option>`).join('');
const trophyIcon='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h10v6a5 5 0 0 1-10 0V3ZM7 5H3v2a4 4 0 0 0 4 4m10-6h4v2a4 4 0 0 1-4 4M12 14v6m-4 1h8"/></svg>';
const scopeOptions='<option value="countries">Countries only · 195</option><option value="expanded">Expanded · countries & territories</option>';
function persist(){if(round.mode==='route'&&trailBoard&&round.route){const state={...round.route,id:`archive:geography:${trailEntry}`,game:'geography',player:identity||'guest',day:trailEntry} as unknown as Attempt;const snapshot=JSON.stringify(state);if(snapshot!==lastTrailSnapshot){lastTrailSnapshot=snapshot;trailBoard.state.attempt=state;storeArchive('geography',trailEntry,trailBoard);updateCalendar(trailEntries,trailEntry,state);const tile=field('geo-trail-calendar')?.querySelector<HTMLElement>(`[data-archive-entry="${trailEntry}"]`);if(tile){tile.classList.toggle('is-complete',state.complete);tile.classList.toggle('is-started',!state.complete);tile.querySelector('span')!.textContent=state.complete?'✓':'·';tile.setAttribute('aria-label',`${tile.getAttribute('aria-label')!.split(' · ')[0]} · ${state.complete?'completed':'in progress'}`);}}}try{localStorage.setItem(storageKey(),JSON.stringify(round));}catch{if(!savedNotice){toast('Progress could not be saved on this device. You can keep playing.');savedNotice=true;}}}
function restore(){trailBoard=undefined;trailEntry='';lastTrailSnapshot='';try{const saved=JSON.parse(localStorage.getItem(storageKey())||'null');if(saved?.mode==='competitive-cities'&&saved.cityVersion!==3)localStorage.setItem(storageKey()+':city-catalog-'+String(saved.cityVersion||1),JSON.stringify(saved));round=restoreRound(saved,countries)||newRound();}catch{round=newRound();}if(isCapitalMode(round.mode)){try{localStorage.setItem(storageKey()+':legacy-capitals',JSON.stringify(round));}catch{}round=newRound(round.region,0,0,round.scope,round.mode==='competitive-capitals'?'competitive-cities':'cities');}checkedDaily='';compareTrail=false;routeBusy=false;routeRequest++;selected=isLearningMode(round.mode)&&round.learningTarget&&resolvedCountry(round,round.learningTarget)?targetById(round.learningTarget):undefined;}
export async function initGames(){
 if(initialized)return;initialized=true;restore();
 $('#geography-page').innerHTML=`<header class="observatory-topbar"><span class="geography-title">Geography</span><button id="geo-study" type="button" class="text-button" aria-pressed="false">Review planet</button><button id="geo-archive" type="button" class="text-button">Trail archive</button><div class="atlas-status" aria-label="Round progress"><span id="geo-region-label"></span><span><b id="geo-correct">0</b>/<span id="geo-total">195</span></span><span id="geo-score-stat" hidden><b id="geo-score">0</b> pts</span><span id="geo-revealed-stat" hidden><b id="geo-revealed">0</b> shown</span><span id="geo-life-stat" hidden>♡ <b id="geo-lives">∞</b></span><span id="geo-clock" role="timer"></span><span id="geo-remaining" class="sr-only"></span></div><a href="#games/scores" class="atlas-icon" aria-label="Leaderboard">${trophyIcon}</a><button id="geo-settings" type="button" class="atlas-icon" aria-label="Game settings">⚙</button></header>
 <div id="geo-trail-calendar" class="geo-trail-calendar" hidden></div><div id="geo-play-controls" class="atlas-answer" aria-label="Country answer"><div id="geo-selection">Tap a country to name it.</div><form id="geo-answer-form" hidden autocomplete="off"><label for="geo-answer" class="sr-only">Name this country</label><div class="atlas-combobox"><input id="geo-answer" maxlength="100" placeholder="Country name…" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="geo-suggestions" autocomplete="off" autocapitalize="words" spellcheck="false" enterkeyhint="done"><ul id="geo-suggestions" role="listbox" hidden></ul></div><button id="geo-check" class="atlas-icon" type="submit" aria-label="Check answer">↵</button></form><div id="geo-learning" hidden><strong id="geo-learning-prompt" aria-live="polite" aria-atomic="true"></strong><span id="geo-learning-clock"></span><button id="geo-show-me" class="text-button" type="button">Show me</button><button id="geo-next" class="button primary" type="button" hidden>Next</button></div><div class="atlas-answer-actions"><div id="geo-assistance" hidden><button type="button" id="geo-hint" class="text-button">Hint</button><button type="button" id="geo-reveal" class="text-button">Reveal</button></div><button id="geo-random" class="atlas-icon" type="button" aria-label="Random country">⤨</button><button id="geo-close-answer" class="atlas-icon" type="button" aria-label="Close country panel" hidden>×</button></div><ul id="geo-hints" aria-live="polite"></ul><p id="geo-feedback" role="status" class="atlas-feedback"></p></div>
 <div id="geo-route-panel" class="geo-route-panel" hidden><div class="geo-route-heading"><button type="button" id="geo-route-start" class="text-button"></button><span aria-hidden="true">↔</span><button type="button" id="geo-route-end" class="text-button"></button><span id="geo-route-count"></span></div><div id="geo-route-input"></div><div class="geo-route-bottom"><p id="geo-route-path" aria-label="Your route"></p><details class="geo-route-rules"><summary>Rules</summary><p>Start at either endpoint and name the countries between them, in any order. They must form a continuous route. Both endpoints are already filled in; repeated countries and backtracking are not allowed.</p><p>✅ connects to either endpoint · 🟩 helps connect it · 🟧 is a detour · 🟥 is too far away. The guess budget depends on route length. A shortest route guessed in order, in either direction, earns 1,000 points; each extra guess costs 100. A shortest route guessed out of order earns 975.</p><p>Use the borders on this globe, plus the Channel Tunnel, the Denmark–Sweden bridge and the Malaysia–Singapore crossings. Overseas and detached territories do not create shortcuts.</p><button type="button" id="geo-route-give-up" class="text-button">End trail &amp; show route</button></details></div><p id="geo-route-feedback" role="status"></p></div>
 <div class="atlas-play"><div class="atlas-map-frame"><div id="geo-surface"><p class="globe-loading" role="status">Loading globe…</p></div><div class="atlas-map-zoom" aria-label="Globe zoom"><button id="geo-zoom-in" type="button" aria-label="Zoom in">＋</button><button id="geo-zoom-out" type="button" aria-label="Zoom out">−</button><button id="geo-reset-view" type="button" aria-label="Reset view">↺</button></div><span class="globe-reticle" aria-hidden="true">＋</span></div></div>
 <div id="geo-result" class="atlas-result" role="status" hidden></div><aside id="geo-country-card" class="atlas-card-panel" hidden></aside>
 <section id="geo-score-screen" class="atlas-score-screen" hidden><a class="orbit-sign" href="#games/geography">← Back to Geography</a><h1>Leaderboard</h1><p id="geo-score-rules">5 minutes · 3 lives · 100 points per answer, −25 per mistake.</p><details class="score-disclosure"><summary>Change challenge</summary><div class="atlas-score-filters"><label>Region<select id="geo-score-region">${regionOptions()}</select></label><label>Challenge<select id="geo-score-challenge"><option value="name">Name countries</option><option value="find">Find countries</option><option value="urban">Cities</option><option value="places" hidden>Cities · previous catalog</option><option value="cities" hidden>Capital dots · previous game</option><option value="route">Border Trail · daily</option><option value="capitals">Name capitals · previous game</option></select></label><label>Country set<select id="geo-score-scope">${scopeOptions}</select></label></div></details><p id="geo-score-selection"></p><p id="geo-score-status" role="status"></p><div id="geo-score-list"></div><button type="button" id="geo-score-retry" class="text-button">Refresh scores</button><p id="geo-score-footnote" class="field-help">Each player’s best round. Ties use correct answers, then fastest time. Guest scores stay on this device.</p></section>
 <dialog id="geo-settings-dialog" aria-labelledby="geo-settings-title"><form id="geo-settings-form"><div class="dialog-top"><h2 id="geo-settings-title">Game settings</h2><button class="icon-button" type="button" id="geo-settings-close" aria-label="Close game settings">×</button></div><label>Playing as<select id="geo-player"><option value="">Guest</option>${MEMBERS.map(m=>`<option value="${m}">${name(m)}</option>`).join('')}</select></label><label>Game<select id="geo-mode"><option value="countries">Countries</option><option value="cities">Cities</option><option value="route">Border Trail</option></select></label><div class="geo-session-options"><label id="geo-question-field">Question<select id="geo-question"><option value="name">Name countries</option><option value="find">Find countries</option></select></label><label>Session<select id="geo-session"><option value="practice">Practice</option><option value="ranked">Ranked</option></select></label></div><label id="geo-region-field">Region<select id="geo-new-region">${regionOptions()}</select></label><details id="geo-pool-options"><summary>Country set</summary><label>Include<select id="geo-scope">${scopeOptions}</select></label><p class="field-help">Countries only uses UN members plus the Holy See and Palestine. Expanded includes territories, disputed areas and Antarctica.</p></details><details id="geo-practice-options"><summary>Round limits</summary><label>Time limit<select id="geo-time-limit"><option value="0">No time limit</option><option value="60">1 minute</option><option value="180">3 minutes</option><option value="300">5 minutes</option><option value="600">10 minutes</option><option value="900">15 minutes</option></select></label><label>Lives<select id="geo-life-limit"><option value="0">Unlimited</option><option value="3">3 lives</option><option value="5">5 lives</option><option value="10">10 lives</option></select></label></details><p id="geo-mode-help" class="field-help"></p><p id="geo-settings-notice" class="field-help"></p><button id="geo-new-round" type="submit" class="button primary">Start new round</button><hr><label>Globe style</label><div id="geo-style" class="globe-style" role="group" aria-label="Globe style"><button type="button" data-globe-style="terrain" aria-pressed="true" disabled>Terrain</button><button type="button" data-globe-style="paper" aria-pressed="false" disabled>Paper</button></div><span id="geo-style-status" role="status"></span><div class="atlas-settings-links"><a href="#games/scores" id="geo-scores-link">Leaderboard</a><a href="#games" id="geo-pause-link">Observatory</a></div></form></dialog>
 <div class="atlas-review-controls" id="geo-review-controls" hidden><div role="group" aria-label="Review map labels"><button type="button" data-review-layer="countries" aria-pressed="true">Countries</button><button type="button" data-review-layer="cities" aria-pressed="false">Cities</button></div><label class="sr-only" for="geo-review-search">Find a place</label><input type="search" id="geo-review-search" placeholder="Find a place…" autocomplete="off"><div id="geo-review-results" hidden></div></div>`;
 mountGameNavigation().sync(location.hash);bind();syncMode(true);syncControls();syncStyle();renderStats();renderSelection();
 try{if(new URLSearchParams(location.search).get('webgl')==='0')throw new Error('WebGL disabled');const {mountGlobe}=await import('./globe');surface=await mountGlobe(field('geo-surface'),countries,surfaceSelect,mapStyle);}
 catch{surface=mountGlobeFallback(field('geo-surface'),countries,surfaceSelect,mapStyle);}

 surfaceStyle=mapStyle;syncStyle();drawMap();resetView();resumePrompts();renderStats();surface?.setActive(!$('#games-page').hidden&&!$('#geography-page').hidden&&location.hash!=='#games/scores');
 const visibility=new MutationObserver(()=>{surface?.setActive(!$('#games-page').hidden&&!$('#geography-page').hidden&&location.hash!=='#games/scores');lastTick=performance.now();persist();});visibility.observe($('#geography-page'),{attributes:true,attributeFilter:['hidden']});visibility.observe($('#games-page'),{attributes:true,attributeFilter:['hidden']});
 onIdentityChange(()=>{restore();syncControls();resetView();drawMap();renderSelection();renderStats();resumePrompts();});
 setInterval(tick,250);void syncScores().catch(()=>{});
}
function syncControls(){field<HTMLSelectElement>('geo-player').value=identity||'';}
function syncMode(force=false){
 const next=location.hash.startsWith('#games/geography'),scores=location.hash==='#games/scores',review=next&&location.hash.endsWith('/review')&&studyAllowed();
 if(next===playing&&review===reviewing&&!force&&$('#geography-page').dataset.mode===(scores?'scores':review?'review':next?'quiz':'hub'))return;
 reviewing=review;playing=next;if(!playing)checkedDaily='';selected=undefined;
 $('#geography-page').dataset.mode=scores?'scores':reviewing?'review':playing?'quiz':'hub';field('geo-score-screen').hidden=!scores;
 field('geo-review-controls').hidden=!reviewing;field('geo-trail-calendar').hidden=reviewing||round.mode!=='route'||!trailBoard;field('geo-study').setAttribute('aria-pressed',String(reviewing));field('geo-study').textContent=reviewing?'Back to game':'Review planet';
 lastTick=performance.now();drawMap();surface?.setActive(!$('#games-page').hidden&&!$('#geography-page').hidden&&!scores);renderSelection();
 void changeStyle(!reviewing&&isRouteMode(round.mode)?'paper':mapStyle,false);
 if(scores){field<HTMLSelectElement>('geo-score-region').value=round.region;field<HTMLSelectElement>('geo-score-scope').value=round.scope;field<HTMLSelectElement>('geo-score-challenge').value=isRouteMode(round.mode)?'route':round.mode==='competitive-find'?'find':isCityMode(round.mode)?'urban':'name';void refreshScores();}else if(playing&&!reviewing)resumePrompts();
}
function drawMap(){
 if(reviewing){surface?.setState({region:'World',scope:'expanded',cities:reviewCities?Object.values(globeCities):undefined,correct:[],revealed:[],selected:selected?.id,labels:true,playing:false});return;}
 const trail=round.route,p=trail&&routePuzzle(trail),path=compareTrail&&trail?.complete?p!.solution:trail?.path;surface?.setState({region:playing?round.region:'World',scope:round.scope,cities:playing&&isCityMode(round.mode)?pool().map(c=>globeCities[c.id]):undefined,route:playing&&isRouteMode(round.mode)&&trail&&p?{path:path!,branches:compareTrail&&trail.complete?[path!]:routeBranches(trail),discovered:[...new Set([...trail.discovered,...path!])],destination:p.end}:undefined,correct:isRouteMode(round.mode)?path||[]:round.correct,revealed:round.revealed,selected:playing?(isRouteMode(round.mode)?p?.end:selected?.id):undefined,label:playing&&isLearningMode(round.mode)&&selected&&resolvedCountry(round,selected.id)?selected.id:undefined,playing});
}
function focusAnswer(c:Country){if(isCityMode(round.mode)&&globeCities[c.id])surface?.focusCity(globeCities[c.id]);else surface?.focusCountry(c);}
function resetView(){drawMap();surface?.reset();}
function syncStyle(){field('geo-style').querySelectorAll<HTMLButtonElement>('button').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.globeStyle===(!reviewing&&isRouteMode(round.mode)?'paper':mapStyle)));b.disabled=!surface||isRouteMode(round.mode)&&b.dataset.globeStyle!=='paper';});}
async function changeStyle(next:GlobeStyle,remember=true){
 if(!surface||pendingStyle===next||!pendingStyle&&surfaceStyle===next)return;const request=++styleRequest;pendingStyle=next;
 field('geo-style-status').textContent=next==='terrain'?'Loading terrain…':'';field('geo-style').setAttribute('aria-busy','true');
 try{await surface.setStyle(next);if(request!==styleRequest)return;surfaceStyle=next;if(remember){mapStyle=next;try{localStorage.setItem('household-globe-style-v1',next);}catch{}}field('geo-style-status').textContent='';}
 catch{if(request===styleRequest)field('geo-style-status').textContent='Could not load this style. Try again.';}
 finally{if(request===styleRequest){pendingStyle=undefined;field('geo-style').setAttribute('aria-busy','false');syncStyle();}}
}
function renderStats(){
 field<HTMLButtonElement>('geo-study').disabled=!reviewing&&!studyAllowed();field('geo-study').title=studyAllowed()?'Explore the labeled globe':'Available before or after a ranked round';
 if(reviewing){field('geo-result').hidden=true;return;}
 field('geo-correct').parentElement!.hidden=isRouteMode(round.mode);if(isRouteMode(round.mode)){renderRoute();return;}
 const total=pool().length,end=roundEnd(round,total);
 if(end&&!round.ended){round.ended=end;round.finishedAt=round.ended==='time'?round.startedAt!+round.limit*1000:Date.now();persist();recordScore(round,identity||'guest',total);void syncScores().catch(()=>{});renderSelection();}
 if(round.ended)recordScore(round,identity||'guest',total);
 field('geo-region-label').textContent=round.region;field('geo-correct').textContent=String(round.correct.length);field('geo-total').textContent=String(total);field('geo-remaining').textContent=String(total-round.correct.length-round.revealed.length-round.missed.length);
 field('geo-score-stat').hidden=!isCompetitive(round.mode);field('geo-score').textContent=String(roundScore(round));field('geo-life-stat').hidden=!round.maxLives;field('geo-lives').textContent=round.maxLives?String(Math.max(0,round.maxLives-round.mistakes)):'∞';
 field('geo-revealed').textContent=String(round.revealed.length);field('geo-revealed-stat').hidden=!round.revealed.length;
 const seconds=remainingSeconds(round);field('geo-clock').textContent=seconds===null?'':clock(seconds);field('geo-clock').classList.toggle('is-low-time',seconds!==null&&seconds<=30);
 field<HTMLButtonElement>('geo-random').disabled=!!round.ended||!surface;
 field('geo-result').hidden=!round.ended;
 if(round.ended&&field('geo-result').dataset.round!==round.id){field('geo-result').dataset.round=round.id;field('geo-result').innerHTML=`<strong>${['won','complete'].includes(round.ended)?'Round complete':round.ended==='time'?'Time’s up':'You’re out of lives'}</strong><span>${round.correct.length} correct${round.revealed.length?`, ${round.revealed.length} shown`:''} of ${total}${isCompetitive(round.mode)?` · ${roundScore(round)} points`:''}</span><button type="button" class="text-button" id="geo-play-again">Play again</button>${isCompetitive(round.mode)?'<a href="#games/scores">Scores →</a>':''}`;}
}
function selectCountry(country:Country,zoom=false){
 if(!playing)return;renderStats();if(!inRound(country,round)){if(isCapitalMode(round.mode)&&inPool(country,round.region,round.scope)&&!capitalNames(country).length)field('geo-feedback').textContent=`${country.name} has no designated capital in this quiz.`;return;}
 selected=country;if(!round.ended&&round.startedAt===null){round.startedAt=Date.now();persist();}
 if(zoom)surface?.focusCountry(country);drawMap();renderSelection();
 if(!round.ended&&!resolvedCountry(round,country.id)&&matchMedia('(pointer:fine)').matches)field('geo-answer').focus({preventScroll:true});
}
function surfaceSelect(country:Country|undefined,reveal=false){
 if(!playing)return;
 if(reviewing){if(country){selected=country;drawMap();renderSelection();}return;}
 if(isRouteMode(round.mode)){if(country&&round.route?.discovered.includes(country.id))surface?.focusCountry(country);return;}
 if(isCityMode(round.mode)&&!country)return;
 if(isLocationChallenge(round.mode)){
  // The globe sends a second callback for a double-tap reveal; it is not another guess.
  if(reveal)return;renderStats();const result=answerLocation(round,country,countries);if(!result)return;
  selected=undefined;persist();drawMap();renderSelection();renderStats();
  field('geo-feedback').textContent=result.correct?'Correct!':isCityMode(round.mode)?`Missed ${globeCities[result.target].name} · ${targetById(result.target)!.name}.`:`Missed ${targetById(result.target)!.name}.`;return;
 }
 if(!country)return;
 if(isLearningMode(round.mode)){
  if(reveal)return;
  if(round.ended||!round.learningTarget||resolvedCountry(round,round.learningTarget))return;
  if(country.id===round.learningTarget){round.correct.push(country.id);finishLearning(country,false);}
  else if(inRound(country,round)){round.mistakes++;persist();field('geo-feedback').textContent=isCityMode(round.mode)?`${globeCities[country.id].name} · ${country.name}. Try another dot.`:'Try again, or choose Show me.';}
  return;
 }
 selectCountry(country);if(reveal)revealSelected();
}
function renderSelection(){
 if(reviewing){field('geo-route-panel').hidden=true;field('geo-play-controls').hidden=true;field('geo-country-card').hidden=!selected;field('geo-country-card').innerHTML=selected?`<button type="button" id="geo-dismiss-card" class="atlas-icon" aria-label="Close country facts">×</button>${countryCard(selected)}`:'';return;}
 const route=isRouteMode(round.mode);field('geo-route-panel').hidden=!route;field('geo-play-controls').hidden=route;if(route){field('geo-route-input').append(field('geo-answer-form'));field('geo-answer-form').hidden=!!round.route?.complete;field<HTMLInputElement>('geo-answer').placeholder='Guess a country…';field('geo-answer-form').querySelector('label')!.textContent='Country on your route';field('geo-check').setAttribute('aria-label','Guess country');field('geo-country-card').hidden=true;closeSuggestions();renderRoute();return;}field('geo-play-controls').insertBefore(field('geo-answer-form'),field('geo-learning'));field('geo-check').setAttribute('aria-label','Check answer');field<HTMLButtonElement>('geo-check').disabled=false;field<HTMLInputElement>('geo-answer').disabled=false;
 const capitals=isCapitalMode(round.mode);field('geo-play-controls').setAttribute('aria-label',isCityMode(round.mode)?'City location answer':capitals?'Capital answer':'Country answer');field<HTMLInputElement>('geo-answer').placeholder=capitals?'Capital city…':'Country name…';field('geo-answer-form').querySelector('label')!.textContent=capitals?'Name the capital':'Name this country';
 const learning=isLearningMode(round.mode)||isLocationChallenge(round.mode),solved=!!selected&&resolvedCountry(round,selected.id),answerable=!!selected&&!solved&&!round.ended&&!learning;
 field('geo-play-controls').dataset.capitalAnswer=String(capitals&&answerable);field('geo-answer-form').hidden=!answerable;field('geo-selection').hidden=answerable&&!capitals||learning;field('geo-learning').hidden=!learning;field('geo-random').hidden=learning;field('geo-close-answer').hidden=!selected||learning;
 field<HTMLInputElement>('geo-answer').value='';field('geo-feedback').textContent='';closeSuggestions();field('geo-country-card').hidden=!solved;field('geo-country-card').innerHTML=solved?`<button type="button" id="geo-dismiss-card" class="atlas-icon" aria-label="Close country facts">×</button>${countryCard(selected!)}`:'';
 field('geo-selection').textContent=round.ended?'Round finished':solved?`${selected!.name} · ${round.revealed.includes(selected!.id)?'shown':'correct'}`:capitals?(selected?`${capitalNames(selected).length>1?'Name a capital':'Capital'} of ${selected.name}`:'Tap a country to name its capital.'):'Tap a country to name it.';
 renderAssistance();renderLearning();
}
function countryCard(c:Country){
 if(globeCities[c.id]&&(reviewing&&reviewCities||!reviewing&&isCityMode(round.mode))){const city=globeCities[c.id],coordinate=(value:number,positive:string,negative:string)=>`${Math.abs(value).toFixed(1)}° ${value>=0?positive:negative}`;return `<article class="atlas-country-card"><h3>${esc(city.name)}</h3><p>${esc(c.name)} · ${esc(c.region)}</p><p class="atlas-capital">${esc(cityDescription(city))} · ${coordinate(city.lat,'N','S')}, ${coordinate(city.lon,'E','W')}</p>${city.population?`<p class="atlas-population">≈ ${city.population.toLocaleString()} people <small>· ${esc(city.populationBasis||'urban area estimate')} · Natural Earth v5.1.2</small></p>`:'<p class="field-help">Population estimate unavailable in this dataset.</p>'}${city.note?`<p>${esc(city.note)}</p>`:''}${city.capital&&capitals[city.countryId]?.note?`<p>${esc(capitals[city.countryId].note!)}</p>`:''}${c.facts.length?`<details><summary>About ${esc(c.name)}</summary><p>${esc(c.facts[0])}</p></details>`:''}</article>`;}
 const terrain=c.terrain.replace(/^metropolitan France:\s*/,'').split(/;| French Guiana:/)[0];
 return `<article class="atlas-country-card"><h3>${esc(c.name)}</h3><p class="atlas-capital">${esc(c.capital)}</p><p class="atlas-population">${esc(c.population)}</p>${(isCapitalMode(round.mode)||isCityMode(round.mode))&&capitals[c.id]?.note?`<p class="atlas-capital-note">${esc(capitals[c.id].note!)}</p>`:''}${countryHistory(c)}${terrain?`<p class="atlas-terrain">${esc(terrain.length>150?terrain.slice(0,147).replace(/\s+\S*$/,'')+'…':terrain)}</p>`:''}</article>`;
}
function renderAssistance(){
 const available=!!selected&&(round.mode==='practice'||round.mode==='capitals')&&!round.limit&&!round.ended&&!resolvedCountry(round,selected.id);field('geo-assistance').hidden=!available;field('geo-hints').hidden=!available;
 if(!available){field('geo-hints').innerHTML='';return;}
 const hints=isCapitalMode(round.mode)?capitalHints(selected!):countryHints(selected!,round.region),count=round.hints[selected!.id]||0;field('geo-hints').innerHTML=hints.slice(0,count).map(h=>`<li>${esc(h)}</li>`).join('');field<HTMLButtonElement>('geo-hint').disabled=count>=hints.length;
}
function revealSelected(){renderStats();if(!selected||!revealCountry(round,selected))return;persist();drawMap();renderSelection();renderStats();}
function closeSuggestions(){suggestions=[];activeOption=-1;field('geo-suggestions').hidden=true;field('geo-answer').setAttribute('aria-expanded','false');field('geo-answer').removeAttribute('aria-activedescendant');}
function suggest(){
 activeOption=-1;if(isRouteMode(round.mode)){suggestions=answerSuggestions(countries.filter(c=>COUNTRY_IDS.has(c.id)),field<HTMLInputElement>('geo-answer').value,'World');}else suggestions=isCapitalMode(round.mode)?capitalSuggestions(pool(),field<HTMLInputElement>('geo-answer').value):answerSuggestions(pool(),field<HTMLInputElement>('geo-answer').value,round.region);
 field('geo-suggestions').innerHTML=suggestions.map((c,i)=>`<li role="option" id="geo-option-${i}" data-option="${i}" aria-selected="false">${esc(c.name)}</li>`).join('');field('geo-suggestions').hidden=!suggestions.length;field('geo-answer').setAttribute('aria-expanded',String(!!suggestions.length));field('geo-answer').removeAttribute('aria-activedescendant');
}
function chooseOption(index:number){const choice=suggestions[index];if(!choice)return;field<HTMLInputElement>('geo-answer').value=choice.name;closeSuggestions();checkAnswer();}
function checkAnswer(){
 if(isRouteMode(round.mode)){const answer=field<HTMLInputElement>('geo-answer').value.trim(),country=countries.find(c=>COUNTRY_IDS.has(c.id)&&isAnswer(c,answer));closeSuggestions();if(!country){field('geo-route-feedback').textContent='Choose a country name from the suggestions.';return;}void routeAction(country.id);return;}
 renderStats();if(!selected||round.ended||resolvedCountry(round,selected.id)||isLearningMode(round.mode)||isLocationChallenge(round.mode))return;
 const answer=field<HTMLInputElement>('geo-answer').value.trim();if(!answer){field('geo-feedback').textContent=isCapitalMode(round.mode)?'Type a capital city first.':'Type a country name first.';return;}closeSuggestions();
 if(isCapitalMode(round.mode)?isCapitalAnswer(selected,answer):isAnswer(selected,answer)){round.correct.push(selected.id);persist();field('geo-answer').blur();drawMap();renderSelection();}
 else{round.mistakes++;persist();field('geo-feedback').textContent='Not quite. Try again.';field<HTMLInputElement>('geo-answer').select();}renderStats();
}
function resumePrompts(){
 if(reviewing)return;
 if(!isRouteMode(round.mode))void changeStyle(mapStyle,false);
 if(!playing||!surface)return;
 if(round.mode==='route'&&!trailBoard&&!routeBusy){void openTrailArchive();return;}
 if(isRouteMode(round.mode)){void changeStyle('paper',false);if(round.mode==='daily-route'&&checkedDaily!==round.id)void resumeDailyRoute();renderRoute();return;}
 if(isLocationChallenge(round.mode)){prepareFindTarget(round,countries);selected=undefined;persist();drawMap();renderSelection();return;}
 if(!isLearningMode(round.mode))return;
 if(!round.learningTarget&&!round.ended)nextLearning();
 else{selected=round.learningTarget&&resolvedCountry(round,round.learningTarget)?targetById(round.learningTarget):undefined;drawMap();if(selected)focusAnswer(selected);renderSelection();}
}
function nextLearning(){
 renderStats();if(round.ended)return;
 if(!round.learningOrder.length)round.learningOrder=shuffledCountries(pool());
 round.learningTarget=round.learningOrder.find(id=>!resolvedCountry(round,id));round.learningRemaining=12000;selected=undefined;lastTick=performance.now();
 if(round.startedAt===null)round.startedAt=Date.now();persist();resetView();renderSelection();
}
function setPrompt(text:string){const prompt=field('geo-learning-prompt');if(prompt.textContent!==text)prompt.textContent=text;}
function renderLearning(){
 if(isLocationChallenge(round.mode)){
  const target=targetById(round.findTarget||'');setPrompt(round.ended?'Round finished':target?(isCityMode(round.mode)?cityPrompt(globeCities[target.id],target):`Find ${target.name}`):'Loading…');
  field('geo-learning-clock').textContent='';field('geo-show-me').hidden=true;field('geo-next').hidden=true;return;
 }
 if(!isLearningMode(round.mode))return;const target=targetById(round.learningTarget||''),shown=!!target&&resolvedCountry(round,target.id);
 setPrompt(target?(isCityMode(round.mode)?(shown?`${globeCities[target.id].name} · ${target.name}`:cityPrompt(globeCities[target.id],target)):round.mode==='learn-capitals'?(shown?`${target.name} · ${capitalLabel(target)}`:`Find the country with capital ${capitalNames(target)[0]}`):`${shown?'':'Find '}${target.name}`):'Round complete');field('geo-learning-clock').textContent=shown||round.ended||isCityMode(round.mode)?'':`${Math.ceil(round.learningRemaining/1000)}s`;
 field('geo-show-me').hidden=shown||!!round.ended;field('geo-next').hidden=!shown||!!round.ended;
}
function finishLearning(country:Country,revealed:boolean){
 if(revealed&&!revealCountry(round,country))return;selected=country;persist();drawMap();focusAnswer(country);renderSelection();renderStats();
 field('geo-feedback').textContent=revealed?'Here it is. Take a look, then choose Next.':'Found it!';
}
function tick(){
 const now=performance.now(),elapsed=now-lastTick;lastTick=now;
 if($('#games-page').hidden||$('#geography-page').hidden)return;renderStats();
 if(reviewing||!playing||document.hidden||isCityMode(round.mode)||!isLearningMode(round.mode)||round.ended||!round.learningTarget||resolvedCountry(round,round.learningTarget)||document.querySelector('dialog[open]'))return;
 round.learningRemaining=Math.max(0,round.learningRemaining-elapsed);renderLearning();
 const second=Math.ceil(round.learningRemaining/1000);if(second!==lastSavedSecond){persist();lastSavedSecond=second;}
 if(round.learningRemaining===0)finishLearning(targetById(round.learningTarget)!,true);
}
function chosenMode():GameMode{const game=field<HTMLSelectElement>('geo-mode').value,ranked=field<HTMLSelectElement>('geo-session').value==='ranked',find=field<HTMLSelectElement>('geo-question').value==='find';return game==='route'?(ranked?'daily-route':'route'):game==='cities'?(ranked?'competitive-cities':'cities'):find?(ranked?'competitive-find':'learn'):(ranked?'competitive':'practice');}
function settingsMode(){
 const game=field<HTMLSelectElement>('geo-mode').value,mode=chosenMode(),route=game==='route';field('geo-question-field').hidden=game!=='countries';field('geo-region-field').hidden=route;field('geo-pool-options').hidden=route;field('geo-practice-options').hidden=mode!=='practice';
 field<HTMLSelectElement>('geo-session').options[1].text=route?'Daily household trail':'Ranked';
 field('geo-mode-help').textContent=route?'Connect the endpoints on the globe by naming the countries between them. Guess in any order, without repeating countries.':game==='cities'?(isCompetitive(mode)?'Locate capitals and major cities among the unlabeled dots. 5 minutes, 3 lives.':'Locate capitals and major cities among the unlabeled dots. Zoom in to separate nearby cities, or use Show me.'):isCompetitive(mode)?'5 minutes · 3 lives. The clock keeps running when you leave.':mode==='learn'?'Find the named country. After 12 seconds, the globe shows you where it is.':'Tap a country and name it.';
}
function studyAllowed(){return isRouteMode(round.mode)?!!round.route?.complete:!isCompetitive(round.mode)||round.startedAt===null||!!round.ended;}
function openStudy(){renderStats();if(!reviewing&&!studyAllowed())return;location.hash=reviewing?'#games/geography':'#games/geography/review';}
function openSettings(){
 syncStyle();renderStats();
 field('geo-answer').blur();closeSuggestions();field<HTMLSelectElement>('geo-new-region').value=round.region;field<HTMLSelectElement>('geo-time-limit').value=String(round.limit);field<HTMLSelectElement>('geo-life-limit').value=String(round.maxLives);field<HTMLSelectElement>('geo-mode').value=isRouteMode(round.mode)?'route':isCityMode(round.mode)?'cities':'countries';field<HTMLSelectElement>('geo-session').value=isCompetitive(round.mode)||round.mode==='daily-route'?'ranked':'practice';field<HTMLSelectElement>('geo-question').value=round.mode==='learn'||round.mode==='competitive-find'?'find':'name';field<HTMLSelectElement>('geo-scope').value=round.scope;
 field('geo-settings-notice').textContent=hasProgress()?'Starting a new round replaces your current progress.':'';settingsMode();field<HTMLDialogElement>('geo-settings-dialog').showModal();
}
async function refreshScores(){
 const request=++scoreRequest,route=field<HTMLSelectElement>('geo-score-challenge').value==='route';field('geo-score-status').textContent='Loading scores…';field('geo-score-list').innerHTML='';
 if(route){try{const rows=await rpc<typeof routeScores>('geography_route_scores');if(request!==scoreRequest)return;routeScores=rows;field('geo-score-status').textContent='Today’s household trail';renderScores();}catch{if(request===scoreRequest){routeScores=[];renderScores();field('geo-score-status').textContent='Daily scores unavailable. Try Refresh scores.';}}return;}
 const result=await loadScores();if(request!==scoreRequest)return;scoreRows=result.rows;for(const legacy of ['capitals','cities','places'])field<HTMLSelectElement>('geo-score-challenge').querySelector<HTMLOptionElement>(`option[value=${legacy}]`)!.hidden=!scoreRows.some(s=>s.challenge===legacy);field('geo-score-status').textContent=result.shared?'Shared household scores':'Shared scores unavailable. Showing this device; pending scores will retry.';renderScores();
}
function renderScores(){
 const route=field<HTMLSelectElement>('geo-score-challenge').value==='route';field('geo-score-region').closest('label')!.hidden=route;field('geo-score-scope').closest('label')!.hidden=route;field('geo-score-rules').textContent=route?'1,000 for a shortest route in order; 975 out of order. −100 per extra guess.':'5 minutes · 3 lives · 100 points per answer, −25 per mistake.';
 field('geo-score-footnote').textContent=route?'One trail per player each day. The daily trail resets at midnight in New York.':'Each player’s best round. Ties use correct answers, then fastest time. Guest scores stay on this device.';
 if(route){field('geo-score-selection').textContent='Border Trail · today';field('geo-score-list').innerHTML=routeScores.length?`${renderPodium(routeScores)}<details class="score-disclosure"><summary>Score details</summary><ol class="atlas-leaderboard">${routeScores.map(s=>`<li><span><strong>${esc(name(s.player))}</strong><small>${s.won?s.steps+' guesses':'Trail ended'} · ${s.mistakes} mistakes</small></span><b>${s.score}</b></li>`).join('')}</ol></details>`:'<p>No completed trails today.</p>';return;}
 const rows=bestScores(scoreRows,field<HTMLSelectElement>('geo-score-region').value as Region,field<HTMLSelectElement>('geo-score-scope').value as CountryScope,field<HTMLSelectElement>('geo-score-challenge').value as ScoreChallenge);
 field('geo-score-selection').textContent=[field<HTMLSelectElement>('geo-score-region').value,field<HTMLSelectElement>('geo-score-challenge').selectedOptions[0].text,field<HTMLSelectElement>('geo-score-scope').selectedOptions[0].text].join(' · ');
 field('geo-score-list').innerHTML=rows.length?`${renderPodium(rows)}<details class="score-disclosure"><summary>Score details</summary><ol class="atlas-leaderboard">${rows.map(s=>`<li><span><strong>${esc(name(s.player))}</strong><small>${s.correct}/${s.total} · ${s.mistakes} mistakes · ${clock(Math.ceil(s.elapsed_ms/1000))}${s.pending?' · pending':''}</small></span><b>${s.score}</b></li>`).join('')}</ol></details>`:'<p class="atlas-empty-notes">No completed rounds in this region yet.</p>';
}
function bind(){
 field('geo-study').addEventListener('click',openStudy);
 field('geo-archive').addEventListener('click',()=>void openTrailArchive());
 field('geo-trail-calendar').addEventListener('click',e=>{const entry=(e.target as Element).closest<HTMLElement>('[data-archive-entry]')?.dataset.archiveEntry;if(entry)void openTrailArchive(entry);});
 field('geo-review-controls').addEventListener('click',e=>{
  const button=(e.target as Element).closest<HTMLElement>('button');if(!button)return;
  if(button.dataset.reviewLayer){reviewCities=button.dataset.reviewLayer==='cities';selected=undefined;field<HTMLInputElement>('geo-review-search').value='';field('geo-review-results').hidden=true;field('geo-review-controls').querySelectorAll<HTMLElement>('[data-review-layer]').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.reviewLayer==='cities')===reviewCities)));drawMap();renderSelection();}
  if(button.dataset.place){const city=globeCities[button.dataset.place],c=city?cityLocation(city,countryById.get(city.countryId)!):countryById.get(button.dataset.place);if(c){selected=c;if(city)surface?.focusCity(city);else surface?.focusCountry(c);field('geo-review-results').hidden=true;drawMap();renderSelection();}}
 });
 field('geo-review-search').addEventListener('input',()=>{const query=field<HTMLInputElement>('geo-review-search').value.trim().toLocaleLowerCase(),results=field('geo-review-results');const places=reviewCities?Object.values(globeCities).map(c=>({id:c.id,name:c.name+' · '+countryById.get(c.countryId)!.name})):countries;const matches=query?places.filter(c=>c.name.toLocaleLowerCase().includes(query)).slice(0,8):[];results.hidden=!matches.length;results.innerHTML=matches.map(c=>`<button type="button" data-place="${c.id}">${esc(c.name)}</button>`).join('');});
 field('geo-style').addEventListener('click',e=>{const style=(e.target as Element).closest<HTMLButtonElement>('[data-globe-style]')?.dataset.globeStyle;if(style==='paper'||style==='terrain')void changeStyle(style);});
 field('geo-hint').addEventListener('click',()=>{renderStats();if(selected&&useHint(round,selected)){persist();renderAssistance();}});field('geo-reveal').addEventListener('click',revealSelected);
 field('geo-close-answer').addEventListener('click',()=>{selected=undefined;field('geo-answer').blur();drawMap();renderSelection();});field('geo-country-card').addEventListener('click',e=>{if((e.target as Element).closest('#geo-dismiss-card'))field('geo-country-card').hidden=true;});
 field('geo-player').addEventListener('change',()=>{setIdentity(field<HTMLSelectElement>('geo-player').value as Member||null);openSettings();});
 field('geo-random').addEventListener('click',()=>{renderStats();if(round.ended)return;let left=pool().filter(c=>!resolvedCountry(round,c.id)&&c.id!==selected?.id);if(!left.length)left=pool().filter(c=>!resolvedCountry(round,c.id));if(left.length)selectCountry(left[Math.floor(Math.random()*left.length)],true);});
 field('geo-reset-view').addEventListener('click',resetView);field('geo-zoom-in').addEventListener('click',()=>surface?.zoom(.7));field('geo-zoom-out').addEventListener('click',()=>surface?.zoom(1/.7));
 field('geo-settings').addEventListener('click',openSettings);field('geo-result').addEventListener('click',e=>{if((e.target as HTMLElement).closest('#geo-play-again')){openSettings();if(isRouteMode(round.mode)&&round.route?.complete){field<HTMLSelectElement>('geo-session').value='practice';settingsMode();}}if((e.target as HTMLElement).closest('#geo-compare-trail')){compareTrail=!compareTrail;drawMap();field('geo-compare-trail').textContent=compareTrail?'Show my trail':'Show shortest trail';}});field('geo-settings-close').addEventListener('click',()=>field<HTMLDialogElement>('geo-settings-dialog').close());for(const id of ['geo-mode','geo-session','geo-question'])field(id).addEventListener('change',settingsMode);
 field('geo-settings-form').addEventListener('submit',e=>{e.preventDefault();void startConfiguredRound();});
 field('geo-route-give-up').addEventListener('click',()=>void routeAction('give-up'));
 field('geo-route-start').addEventListener('click',()=>{const id=round.route&&routePuzzle(round.route).start;if(id)surface?.focusCountry(countryById.get(id)!);});
 field('geo-route-end').addEventListener('click',()=>{if(round.route)surface?.focusCountry(countryById.get(routePuzzle(round.route).end)!);});
 field('geo-answer').addEventListener('input',suggest);field('geo-answer-form').addEventListener('submit',e=>{e.preventDefault();checkAnswer();});
 // Wait for a completed tap; a scrolling gesture must never choose an option.
 let gesture:{id:number;x:number;y:number;scroll:number;option:string|undefined;moved:boolean}|undefined;
 const list=field('geo-suggestions');
 list.addEventListener('pointerdown',e=>{gesture={id:e.pointerId,x:e.clientX,y:e.clientY,scroll:list.scrollTop,option:(e.target as HTMLElement).closest<HTMLElement>('[data-option]')?.dataset.option,moved:false};if(e.pointerType==='mouse')e.preventDefault();});
 list.addEventListener('pointermove',e=>{if(gesture&&Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)>8)gesture.moved=true;});
 list.addEventListener('pointercancel',()=>{gesture=undefined;});
 list.addEventListener('click',e=>{if(e.detail===0){const option=(e.target as HTMLElement).closest<HTMLElement>('[data-option]')?.dataset.option;if(option!==undefined)chooseOption(Number(option));}});
 list.addEventListener('pointerup',e=>{const g=gesture;gesture=undefined;const option=(e.target as HTMLElement).closest<HTMLElement>('[data-option]')?.dataset.option;if(g&&g.id===e.pointerId&&!g.moved&&Math.abs(list.scrollTop-g.scroll)<4&&option!==undefined&&option===g.option){e.preventDefault();chooseOption(Number(option));}});
 field('geo-answer').addEventListener('keydown',(e:KeyboardEvent)=>{
  if(e.key==='Escape'){closeSuggestions();return;}if(e.key==='Enter'&&activeOption>=0){e.preventDefault();chooseOption(activeOption);return;}
  if(!['ArrowDown','ArrowUp'].includes(e.key)||!suggestions.length)return;e.preventDefault();activeOption=(activeOption+(e.key==='ArrowDown'?1:-1)+suggestions.length)%suggestions.length;
  for(const [i,el] of [...list.children].entries())el.setAttribute('aria-selected',String(i===activeOption));field('geo-answer').setAttribute('aria-activedescendant',`geo-option-${activeOption}`);list.children[activeOption]?.scrollIntoView({block:'nearest'});
 });
 document.addEventListener('pointerdown',e=>{if(!(e.target as Element).closest('.atlas-combobox'))closeSuggestions();});
 field('geo-show-me').addEventListener('click',()=>{const target=targetById(round.learningTarget||'');if(target&&!resolvedCountry(round,target.id))finishLearning(target,true);});field('geo-next').addEventListener('click',nextLearning);
 for(const id of ['geo-scores-link','geo-pause-link'])field(id).addEventListener('click',()=>field<HTMLDialogElement>('geo-settings-dialog').close());
 field('geo-score-challenge').addEventListener('change',()=>void refreshScores());field('geo-score-region').addEventListener('change',renderScores);field('geo-score-scope').addEventListener('change',renderScores);field('geo-score-retry').addEventListener('click',()=>void refreshScores());
 window.addEventListener('online',()=>void syncScores().catch(()=>{}));document.addEventListener('visibilitychange',()=>{lastTick=performance.now();persist();});window.addEventListener('pagehide',persist);
 const viewport=()=>{const v=window.visualViewport;$('#games-page').style.setProperty('--game-height',`${v?.height||innerHeight}px`);$('#games-page').style.setProperty('--game-offset',`${v?.offsetTop||0}px`);};window.visualViewport?.addEventListener('resize',viewport);window.visualViewport?.addEventListener('scroll',viewport);window.addEventListener('resize',viewport);viewport();
}
export async function refreshGames(){if(location.hash.endsWith('/daily')&&!routeBusy&&(round.mode!=='daily-route'||round.route?.day!==newYorkDay())){field<HTMLSelectElement>('geo-mode').value='route';field<HTMLSelectElement>('geo-session').value='ranked';await startConfiguredRound();}syncMode();renderStats();surface?.setActive(!$('#games-page').hidden&&!$('#geography-page').hidden&&location.hash!=='#games/scores');}
export function enterGames(){surface?.entrance();}
export function exportGames(){download({...round,player:identity||'guest'},'household-geography');}

async function startConfiguredRound(){
 const mode=chosenMode();if(mode==='route'){field<HTMLDialogElement>('geo-settings-dialog').close();await openTrailArchive(undefined,true);return;}trailBoard=undefined;trailEntry='';field('geo-trail-calendar').hidden=true;const player=identity,request=++routeRequest,button=field<HTMLButtonElement>('geo-new-round');button.disabled=true;field('geo-settings-notice').textContent='';
 try{
  let trail:RouteRound|undefined;
  if(mode==='daily-route'){if(!player)throw new Error('Choose a household player in Settings for the daily trail.');trail=await rpc<RouteRound>('geography_route_start',{p:{player}});}
  if(request!==routeRequest||player!==identity)return;
  round=newRound(trail?routePuzzle(trail).region as Region:field<HTMLSelectElement>('geo-new-region').value as Region,isRouteMode(mode)?0:Number(field<HTMLSelectElement>('geo-time-limit').value),isRouteMode(mode)?0:Number(field<HTMLSelectElement>('geo-life-limit').value),trail?'countries':field<HTMLSelectElement>('geo-scope').value as CountryScope,mode);
  round.route=trail;selected=undefined;compareTrail=false;routeBusy=false;checkedDaily=mode==='daily-route'?round.id:'';persist();field<HTMLDialogElement>('geo-settings-dialog').close();location.hash='#games/geography';syncMode(true);resetView();drawMap();renderSelection();renderStats();resumePrompts();
 }catch(error){if(request===routeRequest)field('geo-settings-notice').textContent=error instanceof Error?error.message:'Could not start the trail. Try again.';}
 finally{button.disabled=false;}
}
async function resumeDailyRoute(){
 if(round.mode!=='daily-route'||!identity||routeBusy)return;checkedDaily=round.id;const id=round.id,player=identity,request=++routeRequest;routeBusy=true;renderRoute();
 try{const trail=await rpc<RouteRound>('geography_route_start',{p:{player}});if(request!==routeRequest||round.id!==id||identity!==player)return;round.route=trail;round.region=routePuzzle(trail).region as Region;round.ended=null;persist();drawMap();}
 catch{if(request===routeRequest)field('geo-route-feedback').textContent='Could not sync today’s trail. Reopen Geography or start the daily trail in settings to retry.';}
 finally{if(request===routeRequest){routeBusy=false;renderRoute();}}
}
async function routeAction(choice:string){
 const current=round.route;if(!current||!isRouteMode(round.mode)||current.complete||routeBusy||!playing)return;
 const id=round.id,player=identity,request=++routeRequest;routeBusy=true;renderRoute();
 try{
  const next=round.mode==='daily-route'?await rpc<RouteRound>('geography_route_action',{p:{id:current.id,player,revision:current.revision,choice}}):stepRoute(current,choice);
  if(request!==routeRequest||round.id!==id||identity!==player)return;
  round.route=next;if(next.revision!==current.revision)field<HTMLInputElement>('geo-answer').value='';if(round.startedAt===null)round.startedAt=Date.now();persist();drawMap();renderRoute();
  field('geo-route-feedback').textContent=next.won?'Route connected!':next.revision===current.revision?'That country is already filled in.':({connected:'✅ Connected to an endpoint.',useful:'🟩 Useful country. Connect it to the rest of your route.',detour:'🟧 A possible detour.',miss:'🟥 That country does not help connect this route.'}[next.notice]||'');
 }catch(error){if(request===routeRequest)field('geo-route-feedback').textContent=`${error instanceof Error?error.message:'Connection lost.'} Try the same move again; retries count once.`;}
 finally{if(request===routeRequest){routeBusy=false;renderRoute();}}
}
function renderRoute(){
 const trail=round.route;if(!trail)return;const puzzle=routePuzzle(trail),origin=countryById.get(puzzle.start)!;
 field('geo-region-label').textContent=round.mode==='daily-route'?'Daily trail':'Border Trail';field('geo-correct').textContent=String(trail.steps);field('geo-total').textContent='';field('geo-correct').parentElement!.hidden=true;field('geo-remaining').textContent=`${trail.steps} guesses`;
 field('geo-score-stat').hidden=!trail.complete;field('geo-score').textContent=String(trail.score);field('geo-life-stat').hidden=false;field('geo-lives').textContent=String(Math.max(0,routeGuessLimit(puzzle)-trail.steps));field('geo-revealed-stat').hidden=true;field('geo-clock').textContent='';
 field('geo-route-start').textContent=origin.name;field('geo-route-start').setAttribute('aria-label',`Focus endpoint: ${origin.name}`);field('geo-route-end').textContent=countryById.get(puzzle.end)!.name;
 field('geo-route-count').textContent=`${trail.steps} / ${routeGuessLimit(puzzle)} guesses`;field('geo-route-path').textContent=trail.feedback?.length?trail.feedback.map(f=>`${{connected:'✅',useful:'🟩',detour:'🟧',miss:'🟥'}[f.quality]} ${countryById.get(f.country)!.name}`).join(' · '):trail.path.map(id=>countryById.get(id)!.name).join(' → ');
 field<HTMLButtonElement>('geo-route-give-up').disabled=routeBusy||trail.complete;field('geo-route-panel').setAttribute('aria-busy',String(routeBusy));
 field('geo-result').hidden=!trail.complete;field('geo-answer-form').hidden=trail.complete;field<HTMLButtonElement>('geo-check').disabled=routeBusy;field<HTMLInputElement>('geo-answer').disabled=routeBusy;
 const key=round.id+':'+trail.revision;
 if(trail.complete&&field('geo-result').dataset.round!==key){field('geo-result').dataset.round=key;field('geo-result').innerHTML=`<strong>${trail.won?(trail.score===1000?'Perfect trail':'Destination reached'):'Trail ended'}</strong><span>${trail.score} points · ${trail.steps} guesses · ${puzzle.minimum-1} minimum</span><details><summary>One shortest route · ${puzzle.minimum-1} countries between endpoints</summary><p>${puzzle.solution.map(id=>esc(countryById.get(id)!.name)).join(' → ')}</p><button id="geo-compare-trail" type="button" class="text-button">Show shortest trail</button></details><button type="button" class="text-button" id="geo-play-again">${round.mode==='daily-route'?'Play a practice trail':'Another trail'}</button>${round.mode==='daily-route'?'<button type="button" class="text-button" data-daily-run>Next unfinished daily →</button><a href="#games/scores">Household scores →</a>':''}`;}
}

async function openTrailArchive(entry?:string,advance=false){
 const token=++routeRequest,player=identity;routeBusy=true;
 try{
  const entries=await loadLibrary('geography');if(token!==routeRequest||player!==identity)return;
  const chosen=entry||(advance?nextArchiveEntry(entries):undefined)||selectedArchive('geography',entries);
  const board=await openArchive('geography',chosen,async()=>[]);if(token!==routeRequest||player!==identity)return;
  trailEntries=entries;trailEntry=chosen;rememberArchive('geography',chosen);trailBoard=board;lastTrailSnapshot='';const trail=board.state.attempt as unknown as RouteRound;
  round=newRound(routePuzzle(trail).region as Region,0,0,'countries','route');round.route=trail;selected=undefined;compareTrail=false;
  field('geo-trail-calendar').innerHTML=calendarMarkup(entries,chosen);persist();location.hash='#games/geography';syncMode(true);resetView();drawMap();renderSelection();renderStats();field('geo-trail-calendar').hidden=false;centerArchive(field('geo-trail-calendar'));
 }catch(error){toast(error instanceof Error?error.message:'Could not open the trail archive.');}
 finally{if(token===routeRequest){routeBusy=false;renderRoute();}}
}
