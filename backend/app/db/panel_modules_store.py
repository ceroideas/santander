"""Persistencia de módulos Modbus del panel (IN/OUT configurables, all on/off)."""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Tuple

from app.db.session import get_connection

# Valores por defecto ETD8A12 (si open_cmd/close_cmd son NULL en BD)
DEFAULT_CMD_OPEN = 0x0100
DEFAULT_CMD_CLOSE = 0x0200
DEFAULT_CMD_OPEN_ALL = 0x0700
DEFAULT_CMD_CLOSE_ALL = 0x0800
DEFAULT_REG_OUTPUT_START = 0x0000
DEFAULT_REG_INPUT_START = 0x0080
DEFAULT_REG_OUTPUT_BITS = 0x0070


def ensure_panel_modules_schema() -> None:
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS panel_modules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                host TEXT NOT NULL,
                port INTEGER NOT NULL DEFAULT 5000,
                slave_id INTEGER NOT NULL DEFAULT 1,
                sort_order INTEGER NOT NULL DEFAULT 0,
                bitmask_address INTEGER,
                relation_register INTEGER
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS panel_module_channels (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                module_id INTEGER NOT NULL,
                kind TEXT NOT NULL CHECK (kind IN ('input', 'output')),
                slot_index INTEGER NOT NULL,
                label TEXT,
                address INTEGER NOT NULL,
                open_cmd INTEGER,
                close_cmd INTEGER,
                FOREIGN KEY (module_id) REFERENCES panel_modules(id) ON DELETE CASCADE
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_panel_channels_module_kind
            ON panel_module_channels (module_id, kind, slot_index)
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS panel_module_bulk (
                module_id INTEGER NOT NULL,
                kind TEXT NOT NULL CHECK (kind IN ('all_on', 'all_off')),
                address INTEGER NOT NULL,
                value INTEGER NOT NULL,
                PRIMARY KEY (module_id, kind),
                FOREIGN KEY (module_id) REFERENCES panel_modules(id) ON DELETE CASCADE
            )
            """
        )
        conn.commit()


def _row_module(row: Tuple[Any, ...]) -> dict:
    return {
        "id": row[0],
        "name": row[1],
        "host": row[2],
        "port": row[3],
        "slave_id": row[4],
        "sort_order": row[5],
        "bitmask_address": row[6],
        "relation_register": row[7],
    }


def _row_channel(row: Tuple[Any, ...]) -> dict:
    return {
        "id": row[0],
        "module_id": row[1],
        "kind": row[2],
        "slot_index": row[3],
        "label": row[4],
        "address": row[5],
        "open_cmd": row[6],
        "close_cmd": row[7],
    }


def list_module_ids_ordered() -> List[int]:
    ensure_panel_modules_schema()
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id FROM panel_modules ORDER BY sort_order ASC, id ASC"
        ).fetchall()
        return [r[0] for r in rows]


def get_boards_config_map() -> Dict[int, dict]:
    """Mapa id -> {name, host, port, slave_id} para runtime Modbus."""
    ensure_panel_modules_schema()
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, name, host, port, slave_id, sort_order, bitmask_address, relation_register
            FROM panel_modules ORDER BY sort_order ASC, id ASC
            """
        ).fetchall()
    return {r[0]: _row_module(r) for r in rows}


