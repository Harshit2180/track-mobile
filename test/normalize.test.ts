import { describe, expect, it } from 'vitest';
import { normalizeRecord } from '../src/core/normalize';
import { isTomb, type Txn } from '../src/core/types';
import { legacy, modern } from './fixtures';

describe('normalize', () => {
  it('maps both schemas to the same shape', () => {
    const a = normalizeRecord(legacy()) as Txn;
    expect(a).toMatchObject({ accountId: 'acc_4821', amountMinor: 51649, direction: 'debit', currency: 'INR', source: 'legacy', updatedAt: 0, ts: 1764000000_000 });
    const b = normalizeRecord(modern()) as Txn;
    expect(b).toMatchObject({ accountId: 'acc_4821', amountMinor: 33843, direction: 'debit', source: 'modern' });
  });
  it('uses fx.inr_minor for totals but keeps the original currency', () => {
    const t = normalizeRecord(modern({ currency: 'USD', amount_minor: 1999, fx: { rate: 83.1, inr_minor: 166117 } })) as Txn;
    expect(t.currency).toBe('USD'); expect(t.amountMinor).toBe(1999); expect(t.inrMinor).toBe(166117);
    const nofx = normalizeRecord(modern({ currency: 'USD', amount_minor: 1999 })) as Txn;
    expect(nofx.inrMinor).toBeNull();
  });
  it('detects own-account transfers on both schemas', () => {
    expect((normalizeRecord(modern({ counterparty: { type: 'OWN_ACCOUNT', account_id: 'acc_9' } })) as Txn).isOwnTransfer).toBe(true);
    expect((normalizeRecord(legacy({ linked_account: '9911' })) as Txn).isOwnTransfer).toBe(true);
    // paying a person is real spending even though the category says TRANSFERS_OUT
    expect((normalizeRecord(modern({ category: 'TRANSFERS_OUT', merchant: 'UPI/RAHUL SHARMA' })) as Txn).isOwnTransfer).toBe(false);
  });
  it('turns a negative amount into the opposite direction instead of dropping it', () => {
    const t = normalizeRecord(modern({ amount_minor: -500 })) as Txn;
    expect(t.amountMinor).toBe(500); expect(t.direction).toBe('credit');
  });
  it('reads tombstones and rejects junk', () => {
    const d = normalizeRecord({ id: 'x', deleted: true, updated_at: '2026-10-10T21:02:42Z' });
    expect(isTomb(d)).toBe(true);
    expect(() => normalizeRecord({ id: 'x', amount_minor: 1.5 })).toThrow();
    expect(() => normalizeRecord({ id: 'x', foo: 1 })).toThrow();
  });
});
