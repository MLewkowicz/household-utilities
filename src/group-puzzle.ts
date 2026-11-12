export type WordGroup={id:string;label:string;words:string[]};
export type GroupProgress={solved:WordGroup[];guesses:string[][];mistakes:number;notice:string};
export const emptyGroups=():GroupProgress=>({solved:[],guesses:[],mistakes:0,notice:''});
export function guessGroup(groups:WordGroup[],progress:GroupProgress,words:string[]):GroupProgress{
 if(progress.solved.length===4||progress.mistakes>=4)return progress;
 const remaining=groups.filter(g=>!progress.solved.some(s=>s.id===g.id));
 if(words.length!==4||new Set(words).size!==4||words.some(w=>!remaining.some(g=>g.words.includes(w))))throw new Error('Choose four remaining words.');
 if(progress.guesses.some(g=>g.every(w=>words.includes(w))))return {...progress,notice:'Already tried that group.'};
 const match=remaining.find(g=>g.words.every(w=>words.includes(w)));
 return {solved:match?[...progress.solved,match]:progress.solved,guesses:[...progress.guesses,words],mistakes:progress.mistakes+Number(!match),notice:match?match.label:remaining.some(g=>g.words.filter(w=>words.includes(w)).length===3)?'One word away.':'Not a group.'};
}
