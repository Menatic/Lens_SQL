"""
Database adapters — DuckDB, PostgreSQL, SQLite, MySQL.
Each adapter streams the same WebSocket event protocol so the frontend stays unchanged.
"""
from __future__ import annotations

import asyncio
import json
import re
import sqlite3
import time
import uuid
from abc import ABC, abstractmethod
from typing import Any, Callable

from .executor import (
    split_statements, classify, extract_error_location,
    _serialise, _ddl_message, _dml_message,
    BATCH_SIZE, MAX_ROWS,
)

# ── Optional driver imports ────────────────────────────────────────────────────

try:
    import psycopg2
    import psycopg2.extras
    HAS_PG = True
except ImportError:
    HAS_PG = False

try:
    import mysql.connector
    HAS_MYSQL = True
except ImportError:
    try:
        import pymysql as mysql_driver   # type: ignore
        HAS_MYSQL = True
    except ImportError:
        HAS_MYSQL = False


# ── Abstract base ─────────────────────────────────────────────────────────────

class DBAdapter(ABC):
    type_id:   str = 'unknown'
    type_name: str = 'Unknown'

    @abstractmethod
    async def test(self) -> None:
        """Raise on connection failure."""

    @abstractmethod
    async def schema(self) -> list[dict]:
        """Return [{table, row_count, columns:[{name,type}]}]"""

    @abstractmethod
    async def execute(self, sql: str, send: Callable) -> None:
        """Execute SQL; stream WS events via send(json_str)."""

    def close(self) -> None:
        pass

    def info(self, conn_id: str, label: str) -> dict:
        return {'id': conn_id, 'type': self.type_id, 'label': label}


async def _run_sync(fn, *args):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, fn, *args)


# ── PostgreSQL ─────────────────────────────────────────────────────────────────

def _pg_dsn(c: dict) -> str:
    parts = [
        f"host={c.get('host', 'localhost')}",
        f"port={c.get('port', 5432)}",
        f"dbname={c.get('database', 'postgres')}",
        f"user={c.get('username', 'postgres')}",
    ]
    if c.get('password'):
        parts.append(f"password={c['password']}")
    if c.get('ssl'):
        parts.append("sslmode=require")
    return ' '.join(parts)


PG_CATEGORY: dict[str, str] = {
    'Seq Scan': 'scan', 'Index Scan': 'scan', 'Index Only Scan': 'scan',
    'Bitmap Index Scan': 'scan', 'Bitmap Heap Scan': 'scan',
    'CTE Scan': 'scan', 'Subquery Scan': 'scan', 'Function Scan': 'scan',
    'Values Scan': 'scan', 'Sample Scan': 'scan', 'Tid Scan': 'scan',
    'WorkTable Scan': 'scan', 'Named Tuplestore Scan': 'scan',
    'Hash Join': 'join', 'Nested Loop': 'join', 'Merge Join': 'join',
    'Hash Aggregate': 'aggregate', 'Group Aggregate': 'aggregate',
    'Aggregate': 'aggregate', 'MixedAggregate': 'aggregate',
    'Sort': 'sort', 'Incremental Sort': 'sort',
    'Limit': 'limit',
    'Unique': 'set', 'HashSetOp': 'set', 'Append': 'set',
    'MergeAppend': 'set', 'Recursive Union': 'set',
    'Result': 'project', 'ProjectSet': 'project',
    'Gather': 'other', 'Gather Merge': 'other', 'Memoize': 'other',
    'Materialize': 'other', 'LockRows': 'other', 'ModifyTable': 'other',
    'Hash': 'other', 'SetOp': 'set',
}


def _pg_node(node: dict) -> dict:
    ntype    = node.get('Node Type', 'Unknown')
    category = PG_CATEGORY.get(ntype, 'other')
    extra    = {}
    for k in ('Join Type', 'Index Name', 'Filter', 'Hash Cond', 'Join Filter',
              'Index Cond', 'Recheck Cond', 'Sort Key', 'Group Key',
              'Startup Cost', 'Total Cost', 'Rows Removed by Filter',
              'Parallel Aware', 'Strategy'):
        if k in node:
            v = node[k]
            extra[k] = ', '.join(v) if isinstance(v, list) else str(v)
    table = node.get('Relation Name') or node.get('CTE Name') or node.get('Function Name')
    alias = node.get('Alias')
    if table and alias and alias != table:
        table = f"{table} {alias}"
    return {
        'id':          uuid.uuid4().hex[:8],
        'name':        ntype,
        'category':    category,
        'table':       table,
        'extra':       extra,
        'children':    [_pg_node(p) for p in node.get('Plans', [])],
        'est_rows':    node.get('Plan Rows'),
        'actual_rows': node.get('Actual Rows'),
        'time_ms':     node.get('Actual Total Time'),
    }


