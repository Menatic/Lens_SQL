import React from 'react';
import { Link } from 'react-router-dom';
import { LESSONS } from '../data/lessons';

// ── Category colours ──────────────────────────────────────────────────────────

const CAT_COLOR: Record<string, string> = {
  scan:      '#5B9FFF',
  filter:    '#34D399',
  join:      '#FBBF24',
  aggregate: '#A78BFA',
  sort:      '#22D3EE',
  limit:     '#93C5FD',
};

// ── Hero plan tree (premium SVG) ──────────────────────────────────────────────

const HERO_NODES = [
  { id: 'agg',    label: 'HASH_GROUP_BY',  sub: '12 rows · 2.1ms',  cat: 'aggregate', x: 296, y: 20,  w: 164 },
  { id: 'join',   label: 'HASH_JOIN',       sub: '18K rows · 14ms',  cat: 'join',      x: 116, y: 130, w: 148 },
  { id: 'sort',   label: 'ORDER_BY',        sub: '12 rows · 0.3ms',  cat: 'sort',      x: 490, y: 130, w: 124 },
  { id: 'scan1',  label: 'SEQ_SCAN',        sub: 'orders · 20K rows',cat: 'scan',      x: 24,  y: 240, w: 148 },
  { id: 'scan2',  label: 'SEQ_SCAN',        sub: 'movies · 5K rows', cat: 'scan',      x: 196, y: 240, w: 148 },
  { id: 'filter', label: 'FILTER',          sub: '12 rows · 0.1ms',  cat: 'filter',    x: 454, y: 240, w: 120 },
];
const HERO_EDGES = [
  ['agg','join'],['agg','sort'],
  ['join','scan1'],['join','scan2'],['sort','filter'],
];
const NH = 52;

function HeroPlan() {
  const nodeMap = Object.fromEntries(HERO_NODES.map(n => [n.id, n]));
  const W = 640, H = 320;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, display: 'block' }}>
      <defs>
        {/* Per-category glow filter */}
        <filter id="glow-agg" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
          <feColorMatrix in="blur" type="matrix"
            values="0.65 0 0.65 0 0.15   0 0 0.65 0 0   0.95 0 0.95 0 0.5   0 0 0 0.5 0"
            result="color" />
          <feMerge><feMergeNode in="color"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* Edges */}
      {HERO_EDGES.map(([from, to]) => {
        const s  = nodeMap[from], t = nodeMap[to];
        const sx = s.x + s.w / 2, sy = s.y + NH;
        const tx = t.x + t.w / 2, ty = t.y;
        const my = (sy + ty) / 2;
        return (
          <g key={`${from}-${to}`}>
            {/* Glow edge */}
            <path
              d={`M${sx},${sy} C${sx},${my} ${tx},${my} ${tx},${ty}`}
              stroke="rgba(91,159,255,0.12)" strokeWidth={4} fill="none"
            />
            {/* Main edge */}
            <path
              d={`M${sx},${sy} C${sx},${my} ${tx},${my} ${tx},${ty}`}
              stroke="rgba(24,32,56,0.9)" strokeWidth={1.5} fill="none"
            />
            {/* Arrow */}
            <polygon
              points={`${tx},${ty} ${tx-4},${ty-7} ${tx+4},${ty-7}`}
              fill="rgba(24,32,56,0.9)"
            />
          </g>
        );
      })}

      {/* Nodes */}
      {HERO_NODES.map((n, i) => {
        const color   = CAT_COLOR[n.cat] ?? '#7985B8';
        const isAgg   = n.cat === 'aggregate';
        const delay   = `${i * 0.1}s`;

        return (
          <g key={n.id} style={{ animation: `fadeUp 0.5s ${delay} both` }}>
            {/* Outer glow when aggregate */}
            {isAgg && (
              <rect
                x={n.x - 3} y={n.y - 3} width={n.w + 6} height={NH + 6} rx={11}
                fill="none" stroke={color} strokeWidth={1.5} opacity={0}
              >
                <animate attributeName="opacity" values="0;0.45;0" dur="2.4s" repeatCount="indefinite" />
                <animate attributeName="stroke-width" values="1;3;1" dur="2.4s" repeatCount="indefinite" />
              </rect>
            )}

            {/* Node body */}
            <rect
              x={n.x} y={n.y} width={n.w} height={NH} rx={8}
              fill={`rgba(${hexAlpha(color, 0.06)})`}
              stroke={color} strokeOpacity={0.30} strokeWidth={1}
            />

            {/* Coloured left accent bar */}
            <rect
              x={n.x + 1} y={n.y + 6} width={3} height={NH - 12} rx={2}
              fill={color} opacity={0.85}
            />

            {/* Operator name */}
            <text
              x={n.x + 14} y={n.y + NH / 2 - 6}
              fill={color}
              fontSize={11} fontFamily="JetBrains Mono, monospace"
              fontWeight="500"
              dominantBaseline="middle"
            >
              {n.label}
            </text>

            {/* Sub label */}
            <text
              x={n.x + 14} y={n.y + NH / 2 + 9}
              fill="rgba(121,133,184,0.8)"
              fontSize={9} fontFamily="JetBrains Mono, monospace"
              dominantBaseline="middle"
            >
              {n.sub}
            </text>
          </g>
        );
      })}

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </svg>
  );
}

