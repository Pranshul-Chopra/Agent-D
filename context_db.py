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
    override = os.getenv("AGENT_D_CONTEXT_DB")
    if override:
        return Path(override)
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


def list_audit_events(
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """Retrieves immutable audit event records."""
    with get_context_db() as conn:
        query = "SELECT * FROM audit_events"
        clauses = []
        params = []
        if entity_type:
            clauses.append("entity_type = ?")
            params.append(entity_type)
        if entity_id:
            clauses.append("entity_id = ?")
            params.append(str(entity_id))

        if clauses:
            query += " WHERE " + " AND ".join(clauses)

        query += " ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)

        rows = conn.execute(query, params).fetchall()
        events = []
        for r in rows:
            ev = dict(r)
            if ev.get("details"):
                try:
                    ev["details"] = json.loads(ev["details"])
                except Exception:
                    pass
            events.append(ev)
        return events


def get_audit_events(entity_type: str, entity_id: str) -> List[Dict[str, Any]]:
    """Alias for list_audit_events for specific entity."""
    return list_audit_events(entity_type=entity_type, entity_id=entity_id)


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


# ── Chat Sessions & Clinical Conversation History ────────────────────────────

def create_chat_session(title: str = "Clinical Consultation", patient_id: Optional[str] = None) -> Dict[str, Any]:
    """Creates a new patient-scoped or general practice chat session."""
    session_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    with get_context_db() as conn:
        conn.execute(
            """
            INSERT INTO chat_sessions (id, patient_id, title, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (session_id, patient_id, title.strip(), now, now),
        )
        conn.commit()

    return {
        "id": session_id,
        "patient_id": patient_id,
        "title": title.strip(),
        "created_at": now,
        "updated_at": now,
        "message_count": 0,
    }


def list_chat_sessions(patient_id: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
    """Lists chat sessions, optionally scoped by patient chart."""
    with get_context_db() as conn:
        if patient_id:
            rows = conn.execute(
                """
                SELECT s.*, (SELECT COUNT(*) FROM chat_messages m WHERE m.session_id = s.id) as message_count
                FROM chat_sessions s
                WHERE s.patient_id = ?
                ORDER BY s.updated_at DESC
                LIMIT ?
                """,
                (patient_id, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT s.*, (SELECT COUNT(*) FROM chat_messages m WHERE m.session_id = s.id) as message_count
                FROM chat_sessions s
                ORDER BY s.updated_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()

        return [dict(r) for r in rows]


def get_chat_session(session_id: str) -> Optional[Dict[str, Any]]:
    """Retrieves session details and chronological message history."""
    with get_context_db() as conn:
        s_row = conn.execute("SELECT * FROM chat_sessions WHERE id = ?", (session_id,)).fetchone()
        if not s_row:
            return None

        session = dict(s_row)
        m_rows = conn.execute(
            """
            SELECT id, session_id, role, content, model_name, tokens_used, tool_calls, created_at
            FROM chat_messages
            WHERE session_id = ?
            ORDER BY created_at ASC
            """,
            (session_id,),
        ).fetchall()

        messages = []
        for mr in m_rows:
            item = dict(mr)
            try:
                item["content"] = crypto_utils.decrypt_text(item["content"])
            except Exception:
                pass
            try:
                item["tool_calls"] = json.loads(item["tool_calls"]) if item.get("tool_calls") else []
            except Exception:
                item["tool_calls"] = []
            messages.append(item)

        session["messages"] = messages
        return session


def delete_chat_session(session_id: str) -> bool:
    """Deletes a chat session and all cascading messages."""
    with get_context_db() as conn:
        cur = conn.execute("DELETE FROM chat_sessions WHERE id = ?", (session_id,))
        conn.commit()
        return cur.rowcount > 0


def add_chat_message(
    session_id: str,
    role: str,
    content: str,
    model_name: Optional[str] = None,
    tokens_used: int = 0,
    tool_calls: Optional[List[Any]] = None,
) -> Dict[str, Any]:
    """Appends an encrypted user or assistant turn to a chat session."""
    msg_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    encrypted_content = crypto_utils.encrypt_text(content.strip())
    tool_calls_json = json.dumps(tool_calls or [])

    with get_context_db() as conn:
        conn.execute(
            """
            INSERT INTO chat_messages (id, session_id, role, content, model_name, tokens_used, tool_calls, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (msg_id, session_id, role, encrypted_content, model_name, tokens_used, tool_calls_json, now),
        )
        conn.execute(
            "UPDATE chat_sessions SET updated_at = ? WHERE id = ?",
            (now, session_id),
        )
        conn.commit()

    return {
        "id": msg_id,
        "session_id": session_id,
        "role": role,
        "content": content.strip(),
        "model_name": model_name,
        "tokens_used": tokens_used,
        "tool_calls": tool_calls or [],
        "created_at": now,
    }


# ── Practice Appointments & Scheduling ───────────────────────────────────────

def list_appointments(date_str: Optional[str] = None, patient_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Lists appointments with joined patient clinical aliases."""
    with get_context_db() as conn:
        query = """
            SELECT a.*, p.llm_alias as patient_alias, p.display_name as encrypted_display_name
            FROM appointments a
            JOIN patients p ON a.patient_id = p.id
        """
        params = []
        conditions = []

        if date_str:
            conditions.append("DATE(a.scheduled_time) = ?")
            params.append(date_str)
        if patient_id:
            conditions.append("a.patient_id = ?")
            params.append(patient_id)

        if conditions:
            query += " WHERE " + " AND ".join(conditions)

        query += " ORDER BY a.scheduled_time ASC"

        rows = conn.execute(query, tuple(params)).fetchall()
        results = []
        for r in rows:
            item = dict(r)
            try:
                item["patient_name"] = crypto_utils.decrypt_text(item["encrypted_display_name"])
            except Exception:
                item["patient_name"] = item.get("patient_alias", "Patient")
            del item["encrypted_display_name"]
            results.append(item)
        return results


def create_appointment(
    patient_id: str,
    scheduled_time: str,
    duration_minutes: int = 15,
    appointment_type: str = "follow_up",
    reason: Optional[str] = None,
) -> Dict[str, Any]:
    """Schedules a new clinical appointment."""
    app_id = str(uuid.uuid4())
    with get_context_db() as conn:
        conn.execute(
            """
            INSERT INTO appointments (id, patient_id, scheduled_time, duration_minutes, appointment_type, reason, status)
            VALUES (?, ?, ?, ?, ?, ?, 'scheduled')
            """,
            (app_id, patient_id, scheduled_time, duration_minutes, appointment_type, reason),
        )
        conn.commit()

    return {
        "id": app_id,
        "patient_id": patient_id,
        "scheduled_time": scheduled_time,
        "duration_minutes": duration_minutes,
        "appointment_type": appointment_type,
        "reason": reason,
        "status": "scheduled",
    }


def update_appointment(appointment_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Updates appointment status, scheduled time, duration, or reason."""
    allowed = {"scheduled_time", "duration_minutes", "appointment_type", "reason", "status"}
    filtered = {k: v for k, v in updates.items() if k in allowed}
    if not filtered:
        return None

    set_clauses = [f"{k} = ?" for k in filtered.keys()]
    params = list(filtered.values())
    params.append(appointment_id)

    with get_context_db() as conn:
        conn.execute(
            f"UPDATE appointments SET {', '.join(set_clauses)} WHERE id = ?",
            params,
        )
        conn.commit()
        row = conn.execute("SELECT * FROM appointments WHERE id = ?", (appointment_id,)).fetchone()
        return dict(row) if row else None


def delete_appointment(appointment_id: str) -> bool:
    """Removes an appointment from the schedule."""
    with get_context_db() as conn:
        cur = conn.execute("DELETE FROM appointments WHERE id = ?", (appointment_id,))
        conn.commit()
        return cur.rowcount > 0


def get_practice_summary_stats() -> Dict[str, Any]:
    """Computes real-time practice stats from context.db for dashboard and prompt context."""
    from datetime import date
    today = date.today().isoformat()

    with get_context_db() as conn:
        total_patients = conn.execute("SELECT COUNT(*) FROM patients WHERE status = 'active'").fetchone()[0]
        today_appts = conn.execute("SELECT COUNT(*) FROM appointments WHERE DATE(scheduled_time) = ?", (today,)).fetchone()[0]
        unreviewed_artifacts = conn.execute("SELECT COUNT(*) FROM artifacts WHERE needs_review = 1").fetchone()[0]
        open_tickets = conn.execute("SELECT COUNT(*) FROM tickets WHERE status != 'done'").fetchone()[0]

        # Get next appointment today
        next_appt = conn.execute(
            """
            SELECT a.*, p.llm_alias
            FROM appointments a
            JOIN patients p ON a.patient_id = p.id
            WHERE DATE(a.scheduled_time) = ? AND a.status = 'scheduled'
            ORDER BY a.scheduled_time ASC
            LIMIT 1
            """,
            (today,),
        ).fetchone()

        next_info = None
        if next_appt:
            next_info = {
                "alias": next_appt["llm_alias"],
                "time": next_appt["scheduled_time"],
                "reason": next_appt["reason"],
            }

        return {
            "total_patients": total_patients,
            "today_appointments_count": today_appts,
            "unreviewed_artifacts_count": unreviewed_artifacts,
            "open_tickets_count": open_tickets,
            "next_appointment": next_info,
        }


# ── Clinical Tickets & Action Items (Milestone 4) ─────────────────────────────

def create_ticket(
    patient_id: Optional[str] = None,
    title: str = "Clinical Action Item",
    description: Optional[str] = None,
    priority: str = "medium",
    status: str = "todo",
    due_date: Optional[str] = None,
    due_time: Optional[str] = None,
    is_reminder: int = 0,
    visit_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Creates a new clinical action item / follow-up ticket."""
    ticket_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    norm_status = (status or "todo").lower()
    if norm_status == "open":
        norm_status = "todo"

    with get_context_db() as conn:
        conn.execute(
            """
            INSERT INTO tickets (id, patient_id, visit_id, title, description, priority, status, due_date, due_time, is_reminder, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (ticket_id, patient_id, visit_id, title.strip(), description or "", priority.lower(), norm_status, due_date, due_time, is_reminder, now, now),
        )
        conn.commit()

    record_audit_event("ticket", ticket_id, "created", details={"title": title, "patient_id": patient_id})

    return {
        "id": ticket_id,
        "patient_id": patient_id,
        "visit_id": visit_id,
        "title": title.strip(),
        "description": description or "",
        "priority": priority.lower(),
        "status": norm_status,
        "due_date": due_date,
        "due_time": due_time,
        "is_reminder": is_reminder,
        "created_at": now,
    }


def list_tickets(
    patient_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """Lists clinical tickets joined with patient aliases."""
    with get_context_db() as conn:
        query = """
            SELECT t.*, p.llm_alias as patient_alias, p.display_name as encrypted_display_name
            FROM tickets t
            LEFT JOIN patients p ON t.patient_id = p.id
        """
        clauses = []
        params = []
        if patient_id:
            clauses.append("t.patient_id = ?")
            params.append(patient_id)
        if status and status != "all":
            if status == "open":
                clauses.append("t.status != 'done'")
            else:
                clauses.append("t.status = ?")
                params.append(status)

        if clauses:
            query += " WHERE " + " AND ".join(clauses)

        query += " ORDER BY CASE t.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'med' THEN 3 WHEN 'medium' THEN 3 ELSE 4 END ASC, t.created_at DESC LIMIT ?"
        params.append(limit)

        rows = conn.execute(query, params).fetchall()
        tickets = []
        for r in rows:
            t = dict(r)
            if t.get("encrypted_display_name"):
                try:
                    t["patient_display_name"] = crypto_utils.decrypt_text(t["encrypted_display_name"])
                except Exception:
                    t["patient_display_name"] = t.get("patient_alias", "PT-XXXX")
            tickets.append(t)
        return tickets


def get_ticket(ticket_id: str) -> Optional[Dict[str, Any]]:
    """Retrieves single ticket details."""
    with get_context_db() as conn:
        row = conn.execute(
            """
            SELECT t.*, p.llm_alias as patient_alias
            FROM tickets t
            LEFT JOIN patients p ON t.patient_id = p.id
            WHERE t.id = ?
            """,
            (ticket_id,),
        ).fetchone()
        return dict(row) if row else None


def update_ticket(ticket_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Updates status, priority, title, description, or due_date of a ticket."""
    allowed = {"title", "description", "priority", "status", "due_date", "due_time", "is_reminder"}
    filtered = {k: v for k, v in updates.items() if k in allowed}
    if not filtered:
        return None

    now = datetime.now(timezone.utc).isoformat()
    filtered["updated_at"] = now

    set_clauses = [f"{k} = ?" for k in filtered.keys()]
    params = list(filtered.values())
    params.append(ticket_id)

    with get_context_db() as conn:
        conn.execute(
            f"UPDATE tickets SET {', '.join(set_clauses)} WHERE id = ?",
            params,
        )
        conn.commit()

    record_audit_event("ticket", ticket_id, "updated", details=filtered)
    return get_ticket(ticket_id)


def delete_ticket(ticket_id: str) -> bool:
    """Removes a ticket from context.db."""
    with get_context_db() as conn:
        cur = conn.execute("DELETE FROM tickets WHERE id = ?", (ticket_id,))
        conn.commit()
        ok = cur.rowcount > 0

    if ok:
        record_audit_event("ticket", ticket_id, "deleted")
    return ok


# ── Safety Gate & Proposal Queue (Milestone 4) ────────────────────────────────

def create_proposal(
    patient_id: str,
    proposal_type: str,
    payload: Dict[str, Any],
    rationale: str,
    visit_id: Optional[str] = None,
    diff: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Creates a pending proposal awaiting doctor signature."""
    proposal_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    payload_json = json.dumps(payload or {})
    diff_json = json.dumps(diff or {})

    with get_context_db() as conn:
        conn.execute(
            """
            INSERT INTO proposals (id, patient_id, visit_id, proposal_type, payload, diff, rationale, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
            """,
            (proposal_id, patient_id, visit_id, proposal_type, payload_json, diff_json, rationale.strip(), now),
        )
        conn.commit()

    record_audit_event(
        entity_type="proposal",
        entity_id=proposal_id,
        action="created",
        details={"type": proposal_type, "patient_id": patient_id},
    )

    return {
        "id": proposal_id,
        "patient_id": patient_id,
        "visit_id": visit_id,
        "proposal_type": proposal_type,
        "payload": payload,
        "diff": diff or {},
        "rationale": rationale.strip(),
        "status": "pending",
        "created_at": now,
    }


def list_proposals(
    patient_id: Optional[str] = None,
    status: Optional[str] = "pending",
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """Lists proposals awaiting doctor approval."""
    with get_context_db() as conn:
        query = """
            SELECT pr.*, p.llm_alias as patient_alias, p.display_name as encrypted_display_name
            FROM proposals pr
            JOIN patients p ON pr.patient_id = p.id
        """
        clauses = []
        params = []
        if patient_id:
            clauses.append("pr.patient_id = ?")
            params.append(patient_id)
        if status and status != "all":
            clauses.append("pr.status = ?")
            params.append(status)

        if clauses:
            query += " WHERE " + " AND ".join(clauses)

        query += " ORDER BY pr.created_at DESC LIMIT ?"
        params.append(limit)

        rows = conn.execute(query, params).fetchall()
        proposals = []
        for r in rows:
            p = dict(r)
            if p.get("payload"):
                try:
                    p["payload"] = json.loads(p["payload"])
                except Exception:
                    pass
            if p.get("diff"):
                try:
                    p["diff"] = json.loads(p["diff"])
                except Exception:
                    pass
            proposals.append(p)
        return proposals


def get_proposal(proposal_id: str) -> Optional[Dict[str, Any]]:
    """Retrieves detailed proposal object."""
    with get_context_db() as conn:
        row = conn.execute(
            """
            SELECT pr.*, p.llm_alias as patient_alias
            FROM proposals pr
            JOIN patients p ON pr.patient_id = p.id
            WHERE pr.id = ?
            """,
            (proposal_id,),
        ).fetchone()
        if not row:
            return None
        p = dict(row)
        if p.get("payload"):
            try:
                p["payload"] = json.loads(p["payload"])
            except Exception:
                pass
        if p.get("diff"):
            try:
                p["diff"] = json.loads(p["diff"])
            except Exception:
                pass
        return p


def accept_proposal(proposal_id: str) -> Dict[str, Any]:
    """
    Doctor-in-Control Approval:
    Applies the proposed modification directly to live clinical records
    and marks proposal as accepted.
    """
    with get_context_db() as conn:
        row = conn.execute("SELECT * FROM proposals WHERE id = ?", (proposal_id,)).fetchone()
        if not row:
            raise ValueError("Proposal not found")
        p = dict(row)
        if p["status"] != "pending":
            return {"success": False, "status": p["status"], "error": f"Proposal already {p['status']}"}

        patient_id = p["patient_id"]
        prop_type = p["proposal_type"]
        payload = json.loads(p["payload"]) if isinstance(p["payload"], str) else (p["payload"] or {})
        rationale = p["rationale"]

    result_detail = {}
    if prop_type in ("artifact_update", "artifact"):
        current_art = get_patient_artifact(patient_id) or {}
        merged = dict(current_art)
        for k, v in payload.items():
            if k in ("summary", "active_issues", "medications", "watch_for", "follow_ups"):
                merged[k] = v
        new_art = update_patient_artifact(
            patient_id,
            merged,
            author_type="copilot_proposal",
            change_summary=f"Approved proposal: {rationale}",
            proposal_id=proposal_id,
        )
        result_detail["artifact_version"] = new_art.get("current_version")

    elif prop_type in ("log_entry", "observation"):
        entry = create_log_entry(
            patient_id=patient_id,
            entry_type=payload.get("entry_type", "observation"),
            content=payload.get("content", ""),
            metadata=payload.get("metadata"),
            entry_date=payload.get("entry_date"),
        )
        result_detail["log_entry_id"] = entry.get("id")

    elif prop_type in ("ticket", "task", "reminder"):
        t = create_ticket(
            patient_id=patient_id,
            title=payload.get("title", "Clinical Action Item"),
            description=payload.get("description", rationale),
            priority=payload.get("priority", "medium"),
            due_date=payload.get("due_date"),
            is_reminder=1 if prop_type == "reminder" else 0,
        )
        result_detail["ticket_id"] = t.get("id")

    now = datetime.now(timezone.utc).isoformat()
    with get_context_db() as conn:
        conn.execute(
            "UPDATE proposals SET status = 'accepted', resolved_at = ? WHERE id = ?",
            (now, proposal_id),
        )
        conn.commit()

    record_audit_event(
        entity_type="proposal",
        entity_id=proposal_id,
        action="accepted",
        details={"type": prop_type, "result": result_detail},
    )

    return {
        "success": True,
        "proposal_id": proposal_id,
        "status": "accepted",
        "result": result_detail,
    }


def reject_proposal(proposal_id: str, reason: Optional[str] = None) -> Dict[str, Any]:
    """Doctor-in-Control Rejection: Marks proposal rejected without modifying live records."""
    now = datetime.now(timezone.utc).isoformat()
    with get_context_db() as conn:
        row = conn.execute("SELECT * FROM proposals WHERE id = ?", (proposal_id,)).fetchone()
        if not row:
            raise ValueError("Proposal not found")
        conn.execute(
            "UPDATE proposals SET status = 'rejected', resolved_at = ? WHERE id = ?",
            (now, proposal_id),
        )
        conn.commit()

    record_audit_event(
        entity_type="proposal",
        entity_id=proposal_id,
        action="rejected",
        details={"reason": reason or "Rejected by physician"},
    )

    return {
        "success": True,
        "proposal_id": proposal_id,
        "status": "rejected",
    }
