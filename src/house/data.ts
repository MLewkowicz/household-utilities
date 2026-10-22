import {AVATAR_ASSETS} from '../avatars/catalog';
import type {Member} from '../ledger';
export type Character = Member;
export const characterColors:Record<Character,string>={michal:'#6e9dad',rina:'#c6809e',ohm:'#c8a04b',rohil:'#8c80ad'};
// Relative URLs work both locally and under the GitHub Pages repository prefix.
export const avatarUrl=(person:Character)=>`./avatars/v1/${AVATAR_ASSETS[person].happy256}`;
