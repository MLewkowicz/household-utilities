import {test,expect,type Page} from '@playwright/test';
import webpush from 'web-push';
const keys=webpush.generateVAPIDKeys();
async function mock(page:Page,platform='android',granted:boolean|'denied'=false){
 let device:any={registered:false};const mutations:any[]=[];
 await page.addInitScript(({platform,granted})=>{
  Object.defineProperty(navigator,'userAgent',{get:()=>platform==='iphone'?'iPhone OS 18_0':platform==='installed-iphone'?'iPhone OS 18_0':'Android Chrome'});
  Object.defineProperty(navigator,'standalone',{get:()=>platform==='installed-iphone'});
  let permission=granted==='denied'?'denied':granted?'granted':'default';
  Object.defineProperty(window,'Notification',{value:class{
   static get permission(){return permission;}
   static async requestPermission(){permission='granted';return permission;}
  }});
  Object.defineProperty(window,'PushManager',{value:class{}});
  const subscription={toJSON:()=>({endpoint:'https://fcm.googleapis.com/send/browser-test',keys:{p256dh:'a'.repeat(87),auth:'a'.repeat(22)}}),unsubscribe:async()=>true};
  const registration={pushManager:{getSubscription:async()=>null,subscribe:async()=>subscription}};
  Object.defineProperty(navigator,'serviceWorker',{value:{register:async()=>registration,ready:Promise.resolve(registration)}});
 },{platform,granted});
 await page.route('**/rpc/utilities_push_config',r=>r.fulfill({json:{enabled:true,public_key:keys.publicKey}}));
 await page.route('**/rpc/utilities_push_device',async route=>{
  const p=route.request().postDataJSON().p;mutations.push(p);
  if(p.action==='register')device={registered:true,enabled:true,member:p.member,categories:p.categories};
  if(p.action==='disable')device.enabled=false;
  await route.fulfill({json:device});
 });
 return mutations;
}
test('iPhone browser explains the required Home Screen installation',async({page})=>{
 await mock(page,'iphone');await page.setViewportSize({width:390,height:844});await page.goto('/#chores');
 await page.getByRole('button',{name:'Phone notifications',exact:true}).click();
 await expect(page.locator('#push-install')).toBeVisible();await expect(page.locator('#push-enable')).toBeDisabled();
 await expect(page.locator('#push-install')).toContainText('Add to Home Screen');
 expect(await page.locator('#push-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();
});
test('Android opts in directly, retains its person across dashboard switches, and can test or disable',async({page})=>{
 const mutations=await mock(page);await page.setViewportSize({width:320,height:800});await page.goto('/#chores');
 await page.getByRole('button',{name:'Phone notifications',exact:true}).click();
 await expect(page.locator('#push-enable')).toBeEnabled();await expect(page.locator('#push-install')).toBeHidden();
 await expect(page.locator('#push-platform-help')).toContainText('Android');
 await page.locator('#push-person').selectOption('michal');await page.locator('[name=push-category][value=bills]').uncheck();await page.locator('#push-enable').click();
 await expect(page.locator('#push-status')).toContainText('Receiving alerts for Michal');
 expect(mutations.find(p=>p.action==='register').categories).toEqual(['chores','notes']);
 await page.locator('#push-close').click();await page.locator('[data-chore-person=rina]').click();
 await page.getByRole('button',{name:'Phone notifications',exact:true}).click();await expect(page.locator('#push-person')).toHaveValue('michal');
 await page.locator('#push-test').click();await expect(page.locator('#push-message')).toContainText('Test queued');
 await page.locator('#push-disable').click();await expect(page.locator('#push-test')).toBeHidden();
 expect(mutations.filter(p=>p.action==='test')).toHaveLength(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
test('installed iPhone has an explicit opt-in and theme-aware settings',async({page})=>{
 await mock(page,'installed-iphone');await page.goto('/#chores');
 await page.getByLabel('Color theme').selectOption('dark');
 await page.getByRole('button',{name:'Phone notifications',exact:true}).click();
 await expect(page.locator('#push-install')).toBeHidden();await expect(page.locator('#push-enable')).toBeEnabled();
 await page.locator('#push-person').selectOption('ohm');await page.locator('#push-enable').click();
 await expect(page.locator('#push-status')).toContainText('Receiving alerts for Ohm');
 await page.locator('#push-close').click();await page.getByLabel('Color theme').selectOption('light');
 await page.getByRole('button',{name:'Phone notifications',exact:true}).click();await expect(page.locator('#push-status')).toContainText('Ohm');
});
test('unconfigured backend leaves ledgers usable',async({page})=>{
 await page.goto('/#chores');await page.getByRole('button',{name:'Phone notifications',exact:true}).click();
 await expect(page.locator('#push-status')).toContainText('awaiting household setup');await expect(page.locator('#push-enable')).toBeDisabled();
 await page.locator('#push-close').click();await page.getByRole('link',{name:'Bulletin',exact:true}).click();await expect(page.locator('#bulletin-status')).toHaveText('Shared notes · up to date');
});
test('denied permissions explain how to recover and never enroll a device',async({page})=>{
 const mutations=await mock(page,'android','denied');await page.goto('/#chores');
 await page.getByRole('button',{name:'Phone notifications',exact:true}).click();
 await expect(page.locator('#push-status')).toContainText('Notifications are blocked');
 await expect(page.locator('#push-enable')).toBeDisabled();expect(mutations).toHaveLength(0);
});
test('real service worker registers locally without caching or requesting permission',async({page})=>{
 await page.goto('/#chores');await page.getByRole('button',{name:'Phone notifications',exact:true}).click();
 await expect(page.locator('#push-message')).toHaveText('');
 const state=await page.evaluate(async()=>({scope:(await navigator.serviceWorker.ready).scope,permission:Notification.permission,caches:await caches.keys()}));
 expect(state.scope).toBe('http://127.0.0.1:4174/');expect(state.permission).toBe('default');expect(state.caches).toEqual([]);
});
test('notification links open bill details and handle missing items gracefully',async({page})=>{
 const data=await (await page.request.post('/rest/v1/rpc/utilities_dashboard',{headers:{apikey:'local-public'},data:{}})).json();
 const bill=data.bills[0];
 await page.goto(`/?notice=${encodeURIComponent(bill.id)}#utilities`);
 await expect(page.locator(`[data-bill-id="${bill.id}"]`).first()).toBeVisible();
 await expect(page.locator('.notification-target')).toBeVisible();
 expect(new URL(page.url()).searchParams.has('notice')).toBe(false);
 await page.goto('/?notice=missing-note#bulletin');
 await expect(page.locator('#toast')).toContainText('no longer available');
});
