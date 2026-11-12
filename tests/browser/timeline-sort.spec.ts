import {test,expect,type Page} from '@playwright/test';

const storage='household-trivia-v2:guest:before-or-after:';
const ids=(page:Page)=>page.locator('.timeline-list > [data-card]').evaluateAll(cards=>cards.map(card=>(card as HTMLElement).dataset.card!));
async function start(page:Page){
 await page.goto('/?webgl=0#games/before-or-after');
 await page.getByRole('button',{name:'Practice',exact:true}).click();

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
 await page.reload();await page.getByRole('button',{name:'Practice',exact:true}).click();await expect.poll(()=>ids(page)).toEqual(expected);
 await page.getByRole('button',{name:'Submit'}).click();await expect(page.locator('.timeline-date')).toHaveCount(5);await expect(page.locator('button.timeline-tile')).toHaveCount(0);
 const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key+'practice')!),storage);
 expect(saved.answers[0].value).toEqual(expected);
 await expect.poll(()=>page.locator('.timeline-guess').evaluateAll(rows=>rows.map(row=>(row as HTMLElement).dataset.card))).toEqual(expected);
 await expect.poll(()=>page.locator('.timeline-solution').evaluateAll(rows=>rows.map(row=>(row as HTMLElement).dataset.card))).toEqual(saved.questions[0].answer);
 await expect(page.locator('.timeline-date')).toHaveText(saved.questions[0].answer.map((id:string)=>String(saved.questions[0].reveal[id])));
 await page.setViewportSize({width:390,height:844});expect(await page.locator('#trivia-page').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
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
 await page.reload();await page.getByRole('button',{name:'Practice',exact:true}).click();await expect.poll(()=>ids(page)).toEqual(moved);
 await context.close();
});

for(const reversed of [false,true])test(`timeline result makes ${reversed?'reversed':'correct'} order explicit on a phone`,async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.addInitScript(({storage,reversed})=>{
  const answer=['a','b','c','d','e'],q={id:'review-test',version:2,kind:'timeline',prompt:'Put these moments in order.',cards:answer.map((id,i)=>({id,label:['First event','Second event','Third event','Fourth event','Fifth event'][i],art:'clock'})),answer,reveal:{a:1900,b:1920,c:1940,d:1960,e:1980}};
  localStorage.setItem(storage+'practice',JSON.stringify({id:'review-fixture',game:'before-or-after',player:'guest',day:'practice',questions:[q],answers:[],hints:{},score:0,complete:false}));localStorage.setItem(storage+'review-fixture:0:draft',JSON.stringify(reversed?[...answer].reverse():answer));
 },{storage,reversed});
 await page.goto('/?webgl=0#games/before-or-after');await page.getByRole('button',{name:'Submit'}).click();
 await expect(page.locator('.timeline-review-summary')).toContainText(reversed?'1 of 5 events in the right place':'All in the right order');
 await expect(page.locator('.timeline-review-summary')).toContainText(reversed?'0 of 10 event pairs':'10 of 10 event pairs');await expect(page.locator('.timeline-comparison-row.is-misplaced')).toHaveCount(reversed?4:0);
 if(reversed){await expect(page.locator('.timeline-guess').first()).toContainText('Fifth event');await expect(page.locator('.timeline-guess').first()).toContainText('Belongs at #5');await expect(page.locator('.timeline-solution').first()).toContainText('1900');await expect(page.locator('.timeline-solution').first()).toContainText('First event');await expect(page.locator('.timeline-solution').first()).toContainText('You placed it #5');}
 await expect(page.locator('button.timeline-tile')).toHaveCount(0);expect(await page.locator('#trivia-page').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
});

test('daily timeline results resume with both orders intact, including legacy dates',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('household-person','rohil'));
 await page.goto('/?webgl=0#games/before-or-after');await expect(page.locator('.timeline-list,.timeline-comparison')).toBeVisible();
 const fresh=await page.locator('.timeline-list').count(),submitted=fresh?await ids(page):await page.locator('.timeline-guess').evaluateAll(rows=>rows.map(row=>(row as HTMLElement).dataset.card!));if(fresh)await page.getByRole('button',{name:'Submit'}).click();await expect(page.locator('.timeline-comparison')).toBeVisible();
 const solution=await page.locator('.timeline-solution').allTextContents();await page.getByRole('button',{name:'See result'}).click();await page.locator('.game-result summary').click();await expect(page.locator('.timeline-solution')).toHaveText(solution);await page.reload();await expect(page.locator('.timeline-solution')).toHaveText(solution);await expect.poll(()=>page.locator('.timeline-guess').evaluateAll(rows=>rows.map(row=>(row as HTMLElement).dataset.card))).toEqual(submitted);
 // The old daily contract has dates only in its revealed explanation.
 await page.route('**/rest/v1/rpc/utilities_trivia_start',route=>route.fulfill({json:{id:'legacy-review',player:'rohil',game:'before-or-after',day:'2099-01-01',questions:[{id:'legacy-q',version:1,kind:'timeline',prompt:'Arrange these moments.',cards:['b','a','d','c','e'].map(id=>({id,label:'Event '+id})),answer:['a','b','c','d','e'],explanation:'1900 · Event a\n1920 · Event b\n1940 · Event c\n1960 · Event d\n1980 · Event e'}],answers:[{value:['b','a','d','c','e'],points:800}],hints:{},score:800,complete:true}}));
 await page.reload();await expect(page.locator('.timeline-date')).toHaveText(['1900','1920','1940','1960','1980']);await expect(page.locator('.timeline-guess').first()).toContainText('Event b');await expect(page.locator('.timeline-solution').first()).toContainText('Event a');
});
