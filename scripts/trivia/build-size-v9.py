"""Curated comparisons: familiar objects, natural wonders and fictional scale."""
import json,runpy,random,itertools
from pathlib import Path
root=Path(__file__).resolve().parents[2]
objects={}
for x in runpy.run_path(str(root/'scripts/trivia/size-v3.py'))['OBJECTS']:
 id,name,dimension,meters,source,note=x;objects[id]=dict(name=name,dimension=dimension,meters=meters,source=source,note=note,shape='sourced:'+id,category='nature' if id not in ['human','school-bus','statue-of-liberty','eiffel-tower'] else 'familiar')
for x in runpy.run_path(str(root/'scripts/trivia/size-v4.py'))['OBJECTS']:
 id,name,dimension,meters,source,note,category,*_=x
 if id in ['iphone-16','concert-grand','ingenuity','perseverance','webb','table-tennis','basketball-court']:continue
 objects[id]=dict(name=name,dimension=dimension,meters=meters,source=source,note=note,shape='sourced:'+id,category=category)
art={}
def add(id,name,dimension,meters,source,note,category,axis,svg,width=100,height=100):
 objects[id]=dict(name=name,dimension=dimension,meters=meters,source=source,note=note,shape='sourced:'+id,category=category)
 art[id]=dict(art=svg,axis=axis,source=source,author='Household',license='CC0',bounds=dict(width=width,height=height))
add('earth','Earth','equatorial diameter',12756000,'https://science.nasa.gov/earth/facts/','Earth’s equatorial diameter is about 12,756 km.','cosmic','length','<circle cx="50" cy="50" r="50"/><path d="M27 8 17 21 27 31 22 42 36 50 44 70 38 88M61 3 56 17 69 27 65 40 80 49 76 65 85 75" fill="none" stroke="var(--game-paper,#f7f0db)" stroke-width="3"/>')
add('moon','The Moon','mean diameter',3474800,'https://science.nasa.gov/wp-content/uploads/2023/05/ladee-press-kit-08292013.pdf','The Moon’s mean diameter is about 3,474.8 km.','cosmic','length','<circle cx="50" cy="50" r="50"/><g fill="none" stroke="var(--game-paper,#f7f0db)" stroke-width="2"><circle cx="28" cy="32" r="10"/><circle cx="68" cy="64" r="16"/><circle cx="70" cy="24" r="6"/></g>')
add('mars','Mars','equatorial diameter',6792000,'https://science.nasa.gov/solar-system/planets/planet-sizes-and-locations-in-our-solar-system/','Mars’s equatorial diameter is about 6,792 km.','cosmic','length','<circle cx="50" cy="50" r="50"/><path d="m15 52 20 5 17-9 28 11" fill="none" stroke="var(--game-paper,#f7f0db)" stroke-width="3"/>')
add('death-star','Death Star I','equatorial diameter',160000,'https://www.starwars.com/news/star-wars-inside-intel-the-death-star','The first Death Star in A New Hope: the current official reference gives a diameter of 160 km. Fictional.','fiction','length','<circle cx="50" cy="50" r="50"/><path d="M1 50H99" fill="none" stroke="var(--game-paper,#f7f0db)" stroke-width="2"/><circle cx="65" cy="29" r="14" fill="none" stroke="var(--game-paper,#f7f0db)" stroke-width="3"/>')
add('falcon','Millennium Falcon','overall length',34.75,'https://www.starwars.com/databank/millennium-falcon','The Millennium Falcon is 34.75 m long in the official databank. Fictional; shown from above.','fiction','length','<path d="M0 50 29 28Q54 5 78 26L87 18 96 24 88 35Q108 63 85 86Q56 109 28 85L0 72 29 62 29 58Z"/>',100,88)
add('at-at','AT-AT walker','height',22.5,'https://www.starwars.com/databank/at-at-walker','The original Imperial AT-AT stands 22.5 m tall. Fictional.','fiction','height','<path d="M13 0H64L72 9V16L89 19 96 27 94 36H78L68 28H60V39L64 59 70 94H75V100H60L54 64 50 42H46L39 64 38 94H44V100H29L30 61 32 40H25L21 64 17 94H22V100H7L11 61 14 38 6 27V8Z"/>',90,100)
add('star-destroyer','Imperial Star Destroyer','length',1600,'https://www.starwars.com/databank/imperial-star-destroyer/','The classic Imperial Star Destroyer is 1,600 m long. Fictional; shown from above.','fiction','length','<path d="M0 65 100 30V100Z"/><path d="M62 52H87V80H62Z" fill="none" stroke="var(--game-paper,#f7f0db)" stroke-width="2"/>',100,70)
add('executor','Darth Vader’s Executor','length',19000,'https://www.starwars.com/databank/executor','The Executor Super Star Destroyer is 19 km long. Fictional; shown from above.','fiction','length','<path d="M0 73 100 46 90 73 100 100Z"/><path d="M42 73 83 60 78 73 83 86Z" fill="none" stroke="var(--game-paper,#f7f0db)" stroke-width="2"/>',100,54)
add('banana','Banana','reference length',.18,'Reference chosen for comparison: an 18 cm banana.','An 18 cm banana reference. Real bananas vary.','familiar','length','<path d="M0 26Q14 83 81 61L91 54 100 58 96 70Q38 122 9 68Z"/>',100,74)
add('door','Door','reference height',2,'Reference chosen for comparison: a two-metre door.','A two-metre door reference; doors vary.','familiar','height','<path d="M25 0H75V100H25Z"/><circle cx="65" cy="53" r="3" fill="var(--game-paper,#f7f0db)"/>',50,100)
# Pick recognizable contrasts; no specialist tools or product models.
featured=[('death-star','earth'),('at-at','eiffel-tower'),('blue-whale','falcon'),('t-rex','school-bus'),('banana','human'),('moon','earth'),('saturn-v','eiffel-tower'),('human','at-at'),('falcon','iss'),('star-destroyer','executor'),('giraffe','at-at'),('golf-ball','banana'),('statue-of-liberty','saturn-v'),('mars','earth'),('blue-whale','a380'),('executor','death-star'),('at-at','statue-of-liberty'),('t-rex','falcon'),('quarter','dollar-note'),('african-elephant','school-bus')]
pairs=list(featured);seen={frozenset(p) for p in pairs}
candidates=[]
for a,b in itertools.combinations(objects,2):
 x,y=objects[a],objects[b]
 if x['category']==y['category'] or frozenset((a,b)) in seen:continue
 if x['meters']>y['meters']:a,b=b,a;x,y=y,x
 ratio=x['meters']/y['meters']
 if .02<=ratio<=.95:candidates.append((a,b))
