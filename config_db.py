"""
config_db.py — Sovereign Local Configuration Manager for Agent-D.
Manages %LOCALAPPDATA%\\AgentD\\config.db:
- Application configuration & practice settings
- Application schema state & migrations
- Zero AI / LLM dependencies, zero cloud API credentials
"""

import os
import sqlite3
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from queue import Queue, Empty
from typing import Optional, Dict, Any, List
import crypto_utils

POOL_SIZE = 5
_pool: Optional[Queue] = None


def get_config_db_path() -> Path:
    override = os.getenv("AGENT_D_CONFIG_DB")
    if override:
        return Path(override)
    base = os.getenv("LOCALAPPDATA") or str(Path.home() / ".agentd")
    p = Path(base) / "AgentD"
    p.mkdir(parents=True, exist_ok=True)
    return p / "config.db"


def _create_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(
        str(get_config_db_path()),
        check_same_thread=False,
        timeout=30.0,
    )
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_config_pool():
    global _pool
    if _pool is None:
        _pool = Queue(maxsize=POOL_SIZE)
        for _ in range(POOL_SIZE):
            _pool.put(_create_connection())


def reset_pool():
    global _pool
    if _pool is not None:
        while not _pool.empty():
            try:
                conn = _pool.get_nowait()
                conn.close()
            except Exception:
                pass
        _pool = None


class ConfigConnectionContext:
    def __enter__(self) -> sqlite3.Connection:
        global _pool
        if _pool is None:
            init_config_pool()
        try:
            self.conn = _pool.get(timeout=10.0)
            return self.conn
        except Empty:
            self.conn = _create_connection()
            return self.conn

    def __exit__(self, exc_type, exc_val, exc_tb):
        if hasattr(self, "conn") and self.conn:
            if exc_type is not None:
                try:
                    self.conn.rollback()
                except Exception:
                    pass
            global _pool
            if _pool is not None and not _pool.full():
                _pool.put(self.conn)
            else:
                try:
                    self.conn.close()
                except Exception:
                    pass


def get_config_db():
    return ConfigConnectionContext()


def init_config_db():
    """Initializes tables in config.db."""
    with get_config_db() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS app_state (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        -- Wipe any legacy cloud/AI tables from disk
        DROP TABLE IF EXISTS key_usage;
        DROP TABLE IF EXISTS api_keys;
        DROP TABLE IF EXISTS prompt_templates;
        """)
        conn.commit()


# ── App Settings API ─────────────────────────────────────────────────────────

def get_setting(key: str, default: Optional[str] = None) -> Optional[str]:
    with get_config_db() as conn:
        row = conn.execute("SELECT value FROM app_settings WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else default


def set_setting(key: str, value: str):
    with get_config_db() as conn:
        conn.execute(
            """
            INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
            """,
            (key, str(value)),
        )
        conn.commit()

