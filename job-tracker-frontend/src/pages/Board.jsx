import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api } from '../api';

const STATUS_COLUMNS = [
  { id: 'WISHLIST', label: 'Wishlist', color: '#64748b', bgLight: '#f1f5f9', borderLight: '#cbd5e1' },
  { id: 'APPLIED', label: 'Applied', color: '#0284c7', bgLight: '#f0f9ff', borderLight: '#bae6fd' },
  { id: 'INTERVIEW', label: 'Interview', color: '#d97706', bgLight: '#fffbeb', borderLight: '#fde68a' },
  { id: 'OFFER', label: 'Offer', color: '#16a34a', bgLight: '#f0fdf4', borderLight: '#bbf7d0' },
  { id: 'REJECTED', label: 'Rejected', color: '#dc2626', bgLight: '#fef2f2', borderLight: '#fecaca' },
  { id: 'WITHDRAWN', label: 'Withdrawn', color: '#94a3b8', bgLight: '#f8fafc', borderLight: '#e2e8f0' },
];

export default function Board() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeId, setActiveId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const fetchApplications = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await api.getApplications();
      setApplications(data.applications || []);
    } catch (err) {
      setError(err.message || 'Failed to load applications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const draggedId = active.id;
    const overId = over.id;

    const draggedApp = applications.find((a) => a.id === draggedId);
    if (!draggedApp) return;

    // overId can be a column id (WISHLIST etc.) or another card id
    let newStatus = overId;
    const isColumn = STATUS_COLUMNS.some((c) => c.id === overId);
    if (!isColumn) {
      const overApp = applications.find((a) => a.id === overId);
      if (overApp) newStatus = overApp.status;
      else return;
    }

    if (!newStatus || newStatus === draggedApp.status) return;

    const prevStatus = draggedApp.status;
    try {
      // Optimistic update
      setApplications((prev) =>
        prev.map((a) => (a.id === draggedId ? { ...a, status: newStatus } : a))
      );
      await api.changeStatus(draggedId, { status: newStatus });
      await fetchApplications();
    } catch (err) {
      // Revert on error
      setApplications((prev) =>
        prev.map((a) => (a.id === draggedId ? { ...a, status: prevStatus } : a))
      );
      setError(err.message || 'Failed to update status');
    }
  };

  const handleStatusChange = async (applicationId, newStatus) => {
    setError('');
    try {
      await api.changeStatus(applicationId, { status: newStatus });
      await fetchApplications();
    } catch (err) {
      setError(err.message || 'Failed to update status');
    }
  };

  // Filter applications by search term
  const filteredApplications = useMemo(() => {
    if (!searchQuery.trim()) return applications;
    const query = searchQuery.toLowerCase();
    return applications.filter(
      (app) =>
        app.company?.toLowerCase().includes(query) ||
        app.jobTitle?.toLowerCase().includes(query) ||
        app.location?.toLowerCase().includes(query)
    );
  }, [applications, searchQuery]);

  // Group applications by status
  const grouped = useMemo(() => {
    return STATUS_COLUMNS.reduce((acc, col) => {
      acc[col.id] = filteredApplications.filter((a) => a.status === col.id);
      return acc;
    }, {});
  }, [filteredApplications]);

  const activeApplication = applications.find((a) => a.id === activeId);

  // High-level pipeline counts
  const totalCount = applications.length;
  const activeInterviews = applications.filter((a) => a.status === 'INTERVIEW').length;
  const offersCount = applications.filter((a) => a.status === 'OFFER').length;

  return (
    <div className="space-y-5">
      {/* Header & Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Application Pipeline</h1>
            <span className="bg-slate-100 text-slate-700 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-slate-200">
              {totalCount} Total
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Drag cards across columns or use single-tap status selectors to update progress.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Quick Stats Badges */}
          <div className="hidden lg:flex items-center gap-2 mr-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200/70 rounded-lg text-xs font-medium text-amber-800">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>{activeInterviews} Interviewing</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200/70 rounded-lg text-xs font-medium text-emerald-800">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>{offersCount} Offers</span>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 sm:w-60">
            <svg
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter company, role..."
              className="w-full pl-9 pr-7 py-1.5 text-xs bg-white border border-slate-300 rounded-lg placeholder-slate-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                aria-label="Clear filter"
              >
                &times;
              </button>
            )}
          </div>

          <button
            onClick={fetchApplications}
            disabled={loading}
            className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg shadow-subtle transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Refresh pipeline"
          >
            <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>

          <Link
            to="/applications/new"
            className="px-3.5 py-1.5 bg-primary-700 hover:bg-primary-800 text-white text-xs font-semibold rounded-lg shadow-sm transition flex items-center gap-1.5 cursor-pointer"
          >
            <span className="text-sm font-bold leading-none">+</span> Add Application
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-rose-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
          <button onClick={() => setError('')} className="text-rose-500 hover:text-rose-700 font-bold ml-2">
            &times;
          </button>
        </div>
      )}

      {loading && applications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
          <div className="spinner mb-3" />
          <p className="text-sm font-medium">Loading pipeline data…</p>
        </div>
      ) : applications.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-md mx-auto shadow-subtle my-8">
          <div className="w-14 h-14 bg-sky-50 text-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-sky-100">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-1">Your Board is Empty</h2>
          <p className="text-xs text-slate-500 mb-5 leading-relaxed">
            Start tracking your interviews, wishlist roles, and offers with structured kanban stages.
          </p>
          <Link
            to="/applications/new"
            className="inline-flex items-center gap-2 bg-primary-700 hover:bg-primary-800 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-sm transition"
          >
            Create First Application
          </Link>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {/* Kanban Columns Responsive Track */}
          <div className="flex gap-3.5 overflow-x-auto pb-4 pt-1 items-start custom-scrollbar">
            {STATUS_COLUMNS.map((column) => (
              <div
                key={column.id}
                className="w-[280px] sm:w-[290px] xl:w-auto xl:flex-1 xl:min-w-[250px] shrink-0 xl:shrink"
              >
                <Column
                  column={column}
                  applications={grouped[column.id] || []}
                  onStatusChange={handleStatusChange}
                  onCreated={fetchApplications}
                />
              </div>
            ))}
          </div>

          <DragOverlay>
            {activeApplication && (
              <div className="bg-white rounded-xl shadow-card-hover p-3.5 border-2 border-primary-500 scale-105 rotate-1 opacity-95 w-[280px]">
                <div className="font-semibold text-xs text-slate-900 truncate">
                  {activeApplication.company}
                </div>
                <div className="text-[11px] text-slate-500 truncate mt-0.5">
                  {activeApplication.jobTitle}
                </div>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

function Column({ column, applications, onStatusChange, onCreated }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ company: '', jobTitle: '', location: '' });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const handleQuickAdd = async (e) => {
    e?.preventDefault?.();
    if (!form.company.trim() || !form.jobTitle.trim()) {
      setErr('Company and Title are required');
      return;
    }
    setSubmitting(true);
    setErr('');
    try {
      await api.createApplication({
        company: form.company.trim(),
        jobTitle: form.jobTitle.trim(),
        location: form.location.trim() || undefined,
        status: column.id,
      });
      setForm({ company: '', jobTitle: '', location: '' });
      setShowForm(false);
      if (onCreated) await onCreated();
    } catch (e2) {
      setErr(e2.message || 'Failed to add');
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setShowForm(false);
      setErr('');
    }
  };

  return (
    <div
      ref={setNodeRef}
      className={`rounded-2xl p-2.5 border transition-all duration-150 flex flex-col h-[calc(100vh-215px)] min-h-[500px] max-h-[840px] shadow-2xs ${
        isOver
          ? 'bg-sky-50/80 border-primary-400 ring-2 ring-primary-300 ring-offset-1'
          : 'bg-slate-100/70 border-slate-200/90'
      }`}
    >
      {/* Column Header (Pinned) */}
      <div className="shrink-0 flex items-center justify-between gap-1 mb-2 px-1 pt-0.5">
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full ring-2 ring-white shadow-xs shrink-0"
            style={{ backgroundColor: column.color }}
          />
          <h2 className="font-semibold text-slate-800 text-xs tracking-tight">
            {column.label}
          </h2>
        </div>
        <span
          className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white border border-slate-200/90 text-slate-600 shadow-2xs"
          title={`${applications.length} applications in ${column.label}`}
        >
          {applications.length}
        </span>
      </div>

      {/* Cards List - Independent vertical scroll per column */}
      <SortableContext
        items={applications.map((a) => a.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex-1 overflow-y-auto overflow-x-hidden pr-1 space-y-2.5 custom-scrollbar min-h-0">
          {applications.map((app) => (
            <SortableCard
              key={app.id}
              application={app}
              column={column}
              onStatusChange={onStatusChange}
            />
          ))}

          {applications.length === 0 && !showForm && (
            <div className="h-32 border border-dashed border-slate-300/80 rounded-xl flex flex-col items-center justify-center text-center p-3">
              <span className="text-base text-slate-300 mb-1">📋</span>
              <p className="text-[11px] text-slate-400 font-medium">Empty stage</p>
            </div>
          )}
        </div>
      </SortableContext>

      {/* Quick Add Form or Trigger (Pinned at bottom) */}
      <div className="shrink-0 pt-2 border-t border-slate-200/60 mt-1.5">
        {showForm ? (
          <form
            onSubmit={handleQuickAdd}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="bg-white rounded-xl border border-slate-200 p-2.5 space-y-2 shadow-card"
          >
            <input
              autoFocus
              type="text"
              placeholder="Company name *"
              value={form.company}
              onChange={(e) => setForm((p) => ({ ...p, company: e.target.value }))}
              className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              required
            />
            <input
              type="text"
              placeholder="Job role / title *"
              value={form.jobTitle}
              onChange={(e) => setForm((p) => ({ ...p, jobTitle: e.target.value }))}
              className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              required
            />
            <input
              type="text"
              placeholder="Location (optional)"
              value={form.location}
              onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
              className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
            {err && (
              <div className="text-[11px] text-rose-600 bg-rose-50 border border-rose-100 rounded px-2 py-1">
                {err}
              </div>
            )}
            <div className="flex gap-1.5 pt-0.5">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 py-1 bg-primary-700 hover:bg-primary-800 text-white text-xs font-semibold rounded-lg shadow-xs disabled:opacity-50 transition cursor-pointer"
              >
                {submitting ? 'Adding…' : 'Add'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setErr('');
                }}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium rounded-lg transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setShowForm(true)}
            className="w-full py-1.5 text-xs text-slate-500 hover:text-slate-800 hover:bg-white border border-dashed border-slate-300 hover:border-slate-400 rounded-xl transition flex items-center justify-center gap-1 cursor-pointer font-medium"
          >
            <span className="text-sm leading-none font-bold">+</span> Quick add
          </button>
        )}
      </div>
    </div>
  );
}

