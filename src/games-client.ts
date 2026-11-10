import {$,esc,name,toast,download} from './ui';
import {identity,onIdentityChange,setIdentity} from './identity';
import {MEMBERS,type Member} from './ledger';
import {REGIONS,type Country,type Region,type Round,type CountryScope,type GameMode,newRound,inPool,answerSuggestions,isAnswer,restoreRound,remainingSeconds,roundEnd,resolvedCountry,countryHints,useHint,revealCountry,pacificRegion,countryPath,countryView,shuffledCountries,roundScore} from './geography';
import {recordScore,syncScores,loadScores,bestScores,type GeoScore} from './geography-scores';
import atlas from './geography-data.json';
import type {GlobeSurface,GlobeStyle} from './globe';
import {mountGlobeFallback} from './globe-fallback';
const countries=atlas as Country[],countryById=new Map(countries.map(c=>[c.id,c]));
let initialized=false,round:Round=newRound(),selected:Country|undefined,suggestions:Country[]=[],activeOption=-1,savedNotice=false,surface:GlobeSurface|undefined,playing=false;
let mapStyle:GlobeStyle='terrain',pendingStyle:GlobeStyle|undefined,styleRequest=0,scoreRequest=0,scoreRows:GeoScore[]=[],lastTick=performance.now(),lastSavedSecond=-1;
try{if(localStorage.getItem('household-globe-style-v1')==='paper')mapStyle='paper';}catch{}
const field=<T extends HTMLElement=HTMLInputElement>(id:string)=>$<T>('#'+id);
const pool=()=>countries.filter(c=>inPool(c,round.region,round.scope));
const storageKey=()=>`household-geography-v1:${identity||'guest'}`;
const hasProgress=()=>round.startedAt!==null||round.correct.length>0||round.revealed.length>0;
const clock=(seconds:number)=>`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
const regionOptions=()=>REGIONS.map(r=>`<option>${r}</option>`).join('');
const trophyIcon='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h10v6a5 5 0 0 1-10 0V3ZM7 5H3v2a4 4 0 0 0 4 4m10-6h4v2a4 4 0 0 1-4 4M12 14v6m-4 1h8"/></svg>';
const scopeOptions='<option value="countries">Countries only · 195</option><option value="expanded">Expanded · countries & territories</option>';
function persist(){try{localStorage.setItem(storageKey(),JSON.stringify(round));}catch{if(!savedNotice){toast('Progress could not be saved on this device. You can keep playing.');savedNotice=true;}}}
function restore(){try{round=restoreRound(JSON.parse(localStorage.getItem(storageKey())||'null'),countries)||newRound();}catch{round=newRound();}selected=round.mode==='learn'&&round.learningTarget&&resolvedCountry(round,round.learningTarget)?countryById.get(round.learningTarget):undefined;}
export async function initGames(){
 if(initialized)return;initialized=true;restore();
 $('#games-page').innerHTML=`<header class="observatory-topbar"><a href="#home" class="observatory-home" aria-label="Return home">↓ <span>Home</span></a><div class="atlas-status" aria-label="Round progress"><span id="geo-region-label"></span><span><b id="geo-correct">0</b>/<span id="geo-total">195</span></span><span id="geo-score-stat" hidden><b id="geo-score">0</b> pts</span><span id="geo-revealed-stat" hidden><b id="geo-revealed">0</b> shown</span><span id="geo-life-stat" hidden>♡ <b id="geo-lives">∞</b></span><span id="geo-clock" role="timer"></span><span id="geo-remaining" class="sr-only"></span></div><a href="#games/scores" class="atlas-icon" aria-label="Leaderboard">${trophyIcon}</a><button id="geo-settings" type="button" class="atlas-icon" aria-label="Game settings">⚙</button></header>
 <div id="geo-play-controls" class="atlas-answer" aria-label="Country answer"><div id="geo-selection">Tap a country to name it.</div><form id="geo-answer-form" hidden autocomplete="off"><label for="geo-answer" class="sr-only">Name this country</label><div class="atlas-combobox"><input id="geo-answer" maxlength="100" placeholder="Country name…" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="geo-suggestions" autocomplete="off" autocapitalize="words" spellcheck="false" enterkeyhint="done"><ul id="geo-suggestions" role="listbox" hidden></ul></div><button id="geo-check" class="atlas-icon" type="submit" aria-label="Check answer">↵</button></form><div id="geo-learning" hidden><strong id="geo-learning-prompt"></strong><span id="geo-learning-clock"></span><button id="geo-show-me" class="text-button" type="button">Show me</button><button id="geo-next" class="button primary" type="button" hidden>Next</button></div><div class="atlas-answer-actions"><div id="geo-assistance" hidden><button type="button" id="geo-hint" class="text-button">Hint</button><button type="button" id="geo-reveal" class="text-button">Reveal</button></div><button id="geo-random" class="atlas-icon" type="button" aria-label="Random country">⤨</button><button id="geo-close-answer" class="atlas-icon" type="button" aria-label="Close country panel" hidden>×</button></div><ul id="geo-hints" aria-live="polite"></ul><p id="geo-feedback" role="status" class="atlas-feedback"></p></div>
 <div class="atlas-play"><div class="observatory-welcome"><a id="geo-launch" class="button primary" href="#games/geography">Continue</a></div><div class="atlas-map-frame"><div id="geo-surface"><p class="globe-loading" role="status">Loading globe…</p></div><div class="atlas-map-zoom" aria-label="Globe zoom"><button id="geo-zoom-in" type="button" aria-label="Zoom in">＋</button><button id="geo-zoom-out" type="button" aria-label="Zoom out">−</button><button id="geo-reset-view" type="button" aria-label="Reset view">↺</button></div><span class="globe-reticle" aria-hidden="true">＋</span></div></div>
 <div id="geo-result" class="atlas-result" role="status" hidden></div><aside id="geo-country-card" class="atlas-card-panel" hidden></aside>
 <section id="geo-score-screen" class="atlas-score-screen" hidden><a href="#games/geography">← Back to game</a><h1>Leaderboard</h1><p>5 minutes · 3 lives · 100 points per country, −25 per mistake.</p><div class="atlas-score-filters"><label>Region<select id="geo-score-region">${regionOptions()}</select></label><label>Country set<select id="geo-score-scope">${scopeOptions}</select></label></div><p id="geo-score-status" role="status"></p><div id="geo-score-list"></div><button type="button" id="geo-score-retry" class="text-button">Refresh scores</button><p class="field-help">Each player’s best round. Ties use correct answers, then fastest time. Guest scores stay on this device.</p></section>
 <dialog id="geo-settings-dialog" aria-labelledby="geo-settings-title"><form id="geo-settings-form"><div class="dialog-top"><h2 id="geo-settings-title">Game settings</h2><button class="icon-button" type="button" id="geo-settings-close" aria-label="Close game settings">×</button></div><label>Playing as<select id="geo-player"><option value="">Guest</option>${MEMBERS.map(m=>`<option value="${m}">${name(m)}</option>`).join('')}</select></label><label>Mode<select id="geo-mode"><option value="practice">Practice · name countries</option><option value="learn">Learn · find countries</option><option value="competitive">Competitive · beat your best</option></select></label><label>Region<select id="geo-new-region">${regionOptions()}</select></label><label>Country set<select id="geo-scope">${scopeOptions}</select></label><p class="field-help">Countries only uses UN members plus the Holy See and Palestine. Expanded includes territories, disputed areas and Antarctica.</p><div id="geo-practice-options"><label>Time limit<select id="geo-time-limit"><option value="0">No time limit</option><option value="60">1 minute</option><option value="180">3 minutes</option><option value="300">5 minutes</option><option value="600">10 minutes</option><option value="900">15 minutes</option></select></label><label>Lives<select id="geo-life-limit"><option value="0">Unlimited</option><option value="3">3 lives</option><option value="5">5 lives</option><option value="10">10 lives</option></select></label></div><p id="geo-mode-help" class="field-help"></p><p id="geo-settings-notice" class="field-help"></p><button id="geo-new-round" type="submit" class="button primary">Start new round</button><hr><label>Globe style</label><div id="geo-style" class="globe-style" role="group" aria-label="Globe style"><button type="button" data-globe-style="terrain" aria-pressed="true" disabled>Terrain</button><button type="button" data-globe-style="paper" aria-pressed="false" disabled>Paper</button></div><span id="geo-style-status" role="status"></span><div class="atlas-settings-links"><button id="geo-review" type="button" class="text-button">Review countries</button><a href="#games/scores" id="geo-scores-link">Leaderboard</a><a href="#games" id="geo-pause-link">Pause / continue screen</a></div></form></dialog>
 <dialog id="geo-review-dialog" aria-labelledby="geo-review-title"><div class="dialog-top"><h2 id="geo-review-title">Your countries</h2><button id="geo-review-close" class="icon-button" type="button" aria-label="Close review">×</button></div><section class="atlas-collection"><h3>Correct answers</h3><div id="geo-collection" class="atlas-card-grid"></div><div id="geo-revealed-collection" hidden><h3>Shown to you</h3><div id="geo-revealed-cards" class="atlas-card-grid"></div></div></section></dialog>`;
 bind();syncMode(true);syncControls();syncStyle();renderStats();renderCollection();renderSelection();
 try{if(new URLSearchParams(location.search).get('webgl')==='0')throw new Error('WebGL disabled');const {mountGlobe}=await import('./globe');surface=await mountGlobe(field('geo-surface'),countries,surfaceSelect,mapStyle);}
 catch{surface=mountGlobeFallback(field('geo-surface'),countries,surfaceSelect,mapStyle);}
 field('geo-surface').addEventListener('globe-unavailable',()=>{surface?.destroy();surface=mountGlobeFallback(field('geo-surface'),countries,surfaceSelect,mapStyle);drawMap();resetView();});
 syncStyle();drawMap();resetView();resumeLearning();renderStats();
 const visibility=new MutationObserver(()=>{surface?.setActive(!$('#games-page').hidden&&location.hash!=='#games/scores');lastTick=performance.now();persist();});visibility.observe($('#games-page'),{attributes:true,attributeFilter:['hidden']});
 onIdentityChange(()=>{restore();syncControls();resetView();drawMap();renderSelection();renderStats();renderCollection();resumeLearning();});
 setInterval(tick,250);void syncScores().catch(()=>{});
}
function syncControls(){field<HTMLSelectElement>('geo-player').value=identity||'';}
function syncMode(force=false){
 const next=location.hash.startsWith('#games/geography'),scores=location.hash==='#games/scores';
 if(next===playing&&!force&&$('#games-page').dataset.mode===(scores?'scores':next?'quiz':'hub'))return;
 playing=next;$('#games-page').dataset.mode=scores?'scores':playing?'quiz':'hub';field('geo-score-screen').hidden=!scores;
 lastTick=performance.now();drawMap();surface?.setActive(!$('#games-page').hidden&&!scores);renderSelection();
 if(scores){field<HTMLSelectElement>('geo-score-region').value=round.region;field<HTMLSelectElement>('geo-score-scope').value=round.scope;void refreshScores();}else if(playing)resumeLearning();
}
function drawMap(){surface?.setState({region:playing?round.region:'World',scope:round.scope,correct:round.correct,revealed:round.revealed,selected:playing?selected?.id:undefined,label:playing&&round.mode==='learn'&&selected&&resolvedCountry(round,selected.id)?selected.id:undefined,playing});}
function resetView(){drawMap();surface?.reset();}
function syncStyle(){field('geo-style').querySelectorAll<HTMLButtonElement>('button').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.globeStyle===mapStyle));b.disabled=!surface;});}
async function changeStyle(next:GlobeStyle){
 if(!surface||next===mapStyle&&!pendingStyle)return;const request=++styleRequest;pendingStyle=next;
 field('geo-style-status').textContent=next==='terrain'?'Loading terrain…':'';field('geo-style').setAttribute('aria-busy','true');
 try{await surface.setStyle(next);if(request!==styleRequest)return;mapStyle=next;try{localStorage.setItem('household-globe-style-v1',next);}catch{}field('geo-style-status').textContent='';}
 catch{if(request===styleRequest)field('geo-style-status').textContent='Could not load this style. Try again.';}
 finally{if(request===styleRequest){pendingStyle=undefined;field('geo-style').setAttribute('aria-busy','false');syncStyle();}}
}
function renderStats(){
 const total=pool().length,end=roundEnd(round,total);
 if(end&&!round.ended){round.ended=end;round.finishedAt=round.ended==='time'?round.startedAt!+round.limit*1000:Date.now();persist();recordScore(round,identity||'guest',total);void syncScores().catch(()=>{});renderSelection();}
 if(round.ended)recordScore(round,identity||'guest',total);
 field('geo-region-label').textContent=round.region;field('geo-correct').textContent=String(round.correct.length);field('geo-total').textContent=String(total);field('geo-remaining').textContent=String(total-round.correct.length-round.revealed.length);
 field('geo-score-stat').hidden=round.mode!=='competitive';field('geo-score').textContent=String(roundScore(round));field('geo-life-stat').hidden=!round.maxLives;field('geo-lives').textContent=round.maxLives?String(Math.max(0,round.maxLives-round.mistakes)):'∞';
 field('geo-revealed').textContent=String(round.revealed.length);field('geo-revealed-stat').hidden=!round.revealed.length;
 const seconds=remainingSeconds(round);field('geo-clock').textContent=seconds===null?'':clock(seconds);field('geo-clock').classList.toggle('is-low-time',seconds!==null&&seconds<=30);
 field<HTMLButtonElement>('geo-random').disabled=!!round.ended||!surface;
 field('geo-result').hidden=!round.ended;
 if(round.ended&&field('geo-result').dataset.round!==round.id){field('geo-result').dataset.round=round.id;field('geo-result').innerHTML=`<strong>${['won','complete'].includes(round.ended)?'Round complete':round.ended==='time'?'Time’s up':'You’re out of lives'}</strong><span>${round.correct.length} correct${round.revealed.length?`, ${round.revealed.length} shown`:''} of ${total}${round.mode==='competitive'?` · ${roundScore(round)} points`:''}</span><button type="button" class="text-button" id="geo-play-again">Play again</button>${round.mode==='competitive'?'<a href="#games/scores">Scores →</a>':''}`;}
}
function selectCountry(country:Country,zoom=false){
 if(!playing)return;renderStats();if(!inPool(country,round.region,round.scope))return;
 selected=country;if(!round.ended&&round.startedAt===null){round.startedAt=Date.now();persist();}
 if(zoom)surface?.focusCountry(country);drawMap();renderSelection();
 if(!round.ended&&!resolvedCountry(round,country.id)&&matchMedia('(pointer:fine)').matches)field('geo-answer').focus({preventScroll:true});
}
function surfaceSelect(country:Country,reveal=false){
 if(!playing)return;
 if(round.mode==='learn'){
  if(round.ended||!round.learningTarget||resolvedCountry(round,round.learningTarget))return;
  if(country.id===round.learningTarget){round.correct.push(country.id);finishLearning(country,false);}
  else if(inPool(country,round.region,round.scope)){round.mistakes++;persist();field('geo-feedback').textContent='Try again, or choose Show me.';}
  return;
 }
 selectCountry(country);if(reveal)revealSelected();
}
function renderSelection(){
 const learning=round.mode==='learn',solved=!!selected&&resolvedCountry(round,selected.id),answerable=!!selected&&!solved&&!round.ended&&!learning;
 field('geo-answer-form').hidden=!answerable;field('geo-selection').hidden=answerable||learning;field('geo-learning').hidden=!learning;field('geo-random').hidden=learning;field('geo-close-answer').hidden=!selected||learning;
 field<HTMLInputElement>('geo-answer').value='';field('geo-feedback').textContent='';closeSuggestions();field('geo-country-card').hidden=!solved;field('geo-country-card').innerHTML=solved?`<button type="button" id="geo-dismiss-card" class="atlas-icon" aria-label="Close country facts">×</button>${countryCard(selected!)}`:'';
 field('geo-selection').textContent=round.ended?'Round finished':solved?`${selected!.name} · ${round.revealed.includes(selected!.id)?'shown':'correct'}`:'Tap a country to name it.';
 renderAssistance();renderLearning();
}
function countryCard(c:Country){
 const terrain=c.terrain.replace(/^metropolitan France:\s*/,'').split(/;| French Guiana:/)[0];
 return `<article class="atlas-country-card"><h3>${esc(c.name)}</h3><p class="atlas-capital">${esc(c.capital)}</p>${c.facts.length?`<p class="atlas-history">${esc(c.facts[0])}</p>`:''}${c.facts.length>1?`<details><summary>More history</summary>${c.facts.slice(1).map(f=>`<p>${esc(f)}</p>`).join('')}</details>`:''}${terrain?`<p class="atlas-terrain">${esc(terrain.length>150?terrain.slice(0,147).replace(/\s+\S*$/,'')+'…':terrain)}</p>`:''}</article>`;
}
function collectionCard(c:Country,revealed=false){return `<button class="atlas-note ${revealed?'is-revealed':''}" data-review="${c.id}" type="button"><svg viewBox="${countryView(c,pacificRegion(round.region)).join(' ')}" aria-hidden="true"><path d="${countryPath(c,pacificRegion(round.region))}" fill-rule="evenodd"/></svg><span>${esc(c.name)}</span></button>`;}
function renderCollection(){const learned=pool().filter(c=>round.correct.includes(c.id)),revealed=pool().filter(c=>round.revealed.includes(c.id));field('geo-collection').innerHTML=learned.length?learned.map(c=>collectionCard(c)).join(''):'<p>No correct answers yet.</p>';field('geo-revealed-collection').hidden=!revealed.length;field('geo-revealed-cards').innerHTML=revealed.map(c=>collectionCard(c,true)).join('');}
function renderAssistance(){
 const available=!!selected&&round.mode==='practice'&&!round.limit&&!round.ended&&!resolvedCountry(round,selected.id);field('geo-assistance').hidden=!available;field('geo-hints').hidden=!available;
 if(!available){field('geo-hints').innerHTML='';return;}
 const hints=countryHints(selected!,round.region),count=round.hints[selected!.id]||0;field('geo-hints').innerHTML=hints.slice(0,count).map(h=>`<li>${esc(h)}</li>`).join('');field<HTMLButtonElement>('geo-hint').disabled=count>=hints.length;
}
function revealSelected(){renderStats();if(!selected||!revealCountry(round,selected))return;persist();drawMap();renderSelection();renderCollection();renderStats();}
function closeSuggestions(){suggestions=[];activeOption=-1;field('geo-suggestions').hidden=true;field('geo-answer').setAttribute('aria-expanded','false');field('geo-answer').removeAttribute('aria-activedescendant');}
function suggest(){
 activeOption=-1;suggestions=answerSuggestions(pool(),field<HTMLInputElement>('geo-answer').value,round.region);
 field('geo-suggestions').innerHTML=suggestions.map((c,i)=>`<li role="option" id="geo-option-${i}" data-option="${i}" aria-selected="false">${esc(c.name)}</li>`).join('');field('geo-suggestions').hidden=!suggestions.length;field('geo-answer').setAttribute('aria-expanded',String(!!suggestions.length));field('geo-answer').removeAttribute('aria-activedescendant');
}
function chooseOption(index:number){const choice=suggestions[index];if(!choice)return;field<HTMLInputElement>('geo-answer').value=choice.name;closeSuggestions();field('geo-answer').focus({preventScroll:true});}
function checkAnswer(){
 renderStats();if(!selected||round.ended||resolvedCountry(round,selected.id)||round.mode==='learn')return;
 const answer=field<HTMLInputElement>('geo-answer').value.trim();if(!answer){field('geo-feedback').textContent='Type a country name first.';return;}closeSuggestions();
 if(isAnswer(selected,answer)){round.correct.push(selected.id);persist();field('geo-answer').blur();drawMap();renderSelection();renderCollection();}
 else{round.mistakes++;persist();field('geo-feedback').textContent='Not quite. Try again.';field<HTMLInputElement>('geo-answer').select();}renderStats();
}
function resumeLearning(){
 if(!playing||round.mode!=='learn'||!surface)return;
 if(!round.learningTarget&&!round.ended)nextLearning();
 else{selected=round.learningTarget&&resolvedCountry(round,round.learningTarget)?countryById.get(round.learningTarget):undefined;drawMap();if(selected)surface.focusCountry(selected);renderSelection();}
}
function nextLearning(){
 renderStats();if(round.ended)return;
 if(!round.learningOrder.length)round.learningOrder=shuffledCountries(pool());
 round.learningTarget=round.learningOrder.find(id=>!resolvedCountry(round,id));round.learningRemaining=12000;selected=undefined;lastTick=performance.now();
 if(round.startedAt===null)round.startedAt=Date.now();persist();resetView();renderSelection();
}
function renderLearning(){
 if(round.mode!=='learn')return;const target=countryById.get(round.learningTarget||''),shown=!!target&&resolvedCountry(round,target.id);
 field('geo-learning-prompt').textContent=target?`${shown?'':'Find '}${target.name}`:'Round complete';field('geo-learning-clock').textContent=shown||round.ended?'':`${Math.ceil(round.learningRemaining/1000)}s`;
 field('geo-show-me').hidden=shown||!!round.ended;field('geo-next').hidden=!shown||!!round.ended;
}
function finishLearning(country:Country,revealed:boolean){
 if(revealed&&!revealCountry(round,country))return;selected=country;persist();drawMap();surface?.focusCountry(country);renderSelection();renderCollection();renderStats();
 field('geo-feedback').textContent=revealed?'Here it is. Take a look, then choose Next.':'Found it!';
}
function tick(){
 const now=performance.now(),elapsed=now-lastTick;lastTick=now;
 if($('#games-page').hidden)return;renderStats();
 if(!playing||document.hidden||round.mode!=='learn'||round.ended||!round.learningTarget||resolvedCountry(round,round.learningTarget)||document.querySelector('dialog[open]'))return;
 round.learningRemaining=Math.max(0,round.learningRemaining-elapsed);renderLearning();
 const second=Math.ceil(round.learningRemaining/1000);if(second!==lastSavedSecond){persist();lastSavedSecond=second;}
 if(round.learningRemaining===0)finishLearning(countryById.get(round.learningTarget)!,true);
}
function settingsMode(){const mode=field<HTMLSelectElement>('geo-mode').value;field('geo-practice-options').hidden=mode!=='practice';field('geo-mode-help').textContent=mode==='learn'?'Find each country in a shuffled region. After 12 seconds, it is filled, labeled and shown close up. Menus pause the countdown.':mode==='competitive'?'5 minutes, 3 lives, no hints. Completed rounds enter the leaderboard. The clock keeps running when you leave.':'Tap a country and type its name. Hints and reveals are available in untimed rounds.';}
function openSettings(){
 field('geo-answer').blur();closeSuggestions();field<HTMLSelectElement>('geo-new-region').value=round.region;field<HTMLSelectElement>('geo-time-limit').value=String(round.limit);field<HTMLSelectElement>('geo-life-limit').value=String(round.maxLives);field<HTMLSelectElement>('geo-mode').value=round.mode;field<HTMLSelectElement>('geo-scope').value=round.scope;
 field('geo-settings-notice').textContent=hasProgress()?'Starting a new round replaces your current progress.':'';settingsMode();field<HTMLDialogElement>('geo-settings-dialog').showModal();
}
async function refreshScores(){
 const request=++scoreRequest;field('geo-score-status').textContent='Loading scores…';const result=await loadScores();if(request!==scoreRequest)return;
 scoreRows=result.rows;field('geo-score-status').textContent=result.shared?'Shared household scores':'Shared scores unavailable. Showing this device; pending scores will retry.';renderScores();
}
function renderScores(){
 const rows=bestScores(scoreRows,field<HTMLSelectElement>('geo-score-region').value as Region,field<HTMLSelectElement>('geo-score-scope').value as CountryScope);
 field('geo-score-list').innerHTML=rows.length?`<ol class="atlas-leaderboard">${rows.map(s=>`<li><span><strong>${esc(name(s.player))}</strong><small>${s.correct}/${s.total} · ${s.mistakes} mistakes · ${clock(Math.ceil(s.elapsed_ms/1000))}${s.pending?' · pending':''}</small></span><b>${s.score}</b></li>`).join('')}</ol>`:'<p class="atlas-empty-notes">No completed rounds in this region yet.</p>';
}
function bind(){
 field('geo-style').addEventListener('click',e=>{const style=(e.target as Element).closest<HTMLButtonElement>('[data-globe-style]')?.dataset.globeStyle;if(style==='paper'||style==='terrain')void changeStyle(style);});
 field('geo-hint').addEventListener('click',()=>{renderStats();if(selected&&useHint(round,selected)){persist();renderAssistance();}});field('geo-reveal').addEventListener('click',revealSelected);
 field('geo-close-answer').addEventListener('click',()=>{selected=undefined;field('geo-answer').blur();drawMap();renderSelection();});field('geo-country-card').addEventListener('click',e=>{if((e.target as Element).closest('#geo-dismiss-card'))field('geo-country-card').hidden=true;});
 field('geo-player').addEventListener('change',()=>{setIdentity(field<HTMLSelectElement>('geo-player').value as Member||null);openSettings();});
 field('geo-random').addEventListener('click',()=>{renderStats();if(round.ended)return;let left=pool().filter(c=>!resolvedCountry(round,c.id)&&c.id!==selected?.id);if(!left.length)left=pool().filter(c=>!resolvedCountry(round,c.id));if(left.length)selectCountry(left[Math.floor(Math.random()*left.length)],true);});
 field('geo-reset-view').addEventListener('click',resetView);field('geo-zoom-in').addEventListener('click',()=>surface?.zoom(.7));field('geo-zoom-out').addEventListener('click',()=>surface?.zoom(1/.7));
 field('geo-settings').addEventListener('click',openSettings);field('geo-result').addEventListener('click',e=>{if((e.target as HTMLElement).closest('#geo-play-again'))openSettings();});field('geo-settings-close').addEventListener('click',()=>field<HTMLDialogElement>('geo-settings-dialog').close());field('geo-mode').addEventListener('change',settingsMode);
 field('geo-settings-form').addEventListener('submit',e=>{
  e.preventDefault();round=newRound(field<HTMLSelectElement>('geo-new-region').value as Region,Number(field<HTMLSelectElement>('geo-time-limit').value),Number(field<HTMLSelectElement>('geo-life-limit').value),field<HTMLSelectElement>('geo-scope').value as CountryScope,field<HTMLSelectElement>('geo-mode').value as GameMode);selected=undefined;persist();field<HTMLDialogElement>('geo-settings-dialog').close();location.hash='#games/geography';syncMode();resetView();drawMap();renderSelection();renderStats();renderCollection();resumeLearning();
 });
 field('geo-answer').addEventListener('input',suggest);field('geo-answer-form').addEventListener('submit',e=>{e.preventDefault();checkAnswer();});
 // Wait for a completed tap; a scrolling gesture must never choose an option.
 let gesture:{id:number;x:number;y:number;scroll:number;option:string|undefined;moved:boolean}|undefined;
 const list=field('geo-suggestions');
 list.addEventListener('pointerdown',e=>{gesture={id:e.pointerId,x:e.clientX,y:e.clientY,scroll:list.scrollTop,option:(e.target as HTMLElement).closest<HTMLElement>('[data-option]')?.dataset.option,moved:false};if(e.pointerType==='mouse')e.preventDefault();});
 list.addEventListener('pointermove',e=>{if(gesture&&Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)>8)gesture.moved=true;});
 list.addEventListener('pointercancel',()=>{gesture=undefined;});
 list.addEventListener('pointerup',e=>{const g=gesture;gesture=undefined;const option=(e.target as HTMLElement).closest<HTMLElement>('[data-option]')?.dataset.option;if(g&&g.id===e.pointerId&&!g.moved&&Math.abs(list.scrollTop-g.scroll)<4&&option!==undefined&&option===g.option){e.preventDefault();chooseOption(Number(option));}});
 field('geo-answer').addEventListener('keydown',(e:KeyboardEvent)=>{
  if(e.key==='Escape'){closeSuggestions();return;}if(e.key==='Enter'&&activeOption>=0){e.preventDefault();chooseOption(activeOption);return;}
  if(!['ArrowDown','ArrowUp'].includes(e.key)||!suggestions.length)return;e.preventDefault();activeOption=(activeOption+(e.key==='ArrowDown'?1:-1)+suggestions.length)%suggestions.length;
  for(const [i,el] of [...list.children].entries())el.setAttribute('aria-selected',String(i===activeOption));field('geo-answer').setAttribute('aria-activedescendant',`geo-option-${activeOption}`);list.children[activeOption]?.scrollIntoView({block:'nearest'});
 });
 document.addEventListener('pointerdown',e=>{if(!(e.target as Element).closest('.atlas-combobox'))closeSuggestions();});
 field('geo-show-me').addEventListener('click',()=>{const target=countryById.get(round.learningTarget||'');if(target&&!resolvedCountry(round,target.id))finishLearning(target,true);});field('geo-next').addEventListener('click',nextLearning);
 field('geo-review').addEventListener('click',()=>{field<HTMLDialogElement>('geo-settings-dialog').close();renderCollection();field<HTMLDialogElement>('geo-review-dialog').showModal();});field('geo-review-close').addEventListener('click',()=>field<HTMLDialogElement>('geo-review-dialog').close());
 $('.atlas-collection').addEventListener('click',e=>{const id=(e.target as HTMLElement).closest<HTMLElement>('[data-review]')?.dataset.review,c=countryById.get(id||'');if(c){field<HTMLDialogElement>('geo-review-dialog').close();location.hash='#games/geography';syncMode();selected=c;drawMap();surface?.focusCountry(c);renderSelection();}});
 for(const id of ['geo-scores-link','geo-pause-link'])field(id).addEventListener('click',()=>field<HTMLDialogElement>('geo-settings-dialog').close());
 field('geo-score-region').addEventListener('change',renderScores);field('geo-score-scope').addEventListener('change',renderScores);field('geo-score-retry').addEventListener('click',()=>void refreshScores());
 window.addEventListener('online',()=>void syncScores().catch(()=>{}));document.addEventListener('visibilitychange',()=>{lastTick=performance.now();persist();});window.addEventListener('pagehide',persist);
 const viewport=()=>{const v=window.visualViewport;$('#games-page').style.setProperty('--game-height',`${v?.height||innerHeight}px`);$('#games-page').style.setProperty('--game-offset',`${v?.offsetTop||0}px`);};window.visualViewport?.addEventListener('resize',viewport);window.visualViewport?.addEventListener('scroll',viewport);window.addEventListener('resize',viewport);viewport();
}
export async function refreshGames(){syncMode();renderStats();surface?.setActive(!$('#games-page').hidden&&location.hash!=='#games/scores');}
export function enterGames(){surface?.entrance();}
export function exportGames(){download({...round,player:identity||'guest'},'household-geography');}
