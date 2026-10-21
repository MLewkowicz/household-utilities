import {avatar} from './people';
import { MEMBERS, UTILITIES, type Member, type Payment, type StoredBill, type Allocation, type Utility, dateDays } from './ledger';
type Config = { url: string; key: string };
type RawLedger = { bills: StoredBill[]; allocations: Allocation[]; history: Payment[]; updated_at: string; bill_history?: {bill_id:string;version:number;deleted:boolean;data:StoredBill;created_at:string}[] };
declare global { interface Window { UTILITIES_CONFIG: Config } }
import { $, esc, money, name, date, today, toast, rpc, download } from './ui';
import {highlightNotification} from './notifications';
export function focusUtilityNotification(id:string){
 if(!ledger?.bills.some(b=>b.id===id&&!b.deleted))return false;
 ledger.allocations.filter(a=>a.bill_id===id).forEach(a=>expanded.add(a.month));renderMonths();
 return highlightNotification(`[data-bill-id="${CSS.escape(id)}"]`);
}
const title = (u: Utility) => u === 'wifi' ? 'Wi-Fi' : name(u);
const id = (): string => crypto.randomUUID();
let ledger: RawLedger, selected: Member | 'all' = 'all', historyTab = 'payments', live = false;
let loading = false, mutationInFlight = false;
const expanded = new Set<string>();
let paymentRequest = id(), paymentId = id(), lastPaymentPayload = '', deleteRequest = id();
let deleting: Payment | null = null;
const config = window.UTILITIES_CONFIG || {url:'',key:''};

