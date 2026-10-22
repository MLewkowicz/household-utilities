import {setTheme,refreshSection} from './settings';
import {test,expect,type Page} from '@playwright/test';
const rpc=async(page:Page,name:string,p?:unknown)=>{const r=await page.request.post(`/rest/v1/rpc/utilities_${name}`,{headers:{apikey:'local-public'},data:p?{p}:{}});expect(r.ok()).toBeTruthy();return r.json();};
const task=(extra={})=>({id:crypto.randomUUID(),request_id:crypto.randomUUID(),actor:'rohil',action:'create',title:'Swipe test '+crypto.randomUUID(),icon_id:'tidy',note:'Only visible in details',points:2,assignee:null,pinned:false,...extra});
async function chores(page:Page){await page.goto('/#chores/household');await expect(page.locator('#chores-status')).toHaveText('Shared to-dos · up to date');await page.locator('[data-chore-person=michal]').click();await page.locator('#chore-household-filter').selectOption('all');}

test('a deliberate swipe claims and completes, with keyboard undo and independent typed reminders',async({page})=>{
 await page.setViewportSize({width:390,height:844});const t=await rpc(page,'save_chore',task());await chores(page);
 const card=page.locator(`[data-chore-id="${t.id}"]`);await expect(card.locator('.chore-description')).not.toBeVisible();
 const surface=await card.evaluate(el=>getComputedStyle(el).backgroundColor);expect(surface).not.toBe('rgb(255, 255, 255)');
 const button=card.locator('[data-swipe-complete]'),track=card.locator('.completion-track');
 await button.scrollIntoViewIfNeeded();
 const handle=(await button.boundingBox())!,bounds=(await track.boundingBox())!;
 await page.mouse.move(handle.x+20,handle.y+20);await page.mouse.down();await page.mouse.move(handle.x+35,handle.y+20);await page.mouse.up();
 expect((await rpc(page,'chores_dashboard')).tasks.find((x:any)=>x.id===t.id).state).toBe('active');
 await page.mouse.move(handle.x+20,handle.y+20);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width-12,handle.y+20,{steps:12});await page.mouse.up();
 await expect(card).toHaveCount(0);let d=await rpc(page,'chores_dashboard');const done=d.tasks.find((x:any)=>x.id===t.id);expect(done.assignee).toBe('michal');expect(done.completion.contributors).toEqual(['michal']);
 await page.locator('#toast').getByRole('button',{name:'Undo',exact:true}).click();await expect(card).toBeVisible();
 await button.focus();await page.keyboard.press('Enter');await expect(card).toHaveCount(0);
 await page.locator('#chore-new').click();await page.locator('#chore-kind').selectOption('reminder');await page.locator('#chore-title').fill('Register today independently');
 await page.locator('[name=reminder-recipient][value=rina]').check();await page.locator('[name=reminder-recipient][value=ohm]').check();
 await expect(page.locator('#chore-points-fields')).not.toBeVisible();await page.locator('#chore-task-save').click();await expect(page.locator('#chore-task-dialog')).not.toBeVisible();
 await page.locator('#chore-household-filter').selectOption('michal');
 const reminder=page.locator('.chore-grid .chore-card').filter({has:page.getByRole('heading',{name:'Register today independently',exact:true})});
 await expect(reminder).toHaveCount(1);await reminder.locator('[data-swipe-complete]').focus();await page.keyboard.press('Enter');await expect(reminder).toHaveCount(0);
 d=await rpc(page,'chores_dashboard');const group=d.tasks.filter((x:any)=>x.title==='Register today independently');expect(group).toHaveLength(3);expect(group.filter((x:any)=>x.state==='completed')).toHaveLength(1);expect(group.every((x:any)=>x.points===0)).toBeTruthy();
});