def get_channels_for_module(module_id: int) -> Tuple[List[dict], List[dict]]:
    ensure_panel_modules_schema()
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, module_id, kind, slot_index, label, address, open_cmd, close_cmd
            FROM panel_module_channels
            WHERE module_id = ?
            ORDER BY kind ASC, slot_index ASC, id ASC
            """,
            (module_id,),
        ).fetchall()
    inputs = [_row_channel(r) for r in rows if r[2] == "input"]
    outputs = [_row_channel(r) for r in rows if r[2] == "output"]
    return inputs, outputs


def get_bulk_commands(module_id: int) -> Dict[str, Tuple[int, int]]:
    ensure_panel_modules_schema()
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT kind, address, value FROM panel_module_bulk WHERE module_id = ?",
            (module_id,),
        ).fetchall()
    return {r[0]: (r[1], r[2]) for r in rows}


def get_full_config_for_api() -> List[dict]:
    """Lista de módulos con canales y bulk para el frontend."""
    ensure_panel_modules_schema()
    mids = list_module_ids_ordered()
    out: List[dict] = []
    for mid in mids:
        cfg = get_boards_config_map().get(mid)
        if not cfg:
            continue
        ins, outs = get_channels_for_module(mid)
        bulk = get_bulk_commands(mid)
        out.append(
            {
                **cfg,
                "inputs": ins,
                "outputs": outs,
                "bulk": {
                    "all_on": {"address": bulk["all_on"][0], "value": bulk["all_on"][1]} if "all_on" in bulk else None,
                    "all_off": {"address": bulk["all_off"][0], "value": bulk["all_off"][1]} if "all_off" in bulk else None,
                },
            }
        )
    return out


def create_module(name: str, host: str, port: int = 5000, slave_id: int = 1) -> int:
    ensure_panel_modules_schema()
    with get_connection() as conn:
        max_so = conn.execute("SELECT COALESCE(MAX(sort_order), 0) FROM panel_modules").fetchone()[0]
        cur = conn.execute(
            """
            INSERT INTO panel_modules (name, host, port, slave_id, sort_order)
            VALUES (?, ?, ?, ?, ?)
            """,
            (name, host, port, slave_id, max_so + 1),
        )
        mid = int(cur.lastrowid)
        conn.commit()
    return mid


def update_module(
    module_id: int,
    *,
    name: Optional[str] = None,
    host: Optional[str] = None,
    port: Optional[int] = None,
    slave_id: Optional[int] = None,
    sort_order: Optional[int] = None,
    bitmask_address: Any = ...,
    relation_register: Any = ...,
) -> None:
    """Actualiza solo los argumentos distintos de None / omitidos (bitmask/relation usan ... = no tocar)."""
    ensure_panel_modules_schema()
    fields: List[str] = []
    vals: List[Any] = []
    if name is not None:
        fields.append("name = ?")
        vals.append(name)
    if host is not None:
        fields.append("host = ?")
        vals.append(host)
    if port is not None:
        fields.append("port = ?")
        vals.append(port)
    if slave_id is not None:
        fields.append("slave_id = ?")
        vals.append(slave_id)
    if sort_order is not None:
        fields.append("sort_order = ?")
        vals.append(sort_order)
    if bitmask_address is not ...:
        fields.append("bitmask_address = ?")
        vals.append(bitmask_address)
    if relation_register is not ...:
        fields.append("relation_register = ?")
        vals.append(relation_register)
    if not fields:
        return
    vals.append(module_id)
    with get_connection() as conn:
        conn.execute(f"UPDATE panel_modules SET {', '.join(fields)} WHERE id = ?", vals)
        conn.commit()


def apply_module_update(module_id: int, fields: Dict[str, Any]) -> None:
    """Actualiza columnas presentes en `fields` (permite NULL explícito en bitmask_address / relation_register)."""
    allowed = {"name", "host", "port", "slave_id", "sort_order", "bitmask_address", "relation_register"}
    ensure_panel_modules_schema()
    cols: List[str] = []
    vals: List[Any] = []
    for k, v in fields.items():
        if k not in allowed:
            continue
        cols.append(f"{k} = ?")
        vals.append(v)
    if not cols:
        return
    vals.append(module_id)
    with get_connection() as conn:
        conn.execute(f"UPDATE panel_modules SET {', '.join(cols)} WHERE id = ?", vals)
        conn.commit()


def delete_module(module_id: int) -> bool:
    ensure_panel_modules_schema()
    with get_connection() as conn:
        cur = conn.execute("DELETE FROM panel_modules WHERE id = ?", (module_id,))
        conn.commit()
        return cur.rowcount > 0


def add_channel(
    module_id: int,
    kind: str,
    address: int,
    *,
    slot_index: Optional[int] = None,
    label: Optional[str] = None,
    open_cmd: Optional[int] = None,
    close_cmd: Optional[int] = None,
) -> int:
    ensure_panel_modules_schema()
    if kind not in ("input", "output"):
        raise ValueError("kind debe ser input u output")
    with get_connection() as conn:
        if slot_index is None:
            row = conn.execute(
                """
                SELECT COALESCE(MAX(slot_index), 0) FROM panel_module_channels
                WHERE module_id = ? AND kind = ?
                """,
                (module_id, kind),
            ).fetchone()
            slot_index = int(row[0]) + 1
        cur = conn.execute(
            """
            INSERT INTO panel_module_channels
            (module_id, kind, slot_index, label, address, open_cmd, close_cmd)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (module_id, kind, slot_index, label, address, open_cmd, close_cmd),
        )
        cid = int(cur.lastrowid)
        conn.commit()
    return cid


