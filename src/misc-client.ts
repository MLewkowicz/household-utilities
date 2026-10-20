import { MEMBERS, type Member } from './ledger';
import { equalShares, parseAmount, type Expense, type Settlement, type MiscLedger, type Shares, type Pair } from './misc-ledger';
import { $, esc, money, name, date, today, saved, remember, rpc, toast, download } from './ui';
import { CATEGORIES, getIcon, iconSvg, suggestIcons, searchIcons } from './icons';
import { initCalculator, openCalculator } from './calculator-ui';

let ledger: MiscLedger|undefined, live=false, loading=false, busy=false;
let identity: Member|null=MEMBERS.includes(saved('household-person') as Member)?saved('household-person') as Member:null;
let person: Member|'all'='all', feedType='all', showDeleted=false;
let editingExpense: Expense|undefined, editingSettlement: Settlement|undefined;
let participants=new Set<Member>(), customDraft: Partial<Record<Member,string>>={}, chosenIcon='receipt', manualIcon=false;
let expenseId='', expenseRequest='', expenseFingerprint='', settlementId='', settlementRequest='', settlementFingerprint='';
let expensePayload: Record<string,unknown>|null=null;
let deleting: {kind:'expense'|'settlement';entry:Expense|Settlement;request:string}|null=null;
const options=()=>MEMBERS.map(m=>`<option value="${m}">${name(m)}</option>`).join('');
const avatar=(m: Member)=>`<span class="avatar ${m}">${name(m)[0]}</span>`;
const memberChip=(m: Member)=>`<span class="actor-chip member-${m}">${name(m)}</span>`;
const input=<T extends HTMLInputElement|HTMLSelectElement=HTMLInputElement>(id:string)=>$<T>('#'+id);
const message=(id:string,text:string)=>{const el=$('#'+id);el.textContent=text;el.hidden=!text;};
const isExpense=(e:Expense|Settlement):e is Expense=>'description' in e;

