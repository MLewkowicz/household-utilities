import {esc} from './ui';
import type {Question} from './trivia-model';
export type GridClue={number:number;row:number;col:number;direction:'across'|'down';length:number;text:string};
export type PuzzleGrid={size:number;givens:string;clues:GridClue[]};
export function gridCells(clue:GridClue,size:number){return Array.from({length:clue.length},(_,i)=>(clue.row+(clue.direction==='down'?i:0))*size+clue.col+(clue.direction==='across'?i:0));}
export function validSudoku(value:string){
 if(!/^[1-9]{81}$/.test(value))return false;
 for(let n=0;n<9;n++)for(const cells of [Array.from({length:9},(_,i)=>n*9+i),Array.from({length:9},(_,i)=>i*9+n),Array.from({length:9},(_,i)=>(Math.floor(n/3)*3+Math.floor(i/3))*9+n%3*3+i%3)])if(new Set(cells.map(i=>value[i])).size!==9)return false;
 return true;
}
export function gridMarkup(q:Question,value:string,locked:boolean){
 const grid=q.grid!,sudoku=q.kind==='sudoku',numbers=new Map(grid.clues.map(c=>[c.row*grid.size+c.col,c.number]));
 return `<div class="puzzle-workspace ${q.kind}"><div class="puzzle-grid" role="group" aria-label="${sudoku?'Sudoku':'Crossword'} grid" style="--grid-size:${grid.size}">${[...grid.givens].map((v,i)=>v==='#'?'<span class="puzzle-block" aria-hidden="true"></span>':`<button type="button" data-cell="${i}" class="puzzle-cell ${v!==' '?'is-given':''}" aria-label="Row ${Math.floor(i/grid.size)+1}, column ${i%grid.size+1}${v!==' '?', given '+v:''}" ${locked?'disabled':''} style="--cell-row:${Math.floor(i/grid.size)};--cell-col:${i%grid.size}">${numbers.has(i)?`<small>${numbers.get(i)}</small>`:''}<span class="cell-value">${esc(value[i]?.trim()||'')}</span><span class="cell-notes"></span></button>`).join('')}</div><div class="puzzle-clue" aria-live="polite"></div><div class="puzzle-tools">${sudoku?'<button type="button" data-pencil aria-pressed="false">Pencil notes</button>':''}<button type="button" data-grid-undo ${locked?'disabled':''}>Undo</button><button type="button" data-grid-clear ${locked?'disabled':''}>Erase</button></div><div class="puzzle-keyboard" aria-label="${sudoku?'Number pad':'Letter keys'}">${(sudoku?['123456789']:['QWERTYUIOP','ASDFGHJKL','ZXCVBNM']).map(row=>`<div>${[...row].map(c=>`<button type="button" data-grid-key="${c}" ${locked?'disabled':''}>${c}</button>`).join('')}</div>`).join('')}</div>${!sudoku?`<details class="crossword-clues"><summary>All clues</summary><div>${(['across','down'] as const).map(direction=>`<section><h3>${direction==='across'?'Across':'Down'}</h3>${grid.clues.filter(c=>c.direction===direction).map(c=>`<button type="button" data-clue-number="${c.number}" data-direction="${direction}"><b>${c.number}.</b> ${esc(c.text)} (${c.length})</button>`).join('')}</section>`).join('')}</div></details>`:''}</div>`;
}
export function mountGrid(host:HTMLElement,q:Question,initial:string,locked:boolean,onChange:(value:string)=>void,notesKey:string){
 const g=q.grid!,sudoku=q.kind==='sudoku',abort=new AbortController(),signal=abort.signal;
 let value=initial.padEnd(g.givens.length,' ').slice(0,g.givens.length),cell=Math.max(0,g.givens.indexOf(' ')),direction:'across'|'down'='across',pencil=false;
 let notes:Record<string,string>={};try{notes=JSON.parse(localStorage.getItem(notesKey)||'{}');}catch{}
 const undo:{value:string;notes:Record<string,string>}[]=[];
 const buttons=()=>Array.from(host.querySelectorAll<HTMLButtonElement>('[data-cell]'));
 const clue=()=>g.clues.find(c=>c.direction===direction&&gridCells(c,g.size).includes(cell))||g.clues.find(c=>gridCells(c,g.size).includes(cell));
 function paint(focus=false){
  const active=clue(),highlight=new Set(active?gridCells(active,g.size):[]);
  for(const button of buttons()){
   const i=Number(button.dataset.cell);button.classList.toggle('is-active',i===cell);button.classList.toggle('is-word',highlight.has(i));button.tabIndex=i===cell?0:-1;
   button.querySelector('.cell-value')!.textContent=value[i]?.trim()||'';button.querySelector('.cell-notes')!.textContent=value[i]?.trim()?'':notes[i]||'';
   button.setAttribute('aria-label',`Row ${Math.floor(i/g.size)+1}, column ${i%g.size+1}${g.givens[i]!==' '?', given':''}: ${value[i]?.trim()||'empty'}${notes[i]?', notes '+notes[i]:''}`);
   if(focus&&i===cell)button.focus({preventScroll:true});
  }
  host.querySelector('.puzzle-clue')!.textContent=active?`${active.number} ${active.direction} · ${active.text} (${active.length})`:'Fill each row, column and box with 1–9.';
  host.querySelector('[data-pencil]')?.setAttribute('aria-pressed',String(pencil));
  try{localStorage.setItem(notesKey,JSON.stringify(notes));}catch{}
 }
 function choose(i:number,toggle=false){if(g.givens[i]==='#')return;if(toggle&&cell===i&&!sudoku)direction=direction==='across'?'down':'across';cell=i;paint(true);}
 function advance(back=false){
  const active=clue(),cells=active?gridCells(active,g.size):Array.from({length:g.size*g.size},(_,i)=>i),index=cells.indexOf(cell);
  for(let step=1;step<cells.length;step++){const i=cells[(index+(back?-step:step)+cells.length)%cells.length];if(g.givens[i]===' '){cell=i;break;}}
 }
 function enter(char:string){
  if(locked||g.givens[cell]!==' ')return;
  undo.push({value,notes:{...notes}});if(undo.length>150)undo.shift();
  if(pencil&&sudoku&&char!==' '){const current=notes[cell]||'';notes[cell]=current.includes(char)?current.replace(char,''):[...current,char].sort().join('');}
  else{value=value.slice(0,cell)+char+value.slice(cell+1);delete notes[cell];onChange(value);if(!sudoku&&char!==' ')advance();}
  paint(true);
 }
 host.addEventListener('click',e=>{
  const b=(e.target as Element).closest<HTMLElement>('button');if(!b)return;
  if(b.dataset.cell!==undefined)choose(Number(b.dataset.cell),true);
  if(b.dataset.gridKey)enter(b.dataset.gridKey);
  if(b.hasAttribute('data-grid-clear'))enter(' ');
  if(b.hasAttribute('data-pencil')){pencil=!pencil;paint(true);}
  if(b.hasAttribute('data-grid-undo')&&!locked){const prior=undo.pop();if(prior){value=prior.value;notes=prior.notes;onChange(value);paint(true);}}
  if(b.dataset.clueNumber){const c=g.clues.find(c=>c.number===Number(b.dataset.clueNumber)&&c.direction===b.dataset.direction)!;direction=c.direction;choose(gridCells(c,g.size)[0]);}
 },{signal});
 host.addEventListener('keydown',e=>{
  if(!(e.target as Element).closest('[data-cell]'))return;
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();direction=['ArrowUp','ArrowDown'].includes(e.key)?'down':'across';const step=e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:e.key==='ArrowUp'?-g.size:g.size;let next=cell+step;while(next>=0&&next<g.givens.length&&g.givens[next]==='#')next+=step;if(next>=0&&next<g.givens.length)choose(next);}
  else if(e.key==='Backspace'||e.key==='Delete'){e.preventDefault();if(value[cell]===' '&&!sudoku)advance(true);enter(' ');}
  else if(e.key===' '&&!sudoku){e.preventDefault();direction=direction==='across'?'down':'across';paint();}
  else if((sudoku?/^[1-9]$/:/^[a-z]$/i).test(e.key)&&!e.ctrlKey&&!e.metaKey){e.preventDefault();enter(e.key.toUpperCase());}
 },{signal});
 paint();return ()=>abort.abort();
}
