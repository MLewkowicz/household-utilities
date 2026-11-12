# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy==2.4.2", "scipy==1.17.1", "pillow==12.1.1"]
# ///
"""Bake globe assets from NOAA ETOPO1. Run: uv run scripts/build-elevation.py.
Downloads are cached; no geography service is contacted by the application.
"""
import base64,hashlib,json,urllib.request
from pathlib import Path
import numpy as np
from scipy.io import netcdf_file
from PIL import Image,ImageDraw,ImageFilter
ROOT=Path(__file__).resolve().parent.parent
CACHE=ROOT/'.local/geography';CACHE.mkdir(parents=True,exist_ok=True)
URL='https://coastwatch.pfeg.noaa.gov/erddap/griddap/etopo180.nc?altitude%5B(-90):5:(90)%5D%5B(-180):5:(180)%5D'
source=CACHE/'etopo1-five-minute.nc'
if not source.exists():
 temporary=source.with_suffix('.part')
 with urllib.request.urlopen(URL,timeout=180) as response,temporary.open('wb') as out:
  while chunk:=response.read(1024*1024):out.write(chunk)
 temporary.rename(source)
with netcdf_file(source,mmap=False) as f:
 heights=f.variables['altitude'].data.astype(np.float32)
 assert heights.shape==(2161,4321)
 assert np.allclose(f.variables['latitude'].data,np.linspace(-90,90,2161))
 assert np.allclose(f.variables['longitude'].data,np.linspace(-180,180,4321))
assert -12000<=heights.min()<0<heights.max()<=9000
# Geometry needs fewer samples than per-pixel lighting. Keep that download small.
coarse=heights[::3,::3].astype('<i2');raw=coarse.tobytes()
asset=dict(dataset='NOAA ETOPO1 ice surface',units='meters',step=.25,width=1441,height=721,south=-90,west=-180,encoding='int16-le-base64',sha256=hashlib.sha256(raw).hexdigest(),values=base64.b64encode(raw).decode())
(ROOT/'src/earth-elevation.json').write_text(json.dumps(asset,separators=(',',':'))+'\n')
root=ROOT/'public/globe';root.mkdir(parents=True,exist_ok=True)
manifest={'version':1,'source':URL,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'elevationSamples':[4321,2161],'verticalExaggeration':25,'textures':{},'files':{}}
def save(image,role):
 temporary=CACHE/(role+'.webp');image.save(temporary,'WEBP',lossless=role.startswith('normal'),quality=94,method=4)
 data=temporary.read_bytes();sha=hashlib.sha256(data).hexdigest();name=f'{role}-{sha[:12]}.webp'
 (root/name).write_bytes(data);manifest['textures'][role]=name
 manifest['files'][name]={'sha256':sha,'bytes':len(data),'width':image.width,'height':image.height}
 print(f'{role}: {image.width} × {image.height}, {len(data):,} bytes',flush=True)

def mask_for(records,width,height):
 mask=Image.new('L',(width,height));draw=ImageDraw.Draw(mask)
 for record in records:
  for ring in record['rings']:
   draw.polygon([((lon+180)/360*width,(90-lat)/180*height) for lon,lat in ring],fill=255)
 return mask
countries=json.loads((ROOT/'src/geography-data.json').read_text());terrain=json.loads((ROOT/'src/geography-terrain.json').read_text())
W,H=8192,4096
land=mask_for(countries,W,H)
arid=np.asarray(mask_for([r for r in terrain if r['kind']=='Desert'],W,H).filter(ImageFilter.GaussianBlur(16)),dtype=np.float32)/255
# Sample pixel centers with an exact equirectangular mapping and a wrapped seam.
from scipy.ndimage import map_coordinates
def sampled(width,height):
 x=(np.arange(width,dtype=np.float32)+.5)/width*(heights.shape[1]-1)
 y=(1-(np.arange(height,dtype=np.float32)+.5)/height)*(heights.shape[0]-1)
 result=np.empty((height,width),dtype=np.float32)
 for start in range(0,height,128):
  xx,yy=np.meshgrid(x,y[start:start+128]);result[start:start+128]=map_coordinates(heights,[yy,xx],order=1,mode='nearest')
 return result
