import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {inPool,type Country} from '../../src/geography';
import {globeRegionView} from '../../src/globe-math';
const countries=JSON.parse(readFileSync('src/geography-data.json','utf8')) as Country[];
const diag=(page:Page)=>page.evaluate(()=>(window as any).__globeDiagnostics());
const ready=(page:Page)=>expect(page.locator('#main')).toHaveAttribute('aria-busy','false',{timeout:60000});
async function settings(page:Page,region='World',mode='practice',scope='countries'){
 await page.locator('#geo-settings').click();await page.locator('#geo-mode').selectOption(mode.includes('cities')?'cities':mode.includes('route')?'route':'countries');await page.locator('#geo-session').selectOption(mode.startsWith('competitive')||mode==='daily-route'?'ranked':'practice');await page.locator('#geo-question').selectOption(mode==='learn'||mode==='competitive-find'?'find':'name');
 await page.locator('#geo-new-region').selectOption(region);if(await page.locator('#geo-pool-options').getAttribute('open')===null)await page.locator('#geo-pool-options summary').click();await page.locator('#geo-scope').selectOption(scope);if(mode==='practice'&&await page.locator('#geo-practice-options').getAttribute('open')===null)await page.locator('#geo-practice-options summary').click();
}
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
 await pick(page,'POL');await page.locator('#geo-answer').fill('Polnad');await page.locator('#geo-suggestions li').first().click();await expect(page.locator('#geo-correct')).toHaveText('1');await expect(page.locator('#geo-country-card')).toContainText('Warsaw');
 await expect(page.locator('#geo-country-card .atlas-history').first()).not.toBeEmpty();await page.locator('#geo-country-card .atlas-stories summary').click();await expect(page.locator('#geo-country-card .atlas-stories')).toHaveAttribute('open','');
 await page.reload();await ready(page);await expect(page.locator('#geo-correct')).toHaveText('1');await page.locator('#geo-study').click();await page.getByRole('searchbox',{name:'Find a place'}).fill('Poland');await page.locator('#geo-review-results button').first().click();await expect(page.locator('#geo-country-card')).toContainText('Poland');await page.locator('#geo-study').click();
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
 await page.clock.install();await open(page);await settings(page,'Micronesia');await page.locator('#geo-time-limit').selectOption('60');await page.locator('#geo-new-round').click();await page.clock.fastForward(10000);await expect(page.locator('#geo-clock')).toHaveText('1:00');await pick(page,'PLW');await page.locator('#geo-settings').click();await page.locator('#geo-pause-link').click();await expect(page.locator('[data-orbit-game=geography]')).toHaveAccessibleName('Play Geography');await page.clock.fastForward(61000);await page.locator('[data-orbit-game=geography]').click();await expect(page.locator('#geo-result')).toContainText('Time’s up');await expect(page.locator('#geo-random')).toBeDisabled();
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
 test.setTimeout(180000);await open(page,true);await page.locator('#geo-settings').click();await page.getByRole('button',{name:'Terrain',exact:true}).click();await expect.poll(async()=>(await diag(page)).style,{timeout:60000}).toBe('terrain');await page.locator('#geo-settings-close').click();await randomCountry(page,'NPL');
 await expect.poll(async()=>(await diag(page)).detail.keys.length,{timeout:30000}).toBeGreaterThan(0);await expect.poll(async()=>(await diag(page)).detail.pending,{timeout:30000}).toBe(0);expect((await diag(page)).detail.keys.length).toBeLessThanOrEqual(4);await submit(page,'Nepal');await expect(page.locator('#geo-correct')).toHaveText('1');await page.locator('#geo-dismiss-card').click();
 const view=(await diag(page)).view;await page.locator('#geo-settings').click();await page.getByRole('button',{name:'Paper',exact:true}).click();await expect.poll(async()=>(await diag(page)).style).toBe('paper');expect((await diag(page)).view).toEqual(view);expect((await diag(page)).detail.keys).toEqual([]);await expect(page.locator('#geo-correct')).toHaveText('1');await page.locator('#geo-settings-close').click();await page.locator('#geo-reset-view').click();expect((await diag(page)).view).toEqual(globeRegionView('World'));
});

test('suggestions submit once by click and keyboard, including wrong answers',async({page})=>{
 await open(page);await start(page,'Europe','competitive');await pick(page,'POL');
 await page.locator('#geo-answer').fill('France');await page.getByRole('option',{name:'France',exact:true}).click();await expect(page.locator('#geo-lives')).toHaveText('2');await expect(page.locator('#geo-correct')).toHaveText('0');
 await page.locator('#geo-answer').fill('Pol');await page.locator('#geo-answer').press('ArrowDown');await page.locator('#geo-answer').press('Enter');await expect(page.locator('#geo-correct')).toHaveText('1');await expect(page.locator('#geo-lives')).toHaveText('2');
});

