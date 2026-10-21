# Changelog

All notable changes, architectural adaptations, additions, and refactorings to **Agent-D** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] — 2026-10-21

### Milestone 4: Safety Gate & Proposal Queue (Current Release)

#### Added
- **Medical Tool Layer (`clinical_tools.py`):**
  - Read Tools (Direct Execution):
    - `get_today_agenda()`: Retrieves day's appointment list, schedule counts, and pending action items.
    - `get_next_patient()`: Identifies the next scheduled patient and returns their safe clinical brief.
    - `get_patient_artifact(alias_or_id)`: Retrieves structured JSON artifact for a given patient alias or ID.
    - `get_patient_logs(alias_or_id, limit)`: Fetches recent dated clinical observations and vitals.
    - `get_open_tickets(alias_or_id)`: Fetches pending clinical tickets and follow-up items.
  - Safe Write Tools (PROPOSAL GENERATION ONLY — Never writes directly to DB):
    - `propose_artifact_update(patient_id, updates, rationale)`: Computes field-level diff and stages a pending proposal for physician review.
    - `propose_log_entry(patient_id, content, entry_type, metadata, rationale)`: Proposes a new dated clinical observation or vital signs entry.
    - `propose_ticket(patient_id, title, priority, due_date, description, rationale)`: Proposes an actionable clinical follow-up task or lab order.
    - `propose_reminder(patient_id, title, due_time, rationale)`: Proposes a time-specific clinical reminder.
- **Safety Gate Proposals Architecture (`context_db.py`):**
  - `proposals` table tracking pending proposals with payload, field diff, rationale, and timestamps.
  - `accept_proposal(proposal_id)`: Doctor approval action that commits proposed updates to live clinical records (artifacts, logs, tickets), records audit events in `audit_events`, and marks proposal as accepted.
  - `reject_proposal(proposal_id, reason)`: Doctor rejection action that marks proposal rejected without modifying live clinical data.
- **Clinical Tickets & Kanban Data Plane (`context_db.py`):**
  - `tickets` table tracking clinical action items, priority, due date, status, and patient alias.
  - Methods: `create_ticket`, `list_tickets`, `get_ticket`, `update_ticket`, `delete_ticket`.
- **REST API Endpoints (`routes.py`):**
  - `GET /api/v1/proposals`: List proposals (`?status=pending&patient_id=...`).
  - `POST /api/v1/proposals`: Create a new assistant proposal.
  - `GET /api/v1/proposals/<id>`: Retrieve proposal details with diff and payload.
  - `POST /api/v1/proposals/<id>/accept`: Doctor approval endpoint.
  - `POST /api/v1/proposals/<id>/reject`: Doctor rejection endpoint.
  - `GET /api/v1/tickets`: List clinical tickets.
  - `POST /api/v1/tickets`: Create clinical ticket.
  - `PATCH /api/v1/tickets/<id>`: Update clinical ticket status or priority.
  - `DELETE /api/v1/tickets/<id>`: Delete clinical ticket.
  - Bridged `/api/tasks` and `task_detail` directly to `context.db` tickets.
- **Interactive Proposal & Diff Cards (`ActionCard.tsx`):**
  - Clinical 90% white canvas design with blue accent borders (`#BFDBFE`).
  - Renders proposed field-level additions (`+ Drug 10mg BID` in emerald green) and removals.
  - Interactive `[✓ Approve & Commit]` and `[✕ Reject]` buttons.
  - Real-time status transitions to "✓ Approved & Committed to Patient Vault" or "✕ Rejected".
- **Automated Milestone 4 Test Suite (`test_m4.py`):**
  - 100% passing unit tests covering tool execution, proposal staging, safety gate non-mutation guarantee, physician approval, physician rejection, and REST API endpoints.

---

### Milestone 3: Conversational Command Center & Chat Migration

