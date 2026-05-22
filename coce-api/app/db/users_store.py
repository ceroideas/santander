from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from app.db.schema import ensure_schema
from app.db.session import get_connection


def count_users() -> int:
    ensure_schema()
    with get_connection() as conn:
        row = conn.execute("SELECT COUNT(*) FROM coce_users").fetchone()
        return int(row[0]) if row else 0


def get_user_by_username(username: str) -> Optional[tuple[int, str, str]]:
    ensure_schema()
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id, username, password_hash FROM coce_users WHERE username = ?",
            (username.strip(),),
        ).fetchone()
        if not row:
            return None
        return int(row[0]), str(row[1]), str(row[2])


def create_user(username: str, password_hash: str) -> int:
    ensure_schema()
    now = datetime.now(timezone.utc).isoformat()
    with get_connection() as conn:
        cur = conn.execute(
            "INSERT INTO coce_users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username.strip(), password_hash, now),
        )
        conn.commit()
        return int(cur.lastrowid)
