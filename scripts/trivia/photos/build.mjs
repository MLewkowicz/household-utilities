import {readFile,writeFile,access} from 'node:fs/promises';
const photos=JSON.parse(await readFile('src/size-photo-assets.json','utf8')),objects=Object.entries(photos),usage=Object.fromEntries(objects.map(([id])=>[id,0]));
const all=[];for(const [id,p] of objects)for(const [rid,r] of objects){const ratio=p.metres/r.metres;if(id===rid||ratio<.05||ratio>20||p.category===r.category)continue;all.push({id,p,rid,r,ratio});}
const ordered=[];let seed=70913;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
for(const pair of all)pair.tie=random();
while(all.length){all.sort((a,b)=>(usage[a.id]+usage[a.rid])-(usage[b.id]+usage[b.rid])||a.tie-b.tie);const p=all.shift();ordered.push(p);usage[p.id]++;usage[p.rid]++;}
const questions=ordered.map(({id,p,rid,r,ratio},i)=>({id:`photo-size-v7-${i+1}`,version:7,kind:'scale',prompt:`Resize the ${p.name.toLowerCase()} to match its real size.`,target:{name:p.name,dimension:p.dimension,shape:'photo:'+id},reference:{name:r.name,dimension:r.dimension,shape:'photo:'+rid,measure:`${r.metres<1?Number((r.metres*100).toFixed(3))+' cm':r.metres+' m'} · ${r.dimension}`},bounds:[.02,50],answer:Number(ratio.toFixed(8)),explanation:`${p.name}: ${p.metres} m (${p.dimension}). ${r.name}: ${r.metres} m (${r.dimension}). Ratio: ${ratio.toFixed(2)}×.\n${p.note}\n${r.note}`,sources:[p.measurementSource,r.measurementSource,p.source,r.source]}));
const practice=questions.slice(0,100),daily=questions.slice(100,1000);if(daily.length!==900)throw new Error('Not enough diverse photo comparisons');
await writeFile('src/trivia/how-much-ish.json',JSON.stringify(practice)+'\n');
const path='supabase/migrations/044_photo_size_catalog.sql';try{await access(path);throw new Error('Photo migration already exists; never rewrite an installed catalog.');}catch(e){if(e.code!=='ENOENT')throw e;}
const quote=v=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
let sql='-- Actual photo alpha silhouettes; old attempts keep their original packs.\nBEGIN;\n';
for(let slot=0;slot<180;slot++)sql+=`INSERT INTO ledger_private.trivia_packs(game,slot,version,questions) VALUES('how-much-ish',${slot},7,${quote(daily.slice(slot*5,slot*5+5))});\n`;
for(let slot=1;slot<=10;slot++)sql+=`UPDATE ledger_private.game_starter_packs SET questions=${quote(practice.slice((slot-1)*5,slot*5))} WHERE game='how-much-ish' AND slot=${slot};\n`;
sql+=`CREATE FUNCTION ledger_private.photo_size_catalog_version() RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT 1;$$;\nCREATE OR REPLACE FUNCTION public.utilities_trivia_capabilities() RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$ SELECT jsonb_build_object('version',6,'games',7,'groups',true,'size_objects',${objects.length},'online_sync',true,'online_seed',1,'archive',true,'grid_puzzles',true,'photo_silhouettes',true);$$;\nCOMMIT;\n`;
await writeFile(path,sql);console.log(objects.length+' photographic silhouettes; 180 daily boards; 10 starter boards; '+all.length+' remaining candidates.');
