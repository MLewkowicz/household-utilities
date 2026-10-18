import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { openDatabase, callRpc } from './database.mjs';
await mkdir('.local',{recursive:true,mode:0o700});
let key;
try { key=(await readFile('.local/import-key','utf8')).trim(); }
catch { key=randomBytes(32).toString('hex');await writeFile('.local/import-key',key,{mode:0o600}); }
const db=await openDatabase(process.env.UTILITIES_TEST_DB==='1'?undefined:'.local/database');
if (!(await callRpc(db,'dashboard')).bills.length) {
  const bills=JSON.parse(await readFile('data/initial-bills.json','utf8'));
  await callRpc(db,'import_bills',{p:{request_id:'local-initial-seed',bills}},'service_role');
}
const port=Number(process.env.PORT||4173);
const server=createServer(async(req,res)=>{
  try {
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/config.js') {
      res.writeHead(200,{'content-type':'application/javascript','cache-control':'no-store'});
      return res.end(`window.UTILITIES_CONFIG=${JSON.stringify({url:`http://127.0.0.1:${port}`,key:'local-public'})};`);
    }
    if(path.startsWith('/rest/v1/rpc/utilities_')) {
      if(req.method!=='POST') {res.writeHead(405);return res.end();}
      if(req.headers.origin&&req.headers.origin!==`http://127.0.0.1:${port}`&&req.headers.origin!==`http://localhost:${port}`) {res.writeHead(403);return res.end();}
      let body='';for await (const chunk of req) {body+=chunk;if(body.length>262144)throw new Error('Request too large');}
      const name=path.slice('/rest/v1/rpc/utilities_'.length);
      const role=req.headers.apikey===key?'service_role':'anon';
      if(role==='anon'&&req.headers.apikey!=='local-public')throw new Error('Invalid local key');
      const result=await callRpc(db,name,JSON.parse(body||'{}'),role);
      res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});return res.end(JSON.stringify(result));
    }
    const file=path==='/'?'index.html':decodeURIComponent(path.slice(1));
    if(file.includes('..')||file.includes('\\')||file.startsWith('.')||!/^[-a-zA-Z0-9._/]+$/.test(file)) {res.writeHead(404);return res.end();}
    const data=await readFile(`dist/${file}`);
    res.writeHead(200,{'content-type':({'html':'text/html','css':'text/css','js':'application/javascript','json':'application/json','svg':'image/svg+xml','txt':'text/plain'})[file.split('.').pop()]||'application/octet-stream','cache-control':'no-store'});res.end(data);
  } catch(error) {res.writeHead(error.code==='ENOENT'?404:400,{'content-type':'application/json'});res.end(JSON.stringify({message:error.message}));}
});
server.listen(port,'127.0.0.1',()=>console.log(`Utilities preview: http://127.0.0.1:${port}`));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(async()=>{await db.close();process.exit(0);}));
