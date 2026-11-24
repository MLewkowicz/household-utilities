import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {fetchCatalog,buildRelease,atomicJSON,readJSON} from './online/catalog.mjs';

// Produces a candidate only. Publishing to a database is a separate, explicit command.
const args=process.argv.slice(2),offline=args.includes('--offline');
if(args.some(a=>!['--offline'].includes(a)))throw new Error('Usage: npm run games:sync [-- --offline]');
const root=new URL('../../',import.meta.url),out=pathToFileURL(resolve('.local/game-sync')+'/');
const diagnostics={lastCompletedBatch:null,requests:[]};
try{
 await rm(new URL('failure.json',out),{force:true});
 const snapshot=await readJSON(new URL('online/catalog.json',import.meta.url));
 const catalog=offline?snapshot:await fetchCatalog(snapshot,{deadline:Date.now()+8*60_000,
  onProgress(message){diagnostics.lastCompletedBatch=message;console.log(message);},
  onRequest(detail){diagnostics.requests.push(detail);console.log(JSON.stringify(detail));}});
 const built=buildRelease(catalog,await readJSON(new URL('src/geography-data.json',root)));
 await mkdir(out,{recursive:true});
 await atomicJSON(new URL('catalog.json',out),catalog);
 await atomicJSON(new URL('release.json',out),built.release);
 await atomicJSON(new URL('report.json',out),{...built.summary,mode:offline?'offline':'live',...diagnostics});
 for(const [game,bank] of Object.entries(built.practice))await atomicJSON(new URL(`${game}.json`,out),bank);
 await writeFile(new URL('README.txt',out),`Validated household editorial catalog candidate\n${JSON.stringify(built.summary,null,2)}\n\nExisting attempts and catalogs have not been changed.\nInstall with: npm run games:sync:install -- .local/game-sync/release.json\nThat command requires SUPABASE_URL and SUPABASE_SECRET_KEY and writes only through the service-role catalog import RPC.\n`);
 console.log(JSON.stringify(built.summary,null,2));console.log('Candidate saved to .local/game-sync/. No database writes.');
}catch(error){await atomicJSON(new URL('failure.json',out),{...diagnostics,error:error.message});console.error(error.message);process.exitCode=1;}
