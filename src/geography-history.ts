import {esc} from './ui';
import type {Country} from './geography';
/** Sources remain in the bundled catalog and data documentation, outside the play UI. */
export function countryHistory(c:Country){
 const stories=[...(c.stories||[]),...c.facts.map(body=>({title:'',body}))];
 const story=(s:typeof stories[number])=>`<section class="atlas-story">${s.title?`<h4>${esc(s.title)}</h4>`:''}<p class="atlas-history">${esc(s.body)}</p></section>`;
 return (stories.length?story(stories[0]):'')+(stories.length>1?`<details class="atlas-stories"><summary>${stories.length-1} more stories</summary>${stories.slice(1).map(story).join('')}</details>`:'')+(c.background?`<details class="atlas-context"><summary>Full historical background</summary><p>${esc(c.background)}</p></details>`:'');
}
