import type {Attempt} from './trivia-model';
export const timedGame=(game:string)=>game==='sudoku'||game==='crossword';
export function elapsedPuzzleTime(attempt:Attempt,now=Date.now()){
 if(attempt.elapsed_ms!=null)return Math.max(0,attempt.elapsed_ms);
 if(!attempt.started_at)return 0;
 return Math.max(0,(attempt.finished_at?Date.parse(attempt.finished_at):now)-Date.parse(attempt.started_at));
}
export function formatPuzzleTime(ms:number){
 const seconds=Math.floor(Math.max(0,ms)/1000),minutes=Math.floor(seconds/60);
 return `${minutes}:${String(seconds%60).padStart(2,'0')}`;
}
