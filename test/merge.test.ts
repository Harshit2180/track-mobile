import { describe, expect, it } from 'vitest';
import { applyEntries } from '../src/core/merge';
import { normalizeRecord } from '../src/core/normalize';
import { isTomb, type Entry, type Txn } from '../src/core/types';
import { legacy, modern } from './fixtures';

describe('merge: latest truth wins', () => {
  const t = (id: string, upd: number, amt = 100): Entry => ({ ...(normalizeRecord(modern({ id, amount_minor: amt, updated_at: new Date(upd).toISOString() })) as Txn) });
  it('keeps the newer version even when an older one arrives later in the feed', () => {
    const store = new Map<string, Entry>();
    applyEntries(store, [t('a', 2000, 8900), t('a', 1000, 3900)]);
    expect((store.get('a') as Txn).amountMinor).toBe(8900);
  });
  it('does not let a stale update resurrect a deleted row', () => {
    const store = new Map<string, Entry>();
    applyEntries(store, [{ id: 'a', deleted: true, updatedAt: 5000 }, t('a', 1000)]);
    expect(isTomb(store.get('a')!)).toBe(true);
  });
  it('a newer update after a delete brings it back (re-created row)', () => {
    const store = new Map<string, Entry>();
    applyEntries(store, [{ id: 'a', deleted: true, updatedAt: 5000 }, t('a', 9000)]);
    expect(isTomb(store.get('a')!)).toBe(false);
  });
  it('any modern row beats a legacy row with the same id (legacy has no timestamp)', () => {
    const store = new Map<string, Entry>();
    applyEntries(store, [normalizeRecord(legacy()), normalizeRecord(modern({ id: '104535', category: 'DINING_OUT' }))]);
    expect((store.get('104535') as Txn).category).toBe('DINING_OUT');
  });
  it('is idempotent (boundary duplicates between pages)', () => {
    const store = new Map<string, Entry>();
    applyEntries(store, [t('a', 1000), t('b', 1000)]);
    applyEntries(store, [t('b', 1000), t('c', 1000)]);
    expect(store.size).toBe(3);
  });
});
