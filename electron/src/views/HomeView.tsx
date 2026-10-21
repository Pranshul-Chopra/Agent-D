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
} from 'lucide-react';
import type { NavTab } from '../types';
import AppBridge from '../services/bridge';

interface HomeViewProps {
  onNavigate: (tab: NavTab) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({ onNavigate }) => {
  const [currentDate, setCurrentDate] = useState('');

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
  }, []);

  return (
    <div className="h-full w-full bg-white flex flex-col overflow-y-auto select-none">
      {/* Top Banner */}
      <div className="border-b border-[#E2E8F0] bg-[#F8FAFC] px-8 py-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#2563EB] mb-1">
              <span className="w-2 h-2 rounded-full bg-[#2563EB] animate-pulse" />
              <span>Practice Dashboard</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900">Good Day, Doctor</h1>
            <p className="text-xs text-slate-500 mt-0.5">{currentDate || 'Practice Workstation'}</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate('chat')}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
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
                <span>Today's Visits</span>
                <Calendar className="w-4 h-4 text-[#2563EB]" />
              </div>
              <div className="text-2xl font-bold text-slate-900">4</div>
              <div className="text-[11px] text-slate-500 mt-1">2 completed, 2 remaining</div>
            </div>

            <div className="p-4 rounded-xl border border-[#E2E8F0] bg-white shadow-2xs">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                <span>Pending Approvals</span>
                <AlertTriangle className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-2xl font-bold text-slate-900">1</div>
              <div className="text-[11px] text-amber-600 font-medium mt-1">Awaiting your sign-off</div>
            </div>

            <div className="p-4 rounded-xl border border-[#E2E8F0] bg-white shadow-2xs">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                <span>Follow-up Tickets</span>
                <Clock className="w-4 h-4 text-[#2563EB]" />
              </div>
              <div className="text-2xl font-bold text-slate-900">2</div>
              <div className="text-[11px] text-slate-500 mt-1">Due before end of day</div>
            </div>

            <div className="p-4 rounded-xl border border-[#E2E8F0] bg-white shadow-2xs">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                <span>Security Engine</span>
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-sm font-bold text-slate-900 mt-1">Local & Encrypted</div>
              <div className="text-[11px] text-emerald-600 font-medium mt-1">Zero raw PII leaves device</div>
            </div>
          </div>

          {/* Featured Section: Next Patient Pre-Visit Brief */}
          <div className="rounded-xl border border-[#BFDBFE] bg-[#EFF6FF]/40 p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] text-[#1D4ED8] text-[11px] font-semibold">
                  <Clock className="w-3 h-3" />
                  <span>Up Next • 10:30 AM</span>
                </div>
                <h2 className="text-base font-bold text-slate-900 pt-1">
                  Pre-Visit Brief: Patient PT-7821 (Follow-up)
                </h2>
                <p className="text-xs text-slate-600">
                  Last visit 3 weeks ago • Follow-up for Type 2 Diabetes Mellitus & Essential Hypertension
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
                  Last Changed
                </div>
                <div className="text-xs text-slate-800">
                  Increased Metformin to 1000mg BID; mild GI discomfort noted initially.
                </div>
              </div>

              <div className="p-3 rounded-lg bg-white border border-[#BFDBFE]">
                <div className="text-[11px] font-semibold text-amber-600 uppercase tracking-wider mb-1">
                  Watch For Today
                </div>
                <div className="text-xs text-slate-800">
                  Check fasting glucose log, GI tolerance of 1000mg dose, and blood pressure.
                </div>
              </div>

              <div className="p-3 rounded-lg bg-white border border-[#E2E8F0]">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Open Action Items
                </div>
                <div className="text-xs text-slate-800">
                  Review lipid panel result; confirm next 3-month HbA1c lab schedule.
                </div>
              </div>
            </div>
          </div>

          {/* Today's Schedule Overview */}
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-2xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Today's Appointments</h3>
                <p className="text-xs text-slate-500">Scheduled consultations for today</p>
              </div>
              <button
                onClick={() => onNavigate('chat')}
                className="text-xs text-[#2563EB] hover:text-[#1D4ED8] font-medium flex items-center gap-1 cursor-pointer"
              >
                <span>Ask Copilot to brief schedule</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="divide-y divide-[#E2E8F0]">
              <div className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-16 text-xs font-mono font-semibold text-slate-500">09:15 AM</div>
                  <div>
                    <div className="text-xs font-semibold text-slate-900">PT-6401 (Hypertension Check)</div>
                    <div className="text-[11px] text-slate-500">Consultation concluded • Notes committed</div>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Done</span>
                </span>
              </div>

              <div className="py-3 flex items-center justify-between bg-[#F8FAFC] -mx-6 px-6">
                <div className="flex items-center gap-3">
                  <div className="w-16 text-xs font-mono font-bold text-[#2563EB]">10:30 AM</div>
                  <div>
                    <div className="text-xs font-bold text-slate-900">PT-7821 (Diabetes & HTN Review)</div>
                    <div className="text-[11px] text-slate-500">Waiting in clinic • Pre-visit brief ready</div>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1D4ED8] bg-[#EFF6FF] px-2 py-0.5 rounded border border-[#BFDBFE]">
                  <span>Next Up</span>
                </span>
              </div>

              <div className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-16 text-xs font-mono font-semibold text-slate-500">11:15 AM</div>
                  <div>
                    <div className="text-xs font-semibold text-slate-900">PT-8910 (Post-Op Dressing)</div>
                    <div className="text-[11px] text-slate-500">Routine incision site review</div>
                  </div>
                </div>
                <span className="text-[11px] text-slate-500">Scheduled</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomeView;
