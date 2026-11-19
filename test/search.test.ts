import { describe, expect, it } from 'vitest';
import { normalizeRecord } from '../src/core/normalize';
import { displayMerchant, matchesQuery, normalizeText } from '../src/core/search';
import type { Txn } from '../src/core/types';
import { modern } from './fixtures';

describe('search', () => {
  it('ignores emoji, case, rails prefixes and matches Hindi', () => {
    const t = normalizeRecord(modern({ merchant: '☕ Third Wave Coffee' })) as Txn;
    expect(matchesQuery(t.searchText, 'third wave')).toBe(true);
    expect(matchesQuery(t.searchText, 'COFFEE')).toBe(true);
    const u = normalizeRecord(modern({ merchant: 'UPI/CHAI POINT' })) as Txn;
    expect(matchesQuery(u.searchText, 'chai')).toBe(true);
    const h = normalizeRecord(modern({ merchant: 'किराना स्टोर' })) as Txn;
    expect(matchesQuery(h.searchText, 'किराना')).toBe(true);
    expect(matchesQuery(h.searchText, 'swiggy')).toBe(false);
    expect(normalizeText('☕ Café  X')).toBe('café x');
  });
  it('cleans merchant names for display only', () => {
    expect(displayMerchant('UPI/CHAI POINT')).toBe('Chai Point');
    expect(displayMerchant('SWIGGY*BANGALORE')).toBe('Swiggy');
    expect(displayMerchant('Swiggy Instamart')).toBe('Swiggy Instamart');
  });
});
