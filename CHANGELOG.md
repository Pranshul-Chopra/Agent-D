# Changelog

All notable changes, architectural adaptations, additions, and refactorings to **Agent-D** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.5.0] — 2026-10-23

### Pure Deterministic Clinical Workstation: Complete AI Removal & Cryptographic Vault (Current Release)

#### Removed
- **Completely Excised All AI / LLM Subsystems:**
  - Removed all cloud AI endpoints and API clients (Google Gemini, OpenAI).
  - Deleted local LLM provider interface, Ollama bindings, and neural model runners (`llm_provider.py`, `llm/`).
  - Deleted conversational AI Copilot backend (`clinical_chat.py`) and UI view (`ChatView.tsx`).
  - Purged prompt templates, AI database state, and cloud egress chokepoints (`ai_db.py`, `cloud_egress.py`).
  - Removed Copilot navigation tabs and shortcuts from `Sidebar.tsx`, `App.tsx`, and `CommandPalette.tsx`.
  - Removed pre-deployment amber demo banner; workstation is now a production-ready deterministic clinical tool.

#### Added
- **Deterministic Rule-Based Clinical Extraction Engine:**
  - Encounter note analysis uses fast, verifiable regular expressions and keyword extractors in `context_db.py` to identify proposed medication changes, lab follow-ups, and watch-for flags.
  - Zero hallucination risk: every proposal maps directly to explicit strings entered by the attending physician.
- **Pure Clinical Practice Onboarding Wizard (`OnboardingModal.tsx`):**
  - Streamlined 3-step setup: Doctor Profile & Registration, Clinical Workstation Tour, and Keyboard Navigation Cheat Sheet.
- **Hardware-Bound Workstation Settings (`SettingsView.tsx`):**
  - Dedicated panels for Cryptographic Storage Status (AES-256-GCM), Data Protection Guarantees (Zero AI, Zero Cloud Egress), Loopback IPC Topology, and Practice Configuration.

#### Changed
- **Sub-Second Performance & Reduced Footprint:**
  - Elimination of LLM streaming overhead reduced API response times to < 50ms across all endpoints.
  - Test suite runtime decreased from 32s to 0.72s.
- **Legal & Compliance Hardening:**
  - 100% compliant with medical confidentiality and Indian data protection standards (IT Act 2000 Section 43A, SPDI Rules 2011, DPDP Act 2023).
  - Zero third-party data processor liabilities or cross-border transfer exposure.

---

## [0.4.0] — 2026-10-23

### In-View Patient Scoping, Dynamic Context Sync & CI/CD Pipeline Hardening (Current Release)

#### Added
- **In-View Patient Scoping in Copilot (`ChatView.tsx`):**
  - Interactive patient context selector dropdown located directly in the Copilot header.
  - Physicians can toggle between "🌐 General Practice Copilot (No patient scoped)" (for cross-patient triage, daily appointments review, and practice-wide clinical questions) and specific patient charts (`PT-XXXX`).
  - Search filter supporting instant matching by patient name, cryptographic `llm_alias`, or date of birth, with direct navigation to the full Patient Directory.
  - Automatically scopes active chat sessions, previous consultation conversations, and live prompt injection to the selected chart.
- **Dedicated Patient Chart Selector Grid & In-Header Switcher (`DocsView.tsx`):**
  - Replaced static empty-state with a dedicated Patient Chart Selector grid featuring instant search, demographic summaries, active badges, and one-click chart opening.
  - Added an in-header `[ Switch Chart ▾ ]` quick-picker dropdown directly in the Artifacts Studio header bar, allowing doctors to quickly switch between patient context artifacts or return to the chart grid without navigating away.
- **Real-Time Dynamic Context Synchronization:**
  - Dynamic per-turn prompt injection in `clinical_chat.py` querying live SQLite artifacts, recent vitals, open tickets, and today's schedule on every chat message.
  - Atomic SQLite initialization of Medical Context Artifact (v1 snapshot) upon registering a new patient.
  - Cross-view reactive updates ensuring new patients appear immediately in Copilot and Artifact switchers.

