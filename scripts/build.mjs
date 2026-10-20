import { build } from 'esbuild';
import { mkdir, copyFile, readdir, rm, readFile, writeFile } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
for (const file of await readdir('public')) {
  if (!/\.(html|css|svg|txt)$/.test(file) && file !== '_headers') throw new Error(`Unexpected public file: ${file}`);
  await copyFile(`public/${file}`, `dist/${file}`);
}
await build({ entryPoints: ['src/app.ts'], bundle: true, outfile: 'dist/app.js', minify: true, target: 'es2022' });
const config = JSON.parse(await readFile('config.public.json','utf8'));
if (!config.key.startsWith('sb_publishable_')) throw new Error('Only a Supabase publishable key may enter the frontend.');
if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(config.url)) throw new Error('Invalid Supabase project URL.');
await writeFile('dist/config.js', `window.UTILITIES_CONFIG = ${JSON.stringify({url:config.url,key:config.key})};\n`);
await copyFile('data/ledger.json','dist/ledger.json');
await copyFile('data/misc-ledger.json','dist/misc-ledger.json');
await writeFile('dist/.nojekyll','');
console.log('Built dashboard assets.');
