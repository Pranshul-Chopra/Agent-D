# Changelog

All notable changes, architectural adaptations, additions, and refactorings to **Agent-D** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] — 2026-10-21

### Milestone 2: Context Artifacts & Medical Logs (Current Release)

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
  - Restricts origin to `127.0.0.1` and `localhost` to eliminate DNS rebinding attacks.
- **Dual SQLite Database Architecture:**
  - Isolated in `%LOCALAPPDATA%\AgentD\`:
    - `config.db`: Managed by `config_db.py` in WAL mode (app settings, Multi-Key Gemini vault, rotation statistics, and prompt templates).
    - `context.db`: Managed by `context_db.py` in WAL mode (encrypted patient records, clinical artifacts, version snapshots, medical logs, and audit trail).
- **Automated Clinical Alias Mapper:**
  - Non-colliding `PT-XXXX` alias generation.
  - Replaces direct patient identifiers before external LLM transmission.
- **Automated Milestone 1 Verification Test Suite (`test_m1.py`):**
  - 100% verification across database initialization, bearer token authorization, patient creation, and AES-256-GCM encryption at rest.

---

### Milestone 0: Fork, Purge & Clean Rebrand

#### Added
- Forked codebase structure from `pm_tool` into `Agent-D`.
- Native titlebar, sidebar navigation, and Electron-Flask process supervision with automatic stdout handshake (`[AGENT_D_HANDSHAKE]`).

#### Removed
- Purged software project management modules:
  - `data_engine.py` (Data Studio SQL engine)
  - `rag/` (document ingestion and BM25 chunking)
  - `ports/` (hexagonal adapters for external SaaS)
  - `tools/outposts/` (Jira, Notion, Google Docs outposts)
  - `tools/story_decomposer.py` (Agile story decomposition tool)
  - `tools/analytics_engine.py` (KPI analytics engine)
  - `templates/` (legacy multi-frame Jinja2 HTML templates)
