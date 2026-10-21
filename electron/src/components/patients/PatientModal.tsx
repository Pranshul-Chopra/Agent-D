import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  Plus,
  User,
  Shield,
  Phone,
  Mail,
  Calendar,
  Heart,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import type { Patient, CreatePatientPayload } from '../../types';
import AppBridge from '../../services/bridge';

interface PatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPatient?: (patient: Patient) => void;
  activePatientId?: string | null;
}

export const PatientModal: React.FC<PatientModalProps> = ({
  isOpen,
  onClose,
  onSelectPatient,
  activePatientId,
}) => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New Patient Form State
  const [displayName, setDisplayName] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('Male');
  const [bloodGroup, setBloodGroup] = useState('O+');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [summary, setSummary] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadPatients();
      setIsCreating(false);
      setError(null);
    }
  }, [isOpen]);

  const loadPatients = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await AppBridge.api.listPatients();
      setPatients(res.patients || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load patient directory.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;

    try {
      setSaving(true);
      setError(null);
      const payload: CreatePatientPayload = {
        display_name: displayName.trim(),
        date_of_birth: dob || undefined,
        gender: gender || undefined,
        blood_group: bloodGroup || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        initial_summary: summary.trim() || undefined,
      };

      const res = await AppBridge.api.createPatient(payload);
      if (res.patient) {
        setPatients((prev) => [res.patient, ...prev]);
        setIsCreating(false);
        // Reset form
        setDisplayName('');
        setDob('');
        setPhone('');
        setEmail('');
        setSummary('');
        if (onSelectPatient) {
          onSelectPatient(res.patient);
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to create patient.');
    } finally {
      setSaving(false);
    }
  };

  const filteredPatients = patients.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.display_name.toLowerCase().includes(q) ||
      p.llm_alias.toLowerCase().includes(q) ||
      (p.phone && p.phone.toLowerCase().includes(q))
    );
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-xs p-4 select-none animate-fadeIn">
      <div className="bg-white border border-[#E2E8F0] rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="h-14 border-b border-[#E2E8F0] px-6 flex items-center justify-between bg-[#F8FAFC]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-[#2563EB]">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {isCreating ? 'Register New Patient' : 'Patient Directory'}
              </h2>
              <p className="text-[11px] text-slate-500">
                {isCreating
                  ? 'All records are AES-256-GCM encrypted at rest'
                  : 'Select a patient or register a new chart'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isCreating && (
              <button
                onClick={() => setIsCreating(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Patient</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-[#F1F5F9] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Error notification */}
        {error && (
          <div className="m-4 mb-0 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {isCreating ? (
            /* Create Form */
            <form onSubmit={handleCreatePatient} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Legal Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Eleanor Vance"
                  className="w-full px-3 py-2 rounded-lg bg-white border border-[#E2E8F0] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15 text-xs text-slate-900 placeholder:text-slate-400 outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Date of Birth</label>
                  <input
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white border border-[#E2E8F0] focus:border-[#2563EB] text-xs text-slate-900 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Gender</label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white border border-[#E2E8F0] focus:border-[#2563EB] text-xs text-slate-900 outline-none"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Blood Group</label>
                  <select
                    value={bloodGroup}
                    onChange={(e) => setBloodGroup(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white border border-[#E2E8F0] focus:border-[#2563EB] text-xs text-slate-900 outline-none"
                  >
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-[#E2E8F0] focus:border-[#2563EB] text-xs text-slate-900 placeholder:text-slate-400 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="patient@example.com"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-[#E2E8F0] focus:border-[#2563EB] text-xs text-slate-900 placeholder:text-slate-400 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Initial Clinical Note</label>
                <textarea
                  rows={3}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Primary complaint, medical history, or reason for registration..."
                  className="w-full px-3 py-2 rounded-lg bg-white border border-[#E2E8F0] focus:border-[#2563EB] text-xs text-slate-900 placeholder:text-slate-400 outline-none resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 rounded-lg bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] text-xs font-semibold text-slate-600 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !displayName.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Encrypting & Storing...</span>
                    </>
                  ) : (
                    <>
                      <Shield className="w-3.5 h-3.5" />
                      <span>Save & Generate Alias</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            /* Patient List */
            <div className="space-y-4">
              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by patient name, alias (e.g. PT-1042), or phone..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] focus:border-[#2563EB] focus:bg-white text-xs text-slate-900 placeholder:text-slate-400 outline-none transition-all"
                />
              </div>

              {loading ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-[#2563EB]" />
                  <span className="text-xs">Decrypting patient vault...</span>
                </div>
              ) : filteredPatients.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <User className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
                  <p className="text-xs font-medium text-slate-700">No patients found</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {searchQuery ? 'Try a different search term.' : 'Click Add Patient to register your first chart.'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[#E2E8F0] border border-[#E2E8F0] rounded-xl overflow-hidden">
                  {filteredPatients.map((p) => {
                    const isSelected = p.id === activePatientId;
                    return (
                      <div
                        key={p.id}
                        onClick={() => {
                          if (onSelectPatient) {
                            onSelectPatient(p);
                            onClose();
                          }
                        }}
                        className={`p-3.5 flex items-center justify-between hover:bg-[#F8FAFC] cursor-pointer transition-colors ${
                          isSelected ? 'bg-[#EFF6FF]' : 'bg-white'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">{p.display_name}</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]">
                              {p.llm_alias}
                            </span>
                            {p.gender && (
                              <span className="text-[11px] text-slate-400 font-medium">• {p.gender}</span>
                            )}
                            {p.blood_group && (
                              <span className="text-[10px] font-semibold text-rose-600 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200">
                                {p.blood_group}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-slate-500">
                            {p.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3 text-slate-400" />
                                {p.phone}
                              </span>
                            )}
                            {p.date_of_birth && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-slate-400" />
                                {p.date_of_birth}
                              </span>
                            )}
                          </div>
                        </div>

                        <div>
                          {isSelected ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#2563EB]">
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Active</span>
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400 group-hover:text-slate-600">Select</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PatientModal;
