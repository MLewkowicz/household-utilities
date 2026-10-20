import {test,expect,type Page,type Locator} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {addDays,weekStart} from '../../src/chores';
const rpc=async(page:Page,name:string,p?:unknown)=>(await page.request.post(`/rest/v1/rpc/utilities_${name}`,{headers:{apikey:'local-public'},data:p?{p}:{}})).json();
async function open(page:Page,who='michal'){
 await page.goto('/#chores');await expect(page.locator('#chores-status')).toHaveText('Shared chores · up to date');
 await page.locator(`[data-chore-person=${who}]`).click();
}
const card=(page:Page,title:string)=>page.locator('.chore-grid .chore-card').filter({has:page.locator('h3',{hasText:title})});
async function expand(card:Locator){const details=card.locator(':scope > .tile-details');if(!await details.evaluate(el=>el.hasAttribute('open')))await details.locator(':scope > summary').click();}
const view=async(page:Page,v:string)=>page.locator(`[data-chore-view=${v}]`).click();
async function choosePerson(page:Page,who:string){await page.locator('#chore-switch').click();await page.locator(`[data-chore-person=${who}]`).click();}

test('requests, urgency, hand-back and shared identity work across tabs on a phone',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:390,height:844});
 await open(page,'rohil');
 await expect(page.locator('#export')).toBeEnabled();const downloadEvent=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadEvent;const exported=JSON.parse(await readFile((await download.path())!,'utf8'));expect(exported.tasks).toEqual([]);expect(exported.history).toEqual([]);expect(exported.bills).toBeUndefined();
 await page.locator('#chore-new').click();
 await page.locator('[data-chore-shortcut=bananas]').click();await expect(page.locator('#chore-title')).toHaveValue('Pick up bananas');
 await page.locator('#chore-title').fill('Bananas <b>for everyone</b>');
 await page.locator('input[name=chore-assignee][value=michal]').check();await page.locator('#chore-scheduling > summary').click();await page.locator('#chore-pinned').check();await page.locator('#chore-tonight').check();
 expect(await page.locator('#chore-task-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBeTruthy();
 await page.locator('#chore-task-save').click();await expect(page.locator('#chore-task-dialog')).not.toBeVisible();
 await choosePerson(page,'michal');const request=card(page,'Bananas <b>for everyone</b>');await expect(request).toContainText('From Rohil');await expect(request).toContainText('Pinned');await expect(request.locator('h3 b')).toHaveCount(0);
 await expect(page.locator('#chore-badge')).toHaveText('1');
 await expand(request);await request.getByRole('button',{name:'Hand back',exact:true}).click();await expect(page.locator('#chore-action-heading')).toBeFocused();
 await page.locator('#chore-action-note').fill('Could someone cover today?');await page.locator('#chore-action-save').click();await expect(page.locator('#chore-action-dialog')).not.toBeVisible();await expect(request).toHaveClass(/is-unassigned/);await expect(request).toContainText('Unassigned');
 await view(page,'household');
 await expand(request);await request.getByRole('button',{name:'Claim',exact:true}).click();await page.locator('#chore-action-save').click();await expect(page.locator('#chore-action-dialog')).not.toBeVisible();
 await view(page,'mine');await expect(request).toBeVisible();await expand(request);await request.locator('.chore-history > summary').click();await expect(request).toContainText('Could someone cover today?');
 await page.locator('#refresh').click();await expect(request.locator(':scope > .tile-details')).toHaveAttribute('open','');
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
 await view(page,'household');await page.locator('#chore-status-filter').selectOption('completed');const c=card(page,'Recycling together');await expand(c);await expect(c).toContainText('0.67 pts each');
 await expand(c);await c.getByRole('button',{name:'Correct completion',exact:true}).click();await expect(page.locator('#chore-complete-heading')).toBeFocused();await page.locator('input[name=chore-contributor][value=rina]').uncheck();await page.locator('input[name=chore-contributor][value=ohm]').uncheck();await page.locator('#chore-complete-effort').selectOption('3');
 await page.locator('#chore-complete-save').click();await expect(page.locator('#chore-complete-dialog')).not.toBeVisible();await expect(c).toContainText('3 pts each');await expand(c);await c.locator('.chore-history > summary').click();await expect(c).toContainText('Completion saved');
 await expand(c);await c.getByRole('button',{name:'Undo',exact:true}).click();await page.locator('#chore-action-save').click();await expect(page.locator('#chore-action-dialog')).not.toBeVisible();await expect(c).toHaveCount(0);
 await view(page,'leaderboard');await expect(page.locator('.chore-score.member-michal')).toContainText('0points');
 const afterU=await rpc(page,'dashboard'),afterM=await rpc(page,'misc_dashboard');for(const k of ['bills','allocations','history','bill_history'])expect(afterU[k]).toEqual(u[k]);for(const k of ['expenses','expense_history','settlements','settlement_history','pairs','rounding_cursor'])expect(afterM[k]).toEqual(m[k]);
});

