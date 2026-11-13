import {test,expect} from '@playwright/test';
for(const game of ['sudoku','crossword']){
 test(`${game} practice pauses between games, scores and reloads`,async({page})=>{
  await page.clock.install();await page.goto(`/?webgl=0#games/${game}`);const timer=page.locator('[data-puzzle-clock]');await expect(timer).toHaveText('0:00');
  await page.clock.fastForward(12000);await expect(timer).toHaveText('0:12');
  await page.evaluate(()=>location.hash='#games/odd-one-out');await expect(page.locator('.trivia-choice')).toHaveCount(4);await page.clock.fastForward(600000);
  await page.evaluate(game=>location.hash='#games/'+game,game);await expect(timer).toHaveText('0:12');
  await page.clock.fastForward(3000);await expect(timer).toHaveText('0:15');await page.reload();await expect(timer).toHaveText('0:15');
  await page.evaluate(game=>location.hash='#games/'+game+'/scores',game);await expect(page.locator('.scores-title')).toBeVisible();await page.clock.fastForward(300000);
  await page.evaluate(game=>location.hash='#games/'+game,game);await expect(timer).toHaveText('0:15');await page.clock.fastForward(2000);await expect(timer).toHaveText('0:17');
 });
 test(`${game} daily pauses its server clock and resumes without counting time away`,async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('household-person','rina'));
  const resumed=page.waitForResponse(r=>r.url().endsWith('/utilities_puzzle_clock')&&r.request().postDataJSON().p.running===true);
  await page.goto(`/?webgl=0#games/${game}/daily`);const initial=await (await resumed).json();expect(initial.active_since).toBeTruthy();await expect.poll(async()=>{const [m,s]=(await page.locator('[data-puzzle-clock]').innerText()).split(':').map(Number);return (m*60+s)*1000;},{timeout:5000}).toBeGreaterThanOrEqual(Math.ceil(initial.active_ms/1000)*1000+1000);
  const paused=page.waitForResponse(r=>r.url().endsWith('/utilities_puzzle_clock')&&r.request().postDataJSON().p.running===false);
  await page.evaluate(()=>location.hash='#games/odd-one-out');const stopped=await (await paused).json();expect(stopped.active_since).toBeNull();expect(stopped.active_ms).toBeGreaterThanOrEqual(initial.active_ms+1000);
  // The server's frozen value is checked after the client has left the board.
  await expect(page.locator('.trivia-choice')).toHaveCount(4);
  const state=await page.request.post('/rest/v1/rpc/utilities_trivia_start',{headers:{apikey:'local-public'},data:{p:{game,player:'rina',clock_version:1}}});const saved=await state.json();expect(saved.active_since).toBeNull();expect(saved.active_ms).toBe(stopped.active_ms);
  const returned=page.waitForResponse(r=>r.url().endsWith('/utilities_puzzle_clock')&&r.request().postDataJSON().p.running===true);
  await page.evaluate(game=>location.hash='#games/'+game+'/daily',game);const continued=await (await returned).json();expect(continued.active_ms).toBe(stopped.active_ms);expect(continued.active_since).toBeTruthy();
  const finalPause=page.waitForResponse(r=>r.url().endsWith('/utilities_puzzle_clock')&&r.request().postDataJSON().p.running===false);await page.evaluate(()=>location.hash='#games');await finalPause;
 });
}