export function initMisc() {
 $('#misc-page').innerHTML=`
  <section class="intro"><div><div class="eyebrow">THE EVERYDAY EXTRAS</div><h1>Little things.<br>Fairly shared.</h1><p class="intro-copy">From paper towels to pizza night.<br class="mobile-break"> Keep the little things between us.</p></div><div class="intro-side"><span class="status"><span class="status-dot"></span><span id="misc-status">Loading purchases</span></span><div class="misc-primary-actions"><button id="new-expense" class="button primary" disabled><span aria-hidden="true">＋</span> Add expense</button><button id="new-settlement" class="button secondary" disabled>Record repayment</button></div></div></section>
  <div id="misc-notice" class="ledger-notice" role="status" hidden></div>
  <div id="misc-error" class="ledger-error" role="alert" hidden></div>
  <section id="identity-panel" class="identity-panel" aria-labelledby="identity-title"><div><div class="eyebrow">MAKE YOURSELF AT HOME</div><h2 id="identity-title">Who are you?</h2><p class="section-copy">Choose your name before adding a purchase.<br>We’ll remember it on this device.</p></div><div class="identity-choices">${MEMBERS.map(m=>`<button class="person-tile member-${m}" data-identity="${m}">${avatar(m)}<span>I’m ${name(m)}</span></button>`).join('')}</div></section>
  <div id="identity-bar" class="identity-bar" hidden><span id="identity-name"></span><button id="switch-person" class="text-button">Switch person</button><span class="identity-caption">Your purchases. Everyone’s fair share.</span></div>
  <section class="misc-overview" aria-labelledby="misc-balances-title"><div class="section-top compact"><h2 id="misc-balances-title">At a glance</h2><span id="misc-as-of" class="quiet"></span></div><div id="misc-balances" class="balance-grid" aria-busy="true"></div></section>
  <section class="misc-pair-section" aria-labelledby="pair-title"><div class="section-top"><div><div class="eyebrow">01 / BETWEEN ROOMMATES</div><h2 id="pair-title">Who owes whom</h2><p class="section-copy">Shared purchases only. Utility balances stay in Utilities.</p></div></div><div id="misc-pairs" class="pair-grid"></div></section>
  <section class="misc-feed-section" aria-labelledby="misc-feed-title"><div class="section-top"><div><div class="eyebrow">02 / THE LITTLE THINGS</div><h2 id="misc-feed-title">Around the household</h2><p class="section-copy" id="misc-spent">Purchases and repayments, together in one place.</p></div><div id="misc-person-filter" class="segmented" role="group" aria-label="Filter purchases by person"><button data-filter-person="all" aria-pressed="true">Everyone</button>${MEMBERS.map(m=>`<button data-filter-person="${m}" class="member-${m}" aria-pressed="false">${name(m)}</button>`).join('')}</div></div><div class="feed-toolbar"><div id="misc-type-filter" class="segmented" role="group" aria-label="Entry type"><button data-type="all" aria-pressed="true">All</button><button data-type="expense" aria-pressed="false">Expenses</button><button data-type="settlement" aria-pressed="false">Repayments</button></div><label class="inline-check"><input type="checkbox" id="show-deleted"> Show deleted</label></div><div id="misc-feed"></div></section>
  <p class="misc-footnote">A shared notebook for the things you’ve already paid for. Repayments are recorded here after sending money in your usual app.</p>`;
 document.body.insertAdjacentHTML('beforeend',`
  <dialog id="expense-dialog" class="expense-dialog" aria-labelledby="expense-title"><form id="expense-form"><div class="dialog-top"><div class="eyebrow">ONE LITTLE THING</div><button type="button" class="icon-button" data-close="expense-dialog" aria-label="Close expense form">×</button></div><h2 id="expense-title">Add an expense</h2>
   <div class="expense-hero"><span id="chosen-icon" class="chosen-icon"></span><label>What did you buy?<input id="expense-description" maxlength="160" placeholder="e.g. paper towels for the kitchen" required autocomplete="off"></label></div>
   <div class="icon-suggestions" id="icon-suggestions" aria-label="Suggested purchase icons"></div>
   <label class="inline-check icon-name-option"><input type="checkbox" id="icon-fill-name" checked> Use icon name as description</label>
   <details class="icon-picker" id="icon-picker"><summary>Choose an icon <span id="chosen-icon-label">Receipt</span></summary><div class="picker-controls"><label class="sr-only" for="icon-search">Search icons</label><input id="icon-search" placeholder="Try milk, cleaning, or travel" type="search"><label class="sr-only" for="icon-category">Icon category</label><select id="icon-category"><option value="">All categories</option>${CATEGORIES.map(c=>`<option>${c}</option>`).join('')}</select></div><div id="icon-grid" class="icon-grid"></div></details>
   <div class="form-row"><div class="amount-field"><label>Purchase amount<span class="amount-input"><span>$</span><input id="expense-amount" aria-label="Purchase amount" inputmode="decimal" placeholder="0.00" required autocomplete="off"></span></label><button type="button" class="text-button calculator-link" data-calculate="expense" aria-label="Calculate purchase amount">Calculator</button></div><label>Purchase date<input id="expense-date" type="date" required></label></div>
   <div id="expense-payer-line" class="payer-line"></div><label id="expense-payer-label" hidden>Who paid?<select id="expense-payer">${options()}</select></label>
   <fieldset><legend>How should we split it?</legend><div class="method-options split-options"><label><input type="radio" name="split-mode" value="equal" checked><span>Equally</span></label><label><input type="radio" name="split-mode" value="custom"><span>Custom amounts</span></label></div></fieldset>
   <div class="split-heading"><h3>Share with</h3><label class="inline-check"><input type="checkbox" id="include-self" checked> Include my share</label></div>
   <div id="participant-tiles" class="participant-grid"></div><div id="self-share" class="self-share"></div><div id="custom-shares" class="custom-shares" hidden></div>
   <p id="split-status" class="split-status" role="status"></p><p class="privacy-hint">Entries are public. Keep addresses, account numbers, and other personal details out of descriptions.</p>
   <div id="expense-error" class="form-error" role="alert" hidden></div><button id="reload-expense" type="button" class="text-button" hidden>Load latest version</button>
   <div class="dialog-actions"><button type="button" class="button secondary" data-close="expense-dialog">Cancel</button><button id="save-expense" class="button primary" type="submit">Add expense</button></div><p class="dialog-footnote" id="expense-actor"></p>
  </form></dialog>
  <dialog id="settlement-dialog" aria-labelledby="settlement-title"><form id="settlement-form"><div class="dialog-top"><div class="eyebrow">SQUARE THINGS UP</div><button type="button" class="icon-button" data-close="settlement-dialog" aria-label="Close repayment form">×</button></div><h2 id="settlement-title" tabindex="-1" autofocus>Record a repayment</h2><p class="dialog-description">For shared purchases. Add money that has already been sent.</p>
   <div class="form-row"><label>Who sent it?<select id="settlement-sender">${options()}</select></label><label>Who received it?<select id="settlement-recipient">${options()}</select></label></div>
   <div class="amount-field"><label>Repayment amount<span class="amount-input"><span>$</span><input id="settlement-amount" aria-label="Repayment amount" inputmode="decimal" placeholder="0.00" required autocomplete="off"></span></label><button type="button" class="text-button calculator-link" data-calculate="settlement" aria-label="Calculate repayment amount">Calculator</button></div><p id="repayment-balance" class="split-status" role="status"></p>
   <label>Repayment date<input id="settlement-date" type="date" required></label><fieldset><legend>Sent with</legend><div class="method-options">${['venmo','zelle','other'].map(m=>`<label><input type="radio" name="settlement-method" value="${m}" ${m==='venmo'?'checked':''}><span>${name(m)}</span></label>`).join('')}</div></fieldset><label id="settlement-other-label" hidden>How was it sent?<input id="settlement-other" maxlength="80" placeholder="e.g. cash"><small>Don’t include account or contact details.</small></label>
   <div id="settlement-error" class="form-error" role="alert" hidden></div><button type="button" id="reload-settlement" class="text-button" hidden>Load latest version</button><div class="dialog-actions"><button type="button" class="button secondary" data-close="settlement-dialog">Cancel</button><button id="save-settlement" class="button primary" type="submit">Save repayment</button></div><p id="settlement-actor" class="dialog-footnote"></p>
  </form></dialog>
  <dialog id="misc-delete-dialog" aria-labelledby="misc-delete-title"><form id="misc-delete-form"><div class="eyebrow">CORRECT THE RECORD</div><h2 id="misc-delete-title">Delete this entry?</h2><p id="misc-delete-description" class="dialog-description"></p><p class="dialog-description">It will be removed from balances. The entry and its history stay available under Show deleted.</p><div id="misc-delete-error" class="form-error" role="alert" hidden></div><div class="dialog-actions"><button type="button" class="button secondary" data-close="misc-delete-dialog">Keep entry</button><button id="confirm-misc-delete" class="button danger" type="submit">Delete entry</button></div><p id="misc-delete-actor" class="dialog-footnote"></p></form></dialog>`);
 initCalculator();bindEvents();renderIdentity();renderIconGrid();
}

