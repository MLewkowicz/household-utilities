import type {PuzzleGrid} from './grid-puzzle';
import type {WordGroup,GroupProgress} from './group-puzzle';
export type Question={id:string;version:number;kind:'choice'|'clues'|'timeline'|'scale'|'groups'|'sudoku'|'crossword';grid?:PuzzleGrid;words?:string[];groups?:WordGroup[];prompt:string;options?:string[];clues?:string[];tag?:string;outline?:{path:string;viewBox:string};reveal?:Partial<Record<string,number>>;cards?:{id:string;label:string;art?:string}[];target?:{name:string;dimension:string;shape:string;measure?:string};reference?:{name:string;dimension:string;shape:string;measure?:string};bounds?:number[];answer?:string|number|string[];aliases?:string[];explanation?:string;sources?:string[]};
export type Answer=string|number|string[];
export type Attempt={id:string;player:string;game:string;day:string;questions:Question[];answers:{value:Answer;points:number}[];hints:Record<string,number>;score:number;complete:boolean;progress?:GroupProgress;server_day?:string;started_at?:string|null;finished_at?:string|null;elapsed_ms?:number|null;server_now?:string};
export const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function scoreAnswer(q:Question,answer:Answer,clues=0){
 if(q.kind==='sudoku'||q.kind==='crossword')return answer===q.answer?1000:0;
 if(q.kind==='groups')return Array.isArray(answer)&&Array.isArray(q.answer)?new Set(answer.filter(id=>(q.answer as string[]).includes(id))).size*250:0;
 if(q.kind==='scale'){const ratio=Number(answer),actual=Number(q.answer);return Number.isFinite(ratio)&&ratio>0?Math.round(200*Math.min(ratio/actual,actual/ratio)):0;}
 if(q.kind==='timeline'){if(!Array.isArray(answer)||!Array.isArray(q.answer)||answer.length!==5||new Set(answer).size!==5||answer.some(x=>!(q.answer as string[]).includes(x)))return 0;let points=0;for(let i=0;i<4;i++)for(let j=i+1;j<5;j++)if(q.answer.indexOf(answer[i])<q.answer.indexOf(answer[j]))points+=100;return points;}
 if(q.kind==='clues')return [String(q.answer),...(q.aliases||[])].some(a=>normalize(a)===normalize(String(answer)))?200-50*clues:0;
 return answer===q.answer?200:0;
}
export {sizeSilhouette as silhouette} from './size-silhouettes';
