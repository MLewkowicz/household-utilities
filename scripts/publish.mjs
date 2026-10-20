import {spawnSync} from 'node:child_process';
import {existsSync,readdirSync} from 'node:fs';
function run(cmd,args,options={}) {
 const r=spawnSync(cmd,args,{encoding:'utf8',stdio:options.capture?'pipe':'inherit',...options});
 if(r.status!==0)throw new Error(`${cmd} ${args[0]} failed${options.capture?': '+r.stderr:''}`);
 return r.stdout?.trim();
}
function succeeds(cmd,args){return spawnSync(cmd,args,{stdio:'ignore'}).status===0;}
run('npm',['run','check']);run('npm',['test']);
run('uv',['run','--frozen','python','-m','unittest','discover','-s','tests','-p','test_*.py']);
run('npm',['run','build']);run('uv',['run','--frozen','python','scripts/check_privacy.py']);
const user=JSON.parse(run('gh',['api','user'],{capture:true}));
const repo=`${user.login}/household-utilities`;
if(!existsSync('.git'))run('git',['init','-b','main']);
const files=['.gitignore','.github','README.md','HANDOFF.md','ROADMAP.md','docs','package.json','package-lock.json','pyproject.toml','uv.lock','tsconfig.json','playwright.config.ts','config.public.json','src','public','scripts','tests','supabase','data',...readdirSync('.').filter(f=>f.endsWith('.sh'))];
run('git',['add','--',...files]);
run('uv',['run','--frozen','python','scripts/check_privacy.py']);
if(!succeeds('git',['diff','--cached','--quiet'])) {
 run('git',['-c',`user.name=${user.login}`,'-c',`user.email=${user.id}+${user.login}@users.noreply.github.com`,'commit','-m','Build household utilities dashboard and private bill importer']);
}
if(!succeeds('gh',['repo','view',repo])) {
 run('gh',['repo','create',repo,'--public','--source','.','--remote','origin','--description','Shared utility ledger: GitHub Pages frontend, Supabase payments, and private PDF imports.']);
} else {
 if(!succeeds('git',['remote','get-url','origin']))run('git',['remote','add','origin',`https://github.com/${repo}.git`]);
 const origin=run('git',['remote','get-url','origin'],{capture:true});
 if(![ `https://github.com/${repo}.git`, `git@github.com:${repo}.git`, `https://github.com/${repo}`].includes(origin))throw new Error('Existing origin is a different repository; nothing pushed.');
}
run('gh',['auth','setup-git']);
if(!succeeds('gh',['api',`repos/${repo}/pages`]))run('gh',['api',`repos/${repo}/pages`,'--method','POST','-f','build_type=workflow']);
run('git',['push','-u','origin','main']);
console.log(`Publication queued. Site: https://${user.login.toLowerCase()}.github.io/household-utilities/`);
console.log(`Follow progress: gh run list --repo ${repo} --limit 3`);