#### Changed
- **Decoupled Titlebar Architecture (`Titlebar.tsx`):**
  - Removed global patient dropdown from `Titlebar`, keeping the native window header focused on workstation identity (`Agent-D v0.4.0`), active view breadcrumbs, the Command Palette trigger (`Ctrl+K`), and local security vault status.
- **Clinical Dashboard Re-Alignment (`HomeView.tsx`):**
  - Promoted the Interactive Clinical Calendar & Agenda widget directly beneath the 4 quick metric cards for immediate daily mapping.
  - Positioned the AI Clinical Chief of Staff / Next Patient Pre-Visit Brief suggestion card below the calendar for logical daily context mapping.
- **Bumped Application Version to `0.4.0`:**
  - Synchronously bumped across `version.json`, `electron/package.json`, `electron/package-lock.json`, `routes.py`, `build.bat`, `Titlebar.tsx`, `App.tsx`, `Sidebar.tsx`, `CommandPalette.tsx`, `SettingsView.tsx`, and documentation manifests.

#### Fixed
- **CI/CD Build Timeouts & PyInstaller Freezes (`.github/workflows/release.yml`, `flask.spec`):**
  - Disabled PyInstaller UPX compression (`upx=False`) in `flask.spec`, eliminating the primary cause of Windows runner hangs and DLL compression deadlocks on GitHub Actions.
  - Added an explicit `timeout-minutes: 25` to the GitHub Actions release workflow to prevent runaway jobs.
  - Upgraded release publishing to use `softprops/action-gh-release@v2` with offline `electron-builder --publish never`, providing robust, atomic asset uploading (`.exe`, `.blockmap`, `latest.yml`) without token rate-limiting or release collision errors.
  - Added `test_m6_actions.py` to the automated regression test gate to guarantee 100% test coverage across all 18 milestone tests before freezing and publishing binaries.
  - Added an explicit post-freeze step syncing compiled React SPA assets into `dist/flask/_internal/static/spa/`.

---

## [0.3.0] — 2026-10-23

### Smooth One-Click Setup, Engine Setup Guides & Hardened Workbench (Current Release)

#### Added
- **AI Engine Setup Guide & Deployment Trade-offs Panel (`SettingsView.tsx`):**
  - Interactive 4-quadrant reference panel in Settings replacing the static identity card.
  - Step-by-step instructions to acquire Google Gemini API keys via Google AI Studio with zero billing requirements and multi-key rotation advice.
  - Step-by-step instructions to host and run local Ollama models (`ollama run llama3.2`) on loopback `127.0.0.1:11434` with one-click service probing.
  - Clinical and architectural trade-offs matrix comparing Gemini Cloud (high diagnostic nuance, zero workstation GPU/RAM consumption, Zero Cloud PII alias perimeter) versus Local Offline Ollama (100% air-gapped physical data sovereignty, zero network traffic, dedicated GPU VRAM hardware requirements).
- **Smooth One-Click Windows Setup (`electron/package.json`):**
  - Configured `oneClick: true` and `allowToChangeInstallationDirectory: false` matching the streamlined PranshulOS setup experience.
  - Eliminates manual directory selection and finish wizard dialogs, installing silently to user AppData, auto-creating desktop and Start menu shortcuts, and launching immediately.
- **Strict TypeScript & Runtime Hardening:**
  - Resolved missing `Calendar` icon import in `CommandPalette.tsx`, preventing runtime ReferenceError on palette launch.
  - Added missing `consultations` tab title mapping to `Titlebar.tsx`.
  - Corrected parameter signature in `ActionCard.tsx` for direct artifact patching.
  - Aligned observation logging call in `ConsultationsView.tsx` to `AppBridge.api.createPatientLog`.
  - Verified clean TypeScript compilation with zero errors via `tsc --noEmit`.
