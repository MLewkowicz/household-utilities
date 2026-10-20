import type {Mood} from './mood.mjs';
export interface AvatarEffects {steam:boolean; hearts:boolean; blush:boolean}
export interface AvatarMetrics {frames:number;steam:number;risingSteam:number;hearts:number;lastDrawMs:number;earAnchors:{x:number;y:number}[];lastParticleSamples:{side:number;x:number;y:number;vx:number;age:number}[];lastRisingSamples:{x:number;y:number;vy:number;age:number}[]}
export class AvatarRenderer {
 constructor(canvas:HTMLCanvasElement,small:HTMLCanvasElement|null,base:HTMLImageElement,original:HTMLImageElement,character?:string);
 metrics:AvatarMetrics;
 floating:unknown[];
 resize():void;
 resetSteam():void;
 resetParticles():void;
 draw(mood:Mood,effects:AvatarEffects,options?:{dt?:number;animate?:boolean;compare?:boolean}):void;
}
