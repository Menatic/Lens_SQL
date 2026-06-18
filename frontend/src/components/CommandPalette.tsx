import React, { useEffect, useRef, useState } from 'react';
import type { TableInfo, SampleQuery } from '../types';
import type { Lesson } from '../data/lessons';

interface PaletteItem {
  group:       string;
  label:       string;
  description: string;
  onSelect:    () => void;
}

function fuzzyMatch(query: string, text: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

interface Props {
  open:          boolean;
  onClose:       () => void;
  samples:       SampleQuery[];
  tables:        TableInfo[];
  lessons:       Lesson[];
  onLoadSql:     (sql: string) => void;
  onInsertTable: (name: string) => void;
  onReset:       () => void;
  onOpenDataGen: () => void;
  onShare:       () => void;
}

export default function CommandPalette({
  open, onClose, samples, tables, lessons,
  onLoadSql, onInsertTable, onReset, onOpenDataGen, onShare,
}: Props) {
  const [query,     setQuery]     = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  if (!open) return null;

  const allItems: PaletteItem[] = [
    ...samples.map(s => ({
      group:       'Samples',
      label:       s.label,
      description: s.sql.replace(/\s+/g, ' ').slice(0, 72),
      onSelect:    () => { onLoadSql(s.sql); onClose(); },
    })),
    ...tables.map(t => ({
      group:       'Tables',
      label:       t.table,
      description: `${t.row_count.toLocaleString()} rows · ${t.columns.length} columns`,
      onSelect:    () => { onInsertTable(t.table); onClose(); },
    })),
    ...lessons.map(l => ({
      group:       'Lessons',
      label:       l.title,
      description: l.subtitle,
      onSelect:    () => { window.location.href = `/learn/${l.id}`; },
    })),
    {
      group:       'Actions',
      label:       'Share query link',
      description: 'Copy a shareable URL with the current SQL encoded',
      onSelect:    () => { onShare(); onClose(); },
    },
    {
      group:       'Actions',
      label:       'Generate synthetic data',
      description: 'Open the data generator (8 templates, up to 1M rows)',
      onSelect:    () => { onOpenDataGen(); onClose(); },
    },
    {
      group:       'Actions',
      label:       'Reset session',
      description: 'Clear all tables and restart the DuckDB in-memory session',
      onSelect:    () => { onReset(); onClose(); },
    },
    {
      group:       'Actions',
      label:       'Compare queries',
      description: 'Open side-by-side query comparison view',
      onSelect:    () => { window.location.href = '/compare'; },
    },
  ];

  const filtered  = allItems.filter(item =>
    fuzzyMatch(query, item.label) || fuzzyMatch(query, item.description)
  );
  const groups    = [...new Set(filtered.map(i => i.group))];
  const clamped   = Math.max(0, Math.min(activeIdx, filtered.length - 1));

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && filtered[clamped]) filtered[clamped].onSelect();
  };

  let flatIdx = 0;

  return (
    <div
      onClick={onClose}
      style={{
        position:       'fixed',
        inset:          0,
        background:     'rgba(0,0,0,0.65)',
        zIndex:         900,
        display:        'flex',
        alignItems:     'flex-start',
        justifyContent: 'center',
        paddingTop:     72,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width:        580,
          maxHeight:    '62vh',
          background:   '#161b22',
          border:       '1px solid var(--border)',
          borderRadius: 10,
          overflow:     'hidden',
          display:      'flex',
          flexDirection: 'column',
          boxShadow:    '0 24px 80px rgba(0,0,0,0.8)',
        }}
      >
        {/* Search row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="5.5" cy="5.5" r="4" stroke="#484f58" strokeWidth="1.5"/>
            <line x1="9" y1="9" x2="13" y2="13" stroke="#484f58" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveIdx(0); }}
            onKeyDown={handleKey}
            placeholder="Search tables, samples, lessons, actions…"
            style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 14, outline: 'none', fontFamily: 'inherit' }}
          />
          <kbd style={{ fontSize: 10, color: 'var(--text3)', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 3, fontFamily: 'var(--mono)', flexShrink: 0 }}>ESC</kbd>
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
              No results for "{query}"
            </div>
          ) : (
            groups.map(group => {
              const groupItems = filtered.filter(i => i.group === group);
              return (
                <div key={group}>
                  <div style={{ padding: '8px 16px 3px', fontSize: 10, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    {group}
                  </div>
                  {groupItems.map(item => {
                    const myIdx   = flatIdx++;
                    const isActive = myIdx === clamped;
                    return (
                      <div
                        key={`${group}-${item.label}`}
                        onClick={item.onSelect}
                        onMouseEnter={() => setActiveIdx(myIdx)}
                        style={{
                          padding:     '8px 16px',
                          cursor:      'pointer',
                          background:  isActive ? 'rgba(88,166,255,0.08)' : 'transparent',
                          borderLeft:  isActive ? '2px solid var(--blue)' : '2px solid transparent',
                        }}
                      >
                        <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{item.label}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.description}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* Footer hints */}
        <div style={{ borderTop: '1px solid var(--border)', padding: '6px 16px', display: 'flex', gap: 16, fontSize: 10, color: 'var(--text3)' }}>
          {[['↑↓', 'navigate'], ['↵', 'select'], ['ESC', 'close']].map(([k, v]) => (
            <span key={k}>
              <kbd style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 4px', borderRadius: 2, fontFamily: 'var(--mono)', marginRight: 4 }}>{k}</kbd>
              {v}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
