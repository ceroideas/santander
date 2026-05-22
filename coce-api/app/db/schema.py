"""Esquema SQLite COCE central."""
from __future__ import annotations

from app.db.session import get_connection


def ensure_schema() -> None:
    with get_connection() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS coce_users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS branches (
                id TEXT PRIMARY KEY,
                nombre TEXT NOT NULL,
                host TEXT NOT NULL,
                port INTEGER NOT NULL DEFAULT 8000,
                use_https INTEGER NOT NULL DEFAULT 0,
                tablet_user TEXT NOT NULL,
                tablet_password_enc TEXT NOT NULL,
                panel_user TEXT,
                panel_password_enc TEXT,
                estado TEXT NOT NULL DEFAULT 'operativo',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                actor_username TEXT NOT NULL,
                action TEXT NOT NULL,
                branch_id TEXT,
                branch_nombre TEXT,
                success INTEGER NOT NULL DEFAULT 1,
                detail TEXT,
                ip_address TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
            CREATE INDEX IF NOT EXISTS idx_audit_branch ON audit_logs(branch_id);
            CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
            """
        )
        conn.commit()