random.Random(901).shuffle(candidates)
pairs+=candidates
# Half of the rounds with similarly sized things ask the player to enlarge the target.
for i,(a,b) in enumerate(pairs):
 if i>=len(featured) and i%2==0 and objects[a]['meters']/objects[b]['meters']>.72:pairs[i]=(b,a)
def question(i,pair):
 a,b=(objects[k] for k in pair);ratio=a['meters']/b['meters']
 def item(o,ref=False):return dict(name=o['name'],dimension=o['dimension'],shape=o['shape'],**({'measure':f"{o['meters']:g} m"} if ref else {}))
 return dict(id=f'size-v9-{i}',version=9,kind='scale',prompt=f"How big is {a['name']}?",target=item(a),reference=item(b,True),bounds=[.002,1.4],answer=round(ratio,10),explanation=f"{a['name']}: {a['meters']:g} m ({a['dimension']}). {b['name']}: {b['meters']:g} m ({b['dimension']}).\n{a['note']}\n{b['note']}",sources=[a['source'],b['source']])
questions=[question(i,p) for i,p in enumerate(pairs)]
practice=questions[:50];daily=questions[50:]
packs=[(daily[i:i+5] if len(daily[i:i+5])==5 else daily[i:]+daily[:5-len(daily[i:])]) for i in range(0,len(daily),5)]
(root/'src/trivia/how-much-ish.json').write_text(json.dumps(practice,indent=2)+'\n')
profiles=json.loads((root/'src/size-art.json').read_text());profiles.update(art);(root/'src/size-art.json').write_text(json.dumps(profiles,indent=2)+'\n')
quote=lambda value:"'"+json.dumps(value,separators=(',',':'),ensure_ascii=False).replace("'","''")+"'::jsonb"
sql='-- Curated real and fictional size comparisons; keep all older versions.\nBEGIN;\n'
for slot,pack in enumerate(packs):sql+=f"INSERT INTO ledger_private.trivia_packs(game,slot,version,questions) VALUES('how-much-ish',{slot},9,{quote(pack)});\n"
# Saved starter attempts already own their questions and are deliberately untouched.
for i in range(10):sql+=f"UPDATE ledger_private.game_starter_packs SET questions={quote(practice[i*5:i*5+5])} WHERE game='how-much-ish' AND slot={i+1};\n"
sql+="CREATE FUNCTION ledger_private.size_editorial_version() RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT 9;$$;\n"
sql+="CREATE OR REPLACE FUNCTION public.utilities_trivia_capabilities() RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$ SELECT jsonb_build_object('version',7,'games',7,'groups',true,'size_objects',"+str(len(objects))+",'online_sync',true,'online_seed',1,'archive',true,'grid_puzzles',true,'photo_silhouettes',true,'passport_editorial',2,'timed_grids',true,'size_editorial',9);$$;\nCOMMIT;\n"
(root/'supabase/migrations/047_size_editorial.sql').write_text(sql)
print(len(objects),'objects,',len(practice),'starter comparisons,',len(packs),'daily boards')
