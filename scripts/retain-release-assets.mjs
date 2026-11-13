import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {retainReleaseAssets,seedReleaseAssets} from './release-assets.mjs';
const args=process.argv.slice(2),value=flag=>args[args.indexOf(flag)+1];
if(!args.includes('--from'))throw new Error('Provide --from with the published site URL');
const base=new URL(value('--from'));if(base.protocol!=='https:'||base.username||base.password)throw new Error('Expected a public HTTPS site URL');
const result=await retainReleaseAssets('dist',base);
if(result.bootstrap&&result.existingSite&&args.includes('--bootstrap-archives')){
 const gh=parameters=>execFileSync('gh',parameters,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const repo=process.env.GITHUB_REPOSITORY||gh(['repo','view','--json','nameWithOwner','--jq','.nameWithOwner']);
 const runs=JSON.parse(gh(['run','list','--repo',repo,'--workflow','pages.yml','--status','success','--limit','3','--json','databaseId']));
 const temporary=await mkdtemp(join(tmpdir(),'household-releases-'));let recovered=0;
 try{
  for(const run of runs){
   const artifacts=JSON.parse(gh(['api',`repos/${repo}/actions/runs/${run.databaseId}/artifacts`]));
   if(!artifacts.artifacts.some(a=>a.name==='github-pages'&&!a.expired))continue;
   const destination=join(temporary,String(run.databaseId));await mkdir(destination);
   gh(['run','download',String(run.databaseId),'--repo',repo,'--name','github-pages','--dir',destination]);
   const extracted=join(destination,'modules');
   execFileSync('python3',[fileURLToPath(new URL('./extract-release-assets.py',import.meta.url)),join(destination,'artifact.tar'),extracted],{stdio:'inherit'});
   recovered+=await seedReleaseAssets('dist',[extracted]);
  }
 }finally{await rm(temporary,{recursive:true,force:true});}
 console.log(`Recovered ${recovered} immutable assets from previous deployments.`);
}
console.log(`Retained ${result.retained} released modules/styles for existing tabs (30 days).`);
