import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const originalSudoku=JSON.parse(await readFile('src/trivia/sudoku.json','utf8'));
const originalCrossword=JSON.parse(await readFile('src/trivia/crossword.json','utf8'));

test('practice shelf resumes boards and keeps completed pages separate for each person',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/?webgl=0#games/crossword');
 await expect(page.locator('.calendar-day')).toHaveCount(10);await expect(page.locator('.puzzle-grid')).toBeVisible();
 const first=page.locator('.puzzle-cell').first();await first.click();await page.keyboard.type('A');
 await page.locator('[data-archive-entry="starter-2"]').click();await expect(page.locator('[data-archive-entry="starter-2"]')).toHaveAttribute('aria-pressed','true');
 await page.locator('[data-archive-entry="starter-1"]').click();await expect(page.locator('.cell-value').first()).toHaveText('A');
 await page.reload();await expect(page.locator('.cell-value').first()).toHaveText('A');
 const q=originalCrossword[0];for(let i=0;i<q.answer.length;i++)if(q.answer[i]!=='#'){await page.locator(`[data-cell="${i}"]`).click();await page.keyboard.type(q.answer[i]);}
 await page.getByRole('button',{name:'Submit',exact:false}).click();await expect(page.locator('[data-archive-entry="starter-1"]')).toHaveClass(/is-complete/);
 await page.reload();await expect(page.locator('[data-archive-entry="starter-1"]')).toHaveClass(/is-complete/);
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('#settings-person').selectOption('rina');await page.getByRole('button',{name:'Close settings',exact:true}).click();
 await expect(page.locator('[data-archive-entry="starter-1"]')).not.toHaveClass(/is-complete/);
 await expect(page.locator('#trivia-player')).toHaveCount(0);
});
test('Sudoku notes, undo, correction and completion work on a phone',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/?webgl=0#games/sudoku');const q=originalSudoku[0],cell=q.grid.givens.indexOf(' ');
 await expect(page.locator('.puzzle-cell')).toHaveCount(81);await page.locator(`[data-cell="${cell}"]`).click();await page.getByRole('button',{name:'Pencil notes'}).click();await page.keyboard.press('2');
 await expect(page.locator(`[data-cell="${cell}"] .cell-notes`)).toHaveText('2');await page.getByRole('button',{name:'Pencil notes'}).click();await page.locator(`[data-cell="${cell}"]`).click();await page.keyboard.press('3');
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.locator(`[data-cell="${cell}"] .cell-notes`)).toHaveText('2');
 await page.getByRole('button',{name:'Submit',exact:false}).click();await expect(page.locator('.trivia-status')).toContainText('not quite right');
 for(let i=0;i<81;i++)if(q.grid.givens[i]===' '){await page.locator(`[data-cell="${i}"]`).click();await page.keyboard.press(q.answer[i]);}
 await page.getByRole('button',{name:'Submit',exact:false}).click();await expect(page.locator('[data-archive-entry="starter-1"]')).toHaveClass(/is-complete/);
});
test('new comparisons show the reference measurement and keep its scale fixed while guessing',async({page})=>{
 await page.goto('/?webgl=0#games/how-much-ish');await expect(page.locator('.size-caption')).toContainText('Golden Retriever');await expect(page.locator('.size-caption')).toContainText('Volkswagen campervan');
 await expect(page.locator('.size-caption')).toContainText('2.04 m');await expect(page.locator('.size-caption')).not.toContainText('1.31 m');await expect(page.locator('.scale-precision')).toHaveCount(0);
 const reference=page.locator('.reference > svg'),target=page.getByRole('slider'),before=await reference.boundingBox();await target.focus();await page.keyboard.press('End');expect((await reference.boundingBox())!.width).toBe(before!.width);await page.keyboard.press('Home');expect((await reference.boundingBox())!.width).toBe(before!.width);
 const links=page.locator('.game-floating-nav>a');await expect(links.nth(0)).toHaveAttribute('href','#games');await expect(links.nth(1)).toHaveAttribute('data-game-return','');
});
test('city review labels and population work without the Explore control',async({page})=>{
 await page.goto('/?webgl=0#games/geography/review');await expect(page.locator('#geo-review-controls')).toBeVisible();
 await expect(page.getByText('Explore',{exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Cities',exact:true}).click();
 await page.getByRole('searchbox',{name:'Find a place'}).fill('Warsaw');await page.locator('#geo-review-results button').first().click();
 await expect(page.locator('#geo-country-card')).toContainText('Warsaw');await expect(page.locator('.atlas-population')).toContainText('people');
 await expect(page.locator('#geo-map')).toHaveAttribute('aria-label',/^Labeled city/);
});
test('trail practice has a personal calendar and resumes its selected board',async({page})=>{
 await page.goto('/?webgl=0#games/geography');await page.getByRole('button',{name:'Trail archive'}).click();await expect(page.locator('#geo-trail-calendar .calendar-day')).toHaveCount(10);
 await page.locator('#geo-trail-calendar [data-archive-entry="starter-3"]').click();await expect(page.locator('#geo-trail-calendar [data-archive-entry="starter-3"]')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('#geo-route-panel')).toBeVisible();await page.reload();await expect(page.locator('#geo-trail-calendar [data-archive-entry="starter-3"]')).toHaveAttribute('aria-pressed','true');
});
test('unfinished daily shortcut skips completed games and starts an actual daily board',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('household-person','rohil'));await page.route('**/rest/v1/rpc/utilities_game_daily_status',route=>route.fulfill({json:{day:new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),games:[{game:'geography',complete:true},{game:'sudoku',complete:false},{game:'crossword',complete:true}]}}));
 await page.goto('/?webgl=0#games');await page.locator('.daily-run-shortcut').click();await expect(page).toHaveURL(/#games\/sudoku\/daily$/);await expect(page.locator('.puzzle-grid')).toBeVisible();await expect(page.locator('[data-mode=daily]')).toHaveAttribute('aria-pressed','true');
});
test('the earlier local practice board survives the archive upgrade',async({page})=>{
 const bank=JSON.parse(await readFile('src/trivia/odd-one-out.json','utf8'));
 await page.addInitScript(bank=>{localStorage.setItem('household-trivia-v2:guest:odd-one-out:practice',JSON.stringify({id:'old-practice-1',game:'odd-one-out',player:'guest',day:'practice',questions:bank.slice(5,10),answers:[],hints:{},score:0,complete:false}));localStorage.setItem('household-trivia-v2:guest:odd-one-out:old-practice-1:0:draft',JSON.stringify(bank[5].options[1]));},bank);
 await page.goto('/?webgl=0#games/odd-one-out');await page.locator('[data-archive-entry=legacy]').click();await expect(page.locator('[data-archive-entry=legacy]')).toHaveAttribute('aria-pressed','true');await expect(page.locator('.trivia-choice[aria-pressed=true]')).toContainText(bank[5].options[1]);
 await page.locator('[data-archive-entry=starter-1]').click();await page.reload();await page.locator('[data-archive-entry=legacy]').click();await expect(page.locator('.trivia-choice[aria-pressed=true]')).toContainText(bank[5].options[1]);
});
test('standings show four proportional bars, Bitmoji and tied crowns',async({page})=>{
 await page.route('**/rest/v1/rpc/utilities_trivia_scores',route=>route.fulfill({json:[{player:'michal',score:900,rank:1},{player:'rina',score:900,rank:1},{player:'ohm',score:500,rank:3},{player:'rohil',score:200,rank:4}]}));
 await page.setViewportSize({width:390,height:844});await page.goto('/?webgl=0#games/crossword/scores');await expect(page.locator('.podium-person .avatar')).toHaveCount(4);await expect(page.locator('.podium-crown')).toHaveCount(2);
 const heights=await page.locator('.podium-plinth').evaluateAll(bars=>bars.map(b=>b.getBoundingClientRect().height));expect(heights[0]).toBe(heights[1]);expect(heights[1]).toBeGreaterThan(heights[2]);expect(heights[2]).toBeGreaterThan(heights[3]);await expect(page.locator('.trivia-ranks')).toBeHidden();
});
test('starting another practice trail advances beyond the completed calendar entry',async({page})=>{
 await page.goto('/?webgl=0#games/geography');await page.getByRole('button',{name:'Trail archive'}).click();await page.locator('.geo-route-rules summary').click();await page.locator('#geo-route-give-up').click();
 await expect(page.locator('[data-archive-entry=starter-1]')).toHaveClass(/is-complete/);await page.locator('#geo-play-again').click();await page.locator('#geo-new-round').click();await expect(page.locator('[data-archive-entry=starter-2]')).toHaveAttribute('aria-pressed','true');await expect(page.locator('#geo-result')).toBeHidden();
});
test('selecting an archive entry centers it across loading, editing and reload',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/?webgl=0#games/crossword');
 const tile=page.locator('[data-archive-entry=starter-6]');await tile.click();await expect(tile).toHaveAttribute('aria-pressed','true');
 const centered=()=>page.locator('.calendar-stack:visible').evaluate(el=>{const selected=el.querySelector('[aria-pressed=true]')!.getBoundingClientRect(),box=el.getBoundingClientRect();return Math.abs(selected.x+selected.width/2-box.x-box.width/2);});
 await expect.poll(centered).toBeLessThan(5);await page.locator('.puzzle-cell').first().click();await page.keyboard.type('A');await page.reload();await expect.poll(centered).toBeLessThan(5);
 await page.goto('/?webgl=0#games/geography');await page.getByRole('button',{name:'Trail archive'}).click();await page.locator('#geo-trail-calendar [data-archive-entry=starter-6]').click();await expect.poll(centered).toBeLessThan(5);
});
test('crossword automatically moves into the next unfinished row and timer survives reload',async({page})=>{
 await page.clock.install();await page.goto('/?webgl=0#games/crossword');const q=originalCrossword[0],first=q.grid.clues.find((c:any)=>c.direction==='across'),next=q.grid.clues.find((c:any)=>c.direction==='across'&&c.number>first.number);
 const index=first.row*q.grid.size+first.col;await page.locator('.crossword-clues summary').click();await page.locator(`[data-clue-number="${first.number}"][data-direction=across]`).click();await page.keyboard.type(q.answer.slice(index,index+first.length));
 await expect(page.locator(`[data-cell="${next.row*q.grid.size+next.col}"]`)).toBeFocused();await page.clock.fastForward(65000);await expect(page.locator('[data-puzzle-clock]')).toHaveText('1:05');
 await page.reload();await expect(page.locator('[data-puzzle-clock]')).toHaveText('1:05');
});
