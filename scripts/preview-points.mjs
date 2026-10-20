// Read-only proposal tool. No database client, credentials, or mutation API.
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const members=['michal','rina','ohm','rohil'];
export function previewPoints(snapshot,policy){
 const ledger=snapshot.chores||snapshot;
 if(!Array.isArray(ledger.tasks))throw new Error('Use an exported chore ledger or household backup.');
 const datePattern=/^20\d\d-\d\d-\d\d$/;
 for(const key of ['from','through'])if(!datePattern.test(policy[key]||'')||Number.isNaN(Date.parse(policy[key]))||new Date(policy[key]).toISOString().slice(0,10)!==policy[key])throw new Error('Choose valid from/through dates.');
 if(policy.from>policy.through)throw new Error('The date range is reversed.');
 for(const map of [policy.points_by_icon||{},policy.points_by_task||{}]){
  if(typeof map!=='object'||Array.isArray(map))throw new Error('Point mappings must be objects.');
  if(Object.values(map).some(n=>typeof n!=='number'||!Number.isInteger(n*2)||n<0||n>100))throw new Error('Proposed points must be in half-point increments from 0 to 100.');
 }
 const totals=Object.fromEntries(members.map(m=>[m,{before_units:0,after_units:0,delta_units:0}]));
 const changes=[];
 for(const task of ledger.tasks){
  if(task.projected||task.state!=='completed'||!task.completion)continue;
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(task.completion.completed_at));
  if(day<policy.from||day>policy.through)continue;
  const people=task.completion.contributors;
  if(!Array.isArray(people)||!people.length||new Set(people).size!==people.length||people.some(m=>!members.includes(m)))throw new Error('Invalid completion contributors in snapshot.');
  const before=task.points;
  if(typeof before!=='number'||!Number.isInteger(before*2)||before<0)throw new Error('Invalid existing points.');
  // Never convert reminders/favors into scored work through this preview.
  const after=before===0||['reminder','request'].includes(task.kind)?before:(policy.points_by_task?.[task.id]??policy.points_by_icon?.[task.icon_id]??before);
  for(const member of people){totals[member].before_units+=before*12/people.length;totals[member].after_units+=after*12/people.length;}
  if(before!==after)changes.push({id:task.id,version:task.version,title:task.title,completed_on:day,contributors:people,before_points:before,proposed_points:after});
 }
 for(const total of Object.values(totals))total.delta_units=total.after_units-total.before_units;
 return{preview_only:true,from:policy.from,through:policy.through,units_per_point:12,requires_expanded_point_range:changes.some(c=>![0,0.5,1,2,3].includes(c.proposed_points)),totals,changes};
}
if(import.meta.url===pathToFileURL(resolve(process.argv[1]||'')).href){
 try{
  if(process.argv.length!==4)throw new Error('Usage: node scripts/preview-points.mjs EXPORTED_CHORES.json PROPOSED_POLICY.json');
  const [snapshot,policy]=await Promise.all(process.argv.slice(2).map(async path=>JSON.parse(await readFile(path,'utf8'))));
  console.log(JSON.stringify(previewPoints(snapshot,policy),null,2));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