def parse_pg_plan(raw) -> dict | None:
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
        if isinstance(data, list):
            data = data[0]
        return _pg_node(data.get('Plan', data))
    except Exception:
        return None


def _pg_error_location(msg: str):
    m = re.search(r'LINE\s+(\d+)', msg, re.I)
    line = int(m.group(1)) if m else None
    m2 = re.search(r'(\^)', msg)
    col = None
    if m2 and line:
        # count spaces before caret in the line after LINE N
        lines = msg.split('\n')
        for i, ln in enumerate(lines):
            if '^' in ln:
                col = ln.index('^') + 1
                break
    return line, col


class PostgreSQLAdapter(DBAdapter):
    type_id   = 'postgresql'
    type_name = 'PostgreSQL'

    def __init__(self, config: dict):
        self.config = config
        self.dsn    = _pg_dsn(config)

    def _connect(self):
        if not HAS_PG:
            raise RuntimeError("psycopg2 not installed. Run: pip install psycopg2-binary")
        return psycopg2.connect(self.dsn)

    async def test(self):
        def _t():
            c = self._connect(); c.close()
        await _run_sync(_t)

    async def schema(self) -> list[dict]:
        def _s():
            conn = self._connect()
            cur  = conn.cursor()
            cur.execute(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema='public' ORDER BY table_name"
            )
            tables = [r[0] for r in cur.fetchall()]
            result = []
            for tbl in tables:
                cur.execute(
                    "SELECT column_name, data_type FROM information_schema.columns "
                    "WHERE table_name=%s ORDER BY ordinal_position", (tbl,)
                )
                cols = [{'name': r[0], 'type': r[1]} for r in cur.fetchall()]
                try:
                    cur.execute(f'SELECT COUNT(*) FROM "{tbl}"')
                    count = cur.fetchone()[0]
                except Exception:
                    count = 0
                result.append({'table': tbl, 'row_count': count, 'columns': cols})
            conn.close()
            return result
        return await _run_sync(_s)

    async def execute(self, sql: str, send: Callable):
        async def emit(obj): await send(json.dumps(obj))

        try:
            schema = await self.schema()
            await emit({'type': 'schema', 'tables': schema})
        except Exception as e:
            await emit({'type': 'error', 'message': str(e)})
            return

        stmts = split_statements(sql)
        if not stmts:
            await emit({'type': 'error', 'message': 'No SQL statements found.'})
            return
        total = len(stmts)

        for idx, stmt in enumerate(stmts):
            kind    = classify(stmt)
            preview = stmt.replace('\n', ' ')[:80]
            await emit({'type': 'stmt_start', 'index': idx, 'total': total, 'kind': kind, 'sql_preview': preview})
            t0 = time.perf_counter()

            try:
                def _exec(stmt=stmt, kind=kind):
                    conn = self._connect()
                    cur  = conn.cursor()
                    plan = None

                    if kind in ('select', 'explain'):
                        # Estimated plan (no ANALYZE to avoid double-running)
                        try:
                            cur.execute(f"EXPLAIN (FORMAT JSON) {stmt}")
                            plan = parse_pg_plan(cur.fetchall()[0][0])
                        except Exception:
                            pass
                        cur.execute(stmt)
                        cols = [d[0] for d in (cur.description or [])]
                        rows = cur.fetchmany(MAX_ROWS)
                        result_rows = [[_serialise(v) for v in row] for row in rows]
                        conn.close()
                        return ('select', plan, cols, result_rows)
                    else:
                        cur.execute(stmt)
                        affected = cur.rowcount
                        conn.commit()
                        conn.close()
                        return ('dml', None, None, affected)

                rtype, plan, cols, data = await _run_sync(_exec)
                elapsed = round((time.perf_counter() - t0) * 1000, 1)

                if rtype == 'select':
                    if plan:
                        await emit({'type': 'plan', 'tree': plan})
                    await emit({'type': 'results', 'columns': cols, 'rows': data, 'total': len(data), 'elapsed_ms': elapsed})
                else:
                    schema = await self.schema()
                    await emit({'type': 'schema', 'tables': schema})
                    await emit({'type': 'ddl_result', 'statement': preview, 'kind': kind, 'elapsed_ms': elapsed,
                                'message': f"OK — {data if data >= 0 else '?'} row(s) affected"})

            except Exception as exc:
                msg  = str(exc)
                line, col = _pg_error_location(msg)
                if line is None:
                    line, col = extract_error_location(msg)
                await emit({'type': 'error', 'message': msg, 'line': line, 'col': col})
                return