/** Returns "r,g,b" from a hex colour for use in rgba() — no alpha channel. */
function hexAlpha(hex: string, _a: number): string {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `${r},${g},${b},${_a}`;
}

// ── Feature cards ─────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon:   '🌊',
    title:  'Volcano Model, Visualised',
    body:   'See the iterator model come alive. Every operator pulls rows from its child — scan, filter, join, aggregate. Not a diagram. A live engine.',
    accent: '#5B9FFF',
  },
  {
    icon:   '⚡',
    title:  'Actual vs Estimated Rows',
    body:   "After execution, EXPLAIN ANALYZE overlays actual row counts on the plan. When estimated and actual diverge, you'll see exactly where the planner was wrong.",
    accent: '#A78BFA',
  },
  {
    icon:   '⏱',
    title:  'Per-Operator Timing',
    body:   "Every node shows how long it ran. The bottleneck isn't the query — it's one operator. Find it in 3 seconds instead of 3 hours.",
    accent: '#FBBF24',
  },
  {
    icon:   '🧩',
    title:  'DuckDB In-Process',
    body:   'The engine runs entirely in your backend — no cloud, no latency, no setup. Real physical operators: HashJoin, SeqScan, HashGroupBy, TopN.',
    accent: '#34D399',
  },
  {
    icon:   '📚',
    title:  '10 Interactive Lessons',
    body:   'From "what is a plan" to reading EXPLAIN ANALYZE like a senior engineer. Each lesson runs live against real relational data.',
    accent: '#22D3EE',
  },
  {
    icon:   '🎓',
    title:  'Interview-Ready Knowledge',
    body:   'Hash joins, predicate pushdown, sort cost, N+1 patterns, sargable predicates — the topics that separate good SQL engineers from great ones.',
    accent: '#F87171',
  },
];

// ── Difficulty colours ────────────────────────────────────────────────────────

const DIFF_COLOR: Record<string, string> = {
  beginner:     '#34D399',
  intermediate: '#FBBF24',
  advanced:     '#F87171',
};
const DIFF_BG: Record<string, string> = {
  beginner:     'rgba(52,211,153,0.08)',
  intermediate: 'rgba(251,191,36,0.08)',
  advanced:     'rgba(248,113,113,0.08)',
};

