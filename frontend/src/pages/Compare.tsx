import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { useExecution } from '../hooks/useExecution';
import PlanTree from '../components/PlanTree';
import ResultsTable from '../components/ResultsTable';
import type { ExecState } from '../types';

// ── Per-panel component ───────────────────────────────────────────────────────

interface PanelProps {
  label:  string;
  state:  ExecState;
  run:    (sql: string) => void;
  cancel: () => void;
}

function ComparePanel({ label, state, run, cancel }: PanelProps) {
  const editorRef                     = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const [view, setView]               = useState<'plan' | 'results'>('plan');
  const isRunning                     = state.status === 'planning' || state.status === 'running';

  useEffect(() => {
    if (state.status === 'done')                                            setView('results');
    if (state.status === 'planning' || state.status === 'running')          setView('plan');
  }, [state.status]);

  const handleRun = useCallback(() => {
    const q = editorRef.current?.getValue() ?? '';
    if (q.trim()) run(q.trim());
  }, [run]);

  const timeLabel = (ms: number) =>
    ms < 1 ? `${ms.toFixed(2)}ms` : ms < 1000 ? `${ms.toFixed(1)}ms` : `${(ms / 1000).toFixed(2)}s`;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
      {/* Panel header */}
      <div style={{
        display:      'flex',
        alignItems:   'center',
        gap:          8,
        padding:      '6px 12px',
        background:   'var(--surface)',
        borderBottom: '1px solid var(--border)',
        flexShrink:   0,
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text2)', textTransform: 'uppercase' }}>
          {label}
        </span>
        {state.elapsedMs > 0 && (
          <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: '#3fb950' }}>
            {timeLabel(state.elapsedMs)}
          </span>
        )}
        {state.totalRows > 0 && (
          <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
            · {state.totalRows.toLocaleString()} rows
          </span>
        )}
        <button
          onClick={isRunning ? cancel : handleRun}
          style={{
            marginLeft:   'auto',
            padding:      '4px 12px',
            background:   isRunning ? 'transparent' : 'var(--green)',
            color:        isRunning ? 'var(--red)' : '#fff',
            border:       isRunning ? '1px solid var(--red)' : 'none',
            borderRadius: 4,
            cursor:       'pointer',
            fontSize:     11,
            fontWeight:   600,
          }}
        >
          {isRunning ? '■ Cancel' : '▶ Run'}
        </button>
      </div>

      {/* SQL Editor */}
      <div style={{ height: '32%', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <Editor
          defaultLanguage="sql"
          defaultValue={`-- ${label}: paste your query here\nSELECT * FROM movies LIMIT 100`}
          onMount={ed => {
            editorRef.current = ed;
            ed.addCommand(2048 | 3, handleRun); // Cmd+Enter
          }}
          theme="vs-dark"
          options={{
            fontSize:             12,
            minimap:              { enabled: false },
            lineNumbers:          'on',
            scrollBeyondLastLine: false,
            padding:              { top: 8 },
            scrollbar:            { verticalScrollbarSize: 4, horizontalScrollbarSize: 4 },
            wordWrap:             'on',
          }}
        />
      </div>

      {/* View tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
        {(['plan', 'results'] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              padding:      '6px 14px',
              background:   'transparent',
              border:       'none',
              borderBottom: view === v ? '2px solid var(--blue)' : '2px solid transparent',
              color:        view === v ? 'var(--text)' : 'var(--text2)',
              cursor:       'pointer',
              fontSize:     10,
              fontWeight:   view === v ? 600 : 400,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            {v === 'results' && state.totalRows > 0
              ? `Results (${state.totalRows.toLocaleString()})`
              : v === 'results' ? 'Results' : 'Plan'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {state.status === 'error' ? (
          <div style={{
            padding:    16,
            color:      'var(--red)',
            fontFamily: 'var(--mono)',
            fontSize:   12,
            overflow:   'auto',
            lineHeight: 1.6,
          }}>
            {state.error}
          </div>
        ) : view === 'plan' ? (
          <PlanTree plan={state.plan} statsPlan={state.statsPlan} status={state.status} />
        ) : (
          <ResultsTable columns={state.columns} rows={state.rows} total={state.totalRows} />
        )}
      </div>
    </div>
  );
}

// ── Comparison bar ────────────────────────────────────────────────────────────

function CompareBar({ leftMs, rightMs }: { leftMs: number; rightMs: number }) {
  if (leftMs === 0 || rightMs === 0) return null;
  const faster = leftMs < rightMs ? 'A' : 'B';
  const ratio  = Math.max(leftMs, rightMs) / Math.min(leftMs, rightMs);
  const label  = ratio < 1.05
    ? 'About the same speed'
    : `Query ${faster} is ${ratio.toFixed(1)}× faster`;
  const color  = ratio < 1.05 ? 'var(--text3)' : '#3fb950';

  return (
    <span style={{ marginLeft: 'auto', fontSize: 11, color, fontFamily: 'var(--mono)', fontWeight: 600 }}>
      {label}
    </span>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Compare() {
  const left  = useExecution();
  const right = useExecution();

  return (
    <div style={{ display: 'grid', gridTemplateRows: '48px 1fr 36px', height: '100vh', overflow: 'hidden' }}>
      {/* Header */}
      <header style={{
        display:      'flex',
        alignItems:   'center',
        gap:          12,
        padding:      '0 16px',
        background:   'var(--surface)',
        borderBottom: '1px solid var(--border)',
        flexShrink:   0,
      }}>
        <Link
          to="/playground"
          style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text2)', fontSize: 12, textDecoration: 'none', fontWeight: 500 }}
        >
          ← Playground
        </Link>
        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Query Comparison</span>
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>
          — run two queries side by side to compare plans and performance
        </span>
      </header>

      {/* Two panels */}
      <div style={{ display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <ComparePanel
          label="Query A"
          state={left.state}
          run={left.run}
          cancel={left.cancel}
        />
        <div style={{ width: 1, background: 'var(--border)', flexShrink: 0 }} />
        <ComparePanel
          label="Query B"
          state={right.state}
          run={right.run}
          cancel={right.cancel}
        />
      </div>

      {/* Stats footer */}
      <div style={{
        display:      'flex',
        alignItems:   'center',
        gap:          20,
        padding:      '0 16px',
        background:   'var(--surface)',
        borderTop:    '1px solid var(--border)',
        fontSize:     11,
        fontFamily:   'var(--mono)',
      }}>
        <span style={{ color: 'var(--text2)' }}>
          A: {left.state.elapsedMs > 0
            ? `${left.state.elapsedMs.toFixed(1)}ms · ${left.state.totalRows.toLocaleString()} rows`
            : '—'}
        </span>
        <span style={{ color: 'var(--text3)' }}>vs</span>
        <span style={{ color: 'var(--text2)' }}>
          B: {right.state.elapsedMs > 0
            ? `${right.state.elapsedMs.toFixed(1)}ms · ${right.state.totalRows.toLocaleString()} rows`
            : '—'}
        </span>
        <CompareBar leftMs={left.state.elapsedMs} rightMs={right.state.elapsedMs} />
      </div>
    </div>
  );
}
