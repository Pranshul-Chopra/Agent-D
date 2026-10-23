import React, { useEffect, useState } from 'react';
import {
  Settings,
  Shield,
  Bell,
  Cpu,
  Info,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  RefreshCw,
  Sparkles,
  Lock,
  Server,
  Zap,
  Sliders,
  Plus,
  Trash2,
  Key,
  HardDrive,
  Check,
  RotateCcw,
  ArrowUpCircle,
  Download,
  ShieldCheck,
  ExternalLink,
  Terminal,
  Cloud,
  Laptop,
  ArrowRight,
} from 'lucide-react';
import AppBridge from '../services/bridge';
import type { LLMStatus, LLMProviderPref, LLMConfigPayload, ApiKeyItem, KeyPoolStatus } from '../types';

interface SettingsViewProps {
  onOpenOnboarding?: () => void;
  onOpenWhatsNew?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onOpenOnboarding, onOpenWhatsNew }) => {
  // App Version & Updater State
  const [versionInfo, setVersionInfo] = useState<{ version: string; app_name: string; build_date: string } | null>(null);
  const [updaterInfo, setUpdaterInfo] = useState<{ version: string; isPackaged: boolean; isPortable: boolean } | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string>('idle');
  const [isUpdateReady, setIsUpdateReady] = useState(false);

  // LLM Status & State
  const [llmStatus, setLlmStatus] = useState<LLMStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  // Configuration Form State
  const [providerPref, setProviderPref] = useState<LLMProviderPref>('auto');
  const [modelIdentifier, setModelIdentifier] = useState('');
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  const [ollamaSelectedModel, setOllamaSelectedModel] = useState('');

  // Multi-Key Management State
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [poolStatus, setPoolStatus] = useState<KeyPoolStatus | null>(null);
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [showNewKey, setShowNewKey] = useState(false);
  const [addingKey, setAddingKey] = useState(false);

  // Probe States
  const [probingOllama, setProbingOllama] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

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

      if (data.saved_provider_pref) {
        setProviderPref(data.saved_provider_pref as LLMProviderPref);
      }
      if (data.saved_model) {
        setModelIdentifier(data.saved_model);
      }
      if (data.api_base && !data.api_base.includes('Gemini native')) {
        setCustomBaseUrl(data.api_base);
      }
      if (data.ollama?.selected_model) {
        setOllamaSelectedModel(data.ollama.selected_model);
      } else if (data.ollama?.models && data.ollama.models.length > 0) {
        setOllamaSelectedModel(data.ollama.models[0]);
      }
    } catch (err: any) {
      console.error('Failed to load LLM status:', err);
    } finally {
      setLoadingStatus(false);
    }
  };

  const loadKeys = async () => {
    try {
      const res = await AppBridge.api.listKeys();
      setApiKeys(res.keys || []);
      const pool = await AppBridge.api.getKeyPoolStatus('gemini');
      setPoolStatus(pool);
    } catch (err: any) {
      console.error('Failed to load keys:', err);
    }
  };

  const handleResetCooldown = async (keyId: string) => {
    try {
      await AppBridge.api.resetKeyCooldown(keyId);
      showNotification('success', 'Rate-limit cooldown cleared for key.');
      await loadKeys();
      await loadStatus();
    } catch (err: any) {
      showNotification('error', `Failed to reset cooldown: ${err.message}`);
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
      await loadKeys();
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

  const handleCheckForUpdates = () => {
    setCheckingUpdate(true);
    setUpdateStatus('Querying release feed...');
    AppBridge.os.checkForUpdates();
    setTimeout(() => {
      setCheckingUpdate(false);
    }, 4500);
  };

  const handleRestartToUpdate = () => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('dc_just_updated_restart', 'true');
    }
    AppBridge.os.restartAndInstallUpdate();
  };

  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyValue.trim()) return;

    try {
      setAddingKey(true);
      await AppBridge.api.addKey({
        key_label: newKeyLabel.trim() || 'Gemini Key',
        api_key: newKeyValue.trim(),
        priority: apiKeys.length + 1,
      });
      setNewKeyLabel('');
      setNewKeyValue('');
      showNotification('success', 'Gemini API key encrypted and added to the rotation vault.');
      await loadKeys();
      await loadStatus();
    } catch (err: any) {
      showNotification('error', `Failed to add key: ${err.message}`);
    } finally {
      setAddingKey(false);
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    try {
      await AppBridge.api.deleteKey(keyId);
      showNotification('info', 'API key removed from rotation pool.');
      await loadKeys();
      await loadStatus();
    } catch (err: any) {
      showNotification('error', `Failed to remove key: ${err.message}`);
    }
  };

  // Probe local Ollama service
  const handleProbeOllama = async () => {
    setProbingOllama(true);
    try {
      const data = await AppBridge.api.probeOllama();
      if (data.available) {
        showNotification('success', `Ollama detected! Available models: ${data.models.join(', ') || 'none'}`);
        await loadStatus();
      } else {
        showNotification('error', 'Ollama is not running on 127.0.0.1:11434. Start the service or use Gemini Cloud keys.');
      }
    } catch (err: any) {
      showNotification('error', `Could not reach Ollama: ${err.message}`);
    } finally {
      setProbingOllama(false);
    }
  };

  // Save configuration
  const handleSaveConfiguration = async () => {
    setSavingConfig(true);
    try {
      const payload: LLMConfigPayload = {
        provider: providerPref,
        model_name: modelIdentifier.trim() || undefined,
        api_base: customBaseUrl.trim() || undefined,
      };

      await AppBridge.api.saveLLMConfig(payload);
      showNotification('success', 'AI settings saved successfully.');
      await loadStatus();
    } catch (err: any) {
      showNotification('error', `Failed to save configuration: ${err.message}`);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleTestNotification = () => {
    AppBridge.os.notify("Agent-D Notification", "Desktop notification bridge is operational!");
    showNotification('info', 'Dispatched test notification to Windows notification center.');
  };

  const isOnline = llmStatus && !llmStatus.setup_required;

  return (
    <div className="h-full w-full bg-white overflow-y-auto p-8 select-none">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header - Crisp Black Title */}
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Settings & System Configuration</h1>
          <p className="text-xs text-slate-600 mt-1">
            Local model orchestration, encrypted credentials, medical vault security, and system diagnostics.
          </p>
        </div>

        {/* Floating Feedback Banner */}
        {feedback && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-center justify-between transition-all ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : feedback.type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-blue-50 border-blue-200 text-blue-800'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              ) : feedback.type === 'error' ? (
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              ) : (
                <Info className="w-4 h-4 text-blue-600 flex-shrink-0" />
              )}
              <span className="font-medium">{feedback.message}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-xs font-semibold underline opacity-80 hover:opacity-100 ml-4 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Live AI Status Banner */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div
              className={`w-3.5 h-3.5 rounded-full flex-shrink-0 ${
                isOnline ? 'bg-emerald-500 ring-4 ring-emerald-50' : 'bg-amber-500 ring-4 ring-amber-50'
              }`}
            />
            <div>
              <div className="text-xs font-bold text-slate-900">
                {loadingStatus
                  ? 'Connecting to AI Gateway...'
                  : isOnline
                  ? `Active Provider: ${(llmStatus?.active_provider || 'Gemini Cloud').toUpperCase()}`
                  : 'AI Setup Required'}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {loadingStatus
                  ? 'Probing local backend...'
                  : isOnline
                  ? `Active Inference Model: ${llmStatus?.active_model || 'gemini-2.5-flash'}`
                  : 'Add a Gemini API key below to activate the Clinical Copilot.'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                isOnline
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
            >
              {isOnline ? 'Ready for Consultation' : 'Action Required'}
            </span>
            <button
              onClick={loadStatus}
              className="p-1.5 rounded-lg bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
              title="Refresh AI Gateway"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* AI Engine Setup Guide & Deployment Trade-offs Card */}
        <div className="bg-[#F8FAFC] border border-[#BFDBFE] rounded-xl p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-[#2563EB]">
                <Cpu className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">AI Engine Setup Guide &amp; Deployment Trade-offs</h2>
                <p className="text-[11px] text-slate-500">
                  Step-by-step instructions to configure Google Gemini Cloud API and Local Offline Ollama with clinical trade-offs
                </p>
              </div>
            </div>
            <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-blue-50 text-[#2563EB] border border-blue-200 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB]" />
              <span>HYBRID CLOUD &amp; LOCAL READY</span>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {/* Box 1: Gemini Setup Guide */}
            <div className="p-4 rounded-lg bg-white border border-[#E2E8F0] space-y-2 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-mono font-bold text-[#2563EB] uppercase flex items-center gap-1.5">
                    <Cloud className="w-3.5 h-3.5" />
                    <span>1. Acquire Gemini API Key</span>
                  </div>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-[#2563EB] border border-blue-200">
                    Recommended · Free Tier
                  </span>
                </div>

                <div className="space-y-1.5 text-[11px] text-slate-700 leading-relaxed">
                  <div className="flex items-start gap-1.5">
                    <span className="font-bold text-[#2563EB]">1.</span>
                    <span>
                      Visit{' '}
                      <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#2563EB] font-medium underline inline-flex items-center gap-0.5 hover:text-[#1D4ED8]"
                      >
                        Google AI Studio <ExternalLink className="w-2.5 h-2.5" />
                      </a>{' '}
                      and sign in with your Google account.
                    </span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="font-bold text-[#2563EB]">2.</span>
                    <span>Click <strong>"Create API Key"</strong> (no credit card or billing setup required for free tier).</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="font-bold text-[#2563EB]">3.</span>
                    <span>Copy your key (<code className="font-mono text-[10px] bg-slate-100 px-1 py-0.5 rounded">AIzaSy...</code>) and paste it into the <strong>Key Rotation Vault</strong> below.</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="font-bold text-[#2563EB]">4.</span>
                    <span>Click <strong>"Add Key to Vault"</strong>. Add 2–3 keys across accounts for auto-failover!</span>
                  </div>
                </div>
              </div>

              <div className="p-2 rounded bg-blue-50/60 border border-blue-100 text-[10px] text-blue-900 leading-normal flex items-start gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#2563EB] shrink-0 mt-0.5" />
                <span>
                  <strong>Pro-Tip:</strong> Registering 2 to 3 keys provides automatic round-robin rotation and transparent 60s cooldown rate-limit recovery.
                </span>
              </div>
            </div>

            {/* Box 2: Ollama Local Setup Guide */}
            <div className="p-4 rounded-lg bg-white border border-[#E2E8F0] space-y-2 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-mono font-bold text-slate-700 uppercase flex items-center gap-1.5">
                    <Laptop className="w-3.5 h-3.5 text-slate-800" />
                    <span>2. Host Local Ollama Model</span>
                  </div>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    100% Offline · Air-Gapped
                  </span>
                </div>

                <div className="space-y-1.5 text-[11px] text-slate-700 leading-relaxed">
                  <div className="flex items-start gap-1.5">
                    <span className="font-bold text-slate-800">1.</span>
                    <span>
                      Download &amp; install Ollama from{' '}
                      <a
                        href="https://ollama.com"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#2563EB] font-medium underline inline-flex items-center gap-0.5 hover:text-[#1D4ED8]"
                      >
                        ollama.com <ExternalLink className="w-2.5 h-2.5" />
                      </a>.
                    </span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="font-bold text-slate-800">2.</span>
                    <span>Open PowerShell / Terminal on this PC and pull a clinical model:</span>
                  </div>
                  <div className="bg-slate-900 text-slate-100 p-1.5 rounded font-mono text-[10px] flex items-center justify-between">
                    <code>ollama run llama3.2</code>
                    <span className="text-slate-400 text-[9px]">or mistral / medllama2</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="font-bold text-slate-800">3.</span>
                    <span>Select <strong>"Ollama Local Offline"</strong> in the Dispatch Engine below and click <strong>"Probe Service"</strong>.</span>
                  </div>
                </div>
              </div>

              <div className="p-2 rounded bg-emerald-50/60 border border-emerald-100 text-[10px] text-emerald-900 leading-normal flex items-start gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Zero Network Egress:</strong> Once pulled, Ollama runs entirely on your local GPU/CPU on loopback socket <code className="font-mono text-[10px]">127.0.0.1:11434</code>.
                </span>
              </div>
            </div>

            {/* Box 3: Gemini Cloud Trade-offs */}
            <div className="p-4 rounded-lg bg-white border border-[#E2E8F0] space-y-2">
              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                <span className="text-[11px] font-mono font-bold text-slate-700 uppercase">
                  Gemini Cloud Engine: Trade-offs
                </span>
                <span className="text-[10px] text-[#2563EB] font-bold">State-of-the-Art</span>
              </div>

              <div className="space-y-2 text-[11px]">
                <div className="space-y-1">
                  <div className="font-bold text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Clinical Advantages (Pros)</span>
                  </div>
                  <ul className="text-slate-600 space-y-0.5 pl-4 list-disc text-[10.5px]">
                    <li><strong>Diagnostic Nuance:</strong> Highest accuracy for complex comorbidities, pharmacology, and drug-interaction checks (Gemini 2.5 Flash).</li>
                    <li><strong>Hardware Light:</strong> Sub-second generation with zero local GPU/RAM consumption on clinic laptops.</li>
                    <li><strong>Free Quota:</strong> 15 RPM / 1M TPM per key with multi-key rotation pooling.</li>
                  </ul>
                </div>

                <div className="space-y-1 pt-1 border-t border-slate-100">
                  <div className="font-bold text-amber-800 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                    <span>Trade-offs &amp; Privacy Safeguards</span>
                  </div>
                  <ul className="text-slate-600 space-y-0.5 pl-4 list-disc text-[10.5px]">
                    <li>Requires active internet connection in the consultation room.</li>
                    <li>
                      External API transit: <em>Mitigated by Agent-D's Zero Cloud PII perimeter</em> (patient legal names are scrubbed to <code className="font-mono text-[10px] text-blue-700">PT-XXXX</code> tokens before transmission).
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Box 4: Ollama Local Trade-offs */}
            <div className="p-4 rounded-lg bg-white border border-[#E2E8F0] space-y-2">
              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                <span className="text-[11px] font-mono font-bold text-slate-700 uppercase">
                  Local Ollama Engine: Trade-offs
                </span>
                <span className="text-[10px] text-emerald-700 font-bold">100% Air-Gapped</span>
              </div>

              <div className="space-y-2 text-[11px]">
                <div className="space-y-1">
                  <div className="font-bold text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Sovereignty Advantages (Pros)</span>
                  </div>
                  <ul className="text-slate-600 space-y-0.5 pl-4 list-disc text-[10.5px]">
                    <li><strong>100% Offline:</strong> Functions completely without internet connection during rural or hospital clinic outages.</li>
                    <li><strong>Absolute Privacy:</strong> Zero bytes leave the physical machine; immune to external data interception.</li>
                    <li><strong>No Quota Limits:</strong> Unlimited inferences with zero API keys or rate-limit cooldown windows.</li>
                  </ul>
                </div>

                <div className="space-y-1 pt-1 border-t border-slate-100">
                  <div className="font-bold text-amber-800 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                    <span>Hardware Demands &amp; Model Limitations</span>
                  </div>
                  <ul className="text-slate-600 space-y-0.5 pl-4 list-disc text-[10.5px]">
                    <li><strong>Hardware Heavy:</strong> Requires dedicated NVIDIA/AMD GPU with 8GB–16GB+ VRAM (CPU mode is significantly slower).</li>
                    <li><strong>Quantized Reasoning:</strong> Smaller 3B–8B models have lower clinical depth and higher hallucination risk on rare diseases compared to frontier models.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 1. Multi-Key Gemini API Key Manager */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-[#2563EB]">
                <Key className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">Gemini API Key Rotation Vault</h2>
                <p className="text-xs text-slate-500">
                  Doctor supplies 2 to 3 API keys. Keys rotate round-robin with auto-failover on rate limits.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 font-medium">
              <Shield className="w-3.5 h-3.5" />
              <span>AES-256-GCM Encrypted</span>
            </div>
          </div>

          {/* Key Pool Health Status */}
          {poolStatus && poolStatus.total_keys > 0 && (
            <div
              className={`p-3 rounded-lg border flex items-center justify-between text-xs ${
                poolStatus.all_in_cooldown
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : 'bg-[#F8FAFC] border-[#E2E8F0] text-slate-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    poolStatus.all_in_cooldown
                      ? 'bg-amber-500 animate-pulse'
                      : 'bg-emerald-500'
                  }`}
                />
                <span className="font-bold">
                  {poolStatus.all_in_cooldown
                    ? 'All Keys in Rate-Limit Cooldown'
                    : 'Gateway Rotation Active'}
                </span>
                <span className="text-slate-500">•</span>
                <span>
                  <strong className="text-slate-900">{poolStatus.healthy_keys}</strong> of{' '}
                  <strong className="text-slate-900">{poolStatus.total_keys}</strong> keys ready
                </span>
              </div>
              {poolStatus.all_in_cooldown && (
                <span className="font-semibold text-amber-800">
                  Retry window in ~{poolStatus.retry_countdown_seconds}s
                </span>
              )}
            </div>
          )}

          {/* Key List */}
          <div className="space-y-2">
            {apiKeys.length === 0 ? (
              <div className="py-6 text-center text-slate-400 bg-[#F8FAFC] rounded-xl border border-dashed border-[#E2E8F0]">
                <Key className="w-6 h-6 mx-auto mb-1.5 opacity-40 text-slate-400" />
                <p className="text-xs font-medium text-slate-700">No Gemini API keys registered</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Add your primary key below to start using Copilot.</p>
              </div>
            ) : (
              apiKeys.map((k, idx) => {
                const poolItem = poolStatus?.keys?.find((pk) => pk.id === k.id);
                const inCooldown = !!k.cooldown_until || poolItem?.in_cooldown;
                const secsRemaining = poolItem?.cooldown_seconds_remaining;

                return (
                  <div
                    key={k.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-5 h-5 rounded-full bg-white border border-[#E2E8F0] text-[11px] font-bold text-slate-600 flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">{k.key_label}</span>
                          <span className="font-mono text-xs px-2 py-0.5 rounded bg-white border border-[#E2E8F0] text-slate-600">
                            {k.masked_key}
                          </span>
                          {inCooldown ? (
                            <span className="text-[10px] font-semibold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded border border-amber-300 flex items-center gap-1">
                              <span>Cooldown</span>
                              {secsRemaining ? <span>({secsRemaining}s)</span> : null}
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded border border-emerald-300">
                              Healthy
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Calls: {k.total_calls || 0} • Success: {k.successful_calls || 0} • Rate Limits: {k.rate_limit_errors || 0}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {inCooldown && (
                        <button
                          onClick={() => handleResetCooldown(k.id)}
                          className="flex items-center gap-1 px-2 py-1 rounded bg-white hover:bg-slate-100 border border-[#E2E8F0] text-[11px] font-semibold text-slate-700 cursor-pointer"
                          title="Manually clear 60-second cooldown"
                        >
                          <RotateCcw className="w-3 h-3 text-[#2563EB]" />
                          <span>Clear Cooldown</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteKey(k.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Remove key from vault"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Add Key Form */}
          <form onSubmit={handleAddKey} className="pt-2 border-t border-[#E2E8F0] space-y-3">
            <div className="text-xs font-bold text-slate-900">Add New Key to Vault</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Key Label</label>
                <input
                  type="text"
                  value={newKeyLabel}
                  onChange={(e) => setNewKeyLabel(e.target.value)}
                  placeholder="e.g. Clinic Primary Key"
                  className="w-full px-3 py-2 rounded-lg bg-white border border-[#E2E8F0] focus:border-[#2563EB] text-xs text-slate-900 placeholder:text-slate-400 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Gemini API Key (AIzaSy...)
                </label>
                <div className="relative">
                  <input
                    type={showNewKey ? 'text' : 'password'}
                    required
                    value={newKeyValue}
                    onChange={(e) => setNewKeyValue(e.target.value)}
                    placeholder="Paste Gemini API key"
                    className="w-full pl-3 pr-9 py-2 rounded-lg bg-white border border-[#E2E8F0] focus:border-[#2563EB] text-xs text-slate-900 placeholder:text-slate-400 outline-none font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewKey((prev) => !prev)}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showNewKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={addingKey || !newKeyValue.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{addingKey ? 'Encrypting...' : 'Add Key to Rotation'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* 2. Provider Preferences & Local Model Fallback */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-2xs space-y-4">
          <div className="flex items-center gap-2.5 border-b border-[#E2E8F0] pb-3">
            <div className="w-7 h-7 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-[#2563EB]">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Inference Gateway Dispatch</h2>
              <p className="text-xs text-slate-500">Choose between cloud Gemini rotation or local private Ollama.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setProviderPref('auto')}
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                providerPref === 'auto'
                  ? 'bg-[#EFF6FF] border-[#2563EB] shadow-xs'
                  : 'bg-white border-[#E2E8F0] hover:bg-[#F8FAFC]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">Gemini Multi-Key (Recommended)</span>
                {providerPref === 'auto' && <CheckCircle2 className="w-4 h-4 text-[#2563EB]" />}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Rotates across your saved Gemini API keys with 60-second rate-limit failovers.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setProviderPref('ollama')}
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                providerPref === 'ollama'
                  ? 'bg-[#EFF6FF] border-[#2563EB] shadow-xs'
                  : 'bg-white border-[#E2E8F0] hover:bg-[#F8FAFC]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">Ollama Local Offline</span>
                {providerPref === 'ollama' && <CheckCircle2 className="w-4 h-4 text-[#2563EB]" />}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Runs inference completely on local CPU/GPU via Ollama (127.0.0.1:11434).
              </p>
            </button>
          </div>

          {providerPref === 'ollama' && (
            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-900">Local Ollama Detection</span>
                <button
                  type="button"
                  onClick={handleProbeOllama}
                  disabled={probingOllama}
                  className="flex items-center gap-1.5 px-3 py-1 rounded bg-white hover:bg-[#F1F5F9] border border-[#E2E8F0] text-xs font-medium text-slate-700 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${probingOllama ? 'animate-spin text-[#2563EB]' : ''}`} />
                  <span>Probe Service</span>
                </button>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={handleSaveConfiguration}
              disabled={savingConfig}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{savingConfig ? 'Saving...' : 'Save Dispatch Preferences'}</span>
            </button>
          </div>
        </div>

        {/* 3. Security & Database Diagnostics */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-2xs space-y-4">
          <div className="flex items-center gap-2.5 border-b border-[#E2E8F0] pb-3">
            <div className="w-7 h-7 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-[#2563EB]">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Local Vault Storage & Encryption</h2>
              <p className="text-xs text-slate-500">Security perimeter, storage paths, and notification tests.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
              <span className="text-xs font-bold text-slate-900">Storage Partitioning</span>
              <div className="text-xs text-slate-600 space-y-1">
                <div>• Config DB: <code className="font-mono text-[11px] text-slate-800">%LOCALAPPDATA%\AgentD\config.db</code></div>
                <div>• Context DB: <code className="font-mono text-[11px] text-slate-800">%LOCALAPPDATA%\AgentD\context.db</code></div>
                <div>• Security: <span className="font-semibold text-emerald-700">AES-256-GCM Vault Encrypted</span></div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
              <span className="text-xs font-bold text-slate-900">Desktop Notifications</span>
              <p className="text-xs text-slate-600">
                Test the IPC channel between the React renderer and the Windows notification center.
              </p>
              <button
                type="button"
                onClick={handleTestNotification}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-[#F1F5F9] border border-[#E2E8F0] text-xs font-semibold text-slate-700 cursor-pointer shadow-2xs transition-colors"
              >
                <Bell className="w-3.5 h-3.5 text-[#2563EB]" />
                <span>Test Notification</span>
              </button>
            </div>
          </div>
        </div>

        {/* 4. Desktop Updates & Workstation Maintenance */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-[#2563EB]">
                <ArrowUpCircle className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">Desktop Updates & Workstation Maintenance</h2>
                <p className="text-xs text-slate-500">Auto-update channel, release changelog, and packaging diagnostics.</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {onOpenWhatsNew && (
                <button
                  type="button"
                  onClick={onOpenWhatsNew}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-[#F1F5F9] border border-[#E2E8F0] text-xs font-semibold text-slate-700 cursor-pointer shadow-2xs transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#2563EB]" />
                  <span>What's New</span>
                </button>
              )}

              {isUpdateReady ? (
                <button
                  type="button"
                  onClick={handleRestartToUpdate}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restart & Install</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCheckForUpdates}
                  disabled={checkingUpdate}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checkingUpdate ? 'animate-spin' : ''}`} />
                  <span>{checkingUpdate ? 'Checking...' : 'Check for Updates'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
              <span className="text-xs font-bold text-slate-900">Installed Workstation Build</span>
              <div className="text-xs text-slate-600 space-y-1">
                <div className="flex items-center gap-2">
                  <span>Version:</span>
                  <span className="font-mono font-bold text-slate-900">v{versionInfo?.version || '0.4.0'}</span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Production Release
                  </span>
                </div>
                <div>Build Date: <span className="font-medium text-slate-800">{versionInfo?.build_date || 'October 2026'}</span></div>
                <div>Package Type: <span className="font-medium text-slate-800">{updaterInfo?.isPortable ? 'Standalone Portable (.exe)' : 'NSIS Installer (Managed Shortcuts)'}</span></div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
              <span className="text-xs font-bold text-slate-900">Background Auto-Update Policy</span>
              <div className="text-xs text-slate-600 space-y-1">
                <div>Channel: <span className="font-medium text-slate-800">GitHub Releases (github.com/Pranshul-Chopra/Agent-D)</span></div>
                <div>Schedule: <span className="font-medium text-slate-800">Initial check on launch + 60 min background poll</span></div>
                <div>
                  Status:{' '}
                  <span className={`font-semibold ${isUpdateReady ? 'text-emerald-700' : 'text-slate-800'}`}>
                    {updateStatus === 'idle' ? 'Auto-update service active' : updateStatus}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsView;
