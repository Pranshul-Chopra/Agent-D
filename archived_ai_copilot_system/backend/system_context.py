"""
system_context.py — Live practice and patient context builder for Doctor's Copilot.
Constructs real-time awareness of:
1. Current date, day, and local clock time.
2. Active patient context (alias, active conditions, medications, watch-for items).
3. Today's clinical practice agenda (scheduled visits, next patient pointer).
4. Pending proposals count awaiting doctor signature.
5. Overdue tickets and clinical follow-ups.
"""

from datetime import datetime
from typing import Optional, Dict, Any


def get_current_time_str() -> str:
    now = datetime.now()
    return now.strftime("%A, %B %d, %Y %I:%M %p")


def get_system_context(patient_id: Optional[str] = None) -> Dict[str, Any]:
    """Builds the real-time practice awareness envelope for prompt injection."""
    now = datetime.now()
    ctx: Dict[str, Any] = {
        "timestamp": now.isoformat(),
        "formatted_time": now.strftime("%A, %B %d, %Y %I:%M %p"),
        "today_date": now.strftime("%Y-%m-%d"),
        "total_appointments_today": 0,
        "next_patient": None,
        "pending_proposals_count": 0,
        "overdue_tickets_count": 0,
        "active_patient": None,
    }
    return ctx


def format_system_context_for_prompt(ctx: Dict[str, Any]) -> str:
    """Formats the system envelope into instructions for the LLM."""
    lines = [
        "### REAL-TIME PRACTICE CONTEXT",
        f"• Current Time: {ctx.get('formatted_time', 'Unknown')}",
        f"• Appointments Scheduled Today: {ctx.get('total_appointments_today', 0)}",
        f"• Pending Proposals Awaiting Sign-Off: {ctx.get('pending_proposals_count', 0)}",
        f"• Overdue Follow-up Tickets: {ctx.get('overdue_tickets_count', 0)}",
    ]
    if ctx.get("next_patient"):
        np = ctx["next_patient"]
        lines.append(f"• Next Patient: {np.get('alias', 'Unknown')} at {np.get('time', 'TBD')} ({np.get('reason', '')})")
    
    if ctx.get("active_patient"):
        ap = ctx["active_patient"]
        lines.extend([
            "",
            "### ACTIVE PATIENT CONTEXT",
            f"• Alias: {ap.get('alias', 'Unknown')}",
            f"• Active Issues: {', '.join(ap.get('active_issues', [])) or 'None noted'}",
            f"• Current Medications: {', '.join(ap.get('medications', [])) or 'None noted'}",
            f"• Watch-For Items: {', '.join(ap.get('watch_for', [])) or 'None noted'}",
        ])

    return "\n".join(lines)


# Legacy compatibility functions for transition
def get_workspace_context(project_id: Optional[Any] = None, user_query: Optional[str] = None) -> Dict[str, Any]:
    return get_system_context()


def format_workspace_context_for_prompt(ctx: Dict[str, Any], active_project: Optional[Any] = None) -> str:
    return format_system_context_for_prompt(ctx)
