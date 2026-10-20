import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync,readdirSync} from 'node:fs';
import {homedir} from 'node:os';
const root='.local/avatar-pack-checks';await mkdir(root,{recursive:true});
const cache=homedir()+'/.cache/ms-playwright';
const executablePath=process.env.CHROMIUM_EXECUTABLE||(existsSync(cache)?readdirSync(cache).filter(p=>p.startsWith('chromium-')).sort().reverse().map(p=>`${cache}/${p}/chrome-linux64/chrome`).find(existsSync):undefined);
const browser=await chromium.launch({headless:true,executablePath});
const errors=[];const url=process.env.AVATAR_PREVIEW_URL||'http://127.0.0.1:4189';
try{
 const page=await browser.newPage({viewport:{width:1200,height:1700}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.waitForFunction(()=>window.avatarGallery?.ready);
 await page.screenshot({path:root+'/all-neutral.png',fullPage:true});
 assert.equal(await page.locator('.portrait img').count(),4);
 assert(await page.locator('img').evaluateAll(images=>images.every(i=>i.complete&&i.naturalWidth>0)));
 await page.evaluate(()=>window.avatarGallery.setTemperature(-100));await page.waitForTimeout(1900);
 let states=await page.evaluate(()=>Object.values(window.avatarGallery.controllers).map(c=>c.getState()));
 for(const s of states){assert(s.shown<-99);assert(s.steam>0&&s.steam<=160);assert(s.risingSteam>0&&s.risingSteam<=48);assert(s.lastParticleSamples.every(p=>p.side*p.vx>400));assert(s.lastRisingSamples.every(p=>p.vy<0));}
 await page.screenshot({path:root+'/all-angry.png',fullPage:true});
 await page.evaluate(()=>window.avatarGallery.setTemperature(100));await page.waitForTimeout(2000);
 states=await page.evaluate(()=>Object.values(window.avatarGallery.controllers).map(c=>c.getState()));
 for(const s of states){assert(s.shown>99);assert.equal(s.steam,0);assert.equal(s.risingSteam,0);assert(s.hearts>0);}
 await page.screenshot({path:root+'/all-loving.png',fullPage:true});
 await page.evaluate(()=>{for(const c of Object.values(window.avatarGallery.controllers))c.setEffects({hearts:false,steam:false});});
 assert((await page.evaluate(()=>Object.values(window.avatarGallery.controllers).map(c=>c.getState()))).every(s=>s.hearts===0&&s.steam===0&&s.risingSteam===0));
 await page.evaluate(()=>{for(const c of Object.values(window.avatarGallery.controllers)){c.setEffects({hearts:true,steam:true});for(let i=0;i<25;i++)c.setTemperature(i%2?-100:100);c.setTemperature(45);}});await page.waitForTimeout(1400);
 assert((await page.evaluate(()=>Object.values(window.avatarGallery.controllers).map(c=>c.getState()))).every(s=>Math.abs(s.shown-45)<.1));
 await page.screenshot({path:root+'/all-grateful.png',fullPage:true});
 await page.getByRole('button',{name:'Pause motion',exact:true}).click();
 const paused=await page.evaluate(()=>Object.values(window.avatarGallery.controllers).map(c=>c.getState().frames));await page.waitForTimeout(250);
 assert.deepEqual(await page.evaluate(()=>Object.values(window.avatarGallery.controllers).map(c=>c.getState().frames)),paused);
 await page.getByRole('button',{name:'Resume motion',exact:true}).click();
 // Suspension and teardown matter when avatars are used in long app lists.
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(200);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const hidden=await page.evaluate(()=>window.avatarGallery.controllers.rohil.getState());assert.equal(hidden.inView,false);await page.waitForTimeout(250);
 assert.equal(await page.evaluate(()=>window.avatarGallery.controllers.rohil.getState().frames),hidden.frames);
 await page.locator('#avatar-ohm').scrollIntoViewIfNeeded();await page.waitForTimeout(200);await page.evaluate(()=>window.avatarGallery.setTemperature(100,true));
 await page.screenshot({path:root+'/ohm-phone.png'});
 await page.evaluate(()=>{for(const c of Object.values(window.avatarGallery.controllers))c.destroy();});
 const stopped=await page.evaluate(()=>Object.values(window.avatarGallery.controllers).map(c=>c.getState().frames));await page.waitForTimeout(250);
 assert.deepEqual(await page.evaluate(()=>Object.values(window.avatarGallery.controllers).map(c=>c.getState().frames)),stopped);
 const reduced=await browser.newPage({viewport:{width:1200,height:1700},reducedMotion:'reduce'});reduced.on('pageerror',e=>errors.push(e.message));
 await reduced.goto(url);await reduced.waitForFunction(()=>window.avatarGallery?.ready);await reduced.waitForTimeout(100);
 await reduced.evaluate(()=>window.avatarGallery.setTemperature(-100));
 const frozen=await reduced.evaluate(()=>Object.values(window.avatarGallery.controllers).map(c=>c.getState()));await reduced.waitForTimeout(200);
 for(const s of frozen){assert.equal(s.shown,-100);assert(s.reducedMotion);}
 assert.deepEqual(await reduced.evaluate(()=>Object.values(window.avatarGallery.controllers).map(c=>c.getState().frames)),frozen.map(s=>s.frames));
 // A cancelled mount never starts an animation or attaches observers.
 assert(await reduced.evaluate(async()=>{const {mountAvatar}=await import('./avatars/v1/'+window.avatarGallery.manifest.module);const abort=new AbortController();abort.abort();try{await mountAvatar(document.createElement('canvas'),{member:'rina',signal:abort.signal});return false;}catch(e){return e.name==='AbortError';}}));
 assert.deepEqual(errors,[]);
 const report={passed:true,characters:states.map(s=>s.member),checks:['all portraits and expression images decode','ear jets and rising steam on every character','particles clear when mood reverses','effects toggle','rapid reversals settle','pause and resume','390px layout','offscreen suspension','destroy stops animation','reduced motion is static','cancelled mount'],errors};
 await writeFile(root+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
