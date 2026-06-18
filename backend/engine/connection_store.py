"""
In-memory + JSON-persistent connection registry.
Connections persist across server restarts (stored in connections.json).
Passwords are stored in plain text — this is a developer tool.
"""
from __future__ import annotations

import json
import uuid
from pathlib import Path

from .adapters import DBAdapter, make_adapter, DRIVER_STATUS

STORE_PATH = Path(__file__).parent.parent / 'connections.json'

# id → raw config dict (includes credentials)
_registry: dict[str, dict] = {}

# id → live adapter instance
_adapters: dict[str, DBAdapter] = {}


# ── Persistence ───────────────────────────────────────────────────────────────

def _save():
    STORE_PATH.write_text(json.dumps(list(_registry.values()), indent=2, ensure_ascii=False))


def load():
    """Call once at startup to restore saved connections."""
    if not STORE_PATH.exists():
        return
    try:
        items = json.loads(STORE_PATH.read_text())
        for cfg in items:
            cid = cfg.get('id')
            if not cid:
                continue
            try:
                _registry[cid] = cfg
                _adapters[cid] = make_adapter(cfg)
            except Exception:
                pass   # bad config — skip silently
    except Exception:
        pass


# ── Public API ────────────────────────────────────────────────────────────────

def list_connections() -> list[dict]:
    """Return safe-to-send list (passwords masked)."""
    result = [{
        'id':       '__duckdb__',
        'type':     'duckdb',
        'label':    'DuckDB (built-in)',
        'status':   'ok',
    }]
    for cid, cfg in _registry.items():
        result.append({
            'id':       cid,
            'type':     cfg.get('type', '?'),
            'label':    cfg.get('label') or _default_label(cfg),
            'host':     cfg.get('host'),
            'database': cfg.get('database') or cfg.get('filepath'),
            'port':     cfg.get('port'),
            'status':   'ok',
        })
    return result


def get_adapter(conn_id: str) -> DBAdapter | None:
    return _adapters.get(conn_id)


def get_config(conn_id: str) -> dict | None:
    return _registry.get(conn_id)


async def test_connection(config: dict) -> None:
    """Test without saving. Raises on failure."""
    adapter = make_adapter(config)
    await adapter.test()


async def add_connection(config: dict) -> str:
    """Test, save, and return the new connection ID."""
    adapter = make_adapter(config)
    await adapter.test()                  # raises on failure

    cid = uuid.uuid4().hex[:12]
    config = {**config, 'id': cid}
    _registry[cid] = config
    _adapters[cid]  = adapter
    _save()
    return cid


def remove_connection(conn_id: str) -> bool:
    if conn_id not in _registry:
        return False
    if conn_id in _adapters:
        try: _adapters[conn_id].close()
        except Exception: pass
        del _adapters[conn_id]
    del _registry[conn_id]
    _save()
    return True


def driver_status() -> dict:
    return DRIVER_STATUS


# ── Helpers ───────────────────────────────────────────────────────────────────

def _default_label(cfg: dict) -> str:
    t = cfg.get('type', '')
    if t == 'postgresql':
        return f"{cfg.get('username','user')}@{cfg.get('host','localhost')}/{cfg.get('database','')}"
    if t == 'mysql':
        return f"MySQL {cfg.get('host','localhost')}/{cfg.get('database','')}"
    if t == 'sqlite':
        p = cfg.get('filepath', ':memory:')
        return f"SQLite {Path(p).name if p != ':memory:' else '(memory)'}"
    return t
