"""Build v2's edited, original puzzles. v1 stays pinned in migration 031.
Run this only while authoring version 2; released packs need a new version.
No network calls: outlines and country metadata use the pinned local atlas.
"""
import json, math, pathlib, random, runpy
root = pathlib.Path(__file__).resolve().parents[2]
source = runpy.run_path(str(pathlib.Path(__file__).with_name('curated-v2.py')))
rng = random.Random(20261112)
atlas = {c['id']: c for c in json.loads((root/'src/geography-data.json').read_text())}
base = 'https://github.com/factbook/factbook.json/blob/144d6977b2b01ac1cbd220de754c0a005616760b/'
allq = {k: [] for k in ['odd-one-out','passport-puzzle','clue-cascade','before-or-after','how-much-ish']}
def rows(key): return [row.split('|') for row in source[key].splitlines()]
def add(game, **q):
    q.update(id=f'{game}-v2-{len(allq[game])+1}', version=2)
    allq[game].append(q)
for tag, a, b, c, answer, explanation in rows('ODD'):
    options=[a,b,c,answer]; rng.shuffle(options)
    add('odd-one-out', kind='choice', tag=tag, prompt='Find the outsider.', options=options,
        answer=answer, explanation=explanation.replace('The first three','Three').replace('the first three','three'), sources=['Original category puzzle; the explanation states the classification rule.'])
for answer, a, b, c, d, explanation, aliases in rows('CLUES'):
    add('clue-cascade', kind='clues', prompt='What connects these clues?', clues=[a,b,c,d],
        answer=answer, aliases=aliases.split(';'), explanation=explanation, sources=['Original word-association puzzle.'])

def outline(country):
    # Keep significant islands, omit remote dependencies. Unwrap at the dateline.
    center=country['center'][0]
    def unwrap(lon): return center+(lon-center+180)%360-180
    rings=[[(unwrap(x),-y) for x,y in r] for r in country['rings']]
    area=lambda r: abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(r,r[1:]+r[:1]))/2)
    largest=max(rings,key=area); threshold=area(largest)*.025
    rings=[r for r in rings if area(r)>=threshold]
    # France's atlas includes overseas land; use the European mainland here.
    if country['id']=='FRA': rings=[r for r in rings if sum(x for x,y in r)/len(r)>-10]
    latitude=-sum(y for x,y in largest)/len(largest)
    rings=[[(x*math.cos(math.radians(latitude)),y) for x,y in r] for r in rings]
    points=[p for r in rings for p in r]; xmin=min(x for x,y in points); ymin=min(y for x,y in points)
    w=max(x for x,y in points)-xmin; h=max(y for x,y in points)-ymin; scale=260/max(w,h)
    path=' '.join('M'+'L'.join(f'{(x-xmin)*scale+10:.1f},{(y-ymin)*scale+10:.1f}' for x,y in r)+'Z' for r in rings)
    return dict(viewBox=f'0 0 {w*scale+20:.1f} {h*scale+20:.1f}',path=path)
for iso, code, landmark, second in rows('PLACES'):
    c=atlas[iso]
    add('passport-puzzle',kind='clues',prompt='Where is this?',outline=outline(c),
        clues=[landmark,second,'Region: '+c['region'],'Capital: '+c['capital']], answer=c['name'],aliases=c['aliases'],
        explanation=f"{c['name']} · {c['capital']}. {landmark} and {second[0].lower()+second[1:]} are clues to this destination.",
        sources=['https://whc.unesco.org/en/statesparties/'+code,base+c['source']])
# Mix categories before splitting. Practice events never appear in daily packs.
events=[dict(label=label,year=int(year),art=art,source=url) for label,year,art,url in rows('EVENTS')]
rng.shuffle(events)
daily_events,practice_events=events[:-20],events[-20:]
used={e['label']:0 for e in events}
for i in range(18):
    pool=daily_events if i<14 else practice_events
    candidates=rng.sample(pool,len(pool)); candidates.sort(key=lambda e:used[e['label']])
    chosen=[]
    for e in candidates:
        if any(e['year']==x['year'] for x in chosen): continue
        if sum(x['art']==e['art'] for x in chosen)>=2: continue
        chosen.append(e);used[e['label']]+=1
        if len(chosen)==5: break
    assert len(chosen)==5
    cards=[dict(id=f'event-{events.index(e)}',label=e['label'],art=e['art']) for e in chosen]
    answer=[f'event-{events.index(e)}' for e in sorted(chosen,key=lambda e:e['year'])]
    reveal={f'event-{events.index(e)}':e['year'] for e in chosen};rng.shuffle(cards)
    add('before-or-after',kind='timeline',prompt='Put these moments in order.',cards=cards,answer=answer,reveal=reveal,
        explanation='\n'.join(f"{e['year']} · {e['label']}" for e in sorted(chosen,key=lambda e:e['year'])),sources=sorted({e['source'] for e in chosen}))
# Named objects, explicit dimensions, and actual silhouettes. Animal sizes are
# deliberately described as upper sizes, not a falsely precise typical adult.
objects=[]
def obj(name,value,shape,dimension,url):
    o=dict(name=name,value=value,shape=shape,dimension=dimension,source=url);objects.append(o);return o
