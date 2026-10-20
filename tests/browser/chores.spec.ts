import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const rpc=async(page:Page,name:string,p?:unknown)=>(await page.request.post(`/rest/v1/rpc/utilities_${name}`,{headers:{apikey:'local-public'},data:p?{p}:{}})).json();
async function open(page:Page,who='michal'){
 await page.goto('/#chores');await expect(page.locator('#chores-status')).toHaveText('Shared chores · up to date');
 await page.locator(`[data-chore-person=${who}]`).click();
}
const card=(page:Page,title:string)=>page.locator('.chore-grid .chore-card').filter({has:page.locator('h3',{hasText:title})});
const view=async(page:Page,v:string)=>page.locator(`[data-chore-view=${v}]`).click();
async function choosePerson(page:Page,who:string){await page.locator('#chore-switch').click();await page.locator(`[data-chore-person=${who}]`).click();}

test('requests, urgency, hand-back and shared identity work across tabs on a phone',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:390,height:844});
 await open(page,'rohil');
 await expect(page.locator('#export')).toBeEnabled();const downloadEvent=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadEvent;const exported=JSON.parse(await readFile((await download.path())!,'utf8'));expect(exported.tasks).toEqual([]);expect(exported.history).toEqual([]);expect(exported.bills).toBeUndefined();
 await page.locator('#chore-new').click();
 await page.locator('[data-chore-shortcut=bananas]').click();await expect(page.locator('#chore-title')).toHaveValue('Pick up bananas');
 await page.locator('#chore-title').fill('Bananas <b>for everyone</b>');
 await page.locator('input[name=chore-assignee][value=michal]').check();await page.locator('#chore-pinned').check();await page.locator('#chore-tonight').check();
 expect(await page.locator('#chore-task-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBeTruthy();
 await page.locator('#chore-task-save').click();await expect(page.locator('#chore-task-dialog')).not.toBeVisible();
 await choosePerson(page,'michal');const request=card(page,'Bananas <b>for everyone</b>');await expect(request).toContainText('Asked by Rohil');await expect(request).toContainText('Pinned');await expect(request.locator('h3 b')).toHaveCount(0);
 await expect(page.locator('#chore-badge')).toHaveText('1');
 await request.getByRole('button',{name:'Hand back',exact:true}).click();await expect(page.locator('#chore-action-heading')).toBeFocused();
 await page.locator('#chore-action-note').fill('Could someone cover today?');await page.locator('#chore-action-save').click();await expect(page.locator('#chore-action-dialog')).not.toBeVisible();await expect(request).toHaveClass(/is-unassigned/);await expect(request).toContainText('Unassigned');
 await view(page,'household');
 await request.getByRole('button',{name:'Claim',exact:true}).click();await page.locator('#chore-action-save').click();await expect(page.locator('#chore-action-dialog')).not.toBeVisible();
 await view(page,'mine');await expect(request).toBeVisible();await request.locator('summary').click();await expect(request).toContainText('Could someone cover today?');
 await page.locator('#refresh').click();await expect(request.locator('details')).toHaveAttribute('open','');
 await page.getByRole('link',{name:'Miscellaneous',exact:true}).click();await expect(page.locator('#identity-name')).toContainText('You’re Michal');
 await page.locator('#switch-person').click();await page.locator('[data-identity=rina]').click();await page.getByRole('link',{name:/^Chores/}).click();await expect(page.locator('#chore-identity-name')).toContainText('You’re Rina');
 await page.getByLabel('Color theme').selectOption('dark');await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await page.getByLabel('Color theme').selectOption('light');await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.reload();await expect(page.locator('#chore-identity-name')).toContainText('You’re Rina');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();expect(errors).toEqual([]);
});

