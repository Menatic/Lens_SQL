import { useCallback, useEffect, useRef, useState } from 'react';
import type { TableInfo, ExecState, WsEvent } from '../types';

// Works in dev (Vite proxies /ws → :8000) and production (same host)
const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/query`;

const INIT: ExecState = {
  status:      'idle',
  plan:        null,
  statsPlan:   null,
  columns:     [],
  rows:        [],
  rowsDone:    0,
  totalRows:   0,
  elapsedMs:   0,
  error:       null,
  errorLine:   null,
  errorCol:    null,
  tables:      [],
  stmtResults: [],
  activeStmt:  0,
  ddlMessages: [],
};

export function useExecution() {
  const [state, setState] = useState<ExecState>(INIT);
  const wsRef = useRef<WebSocket | null>(null);

  // Stable message handler — never recreated, so WS.onmessage stays valid
  const onMessage = useCallback((evt: MessageEvent) => {
    let ev: WsEvent;
    try { ev = JSON.parse(evt.data); } catch { return; }

    setState(prev => {
      switch (ev.type) {
        case 'schema':
          return { ...prev, tables: ev.tables };

        case 'stmt_start':
          return {
            ...prev,
            status: 'running',
            ...(ev.total > 1
              ? { plan: null, statsPlan: null, columns: [], rows: [], rowsDone: 0 }
              : {}),
          };

        case 'plan':
          return { ...prev, status: 'running', plan: ev.tree };

        case 'progress':
          return { ...prev, rowsDone: ev.rows_done, elapsedMs: ev.elapsed_ms };

        case 'results':
          return {
            ...prev,
            status:    'done',
            columns:   ev.columns,
            rows:      ev.rows,
            totalRows: ev.total,
            elapsedMs: ev.elapsed_ms,
          };

        case 'stats':
          return { ...prev, statsPlan: ev.plan, elapsedMs: ev.elapsed_ms };

        case 'ddl_result':
          return {
            ...prev,
            status:      'done',
            ddlMessages: [...prev.ddlMessages, `✓ ${ev.message} (${ev.elapsed_ms.toFixed(1)} ms)`],
          };

        case 'error':
          return {
            ...prev,
            status:    'error',
            error:     ev.message,
            errorLine: ev.line ?? null,
            errorCol:  ev.col  ?? null,
          };

        case 'reset_ok':
          return { ...INIT, tables: (ev as any).tables ?? prev.tables };

        default:
          return prev;
      }
    });
  }, []);

  // Returns the open WS or creates a new one
  const getOrConnect = useCallback((): Promise<WebSocket> => {
    const existing = wsRef.current;
    if (existing && existing.readyState === WebSocket.OPEN) {
      return Promise.resolve(existing);
    }

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(WS_URL);
      ws.onmessage = onMessage;
      ws.onerror   = () => {
        wsRef.current = null;
        setState(s => ({ ...s, status: 'error', error: 'WebSocket connection failed' }));
        reject(new Error('WebSocket error'));
      };
      ws.onclose = () => { wsRef.current = null; };
      ws.onopen  = () => { wsRef.current = ws; resolve(ws); };
    });
  }, [onMessage]);

  // Connect eagerly on mount; clean up on unmount
  useEffect(() => {
    getOrConnect().catch(() => {});
    return () => { wsRef.current?.close(); wsRef.current = null; };
  }, [getOrConnect]);

  // Pre-populate sidebar before first query
  useEffect(() => {
    fetch('/api/schema')
      .then(r => r.json())
      .then((tables: TableInfo[]) => setState(s => ({ ...s, tables })))
      .catch(() => {});
  }, []);

  const run = useCallback(async (
    sql:           string,
    extraTables?:  Record<string, string>,
    connectionId?: string,
  ) => {
    setState(s => ({ ...INIT, tables: s.tables, status: 'planning' }));

    try {
      const ws = await getOrConnect();
      ws.send(JSON.stringify({
        type:          'run',
        sql,
        extra_tables:  extraTables ?? null,
        connection_id: connectionId ?? '__duckdb__',
      }));
    } catch {
      setState(s => ({ ...s, status: 'error', error: 'Failed to connect to server' }));
    }
  }, [getOrConnect]);

  const cancel = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setState(s => ({ ...s, status: 'idle' }));
    getOrConnect().catch(() => {});
  }, [getOrConnect]);

  const reset = useCallback(async (connectionId = '__duckdb__') => {
    setState({ ...INIT });
    try {
      const ws = await getOrConnect();
      ws.send(JSON.stringify({ type: 'reset', connection_id: connectionId }));
    } catch {}
  }, [getOrConnect]);

  return { state, run, cancel, reset };
}
