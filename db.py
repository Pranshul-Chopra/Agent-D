# ── db.py ─────────────────────────────────────────────────────────────────────
# SQLite database setup and connection pooling for PM Tool.

import os
import sqlite3
import threading
from contextlib import contextmanager
from queue import Queue, Empty
from pathlib import Path
from datetime import datetime


def _user_data_dir() -> Path:
    """
    Persistent, per-user, per-machine data directory.
    Stores the database in %LOCALAPPDATA%\\PMTool on Windows.
    """
    base = os.getenv("LOCALAPPDATA") or str(Path.home() / ".pmtool")
    data_dir = Path(base) / "PMTool"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


DB_PATH = _user_data_dir() / "pmtool.db"
SCHEMA_VERSION = 1


# ── Connection pool ────────────────────────────────────────────────────────────

class _Pool:
    def __init__(self, size: int = 5):
        self._q: Queue = Queue(maxsize=size)
        self._lock = threading.Lock()
        for _ in range(size):
            self._q.put(self._make())

    def _make(self) -> sqlite3.Connection:
        con = sqlite3.connect(str(DB_PATH), check_same_thread=False, timeout=10.0)
        con.row_factory = sqlite3.Row
        con.execute("PRAGMA journal_mode=WAL")
        con.execute("PRAGMA foreign_keys=ON")
        return con

    def get(self) -> sqlite3.Connection:
        try:
            return self._q.get(timeout=5.0)
        except Empty:
            # Fallback connection if pool is exhausted
            return self._make()

    def put(self, con: sqlite3.Connection) -> None:
        try:
            self._q.put(con, block=False)
        except Exception:
            try:
                con.close()
            except Exception:
                pass


_pool: _Pool | None = None
_pool_lock = threading.Lock()


def get_pool() -> _Pool:
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                _pool = _Pool()
    return _pool


@contextmanager
def get_db():
    """Context manager for acquiring and releasing a connection from the pool."""
    pool = get_pool()
    con = pool.get()
    try:
        yield con
    finally:
        pool.put(con)


# ── Database Initialization ────────────────────────────────────────────────────

