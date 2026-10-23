import React, { useState } from 'react';
import {
  X,
  Stethoscope,
  ArrowRight,
  ArrowLeft,
  Check,
  CheckCircle2,
  Calendar,
  BookOpen,
  Kanban,
  Users,
  Keyboard,
  Shield,
  Lock,
} from 'lucide-react';
import AppBridge from '../../services/bridge';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onClose,
  onComplete,
}) => {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Step 1: Practice Profile
  const [doctorName, setDoctorName] = useState('Dr. Alex Mercer, MD');
  const [clinicName, setClinicName] = useState('Mercer Family Medicine & Endocrinology');
  const [specialty, setSpecialty] = useState('Internal Medicine / Endocrinology');

  if (!isOpen) return null;

  const handleFinish = () => {
    try {
      localStorage.setItem('agentd_onboarding_completed', 'true');
      localStorage.setItem('agentd_doctor_name', doctorName.trim());
      localStorage.setItem('agentd_clinic_name', clinicName.trim());
      localStorage.setItem('agentd_specialty', specialty.trim());
    } catch (_) {}

    if (onComplete) {
      onComplete();
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs select-none animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-white border border-[#E2E8F0] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#2563EB] text-white flex items-center justify-center shadow-xs">
              <Stethoscope className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Welcome to Agent-D</h2>
              <p className="text-[11px] text-slate-500">
                Step {currentStep} of 3 · Privacy-First Local Clinical Workstation
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6">
          {/* STEP 1: Practice Profile */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Configure Your Clinical Practice</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Set your attending physician identity and clinic profile. All data remains 100% on this local computer.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Attending Physician Name &amp; Credentials
                  </label>
                  <input
                    type="text"
                    value={doctorName}
                    onChange={(e) => setDoctorName(e.target.value)}
                    placeholder="e.g. Dr. Alex Mercer, MD"
                    className="w-full px-3.5 py-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-xs font-medium text-slate-900 focus:outline-none focus:border-[#2563EB] focus:bg-white transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Clinic / Practice Facility Name
                  </label>
                  <input
                    type="text"
                    value={clinicName}
                    onChange={(e) => setClinicName(e.target.value)}
                    placeholder="e.g. Mercer Family Practice"
                    className="w-full px-3.5 py-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-xs font-medium text-slate-900 focus:outline-none focus:border-[#2563EB] focus:bg-white transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Primary Clinical Specialty
                  </label>
                  <input
                    type="text"
                    value={specialty}
                    onChange={(e) => setSpecialty(e.target.value)}
                    placeholder="e.g. Internal Medicine / Endocrinology"
                    className="w-full px-3.5 py-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-xs font-medium text-slate-900 focus:outline-none focus:border-[#2563EB] focus:bg-white transition-colors"
                  />
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-start gap-2.5">
                <Shield className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-semibold">Hardware-Bound Vault Storage:</strong>
                  Your clinical records and patient charts are encrypted at rest with hardware-bound AES-256-GCM. Zero cloud transmission, zero artificial intelligence models, zero external network telemetry.
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Workstation Feature Tour */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Your Cohesive Clinical Pipeline</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  From morning schedule review to visit dictation and follow-up tracking:
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div className="p-3.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] space-y-1">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <Calendar className="w-4 h-4 text-[#2563EB]" />
                    <span>Practice Dashboard &amp; Calendar</span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Interactive 7-column calendar widget, today agenda jump, and real-time clinical practice metrics.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] space-y-1">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <BookOpen className="w-4 h-4 text-[#2563EB]" />
                    <span>Patient Artifacts Studio</span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Living patient summaries, active problem lists, and medication rosters with immutable version timelines.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] space-y-1">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <Stethoscope className="w-4 h-4 text-[#2563EB]" />
                    <span>Consultations &amp; Encounters</span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Start encounters, record clinical dictation and vital signs, and close visits with automatic log archives.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] space-y-1">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <Kanban className="w-4 h-4 text-[#2563EB]" />
                    <span>Follow-ups Kanban Board</span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Visual drag-and-drop tracker for laboratory orders, pathology recalls, and specialist referrals.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Workstation Hotkeys & Launch */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Keyboard Shortcuts &amp; Ergonomics</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Navigate instantly across the entire clinical workstation without leaving your keyboard.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2 text-xs">
                <div className="p-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]">
                  <span className="font-mono font-bold text-[#2563EB] text-sm">Ctrl + K</span>
                  <div className="text-[11px] text-slate-700 font-medium mt-1">Command Palette</div>
                </div>
                <div className="p-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]">
                  <span className="font-mono font-bold text-[#2563EB] text-sm">Ctrl + 1</span>
                  <div className="text-[11px] text-slate-700 font-medium mt-1">Practice Dashboard</div>
                </div>
                <div className="p-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]">
                  <span className="font-mono font-bold text-[#2563EB] text-sm">Ctrl + 2</span>
                  <div className="text-[11px] text-slate-700 font-medium mt-1">Patients Manager</div>
                </div>
                <div className="p-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]">
                  <span className="font-mono font-bold text-[#2563EB] text-sm">Ctrl + 3</span>
                  <div className="text-[11px] text-slate-700 font-medium mt-1">Consultations Monitor</div>
                </div>
                <div className="p-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]">
                  <span className="font-mono font-bold text-[#2563EB] text-sm">Ctrl + 4</span>
                  <div className="text-[11px] text-slate-700 font-medium mt-1">Patient Artifacts</div>
                </div>
                <div className="p-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]">
                  <span className="font-mono font-bold text-[#2563EB] text-sm">Ctrl + 5</span>
                  <div className="text-[11px] text-slate-700 font-medium mt-1">Follow-ups Board</div>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-950 leading-relaxed flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-[#2563EB] shrink-0" />
                <span>
                  Ready to launch. Your hardware-bound vault is initialized at <code className="font-mono font-bold">%LOCALAPPDATA%\AgentD\context.db</code>.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between">
          <div>
            {currentStep > 1 && (
              <button
                type="button"
                onClick={() => setCurrentStep((prev) => (prev - 1) as any)}
                className="px-3.5 py-2 rounded-lg border border-[#E2E8F0] hover:bg-white text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {currentStep < 3 ? (
              <button
                type="button"
                onClick={() => setCurrentStep((prev) => (prev + 1) as any)}
                className="px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                <span>Continue</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinish}
                className="px-5 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer shadow-md"
              >
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>Launch Workstation</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingModal;
