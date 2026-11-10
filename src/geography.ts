export type Country={id:string;name:string;aliases:string[];continent:string;region:string;type:string;sovereign:string;center:number[];rings:number[][][];capital:string;population:string;terrain:string;facts:string[];background:string};
export const REGIONS=['World','Africa','Asia','Europe','North America','South America','Oceania','Micronesia','Polynesia','Melanesia','Caribbean','Central America'] as const;
export type Region=typeof REGIONS[number];
export type CountryScope='countries'|'expanded';
export type GameMode='practice'|'competitive'|'learn';
// UN members and the Holy See / Palestine observer states; independent of map entity types.
export const COUNTRY_IDS=new Set('AFG ALB DZA AND AGO ATG ARG ARM AUS AUT AZE BHR BGD BRB BLR BEL BLZ BEN BTN BOL BIH BWA BRA BRN BGR BFA BDI KHM CMR CAN CPV CAF TCD CHL COL COM CRI HRV CUB CYP CZE COD DNK DJI DMA DOM TLS ECU EGY SLV GNQ ERI EST SWZ ETH FSM FJI FIN FRA GAB GEO DEU GHA GRC GRD GTM GIN GNB GUY HTI HND HUN ISL IND IDN IRN IRQ IRL ISR ITA CIV JAM JPN JOR KAZ KEN KIR KWT KGZ LAO LVA LBN LSO LBR LBY LIE LTU LUX MDG MWI MYS MDV MLI MLT MHL MRT MUS MEX MDA MCO MNG MNE MAR MOZ MMR NAM NRU NPL NLD NZL NIC NER NGA PRK MKD NOR OMN PAK PLW PSX PAN PNG PRY CHN PER PHL POL PRT QAT COG ROU RUS RWA KNA LCA VCT WSM SMR SAU SEN SRB SYC SLE SGP SVK SVN SLB SOM ZAF KOR SDS ESP LKA SDN SUR SWE CHE SYR STP TJK TZA THA BHS GMB TGO TON TTO TUN TKM TUV TUR UGA UKR ARE GBR USA URY UZB VUT VAT VEN VNM YEM ZMB ZWE'.split(' '));
export const inRegion=(country:Country,region:string)=>region==='World'||country.continent===region||country.region===region;
export const inPool=(country:Country,region:string,scope:CountryScope='countries')=>inRegion(country,region)&&(scope==='expanded'||COUNTRY_IDS.has(country.id));

export const normalizeAnswer=(s:string)=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
export const isAnswer=(country:Country,answer:string)=>country.aliases.some(a=>normalizeAnswer(a)===normalizeAnswer(answer));
function distance(a:string,b:string){
 let row=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+Number(a[i-1]!==b[j-1]));row=next;}
 return row[b.length];
}
export function answerSuggestions(countries:Country[],query:string,region:string){
 const q=normalizeAnswer(query);if(!q)return [];
 return countries.filter(c=>inRegion(c,region)).map(c=>({country:c,score:Math.min(...c.aliases.map(alias=>{const a=normalizeAnswer(alias);return a===q?0:a.startsWith(q)?1:a.split(' ').some(w=>w.startsWith(q))?2:a.includes(q)?3:4+distance(a,q)/Math.max(a.length,q.length);} ))})).filter(c=>c.score<4||q.length>=3&&c.score<=4.48).sort((a,b)=>a.score-b.score||a.country.name.localeCompare(b.country.name)).slice(0,7).map(c=>c.country);
}
export type Round={id:string;mode:GameMode;scope:CountryScope;learningOrder:string[];learningTarget?:string;learningRemaining:number;region:Region;limit:number;maxLives:number;startedAt:number|null;correct:string[];revealed:string[];hints:Record<string,number>;mistakes:number;finishedAt?:number;ended:'won'|'complete'|'time'|'lives'|null};
export const newRound=(region:Region='World',limit=0,maxLives=0,scope:CountryScope='countries',mode:GameMode='practice'):Round=>({id:crypto.randomUUID(),mode,scope,learningOrder:[],learningRemaining:12000,region,limit:mode==='competitive'?300:mode==='learn'?0:limit,maxLives:mode==='competitive'?3:mode==='learn'?0:maxLives,startedAt:null,correct:[],revealed:[],hints:{},mistakes:0,ended:null});
export function shuffledCountries(countries:Country[],random=Math.random){
 const ids=countries.map(c=>c.id);for(let i=ids.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}return ids;
}
export const roundScore=(round:Pick<Round,'correct'|'mistakes'>)=>Math.max(0,round.correct.length*100-round.mistakes*25);

