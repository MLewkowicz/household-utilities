"""Fetch existing photographic cutouts; retain original alpha, source and license.
No generated art or background inference. Images render as solid alpha masks.
"""
import json,urllib.request,urllib.parse,re,html,time,hashlib,io
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'public/size-photos';OUT.mkdir(exist_ok=True)
CACHE=ROOT/'.local/photo-cache';CACHE.mkdir(exist_ok=True)
UA='HouseholdUtilities/1.0 (https://github.com/MLewkowicz/household-utilities)'
def fetch(url):
 for attempt in range(4):
  try:return urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':UA}),timeout=40).read()
  except Exception:
   if attempt==3:raise
   time.sleep(2**attempt)
def plain(s):return html.unescape(re.sub('<[^>]*>','',s)).strip()
rows=[line.split('|') for line in (Path(__file__).with_name('objects.tsv')).read_text().splitlines()]
infos={}
for start in range(0,len(rows),25):
 batch=rows[start:start+25];q=dict(action='query',format='json',prop='imageinfo',iiprop='url|extmetadata|size',iiurlwidth=400,iiurlheight=400,titles='|'.join('File:'+r[1] for r in batch))
 response=json.loads(fetch('https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode(q)))
 for page in response['query']['pages'].values():infos[page['title'][5:]]=page.get('imageinfo',[{}])[0]
excluded=json.loads(Path(__file__).with_name('excluded.json').read_text())
manifest={};failures=[]
for row in rows:
 id,file,name,size,axis,dimension,category,measure_source,note=row;i=infos.get(file,{})
 try:
  if id in excluded:raise ValueError(excluded[id])
  if not i:raise ValueError('file unavailable')
  m=i.get('extmetadata',{});license=plain(m.get('LicenseShortName',{}).get('value',''))
  if not any(x in license for x in ['CC BY','CC0','Public domain']):raise ValueError('unsupported license '+license)
  original=i.get('thumburl') or i['url'];cached=CACHE/(id+'.png')
  if not cached.exists():cached.write_bytes(fetch(original))
  data=cached.read_bytes();im=Image.open(io.BytesIO(data)).convert('RGBA');alpha=im.getchannel('A');bbox=alpha.getbbox()
  if not bbox or alpha.getextrema()[0]!=0:raise ValueError('no transparent background')
  if len(im.getcolors(maxcolors=1000000) or [])<200:raise ValueError('not a photographic cutout')
  x,y,right,bottom=bbox;w,h=right-x,bottom-y
  digest=hashlib.sha256(data).hexdigest();asset=f'{id}-{digest[:12]}.png';(OUT/asset).write_bytes(data)
  manifest[id]=dict(file='size-photos/'+asset,name=name,metres=float(size),axis=axis,dimension=dimension,category=category,measurementSource=measure_source,note=note,width=im.width,height=im.height,bounds=dict(x=x,y=y,width=w,height=h),author=plain(m.get('Artist',{}).get('value','Unknown')),license=license,licenseUrl=plain(m.get('LicenseUrl',{}).get('value','')),source=i.get('descriptionurl','https://commons.wikimedia.org/wiki/File:'+urllib.parse.quote(file.replace(' ','_'))),original=original,sha256=digest,description=plain(m.get('ImageDescription',{}).get('value',''))[:2000])
  print(id,license,im.size,len(data),flush=True)
 except Exception as error:failures.append([id,str(error)]);print('REJECT',id,str(error),flush=True)
(ROOT/'src/size-photo-assets.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
(ROOT/'.local/photo-rejections.json').write_text(json.dumps(failures,indent=2)+'\n')
approved={p['file'].split('/')[-1] for p in manifest.values()}
for path in OUT.glob('*.png'):
 if path.name not in approved:path.unlink()
print('Accepted',len(manifest),'Rejected',len(failures),flush=True)
