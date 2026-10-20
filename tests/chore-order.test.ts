import {test} from 'node:test';
import assert from 'node:assert/strict';
import {type Chore,queueOrder,urgentChore,weekStart,addDays,points} from '../src/chores.ts';
test('personal queue sorts pins, overdue, today, upcoming and undated with deterministic ties',()=>{
 const base={status:'active',pinned:false,created_at:'2026-10-01',due_on:null,due_at:null} as Chore;
 const rows=[{...base,id:'undated'},{...base,id:'upcoming',due_on:'2026-10-30',due_at:'2026-10-30T20:00:00Z'},{...base,id:'today',due_on:'2026-10-20',due_at:'2026-10-21T04:00:00Z'},{...base,id:'overdue',status:'overdue'},{...base,id:'pin',pinned:true}] as Chore[];
 assert.deepEqual(rows.sort(queueOrder('2026-10-20')).map(t=>t.id),['pin','overdue','today','upcoming','undated']);
 assert.equal(rows.filter(t=>urgentChore(t,'2026-10-20')).length,3);
 assert.equal(urgentChore({...base,pinned:true,status:'completed'},'2026-10-20'),false);
 assert.equal(weekStart('2026-11-01'),'2026-10-26');assert.equal(addDays('2026-12-31',1),'2027-01-01');assert.equal(points(4),'0.33');assert.equal(points(9),'0.75');
});
