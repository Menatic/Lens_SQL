import React, { useEffect, useState, useRef } from 'react';
import type { UploadedTable } from './Sidebar';

interface Template {
  id:           string;
  label:        string;
  icon:         string;
  description:  string;
  table:        string;
  default_rows: number;
  max_rows:     number;
  columns:      string[];
}

interface PreviewRow { [col: string]: unknown }

interface Props {
  onLoad: (t: UploadedTable) => void;
  onClose: () => void;
}

const ROW_PRESETS = [
  { label: '1K',    value: 1_000 },
  { label: '10K',   value: 10_000 },
  { label: '100K',  value: 100_000 },
  { label: '500K',  value: 500_000 },
  { label: '1M',    value: 1_000_000 },
];

function fmtN(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1) + 'K';
  return n.toString();
}

export default function DataGen({ onLoad, onClose }: Props) {
  const [templates,   setTemplates]  = useState<Template[]>([]);
  const [selected,    setSelected]   = useState<Template | null>(null);
  const [rows,        setRows]       = useState(10_000);
  const [customSql,   setCustomSql]  = useState('');
  const [tableName,   setTableName]  = useState('');
  const [tab,         setTab]        = useState<'templates' | 'custom'>('templates');
  const [preview,     setPreview]    = useState<PreviewRow[] | null>(null);
  const [previewCols, setPreviewCols]= useState<string[]>([]);
  const [generating,  setGenerating] = useState(false);
  const [previewing,  setPreviewing] = useState(false);
  const [error,       setError]      = useState<string | null>(null);
  const [genRows,     setGenRows]    = useState<number | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/datagen/templates')
      .then(r => r.json())
      .then((ts: Template[]) => {
        setTemplates(ts);
        const first = ts[0];
        if (first) { setSelected(first); setRows(first.default_rows); setTableName(first.table); }
      })
      .catch(() => setError('Failed to load templates'));
  }, []);

  const pickTemplate = (t: Template) => {
    setSelected(t);
    setRows(t.default_rows);
    setTableName(t.table);
    setPreview(null);
    setError(null);
    setGenRows(null);
  };

  const callGenerate = async (previewOnly: boolean) => {
    if (tab === 'templates' && !selected) return;
    if (tab === 'custom' && !customSql.trim()) { setError('Enter a SQL query'); return; }

    previewOnly ? setPreviewing(true) : setGenerating(true);
    setError(null);

    try {
      const body = tab === 'custom'
        ? { template_id: 'custom', rows: previewOnly ? 8 : rows, custom_sql: customSql.trim() }
        : { template_id: selected!.id, rows: previewOnly ? 8 : rows };

      const r = await fetch('/api/datagen/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const data = await r.json();
      if (data.error) throw new Error(data.error);

      if (previewOnly) {
        setPreview(data.preview);
        setPreviewCols(data.columns);
      } else {
        setPreview(data.preview);
        setPreviewCols(data.columns);
        setGenRows(data.rows);
        const name = tableName.trim() || data.table_name;
        onLoad({ tableName: name, path: data.path, filename: `${name}.csv`, rows: data.rows });
      }
    } catch (e: any) {
      setError(e.message ?? 'Generation failed');
    } finally {
      previewOnly ? setPreviewing(false) : setGenerating(false);
    }
  };

  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  };

  const maxRows = tab === 'custom' ? 10_000_000 : (selected?.max_rows ?? 1_000_000);

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdrop}
      style={{
        position:  'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.7)',
        display:   'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div style={{
        width:         900,
        maxWidth:      '96vw',
        maxHeight:     '88vh',
        background:    '#0d1117',
        border:        '1px solid #21262d',
        borderRadius:  12,
        display:       'flex',
        flexDirection: 'column',
        overflow:      'hidden',
        boxShadow:     '0 24px 80px rgba(0,0,0,0.6)',
      }}>

        {/* Header */}
        <div style={{
          display:      'flex', alignItems: 'center', gap: 12,
          padding:      '16px 20px',
          borderBottom: '1px solid #21262d',
          flexShrink:   0,
        }}>
          <span style={{ fontSize: 20 }}>⚡</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#e6edf3' }}>Data Generator</div>
            <div style={{ fontSize: 11, color: '#8b949e' }}>
              Generate millions of rows of realistic synthetic data instantly with DuckDB
            </div>
          </div>
          <button onClick={onClose} style={{
            marginLeft: 'auto', background: 'transparent', border: 'none',
            color: '#8b949e', cursor: 'pointer', fontSize: 18, lineHeight: 1,
          }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #21262d', flexShrink: 0 }}>
          {(['templates', 'custom'] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setPreview(null); setError(null); }} style={{
              padding:      '10px 20px',
              background:   'transparent', border: 'none',
              borderBottom: tab === t ? '2px solid #58a6ff' : '2px solid transparent',
              color:        tab === t ? '#e6edf3' : '#8b949e',
              cursor:       'pointer', fontSize: 12, fontWeight: tab === t ? 600 : 400,
              letterSpacing: '0.04em',
            }}>
              {t === 'templates' ? '📦 Templates' : '✏️ Custom SQL'}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'auto', display: 'flex', minHeight: 0 }}>

          {tab === 'templates' ? (
            <div style={{ display: 'flex', width: '100%', minHeight: 0 }}>

              {/* Template list */}
              <div style={{
                width: 220, flexShrink: 0,
                borderRight: '1px solid #21262d',
                overflowY: 'auto',
                padding: '8px 0',
              }}>
                {templates.filter(t => t.id !== 'custom').map(t => (
                  <button key={t.id} onClick={() => pickTemplate(t)} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    width: '100%', padding: '10px 14px', border: 'none', cursor: 'pointer',
                    background: selected?.id === t.id ? 'rgba(88,166,255,0.08)' : 'transparent',
                    borderLeft: selected?.id === t.id ? '2px solid #58a6ff' : '2px solid transparent',
                    textAlign: 'left',
                  }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{t.icon}</span>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#e6edf3', marginBottom: 2 }}>
                        {t.label}
                      </div>
                      <div style={{ fontSize: 10, color: '#8b949e', lineHeight: 1.4 }}>
                        {t.columns.slice(0, 4).join(', ')}{t.columns.length > 4 ? '…' : ''}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Right panel */}
              <div style={{ flex: 1, padding: '20px 24px', overflowY: 'auto', minWidth: 0 }}>
                {selected && (
                  <>
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <span style={{ fontSize: 24 }}>{selected.icon}</span>
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: '#e6edf3' }}>{selected.label}</div>
                          <div style={{ fontSize: 12, color: '#8b949e' }}>{selected.description}</div>
                        </div>
                      </div>

                      {/* Column chips */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
                        {selected.columns.map(c => (
                          <span key={c} style={{
                            fontSize: 10, fontFamily: 'var(--mono)',
                            color: '#58a6ff', background: 'rgba(88,166,255,0.1)',
                            border: '1px solid rgba(88,166,255,0.2)',
                            padding: '2px 7px', borderRadius: 4,
                          }}>{c}</span>
                        ))}
                      </div>
                    </div>

                    {/* Config */}
                    <div style={{ display: 'flex', gap: 20, marginBottom: 16, alignItems: 'flex-end' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 6, fontWeight: 600 }}>
                          ROWS TO GENERATE
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                          {ROW_PRESETS.filter(p => p.value <= maxRows).map(p => (
                            <button key={p.value} onClick={() => setRows(p.value)} style={{
                              padding: '4px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12,
                              fontFamily: 'var(--mono)', fontWeight: rows === p.value ? 700 : 400,
                              background: rows === p.value ? '#58a6ff' : 'transparent',
                              color:      rows === p.value ? '#fff' : '#8b949e',
                              border:     rows === p.value ? '1px solid #58a6ff' : '1px solid #30363d',
                            }}>{p.label}</button>
                          ))}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <input
                            type="range" min={100} max={maxRows} step={100}
                            value={rows}
                            onChange={e => setRows(Number(e.target.value))}
                            style={{ flex: 1, accentColor: '#58a6ff' }}
                          />
                          <input
                            type="number" min={1} max={maxRows}
                            value={rows}
                            onChange={e => setRows(Math.min(maxRows, Math.max(1, Number(e.target.value))))}
                            style={{
                              width: 90, padding: '4px 8px', background: '#161b22',
                              border: '1px solid #30363d', borderRadius: 4, color: '#e6edf3',
                              fontFamily: 'var(--mono)', fontSize: 12,
                            }}
                          />
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 6, fontWeight: 600 }}>
                          TABLE NAME
                        </div>
                        <input
                          value={tableName}
                          onChange={e => setTableName(e.target.value.replace(/[^a-z0-9_]/gi, '_').toLowerCase())}
                          style={{
                            padding: '7px 10px', background: '#161b22',
                            border: '1px solid #30363d', borderRadius: 4,
                            color: '#e6edf3', fontFamily: 'var(--mono)', fontSize: 12, width: 140,
                            outline: 'none',
                          }}
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Preview table */}
                {preview && previewCols.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 8, fontWeight: 600, letterSpacing: '0.06em' }}>
                      PREVIEW (first {preview.length} rows)
                    </div>
                    <div style={{ overflow: 'auto', border: '1px solid #21262d', borderRadius: 6, maxHeight: 200 }}>
                      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11, fontFamily: 'var(--mono)' }}>
                        <thead>
                          <tr>
                            {previewCols.map(c => (
                              <th key={c} style={{
                                padding: '6px 10px', textAlign: 'left',
                                background: '#161b22', color: '#58a6ff',
                                borderBottom: '1px solid #21262d', whiteSpace: 'nowrap',
                                position: 'sticky', top: 0,
                              }}>{c}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {preview.map((row, ri) => (
                            <tr key={ri}>
                              {previewCols.map(c => (
                                <td key={c} style={{
                                  padding: '5px 10px', color: '#8b949e',
                                  borderBottom: '1px solid #21262d', whiteSpace: 'nowrap',
                                  maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis',
                                }}>
                                  {row[c] === null ? <span style={{ color: '#484f58' }}>NULL</span> : String(row[c])}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Success message */}
                {genRows !== null && (
                  <div style={{
                    padding: '10px 14px', background: 'rgba(63,185,80,0.08)',
                    border: '1px solid rgba(63,185,80,0.2)', borderRadius: 6, marginBottom: 14,
                    fontSize: 12, color: '#3fb950', fontWeight: 600,
                  }}>
                    ✓ Generated {fmtN(genRows)} rows → table <span style={{ fontFamily: 'var(--mono)' }}>{tableName || selected?.table}</span> is ready to query
                  </div>
                )}

                {error && (
                  <div style={{
                    padding: '10px 14px', background: 'rgba(248,81,73,0.08)',
                    border: '1px solid rgba(248,81,73,0.2)', borderRadius: 6, marginBottom: 14,
                    fontSize: 12, color: '#f85149',
                  }}>{error}</div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => callGenerate(true)}
                    disabled={previewing || generating}
                    style={{
                      padding: '8px 18px', background: 'transparent',
                      border: '1px solid #30363d', borderRadius: 6, color: '#8b949e',
                      cursor: 'pointer', fontSize: 13, fontWeight: 600,
                      opacity: previewing ? 0.6 : 1,
                    }}
                  >
                    {previewing ? 'Loading…' : '👁 Preview'}
                  </button>
                  <button
                    onClick={() => callGenerate(false)}
                    disabled={generating || previewing}
                    style={{
                      padding: '8px 24px',
                      background: generating ? '#21262d' : 'linear-gradient(135deg, #58a6ff, #bc8cff)',
                      border: 'none', borderRadius: 6, color: '#fff',
                      cursor: generating ? 'wait' : 'pointer', fontSize: 13, fontWeight: 700,
                      opacity: generating ? 0.7 : 1, transition: 'opacity 0.15s',
                    }}
                  >
                    {generating ? `Generating ${fmtN(rows)} rows…` : `⚡ Generate ${fmtN(rows)} rows`}
                  </button>
                  {genRows !== null && (
                    <button onClick={onClose} style={{
                      padding: '8px 18px', background: '#3fb950',
                      border: 'none', borderRadius: 6, color: '#fff',
                      cursor: 'pointer', fontSize: 13, fontWeight: 700,
                    }}>
                      Query it →
                    </button>
                  )}
                </div>
              </div>
            </div>

          ) : (
            /* ── Custom SQL tab ── */
            <div style={{ flex: 1, padding: '20px 24px', overflowY: 'auto' }}>
              <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 12, lineHeight: 1.6 }}>
                Write any DuckDB SQL using <code style={{ color: '#58a6ff', background: 'rgba(88,166,255,0.1)', padding: '1px 5px', borderRadius: 3 }}>generate_series</code>,{' '}
                <code style={{ color: '#58a6ff', background: 'rgba(88,166,255,0.1)', padding: '1px 5px', borderRadius: 3 }}>random()</code>,{' '}
                <code style={{ color: '#58a6ff', background: 'rgba(88,166,255,0.1)', padding: '1px 5px', borderRadius: 3 }}>hash()</code>, arrays, CASE expressions, or anything DuckDB supports.
                The result becomes a queryable table.
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 6, fontWeight: 600 }}>CUSTOM SQL</div>
                <textarea
                  value={customSql}
                  onChange={e => setCustomSql(e.target.value)}
                  placeholder={`SELECT
    i                            AS id,
    'user_' || i                 AS username,
    round(random() * 10000, 2)   AS balance,
    (DATE '2020-01-01' + INTERVAL (random() * 1460) DAY)::DATE AS created_at
FROM generate_series(1, 5000) t(i)`}
                  rows={10}
                  style={{
                    width: '100%', padding: '12px', background: '#161b22',
                    border: '1px solid #30363d', borderRadius: 6,
                    color: '#e6edf3', fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
                    resize: 'vertical', outline: 'none', lineHeight: 1.6, boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: '#8b949e', fontWeight: 600 }}>TABLE NAME</div>
                <input
                  value={tableName}
                  onChange={e => setTableName(e.target.value.replace(/[^a-z0-9_]/gi, '_').toLowerCase())}
                  placeholder="custom_data"
                  style={{
                    padding: '6px 10px', background: '#161b22',
                    border: '1px solid #30363d', borderRadius: 4,
                    color: '#e6edf3', fontFamily: 'var(--mono)', fontSize: 12, width: 180, outline: 'none',
                  }}
                />
              </div>

              {/* Quick examples */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 8, fontWeight: 600 }}>QUICK EXAMPLES</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Time series',   sql: "SELECT\n    i AS step,\n    DATE '2024-01-01' + INTERVAL i DAY AS date,\n    round(100 + sin(i * 0.1) * 20 + random() * 10, 2) AS value,\n    round(50 + cos(i * 0.07) * 15 + random() * 5, 2) AS baseline\nFROM generate_series(1, 365) t(i)" },
                    { label: 'Fibonacci',     sql: "WITH RECURSIVE fib(n, a, b) AS (\n    SELECT 1, 0, 1\n    UNION ALL\n    SELECT n+1, b, a+b FROM fib WHERE n < 50\n)\nSELECT n AS position, a AS fibonacci FROM fib" },
                    { label: 'Random walk',   sql: "SELECT\n    i AS step,\n    round(sum(random() * 2 - 1) OVER (ORDER BY i ROWS UNBOUNDED PRECEDING), 4) AS price\nFROM generate_series(1, 1000) t(i)" },
                    { label: 'IP addresses',  sql: "SELECT\n    i AS id,\n    (10 + (random()*245)::INT)::TEXT || '.' ||\n    (random()*255)::INT::TEXT || '.' ||\n    (random()*255)::INT::TEXT || '.' ||\n    (random()*255)::INT::TEXT AS ip_address,\n    (1024 + (random()*64511)::INT) AS port\nFROM generate_series(1, 5000) t(i)" },
                  ].map(ex => (
                    <button key={ex.label} onClick={() => { setCustomSql(ex.sql); setTableName(ex.label.toLowerCase().replace(/\s+/g, '_')); }} style={{
                      padding: '4px 12px', fontSize: 11, cursor: 'pointer',
                      background: 'rgba(88,166,255,0.08)', border: '1px solid rgba(88,166,255,0.2)',
                      color: '#58a6ff', borderRadius: 4,
                    }}>{ex.label}</button>
                  ))}
                </div>
              </div>

              {preview && previewCols.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 8, fontWeight: 600 }}>PREVIEW</div>
                  <div style={{ overflow: 'auto', border: '1px solid #21262d', borderRadius: 6, maxHeight: 180 }}>
                    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11, fontFamily: 'var(--mono)' }}>
                      <thead>
                        <tr>
                          {previewCols.map(c => (
                            <th key={c} style={{ padding: '6px 10px', textAlign: 'left', background: '#161b22', color: '#58a6ff', borderBottom: '1px solid #21262d', whiteSpace: 'nowrap', position: 'sticky', top: 0 }}>{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map((row, ri) => (
                          <tr key={ri}>
                            {previewCols.map(c => (
                              <td key={c} style={{ padding: '5px 10px', color: '#8b949e', borderBottom: '1px solid #21262d', whiteSpace: 'nowrap' }}>
                                {row[c] === null ? <span style={{ color: '#484f58' }}>NULL</span> : String(row[c])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {genRows !== null && (
                <div style={{ padding: '10px 14px', background: 'rgba(63,185,80,0.08)', border: '1px solid rgba(63,185,80,0.2)', borderRadius: 6, marginBottom: 14, fontSize: 12, color: '#3fb950', fontWeight: 600 }}>
                  ✓ Generated {fmtN(genRows)} rows → table <span style={{ fontFamily: 'var(--mono)' }}>{tableName || 'custom_data'}</span> is ready
                </div>
              )}

              {error && (
                <div style={{ padding: '10px 14px', background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.2)', borderRadius: 6, marginBottom: 14, fontSize: 12, color: '#f85149' }}>{error}</div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => callGenerate(true)} disabled={previewing || generating} style={{ padding: '8px 18px', background: 'transparent', border: '1px solid #30363d', borderRadius: 6, color: '#8b949e', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  {previewing ? 'Running…' : '👁 Preview'}
                </button>
                <button onClick={() => callGenerate(false)} disabled={generating || previewing} style={{ padding: '8px 24px', background: 'linear-gradient(135deg, #58a6ff, #bc8cff)', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                  {generating ? 'Generating…' : '⚡ Generate & Load'}
                </button>
                {genRows !== null && (
                  <button onClick={onClose} style={{ padding: '8px 18px', background: '#3fb950', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                    Query it →
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
