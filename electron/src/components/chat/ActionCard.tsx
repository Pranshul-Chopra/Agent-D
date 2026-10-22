import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  Stethoscope,
  Clock,
  Pill,
  FileText,
  Calendar,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
} from 'lucide-react';
import AppBridge from '../../services/bridge';

export interface ActionCardProps {
  action: string;
  data: {
    title?: string;
    subject?: string;
    description?: string;
    priority?: string;
    status?: string;
    patient_id?: string;
    patient_alias?: string;
    proposal_id?: string;
    proposal_type?: string;
    updates?: Record<string, any>;
    diff?: Record<string, any>;
    rationale?: string;
    [key: string]: any;
  };
  conversationId?: string;
  actionKey?: string;
  isAlreadyApplied?: boolean;
  onApplied?: (result: any, actionKey: string) => void;
}

export const ActionCard: React.FC<ActionCardProps> = ({
  action,
  data,
  conversationId,
  actionKey,
  isAlreadyApplied = false,
  onApplied,
}) => {
  const [isApplying, setIsApplying] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isApplied, setIsApplied] = useState(Boolean(isAlreadyApplied));
  const [isRejected, setIsRejected] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const title = (data.title || data.subject || data.rationale || 'Clinical Proposal').trim();
  const computedActionKey =
    actionKey ||
    data.action_key ||
    `${conversationId || 'global'}:${action || 'proposal'}:${title.toLowerCase()}`;

  const isConsultationProposal =
    action.includes('consultation') ||
    action.includes('appointment') ||
    action.includes('meeting') ||
    data.proposal_type === 'consultation' ||
    Boolean(data.scheduled_time);

  const isDashboardProposal =
    action.includes('dashboard') ||
    data.proposal_type === 'dashboard_task';

  const isArtifactProposal =
    action.includes('artifact') ||
    data.proposal_type === 'artifact_update' ||
    Boolean(data.updates);

  const isLogProposal =
    action.includes('log') ||
    data.proposal_type === 'log_entry' ||
    Boolean(data.content && !data.title && !data.scheduled_time);

  const isTicketProposal =
    !isConsultationProposal &&
    !isDashboardProposal &&
    (action.includes('ticket') ||
      action.includes('task') ||
      action.includes('reminder') ||
      data.proposal_type === 'ticket');

  const priority = (data.priority || 'medium').toLowerCase();
  const priorityColor =
    priority === 'critical'
      ? 'bg-rose-50 text-rose-700 border-rose-200'
      : priority === 'high'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-blue-50 text-blue-700 border-blue-200';

  const handleApprove = async () => {
    if (isApplying || isApplied || isRejected) return;
    setIsApplying(true);
    setErrorMessage(null);

    try {
      if (data.proposal_id) {
        // Direct accept through Proposal API
        const res = await AppBridge.api.acceptProposal(data.proposal_id);
        if (res.success) {
          setIsApplied(true);
          onApplied?.(res, computedActionKey);
          return;
        }
      }

      // If consultation proposal
      if (isConsultationProposal) {
        const apptRes = await AppBridge.api.executeAction(
          'create_consultation',
          {
            patient_id: data.patient_id,
            patient_alias: data.patient_alias,
            scheduled_time: data.scheduled_time || data.time,
            duration_minutes: data.duration_minutes || 15,
            appointment_type: data.appointment_type || 'follow_up',
            reason: data.reason || data.title || title,
          },
          conversationId,
          computedActionKey
        );
        setIsApplied(true);
        onApplied?.(apptRes, computedActionKey);
      } else if (isDashboardProposal) {
        const dashRes = await AppBridge.api.executeAction(
          'create_dashboard_task',
          {
            title: data.title || title,
            due_date: data.due_date,
            priority: data.priority || 'medium',
            description: data.description || data.rationale,
          },
          conversationId,
          computedActionKey
        );
        setIsApplied(true);
        onApplied?.(dashRes, computedActionKey);
      } else if (isTicketProposal) {
        const ticketRes = await AppBridge.api.createTicket({
          patient_id: data.patient_id,
          title: data.title || title,
          description: data.description || data.rationale || '',
          priority: data.priority || 'medium',
          due_date: data.due_date,
        });
        setIsApplied(true);
        onApplied?.(ticketRes, computedActionKey);
      } else if (isArtifactProposal && data.patient_id && data.updates) {
        // Direct artifact patch if proposed without pre-saved ID
        const artRes = await AppBridge.api.updatePatientArtifact(
          data.patient_id,
          {
            ...data.updates,
            change_summary: data.rationale || 'Copilot approved proposal',
            author_type: 'copilot_approved',
          }
        );
        setIsApplied(true);
        onApplied?.(artRes, computedActionKey);
      } else {
        // Fallback to general executeAction
        const res = await AppBridge.api.executeAction(
          action || 'create_ticket',
          data,
          conversationId,
          computedActionKey
        );
        if (res.success) {
          setIsApplied(true);
          onApplied?.(res, computedActionKey);
        } else {
          throw new Error('Could not apply proposal.');
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to approve proposal.');
    } finally {
      setIsApplying(false);
    }
  };

  const handleReject = async () => {
    if (isRejecting || isApplied || isRejected) return;
    setIsRejecting(true);
    setErrorMessage(null);

    try {
      if (data.proposal_id) {
        await AppBridge.api.rejectProposal(data.proposal_id, 'Rejected by physician');
      }
      setIsRejected(true);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to reject proposal.');
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    <div
      className={`my-3 rounded-xl border transition-all duration-200 overflow-hidden shadow-2xs ${
        isApplied
          ? 'bg-emerald-50/40 border-emerald-300'
          : isRejected
          ? 'bg-slate-50 border-slate-300 opacity-70'
          : 'bg-white border-[#BFDBFE] hover:border-[#2563EB]/60'
      }`}
    >
      {/* ── Card Header ──────────────────────────────────────────────────────── */}
      <div
        className={`px-4 py-2.5 border-b flex items-center justify-between text-xs ${
          isApplied
            ? 'bg-emerald-100/50 border-emerald-200 text-emerald-800'
            : isRejected
            ? 'bg-slate-100 border-slate-200 text-slate-600'
            : 'bg-[#EFF6FF] border-[#BFDBFE] text-slate-900'
        }`}
      >
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-white border border-[#BFDBFE] text-[#2563EB]">
            {isConsultationProposal ? (
              <Calendar className="w-3.5 h-3.5" />
            ) : isDashboardProposal ? (
              <Clock className="w-3.5 h-3.5" />
            ) : isArtifactProposal ? (
              <Stethoscope className="w-3.5 h-3.5" />
            ) : isLogProposal ? (
              <FileText className="w-3.5 h-3.5" />
            ) : (
              <Clock className="w-3.5 h-3.5" />
            )}
          </div>
          <span className="font-bold text-slate-900 text-[11px] tracking-wide uppercase">
            {isConsultationProposal
              ? '🤝 Proposed Patient Consultation'
              : isDashboardProposal
              ? '📌 Proposed Dashboard Agenda Task'
              : isArtifactProposal
              ? '🩺 Proposed Chart Artifact Update'
              : isLogProposal
              ? '📝 Proposed Medical Observation'
              : '📋 Proposed Clinical Action Item'}
          </span>
          {data.patient_alias && (
            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-white text-blue-700 border border-blue-200">
              {data.patient_alias}
            </span>
          )}
        </div>

        <div>
          {isApplied ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-600 text-white">
              <Check className="w-3 h-3" />
              <span>Approved & Committed</span>
            </span>
          ) : isRejected ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-400 text-white">
              <X className="w-3 h-3" />
              <span>Rejected</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800 border border-blue-200">
              <span>Pending Doctor Signature</span>
            </span>
          )}
        </div>
      </div>

      {/* ── Card Body ────────────────────────────────────────────────────────── */}
      <div className="p-4 space-y-3 bg-white">
        {/* Title or Rationale */}
        <div>
          <div className="text-xs font-bold text-slate-900 leading-snug">{title}</div>
          {data.rationale && data.rationale !== title && (
            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
              <strong>Clinical Rationale:</strong> {data.rationale}
            </p>
          )}
        </div>

        {/* Consultation Proposal Details */}
        {isConsultationProposal && (
          <div className="p-3 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] space-y-1.5 text-xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#1D4ED8]">
              Consultation Parameters
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-slate-500">Scheduled Time:</span>{' '}
                <span className="font-semibold text-slate-900">{data.scheduled_time || data.time || 'Today'}</span>
              </div>
              <div>
                <span className="text-slate-500">Duration:</span>{' '}
                <span className="font-semibold text-slate-900">{data.duration_minutes || 15} minutes</span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-500">Reason:</span>{' '}
                <span className="font-semibold text-slate-900">{data.reason || title}</span>
              </div>
            </div>
          </div>
        )}

        {/* Dashboard Task Details */}
        {isDashboardProposal && (
          <div className="flex items-center gap-3 text-[11px] text-slate-600">
            <span className={`px-2 py-0.5 rounded border font-semibold uppercase ${priorityColor}`}>
              {priority} Priority
            </span>
            {data.due_date && (
              <span className="flex items-center gap-1 text-slate-500">
                <Calendar className="w-3.5 h-3.5" />
                <span>Scheduled for: {data.due_date}</span>
              </span>
            )}
          </div>
        )}

        {/* Diff & Field Changes for Artifact Updates */}
        {isArtifactProposal && data.updates && (
          <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] space-y-2 text-xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Proposed Changes (Diff Review)
            </div>

            {data.updates.medications && (
              <div>
                <span className="font-semibold text-slate-700 flex items-center gap-1">
                  <Pill className="w-3 h-3 text-[#2563EB]" /> Medications:
                </span>
                <div className="pl-4 mt-0.5 space-y-0.5">
                  {(data.updates.medications as string[]).map((m, idx) => (
                    <div key={idx} className="text-emerald-700 font-mono text-[11px]">
                      + {m}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.updates.active_issues && (
              <div>
                <span className="font-semibold text-slate-700 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 text-amber-500" /> Active Issues:
                </span>
                <div className="pl-4 mt-0.5 space-y-0.5">
                  {(data.updates.active_issues as string[]).map((iss, idx) => (
                    <div key={idx} className="text-emerald-700 font-mono text-[11px]">
                      + {iss}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.updates.watch_for && (
              <div>
                <span className="font-semibold text-slate-700 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-rose-500" /> Watch-For Alerts:
                </span>
                <div className="pl-4 mt-0.5 space-y-0.5">
                  {(data.updates.watch_for as string[]).map((w, idx) => (
                    <div key={idx} className="text-emerald-700 font-mono text-[11px]">
                      + {w}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Ticket Details */}
        {isTicketProposal && (
          <div className="flex items-center gap-3 text-[11px] text-slate-600">
            <span className={`px-2 py-0.5 rounded border font-semibold uppercase ${priorityColor}`}>
              {priority} Priority
            </span>
            {data.due_date && (
              <span className="flex items-center gap-1 text-slate-500">
                <Calendar className="w-3.5 h-3.5" />
                <span>Due: {data.due_date}</span>
              </span>
            )}
          </div>
        )}

        {/* Error message if approval fails */}
        {errorMessage && (
          <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* ── Action Buttons (Doctor in Control) ─────────────────────────────── */}
        {!isApplied && !isRejected && (
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-[#E2E8F0]">
            <button
              onClick={handleReject}
              disabled={isRejecting || isApplying}
              className="px-3 py-1.5 rounded-lg bg-white border border-[#E2E8F0] hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-all cursor-pointer flex items-center gap-1.5"
            >
              {isRejecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
              <span>Reject</span>
            </button>

            <button
              onClick={handleApprove}
              disabled={isApplying || isRejecting}
              className="px-3.5 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold shadow-2xs transition-all cursor-pointer flex items-center gap-1.5"
            >
              {isApplying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              <span>Approve & Commit</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ActionCard;
