"""Deterministic original mini crosswords and uniquely solvable Sudoku boards."""
import json, random
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
clues=dict(line.split('|',1) for line in (Path(__file__).with_name('crossword-clues.txt')).read_text().splitlines() if line)
assert all(w.isalpha() and w.isupper() and 3<=len(w)<=5 for w in clues)
words={n:set(w for w in clues if len(w)==n) for n in (3,4,5)}
lookup={(n,p,c):{w for w in words[n] if w[p]==c} for n in words for p in range(n) for c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'}
def slots(grid):
 out=[]
 for r in range(5):
  for c in range(5):
   if grid[r*5+c]=='#':continue
   for dr,dc,d in [(0,1,'across'),(1,0,'down')]:
    if r-dr>=0 and c-dc>=0 and grid[(r-dr)*5+c-dc]!='#':continue
    cells=[];y=r;x=c
    while y<5 and x<5 and grid[y*5+x]!='#':cells.append(y*5+x);y+=dr;x+=dc
    if len(cells)<3:return []
    out.append((d,cells))
 return out
patterns=[]
for mask in range(1<<13):
 grid=['.']*25
 for i in range(13):
  if mask>>i&1:grid[i]=grid[24-i]='#'
 if not 2<=grid.count('#')<=8:continue
 s=slots(grid)
 if not s:continue
 open_cells={i for i,x in enumerate(grid) if x!='#'};seen={next(iter(open_cells))}
 while True:
  more={j for i in seen for j in [i-5,i+5,i-1,i+1] if j in open_cells and (abs(j-i)==5 or j//5==i//5)}-seen
  if not more:break
  seen|=more
 if seen==open_cells:patterns.append((''.join(grid),s))
usage={w:0 for w in clues};seen_grids=set()
def crossword(seed):
 rng=random.Random(seed)
 for trial in range(300):
  pattern,ss=rng.choice(patterns);grid=list(pattern);placed={};used=set();budget=[1500]
  def solve():
   budget[0]-=1
   if budget[0]<0:return False
   if len(placed)==len(ss):return True
   best=None;choices=None
   for si,(_,cells) in enumerate(ss):
    if si in placed:continue
    pool=words[len(cells)].copy()-used
    for p,cell in enumerate(cells):
     if grid[cell]!='.':pool &= lookup[len(cells),p,grid[cell]]
    if not pool:return False
    if choices is None or len(pool)<len(choices):best=si;choices=pool
   candidates=sorted(choices);rng.shuffle(candidates);candidates.sort(key=lambda w:usage[w])
   for word in candidates[:120]:
    cells=ss[best][1];before=[grid[i] for i in cells]
    for i,c in zip(cells,word):grid[i]=c
    placed[best]=word;used.add(word)
    if solve():return True
    used.remove(word);del placed[best]
    for i,c in zip(cells,before):grid[i]=c
   return False
  if not solve() or ''.join(grid) in seen_grids:continue
  seen_grids.add(''.join(grid));numbering={i:n+1 for n,i in enumerate(sorted(set(cells[0] for _,cells in ss)))}
  entries=[]
  for si,(direction,cells) in enumerate(ss):
   w=placed[si];usage[w]+=1
   entries.append(dict(number=numbering[cells[0]],row=cells[0]//5,col=cells[0]%5,direction=direction,length=len(cells),text=clues[w]))
  return dict(id=f'crossword-original-{seed}',version=6,kind='crossword',prompt='The mini crossword',grid=dict(size=5,givens=pattern.replace('.',' '),clues=entries),answer=''.join(grid),explanation='Original Household mini crossword.',sources=['Original Household grids and clues'])
 raise RuntimeError('Unable to construct crossword')

def sudoku_count(board,limit=2):
 count=0
 rows=[set() for _ in range(9)];cols=[set() for _ in range(9)];boxes=[set() for _ in range(9)]
 for i,v in enumerate(board):
  if v:rows[i//9].add(v);cols[i%9].add(v);boxes[i//27*3+i%9//3].add(v)
 def solve():
  nonlocal count
  if count>=limit:return
  best=-1;choices=None
  for i,v in enumerate(board):
   if v:continue
   possible=set(range(1,10))-rows[i//9]-cols[i%9]-boxes[i//27*3+i%9//3]
   if not possible:return
   if choices is None or len(possible)<len(choices):best=i;choices=possible
   if len(choices)==1:break
  if best<0:count+=1;return
  r,c,b=best//9,best%9,best//27*3+best%9//3
  for v in sorted(choices):
   board[best]=v;rows[r].add(v);cols[c].add(v);boxes[b].add(v);solve();board[best]=0;rows[r].remove(v);cols[c].remove(v);boxes[b].remove(v)
 solve();return count

def sudoku(seed):
 rng=random.Random(seed);sh=lambda xs:rng.sample(list(xs),len(xs));rr=[g*3+r for g in sh(range(3)) for r in sh(range(3))];cc=[g*3+c for g in sh(range(3)) for c in sh(range(3))];digits=sh(range(1,10))
 solution=[digits[(r*3+r//3+c)%9] for r in rr for c in cc];board=solution[:];target=36 if seed%3 else 42
 for i in sh(range(41)):
  cells=list(set([i,80-i]));before=[board[c] for c in cells]
  if sum(bool(v) for v in board)-len(cells)<target:continue
  for c in cells:board[c]=0
  if sudoku_count(board[:])!=1:
   for c,v in zip(cells,before):board[c]=v
 return dict(id=f'sudoku-original-{seed}',version=6,kind='sudoku',prompt='Sudoku',tag='9 × 9',grid=dict(size=9,givens=''.join(str(v) if v else ' ' for v in board),clues=[]),answer=''.join(map(str,solution)),explanation='Each row, column and 3 × 3 box contains 1–9 exactly once.',sources=['Original Household generated puzzle · unique solution verified'])

for game,make,count in [('crossword',crossword,100),('sudoku',sudoku,190)]:
 puzzles=[]
 for i in range(count):
  puzzles.append(make(61000+i))
  if i%10==0:print(game,i+1,flush=True)
 assert len({q['answer'] for q in puzzles})==count
 (ROOT/'src/trivia'/f'{game}.json').write_text(json.dumps(puzzles[:10],separators=(',',':'))+'\n')
 (ROOT/'scripts/trivia'/f'{game}-daily.json').write_text(json.dumps([[q] for q in puzzles[10:]],separators=(',',':'))+'\n')
 print(game, 'practice',10,'daily',count-10,flush=True)
print('Crossword vocabulary:',sum(v>0 for v in usage.values()),'words;',len(patterns),'grid templates',flush=True)
