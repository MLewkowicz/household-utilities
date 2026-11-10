"""Rebuild the bundled atlas from pinned public-domain Natural Earth / CIA data.
Downloads are explicit (this script only); the app never depends on these services.
"""
import html,json,re,math,urllib.request,tarfile,io
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
CACHE=ROOT/'.local/geography'
NE='https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_0_countries.geojson'
FACT_COMMIT='144d6977b2b01ac1cbd220de754c0a005616760b'
CACHE.mkdir(parents=True,exist_ok=True)
def download(url,path):
 if not path.exists():
  with urllib.request.urlopen(url,timeout=60) as r: path.write_bytes(r.read())
download(NE,CACHE/'countries.geojson')
archive=CACHE/('factbook-'+FACT_COMMIT+'.tar.gz');download('https://codeload.github.com/factbook/factbook.json/tar.gz/'+FACT_COMMIT,archive)
folder=CACHE/('factbook.json-'+FACT_COMMIT)
if not folder.exists():
 with tarfile.open(archive) as tar: tar.extractall(CACHE,filter='data')
def clean(s):return re.sub(r'\s+',' ',html.unescape(re.sub('<[^>]+>',' ',s or ''))).strip()
def val(o,*keys):
 for k in keys: o=o.get(k,{}) if isinstance(o,dict) else {}
 return clean(o.get('text','') if isinstance(o,dict) else o)
def norm(s):return re.sub('[^a-z0-9]','',s.lower())
files={p.stem:p for p in folder.glob('*/*.json')}
byname={}
for p in files.values():
 d=json.loads(p.read_text());name=val(d,'Government','Country name','conventional short form');byname[norm(name)]=p
# Natural Earth splits a few dependencies that the Factbook covers jointly.
parents={'CYN':'cy','SOL':'so','PSX':'we','ATF':'fs','BJN':'cn','SER':'rb','SDS':'od','SAH':'wi','KOS':'kv','IOA':'io','CSI':'at','ASH':'at','HMD':'hm','SJM':'sv','ALD':'fi'}
ALIASES={'USA':['USA','US','United States of America','America'],'GBR':['UK','Britain','Great Britain','United Kingdom'],'COD':['DR Congo','DRC','Congo Kinshasa','Democratic Republic of Congo'],'COG':['Republic of the Congo','Congo Brazzaville'],'CZE':['Czech Republic'],'CIV':['Ivory Coast'],'SWZ':['Swaziland'],'TUR':['Turkey','Türkiye'],'TLS':['East Timor','Timor Leste'],'CPV':['Cape Verde'],'FSM':['Micronesia','Federated States of Micronesia'],'MMR':['Burma'],'KOR':['South Korea','Republic of Korea'],'PRK':['North Korea','DPRK'],'RUS':['Russian Federation'],'VNM':['Viet Nam'],'LAO':['Lao PDR'],'MKD':['Macedonia'],'PSX':['Palestine','Palestinian Territories','West Bank and Gaza'],'VAT':['Vatican','Vatican City','Holy See'],'TWN':['Taiwan','Republic of China']}

def simplify(points,tolerance=.045):
 # Shared source vertices rounded identically; keep small islands intact.
 if len(points)<9:return points
 def distance(p,a,b):
  x,y=p;ax,ay=a;bx,by=b;dx=bx-ax;dy=by-ay
  t=max(0,min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy))) if dx or dy else 0
  return math.hypot(x-ax-t*dx,y-ay-t*dy)
 def dp(ps):
  if len(ps)<3:return ps
  dist,i=max((distance(p,ps[0],ps[-1]),i) for i,p in enumerate(ps[1:-1],1))
  return dp(ps[:i+1])[:-1]+dp(ps[i:]) if dist>tolerance else [ps[0],ps[-1]]
 out=dp(points)
 return out if len(out)>=4 else points
