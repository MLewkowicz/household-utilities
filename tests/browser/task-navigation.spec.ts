import {test,expect,type Page} from '@playwright/test';
const rpc=async(page:Page,fn:string,p?:unknown)=>{const r=await page.request.post('/rest/v1/rpc/utilities_'+fn,{headers:{apikey:'local-public'},data:p?{p}:{}});expect(r.ok(),await r.text()).toBeTruthy();return r.json();};
test('one task destination preserves old routes, navigation, notification focus and creation drafts',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('household-person','michal'));
 const task=await rpc(page,'save_chore',{id:crypto.randomUUID(),request_id:crypto.randomUUID(),action:'create',actor:'rina',assignee:'rina',title:'For Rina',icon_id:'bicycle',kind:'request',points:0,pinned:false});
 await page.goto('/#home/personal');await expect(page).toHaveURL(/#chores\/personal$/);await expect(page.locator('#personal-add')).toBeEnabled();
 expect(await page.locator('[data-ledger]').evaluateAll(els=>els.map(el=>el.getAttribute('data-ledger')))).toEqual(['chores','miscellaneous','events','bulletin','utilities']);
 await expect(page.locator('#home-page')).toHaveCount(0);await expect(page.locator('[data-home-filter=personal]')).toHaveAttribute('aria-pressed','true');
 await page.locator('[data-chore-view=week]').click();await expect(page.locator('.chore-week')).toBeVisible();await page.locator('[data-chore-view=household]').click();await expect(page.locator('#chore-household-filter')).toHaveValue('all');
 await page.goBack();await expect(page.locator('.chore-week')).toBeVisible();await page.locator('.brand').click();await expect(page.locator('#my-tasks')).toBeVisible();await expect(page).toHaveTitle(/To-dos/);
 await page.locator('#chore-new').click();await expect(page.locator('#chore-kind')).toHaveValue('personal');await expect(page.locator('#shared-task-fields')).toBeHidden();
 const title='Unified personal '+crypto.randomUUID();await page.locator('#chore-title').fill(title);
 for(const kind of ['reminder','request','chore','personal']){await page.locator('#chore-kind').selectOption(kind);await expect(page.locator('#chore-title')).toHaveValue(title);}
 await page.route('**/utilities_save_personal_task',async route=>{await route.fetch();await route.abort();},{times:1});
 await page.locator('#chore-task-save').click();await expect(page.locator('#chore-task-error')).toContainText(/fetch/i);await expect(page.locator('#chore-title')).toHaveValue(title);
 await page.locator('#chore-task-save').click();await expect(page.locator('#chore-task-dialog')).not.toBeVisible();await expect(page.getByRole('heading',{name:title})).toBeVisible();
 const data=await rpc(page,'personal_tasks',{member:'michal'});expect(data.history.filter((t:any)=>t.title===title)).toHaveLength(1);
 await page.goto('/?notice='+task.id+'#home/assigned');await expect(page).toHaveURL(/#chores\/household$/);await expect(page.locator(`[data-chore-id="${task.id}"]`)).toBeVisible();
 await page.goto('/#unknown/week');await expect(page.locator('#my-tasks')).toBeVisible();
 await page.locator('#chore-new').click();await page.locator('#chore-title').fill('Preserve routine title');await page.locator('#chore-kind').selectOption('routine');await expect(page.locator('#routine-title')).toHaveValue('Preserve routine title');await page.keyboard.press('Escape');
 await page.goto('/#home');await expect(page).toHaveURL(/#chores$/);await expect(page.locator('.info-disclosure')).toHaveCount(0);
});

test('unified Add task disables only the unavailable source',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('household-person','michal'));
 await page.route('**/utilities_personal_tasks',r=>r.abort());await page.goto('/');await expect(page.locator('#chore-new')).toBeEnabled();
 await page.locator('#chore-new').click();await expect(page.locator('#chore-task-save')).toBeDisabled();await expect(page.locator('#task-source-notice')).toContainText('Personal tasks unavailable');
 await page.locator('#chore-kind').selectOption('request');await expect(page.locator('#chore-task-save')).toBeEnabled();await page.keyboard.press('Escape');
 await page.unroute('**/utilities_personal_tasks');await page.route('**/utilities_chores_dashboard',r=>r.abort());await page.locator('#refresh').click();await expect(page.locator('#personal-add')).toBeEnabled();await expect(page.locator('#chores-notice')).toContainText('offline');
 await page.locator('#chore-new').click();await expect(page.locator('#chore-task-save')).toBeEnabled();await page.locator('#chore-kind').selectOption('reminder');await expect(page.locator('#chore-task-save')).toBeDisabled();await expect(page.locator('#task-source-notice')).toContainText('Shared tasks unavailable');
});
