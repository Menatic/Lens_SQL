import React, { useMemo, useState } from 'react';
import DataProfile from './DataProfile';

interface Props {
  columns: string[];
  rows:    unknown[][];
  total:   number;
}

const MAX_DISPLAY = 500;

function downloadCsv(columns: string[], rows: unknown[][]) {
  const escape = (v: unknown): string => {
    if (v == null) return '';
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const csv  = [columns.join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'lens_results.csv';
  a.click();
  URL.revokeObjectURL(url);
}

type View = 'table' | 'profile';

export default function ResultsTable({ columns, rows, total }: Props) {
  const displayRows   = useMemo(() => rows.slice(0, MAX_DISPLAY), [rows]);
  const [view, setView] = useState<View>('table');

  if (columns.length === 0) return null;

  const btnStyle = (v: View): React.CSSProperties => ({
    padding:      '3px 10px',
    background:   view === v ? 'rgba(88,166,255,0.12)' : 'transparent',
    border:       view === v ? '1px solid rgba(88,166,255,0.3)' : '1px solid transparent',
    borderRadius: 4,
    color:        view === v ? '#58a6ff' : 'var(--text2)',
    cursor:       'pointer',
    fontSize:     10,
    fontWeight:   view === v ? 600 : 400,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{
        padding:      '4px 8px',
        borderBottom: '1px solid var(--border)',
        display:      'flex',
        alignItems:   'center',
        gap:          4,
        flexShrink:   0,
        background:   'var(--surface)',
      }}>
        <button style={btnStyle('table')}   onClick={() => setView('table')}>
          Table ({total.toLocaleString()})
        </button>
        <button style={btnStyle('profile')} onClick={() => setView('profile')}>
          Profile
        </button>

        <span style={{ flex: 1 }} />

        <button
          onClick={() => downloadCsv(columns, rows)}
          title="Download all rows as CSV"
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:          4,
            padding:      '3px 10px',
            background:   'transparent',
            border:       '1px solid var(--border)',
            borderRadius: 4,
            color:        'var(--text2)',
            cursor:       'pointer',
            fontSize:     10,
            fontWeight:   500,
            transition:   'color 0.12s, border-color 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--blue)'; e.currentTarget.style.borderColor = 'var(--blue)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text2)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
        >
          ↓ CSV
        </button>
      </div>

      {/* Truncation warning */}
      {view === 'table' && total > MAX_DISPLAY && (
        <div style={{
          padding:      '5px 12px',
          background:   'rgba(210,153,34,0.07)',
          borderBottom: '1px solid rgba(210,153,34,0.2)',
          fontSize:     11,
          color:        '#d29922',
          flexShrink:   0,
          display:      'flex',
          alignItems:   'center',
          gap:          6,
        }}>
          <span>⚠</span>
          <span>
            Showing {MAX_DISPLAY.toLocaleString()} of {total.toLocaleString()} rows.
            Use <strong>↓ CSV</strong> to download the full dataset.
          </span>
        </div>
      )}

      {/* Content */}
      {view === 'profile' ? (
        <DataProfile columns={columns} rows={rows} total={total} />
      ) : (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'var(--mono)' }}>
            <thead>
              <tr>
                {columns.map(col => (
                  <th key={col} style={{
                    position:     'sticky',
                    top:          0,
                    background:   'var(--surface)',
                    padding:      '6px 12px',
                    textAlign:    'left',
                    fontWeight:   500,
                    color:        'var(--text2)',
                    fontSize:     11,
                    letterSpacing: '0.04em',
                    borderBottom: '1px solid var(--border)',
                    whiteSpace:   'nowrap',
                  }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, ri) => (
                <tr
                  key={ri}
                  style={{ borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {(row as unknown[]).map((cell, ci) => (
                    <td key={ci} style={{ padding: '5px 12px', color: cell == null ? 'var(--text3)' : 'var(--text)', whiteSpace: 'nowrap' }}>
                      {cell == null ? 'NULL' : formatCell(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatCell(v: unknown): string {
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return v.toLocaleString();
    return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  return String(v);
}