function LensLogo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="10" cy="10" r="7" stroke="#58a6ff" strokeWidth="2" />
      <line x1="15.5" y1="15.5" x2="21" y2="21" stroke="#58a6ff" strokeWidth="2" strokeLinecap="round" />
      <circle cx="10" cy="10" r="3" fill="#58a6ff" opacity="0.3" />
    </svg>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Landing() {
  return (
    <div className="landing">

      {/* ── NAV ── */}
      <nav className="lnav">
        <div className="lnav-brand">
          <LensLogo size={22} />
          <span>Lens</span>
        </div>
        <div className="lnav-links">
          <Link to="/learn">Learn</Link>
          <Link to="/playground">Playground</Link>
          <Link to="/compare">Compare</Link>
          <a href="https://github.com/duckdb/duckdb" target="_blank" rel="noreferrer">
            DuckDB ↗
          </a>
        </div>
        <Link to="/playground" className="btn-primary" style={{ padding: '7px 20px', fontSize: 13, borderRadius: 7 }}>
          Open Playground →
        </Link>
      </nav>

      {/* ── HERO ── */}
      <section className="hero">
        {/* Badge */}
        <div className="hero-eyebrow">
          <span className="hero-badge">
            DuckDB · Volcano Model · EXPLAIN ANALYZE
          </span>
        </div>

        {/* Headline */}
        <h1 className="hero-title">
          Watch SQL execute.<br />
          <span className="hero-title-accent">Operator by operator.</span>
        </h1>

        {/* Sub */}
        <p className="hero-sub">
          Lens renders every physical operator your database chooses —
          hash joins, sequential scans, sort operators, aggregations.
          Write a query. See the plan. Understand the cost.
        </p>

        {/* CTAs */}
        <div className="hero-ctas">
          <Link to="/learn" className="btn-primary btn-lg">
            Start Learning →
          </Link>
          <Link to="/playground" className="btn-ghost btn-lg">
            Open Playground
          </Link>
        </div>

        {/* Browser-chrome plan tree */}
        <div className="hero-plan" style={{ animation: 'fadeUp 0.7s 0.25s both' }}>
          <div className="hero-plan-bar">
            <span className="hero-plan-dot" style={{ background: '#F87171' }} />
            <span className="hero-plan-dot" style={{ background: '#FBBF24' }} />
            <span className="hero-plan-dot" style={{ background: '#34D399' }} />
            <span className="hero-plan-title">Lens Playground — execution plan</span>
          </div>
          <div className="hero-plan-canvas">
            <HeroPlan />
          </div>
        </div>
      </section>

      {/* ── STATS STRIP ── */}
      <div className="stats-strip">
        {[
          { n: '10',    label: 'Guided lessons'     },
          { n: '20K',   label: 'Rows in demo data'  },
          { n: '3',     label: 'Relational tables'  },
          { n: '∞',     label: 'Custom SQL queries' },
        ].map(s => (
          <div key={s.label} className="stat-cell">
            <div className="stat-n">{s.n}</div>
            <div className="stat-l">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── HOW IT WORKS ── */}
      <section className="section">
        <div className="section-header">
          <div className="section-eyebrow">How Lens works</div>
          <h2 className="section-title">From SQL to execution plan in milliseconds</h2>
        </div>
        <div className="how-steps">
          {[
            {
              step:  '01',
              title: 'Write SQL',
              body:  'Type any query in the Monaco editor — with schema-aware autocomplete. Use built-in datasets or upload your own CSV.',
            },
            {
              step:  '02',
              title: 'DuckDB Plans It',
              body:  'The engine runs EXPLAIN FORMAT=JSON to extract the physical operator tree: which algorithms were chosen and in what order.',
            },
            {
              step:  '03',
              title: 'Watch It Execute',
              body:  'Operators highlight as data flows through them. Particle animations travel upward — child → parent — reflecting the Volcano model.',
            },
            {
              step:  '04',
              title: 'Read EXPLAIN ANALYZE',
              body:  'Actual row counts and per-operator timing overlay the plan. The bottleneck banner flags operators that dominate execution time.',
            },
          ].map(s => (
            <div key={s.step} className="how-step">
              <span className="how-step-n">{s.step}</span>
              <h3 className="how-step-title">{s.title}</h3>
              <p  className="how-step-body">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="section section-alt">
        <div className="section-header">
          <div className="section-eyebrow">What's inside</div>
          <h2 className="section-title">Everything you need to understand SQL engines</h2>
          <p className="section-sub">
            Built for engineers who want to go beyond writing queries and actually understand what the database does with them.
          </p>
        </div>
        <div className="feature-grid">
          {FEATURES.map(f => (
            <div
              key={f.title}
              className="feature-card"
              style={{ '--accent': f.accent } as React.CSSProperties}
            >
              <span className="feature-icon">{f.icon}</span>
              <h3 className="feature-title">{f.title}</h3>
              <p  className="feature-body">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── LEARNING PATH PREVIEW ── */}
      <section className="section">
        <div className="section-header">
          <div className="section-eyebrow">Learning path</div>
          <h2 className="section-title">10 lessons from scan to mastery</h2>
          <p className="section-sub">
            Each lesson pre-loads the playground with a query and a challenge.
            Run it. Modify it. Understand why the plan changed.
          </p>
        </div>

        <div className="lesson-strip">
          {LESSONS.map((l, i) => {
            const num = String(i + 1).padStart(2, '0');
            return (
              <Link
                key={l.id}
                to={`/learn/${l.id}`}
                className="lesson-strip-card"
                style={{ textDecoration: 'none' }}
              >
                <div className="lesson-strip-n" style={{ color: DIFF_COLOR[l.difficulty] }}>
                  {num}
                </div>
                <div className="lesson-strip-title">{l.title}</div>
                <div
                  className="lesson-strip-diff"
                  style={{
                    color:        DIFF_COLOR[l.difficulty],
                    background:   DIFF_BG[l.difficulty],
                    display:      'inline-block',
                    padding:      '2px 8px',
                    borderRadius: 100,
                  }}
                >
                  {l.difficulty}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── DEEP INTERNALS SPLIT ── */}
      <section className="section section-alt">
        <div className="split-section">
          <div className="split-text">
            <div className="section-eyebrow">Deep internals</div>
            <h2 className="section-title" style={{ textAlign: 'left', marginBottom: 20 }}>
              The Volcano iterator model,<br />demystified
            </h2>
            <p className="split-body">
              Every modern SQL engine — PostgreSQL, MySQL, DuckDB, BigQuery — is built on the Volcano model.
              Each operator implements a <code>next()</code> interface that pulls one row at a time from its children.
              Data flows <em>upward</em> through the tree.
            </p>
            <p className="split-body">
              This model explains everything: why ORDER BY is blocking, why filter pushdown matters, why the
              build side of a hash join is the smaller table, why COUNT(*) is O(n).
            </p>
            <p className="split-body">
              Lens makes this concrete. Not a textbook. A live engine.
            </p>
            <Link
              to="/learn/01-what-is-a-plan"
              className="btn-primary"
              style={{ marginTop: 12, display: 'inline-flex' }}
            >
              Lesson 01: What is a plan? →
            </Link>
          </div>

          <div className="split-visual">
            <div className="code-window">
              <div className="code-window-bar">
                <span className="dot" style={{ background: '#F87171' }} />
                <span className="dot" style={{ background: '#FBBF24' }} />
                <span className="dot" style={{ background: '#34D399' }} />
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', letterSpacing: '0.04em' }}>
                  EXPLAIN ANALYZE
                </span>
              </div>
              <pre className="code-window-body">
{`\x1b[38;5;111m┌─────────────────────────────────────┐\x1b[0m
\x1b[38;5;111m│\x1b[0m  \x1b[35mHASH_GROUP_BY\x1b[0m                      \x1b[38;5;111m│\x1b[0m
\x1b[38;5;111m│\x1b[0m  rows: \x1b[32m12\x1b[0m (est: 15)   \x1b[33m2.1ms\x1b[0m        \x1b[38;5;111m│\x1b[0m
\x1b[38;5;111m└──────────────┬──────────────────────┘\x1b[0m
               │
\x1b[38;5;111m┌──────────────▼──────────────────────┐\x1b[0m
\x1b[38;5;111m│\x1b[0m  \x1b[33mHASH_JOIN\x1b[0m                          \x1b[38;5;111m│\x1b[0m
\x1b[38;5;111m│\x1b[0m  rows: \x1b[32m18K\x1b[0m (est: 17.4K)  \x1b[33m14ms\x1b[0m    \x1b[38;5;111m│\x1b[0m
\x1b[38;5;111m└──────┬──────────────────┬────────────┘\x1b[0m
       │                  │
\x1b[38;5;111m┌──────▼───────┐\x1b[0m  \x1b[38;5;111m┌─────▼──────────┐\x1b[0m
\x1b[38;5;111m│\x1b[0m \x1b[34mSEQ_SCAN\x1b[0m     \x1b[38;5;111m│\x1b[0m  \x1b[38;5;111m│\x1b[0m \x1b[34mSEQ_SCAN\x1b[0m       \x1b[38;5;111m│\x1b[0m
\x1b[38;5;111m│\x1b[0m orders        \x1b[38;5;111m│\x1b[0m  \x1b[38;5;111m│\x1b[0m movies         \x1b[38;5;111m│\x1b[0m
\x1b[38;5;111m│\x1b[0m \x1b[32m20K rows\x1b[0m      \x1b[38;5;111m│\x1b[0m  \x1b[38;5;111m│\x1b[0m \x1b[32m5K rows\x1b[0m        \x1b[38;5;111m│\x1b[0m
\x1b[38;5;111m│\x1b[0m \x1b[33m8ms\x1b[0m           \x1b[38;5;111m│\x1b[0m  \x1b[38;5;111m│\x1b[0m \x1b[33m3ms\x1b[0m            \x1b[38;5;111m│\x1b[0m
\x1b[38;5;111m└──────────────┘\x1b[0m  \x1b[38;5;111m└────────────────┘\x1b[0m`
  .replace(/\x1b\[[0-9;]*m/g, '')
}
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="cta-section">
        <h2 className="cta-title">
          See the engine behind your SQL.
        </h2>
        <p className="cta-sub">
          Open the playground. Write a query. Watch it execute — one operator at a time.
        </p>
        <div className="hero-ctas" style={{ justifyContent: 'center' }}>
          <Link to="/learn" className="btn-primary btn-lg">
            Start the course →
          </Link>
          <Link to="/playground" className="btn-ghost btn-lg">
            Jump to playground
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="footer">
        <div className="footer-brand">
          <LensLogo size={18} />
          <span>Lens</span>
        </div>
        <span style={{ color: 'var(--text3)', fontSize: 12 }}>
          SQL execution, visualised.
        </span>
        <div className="footer-links">
          <Link to="/learn">Learn</Link>
          <Link to="/playground">Playground</Link>
          <Link to="/compare">Compare</Link>
          <span style={{ color: 'var(--text3)' }}>Powered by DuckDB 🦆</span>
        </div>
      </footer>

    </div>
  );
}
