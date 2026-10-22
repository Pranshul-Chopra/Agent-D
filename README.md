# Agent-D — Clinical Copilot Workstation

> **Version:** `0.2.0` (Milestones 0–5 Completed; Calendar, Consultations & Slash Commands Active)  
> **Status:** Local-First Clinical Workstation with Cryptographic Vault, Context Artifacts, Conversational Command Center, Doctor-in-Control Proposal Safety Gate, and Consultation Visit Lifecycle with Multi-Key Gateway

Agent-D is a local-first, privacy-focused conversational clinical workstation designed for physicians. It pairs local cryptographic data storage with an intelligent clinical copilot to help doctors manage patient context, review historical visits, curate structured clinical artifacts, track follow-up actions on a Kanban board, and dictate consultation observations without exposing sensitive patient health information to cloud LLMs.

---

## Visual Design System

Agent-D operates on a strict clinical design system:
- **90% White Canvas:** Crisp `#FFFFFF` surfaces with subtle `#F8FAFC` slate backgrounds for low eye-strain in clinic lighting.
- **Hospital-Grade Blue Accents:** High-visibility `#2563EB` interactive primary buttons (hover `#1D4ED8`) and `#EFF6FF` soft selection fills.
- **High-Contrast Dark Typography:** Crisp `text-slate-900` headings and `text-slate-700` body text for readability. Zero low-contrast grey text.
- **Subtle White-Grey Borders:** Clean `#E2E8F0` dividers defining panels, cards, and data tables.

---

## Architectural Stack

```
┌────────────────────────────────────────────────────────┐
│               Electron v44 Native Shell                │
│  - contextIsolation: true, nodeIntegration: false      │
│  - Secure IPC Preload Bridge (window.electronEnv)      │
│  - Dynamic 32-Byte Per-Launch Bearer Token Generator   │
└──────────────────────────┬─────────────────────────────┘
                           │ IPC / Localhost HTTP
┌──────────────────────────▼─────────────────────────────┐
│             React 19 + TypeScript + Vite 8             │
│  - Tailwind CSS 3.4 Clinical Design Tokens             │
│  - Real-Time SSE Token Streaming & Typing Indicator    │
│  - Interactive Proposal & Diff Cards ([Approve]/[Reject])│
│  - Structured Artifact Studio & Visual Diff Modal      │
│  - Clinical Kanban Board & Patients Directory          │
└──────────────────────────┬─────────────────────────────┘
                           │ HTTP + Bearer Token
┌──────────────────────────▼─────────────────────────────┐
│                 Python 3.13 + Flask 3                  │
│  - Token Authorization Middleware (401 on violation)   │
│  - Cryptographic Perimeter & Local Origin Check        │
│  - Live Practice Temporal Grounding Engine             │
│  - Medical Tool Layer (Direct Reads / Proposal Writes) │
│  - Multi-Key Gemini Rotation & Cooldown Manager        │
└──────────────────────────┬─────────────────────────────┘
                           │
           ┌───────────────┴───────────────┐
           ▼                               ▼
┌──────────────────────┐       ┌──────────────────────┐
│      config.db       │       │      context.db      │
│  - App Settings      │       │  - AES-256-GCM Vault │
│  - Multi-Key Vault   │       │  - PT-XXXX Aliases   │
│  - Key Usage/Cooldown│       │  - Patient Artifacts │
│  - Prompt Templates  │       │  - Artifact Versions │
│  - Schema App State  │       │  - Medical Logs      │
│  (WAL Mode Enabled)  │       │  - Log Revisions     │
│                      │       │  - Chat Sessions     │
│                      │       │  - Encrypted Messages│
│                      │       │  - Practice Appts    │
│                      │       │  - Clinical Tickets  │
│                      │       │  - Staged Proposals  │
│                      │       │  - Audit Trail       │
│                      │       │  (WAL Mode Enabled)  │
└──────────────────────┘       └──────────────────────┘
```

---

## Accomplishments Summary (Milestones 0–4)

