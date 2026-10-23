import {test,expect,type Page} from '@playwright/test';
const rpc=async(page:Page,name:string,p?:unknown)=>{const r=await page.request.post(`/rest/v1/rpc/utilities_${name}`,{headers:{apikey:'local-public'},data:p?{p}:{}});expect(r.ok()).toBeTruthy();return r.json();};
const identify=async(page:Page,member='michal')=>page.addInitScript(m=>localStorage.setItem('household-person',m),member);
test('invitation cards vote, confirm and reopen on rescheduling on a phone',async({page})=>{
 await identify(page);await page.setViewportSize({width:390,height:844});await page.goto('/#events');await expect(page.locator('#event-new')).toBeEnabled();
 await page.locator('#event-new').click();await page.getByRole('radio',{name:'I know the time'}).click();await page.locator('#event-title').fill('Dinner browser test');await page.locator('#event-day').fill('2027-07-13');await page.locator('#event-time').fill('19:00');await page.locator('#event-duration').fill('180');await expect(page.locator('#event-summary')).toHaveText('Tue, Jul 13 at 7 PM – 10 PM · 3h');await page.getByRole('button',{name:'Save event',exact:true}).click();await expect(page.locator('#event-dialog')).not.toBeVisible();
 const card=page.locator('.event-card').filter({hasText:'Dinner browser test'});await expect(card).toBeVisible();await expect(card.locator('.event-time')).toHaveText('Starts Tue, Jul 13 at 7 PM · 3h');await card.getByRole('button',{name:'✓ Yes',exact:true}).click();await expect(card.getByRole('button',{name:'✓ Yes',exact:true})).toHaveAttribute('aria-pressed','true');await expect(card.locator('.event-guests .avatar')).toHaveCount(1);
 await card.locator('.event-details>summary').click();await card.getByRole('button',{name:'Confirm event',exact:true}).click();await expect(card).toHaveClass(/event-confirmed/);
 await card.locator('.event-details>summary').click();await card.getByRole('button',{name:'Edit',exact:true}).click();await expect(page.locator('#event-duration')).toHaveValue('180');await page.locator('#event-duration').fill('240');await page.getByRole('button',{name:'Save event',exact:true}).click();await expect(page.locator('#event-dialog')).not.toBeVisible();await expect(card).toHaveClass(/event-proposed/);await expect(card.locator('.event-guests .avatar')).toHaveCount(0);
 await page.getByRole('button',{name:'Calendar',exact:true}).click();await expect(page.locator('.event-calendar>button')).toHaveCount(42);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
test('one reaction per person replaces, removes, and leaves the author temperature intact',async({page})=>{
 const n=await rpc(page,'save_bulletin_note',{id:crypto.randomUUID(),request_id:crypto.randomUUID(),action:'create',actor:'rina',body:'Reaction browser test',temperature:-50,recipients:['michal']});
 await identify(page);await page.goto('/#bulletin');const card=page.locator(`[data-note-id="${n.id}"]`);await card.getByRole('button',{name:'React to this note'}).click();
 await expect(page.locator('#note-reaction-options button')).toHaveCount(14);await page.locator('[data-note-expression=confused]').click();await expect(page.locator('#note-reaction-dialog')).not.toBeVisible();await expect(card.locator('[data-reaction-expression=confused] img')).toHaveAttribute('src',/^data:image\/webp/);
 await card.getByRole('button',{name:'React to this note'}).click();await page.locator('[data-note-expression=mogging]').click();await expect(card.locator('[data-reaction-expression=mogging]')).toHaveCount(1);await expect(card.locator('[data-reaction-expression=confused]')).toHaveCount(0);
 await card.getByRole('button',{name:'React to this note'}).click();await page.locator('[data-note-expression=mogging]').click();await expect(card.locator('.note-response-chip')).toHaveCount(0);
 const d=await rpc(page,'bulletin_dashboard');expect(d.notes.find((x:any)=>x.id===n.id).temperature).toBe(-50);
});
test('presets set task values and remain fixed through completion',async({page})=>{
 await identify(page);await page.goto('/#chores/household');await page.locator('#chore-new').click();await page.locator('#chore-kind').selectOption('chore');await page.locator('#chore-preset').selectOption('shared-groceries');await expect(page.locator('#chore-title')).toHaveValue('Pick up shared groceries');await expect(page.locator('#chore-effort')).toHaveValue('2');await expect(page.locator('#chore-effort')).toBeDisabled();await page.locator('#chore-task-save').click();await expect(page.locator('#chore-task-dialog')).not.toBeVisible();
 const d=await rpc(page,'chores_dashboard'),t=d.tasks.find((t:any)=>t.preset_id==='shared-groceries');expect(t.points).toBe(2);expect(t.point_policy).toBe('household-v1');
});

test('event presets create editable drafts and preserve an independent illustration',async({page})=>{
 await identify(page);await page.setViewportSize({width:390,height:844});await page.goto('/#events');await page.locator('#event-new').click();await page.getByRole('radio',{name:'I know the time'}).click();
 const day=await page.locator('#event-day').inputValue(),time=await page.locator('#event-time').inputValue();
 await expect(page.locator('[data-event-preset]')).toHaveCount(6);
 for(const [id,title,icon] of [['movie-night','Movie night','movie'],['board-games','Board games','board-game'],['walk','Go for a walk','walking'],['skiing','Skiing','skis'],['eat-out','Eat out','restaurant'],['cook-together','Cook together','cooking']]){
  await page.locator(`[data-event-preset="${id}"]`).click();await expect(page.locator('#event-title')).toHaveValue(title);await expect(page.locator('#event-icon')).toHaveValue(icon);
  await expect(page.locator('#event-day')).toHaveValue(day);await expect(page.locator('#event-time')).toHaveValue(time);await expect(page.locator('#event-dialog')).toBeVisible();
 }
 await page.locator('#event-icon').selectOption('movie');await page.locator('#event-title').fill('Cooking with a movie preset test');await expect(page.locator('#event-icon')).toHaveValue('movie');
 // Each preset suggests a length; Cook together, chosen last, suggests 2½ hours.
 await expect(page.locator('#event-duration-out')).toHaveText('2h 30m');
 await page.getByRole('button',{name:'Evening',exact:true}).click();await expect(page.locator('#event-time')).toHaveValue('19:00');
 await page.locator('#event-day').fill('2027-08-15');await page.locator('#event-duration').fill('180');await page.getByRole('button',{name:'Save event',exact:true}).click();await expect(page.locator('#event-dialog')).not.toBeVisible();
 const d=await rpc(page,'export_events'),e=d.events.find((e:any)=>e.title==='Cooking with a movie preset test');expect(e.icon_id).toBe('movie');
 const card=page.locator(`[data-event-id="${e.id}"]`);await expect(card.locator('.event-illustration')).toBeVisible();await card.locator('.event-details>summary').click();await card.getByRole('button',{name:'Edit',exact:true}).click();await expect(page.locator('#event-icon')).toHaveValue('movie');
 await expect(page.locator('#event-presets')).toBeHidden();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});

test('a day poll lets roommates paint availability and the host lock in a valid day',async({browser})=>{
 const phone={viewport:{width:390,height:844},hasTouch:true,isMobile:true};
 const title='Poll browser test '+Date.now(),host=await browser.newPage(phone);await identify(host,'rina');await host.goto('/#events');await expect(host.locator('#event-new')).toBeEnabled();
 await host.locator('#event-new').click();await expect(host.getByRole('radio',{name:'Find a day together'})).toHaveAttribute('aria-checked','true');await expect(host.locator('#event-start')).toBeHidden();
 await host.locator('#event-title').fill(title);await host.locator('#event-window-start').fill('2099-03-02');await host.locator('#event-window-end').fill('2099-03-08');await host.locator('#event-time-hint').fill('Evening');
 await host.getByRole('button',{name:'Save event',exact:true}).click();await expect(host.locator('#event-dialog')).not.toBeVisible();
 const card=host.locator('.event-card').filter({hasText:title});await expect(card).toHaveClass(/event-polling/);await expect(card.locator('[data-avail-day]')).toHaveCount(7);
 await expect(card.getByRole('button',{name:'✓ Yes'})).toHaveCount(0);
 // Drag across three days with the Works brush.
 await card.locator('.avail-grid').scrollIntoViewIfNeeded();
 const box=async(day:string)=>(await card.locator(`[data-avail-day="${day}"]`).boundingBox())!;
 const a=await box('2099-03-04'),b=await box('2099-03-06');
 await host.mouse.move(a.x+a.width/2,a.y+a.height/2);await host.mouse.down();await host.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:8});await host.mouse.up();
 for(const day of ['2099-03-04','2099-03-05','2099-03-06'])await expect(card.locator(`[data-avail-day="${day}"]`)).toHaveAttribute('data-mark','yes');
 await expect(host).toHaveURL(/#events$/);
 // The other three mark one shared day; it becomes valid for everyone.
 const d=await rpc(host,'events_dashboard'),poll=d.events.find((e:any)=>e.title===title);
 await expect.poll(async()=>(await rpc(host,'events_dashboard')).availability.filter((x:any)=>x.id===poll.id).length).toBe(1);
 for(const member of ['michal','ohm','rohil'])await rpc(host,'save_event_availability',{id:poll.id,actor:member,request_id:crypto.randomUUID(),poll_version:1,expected_version:0,days:{'2099-03-05':member==='ohm'?'maybe':'yes'}});
 await host.reload();await expect(card.locator('[data-avail-day="2099-03-05"]')).toHaveClass(/valid/);await expect(card.locator('.avail-best')).toContainText('Everyone can make');
 // Tapping a marked day with the same brush clears it; keyboard toggles too.
 await card.locator('[data-avail-day="2099-03-06"]').click();await expect(card.locator('[data-avail-day="2099-03-06"]')).toHaveAttribute('data-mark','');
 await card.getByRole('radio',{name:'If needed'}).click();await card.locator('[data-avail-day="2099-03-07"]').focus();await host.keyboard.press('Enter');await expect(card.locator('[data-avail-day="2099-03-07"]')).toHaveAttribute('data-mark','maybe');
 await card.getByRole('button',{name:'Lock in a day'}).click();await expect(host.locator('#event-lock-day')).toHaveValue('2099-03-05');
 await expect(host.locator('#event-lock-time')).toHaveValue('19:00');await host.locator('#event-lock-time').fill('18:30');await host.locator('#event-lock-duration').fill('150');await expect(host.locator('#event-lock-summary')).toContainText('6:30 PM – 9 PM · 2h 30m');await host.getByRole('button',{name:'Lock it in'}).click();
 await expect(host.locator('#event-lock-dialog')).not.toBeVisible();await expect(card).toHaveClass(/event-confirmed/);await expect(card.getByRole('button',{name:'✓ Yes',exact:true})).toBeVisible();
 expect(await host.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await host.close();
});
