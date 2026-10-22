import {setTheme} from './settings';
import {test,expect,type Page,type Locator} from '@playwright/test';
const rpc=async(page:Page,name:string,p?:unknown)=>(await page.request.post(`/rest/v1/rpc/utilities_${name}`,{headers:{apikey:'local-public'},data:p?{p}:{}})).json();
async function expand(card:Locator){const details=card.locator(':scope > .tile-details');if(!await details.evaluate(el=>el.hasAttribute('open')))await details.locator(':scope > summary').click();}
async function open(page:Page,who='rina') {
 await page.goto('/#miscellaneous');await expect(page.locator('#misc-status')).toHaveText('Shared purchases · up to date');
 await page.locator(`[data-identity=${who}]`).click();
}
test('name-first expenses, custom shares, icons, history and pair repayments stay separate from utilities',async({page,browser})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const utilityBefore=await rpc(page,'dashboard');
 await page.goto('/#miscellaneous');await expect(page.locator('#identity-panel')).toBeVisible();
 await expect(page.locator('#new-expense')).toBeDisabled();await page.locator('[data-identity=rina]').click();
 await page.locator('#new-expense').click();await page.getByLabel('What did you buy?').fill('Paper towels <b>for home</b>');
 await page.getByLabel('Purchase amount',{exact:true}).fill('24.00');
 await expect(page.locator('#chosen-icon-label')).toHaveText('Paper towels');
 await expect(page.locator('#participant-tiles [aria-pressed=true]')).toHaveCount(3);
 await expect(page.locator('#self-share')).toContainText('$6.00');
 await page.locator('#save-expense').click();await expect(page.locator('#expense-dialog')).not.toBeVisible();
 const data=await rpc(page,'misc_dashboard');const entry=data.expenses.find((e:any)=>e.description==='Paper towels <b>for home</b>');
 const card=page.locator(`[data-entry-id="${entry.id}"]`);
 await expect(card.locator('h3')).toHaveText('Paper towels <b>for home</b>');await expect(card.locator('h3 b')).toHaveCount(0);
 await expect(page.locator('#misc-balances .member-rina')).toContainText('$18.00');
 const other=await browser.newPage();await other.goto('http://127.0.0.1:4174/#miscellaneous');
 await expect(other.locator(`[data-entry-id="${entry.id}"]`)).toBeVisible();await other.close();
 await expand(card);await card.getByRole('button',{name:/^Edit /}).click();await page.locator('[data-participant=rohil]').click();
 await page.getByText('Custom amounts',{exact:true}).click();
 await page.getByLabel('Michal’s share',{exact:true}).fill('10');await page.getByLabel('Rina’s share',{exact:true}).fill('4');
 await expect(page.locator('#split-status')).toHaveText('Every cent accounted for.');await expect(page.locator('#save-expense')).toBeEnabled();await expect(page.getByLabel('Ohm’s share',{exact:true})).toHaveValue('10.00');
 await page.getByLabel('Ohm’s share',{exact:true}).fill('10');await expect(page.locator('#split-status')).toHaveText('Every cent accounted for.');
 await page.locator('#icon-picker summary').click();await page.getByLabel('Search icons',{exact:true}).fill('milk');
 await page.getByRole('button',{name:'Milk icon',exact:true}).click();
 await page.getByLabel('What did you buy?').fill('Paper towels and milk');await expect(page.locator('#chosen-icon-label')).toHaveText('Milk');
 await page.locator('#save-expense').click();await expect(page.locator('#expense-dialog')).not.toBeVisible();
 await expect(card).toContainText('Edited');await expect(page.locator('#misc-feed .expense-card')).toHaveCount(1);
 await expand(card);await expect(card.locator('.entry-history')).toHaveCount(0);await expect(card.locator('.entry-updated')).toContainText('Updated by Rina');await expect(card.locator('.entry-shares')).toContainText('Ohm $10.00');expect((await rpc(page,'misc_dashboard')).expense_history.some((e:any)=>e.description==='Paper towels <b>for home</b>'&&e.participants.includes('rohil'))).toBeTruthy();
 await page.locator('.pair-card').filter({hasText:'Ohm owes Rina'}).getByRole('button').click();
 await expect(page.locator('#settlement-amount')).toHaveValue('10.00');
 await expect(page.locator('#settlement-title')).toBeFocused();
 await page.locator('#settlement-form').getByText('Other',{exact:true}).click();await page.getByLabel('How was it sent?').fill('cash');
 await page.locator('#save-settlement').click();await expect(page.locator('#settlement-dialog')).not.toBeVisible();
 await expect(page.locator('.pair-card').filter({hasText:'Ohm owes Rina'})).toHaveCount(0);
 await expand(card);await card.getByRole('button',{name:/^Delete /}).click();await page.locator('#confirm-misc-delete').click();await expect(page.locator('#misc-delete-dialog')).not.toBeVisible();
 await expect(page.locator('.pair-card').filter({hasText:'Rina owes Ohm'})).toContainText('$10.00');
 const repayment=page.locator('#misc-feed .expense-card');await expand(repayment);await repayment.getByRole('button',{name:'Delete repayment'}).click();
 await page.locator('#confirm-misc-delete').click();await expect(page.locator('#misc-delete-dialog')).not.toBeVisible();
 await expect(page.locator('#misc-pairs')).toContainText('No outstanding balances');
 await page.locator('#misc-page').getByLabel('Show deleted').check();await expect(page.locator('#misc-feed .expense-card')).toHaveCount(2);
 await expand(card);await expect(card.locator('.entry-updated')).toContainText('Deleted by Rina');
 const utilityAfter=await rpc(page,'dashboard');for(const key of ['bills','allocations','history','bill_history'])expect(utilityAfter[key]).toEqual(utilityBefore[key]);
 expect(errors).toEqual([]);
});

