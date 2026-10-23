# Agent-D: Unified Compliance Architecture & Privacy-First Implementation Proposal

> **Prepared:** October 23, 2026  
> **Target Release:** Agent-D v0.5.0  
> **Document Purpose:** Engineering Specification & Regulatory Union Proposal  
> **Status:** Working Architectural Proposal — **Subject to review by qualified legal counsel**.

---

## Executive Summary

This proposal unifies the **Legal and Regulatory Risk Assessment (October 2026)** with the clinic's core architectural directives. It transitions Agent-D from a broad clinical record processor into a **strictly bounded, token-only administrative assistant on the cloud, complemented by an on-device local model (Ollama) for clinical synthesis**.

Under this proposal:
1. **Zero Patient Health Information (PHI) Crosses the Network:** The cloud model never sees patient names, diagnoses, medications, active issues, or vitals. It receives *only* cryptographic token IDs (`PT-XXXX`) and consultation timestamps.
2. **Single Egress Choke Point (`cloud_egress.py`):** Every outgoing cloud model request routes through a single validated egress function enforcing a strict schema allowlist, rejecting unknown fields, and scrubbing user chat messages and tool results before transmission.
3. **Canary String Verification:** Automated regression tests (`test_canary_egress.py`) inject fake patient names, fake drugs, fake phones, and fake diagnoses, verifying that zero canary data ever leaks into outgoing payloads across chat replay, briefs, or proposals.
4. **Hybrid Model Architecture (Cloud + Local Ollama):**
   - **Cloud Gemini (Paid Tier):** Fast administrative scheduling, calendar management, and consultation slot density.
   - **Local Ollama (Air-Gapped Loopback):** Pre-visit clinical briefs, "what to look for", diagnosis summaries, and medication reviews—executed 100% locally with zero internet egress.
5. **Realistic Free-Tier Governance:** Because Gemini API keys (`AIzaSy...`) do not encode billing status and cannot be verified automatically, governance relies on an **explicit physician attestation checkbox**, persistent UI badges, and a formal written B2B agreement.
6. **Accurate Google Cloud Terms:** Reflects exact Gemini API terms: Paid usage prohibits model training on prompts/responses, but logs are temporarily retained for abuse monitoring (with potential human review of policy violations). Vertex AI is required for absolute Zero Data Retention (ZDR). Our token-only boundary ensures zero PHI is exposed even within temporary abuse logs.
7. **Onboarding Audit Trail & Intended Use:** The in-app compliance click-through provides an internal audit trail and configuration acknowledgment. The software's Intended Use is explicitly defined for administrative scheduling and de-identified synthesis under physician oversight, avoiding blanket non-device disclaimers and leaving formal CDSCO classification to counsel.

---

## 1. Strict Token-Only Privacy Architecture

### 1.1 The Zero-PHI Cloud Boundary & Single Choke Point
To eliminate exposure under the **IT Act 2000 (SPDI Rules 2011)** and the **DPDP Act 2023**, the payload transmitted to cloud LLMs is stripped of all clinical and personal identifiers and routed through a single egress choke point:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             PHYSICIAN WORKSTATION                                │
│                                                                                  │
│  ┌─────────────────────────────────┐        ┌─────────────────────────────────┐  │
│  │   Decrypted Local Vault (DB)    │        │    React UI (In-Memory Only)    │  │
│  │   - Name: Sarah Jenkins         │        │    - Renders: Sarah Jenkins     │  │
│  │   - Token: PT-4819              │        │    - Resolves PT-4819           │  │
│  │   - Vitals, Meds, Notes         │        │    - Pinned Living Artifact     │  │
│  └────────────────┬────────────────┘        └────────────────▲────────────────┘  │
│                   │ (Local synthesis only)                   │                   │
│                   ▼                                          │ Token Hydrator    │
│  ┌─────────────────────────────────┐                         │ (TypeScript)      │
│  │   Local Ollama (Air-Gapped)     │                         │                   │
│  │   - Pre-visit briefs            │                         │                   │
│  │   - "What to look for"          │                         │                   │
│  │   - 100% On-Device / 0 B Egress │                         │                   │
│  └─────────────────────────────────┘                         │                   │
│                   │                                          │                   │
│                   ▼ (Administrative prompts only)            │                   │
│  ┌────────────────────────────────────────────────────────┐  │                   │
│  │ SINGLE EGRESS CHOKE POINT (cloud_egress.py)            │  │                   │
│  │ 1. Schema Validation (Rejects unknown/extra fields)    │  │                   │
│  │ 2. Scrubber (Doctor input, prior history, canaries)    │  │                   │
│  │ 3. Pre-flight Zero-PHI Verification Gate               │  │                   │
│  │ 4. Permits ONLY: PT-XXXX + Consultation Timestamps     │  │                   │
│  └────────────────────────┬───────────────────────────────┘  │                   │
│                           │                                  │                   │
└───────────────────────────┼──────────────────────────────────┼───────────────────┘
                            │ HTTPS (TLS 1.3)                  │
                            ▼                                  │
            ┌───────────────────────────────┐                  │
            │  Cloud AI Provider (Gemini)   │                  │
            │  - Sees: PT-4819 @ 10:30 AM   │──────────────────┘
            │  - Zero Legal PII             │ Responses refer strictly
            │  - Zero Diagnoses / Meds      │ to tokens (e.g. "PT-4819")
            │  - Short-term abuse logs have │
            │    zero health data           │
            └───────────────────────────────┘
