import React from 'react';
import { BarChart3, TrendingUp, Users, Calendar } from 'lucide-react';

export const StudioView: React.FC = () => {
  return (
    <div className="h-full w-full bg-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="h-14 border-b border-[#E2E8F0] px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-[#2563EB]">
            <BarChart3 className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-900">Practice Overview & Metrics</h1>
            <p className="text-xs text-slate-500">Summary of consultations, visit volume, and patient follow-up adherence</p>
          </div>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                <span>Total Patients</span>
                <Users className="w-4 h-4 text-[#2563EB]" />
              </div>
              <div className="text-2xl font-bold text-slate-900">0</div>
              <div className="text-[11px] text-slate-500 mt-1">Stored in local encrypted database</div>
            </div>

            <div className="p-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                <span>Today's Consultations</span>
                <Calendar className="w-4 h-4 text-[#2563EB]" />
              </div>
              <div className="text-2xl font-bold text-slate-900">0</div>
              <div className="text-[11px] text-slate-500 mt-1">Appointments scheduled</div>
            </div>

            <div className="p-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                <span>Proposal Adherence</span>
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-bold text-slate-900">100%</div>
              <div className="text-[11px] text-slate-500 mt-1">All clinical updates approved</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudioView;
