import React from 'react';
import type { ExecStatus } from '../types';

interface Props {
  status:    ExecStatus;
  rowsDone:  number;
  totalRows: number;
  elapsedMs: number;
  error:     string | null;
}

const STATUS_COLOR: Record<ExecStatus, string> = {
  idle:     '#384470',
  planning: '#FBBF24',
  running:  '#5B9FFF',
  done:     '#34D399',
  error:    '#F87171',
};

const STATUS_LABEL: Record<ExecStatus, string> = {
  idle:     'IDLE',
  planning: 'PLANNING',
  running:  'EXECUTING',
  done:     'DONE',
  error:    'ERROR',
};

export default function StatsBar({ status, rowsDone, totalRows, elapsedMs, error }: Props) {
  const color = STATUS_COLOR[status];

  return (
    <div style={{
      display:      'flex',
      alignItems:   'center',
      gap:          16,
      padding:      '0 16px',
      height:       '100%',
      borderTop:    '1px solid var(--border)',
      background:   'rgba(4,6,14,0.9)',
      backdropFilter: 'blur(8px)',
      flexShrink:   0,
    }}>
      {/* Status pill */}
      <div style={{
        display:      'flex',
        alignItems:   'center',
        gap:          6,
        padding:      '2px 9px',
        background:   `rgba(${hexRgb(color)}, 0.07)`,
        border:       `1px solid rgba(${hexRgb(color)}, 0.22)`,
        borderRadius: 100,
      }}>
        <div style={{
          width:        5,
          height:       5,
          borderRadius: '50%',
          background:   color,
          boxShadow:    status === 'done' || status === 'running' ? `0 0 5px ${color}` : 'none',
          animation:    status === 'running' ? 'pulse 1s infinite' : 'none',
        }} />
        <span style={{
          fontSize:      9,
          fontWeight:    700,
          fontFamily:    'var(--mono)',
          letterSpacing: '0.1em',
          color,
        }}>
          {STATUS_LABEL[status]}
        </span>
      </div>

      {error && (
        <span
          title={error}
          style={{
            fontSize:     11.5,
            color:        '#F87171',
            fontFamily:   'var(--mono)',
            overflow:     'hidden',
            textOverflow: 'ellipsis',
            whiteSpace:   'nowrap',
            maxWidth:     '60vw',
          }}
        >
          {error.split('\n')[0]}
        </span>
      )}

      {status !== 'idle' && !error && (
        <>
          {rowsDone > 0 && <StatCell label="ROWS"      value={rowsDone.toLocaleString()} />}
          {totalRows > 0 && <StatCell label="RETURNED"  value={totalRows.toLocaleString()} />}
          {elapsedMs > 0 && <StatCell label="TIME"      value={`${elapsedMs.toFixed(1)} ms`} />}
        </>
      )}

      <span style={{ flex: 1 }} />
      <span style={{ fontSize: 10.5, color: 'var(--text3)', fontFamily: 'var(--mono)', letterSpacing: '0.04em' }}>
        Lens · DuckDB
      </span>

      <style>{`
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.25; } }
      `}</style>
    </div>
  );
}

function hexRgb(hex: string): string {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `${r},${g},${b}`;
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
      <span style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', letterSpacing: '0.1em', fontWeight: 700 }}>
        {label}
      </span>
      <span style={{ fontSize: 12, color: 'var(--text)', fontFamily: 'var(--mono)', fontWeight: 500 }}>
        {value}
      </span>
    </div>
  );
}
