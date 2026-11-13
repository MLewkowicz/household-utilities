import {createHash} from 'node:crypto';
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

export const releaseAssetName=/^(?:(?:app|chunk)-[A-Z0-9]{8}\.js|config-[a-f0-9]{12}\.js|(?:style|events-refresh|house-entry|games)-[a-f0-9]{12}\.css)$/;
const manifestName='release-assets.json',retention=30*86400000;
const digest=data=>createHash('sha256').update(data).digest('hex');
const metadata=(data,now)=>({sha256:digest(data),bytes:data.length,lastCurrentAt:new Date(now).toISOString()});
async function saveManifest(directory,files){await writeFile(join(directory,manifestName),JSON.stringify({version:1,files},null,2)+'\n');}
export async function createReleaseManifest(directory,now=Date.now()){
 const files={};for(const name of (await readdir(directory)).sort())if(releaseAssetName.test(name))files[name]=metadata(await readFile(join(directory,name)),now);
 await saveManifest(directory,files);return files;
}
function validateManifest(value){
 if(value?.version!==1||!value.files||typeof value.files!=='object'||Array.isArray(value.files))throw new Error('Invalid published asset manifest');
 for(const [name,info] of Object.entries(value.files))if(!releaseAssetName.test(name)||!/^[a-f0-9]{64}$/.test(info.sha256)||!Number.isSafeInteger(info.bytes)||info.bytes<0||!Number.isFinite(Date.parse(info.lastCurrentAt)))throw new Error('Invalid published asset metadata');
 return value.files;
}
async function response(url){return fetch(url,{cache:'no-store',signal:AbortSignal.timeout(30000)});}
async function bytes(url){const r=await response(url);if(!r.ok)throw new Error(`Could not retain released asset (${r.status}): ${new URL(url).pathname}`);return Buffer.from(await r.arrayBuffer());}

/** Keep immutable modules/styles for tabs opened before deployment. Never replace current HTML, data, config, or service-worker URLs. */
export async function retainReleaseAssets(directory,base,{now=Date.now()}={}){
 const current=validateManifest(JSON.parse(await readFile(join(directory,manifestName),'utf8'))),files={...current};let retained=0;
 const previousResponse=await response(new URL(manifestName+'?release-check='+now,base));
 let previous={},bootstrap=false,existingSite=true;
 if(previousResponse.ok)previous=validateManifest(await previousResponse.json());
 else if(previousResponse.status===404){
  bootstrap=true;
  const htmlResponse=await response(new URL('?release-check='+now,base));
  if(htmlResponse.status===404)existingSite=false;
  else{
   if(!htmlResponse.ok)throw new Error('Could not read the previous release');
   const html=await htmlResponse.text(),pending=[...html.matchAll(/(?:src|href)=["']\.\/([^"']+)["']/g)].map(m=>m[1]).filter(n=>releaseAssetName.test(n)),seen=new Set();
   while(pending.length){
    const name=pending.pop();if(seen.has(name))continue;seen.add(name);
    const data=await bytes(new URL(name,base));previous[name]=metadata(data,now);
    if(!current[name]){await writeFile(join(directory,name),data);retained++;}
    else if(current[name].sha256!==digest(data))throw new Error('Released asset name collision');
    if(name.endsWith('.js'))for(const match of data.toString().matchAll(/["']\.\/((?:app|chunk)-[A-Z0-9]{8}\.js)["']/g))pending.push(match[1]);
   }
  }
 }else throw new Error(`Could not read released asset manifest (${previousResponse.status})`);
 const entries=Object.entries(previous).filter(([,info])=>Date.parse(info.lastCurrentAt)>=now-retention);let index=0;
 await Promise.all(Array.from({length:6},async()=>{for(;;){
  const entry=entries[index++];if(!entry)return;const [name,info]=entry;
  if(current[name]){if(current[name].sha256!==info.sha256)throw new Error('Released asset name collision');continue;}
  if(!bootstrap){const data=await bytes(new URL(name,base));if(data.length!==info.bytes||digest(data)!==info.sha256)throw new Error(`Released asset checksum mismatch: ${name}`);await writeFile(join(directory,name),data);retained++;}
  files[name]=info;
 }}));
 await saveManifest(directory,files);return {retained,bootstrap,existingSite};
}
/** One-time recovery from previously published Pages artifacts, before retention existed. */
export async function seedReleaseAssets(directory,seeds,now=Date.now()){
 const files=validateManifest(JSON.parse(await readFile(join(directory,manifestName),'utf8')));let added=0;
 for(const seed of seeds)for(const name of (await readdir(seed)).sort())if(releaseAssetName.test(name)){
  const data=await readFile(join(seed,name));
  if(files[name]){if(files[name].sha256!==digest(data))throw new Error('Archived asset name collision');continue;}
  await writeFile(join(directory,name),data);files[name]=metadata(data,now);added++;
 }
 await saveManifest(directory,files);return added;
}
