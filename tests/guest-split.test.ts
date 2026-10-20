import {test} from 'node:test';
import assert from 'node:assert/strict';
import {splitWithGuests} from '../src/guest-split';
import {MEMBERS} from '../src/ledger';

test('guest dinner saves only the exact household subtotal and shares',()=>{
 const split=splitWithGuests(18000,[...MEMBERS],2);
 assert.equal(split.householdTotal,12000);assert.deepEqual(Object.values(split.shares),[3000,3000,3000,3000]);
 assert.equal(split.cents.reduce((a,b)=>a+b,0),18000);
});
test('every supported party size conserves cents deterministically',()=>{
 for(let roommates=2;roommates<=4;roommates++)for(let guests=1;guests<=4;guests++)for(const total of [1,7,100,10001,100000000]){
  const a=splitWithGuests(total,MEMBERS.slice(0,roommates),guests);
  assert.equal(a.cents.reduce((x,y)=>x+y,0),total);
  assert.deepEqual(a,splitWithGuests(total,MEMBERS.slice(0,roommates).reverse(),guests));
  assert.equal(a.householdTotal,Object.values(a.shares).reduce((x,y)=>x+y!,0));
 }
});
test('fractions retain exact precision and blank shares split the remainder',()=>{
 assert.deepEqual(splitWithGuests(10000,['michal','rina'],1,['1/3','1/3','1/3']).cents,[3334,3333,3333]);
 assert.deepEqual(splitWithGuests(10001,['michal','rina'],2,['25%','25%','25%','25%']).cents,[2501,2500,2500,2500]);
 assert.deepEqual(splitWithGuests(10000,['rina','ohm'],2,['40','','','']).cents,[4000,2000,2000,2000]);
});
test('invalid groups and unreconciled custom splits cannot be saved',()=>{
 assert.throws(()=>splitWithGuests(100,['michal'],1));
 assert.throws(()=>splitWithGuests(100,['michal','michal'],1));
 for(const guests of [0,5,1.5])assert.throws(()=>splitWithGuests(100,['michal','rina'],guests));
 for(const shares of [['1','1','1'],['0','','2'],['1/0','',''],['-1','',''],['101%','',''],['0','0','1']])assert.throws(()=>splitWithGuests(100,['michal','rina'],1,shares));
});
