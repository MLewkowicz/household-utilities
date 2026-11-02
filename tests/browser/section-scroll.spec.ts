import {test,expect,type Page} from '@playwright/test';

// Safari's expanded browser controls leave a shorter viewport than the screen.
test.use({viewport:{width:375,height:629},deviceScaleFactor:3,isMobile:true,hasTouch:true});
test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('household-person','michal'));});
const ready=(page:Page)=>expect(page.locator('#main')).toHaveAttribute('aria-busy','false');
const bottom=(page:Page)=>page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
async function swipe(page:Page,dy:number,x=360,y=450,dx=0){
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 for(let i=1;i<=6;i++){
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/6,y:y+dy*i/6}]});
  await page.waitForTimeout(25);
 }
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
}

test('Home lazily reveals To-dos below the house without rotating first',async({page})=>{
 const requests:string[]=[];page.on('request',request=>requests.push(request.url()));
 await page.goto('/?webgl=0#home');await expect(page.locator('#house-hero')).toBeVisible();
 await page.waitForTimeout(150);expect(requests.some(url=>url.endsWith('utilities_personal_tasks'))).toBe(false);
 await page.evaluate(()=>scrollTo(0,180));await expect(page.locator('#personal-add')).toBeEnabled();await expect(page).toHaveURL(/#home$/);
 await page.evaluate(()=>scrollTo(0,document.querySelector<HTMLElement>('#house-hero')!.offsetHeight));
 await expect(page).toHaveURL(/#chores$/);await expect(page.locator('#house-hero')).toBeHidden();await ready(page);
 expect(await page.evaluate(()=>scrollY)).toBe(0);await expect(page.locator('[data-ledger=chores]')).toHaveAttribute('aria-current','page');
});

test('scrolling up from every feature smoothly returns to its matching house scene',async({page})=>{
 for(const section of ['chores','miscellaneous','events','bulletin','utilities']){
  await page.goto('/?webgl=0#'+section);await ready(page);
  await page.evaluate(()=>scrollTo(0,0));await swipe(page,140,360,250);
  await expect(page.locator('#house-hero')).toBeVisible();await expect(page).toHaveURL(new RegExp('#'+section+'$'));
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);
  expect(await page.evaluate(()=>(window as any).__houseDiagnostics().selected)).toBe(section);
  await page.evaluate(()=>scrollTo(0,document.querySelector<HTMLElement>('#house-hero')!.offsetHeight));
  await expect(page.locator('#house-hero')).toBeHidden();await expect(page).toHaveURL(new RegExp('#'+section+'$'));
 }
});

test('scrolling past the bottom stays on the feature and never preloads a neighbouring page',async({page})=>{
 const requests:string[]=[];page.on('request',r=>requests.push(r.url()));
 await page.goto('/#chores');await ready(page);
 await page.addStyleTag({content:'#feature-area{min-height:2400px}'});
 await bottom(page);await swipe(page,-200);await swipe(page,-200);
 await expect(page).toHaveURL(/#chores$/);await expect(page.locator('#house-hero')).toBeHidden();
 expect(requests.some(url=>url.endsWith('utilities_misc_dashboard'))).toBe(false);
});

const wheel=(page:Page,deltaY:number,count=1)=>page.evaluate(([deltaY,count])=>{for(let i=0;i<count;i++)document.querySelector('#main')!.dispatchEvent(new WheelEvent('wheel',{deltaY,bubbles:true,cancelable:true}));},[deltaY,count]);

test('the return scroll has intermediate positions and same-route history restores the feature',async({page})=>{
 await page.goto('/?webgl=0#chores');await ready(page);
 await page.evaluate(()=>{(window as any).returnPositions=[];addEventListener('scroll',()=>{(window as any).returnPositions.push(scrollY);});});
 await wheel(page,-90,20);await expect(page.locator('#house-hero')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);
 const positions=await page.evaluate(()=>(window as any).returnPositions as number[]);
 expect(positions.some(y=>y>20&&y<550)).toBe(true);await expect(page).toHaveURL(/#chores$/);
 await page.goBack();await expect(page.locator('#house-hero')).toBeHidden();
 await page.goForward();await expect(page.locator('#house-hero')).toBeVisible();await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);
});

test('arriving at the top mid-gesture does not leave the feature and PageUp returns to its scene',async({page})=>{
 await page.goto('/?webgl=0#events');await ready(page);await page.addStyleTag({content:'#feature-area{min-height:2400px}'});
 await page.evaluate(()=>scrollTo(0,80));await swipe(page,180);await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);await expect(page.locator('#house-hero')).toBeHidden();
 await page.locator('#main').evaluate(el=>(el as HTMLElement).focus({preventScroll:true}));await page.keyboard.press('PageUp');await expect(page.locator('#house-hero')).toBeVisible();await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);await expect(page).toHaveURL(/#events$/);
});

test('dialogs, nested scrollers and active task drags keep their own gestures',async({page})=>{
 await page.goto('/#chores');await ready(page);await bottom(page);
 await page.evaluate(()=>{
  const main=document.querySelector('#main')!;
  document.body.classList.add('task-reordering');main.dispatchEvent(new WheelEvent('wheel',{deltaY:120,bubbles:true,cancelable:true}));document.body.classList.remove('task-reordering');
 });await expect(page).toHaveURL(/#chores$/);
 await page.locator('#chore-new').click();await swipe(page,-90,355,500);await expect(page.locator('#chore-task-dialog')).toBeVisible();await expect(page).toHaveURL(/#chores$/);await page.keyboard.press('Escape');
 await page.goto('/#utilities');await ready(page);await page.evaluate(()=>scrollTo(0,0));
 await page.locator('.table-wrap').dispatchEvent('wheel',{deltaY:-160,bubbles:true,cancelable:true});await expect(page).toHaveURL(/#utilities$/);
});

test('a short diagonal house swipe works on a Mini-sized screen and vertical swipes still scroll',async({page})=>{
 await page.goto('/#home');await expect(page.locator('#house-stage')).toHaveAttribute('data-ready','true',{timeout:20000});
 // A deliberate 40px swipe used to be below both the distance and fling gates.
 await swipe(page,18,245,480,-40);await expect(page).toHaveURL(/#chores$/,{timeout:3000});
 expect(await page.evaluate(()=>scrollY)).toBe(0);
 expect(await page.evaluate(()=>(window as any).__houseDiagnostics().transitioning)).toBe(false);
 await swipe(page,-12,180,480,40);await expect(page).toHaveURL(/#home$/,{timeout:3000});
 // Reversing past the starting point must not commit the abandoned direction.
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:230,y:480}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:195,y:480}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:275,y:480}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
 await expect.poll(()=>page.evaluate(()=>(window as any).__houseDiagnostics().transitioning)).toBe(false);
 await expect(page).toHaveURL(/#home$/);
 await swipe(page,-150,200,550,3);await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(50);await expect(page).toHaveURL(/#home$/);
});
