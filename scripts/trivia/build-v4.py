"""Expand size comparisons without rewriting released v1–v3 packs or attempts."""
import json,random,runpy,itertools,collections
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];HERE=Path(__file__).resolve().parent
old=runpy.run_path(str(HERE/'size-v3.py'))['OBJECTS'];new=runpy.run_path(str(HERE/'size-v4.py'))['OBJECTS']
art=json.loads((ROOT/'src/size-art.json').read_text())
for o in new:
 id,label,dimension,meters,source,context,category,axis,path,width,height=o
 art[id]=dict(art=f'<path d="{path}" fill-rule="evenodd"/>',axis=axis,source=source,author='Household',license='CC0 1.0',original=True,bounds=dict(width=width,height=height))
(ROOT/'src/size-art.json').write_text(json.dumps(art,ensure_ascii=False,indent=2)+'\n')
objects=[(*o,'reference' if o[0] in ['human','school-bus'] else 'architecture' if o[0] in ['statue-of-liberty','eiffel-tower'] else 'nature') for o in old]+[o[:7] for o in new]
rng=random.Random(404);pairs=[(a,b) for a,b in itertools.combinations(objects,2) if max(a[3],b[3])/min(a[3],b[3])<=50 and not(a[6]==b[6]=='reference')]
rng.shuffle(pairs);usage=collections.Counter();ordered=[]
# Underused objects come first. Daily boards span several categories and don't repeat objects.
while pairs:
 used=set() if len(ordered)%5==0 else {o[0] for pair in ordered[-(len(ordered)%5):] for o in pair}
 options=[p for p in pairs if not any(o[0] in used for o in p)] or pairs
 pair=min(options,key=lambda p:(usage[p[0][0]]+usage[p[1][0]],p[0][6]==p[1][6]))
 ordered.append(pair);pairs.remove(pair)
 for o in pair:usage[o[0]]+=1
questions=[]
for i,(a,b) in enumerate(ordered):
 if a[6]=='reference' or b[6]!='reference' and rng.random()<.5:a,b=b,a
 ratio=a[3]/b[3]
 def obj(o):return dict(name=o[1],dimension=o[2],shape='sourced:'+o[0])
 ref=obj(b);ref['measure']=f'{b[3]:g} m · {b[2]}'
 questions.append(dict(id=f'how-much-ish-v4-{i+1}',version=4,kind='scale',prompt=f'Resize the {a[1].lower()} to match its real size.',target=obj(a),reference=ref,bounds=[.01,100],answer=round(ratio,8),explanation=f'{a[1]}: {a[3]:g} m ({a[2]}). {b[1]}: {b[3]:g} m ({b[2]}). Ratio: {ratio:.2f}×.\n{a[5]}',sources=[a[4],b[4]],tag=a[6].title()+' / '+b[6].title()))
assert len(questions)>250
packs=[dict(game='how-much-ish',slot=i,version=4,questions=questions[5*i:5*i+5]) for i in range(14)]
(HERE/'daily-packs-v4.json').write_text(json.dumps(packs,ensure_ascii=False,indent=2)+'\n')
(ROOT/'src/trivia/how-much-ish.json').write_text(json.dumps(questions[70:],ensure_ascii=False,indent=2)+'\n')
sql='BEGIN;\n'
for p in packs:
 value=json.dumps(p['questions'],ensure_ascii=False).replace("'","''")
 sql+=f"INSERT INTO ledger_private.trivia_packs VALUES ('how-much-ish',{p['slot']},4,'{value}'::jsonb);\n"
sql+='''CREATE OR REPLACE FUNCTION public.utilities_trivia_capabilities() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT '{"version":4,"games":5,"daily_packs":14,"groups":true,"size_objects":32}'::jsonb;$$;
CREATE FUNCTION ledger_private.trivia_content_v4() RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT 4;$$;
COMMIT;
'''
(ROOT/'supabase/migrations/039_size_comparisons_v4.sql').write_text(sql)
print(len(objects),'objects;',len(questions),'unique pairs;',len(questions)-70,'practice questions')
