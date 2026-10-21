import React, { useState } from 'react';
import {
  CheckCircle2,
  Sparkles,
  Kanban,
  AlertCircle,
  Loader2,
  User,
  Hash,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import AppBridge from '../../services/bridge';
import type { Task } from '../../types';

export interface ActionCardProps {
  action: string;
  data: {
    title?: string;
    subject?: string;
    description?: string;
    priority?: string;
    status?: string;
    story_points?: number | string;
    ticket_type?: 'internal' | 'external';
    project_id?: number;
    assignee?: string;
    acceptance_criteria?: string;
    action_key?: string;
    [key: string]: any;
  };
  conversationId?: string;
  actionKey?: string;
  isAlreadyApplied?: boolean;
  onApplied?: (task: Task, actionKey: string) => void;
}

export const ActionCard: React.FC<ActionCardProps> = ({
  action,
  data,
  conversationId,
  actionKey,
  isAlreadyApplied = false,
  onApplied,
}) => {
  const title = (data.title || data.subject || 'Untitled Story').trim();
  const computedActionKey =
    actionKey ||
    data.action_key ||
    `${conversationId || 'global'}:${action || 'create_ticket'}:${title.toLowerCase()}`;

  const [isApplying, setIsApplying] = useState(false);
  const [isApplied, setIsApplied] = useState(Boolean(isAlreadyApplied));
  const [appliedTask, setAppliedTask] = useState<Task | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  React.useEffect(() => {
    if (isAlreadyApplied) {
      setIsApplied(true);
    }
  }, [isAlreadyApplied]);

  const description = (data.description || '').trim();
  const priority = (data.priority || 'med').toLowerCase();
  const storyPoints = data.story_points ? Number(data.story_points) : null;
  const ticketType = (data.ticket_type || 'internal').toLowerCase() as 'internal' | 'external';
  const assignee = (data.assignee || '').trim();
  const acceptanceCriteria = (data.acceptance_criteria || '').trim();

  // Priority color styles
  const getPriorityBadge = (prio: string) => {
    switch (prio) {
      case 'urgent':
        return 'bg-red-500/15 text-red-400 border-red-500/30';
      case 'high':
        return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
      case 'low':
        return 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30';
      case 'med':
      default:
        return 'bg-[#e8a84c]/15 text-[#e8a84c] border-[#e8a84c]/30';
    }
  };

  const handleApply = async () => {
    if (isApplying || isApplied) return;
    setIsApplying(true);
    setErrorMessage(null);

    try {
      const res = await AppBridge.api.executeAction(
        action || 'create_ticket',
        data,
        conversationId,
        computedActionKey
      );

      if (res.success && res.task) {
        setIsApplied(true);
        setAppliedTask(res.task);
        if (onApplied) {
          onApplied(res.task, computedActionKey);
        }
      } else {
        throw new Error(res.message || 'Action execution was rejected.');
      }
    } catch (err: any) {
      console.error('Failed to apply action:', err);
      setErrorMessage(err.message || 'Failed to create ticket on Sprint Board.');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div
      className={`my-3.5 rounded-xl border transition-all duration-200 overflow-hidden shadow-sm ${
        isApplied
          ? 'bg-[#151c17] border-[#5aab7f]/40'
          : 'bg-[#161514] border-[#e8a84c]/30 hover:border-[#e8a84c]/50'
      }`}
    >
      {/* ── Card Header ──────────────────────────────────────────────────────── */}
      <div className="px-4 py-2.5 bg-[#1a1918] border-b border-[#2e2c2a] flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-[#e8a84c]/10 text-[#e8a84c]">
            <Kanban className="w-3.5 h-3.5" />
          </div>
          <span className="font-semibold text-[#edeae4] tracking-wide uppercase text-[11px] font-mono">
            ⚡ Action Proposal: Create Sprint Ticket
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isApplied ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-[#5aab7f]/20 text-[#5aab7f] border border-[#5aab7f]/30">
              <CheckCircle2 className="w-3 h-3" />
              Applied
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-[#e8a84c]/10 text-[#e8a84c] border border-[#e8a84c]/20">
              <Sparkles className="w-3 h-3" />
              Pending Review
            </span>
          )}
        </div>
      </div>

      {/* ── Card Body ────────────────────────────────────────────────────────── */}
      <div className="p-4 space-y-3">
        {/* Title & Metadata Badges */}
        <div>
          <div className="flex items-start justify-between gap-3">
            <h4 className="text-sm font-semibold text-[#edeae4] leading-snug">
              {title}
            </h4>
          </div>

          <div className="flex items-center gap-2 mt-2 flex-wrap text-[11px] font-mono">
            {/* Ticket Type Tag */}
            <span
              className={`px-2 py-0.5 rounded border uppercase text-[10px] font-bold ${
                ticketType === 'external'
                  ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                  : 'bg-purple-500/10 text-purple-400 border-purple-500/20'
              }`}
            >
              {ticketType === 'external' ? '🌐 External (Customer)' : '🔒 Internal (Engineering)'}
            </span>

            {/* Priority */}
            <span
              className={`px-2 py-0.5 rounded border uppercase text-[10px] font-semibold ${getPriorityBadge(
                priority
              )}`}
            >
              {priority.toUpperCase()}
            </span>

            {/* Story Points */}
            {storyPoints !== null && !isNaN(storyPoints) && storyPoints > 0 && (
              <span className="px-2 py-0.5 rounded border border-[#2e2c2a] bg-[#222120] text-[#edeae4] flex items-center gap-1 text-[10px]">
                <Hash className="w-3 h-3 text-[#e8a84c]" />
                {storyPoints} pts
              </span>
            )}

            {/* Assignee */}
            {assignee && (
              <span className="px-2 py-0.5 rounded border border-[#2e2c2a] bg-[#222120] text-[#9b9690] flex items-center gap-1 text-[10px]">
                <User className="w-3 h-3" />
                {assignee}
              </span>
            )}
          </div>
        </div>

        {/* Description */}
        {description && (
          <p className="text-xs text-[#9b9690] leading-relaxed bg-[#111110] p-2.5 rounded-lg border border-[#2e2c2a]">
            {description}
          </p>
        )}

        {/* Acceptance Criteria (Gherkin format) */}
        {acceptanceCriteria && (
          <div className="text-xs bg-[#111110] rounded-lg border border-[#2e2c2a] overflow-hidden">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="w-full px-3 py-1.5 bg-[#191817] flex items-center justify-between text-[11px] text-[#9b9690] hover:text-[#edeae4] transition-colors"
            >
              <span className="font-mono text-[#e8a84c] flex items-center gap-1.5">
                <ShieldCheck className="w-3 h-3" />
                Acceptance Criteria (Gherkin)
              </span>
              {showDetails ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
            {showDetails && (
              <div className="p-3 font-mono text-[11px] text-[#edeae4] whitespace-pre-wrap leading-relaxed border-t border-[#2e2c2a]">
                {acceptanceCriteria}
              </div>
            )}
          </div>
        )}

        {/* Error message banner */}
        {errorMessage && (
          <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* ── Card Footer with Action Button ───────────────────────────────────── */}
      <div className="px-4 py-2.5 bg-[#141312] border-t border-[#2e2c2a] flex items-center justify-between">
        <div className="text-[11px] text-[#5c5955] font-mono">
          {isApplied && appliedTask ? (
            <span className="text-[#5aab7f] flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Created as Ticket #{appliedTask.id}
            </span>
          ) : (
            <span>Ready for sprint backlog</span>
          )}
        </div>

        {isApplied ? (
          <div className="text-xs font-semibold text-[#5aab7f] flex items-center gap-1.5 px-3 py-1 rounded bg-[#5aab7f]/10 border border-[#5aab7f]/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Added to Sprint Board</span>
          </div>
        ) : (
          <button
            onClick={handleApply}
            disabled={isApplying}
            className="px-3.5 py-1.5 rounded-lg bg-[#e8a84c] hover:bg-[#d4973b] disabled:opacity-50 text-[#111110] font-semibold text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
          >
            {isApplying ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Applying to Board...</span>
              </>
            ) : (
              <>
                <span className="text-black font-bold">⚡</span>
                <span>Apply to Sprint Board</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export default ActionCard;