test('guest calculator sends only household shares and discards its inputs on close',async({page})=>{
 const saved:any[]=[];page.on('request',r=>{if(r.url().includes('utilities_save_misc_expense'))saved.push(r.postDataJSON().p);});
 await page.goto('/#miscellaneous');await expect(page.locator('#misc-status')).toHaveText('Shared purchases · up to date');await page.locator('[data-identity=michal]').click();
 await page.locator('#new-expense').click();await page.locator('#expense-description').fill('Dinner with friends');await page.locator('#guest-split-open').click();
 await page.locator('#guest-total').fill('180');await page.locator('#guest-count').selectOption('2');await expect(page.locator('.guest-subtotal')).toContainText('$120.00');await page.locator('#guest-use').click();
 await expect(page.locator('.guest-dialog')).toHaveCount(0);await expect(page.locator('#expense-amount')).toHaveValue('120.00');await expect(page.locator('#custom-share-rohil')).toHaveValue('30.00');
 await page.locator('#save-expense').click();await expect(page.locator('#expense-dialog')).not.toBeVisible();expect(saved).toHaveLength(1);expect(saved[0].amount_cents).toBe(12000);expect(saved[0].split_mode).toBe('custom');expect(Object.values(saved[0].shares)).toEqual([3000,3000,3000,3000]);expect(JSON.stringify(saved[0])).not.toMatch(/guest|18000/i);
 await page.locator('#new-expense').click();await page.locator('#guest-split-open').click();await expect(page.locator('#guest-total')).toHaveValue('');await expect(page.locator('#guest-count')).toHaveValue('1');
 await page.keyboard.press('Escape');await expect(page.locator('.guest-dialog')).toHaveCount(0);await expect(page.locator('#expense-dialog')).toBeVisible();
});

test('inactive sections do not initialize or fetch; unavailable badges do not block utilities',async({page})=>{
 const requests:string[]=[];page.on('request',r=>requests.push(new URL(r.url()).pathname));
 await page.addInitScript(()=>localStorage.setItem('household-person','michal'));
 await page.route('**/utilities_chores_summary',route=>route.abort());await page.goto('/#utilities');await expect(page.locator('#connection-status')).toHaveText('Shared ledger · up to date');
 await expect(page.locator('#chore-task-dialog')).toHaveCount(0);await expect(page.locator('#expense-dialog')).toHaveCount(0);await expect(page.locator('#bulletin-note-dialog')).toHaveCount(0);
 expect(requests.some(p=>/utilities_(chores|misc|bulletin)_dashboard/.test(p))).toBeFalsy();expect(requests).not.toContain('/thumbtack.svg');
 await page.getByRole('link',{name:'Expenses',exact:true}).click();await expect(page.locator('#new-expense')).toBeEnabled();await expect(page.locator('#chore-task-dialog')).toHaveCount(0);
 await page.getByRole('link',{name:/^To-dos/}).click();await expect(page.locator('#chores-status')).toHaveText('Shared to-dos · up to date');
 await setTheme(page,'dark');const tile=page.locator('.chore-card').first();if(await tile.count())expect(await tile.evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe('rgb(24, 34, 27)');
});

test('utility page has no explanatory info controls and retains payment guidance',async({page})=>{
 await page.goto('/#utilities');await expect(page.locator('#new-payment')).toBeEnabled();await expect(page.locator('.info-disclosure')).toHaveCount(0);await expect(page.getByText(/Rohil’s recurring share starts/)).toHaveCount(0);await page.locator('#new-payment').click();await expect(page.getByText('Add the amount you’ve already sent.')).toBeVisible();
});

test('a delayed read cannot restore a task after quick completion',async({page})=>{
 const t=await rpc(page,'save_chore',task());await chores(page);
 let release!:()=>void,received!:()=>void;const held=new Promise<void>(resolve=>release=resolve),started=new Promise<void>(resolve=>received=resolve);
 await page.route('**/utilities_chores_dashboard',async route=>{const response=await route.fetch();received();await held;await route.fulfill({response});},{times:1});
 await refreshSection(page);await started;
 const card=page.locator(`[data-chore-id="${t.id}"]`);await card.locator('[data-swipe-complete]').focus();await page.keyboard.press('Enter');await expect(page.locator('#toast')).toContainText('✓');
 const fresh=page.waitForResponse(async response=>response.url().endsWith('/utilities_chores_dashboard')&&response.status()===200&&(await response.json()).tasks.some((x:any)=>x.id===t.id&&x.state==='completed'));
 release();await fresh;await expect(card).toHaveCount(0);const d=await rpc(page,'chores_dashboard');expect(d.tasks.find((x:any)=>x.id===t.id).state).toBe('completed');
});
