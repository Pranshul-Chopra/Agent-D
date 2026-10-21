# ── routes.py ─────────────────────────────────────────────────────────────────
# Flask routes and REST API for PM Tool.

from flask import Blueprint, render_template, request, jsonify, send_file, send_from_directory
import db
import ai_db
import artifacts_db
import config_db
import context_db
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
    legacy_shell = _get_base_dir() / "templates" / "shell.html"
    if legacy_shell.is_file():
        return render_template("shell.html")
    return "<h3>PM Tool Desktop SPA build not found. Please compile the React frontend.</h3>", 500


@bp.route("/assets/<path:filename>")
def spa_assets(filename):
    spa_asset_dir = _get_base_dir() / "static" / "spa" / "assets"
    if spa_asset_dir.is_dir():
        return send_from_directory(str(spa_asset_dir), filename)
    return jsonify({"error": "Asset not found"}), 404


@bp.route("/legacy")
def legacy():
    """Allows accessing the legacy multi-frame shell if needed."""
    return render_template("shell.html")


@bp.route("/home")
def home():
    return render_template("home.html")


@bp.route("/board")
def board_page():
    return render_template("board.html")


@bp.route("/chat")
def chat_page():
    return render_template("chat.html")


@bp.route("/documents")
def documents_page():
    return render_template("documents.html")


@bp.route("/dashboard")
def dashboard_page():
    return render_template("dashboard.html")


@bp.route("/settings")
def settings_page():
    return render_template("settings.html")


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
        data = request.get_json(force=True) or {}
        title = (data.get("title") or "").strip()
        project_id = data.get("project_id")
        if not title:
            return jsonify({"error": "Task title is required"}), 400

        task = db.create_task(
            project_id=project_id,
            title=title,
            description=data.get("description", ""),
            status=data.get("status", "todo"),
            priority=data.get("priority", "medium"),
            due_date=data.get("due_date", ""),
            story_points=data.get("story_points", 0),
            acceptance_criteria=data.get("acceptance_criteria", ""),
            assignee=data.get("assignee", ""),
        )
        return jsonify(task), 201

    project_id = request.args.get("project_id", type=int)
    status = request.args.get("status")
    priority = request.args.get("priority")
    search = request.args.get("search") or request.args.get("q")

    task_list = db.get_tasks(
        project_id=project_id,
        status=status,
        priority=priority,
        search=search,
    )
    return jsonify({"tasks": task_list, "count": len(task_list)})


@bp.route("/api/tasks/metrics", methods=["GET"])
def task_metrics():
    project_id = request.args.get("project_id", type=int)
    metrics = db.get_sprint_metrics(project_id)
    return jsonify(metrics)


@bp.route("/api/tools/breakdown", methods=["POST"])
def tool_breakdown():
    data = request.get_json(force=True) or {}
    project_id = data.get("project_id")
    prd_text = data.get("prd_text")
    conversation_id = data.get("conversation_id")
    target_persona = data.get("target_persona")
    story_count = data.get("story_count")
    preview_only = bool(data.get("preview_only", False))

    try:
        from tools.story_decomposer import decompose_prd_to_stories
        res = decompose_prd_to_stories(
            project_id=project_id,
            prd_text=prd_text,
            conversation_id=conversation_id,
            target_persona=target_persona,
            story_count=story_count,
            preview_only=preview_only,
        )
        if not res.get("success"):
            return jsonify(res), 400
        return jsonify(res), 200
    except Exception as e:
        return jsonify({"success": False, "error": f"Story decomposition failed: {str(e)}"}), 500


@bp.route("/api/tools/breakdown/commit", methods=["POST"])
def tool_breakdown_commit():
    data = request.get_json(force=True) or {}
    project_id = data.get("project_id")
    stories = data.get("stories") or []
    if not isinstance(stories, list) or not stories:
        return jsonify({"success": False, "error": "No stories provided for commit."}), 400

    try:
        from tools.story_decomposer import commit_decomposed_stories
        created_tasks = commit_decomposed_stories(project_id, stories)
        return jsonify({
            "success": True,
            "count": len(created_tasks),
            "created_tasks": created_tasks,
            "project_id": project_id,
        }), 200
    except Exception as e:
        return jsonify({"success": False, "error": f"Failed to commit stories: {str(e)}"}), 500


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


@bp.route("/api/tasks/<int:task_id>", methods=["PATCH", "DELETE"])
def task_detail(task_id: int):
    if request.method == "PATCH":
        data = request.get_json(force=True) or {}
        updated = db.update_task(task_id, **data)
        if not updated:
            return jsonify({"error": "Task not found"}), 404
        return jsonify(updated)

    elif request.method == "DELETE":
        ok = db.delete_task(task_id)
        if not ok:
            return jsonify({"error": "Task not found"}), 404
        return jsonify({"status": "deleted", "id": task_id})


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


# ── PM AI Chat & Conversations ────────────────────────────────────────────────