test('themes, identity, hash navigation and icon browsing work on phones and persist',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});
 await open(page,'michal');await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await setTheme(page,'light');await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.getByRole('link',{name:'Utilities',exact:true}).click();await expect(page.locator('#utilities-page')).toBeVisible();
 await page.goBack();await expect(page.locator('#misc-page')).toBeVisible();await page.reload();
 await expect(page.locator('#identity-name')).toContainText('You’re Michal');await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await setTheme(page,'system');await page.emulateMedia({colorScheme:'light'});await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.emulateMedia({colorScheme:'dark'});await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await page.locator('#new-expense').click();await page.getByLabel('What did you buy?').fill('Milk');await page.getByLabel('Purchase amount',{exact:true}).fill('9.99');
 await page.getByLabel('Include my share').uncheck();await expect(page.locator('#self-share')).not.toBeVisible();
 await page.locator('[data-participant=ohm]').click();await page.locator('[data-participant=rohil]').click();
 await expect(page.locator('[data-participant=rina]')).toContainText('$9.99');
 await page.locator('#icon-picker summary').click();await expect(page.locator('#icon-grid button')).toHaveCount(42);
 await page.getByLabel('Icon category').selectOption('Travel');await expect(page.locator('#icon-grid button')).toHaveCount(4);
 await page.getByRole('button',{name:'Flight icon'}).focus();await page.keyboard.press('Enter');await expect(page.locator('#chosen-icon-label')).toHaveText('Flight');
 expect(await page.locator('#expense-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
 await page.keyboard.press('Escape');await expect(page.locator('#expense-dialog')).not.toBeVisible();
 await page.locator('#switch-person').click();await page.locator('[data-identity=ohm]').click();await expect(page.locator('#identity-name')).toContainText('You’re Ohm');
});

test('lost save responses can be retried without duplicate entries or extra rounding turns',async({page})=>{
 await open(page);await page.locator('#new-expense').click();await page.getByLabel('What did you buy?').fill('Retry test');await page.getByLabel('Purchase amount',{exact:true}).fill('0.01');
 await page.route('**/rpc/utilities_save_misc_expense',async route=>{await route.fetch();await route.abort();},{times:1});
 await page.locator('#save-expense').click();await expect(page.locator('#expense-error')).toBeVisible();await expect(page.locator('#save-expense')).toBeEnabled();
 const once=await rpc(page,'misc_dashboard');const e=once.expenses.find((e:any)=>e.description==='Retry test');expect(e).toBeTruthy();
 await page.locator('#save-expense').click();await expect(page.locator('#expense-dialog')).not.toBeVisible();
 const twice=await rpc(page,'misc_dashboard');expect(twice.expense_history.filter((x:any)=>x.id===e.id)).toHaveLength(1);expect(twice.rounding_cursor).toBe(once.rounding_cursor);
 await rpc(page,'save_misc_expense',{action:'delete',id:e.id,expected_version:1,request_id:crypto.randomUUID(),actor:'rina'});
});

