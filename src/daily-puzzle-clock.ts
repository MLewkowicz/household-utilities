import type {Attempt} from './trivia-model';
import {pausedPuzzleClock} from './puzzle-clock';

export type PuzzleClockState=Pick<Attempt,'id'|'clock_version'|'clock_owner'|'active_ms'|'active_since'|'active_until'|'started_at'|'finished_at'|'elapsed_ms'|'complete'>&{clock_revision:number;server_now:string};
export type PuzzleClockUpdate={id:string;player:string;owner:string;revision:number;running:boolean};

/** Serialize activity updates; stale pauses cannot stop a newer tab or visit. */
export class DailyPuzzleClock{
 private desired=false;
 private inFlight=false;
 private pending=false;
 private disposed=false;
 private failures=0;
 private revision:number;
 private serverOwner:string|null;
 private running=false;
 private interval:ReturnType<typeof setInterval>|undefined;
 private retry:ReturnType<typeof setTimeout>|undefined;
 offset=0;
 constructor(private attempt:Attempt,private send:(p:PuzzleClockUpdate)=>Promise<PuzzleClockState>,private changed:()=>void,private owner=crypto.randomUUID()){
  this.revision=attempt.clock_revision||0;this.serverOwner=attempt.clock_owner||null;
  this.running=!!attempt.active_since;this.offset=attempt.server_now?Date.parse(attempt.server_now)-Date.now():0;
 }
 setActive(value:boolean){
  if(this.disposed||this.attempt.complete)return;
  if(value===this.desired)return;
  this.desired=value;
  if(value){this.interval=setInterval(()=>{this.pending=true;void this.flush();},10000);}
  else{clearInterval(this.interval);this.interval=undefined;Object.assign(this.attempt,pausedPuzzleClock(this.attempt,Date.now()+this.offset));this.changed();}
  this.pending=true;void this.flush();
 }
 finish(){this.disposed=true;this.desired=false;clearInterval(this.interval);clearTimeout(this.retry);}
 async flush():Promise<void>{
  if(this.inFlight||this.disposed||!this.pending)return;
  this.inFlight=true;this.pending=false;const wanted=this.desired;
  try{
   const state=await this.send({id:this.attempt.id,player:this.attempt.player,owner:this.owner,revision:this.revision,running:wanted});
   if(this.disposed)return;
   this.failures=0;this.revision=state.clock_revision;this.serverOwner=state.clock_owner||null;
   this.offset=Date.parse(state.server_now)-Date.now();
   this.running=!!state.active_since&&!!state.active_until&&Date.parse(state.active_until)>Date.parse(state.server_now);
   Object.assign(this.attempt,state);
   if(!this.desired)Object.assign(this.attempt,pausedPuzzleClock(this.attempt,Date.now()+this.offset));
   this.changed();
   if(state.complete){this.finish();return;}
   // Resume may need the latest revision. A pause may only affect its own owner.
   this.pending ||= this.desired?!(this.running&&this.serverOwner===this.owner):this.running&&this.serverOwner===this.owner;
  }catch{
   // The server lease also bounds time if a tab closes before its pause arrives.
   if(!this.disposed&&++this.failures<=3){clearTimeout(this.retry);this.retry=setTimeout(()=>{this.pending=true;void this.flush();},1000*this.failures);}
  }finally{this.inFlight=false;}
  if(this.pending&&!this.disposed)void this.flush();
 }
}
