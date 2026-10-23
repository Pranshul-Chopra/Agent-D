import React, { useEffect, useState, useRef } from 'react';
import {
  BookOpen,
  User,
  Shield,
  Save,
  Plus,
  Trash2,
  Clock,
  History,
  CheckCircle2,
  AlertTriangle,
  Pill,
  Heart,
  Eye,
  Calendar,
  FileText,
  Loader2,
  Check,
  ChevronRight,
  ChevronDown,
  Search,
  GitCompare,
  RotateCcw,
  Activity,
  Droplet,
  Thermometer,
  Edit2,
  X,
  Sparkles,
} from 'lucide-react';
import AppBridge from '../services/bridge';
import type {
  Patient,
  PatientArtifact,
  PatientArtifactVersion,
  MedicalLogEntry,
  CreateLogEntryPayload,
  ConsultationVisit,
  ClinicalProposal,
  NavTab,
} from '../types';
import ArtifactDiffModal from '../components/artifacts/ArtifactDiffModal';

interface DocsViewProps {
  initialProjectId?: number | null;
  activePatient?: Patient | null;
  onSelectPatient?: (patient: Patient | null) => void;
  onNavigate?: (tab: NavTab) => void;
}

export const DocsView: React.FC<DocsViewProps> = ({
  activePatient,
  onSelectPatient,
  onNavigate,
}) => {
  const [activeTab, setActiveTab] = useState<'artifact' | 'logs' | 'visits'>('artifact');
  const [artifact, setArtifact] = useState<PatientArtifact | null>(null);
  const [versions, setVersions] = useState<PatientArtifactVersion[]>([]);
  const [logs, setLogs] = useState<MedicalLogEntry[]>([]);
  const [visits, setVisits] = useState<ConsultationVisit[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // In-view patient selector & chart switching state
  const [patientList, setPatientList] = useState<Patient[]>([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [isSwitchDropdownOpen, setIsSwitchDropdownOpen] = useState(false);
  const switchDropdownRef = useRef<HTMLDivElement>(null);

  const loadPatients = async () => {
    try {
      const res = await AppBridge.api.listPatients();
      setPatientList(res.patients || []);
    } catch (_) {}
  };

  useEffect(() => {
    loadPatients();
  }, [activePatient?.id]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (switchDropdownRef.current && !switchDropdownRef.current.contains(e.target as Node)) {
        setIsSwitchDropdownOpen(false);
      }
    };
    if (isSwitchDropdownOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isSwitchDropdownOpen]);

  const filteredPatients = React.useMemo(() => {
    if (!patientSearch.trim()) return patientList;
    const q = patientSearch.toLowerCase();
    return patientList.filter(
      (p) =>
        p.display_name.toLowerCase().includes(q) ||
        p.llm_alias.toLowerCase().includes(q) ||
        (p.date_of_birth && p.date_of_birth.includes(q))
    );
  }, [patientList, patientSearch]);

  // Consultation Visits State (Milestone 5)
  const [isStartVisitModalOpen, setIsStartVisitModalOpen] = useState(false);
  const [activeVisit, setActiveVisit] = useState<ConsultationVisit | null>(null);
  const [visitReason, setVisitReason] = useState('Routine Outpatient Consultation');
  const [visitNotes, setVisitNotes] = useState('');
  const [visitBp, setVisitBp] = useState('');
  const [visitHr, setVisitHr] = useState('');
  const [visitTemp, setVisitTemp] = useState('');
  const [visitO2, setVisitO2] = useState('');
  const [closingVisit, setClosingVisit] = useState(false);
  const [stagedProposals, setStagedProposals] = useState<any[]>([]);
  const [expandedVisitId, setExpandedVisitId] = useState<string | null>(null);

  // Diff Modal State
  const [isDiffModalOpen, setIsDiffModalOpen] = useState(false);
  const [diffV1, setDiffV1] = useState<number | undefined>(undefined);
  const [diffV2, setDiffV2] = useState<number | undefined>(undefined);

  // Form Fields for Artifact
  const [summary, setSummary] = useState('');
  const [activeIssues, setActiveIssues] = useState<string[]>([]);
  const [medications, setMedications] = useState<string[]>([]);
  const [watchFor, setWatchFor] = useState<string[]>([]);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [notes, setNotes] = useState('');

  // Item Input Temp States
  const [newIssue, setNewIssue] = useState('');
  const [newMed, setNewMed] = useState('');
  const [newWatch, setNewWatch] = useState('');
  const [newFollowUp, setNewFollowUp] = useState('');

  // Medical Logs State
  const [logTypeFilter, setLogTypeFilter] = useState<string>('all');
  const [isNewLogModalOpen, setIsNewLogModalOpen] = useState(false);
  const [newLogType, setNewLogType] = useState<string>('observation');
  const [newLogDate, setNewLogDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [newLogContent, setNewLogContent] = useState('');
  const [newLogBp, setNewLogBp] = useState('');
  const [newLogHr, setNewLogHr] = useState('');
  const [newLogTemp, setNewLogTemp] = useState('');
  const [newLogO2, setNewLogO2] = useState('');
  const [submittingLog, setSubmittingLog] = useState(false);

  // Amend Log Modal State
  const [amendingLog, setAmendingLog] = useState<MedicalLogEntry | null>(null);
  const [amendContent, setAmendContent] = useState('');
  const [amendReason, setAmendReason] = useState('Correction recorded by physician');

  // Expand log revision drawer
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (activePatient?.id) {
      loadArtifact(activePatient.id);
      loadVersions(activePatient.id);
      loadLogs(activePatient.id);
      loadVisits(activePatient.id);
    }
  }, [activePatient?.id]);

  const loadVisits = async (patientId: string) => {
    try {
      const res = await AppBridge.api.listVisits({ patient_id: patientId });
      setVisits(res.visits || []);
      const open = (res.visits || []).find((v) => v.status === 'open');
      if (open) {
        setActiveVisit(open);
        setVisitReason(open.reason || 'Routine Outpatient Consultation');
        setVisitNotes(open.doctor_notes || '');
      } else {
        setActiveVisit(null);
      }
    } catch (_) {}
  };

  const handleStartVisit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activePatient?.id) return;
    try {
      const res = await AppBridge.api.createVisit({
        patient_id: activePatient.id,
        reason: visitReason.trim() || 'Clinical Consultation',
        doctor_notes: visitNotes.trim(),
      });
      if (res && res.visit) {
        setActiveVisit(res.visit);
        setVisits((prev) => [res.visit, ...prev]);
        setIsStartVisitModalOpen(false);
        setActiveTab('visits');
        showToast('Consultation encounter started.');
      }
    } catch (err: any) {
      alert(`Failed to start encounter: ${err.message}`);
    }
  };

  const handleCloseVisit = async () => {
    if (!activeVisit || !activePatient?.id) return;
    if (!visitNotes.trim()) {
      alert('Please enter clinical consultation notes before closing the encounter.');
      return;
    }
    setClosingVisit(true);
    try {
      const vitals: Record<string, any> = {};
      if (visitBp.trim()) vitals.bp = visitBp.trim();
      if (visitHr.trim()) vitals.hr = visitHr.trim();
      if (visitTemp.trim()) vitals.temp = visitTemp.trim();
      if (visitO2.trim()) vitals.o2 = visitO2.trim();

      const res = await AppBridge.api.closeVisit(activeVisit.id, {
        doctor_notes: visitNotes.trim(),
        outcome_summary: `Consultation closed. Vitals: ${Object.entries(vitals).map(([k, v]) => `${k.toUpperCase()} ${v}`).join(', ') || 'Normal'}. Notes committed to medical records.`,
        vitals,
      });

      if (res) {
        setActiveVisit(null);
        setStagedProposals(res.proposals || []);
        setVisitNotes('');
        setVisitBp('');
        setVisitHr('');
        setVisitTemp('');
        setVisitO2('');
        showToast(`Visit closed. ${res.proposals?.length || 0} proposals staged for sign-off.`);
        await loadVisits(activePatient.id);
        await loadArtifact(activePatient.id);
        await loadLogs(activePatient.id);
      }
    } catch (err: any) {
      alert(`Error closing consultation: ${err.message}`);
    } finally {
      setClosingVisit(false);
    }
  };

  const handleApproveStagedProposal = async (proposalId: string) => {
    try {
      await AppBridge.api.acceptProposal(proposalId);
      setStagedProposals((prev) => prev.filter((p) => p.id !== proposalId));
      showToast('Proposal approved & committed to live records.');
      if (activePatient?.id) {
        await loadArtifact(activePatient.id);
        await loadLogs(activePatient.id);
      }
    } catch (err: any) {
      alert(`Approval error: ${err.message}`);
    }
  };

  const handleRejectStagedProposal = async (proposalId: string) => {
    try {
      await AppBridge.api.rejectProposal(proposalId, 'Physician rejected during encounter review');
      setStagedProposals((prev) => prev.filter((p) => p.id !== proposalId));
      showToast('Proposal rejected.');
    } catch (err: any) {
      alert(`Rejection error: ${err.message}`);
    }
  };

  const loadArtifact = async (patientId: string) => {
    try {
      setLoading(true);
      const res = await AppBridge.api.getPatientArtifact(patientId);
      if (res.artifact) {
        setArtifact(res.artifact);
        setSummary(res.artifact.summary || '');
        setActiveIssues(res.artifact.active_issues || []);
        setMedications(res.artifact.medications || []);
        setWatchFor(res.artifact.watch_for || []);
        setFollowUps(res.artifact.follow_ups || []);
        setNotes(res.artifact.notes || '');
      }
    } catch (_) {
    } finally {
      setLoading(false);
    }
  };

  const loadVersions = async (patientId: string) => {
    try {
      const res = await AppBridge.api.getPatientArtifactVersions(patientId);
      setVersions(res.versions || []);
    } catch (_) {}
  };

  const loadLogs = async (patientId: string) => {
    try {
      const res = await AppBridge.api.listPatientLogs(patientId);
      setLogs(res.logs || []);
    } catch (_) {}
  };

  const handleSave = async () => {
    if (!activePatient?.id) return;
    try {
      setSaving(true);
      const updatedData = {
        summary: summary.trim(),
        active_issues: activeIssues,
        medications: medications,
        watch_for: watchFor,
        follow_ups: followUps,
        notes: notes.trim(),
        author_type: 'doctor_manual',
        change_summary: 'Updated by doctor',
      };

      const res = await AppBridge.api.updatePatientArtifact(activePatient.id, updatedData);
      if (res.artifact) {
        setArtifact(res.artifact);
        await loadVersions(activePatient.id);
        showToast('Patient Context Artifact saved & versioned.');
      }
    } catch (err: any) {
      showToast(`Error: ${err?.message || 'Could not save artifact'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRestoreVersion = async (versionNum: number) => {
    if (!activePatient?.id) return;
    if (!window.confirm(`Are you sure you want to restore Version v${versionNum}? This will create a new version snapshot.`)) {
      return;
    }

    try {
      setLoading(true);
      const res = await AppBridge.api.restorePatientArtifact(activePatient.id, versionNum);
      if (res.success && res.artifact) {
        setArtifact(res.artifact);
        setSummary(res.artifact.summary || '');
        setActiveIssues(res.artifact.active_issues || []);
        setMedications(res.artifact.medications || []);
        setWatchFor(res.artifact.watch_for || []);
        setFollowUps(res.artifact.follow_ups || []);
        setNotes(res.artifact.notes || '');
        await loadVersions(activePatient.id);
        showToast(`Restored to Version v${versionNum} snapshot.`);
      }
    } catch (err: any) {
      showToast(`Error: ${err?.message || 'Could not restore version'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDiff = (v1Num: number, v2Num: number) => {
    setDiffV1(v1Num);
    setDiffV2(v2Num);
    setIsDiffModalOpen(true);
  };

  // Add Item Helpers
  const addIssue = () => {
    if (newIssue.trim() && !activeIssues.includes(newIssue.trim())) {
      setActiveIssues([...activeIssues, newIssue.trim()]);
      setNewIssue('');
    }
  };

  const removeIssue = (idx: number) => {
    setActiveIssues(activeIssues.filter((_, i) => i !== idx));
  };

  const addMed = () => {
    if (newMed.trim() && !medications.includes(newMed.trim())) {
      setMedications([...medications, newMed.trim()]);
      setNewMed('');
    }
  };

  const removeMed = (idx: number) => {
    setMedications(medications.filter((_, i) => i !== idx));
  };

  const addWatch = () => {
    if (newWatch.trim() && !watchFor.includes(newWatch.trim())) {
      setWatchFor([...watchFor, newWatch.trim()]);
      setNewWatch('');
    }
  };

  const removeWatch = (idx: number) => {
    setWatchFor(watchFor.filter((_, i) => i !== idx));
  };

  const addFollowUp = () => {
    if (newFollowUp.trim() && !followUps.includes(newFollowUp.trim())) {
      setFollowUps([...followUps, newFollowUp.trim()]);
      setNewFollowUp('');
    }
  };

  const removeFollowUp = (idx: number) => {
    setFollowUps(followUps.filter((_, i) => i !== idx));
  };

  // Create Medical Log
  const handleCreateLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePatient?.id || !newLogContent.trim()) return;

    setSubmittingLog(true);
    try {
      const metadata: Record<string, any> = {};
      if (newLogBp.trim()) metadata.bp = newLogBp.trim();
      if (newLogHr.trim()) metadata.hr = Number(newLogHr.trim()) || newLogHr.trim();
      if (newLogTemp.trim()) metadata.temp = newLogTemp.trim();
      if (newLogO2.trim()) metadata.o2 = newLogO2.trim();

      const payload: CreateLogEntryPayload = {
        entry_date: newLogDate,
        entry_type: newLogType,
        content: newLogContent.trim(),
        metadata,
        source: 'manual',
      };

      const res = await AppBridge.api.createPatientLog(activePatient.id, payload);
      if (res && res.log) {
        setLogs((prev) => [res.log, ...prev]);
        setIsNewLogModalOpen(false);
        setNewLogContent('');
        setNewLogBp('');
        setNewLogHr('');
        setNewLogTemp('');
        setNewLogO2('');
        showToast('Clinical observation saved.');
      }
    } catch (err: any) {
      alert(`Error saving observation: ${err.message}`);
    } finally {
      setSubmittingLog(false);
    }
  };

  // Amend Medical Log
  const handleAmendLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amendingLog || !amendContent.trim()) return;

    try {
      const res = await AppBridge.api.updatePatientLog(amendingLog.id, {
        content: amendContent.trim(),
        edit_reason: amendReason.trim(),
      });
      if (res && res.log) {
        setLogs((prev) => prev.map((l) => (l.id === amendingLog.id ? res.log : l)));
        setAmendingLog(null);
        showToast('Clinical log amended with audit version recorded.');
      }
    } catch (err: any) {
      alert(`Error amending log: ${err.message}`);
    }
  };

  // Delete Medical Log
  const handleDeleteLog = async (entryId: string) => {
    if (!window.confirm('Are you sure you want to delete this clinical observation?')) return;
    try {
      await AppBridge.api.deletePatientLog(entryId);
      setLogs((prev) => prev.filter((l) => l.id !== entryId));
      showToast('Observation deleted.');
    } catch (err: any) {
      alert(`Error deleting observation: ${err.message}`);
    }
  };

  if (!activePatient) {
    return (
      <div className="h-full w-full bg-[#F8FAFC] flex flex-col overflow-hidden select-none">
        {/* Top Header */}
        <div className="h-14 border-b border-[#E2E8F0] px-8 flex items-center justify-between bg-white flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-[#2563EB]">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900">Patient Artifacts Studio</h1>
              <p className="text-[11px] text-slate-500">Doctor-curated single source of truth & clinical logs</p>
            </div>
          </div>
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('patients')}
              className="text-xs font-semibold text-[#2563EB] hover:underline cursor-pointer"
            >
              Open Patients Manager →
            </button>
          )}
        </div>

        {/* Content Container */}
        <div className="flex-1 overflow-y-auto p-8 max-w-5xl mx-auto w-full">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-slate-900">Select a Patient Chart to Curate Context</h2>
            <p className="text-xs text-slate-500 mt-1">
              Select a patient below to inspect their doctor-validated context artifact, view historical diffs, and log clinical observations.
            </p>
          </div>

          {/* Search Bar */}
          <div className="relative mb-6">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
              placeholder="Search patients by name, PT-alias, or date of birth..."
              className="w-full text-xs pl-9 pr-4 py-2.5 rounded-xl bg-white border border-[#E2E8F0] focus:outline-none focus:border-[#2563EB] text-slate-900 shadow-sm placeholder-slate-400"
            />
          </div>

          {/* Patient Grid */}
          {filteredPatients.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-12 text-center space-y-3">
              <User className="w-10 h-10 text-slate-300 mx-auto" />
              <div className="text-sm font-semibold text-slate-700">No matching patient records found</div>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                {patientList.length === 0
                  ? "No patients have been registered yet. Add a patient in Patients Manager to start building their clinical artifact."
                  : "Try clearing your search query to see all patients."}
              </p>
              {onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate('patients')}
                  className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-medium cursor-pointer transition-colors shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Register Patient</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredPatients.map((p) => (
                <div
                  key={p.id}
                  onClick={() => onSelectPatient?.(p)}
                  className="bg-white rounded-xl border border-[#E2E8F0] hover:border-[#2563EB] hover:shadow-md p-4 flex flex-col justify-between cursor-pointer transition-all group"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]">
                        {p.llm_alias}
                      </span>
                      <span className="text-[10px] text-emerald-600 font-medium bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        Active
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 group-hover:text-[#2563EB] transition-colors truncate">
                      {p.display_name}
                    </h3>
                    <div className="text-[11px] text-slate-500 mt-1 space-y-0.5">
                      <div>DOB: {p.date_of_birth || 'Not recorded'}</div>
                      <div>{p.gender ? `${p.gender} • ` : ''}{p.blood_group ? `Blood: ${p.blood_group}` : ''}</div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#F1F5F9] flex items-center justify-between text-xs text-[#2563EB] font-semibold group-hover:translate-x-0.5 transition-transform">
                    <span>Open Artifact Studio</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const filteredLogs = logs.filter((l) => {
    if (logTypeFilter === 'all') return true;
    return l.entry_type === logTypeFilter;
  });

  return (
    <div className="h-full w-full bg-white flex overflow-hidden select-none">
      {/* ── Main Artifact Studio ────────────────────────────────────────── */}
      <div className="flex-1 h-full flex flex-col overflow-hidden bg-white">
        {/* Header Bar */}
        <div className="h-14 border-b border-[#E2E8F0] px-8 flex items-center justify-between bg-white flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-[#2563EB] flex-shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-slate-900">{activePatient.display_name}</h1>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]">
                  {activePatient.llm_alias}
                </span>

                {/* Switch Patient Chart Dropdown Button */}
                <div className="relative" ref={switchDropdownRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSwitchDropdownOpen((prev) => !prev);
                      if (!isSwitchDropdownOpen) {
                        loadPatients();
                      }
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded border border-[#E2E8F0] hover:border-[#2563EB]/40 bg-[#F8FAFC] hover:bg-[#EFF6FF] text-[11px] font-medium text-slate-700 hover:text-[#2563EB] transition-colors cursor-pointer"
                    title="Switch to another patient chart"
                  >
                    <span>Switch Chart</span>
                    <ChevronDown className={`w-3 h-3 transition-transform ${isSwitchDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isSwitchDropdownOpen && (
                    <div className="absolute left-0 top-full mt-1.5 w-76 bg-white rounded-xl shadow-xl border border-[#E2E8F0] py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                      <div className="px-3 pb-2 border-b border-[#F1F5F9]">
                        <div className="text-xs font-semibold text-slate-800 mb-1.5">Switch Patient Chart</div>
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={patientSearch}
                            onChange={(e) => setPatientSearch(e.target.value)}
                            placeholder="Filter patients..."
                            className="w-full text-xs pl-8 pr-3 py-1 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] focus:outline-none focus:border-[#2563EB] text-slate-800 placeholder-slate-400"
                            autoFocus
                          />
                        </div>
                      </div>

                      <div className="max-h-56 overflow-y-auto py-1">
                        {filteredPatients.map((p) => {
                          const isSelected = p.id === activePatient.id;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                onSelectPatient?.(p);
                                setIsSwitchDropdownOpen(false);
                              }}
                              className={`w-full px-3 py-2 flex items-center justify-between hover:bg-[#F8FAFC] transition-colors text-left cursor-pointer ${isSelected ? 'bg-blue-50/70 border-l-2 border-[#2563EB]' : ''}`}
                            >
                              <div className="min-w-0 truncate">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-semibold text-slate-900 truncate">{p.display_name}</span>
                                  <span className="px-1 py-0.2 rounded text-[9px] font-mono font-bold bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]">
                                    {p.llm_alias}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  DOB: {p.date_of_birth || 'N/A'}
                                </div>
                              </div>
                              {isSelected && <Check className="w-3.5 h-3.5 text-[#2563EB] flex-shrink-0" />}
                            </button>
                          );
                        })}
                      </div>

                      <div className="pt-1.5 px-3 border-t border-[#F1F5F9] flex items-center justify-between text-[11px]">
                        <button
                          type="button"
                          onClick={() => {
                            setIsSwitchDropdownOpen(false);
                            onSelectPatient?.(null);
                          }}
                          className="text-slate-500 hover:text-slate-800 cursor-pointer"
                        >
                          Show Chart Grid
                        </button>
                        {onNavigate && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsSwitchDropdownOpen(false);
                              onNavigate('patients');
                            }}
                            className="text-[#2563EB] hover:underline font-semibold cursor-pointer"
                          >
                            All Patients →
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <span className="text-[11px] text-slate-500">• Context Artifact v{artifact?.current_version || 1}</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Doctor-curated source of truth. Stored with hardware-bound AES-256-GCM encryption in your local vault.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {toast && (
              <div className="px-3 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium flex items-center gap-1.5 animate-in fade-in">
                <Check className="w-3.5 h-3.5" />
                <span>{toast}</span>
              </div>
            )}

            {activeTab === 'artifact' && (
              <>
                <button
                  onClick={() => handleOpenDiff(Math.max(1, (artifact?.current_version || 1) - 1), artifact?.current_version || 1)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E2E8F0] hover:bg-[#F8FAFC] text-slate-700 text-xs font-semibold cursor-pointer transition-colors"
                  title="Compare latest version diff"
                >
                  <GitCompare className="w-3.5 h-3.5 text-[#2563EB]" />
                  <span>Visual Diff</span>
                </button>

                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                    showHistory
                      ? 'bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]'
                      : 'border-[#E2E8F0] hover:bg-[#F8FAFC] text-slate-700'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  <span>History ({versions.length})</span>
                </button>

                <button
                  onClick={handleSave}
                  disabled={saving || loading}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-xs font-semibold shadow-xs cursor-pointer transition-all active:scale-95"
                >
                  {saving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>Save Snapshot</span>
                </button>
              </>
            )}

            {activeTab === 'logs' && (
              <button
                onClick={() => setIsNewLogModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold shadow-xs cursor-pointer transition-all active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Record Observation</span>
              </button>
            )}

            {activeTab === 'visits' && (
              <div className="flex items-center gap-2">
                {activeVisit ? (
                  <>
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      <span>Encounter In Progress</span>
                    </span>
                    <button
                      onClick={handleCloseVisit}
                      disabled={closingVisit || !visitNotes.trim()}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-xs font-semibold shadow-xs cursor-pointer transition-all active:scale-95"
                    >
                      {closingVisit ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      )}
                      <span>Conclude & Stage Proposals</span>
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setIsStartVisitModalOpen(true)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold shadow-xs cursor-pointer transition-all active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Start Consultation</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Tab Selector */}
        <div className="px-8 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-6 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('artifact')}
              className={`py-2.5 border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'artifact'
                  ? 'border-[#2563EB] text-[#2563EB]'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Living Context Artifact</span>
            </button>

            <button
              onClick={() => setActiveTab('logs')}
              className={`py-2.5 border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'logs'
                  ? 'border-[#2563EB] text-[#2563EB]'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Medical Observations & Logs</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 font-bold">
                {logs.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('visits')}
              className={`py-2.5 border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'visits'
                  ? 'border-[#2563EB] text-[#2563EB]'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Visits & Encounters</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 font-bold">
                {visits.length}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <Shield className="w-3.5 h-3.5 text-emerald-600" />
            <span>AES-256-GCM Encrypted at Rest</span>
          </div>
        </div>

        {/* Content Body */}
        {activeTab === 'artifact' && (
          <div className="flex-1 overflow-y-auto p-8 space-y-6">
            <div className="max-w-4xl mx-auto space-y-6">
              {/* 1. Clinical Summary */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-2xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <FileText className="w-4 h-4 text-[#2563EB]" />
                    <span>Clinical Profile Summary</span>
                  </div>
                  <span className="text-[10px] font-mono uppercase bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                    Physician Care Plan
                  </span>
                </div>
                <textarea
                  rows={3}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="e.g. 58-year-old male with poorly controlled Type 2 Diabetes (HbA1c 8.4%) and essential hypertension. Tolerates metformin well..."
                  className="w-full p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] focus:border-[#2563EB] focus:bg-white text-xs text-slate-900 placeholder:text-slate-400 outline-none resize-none leading-relaxed"
                />
              </div>

              {/* 2. Active Medical Conditions */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <Heart className="w-4 h-4 text-rose-500" />
                    <span>Active Medical Conditions & Diagnoses</span>
                  </div>
                  <span className="text-[11px] text-slate-400">{activeIssues.length} condition(s)</span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {activeIssues.length === 0 ? (
                    <span className="text-xs text-slate-400 italic">No conditions recorded yet.</span>
                  ) : (
                    activeIssues.map((cond, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] text-xs font-semibold text-[#1D4ED8]"
                      >
                        <span>{cond}</span>
                        <button
                          type="button"
                          onClick={() => removeIssue(idx)}
                          className="text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={newIssue}
                    onChange={(e) => setNewIssue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addIssue())}
                    placeholder="e.g. Essential Hypertension, Type 2 Diabetes, Mild Osteoarthritis..."
                    className="flex-1 px-3 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] focus:border-[#2563EB] focus:bg-white text-xs text-slate-900 placeholder:text-slate-400 outline-none"
                  />
                  <button
                    type="button"
                    onClick={addIssue}
                    disabled={!newIssue.trim()}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-40 text-white text-xs font-semibold cursor-pointer shadow-2xs transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Condition</span>
                  </button>
                </div>
              </div>

              {/* 3. Current Medications */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <Pill className="w-4 h-4 text-emerald-600" />
                    <span>Current Medications & Dosages</span>
                  </div>
                  <span className="text-[11px] text-slate-400">{medications.length} active med(s)</span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {medications.length === 0 ? (
                    <span className="text-xs text-slate-400 italic">No medications recorded.</span>
                  ) : (
                    medications.map((med, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800"
                      >
                        <span>{med}</span>
                        <button
                          type="button"
                          onClick={() => removeMed(idx)}
                          className="text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={newMed}
                    onChange={(e) => setNewMed(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addMed())}
                    placeholder="e.g. Metformin 500mg BID, Lisinopril 10mg QD, Atorvastatin 20mg QHS..."
                    className="flex-1 px-3 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] focus:border-[#2563EB] focus:bg-white text-xs text-slate-900 placeholder:text-slate-400 outline-none"
                  />
                  <button
                    type="button"
                    onClick={addMed}
                    disabled={!newMed.trim()}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-40 text-white text-xs font-semibold cursor-pointer shadow-2xs transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Medication</span>
                  </button>
                </div>
              </div>

              {/* 4. Watch-For Items */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <Eye className="w-4 h-4 text-amber-500" />
                    <span>Watch-For Clinical Alerts & In-Flight Inquiries</span>
                  </div>
                  <span className="text-[11px] text-slate-400">{watchFor.length} item(s)</span>
                </div>

                <div className="space-y-1.5">
                  {watchFor.length === 0 ? (
                    <span className="text-xs text-slate-400 italic">No watch-for alerts active.</span>
                  ) : (
                    watchFor.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-xs text-slate-800 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                          <span>{item}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeWatch(idx)}
                          className="text-slate-400 hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={newWatch}
                    onChange={(e) => setNewWatch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addWatch())}
                    placeholder="e.g. Check fasting glucose log, inspect foot sensation, review lipid panel..."
                    className="flex-1 px-3 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] focus:border-[#2563EB] focus:bg-white text-xs text-slate-900 placeholder:text-slate-400 outline-none"
                  />
                  <button
                    type="button"
                    onClick={addWatch}
                    disabled={!newWatch.trim()}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-40 text-white text-xs font-semibold cursor-pointer shadow-2xs transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Watch-For</span>
                  </button>
                </div>
              </div>

              {/* 5. Follow-ups */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                    <Calendar className="w-4 h-4 text-[#2563EB]" />
                    <span>Follow-ups & Due Dates</span>
                  </div>
                  <span className="text-[11px] text-slate-400">{followUps.length} follow-up(s)</span>
                </div>

                <div className="space-y-1.5">
                  {followUps.length === 0 ? (
                    <span className="text-xs text-slate-400 italic">No scheduled follow-ups.</span>
                  ) : (
                    followUps.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-xs text-slate-800 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-[#2563EB]" />
                          <span>{item}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFollowUp(idx)}
                          className="text-slate-400 hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={newFollowUp}
                    onChange={(e) => setNewFollowUp(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addFollowUp())}
                    placeholder="e.g. Recheck HbA1c in 3 months (Jan 2027), Nephrology follow-up..."
                    className="flex-1 px-3 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] focus:border-[#2563EB] focus:bg-white text-xs text-slate-900 placeholder:text-slate-400 outline-none"
                  />
                  <button
                    type="button"
                    onClick={addFollowUp}
                    disabled={!newFollowUp.trim()}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-40 text-white text-xs font-semibold cursor-pointer shadow-2xs transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Follow-up</span>
                  </button>
                </div>
              </div>

              {/* 6. Physician Confidential Notes */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-2xs space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                  <Shield className="w-4 h-4 text-emerald-600" />
                  <span>Physician Private Notes</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Confidential impressions, family history notes, and personal clinical thoughts.
                </p>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Private physician observations..."
                  className="w-full p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] focus:border-[#2563EB] focus:bg-white text-xs text-slate-900 placeholder:text-slate-400 outline-none resize-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Medical Observations & Logs Tab ────────────────────────────── */}
        {activeTab === 'logs' && (
          <div className="flex-1 overflow-y-auto p-8 space-y-5 bg-slate-50/50">
            <div className="max-w-4xl mx-auto space-y-4">
              {/* Filter Row */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center bg-white border border-[#E2E8F0] rounded-lg p-0.5 text-xs">
                  <button
                    onClick={() => setLogTypeFilter('all')}
                    className={`px-3 py-1 rounded-md transition-all font-medium ${
                      logTypeFilter === 'all'
                        ? 'bg-[#2563EB] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All ({logs.length})
                  </button>
                  <button
                    onClick={() => setLogTypeFilter('vitals')}
                    className={`px-3 py-1 rounded-md transition-all font-medium ${
                      logTypeFilter === 'vitals'
                        ? 'bg-[#2563EB] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Vitals
                  </button>
                  <button
                    onClick={() => setLogTypeFilter('observation')}
                    className={`px-3 py-1 rounded-md transition-all font-medium ${
                      logTypeFilter === 'observation'
                        ? 'bg-[#2563EB] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Observations
                  </button>
                  <button
                    onClick={() => setLogTypeFilter('medication_change')}
                    className={`px-3 py-1 rounded-md transition-all font-medium ${
                      logTypeFilter === 'medication_change'
                        ? 'bg-[#2563EB] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Med Changes
                  </button>
                  <button
                    onClick={() => setLogTypeFilter('lab_note')}
                    className={`px-3 py-1 rounded-md transition-all font-medium ${
                      logTypeFilter === 'lab_note'
                        ? 'bg-[#2563EB] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Lab Notes
                  </button>
                </div>

                <span className="text-xs text-slate-500">
                  Showing <span className="font-bold text-slate-900">{filteredLogs.length}</span> clinical entries
                </span>
              </div>

              {/* Log Entries List */}
              {filteredLogs.length === 0 ? (
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-12 text-center">
                  <Activity className="w-8 h-8 text-blue-600 mx-auto mb-2 opacity-50" />
                  <h3 className="text-xs font-bold text-slate-800">No medical log entries recorded</h3>
                  <p className="text-[11px] text-slate-500 max-w-sm mx-auto mt-1 mb-4">
                    Observations recorded during consults or entered manually are stored with an immutable revision trail.
                  </p>
                  <button
                    onClick={() => setIsNewLogModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Record First Observation</span>
                  </button>
                </div>
              ) : (
                filteredLogs.map((log) => {
                  const hasRevisions = (log.versions_count || 0) > 0;
                  const isExpanded = expandedLogId === log.id;

                  return (
                    <div
                      key={log.id}
                      className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs space-y-3 hover:border-blue-200 transition-all"
                    >
                      {/* Top Meta */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-blue-600" />
                            <span>{log.entry_date}</span>
                          </span>

                          <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            {log.entry_type.replace('_', ' ')}
                          </span>

                          {hasRevisions && (
                            <button
                              onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                              className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 flex items-center gap-1 hover:bg-amber-100 transition-colors"
                            >
                              <History className="w-2.5 h-2.5" />
                              <span>Amended {log.versions_count}x</span>
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setAmendingLog(log);
                              setAmendContent(log.content);
                            }}
                            className="p-1 rounded text-slate-400 hover:text-blue-600 transition-colors"
                            title="Amend clinical note"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteLog(log.id)}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 transition-colors"
                            title="Delete log entry"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Content */}
                      <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
                        {log.content}
                      </p>

                      {/* Vitals Pills if present */}
                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap pt-1">
                          {log.metadata.bp && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200 font-bold">
                              <Heart className="w-3 h-3 text-rose-500" />
                              <span>BP: {log.metadata.bp}</span>
                            </span>
                          )}
                          {log.metadata.hr && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200 font-bold">
                              <Activity className="w-3 h-3 text-rose-500" />
                              <span>HR: {log.metadata.hr} bpm</span>
                            </span>
                          )}
                          {log.metadata.temp && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-bold">
                              <Thermometer className="w-3 h-3 text-amber-500" />
                              <span>Temp: {log.metadata.temp}°F</span>
                            </span>
                          )}
                          {log.metadata.o2 && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 font-bold">
                              <Droplet className="w-3 h-3 text-blue-500" />
                              <span>SpO2: {log.metadata.o2}%</span>
                            </span>
                          )}
                        </div>
                      )}

                      {/* Expanded Revision History */}
                      {isExpanded && log.versions && log.versions.length > 0 && (
                        <div className="pt-3 border-t border-slate-100 space-y-2 bg-slate-50/70 p-3 rounded-lg text-xs">
                          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">
                            Audit Trail: Prior Revisions
                          </span>
                          {log.versions.map((ver, vIdx) => (
                            <div key={vIdx} className="p-2.5 rounded bg-white border border-[#E2E8F0] space-y-1">
                              <div className="flex items-center justify-between text-[10px] text-slate-400">
                                <span className="font-semibold text-slate-600">Revision #{vIdx + 1}</span>
                                <span>{new Date(ver.edited_at).toLocaleString()}</span>
                              </div>
                              <p className="text-[11px] text-slate-700 italic">"{ver.previous_content}"</p>
                              {ver.edit_reason && (
                                <p className="text-[10px] text-amber-800">
                                  <span className="font-semibold">Reason:</span> {ver.edit_reason}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ── Consultation Visits & Auto-Proposal Lifecycle (Milestone 5) ── */}
        {activeTab === 'visits' && (
          <div className="flex-1 overflow-y-auto p-8 space-y-6 bg-slate-50/50">
            <div className="max-w-4xl mx-auto space-y-6">

              {/* 1. Staged Proposals Ready for Sign-off */}
              {stagedProposals.length > 0 && (
                <div className="bg-white border-2 border-[#2563EB] rounded-xl p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[#2563EB]" />
                      <h3 className="text-xs font-bold text-slate-900">
                        Physician Sign-Off Required ({stagedProposals.length} Proposal{stagedProposals.length > 1 ? 's' : ''})
                      </h3>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-bold uppercase">
                      Safety Gate Active
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">
                    The Consultation Synthesizer analyzed your clinical notes and staged the following safe updates. Confirm to commit directly to the patient's records.
                  </p>

                  <div className="space-y-3">
                    {stagedProposals.map((prop) => (
                      <div
                        key={prop.id}
                        className="p-4 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                              {prop.proposal_type.replace('_', ' ')}
                            </span>
                            <span className="text-xs font-bold text-slate-900">
                              {prop.payload?.title || prop.rationale}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleRejectStagedProposal(prop.id)}
                              className="px-2.5 py-1 rounded bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold cursor-pointer"
                            >
                              Reject
                            </button>
                            <button
                              onClick={() => handleApproveStagedProposal(prop.id)}
                              className="flex items-center gap-1 px-3 py-1 rounded bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold shadow-xs cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Approve & Commit</span>
                            </button>
                          </div>
                        </div>

                        {prop.diff && Object.keys(prop.diff).length > 0 && (
                          <div className="text-[11px] font-mono bg-white p-2.5 rounded border border-[#E2E8F0] space-y-1">
                            {prop.diff.added && Array.isArray(prop.diff.added) && prop.diff.added.map((item: any, i: number) => (
                              <div key={i} className="text-emerald-700 flex items-center gap-1">
                                <span className="font-bold">+</span>
                                <span>{typeof item === 'string' ? item : JSON.stringify(item)}</span>
                              </div>
                            ))}
                            {prop.diff.removed && Array.isArray(prop.diff.removed) && prop.diff.removed.map((item: any, i: number) => (
                              <div key={i} className="text-rose-700 flex items-center gap-1">
                                <span className="font-bold">-</span>
                                <span>{typeof item === 'string' ? item : JSON.stringify(item)}</span>
                              </div>
                            ))}
                            {prop.diff.proposed_ticket && (
                              <div className="text-blue-700 flex items-center gap-1">
                                <span className="font-bold">→ Ticket:</span>
                                <span>{prop.diff.proposed_ticket}</span>
                                {prop.diff.due_date && <span className="text-slate-500">(Due: {prop.diff.due_date})</span>}
                              </div>
                            )}
                          </div>
                        )}
                        <p className="text-[11px] text-slate-500 italic">
                          Rationale: {prop.rationale}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 2. Active Consultation Encounter */}
              {activeVisit ? (
                <div className="bg-white border-2 border-blue-500 rounded-xl p-6 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center">
                        <Activity className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-sm font-bold text-slate-900">Active Consultation Encounter</h2>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 font-bold uppercase">
                            Open
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">
                          Started: {new Date(activeVisit.visit_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Reason: <strong className="text-slate-800">{activeVisit.reason}</strong>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Vitals Input Row */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Encounter Vitals
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <span className="block text-[11px] text-slate-500 mb-1">Blood Pressure</span>
                        <input
                          type="text"
                          value={visitBp}
                          onChange={(e) => setVisitBp(e.target.value)}
                          placeholder="e.g. 138/86"
                          className="w-full px-3 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] focus:border-[#2563EB] focus:bg-white text-xs text-slate-900 outline-none font-mono"
                        />
                      </div>
                      <div>
                        <span className="block text-[11px] text-slate-500 mb-1">Heart Rate (bpm)</span>
                        <input
                          type="text"
                          value={visitHr}
                          onChange={(e) => setVisitHr(e.target.value)}
                          placeholder="e.g. 74"
                          className="w-full px-3 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] focus:border-[#2563EB] focus:bg-white text-xs text-slate-900 outline-none font-mono"
                        />
                      </div>
                      <div>
                        <span className="block text-[11px] text-slate-500 mb-1">Body Temp (°F)</span>
                        <input
                          type="text"
                          value={visitTemp}
                          onChange={(e) => setVisitTemp(e.target.value)}
                          placeholder="e.g. 98.6"
                          className="w-full px-3 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] focus:border-[#2563EB] focus:bg-white text-xs text-slate-900 outline-none font-mono"
                        />
                      </div>
                      <div>
                        <span className="block text-[11px] text-slate-500 mb-1">SpO2 (%)</span>
                        <input
                          type="text"
                          value={visitO2}
                          onChange={(e) => setVisitO2(e.target.value)}
                          placeholder="e.g. 99"
                          className="w-full px-3 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] focus:border-[#2563EB] focus:bg-white text-xs text-slate-900 outline-none font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Doctor's Consultation Notes */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-slate-700">
                        Doctor's Clinical Encounter Notes & Dictation
                      </label>
                      <span className="text-[10px] text-blue-600 font-medium">
                        Drug modifications and lab mentions will auto-formulate proposals
                      </span>
                    </div>
                    <textarea
                      rows={6}
                      value={visitNotes}
                      onChange={(e) => setVisitNotes(e.target.value)}
                      placeholder="Enter clinical examination notes, patient feedback, dosage adjustments, and follow-up orders...&#10;&#10;Example: 'Patient presented for glycemic review. BP today 138/86. Increased Metformin to 1000mg BID. Order 3-month HbA1c lab and follow-up.'"
                      className="w-full p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] focus:border-[#2563EB] focus:bg-white text-xs text-slate-900 outline-none resize-none leading-relaxed"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[#E2E8F0]">
                    <span className="text-[11px] text-slate-500 flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Doctor notes are AES-256-GCM encrypted upon closure.</span>
                    </span>

                    <button
                      type="button"
                      onClick={handleCloseVisit}
                      disabled={closingVisit || !visitNotes.trim()}
                      className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-xs font-semibold shadow-xs cursor-pointer transition-all active:scale-95"
                    >
                      {closingVisit ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      )}
                      <span>Conclude Encounter & Stage Proposals</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center space-y-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center mx-auto">
                    <Activity className="w-5 h-5" />
                  </div>
                  <h3 className="text-xs font-bold text-slate-900">No active consultation encounter in progress</h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Start a consultation encounter to document patient vitals, dictation notes, and auto-generate safe chart proposals.
                  </p>
                  <button
                    onClick={() => setIsStartVisitModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold shadow-xs cursor-pointer transition-all active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Start Consultation Visit</span>
                  </button>
                </div>
              )}

              {/* 3. Prior Consultation Encounters */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-900">
                    Past Clinical Consultations ({visits.length})
                  </h3>
                  <span className="text-[11px] text-slate-500">
                    Encrypted vault history
                  </span>
                </div>

                {visits.length === 0 ? (
                  <div className="bg-white border border-dashed border-[#E2E8F0] rounded-xl p-6 text-center text-xs text-slate-500">
                    No previous consultations recorded for this patient.
                  </div>
                ) : (
                  visits.map((v) => {
                    const isExpanded = expandedVisitId === v.id;
                    return (
                      <div
                        key={v.id}
                        className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs space-y-2 hover:border-blue-200 transition-all"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-blue-600" />
                              <span>{new Date(v.visit_date).toLocaleDateString()}</span>
                            </span>
                            <span className="text-xs text-slate-600">• {v.reason}</span>
                            <span
                              className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full font-bold border ${
                                v.status === 'completed'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-amber-50 text-amber-800 border-amber-200'
                              }`}
                            >
                              {v.status}
                            </span>
                          </div>

                          <button
                            onClick={() => setExpandedVisitId(isExpanded ? null : v.id)}
                            className="text-xs text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
                          >
                            {isExpanded ? 'Hide Notes' : 'View Notes'}
                          </button>
                        </div>

                        {v.outcome_summary && (
                          <p className="text-xs text-slate-600">{v.outcome_summary}</p>
                        )}

                        {isExpanded && v.doctor_notes && (
                          <div className="pt-2 border-t border-[#E2E8F0] space-y-1 bg-[#F8FAFC] p-3 rounded-lg text-xs">
                            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">
                              Decrypted Physician Notes
                            </span>
                            <p className="text-slate-800 whitespace-pre-wrap leading-relaxed">
                              {v.doctor_notes}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

            </div>
          </div>
        )}
      </div>

      {/* ── Version History Drawer ──────────────────────────────────────── */}
      {showHistory && (
        <div className="w-84 h-full border-l border-[#E2E8F0] bg-[#F8FAFC] flex flex-col animate-slideInRight shadow-lg">
          <div className="h-14 px-4 border-b border-[#E2E8F0] flex items-center justify-between bg-white">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
              <History className="w-4 h-4 text-[#2563EB]" />
              <span>Immutable Version Snapshots</span>
            </div>
            <button
              onClick={() => setShowHistory(false)}
              className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer font-medium"
            >
              Close
            </button>
          </div>

          <div className="p-3 bg-white border-b border-[#E2E8F0]">
            <button
              onClick={() => handleOpenDiff(Math.max(1, (artifact?.current_version || 1) - 1), artifact?.current_version || 1)}
              className="w-full py-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 border border-blue-200"
            >
              <GitCompare className="w-3.5 h-3.5" />
              <span>Open Visual Diff Viewer</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {versions.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                No past revisions recorded.
              </div>
            ) : (
              versions.map((ver) => {
                const isCurrent = ver.version_num === (artifact?.current_version || 1);

                return (
                  <div
                    key={ver.id}
                    className={`p-3.5 rounded-xl bg-white border shadow-2xs space-y-2 transition-all ${
                      isCurrent ? 'border-blue-300 ring-1 ring-blue-100' : 'border-[#E2E8F0]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-900">Version v{ver.version_num}</span>
                        {isCurrent && (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-blue-600 text-white">
                            Current
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-semibold text-[#1D4ED8] bg-[#EFF6FF] px-1.5 py-0.5 rounded border border-[#BFDBFE]">
                        {ver.author_type === 'doctor_manual' ? 'Doctor' : 'Approved Update'}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-600 leading-snug">{ver.change_summary}</div>
                    <div className="text-[10px] text-slate-400">
                      {new Date(ver.created_at).toLocaleString()}
                    </div>

                    {/* Actions */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                      <button
                        onClick={() => handleOpenDiff(ver.version_num, artifact?.current_version || 1)}
                        className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1"
                      >
                        <GitCompare className="w-3 h-3" />
                        <span>Diff vs Current</span>
                      </button>

                      {!isCurrent && (
                        <button
                          onClick={() => handleRestoreVersion(ver.version_num)}
                          className="text-[11px] text-slate-600 hover:text-slate-900 font-semibold flex items-center gap-1 hover:bg-slate-100 px-1.5 py-0.5 rounded transition-colors"
                        >
                          <RotateCcw className="w-3 h-3 text-slate-500" />
                          <span>Restore</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ── Visual Diff Modal ────────────────────────────────────────────── */}
      <ArtifactDiffModal
        isOpen={isDiffModalOpen}
        onClose={() => setIsDiffModalOpen(false)}
        patientId={activePatient.id}
        patientAlias={activePatient.llm_alias}
        versions={versions}
        currentVersion={artifact?.current_version || 1}
        initialV1={diffV1}
        initialV2={diffV2}
        onRestoreVersion={handleRestoreVersion}
      />

      {/* ── Record Observation Modal ────────────────────────────────────── */}
      {isNewLogModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setIsNewLogModalOpen(false)}
        >
          <div
            className="bg-white border border-[#E2E8F0] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Record Clinical Observation</h2>
                  <p className="text-[11px] text-slate-500">Dated entry for {activePatient.display_name} ({activePatient.llm_alias})</p>
                </div>
              </div>
              <button
                onClick={() => setIsNewLogModalOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateLog} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Observation Date</label>
                  <input
                    type="date"
                    required
                    value={newLogDate}
                    onChange={(e) => setNewLogDate(e.target.value)}
                    className="w-full bg-white border border-[#E2E8F0] rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Entry Category</label>
                  <select
                    value={newLogType}
                    onChange={(e) => setNewLogType(e.target.value)}
                    className="w-full bg-white border border-[#E2E8F0] rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                  >
                    <option value="observation">Clinical Observation</option>
                    <option value="vitals">Vital Signs</option>
                    <option value="medication_change">Medication Adjustment</option>
                    <option value="lab_note">Lab / Pathology Note</option>
                    <option value="symptom">Reported Symptom</option>
                  </select>
                </div>
              </div>

              {/* Vitals inputs */}
              {newLogType === 'vitals' && (
                <div className="p-3 rounded-xl bg-slate-50 border border-[#E2E8F0] space-y-2">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Vitals Capture</span>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-500">Blood Pressure (mmHg)</span>
                      <input
                        type="text"
                        placeholder="120/80"
                        value={newLogBp}
                        onChange={(e) => setNewLogBp(e.target.value)}
                        className="w-full bg-white border border-[#E2E8F0] rounded px-2 py-1 text-xs text-slate-900"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500">Heart Rate (bpm)</span>
                      <input
                        type="text"
                        placeholder="72"
                        value={newLogHr}
                        onChange={(e) => setNewLogHr(e.target.value)}
                        className="w-full bg-white border border-[#E2E8F0] rounded px-2 py-1 text-xs text-slate-900"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500">Temperature (°F)</span>
                      <input
                        type="text"
                        placeholder="98.6"
                        value={newLogTemp}
                        onChange={(e) => setNewLogTemp(e.target.value)}
                        className="w-full bg-white border border-[#E2E8F0] rounded px-2 py-1 text-xs text-slate-900"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500">Pulse Ox / O2 (%)</span>
                      <input
                        type="text"
                        placeholder="99"
                        value={newLogO2}
                        onChange={(e) => setNewLogO2(e.target.value)}
                        className="w-full bg-white border border-[#E2E8F0] rounded px-2 py-1 text-xs text-slate-900"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Clinical Notes & Findings <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={4}
                  required
                  value={newLogContent}
                  onChange={(e) => setNewLogContent(e.target.value)}
                  placeholder="Record objective observations, patient symptom reports, or lab value interpretations..."
                  className="w-full p-3 bg-white border border-[#E2E8F0] rounded-lg text-xs text-slate-900 focus:outline-none focus:border-blue-500 resize-none leading-relaxed"
                />
              </div>

              <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewLogModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingLog || !newLogContent.trim()}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs transition-all shadow-xs"
                >
                  {submittingLog ? 'Saving...' : 'Save Observation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Amend Observation Modal ────────────────────────────────────── */}
      {amendingLog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setAmendingLog(null)}
        >
          <div
            className="bg-white border border-[#E2E8F0] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-blue-600" />
                <h2 className="text-sm font-bold text-slate-900">Amend Clinical Log Entry</h2>
              </div>
              <button onClick={() => setAmendingLog(null)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAmendLog} className="p-5 space-y-4">
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-xs text-amber-900">
                <span className="font-bold block mb-0.5">Medical Audit Compliance</span>
                The previous wording is archived into the immutable log version history.
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Amended Content</label>
                <textarea
                  rows={4}
                  required
                  value={amendContent}
                  onChange={(e) => setAmendContent(e.target.value)}
                  className="w-full p-3 bg-white border border-[#E2E8F0] rounded-lg text-xs text-slate-900 focus:outline-none focus:border-blue-500 resize-none leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Amendment Reason (Audit Log)
                </label>
                <input
                  type="text"
                  required
                  value={amendReason}
                  onChange={(e) => setAmendReason(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-[#E2E8F0] rounded-lg text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAmendingLog(null)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!amendContent.trim()}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs"
                >
                  Save Amendment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Start Consultation Encounter Modal (Milestone 5) ───────────── */}
      {isStartVisitModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setIsStartVisitModalOpen(false)}
        >
          <div
            className="bg-white border border-[#E2E8F0] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#2563EB]" />
                <h2 className="text-sm font-bold text-slate-900">Start Consultation Visit</h2>
              </div>
              <button
                onClick={() => setIsStartVisitModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleStartVisit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Patient Alias
                </label>
                <div className="px-3 py-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-xs font-mono font-bold text-slate-900">
                  {activePatient.llm_alias} ({activePatient.display_name})
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reason for Consultation Encounter
                </label>
                <input
                  type="text"
                  required
                  value={visitReason}
                  onChange={(e) => setVisitReason(e.target.value)}
                  placeholder="e.g. Type 2 Diabetes Glycemic Follow-up, Routine Checkup..."
                  className="w-full px-3 py-2 rounded-lg bg-white border border-[#E2E8F0] focus:border-[#2563EB] text-xs text-slate-900 outline-none"
                />
              </div>

              <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsStartVisitModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!visitReason.trim()}
                  className="px-5 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-semibold text-xs shadow-xs cursor-pointer"
                >
                  Begin Encounter
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocsView;
