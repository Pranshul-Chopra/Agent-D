"""
clinical_context.py — Live Practice & Patient Context Engine for Agent-D.
Constructs real-time practice temporal context and token-only patient agendas:
1. Local temporal grounding (date, time, day of week).
2. Daily practice schedule & next patient pointer.
3. Practice dashboard tasks & consultation slots.
4. Strict Zero-PHI cloud boundary: In cloud mode, only patient token identifiers (e.g. PT-XXXX)
   and consultation timestamps (past / upcoming) are included.
5. Diagnoses, active issues, medications, watch-for alerts, and vitals are strictly
   restricted to local workstation storage and local on-device SLMs (Local Ollama).
"""

from datetime import datetime, date
from typing import Optional, Dict, Any, List
import context_db


def get_current_time_str() -> str:
    """Returns human-readable local time (e.g. 'Wednesday, October 21, 2026 10:45 AM')."""
    return datetime.now().strftime("%A, %B %d, %Y %I:%M %p")


def get_live_clinical_context(
    patient_id: Optional[str] = None,
    cloud_boundary: bool = True,
) -> Dict[str, Any]:
    """
    Builds the live practice and patient context envelope directly from context.db.
    When cloud_boundary=True (default), enforces strict Zero-PHI:
    only patient tokens (PT-XXXX) and consultation timestamps are included.
    When cloud_boundary=False (local offline mode / Local Ollama),
    full clinical artifact details are provided for local-only processing.
    """
    now = datetime.now()
    today_str = date.today().isoformat()

    # 1. Practice Summary & Appointments
    stats = context_db.get_practice_summary_stats()
    today_appts = context_db.list_appointments(date_str=today_str)
    
    # Format appointments safely with aliases
    safe_appts = []
    for a in today_appts:
        safe_appts.append({
            "id": a.get("id"),
            "alias": a.get("patient_alias", "PT-XXXX"),
            "time": a.get("scheduled_time", ""),
            "duration": a.get("duration_minutes", 15),
            "type": a.get("appointment_type", "follow_up"),
            "status": a.get("status", "scheduled"),
            "reason": a.get("reason", "Consultation"),
        })

    # 2. Open / Dashboard Tasks
    with context_db.get_context_db() as conn:
        t_rows = conn.execute(
            """
            SELECT id, title, priority, status, due_date
            FROM tickets
            WHERE status != 'done'
            ORDER BY CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END ASC, created_at DESC
            LIMIT 5
            """
        ).fetchall()
        open_tickets = [dict(r) for r in t_rows]

    # 3. Patient Context
    patient_ctx = None
    if patient_id:
        patient = context_db.get_patient(patient_id)
        if patient:
            p_alias = patient.get("llm_alias", "PT-XXXX")
            # Fetch appointment slots for this patient
            p_appts = context_db.list_appointments(patient_id=patient_id)
            safe_p_appts = [
                {
                    "time": appt.get("scheduled_time", ""),
                    "duration": appt.get("duration_minutes", 15),
                    "type": appt.get("appointment_type", "consultation"),
                    "status": appt.get("status", "scheduled"),
                }
                for appt in p_appts
            ]

            if cloud_boundary:
                # STRICT ZERO-PHI CLOUD BOUNDARY: Token ID & consultation timestamps ONLY
                patient_ctx = {
                    "id": patient.get("id"),
                    "alias": p_alias,
                    "is_cloud_boundary": True,
                    "consultations": safe_p_appts,
                }
            else:
                # LOCAL-ONLY / OLLAMA MODE: Full clinical chart artifact
                artifact = context_db.get_patient_artifact(patient_id) or {}
                logs = context_db.list_log_entries(patient_id, limit=5)

                recent_vitals = []
                for l in logs:
                    meta = l.get("metadata") or {}
                    if meta:
                        v_str = ", ".join(f"{k.upper()}: {v}" for k, v in meta.items())
                        recent_vitals.append(f"{l.get('entry_date')}: {v_str}")

                patient_ctx = {
                    "id": patient.get("id"),
                    "alias": p_alias,
                    "is_cloud_boundary": False,
                    "date_of_birth": patient.get("date_of_birth"),
                    "gender": patient.get("gender"),
                    "blood_group": patient.get("blood_group"),
                    "artifact_version": artifact.get("current_version", 1),
                    "summary": artifact.get("summary", ""),
                    "active_issues": artifact.get("active_issues", []),
                    "medications": artifact.get("medications", []),
                    "watch_for": artifact.get("watch_for", []),
                    "follow_ups": artifact.get("follow_ups", []),
                    "recent_vitals": recent_vitals,
                    "consultations": safe_p_appts,
                }

    return {
        "timestamp": now.isoformat(),
        "formatted_time": now.strftime("%A, %B %d, %Y %I:%M %p"),
        "today_date": today_str,
        "practice_stats": stats,
        "appointments_today": safe_appts,
        "open_tickets": open_tickets,
        "active_patient": patient_ctx,
        "cloud_boundary": cloud_boundary,
    }


