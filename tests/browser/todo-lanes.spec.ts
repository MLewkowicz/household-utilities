import {test,expect,type Page} from '@playwright/test';
import {addDays} from '../../src/chores';
const rpc=async(page:Page,fn:string,p?:unknown)=>{const r=await page.request.post('/rest/v1/rpc/utilities_'+fn,{headers:{apikey:'local-public'},data:p?{p}:{}});expect(r.ok(),await r.text()).toBeTruthy();return r.json();};
const base=()=>({id:crypto.randomUUID(),request_id:crypto.randomUUID(),actor:'michal',action:'create'});
const open=async(page:Page)=>{await page.goto('/?webgl=0#chores');await expect(page.locator('#main')).toHaveAttribute('aria-busy','false');await expect(page.locator('#personal-add')).toBeEnabled();};
test.beforeEach(async({page})=>{await page.addInitScript(()=>{localStorage.setItem('household-person','michal');(window as any).pulses=[];Object.defineProperty(navigator,'vibrate',{value:(p:number[])=>{(window as any).pulses.push(p);return true;}});});});
test('compact lane tiles have matching insets, bounded handles and progressive border feedback',async({page})=>{
 const t=await rpc(page,'save_personal_task',{...base(),title:'Swipe bounds'});await open(page);
 const tile=page.locator(`[data-personal-id="${t.id}"]`);
 for(const width of [320,390,1280]){
  await page.setViewportSize({width,height:900});await tile.scrollIntoViewIfNeeded();const r=(await tile.boundingBox())!,h=(await tile.locator('.completion-handle').boundingBox())!,x=h.x+h.width/2,y=h.y+h.height/2,travel=r.width-h.width-16;
  expect(r.height).toBeLessThanOrEqual(76);const body=await tile.locator('xpath=ancestor::*[contains(@class,"todo-lane-body")]').boundingBox();expect(r.x-body!.x).toBeGreaterThanOrEqual(10);expect(r.x-body!.x).toBeLessThanOrEqual(11);
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+travel*.78,y,{steps:8});const mid=await tile.locator('.completion-handle').evaluate(el=>getComputedStyle(el).borderColor);await page.mouse.move(r.x+r.width+200,y,{steps:8});await expect(tile).toHaveClass(/is-armed/);
  const grip=(await tile.locator('.completion-handle').boundingBox())!;expect(grip.x+grip.width).toBeLessThanOrEqual(r.x+r.width-7);expect(await tile.locator('.completion-handle').evaluate(el=>getComputedStyle(el).borderColor)).not.toBe(mid);
  expect(await tile.locator('.paper-outline').evaluate(el=>parseFloat(getComputedStyle(el).strokeWidth.replace('calc(','')))).toBeGreaterThan(2);
  await page.mouse.move(x+travel*.2,y,{steps:8});await page.mouse.up();await expect(tile).toHaveCSS('--progress','0');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 }
 expect(await page.evaluate(()=>(window as any).pulses)).toEqual([[8],[8],[8]]);
 await tile.locator('.completion-handle').focus();await page.keyboard.press('Enter');await expect(tile).toHaveCount(0);expect(await page.evaluate(()=>(window as any).pulses)).toEqual([[8],[8],[8],[12,40,18]]);await page.locator('#toast').getByRole('button',{name:'Undo',exact:true}).click();await expect(tile).toBeVisible();
});
test('shared swipes confirm contributors, preserve exact credit, and retain pin, history and correction actions',async({page})=>{
 const t=await rpc(page,'save_chore',{...base(),title:'Lane shared '+crypto.randomUUID(),kind:'chore',icon_id:'dishes',points:1,pinned:false,assignee:'michal'});await open(page);
 const tile=page.locator(`[data-chore-id="${t.id}"]`);await expect(tile.locator('xpath=ancestor::*[@data-task-lane]')).toHaveAttribute('data-task-lane','household');
 await tile.locator('.completion-handle').focus();await page.keyboard.press('Enter');await expect(page.locator('#chore-complete-dialog')).toBeVisible();expect(await page.evaluate(()=>(window as any).pulses)).toEqual([]);await page.keyboard.press('Escape');await expect(tile).toBeVisible();expect((await rpc(page,'chores_dashboard')).tasks.find((x:any)=>x.id===t.id).state).toBe('active');
 await tile.locator('.chore-corner-tab').click();await tile.getByRole('button',{name:'Pin',exact:true}).click();await expect(tile).toHaveClass(/is-pinned/);await tile.getByRole('button',{name:'History',exact:true}).click();await expect(page.locator('#todo-history-dialog')).toContainText('Pinned');await page.locator('#todo-history-dialog').getByRole('button',{name:'Close',exact:true}).click();
 await tile.getByRole('button',{name:'Mark done',exact:true}).click();await page.locator('input[name=chore-contributor][value=rina]').check();await page.locator('input[name=chore-contributor][value=ohm]').check();await expect(page.locator('#chore-complete-credit')).toContainText('about 0.33 each');await page.locator('#chore-complete-save').click();await expect(page.locator('#chore-complete-dialog')).toBeHidden();await expect(tile).toHaveCount(0);
 const d=await rpc(page,'chores_dashboard'),done=d.tasks.find((x:any)=>x.id===t.id);expect(done.completion.contributors).toEqual(['michal','rina','ohm']);for(const person of ['michal','rina','ohm'])expect(d.leaderboard.find((s:any)=>s.member===person&&s.period==='all').entries.find((e:any)=>e.id===t.id).units).toBe(4);expect(await page.evaluate(()=>(window as any).pulses)).toEqual([[12,40,18]]);
 await page.locator('#home-history').check();await tile.locator('.chore-corner-tab').click();await expect(tile.getByRole('button',{name:'Correct completion',exact:true})).toBeVisible();await tile.getByRole('button',{name:'Undo',exact:true}).click();await page.locator('#chore-action-save').click();await expect(page.locator('#chore-action-dialog')).toBeHidden();expect((await rpc(page,'chores_dashboard')).tasks.find((x:any)=>x.id===t.id).state).toBe('active');
});
test('quick self reminders use the shared lane, retry safely, and create editable recurring schedules',async({page})=>{
 await open(page);const day=(await rpc(page,'chores_dashboard')).local_day,title='Lunch reminder '+crypto.randomUUID();
 await page.locator('[data-quick-mode=reminder]').click();await page.locator('#personal-title').fill(title);await page.locator('#quick-reminder-date').fill(addDays(day,1));await page.locator('#quick-reminder-time').fill('10:30');
 await page.route('**/utilities_save_reminders',async route=>{await route.fetch();await route.abort();},{times:1});await page.locator('#personal-add').click();await expect(page.locator('#toast')).toContainText(/fetch/i);await expect(page.locator('#personal-title')).toHaveValue(title);await page.locator('#personal-add').click();await expect(page.locator('#personal-title')).toHaveValue('');
 const d=await rpc(page,'chores_dashboard'),tasks=d.tasks.filter((t:any)=>t.title===title);expect(tasks).toHaveLength(1);expect(tasks[0].assignee).toBe('michal');expect(tasks[0].requester).toBe('michal');expect(tasks[0].due_time).toBe('10:30');await expect(page.locator(`[data-chore-id="${tasks[0].id}"]`).locator('xpath=ancestor::*[@data-task-lane]')).toHaveAttribute('data-task-lane','reminders');
 await page.locator('#personal-title').fill(title+' weekly');await page.locator('#quick-reminder-date').fill(day);await page.locator('#quick-reminder-repeat').selectOption('1');await page.locator('#personal-add').click();await expect(page.locator('#personal-title')).toHaveValue('');
 const after=await rpc(page,'chores_dashboard'),routine=after.routines.find((r:any)=>r.title===title+' weekly');expect(routine.owners).toEqual(['michal']);expect(routine.steps[0].kind).toBe('reminder');expect(routine.steps[0].time).toBe('10:30');expect(routine.interval_weeks).toBe(1);
 const occurrence=after.tasks.find((t:any)=>t.routine_id===routine.id&&!t.projected);const tile=page.locator(`[data-chore-id="${occurrence.id}"]`);await tile.locator('.chore-corner-tab').click();await tile.getByRole('button',{name:'Edit routine',exact:true}).click();await expect(page.locator('#routine-title')).toHaveValue(title+' weekly');
});

