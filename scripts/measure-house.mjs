import {chromium} from '@playwright/test';
import {existsSync,mkdirSync,readFileSync,readdirSync,statSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {gzipSync} from 'node:zlib';
const cache=homedir()+'/.cache/ms-playwright';
const localBrowser=existsSync(cache)?readdirSync(cache).filter(p=>p.startsWith('chromium-')).sort().reverse().map(p=>`${cache}/${p}/chrome-linux64/chrome`).find(existsSync):undefined;
const baseURL=process.env.HOUSE_URL||'http://127.0.0.1:4191';
const width=Number(process.env.HOUSE_WIDTH||390),height=Number(process.env.HOUSE_HEIGHT||844),cpu=Number(process.env.HOUSE_CPU_RATE||4);
if(!Number.isFinite(width)||!Number.isFinite(height)||!Number.isFinite(cpu)||width<200||height<200||cpu<1)throw new Error('Use a viewport of at least 200px and a CPU throttle of at least 1.');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||localBrowser,args:['--enable-unsafe-swiftshader']});
try {
const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:width<700?2:1,isMobile:width<700,hasTouch:width<700,colorScheme:'dark'});
const page=await context.newPage(),cdp=await context.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate',{rate:cpu});
await page.addInitScript(()=>{localStorage.setItem('household-person','michal');localStorage.setItem('household-theme','dark');});
const diag=()=>page.evaluate(()=>window.__houseDiagnostics());
const report={environment:{browser:'Chromium with SwiftShader enabled; actual renderer recorded below',width,height,cpuThrottle:cpu,baseURL},scenes:{}};
const entryURL=new URL(baseURL);entryURL.hash='events';await page.goto(entryURL.href);await page.locator('#event-new').waitFor();
await page.waitForFunction(()=>document.querySelector('#event-new')?.disabled===false);
await page.waitForTimeout(300);
report.directFeature={loaded:(await diag()).loaded,canvasCount:await page.locator('canvas.stage-canvas').count(),scrollY:await page.evaluate(()=>scrollY)};
await page.locator('[data-ledger=home]').click();await page.waitForFunction(()=>document.querySelector('#house-stage')?.dataset.ready==='true');
for(const section of ['home','utilities','events']){
 if(section!=='home'){await page.locator('.stage-canvas').focus();for(let i=0;i<(section==='events'?2:1);i++){await page.keyboard.press('ArrowLeft');await page.waitForFunction(()=>!window.__houseDiagnostics().transitioning);}}
 await page.waitForTimeout(3000);
 const sample=await page.evaluate(async()=>{const start=performance.now(),before=window.__houseDiagnostics().frames;await new Promise(resolve=>setTimeout(resolve,4000));const after=window.__houseDiagnostics();return {fps:Number(((after.frames-before)*1000/(performance.now()-start)).toFixed(1)),pixelRatio:after.pixelRatio,calls:after.calls,triangles:after.triangles,geometries:after.geometries,renderer:after.renderer};});
 report.scenes[section]=sample;
}
await page.mouse.move(width*.7,height*.6);await page.mouse.down();
report.pointerBurst=await page.evaluate(()=>{const x=innerWidth*.7,y=innerHeight*.6,start=performance.now(),before=window.__houseDiagnostics().frames;for(let i=1;i<=24;i++)window.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,buttons:1,clientX:x-i*5,clientY:y}));return {events:24,synchronousDraws:window.__houseDiagnostics().frames-before,handlerMs:performance.now()-start};});
await page.mouse.up();await page.waitForFunction(()=>!window.__houseDiagnostics().transitioning);
await page.evaluate(()=>{const link=document.querySelector('[data-ledger=chores]');link.addEventListener('click',()=>{const start=performance.now();function sample(){const main=document.querySelector('#main'),rect=document.querySelector('#feature-area').getBoundingClientRect();if(rect.top<=1&&!document.querySelector('#feature-area').hidden&&window.__houseJump?.visibleMs==null)window.__houseJump={visibleMs:performance.now()-start};if(main.getAttribute('aria-busy')==='false'){window.__houseJump={...window.__houseJump,readyMs:performance.now()-start};}else requestAnimationFrame(sample);}requestAnimationFrame(sample);},{once:true});});
await page.locator('[data-ledger=chores]').click();await page.waitForFunction(()=>window.__houseJump?.readyMs!=null);
report.shortcutMs=await page.evaluate(()=>window.__houseJump);
await page.waitForFunction(()=>window.__houseDiagnostics().active===false);
const before=(await diag()).frames;await page.waitForTimeout(1200);report.offscreenFrameDelta=(await diag()).frames-before;
const chunks=readdirSync('dist').filter(p=>p.endsWith('.js')).sort((a,b)=>statSync('dist/'+b).size-statSync('dist/'+a).size);
report.lazySceneChunk={file:chunks[0],bytes:statSync('dist/'+chunks[0]).size,gzipBytes:gzipSync(readFileSync('dist/'+chunks[0])).length};
mkdirSync('.local/house-review',{recursive:true});writeFileSync('.local/house-review/performance-latest.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
} finally {await browser.close();}
