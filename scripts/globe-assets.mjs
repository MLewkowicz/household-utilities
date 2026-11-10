import {readFile,readdir,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export async function copyGlobeAssets(){
 const root='public/globe',manifest=JSON.parse(await readFile(`${root}/manifest.json`,'utf8'));
 const roles=['color-4k','color-8k','normal-2k','normal-4k'];
 if(manifest.version!==1||Object.keys(manifest.textures).sort().join()!==roles.join())throw new Error('Invalid globe texture manifest');
 const expected=['manifest.json',...Object.keys(manifest.files)].sort();
 if(JSON.stringify((await readdir(root)).sort())!==JSON.stringify(expected))throw new Error('Unlisted globe asset');
 await mkdir('dist/globe',{recursive:true});
 const required=[...Object.values(manifest.textures),...Object.values(manifest.detailTiles||{}).flatMap(t=>[t.color,t.normal])].sort();
 if(required.join()!==Object.keys(manifest.files).sort().join())throw new Error('Unlisted globe texture');
 for(const [file,info] of Object.entries(manifest.files)){
  if(!/^(?:(?:color|normal)-[248]k|detail-\d+-\d+-(?:color|normal))-[a-f0-9]{12}\.webp$/.test(file))throw new Error('Invalid globe texture');
  const bytes=await readFile(`${root}/${file}`),hash=createHash('sha256').update(bytes).digest('hex');
  if(hash!==info.sha256||bytes.length!==info.bytes||!file.includes(hash.slice(0,12)))throw new Error(`Globe checksum mismatch: ${file}`);
  if(bytes.subarray(0,4).toString()!=='RIFF'||bytes.subarray(8,12).toString()!=='WEBP')throw new Error('Invalid globe WebP');
  await copyFile(`${root}/${file}`,`dist/globe/${file}`);
 }
 await copyFile(`${root}/manifest.json`,'dist/globe/manifest.json');
}
