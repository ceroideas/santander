"""Usuarios del panel web / sistema (JWT panel), distintos de tablet_api_users."""
from __future__ import annotations

from datetime import datetime
from typing import Optional, Tuple

from app.db.session import get_connection


def ensure_system_users_schema() -> None:
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS system_users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.commit()


def count_users() -> int:
    ensure_system_users_schema()
    with get_connection() as conn:
        row = conn.execute("SELECT COUNT(*) FROM system_users").fetchone()
        return int(row[0]) if row else 0


def get_user_by_username(username: str) -> Optional[Tuple[int, str, str]]:
    """Devuelve (id, username, password_hash) o None."""
    ensure_system_users_schema()
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id, username, password_hash FROM system_users WHERE username = ?",
            (username.strip(),),
        ).fetchone()
        if not row:
            return None
        return int(row[0]), str(row[1]), str(row[2])


def create_user(username: str, password_hash: str) -> int:
    ensure_system_users_schema()
    now = datetime.now().isoformat()
    with get_connection() as conn:
        cur = conn.execute(
            """
            INSERT INTO system_users (username, password_hash, created_at)
            VALUES (?, ?, ?)
            """,
            (username.strip(), password_hash, now),
        )
        conn.commit()
        return int(cur.lastrowid)
