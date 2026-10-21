import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Check,
  CheckCircle2,
  FolderKanban,
  Bot,
  Layers,
  Kanban,
  Database,
  BookOpen,
  Keyboard,
  Compass,
  Cpu,
  ShieldCheck,
  Loader2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import AppBridge from '../../services/bridge';
import type { Project, CreateProjectPayload, LLMConfigPayload } from '../../types';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (createdProjectId?: number) => void;
  projects?: Project[];
}

const DOMAIN_PRESETS = [
  'Developer Tools',
  'Enterprise SaaS',
  'FinTech',
  'HealthTech',
  'AI / ML Platform',
  'Consumer Mobile',
  'E-Commerce',
  'Infrastructure',
];

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onClose,
  onComplete,
  projects = [],
}) => {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1: Workspace & Initiative Setup
  const [projectName, setProjectName] = useState('Atlas Analytics Engine');
  const [domain, setDomain] = useState('Enterprise SaaS');
  const [techStack, setTechStack] = useState('React, TypeScript, Python, SQLite');
  const [description, setDescription] = useState(
    'Next-generation analytical instrumentation and agile execution workstation.'
  );
  const [seedBacklog, setSeedBacklog] = useState(true);

  // Step 2: AI Gateway Configuration
  const [provider, setProvider] = useState<'ollama' | 'gemini' | 'openai' | 'offline'>('ollama');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [geminiModel, setGeminiModel] = useState('gemini-1.5-flash');
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState('http://localhost:1234/v1');
  const [openaiModel, setOpenaiModel] = useState('llama-3.2-3b-instruct');
  const [openaiApiKey, setOpenaiApiKey] = useState('');

  // Ollama Probe State
  const [probingOllama, setProbingOllama] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<{
    available: boolean;
    models: string[];
    selected_model?: string;
    warning?: string;
  } | null>(null);
  const [selectedOllamaModel, setSelectedOllamaModel] = useState('');

  // Finalization State
  const [isFinishing, setIsFinishing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Probe Ollama on initial load or step 2 transition
  const probeLocalOllama = async () => {
    setProbingOllama(true);
    try {
      const res = await AppBridge.api.probeOllama();
      setOllamaStatus(res);
      if (res.available && res.models && res.models.length > 0) {
        setSelectedOllamaModel(res.selected_model || res.models[0]);
      }
    } catch (err) {
      console.warn('Ollama probe error:', err);
      setOllamaStatus({ available: false, models: [], warning: 'Ollama service unreachable' });
    } finally {
      setProbingOllama(false);
    }
  };

  useEffect(() => {
    if (isOpen && currentStep === 2 && provider === 'ollama') {
      probeLocalOllama();
    }
  }, [isOpen, currentStep, provider]);

  if (!isOpen) return null;

  // Complete Onboarding & Save Configurations
  const handleFinish = async () => {
    setIsFinishing(true);
    setErrorMsg(null);

    let createdId: number | undefined;

    try {
      // 1. Create Initial Project if user provided a name
      if (projectName.trim()) {
        const payload: CreateProjectPayload = {
          name: projectName.trim(),
          domain: domain.trim(),
          tech_stack: techStack.trim(),
          description: description.trim(),
          priority: 'high',
          health: 'planning',
          seed_tasks: seedBacklog,
        };

        const res = await AppBridge.api.createProject(payload);
        if (res && res.id) {
          createdId = res.id;

          // If seedBacklog requested, create initial calibrated user stories
          if (seedBacklog) {
            const seedStories = [
              {
                title: 'Design high-throughput SQLite schema & migrations',
                description: 'Define relational tables and foreign keys with WAL mode.',
                status: 'todo',
                priority: 'high',
                story_points: 3,
                acceptance_criteria:
                  'Given clean database initialization, When migrations run, Then all tables and indexes exist without error.',
              },
              {
                title: 'Implement interactive frontend workbench UI',
                description: 'Build responsive single-DOM interface with keyboard navigation.',
                status: 'in_progress',
                priority: 'critical',
                story_points: 5,
                acceptance_criteria:
                  'Given desktop viewport, When user navigates tabs, Then view transitions complete smoothly.',
              },
              {
                title: 'Verify multi-format export and automated tests',
                description: 'Execute end-to-end regression suites across DOCX and Markdown exports.',
                status: 'todo',
                priority: 'medium',
                story_points: 2,
                acceptance_criteria:
                  'Given living document, When exported to DOCX, Then 1-inch margins and tables format accurately.',
              },
            ];

            for (const story of seedStories) {
              try {
                await AppBridge.api.createTask({
                  project_id: createdId,
                  ...story,
                });
              } catch (_) {}
            }
          }
        }
      }

      // 2. Configure AI Provider Preferences
      if (provider === 'ollama') {
        await AppBridge.api.saveLLMConfig({
          provider: 'ollama',
          model_name: selectedOllamaModel || undefined,
        });
      } else if (provider === 'gemini' && geminiApiKey.trim()) {
        await AppBridge.api.saveLLMConfig({
          provider: 'api',
          api_key: geminiApiKey.trim(),
          model_name: geminiModel,
        });
      } else if (provider === 'openai' && (openaiBaseUrl.trim() || openaiApiKey.trim())) {
        await AppBridge.api.saveLLMConfig({
          provider: 'api',
          api_base: openaiBaseUrl.trim(),
          api_key: openaiApiKey.trim() || undefined,
          model_name: openaiModel.trim(),
        });
      }

      // 3. Mark Onboarding as Completed
      localStorage.setItem('pm_tool_onboarding_completed', 'true');

      // 4. Trigger completion callback
      onComplete(createdId);
      onClose();
    } catch (err: any) {
      console.error('Failed to complete onboarding:', err);
      setErrorMsg(err.message || 'Failed to initialize workspace');
      setIsFinishing(false);
    }
  };

  const handleSkip = () => {
    localStorage.setItem('pm_tool_onboarding_completed', 'true');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in select-none">
      <div className="w-full max-w-3xl rounded-2xl bg-[#161514] border border-[#2e2c2a] shadow-2xl flex flex-col overflow-hidden text-[#edeae4] max-h-[90vh]">
        {/* Top Header & Step Tracker */}
        <div className="px-6 py-4 border-b border-[#2e2c2a] bg-[#1a1918] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#e8a84c] flex items-center justify-center text-black font-mono font-bold text-xs">
              PM
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#edeae4] flex items-center gap-2">
                <span>Welcome to PM Tool</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#e8a84c]/20 text-[#e8a84c] border border-[#e8a84c]/40 font-semibold">
                  v2.2.0 Setup
                </span>
              </h2>
              <p className="text-[11px] font-mono text-[#716d67]">
                Local-first, privacy-preserving engineering & product management
              </p>
            </div>
          </div>

          {/* Close / Skip */}
          <button
            onClick={handleSkip}
            className="text-xs font-mono text-[#716d67] hover:text-[#edeae4] px-2 py-1 rounded hover:bg-[#252422] transition-colors"
          >
            Skip for now
          </button>
        </div>

        {/* Step Progress Indicators */}
        <div className="px-6 py-2.5 bg-[#141413] border-b border-[#2e2c2a] flex items-center justify-between text-xs font-mono">
          {[
            { num: 1, label: 'Workspace' },
            { num: 2, label: 'AI Gateway' },
            { num: 3, label: 'Workstation Tour' },
            { num: 4, label: 'Ready' },
          ].map((s) => {
            const isCurrent = currentStep === s.num;
            const isDone = currentStep > s.num;
            return (
              <div key={s.num} className="flex items-center gap-2">
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    isDone
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : isCurrent
                      ? 'bg-[#e8a84c] text-black'
                      : 'bg-[#222120] text-[#716d67] border border-[#2e2c2a]'
                  }`}
                >
                  {isDone ? <Check className="w-3 h-3 stroke-[2.5]" /> : s.num}
                </div>
                <span
                  className={`hidden sm:inline ${
                    isCurrent ? 'text-[#edeae4] font-semibold' : 'text-[#716d67]'
                  }`}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Modal Body: Dynamic Step Content */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0 space-y-5 custom-scroll">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────
              STEP 1: WORKSPACE & INITIATIVE SETUP
          ───────────────────────────────────────────────────────────── */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-[#edeae4]">
                  Create your first Workspace & Initiative
                </h3>
                <p className="text-xs text-[#9b9690] mt-0.5">
                  PM Tool organizes agile sprint boards, living documents, and analytical datasets around initiatives.
                </p>
              </div>

              {/* Initiative Name */}
              <div className="space-y-1">
                <label className="text-xs font-mono text-[#9b9690] font-medium">
                  Initiative / Project Name
                </label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g. Core Mobile App, Payment Gateway"
                  className="w-full px-3 py-2 rounded-lg bg-[#111110] border border-[#2e2c2a] text-xs font-mono text-[#edeae4] focus:outline-none focus:border-[#e8a84c] transition-colors"
                />
              </div>

              {/* Domain Preset Chips */}
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-[#9b9690] font-medium">
                  Domain / Industry
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {DOMAIN_PRESETS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDomain(d)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition-all ${
                        domain === d
                          ? 'bg-[#e8a84c]/20 text-[#e8a84c] border border-[#e8a84c]/50 font-semibold'
                          : 'bg-[#111110] text-[#716d67] border border-[#2e2c2a] hover:border-[#3e3c38]'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tech Stack */}
              <div className="space-y-1">
                <label className="text-xs font-mono text-[#9b9690] font-medium">
                  Primary Engineering Tech Stack
                </label>
                <input
                  type="text"
                  value={techStack}
                  onChange={(e) => setTechStack(e.target.value)}
                  placeholder="e.g. React, Node, Python, Postgres"
                  className="w-full px-3 py-2 rounded-lg bg-[#111110] border border-[#2e2c2a] text-xs font-mono text-[#edeae4] focus:outline-none focus:border-[#e8a84c] transition-colors"
                />
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="text-xs font-mono text-[#9b9690] font-medium">
                  Core Mission & Objectives
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Briefly describe what this initiative achieves..."
                  className="w-full px-3 py-2 rounded-lg bg-[#111110] border border-[#2e2c2a] text-xs leading-relaxed text-[#edeae4] focus:outline-none focus:border-[#e8a84c] transition-colors resize-none"
                />
              </div>

              {/* Seed Backlog Checkbox */}
              <label className="flex items-center gap-2.5 p-3 rounded-lg bg-[#111110] border border-[#2e2c2a] cursor-pointer hover:border-[#3e3c38] transition-colors">
                <input
                  type="checkbox"
                  checked={seedBacklog}
                  onChange={(e) => setSeedBacklog(e.target.checked)}
                  className="rounded border-[#2e2c2a] text-[#e8a84c] focus:ring-0 cursor-pointer"
                />
                <div className="text-xs">
                  <span className="font-semibold text-[#edeae4]">
                    Pre-populate with calibrated INVEST Agile user stories
                  </span>
                  <p className="text-[#716d67] text-[11px] mt-0.5">
                    Includes sample acceptance criteria (Given/When/Then) and Fibonacci story points.
                  </p>
                </div>
              </label>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────
              STEP 2: AI GATEWAY & LLM PROVIDER SELECTION
          ───────────────────────────────────────────────────────────── */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-[#edeae4]">
                  Configure your AI Copilot Engine
                </h3>
                <p className="text-xs text-[#9b9690] mt-0.5">
                  PM Tool supports 100% offline local LLMs via Ollama, cloud providers, or complete offline operation.
                </p>
              </div>

              {/* Provider Selection Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Local Ollama Card */}
                <div
                  onClick={() => setProvider('ollama')}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                    provider === 'ollama'
                      ? 'bg-[#1c1c1b] border-[#e8a84c] shadow-[0_0_15px_rgba(232,168,76,0.1)]'
                      : 'bg-[#111110] border-[#2e2c2a] hover:border-[#3e3c38]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-[#e8a84c]" />
                      <span className="font-semibold text-xs text-[#edeae4]">Local Ollama</span>
                    </div>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      100% Private
                    </span>
                  </div>
                  <p className="text-[11px] text-[#716d67] leading-relaxed">
                    Runs locally on your device via Ollama at <code className="text-[#e8a84c]">localhost:11434</code>. Zero data leaves your machine.
                  </p>
                </div>

                {/* Google Gemini Card */}
                <div
                  onClick={() => setProvider('gemini')}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                    provider === 'gemini'
                      ? 'bg-[#1c1c1b] border-[#e8a84c] shadow-[0_0_15px_rgba(232,168,76,0.1)]'
                      : 'bg-[#111110] border-[#2e2c2a] hover:border-[#3e3c38]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[#38bdf8]" />
                      <span className="font-semibold text-xs text-[#edeae4]">Google Gemini</span>
                    </div>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30">
                      High Speed
                    </span>
                  </div>
                  <p className="text-[11px] text-[#716d67] leading-relaxed">
                    Enterprise cloud reasoning with 1M+ token context windows for deep PRD synthesis.
                  </p>
                </div>

                {/* Custom / OpenAI Compatible Card */}
                <div
                  onClick={() => setProvider('openai')}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                    provider === 'openai'
                      ? 'bg-[#1c1c1b] border-[#e8a84c] shadow-[0_0_15px_rgba(232,168,76,0.1)]'
                      : 'bg-[#111110] border-[#2e2c2a] hover:border-[#3e3c38]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Bot className="w-4 h-4 text-[#b388ff]" />
                      <span className="font-semibold text-xs text-[#edeae4]">Custom / LM Studio</span>
                    </div>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/30">
                      OpenAI API
                    </span>
                  </div>
                  <p className="text-[11px] text-[#716d67] leading-relaxed">
                    Connect local LM Studio, LocalAI, vLLM, or OpenRouter custom endpoints.
                  </p>
                </div>

                {/* Offline / Skip for Now Card */}
                <div
                  onClick={() => setProvider('offline')}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                    provider === 'offline'
                      ? 'bg-[#1c1c1b] border-[#e8a84c] shadow-[0_0_15px_rgba(232,168,76,0.1)]'
                      : 'bg-[#111110] border-[#2e2c2a] hover:border-[#3e3c38]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-[#a1a1aa]" />
                      <span className="font-semibold text-xs text-[#edeae4]">Set Up Later / Offline</span>
                    </div>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-500/10 text-zinc-400 border border-zinc-500/30">
                      Standard
                    </span>
                  </div>
                  <p className="text-[11px] text-[#716d67] leading-relaxed">
                    Use PM Tool purely as a local agile workstation. Configure AI anytime from Settings.
                  </p>
                </div>
              </div>

              {/* Provider Config Details Pane */}
              <div className="p-4 rounded-xl bg-[#111110] border border-[#2e2c2a] space-y-3">
                {provider === 'ollama' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-[#edeae4] font-semibold">
                        Ollama Daemon Status:
                      </span>
                      <button
                        onClick={probeLocalOllama}
                        disabled={probingOllama}
                        className="px-2.5 py-1 rounded bg-[#1c1c1b] border border-[#2e2c2a] hover:border-[#3e3c38] text-[11px] font-mono text-[#e8a84c] flex items-center gap-1.5 transition-colors disabled:opacity-50"
                      >
                        {probingOllama ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Cpu className="w-3 h-3" />
                        )}
                        <span>Probe Status</span>
                      </button>
                    </div>

                    {ollamaStatus?.available ? (
                      <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs flex items-center justify-between">
                        <div className="flex items-center gap-2 text-emerald-400">
                          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                          <span>Ollama detected with {ollamaStatus.models.length} model(s) installed.</span>
                        </div>
                        {ollamaStatus.models.length > 0 && (
                          <select
                            value={selectedOllamaModel}
                            onChange={(e) => setSelectedOllamaModel(e.target.value)}
                            className="bg-[#161514] border border-[#2e2c2a] text-xs font-mono text-[#edeae4] rounded px-2 py-1 outline-none"
                          >
                            {ollamaStatus.models.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-lg bg-[#1c1c1b] border border-[#2e2c2a] text-xs text-[#9b9690] leading-relaxed">
                        Ollama was not detected at <code className="text-[#e8a84c]">http://localhost:11434</code>. Run <code className="text-[#edeae4] bg-[#222120] px-1 rounded">ollama serve</code> in your terminal if you wish to use local models, or choose another provider above.
                      </div>
                    )}
                  </div>
                )}

                {provider === 'gemini' && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-[#9b9690]">Google AI Studio API Key</span>
                        <a
                          href="https://aistudio.google.com/app/apikey"
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#38bdf8] hover:underline flex items-center gap-1 text-[10px]"
                        >
                          <span>Get Free Key</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                      <input
                        type="password"
                        value={geminiApiKey}
                        onChange={(e) => setGeminiApiKey(e.target.value)}
                        placeholder="AIzaSy..."
                        className="w-full px-3 py-1.5 rounded-lg bg-[#161514] border border-[#2e2c2a] text-xs font-mono text-[#edeae4] focus:outline-none focus:border-[#e8a84c]"
                      />
                    </div>
                  </div>
                )}

                {provider === 'openai' && (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs font-mono text-[#9b9690]">Base URL</label>
                      <input
                        type="text"
                        value={openaiBaseUrl}
                        onChange={(e) => setOpenaiBaseUrl(e.target.value)}
                        placeholder="http://localhost:1234/v1"
                        className="w-full px-3 py-1.5 rounded-lg bg-[#161514] border border-[#2e2c2a] text-xs font-mono text-[#edeae4] focus:outline-none focus:border-[#e8a84c]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-mono text-[#9b9690]">Model ID</label>
                      <input
                        type="text"
                        value={openaiModel}
                        onChange={(e) => setOpenaiModel(e.target.value)}
                        placeholder="e.g. llama-3.2-3b-instruct"
                        className="w-full px-3 py-1.5 rounded-lg bg-[#161514] border border-[#2e2c2a] text-xs font-mono text-[#edeae4] focus:outline-none focus:border-[#e8a84c]"
                      />
                    </div>
                  </div>
                )}

                {provider === 'offline' && (
                  <div className="text-xs text-[#716d67] leading-relaxed">
                    PM Tool will operate in offline mode without automated LLM completions. You can use full Kanban, Data Studio SQL queries, and Living Documents.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────
              STEP 3: WORKSTATION FEATURE TOUR & HOTKEYS SPOTLIGHT
          ───────────────────────────────────────────────────────────── */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-[#edeae4]">
                  Workstation Architecture & Hotkeys
                </h3>
                <p className="text-xs text-[#9b9690] mt-0.5">
                  PM Tool connects 3 core analytical & execution pipelines with instant global keyboard navigation.
                </p>
              </div>

              {/* 3 Core Pipelines Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-[#111110] border border-[#2e2c2a] flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <Kanban className="w-4 h-4 text-[#e8a84c]" />
                      <span className="font-mono text-[10px] text-[#716d67]">Ctrl + 2</span>
                    </div>
                    <h4 className="font-semibold text-xs text-[#edeae4]">Sprint Kanban</h4>
                    <p className="text-[11px] text-[#716d67] mt-1 leading-relaxed">
                      INVEST user stories, story points, and calibrated pre-commit PRD decomposition.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#111110] border border-[#2e2c2a] flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <Database className="w-4 h-4 text-[#38bdf8]" />
                      <span className="font-mono text-[10px] text-[#716d67]">Ctrl + 3</span>
                    </div>
                    <h4 className="font-semibold text-xs text-[#edeae4]">Data Studio</h4>
                    <p className="text-[11px] text-[#716d67] mt-1 leading-relaxed">
                      Safe SQL sandbox, cohort retention matrices, funnel drop-off analysis, and outlier detection.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#111110] border border-[#2e2c2a] flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <BookOpen className="w-4 h-4 text-[#4ade80]" />
                      <span className="font-mono text-[10px] text-[#716d67]">Ctrl + 4</span>
                    </div>
                    <h4 className="font-semibold text-xs text-[#edeae4]">Artifacts Studio</h4>
                    <p className="text-[11px] text-[#716d67] mt-1 leading-relaxed">
                      Living PRDs and RFCs stored in dedicated <code className="text-[#e8a84c]">artifacts.db</code> with 1-click DOCX & Markdown export.
                    </p>
                  </div>
                </div>
              </div>

              {/* Global Keyboard Shortcuts Table */}
              <div className="p-3.5 rounded-xl bg-[#111110] border border-[#2e2c2a] space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-[#edeae4]">
                  <Keyboard className="w-3.5 h-3.5 text-[#e8a84c]" />
                  <span>Essential Keyboard Shortcuts</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
                  <div className="p-2 rounded bg-[#161514] border border-[#2e2c2a] flex flex-col">
                    <span className="text-[#e8a84c] font-bold">Ctrl + K</span>
                    <span className="text-[#716d67] text-[10px]">Command Palette</span>
                  </div>
                  <div className="p-2 rounded bg-[#161514] border border-[#2e2c2a] flex flex-col">
                    <span className="text-[#e8a84c] font-bold">Ctrl + B</span>
                    <span className="text-[#716d67] text-[10px]">Toggle Sidebar</span>
                  </div>
                  <div className="p-2 rounded bg-[#161514] border border-[#2e2c2a] flex flex-col">
                    <span className="text-[#e8a84c] font-bold">Ctrl + 5</span>
                    <span className="text-[#716d67] text-[10px]">AI Copilot Chat</span>
                  </div>
                  <div className="p-2 rounded bg-[#161514] border border-[#2e2c2a] flex flex-col">
                    <span className="text-[#e8a84c] font-bold">Ctrl + 1</span>
                    <span className="text-[#716d67] text-[10px]">Workspace Home</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────
              STEP 4: READY TO LAUNCH
          ───────────────────────────────────────────────────────────── */}
          {currentStep === 4 && (
            <div className="space-y-4 py-2 text-center">
              <div className="w-12 h-12 rounded-2xl bg-[#e8a84c]/20 border border-[#e8a84c]/40 text-[#e8a84c] flex items-center justify-center mx-auto">
                <Compass className="w-6 h-6 animate-pulse" />
              </div>

              <div>
                <h3 className="text-lg font-bold text-[#edeae4]">
                  You're all set to launch!
                </h3>
                <p className="text-xs text-[#9b9690] mt-1 max-w-md mx-auto">
                  Your baseline workspace <strong className="text-[#edeae4]">"{projectName}"</strong> has been configured with segregated databases and local-first persistence.
                </p>
              </div>

              {/* Summary Summary Card */}
              <div className="max-w-md mx-auto p-4 rounded-xl bg-[#111110] border border-[#2e2c2a] text-left text-xs font-mono space-y-2">
                <div className="flex justify-between border-b border-[#232220] pb-1.5">
                  <span className="text-[#716d67]">Initiative:</span>
                  <span className="text-[#edeae4] font-semibold">{projectName}</span>
                </div>
                <div className="flex justify-between border-b border-[#232220] pb-1.5">
                  <span className="text-[#716d67]">Domain / Tech:</span>
                  <span className="text-[#edeae4]">{domain}</span>
                </div>
                <div className="flex justify-between border-b border-[#232220] pb-1.5">
                  <span className="text-[#716d67]">AI Engine:</span>
                  <span className="text-[#e8a84c] uppercase font-semibold">{provider}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#716d67]">Storage Architecture:</span>
                  <span className="text-emerald-400 font-semibold">pmtool.db + artifacts.db</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="px-6 py-3.5 border-t border-[#2e2c2a] bg-[#1a1918] flex items-center justify-between flex-shrink-0">
          <div>
            {currentStep > 1 && (
              <button
                type="button"
                onClick={() => setCurrentStep((prev) => (prev - 1) as any)}
                className="px-3 py-1.5 rounded-lg border border-[#2e2c2a] hover:border-[#3e3c38] text-xs font-mono text-[#edeae4] flex items-center gap-1.5 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {currentStep < 4 ? (
              <button
                type="button"
                onClick={() => setCurrentStep((prev) => (prev + 1) as any)}
                className="px-4 py-1.5 rounded-lg bg-[#e8a84c] hover:bg-[#d4963d] text-black font-semibold text-xs font-mono flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <span>Continue</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                disabled={isFinishing}
                onClick={handleFinish}
                className="px-5 py-2 rounded-lg bg-[#e8a84c] hover:bg-[#d4963d] text-black font-bold text-xs font-mono flex items-center gap-2 transition-colors shadow-lg disabled:opacity-50"
              >
                {isFinishing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Launching Workstation...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 stroke-[2.5]" />
                    <span>Launch PM Tool Workstation</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingModal;
