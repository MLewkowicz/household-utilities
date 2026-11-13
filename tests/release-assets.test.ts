import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createReleaseManifest,retainReleaseAssets,seedReleaseAssets} from '../scripts/release-assets.mjs';
import {isModuleLoadError} from '../src/module-loading';
async function fixture(run:(old:string,current:string,base:URL)=>Promise<void>){
 const root=await mkdtemp(join(tmpdir(),'release-test-')),old=join(root,'old'),current=join(root,'current');await mkdir(old);await mkdir(current);
 const server=createServer(async(req,res)=>{try{const name=new URL(req.url!,'http://localhost').pathname.slice(1)||'index.html';res.end(await readFile(join(old,name)));}catch{res.writeHead(404);res.end();}});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{await run(old,current,new URL(`http://127.0.0.1:${(server.address() as any).port}/`));}finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true});}
}
const now=Date.parse('2026-11-13T12:00:00Z');
test('deployment retains prior immutable modules and styles without replacing current pages or snapshots',()=>fixture(async(old,current,base)=>{
 await writeFile(join(old,'app-AAAAAAAA.js'),'import("./chunk-BBBBBBBB.js")');await writeFile(join(old,'chunk-BBBBBBBB.js'),'export const version="old";');await writeFile(join(old,'games-111111111111.css'),'body{color:red}');await writeFile(join(old,'ledger.json'),'private old snapshot');await createReleaseManifest(old,now-86400000);
 await writeFile(join(current,'app-CCCCCCCC.js'),'export const version="new";');await writeFile(join(current,'index.html'),'new page');await writeFile(join(current,'ledger.json'),'current approved snapshot');await createReleaseManifest(current,now);
 assert.equal((await retainReleaseAssets(current,base,{now})).retained,3);assert.equal(await readFile(join(current,'chunk-BBBBBBBB.js'),'utf8'),'export const version="old";');assert.equal(await readFile(join(current,'index.html'),'utf8'),'new page');assert.equal(await readFile(join(current,'ledger.json'),'utf8'),'current approved snapshot');
 const manifest=JSON.parse(await readFile(join(current,'release-assets.json'),'utf8'));assert.equal(Object.keys(manifest.files).length,4);assert.equal(manifest.files['app-AAAAAAAA.js'].lastCurrentAt,new Date(now-86400000).toISOString());
}));
test('retention expires old modules and rejects corrupt assets or unsafe manifest paths',()=>fixture(async(old,current,base)=>{
 await writeFile(join(old,'chunk-AAAAAAAA.js'),'expired');await createReleaseManifest(old,now-31*86400000);await createReleaseManifest(current,now);
 assert.equal((await retainReleaseAssets(current,base,{now})).retained,0);
 await createReleaseManifest(old,now);await writeFile(join(old,'chunk-AAAAAAAA.js'),'changed after publishing');await assert.rejects(retainReleaseAssets(current,base,{now}),/checksum mismatch/);
 await writeFile(join(old,'release-assets.json'),JSON.stringify({version:1,files:{'../private.js':{sha256:'a'.repeat(64),bytes:1,lastCurrentAt:new Date(now).toISOString()}}}));await assert.rejects(retainReleaseAssets(current,base,{now}),/Invalid published asset metadata/);
}));
test('first retained release follows all lazy imports and can recover modules from old published artifacts',()=>fixture(async(old,current,base)=>{
 await writeFile(join(old,'index.html'),'<script type="module" src="./app-AAAAAAAA.js"></script>');await writeFile(join(old,'app-AAAAAAAA.js'),'export const load=()=>import("./chunk-BBBBBBBB.js")');await writeFile(join(old,'chunk-BBBBBBBB.js'),'import {value} from "./chunk-CCCCCCCC.js";');await writeFile(join(old,'chunk-CCCCCCCC.js'),'export const value=1;');await createReleaseManifest(current,now);
 const result=await retainReleaseAssets(current,base,{now});assert.equal(result.bootstrap,true);assert.equal(result.retained,3);
 await writeFile(join(old,'chunk-DDDDDDDD.js'),'previously deleted module');await writeFile(join(old,'sw.js'),'do not replace the service worker');await writeFile(join(old,'ledger.json'),'do not restore old data');
 assert.equal(await seedReleaseAssets(current,[old],now),1);assert.ok(!(await readdir(current)).includes('sw.js'));assert.ok(!(await readdir(current)).includes('ledger.json'));
}));
test('module loading failures get reload recovery without treating ordinary fetch failures as stale modules',()=>{
 for(const message of ['Failed to fetch dynamically imported module: https://example.test/chunk.js','error loading dynamically imported module','Importing a module script failed.'])assert.ok(isModuleLoadError(new TypeError(message)));
 for(const message of ['Failed to fetch','The board is not quite right yet.','Could not connect'])assert.equal(isModuleLoadError(new Error(message)),false);
});
