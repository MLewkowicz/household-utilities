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

test('fresh upward and downward swipes traverse every section and return to the house',async({page})=>{
 await page.goto('/#chores');await ready(page);await page.locator('#personal-title').fill('Keep my task draft');
 for(const section of ['miscellaneous','events','bulletin','utilities']){
  await bottom(page);await swipe(page,-100);await expect(page).toHaveURL(new RegExp('#'+section+'$'));await ready(page);
  expect(await page.evaluate(()=>scrollY)).toBe(0);await expect(page.locator('.house-chrome')).toHaveClass(/is-docked/);
 }
 await bottom(page);await swipe(page,-100);await expect(page).toHaveURL(/#utilities$/);
 for(const section of ['bulletin','events','miscellaneous','chores']){
  await page.evaluate(()=>scrollTo(0,0));await swipe(page,100);await expect(page).toHaveURL(new RegExp('#'+section+'$'));await ready(page);
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollHeight-innerHeight-scrollY)).toBeLessThan(4);
 }
 await expect(page.locator('#personal-title')).toHaveValue('Keep my task draft');
 await page.evaluate(()=>scrollTo(0,0));await swipe(page,100);await expect(page).toHaveURL(/#home$/);await expect(page.locator('#house-hero')).toBeVisible();
 expect(await page.evaluate(()=>scrollY)).toBe(0);
});

test('reaching the bottom during a swipe does not skip the section',async({page})=>{
 await page.goto('/#chores');await ready(page);
 await page.addStyleTag({content:'#feature-area{min-height:2400px}'});
 await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight-innerHeight-50));
 await swipe(page,-180);await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollHeight-innerHeight-scrollY)).toBeLessThan(4);
 await expect(page).toHaveURL(/#chores$/);await page.waitForTimeout(300);
 await swipe(page,-100);await expect(page).toHaveURL(/#miscellaneous$/);
});

test('wheel momentum cannot advance multiple sections and reverse scrolling returns to the previous bottom',async({page})=>{
 await page.goto('/#chores');await ready(page);await bottom(page);
 await page.evaluate(()=>{for(let i=0;i<20;i++)document.querySelector('#main')!.dispatchEvent(new WheelEvent('wheel',{deltaY:90,bubbles:true,cancelable:true}));});
 await expect(page).toHaveURL(/#miscellaneous$/);await ready(page);expect(await page.evaluate(()=>scrollY)).toBe(0);
 await page.waitForTimeout(260);await page.evaluate(()=>document.querySelector('#main')!.dispatchEvent(new WheelEvent('wheel',{deltaY:-90,bubbles:true,cancelable:true})));
 await expect(page).toHaveURL(/#chores$/);await ready(page);
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollHeight-innerHeight-scrollY)).toBeLessThan(4);
 await page.goBack();await expect(page).toHaveURL(/#miscellaneous$/);await page.goBack();await expect(page).toHaveURL(/#chores$/);
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
