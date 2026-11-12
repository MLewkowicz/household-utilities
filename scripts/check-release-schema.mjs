import {readFile} from 'node:fs/promises';
const config=JSON.parse(await readFile('config.public.json','utf8'));
const checks=[
 ['trivia_capabilities',{},d=>d.version===3&&d.games===5&&d.groups===true,'033_observatory_games_v3.sql'],
 ['geography_score_modes',{},d=>Array.isArray(d)&&d.includes('name')&&d.includes('find')&&d.includes('places'),'037_geography_major_cities.sql'],
 ['geography_route_capabilities',{},d=>d.version===1&&d.puzzles===48,'036_geography_routes.sql'],
 ['geography_scores',{},Array.isArray,'029_geography_scores.sql'],
 ['app_capabilities',{},d=>d.event_edit_notifications&&d.quarter_points&&d.as_needed_routines&&d.sweeping_spaces&&d.personal_deadlines,'028_personal_deadlines.sql'],
 ['personal_tasks',{p:{member:'michal'}},d=>d.format_version>=2&&d.group_rename_version>=1&&Array.isArray(d.tasks),'021_personal_group_rename.sql'],
 ['home_order',{p:{member:'michal'}},d=>Number.isInteger(d.version)&&Array.isArray(d.keys),'017_home_personal_tasks.sql'],
 ['events_dashboard',{},d=>d.format_version>=3&&Array.isArray(d.availability),'022_event_availability.sql'],
 ['bulletin_dashboard',{},d=>d.reaction_library_version>=2,'019_reaction_library.sql'],
];
const results=await Promise.all(checks.map(async([operation,body,valid,migration])=>{
 try{const r=await fetch(config.url+'/rest/v1/rpc/utilities_'+operation,{method:'POST',headers:{'Content-Type':'application/json',apikey:config.key},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});if(r.ok&&valid(await r.json()))return null;}catch{/* Report only the missing capability, never response data. */}
 return migration;
}));
const missing=[...new Set(results.filter(Boolean))];
if(missing.length){console.error('Publication stopped: live database capabilities unavailable for '+missing.join(', ')+'. Apply missing migrations with ./configure.sh and retry.');process.exitCode=1;}
else console.log('Live database supports personal group renaming, task ordering, event edits, quarter-point tasks, as-needed rotations, sweeping spaces, personal deadlines, expanded reactions, all five trivia games, major-city scores and daily Border Trails.');