test('logging, shared credit, correction, undo, and history leave both financial ledgers unchanged',async({page})=>{
 const u=await rpc(page,'dashboard'),m=await rpc(page,'misc_dashboard');await open(page);
 await page.locator('#chore-log').click();await page.locator('[data-chore-shortcut=recycling]').click();await page.locator('#chore-title').fill('Recycling together');
 await page.locator('#chore-effort').selectOption('2');await page.locator('input[name=chore-log-contributor][value=rina]').check();await page.locator('input[name=chore-log-contributor][value=ohm]').check();
 await page.locator('#chore-task-save').click();await expect(page.locator('#chore-task-dialog')).not.toBeVisible();
 await view(page,'leaderboard');const michal=page.locator('.chore-score.member-michal');await expect(michal).toContainText('0.67');await michal.locator('summary').click();await expect(michal).toContainText('Recycling together');
 await view(page,'household');await page.locator('#chore-status-filter').selectOption('completed');const c=card(page,'Recycling together');await expect(c).toContainText('0.67 pts each');
 await c.getByRole('button',{name:'Correct completion',exact:true}).click();await expect(page.locator('#chore-complete-heading')).toBeFocused();await page.locator('input[name=chore-contributor][value=rina]').uncheck();await page.locator('input[name=chore-contributor][value=ohm]').uncheck();await page.locator('#chore-complete-effort').selectOption('3');
 await page.locator('#chore-complete-save').click();await expect(page.locator('#chore-complete-dialog')).not.toBeVisible();await expect(c).toContainText('3 pts each');await c.locator('summary').click();await expect(c).toContainText('Completion saved');
 await c.getByRole('button',{name:'Undo',exact:true}).click();await page.locator('#chore-action-save').click();await expect(page.locator('#chore-action-dialog')).not.toBeVisible();await expect(c).toHaveCount(0);
 await view(page,'leaderboard');await expect(page.locator('.chore-score.member-michal')).toContainText('0points');
 const afterU=await rpc(page,'dashboard'),afterM=await rpc(page,'misc_dashboard');for(const k of ['bills','allocations','history','bill_history'])expect(afterU[k]).toEqual(u[k]);for(const k of ['expenses','expense_history','settlements','settlement_history','pairs','rounding_cursor'])expect(afterM[k]).toEqual(m[k]);
});

