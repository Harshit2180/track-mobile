import { epochToMs, parseIsoTimestamp } from './time';
import { parseDecimalToMinor } from './money';
import { displayMerchant, normalizeText } from './search';
import { categoryLabel } from './labels';
import type { Direction, Entry, Status, Txn } from './types';

// Fallback for own-account moves that arrive without an explicit link (belt and braces; the explicit
// signals counterparty.type=OWN_ACCOUNT / linked_account are what the fixtures use).
const OWN_MERCHANT = /^(self transfer|own account transfer)|credit card bill payment|payment received\s*-\s*thank you/i;

export class NormalizeError extends Error {
  constructor(message: string, public raw: unknown) {
    super(message);
  }
}

function str(v: unknown, field: string, raw: unknown): string {
  if (typeof v !== 'string' || v === '') throw new NormalizeError(`missing ${field}`, raw);
  return v;
}

function status(v: unknown): Status {
  return String(v).toUpperCase() === 'PENDING' ? 'PENDING' : 'POSTED';
}

function accountId(v: string): string {
  return v.startsWith('acc_') ? v : `acc_${v}`;
}

function build(p: {
  id: string; accountId: string; ts: number; direction: Direction; amountMinor: number; currency: string;
  inrMinor: number | null; merchant: string; category: string | null; status: Status; own: boolean;
  counterparty?: string; updatedAt: number; source: 'modern' | 'legacy';
}): Txn {
  const display = displayMerchant(p.merchant);
  return {
    id: p.id, accountId: p.accountId, ts: p.ts, direction: p.direction, amountMinor: p.amountMinor,
    currency: p.currency, inrMinor: p.inrMinor, merchant: p.merchant, merchantDisplay: display,
    searchText: normalizeText(`${p.merchant} ${display} ${categoryLabel(p.category)}`),
    category: p.category, status: p.status, isOwnTransfer: p.own, counterpartyAccountId: p.counterparty,
    updatedAt: p.updatedAt, source: p.source,
  };
}

/** Turn one raw API record (either schema, or a tombstone) into an Entry. Throws NormalizeError if unusable. */
export function normalizeRecord(raw: any, now: () => number = Date.now): Entry {
  if (!raw || typeof raw !== 'object') throw new NormalizeError('not an object', raw);
  const id = String(raw.id ?? '');
  if (!id) throw new NormalizeError('missing id', raw);

  if (raw.deleted === true) {
    return { id, deleted: true, updatedAt: raw.updated_at ? parseIsoTimestamp(raw.updated_at) : now() };
  }

  // ---- legacy schema: account, txn_time (epoch s), amount (decimal STRING, rupees), type DR/CR
  if ('amount' in raw && 'txn_time' in raw) {
    let minor = parseDecimalToMinor(String(raw.amount));
    let direction: Direction = String(raw.type).toUpperCase() === 'CR' ? 'credit' : 'debit';
    if (minor < 0) { minor = -minor; direction = direction === 'debit' ? 'credit' : 'debit'; }
    const linked = raw.linked_account ? accountId(String(raw.linked_account)) : undefined;
    const merchant = str(raw.merchant_name, 'merchant_name', raw);
    const own = !!linked || (raw.category === 'TRANSFER' && OWN_MERCHANT.test(merchant));
    return build({
      id, accountId: accountId(str(String(raw.account ?? ''), 'account', raw)), ts: epochToMs(Number(raw.txn_time)),
      direction, amountMinor: minor, currency: 'INR', inrMinor: minor, merchant, category: raw.category ?? null,
      status: status(raw.status), own, counterparty: linked, updatedAt: raw.updated_at ? parseIsoTimestamp(raw.updated_at) : 0,
      source: 'legacy',
    });
  }

  // ---- modern schema
  if ('amount_minor' in raw) {
    let minor = raw.amount_minor;
    if (typeof minor !== 'number' || !Number.isSafeInteger(minor)) throw new NormalizeError('amount_minor not an integer', raw);
    let direction: Direction = raw.direction === 'credit' ? 'credit' : 'debit';
    if (minor < 0) { minor = -minor; direction = direction === 'debit' ? 'credit' : 'debit'; }
    const currency = String(raw.currency ?? 'INR').toUpperCase();
    let inr: number | null = null;
    if (currency === 'INR') inr = minor;
    else if (raw.fx && Number.isSafeInteger(raw.fx.inr_minor)) inr = Math.abs(raw.fx.inr_minor);
    const merchant = str(raw.merchant, 'merchant', raw);
    const cp = raw.counterparty;
    const own = cp?.type === 'OWN_ACCOUNT' || (raw.category === 'TRANSFER' && OWN_MERCHANT.test(merchant));
    return build({
      id, accountId: accountId(str(raw.account_id, 'account_id', raw)), ts: parseIsoTimestamp(str(raw.occurred_at, 'occurred_at', raw)),
      direction, amountMinor: minor, currency, inrMinor: inr, merchant, category: raw.category ?? null,
      status: status(raw.status), own, counterparty: cp?.account_id, updatedAt: raw.updated_at ? parseIsoTimestamp(raw.updated_at) : 0,
      source: 'modern',
    });
  }

  throw new NormalizeError('unrecognised record shape', raw);
}

export interface NormalizedBatch {
  entries: Entry[];
  ids: string[];            // every id seen in the batch, including quarantined ones
  quarantined: { id: string; reason: string }[];
}

/** Normalise a page; one bad record never takes the page down. */
export function normalizeBatch(items: unknown[], now?: () => number): NormalizedBatch {
  const entries: Entry[] = [];
  const ids: string[] = [];
  const quarantined: { id: string; reason: string }[] = [];
  for (const raw of items) {
    const id = String((raw as any)?.id ?? '');
    if (id) ids.push(id);
    try {
      entries.push(normalizeRecord(raw, now));
    } catch (e) {
      quarantined.push({ id, reason: (e as Error).message });
    }
  }
  return { entries, ids, quarantined };
}
