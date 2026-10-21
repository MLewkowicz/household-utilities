import { build, transform } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, copyFile, readdir, rm, readFile, writeFile, rename } from 'node:fs/promises';
import {copyAvatarAssets} from './avatar-assets.mjs';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
for (const file of await readdir('public')) {
  if(file==='avatars'){await copyAvatarAssets();continue;}
  if (!/\.(html|css|svg|txt)$/.test(file) && !['sw.js','manifest.webmanifest','icon-192.png','icon-512.png','_headers'].includes(file)) throw new Error(`Unexpected public file: ${file}`);
  await copyFile(`public/${file}`, `dist/${file}`);
}
const bundle = await build({ entryPoints: ['src/app.ts'], bundle: true, outdir: 'dist', format: 'esm', splitting: true, entryNames: '[name]-[hash]', chunkNames: 'chunk-[hash]', metafile: true, minify: true, target: 'es2022' });
await writeFile('dist/style.css',(await transform(await readFile('dist/style.css','utf8'),{loader:'css',minify:true,target:'es2022'})).code);
const config = JSON.parse(await readFile('config.public.json','utf8'));
if (!config.key.startsWith('sb_publishable_')) throw new Error('Only a Supabase publishable key may enter the frontend.');
if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(config.url)) throw new Error('Invalid Supabase project URL.');
await writeFile('dist/config.js', `window.UTILITIES_CONFIG = ${JSON.stringify({url:config.url,key:config.key})};\n`);
// Pages caches assets independently of HTML. Give each asset version its own URL
// so a new page cannot reuse scripts or styles from an earlier deployment.
let html = await readFile('dist/index.html', 'utf8');
const entry = Object.entries(bundle.metafile.outputs).find(([,info])=>info.entryPoint==='src/app.ts')[0].replace(/^dist\//,'');
html=html.replace('./app.js',`./${entry}`).replace('src="./'+entry+'" defer','src="./'+entry+'" type="module"');
// Preload just the requested route and its shared imports. This avoids a module
// waterfall without downloading any other section or expression artwork.
const preload={};
for(const [route,source] of Object.entries({utilities:'client',miscellaneous:'misc-client',chores:'chores-client',bulletin:'bulletin-client',events:'events-client'})){
 const start=Object.keys(bundle.metafile.outputs).find(path=>bundle.metafile.outputs[path].entryPoint===`src/${source}.ts`);
 const paths=new Set();
 function visit(path){if(!path||paths.has(path))return;paths.add(path);for(const item of bundle.metafile.outputs[path].imports)if(item.kind==='import-statement')visit(item.path);}
 visit(start);preload[route]=[...paths].map(path=>'./'+path.replace(/^dist\//,''));
}
html=html.replace('</head>',`<script>{const routes=${JSON.stringify(preload)},loaded=new Set();function preload(route){for(const href of routes[route]||routes.utilities){if(loaded.has(href))continue;loaded.add(href);const link=document.createElement('link');link.rel='modulepreload';link.href=href;document.head.append(link);}}preload(location.hash.slice(1));window.addEventListener('hashchange',()=>preload(location.hash.slice(1)));for(const event of ['pointerover','focusin','pointerdown'])document.addEventListener(event,e=>{const link=e.target.closest?.('[data-ledger]');if(link)preload(link.dataset.ledger);});}</script>\n</head>`);
for (const file of ['style.css', 'config.js']) {
  const hash = createHash('sha256').update(await readFile(`dist/${file}`)).digest('hex').slice(0, 12);
  const versioned = file.replace(/(\.[^.]+)$/, `-${hash}$1`);
  await rename(`dist/${file}`, `dist/${versioned}`);
  html = html.replaceAll(`./${file}`, `./${versioned}`);
}
await writeFile('dist/index.html', html);
await copyFile('data/ledger.json','dist/ledger.json');
await copyFile('data/misc-ledger.json','dist/misc-ledger.json');
await copyFile('data/chores.json','dist/chores.json');
await copyFile('data/bulletin.json','dist/bulletin.json');
await copyFile('data/events.json','dist/events.json');
await writeFile('dist/.nojekyll','');
console.log('Built dashboard assets.');
