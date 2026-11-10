import {test,expect,type Page} from '@playwright/test';
const ready=(page:Page)=>expect(page.locator('#main')).toHaveAttribute('aria-busy','false');
test.use({viewport:{width:1280,height:900}});
test('scrolling up leaves the house through the sky and approaches the game planet',async({page})=>{
 // This transition initializes both 3D scenes when WebGL runs in software.
 test.setTimeout(120000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/#home');await expect(page.locator('#house-stage')).toHaveAttribute('data-ready','true',{timeout:30000});await ready(page);
 await expect(page.locator('.house-navigation a')).toHaveCount(6);await expect(page.locator('[data-ledger=games]')).toHaveCount(0);await expect(page.locator('#sky-games-launch')).toBeVisible();await page.mouse.move(950,450);await page.mouse.wheel(0,-160);await expect(page.locator('#sky-flight')).toBeVisible();await expect(page).toHaveURL(/#games$/,{timeout:30000});await expect(page.locator('#sky-flight')).toBeHidden();await expect(page.locator('#geo-globe')).toHaveAttribute('data-ready','true');await expect(page.locator('#geo-launch')).toBeVisible();await expect(page.locator('.house-chrome')).toBeHidden();
 await expect.poll(()=>page.evaluate(()=>(window as any).__globeDiagnostics().animating)).toBe(false);await expect(page.locator('#geo-launch')).toBeFocused();await page.locator('#geo-launch').click();await expect(page).toHaveURL(/#games\/geography$/);await expect(page.locator('#geo-random')).toBeVisible();await page.locator('.observatory-home').click();await expect(page).toHaveURL(/#home$/);await expect(page.locator('.house-navigation a')).toHaveCount(6);await expect(page.locator('#sky-games-launch')).toBeVisible();expect(errors).toEqual([]);
});
test('keyboard entry respects reduced motion, and cancelled loading cannot navigate later',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/?webgl=0#home');await ready(page);await page.locator('#sky-games-launch').focus();await page.keyboard.press('Enter');await expect(page).toHaveURL(/#games$/);await expect(page.locator('#geo-map')).toBeVisible();await expect(page.locator('#sky-flight')).toBeHidden();await page.goBack();await expect(page).toHaveURL(/#home$/);
 // A delayed chunk is used only to exercise cancelling an asynchronous entry.
 await page.reload();let release:()=>void=()=>{};const held=new Promise<void>(resolve=>{release=resolve;});await page.route('**/chunk-*.js',async route=>{await held;await route.continue();});await page.locator('#sky-games-launch').click();await expect(page.locator('#sky-flight')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#sky-flight')).toBeHidden();release();await page.waitForTimeout(300);await expect(page).toHaveURL(/#home$/);await expect(page.locator('#sky-games-launch')).toBeFocused();
});
test('upward touch enters the hub while downward scrolling still opens To-dos',async({browser})=>{
 const context=await browser.newContext({baseURL:'http://127.0.0.1:4174',viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),page=await context.newPage();await page.goto('/?webgl=0#home');await ready(page);const cdp=await context.newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:200,y:400}]});for(let i=1;i<=5;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:201,y:400+i*20}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(page).toHaveURL(/#games$/);await expect(page.locator('#geo-launch')).toBeVisible();await page.locator('.observatory-home').click();await ready(page);await page.evaluate(()=>scrollTo(0,document.querySelector<HTMLElement>('#house-hero')!.offsetHeight));await expect(page).toHaveURL(/#chores$/);await expect(page.locator('#house-hero')).toBeHidden();await context.close();
});

test('every house scene has an upward entrance and returns to that same scene',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 for(const section of ['home','chores','miscellaneous','events','bulletin','utilities']){
  await page.goto('/?webgl=0#'+section);await ready(page);
  if(section!=='home'){
   await page.locator('[data-ledger="'+section+'"]').click();await ready(page);
   await page.locator('#main').focus();await page.keyboard.press('PageUp');
   await expect(page.locator('#house-hero')).toBeVisible();
  }
  await expect(page.locator('#sky-games-launch')).toBeVisible();
  await page.locator('#house-stage').dispatchEvent('wheel',{deltaY:-180,bubbles:true,cancelable:true});
  await expect(page).toHaveURL(/#games$/);await expect(page.locator('#sky-flight')).toBeHidden();
  await expect(page.locator('.observatory-home')).toHaveAttribute('href','#'+section);
  await page.reload();await expect(page.locator('.observatory-home')).toHaveAttribute('data-house-return','true');
  await page.locator('.observatory-home').click();
  await expect(page).toHaveURL(new RegExp('#'+section+'$'));
  await expect(page.locator('#house-hero')).toBeVisible();
  await expect(page.locator('#sky-games-launch')).toBeFocused();
  await expect(page.locator('#feature-area')).not.toBeInViewport();
 }
});

test('returning from a feature needs a fresh gesture before taking off',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/?webgl=0#events');await ready(page);
 await page.locator('#main').evaluate(el=>{for(let i=0;i<20;i++)el.dispatchEvent(new WheelEvent('wheel',{deltaY:-100,bubbles:true,cancelable:true}));});
 await expect(page.locator('#house-hero')).toBeVisible();await expect(page).toHaveURL(/#events$/);
 await expect(page.locator('#sky-games-launch')).toBeVisible();
 await page.locator('#settings-open').click();
 await page.locator('#house-stage').dispatchEvent('wheel',{deltaY:-180,bubbles:true,cancelable:true});
 await expect(page).toHaveURL(/#events$/);await page.keyboard.press('Escape');
 await page.locator('#house-stage').focus();await page.locator('#house-stage').evaluate(el=>{el.setAttribute('tabindex','-1');(el as HTMLElement).focus();});
 await page.keyboard.press('PageUp');await expect(page).toHaveURL(/#games$/);
});

test('the modeled cloud ascent leaves a rotated room and cancellation restores its camera',async({page})=>{
 test.setTimeout(60000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/#home');
 await expect(page.locator('#house-stage')).toHaveAttribute('data-ready','true',{timeout:30000});
 await page.locator('.stage-canvas').focus();await page.keyboard.press('ArrowRight');await expect(page).toHaveURL(/#chores$/);await ready(page);
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.locator('#sky-games-launch').click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__houseDiagnostics().skyJourney.progress)).toBeGreaterThan(.1);
 const flight=await page.evaluate(()=>(window as any).__houseDiagnostics().skyJourney);
 expect(flight.visible).toBe(true);expect(flight.cloudBanks).toBe(6);expect(flight.stars).toBe(7);
 await expect(page.locator('.sky-flight-clouds')).toHaveCount(0);
 await page.keyboard.press('Escape');await expect(page.locator('#sky-flight')).toBeHidden();
 await expect.poll(()=>page.evaluate(()=>(window as any).__houseDiagnostics().skyJourney.progress)).toBe(0);
 expect(await page.evaluate(()=>(window as any).__houseDiagnostics().displayed)).toBe('todos');
 await expect(page).toHaveURL(/#chores$/);await expect(page.locator('#sky-games-launch')).toBeFocused();
 expect(errors).toEqual([]);
});
