import {test,expect,type Page} from '@playwright/test';
import {openSettings} from './settings';
const rpc=async(page:Page,fn:string,p?:unknown)=>{const r=await page.request.post('/rest/v1/rpc/utilities_'+fn,{headers:{apikey:'local-public'},data:p?{p}:{}});expect(r.ok(),await r.text()).toBeTruthy();return r.json();};
test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('household-person','michal'));});
test('lane tiles retain details, assignment and contributor confirmation despite a saved compact preference',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('household-todo-layout','compact'));
 const t=await rpc(page,'save_chore',{id:crypto.randomUUID(),request_id:crypto.randomUUID(),actor:'rina',action:'create',kind:'chore',title:'Empty dishwasher '+crypto.randomUUID(),icon_id:'dishes',points:1,preset_id:'dishwasher-empty',pinned:false,assignee:'michal'});
 await page.setViewportSize({width:390,height:844});await page.goto('/#chores');await expect(page.locator('#main')).toHaveAttribute('aria-busy','false');
 const card=page.locator(`[data-chore-id="${t.id}"]`);await expect(card).toBeVisible();await expect(card.locator('.chore-recipient')).toContainText('Assigned to Michal');await expect(card.locator('.chore-requester')).toBeHidden();
 await expect(page.locator('#todo-layout')).toHaveCount(0);
 expect(await card.evaluate(el=>getComputedStyle(el).display)).not.toBe('grid');
 await card.locator('summary').click();await expect(card.locator('.chore-requester')).toHaveText('Requested by Rina');await card.locator('summary').click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
 await card.locator('[data-swipe-complete]').focus();await page.keyboard.press('Enter');await expect(page.locator('#chore-complete-dialog')).toBeVisible();await page.locator('#chore-complete-save').click();await expect(card).toHaveCount(0);
});
test('the existing routine form offers as-needed turns without date fields',async({page})=>{
 await page.goto('/#chores');await expect(page.locator('#chore-new')).toBeEnabled();await page.locator('#chore-new').click();
 await page.locator('#chore-title').fill('Milk rotation '+crypto.randomUUID());await page.locator('#chore-kind').selectOption('request');await page.locator('#chore-kind').selectOption('routine');
 await page.locator('#routine-schedule').selectOption('as_needed');await expect(page.locator('#routine-start')).toBeHidden();await expect(page.locator('[data-routine-field=time]')).toBeHidden();
 await page.locator('[data-routine-owner=rohil]').click();await page.locator('[data-routine-owner=rina]').click();const title=await page.locator('#routine-title').inputValue();
 await page.locator('#chore-routine-save').click();await expect(page.locator('#chore-routine-dialog')).toBeHidden();
 const card=page.locator('#home-feed .chore-card').filter({has:page.getByRole('heading',{name:title,exact:true})});await expect(card).toContainText('Next turn');await expect(card).toContainText('Assigned to Michal');
 await card.locator('[data-swipe-complete]').focus();await page.keyboard.press('Enter');await expect(page.locator('#chore-complete-dialog')).toBeVisible();await page.locator('#chore-complete-save').click();await expect(card).toHaveCount(0);
 const d=await rpc(page,'chores_dashboard'),routine=d.routines.find((r:any)=>r.title===title),active=d.tasks.filter((t:any)=>t.routine_id===routine.id&&t.state==='active');expect(active).toHaveLength(1);expect(active[0].assignee).toBe('rohil');expect(active[0].due_at).toBeNull();
});
test('time-of-day colors follow New York while explicit light and dark still override',async({page})=>{
 await page.clock.setFixedTime(new Date('2026-11-02T23:00:00Z'));await page.goto('/?webgl=0#chores');await openSettings(page);await page.locator('#theme-select').selectOption('daylight');
 await expect(page.locator('html')).toHaveAttribute('data-house-night','0.5');await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 const dusk=await page.locator('html').evaluate(el=>getComputedStyle(el).backgroundColor);await page.locator('#settings-close').click();
 await page.clock.setFixedTime(new Date('2026-11-03T05:00:00Z'));await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await expect(page.locator('html')).toHaveAttribute('data-house-night','1');expect(await page.locator('html').evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe(dusk);
 await openSettings(page);await page.locator('#theme-select').selectOption('light');await expect(page.locator('html')).toHaveAttribute('data-house-night','0');await expect(page.locator('html')).toHaveAttribute('data-theme','light');
});

test('incoming assignments refresh while a personal draft keeps focus',async({page})=>{
 await page.goto('/#chores');await expect(page.locator('#personal-add')).toBeEnabled();await expect(page.locator('#main')).toHaveAttribute('aria-busy','false');
 await page.locator('#personal-title').fill('Keep this draft');
 const t=await rpc(page,'save_chore',{id:crypto.randomUUID(),request_id:crypto.randomUUID(),actor:'rina',action:'create',title:'Incoming assignment '+crypto.randomUUID(),kind:'request',points:0,icon_id:'parcel',pinned:false,assignee:'michal'});
 await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
 await expect(page.locator(`[data-home-key="shared:${t.id}"]`)).toBeVisible();await expect(page.locator('#personal-title')).toHaveValue('Keep this draft');await expect(page.locator('#personal-title')).toBeFocused();
});
