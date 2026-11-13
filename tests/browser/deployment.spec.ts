import {setTheme} from './settings';
import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile,mkdtemp,mkdir,writeFile,rm } from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createReleaseManifest,retainReleaseAssets} from '../../scripts/release-assets.mjs';
import type { AddressInfo } from 'node:net';

test('an open tab can load an old lazy module after deployment without losing an unsaved draft',async({page,context})=>{
 const root=await mkdtemp(join(tmpdir(),'open-tab-release-')),old=join(root,'old'),next=join(root,'next');await mkdir(old);await mkdir(next);let directory=old;const requests:string[]=[];
 const html=(entry:string)=>`<input aria-label="Draft"><button>Open section</button><output></output><script type="module" src="./${entry}"></script>`;
 await writeFile(join(old,'index.html'),html('app-AAAAAAAA.js'));await writeFile(join(old,'app-AAAAAAAA.js'),'document.querySelector("button").onclick=async()=>{const m=await import("./chunk-BBBBBBBB.js");document.querySelector("output").textContent=m.value;}');await writeFile(join(old,'chunk-BBBBBBBB.js'),'export {value} from "./chunk-CCCCCCCC.js"');await writeFile(join(old,'chunk-CCCCCCCC.js'),'export const value="old section loaded"');await createReleaseManifest(old);
 await writeFile(join(next,'index.html'),html('app-DDDDDDDD.js'));await writeFile(join(next,'app-DDDDDDDD.js'),'document.querySelector("output").textContent="new release";');await createReleaseManifest(next);
 const server=createServer(async(req,res)=>{const name=new URL(req.url!,'http://localhost').pathname.slice(1)||'index.html';requests.push(name);try{const data=await readFile(join(directory,name));res.writeHead(200,{'content-type':name.endsWith('.js')?'application/javascript':name.endsWith('.json')?'application/json':'text/html','cache-control':name.endsWith('.js')?'max-age=600':'no-store'});res.end(data);}catch{res.writeHead(404);res.end();}});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const base=new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`);
 try{
  await page.goto(String(base));await page.getByRole('textbox',{name:'Draft'}).fill('Keep this unsaved draft');
  expect(requests).not.toContain('chunk-BBBBBBBB.js');await retainReleaseAssets(next,base);directory=next;requests.length=0;
  await page.getByRole('button',{name:'Open section'}).click();await expect(page.locator('output')).toHaveText('old section loaded');await expect(page.getByRole('textbox',{name:'Draft'})).toHaveValue('Keep this unsaved draft');expect(requests).toContain('chunk-BBBBBBBB.js');expect(requests).toContain('chunk-CCCCCCCC.js');expect(requests).not.toContain('index.html');
  const fresh=await context.newPage();await fresh.goto(String(base));await expect(fresh.locator('output')).toHaveText('new release');await fresh.close();
 }finally{await page.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true});}
});

test('a failed dynamic import offers Reload and recovers after the missing file is restored',async({page})=>{
 const html=await readFile('dist/index.html','utf8'),routes=JSON.parse(/const routes=(\{.*?\}),loaded=/.exec(html)![1]),module=routes.events[0].slice(2);
 await page.route(`**/${module}`,route=>route.fulfill({status:404,contentType:'text/html',body:'Not found'}));
 await page.goto('/?webgl=0#events');await expect(page.locator('#toast')).toContainText('Reload the site');await expect(page.locator('#toast').getByRole('button',{name:'Retry'})).toHaveCount(0);
 await page.unroute(`**/${module}`);await page.locator('#toast').getByRole('button',{name:'Reload',exact:true}).click();await expect(page.locator('#events-status')).toHaveText('Up to date');await expect(page.locator('#main')).toHaveAttribute('aria-busy','false');
});

test('a returning visitor gets working navigation and themes after a deployment', async ({ page }) => {
  const html = await readFile('dist/index.html', 'utf8');
  let updated = false;
  const assetRequests: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const server = createServer(async (req, res) => {
    const path = new URL(req.url!, 'http://localhost').pathname;
    try {
      if (path === '/') {
        res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
        return res.end(updated ? html : `<!doctype html><html><head>
          <link rel="stylesheet" href="./style.css"><script src="./app.js" defer></script>
          </head><body><h1>Earlier dashboard</h1></body></html>`);
      }
      if (path.startsWith('/rest/v1/rpc/')) {
        const file = path.endsWith('/utilities_bulletin_dashboard') ? 'bulletin' : path.endsWith('/utilities_chores_dashboard') ? 'chores' : path.endsWith('/utilities_misc_dashboard') ? 'misc-ledger' :
          path.endsWith('/utilities_dashboard') ? 'ledger' : null;
        if (!file) { res.writeHead(405); return res.end(); }
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        return res.end(await readFile(`data/${file}.json`));
      }
      assetRequests.push(path);
      // These assets stay fresh in the browser across the simulated deployment.
      // No Playwright routing is used, because routing disables the browser cache.
      if (path === '/app.js' || path === '/style.css') {
        res.writeHead(200, { 'content-type': path.endsWith('.js') ? 'application/javascript' : 'text/css', 'cache-control': 'public, max-age=3600' });
        return res.end(path.endsWith('.js') ? 'document.documentElement.dataset.earlierApp="loaded";' : 'html { background: tomato; }');
      }
      if (/^\/config-[a-f0-9]{12}\.js$/.test(path)) {
        res.writeHead(200, { 'content-type': 'application/javascript' });
        return res.end(`window.UTILITIES_CONFIG=${JSON.stringify({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, key: 'local-public' })};`);
      }
      if (!/^\/[a-zA-Z0-9.-]+$/.test(path)) { res.writeHead(404); return res.end(); }
      const contents = await readFile(`dist${path}`);
      res.writeHead(200, { 'content-type': path.endsWith('.js') ? 'application/javascript' : path.endsWith('.css') ? 'text/css' : 'image/svg+xml', 'cache-control': 'public, max-age=3600' });
      res.end(contents);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(url);
    await expect(page.locator('html')).toHaveAttribute('data-earlier-app', 'loaded');
    updated = true;
    await page.goto(`${url}/?deployment=next#miscellaneous`);
    await expect(page.locator('#misc-page')).toBeVisible();
    await expect(page.locator('#misc-status')).toHaveText('Shared purchases · up to date');
    await expect(page.locator('#utilities-page')).toBeHidden();
    expect(await page.locator('.house-navigation').evaluate(el => getComputedStyle(el).display)).toBe('grid');

    await setTheme(page,'light');
    const light = await page.locator('html').evaluate(el => getComputedStyle(el).backgroundColor);
    await setTheme(page,'dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect.poll(()=>page.locator('html').evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(light);
    await setTheme(page,'system');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.getByRole('link', { name: 'Utilities', exact: true }).click();
    await expect(page.locator('#utilities-page')).toBeVisible();
    await page.getByRole('link', { name: 'Expenses', exact: true }).click();
    await expect(page.locator('#misc-page')).toBeVisible();
    await page.getByRole('link', { name: 'To-dos', exact: true }).click();
    await expect(page.locator('#chores-page')).toBeVisible();
    await expect(page.locator('#chores-status')).toHaveText('Up to date');
    await page.getByRole('link', { name: 'Bulletin', exact: true }).click();
    await expect(page.locator('#bulletin-status')).toHaveText('Shared notes · up to date');
    expect(assetRequests.filter(path => path === '/app.js')).toHaveLength(1);
    expect(assetRequests.filter(path => path === '/style.css')).toHaveLength(1);
    expect(errors).toEqual([]);
  } finally {
    await page.close();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
