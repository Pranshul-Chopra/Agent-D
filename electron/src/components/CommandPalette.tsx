import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  LayoutDashboard,
  Kanban,
  BookOpen,
  Bot,
  Settings,
  Users,
  UserPlus,
  PlusCircle,
  FileText,
  ArrowRight,
  X,
  Sparkles,
  Columns3,
  Stethoscope,
} from 'lucide-react';
import type { NavTab, Patient } from '../types';
import AppBridge from '../services/bridge';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: NavTab, projectId?: number | null) => void;
  onToggleSidebar?: () => void;
  onOpenOnboarding?: () => void;
  onSelectPatient?: (patient: Patient) => void;
}

interface PaletteAction {
  id: string;
  category: 'Navigation' | 'Patients & Charts' | 'Clinical Actions';
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  run: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onNavigate,
  onToggleSidebar,
  onSelectPatient,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [patients, setPatients] = useState<Patient[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch patients safely when palette opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      AppBridge.api.listPatients({ limit: 15 })
        .then((res) => {
          if (res && Array.isArray(res.patients)) {
            setPatients(res.patients);
          } else {
            setPatients([]);
          }
        })
        .catch((err) => {
          console.error('Failed to load patients for command palette:', err);
          setPatients([]);
        });

      // Auto-focus input
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Construct items
  const actions: PaletteAction[] = useMemo(() => {
    const list: PaletteAction[] = [
      // Navigation
      {
        id: 'nav-chat',
        category: 'Navigation',
        title: 'Clinical Copilot',
        subtitle: 'Conversational assistant for daily practice, queries & drafting',
        icon: Bot,
        shortcut: 'Ctrl+1',
        run: () => {
          onNavigate('chat');
          onClose();
        },
      },
      {
        id: 'nav-home',
        category: 'Navigation',
        title: 'Practice Dashboard',
        subtitle: 'Daily schedule, follow-ups, and practice metrics',
        icon: LayoutDashboard,
        shortcut: 'Ctrl+2',
        run: () => {
          onNavigate('home');
          onClose();
        },
      },
      {
        id: 'nav-patients',
        category: 'Navigation',
        title: 'Patients Manager',
        subtitle: 'Directory of patient records, demographics, and clinical aliases',
        icon: Users,
        shortcut: 'Ctrl+3',
        run: () => {
          onNavigate('patients');
          onClose();
        },
      },
      {
        id: 'nav-consultations',
        category: 'Navigation',
        title: 'Consultations & Encounters',
        subtitle: 'Monitor active consultations, conduct clinical encounters, and dictate notes',
        icon: Calendar,
        shortcut: 'Ctrl+4',
        run: () => {
          onNavigate('consultations');
          onClose();
        },
      },
      {
        id: 'nav-docs',
        category: 'Navigation',
        title: 'Patient Artifacts Studio',
        subtitle: 'Living visit notes, care plans, and immutable version history',
        icon: BookOpen,
        shortcut: 'Ctrl+4',
        run: () => {
          onNavigate('documents');
          onClose();
        },
      },
      {
        id: 'nav-board',
        category: 'Navigation',
        title: 'Clinical Follow-ups Kanban Board',
        subtitle: 'Visual tracking for lab orders, recalls, and chart reviews',
        icon: Kanban,
        shortcut: 'Ctrl+5',
        run: () => {
          onNavigate('board');
          onClose();
        },
      },
      {
        id: 'nav-settings',
        category: 'Navigation',
        title: 'Settings & Security Vault',
        subtitle: 'Multi-Key Gemini rotation, AES-256 storage, and system probes',
        icon: Settings,
        shortcut: 'Ctrl+6',
        run: () => {
          onNavigate('settings');
          onClose();
        },
      },

      // Clinical Quick Actions
      {
        id: 'act-morning-brief',
        category: 'Clinical Actions',
        title: '☀️ Morning Practice Brief',
        subtitle: 'Ask Copilot to summarize today\'s appointments and flagged cases',
        icon: Sparkles,
        run: () => {
          onNavigate('chat');
          onClose();
        },
      },
      {
        id: 'act-next-patient',
        category: 'Clinical Actions',
        title: '🩺 Brief Me on Next Patient',
        subtitle: 'Rapid pre-consult synopsis of active issues and current medications',
        icon: Stethoscope,
        run: () => {
          onNavigate('chat');
          onClose();
        },
      },
      {
        id: 'act-register-patient',
        category: 'Clinical Actions',
        title: 'Register New Patient',
        subtitle: 'Add a new patient to the AES-256 encrypted local vault',
        icon: UserPlus,
        run: () => {
          onNavigate('patients');
          onClose();
        },
      },
      {
        id: 'act-new-ticket',
        category: 'Clinical Actions',
        title: 'Create Clinical Action Item',
        subtitle: 'Add a lab order, specialist referral, or recall item to Kanban board',
        icon: PlusCircle,
        run: () => {
          onNavigate('board');
          onClose();
        },
      },
      {
        id: 'act-new-artifact',
        category: 'Clinical Actions',
        title: 'New Patient Visit Note / Artifact',
        subtitle: 'Open Artifacts Studio to draft or review structured clinical notes',
        icon: FileText,
        run: () => {
          onNavigate('documents');
          onClose();
        },
      },
      {
        id: 'act-toggle-sidebar',
        category: 'Clinical Actions',
        title: 'Toggle Sidebar Collapse',
        subtitle: 'Expand or collapse the primary navigation panel',
        icon: Columns3,
        shortcut: 'Ctrl+B',
        run: () => {
          if (onToggleSidebar) onToggleSidebar();
          onClose();
        },
      },
    ];

    // Patients category - dynamically populated from local vault
    if (Array.isArray(patients)) {
      patients.forEach((p) => {
        if (!p || !p.id) return;
        list.push({
          id: `patient-${p.id}`,
          category: 'Patients & Charts',
          title: p.display_name,
          subtitle: `Alias: ${p.llm_alias} · ${p.gender || 'Unknown gender'} · DOB: ${p.date_of_birth || 'N/A'}`,
          icon: Users,
          run: () => {
            if (onSelectPatient) onSelectPatient(p);
            onNavigate('documents');
            onClose();
          },
        });
      });
    }

    return list;
  }, [patients, onNavigate, onClose, onToggleSidebar, onSelectPatient]);

  // Filter actions based on query
  const filteredActions = useMemo(() => {
    if (!query.trim()) return actions;
    const lower = query.toLowerCase().trim();
    return actions.filter(
      (item) =>
        item.title.toLowerCase().includes(lower) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(lower)) ||
        item.category.toLowerCase().includes(lower)
    );
  }, [actions, query]);

