export interface ReleaseHighlight {
  id: string;
  icon: 'kpi' | 'database' | 'shield' | 'zap' | 'bot' | 'file-text' | 'sparkles';
  title: string;
  tag: string;
  description: string;
}

export interface ReleaseSection {
  title: string;
  type: 'feature' | 'improvement' | 'fix';
  items: string[];
}

export interface WhatsNewRelease {
  version: string;
  codename: string;
  date: string;
  isLatest?: boolean;
  title: string;
  summary: string;
  highlights: ReleaseHighlight[];
  sections: ReleaseSection[];
}

export const WHATS_NEW_RELEASES: WhatsNewRelease[] = [
  {
    version: '0.5.0',
    codename: 'Sovereign Air-Gapped AI',
    date: 'October 2026',
    isLatest: true,
    title: '100% On-Device Local AI via Hardened Ollama, Zero Network Egress & Demo Governance',
    summary:
      'Agent-D v0.5.0 transitions to a 100% On-Device Local-First Architecture. All external cloud model paths (Gemini) and key vaults have been removed to eliminate legal and regulatory exposure under the IT Act and DPDP Act. Powered by local Ollama on loopback socket (127.0.0.1:11434) with embedded air-gapped clinical synthesis.',
    highlights: [
      {
        id: 'ollama-sovereignty',
        icon: 'zap',
        title: '100% Sovereign Local AI via Ollama',
        tag: 'Inference',
        description:
          'Inference runs entirely on local GPU/CPU hardware via loopback socket (127.0.0.1:11434). Zero patient records, notes, or prompts ever leave this computer.',
      },
      {
        id: 'zero-cloud-egress',
        icon: 'shield',
        title: 'Permanent Cloud Egress Block',
        tag: 'Privacy',
        description:
          'Eliminated all external cloud model clients, remote API key vaults, and multi-key rotation pools, removing third-party data processor and cross-border transfer liabilities.',
      },
      {
        id: 'graceful-fallback',
        icon: 'bot',
        title: 'Embedded Air-Gapped Rule Synthesis',
        tag: 'Resilience',
        description:
          'If the local Ollama service is stopped or a model is not yet pulled, Copilot fails gracefully into on-device embedded clinical synthesis without missing a beat.',
      },
      {
        id: 'demo-governance',
        icon: 'sparkles',
        title: 'Pre-Deployment Demo Governance Banner',
        tag: 'Compliance',
        description:
          'Prominent persistent banner warns that the workstation is running in demo-only mode until formal clinic legal review is concluded.',
      },
    ],
    sections: [
      {
        title: 'Local Sovereignty & Architecture',
        type: 'feature',
        items: [
          'Created pluggable BaseLLMProvider interface with hardened OllamaProvider bound strictly to 127.0.0.1:11434.',
          'Eliminated all Gemini cloud REST calls, API key rotation tables, and cooldown tracking.',
          'Replaced Settings AI Guide with 3-step local Ollama setup and model selection.',
          'Maintained prompt allowlist and PII scrubbing patterns as strict coding habits.',
        ],
      },
      {
        title: 'Legal & Regulatory De-Risking',
        type: 'improvement',
        items: [
          'Eliminated cross-border data transfer exposure under IT Act Section 43A and DPDP Act Section 16.',
          'Eliminated free-tier vs paid-tier Google terms-of-service compliance risks and cloud abuse logging.',
          'Persistent demo banner: "Demo only: no real patient data — pending legal review".',
          'Disabled background periodic updater polls in Electron to maintain a strict air-gap.',
        ],
      },
    ],
  },
  {
    version: '0.4.0',
    codename: 'Context Sync & Pipeline Hardening',
    date: 'October 2026',
    isLatest: false,
    title: 'In-View Patient Scoping, Dynamic Context Sync & CI/CD Hardening',
    summary:
      'Agent-D v0.4.0 shifts patient selection directly into Copilot and Artifacts Studio, enables live dynamic context synchronization across modules, and resolves CI/CD release build timeouts with optimized PyInstaller freezing.',
    highlights: [
      {
        id: 'in-view-scoping',
        icon: 'bot',
        title: 'In-View Patient Scoping in Copilot',
        tag: 'Workflow',
        description:
          'Quickly toggle between General Practice Copilot and individual patient charts (PT-XXXX) directly inside the chat header with instant demographic filtering.',
      },
      {
        id: 'chart-switcher',
        icon: 'file-text',
        title: 'Artifacts Studio Chart Switcher',
        tag: 'Clinical Studio',
        description:
          'Dedicated chart directory grid for unselected states plus an in-header [Switch Chart ▾] dropdown allowing seamless switching between patient artifacts.',
      },
      {
        id: 'dashboard-realign',
        icon: 'kpi',
        title: 'Clinical Agenda Prioritization',
        tag: 'Dashboard',
        description:
          'Promoted Clinical Calendar and Agenda directly below quick metrics, anchoring pre-visit briefs beneath the daily schedule for logical context mapping.',
      },
      {
        id: 'pipeline-hardening',
        icon: 'shield',
        title: 'CI/CD Pipeline Freeze & Timeout Fix',
        tag: 'Infrastructure',
        description:
          'Eliminated PyInstaller UPX compression hangs, added job-level 25-minute timeouts, and transitioned to atomic GitHub Releases via softprops/action-gh-release.',
      },
    ],
    sections: [
      {
        title: 'In-View Patient Scoping & Decoupling',
        type: 'feature',
        items: [
          'Removed global patient dropdown from Titlebar, keeping the top bar focused on application identity, search, and local security vault status.',
          'Added interactive patient selector in Copilot header supporting General Practice Copilot and individual patient charts.',
          'Built dedicated Patient Chart Selector grid in Artifacts Studio empty state with instant search, demographic summaries, and one-click opening.',
          'Added in-header [Switch Chart ▾] dropdown in Artifacts Studio for instantaneous patient switching.',
        ],
      },
      {
        title: 'Real-Time Cross-Module Context Synchronization',
        type: 'improvement',
        items: [
          'Dynamic per-turn prompt injection in Copilot querying live SQLite artifacts, recent vitals, open tickets, and today schedule on every message.',
          'Atomic SQLite initialization of Medical Context Artifact (v1 snapshot) upon registering a new patient.',
          'Cross-view reactive updates ensuring new patients appear immediately in Copilot and Artifact switchers.',
        ],
      },
      {
        title: 'Dashboard Layout & CI/CD Pipeline Fixes',
        type: 'fix',
        items: [
          'Re-aligned HomeView: Calendar widget moved up below metrics, Pre-Visit Brief suggestion moved down.',
          'Fixed CI/CD pipeline timeouts by disabling PyInstaller UPX compression in flask.spec.',
          'Upgraded GitHub Actions release workflow to use softprops/action-gh-release@v2 with offline electron-builder packaging.',
          'Included Milestone 6 action regression tests (test_m6_actions.py) in the automated CI test gate.',
        ],
      },
    ],
  },
  {
    version: '0.3.0',
    codename: 'Clinical Doctor Platform',
    date: 'October 2026',
    isLatest: false,
    title: 'Smooth One-Click Installer & Hardened Clinical Workbench',
    summary:
      'Agent-D v0.3.0 introduces a seamless zero-prompt one-click desktop installer, comprehensive TypeScript validation, Command Palette stability, and official landing page integration.',
    highlights: [
      {
        id: 'engine-guide',
        icon: 'sparkles',
        title: 'AI Engine Setup & Trade-offs Guide',
        tag: 'Configuration',
        description:
          'Comprehensive in-app reference with step-by-step instructions for Gemini Cloud API acquisition and local Ollama setup, featuring clinical accuracy vs air-gapped sovereignty trade-offs.',
      },
      {
        id: 'smooth-installer',
        icon: 'zap',
        title: 'Smooth One-Click Setup',
        tag: 'Desktop Experience',
        description:
          'Streamlined NSIS installer that bypasses tedious directory and finish wizard screens, auto-installs to user local space, creates desktop shortcuts, and launches immediately.',
      },
      {
        id: 'hardened-workbench',
        icon: 'shield',
        title: 'Hardened Clinical Architecture',
        tag: 'Reliability',
        description:
          'Comprehensive typecheck verification across Command Palette, Titlebar, Action Cards, and Consultations view with zero compiler warnings.',
      },
      {
        id: 'approval-gate',
        icon: 'bot',
        title: 'Contextual Clinical Governance',
        tag: 'Safety',
        description:
          'Full-stack doctor-in-the-loop safety protocol ensuring that every AI action requires explicit clinical confirmation before touching live patient records.',
      },
    ],
    sections: [
      {
        title: 'Production Improvements',
        type: 'improvement',
        items: [
          'Interactive AI Engine Setup Guide & Deployment Trade-offs panel in Settings.',
          'Instant one-click desktop setup installer with automatic shortcut creation.',
          'Command Palette icon mapping fix and strict TypeScript hardening.',
          'Synchronized release packaging with automated updater manifests.',
        ],
      },
    ],
  },
  {
    version: '0.2.0',
    codename: 'Clinical Agility & Encounters',
    date: 'October 2026',
    isLatest: false,
    title: 'Interactive Calendar, Dedicated Consultations & Slash Commands',
    summary:
      'Agent-D v0.2.0 elevates clinical workflow fluidity with an interactive 7-column calendar widget from PranshulOS, a dedicated Consultations & Live Encounters module, comprehensive Copilot CRUD access guarded by the approval-first safety gate, and a keyboard-driven slash command palette.',
    highlights: [
      {
        id: 'calendar-widget',
        icon: 'kpi',
        title: 'Interactive Practice Calendar Widget',
        tag: 'Agenda & Planning',
        description:
          '7-column monthly calendar on the dashboard with quick "Today" navigation, clinical indicator dots (blue for consultations, amber for follow-ups), and day agenda with check-off tasks.',
      },
      {
        id: 'consultations-module',
        icon: 'file-text',
        title: 'Dedicated Consultations & Encounters',
        tag: 'Patient Encounters',
        description:
          'Standalone consultations management hub to monitor active meetings, start live encounters, record structured consultation notes, and jump directly into Copilot patient context.',
      },
      {
        id: 'slash-palette',
        icon: 'zap',
        title: 'Slash (/) Command Palette',
        tag: 'Productivity',
        description:
          'Type "/" in Copilot to access quick clinical workflows (/consultation, /brief, /note, /ticket, /artifact, /meds, /search) with keyboard tabbing, arrow navigation, and a dedicated toggle button.',
      },
      {
        id: 'approval-crud',
        icon: 'shield',
        title: 'Approval-First CRUD System',
        tag: 'Safety & Governance',
        description:
          'Copilot can propose actions across consultations, agenda tasks, tickets, and clinical artifacts with parameter inspection and visual diffs requiring explicit physician sign-off.',
      },
    ],
    sections: [
      {
        title: 'New Clinical Features',
        type: 'feature',
        items: [
          'PranshulOS interactive calendar widget on the home dashboard with real-time appointment and follow-up markers.',
          'Dedicated Consultations view with status filtering (Scheduled, In Progress, Completed, Cancelled) and scheduling modal.',
          'Copilot slash (/) command autocomplete floating menu with keyboard navigation and quick insertion.',
          'Full CRUD execution endpoint (/api/ai/apply_action) with strict doctor-in-the-loop approval confirmation.',
        ],
      },
      {
        title: 'Identity & Security Clarification',
        type: 'improvement',
        items: [
          'Prominent local hosting notice clarifying 100% loopback hosting (http://127.0.0.1:5050), local AES-256 vault, and zero cloud PII.',
          'Settings Workstation Identity & Local Hosting card explaining hardware-bound encryption and local SQLite paths.',
        ],
      },
    ],
  },
  {
    version: '0.1.0',
    codename: 'Clinical Vault',
    date: 'October 2026',
    isLatest: false,
    title: 'Agent-D: Conversational-First Local Clinical Assistant',
    summary:
      'Agent-D v0.1.0 introduces a privacy-first, local clinical desktop environment for physicians. Combines local cryptographic storage with an intelligent conversational copilot, patient context artifacts, and a clinical Kanban follow-up board.',
    highlights: [
      {
        id: 'aes-vault',
        icon: 'shield',
        title: 'Local Cryptographic Vault (AES-256-GCM)',
        tag: 'Security & Privacy',
        description:
          'Patient demographics and confidential notes are authenticated and encrypted at rest with AES-256-GCM. Direct identifiers are replaced with local aliases (e.g. PT-1042) before any external LLM call.',
      },
      {
        id: 'clinical-copilot',
        icon: 'bot',
        title: 'Conversational Clinical Copilot',
        tag: 'Decision Support',
        description:
          'Ask natural questions like "What\'s on my dashboard today?" or "Brief me on the next patient". Copilot accesses live practice data and drafts consultation notes.',
      },
      {
        id: 'proposal-gate',
        icon: 'zap',
        title: 'Doctor-in-Control Proposal Gate',
        tag: 'Patient Safety',
        description:
          'The AI assistant never mutates clinical records autonomously. Every suggestion produces a typed proposal with a visual diff requiring explicit physician approval.',
      },
      {
        id: 'multi-key-vault',
        icon: 'sparkles',
        title: 'Gemini Multi-Key Rotation Engine',
        tag: 'Reliability',
        description:
          'Store 2 to 3 Gemini API keys with automatic round-robin rotation and transparent 60-second cooldown failover on quota limits.',
      },
      {
        id: 'kanban-board',
        icon: 'kpi',
        title: 'Clinical Follow-up Kanban Board',
        tag: 'Practice Flow',
        description:
          'Track lab orders, patient recalls, and follow-up consults visually across To Do, In Progress, Review, and Completed stages.',
      },
    ],
    sections: [
      {
        title: 'Core Capabilities',
        type: 'feature',
        items: [
          'Conversational-First operating interface with real-time practice temporal and agenda context.',
          'Structured Patient Context Artifacts with immutable version history and revision timelines.',
          'Per-launch cryptographically random bearer token securing all local IPC and HTTP API calls.',
          'Interactive Patient Directory Manager with instant clinical alias lookup.',
          'Full-featured Clinical Follow-up Kanban board with priority filtering and patient links.',
        ],
      },
      {
        title: 'Clinical Safety & Privacy',
        type: 'improvement',
        items: [
          'Automated alias mapper prevents legal names from being transmitted to external AI endpoints.',
          'Complete tamper-evident audit log of all model interactions and approved record changes.',
          'Perimeter security blocking cross-site requests and DNS rebinding attacks.',
        ],
      },
    ],
  },
];

export const LATEST_RELEASE = WHATS_NEW_RELEASES[0];