# ── SQLite ────────────────────────────────────────────────────────────────────

class SQLiteAdapter(DBAdapter):
    type_id   = 'sqlite'
    type_name = 'SQLite'

    def __init__(self, config: dict):
        self.path = config.get('filepath', ':memory:')

    def _connect(self):
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        return conn

    async def test(self):
        def _t(): c = self._connect(); c.close()
        await _run_sync(_t)

    async def schema(self) -> list[dict]:
        def _s():
            conn   = self._connect()
            cur    = conn.cursor()
            cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            tables = [r[0] for r in cur.fetchall()]
            result = []
            for tbl in tables:
                cur.execute(f'PRAGMA table_info("{tbl}")')
                cols = [{'name': r['name'], 'type': r['type'] or 'TEXT'} for r in cur.fetchall()]
                try:
                    cur.execute(f'SELECT COUNT(*) FROM "{tbl}"')
                    count = cur.fetchone()[0]
                except Exception:
                    count = 0
                result.append({'table': tbl, 'row_count': count, 'columns': cols})
            conn.close()
            return result
        return await _run_sync(_s)

    async def execute(self, sql: str, send: Callable):
        async def emit(obj): await send(json.dumps(obj))

        try:
            await emit({'type': 'schema', 'tables': await self.schema()})
        except Exception as e:
            await emit({'type': 'error', 'message': str(e)})
            return

        stmts = split_statements(sql)
        if not stmts:
            await emit({'type': 'error', 'message': 'No SQL statements found.'})
            return
        total = len(stmts)

        for idx, stmt in enumerate(stmts):
            kind    = classify(stmt)
            preview = stmt.replace('\n', ' ')[:80]
            await emit({'type': 'stmt_start', 'index': idx, 'total': total, 'kind': kind, 'sql_preview': preview})
            t0 = time.perf_counter()

            try:
                def _exec(stmt=stmt, kind=kind):
                    conn = self._connect()
                    cur  = conn.cursor()
                    plan_text = None

                    if kind in ('select', 'explain'):
                        try:
                            cur.execute(f"EXPLAIN QUERY PLAN {stmt}")
                            rows = cur.fetchall()
                            plan_text = '\n'.join(
                                f"{'  ' * r['detail'].count('SCAN')} {r['detail']}"
                                if 'detail' in r.keys() else str(tuple(r))
                                for r in rows
                            )
                        except Exception:
                            pass
                        cur.execute(stmt)
                        cols  = [d[0] for d in (cur.description or [])]
                        rows  = cur.fetchmany(MAX_ROWS)
                        rrows = [[_serialise(v) for v in list(row)] for row in rows]
                        conn.close()
                        return ('select', plan_text, cols, rrows)
                    else:
                        cur.execute(stmt)
                        affected = cur.rowcount
                        conn.commit()
                        conn.close()
                        return ('dml', None, None, affected)

                rtype, plan_text, cols, data = await _run_sync(_exec)
                elapsed = round((time.perf_counter() - t0) * 1000, 1)

                if rtype == 'select':
                    # SQLite plan is text-only; send as a DDL message so it shows in Messages tab
                    if plan_text:
                        await emit({'type': 'ddl_result', 'statement': 'EXPLAIN QUERY PLAN',
                                    'kind': 'explain', 'elapsed_ms': 0, 'message': plan_text})
                    await emit({'type': 'results', 'columns': cols, 'rows': data, 'total': len(data), 'elapsed_ms': elapsed})
                else:
                    await emit({'type': 'schema', 'tables': await self.schema()})
                    await emit({'type': 'ddl_result', 'statement': preview, 'kind': kind, 'elapsed_ms': elapsed,
                                'message': f"OK — {data if data >= 0 else '?'} row(s) affected"})

            except Exception as exc:
                msg = str(exc)
                await emit({'type': 'error', 'message': msg, 'line': None, 'col': None})
                return


# ── MySQL ─────────────────────────────────────────────────────────────────────

