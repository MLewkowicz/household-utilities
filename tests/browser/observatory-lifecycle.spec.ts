import {test,expect,type Page} from '@playwright/test';

const diagnostics=(page:Page)=>page.evaluate(()=>(window as any).__observatoryDiagnostics());
async function stableScene(page:Page){
 await expect(page.locator('#orbit-lobby')).toBeVisible();
 await expect(page.locator('#observatory-scene')).toHaveAttribute('data-sky','3d');
 const d=await diagnostics(page);
 expect(Number.isFinite(d.angle)&&Number.isFinite(d.target)).toBe(true);
 expect(Math.abs(d.angle)).toBeLessThanOrEqual(Math.PI+.001);
 expect(Math.abs(d.target-d.angle)).toBeLessThanOrEqual(Math.PI+.001);
 for(const value of d.cosmos.parallax){expect(Number.isFinite(value)).toBe(true);expect(Math.abs(value)).toBeLessThanOrEqual(1);}
 await expect(page.locator('.observatory-sky')).toBeHidden();
 await expect(page.locator('#observatory-scene canvas')).toHaveCount(1);
}

test('returning from every game and resizing keeps the observatory and background stable',async({page})=>{
 test.setTimeout(90000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>localStorage.setItem('household-globe-style-v1','paper'));
 await page.goto('/#games');await stableScene(page);await page.mouse.move(30,300);
 await expect.poll(async()=>(await diagnostics(page)).cosmos.parallax[0]).toBeLessThan(-.1);
 for(const [i,title] of ['How Much-ish?','Before or After?','Common Ground','Passport Puzzle','Odd One Out','Geography'].entries()){
  await page.getByRole('button',{name:'Play '+title,exact:true}).click();
  await expect.poll(async()=>(await diagnostics(page)).active).toBe(false);
  await page.getByRole('link',{name:'Games',exact:true}).click();await stableScene(page);
  await page.setViewportSize(i%2?{width:1280,height:900}:{width:390,height:844});await stableScene(page);
 }
 await expect.poll(async()=>{const d=await diagnostics(page);return Math.abs(d.angle-d.target);}).toBeLessThan(.01);
 expect(errors).toEqual([]);
});

test('rapid turns stay bounded and interrupted drags cannot move the observatory later',async({page})=>{
 await page.goto('/#games');await stableScene(page);
 await page.locator('[data-turn="1"]').evaluate(button=>{for(let i=0;i<35;i++)(button as HTMLButtonElement).click();});
 await expect(page.locator('#orbit-game-title')).toHaveText('Common Ground');await stableScene(page);
 const scene=page.locator('#observatory-scene'),box=(await scene.boundingBox())!;
 await page.mouse.move(box.x+box.width*.4,box.y+box.height*.8);await page.mouse.down();await page.mouse.move(box.x+box.width*.4-100,box.y+box.height*.8,{steps:3});
 await scene.evaluate(el=>{if(el.hasPointerCapture(1))el.releasePointerCapture(1);});
 await page.mouse.move(box.x+30,box.y+box.height*.8);await page.mouse.up();
 await expect(scene).toHaveAttribute('data-selected','clue-cascade');await stableScene(page);
 await page.mouse.move(box.x+box.width*.4,box.y+box.height*.8);await page.mouse.down();await page.mouse.move(box.x+box.width*.4-100,box.y+box.height*.8,{steps:3});
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.mouse.move(box.x+10,box.y+box.height*.8);await page.mouse.up();
 await expect(scene).toHaveAttribute('data-selected','clue-cascade');await stableScene(page);
 await scene.focus();await page.keyboard.press('Home');await expect(scene).toHaveAttribute('data-selected','geography');await stableScene(page);
});

test('dialogs and reduced motion pause one render loop and return without stale parallax',async({page})=>{
 await page.goto('/#games');await stableScene(page);await page.mouse.move(30,300);
 await expect.poll(async()=>(await diagnostics(page)).cosmos.parallax[0]).toBeLessThan(-.1);
 await page.evaluate(()=>document.querySelector<HTMLDialogElement>('#settings-dialog')!.showModal());
 await expect.poll(async()=>(await diagnostics(page)).active).toBe(false);
 const frames=(await diagnostics(page)).frames;await page.waitForTimeout(150);expect((await diagnostics(page)).frames).toBe(frames);
 await page.getByRole('button',{name:'Close settings',exact:true}).click();await stableScene(page);
 await page.emulateMedia({reducedMotion:'reduce'});await expect.poll(async()=>(await diagnostics(page)).cosmos.parallax).toEqual([0,0]);
 const stopped=(await diagnostics(page)).frames;await page.waitForTimeout(150);expect((await diagnostics(page)).frames).toBe(stopped);
 await page.emulateMedia({reducedMotion:'no-preference'});
 const samples=await page.evaluate(()=>new Promise<number[]>(resolve=>{const values:number[]=[];function sample(){values.push((window as any).__observatoryDiagnostics().frames);if(values.length<12)requestAnimationFrame(sample);else resolve(values);}requestAnimationFrame(sample);}));
 for(let i=1;i<samples.length;i++)expect(samples[i]-samples[i-1]).toBeLessThanOrEqual(1);
 await stableScene(page);
});

test('a failed scene load retries on the next hub visit and finishes safely while hidden',async({page})=>{
 let fail=true,release=()=>{};const held=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/avatars/v1/*',async route=>{if(fail)await route.abort();else{await held;await route.continue();}});
 await page.goto('/#games');await expect(page.locator('.observatory-fallback')).toBeVisible();
 // Wait for all initial portrait failures before retrying the same mounted hub.
 await page.waitForTimeout(500);fail=false;
 await page.getByRole('button',{name:'Play Odd One Out',exact:true}).click();await page.getByRole('link',{name:'Games',exact:true}).click();
 await page.getByRole('button',{name:'Play Common Ground',exact:true}).click();release();
 await expect.poll(async()=>Boolean(await diagnostics(page))).toBe(true);expect((await diagnostics(page)).active).toBe(false);
 await page.getByRole('link',{name:'Games',exact:true}).click();await stableScene(page);await expect(page.locator('#orbit-game-title')).toHaveText('Common Ground');
});

test('a lost graphics context shows the backdrop and restoration recovers the hub',async({page})=>{
 await page.goto('/#games');await stableScene(page);
 await page.locator('#observatory-scene canvas').evaluate(canvas=>{const gl=(canvas as HTMLCanvasElement).getContext('webgl2')!;(window as any).__restoreObservatory=gl.getExtension('WEBGL_lose_context');(window as any).__restoreObservatory.loseContext();});
 await expect(page.locator('.observatory-sky')).toBeVisible();await expect(page.locator('.observatory-fallback')).toBeVisible();
 await page.getByRole('button',{name:'Play Before or After?',exact:true}).click();
 await page.evaluate(()=>(window as any).__restoreObservatory.restoreContext());await expect.poll(async()=>(await diagnostics(page)).lost).toBe(false);
 await page.getByRole('link',{name:'Games',exact:true}).click();await stableScene(page);await expect(page.locator('#orbit-game-title')).toHaveText('Before or After?');
});
