import {test,expect} from '@playwright/test';
import {setTheme} from './settings';

for(const width of [390,1280])test(`header theme control includes Time of day and persists it at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});await page.emulateMedia({colorScheme:'light',reducedMotion:'reduce'});
 await page.clock.setFixedTime(new Date('2026-11-02T23:00:00Z'));await page.goto('/?webgl=0#events');
 const toggle=page.locator('#theme-toggle'),root=page.locator('html');
 await toggle.click();await expect(root).toHaveAttribute('data-theme-preference','dark');await expect(root).toHaveAttribute('data-house-night','1');
 await expect(toggle).toHaveAccessibleName('Color theme: Dark. Switch to Time of day');
 await toggle.click();await expect(root).toHaveAttribute('data-theme-preference','daylight');await expect(root).toHaveAttribute('data-house-night','0.5');
 await expect(toggle.locator('.theme-clock')).toBeVisible();await expect(toggle.locator('.theme-sun')).toBeHidden();await expect(toggle.locator('.theme-moon')).toBeHidden();
 await expect(page.locator('#settings-dialog')).toBeHidden();expect(await page.evaluate(()=>localStorage.getItem('household-theme'))).toBe('daylight');
 await page.reload();await expect(root).toHaveAttribute('data-theme-preference','daylight');await expect(root).toHaveAttribute('data-house-night','0.5');
 await toggle.click();await expect(root).toHaveAttribute('data-theme-preference','light');await expect(root).toHaveAttribute('data-house-night','0');
 await setTheme(page,'system');await page.emulateMedia({colorScheme:'dark'});await expect(root).toHaveAttribute('data-theme','dark');
 await toggle.click();await expect(root).toHaveAttribute('data-theme-preference','light');
});
