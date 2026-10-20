import {test,expect,type Page} from '@playwright/test';
import {AVATAR_ASSETS} from '../../src/avatars/catalog';

test('approved smiles appear in identity, leaderboard and request tiles without loading animation',async({page})=>{
 const requests:string[]=[];page.on('request',request=>requests.push(request.url()));
 await page.setViewportSize({width:390,height:844});
 await page.goto('/#chores');
 await expect(page.locator('#chores-status')).toHaveText('Shared chores · up to date');
 for(const [member,asset] of Object.entries(AVATAR_ASSETS)){
  const image=page.locator(`[data-chore-person="${member}"] img`);
  await expect(image).toHaveAttribute('src',`./avatars/v1/${asset.happy128}`);
  await expect.poll(()=>image.evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth===128)).toBe(true);
 }
 await page.locator('[data-chore-person="michal"]').click();
 await page.locator('[data-chore-view="leaderboard"]').click();
 await expect(page.locator('.chore-score .avatar img')).toHaveCount(4);
 for(const image of await page.locator('.chore-score .avatar img').all())await expect.poll(()=>image.evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
 await page.screenshot({path:'.local/avatar-pack-checks/app-leaderboard-phone.png',fullPage:true});
 await page.locator('#chore-new').click();
 await expect(page.locator('#chore-assignee-fields .avatar img')).toHaveCount(4);
 expect(await page.locator('#chore-task-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 expect(requests.filter(url=>/\/avatars\/v1\/(?:motion-|.*-faceplate-)/.test(url))).toEqual([]);
 expect(requests.some(url=>url.includes('bitmoji_photos')||url.includes('/masters/'))).toBe(false);
});

async function mockedBoard(page:Page,count=16){
 const notes=Array.from({length:count},(_,i)=>({id:`avatar-note-${i}`,version:1,body:`Animation fixture ${i}`,temperature:i%2?-100:100,kind:i%2?'complaint':'compliment',recipients:['rina'],author:['rohil','michal','ohm','rina'][i%4],posted_at:'2026-10-20T16:00:00Z',created_at:'2026-10-20T16:00:00Z',deleted:false,actor:'rohil',action:'create'}));
 await page.route('**/utilities_bulletin_dashboard',route=>route.fulfill({json:{format_version:1,notes,history:[],stats:[],updated_at:'2026-10-20T16:00:00Z'}}));
 await page.addInitScript(()=>{
  const counts=new WeakMap<HTMLCanvasElement,number>();(window as any).avatarDraws=counts;
  const clear=CanvasRenderingContext2D.prototype.clearRect;
  CanvasRenderingContext2D.prototype.clearRect=function(...args){counts.set(this.canvas,(counts.get(this.canvas)||0)+1);return clear.apply(this,args);};
 });
 await page.goto('/#bulletin');await expect(page.locator('#bulletin-status')).toHaveText('Shared notes · up to date');
 await page.locator('[data-bulletin-person=michal]').click();
 const first=page.locator('[data-note-id="avatar-note-0"]');if(count)await first.scrollIntoViewIfNeeded();return first;
}

test('bulletin characters loop on a shared capped clock and stop when paused, hidden or offscreen',async({page})=>{
 const errors:string[]=[],requests:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 await page.setViewportSize({width:390,height:844});const first=await mockedBoard(page);
 await expect(first.locator('.bulletin-character')).toHaveClass(/has-character-canvas/);
 expect(await page.locator('.bulletin-note canvas').count()).toBeLessThan(16);
 const canvas=await first.locator('canvas').elementHandle();
 const frames=()=>canvas!.evaluate(el=>(window as any).avatarDraws.get(el)||0);
 await expect.poll(frames).toBeGreaterThan(5);
 const before=await frames(),started=Date.now();await page.waitForTimeout(650);
 expect((await frames()-before)/((Date.now()-started)/1000)).toBeLessThan(36);
 await page.getByRole('button',{name:'Pause character animations'}).click();
 await first.scrollIntoViewIfNeeded();await expect(first.locator('.bulletin-character')).toHaveClass(/has-character-canvas/);
 const pausedCanvas=await first.locator('canvas').elementHandle();
 const paused=await pausedCanvas!.evaluate(el=>(window as any).avatarDraws.get(el));await page.waitForTimeout(250);
 expect(await pausedCanvas!.evaluate(el=>(window as any).avatarDraws.get(el))).toBe(paused);
 await page.getByRole('button',{name:'Play character animations'}).click();await first.scrollIntoViewIfNeeded();
 await expect.poll(()=>first.locator('canvas').evaluate(el=>(window as any).avatarDraws.get(el))).toBeGreaterThan(3);
 await page.locator('[data-note-id="avatar-note-15"]').scrollIntoViewIfNeeded();await expect(first.locator('canvas')).toHaveCount(0);
 await page.getByRole('link',{name:'Utilities',exact:true}).click();await expect(page.locator('.bulletin-note canvas')).toHaveCount(0);
 await page.getByRole('link',{name:'Bulletin',exact:true}).click();await first.scrollIntoViewIfNeeded();await expect(first.locator('.bulletin-character')).toHaveClass(/has-character-canvas/);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
 await expect(page.locator('.bulletin-note canvas')).toHaveCount(0);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
 await expect(first.locator('.bulletin-character')).toHaveClass(/has-character-canvas/);
 const faceplates=requests.filter(url=>/-faceplate-.*\.webp/.test(url));expect(faceplates.length).toBe(new Set(faceplates).size);expect(faceplates.length).toBeLessThanOrEqual(4);
 expect(requests.some(url=>/\/masters\/|bitmoji_photos/.test(url))).toBe(false);expect(errors).toEqual([]);
});

test('reduced-motion notes stay still while the editor follows the original author and exact temperature',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});const first=await mockedBoard(page,2);
 await expect(first.locator('.bulletin-character')).toHaveClass(/has-character-canvas/);
 const frozen=await first.locator('canvas').evaluate(el=>(window as any).avatarDraws.get(el));await page.waitForTimeout(250);
 expect(await first.locator('canvas').evaluate(el=>(window as any).avatarDraws.get(el))).toBe(frozen);
 await first.locator('.note-fold').click();await first.getByRole('button',{name:'Edit note',exact:true}).click();
 const preview=page.locator('#bulletin-reaction .bulletin-character');await expect(preview).toHaveAttribute('data-character-member','rohil');await expect(preview).toHaveClass(/has-character-canvas/);
 await page.locator('#bulletin-temperature').fill('-100');await expect(preview).toHaveAttribute('aria-label','Rohil: About to burst');
 const angry=await preview.locator('canvas').evaluate((el:HTMLCanvasElement)=>el.toDataURL());
 await page.locator('#bulletin-temperature').fill('100');await expect(preview).toHaveAttribute('aria-label','Rohil: Heart overflowing');
 expect(await preview.locator('canvas').evaluate((el:HTMLCanvasElement)=>el.toDataURL())).not.toBe(angry);
 const frames=await preview.locator('canvas').evaluate(el=>(window as any).avatarDraws.get(el));await page.waitForTimeout(250);
 expect(await preview.locator('canvas').evaluate(el=>(window as any).avatarDraws.get(el))).toBe(frames);
 await page.keyboard.press('Escape');await expect(page.locator('#bulletin-reaction canvas')).toHaveCount(0);
});

