import React, { useRef, useState, useCallback } from 'react';
import type { TableInfo, SampleQuery } from '../types';

export interface UploadedTable {
  tableName: string;
  path:      string;
  filename:  string;
  rows?:     number;
}

export interface HistoryEntry {
  id:        string;
  sql:       string;
  totalRows: number;
  elapsedMs: number;
  status:    'done' | 'error';
  timestamp: number;
  error?:    string;
}

interface Props {
  tables:          TableInfo[];
  samples:         SampleQuery[];
  uploadedTables:  UploadedTable[];
  historyEntries:  HistoryEntry[];
  onSelectQuery:   (sql: string) => void;
  onInsertTable:   (name: string) => void;
  onUploadTable:   (t: UploadedTable) => void;
  onRemoveTable:   (tableName: string) => void;
  onOpenGenerator: () => void;
  onLoadHistory:   (sql: string) => void;
  onClearHistory:  () => void;
}

type Tab = 'schema' | 'files' | 'samples' | 'history';

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000)     return 'just now';
  if (diff < 3_600_000)  return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function Sidebar({
  tables, samples, uploadedTables, historyEntries,
  onSelectQuery, onInsertTable, onUploadTable, onRemoveTable,
  onOpenGenerator, onLoadHistory, onClearHistory,
}: Props) {
  const [tab,           setTab]           = useState<Tab>('schema');
  const [expandedTable, setExpandedTable] = useState<string | null>(null);
  const [dragging,      setDragging]      = useState(false);
  const [uploading,     setUploading]     = useState(false);
  const [pendingName,   setPendingName]   = useState('');
  const [pendingFile,   setPendingFile]   = useState<File | null>(null);
  const [uploadError,   setUploadError]   = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const nameFromFile = (f: File) =>
    f.name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_]/gi, '_').toLowerCase().slice(0, 32);

  const pickFile = (f: File) => {
    setPendingFile(f);
    setPendingName(nameFromFile(f));
    setUploadError(null);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) pickFile(f);
  }, []);

  const handleUpload = async () => {
    if (!pendingFile || !pendingName.trim()) return;
    const tableName = pendingName.trim().replace(/[^a-z0-9_]/gi, '_');
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append('file', pendingFile);
      const r    = await fetch('/api/upload', { method: 'POST', body: form });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      onUploadTable({ tableName, path: data.path, filename: pendingFile.name });
      setPendingFile(null);
      setPendingName('');
    } catch (e: any) {
      setUploadError(e.message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const tabStyle = (t: Tab): React.CSSProperties => ({
    flex:          1,
    padding:       '8px 4px',
    background:    tab === t ? 'var(--surface)' : 'transparent',
    border:        'none',
    borderBottom:  tab === t ? '2px solid var(--blue)' : '2px solid transparent',
    color:         tab === t ? 'var(--text)' : 'var(--text2)',
    cursor:        'pointer',
    fontSize:      9,
    fontWeight:    tab === t ? 600 : 400,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    whiteSpace:    'nowrap',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <button style={tabStyle('schema')}  onClick={() => setTab('schema')}>Tables</button>
        <button style={tabStyle('files')}   onClick={() => setTab('files')}>
          Files{uploadedTables.length > 0 && <span style={{ color: 'var(--blue)' }}> ({uploadedTables.length})</span>}
        </button>
        <button style={tabStyle('samples')} onClick={() => setTab('samples')}>Samples</button>
        <button style={tabStyle('history')} onClick={() => setTab('history')}>
          History{historyEntries.length > 0 && <span style={{ color: 'var(--text3)' }}> ({historyEntries.length})</span>}
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>

        {/* ── SCHEMA TAB ────────────────────────────────── */}
        {tab === 'schema' && (
          tables.length === 0 ? (
            <p style={{ color: 'var(--text3)', padding: '12px 16px', fontSize: 12 }}>
              Loading schema…
            </p>
          ) : (
            <>
              {tables.map(tbl => (
                <TableRow
                  key={tbl.table}
                  tbl={tbl}
                  expanded={expandedTable === tbl.table}
                  onToggle={() => setExpandedTable(expandedTable === tbl.table ? null : tbl.table)}
                  onInsert={() => onInsertTable(tbl.table)}
                  isUploaded={uploadedTables.some(u => u.tableName === tbl.table)}
                />
              ))}
              {uploadedTables.length > 0 && (
                <div style={{ padding: '8px 14px 2px', fontSize: 10, color: 'var(--text3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Uploaded
                </div>
              )}
            </>
          )
        )}

        {/* ── FILES TAB ─────────────────────────────────── */}
        {tab === 'files' && (
          <div style={{ padding: '12px 12px' }}>
            <button
              onClick={onOpenGenerator}
              style={{
                width:        '100%',
                padding:      '10px 12px',
                marginBottom: 12,
                background:   'linear-gradient(135deg, rgba(88,166,255,0.12), rgba(188,140,255,0.12))',
                border:       '1px solid rgba(88,166,255,0.3)',
                borderRadius: 8,
                color:        '#e6edf3',
                cursor:       'pointer',
                fontSize:     12,
                fontWeight:   700,
                display:      'flex',
                alignItems:   'center',
                gap:          8,
              }}
            >
              <span style={{ fontSize: 16 }}>⚡</span>
              Generate Data
              <span style={{ marginLeft: 'auto', fontSize: 10, color: '#8b949e' }}>8 templates</span>
            </button>

            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border:       `2px dashed ${dragging ? 'var(--blue)' : 'var(--border2)'}`,
                borderRadius: 8,
                padding:      '20px 12px',
                textAlign:    'center',
                cursor:       'pointer',
                background:   dragging ? 'rgba(88,166,255,0.05)' : 'transparent',
                transition:   'all 0.15s',
                marginBottom: 12,
              }}
            >
              <div style={{ fontSize: 22, marginBottom: 6 }}>📄</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>Drop a CSV here</div>
              <div style={{ fontSize: 11, color: 'var(--text2)' }}>or click to browse</div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.tsv,.txt"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) pickFile(f); e.target.value = ''; }}
              />
            </div>

            {pendingFile && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  📎 {pendingFile.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6 }}>Table name:</div>
                <input
                  value={pendingName}
                  onChange={e => setPendingName(e.target.value.replace(/[^a-z0-9_]/gi, '_').toLowerCase())}
                  placeholder="my_table"
                  style={{ width: '100%', padding: '6px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 12, marginBottom: 8, outline: 'none', boxSizing: 'border-box' }}
                />
                {uploadError && <div style={{ fontSize: 11, color: 'var(--red)', marginBottom: 6 }}>{uploadError}</div>}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={handleUpload}
                    disabled={uploading || !pendingName.trim()}
                    style={{ flex: 1, padding: '6px 0', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 4, cursor: uploading ? 'wait' : 'pointer', fontSize: 12, fontWeight: 600, opacity: uploading || !pendingName.trim() ? 0.6 : 1 }}
                  >
                    {uploading ? 'Uploading…' : 'Add Table'}
                  </button>
                  <button
                    onClick={() => { setPendingFile(null); setPendingName(''); setUploadError(null); }}
                    style={{ padding: '6px 10px', background: 'transparent', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            {uploadedTables.length === 0 && !pendingFile && (
              <p style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', marginTop: 8 }}>No files added yet.</p>
            )}
            {uploadedTables.map(u => (
              <div key={u.tableName} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)', fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>✓ {u.tableName}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.filename}</div>
                </div>
                <button onClick={() => onInsertTable(u.tableName)} title="Insert into editor" style={{ background: 'transparent', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}>↗</button>
                <button onClick={() => onRemoveTable(u.tableName)} title="Remove" style={{ background: 'transparent', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}>✕</button>
              </div>
            ))}
          </div>
        )}

        {/* ── SAMPLES TAB ───────────────────────────────── */}
        {tab === 'samples' && (
          samples.map((s, i) => (
            <button
              key={i}
              onClick={() => onSelectQuery(s.sql)}
              style={{ display: 'block', width: '100%', padding: '10px 14px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 3 }}>{s.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {s.sql.replace(/\s+/g, ' ').slice(0, 58)}…
              </div>
            </button>
          ))
        )}

        {/* ── HISTORY TAB ───────────────────────────────── */}
        {tab === 'history' && (
          historyEntries.length === 0 ? (
            <p style={{ color: 'var(--text3)', padding: '12px 16px', fontSize: 12, lineHeight: 1.6 }}>
              No history yet. Run queries to see them here.
            </p>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 12px 0' }}>
                <button
                  onClick={onClearHistory}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 10, padding: '3px 6px' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--red)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text3)')}
                >
                  Clear all
                </button>
              </div>
              {historyEntries.map(entry => {
                const firstSqlLine = entry.sql.split('\n').find(l => l.trim() && !l.trim().startsWith('--')) ?? entry.sql.split('\n')[0];
                return (
                  <div
                    key={entry.id}
                    onClick={() => onLoadHistory(entry.sql)}
                    style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {/* Status dot + SQL preview */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: entry.status === 'done' ? 'var(--green)' : 'var(--red)' }} />
                      <div style={{ fontSize: 11, color: 'var(--text)', fontFamily: 'var(--mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {firstSqlLine.trim()}
                      </div>
                    </div>
                    {/* Meta */}
                    <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', paddingLeft: 12 }}>
                      {entry.totalRows > 0 && `${entry.totalRows.toLocaleString()} rows · `}
                      {entry.elapsedMs > 0 && `${entry.elapsedMs.toFixed(1)}ms · `}
                      {relativeTime(entry.timestamp)}
                    </div>
                  </div>
                );
              })}
            </>
          )
        )}
      </div>
    </div>
  );
}

// ── TableRow ──────────────────────────────────────────────────────────────────

function TableRow({ tbl, expanded, onToggle, onInsert, isUploaded }: {
  tbl:        TableInfo;
  expanded:   boolean;
  onToggle:   () => void;
  onInsert:   () => void;
  isUploaded: boolean;
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <button
          onClick={onToggle}
          style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 7, padding: '6px 14px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text)', textAlign: 'left' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <span style={{ color: 'var(--text3)', fontSize: 9, width: 8 }}>{expanded ? '▼' : '▶'}</span>
          <TableIcon />
          <span style={{ fontSize: 12, fontWeight: 500, color: isUploaded ? 'var(--green)' : 'var(--text)' }}>
            {tbl.table}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 'auto', fontFamily: 'var(--mono)' }}>
            {tbl.row_count.toLocaleString()}
          </span>
        </button>
        <button
          onClick={onInsert}
          title="Insert into editor"
          style={{ padding: '6px 8px', background: 'transparent', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 12 }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--blue)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text3)')}
        >
          ↗
        </button>
      </div>

      {expanded && (
        <div style={{ padding: '2px 0 6px 36px' }}>
          {tbl.columns.map(col => (
            <div key={col.name} style={{ display: 'flex', gap: 8, padding: '3px 14px 3px 0', fontSize: 11, fontFamily: 'var(--mono)' }}>
              <span style={{ color: 'var(--text2)', minWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis' }}>{col.name}</span>
              <span style={{ color: 'var(--text3)' }}>{col.type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TableIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="1" y="1" width="10" height="10" rx="1" stroke="#484f58" strokeWidth="1" />
      <line x1="1" y1="4" x2="11" y2="4" stroke="#484f58" strokeWidth="1" />
      <line x1="5" y1="4" x2="5"  y2="11" stroke="#484f58" strokeWidth="1" />
    </svg>
  );
}
