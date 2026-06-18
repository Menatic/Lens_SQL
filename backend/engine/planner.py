"""
Parse DuckDB's EXPLAIN (FORMAT JSON) output into a clean plan tree
that the frontend can render and animate.
"""
from __future__ import annotations
import json
import re
from typing import Any

# Operator type → display category for frontend colouring
_CATEGORY = {
    "SEQ_SCAN":            "scan",
    "PROJECTION":          "project",
    "FILTER":              "filter",
    "HASH_JOIN":           "join",
    "NESTED_LOOP_JOIN":    "join",
    "CROSS_PRODUCT":       "join",
    "HASH_GROUP_BY":       "aggregate",
    "PERFECT_HASH_GROUP_BY": "aggregate",
    "STREAMING_WINDOW":    "aggregate",
    "ORDER_BY":            "sort",
    "TOP_N":               "sort",
    "LIMIT":               "limit",
    "UNION":               "set",
    "RECURSIVE_CTE_SCAN":  "scan",
    "DISTINCT":            "filter",
    "UNNEST":              "project",
}


def _node_id(counter: list) -> str:
    counter[0] += 1
    return f"op_{counter[0]}"


def _parse_node(raw: dict, counter: list) -> dict:
    name = raw.get("name", "UNKNOWN")
    node: dict[str, Any] = {
        "id":       _node_id(counter),
        "name":     name,
        "category": _CATEGORY.get(name, "other"),
        "extra":    {},
        "children": [],
        "est_rows": None,
        "actual_rows": None,
        "time_ms":  None,
    }

    # Extra info DuckDB attaches
    extra = raw.get("extra_info", "") or ""
    if extra:
        # Split on newlines, collect key → value
        for line in extra.split("\n"):
            line = line.strip()
            if not line:
                continue
            if line.startswith("["):
                continue
            if ":" in line:
                k, _, v = line.partition(":")
                node["extra"][k.strip()] = v.strip()
            else:
                node["extra"].setdefault("detail", [])
                node["extra"]["detail"].append(line) if isinstance(node["extra"].get("detail"), list) \
                    else node["extra"].update({"detail": [line]})

    # Table name for scans — strip DuckDB internal schema prefix
    if name in ("SEQ_SCAN", "RECURSIVE_CTE_SCAN"):
        raw_tbl = (
            node["extra"].get("Table Name")
            or node["extra"].get("Table")
            or (node["extra"]["detail"][0] if isinstance(node["extra"].get("detail"), list) and node["extra"]["detail"] else None)
            or "?"
        )
        # Strip "memory.main." or "main." prefix DuckDB adds internally
        raw_tbl = re.sub(r"^(memory\.main\.|main\.)", "", raw_tbl, flags=re.IGNORECASE)
        node["table"] = raw_tbl

    # Estimated cardinality from extra_info or timing node
    timing = raw.get("timings") or {}
    if timing:
        node["time_ms"]    = round(float(timing.get("time", 0)) * 1000, 2)
        node["actual_rows"] = timing.get("result", None)

    # Recurse children
    for child in raw.get("children", []):
        node["children"].append(_parse_node(child, counter))

    return node


def parse_explain_json(raw_json: str) -> dict:
    """Turn DuckDB's EXPLAIN FORMAT=JSON output into our plan tree."""
    try:
        parsed = json.loads(raw_json)
    except json.JSONDecodeError:
        return {"id": "op_0", "name": "UNKNOWN", "category": "other",
                "extra": {}, "children": [], "est_rows": None,
                "actual_rows": None, "time_ms": None}

    root_raw = parsed
    # DuckDB wraps in {"children": [...]} at top level sometimes
    if "children" in parsed and "name" not in parsed:
        root_raw = parsed["children"][0] if parsed["children"] else parsed

    return _parse_node(root_raw, [0])


def parse_explain_text(text: str) -> dict:
    """
    Fallback: parse DuckDB's text EXPLAIN output (indented lines)
    into a minimal plan tree. Used when JSON EXPLAIN isn't available.
    """
    lines = [l for l in text.splitlines() if l.strip()]
    counter = [0]

    def make_node(name: str) -> dict:
        return {
            "id":       _node_id(counter),
            "name":     name.upper().replace(" ", "_"),
            "category": _CATEGORY.get(name.upper().replace(" ", "_"), "other"),
            "extra":    {},
            "children": [],
            "est_rows": None,
            "actual_rows": None,
            "time_ms":  None,
        }

    # Very simple indentation-based parser
    stack: list[tuple[int, dict]] = []
    root: dict | None = None

    for line in lines:
        indent = len(line) - len(line.lstrip("─│ ├└"))
        name   = re.sub(r"[─│ ├└>]", "", line).strip()
        if not name:
            continue
        node = make_node(name)
        depth = indent // 2

        while stack and stack[-1][0] >= depth:
            stack.pop()

        if stack:
            stack[-1][1]["children"].append(node)
        else:
            root = node

        stack.append((depth, node))

    return root or {"id": "op_0", "name": "SCAN", "category": "scan",
                    "extra": {}, "children": [], "est_rows": None,
                    "actual_rows": None, "time_ms": None}
