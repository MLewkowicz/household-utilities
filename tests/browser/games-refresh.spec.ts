import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const sudoku=JSON.parse(readFileSync('src/trivia/sudoku.json','utf8'))[0];
test('clear Sudoku entries and notes together, then undo',async({page})=>{
 await page.goto('/?webgl=0#games/sudoku');const i=sudoku.grid.givens.indexOf(' '),j=sudoku.grid.givens.indexOf(' ',i+1);
 await page.locator(`[data-cell="${i}"]`).click();await page.keyboard.press('3');
 await page.locator(`[data-cell="${j}"]`).click();await page.getByRole('button',{name:'Pencil notes'}).click();await page.keyboard.press('2');
 await page.getByRole('button',{name:'Clear all',exact:true}).click();await expect(page.locator(`[data-cell="${i}"] .cell-value`)).toBeEmpty();await expect(page.locator(`[data-cell="${j}"] .cell-notes`)).toBeEmpty();
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.locator(`[data-cell="${i}"] .cell-value`)).toHaveText('3');await expect(page.locator(`[data-cell="${j}"] .cell-notes`)).toHaveText('2');
});
test('crossword on-screen backspace erases the preceding letter',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/?webgl=0#games/crossword');await page.locator('.puzzle-cell').first().click();await page.keyboard.press('A');await page.getByRole('button',{name:'Backspace',exact:true}).click();await expect(page.locator('.cell-value').first()).toBeEmpty();
});
test('Passport begins with outline only and charges for wrong guesses and hints',async({page})=>{
 await page.goto('/?webgl=0#games/passport-puzzle');await expect(page.locator('.passport-map svg')).toBeVisible();await expect(page.locator('.passport-evidence li')).toHaveCount(0);
 await page.locator('#trivia-guess').fill('wrong spelling');await page.getByRole('button',{name:'Submit',exact:false}).click();await expect(page.locator('.trivia-status')).toContainText('−50');await expect(page.locator('[data-size-total]')).toHaveText('-50');
 await page.locator('[data-clue]').click();await expect(page.locator('.passport-evidence li')).toHaveCount(1);await expect(page.locator('[data-size-total]')).toHaveText('-100');
 await page.reload();await expect(page.locator('[data-size-total]')).toHaveText('-100');await expect(page.locator('.passport-evidence li')).toHaveCount(1);
 await page.screenshot({path:'.local/passport-refresh.png'});
});
test('Capitals prompts for a country and advances after the typed capital',async({page})=>{
 await page.goto('/?webgl=0#games/geography');await page.locator('#geo-settings').click();await page.locator('#geo-mode').selectOption('capitals');await page.locator('#geo-new-region').selectOption('Europe');await page.locator('#geo-new-round').click();await expect(page.locator('#geo-answer')).toBeVisible();
 const prompt=await page.locator('#geo-selection').textContent();expect(prompt).toMatch(/of /);
 const countries=JSON.parse(readFileSync('src/geography-data.json','utf8')),capitals=JSON.parse(readFileSync('src/geography-capitals.json','utf8'));const country=countries.find(c=>prompt!.endsWith('of '+c.name));
 await page.locator('#geo-answer').fill(capitals[country.id].names[0]);await page.locator('#geo-check').click();await expect(page.locator('#geo-correct')).toHaveText('1');await expect(page.locator('#geo-selection')).not.toHaveText(prompt!);
 await page.reload();await expect(page.locator('#geo-mode option[value="capitals"]')).toHaveCount(1);await expect(page.locator('#geo-answer')).toHaveAttribute('placeholder','Capital city…');
});
test('historical and average scores expose working date and period controls',async({page})=>{
 await page.goto('/?webgl=0#games/odd-one-out/scores');await page.locator('#leaderboards-period').selectOption('all');await expect(page.locator('[data-standings="odd-one-out"]')).toHaveAttribute('aria-busy','false');await page.locator('#leaderboards-period').selectOption('date');await page.locator('#leaderboards-day').fill('2026-11-10');await expect(page.locator('[data-standings="odd-one-out"]')).toHaveAttribute('aria-busy','false');
 await page.goto('/?webgl=0#games/geography');await page.getByRole('button',{name:'Trail archive'}).click();await page.locator('#geo-trail-calendar [data-archive-entry="starter-2"]').click();await page.locator('#geo-answer').fill('Germany');await page.locator('#geo-check').click();await expect(page.locator('.route-stop')).toHaveCount(1);await expect(page.locator('.route-stop')).toContainText('Germany');await page.screenshot({path:'.local/border-trail-refresh.png'});
});
