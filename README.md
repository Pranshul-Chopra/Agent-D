# Agent-D — Clinical Copilot Workstation

> **Version:** `0.1.0` (Milestone 2 Completed)  
> **Status:** Local-First Clinical Workstation with AES-256-GCM Vault, Patient Context Artifacts, Visual Diff Engine, and Medical Observations

Agent-D is a local-first, privacy-focused conversational clinical workstation designed for physicians. It pairs local cryptographic data storage with an intelligent clinical copilot to help doctors manage patient context, review historical visits, curate structured clinical artifacts, track follow-up actions on a Kanban board, and dictate consultation observations without exposing sensitive patient health information to cloud LLMs.

---

## Visual Design System

Agent-D operates on a strict clinical design system:
- **90% White Canvas:** Crisp `#FFFFFF` surfaces with subtle `#F8FAFC` slate backgrounds for low eye-strain in clinic lighting.
- **Hospital-Grade Blue Accents:** High-visibility `#2563EB` interactive primary buttons (hover `#1D4ED8`) and `#EFF6FF` soft selection fills.
- **High-Contrast Dark Typography:** Crisp `text-slate-900` headings and `text-slate-700` body text for readability.
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
│  - View Transitions Navigation Engine                  │
│  - Structured Artifact Studio & Visual Diff Modal      │
│  - Clinical Kanban Board & Patients Directory          │
└──────────────────────────┬─────────────────────────────┘
                           │ HTTP + Bearer Token
