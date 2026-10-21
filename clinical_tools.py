"""
clinical_tools.py — Medical Tool Layer for Agent-D.
Implements:
1. Direct Read Tools: get_today_agenda, get_next_patient, get_patient_artifact, get_patient_logs, get_open_tickets
2. Safe Write Tools (PROPOSALS ONLY): propose_artifact_update, propose_log_entry, propose_ticket, propose_reminder
Guaranteed Doctor-in-Control: Write tools generate pending proposals and NEVER write to live clinical records directly.
"""

from typing import Dict, Any, List, Optional
from datetime import date, datetime
import context_db


# ── Read Tools (Direct Execution) ─────────────────────────────────────────────

def get_today_agenda() -> Dict[str, Any]:
    """Retrieves today's appointment list, schedule counts, and pending action items."""
    today_str = date.today().isoformat()
    appts = context_db.list_appointments(date_str=today_str)
    stats = context_db.get_practice_summary_stats()
    open_tickets = context_db.list_tickets(status="open")

    return {
        "today_date": today_str,
        "total_appointments": len(appts),
        "appointments": appts,
        "next_patient": stats.get("next_appointment"),
        "open_tickets_count": len(open_tickets),
        "unreviewed_artifacts_count": stats.get("unreviewed_artifacts_count", 0),
    }


def get_next_patient() -> Optional[Dict[str, Any]]:
    """Identifies the next scheduled patient and returns their safe clinical brief."""
    stats = context_db.get_practice_summary_stats()
    return stats.get("next_appointment")


def get_patient_artifact(patient_id_or_alias: str) -> Optional[Dict[str, Any]]:
    """Retrieves structured JSON artifact for a given patient ID or clinical alias."""
    patient = None
    if patient_id_or_alias.startswith("PT-"):
        patient = context_db.get_patient_by_alias(patient_id_or_alias)
    else:
        patient = context_db.get_patient(patient_id_or_alias)

    if not patient:
        return None

    artifact = context_db.get_patient_artifact(patient["id"]) or {}
    return {
        "patient_alias": patient.get("llm_alias"),
        "current_version": artifact.get("current_version", 1),
        "summary": artifact.get("summary", ""),
        "active_issues": artifact.get("active_issues", []),
        "medications": artifact.get("medications", []),
        "watch_for": artifact.get("watch_for", []),
        "follow_ups": artifact.get("follow_ups", []),
    }


def get_patient_logs(patient_id_or_alias: str, limit: int = 10) -> List[Dict[str, Any]]:
    """Fetches recent dated clinical observations and vitals."""
    p_id = patient_id_or_alias
    if patient_id_or_alias.startswith("PT-"):
        patient = context_db.get_patient_by_alias(patient_id_or_alias)
        if patient:
            p_id = patient["id"]

    return context_db.list_log_entries(p_id, limit=limit)


def get_open_tickets(patient_id_or_alias: Optional[str] = None) -> List[Dict[str, Any]]:
    """Fetches pending clinical tickets and follow-up items."""
    p_id = None
    if patient_id_or_alias:
        if patient_id_or_alias.startswith("PT-"):
            p = context_db.get_patient_by_alias(patient_id_or_alias)
            if p:
                p_id = p["id"]
        else:
            p_id = patient_id_or_alias

    return context_db.list_tickets(patient_id=p_id, status="open")


# ── Write Tools (PROPOSAL GENERATION ONLY — Never directly modifies live DB) ──

def propose_artifact_update(
    patient_id: str,
    updates: Dict[str, Any],
    rationale: str = "Clinical consultation updates",
    visit_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Proposes an artifact update. Computes field-level diff against current artifact
    and stages a pending proposal for physician review.
    """
    current_art = context_db.get_patient_artifact(patient_id) or {}
    diff = context_db.compute_artifact_diff(current_art, updates)

    return context_db.create_proposal(
        patient_id=patient_id,
        proposal_type="artifact_update",
        payload=updates,
        rationale=rationale,
        visit_id=visit_id,
        diff=diff,
    )


def propose_log_entry(
    patient_id: str,
    content: str,
    entry_type: str = "observation",
    metadata: Optional[Dict[str, Any]] = None,
    rationale: str = "Recorded observation during encounter",
    visit_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Proposes a new dated clinical observation or vital signs entry."""
    payload = {
        "content": content,
        "entry_type": entry_type,
        "metadata": metadata or {},
        "entry_date": date.today().isoformat(),
    }
    return context_db.create_proposal(
        patient_id=patient_id,
        proposal_type="log_entry",
        payload=payload,
        rationale=rationale,
        visit_id=visit_id,
        diff={"new_entry": content, "type": entry_type},
    )


def propose_ticket(
    patient_id: str,
    title: str,
    priority: str = "medium",
    due_date: Optional[str] = None,
    description: str = "",
    rationale: str = "Follow-up care plan task",
    visit_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Proposes an actionable clinical follow-up task or lab order."""
    payload = {
        "title": title,
        "priority": priority,
        "due_date": due_date,
        "description": description or rationale,
    }
    return context_db.create_proposal(
        patient_id=patient_id,
        proposal_type="ticket",
        payload=payload,
        rationale=rationale,
        visit_id=visit_id,
        diff={"proposed_ticket": title, "priority": priority, "due_date": due_date},
    )


def propose_reminder(
    patient_id: str,
    title: str,
    due_time: Optional[str] = None,
    rationale: str = "Patient alert or reminder",
    visit_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Proposes a time-specific clinical reminder."""
    payload = {
        "title": title,
        "due_time": due_time,
        "is_reminder": 1,
    }
    return context_db.create_proposal(
        patient_id=patient_id,
        proposal_type="reminder",
        payload=payload,
        rationale=rationale,
        visit_id=visit_id,
        diff={"proposed_reminder": title, "due_time": due_time},
    )
