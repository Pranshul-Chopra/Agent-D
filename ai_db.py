# ── ai_db.py ──────────────────────────────────────────────────────────────────
# Dedicated SQLite database for PM Tool AI conversations, message history, and tool traces.
# Stored at %LOCALAPPDATA%\AIContextTool\ai_context.db.
# Completely isolated from pmtool.db to separate high-frequency AI traces from PM metadata.

import os
import sqlite3
import uuid
import datetime
from queue import Queue, Empty
from pathlib import Path
from typing import List, Dict, Optional, Any
from contextlib import contextmanager


def _ai_data_dir() -> Path:
    """Persistent user data directory for AI context and vector storage."""
    base = os.getenv("LOCALAPPDATA") or str(Path.home() / ".pmtool")
    data_dir = Path(base) / "AIContextTool"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


AI_DB_PATH = _ai_data_dir() / "ai_context.db"
AI_SCHEMA_VERSION = 1


# ── Connection Pool ───────────────────────────────────────────────────────────

class _AIPool:
    def __init__(self, size: int = 5):
        self._q: Queue = Queue(maxsize=size)
        for _ in range(size):
            self._q.put(self._make())

    def _make(self) -> sqlite3.Connection:
        conn = sqlite3.connect(
            str(AI_DB_PATH),
            check_same_thread=False,
            timeout=10.0,
        )
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA synchronous = NORMAL")
        return conn

    def get(self) -> sqlite3.Connection:
        try:
            return self._q.get(timeout=5.0)
        except Empty:
            return self._make()

    def put(self, conn: sqlite3.Connection):
        try:
            self._q.put(conn, block=False)
        except Exception:
            try:
                conn.close()
            except Exception:
                pass


_ai_pool: Optional[_AIPool] = None


def get_ai_pool() -> _AIPool:
    global _ai_pool
    if _ai_pool is None:
        _ai_pool = _AIPool()
    return _ai_pool


@contextmanager
def get_ai_db():
    pool = get_ai_pool()
    conn = pool.get()
    try:
        yield conn
    finally:
        pool.put(conn)


# ── Schema Initialization ─────────────────────────────────────────────────────

