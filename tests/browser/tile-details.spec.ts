import {test,expect,type Page,type Locator} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
const rpc=async(page:Page,operation:string,p?:unknown)=>{const r=await page.request.post('/rest/v1/rpc/utilities_'+operation,{headers:{apikey:'local-public'},data:p?{p}:{}});expect(r.ok(),await r.text()).toBeTruthy();return r.json();};
const base=()=>({id:crypto.randomUUID(),request_id:crypto.randomUUID(),actor:'michal',action:'create'});
async function expand(tile:Locator,selector='.tile-details'){const details=tile.locator(selector);if(!await details.evaluate(el=>el.hasAttribute('open')))await details.locator(':scope>summary').click();}
async function compact(tile:Locator){
 await expect(tile.locator('.entry-updated')).toBeVisible();await expect(tile.locator('summary').filter({hasText:/History|revisions/i})).toHaveCount(0);
 const gap=await tile.evaluate(el=>{const last=el.querySelector<HTMLElement>('.entry-updated')!;let bottom=last.offsetHeight;for(let node:HTMLElement|null=last;node&&node!==el;node=node.offsetParent as HTMLElement|null)bottom+=node.offsetTop;return (el as HTMLElement).offsetHeight-bottom;});
 expect(gap,'Space below the last useful detail').toBeGreaterThanOrEqual(10);expect(gap,'Expanded tiles should not have stacked bottom padding').toBeLessThanOrEqual(26);
}
test('expanded tiles show current details and the last update without revision logs or empty footers',async({page})=>{
 test.setTimeout(90000);await page.addInitScript(()=>localStorage.setItem('household-person','michal'));await mkdir('.local/compact-tiles-review',{recursive:true});
 const day=(await rpc(page,'chores_dashboard')).local_day;
 const personal=await rpc(page,'save_personal_task',{...base(),title:'Compact personal task',group_name:'Compact tiles'});
 await rpc(page,'save_personal_task',{...base(),title:'A longer neighboring task title that wraps onto several lines on a narrow screen',group_name:'Compact tiles'});
 const shared=await rpc(page,'save_chore',{...base(),title:'Compact shared task',pinned:false,due_on:day,assignee:'michal',kind:'reminder',points:0,icon_id:'bicycle',note:'Bring the recycling downstairs.'});
 await rpc(page,'save_chore',{...shared,actor:'rohil',action:'edit',expected_version:shared.version,request_id:crypto.randomUUID(),note:'Bring the recycling downstairs after dinner.'});
 const choreLedger=await rpc(page,'chores_dashboard'),revision=choreLedger.history.find((h:any)=>h.id===shared.id&&h.version===2);expect(revision.created_at).not.toBe(choreLedger.history.find((h:any)=>h.id===shared.id&&h.version===1).created_at);
 const expenses=await rpc(page,'misc_dashboard'),expense=await rpc(page,'save_misc_expense',{...base(),payer:'michal',description:'Compact groceries',icon_id:'groceries',amount_cents:2000,paid_on:day,split_mode:'equal',participants:['michal','rina'],expected_rounding_cursor:expenses.rounding_cursor});
 const note=await rpc(page,'save_bulletin_note',{...base(),body:'Compact note details.',temperature:30,recipients:['rina']});
 const eventPayload={...base(),title:'Compact event',description:'Bring snacks.',location:'Living room',starts_local:day+'T19:00',ends_local:day+'T21:00'},event=await rpc(page,'save_event',eventPayload);
 for(const width of [320,390,1280])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:900});await page.goto('/#chores/personal');await expect(page.locator('#personal-add')).toBeEnabled();await page.locator('#theme-select').selectOption(theme);
  const mine=page.locator(`[data-personal-id="${personal.id}"]`);await expand(mine);await compact(mine);await expect(mine.getByRole('button',{name:'Edit',exact:true})).toBeVisible();
  const wrapper=mine.locator('..');expect(await wrapper.evaluate(el=>el.getBoundingClientRect().height-el.querySelector('article')!.getBoundingClientRect().height)).toBeLessThan(2);
  await mine.screenshot({path:`.local/compact-tiles-review/personal-${width}-${theme}.png`});
  for(const view of ['mine','household','week']){
   await page.locator(`[data-chore-view=${view}]`).click();if(view==='mine')await page.locator('[data-home-filter=all]').click();const tile=page.locator(`[data-chore-id="${shared.id}"]`);if(!await tile.locator('.tile-details').evaluate(el=>el.hasAttribute('open')))await tile.locator('.chore-corner-tab').click();await compact(tile);
   await expect(tile).toContainText('after dinner');await expect(tile.locator('.entry-updated')).toContainText('Edited by Rohil');await expect(tile.locator('.entry-updated time')).toHaveAttribute('datetime',revision.created_at);
   await tile.screenshot({path:`.local/compact-tiles-review/${view}-${width}-${theme}.png`});
  }
  await page.goto('/#miscellaneous');await expect(page.locator('#new-expense')).toBeEnabled();const purchase=page.locator(`[data-entry-id="${expense.id}"]`);await expand(purchase);await compact(purchase);await expect(purchase.locator('.entry-shares')).toContainText('$10.00');await purchase.screenshot({path:`.local/compact-tiles-review/expense-${width}-${theme}.png`});
  await page.goto('/#bulletin');await expect(page.locator('#bulletin-status')).toContainText('up to date');const paper=page.locator(`[data-note-id="${note.id}"]`);await expand(paper,'.note-tools');await compact(paper);await paper.screenshot({path:`.local/compact-tiles-review/note-${width}-${theme}.png`});
  await page.goto('/#events');await expect(page.locator('#event-new')).toBeEnabled();if(!await page.locator(`[data-event-id="${event.id}"]`).count())await page.locator('#event-history').check();const invitation=page.locator(`[data-event-id="${event.id}"]`);await expand(invitation,'.event-details');await compact(invitation);await expect(invitation).toContainText('Bring snacks.');await invitation.screenshot({path:`.local/compact-tiles-review/event-${width}-${theme}.png`});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 }
 const saved=await rpc(page,'export_chores');expect(saved.history.filter((h:any)=>h.id===shared.id)).toHaveLength(2);
});
