import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const port=Number(process.env.NAVIGATION_PREVIEW_PORT||4193);
const files=new Map([['/','index.html'],['/index.html','index.html'],['/style.css','style.css'],['/app.js','app.js']]);
const server=createServer(async(req,res)=>{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
 const file=files.get(new URL(req.url,'http://localhost').pathname);
 if(!file){res.writeHead(404);res.end('Not found');return;}
 try{const bytes=await readFile(new URL('../docs/navigation-concepts/'+file,import.meta.url));res.writeHead(200,{'Content-Type':({'html':'text/html','css':'text/css','js':'text/javascript'})[file.split('.').pop()]+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:bytes);}
 catch{res.writeHead(500);res.end('Could not load the navigation concepts.');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Navigation concepts: http://127.0.0.1:${port}`));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
