import {setTheme,openNotifications} from './settings';
import {test,expect,type Page} from '@playwright/test';
import {readdirSync,statSync} from 'node:fs';
const houseChunk=readdirSync('dist').filter(file=>file.endsWith('.js')).sort((a,b)=>statSync('dist/'+b).size-statSync('dist/'+a).size)[0];
const diag=(page:Page)=>page.evaluate(()=>(window as any).__houseDiagnostics());
const ready=(page:Page)=>expect(page.locator('#house-stage')).toHaveAttribute('data-ready','true',{timeout:20000});
const sections=['home','chores','miscellaneous','events','bulletin','utilities'];
test.use({viewport:{width:1440,height:900}});
test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('household-person','michal'));});

test('downstairs utilities animate continuously, cycle Rohil’s lyrics and keep all four portraits',async({page})=>{
 test.setTimeout(90000);
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');await ready(page);
 const canvas=page.locator('.stage-canvas');await canvas.focus();await page.keyboard.press('ArrowLeft');
 const still=await diag(page),utilities=still.sceneDetails.utilities;
 expect(still.actors).toEqual(['michal','ohm','rina','rohil']);
 expect(utilities.bedroom.airConditioners).toBe(3);expect(utilities.bedroom.lounging).toBe(true);
 expect(utilities.shower.waterDrops).toBe(48);expect(utilities.shower.musicalNotes).toBe(5);
 const lyrics=['Fuck me in the shower','I don’t misbehave','I’m such a good little boy'];
 for(const lyric of lyrics){
  const bubbles=(await diag(page)).speech.filter((bubble:any)=>bubble.visible&&bubble.opacity>0);
  expect(bubbles.map((bubble:any)=>[bubble.speaker,bubble.message])).toEqual([['rohil',lyric]]);
  await page.keyboard.press('Enter');
 }
 await page.emulateMedia({reducedMotion:'no-preference'});
 await expect.poll(async()=>(await diag(page)).sceneDetails.utilities.shower.waterY).not.toBe(utilities.shower.waterY);
 await expect.poll(async()=>(await diag(page)).sceneDetails.utilities.bedroom.fanAngle).not.toBe(utilities.bedroom.fanAngle);
 const current=(await diag(page)).sceneDetails.utilities.shower.lyric;
 // Lyrics follow scene time, which runs slower when a loaded machine drops frames.
 await expect.poll(async()=>(await diag(page)).sceneDetails.utilities.shower.lyric,{timeout:20000}).not.toBe(current);
 // Speech fades before the room passes behind the common house shell.
 await page.keyboard.press('ArrowRight');
 await expect.poll(async()=>(await diag(page)).speech.filter((bubble:any)=>bubble.visible&&bubble.opacity>.05).length).toBe(0);
 await expect(page).toHaveURL(/#home$/,{timeout:5000});
});

test('Home is a full-viewport house and floating shortcuts, with no gallery chrome',async({page})=>{
 await page.goto('/');await ready(page);
 expect(await page.locator('[data-ledger]').evaluateAll(links=>links.map(link=>link.getAttribute('data-ledger')))).toEqual(sections);
 await expect(page.locator('#feature-area')).not.toBeInViewport();await expect(page.locator('.topbar')).toBeHidden();
 expect((await page.locator('#house-hero').boundingBox())!.height).toBe(900);
 const navigation=(await page.locator('.house-navigation').boundingBox())!;
 expect(navigation.y).toBeLessThan(40);expect(navigation.width).toBeGreaterThan(700);expect(navigation.height).toBe(120);
 await expect(page.locator('#house-hero h1,#house-hero h2,#house-hero button:not(#updates-board-button),.scene-description,.scene-toolbar')).toHaveCount(0);
 // The What’s new shortcut is for keyboards only and stays invisible until focused.
 expect(await page.locator('#updates-board-button').evaluate(button=>getComputedStyle(button).opacity)).toBe('0');
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
 await expect.poll(async()=>(await diag(page)).house.pivotYaw).toBeLessThan(0);
 expect((await diag(page)).selected).toBe('home');await expect(page.locator('#feature-area')).not.toBeInViewport();
 await page.mouse.up();await expect(page).toHaveURL(/#chores$/,{timeout:5000});expect(await page.evaluate(()=>scrollY)).toBe(0);
 await expect(page.locator('#feature-area')).toBeVisible();expect((await page.locator('#feature-area').boundingBox())!.y).toBe(900);
 // 60px is below the distance threshold on desktop, but a quick swipe commits.
 const cdp=await page.context().newCDPSession(page),stamp=Date.now()/1000;
 await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1,timestamp:stamp});
 await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+60,y,button:'left',buttons:1,timestamp:stamp+.04});
 expect((await diag(page)).house.turn.direction).toBe(1);
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
 await page.locator('[data-ledger=home]').click();await expect(page).toHaveURL(/#home$/);await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);
 await page.goBack();await expect(page).toHaveURL(/#bulletin$/);await expect.poll(async()=>(await diag(page)).selected).toBe('bulletin');await expect(page.locator('#house-hero')).toBeHidden();
 await page.goForward();await expect(page).toHaveURL(/#home$/);await expect.poll(async()=>(await diag(page)).displayed).toBe('home');
});

for(const width of [320,390])test(`${width}px floating tabs fit and vertical swipes scroll without changing the selected section`,async({browser})=>{
 const context=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,colorScheme:'dark'}),page=await context.newPage();
 await page.addInitScript(()=>localStorage.setItem('household-person','michal'));await page.goto(new URL('/',test.info().project.use.baseURL as string).href);await ready(page);await page.locator('.stage-canvas').focus();await page.keyboard.press('ArrowLeft');await expect(page).toHaveURL(/#utilities$/,{timeout:5000});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);expect((await diag(page)).pixelRatio).toBe(2);
 const links=await page.locator('[data-ledger]').evaluateAll(links=>links.map(link=>({width:link.getBoundingClientRect().width,height:link.getBoundingClientRect().height})));
 for(const link of links){expect(link.width).toBeGreaterThanOrEqual(78);expect(link.height).toBeGreaterThanOrEqual(52);}
 expect((await page.locator('.house-navigation').boundingBox())!.height).toBe(width===320?110:112);
 const layout=await page.locator('[data-ledger],.house-controls button').evaluateAll(items=>items.map(item=>{const r=item.getBoundingClientRect();return {y:r.y,bottom:r.bottom};}));
 expect(layout.slice(0,3).every(item=>item.y===layout[0].y)).toBe(true);
 expect(layout.slice(3,6).every(item=>item.y===layout[3].y)).toBe(true);
 expect(layout[6]).toEqual(layout[2]);expect(layout[7]).toEqual(layout[5]);
 expect((await diag(page)).bitmojis.every((url:string)=>url.includes('happy512'))).toBe(true);
 const cdp=await context.newCDPSession(page),x=width/2,y=650;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+2,y:y-i*45}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(100);await expect(page).toHaveURL(/#utilities$/);
 await context.close();
});

