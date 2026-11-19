// All user-facing dates are India Standard Time (UTC+05:30, no DST). Done with arithmetic so we do not
// depend on Intl / timezone data being present in the JS engine (Hermes).
export const IST_OFFSET_MS = 5.5 * 3600 * 1000;

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MON3 = MONTHS.map((m) => m.slice(0, 3));

export function parseIsoTimestamp(iso: string): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new Error(`Unparseable timestamp: ${JSON.stringify(iso)}`);
  return t;
}

/** Legacy feed gives epoch seconds; tolerate epoch millis too. */
export function epochToMs(n: number): number {
  if (!Number.isFinite(n)) throw new Error(`Bad epoch: ${n}`);
  return n > 1e12 ? n : n * 1000;
}

function ist(ts: number): Date {
  return new Date(ts + IST_OFFSET_MS);
}

export function monthKeyIST(ts: number): string {
  const d = ist(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function dayKeyIST(ts: number): string {
  const d = ist(ts);
  return `${monthKeyIST(ts)}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

/** "9 Oct 2026, 7:12 pm" in IST */
export function formatDateTimeIST(ts: number): string {
  const d = ist(ts);
  const h = d.getUTCHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${MON3[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${h12}:${mm} ${h < 12 ? 'am' : 'pm'}`;
}

export function formatDayIST(ts: number): string {
  const d = ist(ts);
  return `${d.getUTCDate()} ${MON3[d.getUTCMonth()]}`;
}