def _build_pm_system_prompt(project_id: int | None = None, user_query: str | None = None) -> str:
    """
    Build the enterprise-grade professional PM Copilot behavioural prompt.
    Equips the model with principal PM frameworks, zero-fluff communication,
    and deep contextual grounding in the active project and live workspace context.
    """
    prompt = [
        "You are PM Copilot, a Staff / Principal Product Manager and Technical Architect assisting an enterprise product team.",
        "Your responses must be structured, rigorous, evidence-driven, and immediately executive-ready. Avoid conversational pleasantries, generic advice, or empty filler.",
        "",
        "### BEHAVIOURAL & OPERATIONAL STANDARDS:",
        "1. **First-Principles Problem Formulation**: Dissect user pain and business goals before jumping to solutions. Clearly isolate assumptions from validated requirements.",
        "2. **Standardized PRD Architecture**: When asked to draft a PRD or feature spec, structure it with:",
        "   - **Executive Summary & Problem Statement**: What problem are we solving, for whom, and why now?",
        "   - **Target Personas & User Journeys**: Precise workflows and friction points.",
        "   - **Goals & Non-Goals**: Explicit boundaries defining what is strictly out-of-scope for this phase.",
        "   - **User Stories & Acceptance Criteria**: Format criteria in Gherkin syntax (`Given [context] / When [action] / Then [expected outcome]`).",
        "   - **Technical & Security Considerations**: API design, latency budgets, data protection, and edge cases.",
        "   - **Success Metrics (KPIs)**: 1 Primary North Star metric + 2 Guardrail/Counter-metrics (to prevent degradation).",
        "3. **Decision & Trade-Off Analysis**: When evaluating architectural or product decisions, use a trade-off matrix evaluating: Value/Impact, Engineering Complexity, Operational Maintenance, and Reversibility (Two-way vs One-way door).",
        "4. **Roadmap & Sprint Execution**: Break releases into MoSCoW (Must, Should, Could, Won't have) buckets with clear dependency sequencing.",
        "5. **Format**: Use clean GitHub-flavored markdown with bold headers, concise bullet points, and markdown tables for data comparisons.",
        "6. **Plain-Text Math & Symbols (No LaTeX)**: This chat UI renders formatted Markdown tables and text, NOT LaTeX math. NEVER use LaTeX dollar-sign notation (e.g. $X^+$, $\\le 8\\%$, $> 15\\%$, $\\approx$). Instead use clean plain-text and unicode equivalents: write `≤ 8%`, `> 15%`, `≥ 90%`, `≈ 5%`, `± 2`. Use standard markdown tables with clean pipes `| Col 1 | Col 2 |`.",
        "7. **Tool Suite Awareness & Command Prefixes**: You are operating inside the PM Tool Workspace with full awareness of available tools. Recommend the appropriate command prefix when relevant:",
        "   - `/query <intent>`: Connected SQLite Database Query Assistant. Synthesizes guarded, read-only SELECT queries based on connected schemas.",
        "   - `/plan <initiative>`: Sprint Planning & Roadmap Studio with phase milestones and 1-click action proposals.",
        "   - `/breakdown <feature>`: Decomposes PRDs and features into granular sprint user stories.",
        "   - `/data <topic>`: Inspects connected dataset distributions, column metrics, and outliers in Data Studio.",
        "   - `/prd <title>`: Generates formal Product Requirement Documents.",
        "   - `/metrics <feature>`: Defines North Star KPIs, counter-metrics, and telemetry event specifications.",
        "   - `/search <query>`: Semantic knowledge base search across indexed company documents.",
        "   - `/summarize <doc>`: Extracts executive summaries, architecture specs, and decision logs.",
        "8. **Action Proposals in Chat**: Whenever discussing concrete deliverables, tasks, sprint stories, or when the user says 'make a ticket', 'add a task', or 'create a story', ALWAYS propose each ticket using an interactive ```action:create_ticket fenced JSON block:",
        "   ```action:create_ticket",
        "   {",
        "     \"title\": \"Feature or bug title\",",
        "     \"description\": \"Concise engineering description\",",
        "     \"priority\": \"high\",",
        "     \"story_points\": 3,",
        "     \"ticket_type\": \"internal\",",
        "     \"acceptance_criteria\": \"Given [context] / When [action] / Then [outcome]\"",
        "   }",
        "   ```",
        "   Do not simulate silent creation; always propose the action card so the user can review and 1-click apply it to the Kanban Sprint Board.",
        "9. **Actionable Suggestions & Next-Step Chips (Prompt Suggestions)**: At the end of your response, always offer 1-2 interactive prompt suggestion chips using markdown format: `[⚡ /query <intent>](prompt:/query <intent>)`, `[📝 /breakdown <label>](prompt:/breakdown <suggested prompt>)`, `[⚡ /plan <label>](prompt:/plan <suggested prompt>)`, or `[📊 /data <label>](prompt:/data <suggested prompt>)`.",
    ]

    try:
        ws_ctx = workspace_context.get_workspace_context(project_id=project_id, user_query=user_query)
        prompt.append("\n" + workspace_context.format_workspace_context_for_prompt(ws_ctx, active_project_id=project_id))
    except Exception as e:
        print("[Workspace context extraction warning]", e)

    try:
        import data_engine
        analytics_ctx = data_engine.get_analytics_context_for_llm(project_id=project_id)
        if analytics_ctx:
            prompt.append("\n" + analytics_ctx)
    except Exception:
        pass

    return "\n".join(prompt)


