// Money is ALWAYS integer minor units (paise). No floats anywhere.

/** Parse a decimal string like "516.49", "763", "1,234.5" into integer paise. Throws on anything ambiguous. */
export function parseDecimalToMinor(s: string): number {
  const m = /^\s*(-)?(\d[\d,]*)(?:\.(\d{1,2}))?\s*$/.exec(s);
  if (!m) throw new Error(`Unparseable amount: ${JSON.stringify(s)}`);
  const whole = Number(m[2].replace(/,/g, ''));
  const frac = Number((m[3] ?? '').padEnd(2, '0'));
  const v = whole * 100 + frac;
  if (!Number.isSafeInteger(v)) throw new Error(`Amount out of range: ${s}`);
  return m[1] ? -v : v;
}

/** Indian digit grouping: 1234567 -> "12,34,567" */
export function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  let rest = digits.slice(0, -3);
  const parts: string[] = [];
  while (rest.length > 2) {
    parts.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) parts.unshift(rest);
  return parts.join(',') + ',' + last3;
}

function groupWestern(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export interface FormatOpts {
  /** 'always' -> ₹1,00,000.00 ; 'auto' -> drop .00 */
  decimals?: 'always' | 'auto';
  /** prefix "+" for positive values (for signed lists) */
  plus?: boolean;
}

/** Format INR paise the way Indian users read it: ₹2,47,816.00 */
export function formatINR(minor: number, opts: FormatOpts = {}): string {
  const neg = minor < 0;
  const a = Math.abs(minor);
  const rupees = Math.floor(a / 100);
  const paise = a % 100;
  const showDec = (opts.decimals ?? 'always') === 'always' ? true : paise !== 0;
  const body = `₹${groupIndian(String(rupees))}${showDec ? '.' + String(paise).padStart(2, '0') : ''}`;
  return (neg ? '-' : opts.plus && minor > 0 ? '+' : '') + body;
}

const SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', INR: '₹' };

/** Format a non-INR amount in its own currency (2 decimal places assumed). */
export function formatForeign(minor: number, currency: string): string {
  const neg = minor < 0;
  const a = Math.abs(minor);
  const sym = SYMBOLS[currency] ?? currency + ' ';
  return `${neg ? '-' : ''}${sym}${groupWestern(String(Math.floor(a / 100)))}.${String(a % 100).padStart(2, '0')}`;
}