countries=[];missing=[]
for f in json.loads((CACHE/'countries.geojson').read_text())['features']:
 p=f['properties'];code=p['ADM0_A3'];name=p['NAME_EN'] or p['ADMIN']
 if code=='TUR':name='Türkiye'
 if code=='PSX':name='Palestine'
 if code=='SWZ':name='Eswatini'
 file=files.get(p['FIPS_10'].lower()) or byname.get(norm(p['NAME_CIAWF'] or name)) or files.get(parents.get(code,''))
 d=json.loads(file.read_text()) if file else {}
 parent_profile=code in ['ALD','CYN','SOL','KAS']
 if parent_profile:d={}
 if not file:missing.append((code,name))
 capital=val(d,'Government','Capital','name') or 'No permanent capital'
 population=val(d,'People and Society','Population','total') or val(d,'People and Society','Population')
 if not population:population=f"{int(p['POP_EST']):,} ({p['POP_YEAR']} estimate)" if p['POP_EST']>=0 else 'No permanent population'
 background=val(d,'Introduction','Background').replace('U.S.','United States').replace('U.K.','United Kingdom').replace('B.C.','BCE').replace('A.D.','CE')
 sentences=[s.strip() for s in re.split(r'(?<=[.!?])\s+(?=[A-Z0-9“\"])',background) if len(s.strip())>35]
 def rank(pair):
  i,s=pair
  return 12*bool(re.search(r'genocide|Holocaust|enslav|slave trade',s,re.I))+7*bool(re.search(r'empire|independen|colonial|coloniz|partition|reunif|revolution|World War',s,re.I))+3*bool(re.search(r'\b\d{3,4}\b',s))+2*(i==0)-len(s)/900
 selected=sorted(sorted(enumerate(sentences),key=rank,reverse=True)[:4])
 facts=[s for i,s in selected]
 geometry=f['geometry'];polys=geometry['coordinates'] if geometry['type']=='MultiPolygon' else [geometry['coordinates']]
 rings=[[[round(x,3),round(y,3)] for x,y in simplify(ring)] for poly in polys for ring in poly]
 aliases=list(dict.fromkeys([name,p['ADMIN'],p['NAME_LONG'],p['FORMAL_EN'],p['NAME_ALT'],*ALIASES.get(code,[])]));aliases=[a for a in aliases if a and a!='-99']
 countries.append(dict(id=code,name=name,aliases=aliases,continent=p['CONTINENT'],region=p['SUBREGION'],type=p['TYPE'],sovereign=p['SOVEREIGNT'],center=[p['LABEL_X'],p['LABEL_Y']],rings=rings,capital=capital,population=population,terrain=val(d,'Geography','Terrain'),facts=facts,background=background,source=str(file.relative_to(folder)) if file else 'Natural Earth'))
# Dependencies absent from the Factbook receive explicit geographic context, not a parent's history.
OVERRIDES={
 'ALD':('Mariehamn',['The Åland Islands became part of the Grand Duchy of Finland within the Russian Empire in 1809.','The 1921 League of Nations settlement kept Åland under Finnish sovereignty with guarantees for its Swedish language and autonomy.','The islands have been demilitarized since 1856.']),
 'CYN':('North Nicosia',['Cyprus gained independence from British rule in 1960.','The island has been divided since 1974, following a Greek-backed coup and a Turkish military intervention.','The Turkish Republic of Northern Cyprus declared independence in 1983 and is recognized only by Türkiye.']),
 'SOL':('Hargeisa',['British Somaliland became independent in June 1960 and united with the former Italian Somaliland that July.','Somaliland declared the restoration of its independence in 1991 following civil war.','It has maintained its own governing institutions, while its international status remains disputed.']),
}
for c in countries:
 if c['id'] in OVERRIDES:c['capital'],c['facts']=OVERRIDES[c['id']];c['background']=' '.join(c['facts']);c['source']='Editorial context; see docs/geography-data.md'
 if not c['facts']:c['facts']=[f"{c['name']} is mapped in {c['region']}.",f"Natural Earth classifies this area as: {c['type'].lower()}."];c['background']=' '.join(c['facts'])
countries.sort(key=lambda c:c['name'])
(ROOT/'src/geography-data.json').write_text(json.dumps(countries,ensure_ascii=False,separators=(',',':'))+'\n')
print('Built',len(countries),'map entities;',sum(len(c['facts']) for c in countries),'historical/context excerpts. Missing Factbook profiles:',missing)
print('Atlas bytes:',(ROOT/'src/geography-data.json').stat().st_size)

# Physical regions keep relief decoration in the real mountain/desert/plateau locations.
terrain_url=NE.replace('ne_50m_admin_0_countries','ne_50m_geography_regions_polys')
download(terrain_url,CACHE/'terrain.geojson')
terrain=[]
for f in json.loads((CACHE/'terrain.geojson').read_text())['features']:
 kind=f['properties']['FEATURECLA']
 if kind not in ['Range/mtn','Desert','Plateau']:continue
 geometry=f['geometry'];polys=geometry['coordinates'] if geometry['type']=='MultiPolygon' else [geometry['coordinates']]
 rings=[[[round(x,2),round(y,2)] for x,y in simplify(ring,.13)] for poly in polys for ring in poly]
 terrain.append({'kind':kind,'rings':rings})
(ROOT/'src/geography-terrain.json').write_text(json.dumps(terrain,separators=(',',':'))+'\n')
print('Physical relief regions:',len(terrain))