test('miscellaneous failures preserve drafts, disable writes offline, and do not block utilities',async({page})=>{
 await open(page);await page.locator('#new-expense').click();await page.getByLabel('What did you buy?').fill('Keep this draft');await page.getByLabel('Purchase amount',{exact:true}).fill('5');
 await page.route('**/rpc/utilities_save_misc_expense',route=>route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'Review this purchase before saving'})}));
 await page.locator('#save-expense').click();await expect(page.locator('#expense-error')).toHaveText('Review this purchase before saving');await expect(page.getByLabel('What did you buy?')).toHaveValue('Keep this draft');
 await page.keyboard.press('Escape');
 await page.route('**/rpc/utilities_misc_dashboard',route=>route.abort());await page.reload();
 await expect(page.locator('#misc-status')).toHaveText('Viewing saved purchases');await expect(page.locator('#new-expense')).toBeDisabled();await expect(page.locator('#new-settlement')).toBeDisabled();
 await page.getByRole('link',{name:'Utilities',exact:true}).click();await expect(page.getByText('Shared ledger · up to date')).toBeVisible();await expect(page.locator('#new-payment')).toBeEnabled();
});

test('icon taps complete the name, manual wording stays editable, and icon-only selection preserves it',async({page})=>{
 await open(page);await page.locator('#new-expense').click();
 const description=page.getByLabel('What did you buy?');
 await description.fill('past');await expect(page.locator('#chosen-icon-label')).toHaveText('Pasta');
 const suggestion=page.locator('#icon-suggestions [data-icon=pasta]');
 await expect(suggestion).toHaveAttribute('aria-pressed','false');
 await suggestion.click();await expect(description).toHaveValue('Pasta');
 await expect(page.locator('#icon-suggestions [data-icon=pasta]')).toHaveAttribute('aria-pressed','true');
 await description.fill('Pasta and broccoli for dinner');await expect(page.locator('#chosen-icon-label')).toHaveText('Pasta');
 await page.getByLabel('Use icon name as description').uncheck();
 await page.locator('#icon-picker summary').click();await page.getByLabel('Search icons',{exact:true}).fill('broccoli');
 await page.getByRole('button',{name:'Broccoli icon',exact:true}).click();
 await expect(description).toHaveValue('Pasta and broccoli for dinner');await expect(page.locator('#chosen-icon-label')).toHaveText('Broccoli');
 await page.keyboard.press('Escape');
});

