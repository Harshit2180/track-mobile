import { describe, expect, it } from 'vitest';
import { formatDateTimeIST, monthKeyIST } from '../src/core/time';

describe('time', () => {
  it('buckets months in IST, not UTC', () => {
    const ts = Date.parse('2026-09-30T20:00:00Z'); // 01:30 on 1 Oct in India
    expect(monthKeyIST(ts)).toBe('2026-10');
    expect(monthKeyIST(Date.parse('2026-09-30T18:29:59Z'))).toBe('2026-09');
    expect(monthKeyIST(Date.parse('2026-09-30T18:30:00Z'))).toBe('2026-10');
    expect(formatDateTimeIST(Date.parse('2026-10-09T13:42:00Z'))).toBe('9 Oct 2026, 7:12 pm');
  });
});
