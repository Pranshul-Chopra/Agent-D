import React, { useState, useEffect } from 'react';
import {
  X,
  GitCompare,
  ArrowRight,
  Plus,
  Minus,
  Check,
  RotateCcw,
  AlertCircle,
  FileText,
  Activity,
  Pill,
  Clock,
  Sparkles,
} from 'lucide-react';
import type { ArtifactDiff, PatientArtifactVersion } from '../../types';
import AppBridge from '../../services/bridge';

interface ArtifactDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  patientAlias: string;
  versions: PatientArtifactVersion[];
  currentVersion: number;
  initialV1?: number;
  initialV2?: number;
  onRestoreVersion?: (versionNum: number) => void;
}

export const ArtifactDiffModal: React.FC<ArtifactDiffModalProps> = ({
  isOpen,
  onClose,
  patientId,
  patientAlias,
  versions,
  currentVersion,
  initialV1,
  initialV2,
  onRestoreVersion,
}) => {
  const [v1, setV1] = useState<number>(initialV1 ?? Math.max(1, currentVersion - 1));
  const [v2, setV2] = useState<number>(initialV2 ?? currentVersion);
  const [diffData, setDiffData] = useState<ArtifactDiff | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync initial versions
  useEffect(() => {
    if (initialV1 !== undefined) setV1(initialV1);
    if (initialV2 !== undefined) setV2(initialV2);
  }, [initialV1, initialV2, currentVersion]);

  // Fetch diff when v1 or v2 changes
  useEffect(() => {
    if (!isOpen || !patientId) return;

    let mounted = true;
    setLoading(true);
    setError(null);

    AppBridge.api.getPatientArtifactDiff(patientId, v1, v2)
      .then((res) => {
        if (mounted) {
          setDiffData(res);
        }
      })
      .catch((err) => {
        if (mounted) {
          console.error('Failed to compute diff:', err);
          setError('Could not compute visual diff between the selected versions.');
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [isOpen, patientId, v1, v2]);

  if (!isOpen) return null;

  const diff = diffData?.diff;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white border border-[#E2E8F0] rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-xs">
              <GitCompare className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900">Patient Artifact Visual Diff</h2>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-bold">
                  {patientAlias}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Audit and inspect exact revisions between artifact versions
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Version Selector Bar */}
        <div className="px-6 py-3 border-b border-[#E2E8F0] bg-white flex items-center justify-between flex-wrap gap-4 text-xs">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-medium">Source:</span>
              <select
                value={v1}
                onChange={(e) => setV1(Number(e.target.value))}
                className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-2.5 py-1 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
              >
                {versions.map((v) => (
                  <option key={v.version_num} value={v.version_num}>
                    Version v{v.version_num} ({v.change_summary.slice(0, 24)})
                  </option>
                ))}
              </select>
            </div>

            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />

            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-medium">Target:</span>
              <select
                value={v2}
                onChange={(e) => setV2(Number(e.target.value))}
                className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-2.5 py-1 text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
              >
                {versions.map((v) => (
                  <option key={v.version_num} value={v.version_num}>
                    Version v{v.version_num} ({v.version_num === currentVersion ? 'Active' : v.change_summary.slice(0, 24)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {diff && (
            <div className="flex items-center gap-2">
              {diff.has_changes ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-semibold text-[11px]">
                  <Sparkles className="w-3 h-3" />
                  <span>Changes Detected</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-[11px]">
                  <Check className="w-3 h-3" />
                  <span>Identical Content</span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Diff Canvas */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
          {loading ? (
            <div className="py-20 text-center text-xs text-slate-500">
              <Clock className="w-6 h-6 text-blue-600 animate-spin mx-auto mb-2" />
              <span>Computing version diff...</span>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          ) : !diff ? null : !diff.has_changes ? (
            <div className="py-16 text-center text-xs text-slate-500">
              <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto mb-2">
                <Check className="w-5 h-5" />
              </div>
              <p className="font-semibold text-slate-800">No clinical differences found</p>
              <p className="text-slate-400 mt-0.5">Version v{v1} and Version v{v2} contain identical data across all fields.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Summary Diff */}
              {diff.summary.changed && (
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-2 shadow-xs">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <FileText className="w-3.5 h-3.5 text-blue-600" />
                    <span>Clinical Summary Diff</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-lg bg-rose-50/60 border border-rose-200 text-rose-900 leading-relaxed">
                      <span className="text-[10px] font-mono uppercase text-rose-600 font-bold block mb-1">
                        - Version v{v1} (Previous)
                      </span>
                      {diff.summary.old || <span className="text-slate-400 italic">Empty</span>}
                    </div>
                    <div className="p-3 rounded-lg bg-emerald-50/60 border border-emerald-200 text-emerald-900 leading-relaxed">
                      <span className="text-[10px] font-mono uppercase text-emerald-600 font-bold block mb-1">
                        + Version v{v2} (Updated)
                      </span>
                      {diff.summary.new || <span className="text-slate-400 italic">Empty</span>}
                    </div>
                  </div>
                </div>
              )}

              {/* Active Conditions Diff */}
              {diff.active_issues.some((x) => x.status !== 'unchanged') && (
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-2 shadow-xs">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <Activity className="w-3.5 h-3.5 text-blue-600" />
                    <span>Active Issues / Diagnoses Diff</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {diff.active_issues.map((item, idx) => {
                      if (item.status === 'added') {
                        return (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200"
                          >
                            <Plus className="w-3 h-3 text-emerald-600" />
                            <span>{item.item}</span>
                            <span className="text-[9px] font-mono uppercase text-emerald-600 ml-1">Added</span>
                          </span>
                        );
                      }
                      if (item.status === 'removed') {
                        return (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md bg-rose-50 text-rose-700 border border-rose-200 line-through opacity-80"
                          >
                            <Minus className="w-3 h-3 text-rose-600" />
                            <span>{item.item}</span>
                            <span className="text-[9px] font-mono uppercase text-rose-600 ml-1">Removed</span>
                          </span>
                        );
                      }
                      return (
                        <span
                          key={idx}
                          className="text-xs px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 border border-slate-200"
                        >
                          {item.item}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Medications Diff */}
              {diff.medications.some((x) => x.status !== 'unchanged') && (
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-2 shadow-xs">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <Pill className="w-3.5 h-3.5 text-blue-600" />
                    <span>Medications Diff</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {diff.medications.map((item, idx) => {
                      if (item.status === 'added') {
                        return (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200"
                          >
                            <Plus className="w-3 h-3 text-emerald-600" />
                            <span>{item.item}</span>
                            <span className="text-[9px] font-mono uppercase text-emerald-600 ml-1">Prescribed</span>
                          </span>
                        );
                      }
                      if (item.status === 'removed') {
                        return (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md bg-rose-50 text-rose-700 border border-rose-200 line-through opacity-80"
                          >
                            <Minus className="w-3 h-3 text-rose-600" />
                            <span>{item.item}</span>
                            <span className="text-[9px] font-mono uppercase text-rose-600 ml-1">Discontinued</span>
                          </span>
                        );
                      }
                      return (
                        <span
                          key={idx}
                          className="text-xs px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 border border-slate-200"
                        >
                          {item.item}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Watch-For Alerts Diff */}
              {diff.watch_for.some((x) => x.status !== 'unchanged') && (
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-2 shadow-xs">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                    <span>Watch-For Clinical Alerts Diff</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {diff.watch_for.map((item, idx) => {
                      if (item.status === 'added') {
                        return (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200"
                          >
                            <Plus className="w-3 h-3 text-emerald-600" />
                            <span>{item.item}</span>
                          </span>
                        );
                      }
                      if (item.status === 'removed') {
                        return (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md bg-rose-50 text-rose-700 border border-rose-200 line-through opacity-80"
                          >
                            <Minus className="w-3 h-3 text-rose-600" />
                            <span>{item.item}</span>
                          </span>
                        );
                      }
                      return (
                        <span
                          key={idx}
                          className="text-xs px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 border border-slate-200"
                        >
                          {item.item}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Follow-ups Diff */}
              {diff.follow_ups.some((x) => x.status !== 'unchanged') && (
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-2 shadow-xs">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <Clock className="w-3.5 h-3.5 text-blue-600" />
                    <span>Follow-ups & Recalls Diff</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {diff.follow_ups.map((item, idx) => {
                      if (item.status === 'added') {
                        return (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200"
                          >
                            <Plus className="w-3 h-3 text-emerald-600" />
                            <span>{item.item}</span>
                          </span>
                        );
                      }
                      if (item.status === 'removed') {
                        return (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md bg-rose-50 text-rose-700 border border-rose-200 line-through opacity-80"
                          >
                            <Minus className="w-3 h-3 text-rose-600" />
                            <span>{item.item}</span>
                          </span>
                        );
                      }
                      return (
                        <span
                          key={idx}
                          className="text-xs px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 border border-slate-200"
                        >
                          {item.item}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Notes Diff */}
              {diff.notes.changed && (
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-2 shadow-xs">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <FileText className="w-3.5 h-3.5 text-blue-600" />
                    <span>Physician Notes Diff</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                    <div className="p-3 rounded-lg bg-rose-50/60 border border-rose-200 text-rose-900 whitespace-pre-wrap leading-relaxed">
                      <span className="text-[10px] uppercase text-rose-600 font-bold block mb-1">
                        - Version v{v1}
                      </span>
                      {diff.notes.old || <span className="text-slate-400 italic font-sans">No notes recorded</span>}
                    </div>
                    <div className="p-3 rounded-lg bg-emerald-50/60 border border-emerald-200 text-emerald-900 whitespace-pre-wrap leading-relaxed">
                      <span className="text-[10px] uppercase text-emerald-600 font-bold block mb-1">
                        + Version v{v2}
                      </span>
                      {diff.notes.new || <span className="text-slate-400 italic font-sans">No notes recorded</span>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#E2E8F0] bg-white flex items-center justify-between">
          <div className="text-[11px] text-slate-500">
            Comparing <span className="font-bold">v{v1}</span> vs <span className="font-bold">v{v2}</span>
          </div>

          <div className="flex items-center gap-2">
            {onRestoreVersion && v1 !== currentVersion && (
              <button
                type="button"
                onClick={() => {
                  onRestoreVersion(v1);
                  onClose();
                }}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-semibold text-xs transition-colors border border-slate-200 flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restore v{v1} Snapshot</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs tracking-wide transition-all shadow-sm"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ArtifactDiffModal;
