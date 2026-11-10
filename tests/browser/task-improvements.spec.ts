import {test,expect,type Page} from '@playwright/test';
const rpc=async(page:Page,fn:string,p?:unknown)=>{const r=await page.request.post('/rest/v1/rpc/utilities_'+fn,{headers:{apikey:'local-public'},data:p?{p}:{}});expect(r.ok(),await r.text()).toBeTruthy();return r.json();};
test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('household-person','michal'));await page.goto('/?webgl=0#chores');await expect(page.locator('#chore-new')).toBeEnabled();});
test('title suggestions and manual catalog have distinct defaults for chores, reminders and requests',async({page})=>{
 await page.locator('#chore-new').click();
 for(const kind of ['chore','reminder','request']){
  await page.locator('#chore-kind').selectOption(kind);await page.locator('#chore-title').fill('');await expect(page.locator('#chore-suggestion')).toBeHidden();await page.locator('#chore-title').fill('sweep kitchen');await expect(page.locator('#chore-suggestion-choice')).toContainText('Sweep the floor');await expect(page.locator('#chore-suggestion-title')).toBeChecked();await page.locator('#chore-suggestion-choice').click();await expect(page.locator('#chore-title')).toHaveValue('Sweep the floor');
  await page.locator('#chore-task-dialog .chore-icon-picker').evaluate((el:HTMLDetailsElement)=>el.open=true);await expect(page.locator('#chore-fill-title')).not.toBeChecked();await page.locator('#chore-icon-grid [data-picker-icon=plant]').click();await expect(page.locator('#chore-title')).toHaveValue('Sweep the floor');
 }
});
test('logging several swept rooms saves exact points and contributors',async({page})=>{
 await page.locator('[data-chore-close=chore-task]').first().count();await page.locator('#chore-log').click();await page.locator('#chore-title').fill('sweep');await page.locator('input[name=sweep-space][value=kitchen]').check();await page.locator('input[name=sweep-space][value=living-room]').check();await expect(page.locator('#sweep-total')).toContainText('2 spaces · 2 points');await expect(page.locator('#chore-effort')).toHaveValue('2');await page.locator('input[name=chore-log-contributor][value=rina]').check();
 await page.locator('#chore-task-save').click();await expect(page.locator('#chore-task-dialog')).toBeHidden();const d=await rpc(page,'chores_dashboard'),t=d.tasks.find((t:any)=>t.preset_id==='sweep-kitchen-living-room'&&t.completion?.contributors.includes('rina'));expect(t.points).toBe(2);expect(t.completion.contributors).toEqual(['michal','rina']);
 for(const member of ['michal','rina'])expect(d.leaderboard.find((s:any)=>s.member===member&&s.period==='all').entries.find((e:any)=>e.id===t.id).units).toBe(12);
});
test('personal task deadlines save, display priority and remain editable with lists near the top',async({page})=>{
 await page.locator('#chore-new').click();const title='Deadline '+crypto.randomUUID(),day=(await rpc(page,'chores_dashboard')).local_day;await page.locator('#chore-title').fill(title);await page.locator('#chore-due').fill(day);await page.locator('#chore-task-save').click();await expect(page.locator('#chore-task-dialog')).toBeHidden();
 const tile=page.locator('[data-personal-id]').filter({hasText:title});await expect(tile).toContainText('high priority');await tile.locator('summary').click();await tile.getByRole('button',{name:'Edit',exact:true}).click();await expect(page.locator('#personal-edit-due')).toHaveValue(day);await page.locator('#personal-edit-due').fill('');await page.locator('#personal-save').click();await expect(page.locator('#personal-dialog')).toBeHidden();await expect(tile).not.toContainText('high priority');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.local/tasks-phone.png',fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
