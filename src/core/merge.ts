import { isTomb, type Entry } from './types';

export interface MergeStats { added: number; updated: number; deleted: number; ignored: number }

/**
 * Latest truth wins: an incoming entry replaces the stored one only if its updatedAt is >= the stored one's.
 * Feed order is NOT trusted (the changes feed can deliver an older version after a newer one).
 * Tombstones are kept so a stale update arriving later cannot resurrect a deleted row.
 * Returns the entries that actually changed the store (so callers persist only those).
 */
export function applyEntries(store: Map<string, Entry>, incoming: Entry[], stats?: MergeStats): Entry[] {
  const written = new Map<string, Entry>();
  for (const e of incoming) {
    const cur = store.get(e.id);
    if (cur && e.updatedAt < cur.updatedAt) { if (stats) stats.ignored++; continue; }
    if (stats) {
      if (isTomb(e)) { if (!cur || !isTomb(cur)) stats.deleted++; }
      else if (!cur || isTomb(cur)) stats.added++;
      else stats.updated++;
    }
    store.set(e.id, e);
    written.set(e.id, e);
  }
  return [...written.values()];
}
