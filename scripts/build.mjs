import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, copyFile, readdir, rm, readFile, writeFile, rename } from 'node:fs/promises';
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
// Pages caches assets independently of HTML. Give each asset version its own URL
// so a new page cannot reuse scripts or styles from an earlier deployment.
let html = await readFile('dist/index.html', 'utf8');
for (const file of ['app.js', 'style.css', 'config.js']) {
  const hash = createHash('sha256').update(await readFile(`dist/${file}`)).digest('hex').slice(0, 12);
  const versioned = file.replace(/(\.[^.]+)$/, `-${hash}$1`);
  await rename(`dist/${file}`, `dist/${versioned}`);
  html = html.replaceAll(`./${file}`, `./${versioned}`);
}
await writeFile('dist/index.html', html);
await copyFile('data/ledger.json','dist/ledger.json');
await copyFile('data/misc-ledger.json','dist/misc-ledger.json');
await copyFile('data/chores.json','dist/chores.json');
await writeFile('dist/.nojekyll','');
console.log('Built dashboard assets.');
