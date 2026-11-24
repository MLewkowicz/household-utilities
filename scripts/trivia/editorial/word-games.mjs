import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const read=async file=>(await readFile(new URL(file,import.meta.url),'utf8')).trim();
function shuffled(items,seed){
 // Hash each distinct value with the board seed for a repeatable display order.
 const key=item=>createHash('sha256').update(seed+'|'+item).digest('hex');
 return [...items].sort((a,b)=>key(a).localeCompare(key(b)));
}
function unique(words,count){
 if(words.length!==count||new Set(words.map(w=>w.trim().toLowerCase()).filter(Boolean)).size!==count)throw new Error(`Invalid word set: ${words}`);
}

export async function wordPacks(){
 const groups=(await read('common-ground.txt')).split('\n\n').map((board,slot)=>{
  const groups=board.split('\n').map((line,i)=>{
   const [label,list]=line.split('|');
   const words=list.split(',');
   unique(words,4);
   return {id:String(i),label,words};
  });
  const words=groups.flatMap(g=>g.words);
  unique(words,16);
  const id=`ground-editorial-1-${slot+1}`;
  return [{id,version:12,kind:'groups',prompt:'Find four groups of four.',words:shuffled(words,id),groups,
   answer:groups.map(g=>g.id),explanation:groups.map(g=>g.label+' · '+g.words.join(', ')).join('\n'),sources:['Original household word puzzle.']}];
 });
 if(groups.length!==30)throw new Error('Expected thirty Common Ground boards');

 const choices=Array.from({length:30},()=>[]);
 const seen=new Set();
 const sections=(await read('odd-one-out.txt')).split(/^# /m).filter(Boolean);
 if(sections.length!==5)throw new Error('Expected five clue styles');
 for(const [style,section] of sections.entries()){
  const [tag,...rounds]=section.trim().split('\n');
  if(rounds.length!==30)throw new Error(`Expected thirty rounds for ${tag}`);
  for(const [n,line] of rounds.entries()){
   const [list,answer,explanation]=line.split('|'),words=[...list.split(','),answer];
   unique(words,4);
   const signature=words.map(w=>w.toLowerCase()).sort().join('|');
   if(!explanation||seen.has(signature))throw new Error(`Invalid outsider round: ${line}`);
   seen.add(signature);
   const id=`odd-editorial-1-${style+1}-${n+1}`;
   // Offset each style and rotate the starting style from day to day.
   const day=(n+7*style)%30;
   choices[day][(style+day)%5]={id,version:12,kind:'choice',tag,prompt:'Find the outsider.',options:shuffled(words,id),answer,explanation,sources:['Original household puzzle. The reveal explains the shared rule.']};
  }
 }
 return {'clue-cascade':groups,'odd-one-out':choices};
}
