import React from 'react';
import { Search, Stethoscope, User, ChevronDown } from 'lucide-react';
import type { NavTab, Patient } from '../types';

interface TitlebarProps {
  activeTab: NavTab;
  activePatient?: Patient | null;
  version?: string;
  onOpenPalette?: () => void;
  onOpenWhatsNew?: () => void;
  onOpenPatientDirectory?: () => void;
}

const tabTitles: Record<NavTab, string> = {
  chat: 'Conversational Copilot',
  home: 'Clinical Dashboard',
  patients: 'Patients Manager',
  documents: 'Patient Artifacts',
  board: 'Follow-ups Kanban Board',
  settings: 'Settings & Security Vault',
};

export const Titlebar: React.FC<TitlebarProps> = ({
  activeTab,
  activePatient,
  version = '0.2.0',
  onOpenPalette,
  onOpenWhatsNew,
  onOpenPatientDirectory,
}) => {
  return (
    <header className="app-drag-region h-11 w-full bg-white border-b border-[#E2E8F0] flex items-center justify-between px-3.5 select-none flex-shrink-0 z-50">
      {/* Brand & Breadcrumbs */}
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onOpenWhatsNew}
          className="app-no-drag flex items-center gap-2 px-2.5 py-1 rounded bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] hover:border-[#2563EB]/40 cursor-pointer transition-colors group"
          title="Click to view release notes"
        >
          <div className="w-5 h-5 rounded bg-[#2563EB] flex items-center justify-center text-white">
            <Stethoscope className="w-3 h-3" />
          </div>
          <span className="text-xs font-semibold text-slate-900 group-hover:text-[#2563EB] transition-colors">
            Agent-D
          </span>
          <span className="text-[11px] text-slate-500 font-mono">v{version}</span>
        </button>

        <div className="h-4 w-[1px] bg-[#E2E8F0] mx-1" />

        {/* Patient Context Quick Selector */}
        <button
          type="button"
          onClick={onOpenPatientDirectory}
          className="app-no-drag flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#F8FAFC] hover:bg-[#EFF6FF] border border-[#E2E8F0] hover:border-[#BFDBFE] transition-all cursor-pointer group"
          title="Switch Active Patient Chart"
        >
          <User className="w-3.5 h-3.5 text-[#2563EB]" />
          {activePatient ? (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="font-bold text-slate-900">{activePatient.display_name}</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-white text-[#1D4ED8] border border-[#BFDBFE]">
                {activePatient.llm_alias}
              </span>
            </div>
          ) : (
            <span className="text-xs font-medium text-slate-600 group-hover:text-[#2563EB]">Select Patient Chart</span>
          )}
          <ChevronDown className="w-3 h-3 text-slate-400 group-hover:text-[#2563EB]" />
        </button>

        <div className="h-4 w-[1px] bg-[#E2E8F0] mx-1" />

        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-slate-900 font-semibold">{tabTitles[activeTab]}</span>
        </div>
      </div>

      {/* Center Command Palette trigger */}
      {onOpenPalette && (
        <div className="app-no-drag hidden md:flex items-center">
          <button
            onClick={onOpenPalette}
            className="flex items-center gap-2 px-3 py-1 rounded-md bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] hover:border-[#2563EB]/50 text-slate-600 hover:text-slate-900 transition-all text-xs group shadow-xs"
            title="Open Command Palette (Ctrl+K)"
          >
            <Search className="w-3.5 h-3.5 text-[#2563EB]" />
            <span className="text-xs font-medium">Command Palette</span>
            <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white text-slate-500 border border-[#E2E8F0]">
              Ctrl+K
            </kbd>
          </button>
        </div>
      )}

      {/* Right Practice Status indicator */}
      <div className="app-no-drag flex items-center gap-3 text-xs">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] text-[#1D4ED8] font-medium text-[11px]">
          <span className="w-2 h-2 rounded-full bg-[#2563EB] animate-pulse" />
          <span>Local Vault Encrypted</span>
        </div>
      </div>
    </header>
  );
};

export default Titlebar;
