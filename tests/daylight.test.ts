import {test} from 'node:test';
import assert from 'node:assert/strict';
import {householdDaylight} from '../src/daylight';
test('New York daylight blends through dawn and dusk and follows DST',()=>{
 const winter=(time:string)=>householdDaylight(new Date('2026-11-02T'+time+'-05:00'));
 assert.equal(winter('05:59').night,1);assert.equal(winter('07:00').night,.5);assert.equal(winter('12:00').night,0);assert.equal(winter('18:00').night,.5);assert.equal(winter('19:01').night,1);
 assert.equal(householdDaylight(new Date('2026-07-01T11:00:00Z')).hour,7);assert.equal(householdDaylight(new Date('2026-11-02T12:00:00Z')).hour,7);
});
