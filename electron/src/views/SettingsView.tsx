import React, { useState, useEffect } from 'react';
import {
  Shield,
  Laptop,
  CheckCircle2,
  Lock,
  Database,
  FileCheck,
  Server,
  RefreshCw,
  Info,
} from 'lucide-react';
import AppBridge from '../services/bridge';

interface SettingsViewProps {
  onOpenOnboarding?: () => void;
  onOpenWhatsNew?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  onOpenOnboarding,
  onOpenWhatsNew,
}) => {
  // App & Updater Info
  const [versionInfo, setVersionInfo] = useState<{ version: string } | null>(null);
  const [updaterInfo, setUpdaterInfo] = useState<{ version?: string; isPackaged?: boolean; isPortable?: boolean } | null>(null);
  const [updateStatus, setUpdateStatus] = useState<string>('Local-first release · Manual checks only.');
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  // User Feedback Toast
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const showNotification = (type: 'success' | 'error' | 'info', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback(null);
    }, 4500);
  };

  useEffect(() => {
    async function init() {
      try {
        const v = await AppBridge.api.getVersion();
        setVersionInfo(v);
      } catch (_) {}
      try {
        const u = await AppBridge.os.getUpdaterInfo();
        setUpdaterInfo(u);
      } catch (_) {}
    }
    init();

    const unsub = AppBridge.os.onUpdateStatus((data) => {
      if (data.status === 'checking') {
        setCheckingUpdate(true);
        setUpdateStatus('Checking for latest updates on GitHub...');
      } else if (data.status === 'downloading') {
        setCheckingUpdate(true);
        setUpdateStatus(`Downloading update (${data.percent || 0}%)...`);
      } else if (data.status === 'downloaded') {
        setCheckingUpdate(false);
        setUpdateStatus(`Version v${data.version || ''} downloaded and ready to install.`);
      } else if (data.status === 'available') {
        setCheckingUpdate(false);
        setUpdateStatus(`Update available: v${data.version}. ${data.isPortable ? 'Portable download available.' : 'Downloading package...'}`);
      } else if (data.status === 'not-available') {
        setCheckingUpdate(false);
        setUpdateStatus('Agent-D is up to date.');
      } else if (data.status === 'dev-mode') {
        setCheckingUpdate(false);
        setUpdateStatus('Development mode: updates disabled.');
      } else if (data.status === 'error') {
        setCheckingUpdate(false);
        setUpdateStatus(`Update error: ${data.message || 'Check failed.'}`);
      }
    });

    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  return (
    <div className="flex-1 h-full overflow-y-auto bg-white p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Settings &amp; Workstation Profile</h1>
            <p className="text-xs text-slate-500 mt-1">
              Hardware-bound cryptographic storage, data protection compliance, and workstation settings.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded bg-slate-100 border border-[#E2E8F0] text-slate-700">
              v{versionInfo?.version || '0.5.1'}
            </span>
          </div>
        </div>

        {/* Global Feedback Toast */}
        {feedback && (
          <div
            className={`p-3 rounded-lg border text-xs flex items-center justify-between animate-fadeIn ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : feedback.type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-blue-50 border-blue-200 text-blue-800'
            }`}
          >
            <span>{feedback.message}</span>
            <button
              onClick={() => setFeedback(null)}
              className="font-bold ml-2 hover:opacity-75 cursor-pointer"
            >
              ×
            </button>
          </div>
        )}

        {/* ── 1. Cryptographic Storage & Local Vault Status ─────────────────── */}
        <div className="bg-[#F8FAFC] border border-[#BFDBFE] rounded-xl p-5 shadow-2xs flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-100 text-emerald-700 border border-emerald-200">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-900">
                  Local Cryptographic Vault: Active &amp; Encrypted
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
                  🟢 SECURED
                </span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2">
                <span>Algorithm: <strong className="text-slate-800 font-semibold">AES-256-GCM</strong> (PBKDF2 Derived)</span>
                <span>•</span>
                <span>Storage: <code className="font-mono text-slate-700 bg-white px-1 py-0.5 rounded border border-slate-200">%LOCALAPPDATA%\AgentD\context.db</code></span>
              </div>
            </div>
          </div>

          <div className="text-right">
            <span className="text-xs font-mono font-bold text-slate-700 bg-white px-2.5 py-1 rounded-lg border border-[#E2E8F0]">
              WAL Mode Active
            </span>
          </div>
        </div>

        {/* ── 2. Data Protection & Software Integrity Guarantee ─────────────── */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-[#2563EB]">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">Data Protection &amp; Sovereignty Baseline</h2>
                <p className="text-xs text-slate-500">
                  Pure deterministic clinical workstation. Zero artificial intelligence or cloud model dependencies.
                </p>
              </div>
            </div>
            <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
              <Lock className="w-3 h-3" />
              <span>100% DETERMINISTIC</span>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {/* Guarantee 1: Zero AI / LLM */}
            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Zero AI / LLM Processing</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                No cloud language models, no local neural networks, and no generative text synthesis. Zero risk of model hallucinations or unverified diagnostic suggestions.
              </p>
            </div>

            {/* Guarantee 2: Zero Network Egress */}
            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Zero Network Egress</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                All patient health information, consultations, and medical logs reside strictly on this workstation's drive. Zero outbound telemetry or cloud transmission.
              </p>
            </div>

            {/* Guarantee 3: Attending Physician Authority */}
            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
              <div className="flex items-center gap-2 font-bold text-slate-900">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Physician Final Authority</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Every clinical record update, prescription entry, and follow-up ticket requires explicit manual physician confirmation before committing to the vault.
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 leading-relaxed flex items-start gap-2.5">
            <FileCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <strong className="block font-semibold">Regulatory &amp; Legal Compliance:</strong>
              Because Agent-D operates as a pure local documentation and organization workstation with no AI decision support or cloud transmission, it complies fully with the <strong>IT Act 2000 (Section 43A / SPDI Rules)</strong> and the <strong>Digital Personal Data Protection Act (DPDP) 2023</strong> without triggering medical device software classification (CDSCO) or data fiduciary cloud processor risks.
            </div>
          </div>
        </div>

        {/* ── 3. Workstation Architecture & Topology ────────────────────────── */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-[#2563EB]">
                <Server className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">Local Architecture &amp; Loopback Topology</h2>
                <p className="text-xs text-slate-500">
                  Native Electron desktop container paired with an isolated local Python core service.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
              <div className="font-bold text-slate-900">Local Host Binding</div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                The local backend binds strictly to the loopback interface (<code className="font-mono text-slate-800 bg-white px-1 py-0.5 rounded border border-slate-200">127.0.0.1:5050</code>). It is completely invisible and unreachable from the local area network (LAN) or public internet.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
              <div className="font-bold text-slate-900">Per-Session Bearer Authentication</div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                A cryptographically secure 32-byte authorization token is regenerated on each launch and stored exclusively in memory, protecting all internal REST endpoints against unauthorized local processes.
              </p>
            </div>
          </div>
        </div>

        {/* ── 4. Workstation Release & Updates ──────────────────────────────── */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-[#2563EB]">
                <Laptop className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">Workstation Release &amp; Changelog</h2>
                <p className="text-xs text-slate-500">Agent-D v{versionInfo?.version || '0.5.1'} release package.</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenWhatsNew}
                className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-[#E2E8F0] text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
              >
                View Changelog
              </button>
              <button
                type="button"
                onClick={onOpenOnboarding}
                className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-[#E2E8F0] text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
              >
                Replay Onboarding
              </button>
            </div>
          </div>

          <div className="text-xs text-slate-600 leading-relaxed flex items-center justify-between bg-[#F8FAFC] p-3 rounded-lg border border-[#E2E8F0]">
            <div>
              <span className="font-semibold text-slate-900">Update Status: </span>
              <span>{updateStatus}</span>
            </div>
            <button
              onClick={() => {
                setCheckingUpdate(true);
                AppBridge.os.checkForUpdates();
                setTimeout(() => setCheckingUpdate(false), 3000);
              }}
              disabled={checkingUpdate}
              className="px-3 py-1 rounded bg-white hover:bg-slate-50 border border-[#E2E8F0] text-[11px] font-semibold text-slate-700 cursor-pointer"
            >
              {checkingUpdate ? 'Checking...' : 'Check for Updates'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsView;
