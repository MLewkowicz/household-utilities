import {rpc} from './ui';
import {roundScore,isCompetitive,type Round,type Region,type CountryScope,type ScoreChallenge} from './geography';
export type GeoScore={id:string;player:string;region:Region;scope:CountryScope;challenge?:ScoreChallenge;correct:number;total:number;mistakes:number;elapsed_ms:number;score:number;finished_at:string;pending?:boolean};
const key='household-geography-scores-v1';
function local():GeoScore[]{try{return JSON.parse(localStorage.getItem(key)||'[]');}catch{return [];}}
function store(rows:GeoScore[]){try{localStorage.setItem(key,JSON.stringify(rows));return true;}catch{return false;}}
export function recordScore(round:Round,player:string,total:number){
 if(!isCompetitive(round.mode)||!round.ended||round.startedAt===null)return;
 const rows=local();if(rows.some(s=>s.id===round.id))return;
 const entry:GeoScore={id:round.id,player,region:round.region,scope:round.scope,challenge:round.mode==='competitive-find'?'find':'name',correct:round.correct.length,total,mistakes:round.mistakes,elapsed_ms:Math.max(0,Math.min(300000,(round.finishedAt??Date.now())-round.startedAt)),score:roundScore(round),finished_at:new Date(round.finishedAt??Date.now()).toISOString(),pending:player!=='guest'};
 rows.push(entry);store(rows);return entry;
}
export const compareScores=(a:GeoScore,b:GeoScore)=>b.score-a.score||b.correct-a.correct||a.elapsed_ms-b.elapsed_ms||a.finished_at.localeCompare(b.finished_at);
export function bestScores(rows:GeoScore[],region:Region,scope:CountryScope,challenge:ScoreChallenge='name'){
 const best=new Map<string,GeoScore>();for(const row of rows.filter(s=>s.region===region&&s.scope===scope&&(s.challenge||'name')===challenge).sort(compareScores))if(!best.has(row.player))best.set(row.player,row);return [...best.values()];
}
let syncing:Promise<void>|undefined;
export function syncScores(){
 if(syncing)return syncing;
 syncing=(async()=>{for(const row of local().filter(r=>r.pending)){
  const {pending,score,finished_at,...p}=row;await rpc('save_geography_score',{p});
  const current=local();const saved=current.find(s=>s.id===row.id);if(saved)saved.pending=false;store(current);
 }})().finally(()=>{syncing=undefined;});return syncing;
}
export async function loadScores(){
 try{await syncScores();const shared=await rpc<GeoScore[]>('geography_scores');const remoteIds=new Set(shared.map(s=>s.id));return {rows:[...shared,...local().filter(s=>!remoteIds.has(s.id))],shared:true};}
 catch{return {rows:local(),shared:false};}
}