function SortableCard({ application, onStatusChange }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: application.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };

  const companyInitial = (application.company?.[0] || 'C').toUpperCase();

  // Clean salary display formatting
  const formatSalary = (val) => {
    if (!val) return null;
    const trimmed = String(val).trim();
    if (!trimmed) return null;
    // If it's a raw number, format with currency
    const num = Number(trimmed.replace(/,/g, ''));
    if (!isNaN(num) && num > 0) {
      return `₱${num.toLocaleString()}`;
    }
    return trimmed;
  };

  const formattedSalary = formatSalary(application.salary);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="group bg-white rounded-xl border border-slate-200/90 p-3 shadow-card hover:shadow-card-hover transition-all duration-150 cursor-grab active:cursor-grabbing relative hover:border-slate-300"
    >
      {/* Top Header: Company Avatar + Company Name + Stage Selector */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-sky-100 to-indigo-100 text-primary-800 flex items-center justify-center text-[10px] font-bold shrink-0 border border-sky-200/60 shadow-2xs">
            {companyInitial}
          </div>
          <h3
            className="font-semibold text-xs text-slate-900 truncate leading-tight flex-1"
            title={application.company}
          >
            {application.company}
          </h3>
        </div>

        {/* Accessible Stage Selector Dropdown */}
        <select
          value={application.status}
          aria-label={`Change stage for ${application.company} ${application.jobTitle}`}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            e.stopPropagation();
            const newStatus = e.target.value;
            if (newStatus !== application.status) {
              onStatusChange(application.id, newStatus);
            }
          }}
          className="shrink-0 text-[10px] font-medium rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-500 cursor-pointer max-w-[85px] truncate transition shadow-2xs"
        >
          {STATUS_COLUMNS.map((col) => (
            <option key={col.id} value={col.id}>
              {col.label}
            </option>
          ))}
        </select>
      </div>

      {/* Role / Job Title: Full width line aligned under company name */}
      <p
        className="text-[11px] font-medium text-slate-600 truncate pl-8 mb-2 leading-snug"
        title={application.jobTitle}
      >
        {application.jobTitle}
      </p>

      {/* Metadata Chips: Location or Salary */}
      {(application.location || formattedSalary) && (
        <div className="flex flex-wrap items-center gap-1.5 mb-2.5 pt-1.5 border-t border-slate-100 text-[10px]">
          {application.location && (
            <span
              className="inline-flex items-center gap-1 bg-slate-50 text-slate-600 px-2 py-0.5 rounded-md border border-slate-200/60 truncate max-w-[150px]"
              title={application.location}
            >
              <svg className="w-2.5 h-2.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="truncate">{application.location}</span>
            </span>
          )}
          {formattedSalary && (
            <span className="inline-flex items-center gap-0.5 font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/70">
              {formattedSalary}
            </span>
          )}
        </div>
      )}

      {/* Action Footer */}
      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1.5 border-t border-slate-100/80">
        <span className="flex items-center gap-1">
          <svg className="w-3 h-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          {application.appliedDate
            ? new Date(application.appliedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : 'Active'}
        </span>
        <Link
          to={`/applications/${application.id}`}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-0.5 text-primary-700 hover:text-primary-800 font-semibold hover:underline cursor-pointer group-hover:translate-x-0.5 transition-transform"
        >
          View
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
