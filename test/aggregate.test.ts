import { describe, expect, it } from 'vitest';
import { summarizeMonths } from '../src/core/aggregate';
import { normalizeRecord } from '../src/core/normalize';
import type { Txn } from '../src/core/types';
import { modern } from './fixtures';

describe('aggregation', () => {
  const mk = (o: any) => normalizeRecord(modern({ updated_at: undefined, ...o })) as Txn;
  it('excludes own transfers from spend and income, counts refunds as income', () => {
    const rows = [
      mk({ id: '1', amount_minor: 1000 }),
      mk({ id: '2', amount_minor: 5000, direction: 'credit', category: 'SALARY' }),
      mk({ id: '3', amount_minor: 700, direction: 'credit', category: 'REFUND' }),
      mk({ id: '4', amount_minor: 99999, counterparty: { type: 'OWN_ACCOUNT' } }),
      mk({ id: '5', amount_minor: 99999, direction: 'credit', counterparty: { type: 'OWN_ACCOUNT' } }),
      mk({ id: '6', amount_minor: 1999, currency: 'USD', fx: { inr_minor: 166117 } }),
    ];
    const [m] = summarizeMonths(rows);
    expect(m.spendMinor).toBe(1000 + 166117);
    expect(m.incomeMinor).toBe(5700);
    expect(m.refundsMinor).toBe(700);
    expect(m.transferCount).toBe(2);
    expect(m.count).toBe(6);
  });
});
