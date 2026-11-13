import {SIZE_VERSION,sizeCategories} from './size-categories';
import type {Attempt} from './trivia-model';

/** Retire every identity's old size boards, drafts, views and cached shelves. */
export function retireSizeHistory(storage?:Pick<Storage,'length'|'key'|'removeItem'>){
 try{
  storage??=localStorage;
  for(let i=storage.length-1;i>=0;i--){
   const key=storage.key(i),match=key?.match(/^household-(?:trivia|game-library)-v(\d+):[^:]+:how-much-ish:/);
   if(key&&match&&Number(match[1])<SIZE_VERSION)storage.removeItem(key);
  }
 }catch{/* Restricted storage must not prevent play. */}
}
export function currentSizeBoard(attempt:Attempt){
 return attempt.questions?.length===5&&attempt.questions.every(q=>q.version===SIZE_VERSION&&q.kind==='scale'&&q.category&&q.category in sizeCategories&&q.target?.shape.startsWith('catalog:')&&q.reference?.shape.startsWith('catalog:'));
}
