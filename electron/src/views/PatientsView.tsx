import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Search,
  ShieldCheck,
  Lock,
  Calendar,
  Phone,
  Mail,
  Droplet,
  Bot,
  BookOpen,
  CheckCircle2,
  X,
  Edit2,
  Trash2,
  Copy,
  Check,
  AlertCircle,
  Clock,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import type { Patient, CreatePatientPayload, NavTab } from '../types';
import AppBridge from '../services/bridge';

interface PatientsViewProps {
  activePatient?: Patient | null;
  onSelectPatient: (patient: Patient) => void;
  onNavigate: (tab: NavTab) => void;
}

export const PatientsView: React.FC<PatientsViewProps> = ({
  activePatient,
  onSelectPatient,
  onNavigate,
}) => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('active');
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [selectedPatientForDetail, setSelectedPatientForDetail] = useState<Patient | null>(null);
  const [copiedAlias, setCopiedAlias] = useState<string | null>(null);

  // New patient registration form state
  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('Male');
  const [bloodGroup, setBloodGroup] = useState('O+');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [initialSummary, setInitialSummary] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Load patients from local context vault
  const loadPatients = async () => {
    try {
      setLoading(true);
      const res = await AppBridge.api.listPatients({ limit: 100 });
      if (res && Array.isArray(res.patients)) {
        setPatients(res.patients);
      }
    } catch (err) {
      console.error('Failed to load patients:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPatients();
  }, []);

  // Filter patients
  const filteredPatients = useMemo(() => {
    return patients.filter((p) => {
      // Status filter
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;

      // Query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = p.display_name.toLowerCase().includes(q);
        const matchAlias = (p.llm_alias || '').toLowerCase().includes(q);
        const matchPhone = (p.phone || '').toLowerCase().includes(q);
        const matchEmail = (p.email || '').toLowerCase().includes(q);
        if (!matchName && !matchAlias && !matchPhone && !matchEmail) return false;
      }

      return true;
    });
  }, [patients, statusFilter, searchQuery]);

  // Copy alias to clipboard
  const handleCopyAlias = (alias: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(alias);
    setCopiedAlias(alias);
    setTimeout(() => setCopiedAlias(null), 2000);
  };

  // Register new patient
  const handleRegisterPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setErrorMsg('Patient full name is required');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    try {
      const payload: CreatePatientPayload = {
        display_name: fullName.trim(),
        date_of_birth: dob || undefined,
        gender: gender || undefined,
        blood_group: bloodGroup || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        initial_summary: initialSummary.trim() || undefined,
      };

      const res = await AppBridge.api.createPatient(payload);
      if (res && res.patient) {
        setPatients((prev) => [res.patient, ...prev]);
        onSelectPatient(res.patient);
        setIsRegisterModalOpen(false);

        // Reset form
        setFullName('');
        setDob('');
        setGender('Male');
        setBloodGroup('O+');
        setPhone('');
        setEmail('');
        setInitialSummary('');
      }
    } catch (err: any) {
      console.error('Failed to register patient:', err);
      setErrorMsg(err.message || 'Failed to register patient');
    } finally {
      setSubmitting(false);
    }
  };

  // Archive / restore patient
  const handleToggleArchive = async (patient: Patient, e: React.MouseEvent) => {
    e.stopPropagation();
    const newStatus = patient.status === 'active' ? 'archived' : 'active';
    const actionText = newStatus === 'archived' ? 'archive' : 'restore';

    if (!window.confirm(`Are you sure you want to ${actionText} patient "${patient.display_name}"?`)) {
      return;
    }

    try {
      await AppBridge.api.updatePatient(patient.id, { status: newStatus });
      setPatients((prev) =>
        prev.map((p) => (p.id === patient.id ? { ...p, status: newStatus } : p))
      );
      if (selectedPatientForDetail?.id === patient.id) {
        setSelectedPatientForDetail((prev) => prev ? { ...prev, status: newStatus } : null);
      }
    } catch (err) {
      console.error('Failed to update patient status:', err);
      alert('Could not update patient status.');
    }
  };

  // Open Copilot for specific patient
  const handleOpenCopilot = (patient: Patient, e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectPatient(patient);
    onNavigate('chat');
  };

  // Open Artifacts for specific patient
  const handleOpenArtifacts = (patient: Patient, e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectPatient(patient);
    onNavigate('documents');
  };

  return (
    <div className="h-full w-full bg-white flex flex-col overflow-hidden select-none">
      {/* Top Header Bar */}
      <div className="h-14 border-b border-[#E2E8F0] px-6 bg-white flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-xs">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-slate-900">Patients Manager & Vault</h1>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-bold">
                {patients.length} records
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              AES-256-GCM encrypted local vault with automatic LLM alias isolation
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsRegisterModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer active:scale-95"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Register New Patient</span>
          </button>
        </div>
      </div>

      {/* Security & Stats Banner */}
      <div className="px-6 py-3 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between gap-4 flex-wrap flex-shrink-0">
        <div className="flex items-center gap-6 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-slate-600 font-medium">Vault Status:</span>
            <span className="font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-bold text-[10px]">
              AES-256-GCM Encrypted
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-2">
            <Lock className="w-3 h-3 text-blue-600" />
            <span className="text-slate-600 font-medium">Anonymization:</span>
            <span className="font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 font-bold text-[10px]">
              PT-XXXX Alias Isolator Active
            </span>
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center bg-white border border-[#E2E8F0] rounded-lg p-0.5 shadow-xs text-xs">
          <button
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1 rounded-md transition-all font-medium ${
              statusFilter === 'active'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Active ({patients.filter((p) => p.status === 'active').length})
          </button>
          <button
            onClick={() => setStatusFilter('archived')}
            className={`px-3 py-1 rounded-md transition-all font-medium ${
              statusFilter === 'archived'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Archived ({patients.filter((p) => p.status === 'archived').length})
          </button>
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1 rounded-md transition-all font-medium ${
              statusFilter === 'all'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All ({patients.length})
          </button>
        </div>
      </div>

      {/* Search Toolbar */}
      <div className="px-6 py-2.5 border-b border-[#E2E8F0] bg-white flex items-center justify-between gap-4 flex-shrink-0">
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by patient legal name, alias (PT-XXXX), phone, or email..."
            className="w-full bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition-all shadow-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="text-xs text-slate-500">
          Showing <span className="font-bold text-slate-900">{filteredPatients.length}</span> patient charts
        </div>
      </div>

      {/* Patients Table / List */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
        {loading ? (
          <div className="py-20 text-center text-xs text-slate-500">
            <Clock className="w-6 h-6 text-blue-600 animate-spin mx-auto mb-2" />
            <span>Decrypting local patient vault...</span>
          </div>
        ) : filteredPatients.length === 0 ? (
          <div className="max-w-md mx-auto py-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mx-auto mb-3">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">No patient records found</h3>
            <p className="text-xs text-slate-500 mb-4">
              {searchQuery
                ? `No patients match "${searchQuery}"`
                : 'Your local encrypted vault has no patient charts registered yet.'}
            </p>
            <button
              onClick={() => setIsRegisterModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Register First Patient</span>
            </button>
          </div>
        ) : (
          <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-slate-600 font-semibold uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-4">Patient / Demographics</th>
                    <th className="py-3 px-4">LLM Alias (Safe)</th>
                    <th className="py-3 px-4">Blood Group</th>
                    <th className="py-3 px-4">Encrypted Contact</th>
                    <th className="py-3 px-4">Chart Status</th>
                    <th className="py-3 px-4 text-right">Clinical Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {filteredPatients.map((patient) => {
                    const isActiveChart = activePatient?.id === patient.id;

                    return (
                      <tr
                        key={patient.id}
                        onClick={() => setSelectedPatientForDetail(patient)}
                        className={`hover:bg-[#F8FAFC] transition-colors cursor-pointer ${
                          isActiveChart ? 'bg-blue-50/40' : ''
                        }`}
                      >
                        {/* Name & Demographics */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center flex-shrink-0 text-xs shadow-xs border border-blue-200">
                              {patient.display_name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900">
                                  {patient.display_name}
                                </span>
                                {isActiveChart && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-blue-600 text-white">
                                    Active Chart
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                                <span>{patient.gender || 'Unknown'}</span>
                                {patient.date_of_birth && (
                                  <>
                                    <span>·</span>
                                    <span>DOB: {patient.date_of_birth}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* LLM Alias */}
                        <td className="py-3.5 px-4 font-mono">
                          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-bold text-[11px]">
                            <span>{patient.llm_alias}</span>
                            <button
                              onClick={(e) => handleCopyAlias(patient.llm_alias, e)}
                              className="p-0.5 hover:text-blue-900 transition-colors"
                              title="Copy safe LLM alias"
                            >
                              {copiedAlias === patient.llm_alias ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </td>

                        {/* Blood Group */}
                        <td className="py-3.5 px-4">
                          {patient.blood_group ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-bold text-[11px]">
                              <Droplet className="w-3 h-3 text-rose-500" />
                              <span>{patient.blood_group}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">Not recorded</span>
                          )}
                        </td>

                        {/* Contact */}
                        <td className="py-3.5 px-4 text-slate-600">
                          <div className="space-y-0.5 text-[11px]">
                            {patient.phone ? (
                              <div className="flex items-center gap-1.5">
                                <Phone className="w-3 h-3 text-slate-400" />
                                <span>{patient.phone}</span>
                              </div>
                            ) : null}
                            {patient.email ? (
                              <div className="flex items-center gap-1.5 text-slate-500">
                                <Mail className="w-3 h-3 text-slate-400" />
                                <span className="truncate max-w-[150px]">{patient.email}</span>
                              </div>
                            ) : null}
                            {!patient.phone && !patient.email && (
                              <span className="text-slate-400">None</span>
                            )}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4">
                          {patient.status === 'active' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              <span>Active</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                              <span>Archived</span>
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                            {!isActiveChart && (
                              <button
                                onClick={() => onSelectPatient(patient)}
                                className="px-2.5 py-1 rounded bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-medium text-[11px] transition-colors border border-slate-200 hover:border-blue-200"
                                title="Set as active chart"
                              >
                                Select Chart
                              </button>
                            )}

                            <button
                              onClick={(e) => handleOpenCopilot(patient, e)}
                              className="p-1.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors"
                              title="Ask Copilot about this patient"
                            >
                              <Bot className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={(e) => handleOpenArtifacts(patient, e)}
                              className="p-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                              title="Open Patient Artifacts & Living Notes"
                            >
                              <BookOpen className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={(e) => handleToggleArchive(patient, e)}
                              className="p-1.5 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors"
                              title={patient.status === 'active' ? 'Archive record' : 'Restore record'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Register Patient Modal */}
      {isRegisterModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setIsRegisterModalOpen(false)}
        >
          <div
            className="bg-white border border-[#E2E8F0] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Register New Patient</h2>
                  <p className="text-[11px] text-slate-500">
                    Patient PII is encrypted at rest (AES-256-GCM) with automatic alias generation
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsRegisterModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleRegisterPatient} className="p-5 space-y-4 overflow-y-auto">
              {errorMsg && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Legal Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Eleanor Vance"
                  className="w-full bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 transition-colors shadow-xs"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Encrypted at rest. Replaced with PT-XXXX alias before any AI call.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Date of Birth</label>
                  <input
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className="w-full bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 transition-colors shadow-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Gender</label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-full bg-white border border-[#E2E8F0] rounded-lg px-2.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 shadow-xs"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Non-Binary">Non-Binary</option>
                    <option value="Other">Other</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Blood Group</label>
                  <select
                    value={bloodGroup}
                    onChange={(e) => setBloodGroup(e.target.value)}
                    className="w-full bg-white border border-[#E2E8F0] rounded-lg px-2.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 shadow-xs"
                  >
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                    <option value="Unknown">Unknown</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="w-full bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 transition-colors shadow-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="patient@example.com"
                  className="w-full bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 transition-colors shadow-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Initial Clinical Profile / Chief Complaint
                </label>
                <textarea
                  rows={3}
                  value={initialSummary}
                  onChange={(e) => setInitialSummary(e.target.value)}
                  placeholder="e.g. Type 2 Diabetes, Essential Hypertension. Routine 6-month checkup..."
                  className="w-full bg-white border border-[#E2E8F0] rounded-lg p-3 text-xs text-slate-900 focus:outline-none focus:border-blue-500 transition-colors shadow-xs resize-none"
                />
              </div>

              {/* Footer */}
              <div className="pt-3 border-t border-[#E2E8F0] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRegisterModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !fullName.trim()}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs tracking-wide transition-all shadow-sm active:scale-95 flex items-center gap-1.5"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{submitting ? 'Encrypting & Saving...' : 'Register Patient'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Patient Detail Drawer */}
      {selectedPatientForDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/30 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setSelectedPatientForDetail(null)}
        >
          <div
            className="w-full max-w-md h-full bg-white border-l border-[#E2E8F0] shadow-2xl p-6 flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              {/* Drawer Top */}
              <div className="flex items-center justify-between pb-4 border-b border-[#E2E8F0]">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs border border-blue-200">
                    {selectedPatientForDetail.display_name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      {selectedPatientForDetail.display_name}
                    </h2>
                    <span className="font-mono text-[11px] text-blue-600 font-bold">
                      {selectedPatientForDetail.llm_alias}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedPatientForDetail(null)}
                  className="p-1 rounded text-slate-400 hover:text-slate-700 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Security Pill */}
              <div className="mt-4 p-3 rounded-xl bg-blue-50/70 border border-blue-200 text-xs space-y-1.5">
                <div className="flex items-center gap-1.5 text-blue-900 font-bold">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  <span>Cryptographic Vault Protection</span>
                </div>
                <p className="text-[11px] text-blue-800 leading-relaxed">
                  Legal identity is securely stored at rest. Model interactions strictly use alias{' '}
                  <span className="font-mono font-bold bg-white px-1.5 py-0.2 rounded border border-blue-200">
                    {selectedPatientForDetail.llm_alias}
                  </span>
                  .
                </p>
              </div>

              {/* Demographics Card */}
              <div className="mt-5 space-y-3">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Demographic Details
                </h3>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                    <span className="text-[10px] text-slate-500 uppercase font-semibold block mb-0.5">
                      Date of Birth
                    </span>
                    <span className="font-medium text-slate-900">
                      {selectedPatientForDetail.date_of_birth || 'Not Recorded'}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                    <span className="text-[10px] text-slate-500 uppercase font-semibold block mb-0.5">
                      Gender
                    </span>
                    <span className="font-medium text-slate-900">
                      {selectedPatientForDetail.gender || 'Not Recorded'}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                    <span className="text-[10px] text-slate-500 uppercase font-semibold block mb-0.5">
                      Blood Group
                    </span>
                    <span className="font-bold text-rose-600">
                      {selectedPatientForDetail.blood_group || 'Unknown'}
                    </span>
                  </div>

                  <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                    <span className="text-[10px] text-slate-500 uppercase font-semibold block mb-0.5">
                      Status
                    </span>
                    <span className="font-semibold text-emerald-700 capitalize">
                      {selectedPatientForDetail.status}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-xs space-y-2">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">
                    Contact Information
                  </span>
                  <div className="flex items-center gap-2 text-slate-700">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>{selectedPatientForDetail.phone || 'No phone registered'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-700">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span>{selectedPatientForDetail.email || 'No email registered'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Actions in Drawer */}
            <div className="pt-4 border-t border-[#E2E8F0] space-y-2">
              <button
                onClick={() => {
                  onSelectPatient(selectedPatientForDetail);
                  setSelectedPatientForDetail(null);
                }}
                className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs tracking-wide shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Set as Active Workstation Chart</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={(e) => {
                    handleOpenCopilot(selectedPatientForDetail, e);
                    setSelectedPatientForDetail(null);
                  }}
                  className="py-2 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 border border-slate-200 hover:border-blue-200"
                >
                  <Bot className="w-3.5 h-3.5 text-blue-600" />
                  <span>Open Copilot</span>
                </button>

                <button
                  onClick={(e) => {
                    handleOpenArtifacts(selectedPatientForDetail, e);
                    setSelectedPatientForDetail(null);
                  }}
                  className="py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 border border-slate-200"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Open Artifacts</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PatientsView;