@bp.route("/api/conversations", methods=["GET", "POST"])
def api_conversations():
    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        title = (data.get("title") or "New Conversation").strip()
        project_id = data.get("project_id")
        conv = ai_db.create_conversation(title=title, project_id=project_id)
        return jsonify(conv), 201

    project_id = request.args.get("project_id", type=int)
    convs = ai_db.list_conversations(project_id=project_id)
    return jsonify({"conversations": convs})


@bp.route("/api/conversations/<conv_id>", methods=["GET", "PATCH", "DELETE"])
def api_conversation_detail(conv_id):
    if request.method == "GET":
        conv = ai_db.get_conversation(conv_id)
        if not conv:
            return jsonify({"error": "Conversation not found"}), 404
        messages = ai_db.get_conversation_messages(conv_id)
        applied_keys = ai_db.get_applied_action_keys(conv_id)
        return jsonify({
            "conversation": conv,
            "messages": messages,
            "applied_action_keys": applied_keys,
        })

    elif request.method == "PATCH":
        data = request.get_json(silent=True) or {}
        title = (data.get("title") or "").strip()
        if not title:
            return jsonify({"error": "Title cannot be empty"}), 400
        ok = ai_db.rename_conversation(conv_id, title)
        if not ok:
            return jsonify({"error": "Conversation not found"}), 404
        return jsonify({"id": conv_id, "title": title})

    elif request.method == "DELETE":
        ok = ai_db.delete_conversation(conv_id)
        if not ok:
            return jsonify({"error": "Conversation not found"}), 404
        return jsonify({"status": "deleted", "id": conv_id})