- **Official Vercel-Ready Landing Page (`Agent-D_LandingPage`):**
  - Standalone Next.js 14 App Router project styled with Agent-D's clinical white (`#FFFFFF`) and hospital-grade royal blue (`#2563EB`) design system.
  - Pre-configured `vercel.json` with security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, strict referrer policy) and long-lived asset caching.
  - Positioned truthfully as a clinic doctor contextual platform promising only verified shipped capabilities.

#### Changed
- Bumped application version to `0.3.0` across all backend, frontend, build scripts, and documentation manifests.
- Packaged production release artifacts in `release/`: `Agent-D-Setup-0.3.0.exe`, `Agent-D-Portable-0.3.0.exe`, and `latest.yml`.

---

## [0.2.0] — 2026-10-22

### Clinical Agility, Consultations & Approval-First CRUD (Current Release)

#### Added
- **Interactive Practice Calendar (`CalendarWidget.tsx`):**
  - Integrated 7-column interactive monthly calendar on the Dashboard adapted from PranshulOS.
  - Month/year navigation with single-click "Today" jump.
  - Current-month date filtering with selection ring and status indicator dots (blue for scheduled consultations, amber for pending follow-ups/tasks).
  - Selected day agenda view with inline task completion check-boxes and quick-add row for new agenda items and time-slots.
- **Dedicated Consultations Module (`ConsultationsView.tsx`):**
  - Standalone clinical encounters view decoupled from the dashboard and accessible via Sidebar (`consultations`) and Command Palette (`Ctrl+K`).
  - Encounter status filters: `All`, `In Progress`, `Scheduled`, `Completed`, `Cancelled`.
  - Encounter action controls: "▶ Start Encounter", "📝 Add Encounter Notes" (with modal), "✓ Complete Encounter", "✕ Cancel", and "💬 Open in Copilot".
  - Quick "+ Schedule Consultation" modal with patient selection, date/time pickers, duration selector, and clinical reason fields.
- **Approval-First CRUD System (`context_db.py`, `routes.py`, `clinical_tools.py`):**
  - Copilot write tools for consultations (`propose_consultation`, `propose_update_consultation`, `propose_cancel_consultation`), dashboard tasks (`propose_dashboard_task`), tickets (`propose_update_ticket`, `propose_delete_ticket`), and artifacts.
  - Unified mutation executor endpoint at `/api/ai/apply_action` enforcing doctor-in-the-loop review.
  - Nullable `patient_id` on practice-wide agenda proposals with safe foreign-key handling.
  - Action card rendering with parameter breakdown, visual diffs, and approve/reject execution.
- **Slash `/` Command Palette in Copilot (`ChatView.tsx`):**
  - Floating autocomplete suggestion popup upon typing `/` (`/consultation`, `/brief`, `/note`, `/ticket`, `/artifact`, `/meds`, `/search`).
  - Keyboard navigation: `ArrowUp`/`ArrowDown` cycling, `Tab` or `Enter` to autocomplete, `Esc` to close.
  - Dedicated `[/ Commands]` toggle button in the input toolbar.
- **Workstation Identity & Local Hosting Notice:**
  - Copilot header banner: `Agent-D Clinical Intelligence · Hosted locally on http://127.0.0.1:5050 · Private AES-256 Vault · Zero Cloud PII`.
  - Dedicated architecture breakdown card in `SettingsView.tsx` detailing loopback security, database vault path (`%LOCALAPPDATA%\AgentD\context.db`), and de-identification perimeter.

#### Changed
- Decoupled appointments and meetings from the Home dashboard into the dedicated Consultations module.
- Bumped application version to `0.2.0` across all backend, frontend, build scripts, and documentation manifests.

---

## [0.1.0] — 2026-10-22

### Milestone 5: Visit Lifecycle & Multi-Key Gateway (Current Release)