test('empty lanes stay absent and group filters preserve folded corners and task actions',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('household-person','rina'));
 const a=await rpc(page,'save_personal_task',{...base(),actor:'rina',title:'Read the paper',group_name:'Research'}),b=await rpc(page,'save_personal_task',{...base(),actor:'rina',title:'Call the dentist',group_name:'Life admin'});
 await open(page);await page.locator('[data-home-filter=personal]').click();await expect(page.locator('[data-task-lane]')).toHaveCount(1);
 await page.locator('[data-personal-group="Research"]').click();await expect(page.locator(`[data-personal-id="${a.id}"]`)).toBeVisible();await expect(page.locator(`[data-personal-id="${b.id}"]`)).toHaveCount(0);
 await page.locator('[data-lane-toggle=personal]').click();await expect(page.locator('#todo-lane-personal')).toBeHidden();await page.locator('[data-lane-toggle=personal]').click();await expect(page.locator(`[data-personal-id="${a.id}"]`)).toBeVisible();
 const edited=page.locator(`[data-personal-id="${a.id}"]`);await edited.locator('.chore-corner-tab').click();await edited.getByRole('button',{name:'Edit',exact:true}).click();await page.locator('#personal-edit-group').fill('Books');await page.locator('#personal-save').click();await expect(page.locator('[data-personal-group="Books"]')).toHaveAttribute('aria-pressed','true');await expect(edited).toBeVisible();
 await page.locator('[data-personal-group=""]').click();await expect(page.locator(`[data-personal-id="${b.id}"]`)).toBeVisible();
});
