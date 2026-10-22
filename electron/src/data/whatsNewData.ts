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
    version: '0.3.0',
    codename: 'Clinical Doctor Platform',
    date: 'October 2026',
    isLatest: true,
    title: 'Smooth One-Click Installer & Hardened Clinical Workbench',
    summary:
      'Agent-D v0.3.0 introduces a seamless zero-prompt one-click desktop installer, comprehensive TypeScript validation, Command Palette stability, and official landing page integration.',
    highlights: [
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
