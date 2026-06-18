"""
DuckDB-backed query executor.
- Persistent connection per WebSocket session (DDL persists across queries)
- Multi-statement splitting with per-statement type detection
- Structured error messages with line/column extraction
"""
from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import Any, Callable

import duckdb

from .planner import parse_explain_json, parse_explain_text

DATA_DIR = Path(__file__).parent.parent / "data"

BUILTIN_TABLES = {
    "movies":    DATA_DIR / "movies.csv",
    "customers": DATA_DIR / "customers.csv",
    "orders":    DATA_DIR / "orders.csv",
}

SAMPLE_QUERIES = [
    {
        "label": "Top genres by revenue",
        "sql": (
            "SELECT m.genre,\n"
            "       COUNT(*)            AS total_orders,\n"
            "       SUM(o.price_usd)    AS total_revenue,\n"
            "       AVG(m.rating)       AS avg_rating\n"
            "FROM   orders o\n"
            "JOIN   movies m ON o.movie_id = m.movie_id\n"
            "GROUP  BY m.genre\n"
            "ORDER  BY total_revenue DESC\n"
            "LIMIT  10"
        ),
    },
    {
        "label": "High-value customers",
        "sql": (
            "SELECT c.name,\n"
            "       c.country,\n"
            "       c.loyalty_tier,\n"
            "       COUNT(o.order_id)   AS orders,\n"
            "       SUM(o.price_usd)    AS lifetime_value\n"
            "FROM   customers c\n"
            "JOIN   orders o ON c.customer_id = o.customer_id\n"
            "WHERE  o.status = 'completed'\n"
            "GROUP  BY c.customer_id, c.name, c.country, c.loyalty_tier\n"
            "HAVING SUM(o.price_usd) > 200\n"
            "ORDER  BY lifetime_value DESC\n"
            "LIMIT  20"
        ),
    },
    {
        "label": "Monthly order trends",
        "sql": (
            "SELECT strftime(order_date, '%Y-%m') AS month,\n"
            "       COUNT(*)                       AS orders,\n"
            "       SUM(price_usd)                 AS revenue,\n"
            "       AVG(price_usd)                 AS avg_price\n"
            "FROM   orders\n"
            "WHERE  status = 'completed'\n"
            "GROUP  BY month\n"
            "ORDER  BY month"
        ),
    },
    {
        "label": "Best-rated movies with orders",
        "sql": (
            "SELECT m.title,\n"
            "       m.year,\n"
            "       m.genre,\n"
            "       m.rating,\n"
            "       COUNT(o.order_id) AS times_ordered\n"
            "FROM   movies m\n"
            "LEFT JOIN orders o ON m.movie_id = o.movie_id\n"
            "WHERE  m.rating >= 8.0\n"
            "GROUP  BY m.movie_id, m.title, m.year, m.genre, m.rating\n"
            "ORDER  BY m.rating DESC, times_ordered DESC\n"
            "LIMIT  25"
        ),
    },
    {
        "label": "Country revenue breakdown",
        "sql": (
            "SELECT c.country,\n"
            "       COUNT(DISTINCT c.customer_id) AS customers,\n"
            "       COUNT(o.order_id)             AS orders,\n"
            "       SUM(o.price_usd)              AS revenue\n"
            "FROM   customers c\n"
            "JOIN   orders o ON c.customer_id = o.customer_id\n"
            "GROUP  BY c.country\n"
            "ORDER  BY revenue DESC"
        ),
    },
]


# ── Connection factory ─────────────────────────────────────────────────────────

def make_conn(extra_tables: dict[str, str] | None = None) -> duckdb.DuckDBPyConnection:
    conn = duckdb.connect()
    conn.execute("SET enable_progress_bar = false")
    for name, path in BUILTIN_TABLES.items():
        if path.exists():
            conn.execute(
                f"CREATE TABLE IF NOT EXISTS {name} AS "
                f"SELECT * FROM read_csv_auto('{path.as_posix()}')"
            )
    if extra_tables:
        for name, path in extra_tables.items():
            safe_path = path.replace("'", "''")
            conn.execute(
                f"CREATE OR REPLACE TABLE {name} AS "
                f"SELECT * FROM read_csv_auto('{safe_path}')"
            )
    return conn