function notice(message: string, error = false) { const el=$(error?'#error':'#notice'); el.textContent=message; el.hidden=!message; }
function latestPayments() { const map=new Map<string,Payment>(); for(const p of ledger.history) if(!map.has(p.payment_id)||map.get(p.payment_id)!.version<p.version) map.set(p.payment_id,p); return [...map.values()].sort((a,b)=>b.paid_on.localeCompare(a.paid_on)||b.created_at.localeCompare(a.created_at)); }
function shares(member?: Member) { return ledger.allocations.filter(a=>!member||a.member===member).reduce((s,a)=>s+a.cents,0); }
function paid(member: Member) { return latestPayments().filter(p=>p.member_id===member&&!p.deleted).reduce((s,p)=>s+p.amount_cents,0); }
function balance(member: Member) { return shares(member)-paid(member); }
function sumMonth(month: string, utility?: Utility) {
  const ids=new Set(ledger.bills.filter(b=>!utility||b.utility===utility).map(b=>b.id));
  return ledger.allocations.filter(a=>a.month===month&&ids.has(a.bill_id)&&(selected==='all'||a.member===selected)).reduce((s,a)=>s+a.cents,0);
}
function monthBills(month: string, utility?: Utility) {
  const ids=new Set(ledger.allocations.filter(a=>a.month===month).map(a=>a.bill_id));
  return ledger.bills.filter(b=>ids.has(b.id)&&(!utility||b.utility===utility));
}
function coverage(month: string, utility: Utility) {
  const bills=monthBills(month,utility);
  if(!bills.length) return 'missing';
  if(month==='opening') return 'unknown';
  const days=new Set<string>();
  for(const bill of bills) {
    if(!bill.start_date||!bill.end_date||!bill.charges.some(c=>c.kind==='recurring')) continue;
    for(let t=Date.parse(bill.start_date+'T00:00Z'); t<=Date.parse(bill.end_date+'T00:00Z'); t+=86400000) {
      const d=new Date(t).toISOString().slice(0,10); if(d.startsWith(month)) days.add(d);
    }
  }
  const total=new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate();
  return days.size===total?'full':`${days.size} of ${total} days`;
}
function renderCards() {
  const collect=MEMBERS.filter(m=>m!=='michal').reduce((s,m)=>s+balance(m),0);
  $('#balances').innerHTML=MEMBERS.map(m=>{
    const isCollector=m==='michal', value=isCollector?collect:balance(m);
    return `<article class="balance-card member-${m} ${isCollector?'collector':''} ${selected===m?'selected':''}"><div class="person-heading"><div class="person-name">${avatar(m)}${name(m)}</div>${isCollector?'<span class="person-tag">BILL PAYER</span>':''}</div><div class="balance-amount">${money(Math.abs(value))}</div><div class="balance-label">${isCollector?(value<0?'net credit to roommates':'left to collect'):value<0?'credit toward future bills':value===0?'all settled up':'outstanding to Michal'}</div><div class="balance-caption">${isCollector?`Own share: ${money(shares(m))}`:`${money(shares(m))} in charges · ${money(paid(m))} paid`}</div></article>`;
  }).join('');
  $('#balances').setAttribute('aria-busy','false');
}
function billDetail(bill: StoredBill, month: string) {
  const total=bill.charges.reduce((s,c)=>s+c.amount_cents,0);
  const period=bill.start_date?`${date(bill.start_date)} – ${date(bill.end_date!,true)}`:'Pre-September · service dates unknown';
  let calculation='Opening charge split among Michal, Rina, and Ohm.';
  if(bill.start_date) {
    const days=dateDays(bill.start_date,bill.end_date!);
    const before=bill.start_date<'2026-09-01'?dateDays(bill.start_date,bill.end_date!<'2026-09-01'?bill.end_date!:'2026-08-31'):0;
    const after=days-before;
    calculation=`${days} service days. ${before?`${before} ${before===1?'day':'days'} split three ways. `:''}${after?`${after} ${after===1?'day':'days'} split four ways.`:''}`;
    if(bill.charges.some(c=>c.kind==='one_time')) calculation+=' One-time fees split four ways.';
  }
  const amounts=MEMBERS.map(m=>({m,cents:ledger.allocations.filter(a=>a.bill_id===bill.id&&a.month===month&&a.member===m).reduce((s,a)=>s+a.cents,0)}));
  return `<div class="bill-detail" data-bill-id="${esc(bill.id)}"><div class="bill-detail-header"><span>${title(bill.utility)} <small>${esc(period)}</small></span><span>${money(total)} <small>statement charges</small></span></div><p>${esc(calculation)} ${esc(bill.note)}</p><div class="bill-shares">${amounts.map(({m,cents})=>`<span class="share-chip member-${m}">${name(m)} <strong>${money(cents)}</strong></span>`).join('')}</div></div>`;
}
function renderMonths() {
  const months=[...new Set(ledger.allocations.map(a=>a.month))].sort((a,b)=>a==='opening'?1:b==='opening'?-1:b.localeCompare(a));
  $('#months').innerHTML=months.map(month=>{
    const isOpening=month==='opening', dt=isOpening?null:new Date(month+'-01T12:00Z');
    const label=isOpening?'Opening charges':dt!.toLocaleDateString('en-US',{month:'long',timeZone:'UTC'});
    const sub=isOpening?'Before September · dates unknown':selected==='all'?'Household charges':`${name(selected)}’s share`;
    return `<tr><td><span class="month-label">${label}${dt?` <span class="month-year">${dt.getUTCFullYear()}</span>`:''}</span><span class="month-sub">${sub}</span></td>${UTILITIES.map(u=>{const c=coverage(month,u);return `<td>${c==='missing'?'<span class="missing">Not imported</span>':money(sumMonth(month,u))}${c!=='full'&&c!=='missing'&&c!=='unknown'?`<span class="partial">${c}</span>`:''}</td>`;}).join('')}<td class="cell-total">${money(sumMonth(month))}</td><td><button class="expand-month" data-month="${month}" aria-expanded="${expanded.has(month)}" aria-controls="details-${month}" aria-label="${expanded.has(month)?'Hide':'Show'} ${label} details">${expanded.has(month)?'−':'+'}</button></td></tr><tr class="details-row" id="details-${month}" ${expanded.has(month)?'':'hidden'}><td colspan="6"><div class="details-content"><p class="details-intro">${isOpening?'These earlier balances were supplied on later statements. Their exact service dates are unknown.':'Shares below are the portion of each statement allocated to this month.'}</p>${monthBills(month).map(b=>billDetail(b,month)).join('')}</div></td></tr>`;
  }).join('') || '<tr><td colspan="6">No bills imported yet.</td></tr>';
  $('#monthly-total').innerHTML=`<tr><td>Total charges <span class="month-sub">Before reimbursements</span></td>${UTILITIES.map(u=>`<td>${money(months.reduce((s,m)=>s+sumMonth(m,u),0))}</td>`).join('')}<td>${money(months.reduce((s,m)=>s+sumMonth(m),0))}</td><td></td></tr>`;
}
function renderHistory() {
  const payments=latestPayments().filter(p=>selected==='all'||p.member_id===selected);
  const active=payments.filter(p=>!p.deleted);
  if(historyTab==='payments') {
    $('#history').innerHTML=active.length?`<div class="payment-list">${active.map(p=>paymentRow(p,true)).join('')}</div>`:`<div class="empty-state"><div class="empty-icon" aria-hidden="true">↔</div><h3>No payments recorded${selected!=='all'?` for ${name(selected)}`:' yet'}</h3></div>`;
  } else {
    const bills=(ledger.bill_history||[]).filter(b=>b.version>1);
    $('#history').innerHTML=payments.length||bills.length?`<div class="payment-list">${payments.map(p=>`<details class="history-group member-${p.member_id}"><summary><span class="history-summary">${avatar(p.member_id)}<span>${name(p.member_id)} · ${money(p.amount_cents)} · ${p.version} ${p.version===1?'event':'events'}</span>${p.deleted?'<span class="deleted-label">DELETED</span>':''}</span></summary>${ledger.history.filter(e=>e.payment_id===p.payment_id).sort((a,b)=>b.version-a.version).map(e=>paymentRow(e,false)).join('')}</details>`).join('')}${bills.map(b=>`<div class="payment-row member-michal">${avatar('michal')}<div class="payment-main"><div class="payment-title">${title(b.data.utility)} bill ${b.deleted?'reconciled':'revised'}</div><div class="payment-meta">${b.data.start_date?date(b.data.start_date,true):'Opening charge'} · revision ${b.version} · Michal · ${date(b.created_at,true)}</div></div></div>`).join('')}</div>`:'<div class="empty-state"><div class="empty-icon" aria-hidden="true">≡</div><h3>No changes yet</h3></div>';
  }
}
function paymentRow(p: Payment, actions: boolean) {
  const method=p.method==='other'?p.other:name(p.method);
  const action=p.deleted?'Deleted':p.version===1?'Recorded':'Edited';
  return `<div class="payment-row member-${p.member_id}">${avatar(p.member_id)}<div class="payment-main"><div class="payment-title">${name(p.member_id)} <span class="quiet">to Michal</span>${p.deleted?'<span class="deleted-label">DELETED</span>':''}</div><div class="payment-meta">${esc(method)} · ${date(p.paid_on,true)}${actions?'':`<br>${action} by <span class="actor-chip member-${p.actor}">${name(p.actor)}</span> · ${new Date(p.created_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})} · v${p.version}`}</div></div><span class="payment-amount">${money(p.amount_cents)}</span>${actions&&live?`<div class="payment-actions"><button class="text-button" data-edit="${esc(p.payment_id)}" aria-label="Edit ${name(p.member_id)} payment of ${money(p.amount_cents)}">Edit</button><button class="text-button" data-delete="${esc(p.payment_id)}" aria-label="Delete ${name(p.member_id)} payment of ${money(p.amount_cents)}">Delete</button></div>`:''}</div>`;
}
function render() { renderCards();renderMonths();renderHistory();$('#new-payment').toggleAttribute('disabled',!live);$('#bottom-payment').toggleAttribute('disabled',!live);if(!location.hash||location.hash==='#utilities')$('#export').removeAttribute('disabled'); }
async function refresh() {
  if(loading||mutationInFlight) return; loading=true;$('#refresh').setAttribute('disabled','');
  try {
    if(!config.url||!config.key) throw new Error('The shared database has not been connected.');
    ledger=await rpc<RawLedger>('dashboard');live=true;notice('');notice('',true);$('#connection-status').textContent='Shared ledger · up to date';
  } catch {
    live=false;
    if(!ledger) {
      try {const response=await fetch('./ledger.json',{cache:'no-store'});if(!response.ok)throw new Error();ledger=await response.json();}
      catch {notice('The ledger is unavailable. Please try refreshing in a moment.',true);$('#balances').setAttribute('aria-busy','false');return;}
    }
    $('#connection-status').textContent='Viewing saved snapshot';
    notice('The live ledger is unavailable. Showing saved balances from '+date(ledger.updated_at,true)+'. Payment entry is disabled until the connection returns.');
  } finally { loading=false;$('#refresh').removeAttribute('disabled'); }
  $('#as-of').textContent='USD · '+date(ledger.updated_at,true);render();
}
function field<T extends HTMLInputElement|HTMLSelectElement = HTMLInputElement>(key: string) { return $<T>(`#payment-form [name="${key}"]`); }
function setOther() {const other=$<HTMLInputElement>('#payment-form [name=method]:checked').value==='other';$('#other-label').hidden=!other;field('other').required=other;}
function openPayment(payment?: Payment) {
  if(!live)return;
  $<HTMLFormElement>('#payment-form').reset();field('member_id').disabled=!!payment;
  field('member_id').value=payment?.member_id||(selected!=='all'&&selected!=='michal'?selected:'rina');
  field('paid_on').value=payment?.paid_on||today();field('paid_on').max=today();
  field('amount').value=payment?(payment.amount_cents/100).toFixed(2):'';
  $<HTMLInputElement>(`#payment-form [name="method"][value="${payment?.method||'venmo'}"]`).checked=true;
  field('other').value=payment?.other||'';field('version').value=String(payment?.version||0);field('payment_id').value=payment?.payment_id||'';
  field('actor').value=payment?.member_id||field('member_id').value;$('#actor-label').hidden=!payment;
  $('#payment-title').textContent=payment?'Edit payment':'Record a payment';$('#save-payment').textContent=payment?'Save changes':'Confirm payment';
  $('#payment-error').hidden=true;paymentRequest=id();paymentId=payment?.payment_id||id();lastPaymentPayload='';setOther();
  $<HTMLDialogElement>('#payment-dialog').showModal();setTimeout(()=>field('amount').focus(),0);
}
function formError(selector: string, error: unknown) {$(selector).textContent=error instanceof Error?error.message:'Could not save. Please try again.';$(selector).hidden=false;}
$('#new-payment').addEventListener('click',()=>openPayment());$('#bottom-payment').addEventListener('click',()=>openPayment());
for(const btn of ['#close-dialog','#cancel-dialog']) $(btn).addEventListener('click',()=>{if(!mutationInFlight)$<HTMLDialogElement>('#payment-dialog').close();});
$('#payment-form').addEventListener('change',setOther);
$('#payment-form').addEventListener('submit',async event=>{
  event.preventDefault();if(mutationInFlight)return;
  try {
    const raw=field('amount').value.trim();if(!/^\d+(\.\d{1,2})?$/.test(raw))throw new Error('Enter dollars with up to two decimal places.');
    const [dollars,fraction='']=raw.split('.'), amount=Number(dollars)*100+Number(fraction.padEnd(2,'0'));
    if(amount<=0||amount>100000000)throw new Error('Enter an amount between $0.01 and $1,000,000.');
    const version=Number(field('version').value);
    const p={action:version?'edit':'create',payment_id:paymentId,expected_version:version,member_id:field('member_id').value,amount_cents:amount,method:$<HTMLInputElement>('#payment-form [name=method]:checked').value,other:field('other').value.trim(),paid_on:field('paid_on').value,actor:version?field('actor').value:field('member_id').value};
    const serialized=JSON.stringify(p);if(lastPaymentPayload&&lastPaymentPayload!==serialized)paymentRequest=id();lastPaymentPayload=serialized;
    mutationInFlight=true;$('#save-payment').setAttribute('disabled','');$('#payment-error').hidden=true;
    await rpc('save_payment',{p:{...p,request_id:paymentRequest}});
    $<HTMLDialogElement>('#payment-dialog').close();toast(version?'Payment updated.':'Payment recorded.');
    mutationInFlight=false;await refresh();
  } catch(e) {formError('#payment-error',e);} finally {mutationInFlight=false;$('#save-payment').removeAttribute('disabled');}
});
$('#history').addEventListener('click',event=>{
  const target=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!target||!live)return;
  const p=latestPayments().find(p=>p.payment_id===(target.dataset.edit||target.dataset.delete));if(!p)return;
  if(target.dataset.edit)openPayment(p);else {deleting=p;deleteRequest=id();$('#delete-description').textContent=`${name(p.member_id)}’s ${money(p.amount_cents)} payment on ${date(p.paid_on,true)}.`;$<HTMLSelectElement>('#delete-form [name=actor]').value=p.member_id;$('#delete-error').hidden=true;$<HTMLDialogElement>('#delete-dialog').showModal();}
});
$('#cancel-delete').addEventListener('click',()=>{if(!mutationInFlight)$<HTMLDialogElement>('#delete-dialog').close();});
$('#delete-form').addEventListener('submit',async event=>{
  event.preventDefault();if(!deleting||mutationInFlight)return;mutationInFlight=true;$('#confirm-delete').setAttribute('disabled','');
  try {await rpc('save_payment',{p:{action:'delete',payment_id:deleting.payment_id,expected_version:deleting.version,actor:$<HTMLSelectElement>('#delete-form [name=actor]').value,request_id:deleteRequest}});$<HTMLDialogElement>('#delete-dialog').close();toast('Payment deleted. Balance adjusted.');mutationInFlight=false;await refresh();}
  catch(e){formError('#delete-error',e);}finally{mutationInFlight=false;$('#confirm-delete').removeAttribute('disabled');}
});
for(const dialog of ['#payment-dialog','#delete-dialog']) $(dialog).addEventListener('cancel',event=>{if(mutationInFlight)event.preventDefault();});
$('#person-filter').addEventListener('click',event=>{const b=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!b||!ledger)return;selected=b.dataset.person as Member|'all';document.querySelectorAll('#person-filter button').forEach(el=>el.setAttribute('aria-pressed',String(el===b)));render();});
$('#history-tabs').addEventListener('click',event=>{const b=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!b||!ledger)return;historyTab=b.dataset.history!;document.querySelectorAll('#history-tabs button').forEach(el=>el.setAttribute('aria-pressed',String(el===b)));renderHistory();});
$('#months').addEventListener('click',event=>{const b=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-month]');if(!b)return;const month=b.dataset.month!;expanded.has(month)?expanded.delete(month):expanded.add(month);renderMonths();$<HTMLButtonElement>(`[data-month="${month}"]`).focus();});
export { refresh as refreshUtilities };
export function exportUtilities() { if(ledger) download({...ledger,exported_at:new Date().toISOString()},'utilities-ledger'); }
