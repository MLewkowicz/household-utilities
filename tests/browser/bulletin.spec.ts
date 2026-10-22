import {setTheme,refreshSection,openSettings} from './settings';
import {test,expect,type Page,type Locator} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const rpc=async(page:Page,fn:string,p?:unknown)=>{const r=await page.request.post(`/rest/v1/rpc/utilities_${fn}`,{headers:{apikey:'local-public'},data:p?{p}:{}});expect(r.ok()).toBeTruthy();return r.json();};
const note=(page:Page,body:string)=>page.locator('.bulletin-note').filter({has:page.locator('.note-body',{hasText:body})});
const selectView=async(page:Page,v:string)=>v==='complaint'||v==='compliment'?page.locator('#bulletin-kind-filter').selectOption(v):page.locator(`[data-bulletin-view=${v==='all'?'board':v}]`).click();
async function lift(card:Locator){if(!await card.locator('.note-tools').evaluate(el=>el.hasAttribute('open')))await card.locator('.note-fold').click();}
async function open(page:Page){await page.goto('/#bulletin');await expect(page.locator('#bulletin-status')).toHaveText('Shared notes · up to date');await page.locator('[data-bulletin-person=michal]').click();}
const values=(data:any)=>Object.fromEntries(Object.entries(data).filter(([k])=>k!=='updated_at'));

test('pinned notes, temperature, attribution, revisions, deletion and counts work without touching ledgers',async({page})=>{
 const before=await Promise.all(['dashboard','misc_dashboard','chores_dashboard'].map(fn=>rpc(page,fn)));
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/#bulletin');await expect(page.locator('#bulletin-new')).toBeEnabled();
 await page.locator('#bulletin-new').click();await expect(page.locator('#bulletin-identity-error')).toContainText('Choose your name');await page.locator('[data-bulletin-person=michal]').click();
 await expect(page.locator('#bulletin-note-heading')).toBeFocused();await page.locator('#bulletin-body').fill('Please wash the dishes <b>tonight</b>.');
 await page.locator('#bulletin-temperature').fill('-100');await expect(page.locator('#bulletin-expression')).toHaveText('About to burst');
 await page.locator('#bulletin-note-save').click();await expect(page.locator('#bulletin-note-error')).toContainText('Choose at least one person');
 await page.locator('input[name=bulletin-recipient][value=rina]').check();await page.locator('input[name=bulletin-recipient][value=ohm]').check();
 await page.locator('#bulletin-temperature').fill('0');await expect(page.locator('#bulletin-note-save')).toBeDisabled();await expect(page.locator('#bulletin-temperature-help')).toContainText('Choose a side');
 await page.locator('#bulletin-temperature').fill('-83');await page.locator('#bulletin-note-save').click();await expect(page.locator('#bulletin-note-dialog')).not.toBeVisible();
 const card=note(page,'Please wash the dishes');await expect(card).toHaveClass(/note-member-michal/);await expect(card.locator('.bulletin-tack')).toHaveCount(1);await expect(card.locator('.note-body b')).toHaveCount(0);await expect(card.locator('.note-byline time')).toHaveText(/^[A-Z][a-z]{2} \d{1,2}$/);await expect(card.locator('details[open]')).toHaveCount(0);await expect(card.locator('.note-extra')).not.toBeVisible();await expect(card.getByRole('button',{name:'Edit note',exact:true})).not.toBeVisible();
 await card.locator('.note-fold').focus();await page.keyboard.press('Enter');await expect(card.locator('.note-tools-panel')).toBeVisible();await expect(card.locator('.bulletin-history')).toHaveCount(0);await expect(card.locator('.entry-updated')).toContainText('Added by Michal');await page.keyboard.press('Enter');await expect(card.locator('.note-tools-panel')).not.toBeVisible();
 let d=await rpc(page,'bulletin_dashboard'),saved=d.notes[0];expect(saved.recipients).toEqual(['rina','ohm']);expect(saved.kind).toBe('complaint');
 expect(d.stats.find((s:any)=>s.period==='all'&&s.direction==='written'&&s.member==='michal').complaints).toBe(1);
 await selectView(page,'compliment');await expect(card).toHaveCount(0);await selectView(page,'complaint');await expect(card).toBeVisible();
 await page.locator('#bulletin-switch').click();await page.locator('[data-bulletin-person=rohil]').click();await lift(card);await card.getByRole('button',{name:'Edit note',exact:true}).click();
 await expect(page.locator('#bulletin-actor')).toContainText('Originally pinned by Michal');await page.locator('#bulletin-body').fill('Thanks for washing everything!');await page.locator('#bulletin-temperature').fill('100');await page.locator('#bulletin-note-save').click();await expect(page.locator('#bulletin-note-dialog')).not.toBeVisible();
 await selectView(page,'compliment');const changed=note(page,'Thanks for washing everything!');await expect(changed).toHaveClass(/note-member-michal/);await lift(changed);await expect(changed.locator('.entry-updated')).toContainText('Edited by Rohil');await expect(changed).not.toContainText('Please wash the dishes <b>tonight</b>.');
 await refreshSection(page);await expect(changed.locator('.note-tools')).toHaveAttribute('open','');await expect(changed.locator('.entry-updated')).toBeVisible();
 d=await rpc(page,'bulletin_dashboard');expect(d.notes[0].posted_at).toBe(saved.posted_at);expect(d.notes[0].author).toBe('michal');expect(d.stats.find((s:any)=>s.period==='all'&&s.direction==='written'&&s.member==='michal')).toMatchObject({complaints:0,compliments:1});
 await selectView(page,'activity');await expect(page.locator('.bulletin-chart').first().getByRole('img',{name:'Michal: 0 complaints and 1 compliments written'})).toBeVisible();
 await selectView(page,'all');await page.locator('#bulletin-kind-filter').selectOption('all');await lift(changed);await changed.getByRole('button',{name:'Delete note',exact:true}).click();await page.locator('#bulletin-action-save').click();await expect(page.locator('#bulletin-action-dialog')).not.toBeVisible();await expect(changed).toHaveCount(0);
 d=await rpc(page,'bulletin_dashboard');expect(d.stats.every((s:any)=>s.complaints===0&&s.compliments===0)).toBeTruthy();
 await page.locator('#bulletin-show-deleted').check();await expect(changed).toHaveClass(/note-deleted/);await lift(changed);await changed.getByRole('button',{name:'Restore'}).click();await page.locator('#bulletin-action-save').click();await expect(page.locator('#bulletin-action-dialog')).not.toBeVisible();await expect(changed).not.toHaveClass(/note-deleted/);
 const downloading=page.waitForEvent('download');await openSettings(page);await page.locator('#export').click();const download=await downloading;const exported=JSON.parse(await readFile((await download.path())!,'utf8'));expect(exported.history).toHaveLength(4);expect(exported.bills).toBeUndefined();
 const after=await Promise.all(['dashboard','misc_dashboard','chores_dashboard'].map(fn=>rpc(page,fn)));after.forEach((d,i)=>expect(values(d)).toEqual(values(before[i])));expect(errors).toEqual([]);
});

