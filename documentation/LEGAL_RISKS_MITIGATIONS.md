# Agent-D: Legal Concerns, Risks and Mitigations

> **Prepared:** October 23, 2026 · For discussion between the developer and the clinic · **This is a working document, not legal advice, and it must be reviewed by qualified counsel before any decision is made on it.**

---

## 1. Purpose and Status

Agent-D is a local desktop assistant used by a doctor in a consulting clinic. It keeps a doctor-curated context artifact per patient, supports consultations and visits, tickets and reminders, and offers a chat Copilot that uses a cloud language model (Gemini) to help with briefs and proposals. Every change the assistant suggests goes through a doctor-approval step.

The clinic wants to use AI in the workflow with real patients. This document lists the legal and regulatory concerns that follow from that, why each one matters, and the fixes or workarounds available. It is meant to prepare a productive conversation with a lawyer, not to replace one.

---

## 2. Summary of the Main Concerns

1. **Consultation and visit content is health data**, and sending it to a cloud AI provider requires a lawful basis, patient consent, a processor arrangement, and cross-border safeguards.
2. **Free-tier Gemini keys allow provider product improvement and human review**. They must not be used with real patient data. Automated tier detection is technically infeasible from the key string alone, so governance requires an explicit physician attestation checkbox, clear UI warnings, and a written contract.
3. **Paid Gemini API terms retain logs temporarily for abuse monitoring** (with potential human review of violations), though data is not used for training. Because of this, a strict token-only boundary (`PT-XXXX` only) is legally essential so that no clinical health data ever reaches cloud logs. Absolute Zero Data Retention (ZDR) requires Vertex AI.
4. **Hybrid Model Partition:** Narrowing the cloud Copilot to scheduling is legally safest, but doctors require pre-visit clinical briefs and "what to look for". The solution is a hybrid partition: cloud Gemini for scheduling, and local air-gapped Ollama for clinical synthesis.
5. **Two legal regimes matter on different dates:** The older IT Act / SPDI framework applies now, and the DPDP Act and Rules become fully operational around May 2027.
6. **Patients need clear notice and consent**, including a way to withdraw, and special handling for children and persons with disabilities.
7. **Single Egress Choke Point & Scrubber:** Allowlisting alone is insufficient because doctors type names into chat. A single egress choke point validates payloads against a strict schema and scrubs chat messages before transmission.
8. **Onboarding Audit Trail vs Written Contract:** An in-app click-through is an internal audit trail, not a contract. A standalone written B2B agreement between developer and clinic is essential.
9. **Medical Device Posture:** Avoid blanket "not a medical device" statements. Define the exact Intended Use (administrative scheduling and de-identified synthesis under physician oversight) and leave classification to counsel.

---

## 3. What Data Goes Where

### 3.1 Current Design (v0.4.0 Baseline)
- Everything is stored locally in an encrypted database on the clinic computer (`%LOCALAPPDATA%\AgentD\context.db`).
- Legal names, phone numbers, and emails are replaced with an alias before prompts are built.
- Each Copilot turn could include the patient's context artifact (diagnoses, medications, watch-for items), recent vitals, open tickets, and today's schedule.
- Prompts go to Gemini over the internet.

### 3.2 Implemented Compliance Changes (Phase 1)
- **Token-Only Cloud Boundary:** The cloud Copilot prompt contains *only* patient token IDs (`PT-XXXX`) and consultation timestamps. Clinical diagnoses, medications, watch-for alerts, and vitals are barred from cloud egress.
- **Single Egress Choke Point (`cloud_egress.py`):** Every outgoing cloud request routes through a validated choke point that strictly enforces an allowlist schema, rejecting unknown fields with `EgressSecurityError`.
- **Pre-Send Chat Scrubber:** Doctor chat messages, prior turns, and tool results are dynamically scrubbed against registered patient identities, phone regexes, email patterns, and canaries before egress.
- **Canary String Automated Verification:** 10/10 automated tests (`test_canary_egress.py`) assert that canary names, drugs, phones, and diagnoses never leak into cloud payloads across chat replay, briefs, or proposals.
- **Hybrid Model Partition:** Cloud Gemini handles scheduling and agenda briefings; on-device Local Ollama handles pre-visit clinical briefs and "what to look for" with zero network egress.

---

## 4. Legal Framework in Play

| Regime | Status as of Oct 2026 | Why It Matters Here |
| :--- | :--- | :--- |
| **IT Act 2000, Section 43A and SPDI Rules 2011** | In force now; expected to remain until DPDP phase-in ends | Medical records and history are sensitive personal data (SPDI). A body corporate handling them needs prior consent, a privacy policy, review/amendment rights, and reasonable security practices. Transfers require equivalent protection. |
| **Digital Personal Data Protection Act 2023 & DPDP Rules 2025** | Rules notified in November 2025; obligations apply ~May 2027 (18-month window) | The clinic is a data fiduciary. Treats all personal data uniformly, with penalties up to ₹250 crore for failing to maintain reasonable security safeguards. |
| **Medical Council Rules on Confidentiality & Record-Keeping** | In force | Doctors owe patients secrecy and must retain clinical records for prescribed periods. These duties continue regardless of data protection statutes. |
| **Medical Device Regulation (CDSCO)** | Needs a legal view | Software supporting diagnosis or clinical decisions may attract medical device classification depending on intended use. |
| **CERT-In Incident Reporting Directions** | Needs a legal view | Prescribes 6-hour incident-reporting windows for covered cybersecurity incidents. |

