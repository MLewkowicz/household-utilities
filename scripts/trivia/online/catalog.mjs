import {createHash} from 'node:crypto';
import {readFile, mkdir, writeFile, rename} from 'node:fs/promises';
import {readItem} from './live.mjs';
import {setTimeout as delay} from 'node:timers/promises';

export const passportFacts=(await readFile(new URL('passport-facts.tsv',import.meta.url),'utf8')).trim().split('\n').map(line=>{const [country,title,text]=line.split('|');if(!/^[A-Z]{3}$/.test(country)||!title||!text||text.length>220)throw new Error('Invalid reviewed passport fact');return {country,title,text};});
const selections=(await readFile(new URL('../editorial/wikidata.tsv',import.meta.url),'utf8')).trim().split('\n').map(row=>row.split('|'));
const normalize=s=>s.replaceAll('_',' ').toLowerCase();
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const claims=(entity,property)=>(entity.claims?.[property]||[]).filter(c=>c.rank!=='deprecated'&&c.mainsnak?.snaktype==='value');
const value=c=>c.mainsnak.datavalue?.value;

// Disputed, approximate, ranged and underspecified dates never become quiz answers.
export function eventYear(entity,property,currentYear=new Date().getUTCFullYear()){
 const years=[];
 for(const c of claims(entity,property)){
  const d=value(c);
  if(!d||d.precision<9||d.before!==0||d.after!==0||!d.calendarmodel?.endsWith('/Q1985727')||
    Object.keys(c.qualifiers||{}).some(p=>['P1480','P1319','P1326','P5102','P2241'].includes(p)))return null;
  const year=Number(/^\+(\d+)-/.exec(d.time)?.[1]);
  if(!Number.isInteger(year)||year<1000||year>=currentYear)return null;
  years.push(year);
 }
 // Publication may have several national editions; the card explicitly says first published.
 if(!years.length)return null;
 return property==='P577'?Math.min(...years):new Set(years).size===1?years[0]:null;
}

export async function fetchCatalog(snapshot,options={}){
 const catalog={...snapshot,fetchedAt:new Date().toISOString(),events:[],places:[],passportFacts:[],rejected:[]};
 const oldEvents=new Map(snapshot.events.map(e=>[e.id,e]));
 const oldFacts=new Map(snapshot.passportFacts.map(f=>[f.title,f]));
 const pause=options.sleep||delay;
 for(const [id] of selections){
  const event=oldEvents.get(id);
  const {data}=await readItem(`https://www.wikidata.org/wiki/Special:EntityData/${id}.json`,options);
  const entity=data.entities?.[id];
  if(!entity?.lastrevid||eventYear(entity,event.property)!==event.year)throw new Error(`Review changed timeline date for ${id}`);
  catalog.events.push({...event,revision:entity.lastrevid});
  options.onProgress?.(`Verified timeline item ${id} (${catalog.events.length}/${selections.length})`);
  await pause(350);
 }
 for(const fact of passportFacts){
  const old=oldFacts.get(fact.title);
  if(!old)throw new Error(`Review item ID for ${fact.title}`);
  const {data,etag}=await readItem(`https://www.wikidata.org/w/rest.php/wikibase/v1/entities/items/${old.id}/sitelinks/enwiki`,options);
  const revision=Number(/"(\d+)"/.exec(etag)?.[1]);
  if(!revision||normalize(data.title||'')!==normalize(fact.title))throw new Error(`Review changed Passport sitelink for ${old.id}: ${data.title}`);
  catalog.passportFacts.push({...old,...fact,revision});
  options.onProgress?.(`Verified Passport item ${old.id} (${catalog.passportFacts.length}/${passportFacts.length})`);
  await pause(350);
 }
 return catalog;
}

