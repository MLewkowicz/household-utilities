import {iconSvg} from './icons';
const rows=[
 ['bananas','Pick up bananas','banana bananas lounge fruit pickup','<path fill="#f5d978" d="M12 7c2 17 11 26 27 22C27 47 7 38 9 13z"/><path fill="#ffe9a0" d="M17 8c0 14 6 21 22 21C31 42 10 29 14 12z"/><path fill="#b0c788" d="m12 5 6 2-2 6-5-2z"/><path d="M13 17q3 15 17 16"/>'],
 ['trash','Take out trash','trash rubbish garbage smelly full bag','<path fill="#bfd4c4" d="M12 14h25l-3 28H15z"/><path fill="#a6bfc1" d="M9 10h31v6H9zM20 5h10v5H20z"/><path d="m20 21 1 14m8-14-1 14"/>'],
 ['trash-bag','Put in a new trash bag','new trash bag replace liner lining','<path fill="#c5d7d1" d="m12 15 3 27h18l3-27z"/><path fill="#e5dcf2" d="M10 11q7-5 14-2t14 2l-2 10-6-2-6 3-6-3-6 2z"/><path fill="#f6f0fa" d="M10 11q7 5 14 3t14-3q-7-5-14-2t-14 2z"/><path d="m19 25 1 11m9-11-1 11M40 4v6m-3-3h6"/>'],
 ['recycling','Take out recycling','recycling cardboard bottles cans paper','<path fill="#b7d5ba" d="M17 6C27 2 37 6 40 14l4-2-3 13-12-6 4-2c-2-6-8-7-12-4z"/><path fill="#b5d4cf" transform="rotate(120 24 24)" d="M17 6C27 2 37 6 40 14l4-2-3 13-12-6 4-2c-2-6-8-7-12-4z"/><path fill="#d3e1af" transform="rotate(240 24 24)" d="M17 6C27 2 37 6 40 14l4-2-3 13-12-6 4-2c-2-6-8-7-12-4z"/>'],
 ['bins','Bring bins back','bins retrieve return collection curb','<path fill="#bbceab" d="m10 13 3 25h23l3-25z"/><path fill="#d1e2bf" d="M8 8h33v6H8z"/><circle fill="#596c67" cx="17" cy="41" r="3"/><circle fill="#596c67" cx="33" cy="41" r="3"/><path d="M21 20h12m-12 0 5-4m-5 4 5 4"/>'],
 ['sweep','Sweep the floor','sweep mop floor broom vacuum clean','<path fill="#dfc19b" d="m30 5 5 2-12 26-5-2z"/><path fill="#f2d78f" d="m16 26 12 6-7 12L5 36z"/><path d="m13 33-4 5m9-3-3 6m8-3-3 5"/>'],
 ['dishes','Do the dishes','dishes dishwasher wash sink kitchen','<circle fill="#c2d9e6" cx="25" cy="28" r="16"/><circle fill="#edf1e4" cx="25" cy="28" r="10"/><path fill="#e7c58f" d="M5 7h12v14H5z"/><path d="M5 12h12m-5-7v4M36 7v6m-3-3h6"/>'],
 ['laundry','Do the laundry','laundry clothes towels sheets wash dryer','<rect fill="#d3c8e5" x="9" y="5" width="31" height="38" rx="4"/><circle fill="#bedbe0" cx="24.5" cy="28" r="10"/><path fill="#eef3e6" d="M15 28q5-6 10 0t10 0c0 13-20 13-20 0z"/><path d="M14 12h7m10 0h3"/>'],
 ['tidy','Tidy shared spaces','tidy living room organize clutter couch','<path fill="#e6bd9a" d="M7 22h34v19H7z"/><path fill="#f2d7a9" d="m7 22 8-7h19l7 7z"/><path fill="#b7d5c4" d="m15 14 3-8 12 4-2 6z"/><path d="M19 29h10m-5-4v8"/>'],
 ['bathroom','Clean the bathroom','bathroom toilet shower sink cleaning','<path fill="#d5e4e2" d="M8 6h16v17H8zM13 23h27q0 12-12 12v8H17v-8q-5-4-4-12z"/><path d="M13 13h6m-8 10h30"/>'],
 ['plant','Water the plants','plants water garden'],
 ['parcel','Collect a parcel','mail package parcel collect delivery'],
 ['tools','Fix something','repair fix maintenance tools'],
 ['repair-request','Request a repair','landlord message text contact request report repair maintenance broken call email','<path fill="#b9d5e0" d="M13 7h22a7 7 0 0 1 7 7v13a7 7 0 0 1-7 7H23l-10 7v-7a7 7 0 0 1-7-7V14a7 7 0 0 1 7-7z"/><g transform="translate(12 9) scale(.55)"><path fill="#f0d28e" d="m8 5 6 6-4 4-6-6q-3 13 10 13l18 20 8-8-20-18Q23 3 8 5z"/><circle fill="#fff4d6" cx="34" cy="36" r="2"/></g>'],
] as const;
export const CHORE_ICONS=rows.map(([id,label,keywords,...rest])=>({id,label,keywords,art:rest[0]}));
export function choreIcon(id:string){const icon=CHORE_ICONS.find(i=>i.id===id);return icon?.art?`<svg class="purchase-icon" viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="#354c4a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${icon.art}</svg>`:iconSvg(id);}
export function suggestChoreIcon(text:string){const words=text.toLowerCase().split(/\W+/).filter(w=>w.length>2);return CHORE_ICONS.map(i=>({id:i.id,score:words.filter(w=>i.keywords.split(' ').some(k=>k.startsWith(w))).length})).sort((a,b)=>b.score-a.score).find(i=>i.score>0)?.id;}
