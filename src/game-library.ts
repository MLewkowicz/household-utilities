import {SIZE_VERSION,SIZE_ENTRY_PREFIX,SIZE_PRACTICE_BOARDS,isSizeEntry} from './size-categories';
import {retireSizeHistory,currentSizeBoard} from './size-history';
import {identity} from './identity';
import {rpc,esc} from './ui';
import type {Attempt,Answer,Question} from './trivia-model';
export type CalendarEntry={entry:string;day:string|null;starter:number|null;complete:boolean;started:boolean;score:number};
export type SavedBoard={attempt:Attempt;drafts:Record<string,Answer>};
export type ArchiveBoard={state:SavedBoard;revision:number;dirty?:boolean};
const prefix=(game:string,player=identity||'guest')=>`household-game-library-v${game==='how-much-ish'?SIZE_VERSION:1}:${player}:${game}:`;
const sizeParams=(game:string)=>game==='how-much-ish'?{size_version:SIZE_VERSION}:{};
retireSizeHistory();
export function readLocal<T>(key:string):T|undefined{try{return JSON.parse(localStorage.getItem(key)||'null')??undefined;}catch{return;}}
export function writeLocal(key:string,value:unknown){try{localStorage.setItem(key,JSON.stringify(value));}catch{/* The board remains playable in memory. */}}
export const newYorkDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function nextArchiveEntry(entries:CalendarEntry[]){return entries.find(e=>e.starter&&!e.complete)?.entry||entries.find(e=>!e.complete)?.entry||entries.find(e=>e.starter)?.entry||entries[0]?.entry||'starter-1';}
export function selectedArchive(game:string,entries:CalendarEntry[]){const last=readLocal<string>(prefix(game)+'selected');return entries.find(e=>e.entry===last)?.entry||entries.find(e=>e.entry!=='legacy'&&e.started&&!e.complete)?.entry||nextArchiveEntry(entries);}
export function rememberArchive(game:string,entry:string){writeLocal(prefix(game)+'selected',entry);}
function withEarlierPractice(game:string,entries:CalendarEntry[]){
 if(game==='how-much-ish')return entries;
 const key=prefix(game)+'legacy',version=game==='clue-cascade'?'v3':'v2';
 let previous=readLocal<ArchiveBoard>(key);
 if(!previous&&game==='geography'){
  const old=readLocal<{mode:string;route?:Record<string,unknown>}>(`household-geography-v1:${identity||'guest'}`);
  if(old?.mode==='route'&&old.route&&!String(old.route.id||'').startsWith('archive:')){previous={state:{attempt:{...old.route,id:'earlier-trail',game,player:identity||'guest',day:'legacy'} as unknown as Attempt,drafts:{}},revision:0};writeLocal(key,previous);}
 }
 if(!previous&&game!=='geography'){
  const old=readLocal<Attempt>(`household-trivia-${version}:${identity||'guest'}:${game}:practice`);
  if(old&&!old.id.startsWith('archive:')){previous={state:{attempt:old,drafts:{}},revision:0};for(let i=0;i<old.questions.length;i++){const draft=readLocal<Answer>(`household-trivia-${version}:${identity||'guest'}:${game}:${old.id}:${i}:draft`);if(draft!==undefined)previous.state.drafts[i]=draft;}writeLocal(key,previous);}
 }
 return previous?[{entry:'legacy',day:null,starter:null,complete:previous.state.attempt.complete,started:true,score:previous.state.attempt.score},...entries]:entries;
}
export function starterEntries(game:string):CalendarEntry[]{const ids=game==='how-much-ish'?['classic','pop-culture','geography'].flatMap(category=>Array.from({length:SIZE_PRACTICE_BOARDS},(_,i)=>`${SIZE_ENTRY_PREFIX}${category}-${i+1}`)):Array.from({length:10},(_,i)=>`starter-${i+1}`);return ids.map(entry=>{const i=Number(entry.split('-').at(-1))-1,saved=readLocal<ArchiveBoard>(prefix(game)+entry);return {entry,day:null,starter:i+1,complete:!!saved?.state.attempt.complete,started:!!saved,score:saved?.state.attempt.score||0};});}
export async function loadLibrary(game:string){
 const player=identity||'guest';
 if(player==='guest')return withEarlierPractice(game,starterEntries(game));
 try{const result=await rpc<{entries:CalendarEntry[];day:string}>('game_library',{p:{game,player,...sizeParams(game)}});writeLocal(prefix(game,player)+'entries',result.entries);return withEarlierPractice(game,result.entries.map(e=>{const pending=readLocal<ArchiveBoard>(prefix(game,player)+e.entry);return pending?.dirty?{...e,complete:pending.state.attempt.complete,started:true,score:pending.state.attempt.score}:e;}));}
 catch{const cached=readLocal<CalendarEntry[]>(prefix(game,player)+'entries');return withEarlierPractice(game,cached?[...cached,...starterEntries(game).filter(e=>!cached.some(c=>c.entry===e.entry))]:starterEntries(game));}
}
/** Deterministic practice boards. No random redraw when an entry is revisited. */
export function starterDeck(game:string,entry:string,bank:Question[]){
 if(!bank.length)return [];
 if(game==='passport-puzzle'){
  const groups=new Map<string,Question[]>();for(const q of bank){const key=String(q.answer);if(!groups.has(key))groups.set(key,[]);groups.get(key)!.push(q);}
  const countries=[...groups.values()],slot=Math.max(0,Number(entry.slice(8))-1);
  return Array.from({length:5},(_,i)=>{const index=slot*5+i,questions=countries[index%countries.length];return questions[Math.floor(index/countries.length)%questions.length];});
 }
 const count=['before-or-after','clue-cascade','sudoku','crossword'].includes(game)?1:5,slot=Number(entry.split('-').at(-1))-1;
 return Array.from({length:count},(_,i)=>bank[(slot*(count===5?(bank.length>=50?5:3):1)+i)%bank.length]);
}
export async function openArchive(game:string,entry:string,bank:()=>Promise<Question[]>):Promise<ArchiveBoard>{
 const player=identity||'guest',key=prefix(game,player)+entry,local=readLocal<ArchiveBoard>(key);
 if(game==='how-much-ish'&&!isSizeEntry(entry)&&!/^\d{4}-\d{2}-\d{2}$/.test(entry))throw new Error('This size board has been retired. Choose a new board.');
 if(entry==='legacy'&&local)return local;
 if(player!=='guest'){
  try{const remote=await rpc<ArchiveBoard>('game_archive',{p:{game,player,entry,...sizeParams(game)}});
   if(game==='how-much-ish'&&!currentSizeBoard(remote.state.attempt))throw new Error('The size catalog has changed. Reload the site.');
   if(local?.dirty){if(local.revision===remote.revision)return local;if(JSON.stringify(local.state)===JSON.stringify(remote.state)){writeLocal(key,remote);return remote;}writeLocal(key+':unsynced',local);}
   writeLocal(key,remote);return remote;
  }catch(error){if(local)return local;if(!(game==='how-much-ish'?isSizeEntry(entry):entry.startsWith('starter-')))throw error;}
 }
 if(local)return local;
 const state:SavedBoard={attempt:{id:`archive:${game}:${entry}`,game,player,day:entry,questions:starterDeck(game,entry,await bank()),answers:[],hints:{},score:0,complete:false},drafts:{}};
 if(game==='geography'){const {createRoute,practiceRoutePuzzles}=await import('./geography-route');state.attempt={...state.attempt,...createRoute(practiceRoutePuzzles[(Number(entry.slice(8))-1)%practiceRoutePuzzles.length]),questions:[]};}
 const result={state,revision:0};writeLocal(key,result);return result;
}
const saving=new Map<string,Promise<void>>();
export function storeArchive(game:string,entry:string,board:ArchiveBoard){
 if(game==='how-much-ish'&&!currentSizeBoard(board.state.attempt))return;
 const player=board.state.attempt.player,key=prefix(game,player)+entry;
 board.dirty=true;writeLocal(key,board);
 if(player==='guest'||entry==='legacy')return;
 // Serialize this entry; collect newer edits after each response instead of
 // letting a delayed network response replace a more recent local draft.
 if(saving.has(key))return;
 const task=(async()=>{
  for(;;){const latest=readLocal<ArchiveBoard>(key);if(!latest?.dirty)return;const state=latest.state;
   try{const response=await rpc<ArchiveBoard>('game_archive_save',{p:{game,player,entry,state,revision:latest.revision,...sizeParams(game)}});const current=readLocal<ArchiveBoard>(key)!;const same=JSON.stringify(current.state)===JSON.stringify(state);writeLocal(key,{state:current.state,revision:response.revision,dirty:!same});board.revision=response.revision;if(same){board.dirty=false;return;}}
   catch{return;}
  }
 })().finally(()=>saving.delete(key));saving.set(key,task);
}
export function calendarMarkup(entries:CalendarEntry[],selected:string){return `<nav class="game-calendar" aria-label="Practice archive"><div class="calendar-stack">${entries.map(e=>{
 const date=e.day?new Date(e.day+'T12:00:00Z'):null,month=date?date.toLocaleDateString('en-US',{month:'short',timeZone:'UTC'}):e.entry==='legacy'?'Earlier':'Practice',number=date?date.getUTCDate():e.starter||'↶';
 return `<button type="button" data-archive-entry="${esc(e.entry)}" class="calendar-day ${e.complete?'is-complete':e.started?'is-started':''}" aria-pressed="${e.entry===selected}" aria-label="${esc(e.day||(e.entry==='legacy'?'Earlier practice saved on this device':'Practice '+e.starter))} · ${e.complete?'completed':e.started?'in progress':'unplayed'}"><small>${month}</small><b>${number}</b><span>${e.complete?'✓':e.started?'·':''}</span></button>`;
 }).join('')}</div></nav>`;}
export function updateCalendar(entries:CalendarEntry[],entry:string,attempt:Attempt){const current=entries.find(e=>e.entry===entry);if(current)Object.assign(current,{complete:attempt.complete,started:true,score:attempt.score});}
/** Scroll only the archive strip; scrollIntoView also moves the board/page. */
export function centerArchive(host:HTMLElement){
 const strip=host.querySelector<HTMLElement>('.calendar-stack'),selected=strip?.querySelector<HTMLElement>('[aria-pressed="true"]');
 if(!strip||!selected)return;
 const parent=strip.getBoundingClientRect(),tile=selected.getBoundingClientRect();
 strip.scrollLeft+=tile.left-parent.left-(parent.width-tile.width)/2;
}
