import {timedGame,elapsedPuzzleTime,formatPuzzleTime} from './puzzle-clock';
import {gridMarkup,mountGrid} from './grid-puzzle';
import {centerArchive,calendarMarkup,loadLibrary,newYorkDay,nextArchiveEntry,selectedArchive,rememberArchive,openArchive,storeArchive,updateCalendar,type CalendarEntry,type ArchiveBoard} from './game-library';
import {mountTimelineSort} from './timeline-sort';
import {timelineReview} from './timeline-review';
import {themeToggleMarkup,settingsButtonMarkup} from './settings';
import {renderPodium} from './game-podium';
import {silhouetteCredit} from './size-silhouettes';
import {emptyGroups,guessGroup,type WordGroup} from './group-puzzle';
import {gameArt} from './game-art';
import {mountGameNavigation} from './game-navigation';
import {$,esc,name,rpc,download} from './ui';
import {identity,onIdentityChange} from './identity';
import {GAMES,type TriviaId} from './game-registry';
import {scoreAnswer,silhouette,type Question,type Attempt,type Answer} from './trivia-model';
let game:TriviaId='odd-one-out',attempt:Attempt|undefined,mode:'daily'|'practice'='daily',period='day',review:number|null=null,request=0,busy=false,draft:Answer='',error='',bound=false;
let entries:CalendarEntry[]=[],archiveEntry='',archiveBoard:ArchiveBoard|undefined,libraryOwner='',modeOwner='';
let clockOffset=0;
let scaleObserver:ResizeObserver|undefined;
let clearTimeline:(()=>void)|undefined;
const host=()=>$('#trivia-page');
const current=()=>!host().hidden&&!$('#games-page').hidden&&location.hash.split('/')[1]===game;
const key=(suffix:string)=>`household-trivia-${game==='how-much-ish'?'v4':game==='clue-cascade'?'v3':'v2'}:${identity||'guest'}:${game}:${suffix}`;
function read<T>(k:string):T|undefined{try{return JSON.parse(localStorage.getItem(k)||'null')??undefined;}catch{return;}}
function save(k:string,value:unknown){try{localStorage.setItem(k,JSON.stringify(value));}catch{/* Play continues if storage is blocked. */}}
async function practiceQuestions():Promise<Question[]>{
 switch(game){case 'sudoku':return (await import('./trivia/sudoku.json')).default as Question[];case 'crossword':return (await import('./trivia/crossword.json')).default as Question[];case 'odd-one-out':return (await import('./trivia/odd-one-out.json')).default as Question[];case 'passport-puzzle':return (await import('./trivia/passport-puzzle.json')).default as Question[];case 'clue-cascade':return (await import('./trivia/clue-cascade.json')).default as Question[];case 'before-or-after':return [...(await import('./trivia/before-or-after.json')).default,...(await import('./trivia/before-or-after-online.json')).default] as Question[];case 'how-much-ish':return (await import('./trivia/how-much-ish.json')).default as Question[];}
}
function shuffled<T>(values:T[]){const a=[...values];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function header(){const title=GAMES.find(g=>g.id===game)!.title;return `<header class="trivia-header"><h1 class="trivia-header-title">${title}</h1></header>`;}
export async function renderTrivia(){
 request++;if(busy){attempt=undefined;review=null;}busy=false;
 const next=location.hash.split('/')[1] as TriviaId;
 if(next!==game){request++;game=next;attempt=undefined;review=null;error='';busy=false;}
 if(!bound){bound=true;window.setInterval(()=>{if(current()&&!location.hash.endsWith('/scores'))paintClock();},1000);host().addEventListener('click',click);host().addEventListener('input',input);host().addEventListener('submit',e=>{e.preventDefault();void submit();});onIdentityChange(()=>{request++;attempt=undefined;review=null;busy=false;error='';if(current())void renderTrivia();});window.addEventListener('online',()=>{if(current()&&error){error='Connection restored. Retry your last action.';const s=host().querySelector('.trivia-status');if(s)s.textContent=error;}});}
 if(location.hash.endsWith('/scores')){void showScores();return;}
 const owner=`${identity||'guest'}:${game}`;if(modeOwner!==owner){modeOwner=owner;mode=read<'daily'|'practice'>(key('mode'))||mode;}
 if(location.hash.endsWith('/daily')){mode='daily';attempt=undefined;}
 if(!identity)mode='practice';
 if(!attempt){await start();return;}
 render();
}
function render(){
 scaleObserver?.disconnect();clearTimeline?.();clearTimeline=undefined;
 if(attempt&&mode==='daily'&&attempt.day<new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())){attempt.complete=true;review=null;}
 const info=GAMES.find(g=>g.id===game)!;
 host().dataset.game=game;
 host().innerHTML=header()+`<div class="trivia-toolbar"><div class="trivia-modes"><button data-mode="daily" ${busy?'disabled':''} aria-pressed="${mode==='daily'}">Daily</button><button data-mode="practice" ${busy?'disabled':''} aria-pressed="${mode==='practice'}">Practice</button></div>${settingsButtonMarkup()}<a class="orbit-sign" href="#games/${game}/scores">Scores ↗</a>${themeToggleMarkup('game-theme-toggle')}<details class="game-help"><summary aria-label="How to play">?</summary><p>${info.description} Daily: one attempt per person. Weekly scores count your five best days. Practice is unranked.</p></details></div>${mode==='practice'?calendarMarkup(entries,archiveEntry):''}<div class="trivia-status" role="status">${esc(error)}</div><div id="trivia-content"></div>`;
 centerArchive(host());paintClock();
 mountGameNavigation().sync(location.hash);
 if(!attempt){$('#trivia-content').innerHTML=`<div class="game-loading" role="status">${busy?'Opening your board…':error?'<button class="trivia-secondary" data-start>Retry</button>':'Choose your name in Settings for the daily challenge, or play Practice.'}</div>`;return;}
 if(review!==null){renderQuestion(review,true);return;}
 if(attempt.complete){$('#trivia-content').innerHTML=`<div class="game-result"><p class="trivia-progress">${mode==='daily'?'TODAY’S RESULT':'PRACTICE COMPLETE'}</p><h2>${attempt.score.toLocaleString()} / 1,000</h2>${clockMarkup()}<div class="trivia-actions"><a class="orbit-play" href="#games/${game}/scores">Scores ↗</a><button class="trivia-secondary" data-mode="practice">Open practice archive</button>${mode==='daily'?'<button type="button" class="trivia-secondary" data-daily-run>Next unfinished daily →</button>':''}</div><details><summary>Review answers</summary>${game==='before-or-after'?attempt.questions.slice(0,attempt.answers.length).map((q,i)=>timelineReview(q,attempt!.answers[i].value as string[],attempt!.answers[i].points)).join(''):attempt.questions[0]?.grid?gridMarkup(attempt.questions[0],String(attempt.answers[0]?.value||attempt.questions[0].answer||''),true):`<ol class="trivia-answer-list">${attempt.questions.filter((_,i)=>i<attempt!.answers.length).map(q=>`<li>${esc(q.explanation||'')}</li>`).join('')}</ol>`}</details></div>`;return;}
 renderQuestion(attempt.answers.length,false);
}
function renderQuestion(index:number,revealed:boolean){
 scaleObserver?.disconnect();clearTimeline?.();clearTimeline=undefined;
 const a=attempt!,q=a.questions[index],answer=a.answers[index],clues=a.hints[index]||0;
 if(q.kind==='groups'){renderGroupBoard(q,revealed);return;}
 draft=revealed?answer.value:read<Answer>(key(`${a.id}:${index}:draft`))??(q.kind==='timeline'?q.cards!.map(c=>c.id):q.kind==='scale'?1:q.grid?q.grid.givens:'');
 let body='';
 if(q.grid)body=gridMarkup(q,String(draft),revealed);
 if(q.kind==='choice')body=`<div class="trivia-choices">${q.options!.map((option,i)=>`<button type="button" class="trivia-choice ${revealed&&option===q.answer?'is-answer':''}" data-choice="${esc(option)}" aria-pressed="${draft===option}" ${revealed?'disabled':''}><small>0${i+1}</small>${esc(option)}</button>`).join('')}</div>`;
 if(q.kind==='clues'){
  const shown=revealed?3:clues, revealedClues=q.clues!.slice(0,shown+1);
  body=game==='passport-puzzle'?`<div class="passport-book"><div class="passport-map">${q.outline?`<svg viewBox="${esc(q.outline.viewBox)}" role="img" aria-label="Country outline"><path d="${esc(q.outline.path)}"/></svg>`:gameArt('passport')}<small>DESTINATION UNKNOWN</small></div><div class="passport-evidence"><div class="passport-stamp">FIELD<br>NOTES<br>0${index+1}</div><ol class="trivia-answer-list">${revealedClues.map(c=>`<li>${esc(c)}</li>`).join('')}</ol></div></div>`:`<div class="clue-stack">${Array.from({length:4},(_,i)=>`<div class="clue-ticket ${i>shown?'is-locked':''}"><small>0${i+1}</small>${i<=shown?esc(q.clues![i]):'·'}</div>`).join('')}</div>`;
  body+=`${!revealed&&clues<3?`<button class="trivia-secondary clue-reveal" type="button" data-clue ${busy?'disabled':''}>Reveal clue ${clues+2} · −50 pts</button>`:''}<div class="clue-answer"><label class="sr-only" for="trivia-guess">${game==='passport-puzzle'?'Country':'Connection'}</label><input id="trivia-guess" class="trivia-input" placeholder="${game==='passport-puzzle'?'Country…':'The connection is…'}" maxlength="100" value="${esc(String(draft))}" autocomplete="off" ${revealed?'disabled':''}></div>`;
 }
 if(q.kind==='timeline')body=revealed?timelineReview(q,draft as string[],answer.points):`${!revealed?'<p class="timeline-instruction" id="timeline-instructions">Drag the cards from earliest to latest.<span class="sr-only"> Or choose a card, then another position. With a keyboard, press Space to pick up, use arrow keys to move, and Space to place. Escape cancels.</span></p>':''}<div class="timeline-endpoints"><span>Earlier</span><span>Later</span></div><ol class="timeline-list" aria-label="Timeline, earliest to latest">${(draft as string[]).map(id=>{const card=q.cards!.find(c=>c.id===id)!,tag=revealed?'div':'button';return `<li class="timeline-card" data-card="${esc(id)}" data-tone="${q.cards!.indexOf(card)%3}"><${tag} class="timeline-tile" ${revealed?'':'type="button" aria-describedby="timeline-instructions" aria-pressed="false"'}><span class="timeline-art" aria-hidden="true">${gameArt(card.art||'clock')}</span><span class="timeline-label">${esc(card.label)}</span>${revealed?`<b class="timeline-date">${q.reveal?.[id]??''}</b>`:'<span class="timeline-grip" aria-hidden="true">⠿</span>'}</${tag}></li>`;}).join('')}</ol><p class="sr-only timeline-status" role="status" aria-live="polite"></p>`;
 if(q.kind==='scale')body=`<div class="scale-stage"><div class="scale-object reference">${silhouette(q.reference!.shape)}</div><div class="scale-object target" ${revealed?'':`tabindex="0" role="slider" aria-label="Size of ${esc(q.target!.name)}" aria-describedby="scale-instructions" aria-valuemin="${q.bounds![0]}" aria-valuemax="${q.bounds![1]}"`} >${silhouette(q.target!.shape)}${revealed?'':'<span class="scale-handle" aria-hidden="true">⤢</span>'}${revealed?`<div class="scale-correct">${silhouette(q.target!.shape)}</div>`:''}</div></div><div class="scale-labels"><span>${esc(q.reference!.name)}<small>Reference</small></span><span>${esc(q.target!.name)}<small>${revealed?'Your estimate':'Resize this'}</small></span></div>${!revealed?`<p class="scale-instruction" id="scale-instructions">Drag to resize, then lock it in. <span class="sr-only">Use arrow keys for smaller steps, Shift for larger steps.</span></p>`:''}`;
 $('#trivia-content').innerHTML=`<form class="trivia-card"><p class="trivia-progress"><span>${index+1} / ${a.questions.length}</span><span class="round-dots" aria-hidden="true">${a.questions.map((_,i)=>`<i class="${i<index?'is-done':''}"></i>`).join('')}</span><span>${a.score} pts</span></p>${clockMarkup()}${game!=='odd-one-out'&&q.tag?`<p class="game-board-label">${esc(q.tag)}</p>`:''}<h2>${q.kind==='timeline'&&revealed?'Timeline result':esc(q.prompt)}</h2>${body}${revealed?`${q.kind==='timeline'?'':`<div class="trivia-feedback" role="status"><strong>+${answer.points} points${q.kind==='scale'?' · Gold silhouette = actual size':''}</strong><p>${esc(q.explanation||'').replaceAll('\n','<br>')}</p>${q.kind==='scale'?`<details class="size-credits"><summary>Measurements & artwork</summary><p>Illustrative profiles. Measurements use the named version or stated reference; fictional sizes follow their cited source.</p>${(q.sources||[]).slice(0,2).map((s,i)=>s.startsWith('https://')?`<a href="${esc(s)}" target="_blank" rel="noopener noreferrer">${i===0?'Target':'Reference'} measurement</a>`:esc(s)).join(' · ')}<p>Profiles: ${(q.target!.shape.startsWith('sourced:')||q.target!.shape.startsWith('photo:'))?`${silhouetteCredit(q.reference!.shape)} · ${silhouetteCredit(q.target!.shape)}`:'Household illustrations'}</p></details>`:''}${q.kind==='clues'?`<p>Answer: ${esc(String(q.answer))}</p>`:''}</div>`}<button type="button" class="orbit-play" data-next>${a.complete?'See result':'Next question'} →</button>`:`<div class="trivia-actions"><button class="orbit-play" type="submit" ${busy?'disabled':''}>${busy?'Saving…':q.kind==='scale'?'Lock it in':'Submit'} →</button></div>`}</form>`;
 if(q.grid)clearTimeline=mountGrid(host().querySelector<HTMLElement>('.puzzle-workspace')!,q,String(draft),revealed,value=>{draft=value;saveDraft();},key(`${a.id}:${index}:notes`));
 if(q.kind==='scale'){
  updateScale(q,revealed);scaleObserver=new ResizeObserver(()=>updateScale(q,revealed));scaleObserver.observe(host().querySelector('.scale-stage')!);
  const target=host().querySelector<HTMLElement>('.scale-object.target')!;
  if(!revealed){
   let drag:{id:number;x:number;y:number;start:number}|undefined;
   const set=(value:number)=>{draft=Math.max(q.bounds![0],Math.min(q.bounds![1],value));saveDraft();updateScale(q,false);};
   target.addEventListener('pointerdown',e=>{if(e.button!==0||drag)return;e.preventDefault();target.focus({preventScroll:true});drag={id:e.pointerId,x:e.clientX,y:e.clientY,start:Number(draft)};target.setPointerCapture(e.pointerId);target.classList.add('is-resizing');});
   target.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.x,dy=drag.y-e.clientY;set(drag.start*Math.exp((dx+dy)/180));});
   const end=(e:PointerEvent)=>{if(!drag||drag.id!==e.pointerId)return;drag=undefined;target.classList.remove('is-resizing');if(target.hasPointerCapture(e.pointerId))target.releasePointerCapture(e.pointerId);};
   target.addEventListener('pointerup',end);target.addEventListener('pointercancel',end);target.addEventListener('lostpointercapture',end);
   target.addEventListener('keydown',e=>{if(!['ArrowUp','ArrowRight','ArrowDown','ArrowLeft','Home','End'].includes(e.key))return;e.preventDefault();set(e.key==='Home'?q.bounds![0]:e.key==='End'?q.bounds![1]:Number(draft)*Math.pow(e.shiftKey?1.2:1.025,['ArrowUp','ArrowRight'].includes(e.key)?1:-1));});
  }
 }
 if(q.kind==='timeline'&&!revealed)clearTimeline=mountTimelineSort(host().querySelector<HTMLOListElement>('.timeline-list')!,order=>{draft=order;saveDraft();});
}
function updateScale(q:Question,revealed:boolean){
 const stage=host().querySelector<HTMLElement>('.scale-stage')!,ratio=Number(draft),actual=revealed?Number(q.answer):0,base=Math.min(stage.clientHeight-50,stage.clientWidth*.43)*.7;
 const size=(selector:string,value:number)=>{const svg=host().querySelector<SVGElement>(selector);if(svg){svg.style.height=`${value}px`;svg.style.width=`${value}px`;svg.style.maxWidth='none';}};
 size('.reference > svg',base);size('.target > svg',base*ratio);size('.scale-correct > svg',base*actual);const target=host().querySelector<HTMLElement>('.scale-object.target')!;target.setAttribute('aria-valuenow',String(ratio));target.setAttribute('aria-valuetext',`${ratio.toFixed(2)} times the reference`);const bounds=target.querySelector<SVGGElement>('.profile-shape')?.getBBox();target.style.setProperty('--target-size',`${base*ratio}px`);target.style.setProperty('--target-height',`${base*ratio*(bounds?.height||100)/100}px`);target.style.setProperty('--target-width',`${base*ratio*(bounds?.width||100)/100}px`);
}
function clockMarkup(){return attempt&&timedGame(game)?`<p class="puzzle-timer" aria-label="Elapsed time"><span aria-hidden="true">◷</span> <time data-puzzle-clock>${attempt.complete&&!attempt.started_at&&attempt.elapsed_ms==null?'—':formatPuzzleTime(elapsedPuzzleTime(attempt,Date.now()+clockOffset))}</time></p>`:'';}
function paintClock(){const timer=host().querySelector('[data-puzzle-clock]');if(timer&&attempt&&!attempt.complete)timer.textContent=formatPuzzleTime(elapsedPuzzleTime(attempt,Date.now()+clockOffset));}
function saveDraft(){if(!attempt)return;save(key(`${attempt.id}:${attempt.answers.length}:draft`),draft);if(mode==='practice'&&archiveBoard){archiveBoard.state.drafts[String(attempt.answers.length)]=draft;storeArchive(game,archiveEntry,archiveBoard);}}
function persistPractice(){if(mode!=='practice'||!attempt||!archiveBoard)return;archiveBoard.state.attempt=attempt;storeArchive(game,archiveEntry,archiveBoard);save(key('practice'),attempt);updateCalendar(entries,archiveEntry,attempt);}
function input(event:Event){const el=event.target as HTMLInputElement;if(el.id==='trivia-guess'){draft=el.value;saveDraft();}}

