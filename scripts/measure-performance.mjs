import {chromium} from '@playwright/test';
import {readFile,readdir} from 'node:fs/promises';
import {existsSync,readdirSync} from 'node:fs';
import {homedir} from 'node:os';
import {gzipSync} from 'node:zlib';
const base=process.argv[2]||'http://127.0.0.1:4175';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw new Error('Measure against an isolated local server.');
const cache=homedir()+'/.cache/ms-playwright';
const executablePath=process.env.CHROMIUM_EXECUTABLE||(existsSync(cache)?readdirSync(cache).filter(p=>p.startsWith('chromium-')).sort().reverse().map(p=>`${cache}/${p}/chrome-linux64/chrome`).find(existsSync):undefined);
const browser=await chromium.launch({executablePath});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),cdp=await page.context().newCDPSession(page);
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});await cdp.send('Network.enable');
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:100,downloadThroughput:750000,uploadThroughput:375000});
 const requests=[];page.on('request',r=>requests.push(new URL(r.url()).pathname));
 let started=Date.now();await page.goto(base);await page.locator('#connection-status').filter({hasText:'up to date'}).waitFor();
 const initialReadyMs=Date.now()-started;await page.waitForTimeout(300);const initialRequests=[...requests];requests.length=0;
 started=Date.now();await page.locator('[data-ledger=chores]').click();await page.locator('#chores-status').filter({hasText:'up to date'}).waitFor();
 const choreTabReadyMs=Date.now()-started,assets=[];
 for(const file of await readdir('dist'))if(/\.(js|css)$/.test(file)){const data=await readFile('dist/'+file);assets.push({file,bytes:data.length,gzip:gzipSync(data).length});}
 const initialJS=assets.filter(a=>a.file.endsWith('.js')&&initialRequests.includes('/'+a.file)).reduce((s,a)=>s+a.bytes,0);
 console.log(JSON.stringify({conditions:'390x844, 4x CPU, 100ms latency, 750KB/s download; isolated local DB',initialReadyMs,choreTabReadyMs,initialJS,initialRequests,tabRequests:requests,assets},null,2));
}finally{await browser.close();}
