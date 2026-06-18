import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import PlanTree from './components/PlanTree';
import ResultsTable from './components/ResultsTable';
import Sidebar from './components/Sidebar';
import type { UploadedTable, HistoryEntry } from './components/Sidebar';
import DataGen from './components/DataGen';
import StatsBar from './components/StatsBar';
import ConnectionPicker from './components/ConnectionPicker';
import BottleneckBanner from './components/BottleneckBanner';
import CommandPalette from './components/CommandPalette';
import { useExecution } from './hooks/useExecution';
import Landing from './pages/Landing';
import Learn from './pages/Learn';
import LessonPage from './pages/Lesson';
import Compare from './pages/Compare';
import { LESSONS } from './data/lessons';
import type { SampleQuery, TableInfo } from './types';

// ── History helpers ───────────────────────────────────────────────────────────

const HISTORY_KEY = 'lens_history';
const MAX_HISTORY = 50;

function loadHistory(): HistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]'); } catch { return []; }
}
function saveHistory(h: HistoryEntry[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, MAX_HISTORY)));
}
function pushHistory(entry: Omit<HistoryEntry, 'id'>) {
  const existing = loadHistory();
  saveHistory([{ ...entry, id: Date.now().toString() }, ...existing]);
}

// ── URL share helpers ─────────────────────────────────────────────────────────

function encodeB64(str: string): string {
  try { return btoa(unescape(encodeURIComponent(str))); } catch { return ''; }
}
function decodeB64(b64: string): string {
  try { return decodeURIComponent(escape(atob(b64))); } catch { return ''; }
}

const DEFAULT_SQL = `-- Welcome to Lens — write SQL, see it execute
SELECT m.genre,
       COUNT(*)         AS total_orders,
       SUM(o.price_usd) AS total_revenue,
       AVG(m.rating)    AS avg_rating
FROM   orders o
JOIN   movies m ON o.movie_id = m.movie_id
GROUP  BY m.genre
ORDER  BY total_revenue DESC
LIMIT  10`;

// ── Main playground ───────────────────────────────────────────────────────────