test('the existing theme preference controls the house and fallback navigation still works',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('household-theme','dark'));await page.goto('/');await ready(page);expect((await diag(page)).theme).toBe('dark');
 await page.locator('[data-ledger=events]').click();await setTheme(page,'light');await page.locator('[data-ledger=home]').click();
 expect((await diag(page)).theme).toBe('light');
 await page.goto('/?webgl=0');await expect(page.locator('.fallback')).toBeVisible();await page.locator('[data-ledger=events]').click();await expect(page.locator('#event-new')).toBeEnabled();
});

test('legacy personal-task links still open To-dos directly',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('household-person','michal'));
 await page.goto('/#home/personal');await expect(page).toHaveURL(/#chores\/personal$/);await expect(page.locator('#personal-add')).toBeEnabled();
 await expect(page.locator('[data-home-filter=personal]')).toHaveAttribute('aria-pressed','true');await expect(page.locator('#house-hero')).toBeHidden();
 await page.locator('#personal-title').fill('Keep this draft');await page.locator('[data-ledger=events]').click();await page.locator('[data-ledger=chores]').click();await expect(page.locator('#personal-title')).toHaveValue('Keep this draft');
});

test('scrolling beyond the house docks the feature and an edge gesture returns to the previous section',async({page})=>{
 await page.goto('/');await ready(page);await page.locator('.stage-canvas').focus();await page.keyboard.press('ArrowLeft');await expect(page).toHaveURL(/#utilities$/,{timeout:5000});
 await expect(page.locator('#main')).toHaveAttribute('aria-busy','false');
 await page.evaluate(()=>scrollTo(0,innerHeight-100));await expect(page.locator('#house-hero')).toBeVisible();
 await page.evaluate(()=>scrollTo(0,innerHeight+120));await expect(page.locator('#house-hero')).toBeHidden();
 await expect(page.locator('.house-chrome')).toHaveClass(/is-docked/);expect((await page.locator('.house-chrome').boundingBox())!.y).toBe(0);
 // Removing the hero keeps the feature at the same visual position.
 await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(120);
 await expect.poll(async()=>(await diag(page)).active).toBe(false);const frozen=(await diag(page)).frames;
 await page.waitForTimeout(200);expect((await diag(page)).frames).toBe(frozen);
 await page.evaluate(()=>scrollTo(0,0));await page.mouse.move(20,500);await page.mouse.wheel(0,-600);await expect(page).toHaveURL(/#bulletin$/);expect((await page.locator('.house-chrome').boundingBox())!.y).toBe(0);await expect(page.locator('#house-hero')).toBeHidden();
 await page.locator('[data-ledger=events]').click();await expect(page.locator('#event-new')).toBeEnabled();await expect(page.locator('#house-hero')).toBeHidden();
 await page.locator('[data-ledger=home]').click();await expect(page.locator('#house-hero')).toBeVisible();await expect.poll(async()=>(await diag(page)).displayed).toBe('home');await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);
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

test('Home exposes theme controls and Settings contains notifications and the System preference',async({page})=>{
 await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});await page.goto('/');await ready(page);
 await expect(page.locator('#theme-toggle')).toBeVisible();await expect(page.locator('#theme-select')).toBeHidden();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 expect((await diag(page)).environment.sunVisible).toBe(false);expect((await diag(page)).environment.moonVisible).toBe(true);expect((await diag(page)).environment.starsOpacity).toBeGreaterThan(.5);
 expect((await diag(page)).environment.meteorVisible).toBe(false);await expect(page.locator('#house-hero img,#house-hero svg')).toHaveCount(0);
 await openNotifications(page);await expect(page.locator('#push-dialog')).toBeVisible();await expect.poll(async()=>(await diag(page)).paused).toBe(true);await expect(page.locator('#house-hero')).toHaveAttribute('data-sky-paused','true');await page.locator('#push-close').click();await expect.poll(async()=>(await diag(page)).paused).toBe(false);
 await setTheme(page,'light');await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 expect((await diag(page)).environment.starsOpacity).toBe(0);expect((await diag(page)).environment.sunVisible).toBe(true);expect((await diag(page)).environment.moonVisible).toBe(false);
 expect((await diag(page)).theme).toBe('light');
 await setTheme(page,'system');await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await page.emulateMedia({colorScheme:'light'});await expect(page.locator('html')).toHaveAttribute('data-theme','light');
});

test('pointer bursts are coalesced and the house keeps full resolution',async({page})=>{
 await page.goto('/');await ready(page);await page.mouse.move(1000,500);await page.mouse.down();
 const result=await page.evaluate(()=>{const before=(window as any).__houseDiagnostics().frames;for(let i=1;i<=24;i++)window.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,buttons:1,clientX:1000-i*5,clientY:500}));const canvas=document.querySelector<HTMLCanvasElement>('.stage-canvas')!;return {synchronousDraws:(window as any).__houseDiagnostics().frames-before,width:canvas.width,height:canvas.height,cssWidth:canvas.clientWidth,cssHeight:canvas.clientHeight,antialias:canvas.getContext('webgl2')!.getContextAttributes()!.antialias};});
 expect(result.synchronousDraws).toBe(0);expect(result.width).toBeGreaterThanOrEqual(result.cssWidth);expect(result.height).toBeGreaterThanOrEqual(result.cssHeight);expect(result.antialias).toBe(true);
 await page.mouse.up();await expect.poll(async()=>(await diag(page)).transitioning).toBe(false);expect((await diag(page)).selected).toBe('home');
});


