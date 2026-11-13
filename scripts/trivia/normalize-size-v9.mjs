import {chromium} from '@playwright/test';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {homedir} from 'node:os';
const cache=homedir()+'/.cache/ms-playwright';
const executablePath=(await readdir(cache)).filter(n=>n.startsWith('chromium-')).map(n=>`${cache}/${n}/chrome-linux64/chrome`).find(existsSync);
const browser=await chromium.launch({executablePath});
try{
 const page=await browser.newPage(),path='src/size-art.json',profiles=JSON.parse(await readFile(path,'utf8'));
 for(const key of ['earth','moon','mars','death-star','falcon','at-at','star-destroyer','executor','banana','door']){
  const item=profiles[key];await page.setContent(`<svg><g id="profile">${item.art}</g></svg>`);
  const b=await page.locator('#profile').evaluate(g=>{const b=g.getBBox();return {x:b.x,y:b.y,width:b.width,height:b.height};});
  const scale=100/(item.axis==='height'?b.height:b.width),x=50-(b.x+b.width/2)*scale,y=100-(b.y+b.height)*scale;
  item.art=`<g transform="matrix(${scale} 0 0 ${scale} ${x} ${y})">${item.art}</g>`;item.bounds={width:b.width*scale,height:b.height*scale};
 }
 await writeFile(path,JSON.stringify(profiles,null,2)+'\n');
}finally{await browser.close();}