z=sampled(W,H);is_land=np.asarray(land)>127
colors=np.empty((H,W,3),dtype=np.uint8)
def mix(a,b,t):
 return a+(np.asarray(b,dtype=np.float32)-a)*np.clip(t,0,1)[...,None]
for y in range(0,H,128):
 e=z[y:y+128];lat=(90-(np.arange(y,min(H,y+128))+.5)/H*180)[:,None]
 latitude=np.maximum(0,np.abs(lat)-30)/35
 c=mix(np.array([72,117,83],dtype=np.float32),[144,153,102],np.broadcast_to(latitude,e.shape))
 c=mix(c,[191,159,101],arid[y:y+128])
 c=mix(c,[153,136,108],(e-650)/2600)
 c=mix(c,[204,199,180],(e-2600)/2600)
 snow=(lat<-60)|((lat>60)&(e>1000))|(e>4900)
 c=mix(c,[236,239,226],snow.astype(np.float32)*.95)
 sea=mix(np.array([39,117,139],dtype=np.float32),[12,46,69],(np.maximum(0,-e)/6500)**.48)
 colors[y:y+128]=np.clip(np.where(is_land[y:y+128,:,None],c,sea),0,255).astype(np.uint8)
color=Image.fromarray(colors);save(color,'color-8k');save(color.resize((4096,2048),Image.Resampling.LANCZOS),'color-4k')
del colors,color,z,arid,is_land
# Object-space normals from real slopes: sharp ridges without millions of extra triangles.
W,H=4096,2048
z=np.maximum(0,sampled(W,H));land_small=np.asarray(land.resize((W,H),Image.Resampling.NEAREST))>127
z[~land_small]=0
north,east=np.gradient(z,np.pi/H,2*np.pi/W);north=-north
lat=(np.pi/2-(np.arange(H,dtype=np.float32)+.5)/H*np.pi)[:,None]
lon=((np.arange(W,dtype=np.float32)+.5)/W*2*np.pi-np.pi)[None,:]
sl,cl,sp,cp=np.sin(lon),np.cos(lon),np.sin(lat),np.cos(lat)
# Coast cliffs from mismatched shorelines are avoided; open water remains smooth.
east=np.where(land_small,east,0)*25/(6371000*np.maximum(cp,.025));north=np.where(land_small,north,0)*25/6371000
nx=cp*sl-east*cl+north*sp*sl
ny=sp-north*cp
nz=cp*cl+east*sl+north*sp*cl
length=np.sqrt(nx*nx+ny*ny+nz*nz)
normals=np.stack([nx/length,ny/length,nz/length],axis=-1)
normal=Image.fromarray(np.rint((normals*.5+.5)*255).clip(0,255).astype(np.uint8));save(normal,'normal-4k');save(normal.resize((2048,1024),Image.Resampling.LANCZOS),'normal-2k')
if (root/'manifest.json').exists():
 previous=json.loads((root/'manifest.json').read_text())
 for key in ['detailSource','detailSamples','detailTiles','landCover']:
  if key in previous:manifest[key]=previous[key]
 manifest['files'].update({k:v for k,v in previous['files'].items() if k.startswith(('detail-','cover-'))})
 for key,value in previous.get('textures',{}).items():
  if key.startswith('cover-'):manifest['textures'][key]=value
(root/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
for p in root.glob('*.webp'):
 if not p.name.startswith('detail-') and p.name not in manifest['files']:p.unlink()
print(f'Baked from {heights.size:,} elevation samples; mesh grid {coarse.shape[1]} × {coarse.shape[0]}.',flush=True)
