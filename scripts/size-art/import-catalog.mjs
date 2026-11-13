// Rebuild the reviewed size catalog from pinned public archive responses.
// Downloaded originals stay in .local; only derived geometry is bundled.
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {homedir} from 'node:os';
import {chromium} from '@playwright/test';

const root=new URL('../../',import.meta.url),cache=new URL('.local/how-much-rework/catalog/',root);
const manifest=JSON.parse(await readFile(new URL('catalog-manifest.json',import.meta.url),'utf8'));
const sha=value=>createHash('sha256').update(value).digest('hex');
const round=value=>Number(value.toFixed(3));
const categories=['classic','pop-culture','geography'];
const titles={classic:'Classic','pop-culture':'Pop culture',geography:'Geography'};
await mkdir(cache,{recursive:true});
const downloaded=new Map();
for(const entry of manifest.entries){
 if(downloaded.has(entry.puzzleUrl))continue;
 const file=new URL(entry.cacheFile,cache);let bytes;
 try{bytes=await readFile(file);}catch{
  const response=await fetch(entry.puzzleUrl);if(!response.ok)throw Error(`Cannot retrieve ${entry.cacheFile}: ${response.status}`);
  bytes=Buffer.from(await response.arrayBuffer());
  if(sha(bytes)!==entry.puzzleSha256)throw Error(`Source changed: ${entry.cacheFile}. Review the manifest before updating its hash.`);
  await writeFile(file,bytes);
 }
 if(sha(bytes)!==entry.puzzleSha256)throw Error(`Source checksum mismatch: ${entry.cacheFile}`);
 downloaded.set(entry.puzzleUrl,JSON.parse(bytes));
}

// Simplify redundant tracing points to at most 0.08 normalized units (0.32 px
// at a 400 px measured axis). Keep each contour, its winding, and its extrema.
// Small components retain their original geometry if their area would drift.
const distance=(p,a,b)=>{const x=b[0]-a[0],y=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*x+(p[1]-a[1])*y)/(x*x+y*y||1)));return Math.hypot(p[0]-a[0]-t*x,p[1]-a[1]-t*y);};
function simplify(points,tolerance){
 if(points.length<4)return points;
 const keep=new Set([0,points.length-1]),stack=[[0,points.length-1]];
 while(stack.length){const [a,b]=stack.pop();let max=tolerance,index=-1;for(let i=a+1;i<b;i++){const d=distance(points[i],points[a],points[b]);if(d>max){max=d;index=i;}}if(index!==-1){keep.add(index);stack.push([a,index],[index,b]);}}
 return [...keep].sort((a,b)=>a-b).map(i=>points[i]);
}
const signedArea=points=>points.reduce((sum,p,i)=>{const next=points[(i+1)%points.length];return sum+p[0]*next[1]-next[0]*p[1];},0)/2;
function simplifyRing(points){
 if(points.length<5)return points;
 if(points[0][0]===points.at(-1)[0]&&points[0][1]===points.at(-1)[1])points=points.slice(0,-1);
 const indices=new Set([0]);for(const [axis,direction] of [[0,1],[0,-1],[1,1],[1,-1]]){let best=0;for(let i=1;i<points.length;i++)if(points[i][axis]*direction>points[best][axis]*direction)best=i;indices.add(best);}
 const anchors=[...indices].sort((a,b)=>a-b),area=signedArea(points);
 for(let tolerance=.08;tolerance>=.002;tolerance/=2){
  const result=[];
  for(let i=0;i<anchors.length;i++){const a=anchors[i],b=anchors[(i+1)%anchors.length];const segment=b>a?points.slice(a,b+1):[...points.slice(a),...points.slice(0,b+1)];result.push(...simplify(segment,tolerance).slice(0,-1));}
  const after=signedArea(result);
  if(result.length>=3&&Math.sign(area)===Math.sign(after)&&Math.abs(after-area)<=Math.abs(area)*.01)return result;
 }
 return points;
}
function normalizePath(path,bounds,axis){
 const factor=100/(axis==='height'?bounds.height:bounds.width),x=50-(bounds.x+bounds.width/2)*factor,y=100-(bounds.y+bounds.height)*factor;
 if(/[^MLZmlz0-9.,\s+eE-]/.test(path)||/[mlz]/.test(path))return `<path transform="matrix(${factor} 0 0 ${factor} ${x} ${y})" d="${path.replace(/\s+/g,' ').trim()}" fill-rule="nonzero"/>`;
 const tokens=path.match(/[MLZ]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g);const contours=[];let points=[];
 for(let i=0;i<tokens.length;){const command=tokens[i++];if(command==='Z'){contours.push(simplifyRing(points));points=[];continue;}if(command!=='M'&&command!=='L')throw Error(`Unexpected path command ${command}`);if(command==='M'&&points.length)throw Error('Unclosed input contour');while(i<tokens.length&&!/[MLZ]/.test(tokens[i])){points.push([Number(tokens[i++])*factor+x,Number(tokens[i++])*factor+y]);}}
 if(points.length)throw Error('Unclosed final contour');
 const data=contours.map(points=>'M'+points.map(p=>p.map(round).join(',')).join('L')+'Z').join('');
 return `<path d="${data}" fill-rule="nonzero"/>`;
}

