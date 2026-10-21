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
    version: '0.1.0',
    codename: 'Clinical Vault',
    date: 'October 2026',
    isLatest: true,
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
