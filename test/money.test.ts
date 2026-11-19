import { describe, expect, it } from 'vitest';
import { formatForeign, formatINR, groupIndian, parseDecimalToMinor } from '../src/core/money';

describe('money', () => {
  it('parses decimal strings exactly (no float drift)', () => {
    expect(parseDecimalToMinor('516.49')).toBe(51649);
    expect(parseDecimalToMinor('0.10')).toBe(10);
    expect(parseDecimalToMinor('19.9')).toBe(1990);
    expect(parseDecimalToMinor('1,234.5')).toBe(123450);
    expect(parseDecimalToMinor('763')).toBe(76300);
    // classic float traps
    expect(parseDecimalToMinor('1.15')).toBe(115);
    expect(parseDecimalToMinor('8.20')).toBe(820);
  });
  it('rejects ambiguous amounts', () => {
    expect(() => parseDecimalToMinor('12.345')).toThrow();
    expect(() => parseDecimalToMinor('abc')).toThrow();
  });
  it('formats with Indian grouping', () => {
    expect(groupIndian('247816')).toBe('2,47,816');
    expect(groupIndian('12345678')).toBe('1,23,45,678');
    expect(formatINR(24781600)).toBe('₹2,47,816.00');
    expect(formatINR(-51649)).toBe('-₹516.49');
    expect(formatINR(500, { decimals: 'auto' })).toBe('₹5');
    expect(formatINR(0)).toBe('₹0.00');
    expect(formatForeign(1999, 'USD')).toBe('$19.99');
  });
});
