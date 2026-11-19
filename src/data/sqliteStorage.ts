import * as SQLite from 'expo-sqlite';
import { EMPTY_META, type Batch, type Meta, type Storage } from '../core/storage';
import type { Entry } from '../core/types';

/**
 * SQLite-backed Storage. One row per transaction (id, updated_at, JSON body) and one row per meta key.
 * commit() runs in a single transaction: rows and cursor/token land together or not at all, so being killed
 * mid-page can never leave the cursor ahead of the data.
 */
export class SqliteStorage implements Storage {
  private db: Promise<SQLite.SQLiteDatabase>;

  constructor(name = 'track.db') {
    this.db = (async () => {
      const db = await SQLite.openDatabaseAsync(name);
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS txns (id TEXT PRIMARY KEY NOT NULL, updated_at INTEGER NOT NULL, body TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY NOT NULL, v TEXT NOT NULL);
      `);
      return db;
    })();
  }

  async loadAll(): Promise<{ entries: Entry[]; meta: Meta }> {
    const db = await this.db;
    const rows = await db.getAllAsync<{ body: string }>('SELECT body FROM txns');
    const metaRows = await db.getAllAsync<{ k: string; v: string }>('SELECT k, v FROM meta');
    const meta: Record<string, unknown> = { ...EMPTY_META };
    for (const r of metaRows) meta[r.k] = JSON.parse(r.v);
    return { entries: rows.map((r) => JSON.parse(r.body) as Entry), meta: meta as unknown as Meta };
  }

  async commit(b: Batch): Promise<void> {
    const db = await this.db;
    await db.withTransactionAsync(async () => {
      for (const e of b.upsert ?? []) {
        await db.runAsync('INSERT OR REPLACE INTO txns (id, updated_at, body) VALUES (?, ?, ?)', [e.id, e.updatedAt, JSON.stringify(e)]);
      }
      for (const id of b.remove ?? []) await db.runAsync('DELETE FROM txns WHERE id = ?', [id]);
      for (const [k, v] of Object.entries(b.meta ?? {})) {
        await db.runAsync('INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)', [k, JSON.stringify(v ?? null)]);
      }
    });
  }
}