test('Post-its grow the page to the bottom and remain legible on phones in both themes',async({page})=>{
 for(let i=0;i<19;i++)await rpc(page,'save_bulletin_note',{id:crypto.randomUUID(),request_id:crypto.randomUUID(),actor:['michal','rina','ohm','rohil'][i%4],action:'create',body:`Local scrolling fixture ${i}. `+(i===18?'A'.repeat(550):'A little note with enough words to make it feel like home.'),recipients:['rina','ohm'],temperature:i%2?-60:75});
 await open(page);await expect(page.locator('.bulletin-note')).toHaveCount(20);
 const colors=await page.locator('.bulletin-note').evaluateAll(nodes=>Object.fromEntries(nodes.map(n=>[n.className.match(/note-member-(\w+)/)![1],getComputedStyle(n.querySelector('.paper-fill')!).fill])));expect(new Set(Object.values(colors)).size).toBe(4);
 for(const width of [1280,390]){
  await page.setViewportSize({width,height:844});
  for(const theme of ['light','dark']){
   await setTheme(page,theme);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
   expect(await page.locator('.bulletin-board').evaluate(el=>el.scrollHeight<=el.clientHeight+2)).toBeTruthy();
   await page.locator('.bulletin-end').scrollIntoViewIfNeeded();await expect(page.locator('.bulletin-end')).toBeInViewport();await expect(page.locator('.bulletin-grass')).toBeInViewport();expect(await page.locator('.bulletin-post').evaluate(el=>el.getBoundingClientRect().top>=document.querySelector('.bulletin-board')!.getBoundingClientRect().bottom-5)).toBeTruthy();
   const geometry=await page.locator('.bulletin-note').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
   for(let i=0;i<geometry.length;i++)for(let j=i+1;j<geometry.length;j++){const a=geometry[i],b=geometry[j];expect(a.right<=b.x||b.right<=a.x||a.bottom<=b.y||b.bottom<=a.y,JSON.stringify({width,theme,i,j,a,b})).toBeTruthy();}
  }
 }
 await page.locator('#bulletin-new').click();await expect(page.locator('#bulletin-note-heading')).toBeFocused();expect(await page.locator('#bulletin-note-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#bulletin-temperature').fill('-100');const expression=page.locator('#bulletin-reaction .bulletin-character');await expect(expression).toHaveClass(/has-character-canvas/);await expect(expression).toHaveAttribute('aria-label','Michal: About to burst');const frozen=await expression.locator('canvas').evaluate((el:HTMLCanvasElement)=>el.toDataURL());await page.waitForTimeout(120);expect(await expression.locator('canvas').evaluate((el:HTMLCanvasElement)=>el.toDataURL())).toBe(frozen);
 await page.locator('#bulletin-temperature').fill('100');await expect(expression).toHaveAttribute('aria-label','Michal: Heart overflowing');expect(await expression.locator('canvas').evaluate((el:HTMLCanvasElement)=>el.toDataURL())).not.toBe(frozen);
 await page.keyboard.press('Escape');await selectView(page,'activity');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.locator('#bulletin-period').selectOption('week');
 await page.getByRole('link',{name:/^To-dos/}).click();await expect(page.locator('#chore-identity-name')).toContainText('Michal');await page.getByRole('link',{name:'Bulletin',exact:true}).click();await expect(page.locator('#bulletin-identity-name')).toContainText('Michal');
});

test('lost saves retry idempotently and stale edits preserve the note draft',async({page})=>{
 await open(page);await page.locator('#bulletin-new').click();await page.locator('#bulletin-body').fill('One note, even after a retry.');await page.locator('input[name=bulletin-recipient][value=rina]').check();
 await page.route('**/rpc/utilities_save_bulletin_note',async route=>{await route.fetch();await route.abort();},{times:1});await page.locator('#bulletin-note-save').click();await expect(page.locator('#bulletin-note-error')).toBeVisible();await expect(page.locator('#bulletin-body')).toHaveValue('One note, even after a retry.');
 await page.locator('#bulletin-note-save').click();await expect(page.locator('#bulletin-note-dialog')).not.toBeVisible();const d=await rpc(page,'bulletin_dashboard'),n=d.notes.find((n:any)=>n.body==='One note, even after a retry.');expect(d.history.filter((h:any)=>h.id===n.id)).toHaveLength(1);
 await lift(note(page,'One note, even after a retry.'));await note(page,'One note, even after a retry.').getByRole('button',{name:'Edit note',exact:true}).click();await page.locator('#bulletin-body').fill('Keep my unsaved words.');
 await rpc(page,'save_bulletin_note',{...n,action:'edit',expected_version:n.version,actor:'rina',request_id:crypto.randomUUID(),body:'Someone changed this note.'});
 await page.locator('#bulletin-note-save').click();await expect(page.locator('#bulletin-note-error')).toContainText('changed');await expect(page.locator('#bulletin-body')).toHaveValue('Keep my unsaved words.');
});

test('an unavailable bulletin is read-only and does not block the other tabs',async({page})=>{
 await page.route('**/rpc/utilities_bulletin_dashboard',route=>route.abort());await page.goto('/#bulletin');await expect(page.locator('#bulletin-status')).toHaveText('Viewing saved notes');await expect(page.locator('#bulletin-new')).toBeDisabled();await expect(page.locator('#bulletin-notice')).toContainText('disabled');
 for(const [tab,status] of [['Utilities','#new-payment'],['Expenses','#new-expense'],['To-dos','#chore-new']]){await page.getByRole('link',{name:tab,exact:true}).click();if(tab==='Expenses')await page.locator('[data-identity=michal]').click();await expect(page.locator(status)).toBeEnabled();}
});
