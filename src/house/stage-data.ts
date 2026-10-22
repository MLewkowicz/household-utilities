import {HOUSE_SECTIONS,type Scene} from '../house-navigation';
import type {Character} from './data';
export const members:Character[]=['michal','rina','ohm','rohil'];
export const stages=HOUSE_SECTIONS.map(section=>({id:section.scene}));
export type StageId=Scene;
export interface StageState {boostUntil:number;variation:number;still:boolean}
