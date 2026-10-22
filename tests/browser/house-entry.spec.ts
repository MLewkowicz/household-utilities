import {test,expect,type Page} from '@playwright/test';
import {readdirSync,statSync} from 'node:fs';
const houseChunk=readdirSync('dist').filter(file=>file.endsWith('.js')).sort((a,b)=>statSync('dist/'+b).size-statSync('dist/'+a).size)[0];
const diag=(page:Page)=>page.evaluate(()=>(window as any).__houseDiagnostics());
const ready=(page:Page)=>expect(page.locator('#house-stage')).toHaveAttribute('data-ready','true',{timeout:20000});
const sections=['home','chores','miscellaneous','events','bulletin','utilities'];
test.use({viewport:{width:1440,height:900}});
test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('household-person','michal'));});

test('Home is a full-viewport house and floating shortcuts, with no gallery chrome',async({page})=>{
 await page.goto('/');await ready(page);
 expect(await page.locator('[data-ledger]').evaluateAll(links=>links.map(link=>link.getAttribute('data-ledger')))).toEqual(sections);
 await expect(page.locator('#feature-area')).toBeHidden();await expect(page.locator('.topbar')).toBeHidden();
 expect((await page.locator('#house-hero').boundingBox())!.height).toBe(900);
 const navigation=(await page.locator('.house-navigation').boundingBox())!;
 expect(navigation.y).toBeLessThan(40);expect(navigation.width).toBeGreaterThan(700);expect(navigation.height).toBeLessThan(70);
 await expect(page.locator('#house-hero h1,#house-hero h2,#house-hero button,.scene-description,.scene-toolbar')).toHaveCount(0);
 expect(await page.evaluate(()=>scrollY)).toBe(0);
 expect((await diag(page)).displayed).toBe('home');
});

test('reduced-motion arrows follow the deployed order in both directions without scrolling',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');await ready(page);
 await page.locator('.stage-canvas').focus();
 for(const section of [...sections.slice(1),'home']){
  await page.keyboard.press('ArrowRight');await expect(page.locator(`[data-ledger="${section}"]`)).toHaveAttribute('aria-current','page');
  expect(await page.evaluate(()=>scrollY)).toBe(0);expect((await diag(page)).transitioning).toBe(false);
 }
 await page.keyboard.press('ArrowLeft');await expect(page).toHaveURL(/#utilities$/);
 expect(await page.evaluate(()=>scrollY)).toBe(0);
});

test('drags commit only on release, short drags cancel, and a quick swipe advances one section',async({page})=>{
 await page.goto('/');await ready(page);
 const canvas=page.locator('.stage-canvas'),rect=(await canvas.boundingBox())!,x=rect.width*.75,y=rect.height*.6;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-30,y,{steps:3});await page.waitForTimeout(250);await page.mouse.up();
 await expect.poll(async()=>(await diag(page)).transitioning).toBe(false);expect((await diag(page)).selected).toBe('home');
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-rect.width*.3,y,{steps:6});
 expect((await diag(page)).selected).toBe('home');await expect(page.locator('#feature-area')).toBeHidden();
 await page.mouse.up();await expect(page).toHaveURL(/#chores$/,{timeout:5000});expect(await page.evaluate(()=>scrollY)).toBe(0);
 await expect(page.locator('#feature-area')).toBeVisible();expect((await page.locator('#feature-area').boundingBox())!.y).toBe(900);
 // 60px is below the distance threshold on desktop, but a quick swipe commits.
 const cdp=await page.context().newCDPSession(page),stamp=Date.now()/1000;
 await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1,timestamp:stamp});
 await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+60,y,button:'left',buttons:1,timestamp:stamp+.04});
 await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:x+60,y,button:'left',clickCount:1,timestamp:stamp+.08});
 await expect(page).toHaveURL(/#home$/,{timeout:5000});expect((await diag(page)).displayed).toBe('home');
});

