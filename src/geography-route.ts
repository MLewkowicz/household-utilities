import data from './geography-routes.json' with {type:'json'};
export type RoutePuzzle={id:number;start:string;end:string;region:string;minimum:number;solution:string[]};
export type RouteFeedback={country:string;quality:'connected'|'useful'|'detour'|'miss'};
export type RouteRound={puzzle_id:number;path:string[];discovered:string[];steps:number;mistakes:number;revision:number;complete:boolean;won:boolean;score:number;notice:string;guesses?:string[];feedback?:RouteFeedback[];rules_version?:number;id?:string;player?:string;day?:string};
export const routePuzzles:RoutePuzzle[]=data.puzzles;
export const neighbors:Record<string,string[]>=data.neighbors;
export function routePuzzle(round:RouteRound){const p=routePuzzles.find(p=>p.id===round.puzzle_id)!;if(p&&p.id<48&&round.rules_version===2){const solution=shortestRoute(p.start,p.end);return {...p,minimum:solution.length-1,solution};}return p;}
export const practiceRoutePuzzles=routePuzzles.filter(p=>p.id>=48);
export const createRoute=(puzzle:RoutePuzzle):RouteRound=>({puzzle_id:puzzle.id,path:[puzzle.start],discovered:[puzzle.start,puzzle.end],steps:0,mistakes:0,revision:0,complete:false,won:false,score:0,notice:'',guesses:[],feedback:[],rules_version:2});
export function shortestRoute(start:string,end:string){return remainingRoute(start,end,[]).path;}
/** Minimize missing countries first, then crossings. Guessed countries and endpoints cost zero. */
export function remainingRoute(start:string,end:string,guesses:string[]){
 const known=new Set([start,end,...guesses]),cost=new Map([[start,0]]),paths=new Map([[start,[start]]]),pending=new Set(Object.keys(neighbors));
 while(pending.size){
  const current=[...pending].sort((a,b)=>(cost.get(a)??Infinity)-(cost.get(b)??Infinity)||a.localeCompare(b))[0],distance=cost.get(current);
  if(distance===undefined)break;
  if(current===end)return {missing:Math.floor(distance/1000),path:paths.get(current)!};
  pending.delete(current);
  for(const next of neighbors[current]||[]){const candidate=distance+1+(known.has(next)?0:1000);if(pending.has(next)&&candidate<(cost.get(next)??Infinity)){cost.set(next,candidate);paths.set(next,[...paths.get(current)!,next]);}}
 }
 return {missing:Infinity,path:[]};
}
export function routeGuessLimit(puzzle:RoutePuzzle){const n=puzzle.minimum-1;return n+(n<=3?4:n<=6?5:n<=9?6:n<=12?7:8);}
function connectedBranches(path:string[],guesses:string[]){
 const known=new Set([path[0],path.at(-1),...guesses]);
 return [path,[...path].reverse()].map(sequence=>{const branch:string[]=[];for(const id of sequence){if(!known.has(id))break;branch.push(id);}return branch;});
}
export function routeBranches(round:RouteRound){
 if(round.won||round.rules_version!==2)return [round.path];
 const puzzle=routePuzzle(round),guesses=round.guesses||[];
 return connectedBranches(remainingRoute(puzzle.start,puzzle.end,guesses).path,guesses);
}
function orderedRoute(puzzle:RoutePuzzle,guesses:string[]){
 return [[puzzle.start,...guesses,puzzle.end],[puzzle.end,...guesses,puzzle.start]].some(path=>path.every((id,i)=>!i||neighbors[path[i-1]]?.includes(id)));
}
export function stepRoute(round:RouteRound,choice:string):RouteRound{
 if(round.complete)return round;
 const puzzle=routePuzzle({...round,rules_version:2}),guesses=round.guesses||round.path.filter(id=>id!==puzzle.start&&id!==puzzle.end);
 if(choice==='back'||choice===puzzle.start||choice===puzzle.end||guesses.includes(choice))return round;
 if(choice!=='give-up'&&!Object.hasOwn(neighbors,choice))return round;
 const next:RouteRound={...round,guesses:[...guesses],feedback:[...(round.feedback||[])],path:[...round.path],discovered:[...round.discovered],steps:round.steps+(round.rules_version===2?0:round.mistakes),rules_version:2,notice:'',revision:round.revision+1};
 if(choice==='give-up'){next.complete=true;next.notice='revealed';return next;}
 const before=remainingRoute(puzzle.start,puzzle.end,guesses);
 next.guesses!.push(choice);next.steps++;
 const after=remainingRoute(puzzle.start,puzzle.end,next.guesses!),known=new Set([puzzle.start,puzzle.end,...next.guesses!]);
 next.path=[];for(const id of after.path){if(!known.has(id))break;next.path.push(id);}
 if(!next.path.length)next.path=[puzzle.start];
 const useful=after.missing<before.missing;
 const via=remainingRoute(puzzle.start,choice,next.guesses!).missing+remainingRoute(choice,puzzle.end,next.guesses!).missing;
 const quality:RouteFeedback['quality']=useful?(connectedBranches(after.path,next.guesses!).some(branch=>branch.includes(choice))?'connected':'useful'):via<=after.missing+1?'detour':'miss';
 next.feedback!.push({country:choice,quality});next.notice=quality;
 next.discovered=[...new Set([...next.discovered,choice])];if(!useful)next.mistakes++;
 next.won=after.missing===0;next.complete=next.won||next.steps>=routeGuessLimit(puzzle);
 next.score=next.won?Math.max(0,1000-100*Math.max(0,next.steps-(puzzle.minimum-1))-(!orderedRoute(puzzle,next.guesses!)&&next.steps===puzzle.minimum-1?25:0)):0;
 return next;
}
export function restoreRoute(value:unknown):RouteRound|undefined{
 if(!value||typeof value!=='object')return;const r=value as RouteRound,p=routePuzzles.find(p=>p.id===r.puzzle_id);
 if(!p||!Array.isArray(r.discovered)||!r.discovered.includes(p.start)||!r.discovered.includes(p.end)||!r.discovered.every(id=>!!neighbors[id])||!Array.isArray(r.path)||r.path[0]!==p.start||!r.path.every((id,i)=>typeof id==='string'&&r.discovered.includes(id)&&(!i||(r.rules_version===2?neighbors:(data.legacyNeighbors as Record<string,string[]>))[r.path[i-1]]?.includes(id)))||!['steps','mistakes','revision','score'].every(k=>Number.isInteger(r[k as keyof RouteRound])&&Number(r[k as keyof RouteRound])>=0)||typeof r.complete!=='boolean'||typeof r.won!=='boolean')return;
 if(r.won!==(r.path.at(-1)===p.end)||r.won&&!r.complete)return;
 if(r.rules_version===2&&(!Array.isArray(r.guesses)||new Set(r.guesses).size!==r.guesses.length||r.guesses.some(id=>!neighbors[id]||id===p.start||id===p.end)||r.steps<r.guesses.length||!Array.isArray(r.feedback)||r.feedback.some(f=>!r.guesses!.includes(f.country)||!['connected','useful','detour','miss'].includes(f.quality))))return;
 return {...r,path:[...r.path],discovered:[...new Set(r.discovered)]};
}
