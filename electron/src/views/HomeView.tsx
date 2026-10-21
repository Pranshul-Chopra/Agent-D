import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  UserCheck,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Bot,
  Plus,
  Stethoscope,
  ChevronRight,
  CheckCircle2,
  Users,
} from 'lucide-react';
import type { NavTab } from '../types';
import AppBridge from '../services/bridge';

interface HomeViewProps {
  onNavigate: (tab: NavTab) => void;
}

interface PracticeStats {
  total_patients: number;
  today_appointments_count: number;
  unreviewed_artifacts_count: number;
  open_tickets_count: number;
  next_appointment?: {
    alias: string;
    time: string;
    reason?: string;
  } | null;
}

interface AppointmentItem {
  id: string;
  patient_id: string;
  patient_alias?: string;
  display_name?: string;
  scheduled_time: string;
  duration_minutes: number;
  appointment_type: string;
  reason?: string;
  status: string;
}

export const HomeView: React.FC<HomeViewProps> = ({ onNavigate }) => {
  const [currentDate, setCurrentDate] = useState('');
  const [stats, setStats] = useState<PracticeStats>({
    total_patients: 0,
    today_appointments_count: 0,
    unreviewed_artifacts_count: 0,
    open_tickets_count: 0,
    next_appointment: null,
  });
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const now = new Date();
    setCurrentDate(
      now.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    );

    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [statsRes, apptsRes] = await Promise.all([
        AppBridge.api.getDashboardStats(),
        AppBridge.api.listAppointments(),
      ]);

      if (statsRes) {
        setStats(statsRes);
      }
      if (apptsRes && apptsRes.appointments) {
        setAppointments(apptsRes.appointments);
      }
    } catch (_) {
      // Fallback gracefully
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full w-full bg-white flex flex-col overflow-y-auto select-none">
      {/* Top Banner */}
      <div className="border-b border-[#E2E8F0] bg-[#F8FAFC] px-8 py-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#2563EB] mb-1">
              <span className="w-2 h-2 rounded-full bg-[#2563EB] animate-pulse" />
              <span>Practice Command Center</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900">Good Day, Doctor</h1>
            <p className="text-xs text-slate-500 mt-0.5">{currentDate || 'Clinical Workstation Active'}</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate('patients')}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white border border-[#E2E8F0] hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-all cursor-pointer"
            >
              <Users className="w-3.5 h-3.5 text-slate-500" />
              <span>Patients Manager</span>
            </button>

            <button
              onClick={() => onNavigate('chat')}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold shadow-2xs transition-all cursor-pointer"
            >
              <Bot className="w-4 h-4" />
              <span>Open AI Copilot</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl border border-[#E2E8F0] bg-white shadow-2xs">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                <span>Active Patient Records</span>
                <Users className="w-4 h-4 text-[#2563EB]" />
              </div>
              <div className="text-2xl font-bold text-slate-900">{stats.total_patients}</div>
              <div className="text-[11px] text-slate-500 mt-1">Encrypted in local vault</div>
            </div>

            <div className="p-4 rounded-xl border border-[#E2E8F0] bg-white shadow-2xs">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                <span>Today's Consultations</span>
                <Calendar className="w-4 h-4 text-[#2563EB]" />
              </div>
              <div className="text-2xl font-bold text-slate-900">{stats.today_appointments_count}</div>
              <div className="text-[11px] text-slate-500 mt-1">Scheduled for encounter</div>
            </div>

            <div className="p-4 rounded-xl border border-[#E2E8F0] bg-white shadow-2xs">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                <span>Follow-up Tickets</span>
                <Clock className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-2xl font-bold text-slate-900">{stats.open_tickets_count}</div>
              <div className="text-[11px] text-amber-600 font-medium mt-1">Pending clinical review</div>
            </div>

            <div className="p-4 rounded-xl border border-[#E2E8F0] bg-white shadow-2xs">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                <span>Security Engine</span>
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-sm font-bold text-slate-900 mt-1">AES-256-GCM Active</div>
              <div className="text-[11px] text-emerald-600 font-medium mt-1">Zero raw PII leaves device</div>
            </div>
          </div>

          {/* Featured Section: Next Patient Pre-Visit Brief */}
          <div className="rounded-xl border border-[#BFDBFE] bg-[#EFF6FF]/40 p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] text-[#1D4ED8] text-[11px] font-semibold">
                  <Clock className="w-3 h-3" />
                  <span>
                    {stats.next_appointment ? `Up Next • ${stats.next_appointment.time}` : "Clinical Practice Ready"}
                  </span>
                </div>
                <h2 className="text-base font-bold text-slate-900 pt-1">
                  {stats.next_appointment
                    ? `Pre-Visit Brief: Patient ${stats.next_appointment.alias}`
                    : 'AI Clinical Chief of Staff — Active Session'}
                </h2>
                <p className="text-xs text-slate-600">
                  {stats.next_appointment?.reason
                    ? `Reason for visit: ${stats.next_appointment.reason}`
                    : 'Instant morning briefings, medication reviews, and visit note dictations with doctor-in-control guardrails.'}
                </p>
              </div>

              <button
                onClick={() => onNavigate('chat')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <span>Consult with Copilot</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-white border border-[#E2E8F0]">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Temporal Awareness
                </div>
                <div className="text-xs text-slate-800">
                  Real-time local clock and practice schedule injected into every LLM consultation prompt.
                </div>
              </div>

              <div className="p-3 rounded-lg bg-white border border-[#BFDBFE]">
                <div className="text-[11px] font-semibold text-amber-600 uppercase tracking-wider mb-1">
                  Watch-For Guardrails
                </div>
                <div className="text-xs text-slate-800">
                  Automatic clinical flag checks for active allergies, interactions, and vital ranges.
                </div>
              </div>

              <div className="p-3 rounded-lg bg-white border border-[#E2E8F0]">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  De-Identification Perimeter
                </div>
                <div className="text-xs text-slate-800">
                  Cryptographic patient aliases (PT-XXXX) ensure external LLM calls remain 100% private.
                </div>
              </div>
            </div>
          </div>

          {/* Today's Schedule Overview */}
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-2xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Today's Scheduled Consultations</h3>
                <p className="text-xs text-slate-500">Live appointments from practice context database</p>
              </div>
              <button
                onClick={() => onNavigate('chat')}
                className="text-xs text-[#2563EB] hover:text-[#1D4ED8] font-medium flex items-center gap-1 cursor-pointer"
              >
                <span>Ask Copilot to brief schedule</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {appointments.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 bg-[#F8FAFC] rounded-lg border border-dashed border-[#E2E8F0]">
                No appointments currently scheduled for today.
              </div>
            ) : (
              <div className="divide-y divide-[#E2E8F0]">
                {appointments.map((appt) => {
                  const isDone = appt.status === 'completed';
                  return (
                    <div key={appt.id} className="py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-20 text-xs font-mono font-semibold text-slate-600">
                          {appt.scheduled_time}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                            <span>{appt.display_name || appt.patient_alias || 'Patient Consultation'}</span>
                            {appt.patient_alias && (
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200">
                                {appt.patient_alias}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {appt.reason || `${appt.duration_minutes || 15} min consultation`}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded border ${
                          isDone
                            ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
                            : 'text-blue-600 bg-blue-50 border-blue-200'
                        }`}
                      >
                        {isDone && <CheckCircle2 className="w-3 h-3" />}
                        <span>{isDone ? 'Done' : appt.status || 'Scheduled'}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomeView;
