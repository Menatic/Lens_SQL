import { useCallback, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import type { PlanNode, ExecStatus } from '../types';

// ── colours ──────────────────────────────────────────────────────────────────
const CAT_COLOR: Record<string, string> = {
  scan:      '#58a6ff',
  filter:    '#3fb950',
  project:   '#8b949e',
  join:      '#d29922',
  aggregate: '#bc8cff',
  sort:      '#39d353',
  limit:     '#79c0ff',
  set:       '#ffa657',
  other:     '#6e7681',
};

// ── layout constants ──────────────────────────────────────────────────────────
const NODE_W = 200;
const NODE_H = 80;
const H_GAP  = 56;
const V_GAP  = 52;
const PAD    = 40;

interface Datum { node: PlanNode; x: number; y: number; }

function layout(root: PlanNode): Datum[] {
  const out: Datum[] = [];
  let leafCounter = 0;

  function collect(n: PlanNode, depth: number): number {
    const childXs: number[] = [];
    for (const c of n.children) childXs.push(collect(c, depth + 1));
    const x = n.children.length === 0
      ? (() => { const v = leafCounter * (NODE_W + H_GAP); leafCounter++; return v; })()
      : (childXs[0] + childXs[childXs.length - 1]) / 2;
    out.push({ node: n, x, y: depth * (NODE_H + V_GAP) });
    return x;
  }

  collect(root, 0);
  return out;
}

function fmtRows(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// ── component ─────────────────────────────────────────────────────────────────
interface Props {
  plan:      PlanNode | null;
  statsPlan: PlanNode | null;
  status:    ExecStatus;
}

export default function PlanTree({ plan, statsPlan, status }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef       = useRef<SVGSVGElement>(null);
  const gRef         = useRef<SVGGElement>(null);
  const zoomRef      = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  const fitView = useCallback(() => {
    if (!svgRef.current || !containerRef.current || !zoomRef.current) return;
    const svg = d3.select(svgRef.current);
    const cW  = containerRef.current.clientWidth;
    const cH  = containerRef.current.clientHeight;
    const content = (svgRef.current as SVGSVGElement & { _contentW?: number; _contentH?: number });
    const cntW = content._contentW ?? cW;
    const cntH = content._contentH ?? cH;
    const scale = Math.min(cW / (cntW + PAD * 2), cH / (cntH + PAD * 2), 1.2);
    const tx = (cW - cntW * scale) / 2;
    const ty = (cH - cntH * scale) / 2;
    svg.transition().duration(350).call(
      zoomRef.current.transform,
      d3.zoomIdentity.translate(tx, ty).scale(scale)
    );
  }, []);

  const exportSvg = useCallback(() => {
    const svgEl = svgRef.current;
    const gEl   = gRef.current;
    if (!svgEl || !gEl) return;
    try {
      const bb  = gEl.getBBox();
      const p   = 32;
      const ns  = 'http://www.w3.org/2000/svg';
      const out = document.createElementNS(ns, 'svg');
      out.setAttribute('xmlns', ns);
      out.setAttribute('width',   String(Math.ceil(bb.width  + p * 2)));
      out.setAttribute('height',  String(Math.ceil(bb.height + p * 2)));
      out.setAttribute('viewBox', `0 0 ${bb.width + p * 2} ${bb.height + p * 2}`);
      // Dark background
      const bg = document.createElementNS(ns, 'rect');
      bg.setAttribute('width', '100%'); bg.setAttribute('height', '100%'); bg.setAttribute('fill', '#0d1117');
      out.appendChild(bg);
      // Clone the g element and offset it so content starts at (p, p)
      const clone = gEl.cloneNode(true) as SVGGElement;
      clone.setAttribute('transform', `translate(${p - bb.x},${p - bb.y})`);
      // Remove particle circles and pulse animations
      clone.querySelectorAll('.plan-particle').forEach(el => el.remove());
      clone.querySelectorAll('animate').forEach(el => el.parentElement?.remove());
      out.appendChild(clone);
      const str  = new XMLSerializer().serializeToString(out);
      const blob = new Blob([str], { type: 'image/svg+xml' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = 'lens_plan.svg'; a.click();
      URL.revokeObjectURL(url);
    } catch {}
  }, []);

  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;

    const svg = d3.select(svgRef.current);
    const g   = d3.select(gRef.current);

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.08, 4])
      .on('zoom', (ev) => g.attr('transform', ev.transform));
    zoomRef.current = zoom;
    svg.call(zoom).on('dblclick.zoom', null);

    if (!plan) return;

    g.selectAll('*').remove();

    // Build stats lookup
    const statsMap = new Map<string, PlanNode>();
    if (statsPlan) {
      const walk = (n: PlanNode) => { statsMap.set(n.id, n); n.children.forEach(walk); };
      walk(statsPlan);
    }

    const nodes = layout(plan);
    if (nodes.length === 0) return;

    const minX = Math.min(...nodes.map(d => d.x));
    const maxX = Math.max(...nodes.map(d => d.x)) + NODE_W;
    const maxY = Math.max(...nodes.map(d => d.y)) + NODE_H;
    const W    = maxX - minX;
    const H    = maxY;

    const svgEl = svgRef.current as SVGSVGElement & { _contentW?: number; _contentH?: number };
    svgEl._contentW = W;
    svgEl._contentH = H;

    const nodeMap = new Map(nodes.map(d => [d.node.id, d]));

    // State flags (needed by both edge and node loops)
    const isDone   = status === 'done' && statsPlan != null;
    const isActive = status === 'running' || status === 'planning';

    // ── defs: clip paths ────────────────────────────────────────────────────
    const defs = g.append('defs');
    for (const d of nodes) {
      defs.append('clipPath')
        .attr('id', `clip-${d.node.id}`)
        .append('rect')
        .attr('width',  NODE_W - 4)
        .attr('height', NODE_H)
        .attr('rx', 4);
    }

    // ── edges + collect particle data ────────────────────────────────────────
    const particleEdges: { pathId: string; color: string }[] = [];

    for (const d of nodes) {
      for (const child of d.node.children) {
        const cd = nodeMap.get(child.id);
        if (!cd) continue;

        const x1    = d.x  + NODE_W / 2 - minX;
        const y1    = d.y  + NODE_H;
        const x2    = cd.x + NODE_W / 2 - minX;
        const y2    = cd.y;
        const my    = (y1 + y2) / 2;
        const pathId = `e-${d.node.id}-${child.id}`;
        const edgeColor = CAT_COLOR[d.node.category] ?? '#6e7681';

        g.append('path')
          .attr('id', pathId)
          .attr('d', `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`)
          .attr('fill',   'none')
          .attr('stroke', isActive ? `${edgeColor}55` : '#21262d')
          .attr('stroke-width',    isActive ? 2 : 1.5)
          .attr('stroke-dasharray', isActive ? 'none' : '4 3');

        if (isActive) {
          particleEdges.push({ pathId, color: edgeColor });
        }
      }
    }

    // ── nodes ────────────────────────────────────────────────────────────────
    for (const d of nodes) {
      const color    = CAT_COLOR[d.node.category] ?? '#6e7681';
      const stats    = statsMap.get(d.node.id);
      const nx       = d.x - minX;
      const ny       = d.y;

      const grp = g.append('g').attr('transform', `translate(${nx},${ny})`);

      // Shadow
      grp.append('rect')
        .attr('x', 2).attr('y', 2)
        .attr('width', NODE_W).attr('height', NODE_H).attr('rx', 6)
        .attr('fill', 'rgba(0,0,0,0.4)');

      // Card background
      grp.append('rect')
        .attr('width', NODE_W).attr('height', NODE_H).attr('rx', 6)
        .attr('fill', '#161b22')
        .attr('stroke', isDone ? color : '#30363d')
        .attr('stroke-width', isDone ? 1.5 : 1);

      // Left accent bar
      grp.append('rect')
        .attr('width', 3).attr('height', NODE_H).attr('rx', 2)
        .attr('fill', color);

      // Clip group for text
      const textGrp = grp.append('g')
        .attr('clip-path', `url(#clip-${d.node.id})`);

      const displayName = truncate(d.node.name.replace(/_/g, ' '), 24);
      textGrp.append('text')
        .attr('x', 13).attr('y', 19)
        .attr('fill', color)
        .attr('font-size', 11)
        .attr('font-weight', 700)
        .attr('font-family', 'JetBrains Mono, monospace')
        .attr('letter-spacing', '0.03em')
        .text(displayName);

      if (d.node.table) {
        const tbl = truncate(d.node.table.replace(/^(memory\.main\.|main\.)/i, ''), 22);
        textGrp.append('text')
          .attr('x', 13).attr('y', 35)
          .attr('fill', '#8b949e')
          .attr('font-size', 10)
          .attr('font-family', 'JetBrains Mono, monospace')
          .text(tbl);
      }

      const actualRows = stats?.actual_rows ?? d.node.actual_rows;
      const timeMs     = stats?.time_ms     ?? d.node.time_ms;
      const estRows    = d.node.est_rows;

      if (actualRows != null) {
        textGrp.append('text')
          .attr('x', 13).attr('y', 57)
          .attr('fill', '#3fb950')
          .attr('font-size', 9.5)
          .attr('font-family', 'JetBrains Mono, monospace')
          .text(`↑ ${fmtRows(actualRows)} rows`);
      } else if (estRows != null) {
        textGrp.append('text')
          .attr('x', 13).attr('y', 57)
          .attr('fill', '#484f58')
          .attr('font-size', 9.5)
          .attr('font-family', 'JetBrains Mono, monospace')
          .text(`~${fmtRows(estRows)}`);
      }

      if (timeMs != null) {
        textGrp.append('text')
          .attr('x', NODE_W - 10).attr('y', 57)
          .attr('fill', '#d29922')
          .attr('font-size', 9.5)
          .attr('font-family', 'JetBrains Mono, monospace')
          .attr('text-anchor', 'end')
          .text(`${timeMs < 1 ? timeMs.toFixed(2) : timeMs.toFixed(1)} ms`);
      }

      grp.append('circle')
        .attr('cx', NODE_W - 10).attr('cy', 10).attr('r', 3.5)
        .attr('fill', color).attr('opacity', 0.7);

      // Pulse ring when running
      if (isActive) {
        grp.append('rect')
          .attr('x', -1).attr('y', -1)
          .attr('width', NODE_W + 2).attr('height', NODE_H + 2).attr('rx', 7)
          .attr('fill', 'none').attr('stroke', color).attr('stroke-width', 1.5)
          .attr('opacity', 0)
          .append('animate')
          .attr('attributeName', 'opacity')
          .attr('values', '0;0.6;0')
          .attr('dur', '1.6s')
          .attr('repeatCount', 'indefinite');
      }
    }

    // ── particles (drawn last so they appear on top) ─────────────────────────
    if (isActive && particleEdges.length > 0) {
      for (const { pathId, color } of particleEdges) {
        for (let p = 0; p < 3; p++) {
          const circle = g.append('circle')
            .attr('r', 2.5)
            .attr('fill', color)
            .attr('opacity', 0.9)
            .attr('class', 'plan-particle');

          const am = document.createElementNS('http://www.w3.org/2000/svg', 'animateMotion');
          am.setAttribute('dur',         '1.3s');
          am.setAttribute('repeatCount', 'indefinite');
          am.setAttribute('keyPoints',   '1;0');  // child → parent = upward flow
          am.setAttribute('keyTimes',    '0;1');
          am.setAttribute('calcMode',    'linear');
          am.setAttribute('begin',       `${(p / 3) * 1.3}s`);

          const mp = document.createElementNS('http://www.w3.org/2000/svg', 'mpath');
          mp.setAttribute('href', `#${pathId}`);
          mp.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', `#${pathId}`);
          am.appendChild(mp);

          circle.node()!.appendChild(am);
        }
      }
    }

    requestAnimationFrame(() => fitView());

  }, [plan, statsPlan, status, fitView]);

  if (!plan) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: '#484f58' }}>
        <svg width="52" height="52" viewBox="0 0 48 48" fill="none">
          <rect x="16" y="5"  width="16" height="11" rx="2" stroke="#30363d" strokeWidth="1.5"/>
          <rect x="3"  y="32" width="16" height="11" rx="2" stroke="#30363d" strokeWidth="1.5"/>
          <rect x="29" y="32" width="16" height="11" rx="2" stroke="#30363d" strokeWidth="1.5"/>
          <path d="M24 16 L11 32" stroke="#30363d" strokeWidth="1.5"/>
          <path d="M24 16 L37 32" stroke="#30363d" strokeWidth="1.5"/>
        </svg>
        <span style={{ fontSize: 12 }}>Run a query to see the execution plan</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>
      <svg ref={svgRef} style={{ width: '100%', height: '100%', cursor: 'grab', display: 'block' }}>
        <g ref={gRef} />
      </svg>

      {/* Controls */}
      <div style={{ position: 'absolute', bottom: 16, right: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[
          { label: '⤢', title: 'Fit to view',   action: fitView },
          { label: '+', title: 'Zoom in',        action: () => svgRef.current && zoomRef.current && d3.select(svgRef.current).transition().duration(220).call(zoomRef.current.scaleBy, 1.4) },
          { label: '−', title: 'Zoom out',       action: () => svgRef.current && zoomRef.current && d3.select(svgRef.current).transition().duration(220).call(zoomRef.current.scaleBy, 1 / 1.4) },
          { label: '↓', title: 'Download as SVG', action: exportSvg },
        ].map(btn => (
          <button key={btn.label} onClick={btn.action} title={btn.title} style={{
            width: 28, height: 28,
            background:  'var(--surface)',
            border:      '1px solid var(--border)',
            color:       'var(--text2)',
            borderRadius: 4,
            cursor:      'pointer',
            fontSize:    btn.label === '⤢' ? 14 : 18,
            lineHeight:  1,
            display:     'flex',
            alignItems:  'center',
            justifyContent: 'center',
          }}>
            {btn.label}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div style={{
        position:       'absolute',
        bottom:         16,
        left:           16,
        display:        'flex',
        gap:            10,
        flexWrap:       'wrap',
        background:     'rgba(13,17,23,0.7)',
        borderRadius:   6,
        padding:        '6px 10px',
        backdropFilter: 'blur(4px)',
      }}>
        {Object.entries(CAT_COLOR).filter(([k]) => k !== 'other').map(([cat, col]) => (
          <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: col }} />
            <span style={{ fontSize: 9, color: '#8b949e', fontFamily: 'var(--mono)', letterSpacing: '0.04em' }}>
              {cat}
            </span>
          </div>
        ))}
      </div>

      <div style={{ position: 'absolute', top: 10, right: 10, fontSize: 10, color: '#484f58', pointerEvents: 'none' }}>
        scroll to zoom · drag to pan
      </div>
    </div>
  );
}