test('find competition advances after every guess and saves to its own leaderboard',async({page})=>{
 const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('household-geography-v1:michal')!));
 await open(page);await start(page,'Polynesia','competitive-find');const initial=await state();const order=initial.findOrder as string[];
 await expect(page.locator('#geo-learning-prompt')).toHaveText(`Find ${countries.find(c=>c.id===order[0])!.name}`);await expect(page.locator('#geo-answer-form')).toBeHidden();await expect(page.locator('#geo-next')).toBeHidden();await expect(page.locator('#geo-show-me')).toBeHidden();
 await page.locator('#geo-settings').click();await expect(page.locator('#geo-study')).toBeDisabled();await page.locator('#geo-settings-close').click();
 await pick(page,order[1]);await expect(page.locator('#geo-lives')).toHaveText('2');expect((await state()).findTarget).toBe(order[1]);await expect(page.locator('#geo-feedback')).toContainText('Missed');
 await page.reload();await ready(page);expect((await state()).findTarget).toBe(order[1]);
 await pick(page,order[1]);await expect(page.locator('#geo-correct')).toHaveText('1');expect((await state()).findTarget).toBe(order[2]);
 await pick(page,order[1]);await expect(page.locator('#geo-result')).toContainText('50 points');expect((await state()).missed).toEqual([order[0],order[2]]);
 await page.locator('#geo-result a').click();await expect(page.locator('#geo-score-challenge')).toHaveValue('find');await expect(page.locator('#geo-score-status')).toHaveText('Shared household scores');await expect(page.locator('#geo-score-list')).toContainText('50');
 await page.locator('#geo-score-challenge').selectOption('name');await expect(page.locator('#geo-score-list')).not.toContainText('1/3');
});

test('find competition ignores map drags and counts an empty-map click as one miss',async({page})=>{
 await open(page);await start(page,'Europe','competitive-find');const map=page.locator('#geo-map'),box=(await map.boundingBox())!;
 await page.mouse.move(box.x+10,box.y+10);await page.mouse.down();await page.mouse.move(box.x+70,box.y+50,{steps:8});await page.mouse.up();await expect(page.locator('#geo-lives')).toHaveText('3');
 await map.click({position:{x:5,y:5}});await expect(page.locator('#geo-lives')).toHaveText('2');
 await page.locator('#geo-reset-view').click();await page.locator('#geo-land [data-country=POL]').dblclick({delay:60});const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('household-geography-v1:michal')!));expect(state.missed.length+state.correct.length).toBe(3);
});

test('review planet labels countries and preserves the learning round',async({page})=>{
 await page.clock.install();await open(page);await start(page,'Caribbean','learn');const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('household-geography-v1:michal')!));
 await page.locator('#geo-study').click();await expect(page.locator('#geography-page')).toHaveAttribute('data-mode','review');await page.getByRole('searchbox',{name:'Find a place'}).fill('Poland');await page.locator('#geo-review-results button').first().click();await expect(page.locator('#geo-country-card')).toContainText('Chapels carved from salt');await expect(page.locator('#geo-country-card')).toContainText('more stories');
 await page.clock.fastForward(20000);await page.locator('#geo-study').click();await expect(page.locator('#geography-page')).toHaveAttribute('data-mode','quiz');await expect(page.locator('#geo-revealed')).toHaveText('0');
 const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('household-geography-v1:michal')!));expect(after.id).toBe(before.id);expect(after.learningTarget).toBe(before.learningTarget);expect(after.region).toBe('Caribbean');expect(after.correct).toEqual(before.correct);
});

test('real globe submits each find-mode tap once and does not count rotation as a guess',async({page})=>{
 await open(page,true);await start(page,'Europe','competitive-find');
 const canvas=page.locator('#geo-globe'),box=(await canvas.boundingBox())!;
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+45,box.y+box.height/2+20,{steps:8});await page.mouse.up();await expect(page.locator('#geo-lives')).toHaveText('3');await page.locator('#geo-reset-view').click();
 const target=await page.evaluate(()=>JSON.parse(localStorage.getItem('household-geography-v1:michal')!).findTarget),id=target==='POL'?'FRA':'POL';
 const p=await page.evaluate(id=>(window as any).__globeDiagnostics().project(id),id);expect(p.visible).toBe(true);await page.mouse.dblclick(p.x,p.y,{delay:60});
 const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('household-geography-v1:michal')!));expect(state.missed.length+state.correct.length).toBe(2);await expect(page.locator('#geo-result')).toBeHidden();await expect(page.locator('#geo-learning-prompt')).toContainText('Find ');
});
