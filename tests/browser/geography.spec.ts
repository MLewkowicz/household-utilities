import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {inPool,type Country} from '../../src/geography';
import {globeRegionView} from '../../src/globe-math';
const countries=JSON.parse(readFileSync('src/geography-data.json','utf8')) as Country[];
const diag=(page:Page)=>page.evaluate(()=>(window as any).__globeDiagnostics());
const ready=(page:Page)=>expect(page.locator('#main')).toHaveAttribute('aria-busy','false',{timeout:60000});
async function settings(page:Page,region='World',mode='practice',scope='countries'){await page.locator('#geo-settings').click();await page.locator('#geo-new-region').selectOption(region);await page.locator('#geo-mode').selectOption(mode);await page.locator('#geo-scope').selectOption(scope);}
async function start(page:Page,region='World',mode='practice',scope='countries'){await settings(page,region,mode,scope);await page.locator('#geo-new-round').click();}
async function open(page:Page,webgl=false){await page.goto(webgl?'/#games/geography':'/?webgl=0#games/geography');await ready(page);if(webgl)await expect(page.locator('#geo-globe')).toHaveAttribute('data-ready','true',{timeout:60000});}
async function randomCountry(page:Page,id:string){
 const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('household-geography-v1:michal')||'null'));
 const selected=await page.evaluate(()=>(window as any).__globeDiagnostics?.().selected);
 const pool=countries.filter(c=>inPool(c,state?.region||'World',state?.scope||'countries')&&!state?.correct.includes(c.id)&&!state?.revealed.includes(c.id)&&c.id!==selected);
 const index=pool.findIndex(c=>c.id===id);expect(index).toBeGreaterThanOrEqual(0);
 await page.evaluate(value=>{(window as any).originalRandom=Math.random;Math.random=()=>value;},(index+.5)/pool.length);await page.locator('#geo-random').click();await page.evaluate(()=>{Math.random=(window as any).originalRandom;});
}
async function pick(page:Page,id:string){await page.locator(`#geo-land [data-country=${id}]`).focus();await page.keyboard.press('Enter');}
const submit=async(page:Page,answer:string)=>{await page.locator('#geo-answer').fill(answer);await page.locator('#geo-check').click();};
test.use({reducedMotion:'reduce',viewport:{width:1280,height:900}});
test.setTimeout(120000);
test.beforeEach(async({page})=>{await page.addInitScript(()=>{localStorage.setItem('household-person','michal');if(!localStorage.getItem('household-globe-style-v1'))localStorage.setItem('household-globe-style-v1','paper');});});

test('compact screen keeps configuration in a menu, saves answers and separates household players',async({page})=>{
 await open(page);await expect(page.locator('#geo-new-region')).toBeHidden();await expect(page.locator('#geo-total')).toHaveText('195');
 expect((await page.locator('#geo-surface').boundingBox())!.y).toBeLessThan(120);
 await pick(page,'POL');await page.locator('#geo-answer').fill('Polnad');await page.locator('#geo-suggestions li').first().click();await expect(page.locator('#geo-correct')).toHaveText('0');await page.locator('#geo-check').click();await expect(page.locator('#geo-correct')).toHaveText('1');await expect(page.locator('#geo-country-card')).toContainText('Warsaw');
 await expect(page.locator('#geo-country-card .atlas-history')).not.toBeEmpty();await page.locator('#geo-country-card summary').click();await expect(page.locator('#geo-country-card details')).toHaveAttribute('open','');
 await page.reload();await ready(page);await expect(page.locator('#geo-correct')).toHaveText('1');await page.locator('#geo-settings').click();await page.locator('#geo-review').click();await expect(page.locator('#geo-collection')).toContainText('Poland');await page.locator('#geo-review-close').click();
 await page.locator('#geo-settings').click();await page.locator('#geo-player').selectOption('rina');await expect(page.locator('#geo-correct')).toHaveText('0');await page.locator('#geo-player').selectOption('michal');await expect(page.locator('#geo-correct')).toHaveText('1');
});