function renderIdentity() {
 $('#identity-panel').hidden=!!identity;$('#identity-bar').hidden=!identity;
 if(identity)$('#identity-name').innerHTML=`${avatar(identity)} <span class="actor-chip member-${identity}">You’re ${name(identity)}</span>`;
 $('#new-expense').toggleAttribute('disabled',!identity||!live);$('#new-settlement').toggleAttribute('disabled',!identity||!live);
}
function render() {
 if(!ledger)return;renderIdentity();
 $('#misc-as-of').textContent=ledger.updated_at?'USD · '+date(ledger.updated_at,true):'USD';
 $('#misc-balances').innerHTML=MEMBERS.map(m=>{
  const owed=ledger!.pairs.filter(p=>p.sender===m).reduce((s,p)=>s+p.amount_cents,0);
  const collect=ledger!.pairs.filter(p=>p.recipient===m).reduce((s,p)=>s+p.amount_cents,0);
  return `<article class="balance-card member-${m}"><div class="person-heading"><div class="person-name">${avatar(m)}${name(m)}</div></div><div class="misc-balance-line"><strong>${money(owed)}</strong><span>to pay</span></div><div class="misc-balance-line collect"><strong>${money(collect)}</strong><span>to collect</span></div><div class="balance-caption">${!owed&&!collect?'All settled up':'Shared purchases only'}</div></article>`;
 }).join('');$('#misc-balances').setAttribute('aria-busy','false');
 $('#misc-pairs').innerHTML=ledger.pairs.length?ledger.pairs.map(p=>`<div class="pair-card"><div class="pair-people">${avatar(p.sender)}<span class="pair-arrow" aria-hidden="true">→</span>${avatar(p.recipient)}<span>${memberChip(p.sender)} owes ${memberChip(p.recipient)}</span></div><strong>${money(p.amount_cents)}</strong><button class="text-button" data-repay-from="${p.sender}" data-repay-to="${p.recipient}" ${!live||!identity?'disabled':''}>Record repayment</button></div>`).join(''):'<div class="empty-state settled-empty"><span class="settled-mark" aria-hidden="true">✓</span><div><h3>Everyone’s square.</h3><p>Shared purchases will appear here when someone is owed.</p></div></div>';
 $('#misc-spent').textContent=money(ledger.expenses.filter(e=>!e.deleted).reduce((s,e)=>s+e.amount_cents,0))+' in purchases · repayments counted separately';
 renderFeed();$('#export').removeAttribute('disabled');
}

