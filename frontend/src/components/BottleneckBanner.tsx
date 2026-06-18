import React from 'react';
import type { PlanNode } from '../types';

interface Bottleneck {
  name:     string;
  category: string;
  timeMs:   number;
  pct:      number;
  table:    string | null;
}

const ADVICE: Record<string, string> = {
  scan:      'Sequential scan dominates execution. Add a WHERE clause to reduce rows read, or restructure the query to avoid full-table scans.',
  join:      'This join is the bottleneck. Ensure the smaller table is the build side, and filter rows aggressively before joining.',
  aggregate: 'Aggregation is expensive here. Pre-filter with WHERE before GROUP BY to reduce the number of groups processed.',
  sort:      'Sorting is the main bottleneck. Use LIMIT with ORDER BY to enable a TopN optimisation, or avoid sorting large result sets.',
  filter:    'The filter reads many rows before discarding most. Push this filter earlier in the query to improve selectivity.',
  limit:     'Limit operator is unexpectedly slow — the optimizer may not be applying TopN. Try rewriting ORDER BY + LIMIT as a subquery.',
  other:     'This operator consumes most of the execution time. Consider restructuring the query or breaking it into intermediate steps.',
};

function findBottleneck(root: PlanNode): Bottleneck | null {
  const total = root.time_ms ?? 0;
  if (total < 1) return null;

  let worstNode: PlanNode | null = null;
  let worstTime = 0;

  function walk(n: PlanNode) {
    if ((n.time_ms ?? 0) > worstTime) {
      worstTime = n.time_ms!;
      worstNode = n;
    }
    n.children.forEach(walk);
  }
  walk(root);

  if (!worstNode || worstTime === 0) return null;
  const pct = Math.round((worstTime / total) * 100);
  if (pct < 40) return null;

  return {
    name:     (worstNode as PlanNode).name,
    category: (worstNode as PlanNode).category,
    timeMs:   worstTime,
    pct,
    table:    (worstNode as PlanNode).table ?? null,
  };
}

export default function BottleneckBanner({ statsPlan }: { statsPlan: PlanNode | null }) {
  if (!statsPlan) return null;
  const b = findBottleneck(statsPlan);
  if (!b) return null;

  const advice = ADVICE[b.category] ?? ADVICE.other;
  const label  = b.table
    ? `${b.name.replace(/_/g, ' ')} (${b.table})`
    : b.name.replace(/_/g, ' ');

  return (
    <div style={{
      margin:       '8px 12px 0',
      padding:      '9px 14px',
      background:   'rgba(210,153,34,0.07)',
      border:       '1px solid rgba(210,153,34,0.28)',
      borderLeft:   '3px solid #d29922',
      borderRadius: 6,
      flexShrink:   0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
        <span style={{ color: '#d29922', fontSize: 13 }}>⚠</span>
        <span style={{ fontWeight: 700, fontSize: 11, color: '#d29922', letterSpacing: '0.04em' }}>
          BOTTLENECK DETECTED
        </span>
        <code style={{
          marginLeft:  'auto',
          fontFamily:  'var(--mono)',
          fontSize:    10,
          color:       '#d29922',
          background:  'rgba(210,153,34,0.12)',
          padding:     '1px 6px',
          borderRadius: 3,
          maxWidth:    160,
          overflow:    'hidden',
          textOverflow: 'ellipsis',
          whiteSpace:  'nowrap',
        }}>
          {label}
        </code>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: '#d29922' }}>
          {b.pct}%
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>
          {b.timeMs < 1 ? `${b.timeMs.toFixed(2)}ms` : `${b.timeMs.toFixed(1)}ms`}
        </span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5 }}>{advice}</div>
    </div>
  );
}