test('calculator sums groceries and assigns a fractional share with an exact remainder on phones',async({page})=>{
 await page.setViewportSize({width:390,height:844});await open(page,'michal');
 const utilityBefore=await rpc(page,'dashboard');
 await page.locator('#new-expense').click();await page.getByLabel('What did you buy?').fill('Fraction calculator test');
 await page.getByRole('button',{name:'Calculate purchase amount',exact:true}).click();
 await expect(page.locator('#calculator-title')).toBeFocused();
 for(const key of ['1','2','+','3'])await page.locator(`[data-calc-key="${key}"]`).click();
 await expect(page.locator('#calculator-result')).toHaveText('$15.00');
 await page.getByRole('button',{name:'Delete last character',exact:true}).click();await expect(page.locator('#calculator-use')).toBeDisabled();
 await page.locator('[data-calc-key="4"]').click();await expect(page.locator('#calculator-result')).toHaveText('$16.00');
 await page.getByRole('button',{name:'Clear calculation',exact:true}).click();
 await page.getByLabel('Calculation',{exact:true}).fill('12.50 + 8.75 + 3.20');
 await expect(page.locator('#calculator-result')).toHaveText('$24.45');
 await page.locator('#calculator-use').click();await expect(page.getByLabel('Purchase amount',{exact:true})).toHaveValue('24.45');
 await page.getByLabel('Purchase amount',{exact:true}).fill('10.01');
 await page.getByText('Custom amounts',{exact:true}).click();
 await page.getByRole('button',{name:'Calculate Michal’s share',exact:true}).click();
 await page.locator('[data-calc-expression="1/3"]').click();await expect(page.locator('#calculator-result')).toHaveText('$3.34');
 await expect(page.getByLabel('Split the rest equally among the others')).not.toBeVisible();
 expect(await page.locator('#calculator-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();
 await page.locator('#calculator-use').click();
 await expect(page.getByRole('textbox',{name:'Michal’s share',exact:true})).toHaveValue('3.34');
 await expect(page.locator('#split-status')).toHaveText('Every cent accounted for.');
 await page.getByRole('button',{name:'Calculate Ohm’s share',exact:true}).click();
 await page.getByLabel('Calculation',{exact:true}).fill('1/0');await expect(page.locator('#calculator-use')).toBeDisabled();
 await page.locator('#calculator-cancel').click();await expect(page.locator('#split-status')).toHaveText('Every cent accounted for.');
 await page.getByRole('button',{name:'Calculate Ohm’s share',exact:true}).click();
 await page.locator('[data-calc-expression="25%"] ').click();await expect(page.locator('#calculator-result')).toHaveText('$2.50');
 await page.locator('#calculator-cancel').click();
 await page.locator('#save-expense').click();await expect(page.locator('#expense-dialog')).not.toBeVisible();
 const data=await rpc(page,'misc_dashboard'),entry=data.expenses.find((e:any)=>e.description==='Fraction calculator test');
 expect(entry.amount_cents).toBe(1001);expect(entry.shares.michal).toBe(334);
 expect(Object.values(entry.shares).reduce((sum:any,value:any)=>sum+value,0)).toBe(1001);
 const others=[entry.shares.rina,entry.shares.ohm,entry.shares.rohil];expect(Math.max(...others)-Math.min(...others)).toBeLessThanOrEqual(1);
 await page.locator('[data-repay-from=rina][data-repay-to=michal]').click();
 await expect(page.locator('#settlement-title')).toBeFocused();
 await expect(page.locator('#settlement-amount')).not.toBeFocused();
 await page.keyboard.press('Escape');
 await page.locator('#new-settlement').click();await expect(page.locator('#settlement-title')).toBeFocused();await page.keyboard.press('Escape');
 await rpc(page,'save_misc_expense',{action:'delete',id:entry.id,expected_version:1,request_id:crypto.randomUUID(),actor:'michal'});
 const utilityAfter=await rpc(page,'dashboard');for(const key of ['bills','allocations','history','bill_history'])expect(utilityAfter[key]).toEqual(utilityBefore[key]);
});

test('automatic shares preserve edits, reject conflicts, and request the full total after excluding self',async({page})=>{
 await open(page,'michal');await page.locator('#new-expense').click();await page.getByLabel('What did you buy?').fill('Balanced automatically');await page.getByLabel('Purchase amount',{exact:true}).fill('100');await page.getByText('Custom amounts',{exact:true}).click();
 await page.getByLabel('Michal’s share',{exact:true}).fill('40');await page.getByLabel('Rina’s share',{exact:true}).fill('10');
 await expect(page.getByLabel('Ohm’s share',{exact:true})).toHaveValue('25.00');await expect(page.getByLabel('Rohil’s share',{exact:true})).toHaveValue('25.00');
 await page.getByLabel('Ohm’s share',{exact:true}).fill('80');await page.getByLabel('Ohm’s share',{exact:true}).press('Tab');await expect(page.getByLabel('Ohm’s share',{exact:true})).toHaveValue('25.00');await expect(page.getByLabel('Michal’s share',{exact:true})).toHaveValue('40.00');
 await page.locator('[data-share-auto=michal]').click();await page.locator('[data-share-auto=rina]').click();
 await page.locator('[data-participant=ohm]').click();await page.locator('[data-participant=rohil]').click();
 await page.getByRole('button',{name:'Calculate purchase amount',exact:true}).click();await page.getByLabel('Calculation',{exact:true}).fill('20 + 3.40');await page.locator('#calculator-use').click();
 await page.locator('#include-self').uncheck();await expect(page.getByLabel('Rina’s share',{exact:true})).toHaveValue('23.40');await expect(page.locator('#save-expense')).toBeEnabled();
 expect(await page.locator('#guest-split-open').evaluate(el=>!!(document.querySelector('#split-status')!.compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING))).toBeTruthy();
 await page.locator('#save-expense').click();await expect(page.locator('#expense-dialog')).not.toBeVisible();const d=await rpc(page,'misc_dashboard'),e=d.expenses.find((e:any)=>e.description==='Balanced automatically');expect(e.amount_cents).toBe(2340);expect(e.shares).toEqual({rina:2340});
});
