import {readFile} from 'node:fs/promises';
import {validateRelease} from './online/catalog.mjs';

// Deliberately does not load .env.local: an install must receive explicit credentials.
try{
 const [file,...extra]=process.argv.slice(2);
 if(!file||extra.length)throw new Error('Usage: npm run games:sync:install -- path/to/release.json');
 const p=JSON.parse(await readFile(file,'utf8'));validateRelease(p);
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;
 if(!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url||''))throw new Error('Set SUPABASE_URL to the target Supabase project.');
 if(!/^(sb_secret_|eyJ)/.test(key||''))throw new Error('Set SUPABASE_SECRET_KEY to a service-role/secret key.');
 const headers={'Content-Type':'application/json',apikey:key};
 if(key.startsWith('eyJ'))headers.Authorization=`Bearer ${key}`;
 const response=await fetch(`${url}/rest/v1/rpc/utilities_trivia_import`,{method:'POST',headers,body:JSON.stringify({p}),signal:AbortSignal.timeout(60000)});
 if(!response.ok)throw new Error(`Catalog install failed (HTTP ${response.status}). Check migration 040 and service-role credentials; the prior catalog remains active.`);
 const result=await response.json();
 if(!Number.isInteger(result.version)||typeof result.changed!=='boolean')throw new Error('Unexpected install response. Retry safely to confirm the result.');
 console.log(result.changed?`Installed catalog v${result.version}: ${result.packs} daily packs. Existing attempts retain their questions.`:`Catalog v${result.version} is already installed; no changes.`);
}catch(error){console.error(error.message);process.exitCode=1;}
