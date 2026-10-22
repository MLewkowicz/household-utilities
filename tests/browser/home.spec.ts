import {setTheme,refreshSection} from './settings';
import {test,expect,type Page} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
const rpc=async(page:Page,name:string,p?:unknown)=>{const response=await page.request.post('/rest/v1/rpc/utilities_'+name,{headers:{apikey:'local-public'},data:p?{p}:{}});expect(response.ok(),await response.text()).toBeTruthy();return response.json();};
async function home(page:Page){await page.addInitScript(()=>localStorage.setItem('household-person','michal'));await page.goto('/#chores');await expect(page.locator('#personal-add')).toBeEnabled();await expect(page.locator('#main')).toHaveAttribute('aria-busy','false');}
const personal=async(page:Page,title:string)=>rpc(page,'save_personal_task',{id:crypto.randomUUID(),request_id:crypto.randomUUID(),actor:'michal',action:'create',title});
const shared=async(page:Page,title:string,extra={})=>rpc(page,'save_chore',{id:crypto.randomUUID(),request_id:crypto.randomUUID(),actor:'rina',action:'create',title,icon_id:'bicycle',kind:'reminder',points:0,pinned:false,assignee:'michal',...extra});
test('My tasks default combines only assigned tasks, quick entry, completion, undo, history, deletion and export',async({page})=>{
 const title='Home personal '+crypto.randomUUID(),assigned=await shared(page,'Pay Michal for Bluebikes '+crypto.randomUUID());
 const unassigned=await shared(page,'Unassigned '+crypto.randomUUID(),{assignee:null});
 await home(page);await expect(page.locator('#my-tasks')).toBeVisible();await expect(page.locator('#chore-content')).toBeEmpty();await expect(page.locator('#chore-task-dialog')).not.toBeVisible();
 await expect(page.locator(`[data-home-key="shared:${assigned.id}"]`)).toBeVisible();await expect(page.locator(`[data-home-key="shared:${unassigned.id}"]`)).toHaveCount(0);
 await page.locator('#personal-title').fill(title);await page.locator('#personal-title').press('Enter');
 const card=page.locator('#home-feed .chore-card').filter({has:page.getByRole('heading',{name:title,exact:true})});await expect(card).toBeVisible();await expect(page.locator('#personal-title')).toHaveValue('');
 await card.locator('[data-swipe-complete]').focus();await page.keyboard.press('Enter');await expect(card).toHaveCount(0);
 await page.locator('#toast').getByRole('button',{name:'Undo',exact:true}).click();await expect(card).toBeVisible();
 await card.locator('summary.chore-corner-tab').click();await card.getByRole('button',{name:'Pin',exact:true}).click();await expect(card).toHaveClass(/is-pinned/);
 await card.getByRole('button',{name:'Edit',exact:true}).click();await page.locator('#personal-edit-title').fill(title+' edited');await page.locator('#personal-save').click();await expect(page.locator('#personal-dialog')).not.toBeVisible();
 const edited=page.locator('#home-feed .chore-card').filter({has:page.getByRole('heading',{name:title+' edited',exact:true})});await edited.getByRole('button',{name:'Delete',exact:true}).click();await expect(edited).toHaveCount(0);
 await page.locator('#home-history').check();await expect(edited).toBeVisible();await expect(edited).toContainText('Deleted');await edited.locator('summary.chore-corner-tab').click();await expect(edited.locator('.entry-updated')).toContainText('Deleted by Michal');await expect(edited.getByText(/History ·/)).toHaveCount(0);const stored=await rpc(page,'personal_tasks',{member:'michal'});expect(stored.history.filter((t:any)=>t.title===title||t.title===title+' edited')).toHaveLength(6);
 await page.locator('[data-home-filter=assigned]').click();await expect(edited).toHaveCount(0);await expect(page.locator(`[data-home-key="shared:${assigned.id}"]`)).toBeVisible();
 const download=page.waitForEvent('download');await page.locator('#export').click();const file=await download;expect(file.suggestedFilename()).toContain('household-tasks-michal');
 await page.locator('[data-ledger=home]').click();await expect(page).toHaveURL(/#home$/);await expect(page.locator('#feature-area')).not.toBeInViewport();
});
test('Task ordering persists across sessions and sources fail independently without erasing drafts',async({page,browser})=>{
 const a=await personal(page,'Order A '+crypto.randomUUID()),b=await personal(page,'Order B '+crypto.randomUUID()),assigned=await shared(page,'Assigned outage '+crypto.randomUUID());await home(page);
 const entry=(id:string)=>page.locator(`[data-home-key="personal:${id}"]`);
 await entry(a.id).getByRole('button',{name:/Move .* up/}).focus();await page.keyboard.press('Enter');await expect(entry(a.id).getByRole('button',{name:/Move .* down/})).toBeFocused();
 const saved=await rpc(page,'home_order',{member:'michal'});expect(saved.keys.indexOf('personal:'+a.id)).toBeLessThan(saved.keys.indexOf('personal:'+b.id));
 const second=await browser.newPage();await home(second);const keys=await second.locator('[data-home-key]').evaluateAll(els=>els.map(e=>e.getAttribute('data-home-key')));expect(keys.indexOf('personal:'+a.id)).toBeLessThan(keys.indexOf('personal:'+b.id));await second.close();
 await page.route('**/utilities_personal_tasks',route=>route.abort());await refreshSection(page);await expect(page.locator('#home-personal-notice')).toContainText('offline');await expect(page.locator('#personal-add')).toBeDisabled();await expect(page.locator(`[data-home-key="shared:${assigned.id}"]`)).toBeVisible();await expect(page.locator('#chore-new')).toBeEnabled();
 await page.unroute('**/utilities_personal_tasks');await page.route('**/utilities_chores_dashboard',route=>route.abort());await refreshSection(page);await expect(page.locator('#chores-notice')).toContainText('offline');await expect(page.locator('#personal-add')).toBeEnabled();await expect(page.locator('#chore-new')).toBeEnabled();
 await page.locator('#personal-title').fill('Keep this draft');await page.route('**/utilities_save_personal_task',route=>route.abort());await page.locator('#personal-add').click();await expect(page.locator('#toast')).toContainText(/fetch/i);await expect(page.locator('#personal-title')).toHaveValue('Keep this draft');
});
test('Bluebikes reminder uses full catalog, keeps manual icons and never writes an expense',async({page})=>{
 const writes:string[]=[];page.on('request',r=>{if(r.url().includes('utilities_save_'))writes.push(r.url());});await home(page);await page.locator('#chore-new').click();await expect(page.locator('#chore-content')).toBeEmpty();await page.locator('#chore-kind').selectOption('reminder');await page.locator('#chore-title').fill('Pay Michal for Bluebikes');
 await expect(page.locator('#chore-selected-icon')).toHaveCount(1);await page.locator('.chore-icon-picker>summary').click();await page.locator('#chore-fill-title').uncheck();await page.locator('#chore-icon-search').fill('bicycle');await page.locator('[data-chore-icon=bicycle]').click();await page.locator('#chore-title').fill('Pay Michal for Bluebikes via Venmo');await expect(page.locator('[data-chore-icon=bicycle]')).toHaveAttribute('aria-pressed','true');await page.locator('#chore-task-save').click();await expect(page.locator('#chore-task-dialog')).not.toBeVisible();
 const d=await rpc(page,'chores_dashboard'),task=d.tasks.find((t:any)=>t.title==='Pay Michal for Bluebikes via Venmo');expect(task.icon_id).toBe('bicycle');expect(task.points).toBe(0);expect(writes.some(u=>u.includes('misc'))).toBeFalsy();
});
test('personal saves retry once, stale edits keep drafts, filters and identity do not leak tasks',async({page})=>{
 await home(page);const title='Retry personal '+crypto.randomUUID();
 await page.route('**/utilities_save_personal_task',async route=>{await route.fetch();await route.abort();},{times:1});
 await page.locator('#personal-title').fill(title);await page.locator('#personal-add').click();await expect(page.locator('#personal-title')).toHaveValue(title);await expect(page.locator('#toast')).toContainText(/fetch/i);
 await refreshSection(page);await expect(page.locator('#personal-add')).toBeEnabled();
 await page.locator('#personal-add').click();await expect(page.locator('#personal-title')).toHaveValue('');
 const d=await rpc(page,'personal_tasks',{member:'michal'}),t=d.tasks.find((t:any)=>t.title===title);expect(d.history.filter((h:any)=>h.id===t.id)).toHaveLength(1);
 const card=page.locator(`[data-personal-id="${t.id}"]`);await card.locator('summary.chore-corner-tab').click();await card.getByRole('button',{name:'Edit',exact:true}).click();await page.locator('#personal-edit-title').fill('Retain my edit');
 await rpc(page,'save_personal_task',{id:t.id,actor:'michal',expected_version:t.version,action:'pin',pinned:true,request_id:crypto.randomUUID()});await page.locator('#personal-save').click();await expect(page.locator('#personal-error')).toContainText('changed');await expect(page.locator('#personal-edit-title')).toHaveValue('Retain my edit');await page.keyboard.press('Escape');
 await page.locator('#chore-switch').click();await page.locator('[data-chore-person=rina]').click();await expect(page.locator('#personal-add')).toBeEnabled();await expect(card).toHaveCount(0);
 await page.goto('/#nonsense');await expect(page.locator('#feature-area')).not.toBeInViewport();await expect(page).toHaveTitle(/Home/);
});
test('dragging persists only within a priority group and refresh preserves typing on small screens',async({page})=>{
 const a=await personal(page,'Drag A '+crypto.randomUUID()),b=await personal(page,'Drag B '+crypto.randomUUID()),pin=await personal(page,'Pinned '+crypto.randomUUID());await rpc(page,'save_personal_task',{id:pin.id,actor:'michal',expected_version:pin.version,action:'pin',pinned:true,request_id:crypto.randomUUID()});await home(page);await page.setViewportSize({width:390,height:844});
 // Saving the previous drag replaces the cards after the RPC has committed.
 // Retry scrolling through that repaint before measuring the next drag.
 const entry=(id:string)=>page.locator(`[data-home-key="personal:${id}"]`);const drag=async(from:string,to:string)=>{await expect(async()=>{await entry(from).scrollIntoViewIfNeeded();}).toPass({timeout:5000});const handle=(await entry(from).locator('h3').boundingBox())!;const target=(await entry(to).boundingBox())!;await page.mouse.move(handle.x+12,handle.y+12);await page.mouse.down();await expect(page.locator('.task-drag-preview')).toBeVisible();await page.mouse.move(target.x+target.width/2,target.y+35,{steps:10});await page.mouse.up();};
 await drag(a.id,b.id);await expect.poll(async()=>{const d=await rpc(page,'home_order',{member:'michal'});return d.keys.indexOf('personal:'+a.id)<d.keys.indexOf('personal:'+b.id);}).toBeTruthy();
 const before=await rpc(page,'home_order',{member:'michal'});await drag(a.id,pin.id);expect((await rpc(page,'home_order',{member:'michal'})).keys).toEqual(before.keys);
 await page.locator('#personal-title').fill('Still typing');await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await expect(page.locator('#personal-title')).toBeFocused();await expect(page.locator('#personal-title')).toHaveValue('Still typing');
 await mkdir('.local/refresh-review',{recursive:true});
 for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();for(const theme of ['light','dark']){await setTheme(page,theme);await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`.local/refresh-review/home-${width}-${theme}.png`});}}
});
