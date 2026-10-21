import {test,expect} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';
import {NOTE_REACTIONS} from '../../src/avatars/reactions';

let server:ChildProcess;
const url='http://127.0.0.1:4192';
test.beforeAll(async()=>{
 server=spawn(process.execPath,['scripts/preview-reactions.mjs'],{env:{...process.env,REACTION_PREVIEW_PORT:'4192'},stdio:'ignore'});
 await expect.poll(async()=>{try{return (await fetch(url)).ok;}catch{return false;}},{timeout:15000}).toBe(true);
});
test.afterAll(async()=>{if(server&&!server.killed){await new Promise<void>(resolve=>{server.once('exit',()=>resolve());server.kill();});}});

test('all 56 static character reactions render within their transparent bounds',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await page.goto(url);
 await expect(page.locator('[data-ready=true]')).toHaveCount(56);
 const bounds=await page.locator('.still img').evaluateAll(async(images:HTMLImageElement[])=>Promise.all(images.map(async image=>{
  await image.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const context=canvas.getContext('2d')!;context.drawImage(image,0,0);
  const {data,width,height}=context.getImageData(0,0,canvas.width,canvas.height);let left=width,top=height,right=-1,bottom=-1,count=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>25){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);count++;}
  return {id:image.alt,left,top,right,bottom,count,width,height,src:image.src};
 })));
 expect(new Set(bounds.map(b=>b.src)).size).toBe(56);
 for(const b of bounds){expect(b.count,b.id).toBeGreaterThan(1000);expect(b.left,b.id).toBeGreaterThan(1);expect(b.top,b.id).toBeGreaterThan(1);expect(b.right,b.id).toBeLessThan(b.width-2);expect(b.bottom,b.id).toBeLessThan(b.height-2);}
 for(const [expression] of NOTE_REACTIONS){
  const row=page.locator(`[data-expression="${expression}"]`).first();await row.scrollIntoViewIfNeeded();
  await page.screenshot({path:`.local/reaction-checks/${expression}-desktop.png`});
 }
 await page.setViewportSize({width:390,height:844});await page.locator('[data-expression=vomit][data-member=michal]').scrollIntoViewIfNeeded();await page.screenshot({path:'.local/reaction-checks/vomit-phone.png'});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.setViewportSize({width:320,height:700});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('only selection animates, replay restarts, and pause, offscreen and hidden states stop drawing',async({page})=>{
 await page.addInitScript(()=>{
  const frames=new WeakMap<HTMLCanvasElement,number>();(window as any).reactionFrames=frames;const clear=CanvasRenderingContext2D.prototype.clearRect;
  CanvasRenderingContext2D.prototype.clearRect=function(...args){frames.set(this.canvas,(frames.get(this.canvas)||0)+1);return clear.apply(this,args);};
 });
 await page.goto(url);await expect(page.locator('[data-ready=true]')).toHaveCount(56);await expect(page.locator('canvas')).toHaveCount(0);
 const card=page.locator('[data-expression=crying-laughing][data-member=michal]');await card.getByRole('button').click();
 const frames=()=>card.locator('canvas').evaluate(el=>(window as any).reactionFrames.get(el)||0);
 await expect.poll(frames).toBeGreaterThan(5);await expect(page.locator('canvas')).toHaveCount(1);
 await page.locator('#pause').click();const paused=await frames();await page.waitForTimeout(180);expect(await frames()).toBe(paused);
 await page.locator('#pause').click();await expect.poll(frames).toBeGreaterThan(paused);
 await page.locator('#replay').click();await expect(page.locator('canvas')).toHaveCount(1);await expect.poll(frames).toBeGreaterThan(2);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
 const hidden=await frames();await page.waitForTimeout(180);expect(await frames()).toBe(hidden);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:false,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});await expect.poll(frames).toBeGreaterThan(hidden);
 await page.locator('[data-expression=facepalm][data-member=rohil]').scrollIntoViewIfNeeded();await page.waitForTimeout(100);const offscreen=await frames();await page.waitForTimeout(180);expect(await frames()).toBe(offscreen);
});

test('reduced motion renders expressive stills and keyboard selection stays usable',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto(url);await expect(page.locator('[data-ready=true]')).toHaveCount(56);
 const card=page.locator('[data-expression=shocked][data-member=rina]'),button=card.getByRole('button');await button.focus();await page.keyboard.press('Enter');await expect(card.locator('canvas')).toBeVisible();
 const still=await card.locator('canvas').evaluate((canvas:HTMLCanvasElement)=>canvas.toDataURL());await page.waitForTimeout(180);expect(await card.locator('canvas').evaluate((canvas:HTMLCanvasElement)=>canvas.toDataURL())).toBe(still);
 await expect(page.locator('#motion-status')).toHaveText('Reduced motion: stable expressions.');
});
