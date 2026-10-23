"""
config_db.py — Sovereign Local Configuration Manager for Agent-D (v0.5.0).
Manages %LOCALAPPDATA%\\AgentD\\config.db:
- Application configuration & preferences (local Ollama model, UI state)
- Versioned system prompt templates
- Application schema state & migrations
- Zero cloud API credentials or remote keys (permanently removed in v0.5.0)
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
    """Initializes tables in config.db and seeds initial defaults."""
    with get_config_db() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS prompt_templates (
            id TEXT PRIMARY KEY,
            template_name TEXT NOT NULL UNIQUE,
            prompt_content TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 1,
            is_active INTEGER NOT NULL DEFAULT 1,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS app_state (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        -- v0.5.0 Sovereign Migration: Wipe any legacy cloud API key tables from disk
        DROP TABLE IF EXISTS key_usage;
        DROP TABLE IF EXISTS api_keys;
        """)
        conn.commit()

        # Seed default prompt templates if not present
        _seed_default_templates(conn)


def _seed_default_templates(conn: sqlite3.Connection):
    templates = [
        (
            "system_copilot",
            """You are Agent-D, an AI clinical copilot assisting a solo physician in their private clinical practice.
CORE DIRECTIVES:
1. DOCTOR IN CONTROL: You are clinical decision support and organization. You NEVER state diagnostic conclusions or prescriptions as final facts. You propose; the doctor approves.
2. CITATION & ACCURACY: Rely on the verified patient context artifact and recent logs provided. Explicitly cite which artifact section you are referencing.
3. CONVERSATIONAL DASHBOARD: If the doctor asks what is on their dashboard or schedule today, report the agenda clearly, highlighting the next scheduled patient, pending proposals awaiting sign-off, and overdue tickets.
4. PROPOSAL GENERATION: When the doctor dictates visit notes, observations, or asks to schedule follow-ups, invoke the appropriate proposal tool (propose_artifact_update, propose_log_entry, propose_ticket) so the doctor can review the diff and sign off.
5. PRIVACY: Never ask for or output raw direct personal identifiers (like phone numbers, SSN/Aadhaar, or full legal addresses). Use the patient's alias (e.g. PT-1042).""",
        ),
        (
            "pre_visit_brief",
            """Generate a crisp, high-yield 3-bullet pre-visit brief for the physician prior to seeing the patient:
1. What changed at the last visit (medication adjustments, symptom developments)
2. Crucial watch-for items and vital signs to check today
3. Pending follow-ups, overdue lab results, or imaging orders.
Keep the brief under 120 words for rapid scanning.""",
        ),
        (
            "visit_closer",
            """Analyze the consultation notes provided by the doctor for the closed visit.
Extract and construct structured proposals:
1. An artifact update diff if medications, chronic conditions, or watch-for items have changed.
2. A dated medical log entry recording observations and vital signs.
3. A ticket or reminder if follow-up visits or lab tests need to be completed.""",
        ),
    ]

    for name, content in templates:
        row = conn.execute("SELECT id FROM prompt_templates WHERE template_name = ?", (name,)).fetchone()
        if not row:
            conn.execute(
                "INSERT INTO prompt_templates (id, template_name, prompt_content, version) VALUES (?, ?, ?, 1)",
                (str(uuid.uuid4()), name, content),
            )
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


def get_prompt_template(name: str) -> Optional[str]:
    with get_config_db() as conn:
        row = conn.execute(
            "SELECT prompt_content FROM prompt_templates WHERE template_name = ? AND is_active = 1",
            (name,),
        ).fetchone()
        return row["prompt_content"] if row else None


# ── Sovereign Local Mode Compatibility Stubs ─────────────────────────────────
# Cloud API keys and remote vaults are permanently disabled in v0.5.0.
# All inferences run strictly locally via Ollama or embedded rule synthesis.

def add_api_key(key_label: str, raw_key: str, provider: str = "gemini", priority: int = 1) -> Dict[str, Any]:
    raise RuntimeError("Cloud API key storage is permanently disabled in v0.5.0. Agent-D operates in 100% on-device sovereign mode.")


def list_api_keys(include_raw: bool = False) -> List[Dict[str, Any]]:
    return []


def delete_api_key(key_id: str) -> bool:
    return False


def record_key_usage(key_id: str, success: bool, error_msg: Optional[str] = None, is_rate_limited: bool = False):
    pass


def get_active_rotated_key(provider: str = "gemini", allow_cooldown: bool = False) -> Optional[Dict[str, Any]]:
    return None


def get_key_pool_status(provider: str = "ollama") -> Dict[str, Any]:
    """Returns sovereign local status reporting zero cloud keys."""
    return {
        "provider": "ollama",
        "is_local_only": True,
        "total_keys": 0,
        "healthy_keys": 0,
        "cooldown_keys": 0,
        "all_in_cooldown": False,
        "retry_countdown_seconds": 0,
        "keys": [],
    }


def reset_key_cooldown(key_id: str) -> bool:
    """No-op stub for backward compatibility."""
    return True
