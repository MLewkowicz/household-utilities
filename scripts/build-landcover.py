# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow==12.1.1"]
# ///
"""Bake Natural Earth land cover, rivers and lakes into a local globe overlay.
Keeps NOAA elevation and normals; the cover is shared by base and detail views.
Run: uv run scripts/build-landcover.py. Source archives remain outside the build.
"""
from pathlib import Path
import json,zipfile,urllib.request,hashlib
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[1];CACHE=ROOT/'.local/geography';CACHE.mkdir(parents=True,exist_ok=True)
RASTER='https://naturalearth.s3.amazonaws.com/10m_raster/NE1_LR_LC.zip'
NE='https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/'
def get(url,name):
 p=CACHE/name
 if not p.exists():
  with urllib.request.urlopen(url,timeout=90) as r:p.write_bytes(r.read())
 return p
archive=get(RASTER,'NE1_LR_LC.zip')
with zipfile.ZipFile(archive) as z:
 name=next(n for n in z.namelist() if n.lower().endswith('.tif'))
 with z.open(name) as f:cover=Image.open(f).convert('RGB')
W,H=8192,4096;cover=cover.resize((W,H),Image.Resampling.LANCZOS)
alpha=Image.new('L',(W,H));draw=ImageDraw.Draw(alpha)
def point(p):return ((p[0]+180)/360*W,(90-p[1])/180*H)
for c in json.load(open(ROOT/'src/geography-data.json')):
 for ring in c['rings']:draw.polygon([point(p) for p in ring],fill=230)
cover.putalpha(alpha);draw=ImageDraw.Draw(cover)
def pieces(geom):return geom['coordinates'] if geom['type'].startswith('Multi') else [geom['coordinates']]
for f in json.loads(get(NE+'ne_50m_lakes.geojson','lakes.geojson').read_text())['features']:
 for poly in pieces(f['geometry']):
  draw.polygon([point(p) for p in poly[0]],fill=(58,126,153,255))
river_count=0
for f in json.loads(get(NE+'ne_50m_rivers_lake_centerlines.geojson','rivers.geojson').read_text())['features']:
 if 'Lake Centerline' in f['properties'].get('featurecla',''):continue
 river_count+=1;rank=f['properties'].get('scalerank',6)
 for line in pieces(f['geometry']):
  for a,b in zip(line,line[1:]):
   if abs(a[0]-b[0])<180:draw.line([point(a),point(b)],fill=(65,131,156,255),width=2 if rank<=3 else 1)
root=ROOT/'public/globe';m=json.loads((root/'manifest.json').read_text())
for size in [8192,4096]:
 role='cover-'+str(size//1024)+'k';img=cover if size==8192 else cover.resize((size,size//2),Image.Resampling.LANCZOS)
 p=CACHE/(role+'.webp');img.save(p,'WEBP',quality=92,method=4)
 data=p.read_bytes();sha=hashlib.sha256(data).hexdigest();name=role+'-'+sha[:12]+'.webp'
 previous=m['textures'].get(role)
 if previous and previous!=name:(root/previous).unlink(missing_ok=True);m['files'].pop(previous,None)
 (root/name).write_bytes(data);m['textures'][role]=name;m['files'][name]={'sha256':sha,'bytes':len(data),'width':img.width,'height':img.height}
 print(role,len(data),'bytes',flush=True)
m['landCover']={'source':RASTER,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'dataset':'Natural Earth I v3.2.0 land cover','rivers':NE+'ne_50m_rivers_lake_centerlines.geojson','lakes':NE+'ne_50m_lakes.geojson','riverFeatures':river_count,'license':'Public domain'}
(root/'manifest.json').write_text(json.dumps(m,indent=2)+'\n')
