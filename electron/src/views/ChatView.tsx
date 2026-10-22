import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Copy,
  Check,
  Stethoscope,
  Bot,
  User,
  Sparkles,
  Calendar,
  Clock,
  Pill,
  FileText,
  AlertCircle,
  Loader2,
  Square,
  ShieldCheck,
} from 'lucide-react';
import AppBridge from '../services/bridge';
import MarkdownContent from '../components/chat/MarkdownContent';
import type { Patient } from '../types';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  timestamp: string;
  isStreaming?: boolean;
}

interface ConversationItem {
  id: string;
  title: string;
  created_at: string;
  message_count?: number;
}

const CLINICAL_PROMPT_CHIPS = [
  { label: '☀️ Morning Brief', prompt: "What's on my dashboard today? Brief me on today's appointments and pending tasks." },
  { label: '🩺 Next Patient Brief', prompt: 'Who is my next scheduled patient and what crucial watch-for items should I check?' },
  { label: '💊 Medication Review', prompt: 'Review current active medications and dosages for this patient.' },
  { label: '📝 Dictate Visit Notes', prompt: 'I want to record visit notes: Patient presented stable vitals, BP 124/82, HR 72. Formulate clinical impressions and follow-up plan.' },
];

export interface SlashCommandItem {
  cmd: string;
  mode: string;
  icon: string;
  label: string;
  name: string;
  desc: string;
  badgeClass: string;
  placeholder: string;
}

export const SLASH_COMMANDS: SlashCommandItem[] = [
  {
    cmd: '/consultation',
    mode: 'consultation',
    icon: '🤝',
    label: '/consultation',
    name: 'Schedule Consultation',
    desc: 'Schedule or update patient consultation encounter',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    placeholder: '/consultation Schedule follow-up visit for next week',
  },
  {
    cmd: '/brief',
    mode: 'brief',
    icon: '☀️',
    label: '/brief',
    name: 'Morning & Pre-Visit Brief',
    desc: "Review today's clinical schedule, next patient, and priorities",
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    placeholder: "/brief What's on my schedule today?",
  },
  {
    cmd: '/note',
    mode: 'note',
    icon: '📝',
    label: '/note',
    name: 'Dictate SOAP Visit Note',
    desc: 'Format clinical observations into structured encounter note',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
    placeholder: '/note Patient presented with stable vitals: BP 120/80',
  },
  {
    cmd: '/ticket',
    mode: 'ticket',
    icon: '📋',
    label: '/ticket',
    name: 'Clinical Follow-up Ticket',
    desc: 'Propose lab orders, tests, or care plan action items',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    placeholder: '/ticket Order 3-month follow-up lab panel',
  },
  {
    cmd: '/artifact',
    mode: 'artifact',
    icon: '🩺',
    label: '/artifact',
    name: 'Patient Chart Artifact',
    desc: 'Propose amendment to active issues, medications, or watch-for items',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    placeholder: '/artifact Titrate current medications and adjust dose',
  },
  {
    cmd: '/meds',
    mode: 'meds',
    icon: '💊',
    label: '/meds',
    name: 'Medication Review',
    desc: 'Review active prescriptions, dosages, and interactions',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    placeholder: '/meds Review current medications and check interactions',
  },
  {
    cmd: '/search',
    mode: 'search',
    icon: '🔍',
    label: '/search',
    name: 'Clinical Chart Search',
    desc: 'Query local encrypted patient records and encounter history',
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
    placeholder: '/search Search previous encounter notes for ',
  },
];

export interface ChatViewProps {
  inheritedTab?: string | null;
  initialProjectId?: number | null;
  onClearInheritedTab?: () => void;
  activePatient?: Patient | null;
}

