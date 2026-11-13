import {test,expect,type Page} from '@playwright/test';

const open=async(page:Page)=>{await page.goto('/?webgl=0#games/how-much-ish');await expect(page.getByRole('slider')).toBeVisible();};
const ratio=(page:Page)=>page.getByRole('slider').getAttribute('aria-valuenow').then(Number);
const position=(page:Page,selector:string)=>page.locator(selector).evaluate((el:HTMLElement)=>({left:el.style.left,top:el.style.top,width:el.style.width,height:el.style.height}));
async function drag(page:Page,x:number,y:number,dx:number,dy:number){await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:8});await page.mouse.up();}

test('moving, panning and zooming preserve the guess; only resizing changes it',async({page})=>{
 await open(page);const initial=await ratio(page),ref=await position(page,'.scale-object.reference'),target=await position(page,'.scale-object.target');
 await page.getByRole('button',{name:'Move Golden Retriever'}).focus();await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowUp');
 expect(await ratio(page)).toBe(initial);expect(await position(page,'.scale-object.target')).not.toEqual(target);expect(await position(page,'.scale-object.reference')).toEqual(ref);
 const stage=page.locator('.scale-stage'),box=(await stage.boundingBox())!,zoom=Number(await stage.getAttribute('data-zoom'));
 await drag(page,box.x+80,box.y+40,40,20);expect(await ratio(page)).toBe(initial);
 await page.getByRole('button',{name:'Zoom in',exact:true}).click();expect(Number(await stage.getAttribute('data-zoom'))).toBeGreaterThan(zoom);expect(await ratio(page)).toBe(initial);
 await page.mouse.move(box.x+box.width/2,box.y+80);await page.mouse.wheel(0,180);await expect.poll(async()=>Number(await stage.getAttribute('data-zoom'))).toBeLessThan(zoom);expect(await ratio(page)).toBe(initial);
 await page.getByRole('button',{name:'Fit both silhouettes'}).click();const handle=(await page.getByRole('slider').boundingBox())!;
 await drag(page,handle.x+handle.width/2,handle.y+handle.height/2,35,-30);expect(await ratio(page)).toBeGreaterThan(initial);expect(await position(page,'.scale-object.reference')).toEqual(ref);
 const saved=await ratio(page);await page.reload();await expect(page.getByRole('slider')).toHaveAttribute('aria-valuenow',String(saved));
 await page.locator('[data-game-return]').click();await expect(page.locator('#trivia-page')).toBeHidden();await page.goBack();await expect(page.getByRole('slider')).toBeVisible();await page.getByRole('slider').focus();await page.keyboard.press('ArrowDown');expect(await ratio(page)).toBeLessThan(saved);
});

test('all three categories have distinct boards and resume their own draft',async({page})=>{
 await open(page);await page.getByRole('slider').focus();await page.keyboard.press('ArrowDown');const classic=await ratio(page);
 await page.getByRole('button',{name:'Pop culture',exact:true}).click();await expect(page.locator('.size-card h2')).toContainText('Aang');
 await page.locator('[data-archive-entry=size-pop-culture-3]').click();const prompt=await page.locator('.size-card h2').textContent();await page.getByRole('slider').focus();await page.keyboard.press('ArrowUp');const pop=await ratio(page);
 await page.getByRole('button',{name:'Geography',exact:true}).click();await expect(page.locator('.size-caption')).toContainText('Germany');await expect(page.locator('.size-caption')).toContainText('Texas');
 await page.getByRole('button',{name:'Pop culture',exact:true}).click();await expect(page.locator('.size-card h2')).toHaveText(prompt!);expect(await ratio(page)).toBe(pop);
 await page.reload();await expect(page.getByRole('button',{name:'Pop culture',exact:true})).toHaveAttribute('aria-pressed','true');expect(await ratio(page)).toBe(pop);
 await page.getByRole('button',{name:'Classic',exact:true}).click();expect(await ratio(page)).toBe(classic);
});

