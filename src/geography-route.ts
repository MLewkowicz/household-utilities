import data from './geography-routes.json' with {type:'json'};
export type RoutePuzzle={id:number;start:string;end:string;region:string;minimum:number;solution:string[]};
export type RouteRound={puzzle_id:number;path:string[];discovered:string[];steps:number;mistakes:number;revision:number;complete:boolean;won:boolean;score:number;notice:string;id?:string;player?:string;day?:string};
export const routePuzzles:RoutePuzzle[]=data.puzzles;
export const neighbors:Record<string,string[]>=data.neighbors;
export const routePuzzle=(round:RouteRound)=>routePuzzles.find(p=>p.id===round.puzzle_id)!;
export const createRoute=(puzzle:RoutePuzzle):RouteRound=>({puzzle_id:puzzle.id,path:[puzzle.start],discovered:[puzzle.start,puzzle.end],steps:0,mistakes:0,revision:0,complete:false,won:false,score:0,notice:''});
export function shortestRoute(start:string,end:string){
 const queue=[[start]],seen=new Set([start]);
 for(let i=0;i<queue.length;i++){const path=queue[i],tail=path.at(-1)!;if(tail===end)return path;for(const next of neighbors[tail]||[])if(!seen.has(next)){seen.add(next);queue.push([...path,next]);}}return [];
}
/** Every crossing counts, including retracing a border. Any connected route is valid. */
export function stepRoute(round:RouteRound,choice:string):RouteRound{
 if(round.complete)return round;
 const next={...round,path:[...round.path],discovered:[...round.discovered],notice:'',revision:round.revision+1},tail=next.path.at(-1)!;
 if(choice===tail||choice==='back'&&next.path.length===1)return round;
 if(choice==='give-up'){next.complete=true;next.notice='revealed';return next;}
 if(choice==='back'){next.path.pop();next.steps++;next.notice='back';}
 else if(!(neighbors[tail]||[]).includes(choice)){next.mistakes++;next.notice='not-neighbor';}
 else{next.path.push(choice);if(!next.discovered.includes(choice))next.discovered.push(choice);next.steps++;next.notice='crossed';}
 next.won=next.path.at(-1)===routePuzzle(next).end;next.complete=next.won||next.mistakes>=5;
 next.score=next.won?Math.max(0,1000-100*Math.max(0,next.steps-routePuzzle(next).minimum)-100*next.mistakes):0;
 return next;
}
export function restoreRoute(value:unknown):RouteRound|undefined{
 if(!value||typeof value!=='object')return;const r=value as RouteRound,p=routePuzzles.find(p=>p.id===r.puzzle_id);
 if(!p||!Array.isArray(r.discovered)||!r.discovered.includes(p.start)||!r.discovered.includes(p.end)||!r.discovered.every(id=>!!neighbors[id])||!Array.isArray(r.path)||r.path[0]!==p.start||!r.path.every((id,i)=>typeof id==='string'&&r.discovered.includes(id)&&(!i||neighbors[r.path[i-1]]?.includes(id)))||!['steps','mistakes','revision','score'].every(k=>Number.isInteger(r[k as keyof RouteRound])&&Number(r[k as keyof RouteRound])>=0)||r.steps<r.path.length-1||r.mistakes>5||typeof r.complete!=='boolean'||typeof r.won!=='boolean')return;
 if(r.won!==(r.path.at(-1)===p.end)||r.won&&!r.complete||r.mistakes===5&&!r.complete)return;
 return {...r,path:[...r.path],discovered:[...new Set(r.discovered)],score:r.won?Math.max(0,1000-100*Math.max(0,r.steps-p.minimum)-100*r.mistakes):0};
}
