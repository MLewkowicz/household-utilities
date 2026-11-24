import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const read=async name=>(await readFile(new URL(name,import.meta.url),'utf8')).trim().split('\n');
export const selections=(await read('wikidata.tsv')).map(row=>row.split('|'));
const artwork={sport:'ball',technology:'computer',games:'game',film:'film',television:'film',food:'food',science:'science',music:'music',exploration:'plane',culture:'book'};
const primary=[];
let source;
for(const line of await read('milestones.tsv')){
 if(line.startsWith('#'))continue;
 if(line.startsWith('https://')){source=new URL(line).href;continue;}
 const [year,topic,type,label]=line.split('|');
 if(!source||!label||!topic||!type||!/^\d{4}$/.test(year)||Number(year)>=new Date().getUTCFullYear())throw new Error(`Invalid milestone: ${line}`);
 const id='milestone-'+createHash('sha256').update(label).digest('hex').slice(0,12);
 primary.push({id,year:Number(year),topic,type,label,source,art:artwork[topic]||({rail:'train',mail:'mail',photograph:'camera'})[type]||'clock'});
}
export const primarySources=new Set(primary.map(e=>e.source));
export function reviewedEvents(catalog){
 const facts=new Map(catalog.events.map(e=>[e.id,e]));
 const events=[...primary];
 for(const [id,topic,type,label] of selections){
  if(!facts.has(id))throw new Error(`Missing reviewed Wikidata event ${id}`);
  events.push({...facts.get(id),topic,type,label});
 }
 if(new Set(events.map(e=>e.id)).size!==events.length)throw new Error('Duplicate milestone');
 return events;
}

const limited=new Set(['bridge','publication','astronomy']);
function schedule(events,count,shuffle){
 const use=new Map(events.map(e=>[e.id,0])),days=[],signatures=new Set();
 for(let day=0;day<count;day++){
  const excluded=new Set();
  for(let offset=1;offset<14;offset++){
   for(const neighbor of [day-offset,(day+offset)%count]){
    for(const e of days[neighbor]||[])excluded.add(e.id);
   }
  }
  const pool=events.filter(e=>!excluded.has(e.id)&&(!limited.has(e.type)||day%9===4));
  let chosen;
  for(let attempt=0;attempt<100;attempt++){
   // Near the seam, spend cards that will soon collide with the opening days.
   const urgency=new Map();
   if(day>=count-26)for(const [first,board] of days.slice(0,13).entries())
    for(const e of board)urgency.set(e.id,14-first);
   const candidates=shuffle(pool).sort((a,b)=>(urgency.get(b.id)||0)-(urgency.get(a.id)||0)||use.get(a.id)-use.get(b.id));
   chosen=[];
   for(const e of candidates){
    if(chosen.some(c=>c.year===e.year||c.type===e.type))continue;
    if(chosen.length<4&&chosen.some(c=>c.topic===e.topic))continue;
    if(limited.has(e.type)&&chosen.some(c=>limited.has(c.type)))continue;
    chosen.push(e);
    if(chosen.length===5)break;
   }
   const signature=chosen.map(e=>e.id).sort().join('|');
   if(chosen.length===5&&!signatures.has(signature)){signatures.add(signature);break;}
   if(attempt===99)return null;
  }
  days.push(chosen);
  for(const e of chosen)use.set(e.id,use.get(e.id)+1);
 }
 return days;
}
export function dailyTimelines(events,count,namespace,shuffle){
 // A greedy pass can paint the final fortnight into a corner. Try a fresh
 // deterministic ordering and only publish a complete circular calendar.
 let days;
 for(let pass=0;pass<40&&!days;pass++)days=schedule(events,count,shuffle);
 if(!days)throw new Error('Insufficient timeline diversity to close the calendar');
 return days.map((day,i)=>{
  const order=[...day].sort((a,b)=>a.year-b.year);
  const cards=shuffle(day).map(({id,label,art})=>({id,label,art}));
  if(cards.every((c,j)=>c.id===order[j].id))cards.reverse();
  return {id:`${namespace}-${i+1}`,version:5,kind:'timeline',prompt:'Put these moments in order.',cards,
   answer:order.map(e=>e.id),reveal:Object.fromEntries(order.map(e=>[e.id,e.year])),
   explanation:order.map(e=>`${e.year} · ${e.label}`).join('\n'),sources:order.map(e=>e.source)};
 });
}