test('check counts the score, reveals comparable actual geometry, and never replays audio on reload',async({page})=>{
 await page.addInitScript(()=>{
  (window as any).__sizeSounds=0;const original=AudioContext.prototype.createOscillator;
  AudioContext.prototype.createOscillator=function(){(window as any).__sizeSounds++;return original.call(this);};
 });
 await open(page);await page.getByRole('button',{name:'Check size'}).click();await expect(page.locator('.size-score')).toHaveClass(/is-landed/);
 await expect(page.locator('.size-result')).toContainText('too big');await expect(page.locator('.size-result')).toContainText('Actual size');
 expect(await page.evaluate(()=>(window as any).__sizeSounds)).toBeGreaterThan(0);
 const dimensions=await page.locator('.size-world').evaluate(world=>{
  const target=world.querySelector<HTMLElement>('.target')!,correct=world.querySelector<HTMLElement>('.scale-correct')!;
  return {guess:Number(target.dataset.ratio),actual:Number.parseFloat(correct.style.width)/Number.parseFloat(target.style.width)};
 });
 const attempt=await page.evaluate(()=>JSON.parse(localStorage.getItem('household-trivia-v4:guest:how-much-ish:practice')!));
 expect(dimensions.actual*dimensions.guess).toBeCloseTo(attempt.questions[0].answer,5);
 await expect(page.locator('[data-size-score]')).toHaveText(String(attempt.answers[0].points));await expect(page.locator('[data-size-total]')).toHaveText(String(attempt.score));
 await page.reload();await expect(page.locator('.size-result')).toBeVisible();expect(await page.evaluate(()=>(window as any).__sizeSounds)).toBe(0);
 await page.getByRole('button',{name:'Next round'}).click();await page.getByRole('button',{name:'Sound on',exact:true}).click();await page.getByRole('button',{name:'Check size'}).click();await expect(page.locator('.size-score')).toHaveClass(/is-landed/);expect(await page.evaluate(()=>(window as any).__sizeSounds)).toBe(0);
});

test('phone pinch changes only the camera and reduced motion still reveals a result',async({browser,baseURL})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce',colorScheme:'dark'}),page=await context.newPage();
 await page.addInitScript(()=>{(window as any).__pulses=0;Object.defineProperty(navigator,'vibrate',{value:()=>{(window as any).__pulses++;return true;}});});
 await page.goto(baseURL+'/?webgl=0#games/how-much-ish');await expect(page.getByRole('slider')).toBeVisible();
 await expect(page.getByRole('button',{name:'Check size'})).toBeInViewport();const before=await ratio(page),stage=page.locator('.scale-stage'),zoom=Number(await stage.getAttribute('data-zoom')),box=(await stage.boundingBox())!;
 const session=await context.newCDPSession(page),y=box.y+80;
 await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+110,y,id:1},{x:box.x+200,y,id:2}]});
 await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+80,y,id:1},{x:box.x+250,y,id:2}]});
 await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 expect(Number(await stage.getAttribute('data-zoom'))).toBeGreaterThan(zoom);expect(await ratio(page)).toBe(before);
 await page.getByRole('button',{name:'Fit both silhouettes'}).click();await page.getByRole('button',{name:'Check size'}).click();await expect(page.locator('.size-result')).toBeVisible();await expect(page.locator('.size-score')).toHaveClass(/is-landed/);await expect(page.getByRole('button',{name:'Next round'})).toBeInViewport();
 expect(await page.evaluate(()=>(window as any).__pulses)).toBe(1);expect(await page.locator('#trivia-page').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await context.close();
});

test('a named player gets a mixed daily and synced category progress',async({page,baseURL})=>{
 await page.addInitScript(()=>localStorage.setItem('household-person','michal'));
 const external:string[]=[];page.on('request',request=>{if(!request.url().startsWith(baseURL+'/'))external.push(request.url());});
 await page.goto('/?webgl=0#games/how-much-ish');await expect(page.getByRole('slider')).toBeVisible();await expect(page.locator('.size-categories')).toHaveCount(0);await expect(page.locator('.size-card .game-board-label')).toBeVisible();
 await page.getByRole('button',{name:'Practice',exact:true}).click();await page.getByRole('button',{name:'Geography',exact:true}).click();await page.getByRole('slider').focus();await page.keyboard.press('ArrowDown');
 const value=await ratio(page);await expect.poll(()=>page.evaluate(async()=>{const c=(window as any).UTILITIES_CONFIG;const r=await fetch(c.url+'/rest/v1/rpc/utilities_game_archive',{method:'POST',headers:{'Content-Type':'application/json',apikey:c.key},body:JSON.stringify({p:{game:'how-much-ish',player:'michal',entry:'size-geography-1'}})});return (await r.json()).state.drafts['0'];})).toBe(value);
 expect(external).toEqual([]);
});

test('new catalogs open fresh while earlier saved boards remain playable',async({page})=>{
 const {readFileSync}=await import('node:fs');const old=JSON.parse(readFileSync('src/trivia/how-much-ish.json','utf8'));
 await page.addInitScript(questions=>localStorage.setItem('household-trivia-v4:guest:how-much-ish:practice',JSON.stringify({id:'old-local-board',player:'guest',game:'how-much-ish',day:'practice',questions:questions.slice(0,5),answers:[],hints:{},score:0,complete:false})),old);
 await open(page);await expect(page.locator('.size-caption')).toContainText('Golden Retriever');
 await page.getByText('Earlier boards & daily archive',{exact:true}).click();await page.locator('[data-archive-entry=legacy]').click();await expect(page.locator('.size-caption')).toContainText('Death Star I');await page.getByRole('button',{name:'Check size'}).click();await expect(page.locator('.size-result')).toBeVisible();
});
