"""
config_db.py — Config Database Manager for Agent-D.
Manages %LOCALAPPDATA%\\AgentD\\config.db:
- Application configuration & preferences
- Multi-key Gemini API credentials (encrypted at rest with AES-256-GCM)
- Per-key rate limit & cooldown statistics
- Versioned system prompt templates
- Application schema state
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

        CREATE TABLE IF NOT EXISTS api_keys (
            id TEXT PRIMARY KEY,
            provider TEXT NOT NULL DEFAULT 'gemini',
            key_label TEXT NOT NULL,
            encrypted_key TEXT NOT NULL,
            masked_key TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            priority INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS key_usage (
            key_id TEXT PRIMARY KEY,
            total_calls INTEGER NOT NULL DEFAULT 0,
            successful_calls INTEGER NOT NULL DEFAULT 0,
            rate_limit_errors INTEGER NOT NULL DEFAULT 0,
            last_used_at TIMESTAMP,
            cooldown_until TIMESTAMP,
            last_error_message TEXT,
            FOREIGN KEY (key_id) REFERENCES api_keys(id) ON DELETE CASCADE
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


# ── Multi-Key Gemini API Key Management ──────────────────────────────────────

def add_api_key(key_label: str, raw_key: str, provider: str = "gemini", priority: int = 1) -> Dict[str, Any]:
    raw_key = raw_key.strip()
    if not raw_key:
        raise ValueError("API key cannot be empty")

    key_id = str(uuid.uuid4())
    encrypted = crypto_utils.encrypt_text(raw_key)

    # Mask key for safe UI display (e.g. AIzaSy...4xQ1)
    if len(raw_key) > 10:
        masked = raw_key[:6] + "..." + raw_key[-4:]
    else:
        masked = "***"

    with get_config_db() as conn:
        conn.execute(
            """
            INSERT INTO api_keys (id, provider, key_label, encrypted_key, masked_key, is_active, priority)
            VALUES (?, ?, ?, ?, ?, 1, ?)
            """,
            (key_id, provider, key_label, encrypted, masked, priority),
        )
        conn.execute(
            "INSERT INTO key_usage (key_id, total_calls, successful_calls, rate_limit_errors) VALUES (?, 0, 0, 0)",
            (key_id,),
        )
        conn.commit()

    return {
        "id": key_id,
        "provider": provider,
        "key_label": key_label,
        "masked_key": masked,
        "is_active": 1,
        "priority": priority,
    }


def list_api_keys(include_raw: bool = False) -> List[Dict[str, Any]]:
    with get_config_db() as conn:
        rows = conn.execute(
            """
            SELECT k.id, k.provider, k.key_label, k.encrypted_key, k.masked_key, k.is_active, k.priority, k.created_at,
                   u.total_calls, u.successful_calls, u.rate_limit_errors, u.last_used_at, u.cooldown_until, u.last_error_message
            FROM api_keys k
            LEFT JOIN key_usage u ON k.id = u.key_id
            ORDER BY k.priority ASC, k.created_at ASC
            """
        ).fetchall()

        results = []
        for r in rows:
            item = dict(r)
            if include_raw:
                item["raw_key"] = crypto_utils.decrypt_text(item["encrypted_key"])
            del item["encrypted_key"]
            results.append(item)
        return results


def delete_api_key(key_id: str) -> bool:
    with get_config_db() as conn:
        cur = conn.execute("DELETE FROM api_keys WHERE id = ?", (key_id,))
        conn.commit()
        return cur.rowcount > 0


def record_key_usage(key_id: str, success: bool, error_msg: Optional[str] = None, is_rate_limited: bool = False):
    now = datetime.now(timezone.utc).isoformat()
    cooldown = None
    if is_rate_limited:
        # 60 second cooldown on 429 quota exhaustion
        from datetime import timedelta
        cooldown = (datetime.now(timezone.utc) + timedelta(seconds=60)).isoformat()

    with get_config_db() as conn:
        if success:
            conn.execute(
                """
                UPDATE key_usage
                SET total_calls = total_calls + 1,
                    successful_calls = successful_calls + 1,
                    last_used_at = ?,
                    cooldown_until = NULL,
                    last_error_message = NULL
                WHERE key_id = ?
                """,
                (now, key_id),
            )
        else:
            conn.execute(
                """
                UPDATE key_usage
                SET total_calls = total_calls + 1,
                    rate_limit_errors = rate_limit_errors + (CASE WHEN ? THEN 1 ELSE 0 END),
                    last_used_at = ?,
                    cooldown_until = COALESCE(?, cooldown_until),
                    last_error_message = ?
                WHERE key_id = ?
                """,
                (1 if is_rate_limited else 0, now, cooldown, error_msg, key_id),
            )
        conn.commit()


def get_prompt_template(name: str) -> Optional[str]:
    with get_config_db() as conn:
        row = conn.execute(
            "SELECT prompt_content FROM prompt_templates WHERE template_name = ? AND is_active = 1",
            (name,),
        ).fetchone()
        return row["prompt_content"] if row else None
