import { applyEntries, type MergeStats } from './merge';
import { normalizeBatch } from './normalize';
import { summarizeMonths, visibleTransactions, type MonthSummary } from './aggregate';
import { EMPTY_META, type Meta, type Storage } from './storage';
import { isTomb, type Entry, type Txn } from './types';

export class HttpError extends Error {
  constructor(public status: number, public retryAfterMs?: number) {
    super(`HTTP ${status}`);
  }
}

export interface SyncEngineOptions {
  baseUrl: string;
  storage: Storage;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
  pageSize?: number;      // server max is 100
  timeoutMs?: number;
  maxAttempts?: number;   // per request
}

export interface SyncResult extends MergeStats {
  mode: 'full' | 'resumed-full' | 'incremental' | 'resync-after-410';
  pruned: number;
  quarantined: { id: string; reason: string }[];
  total: number;
}

export interface EngineState {
  syncing: boolean;
  lastError: string | null;
  lastSyncAt: number | null;
  loadedCount: number;
}

const RETRYABLE = (s: number) => s === 408 || s === 425 || s === 429 || s >= 500;

export class SyncEngine {
  private store = new Map<string, Entry>();
  private meta: Meta = { ...EMPTY_META };
  private loaded = false;
  private inflight: Promise<SyncResult> | null = null;
  private listeners = new Set<() => void>();
  private version = 0;
  private cache: { v: number; txns: Txn[]; months: MonthSummary[] } | null = null;
  private lastError: string | null = null;

  private o: Required<SyncEngineOptions>;

