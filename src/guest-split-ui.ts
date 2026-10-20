import {MEMBERS,type Member} from './ledger';
import {$,esc,money,name} from './ui';
import {avatar} from './people';
import {parseAmount,type Shares} from './misc-ledger';
import {splitWithGuests} from './guest-split';

export function openGuestSplit(initial:{total:string;members:Member[]},onUse:(total:number,members:Member[],shares:Shares)=>void){
 const dialog=document.createElement('dialog');dialog.className='guest-dialog';dialog.setAttribute('aria-labelledby','guest-heading');
 dialog.innerHTML=`<form><div class="dialog-top"><h2 id="guest-heading" tabindex="-1">Split with guests</h2><button type="button" data-guest-close class="icon-button" aria-label="Close guest calculator">×</button></div>
 <label>Receipt total, including tax & tip<input id="guest-total" inputmode="decimal" value="${esc(initial.total)}" placeholder="0.00"></label>
 <fieldset><legend>Roommates at the table</legend><div class="chore-member-options">${MEMBERS.map(m=>`<label class="chore-check-tile member-${m}"><input type="checkbox" name="guest-member" value="${m}" ${initial.members.includes(m)?'checked':''}>${avatar(m)}${name(m)}</label>`).join('')}</div></fieldset>
 <div class="form-row"><label>Guests<select id="guest-count">${[1,2,3,4].map(n=>`<option>${n}</option>`).join('')}</select></label><label>Split<select id="guest-mode"><option value="equal">Equally</option><option value="custom">Custom shares</option></select></label></div>
 <div id="guest-inputs"></div><p id="guest-help" class="field-help" hidden>Dollars, fractions (1/3), or percentages (25%). Blank shares split the rest.</p>
 <div id="guest-preview" aria-live="polite"></div><p id="guest-error" class="form-error" role="alert" hidden></p>
 <p class="field-help">Only roommate shares will be saved. Settle guest shares outside the app.</p>
 <div class="dialog-actions"><button type="button" data-guest-close class="button secondary">Cancel</button><button id="guest-use" type="submit" class="button primary" disabled>Use household shares</button></div></form>`;
 document.body.append(dialog);
 const selected=()=>MEMBERS.filter(m=>dialog.querySelector<HTMLInputElement>(`[name=guest-member][value=${m}]`)!.checked);
 const value=(id:string)=>(dialog.querySelector('#'+id) as HTMLInputElement).value;
 let result:ReturnType<typeof splitWithGuests>|null=null;
 function preview(){
  const error=dialog.querySelector<HTMLElement>('#guest-error')!,preview=dialog.querySelector<HTMLElement>('#guest-preview')!;
  try{
   const members=selected(),guests=Number(value('guest-count'));
   const custom=value('guest-mode')==='custom'?[...dialog.querySelectorAll<HTMLInputElement>('[data-guest-share]')].map(el=>el.value):undefined;
   result=splitWithGuests(parseAmount(value('guest-total')),members,guests,custom);
   const labels=[...result.members.map(name),...Array.from({length:guests},(_,i)=>`Guest ${i+1}`)];
   preview.innerHTML=`<div class="guest-shares">${result.cents.map((c,i)=>`<div><span>${labels[i]}</span><strong>${money(c)}</strong></div>`).join('')}</div><p class="guest-subtotal">Household expense <strong>${money(result.householdTotal)}</strong></p>`;error.hidden=true;
  }catch(e){result=null;preview.textContent='';error.textContent=(e as Error).message;error.hidden=!value('guest-total');}
  (dialog.querySelector('#guest-use') as HTMLButtonElement).disabled=!result;
 }
 function rows(){
  const previous=new Map([...dialog.querySelectorAll<HTMLInputElement>('[data-guest-share]')].map(el=>[el.dataset.guestShare,el.value]));
  const members=selected(),labels=[...members.map(m=>({id:m,label:name(m)})),...Array.from({length:Number(value('guest-count'))},(_,i)=>({id:`guest-${i}`,label:`Guest ${i+1}`}))];
  const custom=value('guest-mode')==='custom';
  dialog.querySelector('#guest-inputs')!.innerHTML=custom?labels.map(row=>`<label class="guest-share-input">${row.label}<input data-guest-share="${row.id}" aria-label="${row.label} share" value="${esc(previous.get(row.id)||'')}" maxlength="40" placeholder="Split remainder"></label>`).join(''):'';
  (dialog.querySelector('#guest-help') as HTMLElement).hidden=!custom;preview();
 }
 dialog.addEventListener('change',event=>{const el=event.target as HTMLInputElement;if(el.name==='guest-member'||el.id==='guest-count'||el.id==='guest-mode')rows();});
 dialog.addEventListener('input',event=>{const el=event.target as HTMLInputElement;if(el.id==='guest-total'||el.hasAttribute('data-guest-share'))preview();});
 dialog.querySelectorAll('[data-guest-close]').forEach(button=>button.addEventListener('click',()=>dialog.close()));
 dialog.querySelector('form')!.addEventListener('submit',event=>{event.preventDefault();preview();if(result){onUse(result.householdTotal,result.members,result.shares);dialog.close();}});
 dialog.addEventListener('close',()=>{result=null;dialog.querySelector('form')!.reset();dialog.replaceChildren();dialog.remove();});
 rows();dialog.showModal();$('#guest-heading').focus();
}
