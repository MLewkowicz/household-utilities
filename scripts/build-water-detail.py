# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow==12.1.1"]
# ///
"""Rasterize inland-water edges at the same resolution as close-up terrain.
Run after build-globe-details.py and build-landcover.py; uses their cached sources.
"""
from pathlib import Path
import hashlib,json,zipfile
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[1];cache=ROOT/'.local/geography';out=ROOT/'public/globe'
manifest=json.loads((out/'manifest.json').read_text())
with zipfile.ZipFile(cache/'NE1_LR_LC.zip') as archive:
 with archive.open(next(n for n in archive.namelist() if n.lower().endswith('.tif'))) as f:source=Image.open(f).convert('RGB')
countries=json.loads((ROOT/'src/geography-data.json').read_text())
def pieces(geom):return geom['coordinates'] if geom['type'].startswith('Multi') else [geom['coordinates']]
lands=[ring for c in countries for ring in c['rings']]
lakes=[poly for f in json.loads((cache/'lakes.geojson').read_text())['features'] for poly in pieces(f['geometry'])]
rivers=[(line,f['properties'].get('scalerank',6)) for f in json.loads((cache/'rivers.geojson').read_text())['features'] if 'Lake Centerline' not in f['properties'].get('featurecla','') for line in pieces(f['geometry'])]
def bounds(ring):return min(p[0] for p in ring),min(p[1] for p in ring),max(p[0] for p in ring),max(p[1] for p in ring)
lands=[(r,bounds(r)) for r in lands];lakes=[(p,bounds(p[0])) for p in lakes];rivers=[(r,rank,bounds(r)) for r,rank in rivers]
for key,tile in manifest['detailTiles'].items():
 n,g=tile['pixels'],tile['gutter'];size=n+2*g;step=tile['size']/n;west=tile['west']-g*step;north=tile['north']+g*step;east=west+size*step;south=north-size*step
 box=((west+180)/360*source.width,(90-north)/180*source.height,(east+180)/360*source.width,(90-south)/180*source.height)
 # Crop only the local source window. Longitude gutter wraps across the date line.
 image=source.transform((size,size),Image.Transform.EXTENT,box,resample=Image.Resampling.BICUBIC)
 for x,lon in [(x,west+(x+.5)*step) for x in list(range(g))+list(range(size-g,size))]:
  if lon<-180 or lon>180:
   sx=((lon+180)%360)/360*source.width
   strip=source.transform((1,size),Image.Transform.EXTENT,(sx,box[1],sx+source.width*step/360,box[3]),resample=Image.Resampling.BICUBIC);image.paste(strip,(x,0))
 alpha=Image.new('L',(size,size));mask=ImageDraw.Draw(alpha)
 def point(p):return ((p[0]-west)/step,(north-p[1])/step)
 def intersects(b):return b[2]>=west and b[0]<=east and b[3]>=south and b[1]<=north
 for ring,b in lands:
  if intersects(b):mask.polygon([point(p) for p in ring],fill=230)
 image.putalpha(alpha);draw=ImageDraw.Draw(image)
 for poly,b in lakes:
  if intersects(b):
   # Leave islands in lakes to the underlying land texture.
   water=Image.new('L',(size,size));wd=ImageDraw.Draw(water);wd.polygon([point(p) for p in poly[0]],fill=255)
   for hole in poly[1:]:wd.polygon([point(p) for p in hole],fill=0)
   image.paste((58,126,153,255),(0,0,size,size),water)
 draw=ImageDraw.Draw(image)
 for line,rank,b in rivers:
  if intersects(b):
   for a,c in zip(line,line[1:]):
    if abs(a[0]-c[0])<180:draw.line([point(a),point(c)],fill=(65,131,156,255),width=3 if rank<=3 else 2)
 temporary=cache/f'detail-{key}-cover.webp';image.save(temporary,'WEBP',quality=94,method=4)
 data=temporary.read_bytes();sha=hashlib.sha256(data).hexdigest();filename=f'detail-{key}-cover-{sha[:12]}.webp'
 old=tile.get('cover')
 if old and old!=filename:(out/old).unlink(missing_ok=True);manifest['files'].pop(old,None)
 (out/filename).write_bytes(data);manifest['files'][filename]={'sha256':sha,'bytes':len(data),'width':size,'height':size};tile['cover']=filename
 print(key,len(data),flush=True)
manifest['landCover']['detailSamples']=[21600,10800]
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Baked',len(manifest['detailTiles']),'land/water detail overlays with lossless alpha.')