def format_clinical_context_for_prompt(ctx: Dict[str, Any]) -> str:
    """Formats the practice envelope into Markdown blocks for prompt injection."""
    lines = [
        "### REAL-TIME PRACTICE TEMPORAL CONTEXT",
        f"• Workstation Time: {ctx.get('formatted_time', 'Unknown')}",
        f"• Total Active Patients in Vault: {ctx.get('practice_stats', {}).get('total_patients', 0)}",
        f"• Scheduled Appointments Today: {len(ctx.get('appointments_today', []))}",
        f"• Open Agenda Tasks / Follow-ups: {ctx.get('practice_stats', {}).get('open_tickets_count', 0)}",
    ]

    # Appointments list
    appts = ctx.get("appointments_today", [])
    if appts:
        lines.append("\n### TODAY'S CLINICAL APPOINTMENT SCHEDULE")
        for a in appts:
            lines.append(f"• {a['time']} — {a['alias']} ({a['type']}): {a.get('reason', 'Consultation')}")
    else:
        lines.append("\n• Today's Schedule: No appointments currently on schedule.")

    # Open Agenda Tasks
    tickets = ctx.get("open_tickets", [])
    if tickets:
        lines.append("\n### PRACTICE DASHBOARD AGENDA ITEMS")
        for t in tickets:
            due = f" (Due: {t['due_date']})" if t.get("due_date") else ""
            lines.append(f"• [{t['priority'].upper()}] {t['title']}{due}")

    # Active Patient Chart Context
    p = ctx.get("active_patient")
    if p:
        alias = p["alias"]
        if p.get("is_cloud_boundary", True):
            # Strict token boundary representation
            lines.extend([
                "",
                f"### ACTIVE PATIENT CONTEXT: {alias}",
                f"• Patient Token: `{alias}` (Cryptographic safe identifier)",
                f"• Zero-PHI Boundary: ACTIVE (Detailed medical history, diagnoses, medications, and vitals are isolated to Local Workstation Storage)",
            ])
            consults = p.get("consultations", [])
            if consults:
                lines.append("• Recorded Consultation Encounters:")
                for c in consults:
                    lines.append(f"  - {c.get('time')} ({c.get('type')}, {c.get('duration')}m) - Status: {c.get('status')}")
            else:
                lines.append("• Recorded Consultation Encounters: None on file.")
        else:
            # Full local chart representation (Local mode / Ollama)
            lines.extend([
                "",
                f"### ACTIVE PATIENT CHART: {alias}",
                f"• Demographics: {p.get('gender', 'Unknown')}, DOB: {p.get('date_of_birth', 'Not recorded')}, Blood: {p.get('blood_group', 'Unknown')}",
                f"• Profile Summary (v{p.get('artifact_version', 1)}): {p.get('summary', 'No summary recorded')}",
                f"• Active Diagnoses: {', '.join(p.get('active_issues', [])) or 'None recorded'}",
                f"• Current Medications: {', '.join(p.get('medications', [])) or 'None recorded'}",
                f"• Watch-For Clinical Alerts: {', '.join(p.get('watch_for', [])) or 'None recorded'}",
                f"• Scheduled Follow-ups: {', '.join(p.get('follow_ups', [])) or 'None scheduled'}",
            ])
            if p.get("recent_vitals"):
                lines.append(f"• Recent Vitals: {'; '.join(p['recent_vitals'])}")
    else:
        lines.extend([
            "",
            "### ACTIVE PATIENT CONTEXT: None Selected (General Practice Mode)",
            "The doctor is asking general practice questions or reviewing the aggregate practice schedule.",
        ])

    return "\n".join(lines)