export function remainingSeconds(round:Round,now=Date.now()){return round.limit?Math.max(0,Math.min(round.limit,round.limit-Math.floor(((round.finishedAt??now)-(round.startedAt??now))/1000))):null;}
export function roundEnd(round:Round,total:number,now=Date.now()):Round['ended']{
 return round.ended|| (round.correct.length>=total?'won':round.correct.length+round.revealed.length>=total?'complete':round.maxLives&&round.mistakes>=round.maxLives?'lives':round.startedAt!==null&&remainingSeconds(round,now)===0?'time':null);
}
export function restoreRound(value:unknown,countries:Country[]):Round|null{
 if(!value||typeof value!=='object')return null;
 const raw=value as Partial<Round>;
 const r={...raw,region:(raw.region as string)==='Antarctica'?'World':raw.region,id:raw.id||crypto.randomUUID(),mode:raw.mode||'practice',scope:raw.scope||'expanded'} as Round;
 if((raw.region as string)==='Antarctica'&&['won','complete'].includes(r.ended||'')){r.ended=null;delete r.finishedAt;}
 if(!['practice','competitive','learn'].includes(r.mode)||!['countries','expanded'].includes(r.scope))return null;
 if(r.mode==='competitive'&&(r.limit!==300||r.maxLives!==3))return null;
 if(r.mode==='learn'&&(r.limit!==0||r.maxLives!==0))return null;

 if(r.finishedAt!==undefined&&(!Number.isFinite(r.finishedAt)||r.finishedAt<0))return null;
 if(!REGIONS.includes(r.region)||![0,60,180,300,600,900].includes(r.limit)||![0,3,5,10].includes(r.maxLives)||!Number.isInteger(r.mistakes)||r.mistakes<0||!Array.isArray(r.correct)||!(r.startedAt===null||Number.isFinite(r.startedAt)&&r.startedAt>0)||![null,'won','complete','time','lives'].includes(r.ended))return null;
 const valid=(id:unknown):id is string=>typeof id==='string'&&countries.some(c=>c.id===id&&inPool(c,r.region,r.scope));
 const correct=[...new Set(r.correct)].filter(valid);
 // Older saved rounds have no assistance fields. Keep their existing progress.
 const revealed=!r.limit&&Array.isArray(r.revealed)?[...new Set(r.revealed)].filter(id=>valid(id)&&!correct.includes(id)):[];
 const hints:Record<string,number>={};
 if(!r.limit&&r.hints&&typeof r.hints==='object'&&!Array.isArray(r.hints))for(const [id,count] of Object.entries(r.hints)){
  if(valid(id)&&Number.isInteger(count)&&count>0)hints[id]=Math.min(countryHints(countries.find(c=>c.id===id)!,r.region).length,count);
 }
 const learningOrder=Array.isArray(r.learningOrder)?[...new Set(r.learningOrder)].filter(valid):[];
 const learningTarget=valid(r.learningTarget)?r.learningTarget:undefined;
 const learningRemaining=Number.isFinite(r.learningRemaining)?Math.max(0,Math.min(12000,r.learningRemaining)):12000;
 return {...r,correct,revealed,hints,learningOrder,learningTarget,learningRemaining};
}
export const resolvedCountry=(round:Round,id:string)=>round.correct.includes(id)||round.revealed.includes(id);
export function countryHints(country:Country,region:Region):string[]{
 const hints:string[]=[];

 if(country.capital&&country.capital!=='No permanent capital')hints.push(`Capital: ${country.capital}`);
 let first=true;const pattern=Array.from(country.name).map(char=>{if(!/\p{L}/u.test(char)){if(/\s/.test(char))first=true;return char;}if(first){first=false;return char;}return '·';}).join('');
 hints.push(`Name: ${pattern}`);return hints;
}
export function useHint(round:Round,country:Country){
 if(round.mode==='competitive'||round.limit||round.ended||!inPool(country,round.region,round.scope)||resolvedCountry(round,country.id))return false;
 const count=round.hints[country.id]||0,max=countryHints(country,round.region).length;if(count>=max)return false;
 round.hints[country.id]=count+1;return true;
}
export function revealCountry(round:Round,country:Country){
 if(round.mode==='competitive'||round.limit||round.ended||!inPool(country,round.region,round.scope)||resolvedCountry(round,country.id))return false;
 round.revealed.push(country.id);return true;
}
export const pacificRegion=(region:string)=>['Oceania','Micronesia','Polynesia','Melanesia'].includes(region);
export type View=[number,number,number,number];
export function regionView(region:string):View{
 const bounds:Record<string,number[]>={World:[-180,-90,180,85],Africa:[-22,-37,55,39],Asia:[25,-13,180,80],Europe:[-26,33,65,73],'North America':[-170,5,-47,84],'South America':[-84,-58,-32,14],Oceania:[108,-51,237,31],Micronesia:[129,-10,208,25],Polynesia:[172,-31,237,30],Melanesia:[130,-28,185,3],Caribbean:[-86,8,-57,29],'Central America':[-94,5,-76,20]};
 const [west,south,east,north]=bounds[region]||bounds.World;return [(west+180)*3,(90-north)*3,(east-west)*3,(north-south)*3];
}
export function projectCenter(country:Country,pacific=false):[number,number]{let [lon,lat]=country.center;if(pacific&&lon<0)lon+=360;return [(lon+180)*3,(90-lat)*3];}
export function countryPath(country:Pick<Country,'rings'>,pacific=false){
 return country.rings.map(r=>{const shift=pacific&&r.reduce((n,p)=>n+p[0],0)/r.length<0?360:0;return r.map(([x,y],i)=>`${i?'L':'M'}${((x+shift+180)*3).toFixed(2)},${((90-y)*3).toFixed(2)}`).join('')+'Z';}).join('');
}
export function countryView(country:Country,pacific=false):View{
 const [cx,cy]=projectCenter(country,pacific);
 const nearby=country.rings.flat().map(([lon,lat])=>{if(pacific&&lon<0)lon+=360;return [(lon+180)*3,(90-lat)*3];}).filter(([x,y])=>Math.abs(x-cx)<260&&Math.abs(y-cy)<140);
 const xs=nearby.map(p=>p[0]),ys=nearby.map(p=>p[1]);
 const minX=Math.min(cx,...xs),maxX=Math.max(cx,...xs),minY=Math.min(cy,...ys),maxY=Math.max(cy,...ys);
 const width=Math.max(22,maxX-minX+12),height=Math.max(18,maxY-minY+12);
 return [(minX+maxX-width)/2,(minY+maxY-height)/2,width,height];
}
