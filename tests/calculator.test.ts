import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calculateCents} from '../src/calculator.ts';

test('calculator totals arithmetic exactly and rounds only the final result to cents',()=>{
 for(const [expression,cents] of [
  ['12.50 + 8.75 + 3.20',2445],['1 + 2 × 3',700],['(1 + 2) × 3',900],
  ['90 ÷ 3',3000],['60 × 25%',1500],['(19.99 + 8.25) * 1.0625',3001],
  ['(0.1 + 0.2) / 3',10],['1 / 3 * 3',100],['10.005',1001],['-2 + 5',300],
  ['.50 + 1.',150],['1 - 1',0],['1000000',100000000],
 ] as const)assert.equal(calculateCents(expression),cents,expression);
});
test('fractions and percentages calculate a share of the purchase, including uneven cents',()=>{
 assert.equal(calculateCents('1/3',9000),3000);
 assert.equal(calculateCents('25%',9000),2250);
 assert.equal(calculateCents('33.333333%',9000),3000);
 assert.equal(calculateCents('1/3',1001),334);
 assert.equal(calculateCents('1/2',1),1);
 assert.equal(calculateCents('0%',500),0);
 assert.equal(calculateCents('100%',500),500);
});
test('invalid, incomplete, excessive and executable input never produce an amount',()=>{
 for(const expression of ['', '1 / 0', '0 / 0', '1 +', '(1 + 2', '2)', '1 2', '1..2', '1e3', '1,000', 'NaN', 'Infinity', '2 ** 3', '25%%', '-1', '1000000.01', 'alert(1)', 'globalThis.x=1', '<script>', '('.repeat(30)+'1'+')'.repeat(30), '1'.repeat(121)])assert.throws(()=>calculateCents(expression),undefined,expression);
 for(const expression of ['101%','2','-1/3'])assert.throws(()=>calculateCents(expression,1000),undefined,expression);
 for(const amount of [0,-1,0.5,NaN,100000001])assert.throws(()=>calculateCents('1/3',amount));
});
