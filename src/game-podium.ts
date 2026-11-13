import {formatPuzzleTime} from './puzzle-clock';
import {avatar} from './people';
import {MEMBERS,type Member} from './ledger';
import {esc,name} from './ui';
import {identity} from './identity';
export function renderPodium(rows:{player:string;score:number;rank?:number;elapsed_ms?:number|null}[],showTime=false){
 return `<div class="orbit-podium" aria-label="Leading players">${rows.slice(0,4).map((row,i)=>`<div class="podium-person place-${i+1} ${row.player===identity?'is-you':''}">${(row.rank??i+1)===1?'<span class="podium-crown" aria-label="Leader">♛</span>':''}${MEMBERS.includes(row.player as Member)?avatar(row.player as Member):'<span class="guest-portrait">☆</span>'}<strong>${esc(name(row.player))}</strong><span class="podium-plinth" style="--podium-height:${Math.max(38,Math.round(135*Math.max(0,row.score)/Math.max(1,...rows.map(r=>r.score))))}px;--podium-color:${(row.rank??i+1)===1?'#ac8f59':'#7b8c8b'}"><small>${row.rank??i+1}</small><b>${row.score.toLocaleString()}</b>${showTime?`<span class="podium-time">${row.elapsed_ms==null?'—':formatPuzzleTime(row.elapsed_ms)}</span>`:''}</span></div>`).join('')}</div>`;
}
