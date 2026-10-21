# ── artifacts_db.py ─────────────────────────────────────────────────────────
# Dedicated SQLite database for PM Tool Living Documents & Contextual Artifacts.
# Stored at %LOCALAPPDATA%\PMTool\artifacts.db.
# Completely isolated from pmtool.db and ai_context.db to avoid database bloat.

import os
import json
import sqlite3
import uuid
from datetime import datetime, timezone
from queue import Queue, Empty
from pathlib import Path
from typing import List, Dict, Optional, Any
from contextlib import contextmanager


def _artifacts_data_dir() -> Path:
    """Persistent user data directory for artifacts storage."""
    base = os.getenv("LOCALAPPDATA") or str(Path.home() / ".pmtool")
    data_dir = Path(base) / "PMTool"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


ARTIFACTS_DB_PATH = _artifacts_data_dir() / "artifacts.db"
ARTIFACTS_SCHEMA_VERSION = 1


# ── Connection Pool ───────────────────────────────────────────────────────────

class _ArtifactsPool:
    def __init__(self, size: int = 5):
        self._q: Queue = Queue(maxsize=size)
        for _ in range(size):
            self._q.put(self._make())

    def _make(self) -> sqlite3.Connection:
        conn = sqlite3.connect(
            str(ARTIFACTS_DB_PATH),
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


_pool: Optional[_ArtifactsPool] = None


def get_artifacts_pool() -> _ArtifactsPool:
    global _pool
    if _pool is None:
        _pool = _ArtifactsPool()
    return _pool


@contextmanager
def get_artifacts_db():
    p = get_artifacts_pool()
    conn = p.get()
    try:
        yield conn
    finally:
        p.put(conn)


# ── Schema Initialization ─────────────────────────────────────────────────────

def init_artifacts_db():
    """Initializes tables, indexes, and FTS5 triggers in artifacts.db."""
    with get_artifacts_db() as conn:
        with conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS artifacts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    uuid TEXT UNIQUE NOT NULL,
                    project_id INTEGER,
                    title TEXT NOT NULL,
                    doc_type TEXT NOT NULL DEFAULT 'document',
                    content TEXT NOT NULL DEFAULT '',
                    summary TEXT DEFAULT '',
                    tags TEXT DEFAULT '[]',
                    is_pinned INTEGER DEFAULT 0,
                    word_count INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)

            conn.execute("""
                CREATE TABLE IF NOT EXISTS artifact_versions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    artifact_id INTEGER NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
                    version_num INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    content TEXT NOT NULL,
                    summary TEXT DEFAULT '',
                    created_at TEXT NOT NULL
                )
            """)

            # Indexes for fast querying & project filtering
            conn.execute("CREATE INDEX IF NOT EXISTS idx_artifacts_project_id ON artifacts(project_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_artifacts_doc_type ON artifacts(doc_type)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_artifacts_is_pinned ON artifacts(is_pinned)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_artifacts_updated_at ON artifacts(updated_at DESC)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_artifact_versions_doc ON artifact_versions(artifact_id, version_num DESC)")

            # Outpost external linkage columns
            for col_def in (
                "external_provider TEXT DEFAULT NULL",
                "external_id TEXT DEFAULT NULL",
                "external_url TEXT DEFAULT NULL",
                "external_properties TEXT DEFAULT '{}'",
                "sync_status TEXT DEFAULT 'synced'",
                "last_synced_at TIMESTAMP DEFAULT NULL",
            ):
                try:
                    conn.execute(f"ALTER TABLE artifacts ADD COLUMN {col_def}")
                except sqlite3.OperationalError:
                    pass

            # Setup SQLite FTS5 for fast full-text searching across all documents
            try:
                conn.execute("""
                    CREATE VIRTUAL TABLE IF NOT EXISTS artifacts_fts USING fts5(
                        title,
                        content,
                        summary,
                        tags,
                        content='artifacts',
                        content_rowid='id'
                    )
                """)

                # Automated triggers to keep FTS5 synchronized with artifacts
                conn.execute("""
                    CREATE TRIGGER IF NOT EXISTS artifacts_ai AFTER INSERT ON artifacts BEGIN
                        INSERT INTO artifacts_fts(rowid, title, content, summary, tags)
                        VALUES (new.id, new.title, new.content, new.summary, new.tags);
                    END;
                """)

                conn.execute("""
                    CREATE TRIGGER IF NOT EXISTS artifacts_ad AFTER DELETE ON artifacts BEGIN
                        INSERT INTO artifacts_fts(artifacts_fts, rowid, title, content, summary, tags)
                        VALUES('delete', old.id, old.title, old.content, old.summary, old.tags);
                    END;
                """)

                conn.execute("""
                    CREATE TRIGGER IF NOT EXISTS artifacts_au AFTER UPDATE ON artifacts BEGIN
                        INSERT INTO artifacts_fts(artifacts_fts, rowid, title, content, summary, tags)
                        VALUES('delete', old.id, old.title, old.content, old.summary, old.tags);
                        INSERT INTO artifacts_fts(rowid, title, content, summary, tags)
                        VALUES (new.id, new.title, new.content, new.summary, new.tags);
                    END;
                """)
            except Exception as e:
                # In environments where FTS5 is compiled out, fallback to LIKE queries seamlessly
                pass