test('day and night interpolate through landscape lighting and reverse without changing rooms',async({page})=>{
 test.setTimeout(90000);
 await page.emulateMedia({colorScheme:'light'});await page.goto('/');await ready(page);
 expect((await diag(page)).themeBlend).toBe(0);
 await page.locator('#theme-toggle').click();
 await expect.poll(async()=>(await diag(page)).themeBlend).toBeGreaterThan(.1);
 const middle=await diag(page);expect(middle.themeBlend).toBeLessThan(1);expect(middle.displayed).toBe('home');
 await page.locator('#theme-toggle').click();
 await expect.poll(async()=>(await diag(page)).themeBlend,{timeout:20000}).toBe(0);
 expect((await diag(page)).displayed).toBe('home');expect((await diag(page)).pixelRatio).toBeGreaterThanOrEqual(1);
 await page.locator('#theme-toggle').click();
 await expect.poll(async()=>(await diag(page)).themeBlend,{timeout:20000}).toBe(1);
 expect((await diag(page)).environment.moonVisible).toBe(true);expect((await diag(page)).environment.sunVisible).toBe(false);
});

test('night dims the roof and facade while preserving room, portrait and theater lighting',async({page})=>{
 await page.emulateMedia({colorScheme:'light',reducedMotion:'reduce'});await page.goto('/');await ready(page);
 // Compare actual rendered pixels with animation paused and clear of the sky.
 const roof={x:550,y:250,width:240,height:70},facade={x:550,y:400,width:220,height:120};
 const dayRoof=await page.screenshot({clip:roof}),dayFacade=await page.screenshot({clip:facade});
 await setTheme(page,'dark');
 expect((await page.screenshot({clip:roof})).equals(dayRoof)).toBe(false);
 expect((await page.screenshot({clip:facade})).equals(dayFacade)).toBe(false);
 await page.locator('.stage-canvas').focus();await page.keyboard.press('ArrowLeft');
 const rooms=[{x:490,y:385,width:200,height:115},{x:760,y:388,width:125,height:115},
  {x:530,y:580,width:135,height:140},{x:745,y:620,width:140,height:115}];
 const atNight=[];for(const clip of rooms)atNight.push(await page.screenshot({clip}));
 await setTheme(page,'light');
 for(const [i,clip] of rooms.entries())expect((await page.screenshot({clip})).equals(atNight[i])).toBe(true);
 await page.locator('.stage-canvas').focus();
 for(let i=0;i<2;i++)await page.keyboard.press('ArrowLeft');
 expect((await diag(page)).displayed).toBe('events');expect((await diag(page)).dark).toBe(true);
 const theater=await page.screenshot({clip:rooms[0]});
 await setTheme(page,'dark');
 expect((await page.screenshot({clip:rooms[0]})).equals(theater)).toBe(true);
 expect(theater.equals(atNight[0])).toBe(false);
});

