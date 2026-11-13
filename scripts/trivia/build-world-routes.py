"""Append global routes without renumbering the 48 released puzzles."""
import json,re
from pathlib import Path
from collections import deque
path=Path('src/geography-routes.json');data=json.loads(path.read_text())
legacy=data.setdefault('legacyNeighbors',data['neighbors'])
graph={k:list(v) for k,v in legacy.items()}
for a,b in [('FRA','GBR'),('DNK','SWE'),('MYS','SGP')]:
 graph.setdefault(a,[]).append(b);graph.setdefault(b,[]).append(a)
# Detached exclaves cannot be used as through-country shortcuts.
for a,b in [('TUR','AZE'),('AGO','COG'),('EGY','PSX')]:
 if b in graph.get(a,[]):graph[a].remove(b)
 if a in graph.get(b,[]):graph[b].remove(a)
for id in re.search(r"COUNTRY_IDS=new Set\('([^']+)'",Path('src/geography.ts').read_text())[1].split():graph.setdefault(id,[])
graph={k:sorted(set(v)) for k,v in graph.items()};data['neighbors']=graph

def route(a,b):
 queue=deque([[a]]);seen={a}
 while queue:
  p=queue.popleft()
  if p[-1]==b:return p
  for n in graph.get(p[-1],[]):
   if n not in seen:seen.add(n);queue.append(p+[n])
 return []
# Interleave continents and longer journeys, starting with ten varied starter boards.
pairs=[('PRT','THA'),('CAN','ARG'),('MAR','ZAF'),('GBR','IND'),('MEX','CHL'),('SEN','ETH'),('NOR','VNM'),('EGY','NAM'),('FRA','SGP'),('GTM','URY'),
('IRL','NPL'),('GHA','SOM'),('CAN','CHL'),('ESP','KHM'),('ZAF','TUN'),('USA','URY'),('FIN','BGD'),('GIN','KEN'),('PAN','CHL'),('DEU','MYS'),
('PRT','ZAF'),('SWE','OMN'),('SEN','MOZ'),('CAN','PER'),('GBR','THA'),('MAR','TZA'),('USA','ARG'),('IRL','VNM'),('LBR','ETH'),('MEX','URY'),
('FRA','NPL'),('DZA','ZWE'),('HND','CHL'),('BEL','SGP'),('GMB','ZAF'),('CAN','BOL'),('NOR','PAK'),('CIV','KEN'),('CRI','ARG'),('ESP','MYS'),
('IRL','ZAF'),('PRT','BGD'),('TUN','MOZ'),('USA','PRY'),('DNK','KHM'),('SLE','SOM'),('MEX','PER'),('NLD','THA'),('GNB','ZMB'),('CAN','URY'),
('PRT','KOR'),('GBR','ZAF'),('SEN','MWI'),('BLZ','ARG'),('FRA','TLS'),('GIN','ZWE'),('USA','BOL'),('SWE','IND'),('MAR','UGA'),('GTM','CHL')]
old=[p for p in data['puzzles'] if p['id']<48]
new=[]
for a,b in pairs:
 p=route(a,b)
 if len(p)<4:raise ValueError((a,b,p))
 new.append(dict(id=48+len(new),start=a,end=b,region='World',minimum=len(p)-1,solution=p))
data['puzzles']=old+new
path.write_text(json.dumps(data,indent=2)+'\n')
# Used by the additive rules migration; no existing puzzle rows are overwritten.
quote=lambda v:"'"+json.dumps(v,separators=(',',':')).replace("'","''")+"'::jsonb"
sql='-- Global Border Trail catalog and playable connections.\n'
for a,b in [('FRA','GBR'),('DNK','SWE'),('MYS','SGP')]:
 a,b=sorted([a,b]);sql+=f"INSERT INTO ledger_private.geography_route_edges VALUES('{a}','{b}') ON CONFLICT DO NOTHING;\n"
for a,b in [('TUR','AZE'),('AGO','COG'),('EGY','PSX')]:
 a,b=sorted([a,b]);sql+=f"DELETE FROM ledger_private.geography_route_edges WHERE a='{a}' AND b='{b}';\n"
for p in new:sql+=f"INSERT INTO ledger_private.geography_route_puzzles VALUES({p['id']},'{p['start']}','{p['end']}',{p['minimum']},{quote(p['solution'])});\n"
Path('scripts/trivia/world-routes.sql').write_text(sql)
print(len(new),'global routes;',min(p['minimum']-1 for p in new),'to',max(p['minimum']-1 for p in new),'intermediate countries')