test('shortcuts jump straight to working features and stop the offscreen renderer',async({page})=>{
 await page.goto('/');await ready(page);await page.locator('[data-ledger=events]').click();
 await expect(page).toHaveURL(/#events$/);await expect(page.locator('#house-hero')).toBeHidden();expect(await page.evaluate(()=>scrollY)).toBe(0);
 await expect(page.locator('#event-new')).toBeEnabled();await page.locator('#event-new').click();await expect(page.locator('#event-dialog')).toBeVisible();await page.keyboard.press('Escape');
 await expect.poll(async()=>(await diag(page)).active).toBe(false);const frozen=(await diag(page)).frames;
 await expect(page.locator('#house-hero')).toHaveAttribute('data-sky-paused','true');
 await page.waitForTimeout(200);expect((await diag(page)).frames).toBe(frozen);
 await page.evaluate(()=>scrollTo(0,0));await expect(page.locator('#house-hero')).toBeHidden();
 await page.locator('[data-ledger=home]').click();await expect.poll(async()=>(await diag(page)).displayed).toBe('home');await expect.poll(async()=>(await diag(page)).active).toBe(true);
});

test('a direct feature link loads no WebGL until Home is chosen',async({page})=>{
 await page.goto('/#events');await expect(page.locator('#event-new')).toBeEnabled();await page.waitForTimeout(200);
 expect((await diag(page)).loaded).toBe(false);await expect(page.locator('.stage-canvas')).toHaveCount(0);
 expect(await page.evaluate(()=>scrollY)).toBe(0);await expect(page.locator('#house-hero')).toBeHidden();
 await page.locator('[data-ledger=home]').click();await ready(page);expect((await diag(page)).displayed).toBe('home');expect((await diag(page)).cachedStages).toBe(1);
});

test('features stay usable while the large scene module is still downloading',async({page})=>{
 let release!:()=>void;const waiting=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/'+houseChunk,async route=>{await waiting;await route.continue();});
 await page.goto('/');await page.locator('[data-ledger=events]').click();await expect(page.locator('#event-new')).toBeEnabled();
 await expect(page.locator('#house-hero')).toBeHidden();expect((await diag(page)).loaded).toBe(false);
 release();await page.waitForTimeout(250);expect((await diag(page)).loaded).toBe(false);
 await page.locator('[data-ledger=home]').click();await ready(page);expect((await diag(page)).displayed).toBe('home');
});

test('a shortcut during a turn wins over the old scene and Back/Forward remains synchronized',async({page})=>{
 await page.goto('/');await ready(page);await page.locator('.stage-canvas').focus();await page.keyboard.press('ArrowRight');
 await page.locator('[data-ledger=bulletin]').click();await expect(page.locator('#bulletin-page')).toBeVisible();await expect(page).toHaveURL(/#bulletin$/);
 await page.waitForTimeout(2000);await expect(page).toHaveURL(/#bulletin$/);
 await page.evaluate(()=>scrollTo(0,0));await expect(page.locator('#house-hero')).toBeHidden();
 await page.locator('[data-ledger=home]').click();await expect(page).toHaveURL(/#home$/);expect(await page.evaluate(()=>scrollY)).toBe(0);
 await page.goBack();await expect(page).toHaveURL(/#bulletin$/);await expect.poll(async()=>(await diag(page)).selected).toBe('bulletin');await expect(page.locator('#house-hero')).toBeHidden();
 await page.goForward();await expect(page).toHaveURL(/#home$/);await expect.poll(async()=>(await diag(page)).displayed).toBe('home');
});

for(const width of [320,390])test(`${width}px floating tabs fit and vertical swipes scroll without changing the selected section`,async({browser})=>{
 const context=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,colorScheme:'dark'}),page=await context.newPage();
 await page.addInitScript(()=>localStorage.setItem('household-person','michal'));await page.goto(new URL('/',test.info().project.use.baseURL as string).href);await ready(page);await page.locator('.stage-canvas').focus();await page.keyboard.press('ArrowLeft');await expect(page).toHaveURL(/#utilities$/,{timeout:5000});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
 const links=await page.locator('[data-ledger]').evaluateAll(links=>links.map(link=>({width:link.getBoundingClientRect().width,height:link.getBoundingClientRect().height})));
 for(const link of links){expect(link.width).toBeGreaterThanOrEqual(90);expect(link.height).toBeGreaterThanOrEqual(52);}
 expect((await page.locator('.house-navigation').boundingBox())!.height).toBeGreaterThan(100);
 const cdp=await context.newCDPSession(page),x=width/2,y=650;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+2,y:y-i*45}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(100);await expect(page).toHaveURL(/#utilities$/);
 await context.close();
});

test('the existing theme preference controls the house and fallback navigation still works',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('household-theme','dark'));await page.goto('/');await ready(page);expect((await diag(page)).theme).toBe('dark');
 await page.locator('[data-ledger=events]').click();await page.locator('#theme-select').selectOption('light');await page.locator('[data-ledger=home]').click();
 expect((await diag(page)).theme).toBe('light');
 await page.goto('/?webgl=0');await expect(page.locator('.fallback')).toBeVisible();await page.locator('[data-ledger=events]').click();await expect(page.locator('#event-new')).toBeEnabled();
});

test('legacy personal-task links still open To-dos directly',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('household-person','michal'));
 await page.goto('/#home/personal');await expect(page).toHaveURL(/#chores\/personal$/);await expect(page.locator('#personal-add')).toBeEnabled();
 await expect(page.locator('[data-home-filter=personal]')).toHaveAttribute('aria-pressed','true');await expect(page.locator('#house-hero')).toBeHidden();
 await page.locator('#personal-title').fill('Keep this draft');await page.locator('[data-ledger=events]').click();await page.locator('[data-ledger=chores]').click();await expect(page.locator('#personal-title')).toHaveValue('Keep this draft');
});

test('scrolling beyond the house keeps the feature open until Home is chosen',async({page})=>{
 await page.goto('/');await ready(page);await page.locator('.stage-canvas').focus();await page.keyboard.press('ArrowLeft');await expect(page).toHaveURL(/#utilities$/,{timeout:5000});
 await expect(page.locator('#main')).toHaveAttribute('aria-busy','false');
 await page.evaluate(()=>scrollTo(0,innerHeight-100));await expect(page.locator('#house-hero')).toBeVisible();
 await page.evaluate(()=>scrollTo(0,innerHeight+120));await expect(page.locator('#house-hero')).toBeHidden();
 // Removing the hero keeps the feature at the same visual position.
 await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(120);
 await expect.poll(async()=>(await diag(page)).active).toBe(false);const frozen=(await diag(page)).frames;
 await page.waitForTimeout(200);expect((await diag(page)).frames).toBe(frozen);
 await page.evaluate(()=>scrollTo(0,0));await page.mouse.wheel(0,-600);await expect(page.locator('#house-hero')).toBeHidden();await expect(page).toHaveURL(/#utilities$/);
 await page.locator('[data-ledger=events]').click();await expect(page.locator('#event-new')).toBeEnabled();await expect(page.locator('#house-hero')).toBeHidden();
 await page.locator('[data-ledger=home]').click();await expect(page.locator('#house-hero')).toBeVisible();await expect.poll(async()=>(await diag(page)).displayed).toBe('home');expect(await page.evaluate(()=>scrollY)).toBe(0);
});

test('a tap on the house triggers its effect; swiping, scrolling and blank space do not',async({page})=>{
 await page.goto('/');await ready(page);const rect=(await page.locator('.stage-canvas').boundingBox())!;
 const x=rect.width*.5,y=rect.height*.55;
 await page.mouse.click(x,y);expect((await diag(page)).state.variation).toBe(1);expect((await diag(page)).selected).toBe('home');
 await page.mouse.click(15,rect.height*.5);expect((await diag(page)).state.variation).toBe(1);
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+2,y-80,{steps:5});await page.mouse.up();expect((await diag(page)).state.variation).toBe(1);
 await page.locator('.stage-canvas').focus();await page.keyboard.press('Enter');expect((await diag(page)).state.variation).toBe(2);
 await page.keyboard.press('ArrowRight');await expect(page).toHaveURL(/#chores$/,{timeout:5000});expect((await diag(page)).state.variation).toBe(0);
});

test('Home exposes notifications and the shared System/Light/Dark landscape control',async({page})=>{
 await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});await page.goto('/');await ready(page);
 await expect(page.locator('#theme-select')).toBeVisible();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await expect(page.locator('.landscape-stars')).toHaveCSS('opacity','1');await expect(page.locator('.landscape-sun')).toHaveCSS('opacity','0');
 await expect(page.locator('.shooting-star-one')).toHaveCSS('display','none');
 await page.locator('#notifications').click();await expect(page.locator('#push-dialog')).toBeVisible();await expect.poll(async()=>(await diag(page)).paused).toBe(true);await expect(page.locator('#house-hero')).toHaveAttribute('data-sky-paused','true');await page.locator('#push-close').click();await expect.poll(async()=>(await diag(page)).paused).toBe(false);
 await page.locator('#theme-select').selectOption('light');await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await expect(page.locator('.landscape-stars')).toHaveCSS('opacity','0');await expect(page.locator('.landscape-sun')).toHaveCSS('opacity','1');
 expect((await diag(page)).theme).toBe('light');
 await page.locator('#theme-select').selectOption('system');await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await page.emulateMedia({colorScheme:'light'});await expect(page.locator('html')).toHaveAttribute('data-theme','light');
});

test('pointer bursts are coalesced into the frame loop and the canvas respects its pixel budget',async({page})=>{
 await page.goto('/');await ready(page);await page.mouse.move(1000,500);await page.mouse.down();
 const result=await page.evaluate(()=>{const before=(window as any).__houseDiagnostics().frames;for(let i=1;i<=24;i++)window.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,buttons:1,clientX:1000-i*5,clientY:500}));const canvas=document.querySelector<HTMLCanvasElement>('.stage-canvas')!;return {synchronousDraws:(window as any).__houseDiagnostics().frames-before,pixels:canvas.width*canvas.height};});
 expect(result.synchronousDraws).toBe(0);expect(result.pixels).toBeLessThanOrEqual(1_400_000);
 await page.mouse.up();await expect.poll(async()=>(await diag(page)).transitioning).toBe(false);expect((await diag(page)).selected).toBe('home');
});
