export interface Mood {value:number; anger:number; love:number; steam:number; risingSteam:number; hearts:number; blush:number; heat:number}
export function clamp(value:number,min?:number,max?:number):number;
export function lerp(a:number,b:number,t:number):number;
export function smooth(a:number,b:number,x:number):number;
export function moodFromValue(value:number):Mood;
export function describe(value:number):[string,string];
export function ease(current:number,target:number,dt:number):number;
