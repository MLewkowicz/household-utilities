import {MEMBERS,type Member} from './ledger';
import {saved,remember} from './ui';
export let identity:Member|null=MEMBERS.includes(saved('household-person') as Member)?saved('household-person') as Member:null;
const listeners=new Set<()=>void>();
export function onIdentityChange(listener:()=>void){listeners.add(listener);}
export function setIdentity(person:Member|null){identity=person;remember('household-person',person||'');for(const fn of listeners)fn();}
window.addEventListener('storage',event=>{if(event.key==='household-person')setIdentity(MEMBERS.includes(event.newValue as Member)?event.newValue as Member:null);});