test('expanded World contains Antarctica, which is never a separate region option',async({page})=>{
 await open(page);await expect(page.locator('#geo-land [data-country=ATA]')).toHaveClass(/outside-region/);await settings(page,'World','practice','expanded');await expect(page.locator('#geo-new-region option[value=Antarctica]')).toHaveCount(0);await page.locator('#geo-new-round').click();await expect(page.locator('#geo-total')).toHaveText('242');await expect(page.locator('#geo-land [data-country=ATA]')).not.toHaveClass(/outside-region/);await pick(page,'ATA');await submit(page,'Antarctica');await expect(page.locator('#geo-correct')).toHaveText('1');
});

test('competitive results persist once and appear on the shared region leaderboard',async({page})=>{
 await open(page);await start(page,'Micronesia','competitive');await expect(page.locator('#geo-clock')).toHaveText('5:00');await pick(page,'PLW');await expect(page.locator('#geo-assistance')).toBeHidden();await submit(page,'Palau');await pick(page,'NRU');for(let i=0;i<3;i++)await submit(page,'Japan');
 await expect(page.locator('#geo-result')).toContainText('25 points');await expect(page.locator('#geo-answer-form')).toBeHidden();await page.locator('#geo-result a').click();await expect(page.locator('#geo-score-status')).toHaveText('Shared household scores');await expect(page.locator('#geo-score-list')).toContainText('Michal');await expect(page.locator('#geo-score-list')).toContainText('25');await expect(page.locator('#geo-surface')).toBeHidden();
 await page.locator('#geo-score-scope').selectOption('expanded');await expect(page.locator('#geo-score-list')).toContainText('No completed rounds');await page.locator('#geo-score-scope').selectOption('countries');await page.reload();await ready(page);await expect(page.locator('#geo-score-list')).toContainText('Michal');
 const local=await page.evaluate(()=>JSON.parse(localStorage.getItem('household-geography-scores-v1')||'[]'));expect(local).toHaveLength(1);expect(local[0].pending).toBe(false);
});

test('failed score sync keeps an honest pending result and retries without duplicates',async({page})=>{
 await page.route('**/rest/v1/rpc/utilities_save_geography_score',r=>r.fulfill({status:503,body:'{"message":"offline"}'}));await open(page);await start(page,'Polynesia','competitive');await pick(page,'TUV');for(let i=0;i<3;i++)await submit(page,'Samoa');await page.locator('#geo-result a').click();await expect(page.locator('#geo-score-status')).toContainText('Shared scores unavailable');await expect(page.locator('#geo-score-list')).toContainText('pending');
 await page.unroute('**/rest/v1/rpc/utilities_save_geography_score');await page.locator('#geo-score-retry').click();await expect(page.locator('#geo-score-status')).toHaveText('Shared household scores');await expect(page.locator('#geo-score-list')).not.toContainText('pending');
});

test('timed practice continues through the continue screen and prevents late answers',async({page})=>{
 await page.clock.install();await open(page);await settings(page,'Micronesia');await page.locator('#geo-time-limit').selectOption('60');await page.locator('#geo-new-round').click();await page.clock.fastForward(10000);await expect(page.locator('#geo-clock')).toHaveText('1:00');await pick(page,'PLW');await page.locator('#geo-settings').click();await page.locator('#geo-pause-link').click();await expect(page.locator('#geo-launch')).toHaveText('Continue');await page.clock.fastForward(61000);await page.locator('#geo-launch').click();await expect(page.locator('#geo-result')).toContainText('Time’s up');await expect(page.locator('#geo-random')).toBeDisabled();
});

