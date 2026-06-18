"""
Lens — backend API
FastAPI + WebSocket streaming query execution.
Multi-database: DuckDB (built-in), PostgreSQL, SQLite, MySQL.
"""
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Optional

import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# Load .env from backend directory
_env_file = Path(__file__).parent / '.env'
if _env_file.exists():
    for _line in _env_file.read_text().splitlines():
        _line = _line.strip()
        if _line and not _line.startswith('#') and '=' in _line:
            _k, _v = _line.split('=', 1)
            os.environ.setdefault(_k.strip(), _v.strip())

GROQ_API_KEY = os.environ.get('GROQ_API_KEY', '')
GROQ_MODEL   = os.environ.get('GROQ_MODEL', 'llama-3.3-70b-versatile')
GROQ_URL     = 'https://api.groq.com/openai/v1/chat/completions'

from engine.executor import execute_and_stream, SAMPLE_QUERIES, make_conn, _schema_info
from engine.datagen import TEMPLATES as DATAGEN_TEMPLATES, generate_dataset
import engine.connection_store as conn_store

app = FastAPI(title="Lens API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load persisted external connections on startup
@app.on_event("startup")
async def startup():
    conn_store.load()


# ── Samples & Schema ──────────────────────────────────────────────────────────

@app.get("/api/samples")
def get_samples():
    return SAMPLE_QUERIES


@app.get("/api/schema")
def get_schema():
    conn = make_conn()
    info = _schema_info(conn)
    conn.close()
    return info


# ── File Upload ───────────────────────────────────────────────────────────────

@app.post("/api/upload")
async def upload_csv(file: UploadFile = File(...)):
    suffix = Path(file.filename).suffix or ".csv"
    tmp    = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        tmp.write(await file.read())
        tmp.flush()
        import duckdb
        conn = duckdb.connect()
        conn.execute(f"SELECT * FROM read_csv_auto('{tmp.name}') LIMIT 1")
        conn.close()
        return {"path": tmp.name, "filename": file.filename}
    except Exception as e:
        os.unlink(tmp.name)
        return {"error": str(e)}, 400
    finally:
        tmp.close()


# ── Data Generator ────────────────────────────────────────────────────────────

@app.get("/api/datagen/templates")
def list_templates():
    return [
        {**{k: v[k] for k in ("label","icon","description","table","default_rows","max_rows","columns")}, "id": tid}
        for tid, v in DATAGEN_TEMPLATES.items()
    ]


class GenerateRequest(BaseModel):
    template_id: str
    rows:        int = 1000
    custom_sql:  Optional[str] = None


@app.post("/api/datagen/generate")
def generate(req: GenerateRequest):
    return generate_dataset(req.template_id, req.rows, req.custom_sql)


# ── Connection Management ─────────────────────────────────────────────────────

@app.get("/api/connections")
def list_connections():
    return {
        "connections":    conn_store.list_connections(),
        "driver_status":  conn_store.driver_status(),
    }


class ConnectionConfig(BaseModel):
    type:      str
    label:     Optional[str] = None
    host:      Optional[str] = None
    port:      Optional[int] = None
    database:  Optional[str] = None
    username:  Optional[str] = None
    password:  Optional[str] = None
    ssl:       Optional[bool] = False
    filepath:  Optional[str] = None     # SQLite


@app.post("/api/connections/test")
async def test_connection(cfg: ConnectionConfig):
    """Test a connection without saving it."""
    try:
        await conn_store.test_connection(cfg.model_dump(exclude_none=True))
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.post("/api/connections")
async def add_connection(cfg: ConnectionConfig):
    """Test and save a new connection. Returns its ID."""
    try:
        cid = await conn_store.add_connection(cfg.model_dump(exclude_none=True))
        return {"id": cid, "connections": conn_store.list_connections()}
    except Exception as e:
        return {"error": str(e)}, 400


@app.delete("/api/connections/{conn_id}")
def delete_connection(conn_id: str):
    ok = conn_store.remove_connection(conn_id)
    return {"ok": ok, "connections": conn_store.list_connections()}


# ── AI SQL Explanation ────────────────────────────────────────────────────────

class ExplainRequest(BaseModel):
    error:  str
    sql:    str
    schema: list = []


@app.get("/api/ai/status")
def ai_status():
    return {"configured": bool(GROQ_API_KEY), "model": GROQ_MODEL}


@app.post("/api/ai/explain")
async def ai_explain(req: ExplainRequest):
    if not GROQ_API_KEY:
        async def _no_key():
            yield 'data: {"text":"AI not configured — set GROQ_API_KEY in backend/.env"}\n\n'
            yield 'data: [DONE]\n\n'
        return StreamingResponse(_no_key(), media_type="text/event-stream")

    schema_summary = "\n".join(
        f"  {t['table']} ({t['row_count']:,} rows): "
        + ", ".join(f"{c['name']} {c['type']}" for c in t['columns'][:12])
        for t in req.schema[:10]
    ) or "  (no tables loaded)"

    prompt = f"""You are an expert DuckDB SQL debugger. A user got this error:

ERROR:
{req.error}

THEIR SQL (relevant portion):
{req.sql[:3000]}

AVAILABLE TABLES & SCHEMA:
{schema_summary}

Give a clear, practical explanation with this exact structure:

**What went wrong**
One sentence naming the error type and what triggered it.

**Root cause**
Pinpoint exactly which part of the SQL caused this — reference the specific table, column, function, or clause. Be specific.

**How to fix it**
Give the corrected SQL snippet or the exact steps. If a table/column is missing, show how to create or reference it correctly.

Be concise. No preamble. No "I" statements."""

    async def stream_groq():
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                async with client.stream(
                    "POST",
                    GROQ_URL,
                    headers={
                        "Authorization": f"Bearer {GROQ_API_KEY}",
                        "Content-Type":  "application/json",
                    },
                    json={
                        "model":       GROQ_MODEL,
                        "messages":    [{"role": "user", "content": prompt}],
                        "stream":      True,
                        "max_tokens":  1024,
                        "temperature": 0.2,
                    },
                ) as resp:
                    if resp.status_code != 200:
                        body = await resp.aread()
                        yield f'data: {json.dumps({"text": f"Groq API error {resp.status_code}: {body.decode()[:200]}"})}\n\n'
                        yield "data: [DONE]\n\n"
                        return
                    async for line in resp.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        payload = line[6:]
                        if payload == "[DONE]":
                            yield "data: [DONE]\n\n"
                            return
                        try:
                            chunk   = json.loads(payload)
                            content = chunk["choices"][0]["delta"].get("content", "")
                            if content:
                                yield f"data: {json.dumps({'text': content})}\n\n"
                        except Exception:
                            pass
        except Exception as exc:
            yield f'data: {json.dumps({"text": f"Error calling AI: {exc}"})}\n\n'
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        stream_groq(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── WebSocket ─────────────────────────────────────────────────────────────────

@app.websocket("/ws/query")
async def query_ws(ws: WebSocket):
    """
    Multi-database WebSocket query endpoint.

    Inbound messages:
      {type:"run",   sql:"...", connection_id?:"__duckdb__", extra_tables?:{...}}
      {type:"reset", connection_id?:"__duckdb__"}

    connection_id "__duckdb__" (default) → built-in DuckDB session.
    Any other id  → external adapter from connection_store.
    """
    await ws.accept()
    duckdb_conn = make_conn()   # persistent in-process DuckDB for this session

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send_text(json.dumps({"type": "error", "message": "Invalid JSON"}))
                continue

            kind    = msg.get("type", "run")
            conn_id = msg.get("connection_id", "__duckdb__") or "__duckdb__"

            # ── Reset session ─────────────────────────────────────────────────
            if kind == "reset":
                if conn_id == "__duckdb__":
                    duckdb_conn.close()
                    duckdb_conn = make_conn()
                    await ws.send_text(json.dumps({
                        "type":   "reset_ok",
                        "tables": _schema_info(duckdb_conn),
                    }))
                else:
                    await ws.send_text(json.dumps({"type": "reset_ok", "tables": []}))
                continue

            # ── Run query ─────────────────────────────────────────────────────
            sql = msg.get("sql", "").strip()
            if not sql:
                await ws.send_text(json.dumps({"type": "error", "message": "Empty query"}))
                continue

            if conn_id == "__duckdb__":
                extra_tables = msg.get("extra_tables")
                await execute_and_stream(
                    sql, ws.send_text,
                    conn=duckdb_conn,
                    extra_tables=extra_tables,
                )
            else:
                adapter = conn_store.get_adapter(conn_id)
                if not adapter:
                    await ws.send_text(json.dumps({
                        "type":    "error",
                        "message": f"Connection '{conn_id}' not found. It may have been removed.",
                    }))
                    continue
                await adapter.execute(sql, ws.send_text)

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        try:
            await ws.send_text(json.dumps({"type": "error", "message": str(exc)}))
        except Exception:
            pass
    finally:
        try:
            duckdb_conn.close()
        except Exception:
            pass


# ── Static frontend (SPA) ─────────────────────────────────────────────────────

frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"

if frontend_dist.is_dir():
    assets_dir = frontend_dist / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        return FileResponse(str(frontend_dist / "index.html"))
