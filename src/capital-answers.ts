import data from './geography-capitals.json' with {type:'json'};
type Entry={names:string[];aliases:string[];note?:string;source?:string};
export const capitals:Record<string,Entry>=data;
const normalize=(s:string)=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\bsaint\b/g,'st').replace(/[^a-z0-9]/g,'');
export const hasCapital=(country:{id:string})=>!!capitals[country.id];
export const capitalNames=(country:{id:string})=>capitals[country.id]?.names||[];
export const capitalLabel=(country:{id:string})=>capitalNames(country).join(' / ');
export const isCapitalAnswer=(country:{id:string},guess:string)=>!!capitals[country.id]?.aliases.some(a=>normalize(a)===normalize(guess));
export function capitalSuggestions(countries:{id:string}[],query:string){const q=normalize(query);if(!q)return [];return [...new Set(countries.flatMap(c=>capitals[c.id]?.aliases||[]))].filter(a=>normalize(a).includes(q)).sort((a,b)=>Number(!normalize(a).startsWith(q))-Number(!normalize(b).startsWith(q))||a.localeCompare(b)).slice(0,7).map(name=>({name}));}
export function capitalHints(country:{id:string}){const label=capitalNames(country)[0]||'';return [`Capital begins with ${label.charAt(0)}.`,`Capital: ${label.replace(/\p{L}/gu,(c,i)=>i===0?c:'·')}`];}
