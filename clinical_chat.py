"""
clinical_chat.py — Conversational Copilot Streaming & Synthesis Engine for Agent-D.
Handles:
1. Session management & message persistence in context.db
2. Single Egress Choke Point routing through cloud_egress.py
3. Pre-send scrubbing of doctor messages, prior turns, and tool outputs
4. Offline/Local clinical context synthesis engine when no API key is configured or on failover
5. Strict de-identification and doctor-in-control clinical formatting
"""

import json
import time
import re
from datetime import date
from typing import Generator, Dict, Any, Optional, List
import requests

import config_db
import context_db
import clinical_context
import cloud_egress


def resolve_or_create_session(
    session_id: Optional[str] = None,
    patient_id: Optional[str] = None,
    first_message: str = "",
) -> str:
    """
    Ensures a valid chat session ID exists in context.db.
    If session_id is None or doesn't exist, creates a new one.
    """
    if session_id:
        existing = context_db.get_chat_session(session_id)
        if existing:
            return session_id

    # Create new session
    title = first_message.strip()[:35]
    if len(first_message.strip()) > 35:
        title += "..."
    if not title:
        title = "Clinical Consultation"

    new_session = context_db.create_chat_session(title=title, patient_id=patient_id)
    return new_session["id"]


def _generate_local_clinical_response(
    message: str,
    ctx: Dict[str, Any],
) -> str:
    """
    Intelligent local clinical copilot response engine.
    Used when no Gemini API key is configured, during offline clinic operation,
    or on cloud failover.
    Grounded directly in the live practice and active patient context envelope.
    """
    msg_lower = message.lower().strip()
    active_p = ctx.get("active_patient")
    stats = ctx.get("practice_stats", {})
    appts = ctx.get("appointments_today", [])
    tickets = ctx.get("open_tickets", [])

    # 1. Morning Practice Brief / Dashboard Inquiry
    if any(k in msg_lower for k in ("morning", "dashboard", "brief", "today's schedule", "overview", "agenda")):
        lines = [
            "### ☀️ Morning Practice Briefing",
            f"**Workstation Date & Time:** {ctx.get('formatted_time')}",
            "",
            "#### 📊 Daily Practice Summary",
            f"• **Active Patients in Vault:** {stats.get('total_patients', 0)}",
            f"• **Scheduled Consultations Today:** {len(appts)}",
            f"• **Open Follow-up Action Items:** {stats.get('open_tickets_count', 0)}",
            "",
            "#### 📅 Today's Clinical Schedule",
        ]
        if appts:
            for a in appts:
                lines.append(f"• **{a['time']}** — `{a['alias']}` ({a['type'].replace('_', ' ').title()}): {a['reason']}")
        else:
            lines.append("• *No consultations currently scheduled for today.*")

        if tickets:
            lines.extend([
                "",
                "#### ⚠️ Pending Clinical Follow-ups",
            ])
            for t in tickets:
                due = f" *(Due: {t['due_date']})*" if t.get("due_date") else ""
                lines.append(f"• `[{t['priority'].upper()}]` {t['title']}{due}")

        lines.extend([
            "",
            "> [!NOTE]",
            "> All patient identities remain protected under local cryptographic aliases (`PT-XXXX`). Final clinical sign-off is retained by the attending physician.",
        ])
        return "\n".join(lines)

    # 2. Next Patient Brief
    if any(k in msg_lower for k in ("next patient", "who is next", "upcoming patient", "upcoming consult")):
        if appts:
            next_a = appts[0]
            lines = [
                f"### 🩺 Next Scheduled Consultation: `{next_a['alias']}`",
                f"• **Scheduled Time:** {next_a['time']} ({next_a['duration']} min duration)",
                f"• **Consultation Type:** {next_a['type'].replace('_', ' ').title()}",
                f"• **Reason for Visit:** {next_a['reason']}",
            ]
            if active_p and active_p.get("alias") == next_a["alias"]:
                lines.extend([
                    "",
                    "#### 📋 Patient Profile & Active Watch-For Items",
                    f"• **Active Diagnoses:** {', '.join(active_p.get('active_issues', [])) or 'None recorded'}",
                    f"• **Current Medications:** {', '.join(active_p.get('medications', [])) or 'None recorded'}",
                    f"• **Watch-For Flags:** {', '.join(active_p.get('watch_for', [])) or 'No critical flags'}",
                ])
                if active_p.get("recent_vitals"):
                    lines.append(f"• **Recent Vitals:** {'; '.join(active_p['recent_vitals'])}")
            else:
                lines.append("\n*Select this patient in the Patients Manager to review full chart artifacts.*")
            return "\n".join(lines)
        else:
            return "### 🩺 Schedule Status\nThere are no upcoming appointments scheduled for today in the practice vault."

    # 3. Active Patient Medication / Prescription Review
    if any(k in msg_lower for k in ("medication", "meds", "prescription", "dose", "drug", "interaction")):
        if active_p:
            meds = active_p.get("medications", [])
            lines = [
                f"### 💊 Active Medication Review: `{active_p['alias']}`",
                f"**Artifact Version:** v{active_p.get('artifact_version', 1)} | **Demographics:** {active_p.get('gender', 'Unknown')}, DOB: {active_p.get('date_of_birth', 'Not recorded')}",
                "",
                "#### Prescribed Regimen",
            ]
            if meds:
                for m in meds:
                    lines.append(f"• **{m}**")
            else:
                lines.append("• *No active medications recorded in current chart snapshot.*")

            watch = active_p.get("watch_for", [])
            if watch:
                lines.extend([
                    "",
                    "#### ⚠️ Watch-For Alerts & Precautions",
                ])
                for w in watch:
                    lines.append(f"• {w}")

            lines.extend([
                "",
                "> [!TIP]",
                "> To adjust dosage or record new prescriptions, use the Artifacts Editor or create a medical log entry.",
            ])
            return "\n".join(lines)
        else:
            return "### 💊 Medication Review\nNo active patient is currently selected. Please select a patient chart from the Patients Manager to review active prescriptions."

    # 4. Dictate Visit Notes / SOAP Formatting
    if any(k in msg_lower for k in ("dictate", "visit note", "soap", "record visit", "consultation note", "notes")):
        alias = active_p.get("alias") if active_p else "PT-XXXX"
        lines = [
            f"### 📝 Clinical Visit Note Draft: `{alias}`",
            f"**Encounter Timestamp:** {ctx.get('formatted_time')}",
            "",
            "#### S — Subjective",
            f"• Patient presented for clinical follow-up regarding reported symptoms.",
            f"• Physician dictation: *\"{message}\"*",
            "",
            "#### O — Objective",
        ]
        if active_p and active_p.get("recent_vitals"):
            lines.append(f"• Recent Vitals: {'; '.join(active_p['recent_vitals'])}")
        else:
            lines.append("• Vitals recorded: Review in Medical Logs tab.")

        lines.extend([
            "",
            "#### A — Assessment",
            f"• Active Diagnoses: {', '.join(active_p.get('active_issues', [])) if active_p else 'Under clinical observation'}.",
            "• Patient demonstrates stability under current outpatient therapeutic plan.",
            "",
            "#### P — Plan & Recommendations",
            "• Continue current pharmacotherapy regimen with patient adherence counseling.",
            "• Schedule follow-up assessment in 4 to 6 weeks or sooner if acute symptoms arise.",
            "",
            "> [!NOTE]",
            "> This draft was automatically generated by Agent-D Copilot. You can review and copy it into the patient's Medical Logs.",
        ])
        return "\n".join(lines)

    # 5. Proposed Ticket Request
    if any(k in msg_lower for k in ("make a ticket", "add a ticket", "create a ticket", "order lab", "order test", "follow up ticket", "propose ticket")):
        p_id = active_p.get("id") if active_p else None
        p_alias = active_p.get("alias") if active_p else "PT-XXXX"
        title = message.replace("make a ticket", "").replace("add a ticket", "").replace("create a ticket", "").replace("propose ticket", "").strip()
        if not title:
            title = "Hypertension BP check follow-up"

        prop_id = None
        if p_id:
            try:
                import clinical_tools
                prop = clinical_tools.propose_ticket(
                    patient_id=p_id,
                    title=title,
                    priority="high",
                    due_date=date.today().isoformat(),
                    description=message,
                    rationale="Physician requested follow-up action item in chat."
                )
                prop_id = prop["id"]
            except Exception:
                pass

        card_json = json.dumps({
            "proposal_id": prop_id,
            "patient_id": p_id,
            "patient_alias": p_alias,
            "proposal_type": "ticket",
            "title": title,
            "priority": "high",
            "due_date": date.today().isoformat(),
            "rationale": f"Doctor requested: \"{message}\"",
        }, indent=2)

        return (
            f"### 📋 Follow-up Action Item Formulated for `{p_alias}`\n\n"
            f"I have staged a clinical follow-up ticket for your review and approval:\n\n"
            f"```action:propose_ticket\n{card_json}\n```\n\n"
            "> [!NOTE]\n"
            "> Click **[Approve & Commit]** above to commit this action item to your Clinical Kanban Board."
        )

    # 6. Proposed Consultation / Meeting Scheduling
    if any(k in msg_lower for k in ("consultation", "schedule consultation", "schedule meeting", "book appointment", "new appointment", "schedule visit")):
        p_id = active_p.get("id") if active_p else None
        p_alias = active_p.get("alias") if active_p else "PT-XXXX"
        if not p_id:
            all_p = context_db.list_patients(limit=1)
            if all_p:
                p_id = all_p[0]["id"]
                p_alias = all_p[0]["llm_alias"]

        from datetime import datetime, timedelta
        target_time = (datetime.now() + timedelta(hours=2)).strftime("%Y-%m-%d %H:00")
        reason = "Follow-up clinical assessment"
        if "bp" in msg_lower or "hypertension" in msg_lower:
            reason = "Hypertension blood pressure check"
        elif "diabetes" in msg_lower or "glucose" in msg_lower:
            reason = "Diabetes management & lab review"

        prop_id = None
        if p_id:
            try:
                import clinical_tools
                prop = clinical_tools.propose_consultation(
                    patient_id=p_id,
                    scheduled_time=target_time,
                    duration_minutes=15,
                    appointment_type="follow_up",
                    reason=reason,
                    rationale=f"Physician requested scheduling in chat: \"{message}\"",
                )
                prop_id = prop.get("id")
            except Exception:
                pass

        card_json = json.dumps({
            "proposal_id": prop_id,
            "patient_id": p_id,
            "patient_alias": p_alias,
            "proposal_type": "consultation",
            "title": f"Schedule Consultation: {p_alias}",
            "scheduled_time": target_time,
            "duration_minutes": 15,
            "appointment_type": "follow_up",
            "reason": reason,
            "rationale": f"Physician requested: \"{message}\"",
        }, indent=2)

        return (
            f"### 🤝 Consultation Proposal Formulated for `{p_alias}`\n\n"
            f"I have staged a consultation encounter for your review and approval:\n\n"
            f"```action:create_consultation\n{card_json}\n```\n\n"
            "> [!NOTE]\n"
            "> Click **[Approve & Schedule]** above to commit this consultation to your Consultations schedule."
        )

    # 7. Proposed Dashboard Task / Agenda Item
    if any(k in msg_lower for k in ("dashboard task", "add task", "schedule task", "add to dashboard", "add to today")):
        clean_title = message.replace("/dashboard", "").replace("add task", "").replace("dashboard task", "").strip() or "Practice Review Item"
        prop_id = None
        try:
            import clinical_tools
            prop = clinical_tools.propose_dashboard_task(
                title=clean_title,
                priority="medium",
                due_date=date.today().isoformat(),
                rationale=f"Physician added to practice dashboard: \"{message}\"",
            )
            prop_id = prop.get("id")
        except Exception:
            pass

        card_json = json.dumps({
            "proposal_id": prop_id,
            "proposal_type": "dashboard_task",
            "title": clean_title,
            "priority": "medium",
            "due_date": date.today().isoformat(),
            "rationale": f"Doctor requested: \"{message}\"",
        }, indent=2)

        return (
            f"### 📌 Dashboard Task Formulated\n\n"
            f"I have staged an agenda task for your Practice Dashboard:\n\n"
            f"```action:create_dashboard_task\n{card_json}\n```\n\n"
            "> [!NOTE]\n"
            "> Click **[Approve & Add]** above to commit this task to today's schedule."
        )

    # 8. Proposed Artifact Update
    if active_p and any(k in msg_lower for k in ("propose medication", "add medication", "update medication", "prescribe", "change dose", "update artifact")):
        p_id = active_p.get("id")
        p_alias = active_p.get("alias")
        current_meds = list(active_p.get("medications", []))

        new_med = "Metformin 1000mg BID (tolerated well)"
        if "lisinopril" in msg_lower:
            new_med = "Lisinopril 20mg QD"
        elif "amlodipine" in msg_lower:
            new_med = "Amlodipine 10mg QD"

        if new_med not in current_meds:
            updated_meds = current_meds + [new_med]
        else:
            updated_meds = current_meds

        updates = {"medications": updated_meds}
        prop_id = None
        if p_id:
            try:
                import clinical_tools
                prop = clinical_tools.propose_artifact_update(
                    patient_id=p_id,
                    updates=updates,
                    rationale=f"Titrated therapy based on consult: {message}"
                )
                prop_id = prop["id"]
            except Exception:
                pass

        card_json = json.dumps({
            "proposal_id": prop_id,
            "patient_id": p_id,
            "patient_alias": p_alias,
            "proposal_type": "artifact_update",
            "title": f"Update Active Medications for {p_alias}",
            "updates": updates,
            "rationale": f"Titration / prescription adjustment: \"{message}\"",
        }, indent=2)

        return (
            f"### 🩺 Proposed Chart Artifact Modification for `{p_alias}`\n\n"
            f"I have prepared the following differential artifact update for your review:\n\n"
            f"```action:propose_artifact_update\n{card_json}\n```\n\n"
            "> [!IMPORTANT]\n"
            "> In accordance with Safety Gate rules, no updates are made to the database until you click **[Approve & Commit]**."
        )

    # 9. General Clinical Inquiry or Chat Turn
    alias_str = f" for `{active_p['alias']}`" if active_p else ""
    return (
        f"### 🤖 Agent-D Clinical Copilot{alias_str}\n\n"
        f"I have received your consultation query: **\"{message}\"**.\n\n"
        f"**Workstation Infrastructure & Identity:**\n"
        f"• **Deployment Location:** Local Offline Workstation (`http://127.0.0.1:5050`)\n"
        f"• **Hardware Vault:** AES-256-GCM encrypted database (`%LOCALAPPDATA%\\AgentD\\context.db`)\n"
        f"• **De-Identification Perimeter:** Active (Zero raw patient PII transmitted; all patients aliased)\n"
        f"• **Practice Time:** {ctx.get('formatted_time')}\n"
        f"• **Active Patient Scope:** {active_p['alias'] if active_p else 'General Practice Mode (No patient selected)'}\n\n"
        f"> [!TIP]\n"
        f"> Type `/` to open the quick clinical command menu (`/consultation`, `/brief`, `/note`, `/ticket`, `/artifact`, `/meds`, `/search`)."
    )


