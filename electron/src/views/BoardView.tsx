import React, { useState, useEffect, useMemo } from 'react';
import {
  Kanban,
  Plus,
  Search,
  Filter,
  Calendar,
  AlertCircle,
  Clock,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Trash2,
  User,
  Activity,
  FileCheck,
  ChevronDown,
  X,
  Stethoscope,
} from 'lucide-react';
import type { Task, TaskPriority, Patient } from '../types';
import AppBridge from '../services/bridge';

interface ColumnDef {
  id: string;
  title: string;
  subtitle: string;
  colorClass: string;
  badgeBg: string;
}

const COLUMNS: ColumnDef[] = [
  {
    id: 'todo',
    title: 'To Do / Ordered',
    subtitle: 'Pending lab orders, referrals & chart review',
    colorClass: 'text-blue-700',
    badgeBg: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    id: 'in_progress',
    title: 'In Progress',
    subtitle: 'Specimen in lab or appointment pending',
    colorClass: 'text-amber-700',
    badgeBg: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  {
    id: 'review',
    title: 'Under Review',
    subtitle: 'Results returned awaiting physician sign-off',
    colorClass: 'text-purple-700',
    badgeBg: 'bg-purple-50 text-purple-700 border-purple-200',
  },
  {
    id: 'done',
    title: 'Completed',
    subtitle: 'Medication reconciled & consult signed off',
    colorClass: 'text-emerald-700',
    badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
];

interface BoardViewProps {
  selectedProjectId?: number | null;
  onProjectChange?: (id: number | null) => void;
  activePatient?: Patient | null;
}

export const BoardView: React.FC<BoardViewProps> = ({ activePatient }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPriority, setSelectedPriority] = useState<string>('all');
  const [selectedPatientFilter, setSelectedPatientFilter] = useState<string>('all');
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);

  // New ticket form state
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newPriority, setNewPriority] = useState<TaskPriority>('med');
  const [newStatus, setNewStatus] = useState<string>('todo');
  const [newDueDate, setNewDueDate] = useState('');
  const [newPatientAlias, setNewPatientAlias] = useState('');
  const [newCategory, setNewCategory] = useState('Lab Order');
  const [submitting, setSubmitting] = useState(false);

  // Load tasks & patients on mount
  const fetchBoardData = async () => {
    try {
      setLoading(true);
      const [taskRes, patientRes] = await Promise.all([
        AppBridge.api.getTasks(),
        AppBridge.api.listPatients({ limit: 50 }).catch(() => ({ patients: [] })),
      ]);

      if (taskRes && Array.isArray(taskRes.tasks)) {
        setTasks(taskRes.tasks);
      }
      if (patientRes && Array.isArray(patientRes.patients)) {
        setPatients(patientRes.patients);
      }
    } catch (err) {
      console.error('Failed to load board data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBoardData();
  }, []);

  // Update task status (move across columns)
  const handleMoveTask = async (task: Task, direction: 'prev' | 'next') => {
    const colOrder = ['todo', 'in_progress', 'review', 'done'];
    const currentIndex = colOrder.indexOf(task.status);
    if (currentIndex === -1) return;

    const newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    if (newIndex < 0 || newIndex >= colOrder.length) return;

    const targetStatus = colOrder[newIndex];

    // Optimistic UI update
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: targetStatus } : t))
    );

    try {
      await AppBridge.api.updateTask(task.id, { status: targetStatus });
    } catch (err) {
      console.error('Failed to move task:', err);
      // Revert on error
      fetchBoardData();
    }
  };

  // Delete task
  const handleDeleteTask = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this clinical ticket?')) return;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      await AppBridge.api.deleteTask(id);
    } catch (err) {
      console.error('Failed to delete task:', err);
      fetchBoardData();
    }
  };

  // Create new task
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setSubmitting(true);
    try {
      const descFormatted = [
        newCategory ? `[Category: ${newCategory}]` : '',
        newPatientAlias ? `[Patient: ${newPatientAlias}]` : '',
        newDescription.trim(),
      ]
        .filter(Boolean)
        .join('\n\n');

      const created = await AppBridge.api.createTask({
        title: newTitle.trim(),
        description: descFormatted,
        priority: newPriority,
        status: newStatus,
        due_date: newDueDate || undefined,
        ticket_type: newCategory,
        assignee: newPatientAlias || undefined,
      });

      if (created) {
        setTasks((prev) => [created, ...prev]);
      }

      // Reset form
      setNewTitle('');
      setNewDescription('');
      setNewPriority('med');
      setNewStatus('todo');
      setNewDueDate('');
      setNewPatientAlias('');
      setNewCategory('Lab Order');
      setIsNewModalOpen(false);
    } catch (err) {
      console.error('Failed to create clinical ticket:', err);
      alert('Could not save clinical ticket. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      // Query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = task.title.toLowerCase().includes(q);
        const matchDesc = (task.description || '').toLowerCase().includes(q);
        const matchAssignee = (task.assignee || '').toLowerCase().includes(q);
        if (!matchTitle && !matchDesc && !matchAssignee) return false;
      }

      // Priority filter
      if (selectedPriority !== 'all') {
        const p = task.priority?.toLowerCase();
        if (selectedPriority === 'urgent' && p !== 'urgent' && p !== 'critical') return false;
        if (selectedPriority === 'high' && p !== 'high') return false;
        if (selectedPriority === 'med' && p !== 'med' && p !== 'medium') return false;
        if (selectedPriority === 'low' && p !== 'low') return false;
      }

      // Patient filter
      if (selectedPatientFilter !== 'all') {
        const containsAlias = (task.description || '').includes(selectedPatientFilter) ||
          task.assignee === selectedPatientFilter;
        if (!containsAlias) return false;
      }

      return true;
    });
  }, [tasks, searchQuery, selectedPriority, selectedPatientFilter]);

  // Group by status
  const tasksByColumn = useMemo(() => {
    const map: Record<string, Task[]> = {
      todo: [],
      in_progress: [],
      review: [],
      done: [],
    };

    filteredTasks.forEach((t) => {
      const statusKey = t.status in map ? t.status : 'todo';
      map[statusKey].push(t);
    });

    return map;
  }, [filteredTasks]);

  // Priority badge styling
  const renderPriorityBadge = (priority: string = 'med') => {
    const p = priority.toLowerCase();
    if (p === 'urgent' || p === 'critical') {
      return (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
          <AlertCircle className="w-2.5 h-2.5" />
          <span>Critical</span>
        </span>
      );
    }
    if (p === 'high') {
      return (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
          High
        </span>
      );
    }
    if (p === 'low') {
      return (
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
          Low
        </span>
      );
    }
    return (
      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
        Medium
      </span>
    );
  };

  // Extract patient alias from task
  const extractPatientAlias = (task: Task) => {
    if (task.assignee && task.assignee.startsWith('PT-')) return task.assignee;
    const match = (task.description || '').match(/\bPT-\d{4}\b/);
    return match ? match[0] : null;
  };

  return (
    <div className="h-full w-full bg-white flex flex-col overflow-hidden select-none">
      {/* Top Header Bar */}
      <div className="h-14 border-b border-[#E2E8F0] px-6 bg-white flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-xs">
            <Kanban className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-slate-900">Clinical Follow-ups & Action Board</h1>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                {tasks.length} total
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Visual Kanban workflow for lab orders, specialist referrals, and chart reviews
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsNewModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Action Item</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="px-6 py-2.5 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between gap-4 flex-wrap flex-shrink-0">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tickets, actions, or PT-XXXX alias..."
            className="w-full bg-white border border-[#E2E8F0] rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors shadow-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Priority filter */}
          <div className="flex items-center gap-1 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedPriority}
              onChange={(e) => setSelectedPriority(e.target.value)}
              className="bg-white border border-[#E2E8F0] rounded-md px-2 py-1 text-xs text-slate-700 font-medium focus:outline-none focus:border-blue-500 shadow-xs"
            >
              <option value="all">All Priorities</option>
              <option value="urgent">Critical / Urgent</option>
              <option value="high">High</option>
              <option value="med">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          {/* Patient filter */}
          {patients.length > 0 && (
            <select
              value={selectedPatientFilter}
              onChange={(e) => setSelectedPatientFilter(e.target.value)}
              className="bg-white border border-[#E2E8F0] rounded-md px-2 py-1 text-xs text-slate-700 font-medium focus:outline-none focus:border-blue-500 shadow-xs"
            >
              <option value="all">All Patients</option>
              {patients.map((p) => (
                <option key={p.id} value={p.llm_alias}>
                  {p.display_name} ({p.llm_alias})
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Kanban Board Canvas */}
      <div className="flex-1 overflow-x-auto p-6 bg-slate-50/50">
        <div className="grid grid-cols-4 gap-4 h-full min-w-[960px]">
          {COLUMNS.map((col) => {
            const colTasks = tasksByColumn[col.id] || [];

            return (
              <div
                key={col.id}
                className="flex flex-col bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl h-full overflow-hidden shadow-xs"
              >
                {/* Column Header */}
                <div className="p-3.5 border-b border-[#E2E8F0] bg-white flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xs font-bold text-slate-900">{col.title}</h2>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold border ${col.badgeBg}`}>
                        {colTasks.length}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{col.subtitle}</p>
                  </div>

                  <button
                    onClick={() => {
                      setNewStatus(col.id);
                      setIsNewModalOpen(true);
                    }}
                    className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-blue-600 transition-colors"
                    title={`Add ticket to ${col.title}`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Cards Container */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                  {colTasks.length === 0 ? (
                    <div className="h-32 border-2 border-dashed border-[#E2E8F0] rounded-lg flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                      <FileCheck className="w-5 h-5 text-slate-300 mb-1" />
                      <span className="text-[11px] font-medium text-slate-400">No items in this stage</span>
                    </div>
                  ) : (
                    colTasks.map((task) => {
                      const patientAlias = extractPatientAlias(task);

                      return (
                        <div
                          key={task.id}
                          className="bg-white border border-[#E2E8F0] rounded-xl p-3 shadow-xs hover:shadow-md hover:border-blue-200 transition-all flex flex-col gap-2.5 group"
                        >
                          {/* Card Header Tags */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {renderPriorityBadge(task.priority)}
                              {patientAlias && (
                                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
                                  <User className="w-2.5 h-2.5" />
                                  <span>{patientAlias}</span>
                                </span>
                              )}
                              {task.ticket_type && (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                  {task.ticket_type}
                                </span>
                              )}
                            </div>

                            <button
                              onClick={() => handleDeleteTask(task.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 transition-all"
                              title="Delete ticket"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>

                          {/* Card Title */}
                          <h3 className="text-xs font-bold text-slate-900 leading-snug">
                            {task.title}
                          </h3>

                          {/* Card Description */}
                          {task.description && (
                            <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">
                              {task.description.replace(/\[Category: [^\]]+\]/g, '').replace(/\[Patient: [^\]]+\]/g, '').trim()}
                            </p>
                          )}

                          {/* Card Footer */}
                          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                            <div className="flex items-center gap-1">
                              {task.due_date ? (
                                <span className="flex items-center gap-1 text-slate-500 font-mono">
                                  <Clock className="w-3 h-3 text-slate-400" />
                                  <span>Due: {task.due_date}</span>
                                </span>
                              ) : (
                                <span className="font-mono text-slate-400">#{task.id}</span>
                              )}
                            </div>

                            {/* Column Navigation Arrows */}
                            <div className="flex items-center gap-1">
                              {col.id !== 'todo' && (
                                <button
                                  onClick={() => handleMoveTask(task, 'prev')}
                                  className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors"
                                  title="Move to previous column"
                                >
                                  <ArrowLeft className="w-3 h-3" />
                                </button>
                              )}
                              {col.id !== 'done' && (
                                <button
                                  onClick={() => handleMoveTask(task, 'next')}
                                  className="p-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors"
                                  title="Advance to next column"
                                >
                                  <ArrowRight className="w-3 h-3" />
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
            );
          })}
        </div>
      </div>

      {/* New Action Item Modal */}
      {isNewModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setIsNewModalOpen(false)}
        >
          <div
            className="bg-white border border-[#E2E8F0] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Create Clinical Action Item</h2>
                  <p className="text-[11px] text-slate-500">Track doctor action items, lab orders, or referrals</p>
                </div>
              </div>
              <button
                onClick={() => setIsNewModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateTask} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ticket Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Order Comprehensive Metabolic Panel & Lipid Profile"
                  className="w-full bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 transition-colors shadow-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full bg-white border border-[#E2E8F0] rounded-lg px-2.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 shadow-xs"
                  >
                    <option value="Lab Order">Lab Order</option>
                    <option value="Medication Reconciliation">Medication Reconciliation</option>
                    <option value="Specialist Referral">Specialist Referral</option>
                    <option value="MD Chart Review">MD Chart Review</option>
                    <option value="Patient Recall / Follow-up">Patient Recall / Follow-up</option>
                    <option value="Diagnostic Imaging">Diagnostic Imaging</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Target Stage</label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    className="w-full bg-white border border-[#E2E8F0] rounded-lg px-2.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 shadow-xs"
                  >
                    <option value="todo">To Do / Ordered</option>
                    <option value="in_progress">In Progress</option>
                    <option value="review">Under Review</option>
                    <option value="done">Completed</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Priority Level</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
                    className="w-full bg-white border border-[#E2E8F0] rounded-lg px-2.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 shadow-xs"
                  >
                    <option value="urgent">Critical / Urgent</option>
                    <option value="high">High Priority</option>
                    <option value="med">Medium Priority</option>
                    <option value="low">Low / Routine</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Associated Patient</label>
                  <select
                    value={newPatientAlias}
                    onChange={(e) => setNewPatientAlias(e.target.value)}
                    className="w-full bg-white border border-[#E2E8F0] rounded-lg px-2.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 shadow-xs"
                  >
                    <option value="">None / General</option>
                    {patients.map((p) => (
                      <option key={p.id} value={p.llm_alias}>
                        {p.display_name} ({p.llm_alias})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target Due Date</label>
                <input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  className="w-full bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 transition-colors shadow-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Clinical Instructions / Notes
                </label>
                <textarea
                  rows={3}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Specific instructions, fasting status, or referral questions..."
                  className="w-full bg-white border border-[#E2E8F0] rounded-lg p-3 text-xs text-slate-900 focus:outline-none focus:border-blue-500 transition-colors shadow-xs resize-none"
                />
              </div>

              {/* Footer */}
              <div className="pt-3 border-t border-[#E2E8F0] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !newTitle.trim()}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs tracking-wide transition-all shadow-sm active:scale-95 flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{submitting ? 'Creating...' : 'Create Ticket'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BoardView;
