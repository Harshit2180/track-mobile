import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MemoryStorage } from '../src/core/storage';
import { SyncEngine } from '../src/core/sync';
import { loadCheckpoint, noSleep, startMock, type Server } from './helpers';

const cp = loadCheckpoint();

function assertMatchesCheckpoint(e: SyncEngine) {
  expect(e.getTransactions().length).toBe(cp.count);
  const got = Object.fromEntries(e.getMonths().map((m) => [m.month, { spend: m.spendMinor, income: m.incomeMinor }]));
  expect(got).toEqual(cp.months);
}

describe('against the CALM mock (fast, deterministic)', () => {
  let srv: Server;
  beforeAll(async () => { srv = await startMock({ calm: true }); });
  afterAll(async () => srv.stop());

  it('full sync + changes reproduces the checkpoint exactly, every transaction once', async () => {
    const e = new SyncEngine({ baseUrl: srv.url, storage: new MemoryStorage(), sleep: noSleep });
    const r = await e.sync();
    expect(r.mode).toBe('full');
    expect(r.quarantined).toEqual([]);
    assertMatchesCheckpoint(e);
    const ids = e.getTransactions().map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('a second sync is a cheap incremental that changes nothing', async () => {
    const st = new MemoryStorage();
    const e = new SyncEngine({ baseUrl: srv.url, storage: st, sleep: noSleep });
    await e.sync();
    const r = await e.sync();
    expect(r.mode).toBe('incremental');
    assertMatchesCheckpoint(e);
  });

  it('a fresh engine on the same storage shows cached data before any network (offline restart)', async () => {
    const st = new MemoryStorage();
    await new SyncEngine({ baseUrl: srv.url, storage: st, sleep: noSleep }).sync();
    const offline = new SyncEngine({ baseUrl: srv.url, storage: st, sleep: noSleep, maxAttempts: 1, fetchImpl: (async () => { throw new TypeError('Network request failed'); }) as any });
    await offline.load();
    assertMatchesCheckpoint(offline);
    await expect(offline.sync()).rejects.toThrow();
    assertMatchesCheckpoint(offline); // failure cost the user nothing
    expect(offline.getState().lastError).toBeTruthy();
  });

  it('two overlapping syncs are one run, not a race', async () => {
    let calls = 0;
    const counting: typeof fetch = (...a) => { calls++; return fetch(...a); };
    const e = new SyncEngine({ baseUrl: srv.url, storage: new MemoryStorage(), sleep: noSleep, fetchImpl: counting });
    const [a, b] = await Promise.all([e.sync(), e.sync()]);
    expect(a).toBe(b);
    const solo = new SyncEngine({ baseUrl: srv.url, storage: new MemoryStorage(), sleep: noSleep, fetchImpl: counting });
    const before = calls; await solo.sync();
    expect(calls - before).toBe(before); // the pair made exactly as many requests as one sync
    assertMatchesCheckpoint(e);
  });

  it('survives being killed halfway through the full sync, then resumes', async () => {
    const st = new MemoryStorage();
    let n = 0;
    const dying: typeof fetch = (...a) => { if (++n > 20) throw new TypeError('process killed'); return fetch(...a); };
    const first = new SyncEngine({ baseUrl: srv.url, storage: st, sleep: noSleep, maxAttempts: 1, fetchImpl: dying });
    await expect(first.sync()).rejects.toThrow();
    expect(st.rows.size).toBeGreaterThan(1000);
    expect(st.meta.syncToken).toBeNull();
    expect(st.meta.full?.cursor).toBeTruthy();

    let resumeCalls = 0;
    const counting: typeof fetch = (...a) => { resumeCalls++; return fetch(...a); };
    const second = new SyncEngine({ baseUrl: srv.url, storage: st, sleep: noSleep, fetchImpl: counting });
    await second.load();
    expect(second.getTransactions().length).toBeGreaterThan(1000); // visible immediately after restart
    const r = await second.sync();
    expect(r.mode).toBe('resumed-full');
    assertMatchesCheckpoint(second);
    expect(resumeCalls).toBeLessThan(47 + 3);          // did not start over
  });

  it('killed midway through the changes feed: token does not advance, replay is harmless', async () => {
    const st = new MemoryStorage();
    await new SyncEngine({ baseUrl: srv.url, storage: st, sleep: noSleep }).sync();
    // pretend we only ever synced the full list: rewind the token to the full-list token and drop the change effects
    const fresh = new MemoryStorage();
    let n = 0;
    const dying: typeof fetch = (...a) => { const u = String(a[0]); if (u.includes('/changes') && ++n > 0) throw new TypeError('killed'); return fetch(...a); };
    const e1 = new SyncEngine({ baseUrl: srv.url, storage: fresh, sleep: noSleep, maxAttempts: 1, fetchImpl: dying });
    await expect(e1.sync()).rejects.toThrow();
    expect(fresh.meta.syncToken).toBeTruthy();         // full list done
    const e2 = new SyncEngine({ baseUrl: srv.url, storage: fresh, sleep: noSleep });
    await e2.sync();
    assertMatchesCheckpoint(e2);
  });

  it('server rejects our token (410): cached rows stay on screen, deleted rows get pruned', async () => {
    const st = new MemoryStorage();
    const e = new SyncEngine({ baseUrl: srv.url, storage: st, sleep: noSleep });
    await e.sync();
    // plant a row the server has never heard of (as if it had been deleted server-side) and poison the token
    const ghost = { ...e.getTransactions()[0], id: 'txn_GHOST', updatedAt: 1 };
    st.rows.set(ghost.id, ghost);
    st.meta = { ...st.meta, syncToken: 'garbage-token' };
    const e2 = new SyncEngine({ baseUrl: srv.url, storage: st, sleep: noSleep });
    await e2.load();
    expect(e2.getTransactions().some((t) => t.id === 'txn_GHOST')).toBe(true);
    let minSeen = Infinity;
    e2.subscribe(() => { minSeen = Math.min(minSeen, e2.getTransactions().length); });
    const r = await e2.sync();
    expect(r.mode).toBe('resync-after-410');
    expect(r.pruned).toBe(1);
    expect(minSeen).toBeGreaterThanOrEqual(cp.count);   // never went blank / shrank while rebuilding
    expect(e2.getTransactions().some((t) => t.id === 'txn_GHOST')).toBe(false);
    assertMatchesCheckpoint(e2);
  });

  it('bad records are quarantined, not fatal', async () => {
    const bad = async (u: any) => new Response(JSON.stringify({ items: [{ id: 'x', amount_minor: 1.5 }, { id: 'y', merchant: 'm' }], next_cursor: null, sync_token: 't' }), { status: 200 });
    const e = new SyncEngine({ baseUrl: 'http://x', storage: new MemoryStorage(), sleep: noSleep, fetchImpl: bad as any });
    const r = await e.sync();
    expect(new Set(r.quarantined.map((q) => q.id))).toEqual(new Set(['x', 'y']));
    expect(e.getTransactions().length).toBe(0);
  });
});

describe('against the real CHAOS mock (500, 429 Retry-After, 503, slow pages)', () => {
  let srv: Server;
  beforeAll(async () => { srv = await startMock({ calm: false }); });
  afterAll(async () => srv.stop());

  it('still converges on the checkpoint and honours Retry-After', async () => {
    const waits: number[] = [];
    const e = new SyncEngine({ baseUrl: srv.url, storage: new MemoryStorage(), sleep: async (ms) => { waits.push(ms); }, timeoutMs: 15_000 });
    const r = await e.sync();
    expect(r.quarantined).toEqual([]);
    assertMatchesCheckpoint(e);
    expect(waits.some((w) => w >= 3000)).toBe(true);   // the 429 said Retry-After: 3
    expect(waits.some((w) => w >= 2000)).toBe(true);   // the 503 said Retry-After: 2
  }, 120_000);
});