def _calculate_word_count(text: str) -> int:
    if not text:
        return 0
    return len(text.split())


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Core CRUD Methods ──────────────────────────────────────────────────────────

def create_artifact(
    title: str,
    content: str = "",
    doc_type: str = "document",
    project_id: Optional[int] = None,
    tags: Optional[List[str] | str] = None,
    summary: str = "",
    is_pinned: int = 0,
) -> Dict[str, Any]:
    """Create a new living document in artifacts.db."""
    clean_title = (title or "Untitled Document").strip()
    clean_type = (doc_type or "document").strip().lower()
    clean_content = content or ""
    word_cnt = _calculate_word_count(clean_content)

    if tags is None:
        clean_tags = "[]"
    elif isinstance(tags, list):
        clean_tags = json.dumps(tags)
    else:
        clean_tags = str(tags)

    art_uuid = str(uuid.uuid4())
    now = _now_iso()

    with get_artifacts_db() as conn:
        with conn:
            cur = conn.execute(
                """
                INSERT INTO artifacts (
                    uuid, project_id, title, doc_type, content, summary, tags, is_pinned, word_count, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING *
                """,
                (
                    art_uuid,
                    project_id,
                    clean_title,
                    clean_type,
                    clean_content,
                    summary.strip(),
                    clean_tags,
                    1 if is_pinned else 0,
                    word_cnt,
                    now,
                    now,
                ),
            )
            row = cur.fetchone()
            artifact = dict(row)

            # Create initial version snapshot (v1)
            conn.execute(
                """
                INSERT INTO artifact_versions (artifact_id, version_num, title, content, summary, created_at)
                VALUES (?, 1, ?, ?, ?, ?)
                """,
                (artifact["id"], clean_title, clean_content, summary.strip() or "Initial Draft", now),
            )

    return _format_artifact_dict(artifact)


def get_artifact(artifact_id: int | str) -> Optional[Dict[str, Any]]:
    """Retrieve an artifact by numeric ID or UUID."""
    query = "SELECT * FROM artifacts WHERE "
    params = ()

    if isinstance(artifact_id, int) or (isinstance(artifact_id, str) and artifact_id.isdigit()):
        query += "id = ?"
        params = (int(artifact_id),)
    else:
        query += "uuid = ?"
        params = (str(artifact_id),)

    with get_artifacts_db() as conn:
        cur = conn.execute(query, params)
        row = cur.fetchone()
        if not row:
            return None
        return _format_artifact_dict(dict(row))


