import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseDecimalToMinor } from '../src/core/money';

export const MOCK_DIR = process.env.TRACK_API_MOCK_DIR ?? path.resolve(__dirname, '../../track-api-mock');

export interface Server { url: string; stop: () => Promise<void> }

let nextPort = 4300 + Math.floor(Math.random() * 400);

export async function startMock(opts: { calm: boolean; fixtures?: string }): Promise<Server> {
  const port = nextPort++;
  const env = { ...process.env, PORT: String(port), SM_CALM: opts.calm ? '1' : '0', ...(opts.fixtures ? { FIXTURES: opts.fixtures } : {}) };
  const child: ChildProcess = spawn('node', [path.join(MOCK_DIR, 'server.js')], { env, stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(url + '/v1/health'); if (r.ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  return { url, stop: async () => { child.kill(); } };
}

export function loadCheckpoint() {
  const cp = JSON.parse(readFileSync(path.join(MOCK_DIR, 'fixtures/checkpoint.json'), 'utf8'));
  const months: Record<string, { spend: number; income: number }> = {};
  for (const [k, v] of Object.entries<any>(cp.months)) months[k] = { spend: parseDecimalToMinor(v.spend), income: parseDecimalToMinor(v.income) };
  return { count: cp.transaction_count as number, months };
}

export const noSleep = async () => {};