# Keep for backward compat
_make_conn = make_conn


def _schema_info(conn: duckdb.DuckDBPyConnection) -> list[dict]:
    schema: list[dict] = []
    try:
        tables = conn.execute(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema='main' ORDER BY table_name"
        ).fetchall()
        for (tbl,) in tables:
            cols = conn.execute(
                f"SELECT column_name, data_type FROM information_schema.columns "
                f"WHERE table_name='{tbl}' ORDER BY ordinal_position"
            ).fetchall()
            row_count = conn.execute(f"SELECT COUNT(*) FROM \"{tbl}\"").fetchone()[0]
            schema.append({
                "table":     tbl,
                "row_count": row_count,
                "columns":   [{"name": c, "type": t} for c, t in cols],
            })
    except Exception:
        pass
    return schema


# ── SQL statement splitting ────────────────────────────────────────────────────

def split_statements(sql: str) -> list[str]:
    """
    Split a SQL string into individual statements on ';',
    correctly ignoring semicolons inside string literals and comments.
    """
    stmts: list[str] = []
    buf:   list[str] = []
    i = 0
    n = len(sql)
    in_str    = False
    str_char  = ''
    in_line   = False   # -- comment
    in_block  = False   # /* comment */

    while i < n:
        ch = sql[i]

        if in_line:
            buf.append(ch)
            if ch == '\n':
                in_line = False
            i += 1
            continue

        if in_block:
            buf.append(ch)
            if ch == '*' and i + 1 < n and sql[i + 1] == '/':
                buf.append('/')
                i += 2
                in_block = False
            else:
                i += 1
            continue

        if in_str:
            buf.append(ch)
            if ch == str_char:
                # doubled quote = escaped
                if i + 1 < n and sql[i + 1] == str_char:
                    buf.append(sql[i + 1])
                    i += 2
                else:
                    in_str = False
                    i += 1
            else:
                i += 1
            continue

        # Normal context
        if ch in ("'", '"', '`'):
            in_str   = True
            str_char = ch
            buf.append(ch)
            i += 1
        elif ch == '-' and i + 1 < n and sql[i + 1] == '-':
            in_line = True
            buf.append(ch)
            i += 1
        elif ch == '/' and i + 1 < n and sql[i + 1] == '*':
            in_block = True
            buf.append(ch)
            i += 1
        elif ch == ';':
            stmt = ''.join(buf).strip()
            if stmt:
                stmts.append(stmt)
            buf = []
            i += 1
        else:
            buf.append(ch)
            i += 1

    # Trailing statement without semicolon
    stmt = ''.join(buf).strip()
    if stmt:
        stmts.append(stmt)

    return stmts


_SELECT_WORDS  = {'SELECT', 'WITH', 'VALUES', 'TABLE', 'SHOW', 'DESCRIBE',
                  'SUMMARIZE', 'PRAGMA', 'FROM', 'PIVOT', 'UNPIVOT'}
