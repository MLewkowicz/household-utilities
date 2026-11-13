import {readFile} from 'node:fs/promises';
const config=JSON.parse(await readFile('config.public.json','utf8'));
const checks=[
 ['puzzle_clock_capabilities',{},d=>d.version===1&&d.pause_resume===true,'051_active_puzzle_clocks.sql'],
 ['trivia_capabilities',{},d=>d.version===7&&d.timed_grids===true&&d.size_editorial===11&&d.size_history_version===11&&d.size_categories===true&&d.games===7&&d.archive===true&&d.grid_puzzles===true&&d.photo_silhouettes===false&&d.passport_editorial===2&&d.groups===true&&d.online_sync===true&&d.online_seed===1,'052_size_catalog_reset.sql'],
 ['geography_score_modes',{},d=>Array.isArray(d)&&d.includes('name')&&d.includes('find')&&d.includes('urban'),'038_geography_urban_catalog.sql'],
 ['geography_route_capabilities',{},d=>d.version===2&&d.puzzles===108&&d.global_routes===true&&d.bidirectional===true,'049_bidirectional_routes.sql'],
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
else console.log('Live database supports personal group renaming, task ordering, event edits, quarter-point tasks, as-needed rotations, sweeping spaces, personal deadlines, expanded reactions, all seven trivia games, personal archives, the reset size catalog, contextual Passport clues, major-city scores and daily Border Trails.');
