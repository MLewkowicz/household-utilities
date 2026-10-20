import { MEMBERS, type Member } from './ledger';
export type Shares = Partial<Record<Member, number>>;
export type Revision = { id: string; version: number; deleted: boolean; actor: Member; created_at: string };
export type Expense = Revision & { description: string; icon_id: string; payer: Member; amount_cents: number; paid_on: string; split_mode: 'equal'|'custom'; participants: Member[]; shares: Shares };
export type Settlement = Revision & { sender: Member; recipient: Member; amount_cents: number; paid_on: string; method: 'venmo'|'zelle'|'other'; other: string };
export type Pair = { sender: Member; recipient: Member; amount_cents: number };
export type MiscLedger = { expenses: Expense[]; settlements: Settlement[]; expense_history: Expense[]; settlement_history: Settlement[]; pairs: Pair[]; rounding_cursor: number; updated_at: string|null; format_version: number };

export function parseAmount(raw: string, zero = false): number {
  if (!/^\d+(\.\d{1,2})?$/.test(raw.trim())) throw new Error('Enter dollars with up to two decimal places.');
  const [dollars, fraction = ''] = raw.trim().split('.');
  const cents = Number(dollars)*100+Number(fraction.padEnd(2,'0'));
  if (!Number.isSafeInteger(cents) || cents < (zero ? 0 : 1) || cents > 100000000) throw new Error(`Enter an amount between ${zero ? '$0.00' : '$0.01'} and $1,000,000.`);
  return cents;
}
export function equalShares(amount: number, participants: Member[], cursor: number): Shares {
  if (!participants.length) return {};
  const ordered = MEMBERS.filter(m=>participants.includes(m)).sort((a,b)=>(MEMBERS.indexOf(a)-cursor+4)%4-(MEMBERS.indexOf(b)-cursor+4)%4);
  return Object.fromEntries(ordered.map((m,i)=>[m,Math.floor(amount/ordered.length)+(i<amount%ordered.length?1:0)]));
}
// Independent reference calculation used to verify the database's pair balances.
export function pairBalances(expenses: Expense[], settlements: Settlement[]): Pair[] {
  const pairs = new Map<string,number>();
  function add(from: Member,to: Member,cents: number) {
    if (from===to) return;
    const [a,b]=[from,to].sort(); const key=a+'|'+b;
    pairs.set(key,(pairs.get(key)||0)+(from===a?cents:-cents));
  }
  for (const e of expenses.filter(e=>!e.deleted)) for (const m of e.participants) add(m,e.payer,e.shares[m]||0);
  for (const s of settlements.filter(s=>!s.deleted)) add(s.sender,s.recipient,-s.amount_cents);
  return [...pairs].filter(([,c])=>c!==0).sort(([a],[b])=>a.localeCompare(b)).map(([key,c])=>{
    const [a,b]=key.split('|') as Member[];
    return {sender:c>0?a:b,recipient:c>0?b:a,amount_cents:Math.abs(c)};
  });
}
