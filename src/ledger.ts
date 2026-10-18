export const MEMBERS = ['michal', 'rina', 'ohm', 'rohil'] as const;
export type Member = typeof MEMBERS[number];
export const UTILITIES = ['gas', 'electricity', 'wifi'] as const;
export type Utility = typeof UTILITIES[number];
export const START = '2026-09-01';
export type Charge = { kind: 'recurring' | 'one_time' | 'opening'; amount_cents: number; label: string };
export type Bill = {
  id: string; utility: Utility; start_date: string | null; end_date: string | null;
  charges: Charge[]; source_hash: string; note: string; opening_before: string | null;
};
export type StoredBill = Bill & { version: number; deleted: boolean; created_at: string; actor: string };
export type Allocation = { member: Member; month: string; cents: number; bill_id: string; charge_index: number };
export type Payment = {
  payment_id: string; version: number; member_id: Member; amount_cents: number;
  method: 'venmo' | 'zelle' | 'other'; other: string; paid_on: string;
  deleted: number | boolean; actor: Member; created_at: string;
};

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function requireValue(value: unknown, message: string): asserts value {
  if (!value) throw new HttpError(400, message);
}
export function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
export function dateDays(start: string, end: string): number {
  return Math.round((Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86400000) + 1;
}
export function cleanText(value: unknown, max: number, fallback = ''): string {
  if (value === undefined || value === null) return fallback;
  requireValue(typeof value === 'string' && value.length <= max, `Text must be at most ${max} characters.`);
  return value.trim();
}
export function normalizeBill(raw: Record<string, unknown>): Bill {
  requireValue(typeof raw.id === 'string' && /^[a-zA-Z0-9:_-]{1,120}$/.test(raw.id), 'Invalid bill ID.');
  requireValue(UTILITIES.includes(raw.utility as Utility), 'Unknown utility.');
  requireValue(typeof raw.source_hash === 'string' && /^[a-f0-9]{64}$/.test(raw.source_hash), 'A SHA-256 source hash is required.');
  requireValue(Array.isArray(raw.charges) && raw.charges.length > 0 && raw.charges.length <= 20, 'Provide 1–20 charge lines.');
  const charges: Charge[] = raw.charges.map((item: unknown) => {
    requireValue(item && typeof item === 'object', 'Invalid charge.');
    const c = item as Record<string, unknown>;
    requireValue(['recurring', 'one_time', 'opening'].includes(String(c.kind)), 'Unknown charge category.');
    requireValue(Number.isSafeInteger(c.amount_cents) && Math.abs(Number(c.amount_cents)) <= 100_000_000, 'Invalid charge amount in cents.');
    const label = cleanText(c.label, 120);
    requireValue(label, 'Each charge needs a label.');
    return { kind: c.kind as Charge['kind'], amount_cents: Number(c.amount_cents), label };
  });
  const opening = charges.some(c => c.kind === 'opening');
  if (opening) {
    requireValue(charges.every(c => c.kind === 'opening'), 'Opening charges must be a separate record.');
    requireValue(raw.start_date == null && raw.end_date == null, 'Opening charges have unknown service dates.');
    requireValue(validDate(raw.opening_before) && raw.opening_before <= START, 'Opening charges need a pre-September cutoff.');
  } else {
    requireValue(validDate(raw.start_date) && validDate(raw.end_date), 'Valid service dates are required.');
    requireValue(raw.start_date <= raw.end_date && dateDays(raw.start_date, raw.end_date) <= 370, 'Service period must be between 1 and 370 days.');
    requireValue(raw.opening_before == null, 'Only opening charges can have a cutoff.');
  }
  return {
    id: raw.id, utility: raw.utility as Utility,
    start_date: opening ? null : raw.start_date as string,
    end_date: opening ? null : raw.end_date as string,
    charges, source_hash: raw.source_hash, note: cleanText(raw.note, 240),
    opening_before: opening ? raw.opening_before as string : null,
  };
}

// One denominator per charge: day shares use twelfths (LCM of 3 and 4).
// Integer arithmetic avoids intermediate daily rounding and floating-point drift.
function allocateWithRotation(bill: Bill, cursors: number[]): Allocation[] {
  const result: Allocation[] = [];
  bill.charges.forEach((charge, charge_index) => {
    const weights = new Map<string, number>();
    let denominator: number;
    if (charge.kind === 'opening') {
      denominator = 3;
      for (const member of MEMBERS.slice(0, 3)) weights.set(`opening|${member}`, 1);
    } else if (charge.kind === 'one_time') {
      denominator = 4;
      for (const member of MEMBERS) weights.set(`${bill.start_date!.slice(0, 7)}|${member}`, 1);
    } else {
      denominator = dateDays(bill.start_date!, bill.end_date!) * 12;
      for (let t = Date.parse(bill.start_date! + 'T00:00:00Z'); t <= Date.parse(bill.end_date! + 'T00:00:00Z'); t += 86400000) {
        const day = new Date(t).toISOString().slice(0, 10);
        const members = day < START ? MEMBERS.slice(0, 3) : MEMBERS;
        for (const member of members) {
          const key = `${day.slice(0, 7)}|${member}`;
          weights.set(key, (weights.get(key) || 0) + 12 / members.length);
        }
      }
    }
    const amount = Math.abs(charge.amount_cents), sign = Math.sign(charge.amount_cents);
    const cells = [...weights].map(([key, weight]) => {
      const [month, member] = key.split('|');
      const numerator = amount * weight;
      return { month, member: member as Member, cents: Math.floor(numerator / denominator), remainder: numerator % denominator };
    });
    let remaining = amount - cells.reduce((sum, c) => sum + c.cents, 0);
    cells.sort((a, b) => b.remainder - a.remainder || compareText(a.month, b.month));
    // Rotate only genuinely tied pennies. Fully awarded groups need no turn.
    // Credits have their own rotation so alternating charges/refunds stay fair.
    const direction = sign < 0 ? 1 : 0;
    for (let i = 0; i < cells.length;) {
      let end = i + 1;
      while (end < cells.length && cells[end].remainder === cells[i].remainder && cells[end].month === cells[i].month) end++;
      const group = cells.slice(i, end);
      const take = Math.min(remaining, group.length);
      const contested = take > 0 && take < group.length;
      group.sort((a, b) => (MEMBERS.indexOf(a.member) - cursors[direction] + 4) % 4 - (MEMBERS.indexOf(b.member) - cursors[direction] + 4) % 4);
      group.forEach((cell, rank) => {
        if (rank < take) cell.cents++;
        result.push({ member: cell.member, month: cell.month, cents: cell.cents === 0 ? 0 : cell.cents * sign, bill_id: bill.id, charge_index });
      });
      if (contested) cursors[direction] = (MEMBERS.indexOf(group[take - 1].member) + 1) % 4;
      remaining -= take;
      i = end;
    }
  });
  return result;
}

const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

export function allocateBill(bill: Bill): Allocation[] {
  return allocateWithRotation(bill, [0, 0]);
}

// Replay a canonical bill order: imports, refreshes, and payments never consume
// turns. Backdated bills/corrections can redistribute pennies on later bills.
export function allocateBills(bills: Bill[]): Allocation[] {
  const cursors = [0, 0];
  return [...bills].sort((a, b) =>
    compareText(a.start_date ?? a.opening_before!, b.start_date ?? b.opening_before!) ||
    compareText(a.end_date ?? a.opening_before!, b.end_date ?? b.opening_before!) ||
    compareText(a.utility, b.utility) || compareText(a.id, b.id)
  ).flatMap(bill => allocateWithRotation(bill, cursors));
}

export function summarize(bills: StoredBill[], events: Payment[]) {
  const activeBills = bills.filter(b => !b.deleted);
  const allocations = allocateBills(activeBills);
  const latest = new Map<string, Payment>();
  for (const event of events) if (!latest.has(event.payment_id) || latest.get(event.payment_id)!.version < event.version) latest.set(event.payment_id, event);
  const payments = [...latest.values()];
  const members = MEMBERS.map(id => {
    const share = allocations.filter(a => a.member === id).reduce((n, a) => n + a.cents, 0);
    const paid = payments.filter(p => p.member_id === id && !p.deleted).reduce((n, p) => n + p.amount_cents, 0);
    return { id, name: id[0].toUpperCase() + id.slice(1), share_cents: share, paid_cents: paid, balance_cents: id === 'michal' ? 0 : share - paid };
  });
  return { bills: activeBills, allocations, members, payments, history: events,
    total_cents: members.reduce((s, m) => s + m.share_cents, 0),
    receivable_cents: members.filter(m => m.id !== 'michal').reduce((s, m) => s + m.balance_cents, 0),
  };
}
