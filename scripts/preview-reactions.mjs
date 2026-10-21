import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
const port=Number(process.env.REACTION_PREVIEW_PORT||4191);
const bundle=await build({entryPoints:['src/reaction-gallery.ts'],bundle:true,write:false,format:'esm',target:'es2022'});
const html=await readFile('scripts/reaction-gallery.html');
const server=createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://localhost').pathname;
 let bytes,type;
 if(path==='/'){bytes=html;type='text/html';}
 else if(path==='/gallery.js'){bytes=bundle.outputFiles[0].contents;type='text/javascript';}
 else if(/^\/avatars\/v1\/[a-z0-9.-]+\.webp$/.test(path)){bytes=await readFile('public'+path);type='image/webp';}
 else {res.writeHead(404);res.end('Not found');return;}
 res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(bytes);
 }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Reaction gallery: http://127.0.0.1:${port}`));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