const browserCache=homedir()+'/.cache/ms-playwright';
const executablePath=process.env.CHROMIUM_EXECUTABLE||(existsSync(browserCache)?(await readdir(browserCache)).filter(p=>p.startsWith('chromium-')).sort().reverse().map(p=>`${browserCache}/${p}/chrome-linux64/chrome`).find(existsSync):undefined);
const browser=await chromium.launch({executablePath});
const page=await browser.newPage();const catalog={};
try{
 for(const entry of manifest.entries){
  const original=downloaded.get(entry.puzzleUrl).rounds[entry.round][entry.role];
  if(original.name!==entry.name||sha(original.pathData)!==entry.pathSha256)throw Error(`Unreviewed shape: ${entry.id}`);
  if(!Number.isFinite(original.realM)||original.realM<=0||!/^[-+\d.,\sMmLlHhVvCcSsQqTtAaZzeE]+$/.test(original.pathData))throw Error(`Invalid shape: ${entry.id}`);
  await page.setContent(`<svg><path id="shape" d="${original.pathData}"/></svg>`);
  const bounds=await page.locator('#shape').evaluate(el=>{const b=el.getBBox();return {x:b.x,y:b.y,width:b.width,height:b.height};});
  if(!(bounds.width>0&&bounds.height>0))throw Error(`Empty shape: ${entry.id}`);
  const axis=original.horiz?'length':'height',factor=100/(axis==='height'?bounds.height:bounds.width);
  const art=normalizePath(original.pathData,bounds,axis),width=bounds.width*factor,height=bounds.height*factor;
  await page.setContent(`<svg><g id="shape">${art}</g></svg>`);
  const normalized=await page.locator('#shape').evaluate(el=>{const b=el.getBBox();return {x:b.x,y:b.y,width:b.width,height:b.height};});
  if(Math.abs(normalized[axis==='height'?'height':'width']-100)>.002||Math.abs(normalized.x+normalized.width/2-50)>.002||Math.abs(normalized.y+normalized.height-100)>.002)throw Error(`Normalization failed: ${entry.id}`);
  const snapshot=original.measurementSnapshot||{},qualifier=(original.sub||'').replace(/^\(|\)$/g,'');
  const dimension=entry.category==='geography'?`projected ${axis==='height'?'north–south':'east–west'} span`:`full silhouette ${axis}`;
  let note=entry.category==='geography'?'This compares the span of the projected outline, not land area or distance along a river.':entry.category==='pop-culture'?'Fictional reference size for this version and pose; depictions and source estimates vary.':'A reference size for this illustrated object; models, specimens and poses can vary.';
  if(snapshot.key_measurement_m&&Math.abs(snapshot.key_measurement_m/original.realM-1)>.005&&entry.category!=='geography')note+=` The full outline is calibrated from a ${formatMeasure(snapshot.key_measurement_m)} ${String(snapshot.key_measurement_method||'reference measurement').toLowerCase()}.`;
  catalog[entry.id]={name:entry.name,qualifier,category:entry.category,axis,meters:original.realM,dimension,description:qualifier?`${entry.name} · ${qualifier}`:entry.name,art,bounds:{width:round(width),height:round(height)},source:entry.artSource,creditUrl:entry.creditUrl,artSource:entry.artSource,author:entry.author,license:entry.license,...(entry.licenseUrl?{licenseUrl:entry.licenseUrl}:{}),measurementSource:entry.measurementSource,note};
 }
}finally{await browser.close();}

