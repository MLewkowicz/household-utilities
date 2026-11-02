/** Household time: gentle dawn (6–8am) and dusk (5–7pm), in New York. */
export function householdDaylight(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'numeric',hourCycle:'h23'}).formatToParts(now);
 const hour=Number(parts.find(p=>p.type==='hour')!.value)+Number(parts.find(p=>p.type==='minute')!.value)/60;
 const smooth=(x:number)=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
 const night=hour<12?1-smooth((hour-6)/2):smooth((hour-17)/2);
 return {hour,night};
}