@bp.route("/api/chat", methods=["POST"])
def api_chat():
    """
    Core AI Chat Endpoint:
    Receives message, resolves/creates conversation thread, records user message in ai_context.db,
    dispatches to LLM Gateway, records assistant response, and returns response payload.
    """
    data = request.get_json(silent=True) or {}
    message = str(data.get("message", "")).strip()
    conv_id = data.get("conversation_id")
    project_id = data.get("project_id")

    if not message:
        return jsonify({"error": "Message cannot be empty."}), 400

    # 1. Resolve or create conversation in ai_db
    conv = None
    if conv_id:
        conv = ai_db.get_conversation(conv_id)
    if not conv:
        first_title = message[:35].strip()
        if len(message) > 35:
            first_title += "..."
        conv = ai_db.create_conversation(title=first_title or "New Chat", project_id=project_id)
        conv_id = conv["id"]

    # 2. Add user message to conversation memory in ai_context.db
    ai_db.add_message(conversation_id=conv_id, role="user", content=message)

    # 3. Retrieve recent history for context
    history = ai_db.get_recent_history_for_llm(conv_id, max_messages=20)
    # The history currently includes the message we just added as the last item,
    # so we pass history[:-1] as prior turns and current message as latest turn
    prior_turns = history[:-1] if len(history) > 1 else []

    # 4. Construct system prompt with active project context
    target_proj_id = conv.get("project_id") or project_id
    system_prompt = _build_pm_system_prompt(project_id=target_proj_id, user_query=message)

    # 4b. Command-specific directive injection
    lower_msg = message.lower().strip()
    clean_query = message
    if lower_msg.startswith("/search"):
        clean_query = message[7:].strip() or message
        system_prompt += (
            "\n\n### SPECIAL DIRECTIVE: /search (Knowledge Base Retrieval Mode)\n"
            "Analyze the retrieved document chunks below. Present the relevant evidence, "
            "document sources, key technical quotes, and an executive answer grounded in company knowledge."
        )
    elif lower_msg.startswith("/prd"):
        system_prompt += (
            "\n\n### SPECIAL DIRECTIVE: /prd (PRD Studio Mode)\n"
            "Draft a comprehensive, executive-ready Product Requirement Document covering: "
            "Problem Statement, Target Personas, Goals & Non-Goals, Detailed User Stories with Acceptance Criteria (Gherkin format), "
            "Technical Architecture, Security Considerations, and Success KPIs."
        )
    elif lower_msg.startswith("/plan"):
        system_prompt += (
            "\n\n### SPECIAL DIRECTIVE: /plan (Sprint Planning & Roadmap Studio Mode)\n"
            "Structure your roadmap with clear, distinct Phase Header Blocks:\n"
            "- `### 📌 Phase 1: MVP Core Architecture`\n"
            "- `### 🚀 Phase 2: Feature Expansion & Enhancement`\n"
            "- `### ⚡ Phase 3: Enterprise Scale & Hardening`\n"
            "For key sprint deliverables and user stories across these phases, generate interactive ```action:create_ticket blocks "
            "with title, description, priority ('urgent'|'high'|'med'|'low'), story_points, ticket_type ('internal'|'external'), "
            "and Gherkin acceptance criteria so the product manager can review and 1-click apply them directly to the Kanban Sprint Board."
        )
    elif lower_msg.startswith("/metrics"):
        system_prompt += (
            "\n\n### SPECIAL DIRECTIVE: /metrics (KPI & Telemetry Mode)\n"
            "Define the Primary North Star Metric, secondary funnel metrics, and 2 guardrail metrics. "
            "Provide an exact analytics tracking specification with event names, triggers, and payload properties."
        )
    elif lower_msg.startswith("/summarize"):
        system_prompt += (
            "\n\n### SPECIAL DIRECTIVE: /summarize (Document Summarizer Mode)\n"
            "Synthesize an executive-ready document summary structured into: "
            "1. Executive Summary & Objective, 2. Core Architecture & Specs, 3. Decisions & Trade-Offs, "
            "4. Success Metrics, 5. Identified Risks, and 6. Actionable Next Steps."
        )
    elif lower_msg.startswith("/data") or lower_msg.startswith("/insights") or lower_msg.startswith("/kpi"):
        clean_query = re.sub(r"^/(?:data|insights|kpi)\s*", "", message, flags=re.IGNORECASE).strip() or message
        system_prompt += (
            "\n\n### SPECIAL DIRECTIVE: /data (Data Studio & KPI Insights Mode)\n"
            "Analyze the connected business datasets, schema metrics, and dashboard KPIs provided in the context. "
            "Synthesize an executive data insights brief: 1. Core Trends & Findings, 2. Key Metrics & Outliers, "
            "3. Root-Cause Hypotheses, 4. Actionable Next Steps. Cite specific dataset tables, column dimensions, and values."
        )
    elif lower_msg.startswith("/query"):
        clean_query = re.sub(r"^/query\s*", "", message, flags=re.IGNORECASE).strip() or message
        system_prompt += (
            "\n\n### SPECIAL DIRECTIVE: /query (Dataset SQL Query Assistant Mode)\n"
            "The user wishes to query or extract specific metrics from their connected business dataset(s).\n"
            "1. Inspect the connected datasets and table/column schemas provided in the context.\n"
            "2. Propose a precise, safe, read-only SQLite SELECT query formatted in a ```sql fenced code block that fulfills the user's intent.\n"
            "3. Clearly explain the logic of the query: which tables are referenced, joins (if applicable), WHERE filters, GROUP BY aggregations, and ORDER BY limits.\n"
            "4. Describe expected output columns and potential edge cases (e.g. NULL handling, date format matching).\n"
            "5. Provide actionable follow-up prompt chips: `[⚡ /query <refinement>](prompt:/query <refinement>)` or `[📊 /data <dataset>](prompt:/data <dataset>)`."
        )

    # 4c. Ticket Request Detection (e.g. "make a ticket", "create a story", "add a task")
    ticket_triggers = ("make a ticket", "create a ticket", "add a ticket", "new ticket", "create ticket",
                       "make ticket", "make task", "create task", "add task", "new task", "add to board",
                       "add to backlog", "create user story", "create story")
    if any(trigger in lower_msg for trigger in ticket_triggers):
        system_prompt += (
            "\n\n### USER TICKET REQUEST DETECTED:\n"
            "The user explicitly asked to create or propose tickets/tasks. "
            "Formulate the tickets with full engineering rigor and output each proposed ticket inside an "
            "```action:create_ticket fenced JSON block so the user can review and 1-click apply it to the Sprint Board."
        )

    # 4c. Retrieve verified evidence from local company documents (RAG)
    retrieved_chunks = []
    try:
        from rag import engine as rag_engine
        retrieved_chunks = rag_engine.retrieve_context(
            query=clean_query,
            project_id=target_proj_id,
            top_k=6 if lower_msg.startswith("/search") else 4,
        )
        if retrieved_chunks:
            system_prompt += "\n" + rag_engine.format_retrieved_context_for_prompt(retrieved_chunks)
    except Exception as e:
        print("[RAG Retrieval warning]", e)

    # 5. Call LLM Gateway
    result = llm_gateway.call_llm(
        db_module=db,
        system_prompt=system_prompt,
        message=message,
        history=prior_turns,
    )

    if "error" in result:
        return jsonify({
            "error": result.get("error"),
            "setup_required": result.get("setup_required", False),
            "conversation_id": conv_id,
            "conversation_title": conv.get("title"),
        }), 400 if result.get("setup_required") else 502

    # 6. Record assistant response in ai_context.db
    reply_text = result.get("response", "")
    model_meta = f"{result.get('provider', '')} · {result.get('model', '')}"
    ai_db.add_message(
        conversation_id=conv_id,
        role="assistant",
        content=reply_text,
        model_info=model_meta,
    )

    sources = [
        {
            "filename": c.get("filename"),
            "section": c.get("section_title"),
            "file_path": c.get("file_path"),
        }
        for c in retrieved_chunks
    ] if retrieved_chunks else []

    return jsonify({
        "response": reply_text,
        "provider": result.get("provider"),
        "model": result.get("model"),
        "conversation_id": conv_id,
        "conversation_title": conv.get("title"),
        "sources": sources,
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


# ── Living Documents & Contextual Artifacts Studio APIs ───────────────────────

@bp.route("/api/artifacts", methods=["GET"])
def api_artifacts_list():
    project_id = request.args.get("project_id", type=int)
    doc_type = request.args.get("doc_type")
    search = request.args.get("search")
    is_pinned_raw = request.args.get("is_pinned")
    is_pinned = None
    if is_pinned_raw is not None:
        is_pinned = is_pinned_raw.lower() in ("1", "true")
    limit = min(request.args.get("limit", default=100, type=int), 200)
    offset = max(request.args.get("offset", default=0, type=int), 0)

    artifacts = artifacts_db.list_artifacts(
        project_id=project_id,
        doc_type=doc_type,
        search=search,
        is_pinned=is_pinned,
        limit=limit,
        offset=offset
    )
    stats = artifacts_db.get_artifacts_summary_stats()
    return jsonify({"artifacts": artifacts, "count": len(artifacts), "stats": stats})


@bp.route("/api/artifacts", methods=["POST"])
def api_artifacts_create():
    data = request.get_json(silent=True) or {}
    title = data.get("title", "").strip() or "Untitled Document"
    content = data.get("content", "")
    doc_type = data.get("doc_type", "document")
    project_id = data.get("project_id")
    if project_id is not None:
        try:
            project_id = int(project_id)
            if project_id == 0:
                project_id = None
        except (ValueError, TypeError):
            project_id = None
    tags = data.get("tags") or []
    summary = data.get("summary", "")
    is_pinned = bool(data.get("is_pinned", False))

    artifact = artifacts_db.create_artifact(
        title=title,
        content=content,
        doc_type=doc_type,
        project_id=project_id,
        tags=tags,
        summary=summary,
        is_pinned=1 if is_pinned else 0
    )
    return jsonify({"artifact": artifact, "success": True}), 201


@bp.route("/api/artifacts/<int:artifact_id>", methods=["GET"])
def api_artifacts_get(artifact_id: int):
    artifact = artifacts_db.get_artifact(artifact_id)
    if not artifact:
        return jsonify({"error": f"Artifact {artifact_id} not found"}), 404
    return jsonify({"artifact": artifact, "success": True})


@bp.route("/api/artifacts/<int:artifact_id>", methods=["PUT"])
def api_artifacts_update(artifact_id: int):
    data = request.get_json(silent=True) or {}
    create_version = bool(data.get("create_version", False))
    version_summary = data.get("version_summary", "")

    project_id = data.get("project_id")
    if project_id is not None:
        try:
            project_id = int(project_id)
        except (ValueError, TypeError):
            project_id = None

    updated = artifacts_db.update_artifact(
        artifact_id=artifact_id,
        title=data.get("title"),
        content=data.get("content"),
        doc_type=data.get("doc_type"),
        project_id=project_id,
        tags=data.get("tags"),
        summary=data.get("summary"),
        is_pinned=data.get("is_pinned"),
        create_version=create_version,
        version_summary=version_summary
    )
    if not updated:
        return jsonify({"error": f"Artifact {artifact_id} not found"}), 404
    return jsonify({"artifact": updated, "success": True})


@bp.route("/api/artifacts/<int:artifact_id>", methods=["DELETE"])
def api_artifacts_delete(artifact_id: int):
    ok = artifacts_db.delete_artifact(artifact_id)
    if not ok:
        return jsonify({"error": f"Artifact {artifact_id} not found"}), 404
    return jsonify({"success": True, "id": artifact_id})


@bp.route("/api/artifacts/<int:artifact_id>/pin", methods=["POST"])
def api_artifacts_toggle_pin(artifact_id: int):
    updated = artifacts_db.toggle_pin_artifact(artifact_id)
    if not updated:
        return jsonify({"error": f"Artifact {artifact_id} not found"}), 404
    return jsonify({"artifact": updated, "is_pinned": updated["is_pinned"], "success": True})


@bp.route("/api/artifacts/<int:artifact_id>/versions", methods=["GET"])
def api_artifacts_versions_list(artifact_id: int):
    versions = artifacts_db.list_artifact_versions(artifact_id)
    return jsonify({"versions": versions, "count": len(versions), "success": True})


@bp.route("/api/artifacts/<int:artifact_id>/versions/restore", methods=["POST"])
def api_artifacts_versions_restore(artifact_id: int):
    data = request.get_json(silent=True) or {}
    version_num = data.get("version_num")
    if not version_num:
        return jsonify({"error": "version_num is required"}), 400

    restored = artifacts_db.restore_artifact_version(artifact_id, int(version_num))
    if not restored:
        return jsonify({"error": f"Version {version_num} not found for artifact {artifact_id}"}), 404
    return jsonify({"artifact": restored, "success": True})


@bp.route("/api/artifacts/from-chat", methods=["POST"])
def api_artifacts_from_chat():
    """Promote transient AI response or copilot proposal into a permanent living document."""
    data = request.get_json(silent=True) or {}
    content = (data.get("content") or "").strip()
    if not content:
        return jsonify({"error": "Content cannot be empty"}), 400

    title = (data.get("title") or "").strip()
    doc_type = (data.get("doc_type") or "").strip().lower()
    project_id = data.get("project_id")

    # Smart heuristics if title/type not provided
    lines = [l.strip() for l in content.splitlines() if l.strip()]
    if not title:
        for line in lines:
            if line.startswith("#"):
                title = line.lstrip("#").strip()
                break
        if not title and lines:
            title = lines[0][:60]
        if not title:
            title = "Copilot Generated Document"

    if not doc_type:
        low = (title + "\n" + content[:500]).lower()
        if "prd" in low or "product requirement" in low:
            doc_type = "prd"
        elif "rfc" in low or "request for comment" in low:
            doc_type = "rfc"
        elif "architecture" in low or "system design" in low:
            doc_type = "architecture"
        elif "brief" in low or "sprint brief" in low:
            doc_type = "brief"
        elif "story" in low or "breakdown" in low:
            doc_type = "breakdown"
        else:
            doc_type = "document"

    artifact = artifacts_db.create_artifact(
        title=title,
        content=content,
        doc_type=doc_type,
        project_id=project_id,
        tags=["ai-copilot", doc_type],
        summary="Synthesized from AI Copilot generation"
    )
    return jsonify({"artifact": artifact, "success": True, "message": "Promoted to Living Artifact"}), 201


@bp.route("/api/artifacts/<int:artifact_id>/export/<export_format>", methods=["GET", "POST"])
def api_artifacts_export(artifact_id: int, export_format: str):
    """Export living artifact directly to DOCX, Markdown (.md), or styled HTML."""
    artifact = artifacts_db.get_artifact(artifact_id)
    if not artifact:
        return jsonify({"error": f"Artifact {artifact_id} not found"}), 404

    title = artifact["title"]
    content = artifact["content"]
    safe_name = "".join(c for c in title if c.isalnum() or c in (" ", "_", "-")).rstrip() or "Document"

    fmt = export_format.lower()
    if fmt in ("docx", "doc"):
        from tools.document_generator import generate_docx_from_markdown
        meta = {
            "Document Title": title,
            "Document Type": artifact["doc_type"].upper(),
            "Word Count": str(artifact["word_count"]),
            "Updated At": artifact["updated_at"]
        }
        buf = generate_docx_from_markdown(title=title, markdown_content=content, metadata=meta)
        return send_file(
            buf,
            as_attachment=True,
            download_name=f"{safe_name}.docx",
            mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
    elif fmt in ("md", "markdown"):
        from io import BytesIO
        buf = BytesIO(content.encode("utf-8"))
        return send_file(
            buf,
            as_attachment=True,
            download_name=f"{safe_name}.md",
            mimetype="text/markdown"
        )
    elif fmt in ("html", "htm"):
        from io import BytesIO
        import html
        html_doc = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>{html.escape(title)}</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; max-width: 860px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; }}
    h1, h2, h3 {{ color: #111; }}
    pre, code {{ background: #f4f4f4; border-radius: 4px; font-family: Consolas, monospace; }}
    pre {{ padding: 12px; overflow-x: auto; }}
    table {{ border-collapse: collapse; width: 100%; margin: 16px 0; }}
    th, td {{ border: 1px solid #ddd; padding: 8px 12px; text-align: left; }}
    th {{ background: #f8f8f8; }}
  </style>
</head>
<body>
  <h1>{html.escape(title)}</h1>
  <p><em>Type: {html.escape(artifact['doc_type'].upper())} | Words: {artifact['word_count']} | Updated: {artifact['updated_at']}</em></p>
  <hr>
  <pre style="white-space: pre-wrap; font-family: inherit;">{html.escape(content)}</pre>
</body>
</html>"""
        buf = BytesIO(html_doc.encode("utf-8"))
        return send_file(
            buf,
            as_attachment=True,
            download_name=f"{safe_name}.html",
            mimetype="text/html"
        )
    else:
        return jsonify({"error": f"Unsupported export format: {export_format}"}), 400


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


# ── Outposts & External Integrations API ──────────────────────────────────────

@bp.route("/api/outposts", methods=["GET"])
def api_list_outposts():
    """List configured outposts with masked credentials."""
    import db
    from tools.outposts.security import mask_token
    configs = db.get_all_outpost_configs()
    safe_configs = []
    for c in configs:
        c_copy = dict(c)
        raw_tok = c_copy.get("auth_token", "")
        c_copy["auth_token"] = mask_token(raw_tok)
        c_copy["has_token"] = bool(raw_tok)
        safe_configs.append(c_copy)
    return jsonify({"outposts": safe_configs}), 200


@bp.route("/api/outposts/<provider>", methods=["POST"])
def api_save_outpost(provider):
    """Save or update outpost credentials with authenticated encryption."""
    import db
    from tools.outposts.security import validate_outpost_url, encrypt_token, mask_token
    data = request.get_json(force=True) or {}
    base_url = data.get("base_url")
    auth_token = data.get("auth_token")
    user_email = data.get("user_email")
    project_key = data.get("project_key")
    database_id = data.get("database_id")
    is_active = data.get("is_active", 1)
    sync_policy = data.get("sync_policy", "manual")

    if base_url:
        is_safe, reason = validate_outpost_url(base_url, provider=provider, allow_localhost=True)
        if not is_safe:
            return jsonify({"error": f"Invalid outpost endpoint: {reason}", "success": False}), 400

    enc_token = None
    if auth_token and not auth_token.startswith("••••"):
        enc_token = encrypt_token(auth_token)

    saved = db.set_outpost_config(
        provider=provider,
        base_url=base_url,
        auth_token=enc_token,
        user_email=user_email,
        project_key=project_key,
        database_id=database_id,
        is_active=is_active,
        sync_policy=sync_policy,
    )
    if saved:
        saved["auth_token"] = mask_token(saved.get("auth_token", ""))
        saved["has_token"] = bool(saved.get("auth_token"))
    return jsonify({"outpost": saved, "success": True}), 200


@bp.route("/api/outposts/<provider>/test", methods=["POST"])
def api_test_outpost(provider):
    """Run live diagnostic connectivity and credential test."""
    import db
    from adapters.jira_ticket_adapter import JiraTicketAdapter
    from adapters.notion_document_adapter import NotionDocumentAdapter
    from adapters.gdocs_document_adapter import GDocsDocumentAdapter

    data = request.get_json(force=True) or {}
    stored = db.get_outpost_config(provider) or {}
    base_url = data.get("base_url") or stored.get("base_url", "")
    auth_token = data.get("auth_token") or stored.get("auth_token", "")
    user_email = data.get("user_email") or stored.get("user_email", "")
    project_key = data.get("project_key") or stored.get("project_key", "")
    database_id = data.get("database_id") or stored.get("database_id", "")

    prov = provider.lower().strip()
    diag = None

    if prov == "jira":
        adapter = JiraTicketAdapter(
            base_url=base_url,
            user_email=user_email,
            auth_token=auth_token,
            project_key=project_key,
            allow_localhost=True,
        )
        diag = adapter.test_connection()
    elif prov == "notion":
        adapter = NotionDocumentAdapter(
            auth_token=auth_token,
            database_id=database_id,
            allow_localhost=True,
        )
        diag = adapter.test_connection()
    elif prov in ("gdocs", "google"):
        adapter = GDocsDocumentAdapter(
            auth_token=auth_token,
            user_email=user_email,
            allow_localhost=True,
        )
        diag = adapter.test_connection()
    else:
        return jsonify({"error": f"Unsupported outpost provider: {provider}", "success": False}), 400

    db.update_outpost_diagnostic(provider, last_error=None if diag.healthy else diag.message)

    return jsonify({
        "provider": diag.provider,
        "healthy": diag.healthy,
        "latency_ms": diag.latency_ms,
        "message": diag.message,
        "details": diag.details,
        "success": diag.healthy,
    }), 200


@bp.route("/api/outposts/<provider>", methods=["DELETE"])
def api_delete_outpost(provider):
    """Delete an outpost configuration."""
    import db
    deleted = db.delete_outpost_config(provider)
    return jsonify({"success": deleted}), 200


@bp.route("/api/projects/<int:project_id>/link-outpost", methods=["POST"])
def api_link_project_outpost(project_id):
    """Link project to external outpost with pre-sync safety snapshot and board wipe."""
    import db
    from tools.outposts.snapshot import create_pre_sync_snapshot
    from adapters.jira_ticket_adapter import JiraTicketAdapter

    data = request.get_json(force=True) or {}
    provider = data.get("provider", "jira").lower().strip()

    try:
        snapshot_res = create_pre_sync_snapshot(project_id=project_id, provider=provider)
    except Exception as e:
        return jsonify({"error": f"Failed to create pre-sync safety snapshot: {str(e)}", "success": False}), 500

    sync_res_data = None
    if provider == "jira":
        cfg = db.get_outpost_config("jira")
        if cfg and cfg.get("base_url") and cfg.get("auth_token"):
            proj_key = data.get("project_key") or cfg.get("project_key")
            adapter = JiraTicketAdapter(
                base_url=cfg["base_url"],
                user_email=cfg.get("user_email", ""),
                auth_token=cfg["auth_token"],
                project_key=proj_key,
                allow_localhost=True,
            )
            sync_res = adapter.sync_external(project_id)
            sync_res_data = sync_res.__dict__

    return jsonify({
        "success": True,
        "message": f"Project linked to {provider.upper()}. Existing board archived to safety snapshot.",
        "snapshot": snapshot_res,
        "sync_result": sync_res_data,
    }), 200


@bp.route("/api/projects/<int:project_id>/unlink-outpost", methods=["POST"])
def api_unlink_project_outpost(project_id):
    """Unlink project from remote outpost dictator."""
    import db
    with db.get_db() as conn:
        with conn:
            conn.execute(
                """
                UPDATE projects
                SET is_outpost_dictated = 0,
                    outpost_provider = NULL,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (project_id,),
            )
    return jsonify({"success": True, "message": "Project unlinked from outpost."}), 200


@bp.route("/api/projects/<int:project_id>/restore-snapshot", methods=["POST"])
def api_restore_project_snapshot(project_id):
    """Restore local board from safety backup snapshot."""
    from tools.outposts.snapshot import restore_pre_sync_snapshot
    data = request.get_json(force=True) or {}
    snapshot_path = data.get("snapshot_path")
    try:
        res = restore_pre_sync_snapshot(project_id=project_id, snapshot_path=snapshot_path)
        return jsonify(res), 200
    except Exception as e:
        return jsonify({"error": str(e), "success": False}), 500


@bp.route("/api/projects/<int:project_id>/snapshots", methods=["GET"])
def api_list_project_snapshots(project_id):
    """List available snapshots for a project."""
    from tools.outposts.snapshot import list_snapshots
    res = list_snapshots(project_id=project_id)
    return jsonify({"snapshots": res}), 200


@bp.route("/api/projects/<int:project_id>/board-schema", methods=["GET"])
def api_get_board_schema(project_id):
    """Return dynamic board schema (local 4-column or Jira workflow stages)."""
    import db
    from adapters.local_ticket_adapter import LocalTicketAdapter
    from adapters.jira_ticket_adapter import JiraTicketAdapter

    project = db.get_project(project_id)
    if not project:
        return jsonify({"error": "Project not found", "success": False}), 404

    is_dictated = project.get("is_outpost_dictated") == 1
    provider = project.get("outpost_provider")

    if is_dictated and provider == "jira":
        cfg = db.get_outpost_config("jira")
        if cfg and cfg.get("base_url") and cfg.get("auth_token"):
            adapter = JiraTicketAdapter(
                base_url=cfg["base_url"],
                user_email=cfg.get("user_email", ""),
                auth_token=cfg["auth_token"],
                project_key=cfg.get("project_key", ""),
                allow_localhost=True,
            )
            schema = adapter.get_board_schema(project_id)
            return jsonify({
                "provider": schema.provider,
                "columns": [c.__dict__ for c in schema.columns],
                "allowed_types": schema.allowed_types,
                "allowed_labels": schema.allowed_labels,
                "is_outpost_dictated": True,
            }), 200

    local_adapter = LocalTicketAdapter()
    schema = local_adapter.get_board_schema(project_id)
    return jsonify({
        "provider": schema.provider,
        "columns": [c.__dict__ for c in schema.columns],
        "allowed_types": schema.allowed_types,
        "allowed_labels": schema.allowed_labels,
        "is_outpost_dictated": False,
    }), 200


@bp.route("/api/outposts/jira/push-task", methods=["POST"])
def api_jira_push_task():
    """Push an existing local task card to Jira."""
    import db
    from adapters.jira_ticket_adapter import JiraTicketAdapter
    from ports.ticket_tracker import CreateTaskPayload

    data = request.get_json(force=True) or {}
    task_id = data.get("task_id")
    if not task_id:
        return jsonify({"error": "task_id is required", "success": False}), 400

    task = db.get_task(task_id)
    if not task:
        return jsonify({"error": "Task not found", "success": False}), 404

    cfg = db.get_outpost_config("jira")
    if not cfg or not cfg.get("base_url") or not cfg.get("auth_token"):
        return jsonify({"error": "Jira outpost is not configured.", "success": False}), 400

    adapter = JiraTicketAdapter(
        base_url=cfg["base_url"],
        user_email=cfg.get("user_email", ""),
        auth_token=cfg["auth_token"],
        project_key=cfg.get("project_key", ""),
        allow_localhost=True,
    )

    try:
        ext_id = task.get("external_id")
        if ext_id:
            return jsonify({"success": True, "external_id": ext_id, "external_url": task.get("external_url")}), 200
        else:
            payload = CreateTaskPayload(
                title=task["title"],
                description=task.get("description", ""),
                status=task.get("status", "todo"),
                priority=task.get("priority", "medium"),
                ticket_type=task.get("ticket_type", "task"),
                story_points=task.get("story_points", 0),
                assignee=task.get("assignee", ""),
            )
            entity = adapter.create_task(project_id=task["project_id"], payload=payload)
            db.update_task(
                task_id,
                external_provider="jira",
                external_id=entity.external_id,
                external_url=entity.external_url,
                external_type=entity.external_type,
                sync_status="synced",
            )
            return jsonify({
                "success": True,
                "external_id": entity.external_id,
                "external_url": entity.external_url,
            }), 200
    except Exception as e:
        return jsonify({"error": str(e), "success": False}), 500


@bp.route("/api/outposts/notion/push-artifact", methods=["POST"])
def api_notion_push_artifact():
    """Publish a living document from artifacts.db to Notion."""
    import db
    from adapters.notion_document_adapter import NotionDocumentAdapter

    data = request.get_json(force=True) or {}
    artifact_id = data.get("artifact_id")
    if not artifact_id:
        return jsonify({"error": "artifact_id is required", "success": False}), 400

    cfg = db.get_outpost_config("notion")
    if not cfg or not cfg.get("auth_token"):
        return jsonify({"error": "Notion outpost is not configured.", "success": False}), 400

    adapter = NotionDocumentAdapter(
        auth_token=cfg["auth_token"],
        database_id=cfg.get("database_id"),
        allow_localhost=True,
    )
    try:
        res = adapter.push_artifact(int(artifact_id))
        return jsonify(res), 200
    except Exception as e:
        return jsonify({"error": str(e), "success": False}), 500


@bp.route("/api/outposts/gdocs/push-artifact", methods=["POST"])
def api_gdocs_push_artifact():
    """Publish a living document to Google Docs."""
    import db
    from adapters.gdocs_document_adapter import GDocsDocumentAdapter

    data = request.get_json(force=True) or {}
    artifact_id = data.get("artifact_id")
    if not artifact_id:
        return jsonify({"error": "artifact_id is required", "success": False}), 400

    cfg = db.get_outpost_config("gdocs")
    if not cfg or not cfg.get("auth_token"):
        adapter = GDocsDocumentAdapter(auth_token="mock_token", allow_localhost=True)
    else:
        adapter = GDocsDocumentAdapter(
            auth_token=cfg["auth_token"],
            user_email=cfg.get("user_email"),
            allow_localhost=True,
        )

    try:
        res = adapter.push_artifact(int(artifact_id))
        return jsonify(res), 200
    except Exception as e:
        return jsonify({"error": str(e), "success": False}), 500




