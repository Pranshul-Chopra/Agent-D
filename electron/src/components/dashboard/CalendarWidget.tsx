import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  Plus,
  CheckCircle2,
  Circle,
  AlertCircle,
  ArrowRight,
  User,
  Stethoscope,
} from 'lucide-react';
import AppBridge from '../../services/bridge';
import type { NavTab } from '../../types';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAYS_OF_WEEK = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

interface CalendarWidgetProps {
  onNavigate?: (tab: NavTab) => void;
  onOpenConsultations?: () => void;
}

interface CalendarDayItem {
  dayNumber: number;
  dateStr: string; // YYYY-MM-DD
  isCurrentMonth: boolean;
  isToday: boolean;
  hasConsultations: boolean;
  hasTasks: boolean;
  consultationCount: number;
  taskCount: number;
}

export const CalendarWidget: React.FC<CalendarWidgetProps> = ({
  onNavigate,
  onOpenConsultations,
}) => {
  const [currentDate] = useState(new Date());
  const [viewYear, setViewYear] = useState(currentDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(currentDate.getMonth()); // 0-indexed
  const [selectedDateStr, setSelectedDateStr] = useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });

  const [appointmentsByDate, setAppointmentsByDate] = useState<Record<string, any[]>>({});
  const [tasksByDate, setTasksByDate] = useState<Record<string, any[]>>({});
  const [newTaskInput, setNewTaskInput] = useState('');
  const [newTimeInput, setNewTimeInput] = useState('');
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [showDoneTasks, setShowDoneTasks] = useState(false);

  useEffect(() => {
    loadMonthlyData();
  }, [viewYear, viewMonth]);

  const loadMonthlyData = async () => {
    try {
      const [apptsRes, ticketsRes] = await Promise.all([
        AppBridge.api.listAppointments(),
        AppBridge.api.listTickets ? AppBridge.api.listTickets() : Promise.resolve({ tickets: [] }),
      ]);

      const apptsMap: Record<string, any[]> = {};
      const apptList = apptsRes.appointments || [];
      apptList.forEach((a: any) => {
        const rawTime = a.scheduled_time || '';
        const dStr = rawTime.slice(0, 10);
        if (dStr) {
          if (!apptsMap[dStr]) apptsMap[dStr] = [];
          apptsMap[dStr].push(a);
        }
      });
      setAppointmentsByDate(apptsMap);

      const tasksMap: Record<string, any[]> = {};
      const ticketList = (ticketsRes as any).tickets || [];
      ticketList.forEach((t: any) => {
        const dStr = t.due_date || '';
        if (dStr) {
          if (!tasksMap[dStr]) tasksMap[dStr] = [];
          tasksMap[dStr].push(t);
        }
      });
      setTasksByDate(tasksMap);
    } catch (_) {}
  };

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleTodayJump = () => {
    const today = new Date();
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    setSelectedDateStr(`${y}-${m}-${day}`);
  };

  // Generate calendar grid days (from PranshulOS algorithm)
  const calendarDays: CalendarDayItem[] = React.useMemo(() => {
    const today = new Date();
    const todayFormatted = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
      today.getDate()
    ).padStart(2, '0')}`;

    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay(); // 0 is Sun
    const daysInCurrentMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const days: CalendarDayItem[] = [];

    // Prev month padding
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const prevM = viewMonth === 0 ? 12 : viewMonth;
      const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
      const dateStr = `${prevY}-${String(prevM).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      days.push({
        dayNumber: dayNum,
        dateStr,
        isCurrentMonth: false,
        isToday: dateStr === todayFormatted,
        hasConsultations: Boolean(appointmentsByDate[dateStr]?.length),
        hasTasks: Boolean(tasksByDate[dateStr]?.length),
        consultationCount: appointmentsByDate[dateStr]?.length || 0,
        taskCount: tasksByDate[dateStr]?.length || 0,
      });
    }

    // Current month days
    for (let d = 1; d <= daysInCurrentMonth; d++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        dayNumber: d,
        dateStr,
        isCurrentMonth: true,
        isToday: dateStr === todayFormatted,
        hasConsultations: Boolean(appointmentsByDate[dateStr]?.length),
        hasTasks: Boolean(tasksByDate[dateStr]?.length),
        consultationCount: appointmentsByDate[dateStr]?.length || 0,
        taskCount: tasksByDate[dateStr]?.length || 0,
      });
    }

    // Next month padding to fill out 42 slots or multiple of 7
    const remaining = (7 - (days.length % 7)) % 7;
    for (let n = 1; n <= remaining; n++) {
      const nextM = viewMonth === 11 ? 1 : viewMonth + 2;
      const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
      const dateStr = `${nextY}-${String(nextM).padStart(2, '0')}-${String(n).padStart(2, '0')}`;
      days.push({
        dayNumber: n,
        dateStr,
        isCurrentMonth: false,
        isToday: dateStr === todayFormatted,
        hasConsultations: Boolean(appointmentsByDate[dateStr]?.length),
        hasTasks: Boolean(tasksByDate[dateStr]?.length),
        consultationCount: appointmentsByDate[dateStr]?.length || 0,
        taskCount: tasksByDate[dateStr]?.length || 0,
      });
    }

    return days;
  }, [viewYear, viewMonth, appointmentsByDate, tasksByDate]);

  // Selected date details
  const selectedDayAppts = appointmentsByDate[selectedDateStr] || [];
  const selectedDayTasks = tasksByDate[selectedDateStr] || [];
  const pendingTasks = selectedDayTasks.filter((t) => t.status !== 'done');
  const doneTasks = selectedDayTasks.filter((t) => t.status === 'done');

  const selectedDateObj = new Date(selectedDateStr + 'T00:00:00');
  const selectedDateHuman = selectedDateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const handleAddTask = async () => {
    if (!newTaskInput.trim() || isAddingTask) return;
    setIsAddingTask(true);
    try {
      const created = await AppBridge.api.createTicket({
        title: newTaskInput.trim(),
        due_date: selectedDateStr,
        priority: 'medium',
        description: newTimeInput ? `Scheduled time: ${newTimeInput}` : '',
      });

      if (created) {
        setTasksByDate((prev) => ({
          ...prev,
          [selectedDateStr]: [...(prev[selectedDateStr] || []), created],
        }));
        setNewTaskInput('');
        setNewTimeInput('');
      }
    } catch (_) {
    } finally {
      setIsAddingTask(false);
    }
  };

  const handleToggleTaskStatus = async (task: any) => {
    const newStatus = task.status === 'done' ? 'open' : 'done';
    try {
      await AppBridge.api.updateTicket(task.id, { status: newStatus });
      setTasksByDate((prev) => ({
        ...prev,
        [selectedDateStr]: (prev[selectedDateStr] || []).map((t) =>
          t.id === task.id ? { ...t, status: newStatus } : t
        ),
      }));
    } catch (_) {}
  };

  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white shadow-2xs overflow-hidden">
      {/* ── Top Bar ───────────────────────────────────────────────────────────── */}
      <div className="px-6 py-4 border-b border-[#E2E8F0] bg-[#F8FAFC] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] text-[#2563EB]">
            <CalendarIcon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Clinical Calendar &amp; Agenda</h3>
            <p className="text-[11px] text-slate-500">
              Interactive practice calendar directly integrated with patient encounters and follow-ups
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleTodayJump}
            className="px-2.5 py-1 text-xs font-semibold rounded-md bg-white border border-[#E2E8F0] hover:bg-slate-50 text-slate-700 shadow-2xs transition-colors cursor-pointer"
          >
            Today
          </button>
          <div className="flex items-center rounded-md border border-[#E2E8F0] bg-white shadow-2xs">
            <button
              onClick={handlePrevMonth}
              className="p-1 hover:bg-slate-50 text-slate-600 rounded-l-md transition-colors cursor-pointer"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 text-xs font-mono font-bold text-slate-800 tracking-wide">
              {MONTH_NAMES[viewMonth].toUpperCase()} {viewYear}
            </span>
            <button
              onClick={handleNextMonth}
              className="p-1 hover:bg-slate-50 text-slate-600 rounded-r-md transition-colors cursor-pointer"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Grid & Agenda Split View ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[#E2E8F0]">
        {/* Calendar Grid (7 cols) */}
        <div className="lg:col-span-7 p-6">
          <div className="grid grid-cols-7 gap-1 text-center mb-2">
            {DAYS_OF_WEEK.map((d) => (
              <div key={d} className="text-[10px] font-mono font-bold text-slate-400 py-1">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {calendarDays.map((item, idx) => {
              const isSelected = item.dateStr === selectedDateStr;
              return (
                <div
                  key={idx}
                  onClick={() => setSelectedDateStr(item.dateStr)}
                  className={`aspect-square p-1.5 rounded-lg border transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'bg-[#EFF6FF] border-[#2563EB] shadow-xs text-[#1D4ED8]'
                      : item.isToday
                      ? 'bg-blue-50/50 border-[#BFDBFE] text-[#2563EB] font-bold'
                      : item.isCurrentMonth
                      ? 'bg-white hover:bg-slate-50 border-slate-200/80 text-slate-800'
                      : 'bg-slate-50/50 border-transparent text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-mono ${
                        isSelected || item.isToday ? 'font-bold' : 'font-medium'
                      }`}
                    >
                      {item.dayNumber}
                    </span>
                    {item.isToday && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB]" />
                    )}
                  </div>

                  {/* Dot Indicators */}
                  <div className="flex items-center gap-1 mt-1 justify-center">
                    {item.hasConsultations && (
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-[#2563EB]"
                        title={`${item.consultationCount} scheduled consultation(s)`}
                      />
                    )}
                    {item.hasTasks && (
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-amber-500"
                        title={`${item.taskCount} clinical follow-up task(s)`}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 pt-4 border-t border-[#E2E8F0] flex items-center justify-between text-[11px] text-slate-500">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#2563EB]" />
                <span>Consultation / Meeting</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span>Follow-up Ticket</span>
              </span>
            </div>
            <span className="font-mono text-[10px]">Select any day to inspect schedule</span>
          </div>
        </div>

        {/* Selected Day Agenda & Tasks (5 cols) */}
        <div className="lg:col-span-5 p-6 flex flex-col justify-between bg-[#FCFDFE]">
          <div className="space-y-4">
            {/* Header of selected day */}
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
              <div>
                <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-[#2563EB]">
                  DAY AGENDA
                </span>
                <h4 className="text-xs font-bold text-slate-900 mt-0.5">{selectedDateHuman}</h4>
              </div>
              {onOpenConsultations && (
                <button
                  onClick={onOpenConsultations}
                  className="flex items-center gap-1 text-[11px] font-semibold text-[#2563EB] hover:text-[#1D4ED8] cursor-pointer"
                >
                  <span>All Consultations</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Scheduled Consultations for Selected Date */}
            <div>
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
                <span>SCHEDULED CONSULTATIONS ({selectedDayAppts.length})</span>
                {selectedDayAppts.length > 0 && (
                  <span className="text-blue-600 font-sans text-[10px]">Active</span>
                )}
              </div>

              {selectedDayAppts.length === 0 ? (
                <div className="p-3 rounded-lg border border-dashed border-[#E2E8F0] bg-white text-center text-xs text-slate-400">
                  No consultations scheduled for this date.
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedDayAppts.map((appt) => (
                    <div
                      key={appt.id}
                      className="p-2.5 rounded-lg border border-[#BFDBFE] bg-[#EFF6FF]/60 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Clock className="w-3.5 h-3.5 text-[#2563EB] flex-shrink-0" />
                        <div className="truncate">
                          <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                            <span className="truncate">{appt.display_name || appt.patient_alias || 'Patient Encounter'}</span>
                            {appt.patient_alias && (
                              <span className="px-1.5 py-0.2 rounded font-mono text-[9px] bg-white text-blue-700 border border-blue-200">
                                {appt.patient_alias}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {appt.scheduled_time?.slice(11, 16) || 'All Day'} • {appt.reason || 'Follow-up'}
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                        {appt.status || 'Scheduled'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tasks & Follow-ups for Selected Date */}
            <div>
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-2">
                PRACTICE TASKS &amp; ACTION ITEMS ({pendingTasks.length})
              </div>

              {pendingTasks.length === 0 ? (
                <div className="p-3 rounded-lg border border-dashed border-[#E2E8F0] bg-white text-center text-xs text-slate-400">
                  No pending action items for this date.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {pendingTasks.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => handleToggleTaskStatus(t)}
                      className="p-2 rounded-lg border border-[#E2E8F0] bg-white hover:bg-slate-50 flex items-start gap-2.5 cursor-pointer transition-colors group"
                    >
                      <Circle className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-500 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0 text-xs text-slate-800 leading-snug">
                        {t.title}
                      </div>
                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 uppercase">
                        {t.priority}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {doneTasks.length > 0 && (
                <div className="mt-2">
                  <button
                    onClick={() => setShowDoneTasks(!showDoneTasks)}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
                  >
                    <span>{showDoneTasks ? '▾ Hide' : '▸ Show'} Done Today ({doneTasks.length})</span>
                  </button>
                  {showDoneTasks && (
                    <div className="mt-1 space-y-1 pl-2">
                      {doneTasks.map((t) => (
                        <div
                          key={t.id}
                          onClick={() => handleToggleTaskStatus(t)}
                          className="p-1.5 text-xs text-slate-400 line-through flex items-center gap-2 cursor-pointer hover:text-slate-600"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                          <span className="truncate">{t.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Quick Add Task for Selected Day (PranshulOS Input Row) */}
          <div className="pt-4 border-t border-[#E2E8F0] mt-4 space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newTaskInput}
                onChange={(e) => setNewTaskInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddTask();
                }}
                placeholder="Add task or goal for this day..."
                className="flex-1 px-3 py-1.5 rounded-lg bg-white border border-[#E2E8F0] focus:border-[#2563EB] text-xs text-slate-900 outline-none shadow-2xs"
              />
              <input
                type="text"
                value={newTimeInput}
                onChange={(e) => setNewTimeInput(e.target.value)}
                placeholder="HH:MM"
                className="w-16 px-2 py-1.5 rounded-lg bg-white border border-[#E2E8F0] focus:border-[#2563EB] text-xs font-mono text-center text-slate-900 outline-none shadow-2xs"
                title="Time slot (e.g. 14:00)"
              />
              <button
                onClick={handleAddTask}
                disabled={!newTaskInput.trim() || isAddingTask}
                className="px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-40 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
              >
                + Add
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalendarWidget;
