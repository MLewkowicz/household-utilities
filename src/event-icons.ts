import {getIcon} from './icons';

export const EVENT_PRESETS=[
 {id:'movie-night',title:'Movie night',icon:'movie'},
 {id:'board-games',title:'Board games',icon:'board-game'},
 {id:'walk',title:'Go for a walk',icon:'walking'},
 {id:'skiing',title:'Skiing',icon:'skis'},
 {id:'eat-out',title:'Eat out',icon:'restaurant'},
 {id:'cook-together',title:'Cook together',icon:'cooking'},
] as const;
const art:Record<string,{label:string;art:string}>={
 calendar:{label:'Calendar',art:'<rect x="8" y="10" width="32" height="31" rx="5" fill="#eee8d9"/><path fill="#c2b5e0" d="M8 15q0-5 5-5h22q5 0 5 5v6H8z"/><path d="M16 6v9M32 6v9M15 28h3m6 0h3m6 0h1m-19 6h3m6 0h3"/>'},
 movie:getIcon('movie'),
 'board-game':getIcon('board-game'),
 walking:{label:'Walking',art:'<path fill="#dce8c8" d="m3 39 10-10 8 5 13-13 11 18z"/><circle fill="#edc99c" cx="27" cy="8" r="4"/><path stroke="#b6c6df" stroke-width="7" d="m25 17-5 12"/><path stroke-width="3" d="m24 17 8 7 7-1M24 18l-9 3-4 7m10 0 9 7 2 9m-12-15-5 10-8 4"/>'},
 skis:{label:'Skis',art:'<path fill="#b9dfe4" d="M15 4q-3-3-5 1l12 37q1 4 4 2 2-1 0-5z"/><path fill="#edbdc3" d="M35 4q3-3 5 1L28 42q-1 4-4 2-2-1 0-5z"/><path stroke-width="2" d="m7 9 30 32M41 9 11 41M4 8l6 2m28 0 6-2m-33 28-5 5m30-5 6 5"/><path fill="#f5d68a" d="m18 22 5-2 2 6-5 2zm10-2 5 2-2 6-5-2z"/>'},
 restaurant:{label:'Restaurant',art:getIcon('plate').art},
 cooking:{label:'Cooking',art:'<path fill="#b9dfe4" d="M10 22h28v12q0 7-14 7T10 34z"/><path fill="#eee8d9" d="M8 21q16-8 32 0z"/><path d="M10 26H5v7h5m28-7h5v7h-5M21 15v-3h6v3"/><path stroke="#b8c9c2" d="M17 10q-5-3 0-7m8 6q-4-3 0-7m7 8q-4-3 0-7"/><path fill="#edc99c" d="m33 18 5-13q1-3 4-1 2 1 0 4l-7 12z"/>'},
};
export const EVENT_ICONS=Object.entries(art).map(([id,item])=>({id,label:item.label}));
export function eventIconSvg(id?:string|null){
 const icon=art[id||'calendar']||art.calendar;
 return `<svg class="event-illustration" viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="#354c4a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${icon.art}</svg>`;
}