All features listed below are **fully implemented, tested, and working in the codebase right now**.

### 1. Security & Cryptographic Vault (Milestone 1)
- **AES-256-GCM Encryption at Rest:** Patient legal names, telephone numbers, email addresses, and confidential medical observations are authenticated and encrypted using PBKDF2-HMAC-SHA256 (100,000 iterations) with a machine-bound hardware key. Direct PII is never stored in plaintext.
- **Per-Launch Bearer Token Authorization:** A cryptographically secure 32-byte token is minted by Electron upon startup and passed via IPC preload. All Flask API endpoints reject unauthorized requests with HTTP `401 Unauthorized`.
- **Perimeter Defense:** Enforces strict localhost/127.0.0.1 binding, `Sec-Fetch-Site: cross-site` blocking, and DNS rebinding prevention.
- **Automatic De-Identification (Alias Mapper):** Assigns non-colliding clinical aliases (e.g. `PT-7821`) to patients. Only aliases are used in model prompts, ensuring patient legal names never reach external AI providers.
- **Dual Local SQLite Storage:** Isolated in `%LOCALAPPDATA%\AgentD\`:
  - `config.db`: Application configuration, multi-key Gemini vault, rotation statistics, and prompt templates.
  - `context.db`: Encrypted patient directory, clinical artifacts, version snapshots, medical logs, chat sessions, tickets, proposals, and audit logs.

### 2. Patients Directory & Vault Manager
- **Complete Patient Directory:** Fast search across decrypted names, aliases, phone, or email with active/archived status tabs.
- **Patient Registration Modal:** Add new patients with full demographics (DOB, gender, blood group, contact info) and initial clinical chief complaints with instant encryption and sequential alias assignment.
- **Active Session Chart:** Set any patient as the active workstation chart, synchronizing clinical context across the Copilot, Artifacts Studio, and Kanban board.

### 3. Patient Context Artifacts & Medical Logs (Milestone 2)
- **Structured JSON Artifact Studio:** Form fields for Clinical Profile Summary, Active Diagnoses, Current Medications, Watch-For Alerts, Follow-ups, and Private Notes.
- **Immutable Snapshot History:** Every save writes an immutable snapshot row into `artifact_versions` with version numbering, author tag (`doctor_manual` vs `proposal_approved`), and change summary.
- **1-Click Snapshot Restore:** Revert the active artifact to any prior version snapshot via `POST /api/v1/patients/<id>/artifact/restore/<ver>`.
- **Visual Diff Engine & Viewer (`ArtifactDiffModal.tsx`):** Structured diff engine comparing any two snapshots side-by-side with color-coded tags (`Added`, `Removed`, `Unchanged`, `Prescribed`, `Discontinued`).
- **Medical Observations & Logs:** Chronological clinical logs table with vitals capture builder (BP, HR, Temp, SpO2) and audit-compliant amendment history.

### 4. Conversational Command Center (Milestone 3)
- **Live Practice Temporal Grounding (`clinical_context.py`):** Injects workstation time, today's schedule, pending tickets, and active patient chart envelope into every LLM consultation prompt while strictly omitting legal identities.
- **Server-Sent Events (SSE) Streaming (`clinical_chat.py`):** Real-time token streaming with live typing animation, "Stop Generating" cancellation button, and markdown formatting.
- **Local Clinical Synthesis Engine:** Intelligent local clinical synthesis when operating offline or before a Gemini API key is configured.
- **Patient-Scoped Chat Sessions:** Database-backed sessions with AES-256-GCM encrypted message history and 1-click thread deletion.
- **Clinical Prompt Chips:** 1-click execution chips (*☀️ Morning Practice Brief*, *🩺 Next Patient Brief*, *💊 Medication Review*, *📝 Dictate Visit Notes*).
- **Reactive Practice Dashboard (`HomeView.tsx`):** Real-time aggregation of active patients, today's appointments, open follow-ups, and next patient pointer.

### 5. Safety Gate & Doctor-in-Control Proposal Queue (Milestone 4)
- **Medical Tool Layer (`clinical_tools.py`):**
  - Read tools: `get_today_agenda()`, `get_next_patient()`, `get_patient_artifact()`, `get_patient_logs()`, `get_open_tickets()`.
  - Write tools (PROPOSALS ONLY): `propose_artifact_update()`, `propose_log_entry()`, `propose_ticket()`, `propose_reminder()`.
- **Safety Gate Guarantee:** AI write actions stage pending proposals in `context.db` and **NEVER mutate live clinical records directly**.
- **Interactive Proposal & Diff Cards (`ActionCard.tsx`):** Renders proposed field diffs in the chat stream with `[✓ Approve & Commit]` and `[✕ Reject]` buttons.
- **Approval Engine:** Clicking Approve automatically commits changes to artifacts, logs, or tickets and writes an entry into `audit_events`.
- **Clinical Kanban Board (`BoardView.tsx`):** 4-column clinical workflow (*To Do / Ordered*, *In Progress*, *Under Review*, *Completed*) backed by `context.db` tickets.

### 6. Visit Lifecycle & Multi-Key Gateway (Milestone 5)
- **Multi-Key Gemini Inference Gateway (`config_db.py` & `clinical_chat.py`):**
  - Doctors configure multiple Gemini API keys with priority ordering.
  - Round-robin key selection with automatic failover upon encountering HTTP 429 / 503 rate limits.
  - 60-second rate-limit cooldown tagging (`record_key_usage(is_rate_limited=True)`).
  - Key pool health reporting (`get_key_pool_status()`) and manual cooldown reset (`reset_key_cooldown()`).
  - Transparent chat fallback to Local Clinical Synthesis with retry countdown notifications when all keys are in cooldown.
- **Consultation Visit Lifecycle (`context_db.py`):**
  - Encounters table tracking clinical visits (`open`, `completed`, `cancelled`), reasons, encrypted doctor notes, and outcome summaries.
  - Starting a visit links to scheduled appointments and sets active encounter status.
  - Concluding a visit (`POST /api/v1/visits/<id>/close`):
    - Encrypts consultation notes with AES-256-GCM.
    - Archives encounter notes to medical log entries (`entry_type="visit_notes"`).
    - Auto-generates differential proposals (`synthesize_visit_proposals()`) for medication titrations and follow-up lab tickets.
- **Visits & Encounters Studio (`DocsView.tsx`):**
  - Dedicated 3rd tab for Consultation Visits alongside Living Artifact and Medical Logs.
  - Active consultation interface with vital signs capture (BP, HR, Temp, SpO2) and dictation textarea.
  - 1-click `[✓ Conclude Encounter & Stage Proposals]` action.
  - In-line staged proposals review and doctor approval.
  - Historical encounter log with expandable decrypted notes.
- **Gateway Health Dashboard (`SettingsView.tsx`):**
  - Live Key Pool Health card showing healthy vs cooling down keys.
  - Cooldown countdown badges with `[Clear Cooldown]` manual reset buttons.

---

## Verification & Automated Test Suites

The entire backend and frontend have automated test coverage:

```bash
# Milestone 1: Security perimeter, encryption at rest, patient CRUD, token auth
python test_m1.py

# Milestone 2: Artifacts, version snapshots, visual diff engine, medical logs
python test_m2.py

# Milestones 3, 4 & 5: Live practice context, chat SSE streaming, safety gate, visits, multi-key gateway
python -m unittest test_m3.py test_m4.py test_m5.py

# React Frontend Compile & Vite Bundle:
npm --prefix electron run build:ui
```

All test suites pass with **100% success**.

---

## Running Agent-D Locally

### Prerequisites
- Python 3.11+
- Node.js 20+

### Development Mode

1. **Install backend dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Install frontend dependencies:**
   ```bash
   cd electron
   npm install
   ```

3. **Build React SPA bundle:**
   ```bash
   npm run build:ui
   ```

4. **Launch Electron Desktop App:**
   ```bash
   npm start
   ```