function click(event:MouseEvent){const el=(event.target as Element).closest<HTMLElement>('button');if(!el||busy)return;if(el.dataset.archiveEntry){archiveEntry=el.dataset.archiveEntry;attempt=undefined;review=null;void start();}else if(el.hasAttribute('data-word')){const selected=Array.isArray(draft)?draft:[],word=el.dataset.word!;draft=selected.includes(word)?selected.filter(w=>w!==word):selected.length<4?[...selected,word]:selected;saveDraft();renderGroupBoard(attempt!.questions[0],false);Array.from(host().querySelectorAll<HTMLElement>('[data-word]')).find(b=>b.dataset.word===word)?.focus({preventScroll:true});}else if(el.hasAttribute('data-group-clear')){draft=[];saveDraft();renderGroupBoard(attempt!.questions[0],false);}else if(el.hasAttribute('data-group-shuffle')){const q=attempt!.questions[0];save(key(`${attempt!.id}:word-order`),shuffled(q.words!));renderGroupBoard(q,false);}else if(el.dataset.mode){request++;if(el.dataset.mode==='practice'&&attempt?.complete)archiveEntry=nextArchiveEntry(entries);mode=el.dataset.mode as typeof mode;save(key('mode'),mode);attempt=undefined;review=null;error='';if(mode==='daily'&&!identity)render();else void start();}else if(el.hasAttribute('data-start'))void start();else if(el.dataset.choice!==undefined){draft=el.dataset.choice;saveDraft();host().querySelectorAll<HTMLElement>('[data-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.choice===draft)));}else if(el.hasAttribute('data-clue'))void clue();else if(el.hasAttribute('data-next')){review=null;render();host().querySelector('h2')?.scrollIntoView({block:'nearest'});}else if(el.dataset.period){period=el.dataset.period;void showScores();}}
async function operation(action:()=>Promise<void>){const token=++request;busy=true;error='';render();try{await action();}catch(e){if(token===request)error=(e as Error).message||'Could not connect. Try again.';}finally{if(token===request){busy=false;if(current()&&!location.hash.endsWith('/scores'))render();}}}
async function start(){await operation(async()=>{
 const token=request,owner=`${identity||'guest'}:${game}:${newYorkDay()}`;let next:Attempt;
 if(mode==='daily')next=await rpc<Attempt>('trivia_start',{p:{game,player:identity}});
 else{
  if(libraryOwner!==owner){const loaded=await loadLibrary(game);if(token!==request)return;entries=loaded;libraryOwner=owner;archiveEntry='';archiveBoard=undefined;}
  if(!archiveEntry)archiveEntry=selectedArchive(game,entries);
  const board=await openArchive(game,archiveEntry,practiceQuestions);if(token!==request)return;archiveBoard=board;rememberArchive(game,archiveEntry);next=board.state.attempt;
  for(const [index,value] of Object.entries(board.state.drafts))save(key(`${next.id}:${index}:draft`),value);
 }
 if(token!==request)return;attempt=next;clockOffset=next.server_now?Date.parse(next.server_now)-Date.now():0;if(timedGame(game)&&mode==='practice'&&!attempt.complete&&!attempt.started_at)attempt.started_at=new Date().toISOString();review=next.complete?null:next.answers.length?next.answers.length-1:null;if(mode==='practice')persistPractice();
});}
async function submit(){if(busy||!attempt||review!==null||attempt.complete)return;if(attempt.questions[attempt.answers.length].kind==='groups'){await submitGroup();return;}if(draft===''){error='Choose or enter an answer first.';host().querySelector('.trivia-status')!.textContent=error;return;}const q=attempt.questions[attempt.answers.length];if(q.grid&&mode==='practice'&&draft!==q.answer){error='The board is not quite right yet. Keep going.';host().querySelector('.trivia-status')!.textContent=error;return;}const value=draft;await operation(async()=>{const token=request,a=attempt!,index=a.answers.length;let next:Attempt;if(mode==='daily')next=await rpc<Attempt>('trivia_action',{p:{id:a.id,player:a.player,index,action:'answer',answer:value}});else{const points=scoreAnswer(a.questions[index],value,a.hints[index]||0);next={...a,answers:[...a.answers,{value,points}],score:a.score+points,complete:index+1===a.questions.length,...(timedGame(game)?{finished_at:new Date().toISOString(),elapsed_ms:elapsedPuzzleTime(a)}:{})};}if(token!==request)return;attempt=next;review=index;persistPractice();});}
async function clue(){await operation(async()=>{const token=request,a=attempt!,index=a.answers.length,level=(a.hints[index]||0)+1;const next=mode==='daily'?await rpc<Attempt>('trivia_action',{p:{id:a.id,player:a.player,index,action:'clue',level}}):{...a,hints:{...a.hints,[index]:level}};if(token!==request)return;attempt=next;persistPractice();});}
async function showScores(){
 scaleObserver?.disconnect();clearTimeline?.();clearTimeline=undefined;
 const token=++request;busy=false;const title=GAMES.find(g=>g.id===game)!.title;host().dataset.game=game;
 host().innerHTML=header()+`<a class="orbit-sign" href="#games/${game}">← Back to ${title}</a><h2 class="scores-title">Scores</h2><p>${period==='week'?'Your five best days, Monday–Sunday.':'Today’s shared challenge.'} ${timedGame(game)?'Equal points are ranked by fastest total time. The timer keeps running when you leave.':'Equal scores share rank.'}</p><div class="trivia-modes"><button data-period="day" aria-pressed="${period==='day'}">Today</button><button data-period="week" aria-pressed="${period==='week'}">This week</button>${themeToggleMarkup('game-theme-toggle')}</div><div id="trivia-standings" role="status">Loading scores…</div>`;
 mountGameNavigation().sync(location.hash);
 try{const rows=await rpc<{player:string;score:number;rank:number;days:number;elapsed_ms?:number|null}[]>('trivia_scores',{p:{game,period}});if(token!==request||!current())return;$('#trivia-standings').innerHTML=rows.length?`${renderPodium(rows,timedGame(game))}<details class="score-disclosure"><summary>Score details</summary><ol class="trivia-ranks">${rows.map(r=>`<li><span>${r.rank}</span><strong>${esc(name(r.player))}${r.player===identity?' · you':''}</strong><span>${r.score.toLocaleString()} pts${timedGame(game)&&r.elapsed_ms!=null?` · ${formatPuzzleTime(r.elapsed_ms)}`:''}${period==='week'?` · ${r.days} days`:''}</span></li>`).join('')}</ol></details>`:'<p>No completed daily rounds yet.</p>';}catch{if(token===request&&current()&&location.hash.endsWith('/scores'))$('#trivia-standings').textContent='Shared scores are unavailable. Choose Today or This week to retry.';}
}
export async function exportTrivia(){try{const rows=identity?await rpc('trivia_export',{p:{player:identity}}):attempt;download(rows,'household-trivia');}catch{download(attempt||{},'household-trivia-device');}}

function renderGroupBoard(q:Question,revealed:boolean){
 const a=attempt!,p={...emptyGroups(),...a.progress};
 draft=read<string[]>(key(`${a.id}:0:draft`))||[];
 const solvedWords=new Set(p.solved.flatMap(g=>g.words));
 const orderKey=key(`${a.id}:word-order`),stored=read<string[]>(orderKey);
 const order=stored?.length===16&&new Set(stored).size===16&&stored.every(w=>q.words!.includes(w))?stored:shuffled(q.words!);save(orderKey,order);
 const groups:WordGroup[]=revealed?[...p.solved,...(q.groups||[]).filter(g=>!p.solved.some(s=>s.id===g.id))]:p.solved;
 $('#trivia-content').innerHTML=`<form class="trivia-card groups-card"><p class="trivia-progress"><span>${p.solved.length} / 4 groups</span><span>${a.score} pts</span></p>${clockMarkup()}<h2>Find four groups of four.</h2><div class="group-solved">${groups.map(g=>`<div class="group-row group-color-${Number(g.id)} ${revealed&&!p.solved.some(s=>s.id===g.id)?'group-missed':''}"><strong>${esc(g.label)}</strong><span>${g.words.map(esc).join(' · ')}</span>${revealed&&!p.solved.some(s=>s.id===g.id)?'<small>Unsolved</small>':''}</div>`).join('')}</div>${!revealed?`<div class="word-grid" role="group" aria-label="Word board">${order.filter(w=>!solvedWords.has(w)).map(w=>`<button type="button" class="word-tile" data-word="${esc(w)}" aria-pressed="${(draft as string[]).includes(w)}" ${busy?'disabled':''}>${esc(w)}</button>`).join('')}</div>`:''}<p class="group-notice" role="status">${esc(p.notice)}</p><p class="group-mistakes">Mistakes left <span aria-label="${4-p.mistakes} remaining">${Array.from({length:4},(_,i)=>`<i class="${i>=4-p.mistakes?'is-used':''}" aria-hidden="true"></i>`).join('')}</span></p>${revealed?`<div class="trivia-feedback" role="status">${p.solved.length===4?'All four groups found.':`${p.solved.length} of four groups found.`} ${a.score} / 1,000 points.</div><button type="button" class="orbit-play" data-next>See result →</button>`:`<div class="group-actions"><button type="button" class="trivia-secondary" data-group-shuffle ${busy?'disabled':''}>Shuffle</button><button type="button" class="trivia-secondary" data-group-clear ${busy||!(draft as string[]).length?'disabled':''}>Deselect</button><button type="submit" class="orbit-play" ${busy||(draft as string[]).length!==4?'disabled':''}>${busy?'Checking…':'Submit group'}</button></div>`}</form>`;
}
async function submitGroup(){
 const words=Array.isArray(draft)?[...draft]:[];if(words.length!==4)return;
 await operation(async()=>{
  const token=request,a=attempt!;let next:Attempt;
  if(mode==='daily')next=await rpc<Attempt>('trivia_action',{p:{id:a.id,player:a.player,index:0,action:'group',answer:words}});
  else{const progress=guessGroup(a.questions[0].groups!,{...emptyGroups(),...a.progress},words),complete=progress.solved.length===4||progress.mistakes===4,score=progress.solved.length*250;next={...a,progress,score,complete,answers:complete?[{value:progress.solved.map(g=>g.id),points:score}]:[]};}
  if(token!==request)return;attempt=next;clockOffset=next.server_now?Date.parse(next.server_now)-Date.now():0;if(timedGame(game)&&mode==='practice'&&!attempt.complete&&!attempt.started_at)attempt.started_at=new Date().toISOString();review=next.complete?0:null;save(key(`${a.id}:0:draft`),[]);persistPractice();
 });
}
