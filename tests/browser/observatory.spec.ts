import {test,expect} from '@playwright/test';
test('background refresh preserves an active game input and its draft',async({page})=>{
 await page.clock.install();await page.goto('/?webgl=0#games/passport-puzzle');
 await page.getByRole('button',{name:'Practice',exact:true}).click();await page.getByRole('button',{name:'Start practice'}).click();
 const input=page.locator('#trivia-guess');await input.fill('Poland');await input.focus();
 await page.clock.fastForward(46000);await expect(page.locator('#main')).toHaveAttribute('aria-busy','false');
 await expect(input).toBeFocused();await expect(input).toHaveValue('Poland');await expect(page.locator('.passport-book')).toBeVisible();
});
test('planet selection uses rotation, keyboard and links without loading the globe',async({page})=>{
 const requests:string[]=[];page.on('request',r=>requests.push(r.url()));await page.goto('/?webgl=0#games');
 await expect(page.locator('[data-orbit-game]')).toHaveCount(6);expect(requests.some(r=>r.includes('/globe/'))).toBe(false);await expect(page.locator('#geo-map')).toHaveCount(0);
 const scene=page.locator('#observatory-scene');await scene.focus();await page.keyboard.press('ArrowRight');await expect(page.locator('#orbit-game-title')).toHaveText('Odd One Out');
 await page.getByRole('button',{name:'Previous planet'}).click();await expect(scene).toHaveAttribute('data-selected','geography');
 const box=(await scene.boundingBox())!;await page.mouse.move(box.x+box.width*.6,box.y+box.height*.7);await page.mouse.down();await page.mouse.move(box.x+box.width*.6-150,box.y+box.height*.7,{steps:8});await page.mouse.up();await expect(scene).toHaveAttribute('data-selected','odd-one-out');
 await page.getByRole('button',{name:'How Much-ish?'}).click();await page.locator('#geo-launch').click();await expect(page).toHaveURL(/#games\/how-much-ish$/);
 await page.getByRole('button',{name:'Practice',exact:true}).click();await page.getByRole('button',{name:'Start practice'}).click();await expect(page.locator('.scale-stage')).toBeVisible();await page.locator('#scale-number').fill('2');await expect(page.locator('#ratio-value')).toHaveText('2.00×');await page.getByRole('button',{name:'Submit'}).click();await expect(page.locator('.scale-correct')).toBeVisible();
 await page.getByRole('link',{name:'Games',exact:true}).click();await page.getByRole('button',{name:'Geography',exact:true}).click();await page.locator('#geo-launch').click();await expect(page.locator('#geo-map')).toBeVisible();
});
test('monument renderer selects a planet with reduced motion and survives context loss',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/#games');const scene=page.locator('#observatory-scene');await expect(scene).toHaveAttribute('data-ready','true');await expect(scene.locator('canvas')).toBeVisible();await expect(scene).toHaveAttribute('data-sky','3d');await expect(page.locator('.observatory-sky')).toBeHidden();const sky=await page.evaluate(()=>(window as any).__observatoryDiagnostics().cosmos);expect(sky.stars).toBe(260);expect(new Set(sky.depths).size).toBe(3);expect(sky.parallax).toEqual([0,0]);
 await page.getByRole('button',{name:'Common Ground',exact:true}).click();await expect(scene).toHaveAttribute('data-selected','clue-cascade');await expect(page.locator('#geo-launch')).toHaveAttribute('href','#games/clue-cascade');
 await scene.locator('canvas').evaluate(c=>c.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));await expect(page.locator('.observatory-fallback')).toBeVisible();await expect(page.locator('.observatory-sky')).toBeVisible();await expect.poll(()=>page.locator('.observatory-sky img').evaluate((image:HTMLImageElement)=>image.naturalWidth)).toBeGreaterThan(0);await page.getByRole('button',{name:'Next planet'}).click();await expect(page.locator('#orbit-game-title')).toHaveText('Before or After?');
});
test('all five games have distinct boards and review a practice question',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));for(const game of ['odd-one-out','passport-puzzle','clue-cascade','before-or-after','how-much-ish']){
 await page.goto('/?webgl=0#games/'+game);await page.getByRole('button',{name:'Practice',exact:true}).click();await page.getByRole('button',{name:'Start practice'}).click();
 if(game==='odd-one-out'){await expect(page.locator('.trivia-choice')).toHaveCount(4);await page.locator('.trivia-choice').first().click();}
 if(game==='passport-puzzle'){await expect(page.getByRole('img',{name:'Country outline'})).toBeVisible();await page.getByRole('button',{name:/Reveal clue/}).click();await expect(page.locator('.passport-evidence li')).toHaveCount(2);await page.locator('#trivia-guess').fill('test');}
 if(game==='clue-cascade'){await expect(page.locator('.word-tile')).toHaveCount(16);const a=await page.evaluate(()=>JSON.parse(localStorage.getItem('household-trivia-v3:guest:clue-cascade:practice')!));for(const g of a.questions[0].groups){for(const word of g.words)await page.getByRole('button',{name:word,exact:true}).click();await page.getByRole('button',{name:'Submit group',exact:true}).click();}await expect(page.locator('.trivia-feedback')).toContainText('All four');continue;}
 if(game==='before-or-after'){await expect(page.locator('.timeline-art svg')).toHaveCount(5);await expect(page.locator('.timeline-date')).toHaveCount(0);await page.locator('.timeline-tile').first().focus();await page.keyboard.press('Space');await page.keyboard.press('ArrowRight');await page.keyboard.press('Space');}
 await page.getByRole('button',{name:'Submit'}).click();await expect(page.locator('.trivia-feedback')).toBeVisible();
 if(game==='before-or-after')await expect(page.locator('.timeline-date')).toHaveCount(5);
 }expect(errors).toEqual([]);
});
test('daily answers resume after reload and silhouettes fit a phone',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.addInitScript(()=>localStorage.setItem('household-person','rohil'));await page.goto('/?webgl=0#games/odd-one-out');await page.getByRole('button',{name:'Play daily'}).click();await page.locator('.trivia-choice').first().click();await page.getByRole('button',{name:'Submit'}).click();await expect(page.locator('.trivia-feedback')).toBeVisible();const result=await page.locator('.trivia-feedback').textContent();await page.reload();await page.getByRole('button',{name:'Play daily'}).click();await expect(page.locator('.trivia-feedback')).toHaveText(result!);
 await page.goto('/?webgl=0#games/how-much-ish');await page.getByRole('button',{name:'Practice',exact:true}).click();await page.getByRole('button',{name:'Start practice'}).click();await page.locator('#scale-number').fill('20');expect(await page.locator('#trivia-page').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 await page.setViewportSize({width:1440,height:1000});await page.locator('#scale-number').fill('1');await page.setViewportSize({width:360,height:800});await expect.poll(()=>page.locator('.scale-stage').evaluate(stage=>[...stage.querySelectorAll('.scale-object > svg')].every(svg=>{const a=svg.getBoundingClientRect(),b=stage.getBoundingClientRect();return a.left>=b.left&&a.right<=b.right&&a.top>=b.top&&a.bottom<=b.bottom;}))).toBe(true);
});
test('practice draws unseen puzzles after a completed round',async({page})=>{
 await page.goto('/?webgl=0#games/odd-one-out');await page.getByRole('button',{name:'Practice',exact:true}).click();await page.getByRole('button',{name:'Start practice'}).click();const questions:string[]=[];
 for(let i=0;i<5;i++){questions.push(await page.locator('.trivia-choices').innerText());await page.locator('.trivia-choice').first().click();await page.getByRole('button',{name:'Submit'}).click();await page.getByRole('button',{name:i===4?'See result':'Next question'}).click();}
 await page.getByRole('button',{name:'Practice again'}).click();await page.getByRole('button',{name:'Start practice'}).click();expect(questions).not.toContain(await page.locator('.trivia-choices').innerText());
});
test('leaving a slow leaderboard cannot overwrite or break the game board',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 let release=()=>{};const held=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/utilities_trivia_scores',async route=>{await held;await route.continue();});
 await page.goto('/?webgl=0#games/clue-cascade');await page.getByRole('link',{name:'Scores'}).click();await expect(page.locator('#trivia-standings')).toContainText('Loading');
 await page.getByRole('link',{name:'Back to Common Ground'}).click();await page.getByRole('button',{name:'Practice',exact:true}).click();await page.getByRole('button',{name:'Start practice'}).click();release();
 await expect(page.locator('.word-grid')).toBeVisible();await page.waitForTimeout(300);expect(errors).toEqual([]);
});

