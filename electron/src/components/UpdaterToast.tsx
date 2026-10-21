import React, { useState, useEffect } from 'react';
import { ArrowUpCircle, CheckCircle, AlertCircle, X } from 'lucide-react';
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
    <div className="fixed bottom-4 right-4 z-50 max-w-sm w-full bg-[#1a1918] border border-[#3a3835] rounded-xl shadow-2xl p-4 flex flex-col gap-2 transition-all duration-200">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {data.status === 'downloaded' ? (
            <CheckCircle className="w-5 h-5 text-[#5aab7f] flex-shrink-0" />
          ) : data.status === 'error' ? (
            <AlertCircle className="w-5 h-5 text-[#e85c4c] flex-shrink-0" />
          ) : (
            <ArrowUpCircle className="w-5 h-5 text-[#e8a84c] flex-shrink-0" />
          )}

          <div>
            <h4 className="text-xs font-semibold text-[#edeae4]">
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
            <p className="text-[11px] text-[#9b9690] mt-0.5">
              {data.status === 'downloaded'
                ? 'Restart PM Tool now to apply the latest build.'
                : data.status === 'downloading'
                ? 'Fetching package blocks in background.'
                : data.status === 'available'
                ? 'A new desktop release was detected.'
                : data.message || 'Auto-updater active.'}
            </p>
          </div>
        </div>

        <button
          onClick={() => setDismissed(true)}
          className="text-[#5c5955] hover:text-[#edeae4] p-1 rounded transition-colors"
          aria-label="Dismiss toast"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Progress Bar for Downloading */}
      {data.status === 'downloading' && (
        <div className="w-full bg-[#222120] h-1.5 rounded-full overflow-hidden mt-1">
          <div
            className="bg-[#e8a84c] h-full transition-all duration-200"
            style={{ width: `${data.percent || 0}%` }}
          />
        </div>
      )}

      {/* Actions */}
      {data.status === 'downloaded' && (
        <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-[#2e2c2a]">
          <button
            onClick={() => setDismissed(true)}
            className="px-2.5 py-1 text-xs text-[#9b9690] hover:text-[#edeae4] transition-colors"
          >
            Later
          </button>
          <button
            onClick={() => {
              if (typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.setItem('pm_tool_just_updated_restart', 'true');
              }
              AppBridge.os.restartAndInstallUpdate();
            }}
            className="px-3 py-1 bg-[#e8a84c] hover:bg-[#d4973b] text-black font-semibold rounded text-xs transition-colors flex items-center gap-1.5"
          >
            Restart Now
          </button>
        </div>
      )}
    </div>
  );
};

export default UpdaterToast;