#### Added
- **Live Practice Temporal & Clinical Context Engine (`clinical_context.py`):**
  - Local temporal grounding (workstation date, time, day of week).
  - Practice schedule injection (today's scheduled consultations with patient aliases).
  - Open clinical follow-up tickets injection.
  - Active patient medical envelope (alias, active diagnoses, medications, watch-for alerts, recent vitals).
  - Strict de-identification guarantee (patient legal names, phone numbers, and emails are never injected into LLM prompts).
- **Conversational Copilot Streaming & Synthesis Engine (`clinical_chat.py`):**
  - Real-time Server-Sent Events (SSE) streaming generator (`/api/v1/chat/stream`).
  - Multi-key rotation integration with 60-second cooldown backoff for quota errors.
  - Local intelligent clinical context synthesis engine for offline/test operation without API keys.
  - Synchronous fallback clinical chat generator (`/api/v1/chat`).
- **Patient-Scoped Chat Sessions & Encrypted History (`context_db.py`):**
  - Database tables `chat_sessions` and `chat_messages`.
  - AES-256-GCM authenticated encryption at rest for all stored conversation turns.
  - Methods: `create_chat_session`, `list_chat_sessions`, `get_chat_session`, `delete_chat_session`, `add_chat_message`.
- **Practice Appointments & Dashboard Stats (`context_db.py` & `routes.py`):**
  - `GET /api/v1/dashboard/stats`: Returns aggregated active patients count, today's visits, open tickets, and next patient pointer.
  - `GET /api/v1/appointments` & `POST /api/v1/appointments`: Scheduling management joined with patient clinical aliases.
- **Upgraded Conversational Workstation UI (`ChatView.tsx`):**
  - Real-time SSE token streaming display with animated typing indicator.
  - "Stop Generating" stream cancellation button.
  - Slide-out consultation history drawer with 1-click session deletion.
  - Active patient chart banner displaying safe alias (`PT-XXXX`), demographics, and vault status.
  - 4 prominent clinical prompt chips (*☀️ Morning Practice Brief*, *🩺 Next Patient Brief*, *💊 Medication Review*, *📝 Dictate Visit Notes*).
- **Reactive Practice Dashboard (`HomeView.tsx`):**
  - Bound to live practice stats (`getDashboardStats`) and live appointments (`listAppointments`).
  - Dynamic metrics cards: Active Patient Records, Today's Consultations, Follow-up Tickets, Security Engine.
  - Real-time scheduled consultations list.
- **Automated Milestone 3 Test Suite (`test_m3.py`):**
  - 100% passing tests for chat sessions, encrypted message storage, clinical prompt generation, SSE streaming, and REST endpoints.

---

### Milestone 2: Context Artifacts & Medical Logs

#### Added
- **Structured JSON Context Artifact Studio (`DocsView.tsx`):**
  - Clinical Profile Summary editor (primary input for AI copilot context).
  - Active Diagnoses & Medical Conditions dynamic list with addition/removal.
  - Current Medications & Dosages dynamic list with addition/removal.
  - Watch-For Clinical Inquiries & In-Flight Alerts manager.
  - Follow-ups & Recalls manager with due date tracking.
  - Physician Confidential Private Notes editor.
- **Immutable Version Snapshot History (`context_db.py` & `DocsView.tsx`):**
  - Database table `artifact_versions` storing full JSON snapshots of patient artifacts upon every save.
  - Records version numbering, author type (`doctor_manual` vs `proposal_approved`), change summary, and creation timestamp.
  - Slide-out Version History drawer in `DocsView.tsx` with audit badges.
- **1-Click Artifact Version Restoration:**
  - REST endpoint `POST /api/v1/patients/<patient_id>/artifact/restore/<version_num>`.
  - Reverts the active artifact to any selected prior snapshot and appends a new audit version.
  - Frontend "Restore Snapshot" button directly on historical version cards.
- **Visual Diff Engine & Viewer (`ArtifactDiffModal.tsx`):**
  - Structured diff calculation engine (`compute_artifact_diff` in `context_db.py`) and REST endpoint `GET /api/v1/patients/<patient_id>/artifact/diff`.
  - Visual side-by-side and tagged comparison modal for:
    - Clinical summary changes (previous vs updated text)
    - Active issues diff (tagged as `Added`, `Removed`, or `Unchanged`)
    - Medications diff (tagged as `Prescribed`, `Discontinued`, or `Unchanged`)
    - Watch-For Alerts and Follow-ups diff
    - Physician confidential notes diff
  - Dynamic dropdown selectors to compare any historical version against the active chart or against another snapshot.
- **Medical Observations & Dated Log Entries:**
  - Database tables `log_entries` and `log_entry_versions` in `context.db`.
  - REST API endpoints:
    - `GET /api/v1/patients/<patient_id>/logs` (with category filtering)
    - `POST /api/v1/patients/<patient_id>/logs` (record observation)
    - `PATCH /api/v1/logs/<entry_id>` (amend observation)
    - `DELETE /api/v1/logs/<entry_id>` (delete observation)
  - Dedicated "Medical Observations & Logs" tab in `DocsView.tsx`.
  - Dedicated Vitals Capture Builder for Blood Pressure (`mmHg`), Heart Rate (`bpm`), Temperature (`°F`), and `SpO2 (%)`.
- **Audit-Compliant Observation Amendment Flow:**
  - Amending any clinical observation archives previous text into `log_entry_versions`.
  - Enforces mandatory physician amendment reason (e.g. "Re-checked BP after patient rested").
  - Visual "Amended Nx" badge with expandable prior revision audit history.
- **Automated Milestone 2 Verification Test Suite (`test_m2.py`):**
  - End-to-end testing of patient creation, artifact v1 $\rightarrow$ v2 update, visual diff verification, v1 restoration to v3, observation logging with vitals, and amendment revision archiving.

---

### UI & Clinical Workflow Refactorings

#### Added
- **Patients Manager Module (`PatientsView.tsx`):**
  - Replaced simple dropdowns with a dedicated Patients Directory module.
  - Comprehensive data table displaying legal names (encrypted at rest), safe clinical aliases (`PT-XXXX`), demographics (DOB, gender, blood group), contact details, and status.
  - Patient Registration Modal with automatic sequential alias assignment and AES-256-GCM encryption at rest.
  - Patient Profile Drawer with cryptographic security indicator and 1-click jumps to Copilot and Living Artifacts.
  - Integrated into primary navigation (`Ctrl+3`).
- **Clinical Follow-ups Kanban Board (`BoardView.tsx`):**
  - Converted the tickets stub into an interactive 4-stage Kanban pipeline (*To Do / Ordered*, *In Progress*, *Under Review*, *Completed*).
  - Clinical cards with priority pills (Critical, High, Medium, Low), patient tags (`PT-XXXX`), due dates, and category badges.
  - Interactive forward/backward column transitions with optimistic UI state updates.
  - "+ New Action Item" modal to create lab orders, specialist referrals, and follow-ups.
- **Clinical Command Palette (`CommandPalette.tsx`):**
  - Replaced PM/Agile shortcuts with clinical actions (`Ctrl+1` through `Ctrl+6`).
  - Instant live search across decrypted patient legal names and clinical aliases.
  - Quick action chips (*☀️ Morning Practice Brief*, *🩺 Next Patient Brief*, *Register Patient*, *Create Action Item*).
- **Version Changelog Modal (`WhatsNewModal.tsx` & `whatsNewData.ts`):**
  - Refactored to Agent-D v0.1.0 "Clinical Vault" detailing cryptographic security, clinical copilot, proposal safety gate, and Kanban board.

#### Changed
- **90% White Clinical Design Tokens:**
  - Replaced dark background palette (`#161514`, `#2e2c2a`) with a 90% white canvas (`#FFFFFF` / `#F8FAFC`).
  - Replaced orange accents with hospital-grade blue (`#2563EB`, hover `#1D4ED8`, soft fill `#EFF6FF`).
  - Replaced low-contrast light grey text with crisp `text-slate-900` typography.
- **Unified Versioning (`v0.1.0`):**
  - Synchronized version reporting to `0.1.0` across `version.json`, `routes.py`, `bridge.ts`, `package.json`, `Titlebar.tsx`, `Sidebar.tsx`, and `CommandPalette.tsx`.
- **Deferred First-Time Onboarding:**
  - Disabled aggressive auto-popup on startup in `App.tsx` so physicians can immediately access the workstation.

---

### Milestone 1: Cryptographic Vault & Security Perimeter

#### Added
- **Cryptographic Utilities (`crypto_utils.py`):**
  - Machine-bound master key derivation using PBKDF2-HMAC-SHA256 (100,000 iterations).
  - Authenticated AES-256-GCM encryption and decryption with 96-bit random IVs and 128-bit authentication tags.
- **Per-Launch Bearer Token Security:**
  - Dynamic 32-byte cryptographically secure random token minted by Electron `main.js` on boot.
  - Passed via IPC preload bridge to `bridge.ts`.
  - Verified on all incoming Flask `/api/` requests via `@bp.before_request` middleware (enforces `401 Unauthorized` without valid token).
- **Perimeter Defense:**
  - Blocks cross-origin API mutations and cross-site requests (`Sec-Fetch-Site: cross-site`).
- **Database Architecture:**
  - Standardized on two core databases: `config.db` (app settings, Multi-Key Gemini vault) and `context.db` (encrypted patient directory, artifacts, audit logs).
- **Multi-Key Gemini Vault (`config_db.py`):**
  - Encrypted storage for multiple Google Gemini API keys with usage tracking and rate limit counters.
- **Automated Milestone 1 Test Suite (`test_m1.py`):**
  - 100% passing tests for cryptographic roundtrips, perimeter 401 enforcement, patient creation, and artifact initialization.

---

### Milestone 0: Clean Fork & Architectural Shell

#### Changed
- Forked from `pm_tool` and rebranded to **Agent-D** (Doctor's Copilot).
- Reconfigured Electron build (`package.json`, `main.js`) with app ID `com.agentd.desktop`.
- Standardized window dimensions to 1380×880 with hospital-grade white titlebar styling.
- Removed obsolete PM modules and dead outposts.