def init_ai_db():
    """Initializes tables in ai_context.db."""
    with get_ai_db() as conn:
        with conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS ai_schema_meta (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT PRIMARY KEY,
                    project_id INTEGER,
                    title TEXT NOT NULL,
                    preview TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    conversation_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    model_info TEXT NOT NULL DEFAULT '',
                    tokens INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS tool_runs (
                    id TEXT PRIMARY KEY,
                    conversation_id TEXT,
                    message_id TEXT,
                    tool_name TEXT NOT NULL,
                    input_data TEXT,
                    output_data TEXT,
                    duration_ms INTEGER,
                    status TEXT DEFAULT 'success',
                    created_at TEXT NOT NULL
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS document_chunks (
                    id TEXT PRIMARY KEY,
                    doc_id INTEGER NOT NULL,
                    project_id INTEGER,
                    chunk_index INTEGER NOT NULL,
                    file_path TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    section_title TEXT DEFAULT '',
                    content TEXT NOT NULL,
                    token_count INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS applied_actions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    action_key TEXT UNIQUE NOT NULL,
                    conversation_id TEXT NOT NULL,
                    action_name TEXT NOT NULL,
                    entity_id INTEGER,
                    title TEXT NOT NULL DEFAULT '',
                    applied_at TEXT NOT NULL
                )
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_conversations_proj ON conversations(project_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_chunks_doc ON document_chunks(doc_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_chunks_proj ON document_chunks(project_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_applied_actions_conv ON applied_actions(conversation_id)")

            conn.execute("""
                CREATE VIRTUAL TABLE IF NOT EXISTS document_chunks_fts USING fts5(
                    chunk_id UNINDEXED,
                    doc_id UNINDEXED,
                    project_id UNINDEXED,
                    filename,
                    section_title,
                    content,
                    tokenize = 'porter unicode61'
                )
            """)

            conn.execute(
                "INSERT OR REPLACE INTO ai_schema_meta (key, value) VALUES ('version', ?)",
                (str(AI_SCHEMA_VERSION),),
            )


# ── Conversations CRUD ─────────────────────────────────────────────────────────

def create_conversation(title: str = "New Conversation", project_id: Optional[int] = None) -> Dict[str, Any]:
    """Create a new chat conversation thread."""
    conv_id = str(uuid.uuid4())
    now = datetime.datetime.now().isoformat()
    with get_ai_db() as conn:
        with conn:
            conn.execute(
                """INSERT INTO conversations (id, project_id, title, preview, created_at, updated_at)
                   VALUES (?, ?, ?, '', ?, ?)""",
                (conv_id, project_id, title, now, now),
            )
    return {
        "id": conv_id,
        "project_id": project_id,
        "title": title,
        "preview": "",
        "created_at": now,
        "updated_at": now,
    }


def list_conversations(project_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """List conversations ordered by most recently updated."""
    with get_ai_db() as conn:
        if project_id is not None:
            cur = conn.execute(
                "SELECT * FROM conversations WHERE project_id = ? ORDER BY updated_at DESC",
                (project_id,),
            )
        else:
            cur = conn.execute("SELECT * FROM conversations ORDER BY updated_at DESC")
        return [dict(r) for r in cur.fetchall()]


def get_conversation(conv_id: str) -> Optional[Dict[str, Any]]:
    """Get conversation metadata by ID."""
    with get_ai_db() as conn:
        cur = conn.execute("SELECT * FROM conversations WHERE id = ?", (conv_id,))
        row = cur.fetchone()
        return dict(row) if row else None


def rename_conversation(conv_id: str, title: str) -> bool:
    """Rename a conversation thread."""
    now = datetime.datetime.now().isoformat()
    with get_ai_db() as conn:
        with conn:
            cur = conn.execute(
                "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?",
                (title.strip(), now, conv_id),
            )
            return cur.rowcount > 0


def delete_conversation(conv_id: str) -> bool:
    """Delete a conversation thread and all its messages."""
    with get_ai_db() as conn:
        with conn:
            cur = conn.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))
            return cur.rowcount > 0


# ── Messages CRUD ─────────────────────────────────────────────────────────────

def add_message(
    conversation_id: str,
    role: str,
    content: str,
    model_info: str = "",
    tokens: int = 0,
) -> Dict[str, Any]:
    """Append a user or assistant message to a conversation thread."""
    msg_id = str(uuid.uuid4())
    now = datetime.datetime.now().isoformat()
    preview = content.strip()[:100]

    with get_ai_db() as conn:
        with conn:
            conn.execute(
                """INSERT INTO messages (id, conversation_id, role, content, model_info, tokens, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (msg_id, conversation_id, role, content, model_info, tokens, now),
            )
            # Update preview and updated_at on parent conversation
            conn.execute(
                "UPDATE conversations SET updated_at = ?, preview = ? WHERE id = ?",
                (now, preview, conversation_id),
            )

    return {
        "id": msg_id,
        "conversation_id": conversation_id,
        "role": role,
        "content": content,
        "model_info": model_info,
        "tokens": tokens,
        "created_at": now,
    }


def get_conversation_messages(conversation_id: str, limit: int = 100) -> List[Dict[str, Any]]:
    """Fetch messages in chronological order for displaying in the chat view."""
    with get_ai_db() as conn:
        cur = conn.execute(
            """SELECT id, conversation_id, role, content, model_info, tokens, created_at
               FROM messages WHERE conversation_id = ?
               ORDER BY created_at ASC LIMIT ?""",
            (conversation_id, limit),
        )
        return [dict(r) for r in cur.fetchall()]


def get_recent_history_for_llm(conversation_id: str, max_messages: int = 20) -> List[Dict[str, str]]:
    """Fetch recent messages formatted as [{"role": "user"|"assistant", "content": "..."}] for LLM context."""
    with get_ai_db() as conn:
        cur = conn.execute(
            """SELECT role, content FROM (
                   SELECT role, content, created_at FROM messages
                   WHERE conversation_id = ? AND role IN ('user', 'assistant')
                   ORDER BY created_at DESC LIMIT ?
               ) ORDER BY created_at ASC""",
            (conversation_id, max_messages),
        )
        return [{"role": r["role"], "content": r["content"]} for r in cur.fetchall()]


# ── Tool Run Telemetry ────────────────────────────────────────────────────────

def record_tool_run(
    tool_name: str,
    input_data: Any = None,
    output_data: Any = None,
    conversation_id: Optional[str] = None,
    message_id: Optional[str] = None,
    duration_ms: Optional[int] = None,
    status: str = "success",
) -> str:
    """Record an executed tool action for audit and telemetry."""
    import json
    run_id = str(uuid.uuid4())
    now = datetime.datetime.now().isoformat()
    inp = json.dumps(input_data) if input_data is not None else None
    out = json.dumps(output_data) if output_data is not None else None

    with get_ai_db() as conn:
        with conn:
            conn.execute(
                """INSERT INTO tool_runs (id, conversation_id, message_id, tool_name, input_data, output_data, duration_ms, status, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (run_id, conversation_id, message_id, tool_name, inp, out, duration_ms, status, now),
            )
    return run_id


# ── Document Chunks & Knowledge Index CRUD ────────────────────────────────────

def insert_document_chunks(
    doc_id: int,
    file_path: str,
    filename: str,
    chunks: List[Dict[str, Any]],
    project_id: Optional[int] = None,
) -> int:
    """Store parsed document chunks and update FTS5 full-text index."""
    import re
    now = datetime.datetime.now().isoformat()

    with get_ai_db() as conn:
        with conn:
            # Delete any existing chunks for this document
            conn.execute("DELETE FROM document_chunks WHERE doc_id = ?", (doc_id,))
            conn.execute("DELETE FROM document_chunks_fts WHERE doc_id = ?", (str(doc_id),))

            count = 0
            for i, c in enumerate(chunks):
                chunk_id = str(uuid.uuid4())
                sec = (c.get("section_title") or "").strip()
                content = (c.get("content") or "").strip()
                tokens = c.get("token_count") or len(content.split())

                conn.execute(
                    """INSERT INTO document_chunks (id, doc_id, project_id, chunk_index, file_path, filename, section_title, content, token_count, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (chunk_id, doc_id, project_id, i, file_path, filename, sec, content, tokens, now),
                )

                conn.execute(
                    """INSERT INTO document_chunks_fts (chunk_id, doc_id, project_id, filename, section_title, content)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (chunk_id, str(doc_id), str(project_id or ""), filename, sec, content),
                )
                count += 1
            return count


def delete_document_chunks(doc_id: int) -> int:
    """Remove chunks and FTS index entries for a deleted document."""
    with get_ai_db() as conn:
        with conn:
            cur = conn.execute("DELETE FROM document_chunks WHERE doc_id = ?", (doc_id,))
            conn.execute("DELETE FROM document_chunks_fts WHERE doc_id = ?", (str(doc_id),))
            return cur.rowcount


def get_chunks_for_document(doc_id: int) -> List[Dict[str, Any]]:
    """Retrieve all chunks for a document ordered by index."""
    with get_ai_db() as conn:
        cur = conn.execute(
            """SELECT id, doc_id, project_id, chunk_index, file_path, filename, section_title, content, token_count, created_at
               FROM document_chunks WHERE doc_id = ? ORDER BY chunk_index ASC""",
            (doc_id,),
        )
        return [dict(r) for r in cur.fetchall()]


def get_total_chunks_count() -> int:
    """Return total number of indexed chunks across all documents."""
    with get_ai_db() as conn:
        cur = conn.execute("SELECT COUNT(*) FROM document_chunks")
        row = cur.fetchone()
        return row[0] if row else 0


def search_chunks_bm25(query: str, project_id: Optional[int] = None, limit: int = 5) -> List[Dict[str, Any]]:
    """
    Search document chunks using SQLite FTS5 BM25 relevance ranking.
    Returns matched chunks with document metadata and ranking score.
    """
    import re
    # Extract clean search tokens, avoiding FTS5 syntax errors
    tokens = re.findall(r"\w+", query)
    if not tokens:
        return []

    # Format terms for FTS MATCH: "token1" OR "token2" OR prefix matching "token*"
    # Exclude common english stopwords for cleaner retrieval
    stopwords = {"the", "is", "at", "which", "on", "and", "or", "in", "to", "for", "a", "an", "this", "that"}
    filtered_tokens = [t for t in tokens if t.lower() not in stopwords and len(t) > 2]
    if not filtered_tokens:
        filtered_tokens = tokens[:4]

    match_terms = " OR ".join(f'"{t}"*' for t in filtered_tokens[:10])

    with get_ai_db() as conn:
        if project_id is not None:
            cur = conn.execute(
                """SELECT c.id, c.doc_id, c.project_id, c.chunk_index, c.file_path, c.filename, c.section_title, c.content,
                          bm25(document_chunks_fts) as rank
                   FROM document_chunks_fts fts
                   JOIN document_chunks c ON c.id = fts.chunk_id
                   WHERE document_chunks_fts MATCH ? AND (c.project_id = ? OR c.project_id IS NULL)
                   ORDER BY rank ASC
                   LIMIT ?""",
                (match_terms, project_id, limit),
            )
        else:
            cur = conn.execute(
                """SELECT c.id, c.doc_id, c.project_id, c.chunk_index, c.file_path, c.filename, c.section_title, c.content,
                          bm25(document_chunks_fts) as rank
                   FROM document_chunks_fts fts
                   JOIN document_chunks c ON c.id = fts.chunk_id
                   WHERE document_chunks_fts MATCH ?
                   ORDER BY rank ASC
                   LIMIT ?""",
                (match_terms, limit),
            )

        return [dict(r) for r in cur.fetchall()]


# ── Applied Actions (State Persistence across Tab Switches) ───────────────────

def record_applied_action(
    action_key: str,
    conversation_id: str,
    action_name: str,
    title: str = "",
    entity_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Record an interactive action execution in ai_context.db.
    Guarantees that applied status is persisted across tab switches and app restarts.
    """
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    with get_ai_db() as conn:
        with conn:
            conn.execute("""
                INSERT INTO applied_actions (action_key, conversation_id, action_name, title, entity_id, applied_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(action_key) DO UPDATE SET
                    entity_id=excluded.entity_id,
                    applied_at=excluded.applied_at
            """, (action_key, conversation_id, action_name, title, entity_id, now))
    return {
        "action_key": action_key,
        "conversation_id": conversation_id,
        "action_name": action_name,
        "title": title,
        "entity_id": entity_id,
        "applied_at": now,
    }


def get_applied_actions(conversation_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Retrieve all recorded applied actions, optionally filtered by conversation_id."""
    with get_ai_db() as conn:
        if conversation_id:
            rows = conn.execute(
                "SELECT * FROM applied_actions WHERE conversation_id = ? ORDER BY id ASC",
                (conversation_id,),
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM applied_actions ORDER BY id ASC").fetchall()
        return [dict(r) for r in rows]


def get_applied_action_keys(conversation_id: Optional[str] = None) -> List[str]:
    """Retrieve distinct action keys that have been applied."""
    with get_ai_db() as conn:
        if conversation_id:
            rows = conn.execute(
                "SELECT action_key FROM applied_actions WHERE conversation_id = ?",
                (conversation_id,),
            ).fetchall()
        else:
            rows = conn.execute("SELECT action_key FROM applied_actions").fetchall()
        return [r["action_key"] for r in rows]

