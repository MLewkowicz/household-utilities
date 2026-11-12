import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {fetchCatalog,buildRelease,atomicJSON,readJSON} from './online/catalog.mjs';

// Produces a candidate only. Publishing to a database is a separate, explicit command.
const args=process.argv.slice(2),offline=args.includes('--offline');
if(args.some(a=>!['--offline'].includes(a)))throw new Error('Usage: npm run games:sync [-- --offline]');
const root=new URL('../../',import.meta.url),out=pathToFileURL(resolve('.local/game-sync')+'/');
// Short-lived response cache reduces upstream work while iterating on content.
async function cachedFetch(url,options){
 const path=new URL(`.local/game-sync-cache/${createHash('sha256').update(String(url)).digest('hex')}.json`,root);
 try{const cached=await readJSON(path);if(Date.now()-cached.at<6*60*60*1000)return Response.json(cached.data);}catch{}
 const response=await fetch(url,options);
 if(response.ok){const data=await response.clone().json();if(data.entities&&!data.error)await atomicJSON(path,{at:Date.now(),data});}
 return response;
}
try{
 const seeds=await readJSON(new URL('online/seeds.json',import.meta.url));
 const catalog=offline?await readJSON(new URL('online/catalog.json',import.meta.url)):await fetchCatalog(seeds,{onProgress:console.log,fetcher:cachedFetch});
 const built=buildRelease(catalog,await readJSON(new URL('src/geography-data.json',root)));
 await mkdir(out,{recursive:true});
 await atomicJSON(new URL('catalog.json',out),catalog);
 await atomicJSON(new URL('release.json',out),built.release);
 await atomicJSON(new URL('report.json',out),built.summary);
 for(const [game,bank] of Object.entries(built.practice))await atomicJSON(new URL(`${game}.json`,out),bank);
 await writeFile(new URL('README.txt',out),`Validated Wikidata catalog candidate\n${JSON.stringify(built.summary,null,2)}\n\nExisting attempts and catalogs have not been changed.\nInstall with: npm run games:sync:install -- .local/game-sync/release.json\nThat command requires SUPABASE_URL and SUPABASE_SECRET_KEY and writes only through the service-role catalog import RPC.\n`);
 console.log(JSON.stringify(built.summary,null,2));console.log('Candidate saved to .local/game-sync/. No database writes.');
}catch(error){console.error(error.message);process.exitCode=1;}
