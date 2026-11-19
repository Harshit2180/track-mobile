// Search normalisation. Avoids \p{...} regex classes (patchy on Hermes): keeps ASCII alphanumerics and the
// Indic script blocks (Devanagari ... Malayalam, incl. combining marks), drops emoji/symbols/punctuation.
export function normalizeText(input: string): string {
  const s = input.normalize('NFKC').toLowerCase();
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    const keep = (c >= 48 && c <= 57) || (c >= 97 && c <= 122) || (c >= 0x0900 && c <= 0x0dff) || (c >= 0xc0 && c <= 0x24f);
    out += keep ? ch : ' ';
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Every whitespace-separated query token must appear (substring) in the haystack. */
export function matchesQuery(searchText: string, query: string): boolean {
  const q = normalizeText(query);
  if (!q) return true;
  return q.split(' ').every((tok) => searchText.includes(tok));
}

/** Nicer merchant name for display: strips rails prefixes and branch suffixes. Raw name is always kept too. */
export function displayMerchant(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^(UPI|IMPS\/P2A|IMPS|NEFT|POS)\s*[\/ ]\s*/i, '');
  s = s.split('*')[0].trim() || s;
  if (/[A-Z]/.test(s) && s === s.toUpperCase() && /^[\x00-\x7f]*$/.test(s)) {
    s = s.toLowerCase().replace(/(^|[\s\-/&])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());
  }
  return s.replace(/\s+/g, ' ');
}