test('notes retain approved static expressions when animated artwork fails to load',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.route('**/*-faceplate-*.webp',route=>route.abort());
 const first=await mockedBoard(page,2);const portrait=first.locator('.bulletin-character>img');
 await expect.poll(()=>portrait.evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth===256)).toBe(true);
 await expect(first.locator('.bulletin-character')).not.toHaveClass(/has-character-canvas/);
 await first.locator('.note-fold').click();await first.getByRole('button',{name:'Edit note',exact:true}).click();
 await page.locator('#bulletin-temperature').fill('-100');await expect(page.locator('#bulletin-reaction img')).toHaveAttribute('src',`./avatars/v1/${AVATAR_ASSETS.rohil.angry}`);
 await page.keyboard.press('Escape');await expect(page.locator('#bulletin-reaction canvas')).toHaveCount(0);expect(errors).toEqual([]);
});

test('closing the editor during artwork loading discards stale canvases and reuses the image',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 let release!:()=>void,received!:()=>void,fetches=0;
 const held=new Promise<void>(resolve=>release=resolve),started=new Promise<void>(resolve=>received=resolve);
 await page.route('**/*-faceplate-*.webp',async route=>{fetches++;const response=await route.fetch();received();await held;await route.fulfill({response});});
 await mockedBoard(page,0);await page.locator('#bulletin-new').click();await started;
 await page.keyboard.press('Escape');await expect(page.locator('#bulletin-reaction canvas')).toHaveCount(0);
 await page.locator('#bulletin-new').click();await page.locator('#bulletin-temperature').fill('-95');await page.keyboard.press('Escape');
 await page.getByRole('link',{name:'Utilities',exact:true}).click();release();await expect(page.locator('#bulletin-reaction canvas')).toHaveCount(0);
 await page.getByRole('link',{name:'Bulletin',exact:true}).click();await page.locator('#bulletin-new').click();await page.locator('#bulletin-temperature').fill('95');
 await expect(page.locator('#bulletin-reaction .bulletin-character')).toHaveClass(/has-character-canvas/);
 await expect(page.locator('#bulletin-reaction .bulletin-character')).toHaveAttribute('aria-label','Michal: Heart overflowing');
 await page.keyboard.press('Escape');await expect(page.locator('#bulletin-reaction canvas')).toHaveCount(0);expect(fetches).toBe(1);expect(errors).toEqual([]);
});
