import {test,expect,type Page} from '@playwright/test';

const storage='household-trivia-v2:guest:before-or-after:';
const ids=(page:Page)=>page.locator('.timeline-list > [data-card]').evaluateAll(cards=>cards.map(card=>(card as HTMLElement).dataset.card!));
async function start(page:Page){
 await page.goto('/?webgl=0#games/before-or-after');
 await page.getByRole('button',{name:'Practice',exact:true}).click();
 await page.getByRole('button',{name:'Start practice'}).click();
 await expect(page.locator('.timeline-list > [data-card]')).toHaveCount(5);
}
test('timeline dragging persists the exact submitted order and locks the revealed cards',async({page})=>{
 await page.setViewportSize({width:1280,height:900});await start(page);
 const before=await ids(page),tiles=page.locator('.timeline-tile');
 await expect(page.locator('.timeline-date')).toHaveCount(0);await expect(page.locator('[data-move]')).toHaveCount(0);
 const from=(await tiles.first().boundingBox())!,to=(await tiles.last().boundingBox())!;
 await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();
 await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:16});await expect(page.locator('.timeline-drag-preview')).toBeVisible();
 await page.mouse.up();const expected=[...before.slice(1),before[0]];
 await expect.poll(()=>ids(page)).toEqual(expected);await expect(page.locator('.timeline-drag-preview')).toHaveCount(0);
 await page.reload();await page.getByRole('button',{name:'Practice',exact:true}).click();await page.getByRole('button',{name:'Start practice'}).click();await expect.poll(()=>ids(page)).toEqual(expected);
 await page.getByRole('button',{name:'Submit'}).click();await expect(page.locator('.timeline-date')).toHaveCount(5);await expect(page.locator('button.timeline-tile')).toHaveCount(0);
 const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key+'practice')!),storage);
 expect(saved.answers[0].value).toEqual(expected);
 let points=0;for(let i=0;i<4;i++)for(let j=i+1;j<5;j++)if(saved.questions[0].answer.indexOf(expected[i])<saved.questions[0].answer.indexOf(expected[j]))points+=100;
 expect(saved.score).toBe(points);
});

test('timeline keyboard moves, cancellation and tap-to-place work with reduced motion',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await start(page);const before=await ids(page);
 const first=page.locator(`[data-card="${before[0]}"] .timeline-tile`);await first.focus();await page.keyboard.press('Space');
 await page.keyboard.press('End');await expect.poll(()=>ids(page)).toEqual([...before.slice(1),before[0]]);
 await page.keyboard.press('Escape');await expect.poll(()=>ids(page)).toEqual(before);await expect(first).toBeFocused();
 await page.keyboard.press('Enter');await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');
 const moved=[before[1],before[0],...before.slice(2)];await expect.poll(()=>ids(page)).toEqual(moved);await expect(first).toHaveAttribute('aria-pressed','false');
 await expect(page.locator('.timeline-status')).toContainText('placed at position 2');
 await page.locator('.timeline-tile').first().click();await page.locator('.timeline-tile').last().click();
 await expect.poll(()=>ids(page)).toEqual([...moved.slice(1),moved[0]]);await expect(page.locator('.is-picked')).toHaveCount(0);
});

test('touch dragging scrolls a short phone, and an interrupted drag restores its order',async({browser,baseURL})=>{
 const context=await browser.newContext({baseURL,viewport:{width:390,height:640},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),page=await context.newPage();
 await start(page);const before=await ids(page),client=await context.newCDPSession(page);
 const from=(await page.locator('.timeline-tile').first().boundingBox())!,x=from.x+from.width/2,y=from.y+from.height/2;
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 for(let step=1;step<=10;step++)await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+(615-y)*step/10}]});
 await expect.poll(()=>page.locator('#trivia-page').evaluate(el=>el.scrollTop)).toBeGreaterThan(30);
 await expect.poll(async()=>(await ids(page)).at(-1)).toBe(before[0]);await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 const moved=await ids(page);expect(moved).toEqual([...before.slice(1),before[0]]);await expect(page.locator('.timeline-drag-preview')).toHaveCount(0);
 await page.locator('#trivia-page').evaluate(el=>{el.scrollTop=0;});
 const a=(await page.locator('.timeline-tile').first().boundingBox())!,b=(await page.locator('.timeline-tile').nth(1).boundingBox())!;
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:a.x+30,y:a.y+30}]});
 await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.x+30,y:b.y+b.height*.8}]});
 await expect.poll(()=>ids(page)).not.toEqual(moved);await client.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
 await expect.poll(()=>ids(page)).toEqual(moved);await expect(page.locator('.timeline-drag-preview')).toHaveCount(0);
 expect(await page.locator('#trivia-page').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await page.reload();await page.getByRole('button',{name:'Practice',exact:true}).click();await page.getByRole('button',{name:'Start practice'}).click();await expect.poll(()=>ids(page)).toEqual(moved);
 await context.close();
});
