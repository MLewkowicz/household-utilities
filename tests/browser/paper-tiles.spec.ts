import {setTheme} from './settings';
import {test,expect,type Page} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
const rpc=async(page:Page,fn:string,p?:unknown)=>{const r=await page.request.post('/rest/v1/rpc/utilities_'+fn,{headers:{apikey:'local-public'},data:p?{p}:{}});expect(r.ok(),await r.text()).toBeTruthy();return r.json();};
test('paper frame follows expanding tiles and cleans up observers across views',async({page})=>{
 await page.addInitScript(()=>{
  localStorage.setItem('household-person','michal');
  const active=new Set<Element>();(window as any).observedPaper=active;
  const Original=ResizeObserver;
  window.ResizeObserver=class extends Original{observe(el:Element,options?:ResizeObserverOptions){if(el.matches('.paper-tile'))active.add(el);super.observe(el,options);}unobserve(el:Element){active.delete(el);super.unobserve(el);}disconnect(){active.clear();super.disconnect();}};
 });
 const day=(await rpc(page,'chores_dashboard')).local_day;
 for(const actor of ['michal','rina','ohm','rohil'])for(const pinned of [false,true])await rpc(page,'save_chore',{id:crypto.randomUUID(),request_id:crypto.randomUUID(),actor,action:'create',title:actor+' paper '+pinned,assignee:pinned?null:actor,kind:'reminder',points:0,icon_id:'bicycle',pinned,due_on:day,note:'Long details to expand the paper. '.repeat(8)});
 await page.goto('/#chores/household');await expect(page.locator('.paper-tile').filter({has:page.getByRole('heading',{name:/^(michal|rina|ohm|rohil) paper /})})).toHaveCount(8);
 const tile=page.locator('.is-pinned').filter({has:page.getByRole('heading',{name:'michal paper true',exact:true})});const outline=tile.locator('.paper-outline');const before=await outline.getAttribute('d');
 await tile.locator('summary.chore-corner-tab').focus();await page.keyboard.press('Enter');await expect(tile.locator('.tile-details-body')).toBeVisible();await expect(outline).not.toHaveAttribute('d',before!);await mkdir('.local/paper-review',{recursive:true});await tile.screenshot({path:'.local/paper-review/expanded-focus.png'});
 expect(await tile.evaluate(el=>getComputedStyle(el).borderWidth)).toBe('0px');expect(await outline.evaluate(el=>getComputedStyle(el).strokeWidth)).toBe('2px');
 await page.setViewportSize({width:320,height:844});await expect(outline).toHaveCount(1);await tile.screenshot({path:'.local/paper-review/expanded-phone.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.locator('[data-chore-view=mine]').click();await expect(page.locator('#my-tasks')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>[...(window as any).observedPaper].every((el:any)=>el.isConnected))).toBeTruthy();
 await page.locator('[data-chore-view=week]').click();await expect(page.locator('.chore-week')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>[...(window as any).observedPaper].every((el:any)=>el.isConnected))).toBeTruthy();
});

test('continuous corners render in themes, pixel ratios, Week, purchases and tilted notes',async({browser,page})=>{
 test.setTimeout(90000);await mkdir('.local/paper-review',{recursive:true});
 const day=(await rpc(page,'chores_dashboard')).local_day;
 const t=await rpc(page,'save_chore',{id:crypto.randomUUID(),request_id:crypto.randomUUID(),actor:'michal',assignee:'michal',action:'create',title:'Pinned paper corner',icon_id:'bicycle',kind:'reminder',points:0,pinned:true,due_on:day});
 await rpc(page,'save_bulletin_note',{id:crypto.randomUUID(),request_id:crypto.randomUUID(),actor:'ohm',action:'create',body:'A paper note on a textured board.',temperature:35,recipients:['rina']});
 const misc=await rpc(page,'misc_dashboard');await rpc(page,'save_misc_expense',{id:crypto.randomUUID(),request_id:crypto.randomUUID(),actor:'rina',payer:'rina',action:'create',description:'Shared groceries',icon_id:'groceries',amount_cents:2400,paid_on:day,split_mode:'equal',participants:['michal','rina','ohm','rohil'],expected_rounding_cursor:misc.rounding_cursor});
 for(const deviceScaleFactor of [1,2]){
  const context=await browser.newContext({deviceScaleFactor,reducedMotion:'reduce'});await context.addInitScript(()=>localStorage.setItem('household-person','michal'));const p=await context.newPage();
  const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
  for(const width of [390,1280])for(const theme of ['light','dark']){
   await p.setViewportSize({width,height:900});await p.goto('/#chores');await expect(p.locator('#personal-add')).toBeEnabled();await setTheme(p,theme);
   for(const view of ['mine','household','week']){
    await p.locator(`[data-chore-view=${view}]`).click();const tile=p.locator(`[data-chore-id="${t.id}"]`);await expect(tile.locator('.paper-outline')).toBeVisible();await expect(p.locator('#main')).toHaveAttribute('aria-busy','false');
    await tile.screenshot({path:`.local/paper-review/${view}-${width}-${theme}-${deviceScaleFactor}.png`});
   }
   await p.getByRole('link',{name:'Expenses',exact:true}).click();await expect(p.locator('#new-expense')).toBeEnabled();await expect(p.locator('#main')).toHaveAttribute('aria-busy','false');await p.locator('.expense-card').first().screenshot({path:`.local/paper-review/expense-${width}-${theme}-${deviceScaleFactor}.png`});
   await p.getByRole('link',{name:'Bulletin',exact:true}).click();await expect(p.locator('#bulletin-status')).toHaveText('Shared notes · up to date');await expect(p.locator('#main')).toHaveAttribute('aria-busy','false');await p.locator('.bulletin-note').first().screenshot({path:`.local/paper-review/note-${width}-${theme}-${deviceScaleFactor}.png`});
   expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await expect(p.locator('.info-disclosure')).toHaveCount(0);
  }
  await p.goto('/#chores/household');await expect(p.locator('.paper-tile')).not.toHaveCount(0);await expect(p.locator('#main')).toHaveAttribute('aria-busy','false');await p.evaluate(()=>document.body.style.zoom='1.25');await p.locator(`[data-chore-id="${t.id}"]`).screenshot({path:`.local/paper-review/zoom-${deviceScaleFactor}.png`});
  expect(errors).toEqual([]);await context.close();
 }
});