test('rapid swipes and held arrow keys cannot queue extra rotations',async({page})=>{
 await page.goto('/');await ready(page);
 const canvas=page.locator('.stage-canvas');await canvas.focus();
 await page.mouse.move(1000,520);await page.mouse.down();await page.mouse.move(560,520,{steps:3});await page.mouse.up();
 await page.evaluate(()=>{
  const canvas=document.querySelector('.stage-canvas')!;
  // All of these arrive during the first turn, including swipes whose first
  // pointermove never reaches a rendered frame.
  for(let i=0;i<20;i++){
   canvas.dispatchEvent(new PointerEvent('pointerdown',{pointerId:20+i,button:0,clientX:900,clientY:520}));
   window.dispatchEvent(new PointerEvent('pointerup',{pointerId:20+i,button:0,clientX:700,clientY:520}));
   canvas.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight'}));
  }
 });
 expect((await diag(page)).requested).toBe('todos');expect((await diag(page)).cachedStages).toBe(2);
 await expect(page).toHaveURL(/#chores$/,{timeout:5000});
 expect((await diag(page)).transitioning).toBe(false);expect((await diag(page)).displayed).toBe('todos');
 await canvas.dispatchEvent('keydown',{key:'ArrowRight',repeat:true});
 expect((await diag(page)).transitioning).toBe(false);expect((await diag(page)).requested).toBe('todos');
 await canvas.focus();await page.keyboard.press('ArrowRight');await expect(page).toHaveURL(/#miscellaneous$/,{timeout:5000});
});

test('Settings pauses the scene, restores focus and keeps explicit theme choices across reloads',async({page})=>{
 await page.emulateMedia({colorScheme:'light'});await page.goto('/');await ready(page);
 await expect(page.getByRole('button',{name:'Switch to dark mode'})).toBeVisible();
 await page.locator('#settings-open').click();await expect.poll(async()=>(await diag(page)).paused).toBe(true);
 await expect(page.locator('#refresh')).toBeDisabled();await page.keyboard.press('Escape');
 await expect(page.locator('#settings-open')).toBeFocused();await expect.poll(async()=>(await diag(page)).paused).toBe(false);
 await page.getByRole('button',{name:'Switch to dark mode'}).click();
 await expect(page.getByRole('button',{name:'Switch to light mode'})).toBeVisible();
 await page.reload();await ready(page);await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await openNotifications(page);await page.locator('#push-close').click();await expect(page.locator('#settings-open')).toBeFocused();
 await setTheme(page,'system');await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.emulateMedia({colorScheme:'dark'});await expect(page.getByRole('button',{name:'Switch to light mode'})).toBeVisible();
});

test('the lawn notice board opens What’s new once per release, and Settings keeps the history',async({page})=>{
 await page.goto('/');await ready(page);
 const board=async()=>(await diag(page)).updatesBoard,dialog=page.locator('#updates-dialog');
 await expect.poll(async()=>(await board()).visible).toBe(true);
 await expect(page.locator('#updates-board-button')).toBeAttached();expect(await page.locator('#updates-board-button').isHidden()).toBe(false);
 const [x,y]=(await board()).screen;
 // A drag that starts on the board turns the house instead, and returning to the start cancels it.
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-160,y,{steps:6});await page.mouse.move(x,y,{steps:6});await page.mouse.up();
 await expect.poll(async()=>(await diag(page)).transitioning).toBe(false);
 await expect(dialog).toBeHidden();expect((await diag(page)).selected).toBe('home');expect((await diag(page)).state.variation).toBe(0);
 await page.mouse.click(x,y);
 await expect(dialog).toBeVisible();await expect(dialog.locator('h2')).toHaveText('What’s new');
 await expect(dialog.locator('li')).toHaveCount(5);await expect(dialog.locator('li').first()).toContainText('Keep scrolling past the end of a page');
 expect((await diag(page)).state.variation).toBe(0);
 expect(await page.evaluate(()=>localStorage.getItem('household-updates-seen'))).toBe('2026-10-polish');
 await page.getByRole('button',{name:'Got it'}).click();await expect(dialog).toBeHidden();
 await expect.poll(async()=>(await board()).state).toBe('hidden');expect((await board()).visible).toBe(false);
 await expect(page.locator('#updates-board-button')).toBeHidden();
 await page.reload();await ready(page);
 expect(await board()).toEqual({visible:false,state:'hidden'});await expect(page.locator('#updates-board-button')).toBeHidden();
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('#whats-new').click();
 await expect(page.locator('#settings-dialog')).toBeHidden();await expect(dialog).toBeVisible();
 await expect(dialog.locator('h2')).toHaveText('Update history');await expect(dialog.locator('.updates-release')).toHaveCount(1);
 await expect(dialog.locator('time').first()).toHaveText('Oct 22, 2026');await expect(dialog.locator('li')).toHaveCount(5);
 await page.getByRole('button',{name:'Close what’s new'}).click();await expect(dialog).toBeHidden();
 // An older seen release brings the board back for the newest one.
 await page.evaluate(()=>localStorage.setItem('household-updates-seen','2026-01-earlier'));await page.reload();await ready(page);
 await expect.poll(async()=>(await board()).visible).toBe(true);
 // Keyboards reach the board through a shortcut that appears on focus.
 await page.locator('#updates-board-button').focus();await expect(page.locator('#updates-board-button')).toHaveCSS('opacity','1');
 await page.keyboard.press('Enter');await expect(dialog).toBeVisible();await expect(dialog.locator('li')).toHaveCount(5);
});