┌──────────────────────────▼─────────────────────────────┐
│                 Python 3.13 + Flask 3                  │
│  - Token Authorization Middleware (401 on violation)   │
│  - Cryptographic Perimeter & Local Origin Check        │
│  - Multi-Key Gemini Rotation Manager                   │
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
│                      │       │  - Audit Trail       │
│                      │       │  (WAL Mode Enabled)  │
└──────────────────────┘       └──────────────────────┘
```

---

## Current Accomplishments (Milestones 0, 1, and 2)

All features listed below are **fully implemented, tested, and working in the codebase right now**.

### 1. Security & Cryptographic Vault (Milestone 1)
- **AES-256-GCM Encryption at Rest:** Patient legal names, telephone numbers, email addresses, and confidential medical observations are authenticated and encrypted using PBKDF2-HMAC-SHA256 (100,000 iterations) with a machine-bound hardware key. Direct PII is never stored in plaintext.
- **Per-Launch Bearer Token Authorization:** A cryptographically secure 32-byte token is minted by Electron upon startup and passed via IPC preload. All Flask API endpoints reject unauthorized requests with HTTP `401 Unauthorized`.
- **Perimeter Defense:** Enforces strict localhost/127.0.0.1 binding, `Sec-Fetch-Site: cross-site` blocking, and DNS rebinding prevention.
- **Automatic De-Identification (Alias Mapper):** Assigns non-colliding clinical aliases (e.g. `PT-7821`) to patients. Only aliases are used in model prompts, ensuring patient legal names never reach external AI providers.
- **Dual Local SQLite Storage:** Isolated in `%LOCALAPPDATA%\AgentD\`:
  - `config.db`: Application configuration, multi-key Gemini vault, rotation statistics, and prompt templates.
  - `context.db`: Encrypted patient directory, clinical artifacts, version snapshots, medical logs, and audit logs.

### 2. Patients Directory & Vault Manager
- **Complete Patient Directory:** Fast search across decrypted names, aliases, phone, or email with active/archived status tabs.
- **Patient Registration Modal:** Add new patients with full demographics (DOB, gender, blood group, contact info) and initial clinical chief complaints with instant encryption and sequential alias assignment.
- **Active Session Chart:** Set any patient as the active workstation chart, synchronizing clinical context across the Copilot, Artifacts Studio, and Kanban board.
- **Demographic Drawer:** Slide-out profile inspector detailing vault protection status, medical metadata, and one-click actions.

### 3. Patient Context Artifacts & Versioning (Milestone 2)
- **Structured JSON Artifact Studio:** Form fields for:
  - Clinical Profile Summary (primary model ingestion context)
  - Active Conditions & Diagnoses list (with add/delete)
  - Current Medications & Dosages list (with add/delete)
  - Watch-For Clinical Inquiries & In-Flight Alerts
  - Follow-ups & Recalls with scheduled due dates
  - Confidential Physician Notes
- **Immutable Snapshot History:** Every save writes an immutable snapshot row into `artifact_versions` with version numbering, author tag (`doctor_manual` vs `proposal_approved`), and change summary.
- **1-Click Snapshot Restore:** Revert the active artifact to any prior version snapshot via `POST /api/v1/patients/<id>/artifact/restore/<ver>`.

### 4. Visual Diff Generator & Viewer (Milestone 2)
- **Structured Diff Engine:** Compares any two version snapshots (or historical versions against current active).
- **Field-by-Field Visual Diff:**
  - Clinical Summary and Notes diff (showing previous vs updated text)
  - Active Issues diff (pills tagged as `Added`, `Removed`, or `Unchanged`)
  - Medications diff (pills tagged as `Prescribed`, `Discontinued`, or `Unchanged`)
  - Watch-For Alerts and Follow-ups diff
- **Diff Modal (`ArtifactDiffModal.tsx`):** Unified visual interface accessible directly from the version history drawer.

### 5. Medical Observations & Dated Log Entries (Milestone 2)
- **Chronological Medical Timeline:** View dated clinical observations, lab notes, symptom reports, and vital signs.
- **Vitals Capture Builder:** Dedicated inputs for Blood Pressure (`mmHg`), Heart Rate (`bpm`), Temperature (`°F`), and Pulse Ox / `SpO2 (%)`.
- **Audit-Compliant Amendment Tracking:** Editing an existing observation archives the previous text into `log_entry_versions` alongside a mandatory physician amendment reason.

### 6. Clinical Follow-ups Kanban Board
- **4-Stage Pipeline:** Visual columns for *To Do / Ordered*, *In Progress*, *Under Review*, and *Completed*.
- **Clinical Cards:** Display patient tags (`PT-XXXX`), priority pills (Critical, High, Medium, Low), due dates, and category tags.
- **Interactive Movement:** Move tickets forward and backward across stages with optimistic UI updates.
- **New Action Item Modal:** Create lab orders, specialist referrals, medication reconciliations, and chart reviews.

### 7. Clinical Command Palette & Navigation
- **Command Palette (`Ctrl+K`):** Jump to any clinical module, search patient charts by name or alias, or launch quick clinical actions (*☀️ Morning Practice Brief*, *🩺 Next Patient Brief*, *Register Patient*, *Create Action Item*).
- **Global Keyboard Shortcuts:**
  - `Ctrl+1`: Clinical Copilot
  - `Ctrl+2`: Practice Dashboard
  - `Ctrl+3`: Patients Manager
  - `Ctrl+4`: Patient Artifacts Studio
  - `Ctrl+5`: Clinical Follow-ups Board
  - `Ctrl+6`: Settings & Security Vault
  - `Ctrl+B`: Toggle Sidebar Collapse

---

## What is NOT Yet Accomplished (Upcoming Milestones)

To maintain absolute documentation integrity, the following features are **explicitly in progress or scheduled for subsequent milestones**:
- **Milestone 3 (In Progress):** Patient-scoped SSE streaming AI chat pipeline, live practice temporal injection, and decommissioning legacy PM Tool chat/database remnants.
- **Milestone 4:** Full Doctor-in-Control Proposal Review Queue with side-by-side diff approval cards in the chat stream.
- **Milestone 5:** Consultation "Close Visit" auto-proposal generator, appointment scheduler, and automated pre-visit brief runner.
- **Milestone 6:** Standalone PyInstaller Windows binary packaging, automated database backup/restore verification, and production release build.

---

## Getting Started

### Prerequisites
- **Python:** 3.10+ (tested on Python 3.13)
- **Node.js:** 20+ and `npm`
- **Operating System:** Windows 10/11 (supported in local development mode)

### Installation

1. **Clone & Set Up Python Virtual Environment:**
   ```powershell
   git clone <repo-url> Agent-D
   cd Agent-D
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

2. **Install Frontend Dependencies & Build UI:**
   ```powershell
   cd electron
   npm install
   npm run build:ui
   cd ..
   ```

3. **Run Automated Test Verification Suites:**
   ```powershell
   # Verify Milestone 1 (Cryptographic Vault & Perimeter)
   python test_m1.py

   # Verify Milestone 2 (Context Artifacts, Visual Diff, Medical Logs)
   python test_m2.py
   ```

4. **Launch Application in Development:**
   ```powershell
   # Terminal 1: Launch Flask Backend
   python main.py

   # Terminal 2: Launch Electron Shell
   cd electron
   npm run dev:ui    # For live Vite HMR
   npm start         # For full Electron window
   ```

---

## License & Privacy
Private clinical software for physician workstation use. Patient health data is encrypted locally using AES-256-GCM. Direct identifiers never leave the device.
