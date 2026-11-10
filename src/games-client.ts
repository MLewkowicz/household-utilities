import {$,esc,name,toast,download} from './ui';
import {identity,onIdentityChange,setIdentity} from './identity';
import {MEMBERS,type Member} from './ledger';
import {REGIONS,type Country,type Region,type Round,newRound,inRegion,answerSuggestions,isAnswer,restoreRound,remainingSeconds,roundEnd,resolvedCountry,countryHints,useHint,revealCountry,pacificRegion,countryPath,countryView} from './geography';
import atlas from './geography-data.json';
import type {GlobeSurface,GlobeStyle} from './globe';
import {mountGlobeFallback} from './globe-fallback';
const countries=atlas as Country[];
let initialized=false,round:Round=newRound(),selected:Country|undefined,suggestions:Country[]=[],activeOption=-1,savedNotice=false,surface:GlobeSurface|undefined,playing=false;
let timer:ReturnType<typeof setInterval>|undefined;
const field=<T extends HTMLElement=HTMLInputElement>(id:string)=>$<T>('#'+id);
const pool=()=>countries.filter(c=>inRegion(c,round.region));
const storageKey=()=>`household-geography-v1:${identity||'guest'}`;
const hasProgress=()=>round.startedAt!==null||round.correct.length>0||round.revealed.length>0;
let mapStyle:GlobeStyle='terrain',pendingStyle:GlobeStyle|undefined,styleRequest=0;try{if(localStorage.getItem('household-globe-style-v1')==='paper')mapStyle='paper';}catch{}
function persist(){try{localStorage.setItem(storageKey(),JSON.stringify(round));}catch{if(!savedNotice){toast('Progress could not be saved on this device. You can keep playing.');savedNotice=true;}}}
function restore(){try{round=restoreRound(JSON.parse(localStorage.getItem(storageKey())||'null'),countries)||newRound();}catch{round=newRound();}selected=undefined;}
const clock=(seconds:number)=>`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
export async function initGames(){
 if(initialized)return;initialized=true;restore();$('#games-page').dataset.mode=location.hash.startsWith('#games/geography')?'quiz':'hub';
 $('#games-page').innerHTML=`<header class="observatory-topbar"><a href="#home" class="observatory-home"><span aria-hidden="true">↓</span> Home</a><div class="observatory-brand"><span aria-hidden="true">✧</span><div>Games</div></div><label class="atlas-player"><span class="sr-only">Playing as</span><select id="geo-player"><option value="">Guest</option>${MEMBERS.map(m=>`<option value="${m}">${name(m)}</option>`).join('')}</select></label><button id="geo-house-settings" type="button" class="observatory-settings" aria-label="Household settings">⚙</button></header>
 <div class="atlas-toolbar"><a href="#games" class="observatory-hub-link">← Game hub</a><label>Region<select id="geo-region">${REGIONS.map(r=>`<option>${r}</option>`).join('')}</select></label><div class="atlas-map-actions"><button id="geo-random" class="button primary" type="button">⤨ Random country</button><button id="geo-reset-view" class="button secondary" type="button">Reset view</button></div><button id="geo-settings" type="button" class="text-button">Round settings</button></div>
 <div class="atlas-stats" aria-label="Round progress"><div><strong id="geo-correct">0</strong><span>correct</span></div><div id="geo-revealed-stat" hidden><strong id="geo-revealed">0</strong><span>revealed</span></div><div><strong id="geo-remaining">242</strong><span>remaining</span></div><div><strong id="geo-lives">∞</strong><span>lives</span></div><div><strong id="geo-clock" role="timer">Untimed</strong><span id="geo-clock-label">time limit</span></div><div class="atlas-progress"><progress id="geo-progress" value="0" max="242" aria-label="Countries completed"></progress><span id="geo-progress-label"></span></div></div>
 <div id="geo-result" class="atlas-result" role="status" hidden></div>
 <div class="atlas-play"><div class="observatory-welcome"><h1>Geography</h1><a id="geo-launch" class="button primary" href="#games/geography">Play geography <span aria-hidden="true">↗</span></a><span class="observatory-caption">242 countries & territories</span></div><div class="atlas-map-frame"><div id="geo-surface"><p class="globe-loading" role="status">Loading globe…</p></div><div class="atlas-map-zoom" aria-label="Globe zoom"><button id="geo-zoom-in" type="button" aria-label="Zoom in">＋</button><button id="geo-zoom-out" type="button" aria-label="Zoom out">−</button><button id="geo-hub-reset" type="button" aria-label="Reset globe view">↺</button></div><div id="geo-style" class="globe-style" role="group" aria-label="Globe style"><button type="button" data-globe-style="terrain" aria-pressed="true" disabled>Terrain</button><button type="button" data-globe-style="paper" aria-pressed="false" disabled>Paper</button></div><span id="geo-style-status" class="globe-style-status" role="status"></span><span class="globe-reticle" aria-hidden="true">＋</span><p class="atlas-map-hint">Drag to turn · scroll or pinch to zoom<span>Arrow keys rotate · Enter selects the center · Home resets</span></p></div>
 <aside class="atlas-answer" aria-label="Country answer"><button id="geo-close-answer" class="atlas-close-answer" type="button" aria-label="Close country panel">×</button><div id="geo-selection"><h2>Select a country</h2><p>Click the globe or use Random country.</p></div><form id="geo-answer-form" hidden autocomplete="off"><label for="geo-answer">Name this country or territory</label><div class="atlas-combobox"><input id="geo-answer" maxlength="100" placeholder="Start typing a name…" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="geo-suggestions" autocomplete="off"><ul id="geo-suggestions" role="listbox" hidden></ul></div><button id="geo-check" class="button primary" type="submit">Check answer</button></form><div id="geo-assistance" class="atlas-assistance" hidden><div class="atlas-assistance-actions"><button type="button" id="geo-hint" class="button secondary">Hint</button><button type="button" id="geo-reveal" class="text-button" aria-describedby="geo-reveal-help">Reveal</button></div><p id="geo-reveal-help">Or triple-click the country. Revealed answers do not count as correct.</p><ul id="geo-hints" aria-live="polite"></ul></div><p id="geo-feedback" role="status" class="atlas-feedback"></p><div id="geo-country-card"></div></aside></div>
 <section class="atlas-collection"><div class="atlas-collection-heading"><div><h2>Correct answers</h2></div><span id="geo-collection-count"></span></div><div id="geo-collection" class="atlas-card-grid"></div><div id="geo-revealed-collection" hidden><h2>Revealed</h2><div id="geo-revealed-cards" class="atlas-card-grid"></div></div></section><p class="atlas-footnote">Progress is saved for each person on this device. Countries and territories include some separately mapped disputed areas. Population figures retain their estimate dates. Relief is simplified and exaggerated for visibility.</p>
 <dialog id="geo-settings-dialog" aria-labelledby="geo-settings-title"><form id="geo-settings-form"><div class="dialog-top"><h2 id="geo-settings-title">Round settings</h2><button class="icon-button" type="button" id="geo-settings-close" aria-label="Close round settings">×</button></div><p id="geo-settings-notice">Choose a region, time limit, and lives.</p><label for="geo-new-region">Region</label><select id="geo-new-region">${REGIONS.map(r=>`<option>${r}</option>`).join('')}</select><label for="geo-time-limit">Time limit</label><select id="geo-time-limit"><option value="0">No time limit</option><option value="60">1 minute</option><option value="180">3 minutes</option><option value="300">5 minutes</option><option value="600">10 minutes</option><option value="900">15 minutes</option></select><label for="geo-life-limit">Lives</label><select id="geo-life-limit"><option value="0">Unlimited</option><option value="3">3 lives</option><option value="5">5 lives</option><option value="10">10 lives</option></select><p class="field-help">One wrong submitted answer costs one life. The clock starts when you select your first country and keeps running if you leave the tab.</p><div class="dialog-actions"><button id="geo-new-round" type="submit" class="button primary">Start new round</button></div></form></dialog>`;
 bind();syncControls();syncStyle();renderStats();renderCollection();
 try{if(new URLSearchParams(location.search).get('webgl')==='0')throw new Error('WebGL disabled');const {mountGlobe}=await import('./globe');surface=await mountGlobe(field('geo-surface'),countries,surfaceSelect,mapStyle);}
 catch{surface=mountGlobeFallback(field('geo-surface'),countries,surfaceSelect,mapStyle);}
 field('geo-surface').addEventListener('globe-unavailable',()=>{surface?.destroy();surface=mountGlobeFallback(field('geo-surface'),countries,surfaceSelect,mapStyle);drawMap();resetView();});
 syncStyle();syncMode(true);drawMap();resetView();renderStats();
 const visibility=new MutationObserver(()=>surface?.setActive(!$('#games-page').hidden));visibility.observe($('#games-page'),{attributes:true,attributeFilter:['hidden']});surface?.setActive(!$('#games-page').hidden);
 onIdentityChange(()=>{restore();syncControls();resetView();drawMap();renderSelection();renderStats();renderCollection();});
 timer=setInterval(()=>{if(!$('#games-page').hidden)renderStats();},250);
}
function surfaceSelect(country:Country,reveal=false){selectCountry(country);if(reveal)revealSelected();}
function syncStyle(){
 $('#games-page').dataset.globeStyle=mapStyle;
 field('geo-style').querySelectorAll<HTMLButtonElement>('button').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.globeStyle===mapStyle));button.disabled=!surface;});
}
async function changeStyle(next:GlobeStyle){
 if(!surface||next===mapStyle&&!pendingStyle)return;const request=++styleRequest;pendingStyle=next;
 field('geo-style-status').textContent=next==='terrain'?'Loading terrain…':'';field('geo-style').setAttribute('aria-busy','true');
 try{await surface.setStyle(next);if(request!==styleRequest)return;mapStyle=next;try{localStorage.setItem('household-globe-style-v1',next);}catch{}field('geo-style-status').textContent='';}
 catch{if(request!==styleRequest)return;field('geo-style-status').textContent='Could not load this style. Try again.';}
 finally{if(request===styleRequest){pendingStyle=undefined;field('geo-style').setAttribute('aria-busy','false');syncStyle();}}
}
function syncControls(){field<HTMLSelectElement>('geo-player').value=identity||'';field<HTMLSelectElement>('geo-region').value=round.region;}
function syncMode(force=false){const next=location.hash.startsWith('#games/geography');if(next===playing&&!force)return;playing=next;$('#games-page').dataset.mode=playing?'quiz':'hub';drawMap();resetView();renderSelection();field('geo-launch').innerHTML=(hasProgress()?'Continue geography':'Play geography')+' <span aria-hidden="true">↗</span>';}
function resetView(){drawMap();surface?.reset();}
function drawMap(){surface?.setState({region:playing?round.region:'World',correct:round.correct,revealed:round.revealed,selected:playing?selected?.id:undefined,playing});}
function renderStats(){
 const total=pool().length,end=roundEnd(round,total);
 if(end&&!round.ended){round.ended=end;round.finishedAt=Date.now();persist();renderSelection();}
 field('geo-correct').textContent=String(round.correct.length);field('geo-remaining').textContent=String(total-round.correct.length-round.revealed.length);field('geo-lives').textContent=round.maxLives?String(Math.max(0,round.maxLives-round.mistakes)):'∞';
 field('geo-revealed').textContent=String(round.revealed.length);field('geo-revealed-stat').hidden=!round.revealed.length;
 const seconds=remainingSeconds(round);field('geo-clock').textContent=seconds===null?'Untimed':clock(seconds);field('geo-clock').classList.toggle('is-low-time',seconds!==null&&seconds<=30);
 field('geo-clock-label').textContent=round.ended?'round finished':!round.limit?'time limit':round.startedAt===null?'starts on first selection':'time remaining';
 field<HTMLProgressElement>('geo-progress').max=total;field<HTMLProgressElement>('geo-progress').value=round.correct.length+round.revealed.length;field('geo-progress-label').textContent=`${round.region} · ${Math.round((round.correct.length+round.revealed.length)/total*100)}% complete`;
 field<HTMLButtonElement>('geo-random').disabled=!!round.ended||!surface;
 field('geo-result').hidden=!round.ended;
 if(round.ended&&field('geo-result').dataset.result!==round.ended){field('geo-result').dataset.result=round.ended;field('geo-result').innerHTML=`<strong>${['won','complete'].includes(round.ended)?'Round complete.':round.ended==='time'?'Time’s up.':'You’re out of lives.'}</strong><span>${round.correct.length} correct${round.revealed.length?`, ${round.revealed.length} revealed`:""} of ${total} in ${esc(round.region)}.</span><button type="button" class="button secondary" id="geo-play-again">Play again</button>`;}
 if(!round.ended)delete field('geo-result').dataset.result;
}
function selectCountry(country:Country,zoom=false){
 if(!playing){location.hash='#games/geography';syncMode();}renderStats();if(!inRegion(country,round.region))return;
 selected=country;
 if(!round.ended&&round.startedAt===null){round.startedAt=Date.now();persist();}
 if(zoom)surface?.focusCountry(country);
 drawMap();renderSelection();
 if(!round.ended&&!resolvedCountry(round,country.id))field('geo-answer').focus({preventScroll:true});
}
function renderSelection(){
 $('#games-page').classList.toggle('has-selection',!!selected);
 const solved=selected&&resolvedCountry(round,selected.id),ended=!!round.ended;
 renderAssistance();
 field('geo-answer-form').hidden=!selected||solved||ended;
 field<HTMLInputElement>('geo-answer').value='';field('geo-feedback').textContent='';closeSuggestions();field('geo-country-card').innerHTML='';
 if(!selected){field('geo-selection').innerHTML='<h2>Select a country</h2><p>Click the globe or use Random country.</p>';return;}
 if(solved){field('geo-selection').innerHTML=`<span class="atlas-coordinate">${round.revealed.includes(selected!.id)?'Revealed · not scored':'Correct'}</span>`;field('geo-country-card').innerHTML=countryCard(selected);return;}
 const [lon,lat]=selected.center;
 field('geo-selection').innerHTML=`<span class="atlas-coordinate">${Math.abs(lat).toFixed(1)}° ${lat>=0?'N':'S'} &nbsp; ${Math.abs(lon).toFixed(1)}° ${lon>=0?'E':'W'}</span><h2>${ended?'Round finished':'Country or territory'}</h2><p>${ended?'Start another round to name more countries.':`Region: ${esc(round.region)}`}</p>`;
}
function countryCard(c:Country){
 return `<article class="atlas-country-card"><p class="atlas-eyebrow">${esc(c.region)}</p><h3>${esc(c.name)}</h3><dl><div><dt>Capital</dt><dd>${esc(c.capital)}</dd></div><div><dt>Population</dt><dd>${esc(c.population)}</dd></div></dl><h4>History</h4><ol>${c.facts.map(f=>`<li>${esc(f)}</li>`).join('')}</ol>${c.terrain?`<div class="atlas-terrain"><h4>Terrain</h4><p>${esc(c.terrain)}</p></div>`:''}</article>`;
}
function collectionCard(c:Country,revealed=false){
 return `<button class="atlas-note ${revealed?'is-revealed':''}" data-review="${c.id}" type="button"><svg viewBox="${countryView(c,pacificRegion(round.region)).join(' ')}" aria-hidden="true"><path d="${countryPath(c,pacificRegion(round.region))}" fill-rule="evenodd"/></svg><span><small>${esc(c.region)}</small><strong>${esc(c.name)}</strong><span>${esc(c.capital)}</span></span><span aria-hidden="true">↗</span></button>`;
}
function renderCollection(){
 const learned=pool().filter(c=>round.correct.includes(c.id)),revealed=pool().filter(c=>round.revealed.includes(c.id));field('geo-collection-count').textContent=`${learned.length}`;
 field('geo-collection').innerHTML=learned.length?learned.map(c=>collectionCard(c)).join(''):'<div class="atlas-empty-notes">No correct answers yet.</div>';
 field('geo-revealed-collection').hidden=!revealed.length;field('geo-revealed-cards').innerHTML=revealed.map(c=>collectionCard(c,true)).join('');
}
function renderAssistance(){
 const available=!!selected&&!round.limit&&!round.ended&&!resolvedCountry(round,selected.id);field('geo-assistance').hidden=!available;
 if(!available){field('geo-hints').innerHTML='';return;}
 const hints=countryHints(selected!,round.region),count=round.hints[selected!.id]||0;
 field('geo-hints').innerHTML=hints.slice(0,count).map(h=>`<li>${esc(h)}</li>`).join('');
 field<HTMLButtonElement>('geo-hint').disabled=count>=hints.length;field('geo-hint').textContent=count===0?'Hint':count<hints.length?'Next hint':'All hints shown';
}
function revealSelected(){
 renderStats();if(!selected||!revealCountry(round,selected))return;
 persist();drawMap();renderSelection();renderCollection();renderStats();
 field('geo-feedback').textContent=`Revealed: ${selected.name}.`;
}
function closeSuggestions(){suggestions=[];activeOption=-1;field('geo-suggestions').hidden=true;field('geo-answer').setAttribute('aria-expanded','false');field('geo-answer').removeAttribute('aria-activedescendant');}
function suggest(){
 activeOption=-1;suggestions=answerSuggestions(countries,field<HTMLInputElement>('geo-answer').value,round.region);
 field('geo-suggestions').innerHTML=suggestions.map((c,i)=>`<li role="option" id="geo-option-${i}" data-option="${i}" aria-selected="false">${esc(c.name)}</li>`).join('');field('geo-suggestions').hidden=!suggestions.length;field('geo-answer').setAttribute('aria-expanded',String(!!suggestions.length));field('geo-answer').removeAttribute('aria-activedescendant');
}
function chooseOption(index:number){const choice=suggestions[index];if(!choice)return;field<HTMLInputElement>('geo-answer').value=choice.name;closeSuggestions();field('geo-answer').focus({preventScroll:true});}
function checkAnswer(){
 renderStats();if(!selected||round.ended||resolvedCountry(round,selected.id))return;
 const answer=field<HTMLInputElement>('geo-answer').value.trim();if(!answer){field('geo-feedback').textContent='Type a country name first.';return;}
 closeSuggestions();
 if(isAnswer(selected,answer)){round.correct.push(selected.id);persist();drawMap();renderSelection();renderCollection();field('geo-feedback').textContent=`Correct: ${selected.name}.`;}
 else{round.mistakes++;persist();field('geo-feedback').textContent=round.maxLives?`Incorrect. ${Math.max(0,round.maxLives-round.mistakes)} lives remaining.`:'Incorrect. Try again.';field<HTMLInputElement>('geo-answer').select();}
 renderStats();
}
function openSettings(region=round.region){field<HTMLSelectElement>('geo-new-region').value=region;field<HTMLSelectElement>('geo-time-limit').value=String(round.limit);field<HTMLSelectElement>('geo-life-limit').value=String(round.maxLives);field('geo-settings-notice').textContent=hasProgress()?'Starting a new round clears this round’s answers. Reset view only changes the globe.':'Choose a region, time limit, and lives.';field<HTMLDialogElement>('geo-settings-dialog').showModal();}
function bind(){
 field('geo-style').addEventListener('click',event=>{const style=(event.target as Element).closest<HTMLButtonElement>('[data-globe-style]')?.dataset.globeStyle;if(style==='paper'||style==='terrain')void changeStyle(style);});
 field('geo-hint').addEventListener('click',()=>{renderStats();if(selected&&useHint(round,selected)){persist();renderAssistance();}});
 field('geo-reveal').addEventListener('click',revealSelected);
 field('geo-house-settings').addEventListener('click',()=>field<HTMLDialogElement>('settings-dialog').showModal());
 field('geo-close-answer').addEventListener('click',()=>{selected=undefined;drawMap();renderSelection();});
 field('geo-hub-reset').addEventListener('click',resetView);
 field('geo-player').addEventListener('change',()=>setIdentity(field<HTMLSelectElement>('geo-player').value as Member||null));
 field('geo-region').addEventListener('change',()=>{const region=field<HTMLSelectElement>('geo-region').value as Region;if(hasProgress()){openSettings(region);syncControls();}else{round=newRound(region,round.limit,round.maxLives);selected=undefined;persist();resetView();drawMap();renderSelection();renderStats();renderCollection();}});
 field('geo-random').addEventListener('click',()=>{renderStats();if(round.ended)return;let left=pool().filter(c=>!resolvedCountry(round,c.id)&&c.id!==selected?.id);if(!left.length)left=pool().filter(c=>!resolvedCountry(round,c.id));if(left.length)selectCountry(left[Math.floor(Math.random()*left.length)],true);});
 field('geo-reset-view').addEventListener('click',resetView);field('geo-zoom-in').addEventListener('click',()=>surface?.zoom(.7));field('geo-zoom-out').addEventListener('click',()=>surface?.zoom(1/.7));
 field('geo-settings').addEventListener('click',()=>openSettings());field('geo-result').addEventListener('click',e=>{if((e.target as HTMLElement).closest('#geo-play-again'))openSettings();});field('geo-settings-close').addEventListener('click',()=>field<HTMLDialogElement>('geo-settings-dialog').close());
 field('geo-settings-form').addEventListener('submit',e=>{e.preventDefault();round=newRound(field<HTMLSelectElement>('geo-new-region').value as Region,Number(field<HTMLSelectElement>('geo-time-limit').value),Number(field<HTMLSelectElement>('geo-life-limit').value));selected=undefined;persist();syncControls();resetView();drawMap();renderSelection();renderStats();renderCollection();field<HTMLDialogElement>('geo-settings-dialog').close();});
 field('geo-answer').addEventListener('input',suggest);field('geo-answer-form').addEventListener('submit',e=>{e.preventDefault();checkAnswer();});
 field('geo-suggestions').addEventListener('pointerdown',e=>{const option=(e.target as HTMLElement).closest<HTMLElement>('[data-option]');if(option){e.preventDefault();chooseOption(Number(option.dataset.option));}});
 field('geo-answer').addEventListener('keydown',(e:KeyboardEvent)=>{
  if(e.key==='Escape'){closeSuggestions();return;}
  if(e.key==='Enter'&&activeOption>=0){e.preventDefault();chooseOption(activeOption);return;}
  if(!['ArrowDown','ArrowUp'].includes(e.key)||!suggestions.length)return;e.preventDefault();activeOption=(activeOption+(e.key==='ArrowDown'?1:-1)+suggestions.length)%suggestions.length;
  for(const [i,el] of [...field('geo-suggestions').children].entries())el.setAttribute('aria-selected',String(i===activeOption));field('geo-answer').setAttribute('aria-activedescendant',`geo-option-${activeOption}`);
 });
 field('geo-answer').addEventListener('blur',()=>setTimeout(()=>closeSuggestions(),120));
 $('.atlas-collection').addEventListener('click',e=>{const id=(e.target as HTMLElement).closest<HTMLElement>('[data-review]')?.dataset.review,c=countries.find(c=>c.id===id);if(c){selectCountry(c,true);field('geo-selection').scrollIntoView({behavior:'smooth',block:'nearest'});}});
}
export async function refreshGames(){syncMode();renderStats();surface?.setActive(!$('#games-page').hidden);}
export function enterGames(){surface?.entrance();$('#games-page').classList.remove('is-arriving');void $('#games-page').offsetWidth;$('#games-page').classList.add('is-arriving');}
export function exportGames(){download({...round,player:identity||'guest'},'household-geography');}