function entryHistory(entry:Expense|Settlement) {
 const history=isExpense(entry)?ledger!.expense_history:ledger!.settlement_history;
 const revisions=history.filter(e=>e.id===entry.id).sort((a,b)=>b.version-a.version);
 return `<details class="entry-history"><summary>History · ${entry.version} ${entry.version===1?'entry':'revisions'}</summary><ol>${revisions.map(e=>{
  const previous=revisions.find(r=>r.version===e.version-1);
  const changes=previous&&!e.deleted?changesBetween(previous,e):[];
  const verb=e.deleted?'Deleted':e.version===1?'Added':'Edited';
  return `<li><div>${verb} by ${memberChip(e.actor)} <span class="quiet">· ${esc(new Date(e.created_at).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}))}</span></div>${changes.length?`<ul>${changes.map(c=>`<li>${esc(c)}</li>`).join('')}</ul>`:`<p>${esc(isExpense(e)?`${e.description} · ${money(e.amount_cents)} paid by ${name(e.payer)} · ${Object.entries(e.shares).map(([m,c])=>name(m)+' '+money(c!)).join(', ')}`:`${name(e.sender)} → ${name(e.recipient)} · ${money(e.amount_cents)} · ${e.method==='other'?e.other:name(e.method)}`)}</p>`}</li>`;
 }).join('')}</ol></details>`;
}
function changesBetween(before:Expense|Settlement,after:Expense|Settlement):string[] {
 const labels:Record<string,string>={description:'Description',icon_id:'Icon',amount_cents:'Amount',paid_on:'Date',payer:'Paid by',split_mode:'Split',participants:'People',shares:'Shares',sender:'Sender',recipient:'Recipient',method:'Method',other:'Method detail'};
 const a=before as unknown as Record<string,unknown>,b=after as unknown as Record<string,unknown>;
 function format(k:string,v:unknown):string {
  if(k==='amount_cents')return money(v as number);
  if(k==='icon_id')return getIcon(v as string).label;
  if(k==='participants')return (v as string[]).map(name).join(', ');
  if(k==='shares')return Object.entries(v as Shares).map(([m,c])=>`${name(m)} ${money(c!)}`).join(', ');
  if(['payer','sender','recipient','method','split_mode'].includes(k))return name(String(v));
  return String(v||'—');
 }
 return Object.keys(labels).filter(k=>JSON.stringify(a[k])!==JSON.stringify(b[k])).map(k=>`${labels[k]}: ${format(k,a[k])} → ${format(k,b[k])}`);
}
function renderFeed() {
 if(!ledger)return;
 const entries: (Expense|Settlement)[]=[...(feedType==='settlement'?[]:ledger.expenses),...(feedType==='expense'?[]:ledger.settlements)]
  .filter(e=>(showDeleted||!e.deleted)&&(person==='all'||(isExpense(e)?e.payer===person||e.participants.includes(person):e.sender===person||e.recipient===person)))
  .sort((a,b)=>b.paid_on.localeCompare(a.paid_on)||b.created_at.localeCompare(a.created_at)||a.id.localeCompare(b.id));
 let month='';
 $('#misc-feed').innerHTML=entries.map(e=>{
  const purchase=isExpense(e),payer=purchase?e.payer:e.sender,kind=purchase?'expense':'settlement';
  const thisMonth=e.paid_on.slice(0,7);let heading='';
  if(month!==thisMonth){month=thisMonth;heading=`<h3 class="feed-month">${new Date(month+'-01T12:00Z').toLocaleDateString('en-US',{month:'long',year:'numeric',timeZone:'UTC'})}</h3>`;}
  return `${heading}<article class="expense-card member-${payer} ${e.deleted?'entry-deleted':''}" data-entry-id="${e.id}"><div class="expense-card-main"><span class="entry-illustration">${purchase?iconSvg(e.icon_id):'<span class="repayment-symbol" aria-hidden="true">↗</span>'}</span><div class="entry-description"><h3>${purchase?esc(e.description):`${name(e.sender)} → ${name(e.recipient)}`}</h3><p>${purchase?`${memberChip(e.payer)} paid`:`Repayment · ${esc(e.method==='other'?e.other:name(e.method))}`} · ${date(e.paid_on)} ${e.deleted?'<span class="deleted-label">DELETED</span>':e.version>1?'<span class="edited-label">Edited</span>':''}</p></div><strong class="entry-amount">${money(e.amount_cents)}</strong></div>${purchase?`<div class="entry-shares">${e.participants.map(m=>`<span class="share-chip member-${m}">${name(m)} <strong>${money(e.shares[m]||0)}</strong></span>`).join('')}</div>`:''}<div class="entry-bottom">${entryHistory(e)}${!e.deleted&&live&&identity?`<div class="entry-actions"><button class="text-button" data-misc-edit="${e.id}" data-kind="${kind}" aria-label="Edit ${purchase?esc(e.description):'repayment'}">Edit</button><button class="text-button" data-misc-delete="${e.id}" data-kind="${kind}" aria-label="Delete ${purchase?esc(e.description):'repayment'}">Delete</button></div>`:''}</div></article>`;
 }).join('')||`<div class="empty-state misc-empty"><span class="empty-illustration">${iconSvg('groceries')}${iconSvg('paper-towels')}${iconSvg('pizza')}</span><h3>${ledger.expenses.length||ledger.settlements.length?'Nothing in this view yet.':'Good things are better shared.'}</h3><p>${ledger.expenses.length||ledger.settlements.length?'Try another filter or include deleted entries.':'Bought something for the household? Add the first expense.'}</p></div>`;
}

export async function refreshMisc() {
 if(loading||busy)return;loading=true;$('#refresh').setAttribute('disabled','');
 try{ledger=await rpc<MiscLedger>('misc_dashboard');live=true;message('misc-notice','');message('misc-error','');$('#misc-status').textContent='Shared purchases · up to date';}
 catch {
  live=false;
  if(!ledger)try{const response=await fetch('./misc-ledger.json',{cache:'no-store'});if(!response.ok)throw new Error();ledger=await response.json();}catch{message('misc-error','Purchases are unavailable. Please try refreshing.');}
  $('#misc-status').textContent=ledger?'Viewing saved purchases':'Purchases unavailable';
  message('misc-notice',ledger?`The live ledger is unavailable. ${ledger.updated_at?'Showing saved purchases from '+date(ledger.updated_at,true)+'.':'No purchases have been saved in this snapshot yet.'} Adding and editing entries is disabled until the connection returns.`:'');
 }finally{loading=false;$('#refresh').removeAttribute('disabled');}
 render();if($<HTMLDialogElement>('#expense-dialog').open)updateSplitPreview();
}
export function exportMisc(){if(ledger)download({...ledger,exported_at:new Date().toISOString()},'miscellaneous-ledger');}

