import {test} from 'node:test';
import assert from 'node:assert/strict';
import {balanceSplit} from '../src/expense-split';
import {MEMBERS} from '../src/ledger';
test('edited amounts stay fixed and untouched people divide the exact remainder',()=>{
 assert.deepEqual(balanceSplit(10000,MEMBERS,{michal:4000}),{michal:4000,rina:2000,ohm:2000,rohil:2000});
 assert.deepEqual(balanceSplit(10000,MEMBERS,{michal:4000,rina:1000}),{michal:4000,rina:1000,ohm:2500,rohil:2500});
 const s=balanceSplit(10001,MEMBERS,{michal:0},2);assert.equal(Object.values(s).reduce((a,b)=>a+b,0),10001);assert.equal(s.michal,0);assert.equal(s.ohm,3334);
 assert.deepEqual(balanceSplit(2340,['rina'],{}),{rina:2340});
});
test('impossible edits fail without mutating earlier constraints',()=>{
 const fixed={michal:600,rina:500};assert.throws(()=>balanceSplit(1000,MEMBERS,fixed),/exceeds/);assert.deepEqual(fixed,{michal:600,rina:500});
 assert.throws(()=>balanceSplit(1000,['rina'],{rina:500}),/All shares/);
 assert.throws(()=>balanceSplit(1000,[],{}),/at least one/);
 assert.deepEqual(balanceSplit(1000,['rina','ohm'],{rina:1000}),{rina:1000,ohm:0});
});
