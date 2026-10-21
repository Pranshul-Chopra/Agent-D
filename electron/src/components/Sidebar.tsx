import React, { useState } from 'react';
import {
  LayoutDashboard,
  Kanban,
  BookOpen,
  Bot,
  Settings,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Stethoscope,
  Users,
} from 'lucide-react';
import type { NavTab, UpdateData } from '../types';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  updateData: UpdateData;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenWhatsNew?: () => void;
}

interface NavItem {
  id: NavTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const navItems: NavItem[] = [
  { id: 'chat', label: 'Copilot', icon: Bot, badge: 'AI' },
  { id: 'home', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'patients', label: 'Patients', icon: Users },
  { id: 'documents', label: 'Patient Artifacts', icon: BookOpen },
  { id: 'board', label: 'Follow-ups Board', icon: Kanban },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  updateData,
  collapsed: controlledCollapsed,
  onToggleCollapse,
  onOpenWhatsNew,
}) => {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const isCollapsed = controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed;

  const handleToggle = () => {
    if (onToggleCollapse) {
      onToggleCollapse();
    } else {
      setInternalCollapsed(!internalCollapsed);
    }
  };

  return (
    <aside
      className={`h-full bg-white border-r border-[#E2E8F0] flex flex-col justify-between transition-all duration-200 select-none z-40 ${
        isCollapsed ? 'w-14' : 'w-56'
      }`}
    >
      {/* Top Branding & Collapse Button */}
      <div className="flex flex-col">
        <div className="h-12 px-3 flex items-center justify-between border-b border-[#E2E8F0]">
          {!isCollapsed && (
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-[#2563EB] flex items-center justify-center text-white">
                <Stethoscope className="w-3.5 h-3.5" />
              </div>
              <span className="font-bold text-sm tracking-tight text-slate-900">Agent-D</span>
            </div>
          )}

          {isCollapsed && (
            <div className="w-7 h-7 mx-auto rounded bg-[#2563EB] flex items-center justify-center text-white">
              <Stethoscope className="w-4 h-4" />
            </div>
          )}

          <button
            onClick={handleToggle}
            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-[#F1F5F9] transition-colors"
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label="Toggle sidebar"
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="p-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-[#EFF6FF] text-[#2563EB] font-semibold border-l-2 border-[#2563EB]'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-[#F8FAFC]'
                }`}
                title={isCollapsed ? item.label : undefined}
              >
                <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-[#2563EB]' : 'text-slate-500'}`} />

                {!isCollapsed && (
                  <div className="flex items-center justify-between w-full">
                    <span>{item.label}</span>
                    {item.badge && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] font-bold">
                        {item.badge}
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Version Strip (Status indicator) */}
      <div className="p-2 border-t border-[#E2E8F0]">
        <button
          type="button"
          onClick={onOpenWhatsNew}
          className={`w-full flex items-center justify-between p-2 rounded bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] text-[11px] font-mono text-slate-600 hover:text-slate-900 transition-all cursor-pointer group text-left ${
            isCollapsed ? 'justify-center' : ''
          }`}
          title="Click to view release notes"
        >
          <div className="flex items-center gap-2 overflow-hidden">
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                updateData.status === 'downloaded'
                  ? 'bg-emerald-500 animate-pulse ring-2 ring-emerald-500/30'
                  : updateData.status === 'available'
                  ? 'bg-[#2563EB] animate-pulse'
                  : 'bg-emerald-500'
              }`}
            />
            {!isCollapsed && (
              <span className="truncate text-slate-600 group-hover:text-slate-900 transition-colors">
                v{updateData.version || '0.1.0'}
              </span>
            )}
          </div>

          {!isCollapsed && (
            <span className="text-[10px] text-[#2563EB] font-sans font-medium px-1.5 py-0.5 rounded bg-[#EFF6FF] border border-[#BFDBFE] flex items-center gap-1">
              <Sparkles className="w-2.5 h-2.5 text-[#2563EB]" />
              Docs
            </span>
          )}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
