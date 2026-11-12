"""Pinned public-domain city positions and country-border graph for globe games.
Run after build-geography.py and build-capitals.py. Downloads only during explicit data generation.
"""
import json,re,unicodedata,collections,subprocess,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];CACHE=ROOT/'.local/geography'
atlas=json.loads((ROOT/'src/geography-data.json').read_text());answers=json.loads((ROOT/'src/geography-capitals.json').read_text())
NE='https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_populated_places_simple.geojson'
if not (CACHE/'cities.geojson').exists():subprocess.run(['curl','-fLs',NE,'-o',str(CACHE/'cities.geojson')],check=True)
places=json.loads((CACHE/'cities.geojson').read_text())['features']
FACT='144d6977b2b01ac1cbd220de754c0a005616760b'
def norm(s):return re.sub('[^a-z0-9]','',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower()).replace('saint','st')
cities={};missing=[]
for c in atlas:
 if c['id'] not in answers:continue
 entry=answers[c['id']];city=entry['names'][0];names={norm(n) for n in entry['aliases']}
 matches=[f for f in places if f['properties']['adm0_a3']==c['id'] and any(norm(f['properties'].get(k) or '') in names for k in ['name','nameascii','namealt'])]
 if matches:
  f=sorted(matches,key=lambda f:(not any(norm(f['properties'].get(k) or '')==norm(city) for k in ['name','nameascii','namealt']),-f['properties']['pop_max']))[0];coords=f['geometry']['coordinates'];source=NE
 else:
  path=CACHE/('factbook.json-'+FACT)/c.get('source','missing');data=json.loads(path.read_text()) if path.is_file() else {};cap=data.get('Government',{}).get('Capital',{})
  raw=cap.get('geographic coordinates',{}).get('text','');old=cap.get('name',{}).get('text','')
  m=re.search(r'(\d+)\s+(\d+)\s+([NS]),\s*(\d+)\s+(\d+)\s+([EW])',raw)
  if not m or not any(norm(n) in norm(old) for n in entry['aliases']):missing.append((c['id'],city));continue
  a,b,ns,d,e,ew=m.groups();coords=[(int(d)+int(e)/60)*(-1 if ew=='W' else 1),(int(a)+int(b)/60)*(-1 if ns=='S' else 1)];source='https://github.com/factbook/factbook.json/blob/'+FACT+'/'+c['source']
 cities[c['id']]={'id':c['id'],'name':city,'lon':round(coords[0],6),'lat':round(coords[1],6),'source':source}
# Distinct territories must not inherit the sovereign's capital position.
for id,name,lon,lat in [('ALD','Mariehamn',19.9348,60.0973),('CYN','North Nicosia',33.3615,35.1856),('SOL','Hargeisa',44.065,9.5624)]:
 match=next((f for f in places if norm(f['properties']['name'])==norm(name.replace('North ',''))),None)
 if match and id!='CYN':lon,lat=match['geometry']['coordinates']
 cities[id]={'id':id,'name':name,'lon':lon,'lat':lat,'source':'https://en.wikipedia.org/wiki/North_Nicosia' if id=='CYN' else NE}
cities['GNQ']={'id':'GNQ','name':'Ciudad de la Paz','lon':10.8225,'lat':1.588889,'source':'https://en.wikipedia.org/wiki/Ciudad_de_la_Paz'}
# Keep the original capital IDs stable; major cities receive their own IDs.
roles={'ZAF':'administrative','BOL':'constitutional','SWZ':'administrative','LKA':'legislative'}
for id,city in cities.items():city.update(countryId=id,capital=True,capitalRole=roles.get(id,''))
by_country={c['id']:c for c in atlas}
def distance(a,b):
 lat1,lat2=math.radians(a['lat']),math.radians(b['lat']);dl=math.radians(a['lon']-b['lon'])
 return 6371*2*math.asin(min(1,math.sqrt(math.sin((lat1-lat2)/2)**2+math.cos(lat1)*math.cos(lat2)*math.sin(dl/2)**2)))
