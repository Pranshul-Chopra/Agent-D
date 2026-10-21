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
  CheckCircle2,
} from 'lucide-react';
import AppBridge from '../services/bridge';
import MarkdownContent from '../components/chat/MarkdownContent';
import ActionCard from '../components/chat/ActionCard';
import type { Patient } from '../types';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  timestamp: string;
  sources?: { filename?: string; section?: string }[];
}

interface ConversationItem {
  id: string;
  title: string;
  created_at: string;
}

const CLINICAL_PROMPT_CHIPS = [
  { label: '☀️ Morning Brief', prompt: "What's on my dashboard today? Brief me on today's appointments and pending tasks." },
  { label: '🩺 Next Patient Brief', prompt: 'Who is my next scheduled patient and what crucial watch-for items should I check?' },
  { label: '💊 Medication Review', prompt: 'Review current active medications and dosages for this patient.' },
  { label: '📝 Dictate Visit Notes', prompt: 'I want to record visit notes: Patient reported stable vitals, BP 124/82. Propose necessary chart updates and follow-ups.' },
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      const res = await AppBridge.api.getConversations();
      const list = res.conversations || [];
      setConversations(list);
      if (list.length > 0 && !activeConvId) {
        selectConversation(list[0].id);
      }
    } catch (_) {}
  };

  const selectConversation = async (convId: string) => {
    setActiveConvId(convId);
    try {
      const res = await AppBridge.api.getConversation(convId);
      if (res.conversation && res.conversation.messages) {
        const mapped: ChatMessage[] = res.conversation.messages.map((m: any) => ({
          id: m.id || String(Math.random()),
          sender: m.role === 'user' ? 'user' : 'assistant',
          content: m.content || '',
          timestamp: m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
        }));
        setMessages(mapped);
      }
    } catch (_) {}
  };

  const handleNewConversation = async () => {
    try {
      const title = activePatient ? `Consult: ${activePatient.display_name}` : 'Clinical Consultation';
      const res = await AppBridge.api.createConversation(title);
      if (res.conversation) {
        setConversations((prev) => [res.conversation, ...prev]);
        setActiveConvId(res.conversation.id);
        setMessages([]);
      }
    } catch (_) {}
  };

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || loading) return;

    let convId = activeConvId;
    if (!convId) {
      try {
        const title = query.slice(0, 36) + (query.length > 36 ? '...' : '');
        const res = await AppBridge.api.createConversation(title);
        convId = res.conversation.id;
        setActiveConvId(convId);
        setConversations((prev) => [res.conversation, ...prev]);
      } catch (_) {
        return;
      }
    }

    const userMsg: ChatMessage = {
      id: String(Date.now()),
      sender: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await AppBridge.api.sendMessage(convId, query);
      const assistantMsg: ChatMessage = {
        id: String(Date.now() + 1),
        sender: 'assistant',
        content: res.message?.content || res.content || 'I have noted your input.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: String(Date.now() + 1),
        sender: 'assistant',
        content: `**Note:** ${err?.message || 'Could not complete request. Please verify your Gemini API key in Settings.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyMessage = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
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
          <span className="text-xs font-bold text-slate-900">Consultation History</span>
          <button
            onClick={handleNewConversation}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
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
                <button
                  key={c.id}
                  onClick={() => selectConversation(c.id)}
                  className={`w-full text-left p-2.5 rounded-lg text-xs transition-all cursor-pointer ${
                    isActive
                      ? 'bg-white border border-[#BFDBFE] text-[#1D4ED8] font-bold shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <MessageSquare className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-[#2563EB]' : 'text-slate-400'}`} />
                    <span className="truncate">{c.title || 'Untitled Consultation'}</span>
                  </div>
                </button>
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
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-[#2563EB]">
                <Stethoscope className="w-3.5 h-3.5" />
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
                  {activePatient ? 'Patient context active • Guarded proposal gate' : 'Ask anything or query schedule'}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Gemini AI Connected</span>
            </div>
          </div>
        </div>

        {/* Conversation Stream */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 ? (
            /* Welcome Clean Slate */
            <div className="max-w-2xl mx-auto py-12 text-center space-y-6 animate-fadeIn">
              <div className="w-14 h-14 rounded-2xl bg-[#EFF6FF] border border-[#BFDBFE] mx-auto flex items-center justify-center text-[#2563EB] shadow-xs">
                <Stethoscope className="w-7 h-7" />
              </div>

              <div className="space-y-1.5">
                <h2 className="text-lg font-bold text-slate-900">Clinical Chief of Staff</h2>
                <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                  Ask for today's agenda, summarize patient files, check watch-for items, or dictate consult notes.
                  The assistant proposes; you approve.
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
                      <div className="prose prose-xs max-w-none">
                        <MarkdownContent content={m.content} />
                      </div>

                      {/* Footer Actions */}
                      <div
                        className={`mt-2 pt-2 border-t flex items-center justify-between text-[11px] ${
                          isUser ? 'border-white/20 text-white/80' : 'border-[#E2E8F0] text-slate-400'
                        }`}
                      >
                        <span>{m.timestamp}</span>
                        {!isUser && (
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

              {loading && (
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] text-[#2563EB] flex items-center justify-center">
                    <Bot className="w-4 h-4 animate-pulse" />
                  </div>
                  <div className="p-3.5 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs text-slate-500 flex items-center gap-2 shadow-2xs">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#2563EB]" />
                    <span>Analyzing clinical context & drafting proposal...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* ── Bottom Dock / Input Box ─────────────────────────────────────── */}
        <div className="p-4 border-t border-[#E2E8F0] bg-white">
          <div className="max-w-3xl mx-auto space-y-2">
            {/* Quick Action Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
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

            {/* Input Box */}
            <div className="flex items-end gap-2 p-1.5 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] focus-within:border-[#2563EB] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#2563EB]/15 transition-all shadow-2xs">
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  activePatient
                    ? `Consulting for ${activePatient.display_name}... or type 'What is on my dashboard?'`
                    : "Ask Copilot, dictate consult notes, or ask 'What is on my dashboard today?'..."
                }
                className="flex-1 max-h-32 p-2 bg-transparent text-xs text-slate-900 placeholder:text-slate-400 outline-none resize-none"
              />

              <button
                onClick={() => handleSendMessage()}
                disabled={loading || !input.trim()}
                className="w-8 h-8 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-30 disabled:hover:bg-[#2563EB] text-white flex items-center justify-center flex-shrink-0 shadow-2xs transition-all cursor-pointer mb-0.5"
                title="Send message"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatView;
