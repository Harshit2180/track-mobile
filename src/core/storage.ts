import type { Entry } from './types';

export interface FullProgress {
  cursor: string | null;   // next page to fetch
  token: string | null;    // sync_token captured from the FIRST page of this full sync
  resync: boolean;         // true when the store already had data (so unseen rows must be pruned at the end)
}

export interface Meta {
  syncToken: string | null;
  full: FullProgress | null;
  lastSyncAt: number | null;
}

export const EMPTY_META: Meta = { syncToken: null, full: null, lastSyncAt: null };

export interface Batch {
  upsert?: Entry[];
  remove?: string[];
  meta?: Partial<Meta>;
}

/**
 * Persistence contract. `commit` MUST be atomic: rows and meta land together or not at all, so a kill between
 * "page applied" and "cursor advanced" can never happen. (The app implements this with one SQLite transaction.)
 */
export interface Storage {
  loadAll(): Promise<{ entries: Entry[]; meta: Meta }>;
  commit(batch: Batch): Promise<void>;
}

export class MemoryStorage implements Storage {
  rows = new Map<string, Entry>();
  meta: Meta = { ...EMPTY_META };
  commits = 0;
  async loadAll() {
    return { entries: [...this.rows.values()], meta: { ...this.meta } };
  }
  async commit(b: Batch) {
    this.commits++;
    for (const e of b.upsert ?? []) this.rows.set(e.id, e);
    for (const id of b.remove ?? []) this.rows.delete(id);
    if (b.meta) this.meta = { ...this.meta, ...b.meta };
  }
}
