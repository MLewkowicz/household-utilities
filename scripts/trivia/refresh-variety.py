"""Build additive content release; saved boards and ranked history stay intact."""
import json,random,collections
from pathlib import Path
read=lambda p:json.loads(Path(p).read_text())
write=lambda p,v:Path(p).write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
quote=lambda v:"'"+json.dumps(v,ensure_ascii=False,separators=(',',':')).replace("'","''")+"'::jsonb"
sql='-- More varied unsaved practice boards and future daily catalogs.\nBEGIN;\n'
# Explicit category rules, with one unambiguous outsider each.
groups=[
('String instruments','Violin|Viola|Cello','Oboe','The oboe is a woodwind; the others are bowed string instruments.'),
('Chess pieces','Bishop|Rook|Knight','Checker','A checker is a piece in draughts, not chess.'),
('Roman numerals','X|L|D','Z','X, L and D are Roman numerals; Z is not.'),
('Polygons','Triangle|Pentagon|Hexagon','Sphere','A sphere is a three-dimensional solid; the others are polygons.'),
('Metric prefixes','Kilo|Milli|Centi','Dozen','The others are metric prefixes; dozen means twelve.'),
('Keyboard instruments','Piano|Organ|Harpsichord','Trombone','A trombone uses a slide, not a keyboard.'),
('Chemical symbols','Na|Fe|Au','Hz','Hz is the unit hertz; the others are chemical element symbols.'),
('Programming languages','Python|Ruby|Java','HTML','HTML is a markup language; the others are programming languages.'),
('Punctuation','Comma|Semicolon|Colon','Vowel','A vowel is a speech sound or letter, not punctuation.'),
('Greek letters','Alpha|Delta|Omega','Ampersand','An ampersand is a symbol for and, not a Greek letter.'),
('Mammals that lay eggs','Platypus|Short-beaked echidna|Western long-beaked echidna','Wombat','A wombat gives birth to live young; the others are egg-laying monotremes.'),
('Units of length','Metre|Inch|Furlong','Litre','A litre measures volume; the others measure length.'),
('Units of time','Second|Minute|Hour','Knot','A knot measures speed; the others measure time.'),
('Percussion','Snare drum|Timpani|Xylophone','Clarinet','A clarinet is a woodwind; the others are percussion instruments.'),
('Card suits','Hearts|Clubs|Diamonds','Crowns','Crowns is not one of the four standard French card suits.'),
('Olympic swimming strokes','Butterfly|Backstroke|Breaststroke','Dog paddle','Dog paddle is not an Olympic competition stroke.'),
('Perfect squares','16|25|49','35','35 is not the square of an integer.'),
('Prime numbers','17|23|31','27','27 equals 3 × 9; the others are prime.'),
('Powers of two','8|32|128','96','96 is not an integer power of two.'),
('Palindromes','LEVEL|RADAR|CIVIC','RIVER','RIVER does not read the same backward.'),
('Silent initial letters','Knee|Gnome|Wrist','Drum','The first letter is silent in the other three words.'),
('Irregular plurals','Mice|Geese|Teeth','Books','Books takes the regular -s plural.'),
('Past tense','Went|Wrote|Swam','Sing','Sing is present tense; the others are past tense.'),
('Conifer trees','Pine|Spruce|Fir','Maple','Maple is a broadleaf tree, not a conifer.'),
('Legumes','Lentil|Chickpea|Peanut','Almond','Almond is not a legume.'),
('Alliums','Onion|Garlic|Leek','Carrot','Carrot is not in the genus Allium.'),
('Brass instruments','Trumpet|Tuba|French horn','Bassoon','The bassoon is a woodwind.'),
('Musical tempos','Adagio|Allegro|Presto','Crescendo','Crescendo means getting louder; the others describe tempo.'),
('Painting media','Watercolour|Gouache|Oil paint','Chisel','A chisel is a carving tool, not a painting medium.'),
('Printmaking','Etching|Woodcut|Lithography','Ballet','Ballet is a performing art, not a printmaking technique.'),
('Literary forms','Sonnet|Haiku|Limerick','Symphony','A symphony is a musical composition; the others are poetic forms.'),
('Photography controls','Aperture|Shutter speed|ISO','Kerning','Kerning adjusts space between letters in typography.'),
('Geometry','Radius|Diameter|Circumference','Denominator','Denominator names the bottom part of a fraction, not a circle measurement.'),
('SI base units','Kelvin|Mole|Ampere','Newton','The newton is a derived SI unit; the others are base units.'),
('Computer storage','SSD|Hard disk|Flash drive','Monitor','A monitor displays output; the others store data.'),
('Web browsers','Firefox|Safari|Chrome','PostgreSQL','PostgreSQL is a database system.'),
('Editing marks','Bold|Italic|Underline','Megabyte','A megabyte is a data unit, not text formatting.'),
('Dance forms','Waltz|Tango|Salsa','Sonata','A sonata is a musical composition, not a dance form.'),
('Board game actions','Checkmate|Castling|En passant','Touchdown','Touchdown is a football term; the others belong to chess.'),
('Knitting','Purl|Cast on|Bind off','Sauté','Sauté is a cooking technique, not a knitting operation.')]
bank=read('src/trivia/odd-one-out.json');bank=[q for q in bank if not q['id'].startswith('odd-variety-')]
for i,(tag,inside,outside,explanation) in enumerate(groups):
 options=inside.split('|')+[outside];random.Random(i+527).shuffle(options)
 bank.append(dict(id=f'odd-variety-{i}',version=11,kind='choice',tag=tag,prompt='Find the outsider.',options=options,answer=outside,explanation=explanation,sources=['Original category puzzle; the explanation states the classification rule.']))
