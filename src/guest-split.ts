import {MEMBERS, type Member} from './ledger';
import type {Shares} from './misc-ledger';

type Fraction={n:bigint;d:bigint};
const add=(a:Fraction,b:Fraction):Fraction=>({n:a.n*b.d+b.n*a.d,d:a.d*b.d});
function share(raw:string,total:number):Fraction {
 const value=raw.trim();
 let match=value.match(/^(\d+)\s*\/\s*(\d+)$/);
 if(match){const n=BigInt(match[1]),d=BigInt(match[2]);if(!d||n>d)throw new Error('Fractions must be between 0 and 1.');return{n:n*BigInt(total),d};}
 match=value.match(/^(\d+)(?:\.(\d{1,2}))?(%)?$/);
 if(!match)throw new Error('Use dollars, a fraction such as 1/3, or a percentage such as 25%.');
 const hundredths=BigInt(match[1])*100n+BigInt((match[2]||'').padEnd(2,'0'));
 if(match[3]){if(hundredths>10000n)throw new Error('Percentages must be between 0% and 100%.');return{n:hundredths*BigInt(total),d:10000n};}
 return{n:hundredths,d:1n};
}

// Guests exist only in this calculation. Returned household data is the only
// portion permitted into the ordinary expense form or persistence layer.
export function splitWithGuests(total:number,people:Member[],guests:number,custom?:string[]) {
 if(!Number.isSafeInteger(total)||total<1||total>100000000)throw new Error('Enter a receipt total between $0.01 and $1,000,000.');
 const members=MEMBERS.filter(m=>people.includes(m));
 if(members.length<2||members.length!==people.length)throw new Error('Choose 2–4 different roommates.');
 if(!Number.isInteger(guests)||guests<1||guests>4)throw new Error('Choose 1–4 guests.');
 const count=members.length+guests;
 if(custom&&custom.length!==count)throw new Error('Enter a share for each diner.');
 if(custom?.some(v=>v.length>40))throw new Error('Use a shorter share.');
 const values:(Fraction|null)[]=custom?custom.map(v=>v.trim()?share(v,total):null):Array(count).fill(null);
 const used=values.reduce<Fraction>((s,v)=>v?add(s,v):s,{n:0n,d:1n});
 const left=BigInt(total)*used.d-used.n,blanks=values.filter(v=>!v).length;
 if(left<0n)throw new Error('Shares exceed the receipt total.');
 if(!blanks&&left!==0n)throw new Error('Shares must add up to the receipt total, or leave blanks to split the rest.');
 const exact=values.map(v=>v||{n:left,d:used.d*BigInt(blanks)});
 const cents=exact.map(v=>Number(v.n/v.d));
 let remainder=total-cents.reduce((a,b)=>a+b,0);
 const order=exact.map((v,i)=>({i,n:v.n%v.d,d:v.d})).sort((a,b)=>{
  const difference=b.n*a.d-a.n*b.d;return difference>0n?1:difference<0n?-1:a.i-b.i;
 });
 for(const {i} of order){if(remainder--<=0)break;cents[i]++;}
 const householdTotal=cents.slice(0,members.length).reduce((a,b)=>a+b,0);
 if(!householdTotal)throw new Error('The household share must be at least $0.01.');
 const shares:Shares=Object.fromEntries(members.map((m,i)=>[m,cents[i]]));
 return{members,cents,householdTotal,shares};
}