class MySQLAdapter(DBAdapter):
    type_id   = 'mysql'
    type_name = 'MySQL'

    def __init__(self, config: dict):
        self.config = config

    def _connect(self):
        if not HAS_MYSQL:
            raise RuntimeError(
                "MySQL driver not installed. Run: pip install mysql-connector-python"
            )
        return mysql.connector.connect(
            host     = self.config.get('host', 'localhost'),
            port     = int(self.config.get('port', 3306)),
            database = self.config.get('database', ''),
            user     = self.config.get('username', 'root'),
            password = self.config.get('password', ''),
        )

    async def test(self):
        def _t(): c = self._connect(); c.close()
        await _run_sync(_t)

    async def schema(self) -> list[dict]:
        def _s():
            conn   = self._connect()
            cur    = conn.cursor()
            db     = self.config.get('database', '')
            cur.execute(
                "SELECT TABLE_NAME FROM information_schema.TABLES "
                "WHERE TABLE_SCHEMA=%s ORDER BY TABLE_NAME", (db,)
            )
            tables = [r[0] for r in cur.fetchall()]
            result = []
            for tbl in tables:
                cur.execute(
                    "SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS "
                    "WHERE TABLE_SCHEMA=%s AND TABLE_NAME=%s ORDER BY ORDINAL_POSITION",
                    (db, tbl)
                )
                cols = [{'name': r[0], 'type': r[1]} for r in cur.fetchall()]
                try:
                    cur.execute(f"SELECT COUNT(*) FROM `{tbl}`")
                    count = cur.fetchone()[0]
                except Exception:
                    count = 0
                result.append({'table': tbl, 'row_count': count, 'columns': cols})
            conn.close()
            return result
        return await _run_sync(_s)

    async def execute(self, sql: str, send: Callable):
        async def emit(obj): await send(json.dumps(obj))

        try:
            await emit({'type': 'schema', 'tables': await self.schema()})
        except Exception as e:
            await emit({'type': 'error', 'message': str(e)})
            return

        stmts = split_statements(sql)
        if not stmts:
            await emit({'type': 'error', 'message': 'No SQL statements found.'})
            return
        total = len(stmts)

        for idx, stmt in enumerate(stmts):
            kind    = classify(stmt)
            preview = stmt.replace('\n', ' ')[:80]
            await emit({'type': 'stmt_start', 'index': idx, 'total': total, 'kind': kind, 'sql_preview': preview})
            t0 = time.perf_counter()

            try:
                def _exec(stmt=stmt, kind=kind):
                    conn = self._connect()
                    cur  = conn.cursor()
                    if kind in ('select', 'explain'):
                        cur.execute(stmt)
                        cols  = [d[0] for d in (cur.description or [])]
                        rows  = cur.fetchmany(MAX_ROWS)
                        rrows = [[_serialise(v) for v in row] for row in rows]
                        conn.close()
                        return ('select', cols, rrows)
                    else:
                        cur.execute(stmt)
                        affected = cur.rowcount
                        conn.commit()
                        conn.close()
                        return ('dml', None, affected)

                result = await _run_sync(_exec)
                elapsed = round((time.perf_counter() - t0) * 1000, 1)

                if result[0] == 'select':
                    _, cols, data = result
                    await emit({'type': 'results', 'columns': cols, 'rows': data, 'total': len(data), 'elapsed_ms': elapsed})
                else:
                    _, _, affected = result
                    await emit({'type': 'schema', 'tables': await self.schema()})
                    await emit({'type': 'ddl_result', 'statement': preview, 'kind': kind, 'elapsed_ms': elapsed,
                                'message': f"OK — {affected if affected >= 0 else '?'} row(s) affected"})

            except Exception as exc:
                msg = str(exc)
                await emit({'type': 'error', 'message': msg, 'line': None, 'col': None})
                return


# ── Factory ───────────────────────────────────────────────────────────────────

ADAPTER_TYPES = {
    'postgresql': PostgreSQLAdapter,
    'sqlite':     SQLiteAdapter,
    'mysql':      MySQLAdapter,
}

DRIVER_STATUS = {
    'postgresql': 'ok'       if HAS_PG    else 'missing: pip install psycopg2-binary',
    'sqlite':     'ok',
    'mysql':      'ok'       if HAS_MYSQL else 'missing: pip install mysql-connector-python',
    'duckdb':     'ok',
}


def make_adapter(config: dict) -> DBAdapter:
    t = config.get('type', 'duckdb')
    cls = ADAPTER_TYPES.get(t)
    if not cls:
        raise ValueError(f"Unknown database type: {t!r}. Supported: {list(ADAPTER_TYPES)}")
    return cls(config)
