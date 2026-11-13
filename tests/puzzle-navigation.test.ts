import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nextCrosswordCell,type PuzzleGrid} from '../src/grid-puzzle';
import {elapsedPuzzleTime,formatPuzzleTime} from '../src/puzzle-clock';
import type {Attempt} from '../src/trivia-model';
const grid:PuzzleGrid={size:3,givens:'         ',clues:[0,1,2].flatMap(n=>[{number:n+1,row:n,col:0,direction:'across' as const,length:3,text:''},{number:n+1,row:0,col:n,direction:'down' as const,length:3,text:''}])};
test('crossword advances rows and columns, skips filled crossings and stays still when finished',()=>{
 assert.deepEqual(nextCrosswordCell(grid,'ABC      ',2,'across'),{cell:3,direction:'across'});
 assert.deepEqual(nextCrosswordCell(grid,'A  B  C  ',6,'down'),{cell:1,direction:'down'});
 assert.deepEqual(nextCrosswordCell(grid,'ABCDEF G ',5,'across'),{cell:6,direction:'across'});
 assert.deepEqual(nextCrosswordCell(grid,'ABCDEFGHI',8,'down'),{cell:8,direction:'down'});
});
test('puzzle clocks survive elapsed time, freeze at completion and tolerate clock skew',()=>{
 const a={started_at:'2026-11-12T12:00:00Z'} as Attempt;assert.equal(elapsedPuzzleTime(a,Date.parse('2026-11-12T12:01:05Z')),65000);assert.equal(formatPuzzleTime(65000),'1:05');assert.equal(elapsedPuzzleTime({...a,elapsed_ms:1234},Date.now()),1234);assert.equal(elapsedPuzzleTime(a,0),0);
});
