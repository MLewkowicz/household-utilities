import {test,expect,type Page} from '@playwright/test';
const globe=(page:Page)=>page.evaluate(()=>(window as any).__globeDiagnostics());
async function configure(page:Page,game:string){await page.locator('#geo-settings').click();await page.locator('#geo-mode').selectOption(game);await page.locator('#geo-new-round').click();await expect(page.locator('#geo-settings-dialog')).toBeHidden();}
test.use({reducedMotion:'reduce'});test.setTimeout(90000);
test('cards launch immediately, aim at their screen position and remain usable on phones',async({page})=>{
 await page.goto('/#games');await expect(page.locator('.orbit-heading')).toHaveCount(0);await expect(page.locator('#observatory-scene')).toHaveAttribute('data-ready','true');
 for(const size of [{width:1440,height:1000},{width:390,height:844}]){
  await page.setViewportSize(size);
  for(const id of ['geography','odd-one-out','passport-puzzle','clue-cascade','before-or-after','how-much-ish','sudoku','crossword']){
   const card=page.locator(`[data-orbit-game="${id}"]`);await card.focus();await expect(card).toHaveAttribute('aria-pressed','true');
   await expect.poll(()=>page.evaluate(()=>{const d=(window as any).__observatoryDiagnostics(),[pivot,lens,card]=d.screenAim;const a=[lens[0]-pivot[0],lens[1]-pivot[1]],b=[card[0]-pivot[0],card[1]-pivot[1]];return (a[0]*b[0]+a[1]*b[1])/Math.hypot(...a)/Math.hypot(...b);})).toBeGreaterThan(.999);expect(await page.evaluate(()=>(window as any).__observatoryDiagnostics().pitch)).toBeCloseTo(-.14);
   await expect(card).toBeInViewport();await expect(card).toHaveAttribute('data-focused','true');expect((await card.boundingBox())!.width).toBeLessThan(size.width<700?115:175);await expect(card.locator('img')).toBeVisible();
  }
 }
 await page.getByRole('button',{name:'Play How Much-ish?',exact:true}).click();await expect(page.locator('.scale-stage')).toBeVisible();await expect(page.locator('.game-intro')).toHaveCount(0);await expect(page.locator('[data-start]')).toHaveCount(0);await expect(page.locator('.game-floating-nav [data-game-return]')).toBeInViewport();
});
test('direct silhouette resizing supports mouse, keyboard and persisted progress',async({page})=>{
 await page.goto('/?webgl=0#games/how-much-ish');const target=page.getByRole('slider');await expect(target).toBeVisible();await expect(page.locator('input[type=range]')).toHaveCount(0);
 const initial=Number(await target.getAttribute('aria-valuenow'));const b=(await target.boundingBox())!;
 await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2-90,{steps:8});await page.mouse.up();const dragged=Number(await target.getAttribute('aria-valuenow'));expect(dragged).toBeGreaterThan(initial);
 await target.focus();await page.keyboard.press('ArrowLeft');const keyed=Number(await target.getAttribute('aria-valuenow'));expect(keyed).toBeLessThan(dragged);
 await page.reload();await expect(target).toHaveAttribute('aria-valuenow',String(keyed));await page.getByRole('button',{name:/Check size/}).click();await expect(page.locator('.scale-correct')).toBeVisible();
});
test('touch resize changes the target without scrolling the board',async({browser,baseURL})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const page=await context.newPage();await page.goto(baseURL+'/?webgl=0#games/how-much-ish');const target=page.getByRole('slider');await expect(target).toBeVisible();const b=(await target.boundingBox())!,session=await context.newCDPSession(page),x=b.x+b.width/2,y=b.y+b.height/2;
 await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-90,id:1}]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});expect(Number(await target.getAttribute('aria-valuenow'))).toBeGreaterThan(1);expect(await page.locator('#trivia-page').evaluate(el=>el.scrollTop)).toBe(0);await context.close();
});
test('review reuses the rotating globe and exposes expandable country stories',async({page})=>{
 await page.goto('/#games/geography');await expect(page.locator('#geo-globe')).toHaveAttribute('data-ready','true',{timeout:60000});await page.locator('#geo-globe').evaluate(el=>(el as any).reviewIdentity='same-globe');
 await page.locator('#geo-study').click();await expect(page.locator('#geography-page')).toHaveAttribute('data-mode','review');expect(await page.locator('#geo-globe').evaluate(el=>(el as any).reviewIdentity)).toBe('same-globe');expect((await globe(page)).labels).toBe(true);
 await page.getByRole('searchbox',{name:'Find a place'}).fill('Poland');await page.locator('#geo-review-results button').first().click();await expect(page.locator('#geo-country-card')).toContainText('Chapels carved from salt');await expect(page.locator('#geo-country-card')).toContainText('202');await page.locator('.atlas-stories summary').click();await expect(page.locator('.atlas-stories')).toHaveAttribute('open','');await page.locator('.atlas-context summary').click();await expect(page.locator('.atlas-context p')).toContainText('Poland');
 await page.locator('#geo-study').click();expect((await globe(page)).labels).toBe(false);await expect(page.locator('.globe-review-labels')).toBeHidden();await expect(page.locator('#geo-review')).toHaveCount(0);
});
test('ending Border Trail restores terrain for countries and never overwrites the preference',async({page})=>{
 test.setTimeout(120000);await page.goto('/#games/geography');await expect(page.locator('#geo-globe')).toHaveAttribute('data-ready','true',{timeout:60000});await configure(page,'route');await expect.poll(async()=>(await globe(page)).style).toBe('paper');
 await page.locator('.geo-route-rules summary').click();await page.locator('#geo-route-give-up').click();await expect(page.locator('#geo-result')).toContainText('Trail ended');
 await page.locator('#geo-study').click();
 // Style changes can upload large terrain textures; wait for the app's completion
 // signal before checking the result, including under software WebGL rendering.
 await expect(page.locator('#geo-style')).toHaveAttribute('aria-busy','false',{timeout:60000});
 expect((await globe(page)).style).toBe('terrain');expect((await globe(page)).route).toBeUndefined();await page.locator('#geo-study').click();await configure(page,'countries');
 await expect(page.locator('#geo-style')).toHaveAttribute('aria-busy','false',{timeout:60000});
 expect((await globe(page)).style).toBe('terrain');expect((await globe(page)).route).toBeUndefined();expect(await page.evaluate(()=>localStorage.getItem('household-globe-style-v1'))).not.toBe('paper');
});
test('temporary WebGL loss recovers the same spherical globe and selected country',async({page})=>{
 test.setTimeout(90000);await page.goto('/#games/geography/review');const canvas=page.locator('#geo-globe');await expect(canvas).toHaveAttribute('data-ready','true',{timeout:60000});await page.getByRole('searchbox',{name:'Find a place'}).fill('Poland');await page.locator('#geo-review-results button').first().click();
 await canvas.evaluate(el=>{(el as any).beforeLoss=true;const extension=(el as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')!;(window as any).recoverGlobe=()=>extension.restoreContext();extension.loseContext();});await expect(page.locator('.globe-recovery')).toBeVisible();await expect(page.locator('#geo-map')).toHaveCount(0);await page.evaluate(()=>(window as any).recoverGlobe());await expect(canvas).toHaveAttribute('data-ready','true',{timeout:30000});expect(await canvas.evaluate(el=>(el as any).beforeLoss)).toBe(true);expect((await globe(page)).selected).toBe('POL');expect((await globe(page)).style).toBe('terrain');await expect(page.locator('.globe-recovery')).toBeHidden();
});

test('returning to the cards while Geography loads does not leave the old screen mounted',async({page})=>{
 let release=()=>{};const held=new Promise<void>(resolve=>{release=resolve;});
 let downloading=()=>{};const started=new Promise<void>(resolve=>{downloading=resolve;});
 await page.route('**/globe/cover-*.webp',async route=>{downloading();await held;await route.continue();});
 await page.goto('/#games/geography');await expect(page.locator('#geography-page')).toBeVisible();await started;
 await page.getByRole('link',{name:'Games',exact:true}).click();await expect(page.locator('#orbit-lobby')).toBeVisible();await expect(page.locator('#geography-page')).toBeHidden();
 release();await expect.poll(()=>page.evaluate(()=>typeof (window as any).__globeDiagnostics),{timeout:60000}).toBe('function');await expect(page.locator('#orbit-lobby')).toBeVisible();await expect(page.locator('#geography-page')).toBeHidden();expect((await globe(page)).active).toBe(false);
});
test('steering follows the pointer immediately and reverses across the card seam',async({page})=>{
 await page.goto('/#games');await expect(page.locator('#observatory-scene')).toHaveAttribute('data-ready','true');await page.emulateMedia({reducedMotion:'no-preference'});
 const b=(await page.locator('#observatory-scene').boundingBox())!,x=b.x+b.width*.5,y=b.y+b.height*.65;
 await page.mouse.move(x,y);await page.mouse.down();
 for(const delta of [45,85,-45,-85,30]){await page.mouse.move(x+delta,y,{steps:2});await expect.poll(()=>page.evaluate(()=>{const d=(window as any).__observatoryDiagnostics();return d.dragging?Math.abs(d.angle-d.target):10;})).toBeLessThan(.001);}
 await page.mouse.up();await expect(page.locator('#observatory-scene')).toHaveAttribute('data-selected','crossword');
});

test('observatory drag direction matches house navigation and the next/previous controls',async({page})=>{
 await page.goto('/?webgl=0#games');const scene=page.locator('#observatory-scene');await expect(scene).toHaveAttribute('data-selected','geography');
 const b=(await scene.boundingBox())!,x=b.x+b.width/2,y=b.y+b.height*.65;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-90,y,{steps:6});await page.mouse.up();await expect(scene).toHaveAttribute('data-selected','odd-one-out');
 await page.getByRole('button',{name:'Previous game',exact:true}).click();await expect(scene).toHaveAttribute('data-selected','geography');
 await scene.focus();await page.keyboard.press('ArrowRight');await expect(scene).toHaveAttribute('data-selected','odd-one-out');
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+90,y,{steps:6});await page.mouse.up();await expect(scene).toHaveAttribute('data-selected','geography');
 await page.getByRole('button',{name:'Next game',exact:true}).click();await expect(scene).toHaveAttribute('data-selected','odd-one-out');
 await scene.focus();await page.keyboard.press('ArrowLeft');await expect(scene).toHaveAttribute('data-selected','geography');
});