---

## 5. Concerns, Fixes and Workarounds

### C1. Health Data Sent to a Cloud AI Provider & Paid Gemini Terms
- **Concern:** Consultation notes and visit dictation are health information. Sending them to a third-party model provider constitutes a disclosure and transfer. Under the *Gemini API Additional Terms of Service* (Paid Services), Google does not use customer data to train models; however, Google **does log prompts and responses for a limited period solely for abuse monitoring / Prohibited Use Policy enforcement**, and authorized personnel may inspect flagged content. Absolute Zero Data Retention (ZDR) and HIPAA BAA terms require Vertex AI.
- **Fixes and Workarounds:**
  - Enforce a strict **Token-Only Boundary (`PT-XXXX`)**: Because cloud logs exist temporarily for abuse monitoring, zero clinical records or personal identifiers may ever reach the provider.
  - Implement a **Hybrid Model Partition**: Cloud handles scheduling only; an air-gapped local model (Ollama) handles pre-visit clinical briefs, diagnoses, and medications on-premise.
  - Keep an immutable local audit log of all egress transmissions.

### C2. Free-Tier API Keys & Attestation Governance
- **Concern:** Free-tier Gemini keys allow Google to use submitted content and responses to train models and permit human review. That is incompatible with clinical practice. Furthermore, free and paid keys share identical syntax (`AIzaSy...`), making automatic programmatic detection from the key string alone technically infeasible.
- **Fixes:**
  - Do not promise automated blocking. Implement an explicit **physician attestation checkbox** in onboarding and settings ("I certify that this key belongs to a paid Google Cloud project with commercial DPA terms").
  - Prominent UI badge in Copilot header showing active mode: `🟢 Paid Cloud (Attested)` vs `🏠 Local Offline (Ollama)`.
  - Back the attestation with a formal written B2B agreement between developer and clinic.

### C3. Patient Notice and Informed Consent
- **Concern:** Consent bundled into general registration forms is legally vulnerable. Patients have a right to know that an AI assistant is used in the practice, what data it processes, and who the processors are.
- **Fixes:**
  - Plain-language notice at registration explaining that de-identified consultation tokens are scheduled via cloud AI, and clinical briefs are processed on-premise.
  - Granular opt-out: if a patient declines, Copilot stays off for that patient while care continues unhindered.
  - Record consent timestamps and notice version in the local patient chart.

### C4. User Message Leaks & Single Egress Choke Point
- **Concern:** Context allowlists only protect what the software injects. Doctors routinely type patient legal names, phone numbers, and clinical symptoms directly into chat messages.
- **Fixes:**
  - Route every cloud model request through a **Single Egress Choke Point (`cloud_egress.py`)** that enforces a strict allowlist schema and rejects unknown fields.
  - Implement a pre-send scrubber that detects registered patient names, phone numbers, and email patterns, substituting tokens or redaction markers.
  - Add automated canary string test suite (`test_canary_egress.py`) asserting zero canary leaks across chat replay, briefs, and proposals.

### C5. Onboarding Audit Trail vs Written B2B Contract
- **Concern:** An in-app click-through modal provides an internal operational audit trail, but a hashed checkbox is not a legally binding commercial contract.
- **Fixes:**
  - Treat the in-app attestation as an operational configuration log.
  - Execute a separate, formal written B2B agreement between the software developer and the clinic defining data ownership, liability limitations, indemnification, and regulatory boundaries.

### C6. Intended Use and Medical Device Classification (CDSCO)
- **Concern:** A blanket disclaimer like *"This is NOT a medical device"* is legally ineffective and risks regulatory pushback if software features resemble clinical decision support.
- **Fixes:**
  - Formulate an explicit **Intended Use Statement**: *"Agent-D is intended for administrative consultation organization, temporal agenda planning, and de-identified workflow synthesis under attending physician oversight."*
  - Bar Copilot from prescribing medications, calculating dosages, or generating medical diagnoses.
  - Leave formal medical device classification and regulatory posture to qualified legal counsel.

### C7. Disability & Guardianship Protections
- **Concern:** Under the RPwD Act 2016 and DPDP Act 2023, healthcare entities must ensure accessible notices and obtain verifiable legal proxy consent for individuals under guardianship or minors.
- **Fixes:**
  - Provide WCAG 2.1 AA visual accessibility (high-contrast clinical typography, zero low-contrast text, full keyboard navigation).
  - Add structured fields in patient registration for legal guardian / healthcare proxy details and consent verification method.
  - Default AI processing to OFF for minors and patients requiring guardianship until proxy consent is logged.

---

## 6. Action Checklist for Legal Review

- [ ] Confirm whether the clinic qualifies as a body corporate under IT Act Section 43A.
- [ ] Review the proposed Token-Only Cloud Boundary (`PT-XXXX` + consultation timestamps) as sufficient safeguard against health data disclosure.
- [ ] Approve the Hybrid Model Partition (Cloud Gemini for scheduling; Local Ollama for clinical summaries).
- [ ] Review Google Cloud Gemini API Additional Terms (Paid Services) and abuse monitoring retention policy.
- [ ] Approve the text of the Patient Privacy Notice and consent form.
- [ ] Review the proposed Intended Use statement regarding CDSCO medical device rules.
- [ ] Draft and execute the standalone written B2B contract between developer and clinic.
