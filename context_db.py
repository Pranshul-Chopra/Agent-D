"""
context_db.py — Clinical Context Database Manager for Agent-D.
Manages %LOCALAPPDATA%\\AgentD\\context.db:
- Patients directory & alias mapper
- Doctor-curated structured patient context artifacts & immutable versioning
- Dated medical log entries & revision logs
- Visits and consultation closing flow
- Appointments & scheduling
- Action items & tickets
- Assistant proposal queue & diff tracking
- Patient-scoped chat sessions & history
- Tamper-evident audit events and LLM interaction audit logs
"""

import os
import sqlite3
import json
import uuid
import random
from datetime import datetime, timezone
from pathlib import Path
from queue import Queue, Empty
from typing import Optional, Dict, Any, List
import crypto_utils

POOL_SIZE = 5
_pool: Optional[Queue] = None


def get_context_db_path() -> Path:
    base = os.getenv("LOCALAPPDATA") or str(Path.home() / ".agentd")
    p = Path(base) / "AgentD"
    p.mkdir(parents=True, exist_ok=True)
    return p / "context.db"


def _create_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(
        str(get_context_db_path()),
        check_same_thread=False,
        timeout=30.0,
    )
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_context_pool():
    global _pool
    if _pool is None:
        _pool = Queue(maxsize=POOL_SIZE)
        for _ in range(POOL_SIZE):
            _pool.put(_create_connection())


class ContextConnectionContext:
    def __enter__(self) -> sqlite3.Connection:
        global _pool
        if _pool is None:
            init_context_pool()
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


def get_context_db():
    return ContextConnectionContext()