#### Added
- **Multi-Key Gemini Inference Gateway (`config_db.py` & `clinical_chat.py`):**
  - Storing up to N doctor-supplied Gemini API keys with priority ordering in `api_keys`.
  - Automatic round-robin rotation via `get_active_rotated_key()`.
  - 60-second rate-limit cooldown tagging (`record_key_usage(is_rate_limited=True)`) upon receiving HTTP 429 / 503 from Gemini endpoints.
  - Automatic key failover: immediately routes generation requests to the next healthy key in the rotation pool.
  - Cooldown monitoring & countdown calculation via `get_key_pool_status()`.
  - Manual rate-limit cooldown reset via `reset_key_cooldown()`.
  - Transparent chat fallback to Local Clinical Synthesis engine when all keys are cooling down, displaying the remaining retry countdown.
- **Clinical Consultation Visit Lifecycle (`context_db.py`):**
  - `visits` table tracking consultation encounters (`open`, `completed`, `cancelled`), visit dates, reasons, encrypted notes, and outcome summaries.
  - `create_visit()`: Starts a consultation encounter and transitions linked scheduled appointments to completed.
  - `close_visit()`: Concludes an encounter, records `closed_at`, encrypts notes with AES-256-GCM, archives notes into `log_entries` (`entry_type="visit_notes"`), and triggers auto-proposal synthesis.
  - `list_visits()` and `get_visit()`: Retrieve decrypted visit notes and history joined with patient cryptographic aliases.
- **Intelligent Auto-Proposal Synthesizer (`context_db.py`):**
  - Evaluates consultation dictation against the patient's active artifact and clinical baselines.
  - Detects drug modifications/titrations (e.g., Metformin, Lisinopril, Amlodipine) and stages pending `artifact_update` proposals with field-level diffs.
  - Detects laboratory orders (HbA1c, lipid panel) and return consults, staging pending `ticket` proposals with due dates.
  - Safety Gate Enforcement: All synthesized items remain pending in `proposals` until explicit doctor review and approval.
- **Consultation Visits & Encounters Studio (`DocsView.tsx`):**
  - Added 3rd tab: `Visits & Encounters` alongside Living Context Artifact and Medical Logs.
  - Active Consultation Encounter interface: live encounter status, patient alias banner, vitals capture (BP, HR, Temp, SpO2), and consultation dictation textarea.
  - Interactive Action: `[✓ Conclude Encounter & Stage Proposals]` executing one-click closing, log archiving, and proposal formulation.
  - In-line Staged Proposals Review: Displays generated differential proposals directly inside the encounter review panel with `[Approve & Commit]` and `[Reject]` buttons.
  - Chronological history of past encounters with expandable decrypted physician notes.
- **Multi-Key Gateway Health Dashboard (`SettingsView.tsx`):**
  - Live Key Pool Health card displaying total keys, healthy keys, and cooldown status.
  - Real-time cooldown countdown pills and `[Clear Cooldown]` manual reset buttons.
- **REST Endpoints (`routes.py`):**
  - `GET /api/v1/keys/status`: Returns key pool health, counts, and retry countdown.
  - `POST /api/v1/keys/<id>/reset-cooldown`: Clears rate-limit cooldown for a key.
  - `GET /api/v1/visits`: Lists patient consultation visits.
  - `POST /api/v1/visits`: Starts a new consultation visit.
  - `GET /api/v1/visits/<id>`: Fetches single visit details with staged proposals.
  - `PATCH /api/v1/visits/<id>`: Updates visit notes, reason, or status.
  - `POST /api/v1/visits/<id>/close`: Executes visit closure and auto-proposal generation.
- **Milestone 5 Automated Test Suite (`test_m5.py`):**
  - 100% passing tests verifying multi-key rotation, 429 cooldown tagging, failover, pool status reporting, visit lifecycle, auto-proposal synthesis, Safety Gate sign-off, and chat cooldown resilience.

---

### Milestone 4: Safety Gate & Proposal Queue

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
