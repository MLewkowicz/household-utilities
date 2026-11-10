import {test,expect,type Page} from '@playwright/test';
const diag=(page:Page)=>page.evaluate(()=>(window as any).__globeDiagnostics());
const open=async(page:Page)=>{await page.goto('/#games/geography');await expect(page.locator('#geo-globe')).toHaveAttribute('data-ready','true',{timeout:60000});await expect(page.locator('#main')).toHaveAttribute('aria-busy','false');};
const countryPoint=(page:Page,id:string)=>page.evaluate(id=>(window as any).__globeDiagnostics().project(id),id);
// Software WebGL compiles the terrain and outline shaders during these interaction checks.
test.setTimeout(120000);
test.use({viewport:{width:1280,height:900},reducedMotion:'reduce'});
test.beforeEach(async({page})=>{await page.addInitScript(()=>{localStorage.setItem('household-person','michal');if(!localStorage.getItem('household-globe-style-v1'))localStorage.setItem('household-globe-style-v1','paper');});});

test('paper uses no terrain downloads; switching styles preserves the view and round',async({page})=>{
 const errors:string[]=[],textures:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/globe/'))textures.push(r.url());});
 await open(page);expect((await diag(page)).style).toBe('paper');expect(textures).toEqual([]);
 await page.locator('#geo-region').selectOption('Africa');const p=await countryPoint(page,'NGA');await page.mouse.click(p.x,p.y);await page.locator('#geo-answer').fill('Nigeria');await page.locator('#geo-check').click();await expect(page.locator('#geo-correct')).toHaveText('1');
 const view=(await diag(page)).view;await page.getByRole('button',{name:'Terrain',exact:true}).click();await expect.poll(async()=>(await diag(page)).style,{timeout:30000}).toBe('terrain');expect((await diag(page)).view).toEqual(view);expect(await page.evaluate(()=>localStorage.getItem('household-globe-style-v1'))).toBe('terrain');await expect(page.locator('#geo-correct')).toHaveText('1');expect(textures.some(t=>t.includes('color-8k'))).toBe(true);
 const terrainBorder=(await diag(page)).borderSample;expect((await diag(page)).borderWidth).toBeGreaterThan(1);await page.getByRole('button',{name:'Paper',exact:true}).click();await expect.poll(async()=>(await diag(page)).style).toBe('paper');expect((await diag(page)).detail.keys).toEqual([]);expect((await diag(page)).borderSample).not.toEqual(terrainBorder);
 await page.getByRole('button',{name:'Terrain',exact:true}).click();await expect.poll(async()=>(await diag(page)).style).toBe('terrain');expect((await diag(page)).borderSample).toEqual(terrainBorder);await page.getByRole('button',{name:'Paper',exact:true}).click();await expect.poll(async()=>(await diag(page)).style).toBe('paper');
 textures.length=0;await page.reload();await expect(page.locator('#geo-globe')).toHaveAttribute('data-ready','true',{timeout:60000});await expect(page.getByRole('button',{name:'Paper',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.locator('#geo-correct')).toHaveText('1');expect(textures).toEqual([]);expect(errors).toEqual([]);
});

test('hints preserve typing and triple-click reveals an unscored country with per-person progress',async({page})=>{
 await open(page);await page.locator('#geo-region').selectOption('Africa');const p=await countryPoint(page,'NGA');await page.mouse.click(p.x,p.y);
 await page.locator('#geo-answer').fill('my guess');await page.locator('#geo-hint').click();await expect(page.locator('#geo-hints')).toContainText('Western Africa');await expect(page.locator('#geo-answer')).toHaveValue('my guess');
 await page.locator('#geo-hint').click();await expect(page.locator('#geo-hints')).toContainText('Abuja');await page.locator('#geo-hint').click();await expect(page.locator('#geo-hint')).toBeDisabled();await expect(page.locator('#geo-correct')).toHaveText('0');
 const remaining=Number(await page.locator('#geo-remaining').textContent());await page.mouse.click(p.x,p.y,{clickCount:3,delay:80});await expect(page.locator('#geo-revealed')).toHaveText('1');await page.screenshot({path:'.local/paper-triple-verified.png'});await expect(page.locator('#geo-country-card h3')).toHaveText('Nigeria');await expect(page.locator('#geo-answer-form')).toBeHidden();await expect(page.locator('#geo-remaining')).toHaveText(String(remaining-1));await expect(page.locator('#geo-correct')).toHaveText('0');expect((await diag(page)).revealed).toEqual(['NGA']);
 await page.locator('#geo-player').selectOption('rina');await expect(page.locator('#geo-revealed-stat')).toBeHidden();await page.locator('#geo-player').selectOption('michal');await expect(page.locator('#geo-revealed')).toHaveText('1');await page.reload();await expect(page.locator('#geo-revealed-cards')).toContainText('Nigeria');
 await page.locator('#geo-revealed-cards [data-review=NGA]').click();await expect(page.locator('#geo-selection')).toContainText('not scored');await expect(page.locator('#geo-correct')).toHaveText('0');
});

test('timed rounds disable hints and triple-click reveal; untimed reveal can finish a round',async({page})=>{
 await open(page);await page.locator('#geo-settings').click();await page.locator('#geo-new-region').selectOption('Africa');await page.locator('#geo-time-limit').selectOption('60');await page.locator('#geo-new-round').click();const p=await countryPoint(page,'NGA');await page.mouse.click(p.x,p.y,{clickCount:3,delay:80});await expect(page.locator('#geo-assistance')).toBeHidden();await expect(page.locator('#geo-answer-form')).toBeVisible();await expect(page.locator('#geo-revealed')).toHaveText('0');
 await page.locator('#geo-settings').click();await page.locator('#geo-new-region').selectOption('Antarctica');await page.locator('#geo-time-limit').selectOption('0');await page.locator('#geo-life-limit').selectOption('3');await page.locator('#geo-new-round').click();await page.locator('#geo-random').click();await page.locator('#geo-reveal').click();await expect(page.locator('#geo-result')).toContainText('0 correct, 1 revealed of 1');await expect(page.locator('#geo-remaining')).toHaveText('0');await expect(page.locator('#geo-lives')).toHaveText('3');await expect(page.locator('#geo-random')).toBeDisabled();
});

test('fallback supports hints, paper style, and the triple-click shortcut',async({page})=>{
 await page.goto('/?webgl=0#games/geography');const poland=page.locator('#geo-land [data-country=POL]');await poland.click();await page.locator('#geo-hint').click();await expect(page.locator('#geo-hints')).toContainText('Europe');await poland.click({clickCount:3,delay:80});await expect(page.locator('#geo-revealed')).toHaveText('1');await expect(page.locator('#geo-country-card h3')).toHaveText('Poland');await expect(page.locator('#geo-map')).toHaveAttribute('data-style','paper');
});
