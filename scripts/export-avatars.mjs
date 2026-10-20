// Rebuild optimized, finished assets from approved artwork and the shared rig.
// The server exposes only these three authoring directories, never headshots.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,readdir,unlink} from 'node:fs/promises';
import {existsSync,readdirSync} from 'node:fs';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import {chromium} from '@playwright/test';
import {build} from 'esbuild';
import {validateAvatarAssets} from './avatar-assets.mjs';
async function exportMotion(manifest){
 const bundle=await build({entryPoints:['src/avatars/index.ts'],bundle:true,format:'esm',minify:true,target:'es2022',write:false});
 const bytes=Buffer.from(bundle.outputFiles[0].contents),sha256=createHash('sha256').update(bytes).digest('hex');
 manifest.module=`motion-${sha256.slice(0,12)}.js`;manifest.files[manifest.module]={bytes:bytes.length,sha256};
 await writeFile(`public/avatars/v1/${manifest.module}`,bytes);
}
// Runtime optimizations can be exported without regenerating approved artwork.
if(process.argv.includes('--motion-only')){
 const manifest=await validateAvatarAssets(),previous=manifest.module;
 delete manifest.files[previous];await exportMotion(manifest);
 await writeFile('public/avatars/v1/manifest.json',JSON.stringify(manifest,null,2)+'\n');
 if(previous!==manifest.module)await unlink(`public/avatars/v1/${previous}`);
 console.log('Updated avatar motion module; approved images unchanged.');process.exit(0);
}
const members=['michal','rina','ohm','rohil'];
const out='public/avatars/v1';await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{
 const p=new URL(req.url,'http://localhost').pathname;
 if(p==='/'){res.writeHead(200,{'Content-Type':'text/html'});return res.end('<!doctype html><body></body>');}
 if(!/^\/(?:assets\/avatars\/masters\/[a-z-]+\.png|src\/avatars\/[a-z-]+\.mjs)$/.test(p))throw new Error('Not allowed');
 res.writeHead(200,{'Content-Type':p.endsWith('.png')?'image/png':'text/javascript'});res.end(await readFile('.'+p));
 }catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const cache=homedir()+'/.cache/ms-playwright';
const executablePath=process.env.CHROMIUM_EXECUTABLE||(existsSync(cache)?readdirSync(cache).filter(p=>p.startsWith('chromium-')).sort().reverse().map(p=>`${cache}/${p}/chrome-linux64/chrome`).find(existsSync):undefined);
const browser=await chromium.launch({headless:true,executablePath});
const manifest={version:1,style:'Slightly detailed Mii-inspired floating heads',default:'approved smiling portrait',temperature:{min:-100,neutral:0,max:100},characters:{},files:{}};
const catalog={};
try{
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 for(const member of members){
  const assets=await page.evaluate(async member=>{
   const {AvatarRenderer}=await import('/src/avatars/renderer.mjs');const {moodFromValue}=await import('/src/avatars/mood.mjs');
   const load=src=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=src;});
   const [happy,base]=await Promise.all(['happy','faceplate'].map(kind=>load(`/assets/avatars/masters/${member}-${kind}.png`)));
   const canvas=document.createElement('canvas');document.body.append(canvas);
   const result={};
   const save=(key,size)=>{result[key]={size,data:canvas.toDataURL('image/webp',.93).split(',')[1]};};
   // Use alpha bounds only to trim transparent padding from small happy portraits.
   canvas.width=happy.width;canvas.height=happy.height;let ctx=canvas.getContext('2d');ctx.drawImage(happy,0,0);
   const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let x0=canvas.width,y0=canvas.height,x1=0,y1=0;
   for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(pixels[(y*canvas.width+x)*4+3]>32){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
   const side=Math.max(x1-x0,y1-y0)*1.08,cx=(x0+x1)/2,cy=(y0+y1)/2;
   for(const size of [128,256,512]){canvas.width=size;canvas.height=size;ctx=canvas.getContext('2d');ctx.drawImage(happy,cx-side/2,cy-side/2,side,side,0,0,size,size);save(`happy${size}`,size);}
   canvas.width=512;canvas.height=512;ctx=canvas.getContext('2d');ctx.drawImage(base,0,0,512,512);save('faceplate',512);
   canvas.style.width='256px';canvas.style.height='256px';
   const renderer=new AvatarRenderer(canvas,null,base,happy,member);
   for(const [key,value] of Object.entries({neutral:0,annoyed:-40,angry:-100,grateful:45,loving:100})){
    renderer.draw(moodFromValue(value),{steam:true,hearts:true,blush:true},{animate:false});save(key,256);
   }
   canvas.remove();return result;
  },member);
  const entry={name:member[0].toUpperCase()+member.slice(1)};
  for(const [key,{size,data}] of Object.entries(assets)){
   const bytes=Buffer.from(data,'base64'),sha256=createHash('sha256').update(bytes).digest('hex');
   const filename=`${member}-${key}-${sha256.slice(0,12)}.webp`;await writeFile(`${out}/${filename}`,bytes);
   entry[key]=filename;manifest.files[filename]={bytes:bytes.length,sha256,width:size,height:size};
  }
  manifest.characters[member]=entry;catalog[member]=entry;
 }
 await writeFile('src/avatars/catalog.ts',`// Generated by scripts/export-avatars.mjs from the approved asset manifest.\nexport const AVATAR_ASSETS = ${JSON.stringify(catalog,null,2)} as const;\nexport type AvatarMember = keyof typeof AVATAR_ASSETS;\n`);
 await exportMotion(manifest);
 await writeFile(`${out}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
 // Remove only previously exported files with this tool's exact naming scheme.
 for(const file of await readdir(out))if(/^(?:(?:michal|rina|ohm|rohil)-[a-z0-9]+-[a-f0-9]{12}\.webp|motion-[a-f0-9]{12}\.js)$/.test(file)&&!manifest.files[file])await unlink(`${out}/${file}`);
 console.log(`Exported ${Object.keys(manifest.files).length} assets; ${Math.round(Object.values(manifest.files).reduce((s,f)=>s+f.bytes,0)/1024)} KiB total.`);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