function splitMode(): 'equal'|'custom' {return $<HTMLInputElement>('#expense-form [name=split-mode]:checked').value as 'equal'|'custom';}
function selectedParticipants():Member[]{return MEMBERS.filter(m=>participants.has(m));}
function previewShares(amount:number):Shares {
 const people=selectedParticipants();
 if(editingExpense&&editingExpense.split_mode==='equal'&&amount===editingExpense.amount_cents&&JSON.stringify(people)===JSON.stringify(editingExpense.participants))return editingExpense.shares;
 return equalShares(amount,people,ledger?.rounding_cursor||0);
}
function renderParticipants() {
 const payer=input('expense-payer').value as Member;
 input('include-self').checked=participants.has(payer);
 $('#participant-tiles').innerHTML=MEMBERS.filter(m=>m!==payer).map(m=>`<button type="button" class="person-tile member-${m}" data-participant="${m}" aria-pressed="${participants.has(m)}">${avatar(m)}<span>${name(m)}</span><strong data-share-value="${m}">—</strong><span class="tile-check" aria-hidden="true">${participants.has(m)?'✓':'＋'}</span></button>`).join('');
 $('#self-share').innerHTML=`${avatar(payer)}<span>${name(payer)}’s own share</span><strong data-share-value="${payer}">—</strong>`;
 $('#custom-shares').innerHTML=selectedParticipants().map(m=>`<div class="custom-share-row member-${m}">${avatar(m)}<label for="custom-share-${m}">${name(m)}</label><span class="compact-amount"><span>$</span><input id="custom-share-${m}" data-custom-share="${m}" aria-label="${name(m)}’s share" inputmode="decimal" value="${esc(customDraft[m]??'0.00')}"></span><button type="button" class="share-calculator" data-calculate="${m}" aria-label="Calculate ${name(m)}’s share" title="Calculator">÷</button></div>`).join('');
 $('#custom-shares').hidden=splitMode()!=='custom';
 $('#expense-payer-line').innerHTML=`${avatar(payer)}<span>Paid by ${memberChip(payer)}</span>`;
 updateSplitPreview();
}
function updateSplitPreview() {
 let valid=true,amount=0,shares:Shares={},status='Enter an amount to see everyone’s share.';
 try{amount=parseAmount(input('expense-amount').value);}catch{valid=false;}
 if(!participants.size){valid=false;status='Select at least one person to share with.';}
 else if(amount){
  if(splitMode()==='equal'){
   shares=previewShares(amount);status=`${money(amount)} shared ${participants.size===1?'with one person':`between ${participants.size} people`}.`;
  }else{
   let assigned=0,invalid=false;
   for(const m of participants)try{shares[m]=parseAmount(customDraft[m]??'0',true);assigned+=shares[m]!;}catch{invalid=true;}
   const left=amount-assigned;
   valid=valid&&!invalid&&left===0;
   status=invalid?'Use dollars and cents for each share.':left>0?`${money(left)} left to assign`:left<0?`${money(-left)} over the purchase total`:'Every cent accounted for.';
  }
 }
 document.querySelectorAll<HTMLElement>('[data-share-value]').forEach(el=>{const m=el.dataset.shareValue as Member;el.textContent=!participants.has(m)?'Not included':shares[m]===undefined?'—':money(shares[m]!);});
 $('#self-share').hidden=!participants.has(input('expense-payer').value as Member);
 $('#split-status').textContent=status;$('#split-status').classList.toggle('balanced',valid);
 $('#save-expense').toggleAttribute('disabled',!valid||busy||!live);
}
function updateChosenIcon() {
 $('#chosen-icon').innerHTML=iconSvg(chosenIcon);$('#chosen-icon-label').textContent=getIcon(chosenIcon).label;
 const suggestions=suggestIcons(input('expense-description').value);
 $('#icon-suggestions').innerHTML=suggestions.length?`<span>${input('icon-fill-name').checked?'Tap to name it':'Choose an icon'}</span>${suggestions.map(i=>`<button type="button" data-icon="${i.id}" class="suggestion-chip" aria-pressed="${manualIcon&&i.id===chosenIcon}">${iconSvg(i.id)}${i.label}</button>`).join('')}`:'';
 document.querySelectorAll<HTMLElement>('#icon-grid [data-icon]').forEach(el=>el.setAttribute('aria-pressed',String(manualIcon&&el.dataset.icon===chosenIcon)));
}
function renderIconGrid() {
 const icons=searchIcons(input('icon-search').value,input('icon-category').value);
 $('#icon-grid').innerHTML=icons.map(i=>`<button type="button" data-icon="${i.id}" class="icon-choice" aria-label="${i.label} icon" aria-pressed="${manualIcon&&chosenIcon===i.id}">${iconSvg(i.id)}<span>${i.label}</span></button>`).join('')||'<p class="section-copy">No matching icons. Try a broader word or another category.</p>';
}
function openExpense(entry?:Expense) {
 if(!identity||!live||busy)return;
 editingExpense=entry;expenseId=entry?.id||crypto.randomUUID();expenseRequest=crypto.randomUUID();expenseFingerprint='';expensePayload=null;
 $<HTMLFormElement>('#expense-form').reset();
 input('expense-description').value=entry?.description||'';input('expense-amount').value=entry?(entry.amount_cents/100).toFixed(2):'';
 input('expense-date').value=entry?.paid_on||today();input('expense-date').max=today();
 input('expense-payer').value=entry?.payer||identity;$('#expense-payer-label').hidden=!entry;
 $<HTMLInputElement>(`#expense-form [name=split-mode][value=${entry?.split_mode||'equal'}]`).checked=true;
 participants=new Set(entry?.participants||MEMBERS);customDraft={};
 if(entry)for(const m of entry.participants)customDraft[m]=((entry.shares[m]||0)/100).toFixed(2);
 chosenIcon=entry?.icon_id||'receipt';manualIcon=!!entry;
 $<HTMLDetailsElement>('#icon-picker').open=false;input('icon-search').value='';input('icon-category').value='';
 $('#expense-title').textContent=entry?'Edit expense':'Add an expense';$('#save-expense').textContent=entry?'Save changes':'Add expense';
 $('#expense-actor').textContent=`${entry?'Editing':'Recording'} as ${name(identity)}`;
 message('expense-error','');$('#reload-expense').hidden=true;
 renderParticipants();updateChosenIcon();renderIconGrid();
 $<HTMLDialogElement>('#expense-dialog').showModal();input('expense-description').focus();
}
function settlementMethod(){return $<HTMLInputElement>('#settlement-form [name=settlement-method]:checked').value;}
function updateSettlement() {
 const other=settlementMethod()==='other';$('#settlement-other-label').hidden=!other;input('settlement-other').required=other;
 const sender=input('settlement-sender').value,recipient=input('settlement-recipient').value;
 let amount=0;try{amount=parseAmount(input('settlement-amount').value);}catch{/* Leave the incomplete form open. */}
 const due=ledger?.pairs.find(p=>p.sender===sender&&p.recipient===recipient)?.amount_cents||0;
 $('#repayment-balance').textContent=sender===recipient?'Choose two different roommates.':editingSettlement?'Editing this repayment will adjust the balance between these two people.':amount>due?`${money(amount-due)} beyond the current debt will become a credit.`:`Current debt: ${money(due)}`;
 $('#save-settlement').toggleAttribute('disabled',!amount||sender===recipient||busy||!live||(other&&!input('settlement-other').value.trim()));
}
function openSettlement(entry?:Settlement,pair?:Pair) {
 if(!identity||!live||busy)return;
 editingSettlement=entry;settlementId=entry?.id||crypto.randomUUID();settlementRequest=crypto.randomUUID();settlementFingerprint='';
 $<HTMLFormElement>('#settlement-form').reset();
 input('settlement-sender').value=entry?.sender||pair?.sender||identity;
 input('settlement-recipient').value=entry?.recipient||pair?.recipient||MEMBERS.find(m=>m!==identity)!;
 input('settlement-amount').value=entry||pair?((entry?.amount_cents||pair!.amount_cents)/100).toFixed(2):'';
 input('settlement-date').value=entry?.paid_on||today();input('settlement-date').max=today();
 $<HTMLInputElement>(`#settlement-form [name=settlement-method][value=${entry?.method||'venmo'}]`).checked=true;
 input('settlement-other').value=entry?.other||'';
 $('#settlement-title').textContent=entry?'Edit repayment':'Record a repayment';
 $('#settlement-actor').textContent=`${entry?'Editing':'Recording'} as ${name(identity)}`;
 message('settlement-error','');$('#reload-settlement').hidden=true;updateSettlement();
 $<HTMLDialogElement>('#settlement-dialog').showModal();$('#settlement-title').focus({preventScroll:true});
}
function openDelete(kind:'expense'|'settlement',entry:Expense|Settlement) {
 if(!identity||busy||!live)return;
 deleting={kind,entry,request:crypto.randomUUID()};
 $('#misc-delete-title').textContent=`Delete this ${kind==='expense'?'expense':'repayment'}?`;
 $('#misc-delete-description').textContent=isExpense(entry)?`${entry.description} · ${money(entry.amount_cents)} paid by ${name(entry.payer)}`:`${money(entry.amount_cents)} sent from ${name(entry.sender)} to ${name(entry.recipient)}`;
 $('#misc-delete-actor').textContent=`Deleting as ${name(identity)}`;message('misc-delete-error','');
 $<HTMLDialogElement>('#misc-delete-dialog').showModal();
}
function freezeForm(formId:string):()=>void {
 const controls=[...document.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLButtonElement>(`#${formId} input,#${formId} select,#${formId} button`)];
 const prior=controls.map(el=>el.disabled);controls.forEach(el=>el.disabled=true);
 return ()=>controls.forEach((el,i)=>el.disabled=prior[i]);
}
async function saveExpense(event:Event) {
 event.preventDefault();if(busy||!live||!identity)return;
 let thaw=()=>{};
 try {
  const amount=parseAmount(input('expense-amount').value),mode=splitMode();
  const shares:Shares={};if(mode==='custom')for(const m of participants)shares[m]=parseAmount(customDraft[m]??'0',true);
  const p={action:editingExpense?'edit':'create',id:expenseId,expected_version:editingExpense?.version||0,actor:identity,payer:input('expense-payer').value,description:input('expense-description').value.trim(),icon_id:chosenIcon,amount_cents:amount,paid_on:input('expense-date').value,split_mode:mode,participants:selectedParticipants(),...(mode==='custom'?{shares}:{})};
  const fingerprint=JSON.stringify(p);
  if(expenseFingerprint!==fingerprint){expenseRequest=crypto.randomUUID();expensePayload={...p,expected_rounding_cursor:ledger!.rounding_cursor};expenseFingerprint=fingerprint;}
  busy=true;thaw=freezeForm('expense-form');message('expense-error','');
  await rpc('save_misc_expense',{p:{...expensePayload,request_id:expenseRequest}});
  $<HTMLDialogElement>('#expense-dialog').close();toast(editingExpense?'Expense updated.':'One little thing, fairly shared.');
  busy=false;await refreshMisc();
 }catch(error){
  const detail=error instanceof Error?error.message:'Could not save. Please try again.';
  message('expense-error',detail);
  if(detail.includes('split preview changed')){expenseFingerprint='';expensePayload=null;}
  busy=false;await refreshMisc();
  $('#reload-expense').hidden=!ledger?.expenses.some(e=>e.id===expenseId&&e.version!==(editingExpense?.version||0));
 }finally{busy=false;thaw();updateSplitPreview();}
}
async function saveSettlement(event:Event) {
 event.preventDefault();if(busy||!live||!identity)return;
 let thaw=()=>{};
 try{
  const p={action:editingSettlement?'edit':'create',id:settlementId,expected_version:editingSettlement?.version||0,actor:identity,sender:input('settlement-sender').value,recipient:input('settlement-recipient').value,amount_cents:parseAmount(input('settlement-amount').value),paid_on:input('settlement-date').value,method:settlementMethod(),other:input('settlement-other').value.trim()};
  const fingerprint=JSON.stringify(p);if(settlementFingerprint&&settlementFingerprint!==fingerprint)settlementRequest=crypto.randomUUID();settlementFingerprint=fingerprint;
  busy=true;thaw=freezeForm('settlement-form');message('settlement-error','');
  await rpc('save_misc_settlement',{p:{...p,request_id:settlementRequest}});
  $<HTMLDialogElement>('#settlement-dialog').close();toast(editingSettlement?'Repayment updated.':'Repayment recorded.');
  busy=false;await refreshMisc();
 }catch(error){
  message('settlement-error',error instanceof Error?error.message:'Could not save. Please try again.');
  busy=false;await refreshMisc();
  $('#reload-settlement').hidden=!ledger?.settlements.some(e=>e.id===settlementId&&e.version!==(editingSettlement?.version||0));
 }finally{busy=false;thaw();updateSettlement();}
}
async function deleteEntry(event:Event) {
 event.preventDefault();if(!deleting||busy||!live||!identity)return;
 busy=true;const thaw=freezeForm('misc-delete-form');
 try{
  await rpc(`save_misc_${deleting.kind}`,{p:{action:'delete',id:deleting.entry.id,expected_version:deleting.entry.version,actor:identity,request_id:deleting.request}});
  $<HTMLDialogElement>('#misc-delete-dialog').close();toast('Entry deleted. Balances updated.');busy=false;await refreshMisc();
 }catch(error){message('misc-delete-error',error instanceof Error?error.message:'Could not delete. Please try again.');busy=false;await refreshMisc();}
 finally{busy=false;thaw();}
}

