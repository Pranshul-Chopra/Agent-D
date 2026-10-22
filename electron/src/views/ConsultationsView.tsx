import React, { useState, useEffect } from 'react';
import {
  Stethoscope,
  Calendar,
  Clock,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  Play,
  Check,
  X,
  FileText,
  User,
  Bot,
  Filter,
  ArrowRight,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';
import AppBridge from '../services/bridge';
import type { NavTab, Patient } from '../types';

interface ConsultationsViewProps {
  activePatient?: Patient | null;
  onSelectPatient?: (p: Patient) => void;
  onNavigate: (tab: NavTab) => void;
}

type ConsultationFilter = 'all' | 'in_progress' | 'scheduled' | 'completed' | 'cancelled';

interface AppointmentRecord {
  id: string;
  patient_id: string;
  patient_alias?: string;
  display_name?: string;
  scheduled_time: string;
  duration_minutes: number;
  appointment_type: string;
  reason?: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  notes?: string;
  created_at?: string;
}

export const ConsultationsView: React.FC<ConsultationsViewProps> = ({
  activePatient,
  onSelectPatient,
  onNavigate,
}) => {
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [filter, setFilter] = useState<ConsultationFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  // New consultation modal state
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [modalPatientId, setModalPatientId] = useState(activePatient?.id || '');
  const [modalDate, setModalDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [modalTime, setModalTime] = useState('10:00');
  const [modalDuration, setModalDuration] = useState(15);
  const [modalType, setModalType] = useState('follow_up');
  const [modalReason, setModalReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Encounter note dialog state
  const [activeNoteAppt, setActiveNoteAppt] = useState<AppointmentRecord | null>(null);
  const [encounterNoteText, setEncounterNoteText] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [apptsRes, patientsRes] = await Promise.all([
        AppBridge.api.listAppointments(),
        AppBridge.api.listPatients(),
      ]);

      if (apptsRes && apptsRes.appointments) {
        setAppointments(apptsRes.appointments);
      }
      if (patientsRes && patientsRes.patients) {
        setPatients(patientsRes.patients);
        if (!modalPatientId && patientsRes.patients.length > 0) {
          setModalPatientId(patientsRes.patients[0].id);
        }
      }
    } catch (_) {
    } finally {
      setLoading(false);
    }
  };

  const handleStartConsultation = async (appt: AppointmentRecord) => {
    try {
      await AppBridge.api.updateAppointment(appt.id, { status: 'in_progress' });
      setAppointments((prev) =>
        prev.map((a) => (a.id === appt.id ? { ...a, status: 'in_progress' } : a))
      );
      // Select patient for active context
      const targetPatient = patients.find((p) => p.id === appt.patient_id);
      if (targetPatient && onSelectPatient) {
        onSelectPatient(targetPatient);
      }
    } catch (_) {}
  };

  const handleCompleteConsultation = async (appt: AppointmentRecord) => {
    try {
      await AppBridge.api.updateAppointment(appt.id, { status: 'completed' });
      setAppointments((prev) =>
        prev.map((a) => (a.id === appt.id ? { ...a, status: 'completed' } : a))
      );
    } catch (_) {}
  };

  const handleCancelConsultation = async (appt: AppointmentRecord) => {
    try {
      await AppBridge.api.updateAppointment(appt.id, { status: 'cancelled' });
      setAppointments((prev) =>
        prev.map((a) => (a.id === appt.id ? { ...a, status: 'cancelled' } : a))
      );
    } catch (_) {}
  };

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalPatientId || !modalDate || !modalTime || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const fullScheduledTime = `${modalDate} ${modalTime}`;
      const res = await AppBridge.api.createAppointment({
        patient_id: modalPatientId,
        scheduled_time: fullScheduledTime,
        duration_minutes: modalDuration,
        appointment_type: modalType,
        reason: modalReason.trim() || 'Clinical follow-up encounter',
      });

      if (res && res.appointment) {
        setAppointments((prev) => [res.appointment, ...prev]);
        setIsScheduleModalOpen(false);
        setModalReason('');
      }
    } catch (_) {
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveEncounterNote = async () => {
    if (!activeNoteAppt || isSavingNote) return;
    setIsSavingNote(true);
    try {
      await AppBridge.api.createPatientLog(activeNoteAppt.patient_id, {
        entry_type: 'observation',
        content: `Consultation Encounter Note: ${encounterNoteText.trim()}`,
        metadata: { appointment_id: activeNoteAppt.id },
      });
      setActiveNoteAppt(null);
      setEncounterNoteText('');
    } catch (_) {
    } finally {
      setIsSavingNote(false);
    }
  };

  // Filter appointments
  const filteredAppointments = appointments.filter((a) => {
    if (filter !== 'all' && a.status !== filter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const aliasMatch = (a.patient_alias || '').toLowerCase().includes(q);
      const nameMatch = (a.display_name || '').toLowerCase().includes(q);
      const reasonMatch = (a.reason || '').toLowerCase().includes(q);
      if (!aliasMatch && !nameMatch && !reasonMatch) return false;
    }
    return true;
  });

  const inProgressCount = appointments.filter((a) => a.status === 'in_progress').length;
  const scheduledCount = appointments.filter((a) => a.status === 'scheduled').length;
  const completedCount = appointments.filter((a) => a.status === 'completed').length;

  return (
    <div className="h-full w-full bg-white flex flex-col overflow-hidden select-none">
      {/* ── Top Header Banner ─────────────────────────────────────────────────── */}
      <div className="border-b border-[#E2E8F0] bg-[#F8FAFC] px-8 py-5">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-[#2563EB] shadow-2xs">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900">Consultations &amp; Clinical Encounters</h1>
                {inProgressCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    {inProgressCount} ACTIVE NOW
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Monitor live visits, conduct clinical encounters, record SOAP notes, and review history
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => onNavigate('chat')}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-[#E2E8F0] hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            >
              <Bot className="w-3.5 h-3.5 text-[#2563EB]" />
              <span>Ask Copilot</span>
            </button>

            <button
              onClick={() => setIsScheduleModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold shadow-2xs transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Schedule Consultation</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Subbar: Filter Tabs & Search ──────────────────────────────────────── */}
      <div className="border-b border-[#E2E8F0] bg-white px-8 py-3">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filter === 'all'
                  ? 'bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]'
                  : 'text-slate-600 hover:bg-slate-100 border border-transparent'
              }`}
            >
              All ({appointments.length})
            </button>
            <button
              onClick={() => setFilter('in_progress')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filter === 'in_progress'
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'text-slate-600 hover:bg-slate-100 border border-transparent'
              }`}
            >
              In Progress ({inProgressCount})
            </button>
            <button
              onClick={() => setFilter('scheduled')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filter === 'scheduled'
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'text-slate-600 hover:bg-slate-100 border border-transparent'
              }`}
            >
              Scheduled ({scheduledCount})
            </button>
            <button
              onClick={() => setFilter('completed')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filter === 'completed'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'text-slate-600 hover:bg-slate-100 border border-transparent'
              }`}
            >
              Completed ({completedCount})
            </button>
            <button
              onClick={() => setFilter('cancelled')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filter === 'cancelled'
                  ? 'bg-slate-100 text-slate-700 border border-slate-300'
                  : 'text-slate-600 hover:bg-slate-100 border border-transparent'
              }`}
            >
              Cancelled
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by patient alias, reason..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] focus:border-[#2563EB] focus:bg-white text-xs text-slate-900 outline-none shadow-2xs"
            />
          </div>
        </div>
      </div>

      {/* ── Main Consultations List ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-6xl mx-auto space-y-4">
          {filteredAppointments.length === 0 ? (
            <div className="py-16 text-center bg-[#F8FAFC] rounded-2xl border border-dashed border-[#CBD5E1] space-y-3">
              <div className="w-12 h-12 rounded-xl bg-white border border-[#E2E8F0] mx-auto flex items-center justify-center text-slate-400 shadow-2xs">
                <Calendar className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">No Consultations Found</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {searchQuery || filter !== 'all'
                    ? 'Try adjusting your search query or filter tab.'
                    : 'Schedule your first clinical consultation encounter above.'}
                </p>
              </div>
              <button
                onClick={() => setIsScheduleModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Schedule Consultation</span>
              </button>
            </div>
          ) : (
            filteredAppointments.map((appt) => {
              const isInProgress = appt.status === 'in_progress';
              const isCompleted = appt.status === 'completed';
              const isCancelled = appt.status === 'cancelled';

              return (
                <div
                  key={appt.id}
                  className={`p-5 rounded-xl border transition-all shadow-2xs bg-white ${
                    isInProgress
                      ? 'border-amber-300 ring-2 ring-amber-100 bg-amber-50/20'
                      : isCompleted
                      ? 'border-[#E2E8F0] opacity-80'
                      : 'border-[#E2E8F0] hover:border-[#BFDBFE]'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Left: Patient & Meeting Details */}
                    <div className="flex items-start gap-4">
                      <div
                        className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-white font-bold text-sm shadow-xs ${
                          isInProgress
                            ? 'bg-amber-500 animate-pulse'
                            : isCompleted
                            ? 'bg-emerald-600'
                            : isCancelled
                            ? 'bg-slate-400'
                            : 'bg-[#2563EB]'
                        }`}
                      >
                        <Stethoscope className="w-5 h-5" />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900">
                            {appt.display_name || appt.patient_alias || 'Patient Consultation'}
                          </span>
                          {appt.patient_alias && (
                            <span className="px-1.5 py-0.2 rounded font-mono text-[10px] font-bold bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]">
                              {appt.patient_alias}
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              isInProgress
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : isCompleted
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : isCancelled
                                ? 'bg-slate-100 text-slate-600 border border-slate-300'
                                : 'bg-blue-100 text-blue-800 border border-blue-200'
                            }`}
                          >
                            {isInProgress ? 'In Progress' : appt.status || 'Scheduled'}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                          <span className="flex items-center gap-1 font-mono font-medium text-slate-700">
                            <Clock className="w-3.5 h-3.5 text-[#2563EB]" />
                            {appt.scheduled_time} ({appt.duration_minutes || 15}m)
                          </span>
                          <span>•</span>
                          <span className="capitalize">{appt.appointment_type.replace('_', ' ')}</span>
                        </div>

                        <div className="text-xs text-slate-700 pt-0.5">
                          <strong>Reason:</strong> {appt.reason || 'Clinical follow-up'}
                        </div>
                      </div>
                    </div>

                    {/* Right: Encounter Action Controls */}
                    <div className="flex items-center gap-2 pt-2 lg:pt-0 border-t lg:border-t-0 border-[#E2E8F0]">
                      {appt.status === 'scheduled' && (
                        <button
                          onClick={() => handleStartConsultation(appt)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 fill-white" />
                          <span>Start Encounter</span>
                        </button>
                      )}

                      {isInProgress && (
                        <>
                          <button
                            onClick={() => {
                              setActiveNoteAppt(appt);
                              setEncounterNoteText('');
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#E2E8F0] hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5 text-[#2563EB]" />
                            <span>Add Notes</span>
                          </button>

                          <button
                            onClick={() => handleCompleteConsultation(appt)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Complete Encounter</span>
                          </button>
                        </>
                      )}

                      <button
                        onClick={() => {
                          const targetPatient = patients.find((p) => p.id === appt.patient_id);
                          if (targetPatient && onSelectPatient) {
                            onSelectPatient(targetPatient);
                          }
                          onNavigate('chat');
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] hover:bg-[#DBEAFE] text-[#1D4ED8] text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                        title="Open Copilot with this patient's context"
                      >
                        <Bot className="w-3.5 h-3.5 text-[#2563EB]" />
                        <span>Copilot</span>
                      </button>

                      {appt.status !== 'cancelled' && !isCompleted && (
                        <button
                          onClick={() => handleCancelConsultation(appt)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Cancel appointment"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Schedule Consultation Modal ───────────────────────────────────────── */}
      {isScheduleModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-[#CBD5E1] shadow-2xl max-w-md w-full p-6 space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-[#EFF6FF] text-[#2563EB]">
                  <Calendar className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Schedule Clinical Consultation</h3>
              </div>
              <button
                onClick={() => setIsScheduleModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleScheduleSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Select Patient</label>
                <select
                  value={modalPatientId}
                  onChange={(e) => setModalPatientId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-slate-900 outline-none focus:border-[#2563EB]"
                  required
                >
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.display_name} ({p.llm_alias})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Date</label>
                  <input
                    type="date"
                    value={modalDate}
                    onChange={(e) => setModalDate(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-slate-900 outline-none focus:border-[#2563EB]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Time</label>
                  <input
                    type="time"
                    value={modalTime}
                    onChange={(e) => setModalTime(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-slate-900 outline-none focus:border-[#2563EB]"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Duration</label>
                  <select
                    value={modalDuration}
                    onChange={(e) => setModalDuration(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-slate-900 outline-none focus:border-[#2563EB]"
                  >
                    <option value={15}>15 Minutes</option>
                    <option value={30}>30 Minutes</option>
                    <option value={45}>45 Minutes</option>
                    <option value={60}>60 Minutes</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Type</label>
                  <select
                    value={modalType}
                    onChange={(e) => setModalType(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-slate-900 outline-none focus:border-[#2563EB]"
                  >
                    <option value="follow_up">Follow-up</option>
                    <option value="initial_eval">Initial Evaluation</option>
                    <option value="med_review">Medication Review</option>
                    <option value="urgent">Urgent Triage</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Reason / Clinical Chief Complaint</label>
                <textarea
                  rows={2}
                  value={modalReason}
                  onChange={(e) => setModalReason(e.target.value)}
                  placeholder="e.g. Hypertension 3-month review, medication tolerance check..."
                  className="w-full px-3 py-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-slate-900 outline-none focus:border-[#2563EB] resize-none"
                />
              </div>

              <div className="pt-3 border-t border-[#E2E8F0] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsScheduleModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] hover:bg-slate-50 text-slate-600 font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-semibold shadow-2xs transition-colors cursor-pointer"
                >
                  {isSubmitting ? 'Scheduling...' : 'Save Consultation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Dictate / Add Encounter Note Modal ───────────────────────────────── */}
      {activeNoteAppt && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-[#CBD5E1] shadow-2xl max-w-lg w-full p-6 space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-[#EFF6FF] text-[#2563EB]">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Record Encounter Note</h3>
                  <p className="text-[11px] text-slate-500">
                    Patient: {activeNoteAppt.display_name} ({activeNoteAppt.patient_alias})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveNoteAppt(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <textarea
                rows={5}
                value={encounterNoteText}
                onChange={(e) => setEncounterNoteText(e.target.value)}
                placeholder="Record clinical impressions, exam findings, vitals, or plan..."
                className="w-full p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] focus:border-[#2563EB] text-slate-900 outline-none resize-none"
              />

              <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-end gap-2">
                <button
                  onClick={() => setActiveNoteAppt(null)}
                  className="px-3 py-1.5 rounded-lg border border-[#E2E8F0] hover:bg-slate-50 text-slate-600 font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEncounterNote}
                  disabled={!encounterNoteText.trim() || isSavingNote}
                  className="px-4 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-40 text-white font-semibold shadow-2xs transition-colors cursor-pointer"
                >
                  {isSavingNote ? 'Saving...' : 'Commit to Medical Log'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConsultationsView;