test('learning shuffles, pauses in settings, reveals with a label and accepts map answers',async({page})=>{
 await page.clock.install();await open(page);await start(page,'Micronesia','learn');await expect(page.locator('#geo-learning-prompt')).toContainText('Find ');await expect(page.locator('#geo-answer-form')).toBeHidden();
 const target=await page.evaluate(()=>JSON.parse(localStorage.getItem('household-geography-v1:michal')!).learningTarget);
 await page.locator('#geo-settings').click();await page.clock.fastForward(20000);await page.locator('#geo-settings-close').click();await expect(page.locator('#geo-revealed')).toHaveText('0');await page.clock.fastForward(12500);await expect(page.locator('#geo-revealed')).toHaveText('1');await expect(page.locator('.globe-country-label')).toHaveText(countries.find(c=>c.id===target)!.name);await expect(page.locator('#geo-next')).toBeVisible();await expect(page.locator('#geo-correct')).toHaveText('0');
 await page.reload();await ready(page);await expect(page.locator('#geo-next')).toBeVisible();await page.locator('#geo-next').click();const next=await page.evaluate(()=>JSON.parse(localStorage.getItem('household-geography-v1:michal')!).learningTarget);expect(next).not.toBe(target);await pick(page,next);await expect(page.locator('#geo-correct')).toHaveText('1');await expect(page.locator('#geo-next')).toBeVisible();
 await page.locator('#geo-next').click();await page.locator('#geo-show-me').click();await expect(page.locator('#geo-revealed')).toHaveText('2');
});

test('real globe targets islands, rotates, zooms deeper and remains idle after settling',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await open(page,true);await start(page,'Micronesia');await randomCountry(page,'NRU');await page.locator('#geo-close-answer').click();const p=await page.evaluate(()=>(window as any).__globeDiagnostics().project('NRU'));await page.mouse.click(p.x+10,p.y+6);await submit(page,'Nauru');await expect(page.locator('#geo-correct')).toHaveText('1');await page.locator('#geo-dismiss-card').click();
 await page.locator('#geo-zoom-in').click();expect((await diag(page)).view.distance).toBeLessThan(1.07);await page.locator('#geo-reset-view').click();expect((await diag(page)).view).toEqual(globeRegionView('Micronesia'));
 await page.locator('#geo-globe').focus();await page.keyboard.press('ArrowRight');expect((await diag(page)).view.lon).toBeGreaterThan(158);await page.keyboard.press('Home');expect((await diag(page)).view).toEqual(globeRegionView('Micronesia'));
 await expect.poll(async()=>{const frames=(await diag(page)).frames;await page.waitForTimeout(300);return (await diag(page)).frames-frames;},{timeout:10000}).toBe(0);expect(errors).toEqual([]);
 await page.setViewportSize({width:390,height:844});await start(page,'Micronesia','learn');await page.locator('#geo-show-me').click();await expect(page.locator('.globe-country-label')).toBeVisible();await expect(page.locator('#geo-revealed')).toHaveText('1');await page.screenshot({path:'.local/geography-phone-globe.png'});
});

test('terrain detail stays bounded and styles preserve the camera and round',async({page})=>{
 test.setTimeout(180000);await open(page,true);await page.locator('#geo-settings').click();await page.getByRole('button',{name:'Terrain',exact:true}).click();await expect.poll(async()=>(await diag(page)).style,{timeout:30000}).toBe('terrain');await page.locator('#geo-settings-close').click();await randomCountry(page,'NPL');
 await expect.poll(async()=>(await diag(page)).detail.keys.length,{timeout:30000}).toBeGreaterThan(0);await expect.poll(async()=>(await diag(page)).detail.pending,{timeout:30000}).toBe(0);expect((await diag(page)).detail.keys.length).toBeLessThanOrEqual(4);await submit(page,'Nepal');await expect(page.locator('#geo-correct')).toHaveText('1');await page.locator('#geo-dismiss-card').click();
 const view=(await diag(page)).view;await page.locator('#geo-settings').click();await page.getByRole('button',{name:'Paper',exact:true}).click();await expect.poll(async()=>(await diag(page)).style).toBe('paper');expect((await diag(page)).view).toEqual(view);expect((await diag(page)).detail.keys).toEqual([]);await expect(page.locator('#geo-correct')).toHaveText('1');await page.locator('#geo-settings-close').click();await page.locator('#geo-reset-view').click();expect((await diag(page)).view).toEqual(globeRegionView('World'));
});