test('Common Ground keeps daily progress after reload and locks after four misses',async({page})=>{
 await page.setViewportSize({width:360,height:800});await page.addInitScript(()=>localStorage.setItem('household-person','ohm'));await page.goto('/?webgl=0#games/clue-cascade');await page.getByRole('button',{name:'Play daily'}).click();
 const {readFileSync}=await import('node:fs');const packs=JSON.parse(readFileSync('scripts/trivia/daily-packs-v3.json','utf8'));
 const a=await page.evaluate(async()=>{const config=(window as any).UTILITIES_CONFIG;return fetch(config.url+'/rest/v1/rpc/utilities_trivia_start',{method:'POST',headers:{'Content-Type':'application/json',apikey:config.key},body:JSON.stringify({p:{game:'clue-cascade',player:'ohm'}})}).then(r=>r.json());});
 const q=packs.find(p=>p.game==='clue-cascade'&&p.slot===a.slot).questions[0];
 const select=async(words:string[])=>{for(const w of words)await page.getByRole('button',{name:w,exact:true}).click();await page.getByRole('button',{name:'Submit group',exact:true}).click();};
 await select(q.groups[0].words);await expect(page.locator('.group-solved .group-row')).toHaveCount(1);await expect(page.locator('.word-tile')).toHaveCount(12);
 await page.reload();await page.getByRole('button',{name:'Play daily'}).click();await expect(page.locator('.group-solved')).toContainText(q.groups[0].label);await expect(page.locator('.trivia-progress')).toContainText('250 pts');
 for(let i=0;i<4;i++)await select([q.groups[1].words[i],q.groups[1].words[(i+1)%4],q.groups[2].words[i],q.groups[3].words[i]]);
 await expect(page.locator('.word-tile')).toHaveCount(0);await expect(page.locator('.group-solved .group-row')).toHaveCount(4);await expect(page.locator('.group-missed')).toHaveCount(3);await expect(page.locator('.trivia-feedback')).toContainText('250 / 1,000');expect(await page.locator('#trivia-page').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 await page.getByRole('button',{name:'See result'}).click();await expect(page.locator('.game-result h2')).toHaveText('250 / 1,000');
});
test('measured profiles preserve equal pixels per metre on both axes',async({page})=>{
 await page.goto('/?webgl=0#games/how-much-ish');await page.getByRole('button',{name:'Practice',exact:true}).click();await page.getByRole('button',{name:'Start practice'}).click();await page.locator('#scale-number').fill('2');
 const spans=await page.locator('.scale-object > svg').evaluateAll(svgs=>svgs.map(svg=>{const g=svg.querySelector<SVGGraphicsElement>('.profile-shape')!,b=g.getBBox(),m=g.getScreenCTM()!;return (svg.getAttribute('data-axis')==='height'?b.height:b.width)*m.a;}));expect(spans[1]/spans[0]).toBeCloseTo(2,4);
 await page.getByRole('button',{name:'Submit',exact:false}).click();await page.getByText('Measurements & artwork',{exact:true}).click();await expect(page.locator('.size-credits a')).not.toHaveCount(0);
});

test('celestial parallax pauses with the hub and reduced motion stops the animation loop',async({page})=>{
 await page.goto('/#games');await expect(page.locator('#observatory-scene')).toHaveAttribute('data-sky','3d');await page.mouse.move(30,300);await expect.poll(()=>page.evaluate(()=>(window as any).__observatoryDiagnostics().cosmos.parallax[0])).toBeLessThan(-.1);
 await page.getByRole('button',{name:'Odd One Out',exact:true}).click();await page.locator('#geo-launch').click();await expect.poll(()=>page.evaluate(()=>(window as any).__observatoryDiagnostics().active)).toBe(false);const frames=await page.evaluate(()=>(window as any).__observatoryDiagnostics().frames);await page.waitForTimeout(300);expect(await page.evaluate(()=>(window as any).__observatoryDiagnostics().frames)).toBe(frames);
 await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('link',{name:'Games',exact:true}).click();await expect(page.locator('#observatory-scene')).toBeVisible();await expect.poll(async()=>{const n=await page.evaluate(()=>(window as any).__observatoryDiagnostics().frames);await page.waitForTimeout(200);return await page.evaluate(n=>(window as any).__observatoryDiagnostics().frames-n,n);}).toBe(0);
});
