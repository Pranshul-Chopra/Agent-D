# Archived AI Copilot System

> **Status:** Archived & Isolated Subsystem  
> **Date of Archival:** October 23, 2026 (v0.5.0)  
> **Active Production State:** 100% Deterministic Local Clinical Desktop Workstation (Zero AI)

---

## 1. Executive Summary & Purpose

This directory contains the complete source code, tests, and UI components of the conversational AI Copilot subsystem formerly embedded within **Agent-D** (Milestones 1–5). 

As part of the **v0.5.0 release**, the clinic and engineering team made the strategic decision to completely excise all probabilistic artificial intelligence models, cloud LLMs, on-device neural runtimes (Ollama), prompt injection engines, and network egress choke points from the production application. Agent-D was converted into a **100% deterministic, privacy-first local clinical desktop workstation** for attending physicians.

All AI-related code has been safely packaged into this archived directory for historical reference, architectural analysis, compliance audit records, or future isolated research.

---

## 2. Directory Layout & Component Index

```
archived_ai_copilot_system/
├── README.md                          # This architectural manifest & reference guide
├── backend/
│   ├── clinical_chat.py               # Conversational copilot engine & SSE streaming generator
│   ├── llm_provider.py                # BaseLLMProvider interface & loopback OllamaProvider
│   ├── cloud_egress.py                # Single egress choke point, PII scrubber & canary validator
│   ├── ai_db.py                       # Legacy SQLite AI session and message persistence
│   ├── clinical_context.py            # Prompt context builder & temporal practice awareness
│   ├── system_context.py              # Legacy prompt context formatter
│   └── llm/
│       ├── __init__.py                # Package initialization
│       └── gateway.py                 # Multi-key Gemini cloud gateway & cooldown manager
├── frontend/
│   ├── ChatView.tsx                   # React conversational Copilot UI & session sidebar
│   ├── ActionCard.tsx                 # Interactive proposal diff cards ([Approve] / [Reject])
│   └── MarkdownContent.tsx            # SSE streaming markdown parser & card renderer
└── tests/
    ├── test_provider.py               # Unit tests for BaseLLMProvider & Ollama loopback
    └── test_canary_egress.py          # Canary string regression & PHI leak prevention tests
```

---

## 3. Component Details & Historical Architecture

### 3.1 Backend Architecture

#### `backend/clinical_chat.py` (Copilot Engine)
- **Role:** Managed multi-turn conversation sessions, user query handling, Server-Sent Events (SSE) token streaming (`/api/v1/chat/stream`), and synchronous chat fallback (`/api/v1/chat`).
- **Prompt Injection:** Injected real-time practice schedules, active patient demographic envelopes, vitals, and tickets into model prompts per turn.
- **Embedded Rule Synthesis Fallback:** Included a graceful offline fallback that synthesized structured proposals from doctor notes when model servers were offline or rate-limited.

#### `backend/llm_provider.py` (Local Sovereign Provider)
- **Role:** Abstracted LLM execution behind a pluggable `BaseLLMProvider` interface.
- **OllamaProvider:** Concrete provider bound exclusively to loopback `http://127.0.0.1:11434`. Strictly enforced loopback-only connections, rejecting any remote or non-localhost hostnames to guarantee air-gapped sovereignty.
- **Probe & Discovery:** Supported automatic model probing, latency checks, and fallback handling (`OllamaUnavailableError`, `OllamaModelNotFoundError`).

#### `backend/cloud_egress.py` (Single Egress Choke Point)
- **Role:** Centralized egress control function that validated and scrubbed every byte sent over the network.
- **Payload Schema Validation:** Rejected any JSON dictionary containing unknown, unexpected, or unauthorized keys.
- **PII Scrubber:** Scanned free-text user messages and tool results to redact registered patient legal names, phone numbers, email addresses, and synthetic canary strings before transmission.
- **Pre-flight Canary Check:** Raised `EgressSecurityError` and aborted network calls if any canary token was detected in outgoing serialized payloads.

#### `backend/llm/gateway.py` (Multi-Key Cloud Gateway)
- **Role:** Multi-provider API dispatcher supporting Google Gemini REST endpoints and OpenAI-compatible services.
- **Multi-Key Pool & Rotation:** Maintained priority-ranked API key pools with automatic round-robin rotation.
- **Rate-Limit Cooldown:** Automatically tagged keys with 60-second cooldown windows upon receiving HTTP 429 / 503 rate limits and failed over to subsequent healthy keys.

