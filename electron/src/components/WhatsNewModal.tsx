import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  TrendingUp,
  Database,
  ShieldCheck,
  Zap,
  Bot,
  FileText,
  CheckCircle2,
  ChevronRight,
  Info,
} from 'lucide-react';
import {
  WHATS_NEW_RELEASES,
  LATEST_RELEASE,
  type WhatsNewRelease,
  type ReleaseHighlight,
} from '../data/whatsNewData';

interface WhatsNewModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeVersion?: string;
}

export const WhatsNewModal: React.FC<WhatsNewModalProps> = ({
  isOpen,
  onClose,
  activeVersion,
}) => {
  const [selectedVersion, setSelectedVersion] = useState<string>(
    activeVersion || LATEST_RELEASE.version
  );
  const [activeTab, setActiveTab] = useState<'highlights' | 'all'>('highlights');

  // Sync selected version if activeVersion prop updates
  useEffect(() => {
    if (activeVersion) {
      setSelectedVersion(activeVersion);
    }
  }, [activeVersion]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const currentRelease: WhatsNewRelease =
    WHATS_NEW_RELEASES.find((r) => r.version === selectedVersion) || LATEST_RELEASE;

  const renderIcon = (type: ReleaseHighlight['icon']) => {
    const iconClass = 'w-4 h-4';
    switch (type) {
      case 'kpi':
        return <TrendingUp className={`${iconClass} text-blue-600`} />;
      case 'database':
        return <Database className={`${iconClass} text-indigo-600`} />;
      case 'shield':
        return <ShieldCheck className={`${iconClass} text-emerald-600`} />;
      case 'zap':
        return <Zap className={`${iconClass} text-amber-600`} />;
      case 'bot':
        return <Bot className={`${iconClass} text-purple-600`} />;
      case 'file-text':
        return <FileText className={`${iconClass} text-cyan-600`} />;
      default:
        return <Sparkles className={`${iconClass} text-blue-600`} />;
    }
  };

  const getIconBg = (type: ReleaseHighlight['icon']) => {
    switch (type) {
      case 'kpi':
        return 'bg-blue-50 border-blue-200';
      case 'database':
        return 'bg-indigo-50 border-indigo-200';
      case 'shield':
        return 'bg-emerald-50 border-emerald-200';
      case 'zap':
        return 'bg-amber-50 border-amber-200';
      case 'bot':
        return 'bg-purple-50 border-purple-200';
      case 'file-text':
        return 'bg-cyan-50 border-cyan-200';
      default:
        return 'bg-blue-50 border-blue-200';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="whats-new-title"
    >
      {/* Dialog Shell */}
      <div
        className="bg-white border border-[#E2E8F0] rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Shell */}
        <div className="p-5 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex-shrink-0 mt-0.5 shadow-sm">
              <Sparkles className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 id="whats-new-title" className="text-lg font-bold text-slate-900">
                  What's New in Agent-D
                </h2>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200 font-semibold">
                    v{currentRelease.version}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 font-medium">
                    {currentRelease.codename}
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">
                {currentRelease.summary}
              </p>
            </div>
          </div>

          {/* Top-Right "X" Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 border border-transparent hover:border-slate-200 transition-colors flex-shrink-0"
            title="Close (Esc)"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sub-Nav Controls / Version Selector */}
        <div className="px-5 py-2.5 bg-white border-b border-[#E2E8F0] flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('highlights')}
              className={`px-3 py-1 rounded-md font-medium transition-all ${
                activeTab === 'highlights'
                  ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              Key Highlights
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1 rounded-md font-medium transition-all ${
                activeTab === 'all'
                  ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              Full Changelog
            </button>
          </div>

          {/* Version Pills if multiple versions exist */}
          {WHATS_NEW_RELEASES.length > 1 && (
            <div className="flex items-center gap-1.5 text-[11px] font-mono">
              <span className="text-slate-400 text-[10px] uppercase font-sans mr-1">Version:</span>
              {WHATS_NEW_RELEASES.map((rel) => (
                <button
                  key={rel.version}
                  type="button"
                  onClick={() => setSelectedVersion(rel.version)}
                  className={`px-2 py-0.5 rounded transition-all ${
                    selectedVersion === rel.version
                      ? 'bg-blue-600 text-white font-semibold shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
                  }`}
                >
                  v{rel.version}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50/50">
          {activeTab === 'highlights' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {currentRelease.highlights.map((highlight) => (
                <div
                  key={highlight.id}
                  className="p-4 rounded-xl bg-white border border-[#E2E8F0] hover:border-blue-300 hover:shadow-sm transition-all flex flex-col justify-between group"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <div className={`p-1.5 rounded-lg border ${getIconBg(highlight.icon)}`}>
                        {renderIcon(highlight.icon)}
                      </div>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                        {highlight.tag}
                      </span>
                    </div>
                    <h3 className="text-xs font-bold text-slate-900 mb-1.5 group-hover:text-blue-600 transition-colors">
                      {highlight.title}
                    </h3>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      {highlight.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {currentRelease.sections.map((sec, idx) => (
                <div key={idx} className="p-4 bg-white rounded-xl border border-[#E2E8F0] space-y-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full font-bold ${
                        sec.type === 'feature'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : sec.type === 'improvement'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}
                    >
                      {sec.title}
                    </span>
                    <div className="h-[1px] flex-1 bg-[#E2E8F0]" />
                  </div>
                  <ul className="space-y-2 pl-1">
                    {sec.items.map((item, itemIdx) => (
                      <li
                        key={itemIdx}
                        className="text-xs text-slate-700 flex items-start gap-2 leading-relaxed"
                      >
                        <ChevronRight className="w-3.5 h-3.5 text-blue-600 flex-shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Shell Footer */}
        <div className="p-4 border-t border-[#E2E8F0] bg-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <Info className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span className="hidden sm:inline">
              Access this changelog anytime by clicking the version tag in the sidebar.
            </span>
            <span className="sm:hidden">Click version at bottom-left anytime.</span>
          </div>

          {/* Bottom-Right "Got it" Button */}
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs tracking-wide transition-all shadow-sm active:scale-95 flex items-center gap-1.5 flex-shrink-0"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Got it</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default WhatsNewModal;