test('one recurring item starts on its selected date and keeps future edits on desktop and mobile',async({page})=>{
 await open(page);const before=await rpc(page,'chores_dashboard');
 const start=addDays(weekStart(before.local_day),9); // Next Wednesday, never a Monday.
 await page.locator('#chore-new').click();await page.locator('#chore-title').fill('Take the bins out');await page.locator('#chore-due').fill(start);await page.locator('#chore-kind').selectOption('routine');
 await expect(page.locator('#routine-title')).toHaveValue('Take the bins out');await expect(page.locator('#routine-start')).toHaveValue(start);
 await expect(page.locator('[data-routine-item]')).toHaveCount(1);await expect(page.getByText('Steps in each cycle',{exact:true})).toHaveCount(0);await expect(page.locator('[data-routine-field=title]')).toHaveCount(0);
 for(const who of ['rina','ohm','rohil'])await page.locator(`[data-routine-owner=${who}]`).click();
 await page.locator('#routine-rotation > summary').click();await page.getByRole('button',{name:'Move Rohil earlier',exact:true}).click();await expect(page.locator('#routine-order li').nth(2)).toContainText('Rohil');
 await page.locator('#routine-first').selectOption('rina');await page.locator('#chore-routine-save').click();await expect(page.locator('#chore-routine-dialog')).not.toBeVisible();
 const d=await rpc(page,'chores_dashboard'),r=d.routines.find((r:any)=>r.title==='Take the bins out');
 expect(r.start_week).toBe(start);expect(r.steps).toHaveLength(1);expect(r.steps[0].weekday).toBe(0);
 const occurrences=d.tasks.filter((t:any)=>t.routine_id===r.id).sort((a:any,b:any)=>a.due_on.localeCompare(b.due_on));expect(occurrences[0].due_on).toBe(start);expect(occurrences[0].assignee).toBe('rina');expect(occurrences[1].due_on).toBe(addDays(start,7));expect(occurrences[1].assignee).toBe('rohil');
 await view(page,'week');await page.getByRole('button',{name:'Next week',exact:true}).click();const occurrence=page.locator('.chore-week .chore-card').filter({hasText:'Take the bins out'});await expect(occurrence).toHaveCount(1);await expect(occurrence).toContainText('Rina');
 await expand(occurrence);await occurrence.getByRole('button',{name:'Edit',exact:true}).click();await page.locator('#chore-title').fill('A special collection');await page.locator('#chore-task-save').click();await expect(page.locator('#chore-task-dialog')).not.toBeVisible();
 await page.locator('#chore-manage-routines').click();const summary=page.locator('.routine-summary').filter({hasText:'Take the bins out'});await summary.locator('details > summary').click();await expect(summary).toContainText('Wednesday');await summary.locator('[data-edit-routine]').click();await expect(page.locator('#routine-start')).toBeDisabled();await page.locator('#routine-title').fill('Weekly bins');await page.locator('#chore-routine-save').click();await expect(page.locator('#chore-routine-dialog')).not.toBeVisible();
 await expect(page.locator('.chore-week')).toContainText('A special collection');await page.getByRole('button',{name:'Next week',exact:true}).click();await expect(page.locator('.chore-week')).toContainText('Weekly bins');
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.locator('#chore-manage-routines').click();await page.locator('#routine-new').click();await expect(page.locator('#routine-start')).toHaveValue(before.local_day);expect(await page.locator('#chore-routine-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBeTruthy();await page.keyboard.press('Escape');
});

test('editing older grouped and offset routines preserves their items and actual due dates',async({page})=>{
 const day=(await rpc(page,'chores_dashboard')).local_day,anchor=weekStart(day);
 const steps=[{id:'out',title:'Legacy trash out',icon_id:'trash',note:'',points:1,weekday:2,time:'20:00'},{id:'in',title:'Legacy bins back',icon_id:'bins',note:'',points:0,weekday:3,time:null}];
 for(const items of [steps,[steps[1]]]){
  const r=await rpc(page,'save_chore_routine',{id:crypto.randomUUID(),request_id:crypto.randomUUID(),actor:'rina',title:'Older schedule '+items.length,start_week:anchor,interval_weeks:1,owners:['rina'],start_index:0,enabled:true,steps:items});
  await page.goto('/#chores');await page.reload(); // Fixtures were seeded outside this page's RPC cache.
  await expect(page.locator('#chores-status')).toHaveText('Shared chores · up to date');
  if(await page.locator('[data-chore-person=michal]').isVisible())await page.locator('[data-chore-person=michal]').click();
  await view(page,'week');await page.locator('#chore-manage-routines').click();await page.locator(`[data-edit-routine="${r.id}"]`).click();
  await expect(page.locator('#routine-start')).toHaveValue(items.length===1?addDays(anchor,3):anchor);await expect(page.locator('[data-routine-item]')).toHaveCount(items.length);
  await page.locator('#chore-routine-save').click();await expect(page.locator('#chore-routine-dialog')).not.toBeVisible();
  const after=(await rpc(page,'chores_dashboard')).routines.find((x:any)=>x.id===r.id);
  expect(after.start_week).toBe(anchor);expect(after.steps).toEqual(r.steps);
 }
});

test('lost chore responses retry once; stale revisions preserve the draft',async({page})=>{
 await open(page);await page.locator('#chore-new').click();await page.locator('#chore-title').fill('Retry chore');
 await page.route('**/rpc/utilities_save_chore',async route=>{await route.fetch();await route.abort();},{times:1});
 await page.locator('#chore-task-save').click();await expect(page.locator('#chore-task-error')).toBeVisible();await expect(page.locator('#chore-title')).toHaveValue('Retry chore');
 await page.locator('#chore-task-save').click();await expect(page.locator('#chore-task-dialog')).not.toBeVisible();
 const d=await rpc(page,'chores_dashboard'),t=d.tasks.find((t:any)=>t.title==='Retry chore');expect(d.history.filter((h:any)=>h.id===t.id)).toHaveLength(1);
 await view(page,'household');await expand(card(page,'Retry chore'));await card(page,'Retry chore').getByRole('button',{name:'Edit',exact:true}).click();await page.locator('#chore-title').fill('Keep my wording');
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
 await page.locator('#chore-title').fill('Wash your own dishes');await page.locator('input[name=chore-assignee][value=michal]').check();await page.locator('#chore-scheduling > summary').click();await page.locator('#chore-pinned').check();await page.locator('#chore-effort').selectOption('0');
 await page.locator('#chore-task-save').click();await expect(page.locator('#chore-task-dialog')).not.toBeVisible();const c=card(page,'Wash your own dishes');
 await expect(c.locator('.chore-points')).toHaveCount(0);await expect(c).toContainText('Pinned');
 await expand(c);await c.getByRole('button',{name:'Edit',exact:true}).click();await expect(page.locator('#chore-effort')).toHaveValue('0');await page.locator('#chore-more > summary').click();await page.locator('#chore-note').fill('Before bed, please.');await page.locator('#chore-task-save').click();await expect(page.locator('#chore-task-dialog')).not.toBeVisible();await expect(c.locator('.chore-points')).toHaveCount(0);
 await expand(c);await c.getByRole('button',{name:'Mark done',exact:true}).click();await expect(page.locator('#chore-complete-effort')).toHaveValue('0');await expect(page.locator('#chore-complete-summary')).toContainText('earns no points');
 await page.locator('input[name=chore-contributor][value=rina]').check();await page.locator('#chore-complete-save').click();await expect(page.locator('#chore-complete-dialog')).not.toBeVisible();
 let d=await rpc(page,'chores_dashboard');expect(d.leaderboard).toEqual(before.leaderboard);expect(d.tasks.find((t:any)=>t.title==='Wash your own dishes').status).toBe('completed');
 await page.locator('#chore-mine-status-filter').selectOption('completed');await expect(c).toBeVisible();await expand(c);await c.getByRole('button',{name:'Correct completion',exact:true}).click();await expect(page.locator('#chore-complete-effort')).toBeDisabled();await expect(page.locator('#chore-complete-summary')).toContainText('earns no points');await page.locator('#chore-complete-save').click();await expect(page.locator('#chore-complete-dialog')).not.toBeVisible();
 await expand(c);await c.getByRole('button',{name:'Correct completion',exact:true}).click();await expect(page.locator('#chore-complete-effort')).toHaveValue('0');await expect(page.locator('#chore-complete-summary')).toContainText('earns no points');await page.locator('#chore-complete-save').click();await expect(page.locator('#chore-complete-dialog')).not.toBeVisible();expect((await rpc(page,'chores_dashboard')).leaderboard).toEqual(before.leaderboard);
 await expand(c);await c.getByRole('button',{name:'Undo',exact:true}).click();await page.locator('#chore-action-save').click();await expect(page.locator('#chore-action-dialog')).not.toBeVisible();await view(page,'mine');await page.locator('#chore-mine-status-filter').selectOption('active');await expect(c.locator('.chore-points')).toHaveCount(0);
 await page.locator('#chore-new').click();await page.locator('.chore-icon-picker summary').click();await page.getByRole('button',{name:'Request a repair icon',exact:true}).click();await expect(page.locator('#chore-title')).toHaveValue('Request a repair');await page.keyboard.press('Escape');
 await view(page,'week');await page.locator('#chore-manage-routines').click();await page.locator('#routine-new').click();await page.locator('#routine-title').fill('Repair follow-up reminders');await page.locator('[data-routine-field=kind]').selectOption('reminder');await page.locator('.routine-context > summary').click();await page.locator('[data-routine-field=icon_id]').selectOption('repair-request');await page.locator('#chore-routine-save').click();await expect(page.locator('#chore-routine-dialog')).not.toBeVisible();
 d=await rpc(page,'chores_dashboard');const routine=d.routines.find((r:any)=>r.title==='Repair follow-up reminders');expect(routine.steps[0].points).toBe(0);expect(routine.steps[0].icon_id).toBe('repair-request');expect(d.tasks.filter((t:any)=>t.routine_id===routine.id).every((t:any)=>t.points===0)).toBeTruthy();expect(d.leaderboard).toEqual(before.leaderboard);
 await page.locator('#chore-manage-routines').click();await page.locator(`[data-edit-routine="${routine.id}"]`).click();await expect(page.locator('[data-routine-field=kind]')).toHaveValue('reminder');await expect(page.locator('[data-routine-field=points]')).not.toBeVisible();
 expect(await page.locator('#chore-routine-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBeTruthy();
});

test('requesting without an identity explains how to continue, and unassigned work appears in every queue',async({page})=>{
 await page.goto('/#chores');await expect(page.locator('#chores-status')).toHaveText('Shared chores · up to date');
 await page.locator('#chore-new').click();await expect(page.locator('#chore-identity-error')).toContainText('Choose your name before requesting');await expect(page.locator('[data-chore-person=michal]')).toBeFocused();
 await page.locator('[data-chore-person=rohil]').click();await expect(page.locator('#chore-task-dialog')).toBeVisible();await expect(page.locator('#chore-task-heading')).toBeFocused();
 await page.locator('#chore-title').fill('An open invitation to help');await page.locator('#chore-task-save').click();await expect(page.locator('#chore-task-dialog')).not.toBeVisible();
 const task=card(page,'An open invitation to help');await expect(task).toHaveClass(/is-unassigned/);await expect(task).toContainText('From Rohil');
 for(const who of ['rina','ohm','michal']){await choosePerson(page,who);await expect(task).toBeVisible();await expect(task).toHaveClass(/is-unassigned/);}
 await expand(task);await task.getByRole('button',{name:'Claim',exact:true}).click();await page.locator('#chore-action-save').click();await expect(page.locator('#chore-action-dialog')).not.toBeVisible();await expect(task).not.toHaveClass(/is-unassigned/);
 await view(page,'household');await expect(task).toHaveCount(0);await expect(page.locator('#chore-household-filter')).toHaveValue('anyone');await page.locator('#chore-household-filter').selectOption('all');await expect(task).toBeVisible();await page.locator('#chore-household-filter').selectOption('rina');await expect(task).toHaveCount(0);await page.locator('#chore-household-filter').selectOption('michal');await expect(task).toBeVisible();
 await view(page,'week');await expect(page.locator('#chore-filter')).toHaveValue('all');await page.locator('#chore-filter').selectOption('ohm');await view(page,'household');await expect(page.locator('#chore-household-filter')).toHaveValue('michal');await expect(task).toBeVisible();await view(page,'mine');await expect(task).toBeVisible();
 await choosePerson(page,'rina');await expect(task).toHaveCount(0);await view(page,'household');await page.locator('#chore-household-filter').selectOption('all');await expect(task).toBeVisible();
 await page.reload();await expect(page.locator('#chores-status')).toHaveText('Shared chores · up to date');await view(page,'household');await expect(page.locator('#chore-household-filter')).toHaveValue('anyone');await expect(task).toHaveCount(0);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.locator('#chore-switch').click();await page.locator('#chore-log').click();await expect(page.locator('#chore-identity-error')).toContainText('logging a completion');
});


test('the trash liner has its own icon and half-point recurring work completes and edits without rounding',async({page})=>{
 await page.setViewportSize({width:390,height:844});await open(page);
 const before=await rpc(page,'chores_dashboard');await page.locator('#chore-new').click();await page.locator('#chore-title').fill('Put in new trash bag');await page.locator('#chore-effort').selectOption('0.5');
 await page.locator('#chore-kind').selectOption('routine');await expect(page.locator('[data-routine-field=points]')).toHaveValue('0.5');await page.locator('.routine-context > summary').click();await expect(page.locator('[data-routine-field=icon_id]')).toHaveValue('trash-bag');
 await page.locator('#chore-routine-save').click();await expect(page.locator('#chore-routine-dialog')).not.toBeVisible();const c=card(page,'Put in new trash bag');await expect(c).toContainText('0.5 pts');await c.locator('.completion-handle').focus();await page.keyboard.press('Enter');await expect(c).toHaveCount(0);
 const d=await rpc(page,'chores_dashboard'),routine=d.routines.find((r:any)=>r.title==='Put in new trash bag'),done=d.tasks.find((t:any)=>t.routine_id===routine.id&&!t.projected);expect(done.points).toBe(0.5);expect(done.state).toBe('completed');expect(done.icon_id).toBe('trash-bag');
 const score=(ledger:any)=>ledger.leaderboard.find((r:any)=>r.period==='all'&&r.member==='michal').units;expect(score(d)-score(before)).toBe(6);
 await page.locator('#chore-mine-status-filter').selectOption('completed');await expand(c);await c.getByRole('button',{name:'Correct completion',exact:true}).click();await expect(page.locator('#chore-complete-effort')).toHaveValue('0.5');await page.keyboard.press('Escape');
 await view(page,'week');await page.locator('#chore-manage-routines').click();await page.locator(`[data-edit-routine="${routine.id}"]`).click();await expect(page.locator('[data-routine-field=points]')).toHaveValue('0.5');
});