write('src/trivia/odd-one-out.json',bank)
# The first ten practice boards use 50 different questions, with no overlapping stride.
for slot in range(10):
 sql+=f"UPDATE ledger_private.game_starter_packs SET questions={quote(bank[slot*5:slot*5+5])} WHERE game='odd-one-out' AND slot={slot+1};\n"
# Build history-heavy timelines from the existing sourced catalog. No fact repeats in starters.
catalog=read('scripts/trivia/online/catalog.json');events=catalog['events'];rng=random.Random(527)
core=[e for e in events if e['art'] not in ('book','rocket','science')];rng.shuffle(core)
extras=[e for e in events if e['art'] in ('book','science')];rng.shuffle(extras)
used=set();boards=[]
for i in range(10):
 chosen=[]
 for e in core+extras:
  if e['id'] not in used and e['year'] not in [x['year'] for x in chosen]:
   chosen.append(e);used.add(e['id'])
   if len(chosen)==5:break
 ordered=sorted(chosen,key=lambda e:e['year']);rng.shuffle(chosen)
 boards.append(dict(id=f'timeline-variety-{i}',version=11,kind='timeline',prompt='Put these moments in order.',cards=[dict(id=e['id'],label=e['label'],art=e['art']) for e in chosen],answer=[e['id'] for e in ordered],reveal={e['id']:e['year'] for e in chosen},explanation='\n'.join(f"{e['year']} · {e['label']}" for e in ordered),sources=[e['source'] for e in chosen]))
write('src/trivia/before-or-after.json',boards)
for slot,q in enumerate(boards):sql+=f"UPDATE ledger_private.game_starter_packs SET questions={quote([q])} WHERE game='before-or-after' AND slot={slot+1};\n"
# Add regional routes with different corridors and lengths, preserving every released ID.
data=read('src/geography-routes.json');data['puzzles']=[p for p in data['puzzles'] if p['id']<108];graph=data['neighbors'];existing={tuple(sorted([p['start'],p['end']])) for p in data['puzzles']}
def route(a,b):
 queue=collections.deque([[a]]);seen={a}
 while queue:
  path=queue.popleft()
  if path[-1]==b:return path
  for n in graph.get(path[-1],[]):
   if n not in seen:seen.add(n);queue.append(path+[n])
 return []
pairs=[('ESP','ITA'),('EST','ITA'),('THA','VNM'),('KEN','ZAF'),('VEN','URY'),('GHA','GAB'),('DEU','ALB'),('IRN','JOR'),('KAZ','NPL'),('SEN','NGA'),('FRA','HRV'),('ROU','EST'),('KHM','NPL'),('TZA','BWA'),('ECU','PRY'),('CIV','CMR'),('NLD','SVK'),('OMN','LBN'),('KGZ','IND'),('GNB','NER')]
new=[]
for a,b in pairs:
 p=next((p for p in data['puzzles'] if p['start']==a and p['end']==b),None)
 if not p:
  path=route(a,b)
  if len(path)<3:continue
  p=dict(id=max(p['id'] for p in data['puzzles'])+1,start=a,end=b,region='World',minimum=len(path)-1,solution=path);data['puzzles'].append(p)
 new.append(p)
 sql+=f"INSERT INTO ledger_private.geography_route_puzzles(id,start,finish,minimum,solution) VALUES({p['id']},'{a}','{b}',{p['minimum']},{quote(p['solution'])}) ON CONFLICT DO NOTHING;\n"
write('src/geography-routes.json',data)
sql+="CREATE FUNCTION ledger_private.games_variety_version() RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT 1;$$;\nREVOKE ALL ON FUNCTION ledger_private.games_variety_version() FROM PUBLIC,anon,authenticated,service_role;\nCOMMIT;\n"
source=Path('supabase/migrations/046_game_mechanics.sql').read_text()
archive=source[source.index('CREATE OR REPLACE FUNCTION public.utilities_game_archive'):source.index('CREATE OR REPLACE FUNCTION public.utilities_geography_route_capabilities')]
archive=archive.replace('public.utilities_game_archive','ledger_private.game_archive_before_size_categories').replace('48+s-1','108+s-1')
slot=source[source.index('CREATE FUNCTION ledger_private.route_slot'):source.index('CREATE OR REPLACE FUNCTION public.utilities_geography_route_start')]
slot=slot.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION').replace("WHERE (first_id=48 AND id>=48) OR (first_id=0 AND id<48)","WHERE available_from<=d AND ((first_id=48 AND id>=48) OR (first_id=0 AND id<48))")
sql=sql.replace('COMMIT;',archive+slot+'COMMIT;')
Path('supabase/migrations/054_games_variety.sql').write_text(sql)
