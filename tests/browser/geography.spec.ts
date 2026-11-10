import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';import {inRegion,type Country} from '../../src/geography';import {globeRegionView} from '../../src/globe-math';
const countries=JSON.parse(readFileSync('src/geography-data.json','utf8')) as Country[];
const diag=(page:Page)=>page.evaluate(()=>(window as any).__globeDiagnostics());
const open=async(page:Page)=>{await page.goto('/#games/geography');await expect(page.locator('#geo-globe')).toHaveAttribute('data-ready','true',{timeout:60000});await expect(page.locator('#main')).toHaveAttribute('aria-busy','false');};
async function select(page:Page,id:string){const d=await diag(page),pool=countries.filter(c=>inRegion(c,d.region)&&!d.correct.includes(c.id)&&!d.revealed.includes(c.id)&&c.id!==d.selected),index=pool.findIndex(c=>c.id===id);expect(index).toBeGreaterThanOrEqual(0);await page.evaluate(value=>{(window as any).savedRandom=Math.random;Math.random=()=>value;},(index+.5)/pool.length);await page.locator('#geo-random').click();await page.evaluate(()=>{Math.random=(window as any).savedRandom;});await expect(page.locator('#geo-answer-form')).toBeVisible();}
const submit=async(page:Page,answer:string)=>{await page.locator('#geo-answer').fill(answer);await page.locator('#geo-check').click();};
// Software WebGL compiles the terrain and outline shaders during these interaction checks.
test.setTimeout(120000);
test.use({reducedMotion:'reduce',viewport:{width:1280,height:900}});
test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('household-person','michal'));});
test('unlabeled globe accepts aliases, greens correct countries, shows facts and keeps per-person progress',async({page})=>{
 await open(page);await expect(page.locator('#geo-globe')).not.toHaveAttribute('aria-label',/Poland/);await select(page,'POL');await page.locator('#geo-answer').fill('Polnad');await expect(page.locator('#geo-suggestions')).toContainText('Poland');await page.locator('#geo-suggestions li').first().click();await page.locator('#geo-check').click();
 await expect(page.locator('#geo-correct')).toHaveText('1');expect((await diag(page)).correct).toEqual(['POL']);await expect(page.locator('#geo-country-card')).toContainText('Warsaw');await expect(page.locator('#geo-country-card li')).toHaveCount(4);await expect(page.locator('#geo-country-card a')).toHaveCount(0);
 await page.reload();await expect(page.locator('#geo-correct')).toHaveText('1');await expect(page.locator('#geo-collection')).toContainText('Poland');await page.locator('#geo-player').selectOption('rina');await expect(page.locator('#geo-correct')).toHaveText('0');await page.locator('#geo-player').selectOption('michal');await expect(page.locator('#geo-correct')).toHaveText('1');
});
test('regional suggestions, random zoom, rotation and reset preserve the round',async({page})=>{
 // Rebuilding the terrain after reload can exceed two minutes on software WebGL.
 test.setTimeout(180000);
 await open(page);await page.locator('#geo-region').selectOption('Micronesia');const count=await page.locator('#geo-remaining').textContent();expect(Number(count)).toBeGreaterThan(5);expect((await diag(page)).view).toEqual(globeRegionView('Micronesia'));
 await select(page,'PLW');expect((await diag(page)).view.distance).toBeLessThan(1.5);await page.locator('#geo-answer').fill('Fiji');await expect(page.locator('#geo-suggestions')).toBeHidden();await page.locator('#geo-answer').fill('Pal');await expect(page.locator('#geo-suggestions')).toContainText('Palau');
 await page.locator('#geo-reset-view').click();expect((await diag(page)).view).toEqual(globeRegionView('Micronesia'));await expect(page.locator('#geo-remaining')).toHaveText(count!);await expect(page.locator('#geo-lives')).toHaveText('∞');
 const globe=page.locator('#geo-globe'),r=(await globe.boundingBox())!;await page.mouse.move(r.x+r.width*.5,r.y+r.height*.5);await page.mouse.down();await page.mouse.move(r.x+r.width*.5+70,r.y+r.height*.5+25,{steps:4});await page.mouse.up();expect((await diag(page)).view.lon).not.toBe(158);
 await page.locator('#geo-reset-view').click();await submit(page,'Palau');await expect(page.locator('#geo-remaining')).toHaveText(String(Number(count)-1));await page.reload();await expect(page.locator('#geo-globe')).toHaveAttribute('data-ready','true',{timeout:60000});await expect(page.locator('#geo-region')).toHaveValue('Micronesia');expect((await diag(page)).view).toEqual(globeRegionView('Micronesia'));
});
test('lives end rounds and the timer keeps running through the hub and navigation',async({page})=>{
 await page.clock.install();await open(page);await page.locator('#geo-settings').click();await page.locator('#geo-new-region').selectOption('Micronesia');await page.locator('#geo-life-limit').selectOption('3');await page.locator('#geo-time-limit').selectOption('60');await page.locator('#geo-new-round').click();await expect(page.locator('#geo-clock')).toHaveText('1:00');await page.clock.fastForward(10000);await expect(page.locator('#geo-clock')).toHaveText('1:00');await select(page,'PLW');
 for(let i=0;i<3;i++)await submit(page,'Nauru');await expect(page.locator('#geo-lives')).toHaveText('0');await expect(page.locator('#geo-result')).toContainText('out of lives');await expect(page.locator('#geo-answer-form')).toBeHidden();await page.locator('#geo-play-again').click();await page.locator('#geo-new-round').click();await select(page,'PLW');await page.locator('.observatory-hub-link').click();await page.clock.fastForward(61000);await page.locator('#geo-launch').click();await expect(page.locator('#geo-result')).toContainText('Time’s up');await expect(page.locator('#geo-correct')).toHaveText('0');await expect(page.locator('#geo-random')).toBeDisabled();
});
test('real globe hit testing and keyboard controls work, and layouts fit phone and desktop',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await open(page);await page.locator('#geo-region').selectOption('Africa');const point=await page.evaluate(()=>(window as any).__globeDiagnostics().project('NGA'));expect(point.visible).toBe(true);await page.mouse.click(point.x,point.y);await submit(page,'Nigeria');await expect(page.locator('#geo-correct')).toHaveText('1');
 const globe=page.locator('#geo-globe');await globe.focus();const before=(await diag(page)).view.lon;await page.keyboard.press('ArrowRight');expect((await diag(page)).view.lon).toBeGreaterThan(before);await page.keyboard.press('Home');expect((await diag(page)).view).toEqual(globeRegionView('Africa'));
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await expect(page.locator('#geo-reset-view')).toBeVisible();}expect(errors).toEqual([]);
});
test('touch rotation and pinch stay in the globe; reset restores the preset',async({browser})=>{
 const context=await browser.newContext({baseURL:'http://127.0.0.1:4174',viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),page=await context.newPage();await open(page);const r=(await page.locator('#geo-globe').boundingBox())!,x=r.x+r.width/2,y=r.y+r.height/2,session=await context.newCDPSession(page);
 const send=(type:string,points:{x:number;y:number;id:number}[])=>session.send('Input.dispatchTouchEvent',{type,touchPoints:points});const before=(await diag(page)).view;await send('touchStart',[{x,y,id:1}]);await send('touchMove',[{x:x+45,y:y+65,id:1}]);await send('touchEnd',[]);expect((await diag(page)).view.lon).not.toBe(before.lon);await expect(page).toHaveURL(/#games\/geography$/);
 await send('touchStart',[{x:x-30,y,id:1},{x:x+30,y,id:2}]);await send('touchMove',[{x:x-70,y,id:1},{x:x+70,y,id:2}]);await send('touchEnd',[]);expect((await diag(page)).view.distance).toBeLessThan(before.distance);await page.locator('#geo-reset-view').click();expect((await diag(page)).view).toEqual(globeRegionView('World'));await expect(page.locator('#geo-correct')).toHaveText('0');await context.close();
});
test('a graphics failure retains the quiz on a plain unlabeled fallback map',async({page})=>{
 await page.goto('/?webgl=0#games/geography');await expect(page.locator('#geo-map')).toBeVisible();await expect(page.locator('.globe-fallback-notice')).toBeVisible();await page.locator('#geo-land [data-country=POL]').focus();await page.keyboard.press('Enter');await submit(page,'Poland');await expect(page.locator('#geo-correct')).toHaveText('1');
});

test('close-up detail loads on demand, stays bounded, and reset cancels stale loads',async({page})=>{
 test.setTimeout(180000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await open(page);
 expect((await diag(page)).detail.keys).toEqual([]);
 await select(page,'NPL');await expect.poll(async()=>(await diag(page)).detail.keys.length,{timeout:30000}).toBeGreaterThan(0);await expect.poll(async()=>(await diag(page)).detail.pending,{timeout:30000}).toBe(0);
 const detailed=await diag(page);expect(detailed.detail.keys.length).toBeGreaterThan(0);expect(detailed.detail.keys.length).toBeLessThanOrEqual(4);
 await submit(page,'Nepal');await expect(page.locator('#geo-correct')).toHaveText('1');
 await page.locator('#geo-reset-view').click();await expect.poll(async()=>(await diag(page)).detail.keys,{timeout:30000}).toEqual([]);
 let release:()=>void=()=>{};const held=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/globe/detail-*.webp',async route=>{await held;await route.continue().catch(()=>{});});
 await select(page,'POL');await expect.poll(async()=>(await diag(page)).detail.pending,{timeout:30000}).toBeGreaterThan(0);
 await page.locator('#geo-reset-view').click();release();await expect.poll(async()=>(await diag(page)).detail.pending,{timeout:30000}).toBe(0);
 expect((await diag(page)).detail.keys).toEqual([]);await expect(page.locator('#geo-correct')).toHaveText('1');expect(errors).toEqual([]);
});