```

### 1.2 Strict Prompt Field Allowlist
The prompt construction engine in `clinical_context.py` enforces a strict allowlist:

| Field Category | Cloud Copilot Status | Local Ollama Status | Implementation Details |
| :--- | :--- | :--- | :--- |
| **Patient Identifier** | **TOKEN ONLY** | **Full Local** | Transmitted strictly as cryptographic token (`PT-XXXX`). Legal names, phone numbers, emails, and DB UUIDs are blocked. |
| **Consultation Timestamps** | **ALLOWED** | **Allowed** | Scheduled date, start time, duration, and status (`scheduled`, `completed`, `cancelled`). |
| **Encounter Type** | **ALLOWED** | **Allowed** | Generic administrative category: `consultation`, `follow_up`, `routine_checkup`. |
| **Patient Demographics** | **BLOCKED** | **Allowed** | DOB, age, gender, blood group, address, and contact info are completely excluded from cloud egress. |
| **Clinical Diagnoses & History** | **BLOCKED** | **Allowed** | Active issues, medical history, and problem lists are omitted from cloud prompt; processed locally in Ollama. |
| **Medication Regimens** | **BLOCKED** | **Allowed** | Drug names, dosages, and frequencies are barred from cloud egress. |
| **Vital Signs & Observations** | **BLOCKED** | **Allowed** | Blood pressure, heart rate, SpO2, and temperatures are omitted from cloud egress. |
| **Encounter Free-Text Notes** | **BLOCKED** | **Allowed** | Physician clinical observations and SOAP notes are kept 100% on-device. |

### 1.3 User Message & Tool Output Scrubber
Allowlisting injected context is insufficient because doctors routinely type patient names, phone numbers, and clinical symptoms directly into chat.
- **Pre-send User Message Scrubbing:** When the doctor types *"Check Eleanor Vance, call her at 9876543210 regarding Lisinopril"*, `cloud_egress.scrub_text` dynamically matches registered patient identities from `context_db`, phone regexes, and email patterns, transforming the payload into: *"Check PT-1001, call her at [REDACTED_PHONE] regarding [REDACTED_CLINICAL_TERM]"*.
- **Tool Result Scrubbing:** Any proposal details or tool execution results included in multi-turn replay are recursively scrubbed before egress.
- **Canary String Pre-flight Gate:** A final verification check serializes the sanitized payload to JSON and aborts with `EgressSecurityError` if any forbidden canary or registered patient name is detected.

### 1.4 Client-Side Token Hydrator (TypeScript)
When Copilot streams an administrative briefing mentioning `PT-4819`:
1. The backend streams the raw token: `• 10:30 AM — PT-4819 (Consultation)`.
2. A React markdown post-processor (`TokenHydrator.tsx`) scans for the regex `/(PT-\d{4,6})/g`.
3. It looks up `PT-4819` in the local active patient map (`patientsMap[alias]`).
4. It renders an interactive chip in the UI: `[ 👤 Sarah Jenkins (PT-4819) ]` with an icon, hover details, and a 1-click jump to open her local chart.
5. **Security Guarantee:** The cloud model generated the response referring only to `PT-4819`. The patient's legal identity was resolved entirely within local browser memory.

---

## 2. Product Architecture & Scope Partition: Cloud vs Local

### 2.1 The Product Tradeoff Decision
A cloud Copilot restricted solely to scheduling is the safest legal configuration, but it removes the primary feature physicians desire: **pre-visit clinical briefs and "what to look for"**. Those require clinical diagnoses, medications, and vitals.

Agent-D resolves this with an explicit **Hybrid Model Partition**:

| Feature Area | Processing Engine | Data Flow | Privacy Guarantee |
| :--- | :--- | :--- | :--- |
| **Daily Practice Schedule & Agenda** | Cloud Gemini (Paid) | Token `PT-XXXX` + Times | Zero PHI over network |
| **Consultation Slot Management** | Cloud Gemini (Paid) | Token `PT-XXXX` + Times | Zero PHI over network |
| **Practice Dashboard Tasks** | Cloud Gemini (Paid) | Generic administrative tasks | Zero PHI over network |
| **Pre-Visit Briefings** | Local Ollama / Offline Synthesis | Decrypted local RAM | 0 bytes leave computer |
| **"What to Look For" Differential Alerts**| Local Ollama / Offline Synthesis | Decrypted local RAM | 0 bytes leave computer |
| **Active Medication & Interaction Review**| Local Ollama / Offline Synthesis | Decrypted local RAM | 0 bytes leave computer |
| **SOAP Encounter Note Synthesis** | Local Ollama / Offline Synthesis | Decrypted local RAM | 0 bytes leave computer |

This architecture gives the clinic a clear, uncompromised path to generative AI: the doctor gets rich clinical pre-visit briefs on-premise without exposing sensitive health data to third-party cloud infrastructure.

### 2.2 Tool Layer Refactoring (`clinical_tools.py`)
- **Cloud Tool Allowlist:** `get_today_agenda()`, `propose_consultation()`, `propose_update_consultation()`, `propose_cancel_consultation()`, `propose_dashboard_task()`.
- **Local Tool Allowlist:** `propose_artifact_update()`, `propose_ticket()`, `propose_reminder()`, `get_patient_artifact()`, `get_patient_logs()`.

---

## 3. Mandatory Onboarding Compliance & Governance

### 3.1 In-App Compliance Step in `OnboardingModal.tsx`
Before launching the workstation, the attending physician must complete **Step 0: Regulatory Compliance & Clinical Boundary Notice**.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   Agent-D Clinical Compliance & Governance             │
│                                                                        │
│  [!] Notice to Attending Healthcare Practitioner                       │
│                                                                        │
│  Intended Use: Agent-D is intended for administrative consultation     │
│  organization, calendar planning, and de-identified workflow synthesis │
│  under the supervision of a licensed physician. Formal regulatory      │
│  device classification (CDSCO/MDR) remains subject to counsel review.  │
│                                                                        │
│  [x] Token-Only Cloud Architecture Acknowledgment                      │
│      I understand that cloud AI receives only de-identified patient    │
│      tokens (PT-XXXX) and consultation timestamps. No medical records, │
│      diagnoses, or legal names leave this computer.                    │
│                                                                        │
│  [x] Paid-Tier Enterprise API Attestation                              │
│      I certify that all configured Gemini API keys are linked to a     │
│      paid Google Cloud project with commercial terms (no model         │
│      training). Free-tier keys are prohibited with real patient data.  │
│                                                                        │
│  [x] Physician Final Clinical Authority                                │
│      I retain sole clinical responsibility for patient diagnosis, care,│
│      and prescriptions. Agent-D suggestions require my explicit review.│
│                                                                        │
│  [x] Patient Notice & Consent Compliance                               │
│      I confirm that our clinic provides patient privacy notices and    │
│      obtains necessary consent under applicable healthcare regulations.│
│                                                                        │
│                         [ Decline ]  [ Accept & Continue -> ]          │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Audit Trail vs Written Contract
- **Audit Trail:** Checkbox acceptance is cryptographically hashed with a timestamp and saved in `config.db` under `compliance_agreements`.
- **Standalone B2B Contract:** The in-app click-through serves as an operational audit trail, but does **not** replace the formal written contract between the software developer and the clinic. The written agreement will formally govern indemnification, liabilities, regulatory compliance, and support boundaries.

---

## 4. Paid-Tier API Terms & Abuse Retention Policy

### 4.1 Exact Google Cloud Gemini Terms
Official Google Gemini documentation clarifies key legal distinctions:
1. **Model Training:** Under the *Gemini API Additional Terms of Service* (Paid Services) and *Google APIs Terms of Service*, Google does **not** use customer prompts (including system instructions and files) or generated responses to train Google AI models.
2. **Abuse Monitoring Retention:** For paid services, Google logs prompts and responses for a limited period solely for detecting violations of the Prohibited Use Policy. Authorized Google reviewers may assess flagged content if an abuse filter is triggered.
3. **Zero Data Retention (ZDR):** Absolute Zero Data Retention and formal HIPAA Business Associate Agreements (BAA) / Google Cloud Data Processing and Security Terms are available through Google Cloud Vertex AI.
4. **Impact on Agent-D:** Because short-term abuse logs exist on the Gemini developer API, **zero clinical records or PHI must ever reach it**. Our token-only boundary (`PT-XXXX` only) ensures that even within abuse monitoring logs, no patient health data or personal identities exist.

### 4.2 Key Tier Governance: Attestation over Automated Detection
- **Technical Reality:** A 39-character Gemini API key (`AIzaSy...`) has no syntactic differences between free and paid tiers. Automated programmatic detection of billing status from the key alone is not feasible.
- **Governance Guardrail:**
  - Mandatory physician attestation checkbox during key entry and onboarding.
  - Prominent UI badge: `🟢 Paid Cloud (Attested - DPA Terms)` vs `🏠 Local Offline (Ollama Loopback)`.
  - Clear persistent warning: *"Free-tier Gemini keys allow provider data review and training and must never be used with patient data."*

---

## 5. Disability Guidelines & Accessibility Protections

### 5.1 Legal & Human Rights Framework
In compliance with the **Rights of Persons with Disabilities (RPwD) Act, 2016** (India) and **DPDP Act, 2023 Section 9**:
- Healthcare practitioners have an affirmative legal duty to ensure persons with disabilities receive information and consent notices in accessible, barrier-free formats.
- For patients under legal guardianship or with intellectual disabilities, verifiable consent must be provided by their designated legal guardian or healthcare proxy.

### 5.2 Application Accessibility Standards
1. **Visual Accessibility (WCAG 2.1 AA Compliance):** High-contrast clinical typography (`text-slate-900` on `#FFFFFF`, minimum contrast ratio 4.5:1), zero low-contrast grey-on-grey text, and ARIA labels on all icon-only buttons.
2. **Motor Accessibility (Keyboard-First Workstation):** Full application navigable without a mouse: Universal Command Palette (`Ctrl+K`), quick tab switches (`Ctrl+1` through `Ctrl+6`), and slash command auto-complete.
3. **Cognitive Ergonomics:** Visual before/after diff cards reduce cognitive burden during high-volume clinical shifts.

