import {readFile,mkdir,readdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export async function copySizePhotos(){
 const assets=Object.values(JSON.parse(await readFile('src/size-photo-assets.json','utf8')));
 const approved=new Set(assets.map(p=>p.file.replace(/^size-photos\//,'')));
 await mkdir('dist/size-photos',{recursive:true});
 for(const file of await readdir('public/size-photos'))if(!approved.has(file))throw new Error(`Unlisted size photograph: ${file}`);
 for(const asset of assets){
  if(!/^size-photos\/[a-z0-9-]+-[a-f0-9]{12}\.png$/.test(asset.file))throw new Error('Invalid photograph path');
  const bytes=await readFile('public/'+asset.file);
  if(createHash('sha256').update(bytes).digest('hex')!==asset.sha256||!asset.source.startsWith('https://commons.wikimedia.org/')||!asset.license||!asset.author)throw new Error('Invalid photograph provenance');
  await copyFile('public/'+asset.file,'dist/'+asset.file);
 }
}
