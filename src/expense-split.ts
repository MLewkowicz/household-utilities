import {type Member} from './ledger';
import {equalShares,type Shares} from './misc-ledger';

/** Draft-only constraints: saved financial records retain ordinary exact-cent shares. */
export function balanceSplit(total:number, people:Member[], fixed:Shares, cursor=0):Shares {
 if(!Number.isSafeInteger(total)||total<=0||total>100000000)throw new Error('Enter a valid purchase total.');
 if(!people.length)throw new Error('Keep at least one person in the split.');
 const result:Shares={},automatic=people.filter(m=>fixed[m]===undefined);
 let used=0;
 for(const m of people)if(fixed[m]!==undefined){
  const value=fixed[m]!;
  if(!Number.isSafeInteger(value)||value<0)throw new Error('Use dollars and cents for each share.');
  result[m]=value;used+=value;
 }
 if(used>total)throw new Error('That exceeds the total after fixed shares. Reduce this amount or return a fixed share to Auto.');
 if(!automatic.length&&used!==total)throw new Error('All shares are fixed. Match the remaining amount or return a share to Auto.');
 return {...result,...equalShares(total-used,automatic,cursor)};
}
