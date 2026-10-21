# ── routes.py ─────────────────────────────────────────────────────────────────
# Flask routes and REST API for PM Tool.

from flask import Blueprint, render_template, request, jsonify, send_file, send_from_directory, Response, stream_with_context
import db
import ai_db
import config_db
import context_db
import clinical_context
import clinical_chat
from llm import gateway as llm_gateway
import system_context as workspace_context

import os
import sys
from pathlib import Path

def _get_base_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    return Path(__file__).resolve().parent

bp = Blueprint("main", __name__, template_folder=str(_get_base_dir() / "templates"), static_folder=str(_get_base_dir() / "static"))


@bp.before_request
def _check_api_origin():
    """Restricts API mutations to localhost/local-origin calls."""
    if request.path.startswith("/api/") and request.method not in ("GET", "HEAD", "OPTIONS"):
        origin = request.headers.get("Origin")
        sec_site = request.headers.get("Sec-Fetch-Site")
        if sec_site == "cross-site":
            return jsonify({"error": "cross-origin API requests are not allowed"}), 403

        if origin:
            import urllib.parse
            parsed = urllib.parse.urlparse(origin)
            if parsed.hostname not in ("127.0.0.1", "localhost"):
                return jsonify({"error": "cross-origin API requests are not allowed"}), 403


# ── Page Routes ────────────────────────────────────────────────────────────────

@bp.route("/")
def index():
    spa_index = _get_base_dir() / "static" / "spa" / "index.html"
    if spa_index.is_file():
        return send_file(str(spa_index))
    return "<h3>Agent-D Desktop SPA build not found. Please compile the React frontend.</h3>", 500


@bp.route("/assets/<path:filename>")
def spa_assets(filename):
    spa_asset_dir = _get_base_dir() / "static" / "spa" / "assets"
    if spa_asset_dir.is_dir():
        return send_from_directory(str(spa_asset_dir), filename)
    return jsonify({"error": "Asset not found"}), 404


# ── Core System APIs ───────────────────────────────────────────────────────────

@bp.route("/api/ping")
def ping():
    """Electron shell polls this endpoint to verify Flask is ready before launching the window."""
    return jsonify({"status": "ok", "app": "agent_d"})


def _get_app_version() -> str:
    try:
        import json
        vf = _get_base_dir() / "version.json"
        if vf.exists():
            return json.loads(vf.read_text(encoding="utf-8")).get("version", "0.1.0")
    except Exception:
        pass
    return "0.1.0"


@bp.route("/api/status")
def status():
    """Provides application health and statistics."""
    try:
        with db.get_db() as con:
            cur = con.execute("SELECT COUNT(*) FROM projects")
            project_count = cur.fetchone()[0]
            cur = con.execute("SELECT COUNT(*) FROM tasks")
            task_count = cur.fetchone()[0]
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

    return jsonify({
        "status": "healthy",
        "app": "PM Tool",
        "version": _get_app_version(),
        "counts": {
            "projects": project_count,
            "tasks": task_count,
        }
    })


# ── Patient Directory APIs (v1) ─────────────────────────────────────────────

@bp.route("/api/v1/patients", methods=["GET"])
def api_v1_list_patients():
    """List patients with optional search query and status filter."""
    query = request.args.get("query")
    status = request.args.get("status", "active")
    limit = int(request.args.get("limit", 100))
    patients = context_db.list_patients(query=query, status=status, limit=limit)
    return jsonify({"patients": patients, "total": len(patients)})