#### `backend/clinical_context.py` & `system_context.py` (Prompt Construction)
- **Role:** Built structured system prompts by extracting live SQLite data.
- **Zero-PHI Envelope:** Formatted patient data into token aliases (`PT-XXXX`), consultation time slots, and high-level agenda summaries while omitting sensitive plaintext identities.

#### `backend/ai_db.py` (Session Persistence)
- **Role:** Isolated SQLite database (`ai_chat.db`) storing chat threads, user messages, and model responses with timestamping.

---

### 3.2 Frontend Architecture

#### `frontend/ChatView.tsx` (Copilot View)
- **Role:** Dual-pane React component providing real-time conversational clinical intelligence alongside live patient context.
- **Features:** Patient chart switcher (`PT-XXXX` scoping), live typing indicator, streaming cancellation button, prompt execution chips (*Morning Practice Brief*, *Next Patient Brief*, *Medication Review*), and slash (`/`) command autocomplete palette (`/consultation`, `/brief`, `/note`, `/ticket`).

#### `frontend/ActionCard.tsx` & `frontend/MarkdownContent.tsx`
- **Role:** Parsed model responses for embedded JSON action proposals (medication changes, follow-up lab orders, diagnosis adjustments).
- **Interactive UI:** Rendered side-by-side before/after diff cards allowing attending physicians to review, edit, or reject staged proposals directly in the conversation stream before committing to the local vault.

---

### 3.3 Verification Suites

#### `tests/test_provider.py`
- Unit tests verifying the `BaseLLMProvider` contract, loopback URL validation, streaming token parsing, and graceful error handling.

#### `tests/test_canary_egress.py`
- Security regression suite verifying that canary tokens (synthetic names, fake medications, secret IDs) were strictly intercepted by `cloud_egress.py` and never leaked into outgoing network payloads.

---

## 4. Why This Subsystem Was Decommissioned & Archived

The archival of this subsystem was driven by four critical legal, clinical, and operational pillars:

1. **Indian Data Protection & Cross-Border Compliance (IT Act 2000 & DPDP Act 2023):**
   - Under Section 43A of the IT Act and the SPDI Rules 2011, medical records and health histories are classified as **Sensitive Personal Data or Information (SPDI)**. Transferring them to third-party cloud AI vendors triggers stringent prior-consent mandates, purpose limitation covenants, and data-processor contracts.
   - Under Section 16 of the Digital Personal Data Protection Act 2023 (DPDP Act) and the DPDP Rules 2025, clinics act as **Data Fiduciaries** subject to cross-border transfer restrictions and penalties of up to **₹250 crore** for security failures.
   - Cloud AI transmission introduced unacceptable regulatory risks, especially regarding terms-of-service compliance on free-tier API keys (which allow model providers to train on submitted data and permit human review).

2. **Unstructured PII Leakage in Free-Text Dictation:**
   - Although prompt allowlists and alias scrubbers masked structured demographic fields, attending physicians frequently dictate notes containing informal patient references, family histories, and unique clinical details that cannot be reliably sanitized by regex filters.

3. **Clinical Accountability & Elimination of Hallucinations:**
   - Generative large language models operate probabilistically. Non-deterministic hallucinations in drug dosages, contraindications, or lab values introduce catastrophic medical malpractice liability.
   - In contrast, the new **deterministic regular-expression extraction engine** (`context_db.py:synthesize_visit_proposals`) maps directly to explicit strings entered by the doctor with 100% predictability and zero hallucination risk.

4. **Workstation Performance & Hardware Accessibility:**
   - Hosting local 7B/8B parameter models via Ollama required dedicated GPUs with at least 8–16GB VRAM, consuming massive RAM and generating 15–30 second inference latencies.
   - Excising the AI runtime dropped API latencies across Agent-D from ~5,000ms to **< 50ms**, and reduced test suite execution times from 32s to **0.69s**.

---

## 5. Usage & Revival Guidelines

This codebase is preserved in a self-contained state. If future research or enterprise deployments require reviving an AI model integration:
1. Review the legal prerequisites and ensure a Business Associate Agreement (BAA) or Data Processing Agreement (DPA) is in place with the model provider.
2. Ensure strict hardware prerequisites are met if running local SLMs (NVIDIA RTX 3060+ or Apple Silicon M-series with ≥ 16GB unified memory).
3. The `BaseLLMProvider` interface in `backend/llm_provider.py` and single egress choke point in `backend/cloud_egress.py` should serve as the starting architecture for any future isolated model integration.