for country in atlas:
 id=country['id'];picked=[c for c in cities.values() if c['countryId']==id]
 candidates=sorted((f for f in places if f['properties']['adm0_a3']==id and (f['properties']['pop_max']>=500000 or any(norm(f['properties']['name'])==norm(n) for n in answers.get(id,{}).get('names',[])[1:]))),key=lambda f:(f['properties']['scalerank'],-f['properties']['pop_max']))
 count=0
 for f in candidates:
  if count>=8:break
  p=f['properties'];name=p['name'];name={'Shenyeng':'Shenyang','Port Elizabeth':'Gqeberha','Odessa':'Odesa','St.  Petersburg':'Saint Petersburg','Bandjarmasin':'Banjarmasin'}.get(name,name);lon,lat=f['geometry']['coordinates']
  city={'id':id+'_'+norm(p.get('nameascii') or name).upper(),'countryId':id,'name':name,'lon':round(lon,6),'lat':round(lat,6),'capital':False,'capitalRole':'','source':NE}
  # Delhi/New Delhi and same-metropolitan-area suburbs are not competing targets.
  additional_capital=any(norm(name)==norm(n) for n in answers.get(id,{}).get('names',[])[1:])
  if any(norm(c['name'])==norm(name) or distance(c,city)<12 and not additional_capital for c in picked):continue
  city['capitalRole']={('ZAF','Cape Town'):'legislative',('ZAF','Bloemfontein'):'judicial',('BOL','La Paz'):'seat of government',('SWZ','Lobamba'):'royal and legislative',('LKA','Colombo'):'executive and judicial',('MSR','Brades'):'seat of government'}.get((id,name),'')
  if name=='Gqeberha':city.update(note='Formerly known as Port Elizabeth.',nameSource='https://www.gov.za/news/media-statements/sport-arts-and-culture-transformation-our-heritage-landscape-25-feb-2021')
  cities[city['id']]=city;picked.append(city);count+=1
(ROOT/'src/geography-cities.json').write_text(json.dumps(cities,ensure_ascii=False,indent=2)+'\n')
missing=[item for item in missing if item[0] not in cities]
assert not missing, 'Unmatched capitals: '+str(missing)
print('Cities:',len(cities))
# Shared original edges preserve small borders lost in simplified display rings.
ids=set(re.search(r"COUNTRY_IDS=new Set\('([^']+)'",(ROOT/'src/geography.ts').read_text()).group(1).split())
ne=json.loads((CACHE/'countries.geojson').read_text())['features'];edges=collections.defaultdict(set);graph={id:set() for id in ids}
for f in ne:
 id=f['properties']['ADM0_A3']
 if id not in ids:continue
 geom=f['geometry'];polys=geom['coordinates'] if geom['type']=='MultiPolygon' else [geom['coordinates']]
 for poly in polys:
  for ring in poly:
   for a,b in zip(ring,ring[1:]):
    key=tuple(sorted((tuple(round(x,5) for x in a),tuple(round(x,5) for x in b))))
    if key[0]!=key[1]:edges[key].add(id)
for owners in edges.values():
 for a in owners:
  for b in owners:
   if a!=b:graph[a].add(b)
# No overseas/exclave shortcuts across unconnected landmasses.
for a,b in [('FRA','BRA'),('FRA','SUR'),('RUS','POL'),('RUS','LTU'),('ESP','MAR')]:graph[a].discard(b);graph[b].discard(a)
# The 150 m Kazungula boundary is too small for Natural Earth's 1:50m geometry.
graph['BWA'].add('ZMB');graph['ZMB'].add('BWA')
def shortest(a,b):
 seen={a};q=collections.deque([[a]])
 while q:
  path=q.popleft()
  if path[-1]==b:return path
  for next in sorted(graph[path[-1]]):
   if next not in seen:seen.add(next);q.append(path+[next])
 return []
PAIRS='''PRT POL;ESP AUT;FRA ROU;BEL HRV;NLD ITA;DNK SVK;NOR UKR;SWE DEU;ITA CZE;CHE BGR;POL GRC;FIN HUN;AUT ALB;IRL DEU;GBR ITA;SEN GHA;MAR EGY;GHA CMR;NAM KEN;ZAF AGO;ZMB SOM;ETH COG;TUN TCD;BEN TZA;BFA UGA;GIN NER;MWI GAB;EGY ZAF;CAN HND;USA PAN;MEX CRI;GTM PAN;SLV NIC;CHL COL;PER URY;ECU ARG;BOL GUY;VEN PRY;SUR PER;COL URY;NPL THA;IND VNM;PAK KHM;IRN CHN;TUR NPL;KAZ IRQ;LAO BGD;MNG AFG;JOR GEO;OMN ARM'''
byid={c['id']:c for c in atlas};puzzles=[]
for pair in PAIRS.split(';'):
 a,b=pair.strip().split();path=shortest(a,b)
 if len(path)<3:print('Skipping short/disconnected:',a,b,path);continue
 region=byid[a]['continent'] if all(byid[c]['continent']==byid[a]['continent'] for c in path) else 'World'
 puzzles.append({'id':len(puzzles),'start':a,'end':b,'region':region,'minimum':len(path)-1,'solution':path})
result={'version':1,'source':'https://github.com/nvkelso/natural-earth-vector/blob/v5.1.2/geojson/ne_50m_admin_0_countries.geojson','neighbors':{id:sorted(v) for id,v in sorted(graph.items()) if v},'puzzles':puzzles}
(ROOT/'src/geography-routes.json').write_text(json.dumps(result,indent=2)+'\n')
print('Border pairs:',sum(len(v) for v in graph.values())//2,'route puzzles:',len(puzzles));print('Key borders:',{id:sorted(graph[id]) for id in ['FRA','ITA','BWA','ZMB','PAK','IND','POL']})
