import {test} from 'node:test';
import assert from 'node:assert/strict';
import {previewPoints} from '../scripts/preview-points.mjs';
test('point proposals are read-only, exact for shared work and scoped by New York dates',()=>{
 const task={id:'one',version:2,title:'Recycling',icon_id:'recycling',points:1,state:'completed',completion:{contributors:['michal','rina','ohm'],completed_at:'2026-10-02T02:00:00Z'}};
 const ledger={tasks:[task,{...task,id:'reminder',kind:'reminder',points:0},{...task,id:'later',completion:{...task.completion,completed_at:'2026-10-02T05:00:00Z'}}]};
 const original=structuredClone(ledger);
 const result=previewPoints(ledger,{from:'2026-10-01',through:'2026-10-01',points_by_icon:{recycling:2}});
 assert.deepEqual(ledger,original);assert.equal(result.changes.length,1);assert.equal(result.totals.michal.before_units,4);assert.equal(result.totals.michal.after_units,8);assert.equal(result.totals.michal.delta_units,4);assert.equal(result.preview_only,true);
 assert.throws(()=>previewPoints(ledger,{from:'2026-02-30',through:'2026-10-01'}));
});

test('half-point previews keep exact four-way credit and flag unsupported proposed effort',()=>{
 const ledger={tasks:[{id:'half',version:1,title:'Replace liner',kind:'chore',icon_id:'trash-bag',points:0.5,state:'completed',completion:{contributors:['michal','rina','ohm','rohil'],completed_at:'2026-10-02T12:00:00Z'}}]};
 const policy={from:'2026-10-01',through:'2026-10-03',points_by_icon:{'trash-bag':1.5}};
 const preview=previewPoints(ledger,policy);assert.equal(preview.totals.michal.before_units,1.5);assert.equal(preview.totals.michal.after_units,4.5);assert.equal(preview.requires_expanded_point_range,true);
 assert.throws(()=>previewPoints(ledger,{...policy,points_by_icon:{'trash-bag':'0.5'}}));
});
