import {chromium} from '@playwright/test';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
const cache=process.env.HOME+'/.cache/ms-playwright';
const executablePath=(await readdir(cache)).filter(n=>n.startsWith('chromium-')).map(n=>`${cache}/${n}/chrome-linux64/chrome`).find(existsSync);
const browser=await chromium.launch({executablePath});const page=await browser.newPage();
const library=JSON.parse(await readFile(new URL('sanitized.json',import.meta.url),'utf8'));
for(const [key,item] of Object.entries(library)){
 await page.setContent(`<svg xmlns="http://www.w3.org/2000/svg"><g id="art">${item.art}</g></svg>`);
 const b=await page.locator('#art').evaluate(g=>{const b=g.getBBox();return {x:b.x,y:b.y,width:b.width,height:b.height};});
 if(!(b.width>0&&b.height>0))throw new Error('Empty art: '+key);
 const scale=100/(item.axis==='height'?b.height:b.width);
 const x=50-(b.x+b.width/2)*scale,y=100-(b.y+b.height)*scale;
 item.art=`<g transform="matrix(${scale} 0 0 ${scale} ${x} ${y})">${item.art}</g>`;
 item.bounds={width:b.width*scale,height:b.height*scale};
 console.log(key,item.axis,Math.round(item.bounds.width),Math.round(item.bounds.height));
}
await writeFile(new URL('../../src/size-art.json',import.meta.url),JSON.stringify(library)+'\n');
await browser.close();