@bp.route("/api/v1/patients", methods=["POST"])
def api_v1_create_patient():
    """Create a new patient record with auto-generated alias and AES-256-GCM encryption."""
    data = request.get_json(force=True) or {}
    display_name = (data.get("display_name") or "").strip()
    if not display_name:
        return jsonify({"error": "Patient display name is required"}), 400
    try:
        patient = context_db.create_patient(
            display_name=display_name,
            date_of_birth=data.get("date_of_birth"),
            gender=data.get("gender"),
            blood_group=data.get("blood_group"),
            phone=data.get("phone"),
            email=data.get("email"),
            initial_summary=data.get("initial_summary"),
        )
        return jsonify({"patient": patient}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@bp.route("/api/v1/patients/<patient_id>", methods=["GET"])
def api_v1_get_patient(patient_id):
    """Retrieve decrypted patient record by UUID."""
    patient = context_db.get_patient(patient_id)
    if not patient:
        return jsonify({"error": "Patient not found"}), 404
    return jsonify({"patient": patient})


@bp.route("/api/v1/patients/by-alias/<alias>", methods=["GET"])
def api_v1_get_patient_by_alias(alias):
    """Retrieve patient record by LLM clinical alias (e.g. PT-1042)."""
    patient = context_db.get_patient_by_alias(alias)
    if not patient:
        return jsonify({"error": "Patient not found"}), 404
    return jsonify({"patient": patient})


@bp.route("/api/v1/patients/<patient_id>", methods=["PATCH"])
def api_v1_update_patient(patient_id):
    """Update patient demographic and contact fields."""
    data = request.get_json(force=True) or {}
    updated = context_db.update_patient(patient_id, data)
    if not updated:
        return jsonify({"error": "Patient not found"}), 404
    return jsonify({"patient": updated})


@bp.route("/api/v1/patients/<patient_id>", methods=["DELETE"])
def api_v1_delete_patient(patient_id):
    """Soft delete / archive patient."""
    success = context_db.archive_patient(patient_id)
    if not success:
        return jsonify({"error": "Patient not found"}), 404
    return jsonify({"success": True})


# ── Patient Context Artifact APIs (v1) ──────────────────────────────────────

@bp.route("/api/v1/patients/<patient_id>/artifact", methods=["GET"])
def api_v1_get_patient_artifact(patient_id):
    """Retrieve current doctor-curated structured context artifact."""
    artifact = context_db.get_patient_artifact(patient_id)
    if not artifact:
        return jsonify({"error": "Artifact not found for this patient"}), 404
    return jsonify({"artifact": artifact})


@bp.route("/api/v1/patients/<patient_id>/artifact", methods=["PATCH"])
def api_v1_update_patient_artifact(patient_id):
    """Update patient artifact and create an immutable version snapshot."""
    data = request.get_json(force=True) or {}
    author_type = data.pop("author_type", "doctor_manual")
    change_summary = data.pop("change_summary", "Updated by doctor")
    proposal_id = data.pop("proposal_id", None)

    updated = context_db.update_patient_artifact(
        patient_id=patient_id,
        data=data,
        author_type=author_type,
        change_summary=change_summary,
        proposal_id=proposal_id,
    )
    return jsonify({"artifact": updated})


@bp.route("/api/v1/patients/<patient_id>/artifact/versions", methods=["GET"])
def api_v1_get_patient_artifact_versions(patient_id):
    """List version history of patient artifact."""
    versions = context_db.get_patient_artifact_versions(patient_id)
    return jsonify({"versions": versions})


@bp.route("/api/v1/patients/<patient_id>/artifact/restore/<int:version_num>", methods=["POST"])
def api_v1_restore_patient_artifact(patient_id, version_num):
    """Restore a previous version snapshot of a patient artifact."""
    restored = context_db.restore_artifact_version(patient_id, version_num)
    if not restored:
        return jsonify({"error": f"Version {version_num} not found or could not be restored"}), 404
    return jsonify({"success": True, "artifact": restored, "restored_version": version_num})


@bp.route("/api/v1/patients/<patient_id>/artifact/diff", methods=["GET"])
def api_v1_get_patient_artifact_diff(patient_id):
    """
    Computes visual diff between two artifact versions.
    Query params:
      v1: source version number (e.g. 1)
      v2: target version number (e.g. 2, or omitted to compare against current)
    """
    v1_num = request.args.get("v1", type=int)
    v2_num = request.args.get("v2", type=int)

    current = context_db.get_patient_artifact(patient_id)
    if not current:
        return jsonify({"error": "Patient artifact not found"}), 404

    cur_v = current.get("current_version", 1)

    if v2_num is None:
        v2_num = cur_v
    if v1_num is None:
        v1_num = max(1, v2_num - 1)

    s1_row = context_db.get_artifact_version_snapshot(patient_id, v1_num)
    s2_row = context_db.get_artifact_version_snapshot(patient_id, v2_num)

    s1 = s1_row.get("artifact_snapshot", {}) if s1_row else {}
    s2 = s2_row.get("artifact_snapshot", {}) if s2_row else current

    diff = context_db.compute_artifact_diff(s1, s2)
    return jsonify({
        "v1": v1_num,
        "v2": v2_num,
        "diff": diff,
    })


# ── Medical Log Entries Endpoints (Milestone 2) ──────────────────────────────

@bp.route("/api/v1/patients/<patient_id>/logs", methods=["GET"])
def api_v1_list_patient_logs(patient_id):
    """List dated medical observations and clinical log entries."""
    entry_type = request.args.get("type")
    limit = request.args.get("limit", default=100, type=int)
    logs = context_db.list_log_entries(patient_id, entry_type=entry_type, limit=limit)
    return jsonify({"logs": logs, "count": len(logs)})


@bp.route("/api/v1/patients/<patient_id>/logs", methods=["POST"])
def api_v1_create_patient_log(patient_id):
    """Record a new dated clinical observation or medical note."""
    data = request.get_json(force=True) or {}
    content = (data.get("content") or "").strip()
    if not content:
        return jsonify({"error": "Log content is required"}), 400

    from datetime import date
    entry_date = data.get("entry_date") or date.today().isoformat()
    entry_type = data.get("entry_type") or "observation"
    metadata = data.get("metadata") or {}
    source = data.get("source") or "manual"
    visit_id = data.get("visit_id")

    entry = context_db.create_log_entry(
        patient_id=patient_id,
        entry_date=entry_date,
        entry_type=entry_type,
        content=content,
        metadata=metadata,
        source=source,
        visit_id=visit_id,
    )
    return jsonify({"log": entry}), 201


@bp.route("/api/v1/logs/<entry_id>", methods=["PATCH"])
def api_v1_update_patient_log(entry_id):
    """Amend a clinical log entry with immutable revision tracking."""
    data = request.get_json(force=True) or {}
    content = (data.get("content") or "").strip()
    if not content:
        return jsonify({"error": "Updated log content is required"}), 400

    edit_reason = data.get("edit_reason") or "Amended by physician"
    metadata = data.get("metadata")

    updated = context_db.update_log_entry(
        entry_id=entry_id,
        new_content=content,
        edit_reason=edit_reason,
        metadata=metadata,
    )
    if not updated:
        return jsonify({"error": "Log entry not found"}), 404
    return jsonify({"log": updated})


@bp.route("/api/v1/logs/<entry_id>", methods=["DELETE"])
def api_v1_delete_patient_log(entry_id):
    """Delete a clinical log entry."""
    ok = context_db.delete_log_entry(entry_id)
    if not ok:
        return jsonify({"error": "Log entry not found"}), 404
    return jsonify({"success": True, "id": entry_id})




# ── Multi-Key Gemini API Key Management (v1) ─────────────────────────────────

@bp.route("/api/v1/keys", methods=["GET"])
def api_v1_list_keys():
    """List configured Gemini API keys with usage stats, masked keys, and cooldown status."""
    keys = config_db.list_api_keys(include_raw=False)
    return jsonify({"keys": keys})


@bp.route("/api/v1/keys", methods=["POST"])
def api_v1_add_key():
    """Store and encrypt a new Gemini API key."""
    data = request.get_json(force=True) or {}
    key_label = (data.get("key_label") or "Gemini Key").strip()
    raw_key = (data.get("api_key") or "").strip()
    priority = int(data.get("priority", 1))
    if not raw_key:
        return jsonify({"error": "API key is required"}), 400
    try:
        new_key = config_db.add_api_key(key_label=key_label, raw_key=raw_key, priority=priority)
        return jsonify({"key": new_key}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@bp.route("/api/v1/keys/<key_id>", methods=["DELETE"])
def api_v1_delete_key(key_id):
    """Remove a configured Gemini API key."""
    success = config_db.delete_api_key(key_id)
    if not success:
        return jsonify({"error": "Key not found"}), 404
    return jsonify({"success": True})


# ── Clinical Tickets & Action Items (Milestone 4) ─────────────────────────────

@bp.route("/api/v1/tickets", methods=["GET", "POST"])
def api_v1_tickets():
    """List or create clinical tickets in context.db."""
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        title = (data.get("title") or "").strip()
        if not title:
            return jsonify({"error": "Ticket title is required"}), 400

        ticket = context_db.create_ticket(
            patient_id=data.get("patient_id"),
            title=title,
            description=data.get("description", ""),
            priority=data.get("priority", "medium"),
            status=data.get("status", "todo"),
            due_date=data.get("due_date"),
            due_time=data.get("due_time"),
            is_reminder=int(data.get("is_reminder", 0)),
            visit_id=data.get("visit_id"),
        )
        return jsonify({"ticket": ticket}), 201

    patient_id = request.args.get("patient_id")
    status = request.args.get("status")
    tickets_list = context_db.list_tickets(patient_id=patient_id, status=status)
    return jsonify({"tickets": tickets_list, "count": len(tickets_list)})


@bp.route("/api/v1/tickets/<ticket_id>", methods=["GET", "PATCH", "DELETE"])
def api_v1_ticket_detail(ticket_id):
    """Retrieve, update status/fields, or delete a clinical ticket."""
    if request.method == "DELETE":
        ok = context_db.delete_ticket(ticket_id)
        if not ok:
            return jsonify({"error": "Ticket not found"}), 404
        return jsonify({"status": "deleted", "id": ticket_id})

    if request.method == "PATCH":
        data = request.get_json(silent=True) or {}
        updated = context_db.update_ticket(ticket_id, data)
        if not updated:
            return jsonify({"error": "Ticket not found or no valid fields provided"}), 404
        return jsonify({"ticket": updated})

    ticket = context_db.get_ticket(ticket_id)
    if not ticket:
        return jsonify({"error": "Ticket not found"}), 404
    return jsonify({"ticket": ticket})


# ── Safety Gate & Proposal Queue (Milestone 4) ────────────────────────────────

@bp.route("/api/v1/proposals", methods=["GET", "POST"])
def api_v1_proposals():
    """List pending proposals or create a new assistant proposal."""
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        patient_id = data.get("patient_id")
        proposal_type = data.get("proposal_type")
        payload = data.get("payload") or {}
        rationale = data.get("rationale") or "Copilot recommendation"
        if not patient_id or not proposal_type:
            return jsonify({"error": "patient_id and proposal_type are required"}), 400

        prop = context_db.create_proposal(
            patient_id=patient_id,
            proposal_type=proposal_type,
            payload=payload,
            rationale=rationale,
            visit_id=data.get("visit_id"),
            diff=data.get("diff"),
        )
        return jsonify({"proposal": prop}), 201

    patient_id = request.args.get("patient_id")
    status = request.args.get("status", "pending")
    proposals_list = context_db.list_proposals(patient_id=patient_id, status=status)
    return jsonify({"proposals": proposals_list, "count": len(proposals_list)})


@bp.route("/api/v1/proposals/<proposal_id>", methods=["GET"])
def api_v1_proposal_detail(proposal_id):
    """Retrieve detailed proposal object."""
    prop = context_db.get_proposal(proposal_id)
    if not prop:
        return jsonify({"error": "Proposal not found"}), 404
    return jsonify({"proposal": prop})


@bp.route("/api/v1/proposals/<proposal_id>/accept", methods=["POST"])
def api_v1_proposal_accept(proposal_id):
    """
    Doctor Approval Action:
    Commits proposed updates to live clinical records (artifacts, logs, tickets)
    and records audit event.
    """
    try:
        result = context_db.accept_proposal(proposal_id)
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@bp.route("/api/v1/proposals/<proposal_id>/reject", methods=["POST"])
def api_v1_proposal_reject(proposal_id):
    """Doctor Rejection Action: Marks proposal rejected without modifying clinical records."""
    data = request.get_json(silent=True) or {}
    reason = data.get("reason")
    try:
        result = context_db.reject_proposal(proposal_id, reason=reason)
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 400



# ── Rich Project Management APIs ──────────────────────────────────────────────

@bp.route("/api/projects", methods=["GET", "POST"])
def projects():
    if request.method == "POST":
        data = request.get_json(force=True) or {}
        name = (data.get("name") or "").strip()
        if not name:
            return jsonify({"error": "Project name is required"}), 400

        proj = db.create_project(
            name=name,
            description=data.get("description", ""),
            domain=data.get("domain", "Platform"),
            priority=data.get("priority", "medium"),
            health=data.get("health", "planning"),
            owner=data.get("owner", ""),
            target_date=data.get("target_date", ""),
            goals=data.get("goals", ""),
            tech_stack=data.get("tech_stack", ""),
        )

        initial_tasks = data.get("initial_tasks")
        if not initial_tasks and data.get("seed_tasks", False):
            initial_tasks = [
                ("Define Problem Statement & Target Personas", "high"),
                ("Author Initial PRD Document", "critical"),
                ("Architecture & Technical Specification Review", "high"),
                ("Instrumentation & North Star Metrics Setup", "medium"),
                ("Implementation Sprints & Core Integration", "medium"),
                ("Security & Compliance Audit", "high"),
                ("Beta Testing & User Feedback Review", "medium"),
            ]

        if initial_tasks:
            for item in initial_tasks:
                if isinstance(item, (tuple, list)):
                    title, prio = item[0], item[1]
                else:
                    title, prio = str(item), "medium"
                db.create_task(project_id=proj["id"], title=title, priority=prio)

        return jsonify(proj), 201

    search = request.args.get("search") or request.args.get("q")
    status = request.args.get("status")
    health = request.args.get("health")
    domain = request.args.get("domain")

    rows = db.get_projects(search=search, status=status, health=health, domain=domain)
    return jsonify({"projects": rows, "count": len(rows)})


@bp.route("/api/projects/<int:project_id>", methods=["GET", "PATCH", "DELETE"])
def project_detail(project_id: int):
    if request.method == "GET":
        proj = db.get_project(project_id)
        if not proj:
            return jsonify({"error": "Project not found"}), 404
        tasks = db.get_project_tasks(project_id)
        return jsonify({"project": proj, "tasks": tasks})

    elif request.method == "PATCH":
        data = request.get_json(force=True) or {}
        proj = db.update_project(project_id, **data)
        if not proj:
            return jsonify({"error": "Project not found"}), 404
        return jsonify(proj)

    elif request.method == "DELETE":
        ok = db.delete_project(project_id)
        if not ok:
            return jsonify({"error": "Project not found"}), 404
        return jsonify({"status": "deleted", "id": project_id})


@bp.route("/api/projects/<int:project_id>/tasks", methods=["GET", "POST"])
def project_tasks(project_id: int):
    proj = db.get_project(project_id)
    if not proj:
        return jsonify({"error": "Project not found"}), 404

    if request.method == "POST":
        data = request.get_json(force=True) or {}
        title = (data.get("title") or "").strip()
        if not title:
            return jsonify({"error": "Task title is required"}), 400

        task = db.create_task(
            project_id=project_id,
            title=title,
            description=data.get("description", ""),
            status=data.get("status", "todo"),
            priority=data.get("priority", "medium"),
            due_date=data.get("due_date", ""),
        )
        return jsonify(task), 201

    tasks = db.get_project_tasks(project_id)
    return jsonify({"tasks": tasks, "count": len(tasks)})


@bp.route("/api/tasks", methods=["GET", "POST"])
def tasks():
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        title = (data.get("title") or "").strip()
        if not title:
            return jsonify({"error": "Task title is required"}), 400

        ticket = context_db.create_ticket(
            patient_id=data.get("patient_id"),
            title=title,
            description=data.get("description", ""),
            priority=data.get("priority", "medium"),
            status=data.get("status", "todo"),
            due_date=data.get("due_date"),
        )
        return jsonify(ticket), 201

    patient_id = request.args.get("patient_id")
    status = request.args.get("status")
    ticket_list = context_db.list_tickets(patient_id=patient_id, status=status)
    return jsonify({"tasks": ticket_list, "count": len(ticket_list)})


@bp.route("/api/tasks/metrics", methods=["GET"])
def task_metrics():
    all_tickets = context_db.list_tickets()
    todo_cnt = sum(1 for t in all_tickets if t["status"] in ("todo", "open"))
    in_progress_cnt = sum(1 for t in all_tickets if t["status"] == "in_progress")
    review_cnt = sum(1 for t in all_tickets if t["status"] in ("review", "under_review"))
    done_cnt = sum(1 for t in all_tickets if t["status"] == "done")
    return jsonify({
        "total": len(all_tickets),
        "todo": todo_cnt,
        "in_progress": in_progress_cnt,
        "review": review_cnt,
        "done": done_cnt,
    })
    metrics = db.get_sprint_metrics(project_id)
    return jsonify(metrics)





@bp.route("/api/tools/execute_action", methods=["POST"])
def api_execute_action():
    """
    Execute an AI-proposed interactive action (e.g. create_ticket / create_task).
    Applies authorization policy and creates the ticket directly on the Sprint Board.
    """
    data = request.get_json(silent=True) or {}
    action_name = str(data.get("action") or data.get("action_name") or "").strip().lower()
    params = data.get("params") or {}
    conv_id = data.get("conversation_id")

    policy = db.get_ai_ticket_policy()
    if not policy.get("creation_allowed", True):
        return jsonify({
            "error": "Ticket creation is currently disabled by organization policy in Settings.",
            "policy": policy,
        }), 403

    if action_name in ("create_ticket", "createticket", "create_task", "createtask"):
        title = str(params.get("title") or params.get("subject") or "").strip()
        if not title:
            return jsonify({"error": "Ticket title is required."}), 400

        project_id = params.get("project_id")
        projs = db.get_projects()
        if not projs:
            p = db.create_project(name="Default Workspace", description="Default project workspace")
            project_id = p["id"]
        elif not project_id:
            project_id = projs[0]["id"]
        else:
            try:
                pid = int(project_id)
                if not any(p["id"] == pid for p in projs):
                    project_id = projs[0]["id"]
                else:
                    project_id = pid
            except (ValueError, TypeError):
                project_id = projs[0]["id"]

        description = str(params.get("description") or "").strip()
        priority = str(params.get("priority") or "med").lower().strip()
        if priority not in ("urgent", "high", "med", "low"):
            priority = "med"
        status = str(params.get("status") or "todo").lower().strip()
        if status not in ("todo", "in_progress", "blocked", "done"):
            status = "todo"

        story_points = int(params.get("story_points") or 0)
        acceptance_criteria = str(params.get("acceptance_criteria") or "").strip()
        assignee = str(params.get("assignee") or "").strip()
        ticket_type = str(params.get("ticket_type") or "internal").lower().strip()
        if ticket_type not in ("internal", "external"):
            ticket_type = "internal"

        action_key = str(data.get("action_key") or params.get("action_key") or "").strip()
        if not action_key:
            action_key = f"{conv_id or 'global'}:{action_name}:{title.strip().lower()}"

        task = db.create_task(
            project_id=int(project_id),
            title=title,
            description=description,
            status=status,
            priority=priority,
            story_points=story_points,
            acceptance_criteria=acceptance_criteria,
            assignee=assignee,
            ticket_type=ticket_type,
        )

        # Record action execution in ai_context.db for persistent state across tab switches
        try:
            ai_db.record_applied_action(
                action_key=action_key,
                conversation_id=conv_id or "global",
                action_name=action_name,
                title=title,
                entity_id=task.get("id"),
            )
        except Exception as e:
            print("[Applied action persistence warning]", e)

        if conv_id:
            try:
                ai_db.add_message(
                    conversation_id=conv_id,
                    role="assistant",
                    content=f"⚡ Ticket **{title}** [#{task['id']} · {ticket_type.upper()}] successfully added to the Kanban Sprint Board!",
                    model_info="Action Executor",
                )
            except Exception:
                pass

        return jsonify({
            "success": True,
            "action": action_name,
            "action_key": action_key,
            "task": task,
            "message": f"Ticket #{task['id']} '{title}' successfully added to Sprint Board!",
        })

    return jsonify({"error": f"Unsupported action '{action_name}'."}), 400


@bp.route("/api/tools/applied_actions", methods=["GET"])
def api_applied_actions():
    """Retrieve all applied interactive actions for persistent state across views."""
    conv_id = request.args.get("conversation_id")
    actions = ai_db.get_applied_actions(conv_id)
    return jsonify({
        "applied_actions": actions,
        "applied_action_keys": [a["action_key"] for a in actions],
    })


@bp.route("/api/tasks/<task_id>", methods=["PATCH", "DELETE"])
def task_detail(task_id: str):
    if request.method == "PATCH":
        data = request.get_json(silent=True) or {}
        updated = context_db.update_ticket(str(task_id), data)
        if updated:
            return jsonify(updated)
        try:
            int_id = int(task_id)
            updated = db.update_task(int_id, **data)
            if updated:
                return jsonify(updated)
        except Exception:
            pass
        return jsonify({"error": "Task not found"}), 404

    elif request.method == "DELETE":
        ok = context_db.delete_ticket(str(task_id))
        if ok:
            return jsonify({"status": "deleted", "id": task_id})
        try:
            int_id = int(task_id)
            ok = db.delete_task(int_id)
            if ok:
                return jsonify({"status": "deleted", "id": task_id})
        except Exception:
            pass
        return jsonify({"error": "Task not found"}), 404


# ── LLM / AI Provider Settings ────────────────────────────────────────────────

@bp.route("/api/llm/status", methods=["GET"])
def api_llm_status():
    """
    Return full LLM provider status:
    - active_provider (ollama | api | none)
    - active_model
    - ollama { available, models, selected_model, warning }
    - api_configured, api_key_display, api_base
    - setup_required
    """
    return jsonify(llm_gateway.get_llm_status(db))


@bp.route("/api/llm/config", methods=["POST"])
def api_llm_save_config():
    """
    Save LLM provider preferences. API keys are encrypted before storage.

    Body (JSON):
      provider    string  — "ollama" | "api" | "auto"
      api_key     string  — plain-text API key (encrypted on save)
      api_base    string  — optional custom base URL for OpenAI-compatible endpoints
      model_name  string  — model identifier override
    """
    data = request.get_json(silent=True) or {}
    provider   = data.get("provider")
    api_key    = data.get("api_key")
    api_base   = data.get("api_base")
    model_name = data.get("model_name") or data.get("model")
    chat_max_tokens = data.get("chat_max_tokens")
    file_gen_max_tokens = data.get("file_gen_max_tokens")
    plan_max_tokens = data.get("plan_max_tokens")
    tool_call_max_tokens = data.get("tool_call_max_tokens")

    if not provider and not any([chat_max_tokens, file_gen_max_tokens, plan_max_tokens, tool_call_max_tokens]):
        return jsonify({"error": "provider or token limits are required"}), 400

    updated = llm_gateway.save_llm_config(
        db_module=db,
        provider=provider,
        api_key=api_key,
        api_base=api_base,
        model_name=model_name,
        chat_max_tokens=chat_max_tokens,
        file_gen_max_tokens=file_gen_max_tokens,
        plan_max_tokens=plan_max_tokens,
        tool_call_max_tokens=tool_call_max_tokens,
    )
    return jsonify(updated)


@bp.route("/api/llm/ollama/probe", methods=["GET"])
def api_llm_ollama_probe():
    """
    Live probe of the local Ollama server.
    Returns available models and selected default.
    Safe to call repeatedly from the UI settings panel.
    """
    result = llm_gateway.detect_ollama(timeout=2.0)
    return jsonify(result)


@bp.route("/api/llm/ollama/models", methods=["GET"])
def api_llm_ollama_models():
    """Return just the list of installed Ollama model names."""
    result = llm_gateway.detect_ollama(timeout=2.0)
    return jsonify({
        "available": result["available"],
        "models": result["models"],
        "warning": result.get("warning"),
    })


@bp.route("/api/llm/gemini/models", methods=["POST"])
def api_llm_gemini_models():
    """
    Discover available Gemini models for a given API key.
    Body: { "api_key": "AIzaSy..." }
    Returns sorted model list (Flash-Lite → Flash → Pro priority).
    """
    data = request.get_json(silent=True) or {}
    api_key = (data.get("api_key") or "").strip()

    # Fall back to stored encrypted key if none provided
    if not api_key:
        raw = db.get_ai_config("api_key")
        if raw:
            api_key = llm_gateway.decrypt_secret(raw)

    if not api_key:
        return jsonify({"error": "api_key is required"}), 400

    models = llm_gateway.get_available_gemini_models(api_key)
    return jsonify({"models": models, "count": len(models)})


@bp.route("/api/llm/custom/probe", methods=["POST"])
def api_llm_custom_probe():
    """
    Probe an OpenAI-compatible custom endpoint (LM Studio, LocalAI, OpenRouter, etc.).
    Body: { "url": "http://localhost:1234/v1" }
    """
    import urllib.request
    import urllib.parse
    import json as _json

    data = request.get_json(silent=True) or {}
    endpoint = (data.get("url") or "http://localhost:1234/v1").rstrip("/")
    probe_target = f"{endpoint}/models" if not endpoint.endswith("/models") else endpoint

    # 1. SSRF Guard: Validate URL scheme strictly to HTTP/HTTPS
    try:
        parsed = urllib.parse.urlparse(probe_target)
        if parsed.scheme not in ("http", "https"):
            return jsonify({"error": "Only HTTP and HTTPS protocols are supported."}), 400
        
        host = (parsed.hostname or "").lower()
        if host in ("169.254.169.254", "metadata.google.internal", "instance-data"):
            return jsonify({"error": "Prohibited target host."}), 403
    except Exception:
        return jsonify({"error": "Malformed URL endpoint."}), 400

    try:
        req = urllib.request.Request(probe_target, headers={"User-Agent": "PM-Tool"})
        with urllib.request.urlopen(req, timeout=2.5) as resp:
            body = _json.loads(resp.read().decode("utf-8"))
            models = []
            if "data" in body and isinstance(body["data"], list):
                models = [
                    m.get("id") or m.get("name")
                    for m in body["data"]
                    if isinstance(m, dict)
                ]
            return jsonify({
                "online": True,
                "status": "connected",
                "models": models,
                "message": f"Connected! Found {len(models)} model(s).",
            })
    except Exception:
        return jsonify({
            "online": False,
            "status": "unreachable",
            "models": [],
            "message": f"Endpoint unreachable at {probe_target}. Ensure your local model server is running.",
        })


@bp.route("/api/settings/ai-policies", methods=["GET", "POST"])
def api_ai_policies():
    """Manage AI Ticket Access and Action Execution Policies."""
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        access_scope = data.get("access_scope", "all")
        creation_allowed = data.get("creation_allowed", True)
        updated = db.set_ai_ticket_policy(access_scope=access_scope, creation_allowed=creation_allowed)
        return jsonify(updated)
    return jsonify(db.get_ai_ticket_policy())


@bp.route("/api/workspace/context", methods=["GET"])
def api_workspace_context():
    """Retrieve structured live workspace context with AI ticket policies applied."""
    project_id = request.args.get("project_id", type=int)
    user_query = request.args.get("q")
    ctx = workspace_context.get_workspace_context(project_id=project_id, user_query=user_query)
    return jsonify(ctx)


# ── Practice Dashboard & Scheduling APIs ──────────────────────────────────────

@bp.route("/api/v1/dashboard/stats", methods=["GET"])
def api_v1_dashboard_stats():
    """Returns aggregated real-time practice stats for HomeView and clinical context."""
    stats = context_db.get_practice_summary_stats()
    return jsonify(stats)


@bp.route("/api/v1/appointments", methods=["GET", "POST"])
def api_v1_appointments():
    """Lists appointments for a date/patient or schedules a new one."""
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        patient_id = data.get("patient_id")
        scheduled_time = data.get("scheduled_time")
        if not patient_id or not scheduled_time:
            return jsonify({"error": "patient_id and scheduled_time are required"}), 400

        appt = context_db.create_appointment(
            patient_id=patient_id,
            scheduled_time=scheduled_time,
            duration_minutes=int(data.get("duration_minutes", 15)),
            appointment_type=data.get("appointment_type", "follow_up"),
            reason=data.get("reason", ""),
        )
        return jsonify({"appointment": appt}), 201

    date_str = request.args.get("date")
    patient_id = request.args.get("patient_id")
    appts = context_db.list_appointments(date_str=date_str, patient_id=patient_id)
    return jsonify({"appointments": appts})


@bp.route("/api/v1/appointments/<appointment_id>", methods=["PATCH", "DELETE"])
def api_v1_appointment_detail(appointment_id):
    if request.method == "DELETE":
        ok = context_db.delete_appointment(appointment_id)
        if not ok:
            return jsonify({"error": "Appointment not found"}), 404
        return jsonify({"status": "deleted", "id": appointment_id})

    data = request.get_json(silent=True) or {}
    updated = context_db.update_appointment(appointment_id, data)
    if not updated:
        return jsonify({"error": "Appointment not found or no valid fields provided"}), 404
    return jsonify({"appointment": updated})


# ── Clinical Copilot Chat Sessions & SSE Streaming ────────────────────────────

@bp.route("/api/v1/chat/sessions", methods=["GET", "POST"])
def api_v1_chat_sessions():
    """Lists or creates clinical consultation sessions in context.db."""
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        title = (data.get("title") or "Clinical Consultation").strip()
        patient_id = data.get("patient_id")
        session = context_db.create_chat_session(title=title, patient_id=patient_id)
        return jsonify({"session": session}), 201

    patient_id = request.args.get("patient_id")
    sessions = context_db.list_chat_sessions(patient_id=patient_id)
    return jsonify({"sessions": sessions})


@bp.route("/api/v1/chat/sessions/<session_id>", methods=["GET", "DELETE"])
def api_v1_chat_session_detail(session_id):
    """Retrieves chronological session history or deletes a session."""
    if request.method == "DELETE":
        ok = context_db.delete_chat_session(session_id)
        if not ok:
            return jsonify({"error": "Session not found"}), 404
        return jsonify({"status": "deleted", "id": session_id})

    session = context_db.get_chat_session(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404
    return jsonify({
        "session": session,
        "messages": session.get("messages", []),
    })


@bp.route("/api/v1/chat/stream", methods=["POST"])
def api_v1_chat_stream():
    """
    Real-time SSE streaming clinical copilot chat endpoint.
    Streams tokens with live practice/patient temporal awareness.
    """
    data = request.get_json(silent=True) or {}
    message = str(data.get("message", "")).strip()
    session_id = data.get("session_id")
    patient_id = data.get("patient_id")

    if not message:
        return jsonify({"error": "Message cannot be empty."}), 400

    def event_stream():
        for chunk in clinical_chat.stream_clinical_chat(
            message=message,
            session_id=session_id,
            patient_id=patient_id,
        ):
            yield chunk

    return Response(
        stream_with_context(event_stream()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@bp.route("/api/v1/chat", methods=["POST"])
def api_v1_chat_sync():
    """Synchronous clinical chat endpoint."""
    data = request.get_json(silent=True) or {}
    message = str(data.get("message", "")).strip()
    session_id = data.get("session_id")
    patient_id = data.get("patient_id")

    if not message:
        return jsonify({"error": "Message cannot be empty."}), 400

    result = clinical_chat.generate_clinical_chat_sync(
        message=message,
        session_id=session_id,
        patient_id=patient_id,
    )
    if "error" in result:
        return jsonify({"error": result["error"]}), 400
    return jsonify(result)


# ── Legacy Chat Route Compatibility (context.db backed) ───────────────────────

@bp.route("/api/conversations", methods=["GET", "POST"])
def api_conversations():
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        title = (data.get("title") or "Clinical Consultation").strip()
        patient_id = data.get("patient_id")
        session = context_db.create_chat_session(title=title, patient_id=patient_id)
        return jsonify({"conversation": session, **session}), 201

    patient_id = request.args.get("patient_id")
    sessions = context_db.list_chat_sessions(patient_id=patient_id)
    return jsonify({"conversations": sessions})


@bp.route("/api/conversations/<conv_id>", methods=["GET", "PATCH", "DELETE"])
def api_conversation_detail(conv_id):
    if request.method == "DELETE":
        ok = context_db.delete_chat_session(conv_id)
        if not ok:
            return jsonify({"error": "Conversation not found"}), 404
        return jsonify({"status": "deleted", "id": conv_id})

    session = context_db.get_chat_session(conv_id)
    if not session:
        return jsonify({"error": "Conversation not found"}), 404
    return jsonify({
        "conversation": session,
        "messages": session.get("messages", []),
        "applied_action_keys": [],
    })


@bp.route("/api/chat", methods=["POST"])
def api_chat():
    """Legacy chat endpoint redirected to Agent-D Clinical Copilot."""
    data = request.get_json(silent=True) or {}
    message = str(data.get("message", "")).strip()
    conv_id = data.get("conversation_id")
    patient_id = data.get("patient_id")

    if not message:
        return jsonify({"error": "Message cannot be empty."}), 400

    result = clinical_chat.generate_clinical_chat_sync(
        message=message,
        session_id=conv_id,
        patient_id=patient_id,
    )
    if "error" in result:
        return jsonify({"error": result["error"]}), 400

    return jsonify({
        "response": result.get("response", ""),
        "provider": "gemini",
        "model": result.get("model", "clinical-copilot"),
        "conversation_id": result.get("session_id", conv_id),
        "conversation_title": "Clinical Consultation",
        "sources": [],
    })

# ── Knowledge Base & Local Documents APIs ─────────────────────────────────────

@bp.route("/api/documents", methods=["GET"])
def api_documents():
    project_id = request.args.get("project_id", type=int)
    file_type = request.args.get("file_type")
    docs = db.list_documents(project_id=project_id, file_type=file_type)
    total_chunks = ai_db.get_total_chunks_count()
    return jsonify({
        "documents": docs,
        "count": len(docs),
        "total_chunks": total_chunks,
    })


@bp.route("/api/documents/scan", methods=["POST"])
def api_documents_scan():
    data = request.get_json(force=True) or {}
    folder_path = (data.get("folder_path") or "").strip()
    project_id = data.get("project_id")
    recursive = bool(data.get("recursive", True))

    if not folder_path:
        return jsonify({"error": "Folder path is required."}), 400

    from rag import engine as rag_engine
    result = rag_engine.scan_and_ingest_directory(
        dir_path=folder_path,
        project_id=project_id,
        recursive=recursive,
    )
    if "error" in result:
        return jsonify(result), 400
    return jsonify(result), 200


@bp.route("/api/documents/folders", methods=["GET", "POST"])
def api_doc_folders():
    if request.method == "POST":
        data = request.get_json(force=True) or {}
        folder_path = (data.get("folder_path") or "").strip()
        label = (data.get("label") or "").strip()
        project_id = data.get("project_id")
        recursive = bool(data.get("recursive", True))

        if not folder_path:
            return jsonify({"error": "Folder path is required."}), 400

        entry = db.add_doc_folder(
            folder_path=folder_path,
            project_id=project_id,
            label=label,
            recursive=recursive,
        )
        return jsonify(entry), 201

    folders = db.list_doc_folders()
    return jsonify({"folders": folders})


@bp.route("/api/documents/folders/<int:folder_id>", methods=["DELETE"])
def api_delete_doc_folder(folder_id: int):
    ok = db.delete_doc_folder(folder_id)
    if not ok:
        return jsonify({"error": "Folder not found"}), 404
    return jsonify({"status": "deleted", "id": folder_id})


@bp.route("/api/documents/<int:doc_id>", methods=["DELETE"])
def api_delete_document(doc_id: int):
    doc = db.get_document(doc_id)
    if not doc:
        return jsonify({"error": "Document not found"}), 404

    db.delete_document(doc_id)
    ai_db.delete_document_chunks(doc_id)
    return jsonify({"status": "deleted", "id": doc_id})


@bp.route("/api/documents/<int:doc_id>/chunks", methods=["GET"])
def api_document_chunks(doc_id: int):
    doc = db.get_document(doc_id)
    if not doc:
        return jsonify({"error": "Document not found"}), 404
    chunks = ai_db.get_chunks_for_document(doc_id)
    return jsonify({"document": doc, "chunks": chunks, "count": len(chunks)})


@bp.route("/api/documents/query", methods=["POST"])
def api_documents_query():
    data = request.get_json(force=True) or {}
    query = (data.get("query") or "").strip()
    project_id = data.get("project_id")
    top_k = int(data.get("top_k", 5))

    if not query:
        return jsonify({"error": "Query cannot be empty"}), 400

    from rag import engine as rag_engine
    chunks = rag_engine.retrieve_context(query=query, project_id=project_id, top_k=top_k)
    return jsonify({"query": query, "chunks": chunks, "count": len(chunks)})


@bp.route("/api/documents/upload", methods=["POST"])
def api_documents_upload():
    if "file" not in request.files:
        return jsonify({"error": "No file attached."}), 400
    f = request.files["file"]
    if not f or not f.filename:
        return jsonify({"error": "No selected file."}), 400

    from pathlib import Path
    import werkzeug.utils

    safe_filename = werkzeug.utils.secure_filename(f.filename)
    if not safe_filename:
        safe_filename = "document"

    upload_dir = db._user_data_dir() / "documents"
    upload_dir.mkdir(parents=True, exist_ok=True)
    target_path = (upload_dir / safe_filename).resolve()

    # 1. Path traversal guard
    if not str(target_path).startswith(str(upload_dir.resolve())):
        return jsonify({"error": "Path traversal detected."}), 400

    # 2. Strict file extension whitelist BEFORE writing to disk
    ALLOWED_EXTENSIONS = {".md", ".markdown", ".txt", ".text", ".pdf", ".docx", ".csv", ".json"}
    suffix = target_path.suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        allowed_list = ", ".join(sorted(ALLOWED_EXTENSIONS))
        return jsonify({"error": f"File type '{suffix}' is not permitted. Supported formats: {allowed_list}"}), 400

    counter = 1
    stem = target_path.stem
    while target_path.exists():
        target_path = upload_dir / f"{stem}_{counter}{suffix}"
        counter += 1

    f.save(str(target_path))

    project_id = request.form.get("project_id", type=int)
    from rag import engine as rag_engine
    result = rag_engine.ingest_single_file(str(target_path), project_id=project_id)
    if "error" in result:
        return jsonify(result), 400

    return jsonify(result), 201


@bp.route("/api/documents/summarize", methods=["POST"])
def api_documents_summarize():
    """
    Deterministic Document Summarization API:
    Receives { doc_id? or file_path, output_path, focus?, project_id? },
    summarizes the document, saves to output_path as Markdown, logs in tool_runs,
    and returns metadata and summary preview.
    """
    data = request.get_json(force=True) or {}
    file_path = (data.get("file_path") or "").strip()
    doc_id = data.get("doc_id")
    output_path = (data.get("output_path") or "").strip()
    focus = (data.get("focus") or "").strip()
    project_id = data.get("project_id")

    if not file_path and doc_id:
        doc = db.get_document(int(doc_id))
        if doc and doc.get("file_path"):
            file_path = doc["file_path"]
            if not project_id:
                project_id = doc.get("project_id")

    if not file_path:
        return jsonify({"error": "Either file_path or valid doc_id must be provided."}), 400

    from tools.summarizer import summarize_document
    summarizer_kwargs = {}
    raw_max_tokens = data.get("max_tokens")
    if raw_max_tokens is not None:
        try:
            summarizer_kwargs["max_tokens"] = int(raw_max_tokens)
        except (ValueError, TypeError):
            pass

    result = summarize_document(
        file_path=file_path,
        output_path=output_path,
        focus=focus,
        project_id=project_id,
        **summarizer_kwargs
    )

    if not result.get("success"):
        return jsonify(result), 400

    return jsonify(result), 200


@bp.route("/api/export/docx", methods=["POST"])
def api_export_docx():
    data = request.get_json(force=True) or {}
    title = (data.get("title") or "Product Requirement Document").strip()
    content = data.get("content") or ""
    metadata = data.get("metadata") or {}

    from tools.document_generator import generate_docx_from_markdown
    buf = generate_docx_from_markdown(title=title, markdown_content=content, metadata=metadata)

    safe_name = "".join(c for c in title if c.isalnum() or c in (" ", "_", "-")).rstrip() or "Document"
    return send_file(
        buf,
        as_attachment=True,
        download_name=f"{safe_name}.docx",
        mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )


@bp.route("/api/export/markdown", methods=["POST"])
def api_export_markdown():
    from io import BytesIO
    data = request.get_json(force=True) or {}
    title = (data.get("title") or "Product Requirement Document").strip()
    content = data.get("content") or ""

    buf = BytesIO(content.encode("utf-8"))
    safe_name = "".join(c for c in title if c.isalnum() or c in (" ", "_", "-")).rstrip() or "Document"
    return send_file(
        buf,
        as_attachment=True,
        download_name=f"{safe_name}.md",
        mimetype="text/markdown"
    )


# ── Data Studio & Dashboards APIs ──────────────────────────────────────────────

@bp.route("/api/data/sources", methods=["GET"])
def api_data_sources_list():
    project_id = request.args.get("project_id", type=int)
    raw_sources = db.list_data_sources(project_id=project_id)
    sources = []
    for s in raw_sources:
        d = dict(s)
        d["file_type"] = d.get("source_type") or "tabular"
        d["columns_json"] = d.get("schema_json") or "[]"
        sources.append(d)
    return jsonify({
        "sources": sources,
        "data_sources": sources,
        "count": len(sources),
    })


@bp.route("/api/data/sources/upload", methods=["POST"])
def api_data_sources_upload():
    if "file" not in request.files:
        return jsonify({"error": "No file attached.", "success": False}), 400
    f = request.files["file"]
    if not f or not f.filename:
        return jsonify({"error": "No file selected.", "success": False}), 400

    from pathlib import Path
    import werkzeug.utils
    import data_engine

    safe_filename = werkzeug.utils.secure_filename(f.filename)
    if not safe_filename:
        safe_filename = "dataset"

    suffix = Path(safe_filename).suffix.lower()
    if suffix not in data_engine.ALLOWED_DATASET_EXTENSIONS:
        allowed_list = ", ".join(sorted(data_engine.ALLOWED_DATASET_EXTENSIONS))
        return jsonify({"error": f"File type '{suffix}' not supported. Allowed: {allowed_list}", "success": False}), 400

    upload_dir = data_engine._get_datasets_dir()
    target_path = (upload_dir / safe_filename).resolve()

    if not str(target_path).startswith(str(upload_dir.resolve())):
        return jsonify({"error": "Path traversal detected.", "success": False}), 400

    counter = 1
    stem = target_path.stem
    while target_path.exists():
        target_path = upload_dir / f"{stem}_{counter}{suffix}"
        counter += 1

    f.save(str(target_path))

    name = (request.form.get("name") or stem).strip()
    project_id = request.form.get("project_id", type=int)

    try:
        source_record = data_engine.ingest_data_source(
            file_path=str(target_path),
            name=name,
            project_id=project_id,
        )
        rec = dict(source_record)
        rec["file_type"] = rec.get("source_type") or "tabular"
        rec["columns_json"] = rec.get("schema_json") or "[]"
        return jsonify({
            "success": True,
            "data_source": rec,
            **rec,
        }), 201
    except Exception as e:
        if target_path.exists():
            try:
                target_path.unlink()
            except Exception:
                pass
        return jsonify({"error": f"Ingestion failed: {str(e)}", "success": False}), 400


@bp.route("/api/data/sources/<int:source_id>", methods=["GET", "DELETE"])
def api_data_source_detail(source_id: int):
    if request.method == "GET":
        source = db.get_data_source(source_id)
        if not source:
            return jsonify({"error": "Data source not found"}), 404
        return jsonify(source)
    elif request.method == "DELETE":
        source = db.get_data_source(source_id)
        if not source:
            return jsonify({"error": "Data source not found"}), 404

        table_name = source.get("table_name")
        import data_engine
        try:
            with data_engine.get_analytics_db() as con:
                con.execute(f'DROP TABLE IF EXISTS "{table_name}"')
                con.commit()
        except Exception:
            pass

        file_path = source.get("file_path")
        if file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception:
                pass

        db.delete_data_source(source_id)
        return jsonify({"status": "deleted", "id": source_id})


@bp.route("/api/data/sources/<int:source_id>/preview", methods=["GET"])
def api_data_source_preview(source_id: int):
    import data_engine
    limit = min(request.args.get("limit", default=100, type=int), 100)
    source = db.get_data_source(source_id)
    if not source:
        return jsonify({"error": "Data source not found"}), 404

    table_name = source["table_name"]
    res = data_engine.execute_safe_query(source_id, f'SELECT * FROM "{table_name}" LIMIT {limit}', max_rows=limit)
    if "error" in res:
        return jsonify(res), 400
    cols = [c for c in res["columns"] if c != "_row_id"]
    return jsonify({
        "columns": cols,
        "rows": res["rows"],
        "row_count": len(res["rows"]),
        "total_rows": source["row_count"],
    })


@bp.route("/api/data/query", methods=["POST"])
def api_data_query():
    import data_engine
    data = request.get_json(force=True) or {}
    source_id = data.get("data_source_id")
    sql_query = data.get("query", "").strip()
    max_rows = min(int(data.get("max_rows", 100)), 200)

    if not source_id or not sql_query:
        return jsonify({"error": "data_source_id and query are required."}), 400

    res = data_engine.execute_safe_query(int(source_id), sql_query, max_rows=max_rows)
    if "error" in res:
        return jsonify(res), 400
    return jsonify(res)


# ── Dashboards API ─────────────────────────────────────────────────────────────

@bp.route("/api/dashboards", methods=["GET", "POST"])
def api_dashboards():
    if request.method == "POST":
        data = request.get_json(force=True) or {}
        title = (data.get("title") or "").strip()
        if not title:
            return jsonify({"error": "Dashboard title is required"}), 400
        dash = db.create_dashboard(
            title=title,
            description=data.get("description", ""),
            data_source_id=data.get("data_source_id"),
            project_id=data.get("project_id"),
        )
        return jsonify(dash), 201

    project_id = request.args.get("project_id", type=int)
    dashboards = db.list_dashboards(project_id=project_id)
    return jsonify({"dashboards": dashboards, "count": len(dashboards)})


@bp.route("/api/dashboards/<int:dash_id>", methods=["GET", "PATCH", "DELETE"])
def api_dashboard_detail(dash_id: int):
    if request.method == "GET":
        dash = db.get_dashboard(dash_id)
        if not dash:
            return jsonify({"error": "Dashboard not found"}), 404

        raw_widgets = db.list_dashboard_widgets(dash_id)
        import data_engine
        evaluated_widgets = []
        for w in raw_widgets:
            computed = data_engine.compute_widget_data(w["id"])
            merged = {**w, **computed}
            evaluated_widgets.append(merged)

        return jsonify({"dashboard": dash, "widgets": evaluated_widgets})

    elif request.method == "PATCH":
        data = request.get_json(force=True) or {}
        updated = db.update_dashboard(dash_id, **data)
        if not updated:
            return jsonify({"error": "Dashboard not found"}), 404
        return jsonify(updated)

    elif request.method == "DELETE":
        ok = db.delete_dashboard(dash_id)
        if not ok:
            return jsonify({"error": "Dashboard not found"}), 404
        return jsonify({"status": "deleted", "id": dash_id})


# ── Widgets API ────────────────────────────────────────────────────────────────

@bp.route("/api/dashboards/<int:dash_id>/widgets", methods=["POST"])
def api_dashboard_widgets(dash_id: int):
    data = request.get_json(force=True) or {}
    title = (data.get("title") or "").strip()
    data_source_id = data.get("data_source_id")

    if not title:
        return jsonify({"error": "Widget title is required"}), 400
    if not data_source_id:
        return jsonify({"error": "data_source_id is required"}), 400

    widget = db.create_dashboard_widget(
        dashboard_id=dash_id,
        data_source_id=int(data_source_id),
        title=title,
        widget_type=data.get("widget_type", "kpi_card"),
        metric_op=data.get("metric_op", "count"),
        value_column=data.get("value_column", ""),
        group_by_column=data.get("group_by_column", ""),
        filter_sql=data.get("filter_sql", ""),
        format_type=data.get("format_type", "number"),
        target_value=data.get("target_value"),
        order_idx=data.get("order_idx", 0),
    )
    import data_engine
    computed = data_engine.compute_widget_data(widget["id"])
    return jsonify({**widget, **computed}), 201


@bp.route("/api/dashboards/widgets/<int:widget_id>", methods=["PATCH", "DELETE"])
def api_widget_detail(widget_id: int):
    if request.method == "PATCH":
        data = request.get_json(force=True) or {}
        updated = db.update_dashboard_widget(widget_id, **data)
        if not updated:
            return jsonify({"error": "Widget not found"}), 404
        import data_engine
        computed = data_engine.compute_widget_data(widget_id)
        return jsonify({**updated, **computed})

    elif request.method == "DELETE":
        ok = db.delete_dashboard_widget(widget_id)
        if not ok:
            return jsonify({"error": "Widget not found"}), 404
        return jsonify({"status": "deleted", "id": widget_id})


# ── Advanced Industry Analytical Endpoints (v2.1.0 Atlas) ─────────────────────

@bp.route("/api/analytics/funnel", methods=["POST"])
def api_analytics_funnel():
    data = request.get_json(force=True) or {}
    source_id = data.get("source_id")
    stage_column = data.get("stage_column")
    stages = data.get("stages") or []
    entity_column = data.get("entity_column")

    if not source_id or not stage_column or not stages:
        return jsonify({"error": "source_id, stage_column, and stages are required.", "success": False}), 400

    from tools import analytics_engine
    try:
        res = analytics_engine.compute_funnel_analysis(
            source_id=int(source_id),
            stage_column=str(stage_column),
            stages=list(stages),
            entity_column=str(entity_column) if entity_column else None,
        )
        if "error" in res:
            return jsonify(res), 400
        return jsonify(res), 200
    except Exception as e:
        return jsonify({"error": str(e), "success": False}), 500


@bp.route("/api/analytics/retention", methods=["POST"])
def api_analytics_retention():
    data = request.get_json(force=True) or {}
    source_id = data.get("source_id")
    user_column = data.get("user_column")
    date_column = data.get("date_column")
    period_type = data.get("period_type", "month")
    max_periods = int(data.get("max_periods", 6))

    if not source_id or not user_column or not date_column:
        return jsonify({"error": "source_id, user_column, and date_column are required.", "success": False}), 400

    from tools import analytics_engine
    try:
        res = analytics_engine.compute_cohort_retention(
            source_id=int(source_id),
            user_column=str(user_column),
            date_column=str(date_column),
            period_type=str(period_type),
            max_periods=max_periods,
        )
        if "error" in res:
            return jsonify(res), 400
        return jsonify(res), 200
    except Exception as e:
        return jsonify({"error": str(e), "success": False}), 500


@bp.route("/api/analytics/statistics", methods=["POST"])
def api_analytics_statistics():
    data = request.get_json(force=True) or {}
    source_id = data.get("source_id")
    column_name = data.get("column_name")

    if not source_id or not column_name:
        return jsonify({"error": "source_id and column_name are required.", "success": False}), 400

    from tools import analytics_engine
    try:
        res = analytics_engine.compute_column_statistics(
            source_id=int(source_id),
            column_name=str(column_name),
        )
        if "error" in res:
            return jsonify(res), 400
        return jsonify(res), 200
    except Exception as e:
        return jsonify({"error": str(e), "success": False}), 500


@bp.route("/api/analytics/correlation", methods=["POST"])
def api_analytics_correlation():
    data = request.get_json(force=True) or {}
    source_id = data.get("source_id")
    columns = data.get("columns")

    if not source_id:
        return jsonify({"error": "source_id is required.", "success": False}), 400

    from tools import analytics_engine
    try:
        res = analytics_engine.compute_correlation_matrix(
            source_id=int(source_id),
            columns=columns if isinstance(columns, list) else None,
        )
        if "error" in res:
            return jsonify(res), 400
        return jsonify(res), 200
    except Exception as e:
        return jsonify({"error": str(e), "success": False}), 500


@bp.route("/api/analytics/forecast", methods=["POST"])
def api_analytics_forecast():
    data = request.get_json(force=True) or {}
    source_id = data.get("source_id")
    date_column = data.get("date_column")
    metric_column = data.get("metric_column")
    periods_ahead = int(data.get("periods_ahead", 5))
    aggregation = data.get("aggregation", "sum")

    if not source_id or not date_column or not metric_column:
        return jsonify({"error": "source_id, date_column, and metric_column are required.", "success": False}), 400

    from tools import analytics_engine
    try:
        res = analytics_engine.compute_trend_forecast(
            source_id=int(source_id),
            date_column=str(date_column),
            metric_column=str(metric_column),
            periods_ahead=periods_ahead,
            aggregation=aggregation,
        )
        if "error" in res:
            return jsonify(res), 400
        return jsonify(res), 200
    except Exception as e:
        return jsonify({"error": str(e), "success": False}), 500


