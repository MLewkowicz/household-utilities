import {test,expect} from '@playwright/test';
for(const game of ['before-or-after','passport-puzzle'])test(`${game} imports expand practice without third-party requests`,async({page})=>{
 const external:string[]=[];page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith('http://127.0.0.1:4174/'))external.push(r.url());});
 await page.addInitScript(()=>localStorage.removeItem('household-person'));
 await page.setViewportSize({width:390,height:844});await page.goto('/?webgl=0#games/'+game);
 await expect(page.getByRole('button',{name:'Submit'})).toBeVisible();
 if(game==='before-or-after'){await page.locator('[data-archive-entry=starter-5]').click();await expect(page.locator('[data-archive-entry=starter-5]')).toHaveAttribute('aria-pressed','true');}
 const attempt=await page.evaluate(game=>JSON.parse(localStorage.getItem(`household-trivia-v2:guest:${game}:practice`)! ),game);
 expect(attempt.questions.every((q:any)=>q.version===5)).toBe(true);
 if(game==='passport-puzzle'){expect(new Set(attempt.questions.map((q:any)=>q.answer)).size).toBe(5);expect(attempt.questions.every((q:any)=>q.id.startsWith('passport-culture-'))).toBe(true);}
 await page.reload();await expect(page.getByRole('button',{name:'Submit'})).toBeVisible();
 const resumed=await page.evaluate(game=>JSON.parse(localStorage.getItem(`household-trivia-v2:guest:${game}:practice`)! ),game);expect(resumed.questions).toEqual(attempt.questions);
 if(game==='before-or-after'){
  await expect(page.locator('.timeline-tile')).toHaveCount(5);await expect(page.locator('.timeline-date')).toHaveCount(0);
  await page.getByRole('button',{name:'Submit'}).click();await expect(page.locator('.timeline-comparison')).toBeVisible();await expect(page.locator('.timeline-date')).toHaveCount(5);
 }else{
  await expect(page.getByRole('img',{name:'Country outline'})).toBeVisible();await page.locator('#trivia-guess').fill(attempt.questions[0].answer);
  await page.getByRole('button',{name:'Submit'}).click();await expect(page.locator('.trivia-feedback')).toContainText('200');
 }
 expect(await page.locator('#trivia-page').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);expect(external).toEqual([]);
 await page.screenshot({path:`.local/imported-${game}-phone.png`,fullPage:true});
 if(game==='passport-puzzle'){await page.reload();await expect(page.locator('.trivia-feedback')).toBeVisible();}
});
