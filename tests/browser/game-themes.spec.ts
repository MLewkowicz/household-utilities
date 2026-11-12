import {test,expect} from '@playwright/test';

test('game theme changes preserve a puzzle, persist, and use the household preference',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({colorScheme:'light',reducedMotion:'reduce'});
 await page.clock.setFixedTime(new Date('2026-11-11T17:00:00Z'));
 await page.goto('/?webgl=0#games/clue-cascade');await page.getByRole('button',{name:'Practice',exact:true}).click();await page.getByRole('button',{name:'Start practice'}).click();
 const word=await page.locator('.word-tile').first().textContent();await page.locator('.word-tile').first().click();
 const toggle=page.locator('#trivia-page [data-theme-toggle]');await toggle.click();
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await expect(toggle).toHaveAccessibleName('Color theme: Dark. Switch to Time of day');
 await expect(page.getByRole('button',{name:word!,exact:true})).toHaveAttribute('aria-pressed','true');
 expect(await page.evaluate(()=>localStorage.getItem('household-theme'))).toBe('dark');
 await page.reload();await page.getByRole('button',{name:'Practice',exact:true}).click();await page.getByRole('button',{name:'Start practice'}).click();
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await expect(page.getByRole('button',{name:word!,exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('link',{name:/^Scores/}).click();await toggle.click();
 await expect(page.locator('html')).toHaveAttribute('data-theme','light');await expect(page.locator('html')).toHaveAttribute('data-theme-preference','daylight');
 await expect(toggle).toHaveAccessibleName('Color theme: Time of day. Switch to Light');await expect(toggle.locator('.theme-clock')).toBeVisible();
 await page.getByRole('link',{name:'Back to To-dos',exact:true}).click();
 await expect(page.locator('#theme-toggle')).toHaveAccessibleName('Color theme: Time of day. Switch to Light');
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('#theme-select').selectOption('system');await page.getByRole('button',{name:'Close settings',exact:true}).click();
 await page.goto('/?webgl=0#games/before-or-after');await page.emulateMedia({colorScheme:'dark'});
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await expect(toggle).toHaveAccessibleName('Color theme: System. Switch to Light');
 await page.emulateMedia({colorScheme:'light'});await expect(page.locator('html')).toHaveAttribute('data-theme','light');await expect(toggle).toHaveAccessibleName('Color theme: System. Switch to Dark');
});
