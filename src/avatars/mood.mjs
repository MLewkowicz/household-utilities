export const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
export const lerp=(a,b,t)=>a+(b-a)*t;
export function smooth(a,b,x){const t=clamp((x-a)/(b-a));return t*t*(3-2*t);}
export function moodFromValue(raw){
  const value=clamp(Number.isFinite(Number(raw))?Number(raw):0,-100,100);
  const anger=Math.max(0,-value/100),love=Math.max(0,value/100);
  return {value,anger,love,steam:smooth(.24,.96,anger),risingSteam:smooth(.42,1,anger),hearts:smooth(.57,.94,love),blush:smooth(.06,.92,love),heat:smooth(.10,.97,anger)};
}
export function describe(value){
  if(value<=-80)return ['Full steam','Two ears. A lot of pressure.'];
  if(value<=-45)return ['Getting heated','The pressure is building.'];
  if(value<-8)return ['A little annoyed','Something is getting under his skin.'];
  if(value<9)return ['Easygoing','A moment of calm.'];
  if(value<48)return ['Warm thanks','A little appreciation goes a long way.'];
  if(value<80)return ['Feeling the love','Hearts are taking over.'];
  return ['Absolutely smitten','That really made his day.'];
}
export function ease(current,target,dt){return Math.abs(current-target)<.015?target:lerp(current,target,1-Math.exp(-dt/145));}