function Playground() {
  const { state, run, cancel, reset }   = useExecution();
  const [sql, setSql]                   = useState(DEFAULT_SQL);
  const [samples, setSamples]           = useState<SampleQuery[]>([]);
  const [tab, setTab]                   = useState<'plan' | 'results' | 'ddl'>('plan');
  const [uploadedTables, setUploaded]   = useState<UploadedTable[]>([]);
  const [showDataGen, setDataGen]       = useState(false);
  const [activeConnId, setActiveConnId] = useState<string>('__duckdb__');
  const [showPalette, setShowPalette]   = useState(false);
  const [copied, setCopied]             = useState(false);
  const [history, setHistory]           = useState<HistoryEntry[]>(() => loadHistory());

  const editorRef             = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef             = useRef<typeof Monaco | null>(null);
  const tablesForCompleteRef  = useRef<TableInfo[]>([]);
  const completionDisposable  = useRef<{ dispose: () => void } | null>(null);
  const lastRunSqlRef         = useRef('');
  const wasRunningRef         = useRef(false);

  const extraTablesMap = Object.fromEntries(uploadedTables.map(u => [u.tableName, u.path]));

  // ── Keep autocomplete tables ref fresh ───────────────────────────────────
  useEffect(() => { tablesForCompleteRef.current = state.tables; }, [state.tables]);

  // ── Load samples ─────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/samples').then(r => r.json()).then(setSamples).catch(() => {});
  }, []);

  // ── Read shareable URL on mount ───────────────────────────────────────────
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#q=')) {
      const decoded = decodeB64(hash.slice(3));
      if (decoded) {
        setSql(decoded);
        editorRef.current?.setValue(decoded);
      }
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  // ── Cmd+K command palette ─────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowPalette(p => !p);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // ── Auto-switch tabs ──────────────────────────────────────────────────────
  useEffect(() => {
    if (state.status === 'done') {
      if (state.ddlMessages.length > 0 && state.columns.length === 0) setTab('ddl');
      else setTab('results');
    }
  }, [state.status, state.ddlMessages.length, state.columns.length]);

  useEffect(() => {
    if (state.status === 'planning' || state.status === 'running' || state.status === 'error') setTab('plan');
  }, [state.status]);

  // ── Monaco error markers ──────────────────────────────────────────────────
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;
    if (state.status === 'error' && state.errorLine != null) {
      const line = state.errorLine;
      const col  = state.errorCol ?? 1;
      monaco.editor.setModelMarkers(model, 'lens', [{
        severity:        monaco.MarkerSeverity.Error,
        startLineNumber: line,
        startColumn:     col,
        endLineNumber:   line,
        endColumn:       model.getLineMaxColumn(line),
        message:         state.error ?? 'SQL error',
      }]);
    } else {
      monaco.editor.setModelMarkers(model, 'lens', []);
    }
  }, [state.status, state.errorLine, state.errorCol, state.error]);

  // ── Record query history ──────────────────────────────────────────────────
  useEffect(() => {
    if (state.status === 'planning' || state.status === 'running') {
      wasRunningRef.current = true;
    }
    if ((state.status === 'done' || state.status === 'error') && wasRunningRef.current) {
      wasRunningRef.current = false;
      if (lastRunSqlRef.current) {
        pushHistory({
          sql:       lastRunSqlRef.current,
          totalRows: state.totalRows,
          elapsedMs: state.elapsedMs,
          status:    state.status as 'done' | 'error',
          timestamp: Date.now(),
          error:     state.error ?? undefined,
        });
        setHistory(loadHistory());
      }
    }
  }, [state.status, state.totalRows, state.elapsedMs, state.error]);

  // ── Run ───────────────────────────────────────────────────────────────────
  const handleRun = useCallback(() => {
    const query = editorRef.current?.getValue() ?? sql;
    if (!query.trim()) return;
    lastRunSqlRef.current = query.trim();
    run(query.trim(), Object.keys(extraTablesMap).length > 0 ? extraTablesMap : undefined, activeConnId);
  }, [run, sql, extraTablesMap, activeConnId]);

  // ── Editor mount: register autocomplete + Cmd+Enter ──────────────────────
  const handleEditorMount = useCallback((
    editor: Monaco.editor.IStandaloneCodeEditor,
    monaco: typeof Monaco,
  ) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Schema-aware autocomplete (register once)
    if (!completionDisposable.current) {
      completionDisposable.current = monaco.languages.registerCompletionItemProvider('sql', {
        triggerCharacters: [' ', '\n', ',', '(', '.'],
        provideCompletionItems: (model, position) => {
          const tables = tablesForCompleteRef.current;
          const word   = model.getWordUntilPosition(position);
          const range  = {
            startLineNumber: position.lineNumber,
            endLineNumber:   position.lineNumber,
            startColumn:     word.startColumn,
            endColumn:       word.endColumn,
          };
          const suggestions: Monaco.languages.CompletionItem[] = [];
          for (const t of tables) {
            suggestions.push({
              label:      t.table,
              kind:       monaco.languages.CompletionItemKind.Class,
              insertText: t.table,
              range,
              detail:     `table · ${t.row_count.toLocaleString()} rows`,
              sortText:   `a_${t.table}`,
            });
            for (const col of t.columns) {
              suggestions.push({
                label:      col.name,
                kind:       monaco.languages.CompletionItemKind.Field,
                insertText: col.name,
                range,
                detail:     `${t.table}.${col.name} · ${col.type}`,
                sortText:   `b_${col.name}`,
              });
            }
          }
          return { suggestions };
        },
      });
    }

    editor.addCommand(2048 | 3, () => {
      const q = editor.getValue().trim();
      if (q) {
        lastRunSqlRef.current = q;
        run(q, Object.keys(extraTablesMap).length > 0 ? extraTablesMap : undefined, activeConnId);
      }
    });
  }, [run, extraTablesMap, activeConnId]);

  // ── Share ─────────────────────────────────────────────────────────────────
  const handleShare = useCallback(() => {
    const currentSql = editorRef.current?.getValue() ?? sql;
    if (!currentSql.trim()) return;
    const encoded = encodeB64(currentSql);
    if (!encoded) return;
    const url = `${window.location.origin}/playground#q=${encoded}`;
    navigator.clipboard.writeText(url).catch(() => {
      const el = document.createElement('textarea');
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }).finally(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    });
  }, [sql]);

  // ── Insert table name into editor ─────────────────────────────────────────
  const insertTableName = useCallback((name: string) => {
    const ed = editorRef.current;
    if (ed) {
      const pos = ed.getPosition();
      ed.executeEdits('', [{
        range: { startLineNumber: pos!.lineNumber, startColumn: pos!.column, endLineNumber: pos!.lineNumber, endColumn: pos!.column },
        text:  name,
      }]);
    }
  }, []);

  const isRunning = state.status === 'planning' || state.status === 'running';

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    padding:          '7px 16px',
    background:       active ? 'rgba(91,159,255,0.07)' : 'transparent',
    border:           'none',
    borderBottom:     active ? '2px solid var(--blue)' : '2px solid transparent',
    color:            active ? 'var(--text)' : 'var(--text2)',
    cursor:           'pointer',
    fontSize:         10.5,
    fontWeight:       active ? 600 : 400,
    letterSpacing:    '0.06em',
    textTransform:    'uppercase',
    whiteSpace:       'nowrap',
    transition:       'color 0.15s, background 0.15s',
    borderRadius:     active ? '4px 4px 0 0' : 0,
  });

  return (
    <div style={{
      display:             'grid',
      gridTemplateRows:    '48px 1fr 32px',
      gridTemplateColumns: '1fr',
      height:              '100vh',
      overflow:            'hidden',
    }}>
      {/* HEADER */}
      <header style={{
        display:             'flex',
        alignItems:          'center',
        gap:                 10,
        padding:             '0 14px',
        background:          'rgba(4,6,14,0.88)',
        backdropFilter:      'blur(24px) saturate(180%)',
        WebkitBackdropFilter:'blur(24px) saturate(180%)',
        borderBottom:        '1px solid rgba(24,32,56,0.9)',
        boxShadow:           '0 1px 0 rgba(255,255,255,0.03)',
        flexShrink:          0,
      }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 6, textDecoration: 'none' }}>
          <LensLogo />
          <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: '-0.02em', color: 'var(--text)' }}>Lens</span>
        </a>

        <div style={{ width: 1, height: 18, background: 'var(--border)', flexShrink: 0 }} />

        <button
          onClick={isRunning ? cancel : handleRun}
          style={{
            display:       'flex',
            alignItems:    'center',
            gap:           6,
            padding:       '5px 14px',
            background:    isRunning ? 'rgba(248,113,113,0.08)' : 'linear-gradient(135deg, #5B9FFF 0%, #8B5CF6 100%)',
            color:         isRunning ? 'var(--red)' : '#fff',
            border:        isRunning ? '1px solid rgba(248,113,113,0.3)' : '1px solid transparent',
            borderRadius:  6,
            cursor:        'pointer',
            fontSize:      12,
            fontWeight:    600,
            letterSpacing: '0.01em',
            boxShadow:     isRunning ? 'none' : '0 0 0 1px rgba(91,159,255,0.25), 0 3px 12px rgba(91,159,255,0.2)',
            transition:    'box-shadow 0.15s, transform 0.1s',
          }}
        >
          {isRunning
            ? <><StopIcon /> Cancel</>
            : <><RunIcon /> Run <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 2 }}>⌘↵</span></>}
        </button>

        <span style={{ flex: 1 }} />

        {/* Cmd+K hint */}
        <button
          onClick={() => setShowPalette(true)}
          title="Command palette (Ctrl+K / ⌘K)"
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:          5,
            padding:      '4px 10px',
            background:   'rgba(24,32,56,0.5)',
            border:       '1px solid var(--border)',
            borderRadius: 5,
            color:        'var(--text3)',
            cursor:       'pointer',
            fontSize:     11,
            backdropFilter: 'blur(4px)',
            transition:   'border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--text2)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)';  e.currentTarget.style.color = 'var(--text3)';  }}
        >
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.02em' }}>⌘K</span>
          <span>Search</span>
        </button>

        {/* Share */}
        <button
          onClick={handleShare}
          title="Copy shareable link with current SQL"
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:          5,
            padding:      '4px 10px',
            background:   copied ? 'rgba(52,211,153,0.08)' : 'rgba(24,32,56,0.5)',
            border:       `1px solid ${copied ? 'rgba(52,211,153,0.35)' : 'var(--border)'}`,
            borderRadius: 5,
            color:        copied ? 'var(--green)' : 'var(--text2)',
            cursor:       'pointer',
            fontSize:     11,
            transition:   'all 0.15s',
            fontWeight:   copied ? 600 : 400,
          }}
        >
          {copied ? '✓ Copied!' : '⎘ Share'}
        </button>

        <a href="/compare" style={{ color: 'var(--text3)', fontSize: 12, textDecoration: 'none', fontWeight: 500, transition: 'color 0.15s' }}
          onMouseEnter={e => { (e.target as HTMLElement).style.color = 'var(--text2)'; }}
          onMouseLeave={e => { (e.target as HTMLElement).style.color = 'var(--text3)'; }}>
          Compare →
        </a>
        <a href="/learn" style={{ color: 'var(--text3)', fontSize: 12, textDecoration: 'none', transition: 'color 0.15s' }}
          onMouseEnter={e => { (e.target as HTMLElement).style.color = 'var(--text2)'; }}
          onMouseLeave={e => { (e.target as HTMLElement).style.color = 'var(--text3)'; }}>
          Learn →
        </a>

        <ConnectionPicker activeId={activeConnId} onSelect={setActiveConnId} />
      </header>

      {/* WORKSPACE */}
      <div style={{ display: 'flex', overflow: 'hidden', minHeight: 0, background: 'var(--bg)' }}>
        {/* Sidebar */}
        <aside style={{ width: 244, flexShrink: 0, borderRight: '1px solid var(--border)', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>
          <Sidebar
            tables={state.tables}
            samples={samples}
            uploadedTables={uploadedTables}
            historyEntries={history}
            onSelectQuery={q => { setSql(q); editorRef.current?.setValue(q); }}
            onInsertTable={insertTableName}
            onUploadTable={t => setUploaded(prev => [...prev.filter(u => u.tableName !== t.tableName), t])}
            onRemoveTable={name => setUploaded(prev => prev.filter(u => u.tableName !== name))}
            onOpenGenerator={() => setDataGen(true)}
            onLoadHistory={q => { setSql(q); editorRef.current?.setValue(q); }}
            onClearHistory={() => {
              localStorage.removeItem(HISTORY_KEY);
              setHistory([]);
            }}
          />
          {showDataGen && (
            <DataGen
              onLoad={t => setUploaded(prev => [...prev.filter(u => u.tableName !== t.tableName), t])}
              onClose={() => setDataGen(false)}
            />
          )}
        </aside>

        {/* SQL Editor */}
        <div style={{ width: '40%', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', overflow: 'hidden', background: 'var(--bg)' }}>
          <div style={{ padding: '5px 14px', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text3)', background: 'rgba(4,6,14,0.6)', flexShrink: 0, backdropFilter: 'blur(8px)' }}>
            SQL EDITOR
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <Editor
              defaultLanguage="sql"
              value={sql}
              onChange={v => setSql(v ?? '')}
              onMount={handleEditorMount}
              theme="vs-dark"
              options={{
                fontSize:             13,
                fontFamily:           "'JetBrains Mono', Consolas, monospace",
                minimap:              { enabled: false },
                lineNumbers:          'on',
                scrollBeyondLastLine: false,
                wordWrap:             'on',
                padding:              { top: 12 },
                scrollbar:            { verticalScrollbarSize: 5, horizontalScrollbarSize: 5 },
                overviewRulerLanes:   0,
                renderLineHighlight:  'line',
              }}
            />
          </div>
        </div>

        {/* Right panel: plan + results */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, position: 'relative' }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', background: 'rgba(4,6,14,0.7)', backdropFilter: 'blur(8px)', flexShrink: 0, paddingLeft: 4 }}>
            <button onClick={() => setTab('plan')}    style={tabBtnStyle(tab === 'plan')}>Execution Plan</button>
            <button onClick={() => setTab('results')} style={tabBtnStyle(tab === 'results')}>
              {`Results${state.totalRows > 0 ? ` (${state.totalRows.toLocaleString()})` : ''}`}
            </button>
            {state.ddlMessages.length > 0 && (
              <button onClick={() => setTab('ddl')} style={tabBtnStyle(tab === 'ddl')}>
                {`Messages (${state.ddlMessages.length})`}
              </button>
            )}
            {isRunning && (
              <div style={{ marginLeft: 'auto', marginRight: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <ProgressDots />
                <span style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'var(--mono)' }}>
                  {state.rowsDone > 0 ? `${state.rowsDone.toLocaleString()} rows…` : 'planning…'}
                </span>
              </div>
            )}
          </div>

          {/* Error overlay */}
          {state.status === 'error' && state.error && (
            <ErrorPanel
              error={state.error}
              errorLine={state.errorLine}
              errorCol={state.errorCol}
              sql={editorRef.current?.getValue() ?? ''}
              schema={state.tables}
            />
          )}

          {/* Plan tab */}
          <div style={{ flex: 1, overflow: 'hidden', display: state.status !== 'error' && tab === 'plan' ? 'flex' : 'none', flexDirection: 'column' }}>
            {state.statsPlan && <BottleneckBanner statsPlan={state.statsPlan} />}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <PlanTree plan={state.plan} statsPlan={state.statsPlan} status={state.status} />
            </div>
          </div>

          {/* Results tab */}
          <div style={{ flex: 1, overflow: 'hidden', display: state.status !== 'error' && tab === 'results' ? 'flex' : 'none', flexDirection: 'column' }}>
            <ResultsTable columns={state.columns} rows={state.rows} total={state.totalRows} />
          </div>

          {/* DDL tab */}
          <div style={{ flex: 1, overflow: 'auto', display: state.status !== 'error' && tab === 'ddl' ? 'flex' : 'none', flexDirection: 'column', padding: 16, gap: 8 }}>
            {state.ddlMessages.map((msg, i) => (
              <div key={i} style={{ padding: '10px 14px', background: 'rgba(63,185,80,0.08)', border: '1px solid rgba(63,185,80,0.25)', borderRadius: 6, fontSize: 13, fontFamily: 'var(--mono)', color: 'var(--green)', lineHeight: 1.5 }}>
                {msg}
              </div>
            ))}
          </div>
        </div>
      </div>

      <StatsBar
        status={state.status}
        rowsDone={state.rowsDone}
        totalRows={state.totalRows}
        elapsedMs={state.elapsedMs}
        error={state.error}
      />

      {/* Command palette */}
      <CommandPalette
        open={showPalette}
        onClose={() => setShowPalette(false)}
        samples={samples}
        tables={state.tables}
        lessons={LESSONS}
        onLoadSql={q => { setSql(q); editorRef.current?.setValue(q); }}
        onInsertTable={insertTableName}
        onReset={() => reset(activeConnId)}
        onOpenDataGen={() => setDataGen(true)}
        onShare={handleShare}
      />
    </div>
  );
}

// ── Router ────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"                element={<Landing />} />
        <Route path="/playground"      element={<Playground />} />
        <Route path="/compare"         element={<Compare />} />
        <Route path="/learn"           element={<Learn />} />
        <Route path="/learn/:lessonId" element={<LessonPage />} />
      </Routes>
    </BrowserRouter>
  );
}

// ── Error panel ───────────────────────────────────────────────────────────────

function parseError(raw: string): { kind: string; body: string; hint: string | null; missingTable: string | null } {
  const firstLine  = raw.split('\n')[0];
  const kindMatch  = firstLine.match(/^(\w[\w\s]+Error):/i);
  const kind       = kindMatch ? kindMatch[1] : 'Error';
  const hintMatch  = raw.match(/(?:Did you mean|HINT|Candidate[^:]*:)\s*(.+)/i);
  const hint       = hintMatch ? hintMatch[0].trim() : null;
  const tblMatch   = raw.match(/(?:Table|Relation|catalog entry)\s+["']?(\w+)["']?\s+(?:does not exist|not found)/i);
  return { kind, body: raw, hint, missingTable: tblMatch ? tblMatch[1] : null };
}

function ErrorPanel({ error, errorLine, errorCol, sql, schema }: {
  error:     string;
  errorLine: number | null;
  errorCol:  number | null;
  sql:       string;
  schema:    any[];
}) {
  const { kind, body, hint, missingTable } = parseError(error);
  const [aiText,    setAiText]    = React.useState('');
  const [aiLoading, setAiLoading] = React.useState(false);
  const [aiDone,    setAiDone]    = React.useState(false);

  const sqlLines  = sql.split('\n');
  const badLine   = errorLine != null ? sqlLines[errorLine - 1] : null;
  const colOffset = errorCol  != null ? errorCol - 1 : null;
  const lines     = body.split('\n');

  const explainWithAI = async () => {
    setAiText('');
    setAiDone(false);
    setAiLoading(true);
    try {
      const resp = await fetch('/api/ai/explain', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ error, sql, schema }),
      });
      const reader = resp.body!.getReader();
      const dec    = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n');
        buf = parts.pop() ?? '';
        for (const part of parts) {
          if (!part.startsWith('data: ')) continue;
          const payload = part.slice(6);
          if (payload === '[DONE]') { setAiDone(true); break; }
          try { const { text } = JSON.parse(payload); if (text) setAiText(prev => prev + text); } catch {}
        }
      }
    } catch (e: any) {
      setAiText(`Failed to reach AI: ${e.message}`);
    } finally {
      setAiLoading(false);
      setAiDone(true);
    }
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 10, overflow: 'auto', padding: 20, background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ padding: '3px 10px', background: 'rgba(248,81,73,0.12)', border: '1px solid rgba(248,81,73,0.35)', borderRadius: 4, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: '#f85149', fontFamily: 'var(--mono)', textTransform: 'uppercase' }}>{kind}</div>
        {errorLine != null && (
          <span style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
            line {errorLine}{errorCol != null ? `, col ${errorCol}` : ''}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {!aiLoading && !aiDone && (
          <button onClick={explainWithAI} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 14px', background: 'linear-gradient(135deg,#6e40c9 0%,#58a6ff 100%)', border: 'none', borderRadius: 5, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            ✦ Explain with AI
          </button>
        )}
        {aiLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#79c0ff' }}>
            <AiSpinner /> Analyzing...
          </div>
        )}
        {aiDone && !aiLoading && (
          <button onClick={explainWithAI} style={{ background: 'transparent', border: '1px solid rgba(110,64,201,0.4)', borderRadius: 4, color: '#a371f7', fontSize: 11, padding: '3px 10px', cursor: 'pointer' }}>
            Retry AI
          </button>
        )}
      </div>

      {badLine != null && (
        <div style={{ background: '#1a1a1a', border: '1px solid rgba(248,81,73,0.25)', borderRadius: 6, overflow: 'hidden', fontFamily: 'var(--mono)', fontSize: 13 }}>
          <div style={{ padding: '4px 12px', background: 'rgba(248,81,73,0.08)', fontSize: 10, color: '#f85149', letterSpacing: '0.08em' }}>LINE {errorLine}</div>
          <div style={{ padding: '10px 12px', color: '#e6edf3', whiteSpace: 'pre', overflowX: 'auto' }}>{badLine}</div>
          {colOffset != null && colOffset >= 0 && (
            <div style={{ padding: '0 12px 10px', color: '#f85149', whiteSpace: 'pre', fontFamily: 'var(--mono)', fontSize: 13 }}>{' '.repeat(colOffset)}^</div>
          )}
        </div>
      )}

      {missingTable && (
        <div style={{ padding: '10px 14px', background: 'rgba(210,153,34,0.08)', border: '1px solid rgba(210,153,34,0.25)', borderRadius: 6, fontSize: 12, color: '#d29922', lineHeight: 1.6 }}>
          <strong>Table not found: <code style={{ fontFamily: 'var(--mono)' }}>{missingTable}</code></strong><br />
          Create it with <code style={{ fontFamily: 'var(--mono)' }}>CREATE TABLE {missingTable} AS ...</code>, upload a CSV via the Files tab, or use the Data Generator.
        </div>
      )}

      <div style={{ background: '#0d1117', border: '1px solid var(--border)', borderRadius: 6, padding: '12px 14px', fontFamily: 'var(--mono)', fontSize: 12, lineHeight: 1.7, color: 'var(--text2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowX: 'auto' }}>
        {lines.map((ln, i) => {
          const isMain    = i === 0;
          const isHint    = /^\s*(Did you mean|HINT|Candidate)/i.test(ln);
          const isLocator = /^\s*LINE\s+\d+/i.test(ln);
          const color     = isMain ? '#f85149' : isHint ? '#79c0ff' : isLocator ? '#d29922' : 'var(--text2)';
          return <div key={i} style={{ color }}>{ln || ' '}</div>;
        })}
      </div>

      {hint && (
        <div style={{ padding: '8px 14px', background: 'rgba(88,166,255,0.07)', border: '1px solid rgba(88,166,255,0.2)', borderRadius: 6, fontSize: 12, color: '#79c0ff', fontFamily: 'var(--mono)', lineHeight: 1.6 }}>
          {hint}
        </div>
      )}

      {(aiText || aiLoading) && (
        <div style={{ background: 'linear-gradient(135deg,rgba(110,64,201,0.06) 0%,rgba(88,166,255,0.06) 100%)', border: '1px solid rgba(110,64,201,0.3)', borderRadius: 8, padding: '14px 16px', fontSize: 13, lineHeight: 1.75, color: 'var(--text)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#a371f7', marginBottom: 10, textTransform: 'uppercase' }}>AI Analysis</div>
          <AiMarkdown text={aiText} done={aiDone} />
        </div>
      )}
    </div>
  );
}

// ── Small components ──────────────────────────────────────────────────────────

function AiMarkdown({ text, done }: { text: string; done: boolean }) {
  const segments = text.split(/(```[\s\S]*?```|`[^`]+`|\*\*[^*]+\*\*)/g);
  return (
    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {segments.map((seg, i) => {
        if (seg.startsWith('```') && seg.endsWith('```')) {
          const code = seg.slice(3, -3).replace(/^\w*\n/, '');
          return <pre key={i} style={{ background: '#0d1117', border: '1px solid rgba(110,64,201,0.25)', borderRadius: 5, padding: '10px 12px', fontFamily: 'var(--mono)', fontSize: 12, overflowX: 'auto', margin: '8px 0', color: '#e6edf3' }}>{code}</pre>;
        }
        if (seg.startsWith('`') && seg.endsWith('`')) {
          return <code key={i} style={{ background: 'rgba(110,64,201,0.15)', borderRadius: 3, padding: '1px 5px', fontFamily: 'var(--mono)', fontSize: 12, color: '#a371f7' }}>{seg.slice(1, -1)}</code>;
        }
        if (seg.startsWith('**') && seg.endsWith('**')) {
          return <strong key={i} style={{ color: 'var(--text)', fontWeight: 600 }}>{seg.slice(2, -2)}</strong>;
        }
        return <span key={i}>{seg}</span>;
      })}
      {!done && <span style={{ display: 'inline-block', width: 8, height: 14, background: '#a371f7', marginLeft: 2, verticalAlign: 'middle', animation: 'blink 1s step-end infinite' }} />}
      <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}`}</style>
    </div>
  );
}

function AiSpinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ animation: 'spin 0.8s linear infinite' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <circle cx="7" cy="7" r="5.5" stroke="#79c0ff" strokeWidth="1.5" strokeDasharray="20 15" />
    </svg>
  );
}

function LensLogo() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="10" cy="10" r="7" stroke="#58a6ff" strokeWidth="2" />
      <line x1="15.5" y1="15.5" x2="21" y2="21" stroke="#58a6ff" strokeWidth="2" strokeLinecap="round" />
      <circle cx="10" cy="10" r="3" fill="#58a6ff" opacity="0.3" />
    </svg>
  );
}

function RunIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
      <polygon points="2,1 11,6 2,11" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
      <rect x="2" y="2" width="8" height="8" rx="1" />
    </svg>
  );
}

function ProgressDots() {
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--blue)', animation: `bounce 0.9s ${i * 0.2}s infinite` }} />
      ))}
      <style>{`@keyframes bounce{0%,80%,100%{transform:scale(0.6);opacity:0.4}40%{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}
