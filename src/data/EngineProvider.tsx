import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import { API_URL } from '../config';
import { SyncEngine } from '../core/sync';
import { SqliteStorage } from './sqliteStorage';

const EngineContext = createContext<SyncEngine | null>(null);

export function EngineProvider({ children }: { children: React.ReactNode }) {
  const engine = useMemo(() => new SyncEngine({ baseUrl: API_URL, storage: new SqliteStorage() }), []);

  useEffect(() => {
    // Show cached data first, then sync in the background. A failed sync is surfaced via state, never thrown.
    engine.load().then(() => engine.sync()).catch(() => {});
  }, [engine]);

  return <EngineContext.Provider value={engine}>{children}</EngineContext.Provider>;
}

export function useEngine(): SyncEngine {
  const e = useContext(EngineContext);
  if (!e) throw new Error('useEngine must be used inside <EngineProvider>');
  return e;
}

/** Re-renders on every engine change. Reads are cached inside the engine, so this is cheap. */
export function useTrack() {
  const engine = useEngine();
  const [, tick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => engine.subscribe(tick), [engine]);
  const refresh = useCallback(() => engine.sync().catch(() => {}), [engine]);
  return { transactions: engine.getTransactions(), months: engine.getMonths(), state: engine.getState(), refresh };
}
