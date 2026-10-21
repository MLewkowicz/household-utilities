import {readFile} from 'node:fs/promises';
const config=JSON.parse(await readFile('config.public.json','utf8'));
const checks=[
 ['personal_tasks',{p:{member:'michal'}},d=>d.format_version>=1&&Array.isArray(d.tasks),'017_home_personal_tasks.sql'],
 ['home_order',{p:{member:'michal'}},d=>Number.isInteger(d.version)&&Array.isArray(d.keys),'017_home_personal_tasks.sql'],
 ['events_dashboard',{},d=>d.format_version>=2,'018_event_icons.sql'],
 ['bulletin_dashboard',{},d=>d.reaction_library_version>=2,'019_reaction_library.sql'],
];
const results=await Promise.all(checks.map(async([operation,body,valid,migration])=>{
 try{const r=await fetch(config.url+'/rest/v1/rpc/utilities_'+operation,{method:'POST',headers:{'Content-Type':'application/json',apikey:config.key},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});if(r.ok&&valid(await r.json()))return null;}catch{/* Report only the missing capability, never response data. */}
 return migration;
}));
const missing=[...new Set(results.filter(Boolean))];
if(missing.length){console.error('Publication stopped: live database capabilities unavailable for '+missing.join(', ')+'. Apply missing migrations with ./configure.sh and retry.');process.exitCode=1;}
else console.log('Live database supports Home, event illustrations and expanded reactions.');
