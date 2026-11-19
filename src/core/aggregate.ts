import { monthKeyIST } from './time';
import { isTomb, type Entry, type Txn } from './types';

export interface MonthSummary {
  month: string;            // "2026-10" (IST)
  spendMinor: number;       // INR paise; excludes own-account transfers
  incomeMinor: number;      // INR paise; includes refunds (backend/checkpoint convention); excludes own transfers
  refundsMinor: number;     // subset of income that is category REFUND
  count: number;            // every transaction in the month, transfers included
  transferCount: number;
  pendingCount: number;
  unconvertedCount: number; // foreign-currency rows with no INR value (excluded from totals)
}

export function visibleTransactions(store: Iterable<Entry>): Txn[] {
  const out: Txn[] = [];
  for (const e of store) if (!isTomb(e)) out.push(e);
  // newest first, deterministic tie-break
  out.sort((a, b) => b.ts - a.ts || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  return out;
}

export function summarizeMonths(txns: Txn[]): MonthSummary[] {
  const m = new Map<string, MonthSummary>();
  for (const t of txns) {
    const k = monthKeyIST(t.ts);
    let s = m.get(k);
    if (!s) m.set(k, (s = { month: k, spendMinor: 0, incomeMinor: 0, refundsMinor: 0, count: 0, transferCount: 0, pendingCount: 0, unconvertedCount: 0 }));
    s.count++;
    if (t.status === 'PENDING') s.pendingCount++;
    if (t.isOwnTransfer) { s.transferCount++; continue; }
    if (t.inrMinor === null) { s.unconvertedCount++; continue; }
    if (t.direction === 'debit') s.spendMinor += t.inrMinor;
    else {
      s.incomeMinor += t.inrMinor;
      if (t.category === 'REFUND') s.refundsMinor += t.inrMinor;
    }
  }
  return [...m.values()].sort((a, b) => (a.month < b.month ? 1 : -1));
}

export interface MonthSection { month: string; summary: MonthSummary; data: Txn[] }

export function sectionsByMonth(txns: Txn[]): MonthSection[] {
  const sums = new Map(summarizeMonths(txns).map((s) => [s.month, s]));
  const byMonth = new Map<string, Txn[]>();
  for (const t of txns) {
    const k = monthKeyIST(t.ts);
    (byMonth.get(k) ?? byMonth.set(k, []).get(k)!).push(t);
  }
  return [...sums.keys()].map((k) => ({ month: k, summary: sums.get(k)!, data: byMonth.get(k)! }));
}
