---
title: Lens SQL
emoji: 🔍
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
---

<div align="center">

# Lens — Live SQL Execution Visualizer

**Watch every physical operator your database chooses. In real time.**

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111+-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![DuckDB](https://img.shields.io/badge/DuckDB-0.10+-FFF000?style=flat-square&logo=duckdb&logoColor=black)](https://duckdb.org)
[![Hugging Face](https://img.shields.io/badge/Deploy-Hugging%20Face-FFD21E?style=flat-square&logo=huggingface&logoColor=black)](https://huggingface.co/spaces/twinkle8781/lens-sql)

[**Live Demo**](https://twinkle8781-lens-sql.hf.space) · [**Playground**](https://twinkle8781-lens-sql.hf.space/playground) · [**10 Interactive Lessons**](https://twinkle8781-lens-sql.hf.space/learn)

</div>

---

## What is Lens?

Most developers write SQL. Very few understand what the database *does* with it.

Lens bridges that gap. Write any SQL query and watch the engine's physical execution plan come alive — hash joins, sequential scans, sort operators, aggregations — each operator animated as data flows through the [Volcano iterator model](https://en.wikipedia.org/wiki/Volcano_model) from leaves to root.

It's not a diagram. It's a live engine.

```sql
SELECT m.genre, COUNT(*) AS orders, SUM(o.price_usd) AS revenue
FROM   orders o
JOIN   movies m ON o.movie_id = m.movie_id
GROUP  BY m.genre
ORDER  BY revenue DESC
```

Run that. Lens shows you: two sequential scans feed a hash join, which feeds a hash group-by, which feeds a sort. Every operator's row count and millisecond timing — overlaid on the tree.

---

## Features

### Core Visualizer
- **Live plan tree** — DuckDB's physical operator graph rendered as an animated SVG tree, with particle flow moving upward (child → parent) to reflect the Volcano model
- **EXPLAIN ANALYZE overlay** — actual vs. estimated row counts and per-operator timing surfaced directly on each node after execution
- **Bottleneck banner** — automatically flags the operator consuming >40% of total execution time, so you spot the slow path immediately
- **Monaco editor** — VS Code's editor embedded in the browser, with SQL syntax highlighting and schema-aware autocomplete

### Query Tooling
- **Command palette** (`Cmd/Ctrl+K`) — fuzzy-search across sample queries, schema tables, lessons, and actions
- **Query history** — every run persisted to `localStorage`, searchable and one-click re-loadable
- **URL sharing** — the active query is encoded in the URL so any run is directly linkable
- **Side-by-side compare** — split-screen view with two independent DuckDB sessions to benchmark query variants head-to-head
- **CSV export** — download any result set as a file; truncation warning at 500 rows

### Data Layer
- **3 built-in relational tables** — `movies` (5K rows), `orders` (20K rows), `customers` (10K rows) — real data with cross-table foreign key relationships
- **CSV upload** — drag-and-drop any CSV; Lens registers it as a queryable table in the active DuckDB session
- **Data generator** — create synthetic datasets (e-commerce, social, financial) with configurable row counts and inject them into the session instantly
- **Multi-database support** — connect to PostgreSQL, SQLite, or MySQL alongside the built-in DuckDB instance

### AI Assistant
- **Groq-powered error explainer** — when a query fails, an LLM (Llama 3.3 70B) streams a structured explanation: what went wrong, the root cause, and the corrected SQL

### Learning Path
- **10 progressive lessons** — from "what is a query plan" to reading `EXPLAIN ANALYZE` like a senior engineer
- Each lesson pre-loads the playground with a real query, a challenge, and conceptual scaffolding
- Topics: sequential scans, projections, cost estimation, sorting, aggregation, hash joins, complex joins, subqueries/CTEs, optimization patterns, EXPLAIN ANALYZE deep-dive

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (Vite + React)                  │
│                                                                 │
│  Landing  ─→  Learn  ─→  Lesson  ─→  Playground  ─→  Compare  │
│                                                                 │
│  Monaco Editor   PlanTree (SVG)   ResultsTable   CommandPalette │
│  StatsBar        BottleneckBanner  Sidebar/History  DataGen     │
│                                                                 │
│  useExecution hook ─── persistent WebSocket ──────────────────┐ │
└──────────────────────────────────────────────────────────────┼─┘
                                                               │
                               WebSocket /ws/query            │
                                                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                     FastAPI Backend (Python)                     │
│                                                                  │
│  /ws/query  ──→  executor.py  ──→  DuckDB (in-process)          │
│                       │                                          │
│                  planner.py (EXPLAIN FORMAT=JSON parser)         │
│                  adapters.py (PostgreSQL / SQLite / MySQL)       │
│                  datagen.py  (synthetic data templates)          │
│                  connection_store.py (multi-DB registry)         │
│                                                                  │
│  /api/ai/explain  ──→  Groq API (streaming SSE)                  │
│  /assets/* + /*   ──→  frontend/dist (SPA fallback)             │
└──────────────────────────────────────────────────────────────────┘
```

**Key design decisions:**

| Decision | Why |
|---|---|
| DuckDB runs in-process | No external DB server needed; sub-millisecond plan extraction via `EXPLAIN FORMAT=JSON` |
| WebSocket per session | DDL statements (`CREATE TABLE`, `INSERT`) persist across queries in the same tab |
| Volcano particle animation | Arrows travel upward — leaf scans → parent operators — because that's how the model actually works |
| Frontend served from backend | Single Docker container; no CORS configuration needed in production |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | React 18 + TypeScript 5 |
| Build tool | Vite 5 |
| Code editor | Monaco Editor (VS Code engine) |
| Routing | React Router v7 |
| Charts / SVG | D3 v7 + hand-rolled SVG animations |
| Backend framework | FastAPI 0.111 |
| ASGI server | Uvicorn |
| Database engine | DuckDB 0.10 |
| AI inference | Groq API (Llama 3.3 70B) |
| Deployment | Hugging Face Spaces (Docker) |

---

## Local Development

### Prerequisites

- Python 3.11+
- Node.js 18+
- npm 9+

### 1. Clone

```bash
git clone https://github.com/Menatic/Lens_SQL.git
cd Lens_SQL
```

### 2. Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The API is now at `http://localhost:8000`. The backend auto-seeds the three demo tables (`movies`, `orders`, `customers`) from the CSV files in `backend/data/` on first run.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` and `/ws` to the backend — no CORS setup required.

### 4. AI (optional)

Create `backend/.env`:

```env
GROQ_API_KEY=your_key_here
GROQ_MODEL=llama-3.3-70b-versatile
```

Get a free key at [console.groq.com](https://console.groq.com). The app works fully without it — the AI panel just shows a "not configured" message.

---

## Deployment on Hugging Face Spaces

This repo deploys as a **single Docker container** — the frontend is built at image-build time and served as static files from the FastAPI backend. No separate frontend service needed.

### Live deployment

[huggingface.co/spaces/twinkle8781/lens-sql](https://huggingface.co/spaces/twinkle8781/lens-sql)

### Deploy your own

1. Create a free account at [huggingface.co](https://huggingface.co)
2. New Space → **SDK: Docker** → choose CPU Basic (free)
3. Add HF as a git remote and push:

```bash
git remote add hf https://huggingface.co/spaces/YOUR_USERNAME/YOUR_SPACE_NAME
git push hf main
```

HF Spaces builds automatically from the `Dockerfile`. The multi-stage build installs Node dependencies, compiles the React frontend, installs Python dependencies, then starts uvicorn — all in one container.

**Build pipeline:**
```
npm install + npm run build   →  frontend/dist/
pip install -r backend/requirements.txt
cd /app/backend && uvicorn main:app --host 0.0.0.0 --port 7860
```

### Environment variables (optional)

Set these in the Space's **Settings → Variables** tab:

| Variable | Description |
|---|---|
| `GROQ_API_KEY` | Enables the AI SQL error explainer |
| `GROQ_MODEL` | LLM to use (default: `llama-3.3-70b-versatile`) |

No database URL needed — DuckDB runs in-process.

---

## Project Structure

```
Lens_SQL/
├── backend/
│   ├── main.py                  # FastAPI app, WebSocket handler, static serving
│   ├── requirements.txt
│   ├── data/
│   │   ├── movies.csv           # 5,000 rows
│   │   ├── orders.csv           # 20,000 rows
│   │   └── customers.csv        # 10,000 rows
│   └── engine/
│       ├── executor.py          # DuckDB runner, EXPLAIN streaming, multi-statement split
│       ├── planner.py           # EXPLAIN FORMAT=JSON → plan tree parser
│       ├── adapters.py          # PostgreSQL / SQLite / MySQL connectors
│       ├── datagen.py           # Synthetic dataset generator
│       └── connection_store.py  # Multi-DB connection registry
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx              # Root layout, editor, tab bar, command palette wiring
│   │   ├── components/
│   │   │   ├── PlanTree.tsx     # SVG plan tree with Volcano particle animation + SVG export
│   │   │   ├── ResultsTable.tsx # Table + Profile tabs, CSV export, 500-row truncation
│   │   │   ├── StatsBar.tsx     # Status pill, row counts, elapsed time
│   │   │   ├── BottleneckBanner.tsx  # Flags operators >40% of total time
│   │   │   ├── CommandPalette.tsx    # Cmd+K fuzzy-search modal
│   │   │   ├── Sidebar.tsx           # History tab (localStorage) + schema explorer
│   │   │   ├── ConnectionPicker.tsx  # Multi-DB connection switcher
│   │   │   └── DataGen.tsx           # Synthetic data generator UI
│   │   ├── hooks/
│   │   │   └── useExecution.ts  # Persistent WebSocket, plan/result state machine
│   │   ├── pages/
│   │   │   ├── Landing.tsx      # Marketing page with live plan SVG preview
│   │   │   ├── Learn.tsx        # Lesson catalog (10 cards)
│   │   │   ├── Lesson.tsx       # Individual lesson with embedded playground
│   │   │   └── Compare.tsx      # Side-by-side dual-query comparison
│   │   ├── data/
│   │   │   └── lessons.ts       # 10 lesson definitions with starter SQL + concepts
│   │   └── types/index.ts       # Shared TypeScript types
│   ├── package.json
│   └── vite.config.ts           # Dev proxy + Monaco optimizeDeps
│
├── Dockerfile                   # Multi-stage build: Node (frontend) + Python (backend)
├── fly.toml                     # Fly.io config (alternative deployment option)
└── README.md
```

---

## The Volcano Model

Every modern SQL engine — DuckDB, PostgreSQL, MySQL, BigQuery — is built on the Volcano (or iterator) model. Each operator implements a `next()` interface:

```
HASH_GROUP_BY.next()
  └── calls HASH_JOIN.next()
        ├── calls SEQ_SCAN(orders).next()   →  pull one row
        └── calls SEQ_SCAN(movies).next()   →  pull one row
```

Data flows **upward** — leaves produce rows, parents consume them. This is why:
- `ORDER BY` is **blocking** (must see all rows before emitting any)
- Filter pushdown **matters** (filter at the scan, not after the join)
- The **build side** of a hash join is always the smaller table
- `COUNT(*)` is **O(n)** — it must iterate every row

Lens makes this concrete. Every particle in the animation is a row. Every edge is a `next()` call. Not a textbook. A live engine.

---

## Sample Queries to Try

```sql
-- Which operator dominates? Watch the bottleneck banner light up.
SELECT m.genre, AVG(m.rating), COUNT(*) AS cnt
FROM orders o JOIN movies m ON o.movie_id = m.movie_id
GROUP BY m.genre ORDER BY cnt DESC;

-- Predicate pushdown: filter before the join
SELECT * FROM orders o
JOIN movies m ON o.movie_id = m.movie_id
WHERE m.genre = 'Action' AND o.price_usd > 15;

-- Subquery vs CTE — compare the plans side by side
WITH top_movies AS (
  SELECT movie_id FROM movies WHERE rating > 4.5
)
SELECT COUNT(*) FROM orders WHERE movie_id IN (SELECT movie_id FROM top_movies);

-- Window function — new operator class appears in the plan
SELECT customer_id,
       SUM(price_usd) OVER (PARTITION BY customer_id ORDER BY created_at) AS running_total
FROM orders LIMIT 100;
```

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `WS` | `/ws/query` | Execute SQL, stream plan + rows |
| `GET` | `/api/samples` | Built-in sample queries |
| `GET` | `/api/schema` | Current session's table list + column types |
| `POST` | `/api/upload` | Upload a CSV file as a queryable table |
| `GET` | `/api/datagen/templates` | Available synthetic data templates |
| `POST` | `/api/datagen/generate` | Generate and inject a synthetic table |
| `GET` | `/api/connections` | List multi-DB connections |
| `POST` | `/api/connections` | Add a PostgreSQL / SQLite / MySQL connection |
| `DELETE` | `/api/connections/{id}` | Remove a connection |
| `GET` | `/api/ai/status` | Check whether Groq API key is configured |
| `POST` | `/api/ai/explain` | Stream an AI explanation for a SQL error |

**WebSocket message format:**

```jsonc
// Send
{ "type": "run", "sql": "SELECT ...", "connection_id": "__duckdb__" }
{ "type": "reset", "connection_id": "__duckdb__" }

// Receive
{ "type": "plan",  "plan": { "operator": "HASH_GROUP_BY", "children": [...] } }
{ "type": "row",   "row": { "genre": "Action", "revenue": 14320.50 } }
{ "type": "done",  "rows": 12, "elapsed_ms": 18.4 }
{ "type": "error", "message": "..." }
```

---

## Lessons Overview

| # | Title | Difficulty | Key concepts |
|---|---|---|---|
| 01 | What Is a Query Plan? | Beginner | Physical vs logical plan, operators |
| 02 | Table Scans | Beginner | SeqScan, filter pushdown, index |
| 03 | Projections and Cost | Beginner | Column pruning, cost estimation |
| 04 | Sorting | Intermediate | ORDER BY blocking, TopN optimization |
| 05 | Aggregation | Intermediate | HashGroupBy, streaming aggregation |
| 06 | Joins: Introduction | Intermediate | Hash join, build vs probe side |
| 07 | Complex Joins | Advanced | Multi-way joins, join reordering |
| 08 | Subqueries and CTEs | Advanced | Decorrelation, materialization |
| 09 | Optimization Patterns | Advanced | Sargable predicates, N+1, predicate pushdown |
| 10 | EXPLAIN ANALYZE Deep Dive | Advanced | Actual vs estimated rows, timing, diagnosis |

---

<div align="center">

Built with DuckDB 🦆 · Powered by the Volcano iterator model · Deployed on Hugging Face Spaces

</div>