function formatMeasure(meters){const [value,unit]=meters>=1000?[meters/1000,'km']:meters>=1?[meters,'m']:meters>=.01?[meters*100,'cm']:meters>=.001?[meters*1000,'mm']:[meters*1e6,'µm'];return `${Number(value.toPrecision(3))} ${unit}`;}
function question(targetId,referenceId,category,id){
 const target=catalog[targetId],reference=catalog[referenceId];
 const item=(object,key,ref=false)=>({name:object.name,dimension:object.dimension,shape:'catalog:'+key,...(object.qualifier?{qualifier:object.qualifier}:{}),...(ref?{measure:formatMeasure(object.meters)}:{})});
 return {id,version:10,kind:'scale',category,tag:titles[category],prompt:`Size up ${target.name}.`,target:item(target,targetId),reference:item(reference,referenceId,true),bounds:[.001,20],answer:target.meters/reference.meters,explanation:`${target.name}: ${formatMeasure(target.meters)} (${target.dimension}). ${reference.name}: ${formatMeasure(reference.meters)} (${reference.dimension}).\n${target.note}\n${reference.note}`,sources:[target.measurementSource,reference.measurementSource]};
}
// Independently paired boards, not copies of any reference site's daily puzzle.
// Pick pairs with useful contrasts, spread appearances across the catalog, and
// keep each board varied. The deterministic order makes saved boards stable.
const featured={
 classic:[['golden-retriever','volkswagen-t2-camper'],['milk-chocolate-mm','almond'],['game-boy-original','ukulele'],['moose','paraceratherium'],['meerkat','wombat'],['human-sperm-cell','human-egg-cell'],['statue-of-unity','airbus-a380'],['human-eyeball','walnut'],['elephant','lion'],['heinz-glass-342g','usb-a-sandisk-ultra-flair']],
 'pop-culture':[['aang','finn-the-human'],['wreck-it-ralph','bob-despicable-me'],['at-at-walker','susan-murphy-giant'],['darth-vader-helmet','golden-ticket'],['steelix','arbok'],['frodo-baggins','sauron'],['maggie-simpson','lisa-simpson'],['gollum','birdperson'],['brian-griffin','megamind'],['majin-buu-kid','majin-buu-super']],
 geography:[['germany','texas'],['great-britain','italy'],['lake-geneva','lake-ladoga'],['nile','ganges'],['hawaii','cyprus'],['greenland','australia'],['new-zealand','united-kingdom'],['netherlands','new-mexico'],['alaska','india'],['france','mongolia']],
};
const collections={},dailyByCategory={};
for(const category of categories){
 const ids=Object.keys(catalog).filter(id=>catalog[id].category===category),used=new Set(),counts=new Map(ids.map(id=>[id,0]));let seed=category.length*3109;
 const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const candidates=[];
 for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
  let a=ids[i],b=ids[j];if(rand()<.5)[a,b]=[b,a];let ratio=catalog[a].meters/catalog[b].meters;
  if(ratio<.001||ratio>20){[a,b]=[b,a];ratio=1/ratio;}
  if(ratio>=.001&&ratio<=20)candidates.push({pair:[a,b],tie:rand()});
 }
 const pairs=[];const add=pair=>{const id=[...pair].sort().join('|');if(used.has(id))return;used.add(id);pairs.push(pair);for(const item of pair)counts.set(item,counts.get(item)+1);};
 for(const pair of featured[category])add(pair);
 while(pairs.length<150){
  const recent=new Set(pairs.slice(-4).flat());
  const available=candidates.filter(c=>!used.has([...c.pair].sort().join('|')));
  available.sort((a,b)=>rank(a)-rank(b));
  function rank(candidate){const [a,b]=candidate.pair,ratio=catalog[a].meters/catalog[b].meters;return counts.get(a)+counts.get(b)+(recent.has(a)?6:0)+(recent.has(b)?6:0)+(ratio<.025?12:0)+candidate.tie;}
  if(!available.length)throw Error(`Too few unique ${category} pairs`);add(available[0].pair);
 }
 collections[category]=pairs.slice(0,50).map(([a,b],i)=>question(a,b,category,`size-v10-${category}-practice-${i+1}`));
 dailyByCategory[category]=pairs.slice(50).map(([a,b],i)=>question(a,b,category,`size-v10-${category}-daily-${i+1}`));
}
const positions=Object.fromEntries(categories.map(c=>[c,0]));
const daily=Array.from({length:60},(_,board)=>Array.from({length:5},(_,round)=>{const category=categories[(board*5+round)%3];return dailyByCategory[category][positions[category]++];}));
await writeFile(new URL('src/size-catalog.json',root),JSON.stringify(catalog)+'\n');
await writeFile(new URL('src/trivia/size-collections.json',root),JSON.stringify(collections,null,2)+'\n');
await writeFile(new URL('scripts/trivia/size-daily-v10.json',root),JSON.stringify(daily,null,2)+'\n');
console.log(`Built ${Object.keys(catalog).length} profiles, 30 practice boards and ${daily.length} mixed daily boards (${JSON.stringify(catalog).length.toLocaleString()} catalog bytes).`);
