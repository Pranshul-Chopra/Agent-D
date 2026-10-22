"""
clinical_context.py — Live Practice & Patient Context Engine for Agent-D.
Constructs real-time clinical awareness for the conversational copilot:
1. Local temporal grounding (date, time, day of week).
2. Daily practice schedule & next patient pointer.
3. Open clinical follow-up tickets & priority alerts.
4. Active patient medical envelope (alias, active diagnoses, medications, watch-for alerts, recent vitals).
5. Strict de-identification guarantee: Never injects legal names, telephone numbers, or email addresses.
"""

from datetime import datetime, date
from typing import Optional, Dict, Any, List
import context_db


def get_current_time_str() -> str:
    """Returns human-readable local time (e.g. 'Wednesday, October 21, 2026 10:45 AM')."""
    return datetime.now().strftime("%A, %B %d, %Y %I:%M %p")


def get_live_clinical_context(patient_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Builds the complete live practice and patient context envelope
    directly from context.db.
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
            "alias": a.get("patient_alias", "PT-XXXX"),
            "time": a.get("scheduled_time", ""),
            "duration": a.get("duration_minutes", 15),
            "type": a.get("appointment_type", "follow_up"),
            "reason": a.get("reason", "Follow-up consult"),
        })

    # 2. Open / Urgent Tickets
    # Query tasks/tickets from context_db
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

    # 3. Patient Medical Context (if patient_id is active)
    patient_ctx = None
    if patient_id:
        patient = context_db.get_patient(patient_id)
        if patient:
            artifact = context_db.get_patient_artifact(patient_id) or {}
            logs = context_db.list_log_entries(patient_id, limit=5)

            # Extract recent vitals from logs
            recent_vitals = []
            for l in logs:
                meta = l.get("metadata") or {}
                if meta:
                    v_str = ", ".join(f"{k.upper()}: {v}" for k, v in meta.items())
                    recent_vitals.append(f"{l.get('entry_date')}: {v_str}")

            patient_ctx = {
                "id": patient.get("id"),
                "alias": patient.get("llm_alias", "PT-XXXX"),
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
            }

    return {
        "timestamp": now.isoformat(),
        "formatted_time": now.strftime("%A, %B %d, %Y %I:%M %p"),
        "today_date": today_str,
        "practice_stats": stats,
        "appointments_today": safe_appts,
        "open_tickets": open_tickets,
        "active_patient": patient_ctx,
    }


def format_clinical_context_for_prompt(ctx: Dict[str, Any]) -> str:
    """Formats the clinical envelope into Markdown blocks for prompt injection."""
    lines = [
        "### REAL-TIME PRACTICE TEMPORAL CONTEXT",
        f"• Current Workstation Time: {ctx.get('formatted_time', 'Unknown')}",
        f"• Total Active Patients in Vault: {ctx.get('practice_stats', {}).get('total_patients', 0)}",
        f"• Scheduled Appointments Today: {len(ctx.get('appointments_today', []))}",
        f"• Open Action Items / Follow-up Tickets: {ctx.get('practice_stats', {}).get('open_tickets_count', 0)}",
    ]

    # Appointments list
    appts = ctx.get("appointments_today", [])
    if appts:
        lines.append("\n### TODAY'S CLINICAL APPOINTMENT SCHEDULE")
        for a in appts:
            lines.append(f"• {a['time']} — {a['alias']} ({a['type']}): {a['reason']}")
    else:
        lines.append("\n• Today's Schedule: No appointments currently on schedule.")

    # Open Tickets list
    tickets = ctx.get("open_tickets", [])
    if tickets:
        lines.append("\n### OPEN CLINICAL FOLLOW-UP TICKETS")
        for t in tickets:
            due = f" (Due: {t['due_date']})" if t.get("due_date") else ""
            lines.append(f"• [{t['priority'].upper()}] {t['title']}{due}")

    # Active Patient Chart Context
    p = ctx.get("active_patient")
    if p:
        lines.extend([
            "",
            f"### ACTIVE PATIENT CHART: {p['alias']}",
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


def get_clinical_system_prompt(patient_id: Optional[str] = None) -> str:
    """Builds the comprehensive system instruction for Agent-D."""
    ctx = get_live_clinical_context(patient_id)
    context_block = format_clinical_context_for_prompt(ctx)

    return f"""You are Agent-D, an intelligent, privacy-first Clinical Copilot hosted 100% locally on the physician's workstation at http://127.0.0.1:5050.

LOCAL ARCHITECTURE & IDENTITY:
- HOSTING: 100% local-first offline execution loopback (http://127.0.0.1:5050).
- STORAGE: Hardware-bound AES-256-GCM encrypted local vault (%LOCALAPPDATA%\\AgentD\\context.db).
- PRIVACY: Zero raw patient PII ever leaves this machine. All patients are strictly referenced by their cryptographic alias (e.g. PT-XXXX).

CORE OPERATING PRINCIPLES:
1. DOCTOR-IN-CONTROL: You provide rapid synthesis, clinical differential thoughts, medication review, and draft notes. The attending doctor always holds final clinical judgment and signature authority.
2. PATIENT SAFETY & ACCURACY: Never fabricate medical observations or lab values. Be concise, medically precise, and clear. Format drug dosages, frequencies, and watch-for flags clearly.
3. STRICT PRIVACY & DE-IDENTIFICATION: Patient legal identities are never used; always refer to patients by their safe clinical alias (e.g. PT-1042). Never request or output full legal names.
4. PROACTIVE PRACTICE AWARENESS: You have live temporal awareness of today's date, schedule, open tickets, and chart artifacts. When asked "What's on my dashboard today?", summarize today's schedule, pending follow-ups, and priority items clearly.

APPROVAL-FIRST CRUD ACTION PROTOCOL (PRANSHULOS PATTERN):
When the physician instructs you to perform any CRUD operation across consultations, dashboard agenda, follow-up tickets, or patient chart artifacts, DO NOT claim to have directly altered the database. Instead, offer an approval-first proposal using typed interactive action code blocks:

1. Consultations & Meetings:
```action:create_consultation
{{
  "patient_alias": "PT-XXXX",
  "scheduled_time": "YYYY-MM-DD HH:MM",
  "duration_minutes": 15,
  "appointment_type": "follow_up",
  "reason": "Follow-up consultation",
  "rationale": "Scheduled per physician request"
}}
```

2. Clinical Follow-up Tickets:
```action:create_ticket
{{
  "patient_alias": "PT-XXXX",
  "title": "Order HbA1c Lab Panel",
  "priority": "high",
  "due_date": "YYYY-MM-DD",
  "description": "3-month follow-up glycemic control panel",
  "rationale": "Follow-up care plan item"
}}
```

3. Dashboard Agenda Tasks & Goals:
```action:create_dashboard_task
{{
  "title": "Review morning clinic patient labs",
  "due_date": "YYYY-MM-DD",
  "priority": "medium",
  "rationale": "Practice workflow item"
}}
```

4. Patient Chart Artifact Amendments:
```action:update_artifact
{{
  "patient_alias": "PT-XXXX",
  "updates": {{
    "medications": ["..."],
    "watch_for": ["..."]
  }},
  "rationale": "Titrated dose based on clinical evaluation"
}}
```

The workstation UI will instantly render an interactive Doctor-in-Control Approval Card with parameters and diffs. The mutation is only executed when the doctor clicks 'Approve & Apply'.

{context_block}

When drafting notes or responding to inquiries, format your response using clean Markdown with clear headings and bullet points suitable for quick clinical reading.
"""