def init_db():
    """Initializes tables and performs migrations."""
    with get_db() as con:
        with con:
            con.execute("""
                CREATE TABLE IF NOT EXISTS schema_version (
                    version INTEGER PRIMARY KEY,
                    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)

            cur = con.execute("SELECT MAX(version) FROM schema_version")
            row = cur.fetchone()
            current_ver = row[0] if row and row[0] is not None else 0

            if current_ver < 1:
                con.executescript("""
                    CREATE TABLE IF NOT EXISTS projects (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        description TEXT,
                        status TEXT NOT NULL DEFAULT 'active',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE IF NOT EXISTS tasks (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
                        title TEXT NOT NULL,
                        description TEXT,
                        status TEXT NOT NULL DEFAULT 'todo',
                        priority TEXT NOT NULL DEFAULT 'medium',
                        due_date TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE IF NOT EXISTS app_settings (
                        key TEXT PRIMARY KEY,
                        value TEXT,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );

                    INSERT OR IGNORE INTO app_settings (key, value)
                    VALUES ('theme', 'dark'), ('app_version', '1.0.0');

                    CREATE TABLE IF NOT EXISTS ai_config (
                        key TEXT PRIMARY KEY,
                        value TEXT NOT NULL,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );

                    INSERT INTO schema_version (version) VALUES (1);
                """)

            if current_ver < 2:
                con.executescript("""
                    CREATE TABLE IF NOT EXISTS ai_config (
                        key TEXT PRIMARY KEY,
                        value TEXT NOT NULL,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );

                    INSERT OR IGNORE INTO schema_version (version) VALUES (2);
                """)

            if current_ver < 3:
                for col_def in (
                    "domain TEXT DEFAULT 'Platform'",
                    "priority TEXT DEFAULT 'medium'",
                    "health TEXT DEFAULT 'planning'",
                    "owner TEXT DEFAULT ''",
                    "target_date TEXT DEFAULT ''",
                    "goals TEXT DEFAULT ''",
                    "tech_stack TEXT DEFAULT ''",
                ):
                    try:
                        con.execute(f"ALTER TABLE projects ADD COLUMN {col_def}")
                    except sqlite3.OperationalError:
                        pass
                con.execute("INSERT OR IGNORE INTO schema_version (version) VALUES (3)")

            if current_ver < 4:
                con.executescript("""
                    CREATE TABLE IF NOT EXISTS documents (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
                        file_path TEXT UNIQUE NOT NULL,
                        filename TEXT NOT NULL,
                        file_type TEXT NOT NULL,
                        file_size INTEGER NOT NULL,
                        last_modified REAL NOT NULL,
                        status TEXT DEFAULT 'indexed',
                        chunk_count INTEGER DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE IF NOT EXISTS doc_folders (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        folder_path TEXT UNIQUE NOT NULL,
                        project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
                        label TEXT DEFAULT '',
                        recursive INTEGER DEFAULT 1,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );

                    INSERT OR IGNORE INTO schema_version (version) VALUES (4);
                """)

            if current_ver < 5:
                for col_def in (
                    "story_points INTEGER DEFAULT 0",
                    "acceptance_criteria TEXT DEFAULT ''",
                    "assignee TEXT DEFAULT ''",
                ):
                    try:
                        con.execute(f"ALTER TABLE tasks ADD COLUMN {col_def}")
                    except sqlite3.OperationalError:
                        pass
                con.execute("INSERT OR IGNORE INTO schema_version (version) VALUES (5)")

            if current_ver < 6:
                con.executescript("""
                    CREATE TABLE IF NOT EXISTS data_sources (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        source_type TEXT NOT NULL,
                        file_path TEXT NOT NULL,
                        file_size INTEGER DEFAULT 0,
                        table_name TEXT NOT NULL,
                        row_count INTEGER DEFAULT 0,
                        column_count INTEGER DEFAULT 0,
                        schema_json TEXT NOT NULL DEFAULT '[]',
                        project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE IF NOT EXISTS dashboards (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        title TEXT NOT NULL,
                        description TEXT DEFAULT '',
                        data_source_id INTEGER REFERENCES data_sources(id) ON DELETE SET NULL,
                        project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE IF NOT EXISTS dashboard_widgets (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        dashboard_id INTEGER NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
                        data_source_id INTEGER NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
                        widget_type TEXT NOT NULL DEFAULT 'kpi_card',
                        title TEXT NOT NULL,
                        metric_op TEXT DEFAULT 'count',
                        value_column TEXT DEFAULT '',
                        group_by_column TEXT DEFAULT '',
                        filter_sql TEXT DEFAULT '',
                        format_type TEXT DEFAULT 'number',
                        target_value REAL DEFAULT NULL,
                        order_idx INTEGER DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );

                    INSERT OR IGNORE INTO schema_version (version) VALUES (6);
                """)

            if current_ver < 7:
                try:
                    con.execute("ALTER TABLE tasks ADD COLUMN ticket_type TEXT DEFAULT 'internal'")
                except sqlite3.OperationalError:
                    pass
                con.execute("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('ai_ticket_access', 'all')")
                con.execute("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('ai_ticket_creation', 'enabled')")
                con.execute("INSERT OR IGNORE INTO schema_version (version) VALUES (7)")

            if current_ver < 8:
                con.executescript("""
                    CREATE TABLE IF NOT EXISTS outpost_configs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        provider TEXT NOT NULL UNIQUE,       -- 'jira' | 'notion' | 'gdocs'
                        base_url TEXT,                       -- e.g. 'https://myorg.atlassian.net'
                        auth_token TEXT,                     -- machine-encrypted token
                        user_email TEXT,                     -- Associated user email (Jira basic auth)
                        project_key TEXT,                    -- Default project/workspace key
                        database_id TEXT,                    -- Default Notion database ID
                        is_active INTEGER DEFAULT 0,         -- 1 = enabled, 0 = disabled
                        sync_policy TEXT DEFAULT 'manual',   -- 'manual' | 'on_create'
                        last_tested_at TIMESTAMP,            -- Timestamp of last successful test
                        last_error TEXT,                     -- Diagnostic error string if failed
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE IF NOT EXISTS outpost_transactions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        provider TEXT NOT NULL,
                        entity_type TEXT NOT NULL,           -- 'task' | 'artifact'
                        entity_id INTEGER NOT NULL,
                        action TEXT NOT NULL,                -- 'create' | 'update' | 'transition' | 'delete'
                        payload TEXT NOT NULL,               -- JSON payload
                        status TEXT DEFAULT 'pending',       -- 'pending' | 'processing' | 'failed'
                        retry_count INTEGER DEFAULT 0,
                        error_message TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                """)
                for col_def in (
                    "outpost_provider TEXT DEFAULT NULL",
                    "outpost_project_key TEXT DEFAULT NULL",
                    "outpost_board_id INTEGER DEFAULT NULL",
                    "is_outpost_dictated INTEGER DEFAULT 0",
                    "last_synced_at TIMESTAMP DEFAULT NULL",
                ):
                    try:
                        con.execute(f"ALTER TABLE projects ADD COLUMN {col_def}")
                    except sqlite3.OperationalError:
                        pass

                for col_def in (
                    "external_provider TEXT DEFAULT NULL",
                    "external_id TEXT DEFAULT NULL",
                    "external_url TEXT DEFAULT NULL",
                    "external_type TEXT DEFAULT 'Task'",
                    "external_labels TEXT DEFAULT '[]'",
                    "sync_status TEXT DEFAULT 'synced'",
                    "last_synced_at TIMESTAMP DEFAULT NULL",
                ):
                    try:
                        con.execute(f"ALTER TABLE tasks ADD COLUMN {col_def}")
                    except sqlite3.OperationalError:
                        pass
                con.execute("INSERT OR IGNORE INTO schema_version (version) VALUES (8)")


# ── AI Config & Policy CRUD ────────────────────────────────────────────────────

def get_ai_config(key: str) -> str | None:
    """Retrieve a stored AI config value (e.g. provider, api_key, model_name)."""
    with get_db() as con:
        row = con.execute("SELECT value FROM ai_config WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else None


def get_ai_ticket_policy() -> dict:
    """Return AI ticket access scope ('all', 'internal_only', 'external_only', 'none') and creation permission."""
    with get_db() as con:
        access_row = con.execute("SELECT value FROM app_settings WHERE key = 'ai_ticket_access'").fetchone()
        create_row = con.execute("SELECT value FROM app_settings WHERE key = 'ai_ticket_creation'").fetchone()
    return {
        "access_scope": access_row["value"] if access_row else "all",
        "creation_allowed": (create_row["value"] if create_row else "enabled") == "enabled",
    }


def set_ai_ticket_policy(access_scope: str, creation_allowed: bool | str = True) -> dict:
    """Set AI ticket access scope and creation permission."""
    scope = (access_scope or "all").lower().strip()
    if scope not in ("all", "internal_only", "external_only", "none"):
        scope = "all"
    creation_str = "enabled" if (creation_allowed is True or str(creation_allowed).lower() in ("enabled", "true", "1")) else "disabled"
    with get_db() as con:
        with con:
            con.execute("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('ai_ticket_access', ?, CURRENT_TIMESTAMP)", (scope,))
            con.execute("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('ai_ticket_creation', ?, CURRENT_TIMESTAMP)", (creation_str,))
    return {"access_scope": scope, "creation_allowed": creation_str == "enabled"}


def set_ai_config(key: str, value: str) -> None:
    """Upsert an AI config key-value pair."""
    with get_db() as con:
        with con:
            con.execute(
                "INSERT INTO ai_config (key, value, updated_at) VALUES (?, ?, datetime('now')) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
                (key, value),
            )


def delete_ai_config(key: str) -> None:
    """Delete a stored AI config entry."""
    with get_db() as con:
        with con:
            con.execute("DELETE FROM ai_config WHERE key = ?", (key,))


def list_ai_configs() -> dict[str, str]:
    """List all stored AI config keys and their (possibly encrypted) values."""
    with get_db() as con:
        rows = con.execute("SELECT key, value FROM ai_config").fetchall()
    return {r["key"]: r["value"] for r in rows}


# ── App Settings CRUD ──────────────────────────────────────────────────────────

def get_setting(key: str) -> str | None:
    """Retrieve an app-level setting value."""
    with get_db() as con:
        row = con.execute("SELECT value FROM app_settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else None


def set_setting(key: str, value: str) -> None:
    """Upsert an app-level setting."""
    with get_db() as con:
        with con:
            con.execute(
                "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now')) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
                (key, value),
            )


# ── Projects & Tasks CRUD ──────────────────────────────────────────────────────

def get_projects(
    search: str | None = None,
    status: str | None = None,
    health: str | None = None,
    domain: str | None = None,
) -> list[dict]:
    """Retrieve projects with optional filters and associated task counts."""
    query = """
        SELECT p.*,
               COUNT(t.id) as task_count,
               SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) as done_task_count
        FROM projects p
        LEFT JOIN tasks t ON t.project_id = p.id
        WHERE 1=1
    """
    params = []

    if status and status != "all":
        query += " AND p.status = ?"
        params.append(status)
    if health and health != "all":
        query += " AND p.health = ?"
        params.append(health)
    if domain and domain != "all":
        query += " AND p.domain = ?"
        params.append(domain)
    if search:
        query += " AND (p.name LIKE ? OR p.description LIKE ? OR p.goals LIKE ?)"
        s = f"%{search.strip()}%"
        params.extend([s, s, s])

    query += " GROUP BY p.id ORDER BY p.updated_at DESC"

    with get_db() as con:
        rows = con.execute(query, params).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            tc = d.get("task_count") or 0
            dc = d.get("done_task_count") or 0
            d["progress_pct"] = round((dc / tc * 100)) if tc > 0 else 0
            result.append(d)
        return result


def get_project(project_id: int) -> dict | None:
    """Retrieve a single project along with task summary statistics."""
    with get_db() as con:
        row = con.execute(
            """SELECT p.*,
                      COUNT(t.id) as task_count,
                      SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) as done_task_count,
                      SUM(CASE WHEN t.status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_task_count,
                      SUM(CASE WHEN t.status = 'todo' THEN 1 ELSE 0 END) as todo_task_count
               FROM projects p
               LEFT JOIN tasks t ON t.project_id = p.id
               WHERE p.id = ?
               GROUP BY p.id""",
            (project_id,),
        ).fetchone()

        if not row:
            return None

        d = dict(row)
        tc = d.get("task_count") or 0
        dc = d.get("done_task_count") or 0
        d["progress_pct"] = round((dc / tc * 100)) if tc > 0 else 0
        return d


def create_project(
    name: str,
    description: str = "",
    domain: str = "Platform",
    priority: str = "medium",
    health: str = "planning",
    owner: str = "",
    target_date: str = "",
    goals: str = "",
    tech_stack: str = "",
) -> dict:
    """Create a new rich enterprise project."""
    with get_db() as con:
        with con:
            cur = con.execute(
                """INSERT INTO projects (name, description, domain, priority, health, owner, target_date, goals, tech_stack)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                   RETURNING *""",
                (
                    name.strip(),
                    description.strip(),
                    domain.strip(),
                    priority.strip(),
                    health.strip(),
                    owner.strip(),
                    target_date.strip(),
                    goals.strip(),
                    tech_stack.strip(),
                ),
            )
            return dict(cur.fetchone())


def update_project(project_id: int, **fields) -> dict | None:
    """Update arbitrary project attributes."""
    allowed = {"name", "description", "domain", "priority", "health", "owner", "target_date", "goals", "tech_stack", "status"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return get_project(project_id)

    set_clause = ", ".join(f"{k} = ?" for k in updates.keys())
    values = list(updates.values())
    values.append(project_id)

    with get_db() as con:
        with con:
            con.execute(f"UPDATE projects SET {set_clause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?", values)
    return get_project(project_id)


def delete_project(project_id: int) -> bool:
    """Delete a project and cascade-delete its tasks."""
    with get_db() as con:
        with con:
            cur = con.execute("DELETE FROM projects WHERE id = ?", (project_id,))
            return cur.rowcount > 0


def get_project_tasks(project_id: int) -> list[dict]:
    """Retrieve all tasks belonging to a project."""
    with get_db() as con:
        rows = con.execute(
            """SELECT t.*, p.name AS project_name, p.domain AS project_domain
               FROM tasks t
               LEFT JOIN projects p ON t.project_id = p.id
               WHERE t.project_id = ? 
               ORDER BY CASE t.status WHEN 'in_progress' THEN 1 WHEN 'blocked' THEN 2 WHEN 'todo' THEN 3 ELSE 4 END, t.created_at DESC""",
            (project_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def get_task(task_id: int) -> dict | None:
    """Retrieve a single task by ID."""
    with get_db() as con:
        row = con.execute(
            """SELECT t.*, p.name AS project_name, p.domain AS project_domain
               FROM tasks t
               LEFT JOIN projects p ON t.project_id = p.id
               WHERE t.id = ?""",
            (task_id,),
        ).fetchone()
        return dict(row) if row else None


def get_tasks(
    project_id: int | None = None,
    status: str | None = None,
    priority: str | None = None,
    search: str | None = None,
) -> list[dict]:
    """
    Retrieve tasks with joined project metadata, supporting filtering by project,
    status, priority, and search keywords.
    """
    query = """
        SELECT t.*, p.name AS project_name, p.domain AS project_domain
        FROM tasks t
        LEFT JOIN projects p ON t.project_id = p.id
        WHERE 1=1
    """
    params = []
    if project_id is not None and project_id != 0:
        query += " AND t.project_id = ?"
        params.append(project_id)
    if status and status != "all":
        query += " AND t.status = ?"
        params.append(status)
    if priority and priority != "all":
        query += " AND t.priority = ?"
        params.append(priority)
    if search:
        query += " AND (t.title LIKE ? OR t.description LIKE ? OR t.acceptance_criteria LIKE ?)"
        term = f"%{search.strip()}%"
        params.extend([term, term, term])

    query += """
        ORDER BY 
            CASE t.status 
                WHEN 'in_progress' THEN 1 
                WHEN 'blocked' THEN 2 
                WHEN 'todo' THEN 3 
                ELSE 4 
            END,
            CASE t.priority 
                WHEN 'critical' THEN 1 
                WHEN 'high' THEN 2 
                WHEN 'medium' THEN 3 
                ELSE 4 
            END,
            t.created_at DESC
    """
    with get_db() as con:
        rows = con.execute(query, params).fetchall()
        return [dict(r) for r in rows]


def get_sprint_metrics(project_id: int | None = None) -> dict:
    """
    Calculate real-time sprint execution metrics:
    - total tasks
    - counts by status (todo, in_progress, blocked, done)
    - counts by priority (critical, high, medium, low)
    - completion rate percentage
    - total story points & completed story points
    """
    with get_db() as con:
        where = "WHERE project_id = ?" if (project_id and project_id != 0) else ""
        params = (project_id,) if (project_id and project_id != 0) else ()

        cur = con.execute(f"SELECT status, priority, COALESCE(story_points, 0) as pts FROM tasks {where}", params)
        rows = cur.fetchall()

        total = len(rows)
        status_counts = {"todo": 0, "in_progress": 0, "blocked": 0, "done": 0}
        priority_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
        total_pts = 0
        done_pts = 0

        for r in rows:
            st = r["status"]
            pr = r["priority"]
            pts = int(r["pts"] or 0)
            if st in status_counts:
                status_counts[st] += 1
            if pr in priority_counts:
                priority_counts[pr] += 1
            total_pts += pts
            if st == "done":
                done_pts += pts

        done_count = status_counts["done"]
        completion_rate = round((done_count / total * 100), 1) if total > 0 else 0.0

        return {
            "total_tasks": total,
            "status_counts": status_counts,
            "priority_counts": priority_counts,
            "completion_rate": completion_rate,
            "total_story_points": total_pts,
            "done_story_points": done_pts,
        }


def create_task(
    project_id: int | None,
    title: str,
    description: str = "",
    status: str = "todo",
    priority: str = "medium",
    due_date: str = "",
    story_points: int = 0,
    acceptance_criteria: str = "",
    assignee: str = "",
    ticket_type: str = "task",
    **kwargs,
) -> dict:
    """Create a task."""
    t_type = str(ticket_type or "task").strip()
    ext_prov = kwargs.get("external_provider")
    ext_id = kwargs.get("external_id")
    ext_url = kwargs.get("external_url")
    ext_type = kwargs.get("external_type", "Task")
    ext_labels = kwargs.get("external_labels", "[]")
    if isinstance(ext_labels, list):
        import json
        ext_labels = json.dumps(ext_labels)
    sync_stat = kwargs.get("sync_status", "synced")

    with get_db() as con:
        with con:
            cur = con.execute(
                """INSERT INTO tasks (
                       project_id, title, description, status, priority, due_date,
                       story_points, acceptance_criteria, assignee, ticket_type,
                       external_provider, external_id, external_url, external_type,
                       external_labels, sync_status
                   )
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                   RETURNING *""",
                (
                    project_id,
                    title.strip(),
                    description.strip(),
                    status.strip(),
                    priority.strip(),
                    due_date.strip(),
                    int(story_points or 0),
                    acceptance_criteria.strip(),
                    assignee.strip(),
                    t_type,
                    ext_prov,
                    ext_id,
                    ext_url,
                    ext_type,
                    ext_labels,
                    sync_stat,
                ),
            )
            # Touch project updated_at
            if project_id:
                con.execute("UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", (project_id,))
            return dict(cur.fetchone())


def update_task(task_id: int, **fields) -> dict | None:
    """Update task fields (e.g. status, priority, title, description, due_date, story_points, acceptance_criteria, assignee, ticket_type)."""
    allowed = {
        "title", "description", "status", "priority", "due_date", "project_id",
        "story_points", "acceptance_criteria", "assignee", "ticket_type",
        "external_provider", "external_id", "external_url", "external_type",
        "external_labels", "sync_status", "last_synced_at"
    }
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return None

    set_clause = ", ".join(f"{k} = ?" for k in updates.keys())
    values = list(updates.values())
    values.append(task_id)

    with get_db() as con:
        with con:
            con.execute(f"UPDATE tasks SET {set_clause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?", values)
            cur = con.execute(
                """SELECT t.*, p.name AS project_name, p.domain AS project_domain
                   FROM tasks t
                   LEFT JOIN projects p ON t.project_id = p.id
                   WHERE t.id = ?""",
                (task_id,),
            )
            row = cur.fetchone()
            return dict(row) if row else None


def delete_task(task_id: int) -> bool:
    """Delete a task by ID."""
    with get_db() as con:
        with con:
            cur = con.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
            return cur.rowcount > 0


# ── Documents & Doc Folders CRUD ───────────────────────────────────────────────

def upsert_document(
    file_path: str,
    filename: str,
    file_type: str,
    file_size: int,
    last_modified: float,
    project_id: int | None = None,
    chunk_count: int = 0,
    status: str = "indexed",
) -> dict:
    """Insert or update metadata for an indexed document."""
    with get_db() as con:
        with con:
            cur = con.execute(
                """INSERT INTO documents (file_path, filename, file_type, file_size, last_modified, project_id, chunk_count, status, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                   ON CONFLICT(file_path) DO UPDATE SET
                       filename = excluded.filename,
                       file_type = excluded.file_type,
                       file_size = excluded.file_size,
                       last_modified = excluded.last_modified,
                       project_id = COALESCE(excluded.project_id, documents.project_id),
                       chunk_count = excluded.chunk_count,
                       status = excluded.status,
                       updated_at = CURRENT_TIMESTAMP
                   RETURNING *""",
                (file_path, filename, file_type, file_size, last_modified, project_id, chunk_count, status),
            )
            return dict(cur.fetchone())


def get_document(doc_id: int) -> dict | None:
    """Retrieve document metadata by ID."""
    with get_db() as con:
        row = con.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
        return dict(row) if row else None


def get_document_by_path(file_path: str) -> dict | None:
    """Retrieve document metadata by exact file path."""
    with get_db() as con:
        row = con.execute("SELECT * FROM documents WHERE file_path = ?", (file_path,)).fetchone()
        return dict(row) if row else None


def list_documents(project_id: int | None = None, file_type: str | None = None) -> list[dict]:
    """List indexed documents with optional project and file_type filters."""
    query = """
        SELECT d.*, p.name AS project_name
        FROM documents d
        LEFT JOIN projects p ON d.project_id = p.id
        WHERE 1=1
    """
    params = []

    if project_id is not None:
        query += " AND d.project_id = ?"
        params.append(project_id)
    if file_type and file_type != "all":
        query += " AND d.file_type = ?"
        params.append(file_type)

    query += " ORDER BY d.updated_at DESC"

    with get_db() as con:
        rows = con.execute(query, params).fetchall()
        return [dict(r) for r in rows]


def delete_document(doc_id: int) -> bool:
    """Delete a document record from metadata store."""
    with get_db() as con:
        with con:
            cur = con.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
            return cur.rowcount > 0


def add_doc_folder(folder_path: str, project_id: int | None = None, label: str = "", recursive: bool = True) -> dict:
    """Register a folder path to scan for documents."""
    clean_path = str(folder_path).strip().rstrip("/\\")
    with get_db() as con:
        with con:
            cur = con.execute(
                """INSERT INTO doc_folders (folder_path, project_id, label, recursive)
                   VALUES (?, ?, ?, ?)
                   ON CONFLICT(folder_path) DO UPDATE SET
                       project_id = COALESCE(excluded.project_id, doc_folders.project_id),
                       label = excluded.label,
                       recursive = excluded.recursive
                   RETURNING *""",
                (clean_path, project_id, label.strip(), 1 if recursive else 0),
            )
            return dict(cur.fetchone())


def list_doc_folders() -> list[dict]:
    """Retrieve all configured folder paths."""
    with get_db() as con:
        rows = con.execute("SELECT * FROM doc_folders ORDER BY created_at DESC").fetchall()
        return [dict(r) for r in rows]


def delete_doc_folder(folder_id: int) -> bool:
    """Remove a configured document folder."""
    with get_db() as con:
        with con:
            cur = con.execute("DELETE FROM doc_folders WHERE id = ?", (folder_id,))
            return cur.rowcount > 0


# ── Data Sources CRUD ──────────────────────────────────────────────────────────

def create_data_source(
    name: str,
    source_type: str,
    file_path: str,
    table_name: str,
    file_size: int = 0,
    row_count: int = 0,
    column_count: int = 0,
    schema_json: str = "[]",
    project_id: int | None = None,
) -> dict:
    """Register a new structured data source."""
    with get_db() as con:
        with con:
            cur = con.execute(
                """INSERT INTO data_sources (name, source_type, file_path, table_name, file_size, row_count, column_count, schema_json, project_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                   RETURNING *""",
                (
                    name.strip(),
                    source_type.strip().lower(),
                    file_path.strip(),
                    table_name.strip(),
                    file_size,
                    row_count,
                    column_count,
                    schema_json,
                    project_id,
                ),
            )
            return dict(cur.fetchone())


def get_data_source(source_id: int) -> dict | None:
    """Retrieve data source by ID."""
    with get_db() as con:
        row = con.execute("SELECT * FROM data_sources WHERE id = ?", (source_id,)).fetchone()
        return dict(row) if row else None


def list_data_sources(project_id: int | None = None) -> list[dict]:
    """List data sources, optionally filtered by project."""
    query = "SELECT * FROM data_sources"
    params = []
    if project_id is not None and project_id != 0:
        query += " WHERE project_id = ? OR project_id IS NULL"
        params.append(project_id)
    query += " ORDER BY created_at DESC"
    with get_db() as con:
        rows = con.execute(query, params).fetchall()
        return [dict(r) for r in rows]


def delete_data_source(source_id: int) -> bool:
    """Delete data source metadata and cascade associated widgets."""
    with get_db() as con:
        with con:
            cur = con.execute("DELETE FROM data_sources WHERE id = ?", (source_id,))
            return cur.rowcount > 0


# ── Dashboards CRUD ────────────────────────────────────────────────────────────

def create_dashboard(
    title: str,
    description: str = "",
    data_source_id: int | None = None,
    project_id: int | None = None,
) -> dict:
    """Create a new analytics dashboard."""
    with get_db() as con:
        with con:
            cur = con.execute(
                """INSERT INTO dashboards (title, description, data_source_id, project_id)
                   VALUES (?, ?, ?, ?)
                   RETURNING *""",
                (title.strip(), description.strip(), data_source_id, project_id),
            )
            return dict(cur.fetchone())


def get_dashboard(dash_id: int) -> dict | None:
    """Retrieve dashboard with linked data source info."""
    with get_db() as con:
        row = con.execute(
            """SELECT d.*, ds.name AS data_source_name, ds.source_type, ds.row_count, ds.table_name
               FROM dashboards d
               LEFT JOIN data_sources ds ON d.data_source_id = ds.id
               WHERE d.id = ?""",
            (dash_id,),
        ).fetchone()
        return dict(row) if row else None


def list_dashboards(project_id: int | None = None) -> list[dict]:
    """List dashboards with widget counts and data source names."""
    query = """
        SELECT d.*, ds.name AS data_source_name, ds.source_type,
               COUNT(w.id) as widget_count
        FROM dashboards d
        LEFT JOIN data_sources ds ON d.data_source_id = ds.id
        LEFT JOIN dashboard_widgets w ON w.dashboard_id = d.id
    """
    params = []
    if project_id is not None and project_id != 0:
        query += " WHERE d.project_id = ? OR d.project_id IS NULL"
        params.append(project_id)
    query += " GROUP BY d.id ORDER BY d.updated_at DESC"
    with get_db() as con:
        rows = con.execute(query, params).fetchall()
        return [dict(r) for r in rows]


def update_dashboard(dash_id: int, **fields) -> dict | None:
    """Update dashboard properties."""
    allowed = {"title", "description", "data_source_id", "project_id"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return get_dashboard(dash_id)
    set_clause = ", ".join(f"{k} = ?" for k in updates.keys())
    values = list(updates.values())
    values.append(dash_id)
    with get_db() as con:
        with con:
            con.execute(f"UPDATE dashboards SET {set_clause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?", values)
    return get_dashboard(dash_id)


def delete_dashboard(dash_id: int) -> bool:
    """Delete dashboard and its widgets."""
    with get_db() as con:
        with con:
            cur = con.execute("DELETE FROM dashboards WHERE id = ?", (dash_id,))
            return cur.rowcount > 0


# ── Dashboard Widgets CRUD ─────────────────────────────────────────────────────

def create_dashboard_widget(
    dashboard_id: int,
    data_source_id: int,
    title: str,
    widget_type: str = "kpi_card",
    metric_op: str = "count",
    value_column: str = "",
    group_by_column: str = "",
    filter_sql: str = "",
    format_type: str = "number",
    target_value: float | None = None,
    order_idx: int = 0,
) -> dict:
    """Create a new metric card, breakdown chart, or data view widget."""
    with get_db() as con:
        with con:
            cur = con.execute(
                """INSERT INTO dashboard_widgets (
                       dashboard_id, data_source_id, widget_type, title,
                       metric_op, value_column, group_by_column, filter_sql,
                       format_type, target_value, order_idx
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                   RETURNING *""",
                (
                    dashboard_id,
                    data_source_id,
                    widget_type.strip(),
                    title.strip(),
                    metric_op.strip().lower(),
                    value_column.strip(),
                    group_by_column.strip(),
                    filter_sql.strip(),
                    format_type.strip().lower(),
                    target_value,
                    order_idx,
                ),
            )
            return dict(cur.fetchone())


def get_dashboard_widget(widget_id: int) -> dict | None:
    """Retrieve single widget configuration."""
    with get_db() as con:
        row = con.execute("SELECT * FROM dashboard_widgets WHERE id = ?", (widget_id,)).fetchone()
        return dict(row) if row else None


def list_dashboard_widgets(dashboard_id: int) -> list[dict]:
    """List all widgets for a dashboard in display order."""
    with get_db() as con:
        rows = con.execute(
            """SELECT w.*, ds.name AS data_source_name, ds.table_name
               FROM dashboard_widgets w
               LEFT JOIN data_sources ds ON w.data_source_id = ds.id
               WHERE w.dashboard_id = ?
               ORDER BY w.order_idx ASC, w.id ASC""",
            (dashboard_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def update_dashboard_widget(widget_id: int, **fields) -> dict | None:
    """Update widget configuration."""
    allowed = {
        "title", "widget_type", "metric_op", "value_column", "group_by_column",
        "filter_sql", "format_type", "target_value", "order_idx", "data_source_id"
    }
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return get_dashboard_widget(widget_id)
    set_clause = ", ".join(f"{k} = ?" for k in updates.keys())
    values = list(updates.values())
    values.append(widget_id)
    with get_db() as con:
        with con:
            con.execute(f"UPDATE dashboard_widgets SET {set_clause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?", values)
    return get_dashboard_widget(widget_id)


def delete_dashboard_widget(widget_id: int) -> bool:
    """Delete a widget."""
    with get_db() as con:
        with con:
            cur = con.execute("DELETE FROM dashboard_widgets WHERE id = ?", (widget_id,))
            return cur.rowcount > 0


# ── Outpost Configurations & Transaction Vault ────────────────────────────────

def get_outpost_config(provider: str) -> dict | None:
    """Retrieve stored outpost configuration by provider name ('jira', 'notion', 'gdocs')."""
    with get_db() as con:
        row = con.execute(
            "SELECT * FROM outpost_configs WHERE provider = ?",
            (provider.lower().strip(),),
        ).fetchone()
        return dict(row) if row else None


def get_all_outpost_configs() -> list[dict]:
    """Retrieve all configured outposts."""
    with get_db() as con:
        rows = con.execute("SELECT * FROM outpost_configs ORDER BY provider ASC").fetchall()
        return [dict(r) for r in rows]


def set_outpost_config(
    provider: str,
    base_url: str | None = None,
    auth_token: str | None = None,
    user_email: str | None = None,
    project_key: str | None = None,
    database_id: str | None = None,
    is_active: int = 1,
    sync_policy: str = "manual",
) -> dict:
    """Insert or update an outpost configuration in the secure local vault."""
    prov = provider.lower().strip()
    with get_db() as con:
        with con:
            existing = con.execute(
                "SELECT * FROM outpost_configs WHERE provider = ?", (prov,)
            ).fetchone()
            if existing:
                updates = []
                values = []
                if base_url is not None:
                    updates.append("base_url = ?")
                    values.append(base_url.strip())
                if auth_token is not None:
                    updates.append("auth_token = ?")
                    values.append(auth_token)
                if user_email is not None:
                    updates.append("user_email = ?")
                    values.append(user_email.strip())
                if project_key is not None:
                    updates.append("project_key = ?")
                    values.append(project_key.strip())
                if database_id is not None:
                    updates.append("database_id = ?")
                    values.append(database_id.strip())
                if is_active is not None:
                    updates.append("is_active = ?")
                    values.append(1 if is_active else 0)
                if sync_policy is not None:
                    updates.append("sync_policy = ?")
                    values.append(sync_policy)

                updates.append("updated_at = CURRENT_TIMESTAMP")
                values.append(prov)
                con.execute(
                    f"UPDATE outpost_configs SET {', '.join(updates)} WHERE provider = ?",
                    values,
                )
            else:
                con.execute(
                    """
                    INSERT INTO outpost_configs (
                        provider, base_url, auth_token, user_email,
                        project_key, database_id, is_active, sync_policy
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        prov,
                        base_url.strip() if base_url else None,
                        auth_token or "",
                        user_email.strip() if user_email else None,
                        project_key.strip() if project_key else None,
                        database_id.strip() if database_id else None,
                        1 if is_active else 0,
                        sync_policy,
                    ),
                )
    return get_outpost_config(prov) or {}


def delete_outpost_config(provider: str) -> bool:
    """Remove an outpost configuration from the database."""
    with get_db() as con:
        with con:
            cur = con.execute(
                "DELETE FROM outpost_configs WHERE provider = ?",
                (provider.lower().strip(),),
            )
            return cur.rowcount > 0


def update_outpost_diagnostic(provider: str, last_error: str | None = None) -> None:
    """Record health test status and timestamp."""
    with get_db() as con:
        with con:
            con.execute(
                """
                UPDATE outpost_configs
                SET last_tested_at = CURRENT_TIMESTAMP,
                    last_error = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE provider = ?
                """,
                (last_error, provider.lower().strip()),
            )