_DDL_WORDS     = {'CREATE', 'DROP', 'ALTER', 'TRUNCATE', 'RENAME', 'COMMENT'}
_DML_WORDS     = {'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'REPLACE'}
_EXPLAIN_WORDS = {'EXPLAIN'}


def classify(sql: str) -> str:
    """Return 'select' | 'ddl' | 'dml' | 'explain'."""
    first = re.match(r'(\w+)', sql.lstrip())
    if not first:
        return 'select'
    word = first.group(1).upper()
    if word in _EXPLAIN_WORDS:  return 'explain'
    if word in _DDL_WORDS:      return 'ddl'
    if word in _DML_WORDS:      return 'dml'
    return 'select'


def extract_error_location(msg: str) -> tuple[int | None, int | None]:
    """Try to extract (line, col) from a DuckDB error message."""
    m = re.search(r'LINE\s+(\d+)', msg, re.IGNORECASE)
    line = int(m.group(1)) if m else None
    m2 = re.search(r'COLUMN\s+(\d+)', msg, re.IGNORECASE)
    col = int(m2.group(1)) if m2 else None
    # Also try "line N, col M" patterns
    if not line:
        m3 = re.search(r'line[:\s]+(\d+)', msg, re.IGNORECASE)
        if m3:
            line = int(m3.group(1))
    return line, col


# ── Streaming executor ─────────────────────────────────────────────────────────

BATCH_SIZE = 500
MAX_ROWS   = 50_000   # cap per statement to prevent OOM on huge selects


def _rollback(conn: duckdb.DuckDBPyConnection) -> None:
    """Reset any aborted transaction state on the connection."""
    try:
        conn.execute("ROLLBACK")
    except Exception:
        pass


def _get_plan(conn: duckdb.DuckDBPyConnection, sql: str) -> dict | None:
    try:
        rows = conn.execute(f"EXPLAIN (FORMAT JSON) {sql}").fetchall()
        raw  = rows[0][1] if rows else '{}'
        return parse_explain_json(raw)
    except Exception:
        _rollback(conn)
    try:
        rows = conn.execute(f"EXPLAIN {sql}").fetchall()
        text = "\n".join(r[1] for r in rows if r)
        return parse_explain_text(text)
    except Exception:
        _rollback(conn)
        return None


def _get_stats_plan(conn: duckdb.DuckDBPyConnection, sql: str) -> dict | None:
    try:
        rows = conn.execute(f"EXPLAIN ANALYZE (FORMAT JSON) {sql}").fetchall()
        raw  = rows[0][1] if rows else '{}'
        return parse_explain_json(raw)
    except Exception:
        _rollback(conn)
        return None


def _find_matching_paren(s: str, start: int) -> int:
    """Return index just after the ')' matching '(' at position start."""
    depth = 1
    i = start + 1
    n = len(s)
    while i < n and depth > 0:
        c = s[i]
        if c in ("'", '"', '`'):
            q = c; i += 1
            while i < n:
                if s[i] == q:
                    if q == "'" and i + 1 < n and s[i + 1] == "'":
                        i += 2; continue
                    i += 1; break
                i += 1
        elif c == '-' and i + 1 < n and s[i + 1] == '-':
            while i < n and s[i] != '\n':
                i += 1
        elif c == '/' and i + 1 < n and s[i + 1] == '*':
            i += 2
            while i < n - 1:
                if s[i] == '*' and s[i + 1] == '/':
                    i += 2; break
                i += 1
        elif c == '(':
            depth += 1; i += 1
        elif c == ')':
            depth -= 1; i += 1
        else:
            i += 1
    return i


def _parse_with_ctes(sql: str) -> tuple[list[tuple[str, str]], str] | None:
    """
    Parse  WITH [name AS (body), ...] <main_query>.
    Returns ([(name, body), ...], main_query) or None if not parseable / RECURSIVE.
    """
    s = sql.strip()
    m = re.match(r'(?i)^WITH\b\s*', s)
    if not m:
        return None
    pos = m.end()
    if re.match(r'(?i)RECURSIVE\b', s[pos:]):
        return None  # recursive CTEs require special handling

    ctes: list[tuple[str, str]] = []
    while pos < len(s):
        nm = re.match(r'(\w+)', s[pos:])
        if not nm:
            return None
        name = nm.group(1)
        pos += nm.end()

        while pos < len(s) and s[pos].isspace():
            pos += 1
        if pos < len(s) and s[pos] == '(':  # optional column list
            pos = _find_matching_paren(s, pos)
            while pos < len(s) and s[pos].isspace():
                pos += 1

        # AS [NOT] MATERIALIZED
        am = re.match(r'(?i)AS\s*(?:(?:NOT\s+)?MATERIALIZED\s+)?', s[pos:])
        if not am:
            return None
        pos += am.end()

        if pos >= len(s) or s[pos] != '(':
            return None
        end = _find_matching_paren(s, pos)
        ctes.append((name, s[pos + 1 : end - 1]))
        pos = end

        while pos < len(s) and s[pos].isspace():
            pos += 1
        if pos < len(s) and s[pos] == ',':
            pos += 1
            while pos < len(s) and s[pos].isspace():
                pos += 1
        else:
            break

    main_query = s[pos:].strip()
    if not ctes or not main_query:
        return None
    return ctes, main_query


async def execute_and_stream(
    sql:          str,
    send:         Callable,
    conn:         duckdb.DuckDBPyConnection | None = None,
    extra_tables: dict[str, str] | None = None,
):
    """
    Execute one-or-many SQL statements and stream results.

    Events emitted:
      {type: "schema",      tables: [...]}
      {type: "stmt_start",  index, total, kind, sql_preview}
      {type: "plan",        tree}
      {type: "progress",    rows_done, elapsed_ms}
      {type: "results",     columns, rows, total, elapsed_ms}
      {type: "stats",       plan, elapsed_ms}
      {type: "ddl_result",  statement, kind, elapsed_ms, message}
      {type: "error",       message, line?, col?}
    """
    async def emit(obj: dict) -> None:
        await send(json.dumps(obj))

    owns_conn = conn is None
    try:
        if owns_conn:
            conn = make_conn(extra_tables)
        elif extra_tables:
            # Register new tables into existing session connection
            for name, path in extra_tables.items():
                safe = path.replace("'", "''")
                conn.execute(
                    f"CREATE OR REPLACE TABLE {name} AS "
                    f"SELECT * FROM read_csv_auto('{safe}')"
                )

        # Clear any aborted transaction state left over from a previous failed run
        # on this persistent connection before we start.
        _rollback(conn)

        await emit({"type": "schema", "tables": _schema_info(conn)})

        statements = split_statements(sql)
        if not statements:
            await emit({"type": "error", "message": "No SQL statements found.", "line": None, "col": None})
            return

        total = len(statements)

        for idx, stmt in enumerate(statements):
            kind = classify(stmt)
            preview = stmt.replace('\n', ' ')[:80]

            await emit({
                "type":        "stmt_start",
                "index":       idx,
                "total":       total,
                "kind":        kind,
                "sql_preview": preview,
            })

            t0 = time.perf_counter()
            elapsed = 0.0

            temp_tables: list[str] = []
            try:
                # ── SELECT / WITH / VALUES → stream plan + rows ──────────────
                if kind in ('select', 'explain'):
                    # Pre-exec plan (skip if statement IS an explain already)
                    if kind == 'select':
                        plan = _get_plan(conn, stmt)
                        if plan:
                            await emit({"type": "plan", "tree": plan})

                    exec_sql = stmt
                    try:
                        cursor = conn.execute(stmt)
                    except Exception as _je:
                        # DuckDB can't do non-inner joins directly on certain subquery
                        # types (PIVOT, CUBE, complex window CTEs). Workaround: materialize
                        # each CTE as a temp table, then run the main query against them.
                        if 'non-inner join' not in str(_je).lower():
                            raise
                        parsed = _parse_with_ctes(stmt)
                        if parsed is None:
                            raise
                        _rollback(conn)
                        cte_list, exec_sql = parsed
                        for _cname, _cbody in cte_list:
                            conn.execute(
                                f'CREATE OR REPLACE TEMP TABLE "{_cname}" AS ({_cbody})'
                            )
                            temp_tables.append(_cname)
                        cursor = conn.execute(exec_sql)

                    cols   = [d[0] for d in (cursor.description or [])]
                    rows:  list[list[Any]] = []

                    while True:
                        batch = cursor.fetchmany(BATCH_SIZE)
                        if not batch:
                            break
                        for raw_row in batch:
                            rows.append([_serialise(v) for v in raw_row])
                        elapsed = round((time.perf_counter() - t0) * 1000, 1)
                        await emit({
                            "type":      "progress",
                            "rows_done": len(rows),
                            "elapsed_ms": elapsed,
                        })
                        if len(rows) >= MAX_ROWS:
                            break   # truncate; warn in results

                    elapsed = round((time.perf_counter() - t0) * 1000, 1)
                    await emit({
                        "type":       "results",
                        "columns":    cols,
                        "rows":       rows,
                        "total":      len(rows),
                        "elapsed_ms": elapsed,
                        "truncated":  len(rows) >= MAX_ROWS,
                    })

                    # Post-exec plan with actual timings
                    if kind == 'select':
                        stats = _get_stats_plan(conn, exec_sql)
                        if stats:
                            await emit({"type": "stats", "plan": stats, "elapsed_ms": elapsed})

                    for _tname in temp_tables:
                        try:
                            conn.execute(f'DROP TABLE IF EXISTS "{_tname}"')
                        except Exception:
                            pass
                    temp_tables = []

                # ── DDL (CREATE / DROP / ALTER / TRUNCATE) ───────────────────
                elif kind == 'ddl':
                    conn.execute(stmt)
                    elapsed = round((time.perf_counter() - t0) * 1000, 1)

                    # Re-emit updated schema so sidebar refreshes
                    await emit({"type": "schema", "tables": _schema_info(conn)})
                    await emit({
                        "type":       "ddl_result",
                        "statement":  preview,
                        "kind":       kind,
                        "elapsed_ms": elapsed,
                        "message":    _ddl_message(stmt),
                    })

                # ── DML (INSERT / UPDATE / DELETE) ───────────────────────────
                else:
                    cursor = conn.execute(stmt)
                    elapsed = round((time.perf_counter() - t0) * 1000, 1)
                    affected = cursor.rowcount if hasattr(cursor, 'rowcount') else None

                    await emit({"type": "schema", "tables": _schema_info(conn)})
                    await emit({
                        "type":       "ddl_result",
                        "statement":  preview,
                        "kind":       kind,
                        "elapsed_ms": elapsed,
                        "message":    _dml_message(stmt, affected),
                    })

            except Exception as exc:
                msg  = str(exc)
                line, col = extract_error_location(msg)
                # Adjust line number to be relative to this statement's start in the full SQL
                if line is not None and idx > 0:
                    stmt_start_line = sql[:sql.find(stmt)].count('\n') + 1
                    line = stmt_start_line + line - 1
                for _tname in temp_tables:
                    try:
                        conn.execute(f'DROP TABLE IF EXISTS "{_tname}"')
                    except Exception:
                        pass
                # Reset connection so subsequent runs on this session don't get
                # "TransactionContext Error: Current transaction is aborted"
                _rollback(conn)
                await emit({"type": "error", "message": msg, "line": line, "col": col})
                return   # stop on first error

    except Exception as exc:
        msg = str(exc)
        line, col = extract_error_location(msg)
        await emit({"type": "error", "message": msg, "line": line, "col": col})
    finally:
        if owns_conn and conn:
            conn.close()


def _ddl_message(sql: str) -> str:
    first = re.match(r'(\w+)\s+(\w+)(?:\s+IF\s+(?:NOT\s+)?EXISTS)?\s+(\S+)', sql.strip(), re.IGNORECASE)
    if first:
        verb   = first.group(1).capitalize()
        kind   = first.group(2).capitalize()
        target = first.group(3).strip('"').strip("'")
        return f"{verb}d {kind} '{target}'"
    return "DDL executed"


def _dml_message(sql: str, affected: int | None) -> str:
    verb = sql.strip().split()[0].capitalize()
    suffix = f" — {affected} row(s)" if affected is not None and affected >= 0 else ""
    return f"{verb}ed{suffix}"


def _serialise(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, (int, float, str, bool)):
        return v
    return str(v)
