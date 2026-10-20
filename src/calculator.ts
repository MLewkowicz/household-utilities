type Fraction = { n: bigint; d: bigint };
const limit = 10n ** 60n;
function fraction(n: bigint, d = 1n): Fraction {
 if(d===0n)throw new Error('Cannot divide by zero.');
 if(d<0n){n=-n;d=-d;}
 if(n>limit||n< -limit||d>limit)throw new Error('This calculation is too large.');
 let a=n<0n?-n:n,b=d;while(b){[a,b]=[b,a%b];}
 return {n:n/a,d:d/a};
}

// Parse arithmetic only; never execute user text. Fractions stay exact until
// the final rounding to cents, including expressions such as (0.1 + 0.2) / 3.
export function calculateCents(expression: string, totalCents?: number): number {
 if(expression.length>120)throw new Error('Keep calculations within 120 characters.');
 const tokens=expression.replaceAll('×','*').replaceAll('÷','/').replaceAll('−','-').match(/\d+(?:\.\d*)?|\.\d+|[^\s]/g)||[];
 if(!tokens.length)throw new Error('Enter a calculation.');
 if(tokens.length>100)throw new Error('Use a shorter calculation.');
 let pos=0,depth=0;
 function atom():Fraction {
  if(++depth>20)throw new Error('Use fewer nested operations.');
  let result:Fraction;
  const token=tokens[pos++];
  if(token==='+'||token==='-') {result=atom();if(token==='-')result=fraction(-result.n,result.d);}
  else if(token==='('){result=sum();if(tokens[pos++]!==')')throw new Error('Close the parentheses.');}
  else if(token&&/^(\d+(\.\d*)?|\.\d+)$/.test(token)){
   const [whole,decimal='']=token.split('.');
   if(token.length>24||decimal.length>12)throw new Error('Use fewer digits.');
   result=fraction(BigInt((whole||'0')+decimal),10n**BigInt(decimal.length));
  }else throw new Error('Use numbers, +, −, ×, ÷, parentheses, and %.');
  if(tokens[pos]==='%'){pos++;result=fraction(result.n,result.d*100n);}
  depth--;return result;
 }
 function product():Fraction {
  let result=atom();
  while(tokens[pos]==='*'||tokens[pos]==='/'){
   const op=tokens[pos++],right=atom();
   result=op==='*'?fraction(result.n*right.n,result.d*right.d):fraction(result.n*right.d,result.d*right.n);
  }
  return result;
 }
 function sum():Fraction {
  let result=product();
  while(tokens[pos]==='+'||tokens[pos]==='-'){
   const op=tokens[pos++],right=product();
   result=fraction(result.n*right.d+(op==='+'?1n:-1n)*right.n*result.d,result.d*right.d);
  }
  return result;
 }
 const result=sum();
 if(pos!==tokens.length)throw new Error('Check the operators and parentheses.');
 if(result.n<0n)throw new Error('Use a nonnegative result.');
 if(totalCents!==undefined&&(!Number.isSafeInteger(totalCents)||totalCents<1||totalCents>100000000))throw new Error('Enter the purchase amount first.');
 if(totalCents!==undefined&&result.n>result.d)throw new Error('A share must be between 0% and 100%.');
 const scaled=result.n*BigInt(totalCents??100);
 const cents=(scaled*2n+result.d)/(result.d*2n);
 if(cents>100000000n)throw new Error('The result must be at most $1,000,000.');
 return Number(cents);
}