def update_channel(
    channel_id: int,
    *,
    slot_index: Optional[int] = None,
    label: Any = ...,
    address: Optional[int] = None,
    open_cmd: Any = ...,
    close_cmd: Any = ...,
) -> None:
    ensure_panel_modules_schema()
    fields: List[str] = []
    vals: List[Any] = []
    if slot_index is not None:
        fields.append("slot_index = ?")
        vals.append(slot_index)
    if label is not ...:
        fields.append("label = ?")
        vals.append(label)
    if address is not None:
        fields.append("address = ?")
        vals.append(address)
    if open_cmd is not ...:
        fields.append("open_cmd = ?")
        vals.append(open_cmd)
    if close_cmd is not ...:
        fields.append("close_cmd = ?")
        vals.append(close_cmd)
    if not fields:
        return
    vals.append(channel_id)
    with get_connection() as conn:
        conn.execute(f"UPDATE panel_module_channels SET {', '.join(fields)} WHERE id = ?", vals)
        conn.commit()


def delete_channel(channel_id: int) -> bool:
    ensure_panel_modules_schema()
    with get_connection() as conn:
        cur = conn.execute("DELETE FROM panel_module_channels WHERE id = ?", (channel_id,))
        conn.commit()
        return cur.rowcount > 0


def set_bulk_command(module_id: int, kind: str, address: int, value: int) -> None:
    ensure_panel_modules_schema()
    if kind not in ("all_on", "all_off"):
        raise ValueError("kind debe ser all_on o all_off")
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO panel_module_bulk (module_id, kind, address, value)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(module_id, kind) DO UPDATE SET
                address = excluded.address,
                value = excluded.value
            """,
            (module_id, kind, address, value),
        )
        conn.commit()


def seed_default_modules_if_empty() -> None:
    """Tres placas ETD8A12 con mapa clásico 12+12 y all on/off en registro base."""
    ensure_panel_modules_schema()
    with get_connection() as conn:
        n = conn.execute("SELECT COUNT(*) FROM panel_modules").fetchone()[0]
        if n > 0:
            return
        defaults = [
            ("Placa 1 — Central", "192.168.1.101", 5000, 1, 1),
            ("Placa 2 — Puerta Calle", "192.168.1.102", 5000, 1, 2),
            ("Placa 3 — Puerta Oficina", "192.168.1.103", 5000, 1, 3),
        ]
        for name, host, port, slave, so in defaults:
            cur = conn.execute(
                """
                INSERT INTO panel_modules (name, host, port, slave_id, sort_order, bitmask_address, relation_register)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (name, host, port, slave, so, DEFAULT_REG_OUTPUT_BITS, 0x00FA),
            )
            mid = int(cur.lastrowid)
            for i in range(12):
                conn.execute(
                    """
                    INSERT INTO panel_module_channels
                    (module_id, kind, slot_index, label, address, open_cmd, close_cmd)
                    VALUES (?, 'input', ?, NULL, ?, NULL, NULL)
                    """,
                    (mid, i + 1, DEFAULT_REG_INPUT_START + i),
                )
            for i in range(12):
                conn.execute(
                    """
                    INSERT INTO panel_module_channels
                    (module_id, kind, slot_index, label, address, open_cmd, close_cmd)
                    VALUES (?, 'output', ?, NULL, ?, NULL, NULL)
                    """,
                    (mid, i + 1, DEFAULT_REG_OUTPUT_START + i),
                )
            conn.execute(
                "INSERT INTO panel_module_bulk (module_id, kind, address, value) VALUES (?, 'all_on', ?, ?)",
                (mid, DEFAULT_REG_OUTPUT_START, DEFAULT_CMD_OPEN_ALL),
            )
            conn.execute(
                "INSERT INTO panel_module_bulk (module_id, kind, address, value) VALUES (?, 'all_off', ?, ?)",
                (mid, DEFAULT_REG_OUTPUT_START, DEFAULT_CMD_CLOSE_ALL),
            )
        conn.commit()
