import {success} from './haptics';
let context:AudioContext|undefined;
const preference='household-size-sound';
export function sizeSoundEnabled(){try{return localStorage.getItem(preference)!=='off';}catch{return true;}}
export function toggleSizeSound(){const enabled=!sizeSoundEnabled();try{localStorage.setItem(preference,enabled?'on':'off');}catch{/* Optional preference. */}return enabled;}
/** Unlock audio in the submit gesture, before waiting for a daily RPC. */
export function prepareSizeFeedback(){
 if(!sizeSoundEnabled())return;
 try{context??=new AudioContext();if(context.state==='suspended')void context.resume().catch(()=>{});}catch{/* Audio is optional. */}
}
export function startSizeChime(duration:number){
 const notes:OscillatorNode[]=[];
 if(!sizeSoundEnabled()||!matchMedia('(pointer:fine)').matches||!context||context.state==='closed')return ()=>{};
 try{
  const now=context.currentTime;
  for(const [offset,frequency] of [...(duration?[[0,392],[.18,440],[.36,523.25],[.54,659.25]]:[]),[duration,783.99],[duration+.04,1046.5]]){
   const oscillator=context.createOscillator(),gain=context.createGain();oscillator.type='sine';oscillator.frequency.value=frequency;
   const start=now+offset;gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.025,start+.008);gain.gain.exponentialRampToValueAtTime(.0001,start+.13);
   oscillator.connect(gain);gain.connect(context.destination);oscillator.start(start);oscillator.stop(start+.15);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};notes.push(oscillator);
  }
 }catch{/* Browser audio may be unavailable. */}
 return ()=>notes.forEach(node=>{try{node.stop();}catch{/* Already stopped. */}});
}
export function finishSizeFeedback(){if(matchMedia('(pointer:coarse)').matches)success();}