function bindEvents() {
 $('#identity-panel').addEventListener('click',event=>{
  const button=(event.target as HTMLElement).closest<HTMLElement>('[data-identity]');if(!button)return;
  identity=button.dataset.identity as Member;remember('household-person',identity);renderIdentity();if(ledger)render();
 });
 $('#switch-person').addEventListener('click',()=>{identity=null;remember('household-person','');renderIdentity();if(ledger)render();$('#identity-panel button').focus();});
 $('#new-expense').addEventListener('click',()=>openExpense());$('#new-settlement').addEventListener('click',()=>openSettlement());
 $('#misc-pairs').addEventListener('click',event=>{
  const button=(event.target as HTMLElement).closest<HTMLElement>('[data-repay-from]');if(!button)return;
  const pair=ledger?.pairs.find(p=>p.sender===button.dataset.repayFrom&&p.recipient===button.dataset.repayTo);if(pair)openSettlement(undefined,pair);
 });
 $('#misc-person-filter').addEventListener('click',event=>{
  const button=(event.target as HTMLElement).closest<HTMLElement>('[data-filter-person]');if(!button)return;person=button.dataset.filterPerson as Member|'all';
  document.querySelectorAll<HTMLElement>('[data-filter-person]').forEach(el=>el.setAttribute('aria-pressed',String(el===button)));renderFeed();
 });
 $('#misc-type-filter').addEventListener('click',event=>{
  const button=(event.target as HTMLElement).closest<HTMLElement>('[data-type]');if(!button)return;feedType=button.dataset.type!;
  document.querySelectorAll<HTMLElement>('[data-type]').forEach(el=>el.setAttribute('aria-pressed',String(el===button)));renderFeed();
 });
 $('#show-deleted').addEventListener('change',()=>{showDeleted=input('show-deleted').checked;renderFeed();});
 $('#misc-feed').addEventListener('click',event=>{
  const button=(event.target as HTMLElement).closest<HTMLElement>('[data-misc-edit],[data-misc-delete]');if(!button||!live||!identity)return;
  const kind=button.dataset.kind as 'expense'|'settlement',id=button.dataset.miscEdit||button.dataset.miscDelete;
  const entry=(kind==='expense'?ledger!.expenses:ledger!.settlements).find(e=>e.id===id);if(!entry)return;
  if(button.dataset.miscDelete)openDelete(kind,entry);else if(isExpense(entry))openExpense(entry);else openSettlement(entry);
 });
 document.querySelectorAll<HTMLElement>('[data-close]').forEach(b=>b.addEventListener('click',()=>{if(!busy)$<HTMLDialogElement>('#'+b.dataset.close).close();}));
 for(const id of ['expense-dialog','settlement-dialog','misc-delete-dialog'])$('#'+id).addEventListener('cancel',event=>{if(busy)event.preventDefault();});
 $('#expense-description').addEventListener('input',()=>{if(!manualIcon)chosenIcon=suggestIcons(input('expense-description').value)[0]?.id||'receipt';updateChosenIcon();});
 $('#icon-fill-name').addEventListener('change',updateChosenIcon);
 $('#expense-amount').addEventListener('input',updateSplitPreview);
 $('#expense-payer').addEventListener('change',renderParticipants);
 $('#include-self').addEventListener('change',()=>{const m=input('expense-payer').value as Member;input('include-self').checked?participants.add(m):participants.delete(m);renderParticipants();});
 $('#participant-tiles').addEventListener('click',event=>{
  const button=(event.target as HTMLElement).closest<HTMLElement>('[data-participant]');if(!button)return;
  const m=button.dataset.participant as Member;participants.has(m)?participants.delete(m):participants.add(m);renderParticipants();
  $<HTMLButtonElement>(`[data-participant=${m}]`).focus();
 });
 $('#custom-shares').addEventListener('input',event=>{const field=event.target as HTMLInputElement;customDraft[field.dataset.customShare as Member]=field.value;updateSplitPreview();});
 document.querySelectorAll<HTMLInputElement>('[name=split-mode]').forEach(radio=>radio.addEventListener('change',()=>{
  if(splitMode()==='custom'){
   let amount=0;try{amount=parseAmount(input('expense-amount').value);}catch{/* Start at zero. */}
   const shares=previewShares(amount);for(const m of participants)customDraft[m]=((shares[m]||0)/100).toFixed(2);
  }
  renderParticipants();
 }));
 function pickIcon(event:Event){
  const button=(event.target as HTMLElement).closest<HTMLElement>('[data-icon]');if(!button)return;
  chosenIcon=button.dataset.icon!;manualIcon=true;if(input('icon-fill-name').checked)input('expense-description').value=getIcon(chosenIcon).label;
  updateChosenIcon();$<HTMLDetailsElement>('#icon-picker').open=false;$('#icon-picker summary').focus();
 }
 $('#icon-grid').addEventListener('click',pickIcon);$('#icon-suggestions').addEventListener('click',pickIcon);
 $('#icon-search').addEventListener('input',renderIconGrid);$('#icon-category').addEventListener('change',renderIconGrid);
 $('#expense-form').addEventListener('submit',saveExpense);$('#settlement-form').addEventListener('submit',saveSettlement);$('#misc-delete-form').addEventListener('submit',deleteEntry);
 $('#settlement-form').addEventListener('input',updateSettlement);$('#settlement-form').addEventListener('change',updateSettlement);
 for(const id of ['expense-form','settlement-form'])$('#'+id).addEventListener('click',event=>{
  const button=(event.target as HTMLElement).closest<HTMLElement>('[data-calculate]');if(!button||busy||!live)return;
  const target=button.dataset.calculate!;
  if(target==='expense'||target==='settlement'){
   const field=input(target==='expense'?'expense-amount':'settlement-amount');
   openCalculator({title:target==='expense'?'Purchase calculator':'Repayment calculator',initial:field.value,onUse:cents=>{
    field.value=(cents/100).toFixed(2);target==='expense'?updateSplitPreview():updateSettlement();
   }});
  }else{
   const member=target as Member;let total:number;
   try{total=parseAmount(input('expense-amount').value);}catch{message('expense-error','Enter the purchase amount before calculating a share.');return;}
   message('expense-error','');
   openCalculator({title:`${name(member)}’s share`,initial:customDraft[member]||'',totalCents:total,allowZero:true,canSplitRest:participants.size>1,onUse:(cents,splitRest)=>{
    customDraft[member]=(cents/100).toFixed(2);
    if(splitRest){const others=selectedParticipants().filter(m=>m!==member),shares=equalShares(total-cents,others,ledger!.rounding_cursor);for(const m of others)customDraft[m]=(shares[m]!/100).toFixed(2);}
    renderParticipants();
   }});
  }
 });
 $('#reload-expense').addEventListener('click',()=>{
  const latest=ledger?.expenses.find(e=>e.id===expenseId);if(latest&&!latest.deleted){$<HTMLDialogElement>('#expense-dialog').close();openExpense(latest);}else{$<HTMLDialogElement>('#expense-dialog').close();toast('This expense was deleted.');}
 });
 $('#reload-settlement').addEventListener('click',()=>{
  const latest=ledger?.settlements.find(e=>e.id===settlementId);if(latest&&!latest.deleted){$<HTMLDialogElement>('#settlement-dialog').close();openSettlement(latest);}else{$<HTMLDialogElement>('#settlement-dialog').close();toast('This repayment was deleted.');}
 });
}
