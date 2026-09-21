import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api';

function isValidHttpUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
function formatDateSafe(iso, opts) {
  if (!iso) return '-';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', opts);
}

const STATUS_COLUMNS = [
  { id: 'WISHLIST', label: 'Wishlist', color: '#6b7280' },
  { id: 'APPLIED', label: 'Applied', color: '#3b82f6' },
  { id: 'INTERVIEW', label: 'Interview', color: '#f59e0b' },
  { id: 'OFFER', label: 'Offer', color: '#10b981' },
  { id: 'REJECTED', label: 'Rejected', color: '#ef4444' },
  { id: 'WITHDRAWN', label: 'Withdrawn', color: '#9ca3af' },
];

export default function ApplicationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusError, setStatusError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const fetchApplication = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await api.getApplication(id);
      setApplication(data.application);
    } catch (err) {
      setError(err.message || 'Failed to load application');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchApplication();
  }, [fetchApplication]);

  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const handleStatusChange = async (newStatus) => {
    if (application.status === newStatus) return;
    setStatusError('');
    setIsUpdatingStatus(true);
    try {
      await api.changeStatus(id, { status: newStatus });
      await fetchApplication();
    } catch (err) {
      setStatusError(err.message || 'Failed to update status');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api.deleteApplication(id);
      navigate('/board');
    } catch (err) {
      setError(err.message || 'Failed to delete application');
    }
  };

  const handleBack = () => {
    if (window.history.length > 2) navigate(-1);
    else navigate('/board');
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20" role="status" aria-live="polite">
        <div className="spinner" aria-label="Loading application" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  if (error && !application) {
    return (
      <div className="text-center py-20">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Error</h2>
        <p className="text-gray-500 mb-4" role="alert">{error}</p>
        <button
          onClick={() => navigate('/board')}
          className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition"
        >
          Back to Board
        </button>
      </div>
    );
  }

  if (!application) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={handleBack}
              aria-label="Back"
              className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100 transition"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <h2 className="text-2xl font-semibold text-gray-900">
              {application.company}
            </h2>
          </div>
          <p className="text-gray-500">{application.jobTitle}</p>
        </div>

        <div className="flex gap-2">
          <Link
            to={`/applications/${id}/edit`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition"
          >
            Edit
          </Link>
          <button
            onClick={() => {
              setShowDeleteConfirm(true);
            }}
            aria-label="Delete application"
            className="text-gray-400 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition"
          >
            <svg
              className="w-5 h-5"
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
      </div>

      {/* Status + Quick Info */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide">
              Current Status
            </label>
            <div className="flex gap-2 mt-2 flex-wrap">
              {STATUS_COLUMNS.map((col) => (
                <button
                  key={col.id}
                  onClick={() => handleStatusChange(col.id)}
                  disabled={isUpdatingStatus}
                  className={`text-sm px-3 py-1.5 rounded-lg border transition disabled:opacity-50 disabled:cursor-not-allowed ${
                    application.status === col.id
                      ? 'font-semibold'
                      : 'hover:bg-gray-50'
                  }`}
                  style={
                    application.status === col.id
                      ? {
                          backgroundColor: col.color,
                          borderColor: col.color,
                          color: '#fff',
                        }
                      : {
                          backgroundColor: '#fff',
                          borderColor: '#e5e7eb',
                          color: '#6b7280',
                        }
                  }
                >
                  {col.label}
                </button>
              ))}
            </div>
            {statusError && (
              <p className="text-red-600 text-sm mt-2">{statusError}</p>
            )}
          </div>

          <div className="text-sm text-gray-400 space-y-1">
            {application.createdAt && (
              <p>
                Created: {formatDateSafe(application.createdAt, { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            )}
            {application.updatedAt && (
              <p>
                Updated: {formatDateSafe(application.updatedAt, { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="font-medium text-gray-900">Application Details</h3>
        </div>

        <div className="divide-y divide-gray-100">
          {application.company !== undefined && (
            <div className="px-6 py-4">
              <label className="text-xs text-gray-400 uppercase tracking-wide">
                Company
              </label>
              <p className="text-gray-900 font-medium mt-1">
                {application.company}
              </p>
            </div>
          )}
          {application.jobTitle !== undefined && (
            <div className="px-6 py-4">
              <label className="text-xs text-gray-400 uppercase tracking-wide">
                Job Title
              </label>
              <p className="text-gray-900 mt-1">{application.jobTitle}</p>
            </div>
          )}
          {application.jobUrl && (
            <div className="px-6 py-4">
              <label className="text-xs text-gray-400 uppercase tracking-wide">
                Job URL
              </label>
              {isValidHttpUrl(application.jobUrl) ? (
                <a
                  href={application.jobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-700 underline mt-1 inline-block break-all"
                >
                  {application.jobUrl}
                </a>
              ) : (
                <p className="text-gray-900 mt-1 break-all">{application.jobUrl}</p>
              )}
            </div>
          )}
          {application.location && (
            <div className="px-6 py-4">
              <label className="text-xs text-gray-400 uppercase tracking-wide">
                Location
              </label>
              <p className="text-gray-900 mt-1">{application.location}</p>
            </div>
          )}
          {application.salary !== null && application.salary !== undefined && (
            <div className="px-6 py-4">
              <label className="text-xs text-gray-400 uppercase tracking-wide">
                Salary
              </label>
              <p className="text-gray-900 mt-1">
                {typeof application.salary === 'number'
                  ? '$' +
                    application.salary.toLocaleString('en-US', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })
                  : application.salary}
              </p>
            </div>
          )}
          {application.source && (
            <div className="px-6 py-4">
              <label className="text-xs text-gray-400 uppercase tracking-wide">
                Source
              </label>
              <p className="text-gray-900 mt-1">{application.source}</p>
            </div>
          )}
          {application.appliedDate && (
            <div className="px-6 py-4">
              <label className="text-xs text-gray-400 uppercase tracking-wide">
                Applied Date
              </label>
              <p className="text-gray-900 mt-1">
                {formatDateSafe(application.appliedDate, { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          )}
          {application.notes && (
            <div className="px-6 py-4">
              <label className="text-xs text-gray-400 uppercase tracking-wide">
                Notes
              </label>
              <p className="text-gray-700 mt-1 whitespace-pre-wrap">
                {application.notes}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Status Timeline */}
      {application.statusHistory && application.statusHistory.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="font-medium text-gray-900">Status Timeline</h3>
          </div>

          <div className="px-6 py-4">
            <div className="relative">
              {/* Vertical line */}
              <div
                className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"
                style={{ marginLeft: '4px' }}
              />

              <div className="space-y-4">
                {application.statusHistory.map((history, index) => (
                  <div key={history.id || index} className="relative pl-10">
                    <div
                      className="absolute left-2 w-4 h-4 rounded-full border-2 border-white"
                      style={{
                        backgroundColor:
                          history.status === application.status
                            ? '#2563eb'
                            : '#9ca3af',
                      }}
                    />
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                      <div className="flex items-center justify-between">
                        <span
                          className="font-medium text-sm"
                          style={{
                            color:
                              history.status === application.status
                                ? '#2563eb'
                                : '#6b7280',
                          }}
                        >
                          {STATUS_COLUMNS.find(
                            (c) => c.id === history.status
                          )?.label || history.status}
                        </span>
                        <span className="text-xs text-gray-400">
                          {formatDateSafe(history.changedAt, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="bg-white rounded-xl p-6 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Delete Application?
            </h3>
            <p className="text-gray-500 mb-6">
              This will permanently delete{' '}
              <strong>{application.company}</strong> —{' '}
              {application.jobTitle}. This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-lg transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
