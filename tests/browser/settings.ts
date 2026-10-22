import {expect,type Page} from '@playwright/test';

export async function openSettings(page:Page){
 await page.getByRole('button',{name:'Settings',exact:true}).click();
 await expect(page.locator('#settings-dialog')).toBeVisible();
}
export async function setTheme(page:Page,theme:string){
 await openSettings(page);
 await page.getByLabel('Color theme',{exact:true}).selectOption(theme);
 await page.getByRole('button',{name:'Close settings',exact:true}).click();
}
export async function openNotifications(page:Page){
 await openSettings(page);await page.locator('#notifications').click();
 await expect(page.locator('#settings-dialog')).toBeHidden();
 await expect(page.locator('#push-dialog')).toBeVisible();
}
export async function refreshSection(page:Page){
 await openSettings(page);await page.getByRole('button',{name:'Refresh',exact:true}).click();
 await expect(page.locator('#settings-dialog')).toBeHidden();
}