### 5.3 Guardianship & Healthcare Proxy Logging (`PatientsView.tsx`)
When registering or managing a patient chart:
- Added `is_minor` (under 18) flag — AI processing is toggled **OFF by default** until verified parental consent is recorded.
- Added `guardianship_required` flag for patients with legal guardians or healthcare proxies.
- Added structured fields for: `guardian_name`, `guardian_relation`, `guardian_contact`, and `consent_method` (e.g. *Physical Signed Form*, *Digital Signature*, *Caregiver Assisted*).

---

## 6. Implementation Progress & Verification Status

```
┌────────────────────────────────────────────────────────────────────────┐
│                   AGENT-D v0.5.0 IMPLEMENTATION PHASES                 │
│                                                                        │
│  [X] Phase 1: Backend Zero-PHI Boundary & Single Egress Choke Point    │
│      - Built cloud_egress.py: Schema allowlist + PII/canary scrubber   │
│      - Refactored clinical_context.py: Token-only prompt envelope      │
│      - Refactored clinical_chat.py: Single choke point routing         │
│      - Authored test_canary_egress.py: 10/10 Canary tests passing      │
│      - Full regression suite: 28/28 tests passing cleanly              │
│                                                                        │
│  [ ] Phase 2: Client-Side TypeScript Token Hydrator                    │
│      - Build TokenHydrator component in electron/src/components/chat/  │
│      - In-memory regex token resolution to local decrypted display name│
│                                                                        │
│  [ ] Phase 3: Onboarding Modal Compliance & Attestation Step           │
│      - Insert Step 0 in OnboardingModal.tsx with attestation checks    │
│      - Commit acceptance record to config.db audit log                 │
│                                                                        │
│  [ ] Phase 4: Paid-Tier Guidance & Mode Badges in Settings             │
│      - Rewrite SettingsView.tsx AI guide to Google Cloud Paid API      │
│      - Add visual mode badges: [Paid Cloud], [Local Ollama], [Demo]    │
│                                                                        │
│  [ ] Phase 5: Disability & Guardianship Metadata in UI                 │
│      - Add minor/guardianship fields to context_db.py schema           │
│      - Add proxy consent form controls in PatientsView.tsx             │
│                                                                        │
│  [ ] Phase 6: Build, Documentation & CI/CD Verification                │
│      - Update release manifest and landing page                        │
│      - Verify full Vite build and PyInstaller packaging                │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Questions for Clinic Legal Counsel

1. Does the token-only boundary (`PT-XXXX` + consultation timestamps) routed through a single egress choke point satisfy the clinic's data fiduciary obligations under the IT Act SPDI Rules and the DPDP Act 2023?
2. Does counsel agree with the Hybrid Model Partition (Paid Cloud for scheduling, Local Ollama for pre-visit briefs and clinical notes)?
3. Given Google's short-term abuse monitoring retention under paid Gemini API terms, does counsel confirm that token-only de-identified transmission prevents health data disclosure under Indian law?
4. Is the proposed Intended Use statement and physician attestation procedure sufficient to address CDSCO/MDR medical device classification concerns?
5. What specific indemnification and warranty provisions should be incorporated into the standalone written B2B contract between the developer and the clinic?

---

## 8. Disclaimer

This document is an **engineering and regulatory proposal for discussion**, not formal legal advice. It outlines technical controls and architecture to assist the clinic and its legal counsel in establishing a compliant clinical workflow. All policies and notices must receive written sign-off from qualified legal counsel before deployment with real patient records.
