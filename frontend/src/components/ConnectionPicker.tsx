import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface Connection {
  id:       string;
  type:     'duckdb' | 'postgresql' | 'mysql' | 'sqlite';
  label:    string;
  host?:    string;
  database?: string;
  port?:    number;
  status?:  string;
}

interface DriverStatus { [type: string]: string }

interface Props {
  activeId:   string;
  onSelect:   (id: string) => void;
  onRefresh?: () => void;
}

const TYPE_ICON: Record<string, string> = {
  duckdb:     '🦆',
  postgresql: '🐘',
  mysql:      '🐬',
  sqlite:     '🗄️',
};

const TYPE_LABEL: Record<string, string> = {
  duckdb:     'DuckDB',
  postgresql: 'PostgreSQL',
  mysql:      'MySQL',
  sqlite:     'SQLite',
};

const DEFAULT_PORTS: Record<string, number> = {
  postgresql: 5432,
  mysql:      3306,
};

export default function ConnectionPicker({ activeId, onSelect, onRefresh }: Props) {
  const [connections,   setConnections]   = useState<Connection[]>([]);
  const [driverStatus,  setDriverStatus]  = useState<DriverStatus>({});
  const [open,          setOpen]          = useState(false);
  const [showModal,     setShowModal]     = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const active = connections.find(c => c.id === activeId) ?? connections[0];

  const fetchConnections = useCallback(async () => {
    try {
      const r = await fetch('/api/connections');
      const d = await r.json();
      setConnections(d.connections ?? []);
      setDriverStatus(d.driver_status ?? {});
    } catch {}
  }, []);

  useEffect(() => { fetchConnections(); }, [fetchConnections]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Remove this connection?')) return;
    await fetch(`/api/connections/${id}`, { method: 'DELETE' });
    await fetchConnections();
    if (id === activeId) onSelect('__duckdb__');
  };

  return (
    <>
      <div ref={dropRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:          6,
            padding:      '3px 10px',
            background:   'var(--surface2)',
            borderRadius: 4,
            border:       '1px solid var(--border)',
            fontSize:     11,
            color:        'var(--text2)',
            cursor:       'pointer',
            whiteSpace:   'nowrap',
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3fb950', display: 'inline-block', flexShrink: 0 }} />
          <span style={{ fontSize: 13 }}>{active ? TYPE_ICON[active.type] : '🔌'}</span>
          <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {active?.label ?? 'Select connection'}
          </span>
          <span style={{ opacity: 0.5, marginLeft: 2 }}>▾</span>
        </button>

        {open && (
          <div style={{
            position:     'absolute',
            right:        0,
            top:          'calc(100% + 6px)',
            width:        260,
            background:   '#161b22',
            border:       '1px solid var(--border)',
            borderRadius: 8,
            boxShadow:    '0 8px 32px rgba(0,0,0,0.6)',
            zIndex:       100,
            overflow:     'hidden',
          }}>
            <div style={{ padding: '8px 12px 4px', fontSize: 10, color: 'var(--text3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Connections
            </div>

            {connections.map(c => (
              <div
                key={c.id}
                onClick={() => { onSelect(c.id); setOpen(false); }}
                style={{
                  display:      'flex',
                  alignItems:   'center',
                  gap:          8,
                  padding:      '8px 12px',
                  cursor:       'pointer',
                  background:   c.id === activeId ? 'rgba(88,166,255,0.08)' : 'transparent',
                  borderLeft:   c.id === activeId ? '2px solid var(--blue)' : '2px solid transparent',
                }}
                onMouseEnter={e => { if (c.id !== activeId) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseLeave={e => { if (c.id !== activeId) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
              >
                <span style={{ fontSize: 14 }}>{TYPE_ICON[c.type]}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.label}
                  </div>
                  {c.host && (
                    <div style={{ fontSize: 10, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.host}{c.port ? `:${c.port}` : ''}{c.database ? `/${c.database}` : ''}
                    </div>
                  )}
                </div>
                {c.id !== '__duckdb__' && (
                  <button
                    onClick={e => handleDelete(c.id, e)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 12, padding: '0 2px', flexShrink: 0 }}
                    title="Remove connection"
                  >✕</button>
                )}
              </div>
            ))}

            <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />

            <button
              onClick={() => { setOpen(false); setShowModal(true); }}
              style={{
                display:      'flex',
                alignItems:   'center',
                gap:          8,
                width:        '100%',
                padding:      '9px 12px',
                background:   'transparent',
                border:       'none',
                cursor:       'pointer',
                fontSize:     12,
                color:        'var(--blue)',
                fontWeight:   500,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(88,166,255,0.06)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span>＋</span> Add connection…
            </button>
          </div>
        )}
      </div>

      {showModal && (
        <AddConnectionModal
          driverStatus={driverStatus}
          onClose={() => setShowModal(false)}
          onSaved={async (newId) => {
            await fetchConnections();
            onSelect(newId);
            setShowModal(false);
          }}
        />
      )}
    </>
  );
}


// ── Add Connection Modal ──────────────────────────────────────────────────────

function AddConnectionModal({ driverStatus, onClose, onSaved }: {
  driverStatus: DriverStatus;
  onClose:  () => void;
  onSaved:  (id: string) => void;
}) {
  const [type,     setType]     = useState<string>('postgresql');
  const [label,    setLabel]    = useState('');
  const [host,     setHost]     = useState('localhost');
  const [port,     setPort]     = useState<string>('5432');
  const [database, setDatabase] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [ssl,      setSsl]      = useState(false);
  const [filepath, setFilepath] = useState('');
  const [testing,  setTesting]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [testResult, setTestResult] = useState<{ok: boolean; msg: string} | null>(null);

  // Reset port when type changes
  useEffect(() => {
    setPort(String(DEFAULT_PORTS[type] ?? ''));
    setTestResult(null);
  }, [type]);

  const buildPayload = () => ({
    type, label: label || undefined,
    host:     type !== 'sqlite' ? host     : undefined,
    port:     type !== 'sqlite' ? Number(port) : undefined,
    database: type !== 'sqlite' ? database : undefined,
    username: type !== 'sqlite' ? username : undefined,
    password: type !== 'sqlite' ? password : undefined,
    ssl:      type === 'postgresql' ? ssl : undefined,
    filepath: type === 'sqlite'     ? filepath : undefined,
  });

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch('/api/connections/test', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(buildPayload()),
      });
      const d = await r.json();
      setTestResult({ ok: d.ok, msg: d.ok ? 'Connection successful!' : (d.error ?? 'Failed') });
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message ?? 'Network error' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/connections', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(buildPayload()),
      });
      const d = await r.json();
      if (d.error) {
        setTestResult({ ok: false, msg: d.error });
      } else {
        onSaved(d.id);
      }
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message ?? 'Network error' });
    } finally {
      setSaving(false);
    }
  };

  const driverOk = (driverStatus[type] ?? 'ok') === 'ok';
  const driverMsg = driverStatus[type];

  const inp = (val: string, set: (v: string) => void, placeholder: string, pw?: boolean) => (
    <input
      type={pw ? 'password' : 'text'}
      value={val}
      onChange={e => set(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', padding: '7px 10px', background: '#0d1117',
        border: '1px solid var(--border)', borderRadius: 4,
        color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 12,
        outline: 'none', boxSizing: 'border-box',
      }}
    />
  );

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        width: 460, background: '#161b22',
        border: '1px solid var(--border)', borderRadius: 10,
        boxShadow: '0 24px 64px rgba(0,0,0,0.8)',
        padding: 24,
      }} onClick={e => e.stopPropagation()}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Add Database Connection</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        {/* Type selector */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 18 }}>
          {(['postgresql','mysql','sqlite'] as const).map(t => {
            const ok = (driverStatus[t] ?? 'ok') === 'ok';
            return (
              <button
                key={t}
                onClick={() => setType(t)}
                style={{
                  padding:      '10px 4px',
                  background:   type === t ? 'rgba(88,166,255,0.12)' : 'var(--surface)',
                  border:       `1px solid ${type === t ? 'var(--blue)' : 'var(--border)'}`,
                  borderRadius: 6,
                  cursor:       'pointer',
                  textAlign:    'center',
                  opacity:      ok ? 1 : 0.5,
                }}
                title={!ok ? driverStatus[t] : ''}
              >
                <div style={{ fontSize: 20, marginBottom: 3 }}>{TYPE_ICON[t]}</div>
                <div style={{ fontSize: 10, color: type === t ? 'var(--blue)' : 'var(--text2)', fontWeight: 600 }}>
                  {TYPE_LABEL[t]}
                </div>
                {!ok && <div style={{ fontSize: 9, color: '#f85149', marginTop: 2 }}>missing driver</div>}
              </button>
            );
          })}
        </div>

        {!driverOk && (
          <div style={{ padding: '8px 12px', background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.25)', borderRadius: 6, fontSize: 12, color: '#f85149', marginBottom: 14, fontFamily: 'var(--mono)' }}>
            {driverMsg}
          </div>
        )}

        {/* Label */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Label (optional)</label>
          {inp(label, setLabel, `My ${TYPE_LABEL[type]}`)}
        </div>

        {type !== 'sqlite' ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 8, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Host</label>
                {inp(host, setHost, 'localhost')}
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Port</label>
                {inp(port, setPort, String(DEFAULT_PORTS[type] ?? ''))}
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Database</label>
              {inp(database, setDatabase, 'my_database')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Username</label>
                {inp(username, setUsername, 'postgres')}
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Password</label>
                {inp(password, setPassword, '••••••••', true)}
              </div>
            </div>
            {type === 'postgresql' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text2)', marginBottom: 16, cursor: 'pointer' }}>
                <input type="checkbox" checked={ssl} onChange={e => setSsl(e.target.checked)} />
                Require SSL
              </label>
            )}
          </>
        ) : (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>File path</label>
            {inp(filepath, setFilepath, '/path/to/database.db or :memory:')}
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
              Use <code style={{ fontFamily: 'var(--mono)' }}>:memory:</code> for an in-process database
            </div>
          </div>
        )}

        {/* Test result */}
        {testResult && (
          <div style={{
            padding: '8px 12px', borderRadius: 6, marginBottom: 14, fontSize: 12,
            background: testResult.ok ? 'rgba(63,185,80,0.08)' : 'rgba(248,81,73,0.08)',
            border:     `1px solid ${testResult.ok ? 'rgba(63,185,80,0.3)' : 'rgba(248,81,73,0.3)'}`,
            color:      testResult.ok ? '#3fb950' : '#f85149',
            fontFamily: 'var(--mono)',
            wordBreak:  'break-word',
          }}>{testResult.msg}</div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={handleTest}
            disabled={testing || !driverOk}
            style={{
              padding: '7px 16px', background: 'transparent',
              border: '1px solid var(--border)', borderRadius: 4,
              color: 'var(--text2)', cursor: testing ? 'wait' : 'pointer',
              fontSize: 12, opacity: (!driverOk || testing) ? 0.5 : 1,
            }}
          >
            {testing ? 'Testing…' : 'Test connection'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !driverOk}
            style={{
              padding: '7px 20px', background: 'var(--blue)',
              border: 'none', borderRadius: 4,
              color: '#fff', cursor: saving ? 'wait' : 'pointer',
              fontSize: 12, fontWeight: 600,
              opacity: (!driverOk || saving) ? 0.6 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Save & Connect'}
          </button>
        </div>
      </div>
    </div>
  );
}