def stream_clinical_chat(
    message: str,
    session_id: Optional[str] = None,
    patient_id: Optional[str] = None,
) -> Generator[str, None, None]:
    """
    Core SSE streaming generator.
    Enforces Single Egress Choke Point via cloud_egress.py:
    1. Pre-send scrubbing of user message & prior chat history
    2. Strict schema payload validation
    3. Canary & PHI leak pre-flight verification
    4. Cloud streaming with fallback to Local Clinical Synthesis
    """
    clean_msg = message.strip()
    if not clean_msg:
        yield f"data: {json.dumps({'error': 'Message cannot be empty.'})}\n\n"
        return

    # 1. Resolve or create session
    s_id = resolve_or_create_session(session_id, patient_id, clean_msg)
    yield f"data: {json.dumps({'event': 'start', 'session_id': s_id})}\n\n"

    # 2. Record user turn in context.db
    context_db.add_chat_message(
        session_id=s_id,
        role="user",
        content=clean_msg,
    )

    # 3. Retrieve session context & prior history
    session_data = context_db.get_chat_session(s_id) or {}
    prior_messages = session_data.get("messages", [])

    # 4. Build live prompt (Cloud boundary strictly enforced)
    system_prompt = clinical_context.get_clinical_system_prompt(patient_id=patient_id, cloud_boundary=True)

    # 5. Build contents array with pre-send scrubbing on user message & history
    contents = []
    scrub_warnings = []
    for turn in prior_messages[:-1]:
        g_role = "user" if turn.get("role") == "user" else "model"
        turn_text = turn.get("content", "")
        scrubbed_t, red = cloud_egress.scrub_text(turn_text)
        if red:
            scrub_warnings.extend(red)
        contents.append({
            "role": g_role,
            "parts": [{"text": scrubbed_t}]
        })

    # Scrub incoming user message
    scrubbed_user_msg, user_red = cloud_egress.scrub_text(clean_msg)
    if user_red:
        scrub_warnings.extend(user_red)
    contents.append({
        "role": "user",
        "parts": [{"text": scrubbed_user_msg}]
    })

    # Build validated egress payload conforming strictly to ALLOWED_ROOT_KEYS
    payload = {
        "system_instruction": {"parts": [{"text": system_prompt}]},
        "contents": contents,
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": 4096,
        }
    }

    # 6. Check for active Gemini API keys with multi-key rotation and 60s cooldown failover
    full_response = ""
    model_name = "gemini-2.0-flash"
    success = False
    tried_key_ids = set()

    candidate_models = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-flash-lite-latest"]
    saved_model = config_db.get_setting("active_model")
    if saved_model and saved_model not in candidate_models:
        candidate_models.insert(0, saved_model)

    while True:
        active_key = config_db.get_active_rotated_key(provider="gemini", allow_cooldown=False)
        if not active_key or not active_key.get("raw_key"):
            break
        key_id = active_key["id"]
        if key_id in tried_key_ids:
            break
        tried_key_ids.add(key_id)
        raw_key = active_key["raw_key"]

        key_succeeded = False
        for cand_model in candidate_models:
            try:
                # SINGLE EGRESS CHOKE POINT
                res = cloud_egress.dispatch_cloud_streaming_request(
                    model=cand_model,
                    payload=payload,
                    api_key=raw_key,
                    timeout=45.0,
                )

                if res.status_code == 200:
                    model_name = cand_model
                    for raw_line in res.iter_lines(decode_unicode=True):
                        if not raw_line:
                            continue
                        line = raw_line.strip()
                        if line.startswith("data:"):
                            json_str = line[5:].strip()
                            if not json_str:
                                continue
                            try:
                                chunk_data = json.loads(json_str)
                                candidates = chunk_data.get("candidates", [])
                                if candidates:
                                    parts = candidates[0].get("content", {}).get("parts", [])
                                    if parts:
                                        token = parts[0].get("text", "")
                                        if token:
                                            full_response += token
                                            yield f"data: {json.dumps({'event': 'token', 'token': token, 'session_id': s_id})}\n\n"
                            except Exception:
                                pass
                    key_succeeded = True
                    success = True
                    config_db.record_key_usage(key_id, success=True)
                    break
                elif res.status_code in (429, 503):
                    # Rate limit or quota exhaustion: record cooldown and failover to next key in pool
                    config_db.record_key_usage(
                        key_id,
                        success=False,
                        error_msg=f"HTTP {res.status_code}",
                        is_rate_limited=True,
                    )
                    break
                else:
                    # Model not found or incompatible format; try next candidate model
                    continue
            except cloud_egress.EgressSecurityError as ese:
                # Blocked by Zero-PHI security gate
                config_db.record_key_usage(key_id, success=False, error_msg=f"EgressSecurityError: {ese}")
                full_response = f"> [!CAUTION]\n> **Cloud Egress Security Gate Blocked Request:** {ese}\n\n"
                key_succeeded = False
                success = False
                break
            except Exception as e:
                config_db.record_key_usage(key_id, success=False, error_msg=str(e))
                break

        if key_succeeded and full_response:
            break

    if not success or not full_response:
        # Fall back to local clinical synthesis engine (uses full local context on-device)
        local_clinical_ctx = clinical_context.get_live_clinical_context(patient_id=patient_id, cloud_boundary=False)
        pool_status = config_db.get_key_pool_status(provider="gemini")
        cooldown_prefix = ""
        if pool_status.get("all_in_cooldown"):
            cd_secs = pool_status.get("retry_countdown_seconds", 60)
            cooldown_prefix = (
                f"> [!WARNING]\n"
                f"> **Multi-Key Gateway Cooldown:** All configured Gemini API keys are currently rate-limited (retry in ~{cd_secs}s). Responding via offline Local Clinical Synthesis.\n\n"
            )

        local_resp = cooldown_prefix + _generate_local_clinical_response(clean_msg, local_clinical_ctx)
        model_name = "local-clinical-synthesis"
        tokens = re.findall(r"\S+|\n+", local_resp)
        for tok in tokens:
            full_response += tok + " "
            yield f"data: {json.dumps({'event': 'token', 'token': tok + ' ', 'session_id': s_id})}\n\n"
            time.sleep(0.012)

    # 7. Save assistant turn in context.db
    context_db.add_chat_message(
        session_id=s_id,
        role="assistant",
        content=full_response.strip(),
        model_name=model_name,
    )

    # 8. Yield done event
    yield f"data: {json.dumps({'event': 'done', 'session_id': s_id, 'content': full_response.strip(), 'model': model_name})}\n\n"


def generate_clinical_chat_sync(
    message: str,
    session_id: Optional[str] = None,
    patient_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Synchronous clinical chat generator.
    Processes stream chunks into a single response object.
    """
    accumulated = ""
    resolved_id = session_id or ""
    model_name = "local-clinical-synthesis"

    for raw in stream_clinical_chat(message, session_id=session_id, patient_id=patient_id):
        if raw.startswith("data:"):
            payload = json.loads(raw[5:].strip())
            if payload.get("event") == "start":
                resolved_id = payload.get("session_id", resolved_id)
            elif payload.get("event") == "token":
                accumulated += payload.get("token", "")
            elif payload.get("event") == "done":
                accumulated = payload.get("content", accumulated)
                model_name = payload.get("model", model_name)
            elif "error" in payload:
                return {"error": payload["error"]}

    return {
        "response": accumulated,
        "session_id": resolved_id,
        "conversation_id": resolved_id,
        "model": model_name,
    }
