// Render the actual Three.js scenery as a lightweight fallback; no external artwork.
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {writeFile,readdir,unlink} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const code=await build({stdin:{contents:`
 import * as T from 'three';
 import {buildObservatoryCosmos} from './src/observatory-cosmos';
 window.renderSky=(width,height)=>{
  const renderer=new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(width,height);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;renderer.setClearColor(0,0);
  const scene=new T.Scene(),halfW=width/height<.85?8.2:17.5,halfH=halfW/(width/height),camera=new T.OrthographicCamera(-halfW,halfW,halfH,-halfH,.1,150);camera.position.set(17,15,24);camera.lookAt(0,5.2,0);camera.updateMatrixWorld();
  scene.add(new T.HemisphereLight('#d8e8ff','#70607a',2.3));const sun=new T.DirectionalLight('#ffe5b0',3.7);sun.position.set(-10,19,12);scene.add(sun);const fill=new T.DirectionalLight('#8daef7',1.4);fill.position.set(8,4,-12);scene.add(fill);
  const cosmos=buildObservatoryCosmos(scene);cosmos.resize(camera);cosmos.update(0,1,false);renderer.render(scene,camera);const image=renderer.domElement.toDataURL('image/webp',.88);cosmos.destroy();renderer.dispose();return image;
 };`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'iife',target:'es2022'});
const cache=process.env.HOME+'/.cache/ms-playwright',executablePath=(await readdir(cache)).filter(n=>n.startsWith('chromium-')).map(n=>`${cache}/${n}/chrome-linux64/chrome`).find(existsSync);
const browser=await chromium.launch({executablePath,args:['--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage();await page.addScriptTag({content:code.outputFiles[0].text});const manifest={};
 for(const [key,width,height] of [['wide',1440,1000],['phone',780,1688]]){
  const encoded=await page.evaluate(([w,h])=>window.renderSky(w,h),[width,height]),bytes=Buffer.from(encoded.split(',')[1],'base64'),hash=createHash('sha256').update(bytes).digest('hex').slice(0,12),file=`observatory-sky-${key}-${hash}.webp`;
  await writeFile('public/'+file,bytes);manifest[key]=file;console.log(`${key}: ${Math.ceil(bytes.length/1024)} KB`);
 }
 await writeFile('src/observatory-sky-assets.json',JSON.stringify(manifest,null,2)+'\n');
 for(const old of await readdir('public'))if(/^observatory-sky-(wide|phone)-[a-f0-9]{12}\.webp$/.test(old)&&!Object.values(manifest).includes(old))await unlink('public/'+old);
}finally{await browser.close();}
