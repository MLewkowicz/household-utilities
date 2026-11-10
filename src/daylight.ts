/** Household time: gentle dawn (6–8am) and dusk (5–7pm), in New York. */
export function householdDaylight(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'numeric',hourCycle:'h23'}).formatToParts(now);
 const hour=Number(parts.find(p=>p.type==='hour')!.value)+Number(parts.find(p=>p.type==='minute')!.value)/60;
 const smooth=(x:number)=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
 const night=hour<12?1-smooth((hour-6)/2):smooth((hour-17)/2);
 return {hour,night};
}

/** Deliberate twilight palettes keep text contrast stable through the transition. */
export function daylightPalette(hour:number,night:number){
 const dusk=hour>=17&&hour<19,dawn=hour>=6&&hour<8;
 if(dusk)return {theme:'dark',phase:'dusk',colors:{bg:'#251b35',paper:'#35253f',line:'#71506c',pale:'#50354b',field:'#2c2038','surface-muted':'#30223b',ink:'#fff1e5',body:'#f1dce4',muted:'#d7b5c8','tile-muted':'#d7b5c8',green:'#ffb47b','accent-ink':'#332036','accent-hover':'#ffcba2'}};
 if(dawn&&hour<7)return {theme:'dark',phase:'dawn',colors:{bg:'#24253f',paper:'#30344f',line:'#596486',pale:'#3c4964',field:'#282e49','surface-muted':'#292d46',ink:'#f2f5ff',body:'#dce5fa',muted:'#b9c9e9','tile-muted':'#b9c9e9',green:'#aacfee','accent-ink':'#202e47','accent-hover':'#c4e0f5'}};
 if(dawn)return {theme:'light',phase:'dawn',colors:{bg:'#e4edf5',paper:'#f6f8ff',line:'#c1cadd',pale:'#d9e4f2',field:'#fbfcff','surface-muted':'#dee7f1',ink:'#302c49',body:'#41415d',muted:'#62627b','tile-muted':'#62627b',green:'#4e6089','accent-ink':'#ffffff','accent-hover':'#3c4d73'}};
 return {theme:night>=.6?'dark':'light',phase:night>=.6?'night':'day',colors:null};
}
