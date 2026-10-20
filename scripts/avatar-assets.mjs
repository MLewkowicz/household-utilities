import {readFile,readdir,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root='public/avatars/v1';
const imageName=/^(michal|rina|ohm|rohil)-(happy128|happy256|happy512|faceplate|neutral|annoyed|angry|grateful|loving)-[a-f0-9]{12}\.webp$/;
const moduleName=/^motion-[a-f0-9]{12}\.js$/;
export async function validateAvatarAssets(){
 const manifest=JSON.parse(await readFile(`${root}/manifest.json`,'utf8'));
 if(manifest.version!==1||Object.keys(manifest.characters).sort().join(',')!=='michal,ohm,rina,rohil')throw new Error('Invalid avatar collection');
 const expected=['manifest.json',...Object.keys(manifest.files)].sort();
 if(JSON.stringify((await readdir(root)).sort())!==JSON.stringify(expected))throw new Error('Avatar directory contains an unlisted file');
 if(JSON.stringify(await readdir('public/avatars'))!==JSON.stringify(['v1']))throw new Error('Unexpected avatar directory');
 for(const [file,info] of Object.entries(manifest.files)){
  if(!imageName.test(file)&&!moduleName.test(file))throw new Error(`Unexpected avatar asset: ${file}`);
  const bytes=await readFile(`${root}/${file}`),hash=createHash('sha256').update(bytes).digest('hex');
  if(hash!==info.sha256||bytes.length!==info.bytes||!file.includes(hash.slice(0,12)))throw new Error(`Avatar checksum mismatch: ${file}`);
  if(file.endsWith('.webp')&&(bytes.subarray(0,4).toString()!=='RIFF'||bytes.subarray(8,12).toString()!=='WEBP'))throw new Error(`Invalid WebP: ${file}`);
 }
 for(const [member,assets] of Object.entries(manifest.characters))for(const key of ['happy128','happy256','happy512','faceplate','neutral','annoyed','angry','grateful','loving'])if(!assets[key]?.startsWith(member+'-')||!manifest.files[assets[key]])throw new Error(`Missing ${member} ${key}`);
 if(!moduleName.test(manifest.module)||!manifest.files[manifest.module])throw new Error('Missing avatar animation module');
 return manifest;
}
export async function copyAvatarAssets(destination='dist/avatars/v1'){
 const manifest=await validateAvatarAssets();await mkdir(destination,{recursive:true});
 for(const file of ['manifest.json',...Object.keys(manifest.files)])await copyFile(`${root}/${file}`,`${destination}/${file}`);
}