  // Reset index when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev < filteredActions.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : Math.max(0, filteredActions.length - 1)));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const actionToRun = filteredActions[selectedIndex];
        if (actionToRun && typeof actionToRun.run === 'function') {
          actionToRun.run();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredActions, selectedIndex, onClose]);

  // Ensure selected item is scrolled into view
  useEffect(() => {
    if (!listRef.current) return;
    try {
      const selectedEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      if (selectedEl && typeof selectedEl.scrollIntoView === 'function') {
        selectedEl.scrollIntoView({ block: 'nearest' });
      }
    } catch (_) {}
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
      {/* Dimmed backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-150"
        onClick={onClose}
      />

      {/* Palette Modal */}
      <div className="relative w-full max-w-xl bg-white border border-[#E2E8F0] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[75vh] z-10 animate-in zoom-in-95 duration-100">
        {/* Search Header */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#E2E8F0] bg-[#F8FAFC]">
          <Search className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or jump to patient chart... (ESC to exit)"
            className="w-full bg-transparent text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
          />
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-700 transition-colors"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto p-2 space-y-1 divide-y divide-slate-100"
        >
          {filteredActions.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              No clinical commands or patient charts match &ldquo;{query}&rdquo;
            </div>
          ) : (
            filteredActions.map((item, index) => {
              const Icon = item.icon;
              const isSelected = index === selectedIndex;

              return (
                <div
                  key={item.id}
                  data-index={index}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => item.run()}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-blue-50 text-slate-900 border border-blue-200'
                      : 'text-slate-700 hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold truncate ${isSelected ? 'text-blue-900' : 'text-slate-900'}`}>
                          {item.title}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 flex-shrink-0">
                          {item.category}
                        </span>
                      </div>
                      {item.subtitle && (
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          {item.subtitle}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    {item.shortcut && (
                      <kbd className="hidden sm:inline-block text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                        {item.shortcut}
                      </kbd>
                    )}
                    <ArrowRight
                      className={`w-3.5 h-3.5 transition-transform ${
                        isSelected ? 'text-blue-600 translate-x-0.5' : 'text-transparent'
                      }`}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts hint */}
        <div className="px-4 py-2 border-t border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between text-[11px] font-mono text-slate-500">
          <div className="flex items-center gap-3">
            <span><kbd className="px-1 py-0.5 rounded bg-white border border-slate-200 text-slate-700">↑↓</kbd> Navigate</span>
            <span><kbd className="px-1 py-0.5 rounded bg-white border border-slate-200 text-slate-700">↵</kbd> Select</span>
            <span><kbd className="px-1 py-0.5 rounded bg-white border border-slate-200 text-slate-700">ESC</kbd> Close</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-500">
            <span className="text-blue-600 font-semibold">Agent-D</span>
            <span>v0.2.0</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
