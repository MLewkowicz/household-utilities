import {esc} from './ui';
import {gameArt} from './game-art';
import type {Question} from './trivia-model';

/** Two stable orders: never rearrange the player's submitted answer on reveal. */
export function timelineReview(q:Question,submitted:string[],points:number){
 const correct=Array.isArray(q.answer)?q.answer:[],cards=new Map(q.cards!.map(c=>[c.id,c]));
 const right=correct.filter((id,i)=>submitted[i]===id).length;
 // Pinned v1 attempts stored dates in the already-revealed explanation.
 const legacyDates=q.explanation?.split('\n').map(line=>line.match(/^(-?\d+)\s*·/)?.[1]);
 const year=(id:string)=>{const value=q.reveal?.[id];return value===undefined?legacyDates?.[correct.indexOf(id)]||'':value<0?`${Math.abs(value)} BCE`:String(value);};
 const rows=correct.map((id,i)=>{
  const expected=cards.get(id)!,given=cards.get(submitted[i])!,matches=id===given.id,to=correct.indexOf(given.id)+1,from=submitted.indexOf(id)+1;
  return `<div class="timeline-comparison-row ${matches?'is-correct':'is-misplaced'}" data-position="${i+1}"><div class="timeline-guess" role="group" aria-label="Your position ${i+1}" data-card="${esc(given.id)}"><span class="timeline-review-rank">${i+1}</span><span class="timeline-review-event">${esc(given.label)}<small>${matches?'✓ Right place':`Belongs at #${to}`}</small></span></div><span class="timeline-review-arrow" aria-hidden="true">${matches?'✓':'→'}</span><div class="timeline-solution" role="group" aria-label="Correct position ${i+1}" data-card="${esc(id)}"><span class="timeline-review-art" aria-hidden="true">${gameArt(expected.art||'clock')}</span><span class="timeline-review-event"><b class="timeline-date">${year(id)}</b>${esc(expected.label)}<small>${matches?'✓ Right place':`You placed it #${from}`}</small></span></div></div>`;
 }).join('');
 return `<section class="timeline-comparison" aria-label="Your order compared with the correct timeline"><p class="timeline-review-summary" role="status"><strong>${right===correct.length?'All in the right order.':`${right} of ${correct.length} events in the right place.`}</strong><span>${points/100} of 10 event pairs in chronological order · ${points.toLocaleString()} / 1,000 points</span></p><div class="timeline-comparison-head" aria-hidden="true"><span>Your order</span><span></span><span>Correct order · earliest to latest</span></div><div class="timeline-comparison-rows">${rows}</div></section>`;
}
