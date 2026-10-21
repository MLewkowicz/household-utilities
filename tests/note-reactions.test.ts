import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {NOTE_REACTIONS} from '../src/avatars/reactions';
import {openDatabase,callRpc} from '../scripts/database.mjs';
let db:any;const call=(fn:string,p?:any)=>callRpc(db,fn,p?{p}:{});
before(async()=>{db=await openDatabase();});after(async()=>{await db.close();});
test('reactions are independent, changeable and retry safe',async()=>{
 const n=await call('save_bulletin_note',{id:randomUUID(),request_id:randomUUID(),action:'create',actor:'rina',body:'Please wash the dishes',temperature:-40,recipients:['ohm']});
 const p={note_id:n.id,actor:'michal',expected_version:0,request_id:randomUUID(),expression:'confused'};
 const r=await call('save_note_reaction',p);assert.deepEqual(await call('save_note_reaction',p),r);
 await call('save_note_reaction',{...p,actor:'ohm',expression:'crying-laughing',request_id:randomUUID()});
 await assert.rejects(call('save_note_reaction',{...p,expression:'mogging',request_id:randomUUID()}),/changed/);
 await call('save_note_reaction',{...p,expected_version:1,expression:'mogging',request_id:randomUUID()});
 await call('save_note_reaction',{...p,expected_version:2,expression:null,request_id:randomUUID()});
 const d=await call('export_bulletin');assert.equal(d.reactions.filter((r:any)=>r.expression).length,1);assert.equal(d.reaction_history.length,4);assert.equal(d.notes[0].temperature,-40);assert.equal(d.history.length,1);
 await assert.rejects(call('save_note_reaction',{...p,expected_version:3,expression:'other',request_id:randomUUID()}),/Choose a reaction/);
 await call('save_bulletin_note',{id:n.id,action:'delete',actor:'rina',expected_version:1,request_id:randomUUID()});
 await assert.rejects(call('save_note_reaction',{...p,expected_version:3,request_id:randomUUID()}),/no longer/);
});

test('all fourteen expressions work for every member without editing the note or author temperature',async()=>{
 assert.equal(NOTE_REACTIONS.length,14);assert.equal(new Set(NOTE_REACTIONS.map(([id])=>id)).size,14);
 const n=await call('save_bulletin_note',{id:randomUUID(),request_id:randomUUID(),action:'create',actor:'rohil',body:'Expanded reaction library',temperature:60,recipients:['rina']});
 for(const actor of ['michal','rina','ohm','rohil']){
  let version=0;
  for(const [expression] of NOTE_REACTIONS){
   const p={note_id:n.id,actor,expected_version:version,request_id:randomUUID(),expression};
   const saved=await call('save_note_reaction',p);assert.equal(saved.expression,expression);assert.equal(saved.version,++version);assert.deepEqual(await call('save_note_reaction',p),saved);
  }
 }
 const d=await call('export_bulletin');assert.equal(d.notes.find((note:any)=>note.id===n.id).temperature,60);
 assert.equal(d.history.filter((row:any)=>row.id===n.id).length,1);assert.equal(d.reaction_history.filter((row:any)=>row.note_id===n.id).length,56);
 assert.equal(d.reactions.filter((row:any)=>row.note_id===n.id).length,4);
});
