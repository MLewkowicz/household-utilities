import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';

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
        const file = path.endsWith('/utilities_misc_dashboard') ? 'misc-ledger' :
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
    expect(await page.locator('.ledger-nav').evaluate(el => getComputedStyle(el).display)).toBe('flex');

    await page.getByLabel('Color theme').selectOption('light');
    const light = await page.locator('html').evaluate(el => getComputedStyle(el).backgroundColor);
    await page.getByLabel('Color theme').selectOption('dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await page.locator('html').evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(light);
    await page.getByLabel('Color theme').selectOption('system');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.getByRole('link', { name: 'Utilities', exact: true }).click();
    await expect(page.locator('#utilities-page')).toBeVisible();
    await page.getByRole('link', { name: 'Miscellaneous', exact: true }).click();
    await expect(page.locator('#misc-page')).toBeVisible();
    expect(assetRequests.filter(path => path === '/app.js')).toHaveLength(1);
    expect(assetRequests.filter(path => path === '/style.css')).toHaveLength(1);
    expect(errors).toEqual([]);
  } finally {
    await page.close();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
