import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const port=Number(process.env.AVATAR_PREVIEW_PORT||4189);
createServer(async(req,res)=>{try{
 const p=new URL(req.url,'http://localhost').pathname;
 const file=p==='/'?'scripts/avatar-studio.html':/^\/avatars\/v1\/[a-z0-9.-]+$/.test(p)?'public'+p:null;
 if(!file)throw new Error('Not found');
 const bytes=await readFile(file);
 res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':file.endsWith('.webp')?'image/webp':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(bytes);
 }catch{res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`All four avatars: http://localhost:${port}`));
