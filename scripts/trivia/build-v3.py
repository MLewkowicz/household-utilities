"""Build original Common Ground boards and measured-silhouette comparisons.
V1/V2 packs remain immutable so deployed attempts can finish normally.
"""
import json,random,runpy,itertools
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
HERE=Path(__file__).resolve().parent
rng=random.Random(303)
boards=[]
for i,board in enumerate(runpy.run_path(str(HERE/'groups-v3.py'))['BOARDS'].split('\n\n')):
 groups=[]
 for j,line in enumerate(board.splitlines()):
  label,words=line.split('|');groups.append(dict(id=str(j),label=label,words=words.split(',')))
 words=[w for g in groups for w in g['words']]
 assert len(groups)==4 and all(len(g['words'])==4 for g in groups) and len(set(words))==16
 rng.shuffle(words)
 boards.append(dict(id=f'common-ground-v3-{i+1}',version=3,kind='groups',prompt='Find four groups of four.',words=words,groups=groups,answer=[g['id'] for g in groups],explanation='\n'.join(f"{g['label']}: {', '.join(g['words'])}" for g in groups),sources=['Original household wordplay and category boards; not copied from another game.']))
# Keep future practice additions from reshuffling size comparisons.
rng=random.Random(304)
objects=runpy.run_path(str(HERE/'size-v3.py'))['OBJECTS']
art=json.loads((ROOT/'src/size-art.json').read_text())
pairs=[(a,b) for a,b in itertools.combinations(objects,2) if max(a[3],b[3])/min(a[3],b[3])<=60 and not(a[0] in ['human','school-bus'] and b[0] in ['human','school-bus'])]
rng.shuffle(pairs);assert len(pairs)>=90,len(pairs)
scales=[]
for i,(a,b) in enumerate(pairs[:90]):
 if a[0] in ['human','school-bus'] or (b[0] not in ['human','school-bus'] and rng.random()<.5):a,b=b,a
 ratio=a[3]/b[3]
 def obj(o):return dict(name=o[1],dimension=o[2],shape='sourced:'+o[0])
 target=obj(a);ref=obj(b);ref['measure']=f'{b[3]:g} m · {b[2]}'
 scales.append(dict(id=f'how-much-ish-v3-{i+1}',version=3,kind='scale',prompt=f'Resize the {a[1].lower()} to match its real size.',target=target,reference=ref,bounds=[.01,100],answer=round(ratio,8),explanation=f'{a[1]}: {a[3]:g} m ({a[2]}). {b[1]}: {b[3]:g} m ({b[2]}). Ratio: {ratio:.2f}×.\n{a[5]}',sources=[a[4],b[4],art[a[0]]['source'],art[b[0]]['source']]))
packs=[dict(game='clue-cascade',slot=i,version=3,questions=[q]) for i,q in enumerate(boards[:14])]+[dict(game='how-much-ish',slot=i,version=3,questions=scales[i*5:i*5+5]) for i in range(14)]
for game,qs in [('clue-cascade',boards[14:]),('how-much-ish',scales[70:])]:
 (ROOT/f'src/trivia/{game}.json').write_text(json.dumps(qs,ensure_ascii=False,indent=2)+'\n')
(HERE/'daily-packs-v3.json').write_text(json.dumps(packs,ensure_ascii=False,indent=2)+'\n')
sql=(HERE/'v3-functions.sql').read_text()
for p in packs:
 value=json.dumps(p['questions'],ensure_ascii=False).replace("'","''")
 sql+=f"INSERT INTO ledger_private.trivia_packs VALUES ('{p['game']}',{p['slot']},3,'{value}'::jsonb);\n"
(ROOT/'supabase/migrations/033_observatory_games_v3.sql').write_text(sql+'COMMIT;\n')
print(f'{len(boards)} word boards; {len(scales)} unique measured comparisons; {len(packs)} daily packs')
