import {test,expect,type Page} from '@playwright/test';
const rpc=async(page:Page,name:string,p?:unknown)=>{const r=await page.request.post(`/rest/v1/rpc/utilities_${name}`,{headers:{apikey:'local-public'},data:p?{p}:{}});expect(r.ok()).toBeTruthy();return r.json();};
const identify=async(page:Page,member='michal')=>page.addInitScript(m=>localStorage.setItem('household-person',m),member);
test('invitation cards vote, confirm and reopen on rescheduling on a phone',async({page})=>{
 await identify(page);await page.setViewportSize({width:390,height:844});await page.goto('/#events');await expect(page.locator('#event-new')).toBeEnabled();
 await page.locator('#event-new').click();await page.locator('#event-title').fill('Dinner browser test');await page.locator('#event-start').fill('2027-07-13T19:00');await page.locator('#event-end').fill('2027-07-13T22:00');await page.getByRole('button',{name:'Save event',exact:true}).click();await expect(page.locator('#event-dialog')).not.toBeVisible();
 const card=page.locator('.event-card').filter({hasText:'Dinner browser test'});await expect(card).toBeVisible();await card.getByRole('button',{name:'✓ Yes',exact:true}).click();await expect(card.getByRole('button',{name:'✓ Yes',exact:true})).toHaveAttribute('aria-pressed','true');await expect(card.locator('.event-guests .avatar')).toHaveCount(1);
 await card.locator('.event-details>summary').click();await card.getByRole('button',{name:'Confirm event',exact:true}).click();await expect(card).toHaveClass(/event-confirmed/);
 await card.locator('.event-details>summary').click();await card.getByRole('button',{name:'Edit',exact:true}).click();await page.locator('#event-end').fill('2027-07-13T23:00');await page.getByRole('button',{name:'Save event',exact:true}).click();await expect(page.locator('#event-dialog')).not.toBeVisible();await expect(card).toHaveClass(/event-proposed/);await expect(card.locator('.event-guests .avatar')).toHaveCount(0);
 await page.getByRole('button',{name:'Calendar',exact:true}).click();await expect(page.locator('.event-calendar>button')).toHaveCount(42);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
test('one reaction per person replaces, removes, and leaves the author temperature intact',async({page})=>{
 const n=await rpc(page,'save_bulletin_note',{id:crypto.randomUUID(),request_id:crypto.randomUUID(),action:'create',actor:'rina',body:'Reaction browser test',temperature:-50,recipients:['michal']});
 await identify(page);await page.goto('/#bulletin');const card=page.locator(`[data-note-id="${n.id}"]`);await card.getByRole('button',{name:'React to this note'}).click();
 await expect(page.locator('#note-reaction-options button')).toHaveCount(6);await page.locator('[data-note-expression=confused]').click();await expect(page.locator('#note-reaction-dialog')).not.toBeVisible();await expect(card.locator('[data-reaction-expression=confused] img')).toHaveAttribute('src',/^data:image\/webp/);
 await card.getByRole('button',{name:'React to this note'}).click();await page.locator('[data-note-expression=mogging]').click();await expect(card.locator('[data-reaction-expression=mogging]')).toHaveCount(1);await expect(card.locator('[data-reaction-expression=confused]')).toHaveCount(0);
 await card.getByRole('button',{name:'React to this note'}).click();await page.locator('[data-note-expression=mogging]').click();await expect(card.locator('.note-response-chip')).toHaveCount(0);
 const d=await rpc(page,'bulletin_dashboard');expect(d.notes.find((x:any)=>x.id===n.id).temperature).toBe(-50);
});
test('presets set task values and remain fixed through completion',async({page})=>{
 await identify(page);await page.goto('/#chores');await page.locator('#chore-new').click();await page.locator('#chore-preset').selectOption('shared-groceries');await expect(page.locator('#chore-title')).toHaveValue('Pick up shared groceries');await expect(page.locator('#chore-effort')).toHaveValue('2');await expect(page.locator('#chore-effort')).toBeDisabled();await page.locator('#chore-task-save').click();await expect(page.locator('#chore-task-dialog')).not.toBeVisible();
 const d=await rpc(page,'chores_dashboard'),t=d.tasks.find((t:any)=>t.preset_id==='shared-groceries');expect(t.points).toBe(2);expect(t.point_policy).toBe('household-v1');
});
