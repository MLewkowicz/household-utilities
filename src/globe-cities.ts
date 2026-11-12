import data from './geography-cities.json' with {type:'json'};
import type {Country} from './geography';
export type GlobeCity={id:string;countryId:string;name:string;lon:number;lat:number;source:string;capital:boolean;capitalRole:string;population?:number;populationBasis?:string;note?:string;nameSource?:string};
export const globeCities:Record<string,GlobeCity>=data;
/** Quiz locations retain their country's context, with a distinct ID and real city position. */
export const cityLocation=(city:GlobeCity,country:Country):Country=>({...country,id:city.id,center:[city.lon,city.lat]});
export const cityPrompt=(city:GlobeCity,country:Country)=>city.capital?`Find the ${city.capitalRole?city.capitalRole+' ':''}capital of ${country.name}`:`Find ${city.name} · ${country.name}`;
export const cityDescription=(city:GlobeCity)=>city.capitalRole==='seat of government'?'Seat of government':city.capitalRole?city.capitalRole[0].toUpperCase()+city.capitalRole.slice(1)+' capital':city.capital?'Capital city':'Major city';