export const ChatView: React.FC<ChatViewProps> = ({ activePatient }) => {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  // Slash commands state (from PranshulOS pattern)
  const [isSlashPopupVisible, setIsSlashPopupVisible] = useState(false);
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cancelStreamRef = useRef<(() => void) | null>(null);

  // Filter matching slash commands based on input
  const matchingSlashCommands = React.useMemo(() => {
    const trimmed = input.trim().toLowerCase();
    if (!trimmed.startsWith('/')) {
      return SLASH_COMMANDS;
    }
    const token = trimmed.split(/\s+/)[0];
    return SLASH_COMMANDS.filter((c) => c.cmd.toLowerCase().startsWith(token));
  }, [input]);

  const handleSelectSlashCommand = (cmd: SlashCommandItem) => {
    setInput(`${cmd.cmd} `);
    setIsSlashPopupVisible(false);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleToggleSlashMenu = () => {
    setIsSlashPopupVisible((prev) => !prev);
    setSlashActiveIndex(0);
    if (!isSlashPopupVisible && textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    if (val.startsWith('/')) {
      const token = val.split(/\s+/)[0].toLowerCase();
      // If user typed space beyond command, dismiss popup
      if (val.includes(' ') && val.length > token.length + 1) {
        setIsSlashPopupVisible(false);
      } else {
        setIsSlashPopupVisible(true);
        setSlashActiveIndex(0);
      }
    } else {
      setIsSlashPopupVisible(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // If slash popup is open, handle keyboard navigation
    if (isSlashPopupVisible && matchingSlashCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashActiveIndex((prev) => (prev + 1) % matchingSlashCommands.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashActiveIndex((prev) => (prev - 1 + matchingSlashCommands.length) % matchingSlashCommands.length);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        const selected = matchingSlashCommands[slashActiveIndex];
        if (selected) {
          handleSelectSlashCommand(selected);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsSlashPopupVisible(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      setIsSlashPopupVisible(false);
      handleSendMessage();
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Load conversations on mount or when activePatient changes
  useEffect(() => {
    loadConversations();
    return () => {
      if (cancelStreamRef.current) {
        cancelStreamRef.current();
      }
    };
  }, [activePatient?.id]);

  const loadConversations = async () => {
    try {
      const res = await AppBridge.api.listChatSessions(activePatient?.id);
      const list = res.sessions || [];
      setConversations(list);
      if (list.length > 0) {
        if (!activeConvId || !list.some((c: any) => c.id === activeConvId)) {
          selectConversation(list[0].id);
        }
      } else {
        setActiveConvId(null);
        setMessages([]);
      }
    } catch (_) {}
  };

  const selectConversation = async (convId: string) => {
    if (cancelStreamRef.current) {
      cancelStreamRef.current();
      cancelStreamRef.current = null;
      setLoading(false);
    }
    setActiveConvId(convId);
    try {
      const res = await AppBridge.api.getChatSession(convId);
      if (res.session && res.session.messages) {
        const mapped: ChatMessage[] = res.session.messages.map((m: any) => ({
          id: m.id || String(Math.random()),
          sender: m.role === 'user' ? 'user' : 'assistant',
          content: m.content || '',
          timestamp: m.created_at
            ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : '',
        }));
        setMessages(mapped);
      } else {
        setMessages([]);
      }
    } catch (_) {}
  };

  const handleNewConversation = async () => {
    try {
      const title = activePatient ? `Consult: ${activePatient.display_name}` : 'Clinical Consultation';
      const res = await AppBridge.api.createChatSession(title, activePatient?.id);
      const session = res.session || res.conversation;
      if (session) {
        setConversations((prev) => [session, ...prev]);
        setActiveConvId(session.id);
        setMessages([]);
      }
    } catch (_) {}
  };

  const handleDeleteConversation = async (e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    try {
      await AppBridge.api.deleteChatSession(convId);
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (activeConvId === convId) {
        const remaining = conversations.filter((c) => c.id !== convId);
        if (remaining.length > 0) {
          selectConversation(remaining[0].id);
        } else {
          setActiveConvId(null);
          setMessages([]);
        }
      }
    } catch (_) {}
  };

  const handleStopStream = () => {
    if (cancelStreamRef.current) {
      cancelStreamRef.current();
      cancelStreamRef.current = null;
      setLoading(false);
      setMessages((prev) =>
        prev.map((m, idx) => (idx === prev.length - 1 ? { ...m, isStreaming: false } : m))
      );
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || loading) return;

    if (cancelStreamRef.current) {
      cancelStreamRef.current();
      cancelStreamRef.current = null;
    }

    const userMsgId = String(Date.now());
    const assistantMsgId = String(Date.now() + 1);
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const userMsg: ChatMessage = {
      id: userMsgId,
      sender: 'user',
      content: query,
      timestamp: nowTime,
    };

    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      sender: 'assistant',
      content: '',
      timestamp: nowTime,
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
    setLoading(true);

    const cancel = AppBridge.api.streamChat(
      {
        message: query,
        session_id: activeConvId || undefined,
        patient_id: activePatient?.id || undefined,
      },
      {
        onStart: (sessionId: string) => {
          if (!activeConvId) {
            setActiveConvId(sessionId);
            loadConversations();
          }
        },
        onToken: (token: string, sessionId: string) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: m.content + token, isStreaming: true }
                : m
            )
          );
        },
        onDone: (fullText: string, sessionId: string) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: fullText, isStreaming: false }
                : m
            )
          );
          setLoading(false);
          cancelStreamRef.current = null;
          loadConversations();
        },
        onError: (err: string) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: `**Clinical Copilot Notice:** ${err || 'Could not complete generation.'}`,
                    isStreaming: false,
                  }
                : m
            )
          );
          setLoading(false);
          cancelStreamRef.current = null;
        },
      }
    );

    cancelStreamRef.current = cancel;
  };

  const handleCopyMessage = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  return (
    <div className="h-full w-full bg-white flex overflow-hidden select-none">
      {/* ── Left Consultation History Sidebar ────────────────────────────── */}
      <div
        className={`h-full bg-[#F8FAFC] border-r border-[#E2E8F0] flex flex-col transition-all duration-200 ${
          sidebarCollapsed ? 'w-0 overflow-hidden border-r-0' : 'w-64'
        }`}
      >
        <div className="h-13 px-4 border-b border-[#E2E8F0] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-900">Consultation History</span>
            {activePatient && (
              <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                {activePatient.llm_alias}
              </span>
            )}
          </div>
          <button
            onClick={handleNewConversation}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[11px] font-semibold shadow-2xs transition-colors cursor-pointer"
            title="Start new consultation thread"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-400">
              No recent consultations.
            </div>
          ) : (
            conversations.map((c) => {
              const isActive = c.id === activeConvId;
              return (
                <div
                  key={c.id}
                  onClick={() => selectConversation(c.id)}
                  className={`group w-full flex items-center justify-between p-2.5 rounded-lg text-xs transition-all cursor-pointer ${
                    isActive
                      ? 'bg-white border border-[#BFDBFE] text-[#1D4ED8] font-bold shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                    <MessageSquare
                      className={`w-3.5 h-3.5 flex-shrink-0 ${
                        isActive ? 'text-[#2563EB]' : 'text-slate-400'
                      }`}
                    />
                    <span className="truncate">{c.title || 'Untitled Consultation'}</span>
                  </div>

                  <button
                    onClick={(e) => handleDeleteConversation(e, c.id)}
                    className="opacity-0 group-hover:opacity-100 hover:text-rose-600 p-1 rounded transition-opacity cursor-pointer flex-shrink-0 ml-1"
                    title="Delete consultation"
                  >
                    <Trash2 className="w-3 h-3 text-slate-400 hover:text-rose-600" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Main Copilot Chat Workspace ───────────────────────────────────── */}
      <div className="flex-1 h-full flex flex-col bg-white overflow-hidden">
        {/* Top Header Bar */}
        <div className="h-13 border-b border-[#E2E8F0] px-6 flex items-center justify-between bg-white">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-[#F1F5F9] transition-colors cursor-pointer"
              title={sidebarCollapsed ? 'Show History' : 'Hide History'}
            >
              {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>

            {/* Active Patient Indicator */}
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-[#2563EB]">
                <Stethoscope className="w-4 h-4" />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900">
                    {activePatient ? activePatient.display_name : 'General Practice Copilot'}
                  </span>
                  {activePatient && (
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]">
                      {activePatient.llm_alias}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500">
                  {activePatient
                    ? `${activePatient.gender || 'Patient'} • DOB: ${activePatient.date_of_birth || 'Not recorded'} • AES-256 Grounded`
                    : "Real-time Practice Context • Temporal Schedule Grounded"}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>De-Identified & Encrypted</span>
            </div>
          </div>
        </div>

        {/* Workstation Identity & Local Hosting Notice */}
        <div className="bg-[#F8FAFC] border-b border-[#E2E8F0] px-6 py-1.5 flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-semibold text-slate-800">Agent-D Clinical Intelligence</span>
            <span>•</span>
            <span className="text-slate-600">
              Hosted locally on <code className="font-mono text-blue-700 bg-blue-50 px-1 py-0.2 rounded border border-blue-200">http://127.0.0.1:5050</code>
            </span>
            <span>•</span>
            <span className="text-slate-600">Private AES-256 Vault</span>
          </div>
          <div className="flex items-center gap-1.5 text-emerald-700 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>100% Private Offline Loopback • Zero Cloud PII</span>
          </div>
        </div>

        {/* Conversation Stream */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 ? (
            /* Welcome Slate */
            <div className="max-w-2xl mx-auto py-12 text-center space-y-6 animate-fadeIn">
              <div className="w-14 h-14 rounded-2xl bg-[#EFF6FF] border border-[#BFDBFE] mx-auto flex items-center justify-center text-[#2563EB] shadow-xs">
                <Stethoscope className="w-7 h-7" />
              </div>

              <div className="space-y-1.5">
                <h2 className="text-lg font-bold text-slate-900">
                  {activePatient
                    ? `Clinical Copilot — ${activePatient.display_name} (${activePatient.llm_alias})`
                    : 'Clinical Workstation Copilot'}
                </h2>
                <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                  Brief today's appointments, review active medications, inspect watch-for alerts, or dictate visit notes.
                  All responses are synthesized with strict doctor-in-control clinical standards.
                </p>
              </div>

              {/* Starter Action Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left max-w-xl mx-auto pt-2">
                {CLINICAL_PROMPT_CHIPS.map((chip, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(chip.prompt)}
                    className="p-3.5 rounded-xl border border-[#E2E8F0] hover:border-[#2563EB] bg-[#F8FAFC] hover:bg-[#EFF6FF] transition-all cursor-pointer group text-left"
                  >
                    <div className="text-xs font-bold text-slate-900 group-hover:text-[#2563EB] transition-colors">
                      {chip.label}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                      {chip.prompt}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Message turns */
            <div className="max-w-3xl mx-auto space-y-4">
              {messages.map((m) => {
                const isUser = m.sender === 'user';
                return (
                  <div
                    key={m.id}
                    className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}
                  >
                    {/* Avatar */}
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                        isUser
                          ? 'bg-[#2563EB] text-white shadow-2xs'
                          : 'bg-[#EFF6FF] border border-[#BFDBFE] text-[#2563EB]'
                      }`}
                    >
                      {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>

                    {/* Message Card */}
                    <div
                      className={`relative max-w-[85%] rounded-2xl p-4 text-xs leading-relaxed ${
                        isUser
                          ? 'bg-[#2563EB] text-white shadow-xs rounded-tr-xs'
                          : 'bg-[#F8FAFC] border border-[#E2E8F0] text-slate-900 rounded-tl-xs shadow-2xs'
                      }`}
                    >
                      {m.content ? (
                        <div className="w-full text-slate-900">
                          <MarkdownContent content={m.content} />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-slate-400 py-1">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#2563EB]" />
                          <span>Generating clinical response...</span>
                        </div>
                      )}

                      {/* Footer Actions */}
                      <div
                        className={`mt-2 pt-2 border-t flex items-center justify-between text-[11px] ${
                          isUser ? 'border-white/20 text-white/80' : 'border-[#E2E8F0] text-slate-400'
                        }`}
                      >
                        <span>{m.timestamp}</span>
                        {!isUser && m.content && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleCopyMessage(m.id, m.content)}
                              className="hover:text-slate-700 flex items-center gap-1 cursor-pointer transition-colors"
                              title="Copy response"
                            >
                              {copiedMsgId === m.id ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  <span className="text-emerald-600">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {loading && messages.length > 0 && messages[messages.length - 1].content === '' && (
                <div className="flex items-center justify-center pt-2">
                  <button
                    onClick={handleStopStream}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium transition-colors cursor-pointer"
                  >
                    <Square className="w-3 h-3 fill-slate-500 text-slate-500" />
                    <span>Stop Generating</span>
                  </button>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* ── Bottom Dock / Input Box ─────────────────────────────────────── */}
        <div className="p-4 border-t border-[#E2E8F0] bg-white relative">
          <div className="max-w-3xl mx-auto space-y-2 relative">
            {/* ── Floating Slash Suggestions Popup (PranshulOS Style) ──────── */}
            {isSlashPopupVisible && matchingSlashCommands.length > 0 && (
              <div className="absolute bottom-[calc(100%+8px)] left-0 right-0 bg-white border border-[#CBD5E1] rounded-2xl shadow-2xl p-2 z-50 flex flex-col gap-1 max-h-80 overflow-y-auto animate-fadeIn">
                <div className="px-3 py-1.5 text-[10px] font-mono font-bold tracking-wider uppercase text-slate-400 flex items-center justify-between border-b border-slate-100">
                  <span className="flex items-center gap-1.5 text-[#2563EB]">
                    <Sparkles className="w-3 h-3" />
                    <span>Clinical Modes &amp; Slash Commands</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-sans font-normal">
                    ↑↓ navigate • <strong className="font-mono text-slate-700">Tab / ↵</strong> select • <strong className="font-mono text-slate-700">Esc</strong> dismiss
                  </span>
                </div>

                <div className="flex flex-col gap-1 pt-1">
                  {matchingSlashCommands.map((item, idx) => {
                    const isSelected = idx === slashActiveIndex;
                    return (
                      <div
                        key={item.cmd}
                        onClick={() => handleSelectSlashCommand(item)}
                        onMouseEnter={() => setSlashActiveIndex(idx)}
                        className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-[#EFF6FF] border border-[#BFDBFE] text-[#1D4ED8]'
                            : 'hover:bg-slate-50 border border-transparent text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold flex items-center gap-1 border flex-shrink-0 ${item.badgeClass}`}
                          >
                            <span>{item.icon}</span>
                            <span>{item.label}</span>
                          </span>
                          <div className="truncate min-w-0">
                            <span className="text-xs font-bold text-slate-900 block truncate">
                              {item.name}
                            </span>
                            <span className="text-[11px] text-slate-500 block truncate">
                              {item.desc}
                            </span>
                          </div>
                        </div>

                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white text-slate-600 border border-[#CBD5E1] flex-shrink-0 ml-3 shadow-2xs">
                          Tab ↵
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quick Action Chips & / Toggle Button */}
            <div className="flex items-center justify-between gap-2 overflow-x-auto pb-0.5 scrollbar-none">
              <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-x-auto scrollbar-none">
                {/* Dedicated / Toggle Button */}
                <button
                  type="button"
                  onClick={handleToggleSlashMenu}
                  className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-mono font-bold transition-all cursor-pointer border ${
                    isSlashPopupVisible
                      ? 'bg-[#2563EB] text-white border-[#1D4ED8] shadow-xs'
                      : 'bg-white hover:bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE] hover:border-[#2563EB]'
                  }`}
                  title="Toggle Slash Commands Palette (or type / in chat)"
                >
                  <span className="text-sm leading-none">/</span>
                  <span className="font-sans font-semibold">Commands</span>
                </button>

                {CLINICAL_PROMPT_CHIPS.map((chip, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(chip.prompt)}
                    className="flex-shrink-0 px-2.5 py-1 rounded-full bg-[#F8FAFC] hover:bg-[#EFF6FF] border border-[#E2E8F0] hover:border-[#BFDBFE] text-slate-700 hover:text-[#1D4ED8] text-[11px] font-semibold transition-all cursor-pointer"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Input Box */}
            <div className="flex items-end gap-2 p-1.5 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] focus-within:border-[#2563EB] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#2563EB]/15 transition-all shadow-2xs">
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={
                  activePatient
                    ? `Consulting for ${activePatient.display_name} (${activePatient.llm_alias})... Type / for commands (/consultation, /note, /ticket)`
                    : "Ask Copilot, type / for commands (/consultation, /brief, /note, /ticket, /artifact, /meds)..."
                }
                className="flex-1 max-h-32 p-2 bg-transparent text-xs text-slate-900 placeholder:text-slate-400 outline-none resize-none"
              />

              {loading ? (
                <button
                  onClick={handleStopStream}
                  className="w-8 h-8 rounded-xl bg-slate-700 hover:bg-slate-800 text-white flex items-center justify-center flex-shrink-0 shadow-2xs transition-all cursor-pointer mb-0.5"
                  title="Stop generating"
                >
                  <Square className="w-3.5 h-3.5 fill-white text-white" />
                </button>
              ) : (
                <button
                  onClick={() => handleSendMessage()}
                  disabled={!input.trim()}
                  className="w-8 h-8 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-30 disabled:hover:bg-[#2563EB] text-white flex items-center justify-center flex-shrink-0 shadow-2xs transition-all cursor-pointer mb-0.5"
                  title="Send message"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatView;
