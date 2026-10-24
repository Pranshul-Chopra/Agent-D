import React from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';

interface DemoAcknowledgmentModalProps {
  isOpen: boolean;
  onAcknowledge: () => void;
}

export const DemoAcknowledgmentModal: React.FC<DemoAcknowledgmentModalProps> = ({
  isOpen,
  onAcknowledge,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none animate-in fade-in duration-200">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-ack-title"
        className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 sm:p-7 flex flex-col items-center text-center animate-in zoom-in-95 duration-150"
      >
        <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 mb-4 shadow-2xs">
          <AlertTriangle className="w-6 h-6 text-amber-600" />
        </div>

        <h3 id="demo-ack-title" className="text-lg font-bold text-slate-900 mb-2">
          Demonstration &amp; Testing Notice
        </h3>

        <p className="text-sm text-slate-600 leading-relaxed mb-6 font-normal">
          This software is for demonstration and testing. It has not been reviewed for use with real patient records. Please use invented patients only.
        </p>

        <button
          type="button"
          onClick={onAcknowledge}
          autoFocus
          className="w-full py-2.5 px-4 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] active:bg-[#1E40AF] text-white text-sm font-semibold transition-all shadow-sm hover:shadow focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center justify-center gap-2 cursor-pointer"
        >
          <ShieldCheck className="w-4 h-4 text-blue-100" />
          <span>I understand</span>
        </button>
      </div>
    </div>
  );
};

export default DemoAcknowledgmentModal;