function random(seed){let n=parseInt(hash(seed).slice(0,8),16);return ()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
function shuffle(values,rng){const a=[...values];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function timelineBoards(events,count,namespace){
 const rng=random(namespace),usage=new Map(events.map(e=>[e.id,0])),boards=[],signatures=new Set();
 for(let i=0;i<count;i++){
  let chosen;
  for(let tries=0;tries<100;tries++){
   chosen=[];
   const candidates=shuffle(events,rng).sort((a,b)=>usage.get(a.id)-usage.get(b.id));
   for(const e of candidates){if(chosen.some(c=>c.year===e.year)||chosen.filter(c=>c.art===e.art).length>=(e.art==='clock'?3:2)||(['book','rocket'].includes(e.art)&&(i%3!==1||chosen.some(c=>['book','rocket'].includes(c.art)))))continue;chosen.push(e);if(chosen.length===5)break;}
   if(chosen.length!==5)throw new Error('Insufficient date/topic diversity for a timeline');
   const signature=chosen.map(e=>e.id).sort().join('|');
   if(!signatures.has(signature)){signatures.add(signature);break;}
   // Avoid getting stuck on a previously used least-seen combination.
   for(const e of chosen)usage.set(e.id,usage.get(e.id)+.01);
   if(tries===99)throw new Error('Insufficient unique timeline combinations');
  }
  for(const e of chosen)usage.set(e.id,usage.get(e.id)+1);
  const ordered=[...chosen].sort((a,b)=>a.year-b.year);
  let cards=shuffle(chosen,rng).map(e=>({id:e.id,label:e.label,art:e.art}));
  if(cards.every((c,j)=>c.id===ordered[j].id))cards=cards.slice(1).concat(cards[0]);
  boards.push({id:`${namespace}-${i+1}`,version:5,kind:'timeline',prompt:'Put these moments in order.',cards,
   answer:ordered.map(e=>e.id),reveal:Object.fromEntries(chosen.map(e=>[e.id,e.year])),
   explanation:ordered.map(e=>`${e.year} · ${e.label}`).join('\n'),sources:chosen.map(e=>e.source)});
 }
 return boards;
}
function outline(country){
 const center=country.center[0],area=r=>Math.abs(r.reduce((sum,a,i)=>{const b=r[(i+1)%r.length];return sum+a[0]*b[1]-b[0]*a[1];},0))/2;
 let rings=country.rings.map(r=>r.map(([x,y])=>[center+((x-center+540)%360)-180,-y]));
 const largest=rings.reduce((a,b)=>area(a)>area(b)?a:b);
 rings=rings.filter(r=>area(r)>=area(largest)*.025);
 if(country.id==='FRA')rings=rings.filter(r=>r.reduce((s,p)=>s+p[0],0)/r.length>-10);
 const latitude=-largest.reduce((s,p)=>s+p[1],0)/largest.length;
 rings=rings.map(r=>r.map(([x,y])=>[x*Math.cos(latitude*Math.PI/180),y]));
 const points=rings.flat(),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x0=Math.min(...xs),y0=Math.min(...ys),w=Math.max(...xs)-x0,h=Math.max(...ys)-y0,scale=260/Math.max(w,h);
 return {viewBox:`0 0 ${(w*scale+20).toFixed(1)} ${(h*scale+20).toFixed(1)}`,path:rings.map(r=>'M'+r.map(([x,y])=>`${((x-x0)*scale+10).toFixed(1)},${((y-y0)*scale+10).toFixed(1)}`).join('L')+'Z').join(' ')};
}
export function buildRelease(catalog,atlas){
 if(catalog.schema!==1||catalog.license!=='CC0-1.0')throw new Error('Unsupported source catalog');
 const dailyEvents=[],practiceEvents=[];
 // Stable membership keeps a fact from moving between practice and daily on refresh.
 for(const e of catalog.events)(parseInt(hash(e.id).slice(0,8),16)%5===0?practiceEvents:dailyEvents).push(e);
 const digest=hash(catalog.events.map(e=>[e.id,e.label,e.year]));
 const timelines=timelineBoards(dailyEvents,180,`timeline-online-${digest.slice(0,10)}`);
 const practiceTimeline=timelineBoards(practiceEvents,40,`timeline-practice-${digest.slice(0,10)}`);
 const countries=new Map(atlas.map(c=>[c.id,c])),byCountry=new Map();
 if(!Array.isArray(catalog.passportFacts))throw new Error('Missing reviewed passport facts');
 for(const fact of catalog.passportFacts){if(!byCountry.has(fact.country))byCountry.set(fact.country,[]);byCountry.get(fact.country).push(fact);}
 const passport=[],practicePassport=[];
 for(const [iso,facts] of byCountry){
  const country=countries.get(iso);if(!country?.capital||facts.length<2)continue;
  const isPractice=parseInt(hash(iso).slice(0,8),16)%7===0;
  for(let i=0;i<facts.length;i++)for(let j=i+1;j<facts.length;j++){
   const a=facts[i],b=facts[j];
   (isPractice?practicePassport:passport).push({id:`passport-culture-${iso}-${hash([a.text,b.text]).slice(0,12)}`,version:5,kind:'clues',prompt:'Where is this?',outline:outline(country),
    clues:[a.text,b.text,`Region: ${country.region}`,`Capital: ${country.capital}`],
    answer:country.name,aliases:country.aliases,explanation:`${country.name}. ${a.text} ${b.text} Capital: ${country.capital}.`,sources:[...new Set([a.source,b.source])]});
  }
 }
 if(passport.length<100||practicePassport.length<20||byCountry.size<55)throw new Error('Insufficient reviewed country-clue coverage');
 const rng=random('passport-online-v1'),use=new Map(passport.map(q=>[q.id,0])),packs=[],seen=new Set();
 for(let slot=0;slot<90;slot++){
  const chosen=[];
  for(const q of shuffle(passport,rng).sort((a,b)=>use.get(a.id)-use.get(b.id))){if(chosen.some(c=>c.answer===q.answer))continue;chosen.push(q);if(chosen.length===5)break;}
  if(chosen.length!==5)throw new Error('Insufficient country variety');
  const signature=chosen.map(q=>q.id).sort().join('|');if(seen.has(signature))throw new Error('Duplicate country pack');seen.add(signature);
  for(const q of chosen)use.set(q.id,use.get(q.id)+1);packs.push(chosen);
 }
 const release={schema:1,provider:'wikidata',catalog:{fetchedAt:catalog.fetchedAt,license:catalog.license,events:catalog.events.length,landmarks:catalog.places.length,passportEditorial:2,passportFacts:catalog.passportFacts.length,
  revisions:[...new Map([...catalog.events,...catalog.places,...catalog.passportFacts,...catalog.places.map(e=>({id:e.countryId,revision:e.countryRevision}))].map(e=>[e.id,{id:e.id,revision:e.revision}])).values()]},games:[{game:'before-or-after',packs:timelines.map(q=>[q])},{game:'passport-puzzle',packs}]};
 validateRelease(release);
 return {release,practice:{'before-or-after':practiceTimeline,'passport-puzzle':practicePassport},summary:{events:catalog.events.length,dailyEvents:dailyEvents.length,practiceEvents:practiceEvents.length,landmarks:catalog.places.length,passportFacts:catalog.passportFacts.length,countries:byCountry.size,countryClues:passport.length,practiceCountryClues:practicePassport.length,timelineDays:180,passportDays:90,rejected:catalog.rejected.length,contentHash:hash(release.games)}};
}
export function validateRelease(p){
 if(p.schema!==1||p.provider!=='wikidata'||p.games?.length!==2)throw new Error('Invalid release envelope');
 for(const g of p.games){
  if(!['before-or-after','passport-puzzle'].includes(g.game)||g.packs.length<30||g.packs.length>366)throw new Error('Invalid game or pack count');
  const signatures=new Set();
  for(const pack of g.packs){
   if(pack.length!==(g.game==='before-or-after'?1:5))throw new Error('Incomplete board');
   const signature=pack.map(q=>q.id).sort().join('|');if(signatures.has(signature))throw new Error('Duplicate board');signatures.add(signature);
   for(const q of pack){
    if(!q.id||q.version!==5||!q.explanation||!q.sources?.length||q.sources.some(s=>!/^https:\/\/www.wikidata.org\/wiki\/Q\d+$/.test(s)))throw new Error('Missing question provenance');
    if(g.game==='before-or-after'){
     if(q.kind!=='timeline'||q.cards.length!==5||new Set(q.cards.map(c=>c.id)).size!==5||new Set(Object.values(q.reveal)).size!==5||q.answer.length!==5||q.answer.some((id,i)=>!q.cards.some(c=>c.id===id)||!Number.isInteger(q.reveal[id])||i&&q.reveal[q.answer[i-1]]>=q.reveal[id]))throw new Error('Invalid chronological answer');
    }else if(q.kind!=='clues'||q.clues.length!==4||!q.answer||!/^M[\d., MLZ-]+$/.test(q.outline.path)||!q.outline.viewBox)throw new Error('Invalid country question');
   }
  }
 }
 if(new Set(p.games.map(g=>g.game)).size!==2)throw new Error('Duplicate game');
 if(Buffer.byteLength(JSON.stringify(p))>8_000_000)throw new Error('Release exceeds import limit');
}
export async function atomicJSON(path,value){await mkdir(new URL('.',path),{recursive:true});const temp=new URL(path.href+'.tmp');await writeFile(temp,JSON.stringify(value,null,2)+'\n');await rename(temp,path);}
export const readJSON=async path=>JSON.parse(await readFile(path,'utf8'));