def init_context_db():
    """Initializes tables in context.db."""
    with get_context_db() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS patients (
            id TEXT PRIMARY KEY,
            display_name TEXT NOT NULL,
            llm_alias TEXT NOT NULL UNIQUE,
            date_of_birth TEXT,
            gender TEXT,
            blood_group TEXT,
            phone TEXT,
            email TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS artifacts (
            patient_id TEXT PRIMARY KEY,
            summary TEXT NOT NULL DEFAULT '',
            active_issues JSON NOT NULL DEFAULT '[]',
            medications JSON NOT NULL DEFAULT '[]',
            watch_for JSON NOT NULL DEFAULT '[]',
            follow_ups JSON NOT NULL DEFAULT '[]',
            notes TEXT NOT NULL DEFAULT '',
            needs_review INTEGER NOT NULL DEFAULT 0,
            schema_version INTEGER NOT NULL DEFAULT 1,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS artifact_versions (
            id TEXT PRIMARY KEY,
            patient_id TEXT NOT NULL,
            version_num INTEGER NOT NULL,
            artifact_json JSON NOT NULL,
            author_type TEXT NOT NULL,
            proposal_id TEXT,
            change_summary TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS log_entries (
            id TEXT PRIMARY KEY,
            patient_id TEXT NOT NULL,
            entry_date DATE NOT NULL,
            entry_type TEXT NOT NULL,
            content TEXT NOT NULL,
            metadata JSON DEFAULT '{}',
            source TEXT NOT NULL DEFAULT 'manual',
            visit_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS log_entry_versions (
            id TEXT PRIMARY KEY,
            entry_id TEXT NOT NULL,
            previous_content TEXT NOT NULL,
            edited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            edit_reason TEXT,
            FOREIGN KEY (entry_id) REFERENCES log_entries(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS visits (
            id TEXT PRIMARY KEY,
            patient_id TEXT NOT NULL,
            visit_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            reason TEXT NOT NULL,
            doctor_notes TEXT,
            status TEXT NOT NULL DEFAULT 'open',
            closed_at TIMESTAMP,
            outcome_summary TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS appointments (
            id TEXT PRIMARY KEY,
            patient_id TEXT NOT NULL,
            scheduled_time TIMESTAMP NOT NULL,
            duration_minutes INTEGER NOT NULL DEFAULT 15,
            appointment_type TEXT NOT NULL DEFAULT 'follow_up',
            reason TEXT,
            status TEXT NOT NULL DEFAULT 'scheduled',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS tickets (
            id TEXT PRIMARY KEY,
            patient_id TEXT,
            visit_id TEXT,
            title TEXT NOT NULL,
            description TEXT,
            priority TEXT NOT NULL DEFAULT 'medium',
            status TEXT NOT NULL DEFAULT 'open',
            due_date DATE,
            due_time TIME,
            is_reminder INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS proposals (
            id TEXT PRIMARY KEY,
            patient_id TEXT NOT NULL,
            visit_id TEXT,
            proposal_type TEXT NOT NULL,
            payload JSON NOT NULL,
            diff JSON,
            rationale TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            resolved_at TIMESTAMP,
            expires_at TIMESTAMP,
            FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS chat_sessions (
            id TEXT PRIMARY KEY,
            patient_id TEXT,
            title TEXT NOT NULL DEFAULT 'Consultation Chat',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS chat_messages (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            model_name TEXT,
            tokens_used INTEGER DEFAULT 0,
            tool_calls JSON DEFAULT '[]',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS briefs (
            id TEXT PRIMARY KEY,
            patient_id TEXT NOT NULL,
            appointment_id TEXT NOT NULL,
            brief_content TEXT NOT NULL,
            watch_for_highlights JSON NOT NULL DEFAULT '[]',
            generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS llm_calls (
            id TEXT PRIMARY KEY,
            session_id TEXT,
            call_purpose TEXT NOT NULL,
            model_name TEXT NOT NULL,
            key_id_used TEXT,
            prompt_payload TEXT NOT NULL,
            raw_response TEXT NOT NULL,
            latency_ms INTEGER NOT NULL,
            success INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS audit_events (
            id TEXT PRIMARY KEY,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            action TEXT NOT NULL,
            actor TEXT NOT NULL DEFAULT 'doctor',
            details JSON,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_patients_alias ON patients(llm_alias);
        CREATE INDEX IF NOT EXISTS idx_log_entries_patient ON log_entries(patient_id, entry_date);
        CREATE INDEX IF NOT EXISTS idx_appointments_time ON appointments(scheduled_time);
        CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status, due_date);
        CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status, patient_id);
        """)
        conn.commit()


# ── Audit Trail Service ───────────────────────────────────────────────────────

def record_audit_event(
    entity_type: str,
    entity_id: str,
    action: str,
    actor: str = "doctor",
    details: Optional[Dict[str, Any]] = None,
):
    with get_context_db() as conn:
        conn.execute(
            """
            INSERT INTO audit_events (id, entity_type, entity_id, action, actor, details)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                entity_type,
                entity_id,
                action,
                actor,
                json.dumps(details or {}),
            ),
        )
        conn.commit()


# ── Patient Management & Alias Generation ────────────────────────────────────

def generate_unique_alias() -> str:
    """Generates a non-colliding clinical alias (e.g. PT-4912) for external LLM calls."""
    with get_context_db() as conn:
        for _ in range(50):
            num = random.randint(1000, 9999)
            alias = f"PT-{num}"
            exists = conn.execute("SELECT 1 FROM patients WHERE llm_alias = ?", (alias,)).fetchone()
            if not exists:
                return alias
    # Fallback to 5-digit if collision happens repeatedly
    return f"PT-{random.randint(10000, 99999)}"


def create_patient(
    display_name: str,
    date_of_birth: Optional[str] = None,
    gender: Optional[str] = None,
    blood_group: Optional[str] = None,
    phone: Optional[str] = None,
    email: Optional[str] = None,
    initial_summary: Optional[str] = None,
) -> Dict[str, Any]:
    display_name = display_name.strip()
    if not display_name:
        raise ValueError("Patient name cannot be empty")

    patient_id = str(uuid.uuid4())
    llm_alias = generate_unique_alias()

    # Encrypt direct PII fields with authenticated AES-256-GCM
    encrypted_name = crypto_utils.encrypt_text(display_name)
    encrypted_phone = crypto_utils.encrypt_text(phone) if phone else None
    encrypted_email = crypto_utils.encrypt_text(email) if email else None

    with get_context_db() as conn:
        conn.execute(
            """
            INSERT INTO patients (id, display_name, llm_alias, date_of_birth, gender, blood_group, phone, email, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
            """,
            (
                patient_id,
                encrypted_name,
                llm_alias,
                date_of_birth,
                gender,
                blood_group,
                encrypted_phone,
                encrypted_email,
            ),
        )

        # Initialize blank structured Context Artifact for patient
        initial_artifact = {
            "summary": initial_summary or f"Patient {llm_alias} clinical file opened.",
            "active_issues": [],
            "medications": [],
            "watch_for": [],
            "follow_ups": [],
            "notes": "",
        }
        conn.execute(
            """
            INSERT INTO artifacts (patient_id, summary, active_issues, medications, watch_for, follow_ups, notes, needs_review, schema_version)
            VALUES (?, ?, '[]', '[]', '[]', '[]', '', 0, 1)
            """,
            (patient_id, initial_artifact["summary"]),
        )

        # Create version 1 immutable snapshot
        conn.execute(
            """
            INSERT INTO artifact_versions (id, patient_id, version_num, artifact_json, author_type, change_summary)
            VALUES (?, ?, 1, ?, 'doctor_manual', 'Initial file created')
            """,
            (str(uuid.uuid4()), patient_id, json.dumps(initial_artifact)),
        )

        conn.commit()

    record_audit_event("patient", patient_id, "create", "doctor", {"llm_alias": llm_alias})

    return {
        "id": patient_id,
        "display_name": display_name,
        "llm_alias": llm_alias,
        "date_of_birth": date_of_birth,
        "gender": gender,
        "blood_group": blood_group,
        "phone": phone,
        "email": email,
        "status": "active",
    }


def _decrypt_patient_row(row: sqlite3.Row) -> Dict[str, Any]:
    item = dict(row)
    item["display_name"] = crypto_utils.decrypt_text(item["display_name"])
    if item.get("phone"):
        item["phone"] = crypto_utils.decrypt_text(item["phone"])
    if item.get("email"):
        item["email"] = crypto_utils.decrypt_text(item["email"])
    return item


def get_patient(patient_id: str) -> Optional[Dict[str, Any]]:
    with get_context_db() as conn:
        row = conn.execute("SELECT * FROM patients WHERE id = ?", (patient_id,)).fetchone()
        return _decrypt_patient_row(row) if row else None


def get_patient_by_alias(alias: str) -> Optional[Dict[str, Any]]:
    with get_context_db() as conn:
        row = conn.execute("SELECT * FROM patients WHERE llm_alias = ?", (alias,)).fetchone()
        return _decrypt_patient_row(row) if row else None


def list_patients(query: Optional[str] = None, status: str = "active", limit: int = 100) -> List[Dict[str, Any]]:
    with get_context_db() as conn:
        if status == "all":
            rows = conn.execute("SELECT * FROM patients ORDER BY updated_at DESC LIMIT ?", (limit,)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM patients WHERE status = ? ORDER BY updated_at DESC LIMIT ?", (status, limit)).fetchall()

        patients = [_decrypt_patient_row(r) for r in rows]

        if query:
            q = query.strip().lower()
            patients = [
                p for p in patients
                if q in p["display_name"].lower()
                or q in p["llm_alias"].lower()
                or (p.get("phone") and q in p["phone"].lower())
            ]

        return patients


def update_patient(patient_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    allowed = ["display_name", "date_of_birth", "gender", "blood_group", "phone", "email", "status"]
    fields = []
    values = []

    for k, v in updates.items():
        if k in allowed:
            if k in ("display_name", "phone", "email") and v is not None:
                v = crypto_utils.encrypt_text(str(v))
            fields.append(f"{k} = ?")
            values.append(v)

    if not fields:
        return get_patient(patient_id)

    fields.append("updated_at = CURRENT_TIMESTAMP")
    values.append(patient_id)

    query = f"UPDATE patients SET {', '.join(fields)} WHERE id = ?"
    with get_context_db() as conn:
        cur = conn.execute(query, tuple(values))
        conn.commit()
        if cur.rowcount == 0:
            return None

    record_audit_event("patient", patient_id, "update", "doctor", {"updated_fields": list(updates.keys())})
    return get_patient(patient_id)


def archive_patient(patient_id: str) -> bool:
    with get_context_db() as conn:
        cur = conn.execute("UPDATE patients SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE id = ?", (patient_id,))
        conn.commit()
        success = cur.rowcount > 0

    if success:
        record_audit_event("patient", patient_id, "archive", "doctor")
    return success


# ── Context Artifact Engine ──────────────────────────────────────────────────

def get_patient_artifact(patient_id: str) -> Optional[Dict[str, Any]]:
    """Retrieves current structured context artifact for a patient."""
    with get_context_db() as conn:
        row = conn.execute("SELECT * FROM artifacts WHERE patient_id = ?", (patient_id,)).fetchone()
        if not row:
            return None

        data = dict(row)
        for json_field in ("active_issues", "medications", "watch_for", "follow_ups"):
            val = data.get(json_field)
            if isinstance(val, str):
                try:
                    data[json_field] = json.loads(val)
                except Exception:
                    data[json_field] = []

        # Get latest version number
        ver = conn.execute(
            "SELECT MAX(version_num) as max_v FROM artifact_versions WHERE patient_id = ?",
            (patient_id,),
        ).fetchone()
        data["current_version"] = ver["max_v"] if ver and ver["max_v"] else 1
        return data


def update_patient_artifact(
    patient_id: str,
    data: Dict[str, Any],
    author_type: str = "doctor_manual",
    change_summary: str = "Updated by doctor",
    proposal_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Updates structured patient artifact and records an immutable version snapshot."""
    with get_context_db() as conn:
        current = get_patient_artifact(patient_id)
        if not current:
            # Initialize if not exists
            conn.execute(
                """
                INSERT INTO artifacts (patient_id, summary, active_issues, medications, watch_for, follow_ups, notes, needs_review, schema_version)
                VALUES (?, '', '[]', '[]', '[]', '[]', '', 0, 1)
                """,
                (patient_id,),
            )
            current = {"summary": "", "active_issues": [], "medications": [], "watch_for": [], "follow_ups": [], "notes": "", "current_version": 0}

        summary = data.get("summary", current.get("summary", ""))
        active_issues = json.dumps(data.get("active_issues", current.get("active_issues", [])))
        medications = json.dumps(data.get("medications", current.get("medications", [])))
        watch_for = json.dumps(data.get("watch_for", current.get("watch_for", [])))
        follow_ups = json.dumps(data.get("follow_ups", current.get("follow_ups", [])))
        notes = data.get("notes", current.get("notes", ""))
        needs_review = data.get("needs_review", 0)

        conn.execute(
            """
            UPDATE artifacts
            SET summary = ?, active_issues = ?, medications = ?, watch_for = ?, follow_ups = ?, notes = ?, needs_review = ?, updated_at = CURRENT_TIMESTAMP
            WHERE patient_id = ?
            """,
            (summary, active_issues, medications, watch_for, follow_ups, notes, needs_review, patient_id),
        )

        next_version = (current.get("current_version") or 0) + 1
        snapshot = {
            "summary": summary,
            "active_issues": data.get("active_issues", current.get("active_issues", [])),
            "medications": data.get("medications", current.get("medications", [])),
            "watch_for": data.get("watch_for", current.get("watch_for", [])),
            "follow_ups": data.get("follow_ups", current.get("follow_ups", [])),
            "notes": notes,
        }

        conn.execute(
            """
            INSERT INTO artifact_versions (id, patient_id, version_num, artifact_json, author_type, proposal_id, change_summary)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                patient_id,
                next_version,
                json.dumps(snapshot),
                author_type,
                proposal_id,
                change_summary,
            ),
        )

        conn.commit()

    record_audit_event("artifact", patient_id, "update", author_type, {"version": next_version, "change_summary": change_summary})
    return get_patient_artifact(patient_id) or {}


def get_patient_artifact_versions(patient_id: str) -> List[Dict[str, Any]]:
    """Retrieves full version history of a patient's context artifact."""
    with get_context_db() as conn:
        rows = conn.execute(
            """
            SELECT id, version_num, author_type, change_summary, created_at, artifact_json
            FROM artifact_versions
            WHERE patient_id = ?
            ORDER BY version_num DESC
            """,
            (patient_id,),
        ).fetchall()

        results = []
        for r in rows:
            item = dict(r)
            try:
                item["artifact_snapshot"] = json.loads(item["artifact_json"])
            except Exception:
                item["artifact_snapshot"] = {}
            del item["artifact_json"]
            results.append(item)
        return results



def get_artifact_version_snapshot(patient_id: str, version_num: int) -> Optional[Dict[str, Any]]:
    """Retrieves specific version snapshot of a patient artifact."""
    with get_context_db() as conn:
        row = conn.execute(
            "SELECT * FROM artifact_versions WHERE patient_id = ? AND version_num = ?",
            (patient_id, version_num),
        ).fetchone()
        if not row:
            return None
        item = dict(row)
        try:
            item["artifact_snapshot"] = json.loads(item["artifact_json"])
        except Exception:
            item["artifact_snapshot"] = {}
        del item["artifact_json"]
        return item


def restore_artifact_version(patient_id: str, version_num: int) -> Optional[Dict[str, Any]]:
    """
    Restores a previous artifact version, creating a new version snapshot
    with author_type='doctor_manual' and change_summary pointing to restored version.
    """
    snapshot_row = get_artifact_version_snapshot(patient_id, version_num)
    if not snapshot_row or not snapshot_row.get("artifact_snapshot"):
        return None

    target = snapshot_row["artifact_snapshot"]
    return update_patient_artifact(
        patient_id=patient_id,
        data=target,
        author_type="doctor_manual",
        change_summary=f"Restored to version {version_num} snapshot",
    )


def compute_artifact_diff(v1: Dict[str, Any], v2: Dict[str, Any]) -> Dict[str, Any]:
    """
    Computes a structured diff between two artifact versions (v1 = older/source, v2 = newer/target).
    Returns field-by-field differences with addition, deletion, or modification tags.
    """
    diff: Dict[str, Any] = {
        "summary": {
            "old": v1.get("summary", ""),
            "new": v2.get("summary", ""),
            "changed": v1.get("summary", "") != v2.get("summary", ""),
        },
        "notes": {
            "old": v1.get("notes", ""),
            "new": v2.get("notes", ""),
            "changed": v1.get("notes", "") != v2.get("notes", ""),
        },
        "active_issues": [],
        "medications": [],
        "watch_for": [],
        "follow_ups": [],
        "has_changes": False,
    }

    def diff_list(list_v1, list_v2):
        s1 = set(str(x).strip() for x in list_v1 if str(x).strip())
        s2 = set(str(x).strip() for x in list_v2 if str(x).strip())
        res = []
        for item in list_v1:
            s_item = str(item).strip()
            if s_item in s2:
                res.append({"item": item, "status": "unchanged"})
            else:
                res.append({"item": item, "status": "removed"})
        for item in list_v2:
            s_item = str(item).strip()
            if s_item not in s1:
                res.append({"item": item, "status": "added"})
        return res

    for list_key in ("active_issues", "medications", "watch_for", "follow_ups"):
        items_v1 = v1.get(list_key) or []
        items_v2 = v2.get(list_key) or []
        list_diff = diff_list(items_v1, items_v2)
        diff[list_key] = list_diff
        if any(x["status"] != "unchanged" for x in list_diff):
            diff["has_changes"] = True

    if diff["summary"]["changed"] or diff["notes"]["changed"]:
        diff["has_changes"] = True

    return diff


# ── Medical Log Entries Engine ───────────────────────────────────────────────

def create_log_entry(
    patient_id: str,
    entry_date: str,
    entry_type: str,
    content: str,
    metadata: Optional[Dict[str, Any]] = None,
    source: str = "manual",
    visit_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Creates a dated clinical observation or medical note."""
    entry_id = str(uuid.uuid4())
    metadata_json = json.dumps(metadata or {})
    encrypted_content = crypto_utils.encrypt_text(content.strip())

    with get_context_db() as conn:
        conn.execute(
            """
            INSERT INTO log_entries (id, patient_id, entry_date, entry_type, content, metadata, source, visit_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                entry_id,
                patient_id,
                entry_date,
                entry_type,
                encrypted_content,
                metadata_json,
                source,
                visit_id,
            ),
        )
        # Flag artifact as needing review when new clinical logs arrive
        conn.execute(
            "UPDATE artifacts SET needs_review = 1, updated_at = CURRENT_TIMESTAMP WHERE patient_id = ?",
            (patient_id,),
        )
        conn.commit()

    record_audit_event("log_entry", entry_id, "create", source, {"patient_id": patient_id, "entry_type": entry_type})

    return {
        "id": entry_id,
        "patient_id": patient_id,
        "entry_date": entry_date,
        "entry_type": entry_type,
        "content": content.strip(),
        "metadata": metadata or {},
        "source": source,
        "visit_id": visit_id,
        "versions_count": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def list_log_entries(
    patient_id: str,
    entry_type: Optional[str] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """Lists clinical log entries chronologically for a patient."""
    with get_context_db() as conn:
        if entry_type and entry_type != "all":
            rows = conn.execute(
                """
                SELECT l.*, (SELECT COUNT(*) FROM log_entry_versions v WHERE v.entry_id = l.id) as versions_count
                FROM log_entries l
                WHERE l.patient_id = ? AND l.entry_type = ?
                ORDER BY l.entry_date DESC, l.created_at DESC
                LIMIT ?
                """,
                (patient_id, entry_type, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT l.*, (SELECT COUNT(*) FROM log_entry_versions v WHERE v.entry_id = l.id) as versions_count
                FROM log_entries l
                WHERE l.patient_id = ?
                ORDER BY l.entry_date DESC, l.created_at DESC
                LIMIT ?
                """,
                (patient_id, limit),
            ).fetchall()

        results = []
        for r in rows:
            item = dict(r)
            try:
                item["content"] = crypto_utils.decrypt_text(item["content"])
            except Exception:
                pass
            try:
                item["metadata"] = json.loads(item["metadata"]) if item.get("metadata") else {}
            except Exception:
                item["metadata"] = {}
            results.append(item)
        return results


def get_log_entry(entry_id: str) -> Optional[Dict[str, Any]]:
    """Retrieves a single clinical log entry with its edit history."""
    with get_context_db() as conn:
        row = conn.execute("SELECT * FROM log_entries WHERE id = ?", (entry_id,)).fetchone()
        if not row:
            return None
        item = dict(row)
        try:
            item["content"] = crypto_utils.decrypt_text(item["content"])
        except Exception:
            pass
        try:
            item["metadata"] = json.loads(item["metadata"]) if item.get("metadata") else {}
        except Exception:
            item["metadata"] = {}

        # Fetch revision versions
        versions_rows = conn.execute(
            "SELECT * FROM log_entry_versions WHERE entry_id = ? ORDER BY edited_at DESC",
            (entry_id,),
        ).fetchall()
        versions = []
        for vr in versions_rows:
            v_item = dict(vr)
            try:
                v_item["previous_content"] = crypto_utils.decrypt_text(v_item["previous_content"])
            except Exception:
                pass
            versions.append(v_item)
        item["versions"] = versions
        item["versions_count"] = len(versions)
        return item


def update_log_entry(
    entry_id: str,
    new_content: str,
    edit_reason: Optional[str] = "Clinical note amended by physician",
    metadata: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """Updates a log entry while preserving previous text in immutable log_entry_versions."""
    with get_context_db() as conn:
        current = conn.execute("SELECT * FROM log_entries WHERE id = ?", (entry_id,)).fetchone()
        if not current:
            return None

        # Archive old content to log_entry_versions
        old_encrypted = current["content"]
        version_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO log_entry_versions (id, entry_id, previous_content, edit_reason)
            VALUES (?, ?, ?, ?)
            """,
            (version_id, entry_id, old_encrypted, edit_reason),
        )

        # Update entry with new encrypted content
        new_encrypted = crypto_utils.encrypt_text(new_content.strip())
        if metadata is not None:
            conn.execute(
                """
                UPDATE log_entries
                SET content = ?, metadata = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (new_encrypted, json.dumps(metadata), entry_id),
            )
        else:
            conn.execute(
                """
                UPDATE log_entries
                SET content = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (new_encrypted, entry_id),
            )

        conn.commit()

    record_audit_event("log_entry", entry_id, "amend", "doctor", {"edit_reason": edit_reason})
    return get_log_entry(entry_id)


def delete_log_entry(entry_id: str) -> bool:
    """Deletes a log entry."""
    with get_context_db() as conn:
        cur = conn.execute("DELETE FROM log_entries WHERE id = ?", (entry_id,))
        conn.commit()
        success = cur.rowcount > 0

    if success:
        record_audit_event("log_entry", entry_id, "delete", "doctor")
    return success
