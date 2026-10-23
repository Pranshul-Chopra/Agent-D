import React, { useState, useEffect } from 'react';
import {
  Shield,
  Cpu,
  RefreshCw,
  Terminal,
  ExternalLink,
  Laptop,
  CheckCircle2,
  AlertCircle,
  Copy,
  Info,
  Server,
  Lock,
} from 'lucide-react';
import AppBridge from '../services/bridge';
import type { LLMStatus } from '../types';

interface SettingsViewProps {
  onOpenOnboarding?: () => void;
  onOpenWhatsNew?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  onOpenOnboarding,
  onOpenWhatsNew,
}) => {
  // LLM Status State
  const [llmStatus, setLlmStatus] = useState<LLMStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [probingOllama, setProbingOllama] = useState(false);
  const [ollamaSelectedModel, setOllamaSelectedModel] = useState('');
  const [savingModel, setSavingModel] = useState(false);

  // App & Updater Info
  const [versionInfo, setVersionInfo] = useState<{ version: string } | null>(null);
  const [updaterInfo, setUpdaterInfo] = useState<{ version?: string; isPackaged?: boolean; isPortable?: boolean } | null>(null);
  const [updateStatus, setUpdateStatus] = useState<string>('Local-first release · Manual checks only.');
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [isUpdateReady, setIsUpdateReady] = useState(false);

  // Copied indicator
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  // User Feedback Toast
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const showNotification = (type: 'success' | 'error' | 'info', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback(null);
    }, 4500);
  };

  const loadStatus = async () => {
    try {
      setLoadingStatus(true);
      const data = await AppBridge.api.getLLMStatus();
      setLlmStatus(data);

      if (data.ollama?.selected_model) {
        setOllamaSelectedModel(data.ollama.selected_model);
      } else if (data.ollama?.models && data.ollama.models.length > 0) {
        setOllamaSelectedModel(data.ollama.models[0]);
      }
    } catch (err: any) {
      console.error('Failed to load local LLM status:', err);
    } finally {
      setLoadingStatus(false);
    }
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
      await loadStatus();
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
        setIsUpdateReady(true);
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

  // Probe local Ollama service
  const handleProbeOllama = async () => {
    setProbingOllama(true);
    try {
      const data = await AppBridge.api.probeOllama();
      await loadStatus();
      if (data.available) {
        showNotification(
          'success',
          `Ollama detected on 127.0.0.1:11434! Available models: ${data.models.join(', ') || 'none'}`
        );
      } else {
        showNotification(
          'error',
          'Ollama is not running on 127.0.0.1:11434. Start the service via `ollama serve` or run a model in your terminal.'
        );
      }
    } catch (err: any) {
      showNotification('error', `Could not reach Ollama: ${err.message}`);
    } finally {
      setProbingOllama(false);
    }
  };

  const handleSelectModel = async (modelName: string) => {
    setOllamaSelectedModel(modelName);
    setSavingModel(true);
    try {
      await AppBridge.api.saveLLMConfig({
        provider: 'ollama',
        model_name: modelName,
      });
      showNotification('success', `Active local model updated to ${modelName}`);
      await loadStatus();
    } catch (err: any) {
      showNotification('error', `Failed to save model selection: ${err.message}`);
    } finally {
      setSavingModel(false);
    }
  };

  const handleCopyCommand = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(cmd);
    setTimeout(() => setCopiedCmd(null), 2500);
  };

  const isOllamaRunning = Boolean(llmStatus?.ollama?.available);
  const installedModels = llmStatus?.ollama?.models || [];

  return (
    <div className="flex-1 h-full overflow-y-auto bg-white p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Settings &amp; Local AI Vault</h1>
            <p className="text-xs text-slate-500 mt-1">
              Configure on-device sovereign inference (Ollama 127.0.0.1:11434) and workstation security.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded bg-slate-100 border border-[#E2E8F0] text-slate-700">
              v{versionInfo?.version || '0.5.0'}
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

        {/* ── 1. Single Local AI Engine Status Card ─────────────────────────── */}
        <div className="bg-[#F8FAFC] border border-[#BFDBFE] rounded-xl p-5 shadow-2xs flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isOllamaRunning && installedModels.length > 0
                  ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-100 text-amber-700 border border-amber-200'
              }`}
            >
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-900">
                  {loadingStatus
                    ? 'Probing Local Inference Engine...'
                    : isOllamaRunning && installedModels.length > 0
                    ? `Local AI: Ollama Neural Engine (${ollamaSelectedModel || 'Active'})`
                    : 'Local AI: Embedded Clinical Synthesis (Air-Gapped Fallback)'}
                </span>
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                    isOllamaRunning && installedModels.length > 0
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}
                >
                  {isOllamaRunning && installedModels.length > 0 ? '🟢 OLLAMA ACTIVE' : '🟡 RULE SYNTHESIS'}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2">
                <span>Loopback Socket: <code className="font-mono text-slate-700 bg-white px-1 py-0.5 rounded border border-slate-200">http://127.0.0.1:11434</code></span>
                <span>•</span>
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <Shield className="w-3 h-3 text-emerald-600" />
                  100% Zero Network Egress
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleProbeOllama}
            disabled={probingOllama}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-[#E2E8F0] hover:border-[#2563EB] text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer"
            title="Probe local Ollama connection"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${probingOllama ? 'animate-spin text-[#2563EB]' : ''}`} />
            <span>{probingOllama ? 'Probing...' : 'Probe Service'}</span>
          </button>
        </div>

        {/* ── 2. Local Ollama Step-by-Step Setup Guide ─────────────────────── */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-[#2563EB]">
                <Terminal className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">Local AI Setup Guide (Ollama)</h2>
                <p className="text-xs text-slate-500">
                  Follow these 3 steps to activate neural clinical inference 100% on your workstation hardware.
                </p>
              </div>
            </div>
            <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
              <Lock className="w-3 h-3" />
              <span>SOVEREIGN &amp; AIR-GAPPED</span>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {/* Step 1: Install Ollama */}
            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex flex-col justify-between space-y-3">
              <div className="space-y-2">
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  <span className="w-5 h-5 rounded-full bg-[#2563EB] text-white flex items-center justify-center text-[11px]">
                    1
                  </span>
                  <span>Install Ollama Runtime</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Download and install the official open-source Ollama runtime for Windows on this workstation.
                </p>
              </div>
              <a
                href="https://ollama.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-[#E2E8F0] text-xs font-semibold text-[#2563EB] hover:border-[#2563EB] transition-colors"
              >
                <span>Download from ollama.com</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {/* Step 2: Pull a Model */}
            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex flex-col justify-between space-y-3">
              <div className="space-y-2">
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  <span className="w-5 h-5 rounded-full bg-[#2563EB] text-white flex items-center justify-center text-[11px]">
                    2
                  </span>
                  <span>Pull a Local Model</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Open Windows Terminal or PowerShell and run one of the recommended models:
                </p>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between bg-slate-900 text-slate-100 p-2 rounded-lg font-mono text-[10.5px]">
                    <code>ollama run llama3.2</code>
                    <button
                      type="button"
                      onClick={() => handleCopyCommand('ollama run llama3.2')}
                      className="text-slate-400 hover:text-white cursor-pointer ml-2"
                      title="Copy command"
                    >
                      {copiedCmd === 'ollama run llama3.2' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Recommended: <strong>llama3.2</strong> (3B · fast notes) or <strong>llama3.1:8b</strong> (clinical depth).
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3: Probe & Bind */}
            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex flex-col justify-between space-y-3">
              <div className="space-y-2">
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  <span className="w-5 h-5 rounded-full bg-[#2563EB] text-white flex items-center justify-center text-[11px]">
                    3
                  </span>
                  <span>Verify Local Binding</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Click below to probe the local loopback socket. Agent-D will automatically detect your pulled models.
                </p>
              </div>
              <button
                type="button"
                onClick={handleProbeOllama}
                disabled={probingOllama}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${probingOllama ? 'animate-spin' : ''}`} />
                <span>Probe Local Service</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── 3. Local Model Configuration ──────────────────────────────────── */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-[#2563EB]">
                <Server className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">Active Local Model Selection</h2>
                <p className="text-xs text-slate-500">
                  Select which locally installed Ollama model generates clinical briefs and notes.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                {installedModels.length} models installed
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Installed Models on 127.0.0.1:11434
              </label>
              {installedModels.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-50 border border-dashed border-[#E2E8F0] text-center text-xs text-slate-500">
                  <p className="font-semibold text-slate-700">No models detected in local Ollama repository.</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Run <code className="font-mono text-blue-700 bg-blue-50 px-1 py-0.5 rounded">ollama run llama3.2</code> in your terminal, then click "Probe Service".
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {installedModels.map((model) => {
                    const isSelected = ollamaSelectedModel === model;
                    return (
                      <button
                        key={model}
                        type="button"
                        onClick={() => handleSelectModel(model)}
                        disabled={savingModel}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'bg-[#EFF6FF] border-[#2563EB] text-[#1D4ED8] shadow-2xs'
                            : 'bg-white border-[#E2E8F0] hover:bg-slate-50 text-slate-800'
                        }`}
                      >
                        <div>
                          <div className="font-mono font-bold text-xs truncate">{model}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">On-Device Local</div>
                        </div>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-[#2563EB] flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Zero Network Egress Guarantee Banner */}
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 leading-relaxed flex items-start gap-2.5">
              <Shield className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-semibold">100% Private Workstation Air-Gap:</strong>
                All model execution occurs exclusively inside local workstation RAM and GPU cores over the local loopback socket.
                Zero patient consultation notes, diagnoses, or queries are ever transmitted over external networks or stored on cloud servers.
              </div>
            </div>
          </div>
        </div>

        {/* ── 4. Practice System & Release Updates ──────────────────────────── */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-[#2563EB]">
                <Laptop className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">Workstation Release &amp; Changelog</h2>
                <p className="text-xs text-slate-500">Agent-D v{versionInfo?.version || '0.5.0'} release package.</p>
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
