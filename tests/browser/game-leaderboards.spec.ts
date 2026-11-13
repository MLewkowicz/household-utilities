import {test,expect,type Page} from '@playwright/test';
import {GAMES} from '../../src/game-registry';
const games=GAMES.filter(g=>g.id!=='geography');
async function mockScores(page:Page){
 await page.route('**/utilities_trivia_scores',route=>{const {game,period}=route.request().postDataJSON().p,index=games.findIndex(g=>g.id===game);return route.fulfill({json:['michal','rina','ohm','rajan'].map((player,i)=>({player,score:(period==='week'?4000:900)-index*20-i*10,rank:i+1,days:4,elapsed_ms:(i+1)*65000}))});});
 await page.route('**/utilities_geography_scores',route=>route.fulfill({json:[{id:'name-world',player:'michal',region:'World',scope:'countries',challenge:'name',correct:3,total:195,mistakes:0,elapsed_ms:65000,score:300,finished_at:'2026-11-01'},{id:'find-europe',player:'rina',region:'Europe',scope:'expanded',challenge:'find',correct:2,total:50,mistakes:0,elapsed_ms:75000,score:200,finished_at:'2026-11-01'}]}));
 await page.route('**/utilities_geography_route_scores',route=>route.fulfill({json:[{player:'ohm',score:1000,rank:1,won:true,steps:5,mistakes:0}]}));
}
test('one shared screen keeps scores separate, filters Geography and preserves choices',async({page})=>{
 await mockScores(page);const writes:string[]=[];page.on('request',r=>{if(/utilities_(trivia_start|trivia_action|geography_route_start|archive_save|save_geography_score)$/.test(r.url()))writes.push(r.url());});
 await page.goto('/?webgl=0#games');await page.locator('#orbit-scores').click();await expect(page.locator('.leaderboard-card')).toHaveCount(8);
 await expect(page.locator('[data-standings=odd-one-out]')).toContainText('900');await expect(page.locator('[data-standings=crossword]')).toContainText('780');await expect(page.locator('[data-standings=sudoku] .podium-time').first()).toHaveText('1:05');
 await page.locator('#leaderboards-period').selectOption('week');await expect(page.locator('[data-standings=odd-one-out]')).toContainText('4,000');await expect(page.locator('[data-standings=crossword]')).toContainText('3,880');await expect(page.locator('#geo-score-list')).toContainText('300');
 await page.locator('#geo-score-challenge').selectOption('find');await page.locator('#geo-score-region').selectOption('Europe');await page.locator('#geo-score-scope').selectOption('expanded');await expect(page.locator('#geo-score-list')).toContainText('Rina');await expect(page.locator('#geo-score-list')).toContainText('200');
 await page.locator('#geo-score-challenge').selectOption('route');await expect(page.locator('#geo-score-region')).toBeHidden();await expect(page.locator('#geo-score-selection')).toHaveText('Border Trail · today');await expect(page.locator('#geo-score-list')).toContainText('1,000');
 await page.reload();await expect(page.locator('#leaderboards-period')).toHaveValue('week');await expect(page.locator('#geo-score-challenge')).toHaveValue('route');await page.locator('#geo-score-challenge').selectOption('find');await expect(page.locator('#geo-score-region')).toHaveValue('Europe');await expect(page.locator('#geo-score-scope')).toHaveValue('expanded');await expect(page.locator('#geo-score-list')).toContainText('Rina');expect(writes).toEqual([]);
});
test('failed and late score requests cannot replace another game or newer period',async({page})=>{
 await mockScores(page);let release=()=>{},failed=true;const held=new Promise<void>(resolve=>release=resolve);
 await page.route('**/utilities_trivia_scores',async(route)=>{const {game,period}=route.request().postDataJSON().p;if(game==='sudoku'&&failed)return route.fulfill({status:503,json:{message:'offline'}});if(game==='crossword'&&period==='day'){await held;return route.fulfill({json:[{player:'michal',rank:1,score:99,days:1}]});}return route.fallback();});
 await page.goto('/?webgl=0#games/leaderboards');await expect(page.locator('[data-standings=sudoku]')).toContainText('couldn’t load');await expect(page.locator('[data-standings=odd-one-out]')).toContainText('900');failed=false;await page.locator('[data-refresh-board=sudoku]').click();await expect(page.locator('[data-standings=sudoku]')).toContainText('800');
 await page.locator('#leaderboards-period').selectOption('week');await expect(page.locator('[data-standings=crossword]')).toContainText('3,880');release();await expect(page.locator('[data-standings=crossword]')).not.toContainText('99 pts');
 await page.getByRole('link',{name:'Play Common Ground'}).click();await expect(page.locator('.word-grid')).toBeVisible();await expect(page.locator('#trivia-page a[href*="scores"],#trivia-page .trivia-toolbar a[href*="leaderboards"]')).toHaveCount(0);
});
test('legacy links focus shared standings and four-player podiums fit a phone',async({page})=>{
 await page.setViewportSize({width:360,height:800});await mockScores(page);await page.goto('/?webgl=0#games/crossword/scores');await expect(page.locator('#leaderboards-title')).toHaveText('Leaderboards');await expect(page.locator('#leaderboard-crossword')).toBeFocused();
 await expect(page.locator('[data-standings=crossword] .podium-person')).toHaveCount(4);expect(await page.locator('#leaderboards-page').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 await expect(page.locator('#leaderboard-crossword h2')).toBeInViewport();await page.screenshot({path:'.local/leaderboards-phone.png',fullPage:true});await page.locator('.leaderboards-theme').click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');expect(await page.locator('.leaderboards-theme svg:visible').evaluate(e=>e.getBoundingClientRect().width)).toBe(20);
 await page.evaluate(()=>location.hash='#games/scores');await expect(page.locator('#leaderboard-geography')).toBeFocused();await expect(page.locator('#geo-surface')).toHaveCount(0);
 await page.evaluate(()=>location.hash='#games/geography');await expect(page.locator('#geo-settings')).toBeVisible();await expect(page.locator('#geography-page a[href*="scores"],#geography-page a[href*="leaderboards"]')).toHaveCount(0);
});
