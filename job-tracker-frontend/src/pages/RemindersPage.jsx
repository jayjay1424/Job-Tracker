import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

function formatDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function RemindersPage() {
  const [reminders, setReminders] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({
    applicationId: '',
    dueDate: '',
    message: '',
  });

  const fetchReminders = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await api.getReminders();
      setReminders(data.reminders || []);
    } catch (err) {
      setError(err.message || 'Failed to load reminders');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchApplications = useCallback(async () => {
    try {
      const data = await api.getApplications();
      setApplications(data.applications || []);
    } catch {
      // ignore - dropdown will show fallback
    }
  }, []);

  useEffect(() => {
    fetchReminders();
    fetchApplications();
  }, [fetchReminders, fetchApplications]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.createReminder(createForm);
      setCreateForm({ applicationId: '', dueDate: '', message: '' });
      setShowCreateForm(false);
      await fetchReminders();
    } catch (err) {
      setError(err.message || 'Failed to create reminder');
    }
  };

  const handleToggle = async (id) => {
    try {
      await api.toggleReminder(id, {});
      await fetchReminders();
    } catch (err) {
      setError(err.message || 'Failed to update reminder');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.deleteReminder(id);
      await fetchReminders();
    } catch (err) {
      setError(err.message || 'Failed to delete reminder');
    }
  };

  const now = new Date();
  // Use date-only comparison to avoid timezone issues (dueDate may be YYYY-MM-DD)
  const parseDueDate = (d) => {
    if (!d) return new Date(NaN);
    // If already a Date string with time, parse directly; if YYYY-MM-DD, treat as local midnight
    return new Date(d.includes('T') ? d : d + 'T00:00:00');
  };
  const upcoming = reminders.filter(
    (r) => !r.isCompleted && parseDueDate(r.dueDate) >= now
  );
  const overdue = reminders.filter(
    (r) => !r.isCompleted && parseDueDate(r.dueDate) < now
  );
  const completed = reminders.filter((r) => r.isCompleted);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-gray-900">Reminders</h2>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition font-medium"
        >
          {showCreateForm ? 'Cancel' : 'Add Reminder'}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-1">Upcoming</p>
          <p className="text-2xl font-semibold text-gray-900">{upcoming.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-1">Overdue</p>
          <p className="text-2xl font-semibold text-red-600">{overdue.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-1">Completed</p>
          <p className="text-2xl font-semibold text-gray-900">{completed.length}</p>
        </div>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-medium text-gray-900 mb-4">New Reminder</h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Application
              </label>
              <select
                name="applicationId"
                value={createForm.applicationId}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    applicationId: e.target.value,
                  }))
                }
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition bg-white"
                required
              >
                <option value="">Select an application</option>
                {applications.map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.company} — {app.jobTitle}
                  </option>
                ))}
                {applications.length === 0 && (
                  <option value="" disabled>
                    No applications — create one first
                  </option>
                )}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Due Date
              </label>
              <input
                type="date"
                name="dueDate"
                value={createForm.dueDate}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    dueDate: e.target.value,
                  }))
                }
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Message
              </label>
              <input
                type="text"
                name="message"
                value={createForm.message}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, message: e.target.value }))
                }
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition"
                placeholder="e.g. Follow up on application status"
                required
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2.5 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium"
              >
                Create Reminder
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reminders List */}
      {loading ? (
        <div className="flex justify-center py-20" role="status" aria-live="polite">
          <div className="spinner" aria-label="Loading reminders" />
          <span className="sr-only">Loading reminders…</span>
        </div>
      ) : reminders.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0zM21 12a3 3 0 11-6 0 3 3 0 016 0zM21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v7z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No reminders yet
          </h3>
          <p className="text-gray-500 mb-4">
            Create a reminder to follow up on your applications.
          </p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="inline-block bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition font-medium"
          >
            Add Reminder
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Overdue */}
          {overdue.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-red-600 uppercase tracking-wide">
                Overdue ({overdue.length})
              </h3>
              {overdue.map((r) => (
                <ReminderItem
                  key={r.id}
                  reminder={r}
                  isOverdue
                  onToggle={() => handleToggle(r.id)}
                  onDelete={() => handleDelete(r.id)}
                />
              ))}
            </div>
          )}

          {/* Upcoming */}
          {upcoming.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-primary-600 uppercase tracking-wide">
                Upcoming ({upcoming.length})
              </h3>
              {upcoming.map((r) => (
                <ReminderItem
                  key={r.id}
                  reminder={r}
                  onToggle={() => handleToggle(r.id)}
                  onDelete={() => handleDelete(r.id)}
                />
              ))}
            </div>
          )}

          {/* Completed */}
          {completed.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide">
                Completed ({completed.length})
              </h3>
              {completed.map((r) => (
                <ReminderItem
                  key={r.id}
                  reminder={r}
                  isCompleted
                  onToggle={() => handleToggle(r.id)}
                  onDelete={() => handleDelete(r.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReminderItem({ reminder, isOverdue, isCompleted, onToggle, onDelete }) {
  return (
    <div
      className={`bg-white rounded-xl border p-4 flex items-start gap-4 transition ${
        isCompleted
          ? 'border-gray-100 opacity-60'
          : isOverdue
          ? 'border-red-200 bg-red-50'
          : 'border-gray-200'
      }`}
    >
      <button
        onClick={onToggle}
        className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition ${
          isCompleted
            ? 'border-green-500 bg-green-500'
            : 'border-gray-300 hover:border-primary-500'
        }`}
      >
        {isCompleted && (
          <svg
            className="w-3 h-3 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={3}
              d="M5 13l4 4L19 7"
            />
          </svg>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {reminder.application && (
            <span className="text-sm font-medium text-gray-900">
              {reminder.application.company}
            </span>
          )}
          <span className="text-sm text-gray-500">
            {reminder.message}
          </span>
        </div>

        <div className="text-xs text-gray-400 mt-1 flex items-center gap-2">
          <span>Due: {formatDate(reminder.dueDate)}</span>
          {reminder.application && (
            <span className="text-gray-300">·</span>
          )}
          {reminder.application && (
            <span className="text-gray-400 truncate max-w-[150px]">
              {reminder.application.jobTitle}
            </span>
          )}
          {isOverdue && (
            <span className="text-red-500 font-medium">Overdue</span>
          )}
        </div>
      </div>

      <button
        onClick={onDelete}
        className="ml-auto text-gray-300 hover:text-red-500 p-1 rounded hover:bg-red-50 transition"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
      </button>
    </div>
  );
}
