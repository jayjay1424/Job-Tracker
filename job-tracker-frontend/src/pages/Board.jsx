import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { DndContext, DragOverlay, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors, useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api } from '../api';

const STATUS_COLUMNS = [
  { id: 'WISHLIST', label: 'Wishlist', color: '#6b7280' },
  { id: 'APPLIED', label: 'Applied', color: '#3b82f6' },
  { id: 'INTERVIEW', label: 'Interview', color: '#f59e0b' },
  { id: 'OFFER', label: 'Offer', color: '#10b981' },
  { id: 'REJECTED', label: 'Rejected', color: '#ef4444' },
  { id: 'WITHDRAWN', label: 'Withdrawn', color: '#9ca3af' },
];

export default function Board() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeId, setActiveId] = useState(null);

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

    // overId can be a column id (WISHLIST etc.) or a card id
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

  // Group applications by status
  const grouped = STATUS_COLUMNS.reduce((acc, col) => {
    acc[col.id] = applications.filter((a) => a.status === col.id);
    return acc;
  }, {});

  const activeApplication = applications.find((a) => a.id === activeId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-gray-900">Board</h2>
        <div className="flex items-center gap-2">
          <a
            href="/applications/new"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition"
          >
            <span className="text-base leading-none">+</span> Add Application
          </a>
          <button
            onClick={fetchApplications}
            className="text-sm text-primary-600 hover:text-primary-700 font-medium px-2 py-1.5"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="spinner" />
        </div>
      ) : applications.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No applications yet
          </h3>
          <p className="text-gray-500 mb-4">
            Start tracking your job applications by creating one.
          </p>
          <a
            href="/applications/new"
            className="inline-block bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition font-medium"
          >
            Create Application
          </a>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {/* No scrollbar — use available width + vertical space (2 rows on desktop) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {STATUS_COLUMNS.map((column) => (
              <Column
                key={column.id}
                column={column}
                applications={grouped[column.id] || []}
                onStatusChange={handleStatusChange}
                onCreated={fetchApplications}
              />
            ))}
          </div>

          <DragOverlay>
            {activeApplication && (
              <div className="bg-white rounded-lg shadow-xl p-3 border border-gray-200">
                <div className="font-medium text-gray-900 truncate">
                  {activeApplication.company}
                </div>
                <div className="text-sm text-gray-500 truncate">
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
    e.preventDefault();
    if (!form.company.trim() || !form.jobTitle.trim()) {
      setErr('Company and Job Title required');
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

  return (
    <div
      ref={setNodeRef}
      className={`bg-gray-50 rounded-xl p-3 border min-h-[260px] flex flex-col transition ${
        isOver ? 'border-primary-300 bg-primary-50/50' : 'border-gray-200'
      }`}
    >
      <div className="flex items-center gap-2 mb-3 px-1">
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: column.color }}
        />
        <h3 className="font-medium text-gray-700 text-sm">{column.label}</h3>
        <span className="text-xs text-gray-400 bg-white px-2 py-0.5 rounded-full border">
          {applications.length}
        </span>
      </div>

      <SortableContext
        items={applications.map((a) => a.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2 min-h-[40px] flex-1">
          {applications.map((app) => (
            <SortableCard
              key={app.id}
              application={app}
              onStatusChange={onStatusChange}
            />
          ))}
        </div>
      </SortableContext>

      {applications.length === 0 && !showForm && (
        <div className="text-center py-4 text-gray-400 text-sm">
          No applications
        </div>
      )}

      {showForm ? (
        <form
          onSubmit={handleQuickAdd}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="mt-3 bg-white rounded-lg border border-gray-200 p-3 space-y-2 shadow-sm"
        >
          <input
            autoFocus
            type="text"
            placeholder="Company *"
            value={form.company}
            onChange={(e) => setForm((p) => ({ ...p, company: e.target.value }))}
            className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            required
          />
          <input
            type="text"
            placeholder="Job Title *"
            value={form.jobTitle}
            onChange={(e) => setForm((p) => ({ ...p, jobTitle: e.target.value }))}
            className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            required
          />
          <input
            type="text"
            placeholder="Location (optional)"
            value={form.location}
            onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
            className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
          />
          {err && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{err}</div>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-1.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {submitting ? 'Adding…' : 'Add'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setErr('');
              }}
              className="px-3 py-1.5 bg-white border border-gray-300 text-sm rounded-lg hover:bg-gray-50 transition"
            >
              Cancel
            </button>
          </div>
          <div className="text-[11px] text-gray-400 text-center">
            Need more fields? <a href="/applications/new" className="text-primary-600 hover:underline">Open full form</a>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="mt-3 w-full py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-white border border-dashed border-gray-300 hover:border-gray-400 rounded-lg transition flex items-center justify-center gap-1.5"
        >
          <span className="text-base leading-none">+</span> Add card
        </button>
      )}
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
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="bg-white rounded-lg border border-gray-200 p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 truncate">
            {application.company}
          </div>
          <div className="text-sm text-gray-500 truncate">
            {application.jobTitle}
          </div>
        </div>
        <select
          value={application.status}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            e.stopPropagation();
            const newStatus = e.target.value;
            if (newStatus !== application.status) onStatusChange(application.id, newStatus);
          }}
          className="shrink-0 text-xs font-medium rounded-full border px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer max-w-[110px] truncate"
          style={{
            backgroundColor: (STATUS_COLUMNS.find((c) => c.id === application.status)?.color) || '#6b7280',
            borderColor: (STATUS_COLUMNS.find((c) => c.id === application.status)?.color) || '#6b7280',
            color: '#fff',
          }}
        >
          {STATUS_COLUMNS.map((col) => (
            <option key={col.id} value={col.id} style={{ backgroundColor: '#fff', color: '#111827' }}>
              {col.label}
            </option>
          ))}
        </select>
      </div>

      {application.location && (
        <div className="text-xs text-gray-400 mt-2 truncate">
          {application.location}
        </div>
      )}
      <div className="mt-2 flex justify-end">
        <Link
          to={`/applications/${application.id}`}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="text-xs text-primary-600 hover:text-primary-700 hover:underline font-medium"
        >
          View
        </Link>
      </div>
    </div>
  );
}