  constructor(opts: SyncEngineOptions) {
    this.o = {
      fetchImpl: (opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a))) as typeof fetch,
      sleep: opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
      random: opts.random ?? Math.random,
      now: opts.now ?? Date.now,
      pageSize: opts.pageSize ?? 100,
      timeoutMs: opts.timeoutMs ?? 10_000,
      maxAttempts: opts.maxAttempts ?? 5,
      baseUrl: opts.baseUrl.replace(/\/+$/, ''),
      storage: opts.storage,
    };
  }

  // ------------------------------------------------------------------ public read API
  async load(): Promise<void> {
    if (this.loaded) return;
    const { entries, meta } = await this.o.storage.loadAll();
    this.store = new Map(entries.map((e) => [e.id, e]));
    this.meta = { ...EMPTY_META, ...meta };
    this.loaded = true;
    this.bump();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getTransactions(): Txn[] { return this.derived().txns; }
  getMonths(): MonthSummary[] { return this.derived().months; }
  getState(): EngineState {
    return { syncing: this.inflight !== null, lastError: this.lastError, lastSyncAt: this.meta.lastSyncAt, loadedCount: this.derived().txns.length };
  }

  private derived() {
    if (!this.cache || this.cache.v !== this.version) {
      const txns = visibleTransactions(this.store.values());
      this.cache = { v: this.version, txns, months: summarizeMonths(txns) };
    }
    return this.cache;
  }
  private bump() { this.version++; for (const l of this.listeners) l(); }

  // ------------------------------------------------------------------ sync
  /** Single-flight: concurrent callers share one run, so two syncs can never race each other. */
  sync(): Promise<SyncResult> {
    if (this.inflight) return this.inflight;
    this.lastError = null;
    const p = this.run().then(
      (r) => { this.inflight = null; this.bump(); return r; },
      (e) => { this.lastError = (e as Error).message; this.inflight = null; this.bump(); throw e; },
    );
    this.inflight = p;
    this.bump();
    return p;
  }

  private async run(): Promise<SyncResult> {
    await this.load();
    const stats: MergeStats = { added: 0, updated: 0, deleted: 0, ignored: 0 };
    const res: SyncResult = { ...stats, mode: 'incremental', pruned: 0, quarantined: [], total: 0 };

    const touched = new Set<string>();
    let seen: Set<string> | null = null;
    const needFull = !this.meta.syncToken || this.meta.full !== null;
    if (needFull) {
      res.mode = this.meta.full && !this.meta.full.resync ? 'resumed-full' : 'full';
      seen = await this.fullSync(stats, res);
    }
    try {
      await this.incremental(stats, res, touched);
    } catch (e) {
      // 410: server no longer accepts our token. Keep showing cached rows; rebuild underneath them.
      if (e instanceof HttpError && e.status === 410) {
        res.mode = 'resync-after-410';
        await this.o.storage.commit({ meta: { syncToken: null, full: null } });
        this.meta = { ...this.meta, syncToken: null, full: null };
        seen = await this.fullSync(stats, res);
        await this.incremental(stats, res, touched);
      } else throw e;
    }
    if (seen) await this.prune(seen, touched, res);
    Object.assign(res, stats);
    res.total = this.derived().txns.length;
    return res;
  }

  /** Returns the set of ids the server listed when this was a resync over existing data (else null). */
  private async fullSync(stats: MergeStats, res: SyncResult): Promise<Set<string> | null> {
    const resumable = this.meta.full && !this.meta.full.resync ? this.meta.full : null;
    let cursor = resumable?.cursor ?? null;
    let token = resumable?.token ?? null;
    const resync = resumable ? false : this.store.size > 0;
    const seen = new Set<string>();
    let lastCursor: string | null = null;

    for (;;) {
      const q = `limit=${this.o.pageSize}` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
      let body: any;
      try {
        body = await this.getJson(`/v1/transactions?${q}`);
      } catch (e) {
        // our saved cursor is junk -> start over rather than wedge forever
        if (e instanceof HttpError && e.status === 400 && cursor) {
          cursor = null; token = null; lastCursor = null;
          await this.o.storage.commit({ meta: { full: null } });
          continue;
        }
        throw e;
      }
      if (!Array.isArray(body.items)) throw new Error('Malformed page: items missing');
      if (token === null) token = body.sync_token ?? null;   // token from the FIRST page: replaying changes from it is safe/idempotent
      const nb = normalizeBatch(body.items, this.o.now);
      res.quarantined.push(...nb.quarantined);
      if (resync) nb.ids.forEach((id) => seen.add(id));
      const changed = applyEntries(this.store, nb.entries, stats);
      const next: string | null = body.next_cursor ?? null;
      await this.o.storage.commit({ upsert: changed, meta: { full: next ? { cursor: next, token, resync } : { cursor: null, token, resync } } });
      this.bump();
      if (!next) break;
      if (next === lastCursor || next === cursor) throw new Error('Server returned a repeating cursor');
      lastCursor = cursor;
      cursor = next;
    }

    if (!token) throw new Error('Server did not return a sync_token');

    await this.o.storage.commit({ meta: { syncToken: token, full: null } });
    this.meta = { ...this.meta, syncToken: token, full: null };
    this.bump();
    return resync ? seen : null;
  }

  /**
   * After a resync, drop rows the server no longer has. A row survives if the full list OR the catch-up
   * changes feed mentioned it (the list is a snapshot from before the changes, so it lacks newer rows).
   * Runs only after catch-up, so the screen never shrinks mid-sync.
   */
  private async prune(seen: Set<string>, touched: Set<string>, res: SyncResult): Promise<void> {
    const removed: string[] = [];
    for (const [id, e] of this.store) if (!isTomb(e) && !seen.has(id) && !touched.has(id)) removed.push(id);
    if (!removed.length) return;
    removed.forEach((id) => this.store.delete(id));
    await this.o.storage.commit({ remove: removed });
    res.pruned += removed.length;
    this.bump();
  }

  private async incremental(stats: MergeStats, res: SyncResult, touched: Set<string>): Promise<void> {
    const since = this.meta.syncToken!;
    let cursor: string | null = null;
    for (;;) {
      const q = `since=${encodeURIComponent(since)}&limit=${this.o.pageSize}` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
      const body: any = await this.getJson(`/v1/transactions/changes?${q}`);
      if (!Array.isArray(body.items)) throw new Error('Malformed page: items missing');
      const nb = normalizeBatch(body.items, this.o.now);
      res.quarantined.push(...nb.quarantined);
      nb.ids.forEach((id) => touched.add(id));
      const changed = applyEntries(this.store, nb.entries, stats);
      const next: string | null = body.next_cursor ?? null;
      if (next) {
        // not done: persist rows only; token advances only once the LAST page is applied
        await this.o.storage.commit({ upsert: changed });
        this.bump();
        cursor = next;
      } else {
        const tok = body.sync_token ?? since;
        const at = this.o.now();
        await this.o.storage.commit({ upsert: changed, meta: { syncToken: tok, lastSyncAt: at } });
        this.meta = { ...this.meta, syncToken: tok, lastSyncAt: at };
        this.bump();
        return;
      }
    }
  }

  // ------------------------------------------------------------------ http with retry
  private async getJson(path: string): Promise<any> {
    let attempt = 0;
    for (;;) {
      attempt++;
      let retryAfterMs: number | undefined;
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), this.o.timeoutMs);
        let res: Response;
        try {
          res = await this.o.fetchImpl(this.o.baseUrl + path, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
        } finally { clearTimeout(timer); }
        if (res.ok) return await res.json();
        const ra = res.headers.get('Retry-After');
        retryAfterMs = ra && /^\d+$/.test(ra) ? Number(ra) * 1000 : undefined;
        const err = new HttpError(res.status, retryAfterMs);
        if (!RETRYABLE(res.status)) throw err;
        if (attempt >= this.o.maxAttempts) throw err;
      } catch (e) {
        if (e instanceof HttpError && !RETRYABLE(e.status)) throw e;
        if (attempt >= this.o.maxAttempts) throw e;
      }
      const backoff = Math.min(30_000, 500 * 2 ** (attempt - 1)) * (0.5 + this.o.random() * 0.5);
      await this.o.sleep(Math.max(backoff, retryAfterMs ?? 0));
    }
  }
}
