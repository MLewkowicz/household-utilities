# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy==2.4.2", "scipy==1.17.1", "pillow==12.1.1"]
# ///
"""Bake 30° terrain tiles from the native one-arc-minute ETOPO1 model.
Run after build-elevation.py. Tiles are fetched locally only at close zoom.
"""
import hashlib,json,urllib.request
from pathlib import Path
import numpy as np
from scipy.io import netcdf_file
from scipy.ndimage import map_coordinates
from PIL import Image,ImageDraw,ImageFilter
ROOT=Path(__file__).resolve().parent.parent
CACHE=ROOT/'.local/geography';root=ROOT/'public/globe'
URL='https://coastwatch.pfeg.noaa.gov/erddap/griddap/etopo180.nc?altitude%5B(-90):1:(90)%5D%5B(-180):1:(180)%5D'
source=CACHE/'etopo1-one-minute.nc'
if not source.exists():
 with urllib.request.urlopen(URL,timeout=240) as response,source.with_suffix('.part').open('wb') as out:
  while chunk:=response.read(4*1024*1024):out.write(chunk)
 source.with_suffix('.part').rename(source)
f=netcdf_file(source,mmap=True);heights=f.variables['altitude'].data
assert heights.shape==(10801,21601)
countries=json.loads((ROOT/'src/geography-data.json').read_text());terrain=json.loads((ROOT/'src/geography-terrain.json').read_text())
manifest=json.loads((root/'manifest.json').read_text());manifest['detailSource']=URL;manifest['detailSamples']=[21601,10801];manifest['detailTiles']={}
manifest['files']={k:v for k,v in manifest['files'].items() if not k.startswith('detail-')}
N=1800;G=2;SIZE=N+G*2

def mask_for(records,west,north):
 image=Image.new('L',(SIZE,SIZE));draw=ImageDraw.Draw(image)
 for record in records:
  for ring in record['rings']:
   xs=[p[0] for p in ring];ys=[p[1] for p in ring]
   if max(xs)<west-.1 or min(xs)>west+30.1 or max(ys)<north-30.1 or min(ys)>north+.1:continue
   draw.polygon([((lon-west)/30*N+G,(north-lat)/30*N+G) for lon,lat in ring],fill=255)
 return image

def save(image,key,kind):
 temporary=CACHE/f'detail-{key}-{kind}.webp';image.save(temporary,'WEBP',lossless=kind=='normal',quality=94,method=4)
 data=temporary.read_bytes();sha=hashlib.sha256(data).hexdigest();name=f'detail-{key}-{kind}-{sha[:12]}.webp'
 (root/name).write_bytes(data);manifest['files'][name]={'sha256':sha,'bytes':len(data),'width':SIZE,'height':SIZE}
 return name

def mix(a,b,t):return a+(np.asarray(b,dtype=np.float32)-a)*np.clip(t,0,1)[...,None]
for row in range(6):
 for col in range(12):
  west=-180+col*30;north=90-row*30;key=f'{col}-{row}'
  land=mask_for(countries,west,north);is_land=np.asarray(land)>127
  if not np.any(is_land):continue
  lat=north-(np.arange(SIZE,dtype=np.float32)-G+.5)/60
  lon=west+(np.arange(SIZE,dtype=np.float32)-G+.5)/60
  xx,yy=np.meshgrid(((lon+180)*60)%21600,np.clip((lat+90)*60,0,10800))
  e=map_coordinates(heights,[yy,xx],order=1,output=np.float32,mode='nearest')
  arid=np.asarray(mask_for([r for r in terrain if r['kind']=='Desert'],west,north).filter(ImageFilter.GaussianBlur(42)),dtype=np.float32)/255
  latitude=np.maximum(0,np.abs(lat[:,None])-30)/35
  color=mix(np.array([72,117,83],dtype=np.float32),[144,153,102],np.broadcast_to(latitude,e.shape))
  color=mix(color,[191,159,101],arid);color=mix(color,[153,136,108],(e-650)/2600);color=mix(color,[204,199,180],(e-2600)/2600)
  snow=(lat[:,None]<-60)|((lat[:,None]>60)&(e>1000))|(e>4900);color=mix(color,[236,239,226],snow.astype(np.float32)*.95)
  sea=mix(np.array([39,117,139],dtype=np.float32),[12,46,69],(np.maximum(0,-e)/6500)**.48)
  color=np.clip(np.where(is_land[:,:,None],color,sea),0,255).astype(np.uint8)
  color_file=save(Image.fromarray(color),key,'color')
  z=np.maximum(0,e);z[~is_land]=0
  north_slope,east=np.gradient(z,np.pi/10800,np.pi/10800);north_slope=-north_slope
  sl,cl=np.sin(np.radians(lon))[None,:],np.cos(np.radians(lon))[None,:]
  sp,cp=np.sin(np.radians(lat))[:,None],np.cos(np.radians(lat))[:,None]
  east=np.where(is_land,east,0)*25/(6371000*np.maximum(cp,.025));north_slope=np.where(is_land,north_slope,0)*25/6371000
  nx=cp*sl-east*cl+north_slope*sp*sl;ny=sp-north_slope*cp;nz=cp*cl+east*sl+north_slope*sp*cl
  length=np.sqrt(nx*nx+ny*ny+nz*nz);normals=np.stack([nx/length,ny/length,nz/length],axis=-1)
  normal_file=save(Image.fromarray(np.rint((normals*.5+.5)*255).clip(0,255).astype(np.uint8)),key,'normal')
  manifest['detailTiles'][key]={'west':west,'north':north,'size':30,'gutter':G,'pixels':N,'color':color_file,'normal':normal_file}
  print(key,sum(manifest['files'][n]['bytes'] for n in [color_file,normal_file]),flush=True)
(root/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
for p in root.glob('detail-*.webp'):
 if p.name not in manifest['files']:p.unlink()
print('Baked',len(manifest['detailTiles']),'detail tiles; total',sum(v['bytes'] for k,v in manifest['files'].items() if k.startswith('detail-')),'bytes',flush=True)

del heights
f.close()
