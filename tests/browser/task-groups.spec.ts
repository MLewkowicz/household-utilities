import {test,expect,devices,type Page} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
const rpc=async(page:Page,operation:string,p?:unknown)=>{const r=await page.request.post('/rest/v1/rpc/utilities_'+operation,{headers:{apikey:'local-public'},data:p?{p}:{}});expect(r.ok(),await r.text()).toBeTruthy();return r.json();};
const create=(page:Page,title:string,group_name:string|null)=>rpc(page,'save_personal_task',{id:crypto.randomUUID(),request_id:crypto.randomUUID(),actor:'ohm',action:'create',title,group_name});
async function open(page:Page){await page.addInitScript(()=>localStorage.setItem('household-person','ohm'));await page.goto('/#chores/personal');await expect(page.locator('#personal-add')).toBeEnabled();await expect(page.locator('#main')).toHaveAttribute('aria-busy','false');}
const entry=(page:Page,id:string)=>page.locator(`[data-home-key="personal:${id}"]`);
async function hold(page:Page,id:string){const card=entry(page,id).locator('.chore-card');await card.scrollIntoViewIfNeeded();const r=(await card.boundingBox())!;await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await expect(page.locator('.task-drag-preview')).toBeVisible();}
test('personal groups can be named, reused and edited, and survive fallback loading',async({page})=>{
 await open(page);await page.locator('#personal-title').fill('Read MIT paper');await page.locator('#personal-quick-group').fill('MIT');await page.locator('#personal-title').press('Enter');
 await expect(page.locator('.home-group-heading').filter({hasText:'MIT'})).toHaveCount(1);await expect(page.locator('#personal-groups option[value=MIT]')).toHaveCount(1);
 await page.locator('#chore-new').click();await page.locator('#chore-title').fill('Prepare MIT slides');await page.locator('#chore-personal-group').fill('MIT');await page.locator('#chore-task-save').click();await expect(page.locator('#chore-task-dialog')).not.toBeVisible();
 const tasks=(await rpc(page,'personal_tasks',{member:'ohm'})).tasks;const t=tasks.find((t:any)=>t.title==='Prepare MIT slides');expect(t.group_name).toBe('MIT');
 await entry(page,t.id).locator('.chore-corner-tab').click();await entry(page,t.id).getByRole('button',{name:'Edit',exact:true}).click();await expect(page.locator('#personal-edit-group')).toHaveValue('MIT');await page.locator('#personal-edit-group').fill('Project website');await page.locator('#personal-save').click();await expect(page.locator('#personal-dialog')).not.toBeVisible();
 await expect(page.locator('[data-task-group="Project website"]')).toContainText('Prepare MIT slides');
 const snapshot=await rpc(page,'export_personal_tasks',{});await page.route('**/utilities_personal_tasks',r=>r.abort());await page.route('**/personal-tasks.json',r=>r.fulfill({json:snapshot}));await page.reload();await expect(page.locator('#home-personal-notice')).toContainText('offline');await expect(page.locator('[data-task-group="Project website"]')).toContainText('Prepare MIT slides');await expect(page.locator('#personal-add')).toBeDisabled();
});
test('held tiles move neighbors before drop, cancel safely and save cross-group moves',async({page})=>{
 const a=await create(page,'Drag project A','Drag project'),b=await create(page,'Drag project B','Drag project'),c=await create(page,'Destination task','Destination');await open(page);
 const section=page.locator('[data-task-group="Drag project"]');
 await hold(page,a.id);let target=(await entry(page,b.id).boundingBox())!;await page.mouse.move(target.x+target.width/2,target.y+30,{steps:6});
 await expect(section.locator('[data-home-key]').first()).toHaveAttribute('data-home-key','personal:'+a.id);await expect(page.locator('.task-drag-preview>.chore-card')).toHaveCSS('outline-style','dashed');
 await page.keyboard.press('Escape');await page.mouse.up();await expect(section.locator('[data-home-key]').first()).toHaveAttribute('data-home-key','personal:'+b.id);await expect(page.locator('.task-drag-preview')).toHaveCount(0);
 await hold(page,a.id);target=(await entry(page,c.id).boundingBox())!;await page.mouse.move(target.x+target.width/2,target.y+30,{steps:6});await expect(page.locator('[data-task-group=Destination] [data-home-key]')).toHaveCount(2);
 await page.route('**/utilities_save_home_order',async route=>{await route.fetch();await route.abort();},{times:1});await page.mouse.up();
 await expect(page.locator('#home-order-notice')).toContainText(/fetch/i);await page.locator('#home-order-retry').click();await expect(page.locator('#home-order-notice')).toBeHidden();
 await expect.poll(async()=>(await rpc(page,'personal_tasks',{member:'ohm'})).tasks.find((t:any)=>t.id===a.id).group_name).toBe('Destination');const saved=(await rpc(page,'personal_tasks',{member:'ohm'}));expect(saved.history.filter((t:any)=>t.id===a.id&&t.action==='group')).toHaveLength(1);await page.reload();await expect(page.locator('[data-task-group=Destination]')).toContainText('Drag project A');
 await mkdir('.local/face-review',{recursive:true});for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:`.local/face-review/grouped-tasks-${width}.png`,fullPage:true});}
});
test('touch scroll remains native before a hold; held touch drag persists without completing a task',async({browser,page})=>{
 const a=await create(page,'Touch A','Touch group'),b=await create(page,'Touch B','Touch group');
 const context=await browser.newContext({baseURL:'http://127.0.0.1:4174',...devices['Pixel 7'],viewport:{width:390,height:844}});const phone=await context.newPage();await open(phone);const session=await context.newCDPSession(phone);
 const touch=async(type:string,x:number,y:number)=>session.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y}]});
 await entry(phone,b.id).locator('h3').scrollIntoViewIfNeeded();let r=(await entry(phone,b.id).locator('h3').boundingBox())!;const scroll=await phone.evaluate(()=>scrollY);
 await touch('touchStart',r.x+15,r.y+10);await touch('touchMove',r.x+15,r.y-70);await touch('touchEnd',0,0);await expect(phone.locator('.task-drag-preview')).toHaveCount(0);await expect.poll(()=>phone.evaluate(()=>scrollY)).toBeGreaterThan(scroll);
 await phone.evaluate(()=>scrollTo(0,0));await entry(phone,a.id).locator('.completion-track').scrollIntoViewIfNeeded();r=(await entry(phone,a.id).locator('.completion-track').boundingBox())!;const target=(await entry(phone,b.id).boundingBox())!;
 await touch('touchStart',r.x+r.width/2,r.y+r.height/2);await expect(phone.locator('.task-drag-preview')).toBeVisible();await touch('touchMove',target.x+target.width/2,target.y+35);await expect(phone.locator('[data-task-group="Touch group"] [data-home-key]').first()).toHaveAttribute('data-home-key','personal:'+a.id);await touch('touchEnd',0,0);
 await expect.poll(async()=>{const d=await rpc(phone,'home_order',{member:'ohm'});return d.keys.indexOf('personal:'+a.id)<d.keys.indexOf('personal:'+b.id);}).toBeTruthy();const tasks=(await rpc(phone,'personal_tasks',{member:'ohm'})).tasks;expect(tasks.find((t:any)=>t.id===a.id).completed_at).toBeNull();
 // The completion handle retains its own gesture even when held before sliding.
 const handle=entry(phone,a.id).locator('[data-swipe-complete]');await handle.scrollIntoViewIfNeeded();const h=(await handle.boundingBox())!,track=(await entry(phone,a.id).locator('.completion-track').boundingBox())!;
 await touch('touchStart',h.x+h.width/2,h.y+h.height/2);await phone.waitForTimeout(300);await expect(phone.locator('.task-drag-preview')).toHaveCount(0);await touch('touchMove',track.x+track.width-10,h.y+h.height/2);await touch('touchEnd',0,0);await expect(entry(phone,a.id)).toHaveCount(0);
 expect((await rpc(phone,'personal_tasks',{member:'ohm'})).tasks.find((t:any)=>t.id===a.id).completed_at).not.toBeNull();await context.close();
});

test('desktop tiles start dragging with ordinary mouse movement from the center',async({page})=>{
 const a=await create(page,'Mouse drag A','Mouse group'),b=await create(page,'Mouse drag B','Mouse group');await open(page);
 const card=entry(page,a.id).locator('.chore-card');await card.scrollIntoViewIfNeeded();const start=(await card.boundingBox())!,target=(await entry(page,b.id).boundingBox())!;
 await page.mouse.move(start.x+start.width/2,start.y+start.height/2);await page.mouse.down();
 await page.mouse.move(target.x+target.width/2,target.y+target.height/2,{steps:8});
 await expect(page.locator('.task-drag-preview')).toBeVisible();await expect(page.locator('[data-task-group="Mouse group"] [data-home-key]').first()).toHaveAttribute('data-home-key','personal:'+a.id);await page.mouse.up();
 await expect.poll(async()=>{const d=await rpc(page,'home_order',{member:'ohm'});return d.keys.indexOf('personal:'+a.id)<d.keys.indexOf('personal:'+b.id);}).toBeTruthy();
});