def list_artifacts(
    project_id: Optional[int] = None,
    doc_type: Optional[str] = None,
    search: Optional[str] = None,
    is_pinned: Optional[bool] = None,
    limit: int = 100,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    """List living documents with flexible filtering and search."""
    clauses = []
    params: List[Any] = []

    if project_id is not None:
        clauses.append("project_id = ?")
        params.append(project_id)

    if doc_type and doc_type != "all":
        clauses.append("doc_type = ?")
        params.append(doc_type.strip().lower())

    if is_pinned is not None:
        clauses.append("is_pinned = ?")
        params.append(1 if is_pinned else 0)

    # Search: attempt FTS5 match, fallback to LIKE
    fts_ids = None
    if search and search.strip():
        term = search.strip()
        try:
            with get_artifacts_db() as conn:
                clean_term = f'"{term}"*'
                cur = conn.execute(
                    "SELECT rowid FROM artifacts_fts WHERE artifacts_fts MATCH ? LIMIT 100",
                    (clean_term,),
                )
                fts_ids = [r["rowid"] for r in cur.fetchall()]
        except Exception:
            fts_ids = None

        if fts_ids is not None:
            if fts_ids:
                placeholders = ",".join("?" for _ in fts_ids)
                clauses.append(f"id IN ({placeholders})")
                params.extend(fts_ids)
            else:
                # No matches found via FTS
                return []
        else:
            clauses.append("(title LIKE ? OR content LIKE ? OR summary LIKE ?)")
            pat = f"%{term}%"
            params.extend([pat, pat, pat])

    where_sql = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    sql = f"""
        SELECT * FROM artifacts
        {where_sql}
        ORDER BY is_pinned DESC, updated_at DESC
        LIMIT ? OFFSET ?
    """
    params.extend([limit, offset])

    with get_artifacts_db() as conn:
        cur = conn.execute(sql, tuple(params))
        rows = cur.fetchall()

    return [_format_artifact_dict(dict(r)) for r in rows]


def update_artifact(
    artifact_id: int,
    title: Optional[str] = None,
    content: Optional[str] = None,
    doc_type: Optional[str] = None,
    project_id: Optional[int] = None,
    tags: Optional[List[str] | str] = None,
    summary: Optional[str] = None,
    is_pinned: Optional[int | bool] = None,
    create_version: bool = False,
    version_summary: str = "",
    **kwargs,
) -> Optional[Dict[str, Any]]:
    """Update fields of an artifact and optionally snapshot a new version."""
    current = get_artifact(artifact_id)
    if not current:
        return None

    updates: Dict[str, Any] = {}

    if title is not None:
        updates["title"] = title.strip()
    if content is not None:
        updates["content"] = content
        updates["word_count"] = _calculate_word_count(content)
    if doc_type is not None:
        updates["doc_type"] = doc_type.strip().lower()
    if project_id is not None:
        updates["project_id"] = project_id if project_id != 0 else None
    if tags is not None:
        updates["tags"] = json.dumps(tags) if isinstance(tags, list) else str(tags)
    if summary is not None:
        updates["summary"] = summary.strip()
    if is_pinned is not None:
        updates["is_pinned"] = 1 if is_pinned else 0
    if "external_provider" in kwargs and kwargs["external_provider"] is not None:
        updates["external_provider"] = kwargs["external_provider"]
    if "external_id" in kwargs and kwargs["external_id"] is not None:
        updates["external_id"] = kwargs["external_id"]
    if "external_url" in kwargs and kwargs["external_url"] is not None:
        updates["external_url"] = kwargs["external_url"]
    if "external_properties" in kwargs and kwargs["external_properties"] is not None:
        ep = kwargs["external_properties"]
        updates["external_properties"] = json.dumps(ep) if isinstance(ep, dict) else str(ep)
    if "sync_status" in kwargs and kwargs["sync_status"] is not None:
        updates["sync_status"] = kwargs["sync_status"]
    if "last_synced_at" in kwargs and kwargs["last_synced_at"] is not None:
        updates["last_synced_at"] = kwargs["last_synced_at"]

    if not updates and not create_version:
        return current

    updates["updated_at"] = _now_iso()

    set_clause = ", ".join(f"{k} = ?" for k in updates.keys())
    values = list(updates.values())
    values.append(artifact_id)

    with get_artifacts_db() as conn:
        with conn:
            conn.execute(f"UPDATE artifacts SET {set_clause} WHERE id = ?", tuple(values))

            # Handle version snapshot if explicitly requested or significant update
            if create_version:
                cur_v = conn.execute(
                    "SELECT COALESCE(MAX(version_num), 0) + 1 AS next_v FROM artifact_versions WHERE artifact_id = ?",
                    (artifact_id,),
                )
                next_v = cur_v.fetchone()["next_v"]
                active_title = updates.get("title", current["title"])
                active_content = updates.get("content", current["content"])
                v_summary = version_summary.strip() or f"Revision {next_v}"

                conn.execute(
                    """
                    INSERT INTO artifact_versions (artifact_id, version_num, title, content, summary, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (artifact_id, next_v, active_title, active_content, v_summary, updates["updated_at"]),
                )

    return get_artifact(artifact_id)


def delete_artifact(artifact_id: int) -> bool:
    """Delete an artifact and its historical versions."""
    with get_artifacts_db() as conn:
        with conn:
            cur = conn.execute("DELETE FROM artifacts WHERE id = ?", (artifact_id,))
            return cur.rowcount > 0


def toggle_pin_artifact(artifact_id: int) -> Optional[Dict[str, Any]]:
    """Toggle the pinned state of an artifact."""
    current = get_artifact(artifact_id)
    if not current:
        return None
    new_pinned = 0 if current.get("is_pinned") else 1
    return update_artifact(artifact_id, is_pinned=new_pinned)


def list_artifact_versions(artifact_id: int) -> List[Dict[str, Any]]:
    """Retrieve historical revision snapshots of an artifact."""
    with get_artifacts_db() as conn:
        cur = conn.execute(
            """
            SELECT id, artifact_id, version_num, title, summary, created_at,
                   LENGTH(content) AS byte_size
            FROM artifact_versions
            WHERE artifact_id = ?
            ORDER BY version_num DESC
            """,
            (artifact_id,),
        )
        return [dict(r) for r in cur.fetchall()]


def restore_artifact_version(artifact_id: int, version_num: int) -> Optional[Dict[str, Any]]:
    """Revert an artifact's content to a previous historical snapshot."""
    with get_artifacts_db() as conn:
        cur = conn.execute(
            "SELECT * FROM artifact_versions WHERE artifact_id = ? AND version_num = ?",
            (artifact_id, version_num),
        )
        row = cur.fetchone()
        if not row:
            return None
        snapshot = dict(row)

    return update_artifact(
        artifact_id=artifact_id,
        title=snapshot["title"],
        content=snapshot["content"],
        create_version=True,
        version_summary=f"Reverted to Version {version_num}",
    )


revert_to_version = restore_artifact_version


def create_artifact_version(artifact_id: int, summary: str = "") -> Dict[str, Any]:
    """Explicitly snapshot a historical version of an existing artifact."""
    doc = get_artifact(artifact_id)
    if not doc:
        raise ValueError(f"Artifact {artifact_id} not found.")
    now = _now_iso()
    with get_artifacts_db() as conn:
        with conn:
            cur_v = conn.execute(
                "SELECT COALESCE(MAX(version_num), 0) + 1 AS next_v FROM artifact_versions WHERE artifact_id = ?",
                (artifact_id,),
            )
            next_v = cur_v.fetchone()["next_v"]
            cur = conn.execute(
                """
                INSERT INTO artifact_versions (artifact_id, version_num, title, content, summary, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                RETURNING *
                """,
                (artifact_id, next_v, doc["title"], doc.get("content", ""), summary.strip() or f"Snapshot v{next_v}", now),
            )
            return dict(cur.fetchone())



def get_artifacts_summary_stats() -> Dict[str, Any]:
    """Summary metrics across all living documents."""
    with get_artifacts_db() as conn:
        cur = conn.execute("""
            SELECT
                COUNT(*) AS total_count,
                SUM(CASE WHEN doc_type = 'prd' THEN 1 ELSE 0 END) AS prd_count,
                SUM(CASE WHEN doc_type = 'rfc' THEN 1 ELSE 0 END) AS rfc_count,
                SUM(CASE WHEN doc_type = 'brief' THEN 1 ELSE 0 END) AS brief_count,
                SUM(CASE WHEN is_pinned = 1 THEN 1 ELSE 0 END) AS pinned_count,
                COALESCE(SUM(word_count), 0) AS total_words
            FROM artifacts
        """)
        return dict(cur.fetchone())


# ── Internal Helpers ──────────────────────────────────────────────────────────

def _format_artifact_dict(row: Dict[str, Any]) -> Dict[str, Any]:
    d = dict(row)
    if isinstance(d.get("tags"), str):
        try:
            d["tags"] = json.loads(d["tags"])
        except Exception:
            d["tags"] = []
    elif not d.get("tags"):
        d["tags"] = []

    d["is_pinned"] = bool(d.get("is_pinned", 0))

    if isinstance(d.get("external_properties"), str):
        try:
            d["external_properties"] = json.loads(d["external_properties"])
        except Exception:
            d["external_properties"] = {}
    elif not d.get("external_properties"):
        d["external_properties"] = {}

    return d


# Auto-initialize DB on import
try:
    init_artifacts_db()
except Exception as _e:
    pass
