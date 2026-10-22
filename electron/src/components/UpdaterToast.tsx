import React, { useState, useEffect } from 'react';
import { ArrowUpCircle, CheckCircle, AlertCircle, X, Download, RotateCcw } from 'lucide-react';
import type { UpdateData } from '../types';
import AppBridge from '../services/bridge';

interface UpdaterToastProps {
  data: UpdateData;
}

export const UpdaterToast: React.FC<UpdaterToastProps> = ({ data }) => {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Reset dismissal when new actionable status arrives
    if (data.status === 'available' || data.status === 'downloaded' || data.status === 'downloading') {
      setDismissed(false);
    }
  }, [data.status]);

  if (dismissed || data.status === 'idle' || data.status === 'not-available') {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm w-full bg-white border border-[#E2E8F0] rounded-xl shadow-2xl p-4 flex flex-col gap-2 transition-all duration-200 animate-fadeIn">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {data.status === 'downloaded' ? (
            <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 flex-shrink-0">
              <CheckCircle className="w-4 h-4" />
            </div>
          ) : data.status === 'error' ? (
            <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 flex-shrink-0">
              <AlertCircle className="w-4 h-4" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-[#2563EB] flex-shrink-0">
              <ArrowUpCircle className="w-4 h-4" />
            </div>
          )}

          <div>
            <h4 className="text-xs font-bold text-slate-900">
              {data.status === 'downloaded'
                ? 'Update Ready to Install'
                : data.status === 'downloading'
                ? `Downloading Update (${data.percent || 0}%)`
                : data.status === 'available'
                ? `Update Available: v${data.version}`
                : data.status === 'dev-mode'
                ? 'Development Mode'
                : 'Update Status'}
            </h4>
            <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
              {data.status === 'downloaded'
                ? 'Restart Agent-D now to apply the latest clinical build.'
                : data.status === 'downloading'
                ? 'Fetching package blocks in background.'
                : data.status === 'available'
                ? data.isPortable
                  ? 'A new desktop release is available for download.'
                  : 'A new release was detected. Downloading update in background...'
                : data.message || 'Auto-updater active.'}
            </p>
          </div>
        </div>

        <button
          onClick={() => setDismissed(true)}
          className="text-slate-400 hover:text-slate-700 p-1 rounded transition-colors cursor-pointer"
          aria-label="Dismiss toast"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Progress Bar for Downloading */}
      {data.status === 'downloading' && (
        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-1">
          <div
            className="bg-[#2563EB] h-full transition-all duration-200"
            style={{ width: `${data.percent || 0}%` }}
          />
        </div>
      )}

      {/* Actions */}
      {data.status === 'downloaded' && (
        <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-[#E2E8F0]">
          <button
            onClick={() => setDismissed(true)}
            className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
          >
            Later
          </button>
          <button
            onClick={() => {
              if (typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.setItem('dc_just_updated_restart', 'true');
              }
              AppBridge.os.restartAndInstallUpdate();
            }}
            className="px-3 py-1 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold rounded-lg text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Restart Now</span>
          </button>
        </div>
      )}

      {/* Portable Direct Download Action */}
      {data.status === 'available' && data.isPortable && data.downloadUrl && (
        <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-[#E2E8F0]">
          <button
            onClick={() => setDismissed(true)}
            className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
          >
            Dismiss
          </button>
          <button
            onClick={() => {
              if (data.downloadUrl) {
                window.open(data.downloadUrl, '_blank');
              }
            }}
            className="px-3 py-1 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold rounded-lg text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <Download className="w-3 h-3" />
            <span>Download Release</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default UpdaterToast;
