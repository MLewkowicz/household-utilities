import {test,expect,type Page} from '@playwright/test';

const rpc=async(page:Page,name:string,p:unknown)=>{
 const response=await page.request.post(`/rest/v1/rpc/utilities_${name}`,{headers:{apikey:'local-public'},data:{p}});
 expect(response.ok(),await response.text()).toBeTruthy();return response.json();
};
async function createPoll(page:Page,start='2099-03-02',end='2099-03-08'){
 await page.addInitScript(()=>localStorage.setItem('household-person','rina'));
 return rpc(page,'save_event',{id:crypto.randomUUID(),request_id:crypto.randomUUID(),actor:'rina',action:'create_poll',title:'Calendar regression '+crypto.randomUUID(),window_start:start,window_end:end});
}

test('clearing a day keeps brushes and the grid in place throughout a slow save',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const poll=await createPoll(page);
 await rpc(page,'save_event_availability',{id:poll.id,request_id:crypto.randomUUID(),actor:'rina',poll_version:1,expected_version:0,days:{'2099-03-04':'yes'}});
 await page.goto('/?webgl=0#events');
 const card=page.locator(`[data-event-id="${poll.id}"]`),day=card.locator('[data-avail-day="2099-03-04"]'),works=card.getByRole('radio',{name:'Works',exact:true}),maybe=card.getByRole('radio',{name:'If needed',exact:true});
 await expect(day).toHaveAttribute('data-mark','yes');await day.scrollIntoViewIfNeeded();
 const gridTop=await card.locator('.avail-grid').evaluate(el=>el.getBoundingClientRect().top+scrollY);
 let release!:()=>void;const saved=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/rpc/utilities_save_event_availability',async route=>{await saved;await route.continue();});
 try{
  await day.click();await expect(card.locator('.avail')).toHaveAttribute('aria-busy','true');
  await expect(works).toBeVisible();await expect(maybe).toBeVisible();await expect(day).toHaveAttribute('data-mark','');
  expect(await card.locator('.avail-grid').evaluate(el=>el.getBoundingClientRect().top+scrollY)).toBeCloseTo(gridTop,0);
  await maybe.click();await expect(maybe).toHaveAttribute('aria-checked','true');
 }finally{release();}
 await expect(day).toBeEnabled();await expect(maybe).toBeFocused();await expect(maybe).toHaveAttribute('aria-checked','true');
 // Continue from the keyboard after saving, without losing the focused day.
 await day.focus();await page.keyboard.press('Enter');await expect(day).toBeEnabled();await expect(day).toBeFocused();await expect(day).toHaveAttribute('data-mark','maybe');
 await page.keyboard.press('ArrowRight');await expect(card.locator('[data-avail-day="2099-03-05"]')).toBeFocused();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});

test('failed availability saves restore marks without losing the brush controls',async({page})=>{
 const poll=await createPoll(page);await page.goto('/?webgl=0#events');
 const card=page.locator(`[data-event-id="${poll.id}"]`),day=card.locator('[data-avail-day="2099-03-04"]');
 await page.route('**/rpc/utilities_save_event_availability',route=>route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'Could not save this mark.'})}));
 await day.click();await expect(page.locator('#toast')).toHaveText('Could not save this mark.');
 await expect(day).toBeEnabled();await expect(day).toHaveAttribute('data-mark','');
 await expect(card.getByRole('radio',{name:'Works',exact:true})).toBeVisible();await expect(card.getByRole('radio',{name:'If needed',exact:true})).toBeVisible();
});

test('poll dates and an open host picker roll forward at New York midnight',async({page})=>{
 const poll=await createPoll(page,'2027-11-06','2027-11-08');
 for(const member of ['rina','michal','ohm','rohil'])await rpc(page,'save_event_availability',{id:poll.id,request_id:crypto.randomUUID(),actor:member,poll_version:1,expected_version:0,days:{'2027-11-06':'yes','2027-11-07':'maybe'}});
 await page.clock.install({time:new Date('2027-11-07T03:59:30Z')});await page.goto('/?webgl=0#events');
 const card=page.locator(`[data-event-id="${poll.id}"]`),first=card.locator('[data-avail-day="2027-11-06"]'),second=card.locator('[data-avail-day="2027-11-07"]');
 await expect(first).toBeEnabled();await expect(first).toHaveClass(/valid/);await expect(card.locator('.avail-best')).toContainText('Nov 6');
 await card.getByRole('button',{name:'Lock in a day',exact:true}).click();await expect(page.locator('#event-lock-day')).toHaveValue('2027-11-06');
 await page.clock.fastForward(31000);
 await expect(first).toBeDisabled();await expect(first).toHaveClass(/past/);await expect(first).not.toHaveClass(/valid/);await expect(first).toHaveAttribute('data-mark','yes');
 await expect(second).toBeEnabled();await expect(card.locator('.avail-best')).not.toContainText('Nov 6');await expect(card.locator('.avail-best')).toContainText('Nov 7');
 await expect(page.locator('#event-lock-day')).toHaveValue('2027-11-07');await expect(page.locator('#event-lock-day option')).toHaveCount(2);
 // The next midnight is 25 hours later because daylight saving time ends.
 await page.clock.setSystemTime(new Date('2027-11-08T04:30:00Z'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(second).toBeEnabled();await expect(page.locator('#event-lock-day')).toHaveValue('2027-11-07');
 await page.clock.setSystemTime(new Date('2027-11-08T05:00:01Z'));await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
 await expect(second).toBeDisabled();await expect(page.locator('#event-lock-day')).toHaveValue('2027-11-08');await expect(page.locator('#event-lock-day option')).toHaveCount(1);
 await page.clock.setSystemTime(new Date('2027-11-09T05:00:01Z'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(page.locator('#event-lock-day option')).toHaveCount(0);await expect(page.getByRole('button',{name:'Lock it in',exact:true})).toBeDisabled();await expect(page.locator('#event-lock-error')).toContainText('All poll days have passed');
 await page.locator('#event-lock-close').click();await expect(card).toHaveCount(0);await page.locator('#event-history').check();await expect(first).toHaveAttribute('data-mark','yes');await expect(second).toHaveAttribute('data-mark','maybe');
});