test('weekly routines, step editing and agenda are usable on desktop and mobile',async({page})=>{
 await open(page);await view(page,'week');await page.locator('#chore-manage-routines').click();await page.locator('#routine-new').click();await page.locator('#chore-trash-template').click();
 await expect(page.locator('#routine-title')).toHaveValue('Weekly trash cycle');await expect(page.locator('[data-routine-step]')).toHaveCount(2);
 await page.getByRole('button',{name:'Move Rohil earlier',exact:true}).click();await expect(page.locator('#routine-order li').nth(2)).toContainText('Rohil');
 await page.locator('#routine-first').selectOption('rina');await page.locator('#chore-routine-save').click();await expect(page.locator('#chore-routine-dialog')).not.toBeVisible();
 await expect(page.locator('.chore-week .chore-card')).toHaveCount(2);await expect(page.locator('.chore-week .chore-card').first()).toContainText('Rina');
 await page.getByRole('button',{name:'Next week',exact:true}).click();await expect(page.locator('.chore-week .chore-card').first()).toContainText('Rohil');
 await page.locator('.chore-week .chore-card').first().getByRole('button',{name:'Open chore'}).click();await page.locator('#chore-title').fill('A special collection');await page.locator('#chore-task-save').click();await expect(page.locator('#chore-task-dialog')).not.toBeVisible();
 await page.locator('#chore-manage-routines').click();await page.locator('[data-edit-routine]').click();await expect(page.locator('#routine-start')).toBeDisabled();await page.locator('[data-step-field=title]').last().fill('Return empty bins');await page.locator('#chore-routine-save').click();await expect(page.locator('#chore-routine-dialog')).not.toBeVisible();
 await expect(page.locator('.chore-week')).toContainText('A special collection');await expect(page.locator('.chore-week')).toContainText('Return empty bins');
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.locator('.chore-week .chore-card').first().getByRole('button',{name:'Open chore'}).click();expect(await page.locator('#chore-task-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBeTruthy();await page.keyboard.press('Escape');await expect(page.locator('#chore-task-dialog')).not.toBeVisible();
});

test('lost chore responses retry once; stale revisions preserve the draft',async({page})=>{
 await open(page);await page.locator('#chore-new').click();await page.locator('#chore-title').fill('Retry chore');
 await page.route('**/rpc/utilities_save_chore',async route=>{await route.fetch();await route.abort();},{times:1});
 await page.locator('#chore-task-save').click();await expect(page.locator('#chore-task-error')).toBeVisible();await expect(page.locator('#chore-title')).toHaveValue('Retry chore');
 await page.locator('#chore-task-save').click();await expect(page.locator('#chore-task-dialog')).not.toBeVisible();
 const d=await rpc(page,'chores_dashboard'),t=d.tasks.find((t:any)=>t.title==='Retry chore');expect(d.history.filter((h:any)=>h.id===t.id)).toHaveLength(1);
 await view(page,'household');await card(page,'Retry chore').getByRole('button',{name:'Edit',exact:true}).click();await page.locator('#chore-title').fill('Keep my wording');
 await rpc(page,'save_chore',{id:t.id,expected_version:t.version,actor:'rina',action:'claim',request_id:crypto.randomUUID()});
 await page.locator('#chore-task-save').click();await expect(page.locator('#chore-task-error')).toContainText('changed');await expect(page.locator('#chore-title')).toHaveValue('Keep my wording');
});

test('chores have an independent read-only fallback and do not block the other tabs',async({page})=>{
 await page.route('**/rpc/utilities_chores_dashboard',route=>route.abort());await page.goto('/#chores');
 await expect(page.locator('#chores-status')).toHaveText('Viewing saved chores');await page.locator('[data-chore-person=michal]').click();await expect(page.locator('#chore-new')).toBeDisabled();await expect(page.locator('#chore-log')).toBeDisabled();await expect(page.locator('#chores-notice')).toContainText('disabled');
 await view(page,'week');await expect(page.locator('#chore-manage-routines')).toBeDisabled();
 await page.getByRole('link',{name:'Utilities',exact:true}).click();await expect(page.locator('#new-payment')).toBeEnabled();
 await page.getByRole('link',{name:'Miscellaneous',exact:true}).click();await expect(page.locator('#new-expense')).toBeEnabled();
});

test('pinned reminders retain zero points through editing, completion, correction, undo and routines',async({page})=>{
 await page.setViewportSize({width:390,height:844});await open(page);
 const before=await rpc(page,'chores_dashboard');
 await page.locator('#chore-new').click();await expect(page.locator('#chore-effort')).toHaveValue('1');
 await page.locator('#chore-title').fill('Wash your own dishes');await page.locator('input[name=chore-assignee][value=michal]').check();await page.locator('#chore-pinned').check();await page.locator('#chore-effort').selectOption('0');
 await page.locator('#chore-task-save').click();await expect(page.locator('#chore-task-dialog')).not.toBeVisible();const c=card(page,'Wash your own dishes');
 await expect(c.locator('.chore-points')).toHaveText('No points');await expect(c).toContainText('Pinned');
 await c.getByRole('button',{name:'Edit',exact:true}).click();await expect(page.locator('#chore-effort')).toHaveValue('0');await page.locator('#chore-note').fill('Before bed, please.');await page.locator('#chore-task-save').click();await expect(page.locator('#chore-task-dialog')).not.toBeVisible();await expect(c.locator('.chore-points')).toHaveText('No points');
 await c.getByRole('button',{name:'Mark done',exact:true}).click();await expect(page.locator('#chore-complete-effort')).toHaveValue('0');await expect(page.locator('#chore-complete-summary')).toContainText('earns no points');
 await page.locator('input[name=chore-contributor][value=rina]').check();await page.locator('#chore-complete-save').click();await expect(page.locator('#chore-complete-dialog')).not.toBeVisible();
 let d=await rpc(page,'chores_dashboard');expect(d.leaderboard).toEqual(before.leaderboard);expect(d.tasks.find((t:any)=>t.title==='Wash your own dishes').status).toBe('completed');
 await page.locator('#chore-mine-status-filter').selectOption('completed');await expect(c).toBeVisible();await c.getByRole('button',{name:'Correct completion',exact:true}).click();await page.locator('#chore-complete-effort').selectOption('2');await expect(page.locator('#chore-complete-summary')).toContainText('recalculated');await page.locator('#chore-complete-save').click();await expect(page.locator('#chore-complete-dialog')).not.toBeVisible();
 await c.getByRole('button',{name:'Correct completion',exact:true}).click();await page.locator('#chore-complete-effort').selectOption('0');await expect(page.locator('#chore-complete-summary')).toContainText('earns no points');await page.locator('#chore-complete-save').click();await expect(page.locator('#chore-complete-dialog')).not.toBeVisible();expect((await rpc(page,'chores_dashboard')).leaderboard).toEqual(before.leaderboard);
 await c.getByRole('button',{name:'Undo',exact:true}).click();await page.locator('#chore-action-save').click();await expect(page.locator('#chore-action-dialog')).not.toBeVisible();await view(page,'mine');await page.locator('#chore-mine-status-filter').selectOption('active');await expect(c.locator('.chore-points')).toHaveText('No points');
 await page.locator('#chore-new').click();await page.locator('.chore-icon-picker summary').click();await page.getByRole('button',{name:'Request a repair icon',exact:true}).click();await expect(page.locator('#chore-title')).toHaveValue('Request a repair');await page.keyboard.press('Escape');
 await view(page,'week');await page.locator('#chore-manage-routines').click();await page.locator('#routine-new').click();await page.locator('#routine-title').fill('Repair follow-up reminders');await page.locator('[data-step-field=title]').fill('Message the landlord');await page.locator('[data-step-field=icon_id]').selectOption('repair-request');await page.locator('[data-step-field=points]').selectOption('0');await page.locator('#chore-routine-save').click();await expect(page.locator('#chore-routine-dialog')).not.toBeVisible();
 d=await rpc(page,'chores_dashboard');const routine=d.routines.find((r:any)=>r.title==='Repair follow-up reminders');expect(routine.steps[0].points).toBe(0);expect(routine.steps[0].icon_id).toBe('repair-request');expect(d.tasks.filter((t:any)=>t.routine_id===routine.id).every((t:any)=>t.points===0)).toBeTruthy();expect(d.leaderboard).toEqual(before.leaderboard);
 await page.locator('#chore-manage-routines').click();await page.locator(`[data-edit-routine="${routine.id}"]`).click();await expect(page.locator('[data-step-field=points]')).toHaveValue('0');
 expect(await page.locator('#chore-routine-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBeTruthy();
});

test('requesting without an identity explains how to continue, and unassigned work appears in every queue',async({page})=>{
 await page.goto('/#chores');await expect(page.locator('#chores-status')).toHaveText('Shared chores · up to date');
 await page.locator('#chore-new').click();await expect(page.locator('#chore-identity-error')).toContainText('Choose your name before requesting');await expect(page.locator('[data-chore-person=michal]')).toBeFocused();
 await page.locator('[data-chore-person=rohil]').click();await expect(page.locator('#chore-task-dialog')).toBeVisible();await expect(page.locator('#chore-task-heading')).toBeFocused();
 await page.locator('#chore-title').fill('An open invitation to help');await page.locator('#chore-task-save').click();await expect(page.locator('#chore-task-dialog')).not.toBeVisible();
 const task=card(page,'An open invitation to help');await expect(task).toHaveClass(/is-unassigned/);await expect(task).toContainText('Asked by Rohil');
 for(const who of ['rina','ohm','michal']){await choosePerson(page,who);await expect(task).toBeVisible();await expect(task).toHaveClass(/is-unassigned/);}
 await task.getByRole('button',{name:'Claim',exact:true}).click();await page.locator('#chore-action-save').click();await expect(page.locator('#chore-action-dialog')).not.toBeVisible();await expect(task).not.toHaveClass(/is-unassigned/);
 await view(page,'household');await expect(task).toHaveCount(0);await expect(page.locator('#chore-filter')).toHaveCount(0);await view(page,'mine');await expect(task).toBeVisible();
 await choosePerson(page,'rina');await expect(task).toHaveCount(0);
 await page.locator('#chore-switch').click();await page.locator('#chore-log').click();await expect(page.locator('#chore-identity-error')).toContainText('logging a completion');
});