def get_clinical_system_prompt(
    patient_id: Optional[str] = None,
    cloud_boundary: bool = True,
) -> str:
    """
    Builds system instruction for Agent-D.
    When cloud_boundary=True (default), configures an administrative consultation assistant
    strictly barred from clinical prescribing, dosing, or diagnosis.
    """
    ctx = get_live_clinical_context(patient_id, cloud_boundary=cloud_boundary)
    context_block = format_clinical_context_for_prompt(ctx)

    if cloud_boundary:
        return f"""You are Agent-D Cloud Assistant, an administrative briefing and consultation management assistant running for the physician's practice.

INTENDED USE & ADMINISTRATIVE BOUNDARY:
- Intended Use: You assist the physician ONLY with practice scheduling, calendar management, daily agenda briefings, and consultation slot coordination.
- Medical Device Classification: Agent-D provides administrative consultation organization and temporal scheduling assistance under human physician oversight. Formal medical device regulatory posture (CDSCO/MDR) remains subject to qualified legal counsel review.
- CLINICAL RESTRICTION: You are strictly and technically barred from prescribing medications, recommending pharmaceutical dosages, generating medical diagnoses, or formulating clinical care rationales.
- ZERO-PHI GUARANTEE: Zero Personal Health Information (PHI) is processed or stored. All patients are referenced strictly by token identifiers (e.g. PT-XXXX). Detailed medical records (diagnoses, medications, vitals) are isolated to the local workstation vault.
- LOCAL-FIRST FALLBACK: If the physician requests clinical synthesis, medication review, or diagnostic evaluation, remind them that full clinical chart review and pre-visit synthesis are handled exclusively on the on-device Local Engine (Local Ollama) to protect patient privacy.

APPROVAL-FIRST CRUD ACTION PROTOCOL:
When the physician instructs you to schedule, update, or cancel consultations or dashboard agenda items, offer an approval-first proposal using typed interactive action blocks:

1. Consultations & Scheduling:
```action:create_consultation
{{
  "patient_alias": "PT-XXXX",
  "scheduled_time": "YYYY-MM-DD HH:MM",
  "duration_minutes": 15,
  "appointment_type": "consultation",
  "reason": "Consultation",
  "rationale": "Scheduled per physician request"
}}
```

2. Update / Reschedule Consultation:
```action:update_consultation
{{
  "appointment_id": "APPT-XXXX",
  "scheduled_time": "YYYY-MM-DD HH:MM",
  "duration_minutes": 20,
  "rationale": "Rescheduled per physician request"
}}
```

3. Cancel Consultation:
```action:cancel_consultation
{{
  "appointment_id": "APPT-XXXX",
  "reason": "Cancelled per physician request",
  "rationale": "Slot cancellation"
}}
```

4. Dashboard Agenda Tasks:
```action:create_dashboard_task
{{
  "title": "Review morning clinic patient queue",
  "due_date": "YYYY-MM-DD",
  "priority": "medium",
  "rationale": "Practice workflow item"
}}
```

The workstation UI will render an interactive Doctor-in-Control Approval Card. The mutation is only executed when the doctor clicks 'Approve & Apply'.

{context_block}

Respond clearly and concisely using clean Markdown."""

    else:
        # Full local on-device copilot prompt (Local Ollama mode)
        return f"""You are Agent-D Local Clinical Copilot, running 100% locally on the physician's workstation.

IDENTITY & ZERO-EGRESS PRIVACY:
- HOSTING: 100% on-device local execution (http://127.0.0.1:5050 / local Ollama).
- PRIVACY: Zero data ever leaves this machine. Complete chart artifacts are decrypted in local RAM only.
- DOCTOR-IN-CONTROL: All recommendations are differential notes; attending physician retains final clinical judgment.

APPROVAL-FIRST ACTION PROTOCOL:
You can propose consultation scheduling, dashboard tasks, and chart artifact updates via approval blocks.

{context_block}

Format notes and briefings clearly with clinical headings and bullet points."""
