import React, { useMemo } from 'react';

interface ColumnProfile {
  name:          string;
  nullCount:     number;
  nullPct:       number;
  distinctCount: number;
  kind:          'numeric' | 'string';
  min?:          number;
  max?:          number;
  mean?:         number;
  histogram?:    { lo: number; hi: number; count: number }[];
  topValues?:    { value: string; count: number }[];
}

function profileColumn(name: string, idx: number, rows: unknown[][]): ColumnProfile {
  const total     = rows.length;
  const vals      = rows.map(r => r[idx]);
  const nullCount = vals.filter(v => v == null).length;
  const nullPct   = total > 0 ? Math.round((nullCount / total) * 100) : 0;
  const nonNull   = vals.filter(v => v != null);

  const isNumeric = nonNull.length > 0 && nonNull.every(v => typeof v === 'number' && isFinite(v as number));

  if (isNumeric && nonNull.length > 0) {
    const nums = nonNull as number[];
    let min = nums[0], max = nums[0], sum = 0;
    for (const n of nums) {
      if (n < min) min = n;
      if (n > max) max = n;
      sum += n;
    }
    const mean     = sum / nums.length;
    const distinct = new Set(nums).size;
    const B        = 8;
    const range    = max - min || 1;
    const buckets  = Array.from({ length: B }, (_, i) => ({
      lo:    min + (i / B) * range,
      hi:    min + ((i + 1) / B) * range,
      count: 0,
    }));
    for (const n of nums) {
      const bi = Math.min(Math.floor(((n - min) / range) * B), B - 1);
      buckets[bi].count++;
    }
    return { name, nullCount, nullPct, distinctCount: distinct, kind: 'numeric', min, max, mean, histogram: buckets };
  }

  // String / other
  const freq = new Map<string, number>();
  for (const v of nonNull) {
    const k = String(v);
    freq.set(k, (freq.get(k) ?? 0) + 1);
  }
  const topValues = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([value, count]) => ({ value, count }));

  return { name, nullCount, nullPct, distinctCount: freq.size, kind: 'string', topValues };
}

function fmt(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString();
  if (Math.abs(n) < 0.01) return n.toExponential(2);
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function Histogram({ buckets }: { buckets: { lo: number; hi: number; count: number }[] }) {
  const maxCount = Math.max(...buckets.map(b => b.count), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 28, margin: '6px 0 2px' }}>
      {buckets.map((b, i) => {
        const h = Math.round((b.count / maxCount) * 28);
        return (
          <div
            key={i}
            title={`${fmt(b.lo)}–${fmt(b.hi)}: ${b.count.toLocaleString()} rows`}
            style={{
              flex:        1,
              height:      Math.max(h, b.count > 0 ? 1 : 0),
              background:  '#58a6ff',
              borderRadius: '1px 1px 0 0',
              opacity:     0.65,
              cursor:      'default',
            }}
          />
        );
      })}
    </div>
  );
}

interface Props {
  columns: string[];
  rows:    unknown[][];
  total:   number;
}

export default function DataProfile({ columns, rows, total }: Props) {
  const profiles = useMemo(
    () => columns.map((name, i) => profileColumn(name, i, rows)),
    [columns, rows],
  );

  if (profiles.length === 0) return null;

  return (
    <div style={{ overflow: 'auto', height: '100%', padding: '10px 12px' }}>
      {/* Header */}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 10 }}>
        Data Profile — {total.toLocaleString()} rows · {columns.length} columns
        {rows.length < total && (
          <span style={{ color: 'var(--text3)', fontWeight: 400 }}>
            {' '}(profiled from first {rows.length.toLocaleString()})
          </span>
        )}
      </div>

      {/* Column cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 8 }}>
        {profiles.map(p => (
          <div key={p.name} style={{
            background:   'var(--surface)',
            border:       '1px solid var(--border)',
            borderRadius: 7,
            padding:      '10px 12px',
          }}>
            {/* Name + type badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
              <span style={{
                fontSize:     11,
                fontWeight:   600,
                color:        'var(--text)',
                fontFamily:   'var(--mono)',
                flex:         1,
                overflow:     'hidden',
                textOverflow: 'ellipsis',
                whiteSpace:   'nowrap',
              }} title={p.name}>
                {p.name}
              </span>
              <span style={{
                fontSize:     9,
                fontWeight:   700,
                letterSpacing: '0.06em',
                color:        p.kind === 'numeric' ? '#bc8cff' : '#58a6ff',
                background:   p.kind === 'numeric' ? 'rgba(188,140,255,0.1)' : 'rgba(88,166,255,0.1)',
                padding:      '1px 5px',
                borderRadius: 3,
                flexShrink:   0,
              }}>
                {p.kind === 'numeric' ? 'NUM' : 'STR'}
              </span>
            </div>

            {/* Stats row */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: 9, color: 'var(--text3)', marginBottom: 1, letterSpacing: '0.05em' }}>NULL%</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: p.nullPct > 10 ? '#d29922' : 'var(--text2)' }}>
                  {p.nullPct}%
                </div>
              </div>
              <div>
                <div style={{ fontSize: 9, color: 'var(--text3)', marginBottom: 1, letterSpacing: '0.05em' }}>DISTINCT</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)' }}>
                  {p.distinctCount.toLocaleString()}
                </div>
              </div>
              {p.kind === 'numeric' && p.min != null && (
                <>
                  <div>
                    <div style={{ fontSize: 9, color: 'var(--text3)', marginBottom: 1, letterSpacing: '0.05em' }}>MIN</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)' }}>{fmt(p.min)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: 'var(--text3)', marginBottom: 1, letterSpacing: '0.05em' }}>MAX</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)' }}>{fmt(p.max!)}</div>
                  </div>
                </>
              )}
            </div>

            {/* Histogram for numeric */}
            {p.kind === 'numeric' && p.histogram && (
              <>
                <Histogram buckets={p.histogram} />
                {p.mean != null && (
                  <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 1 }}>
                    mean {fmt(p.mean)}
                  </div>
                )}
              </>
            )}

            {/* Top values for string */}
            {p.kind === 'string' && p.topValues && p.topValues.length > 0 && (
              <div style={{ marginTop: 4 }}>
                {p.topValues.slice(0, 4).map((tv, i) => (
                  <div key={i} style={{ marginBottom: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 2 }}>
                      <span style={{ color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }} title={tv.value}>
                        {tv.value}
                      </span>
                      <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{tv.count.toLocaleString()}</span>
                    </div>
                    <div style={{ height: 3, background: 'var(--border)', borderRadius: 2 }}>
                      <div style={{
                        width:        `${(tv.count / (p.topValues![0].count || 1)) * 100}%`,
                        height:       '100%',
                        background:   '#58a6ff',
                        borderRadius: 2,
                        opacity:      0.65,
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
