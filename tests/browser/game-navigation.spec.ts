import {test,expect} from '@playwright/test';

test('browser Back closes a game dialog before returning to the hub',async({page})=>{
 await page.goto('/?webgl=0#games');await page.locator('[data-orbit-game=geography]').click();
 await page.getByRole('button',{name:'Game settings',exact:true}).click();await page.goBack();
 await expect(page).toHaveURL(/#games$/);await expect(page.locator('#geo-settings-dialog')).toBeHidden();
 await page.getByRole('button',{name:'Play Common Ground',exact:true}).click();await expect(page.locator('#trivia-page')).toBeVisible();
});

test('every household feature can open Games and return to its exact route after a reload',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(()=>localStorage.setItem('household-person','michal'));
 const requests:string[]=[];page.on('request',r=>requests.push(r.url()));
 for(const route of ['chores/week','miscellaneous','events','bulletin','utilities']){
  await page.goto('/?webgl=0#'+route);
  await expect(page.locator('#main')).toHaveAttribute('aria-busy','false');
  await expect(page.locator('#games-shortcut')).toBeVisible();
  await expect(page.locator('#house-hero')).toBeHidden();
  await expect(page.locator('#games-page')).toBeHidden();
  // No atlas asset is requested before the first entry into Games.
  if(route==='chores/week')expect(requests.some(url=>url.includes('/globe/'))).toBe(false);
  await page.locator('#games-shortcut').focus();await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#games$/);
  const back=page.locator('.game-floating-nav [data-game-return]');
  await expect(back).toHaveAttribute('href','#'+route);
  await expect(page.locator('[data-orbit-game=geography]')).toBeVisible();
  await page.locator('[data-orbit-game=geography]').click();await expect(page).toHaveURL(/#games\/geography$/);
  await page.reload();await expect(back).toHaveAttribute('href','#'+route);
  await back.click();await expect(page).toHaveURL(new RegExp('#'+route+'$'));
  await expect(page.locator('#main')).toBeFocused();
  await page.goBack();await expect(page).toHaveURL(/#games\/geography$/);
  await expect(back).toHaveAttribute('href','#'+route);
 }
});

test('phone return links stay labeled and reachable on the hub, game and leaderboard',async({page})=>{
 await page.setViewportSize({width:360,height:800});
 await page.goto('/?webgl=0#games');
 await expect(page.locator('.game-floating-nav [data-game-return]')).toHaveAccessibleName('Back to To-dos');
 await expect(page.locator('.game-floating-nav [data-game-return] svg').last()).toBeVisible();
 await page.locator('[data-orbit-game=geography]').click();
 await expect(page.locator('.game-floating-nav [data-game-return]')).toBeInViewport();
 expect(await page.locator('.observatory-topbar').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await page.getByRole('link',{name:'Games',exact:true}).click();
 await page.locator('#orbit-scores').click();
 await expect(page.locator('.game-floating-nav [data-game-return]')).toBeVisible();
 await expect(page.locator('.game-floating-nav [data-game-return]')).toHaveAccessibleName('Back to To-dos');
 await page.locator('.game-floating-nav [data-game-return]').click();await expect(page).toHaveURL(/#chores$/);
 await page.locator('#settings-open').click();await expect(page.locator('#games-shortcut')).toBeHidden();
});

test('return navigation tolerates blocked storage and rejects unknown stored destinations',async({page})=>{
 await page.addInitScript(()=>sessionStorage.setItem('household-game-return','https://example.com'));
 await page.goto('/?webgl=0#games');await expect(page.locator('.game-floating-nav [data-game-return]')).toHaveAttribute('href','#chores');
 await page.addInitScript(()=>Object.defineProperty(window,'sessionStorage',{get(){throw new Error('Storage unavailable');}}));
 await page.goto('/?webgl=0#events');await page.locator('#games-shortcut').click();
 await expect(page.locator('.game-floating-nav [data-game-return]')).toHaveAttribute('href','#events');
 await page.locator('.game-floating-nav [data-game-return]').click();await expect(page).toHaveURL(/#events$/);
});