obj('A large male giraffe',5.5,'giraffe','height, up to','https://animals.sandiegozoo.org/animals/giraffe')
obj('A large male ostrich',2.7,'ostrich','height, up to','https://animals.sandiegozoo.org/animals/ostrich')
obj('An Antarctic blue whale',33.5,'whale','length, up to','https://www.fisheries.noaa.gov/species/blue-whale')
obj('SUE the T. rex',12.2,'trex','approximate length','https://www.fieldmuseum.org/blog/sue-t-rex')
obj('Boeing 747-8',76.3,'plane','nose-to-tail length','https://www.lufthansagroup.com/en/company/fleet/lufthansa-and-regional-partners/boeing-747-8.html')
obj('Boeing 737-800',39.5,'plane','nose-to-tail length','https://www.boeing.com/commercial/737ng')
obj('Saturn V with Apollo',111,'rocket','height','https://www.nasa.gov/learning-resources/for-kids-and-students/what-was-the-saturn-v-grades-5-8/')
obj('Space Shuttle orbiter',37.24,'shuttle','nose-to-tail length','https://ntrs.nasa.gov/api/citations/19940023701/downloads/19940023701.pdf')
obj('Eiffel Tower, with antennas',330,'tower','height, 2026 reference','https://www.toureiffel.paris/en/the-monument/key-figures')
obj('Statue of Liberty, ground to torch',92.99,'statue-base','height','https://www.nps.gov/stli/learn/historyculture/statue-statistics.htm')
obj('Elizabeth Tower',96,'clocktower','approximate height','https://www.parliament.uk/about/living-heritage/building/palace/big-ben/facts-figures/')
obj('Gateway Arch',192.024,'arch','height','https://www.nps.gov/places/directly-below-the-gateway-arch.htm')
obj('RMS Titanic',269,'ship','approximate length','https://www.ireland.com/en/magazine/long-reads/belfasts-titanic-legacy/')
# These visible reference dimensions are chosen yardsticks, not species averages.
references=[dict(name=n,value=v,shape=s,dimension=d,source='Defined reference dimension, shown before answering.') for n,v,s,d in [('A person',1.75,'human','height'),('A doorway',2.03,'door','height'),('A city bus',12,'bus','length'),('A car',4.5,'car','length')]]
references+=objects
used_pairs=set()
# Round-robin targets avoid repeating the same thing throughout a round.
while len(allq['how-much-ish'])<90:
    for target in rng.sample(objects,len(objects)):
        eligible=[r for r in references if r!=target and (target['name'],r['name']) not in used_pairs and .075<target['value']/r['value']<18]
        if not eligible: continue
        ref=rng.choice(eligible);used_pairs.add((target['name'],ref['name']))
        ratio=target['value']/ref['value']
        public=lambda o:{k:v for k,v in o.items() if k not in ('value','source')}
        reference=public(ref);reference['measure']=f"{ref['value']:g} m · {ref['dimension']}"
        add('how-much-ish',kind='scale',prompt=f"How big is {target['name'][0].lower()+target['name'][1:] if target['name'].startswith(('A ','An ')) else target['name']}?",target=public(target),reference=reference,bounds=[.05,20],answer=ratio,
            explanation=f"{target['name']}: {target['value']:g} m ({target['dimension']}). {ref['name']}: {ref['value']:g} m. The target dimension is {ratio:.2f}× the reference dimension.",sources=list(dict.fromkeys([target['source'],ref['source']])))
        if len(allq['how-much-ish'])==90: break
records=[]
for game,qs in allq.items():
    if game in ['odd-one-out','passport-puzzle','clue-cascade']: rng.shuffle(qs)
    count=1 if game=='before-or-after' else 5
    for day in range(14):records.append(dict(game=game,slot=day,version=2,questions=qs[day*count:(day+1)*count]))
    practice=qs[14*count:14*count+(4 if count==1 else 20)]
    assert len(practice)==(4 if count==1 else 20),(game,len(qs))
    (root/f'src/trivia/{game}.json').write_text(json.dumps(practice,ensure_ascii=False,indent=2)+'\n')
(root/'scripts/trivia/daily-packs.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n')
# Preserve the v1 payloads and ongoing attempts. New starts use v2.
old=(root/'supabase/migrations/031_observatory_trivia.sql').read_text()
state=old[old.index('CREATE FUNCTION ledger_private.trivia_state'):old.index('CREATE FUNCTION public.utilities_trivia_action')]
state=state.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION').replace("q-'answer'-'aliases'-'explanation'-'sources'","q-'answer'-'aliases'-'explanation'-'sources'-'reveal'").replace('AND version=1','AND version=2').replace('player,game,day,slot) VALUES','player,game,day,slot,version) VALUES').replace("p->>'game',d,s)","p->>'game',d,s,2)")
state=state.replace('s integer;', 's integer;v integer;').replace("s:=((d-DATE '2026-11-09')%14+14)%14;","s:=((d-DATE '2026-11-09')%14+14)%14;\n SELECT coalesce(min(version),2) INTO v FROM ledger_private.trivia_attempts WHERE game=p->>'game' AND day=d;").replace('AND version=2','AND version=v').replace("p->>'game',d,s,2)","p->>'game',d,s,v)")
sql='-- Original v2 puzzles. Additive: v1 attempts keep their pinned questions.\nBEGIN;\n'+state
for p in records:
    payload=json.dumps(p['questions'],ensure_ascii=False,separators=(',',':')).replace("'","''")
    sql+=f"INSERT INTO ledger_private.trivia_packs VALUES ('{p['game']}',{p['slot']},2,'{payload}'::jsonb);\n"
sql+='''CREATE OR REPLACE FUNCTION public.utilities_trivia_capabilities() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT '{"version":2,"games":5,"daily_packs":14}'::jsonb;$$;
CREATE FUNCTION ledger_private.trivia_content_v2() RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT 2;$$;
COMMIT;
'''
(root/'supabase/migrations/032_observatory_puzzles_v2.sql').write_text(sql)
print(f'Built {len(records)} v2 daily packs and 84 practice puzzles; {len(events)} timeline events.')
