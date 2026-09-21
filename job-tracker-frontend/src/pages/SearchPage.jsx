import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export default function SearchPage() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    status: '',
    company: '',
    fromDate: '',
    toDate: '',
  });

  const fetchApplications = useCallback(async () => {
    // Validate date range
    if (filters.fromDate && filters.toDate && filters.fromDate > filters.toDate) {
      setError('From date cannot be after To date');
      return;
    }
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.company.trim()) params.set('company', filters.company.trim());
      if (filters.fromDate) params.set('from', filters.fromDate);
      if (filters.toDate) params.set('to', filters.toDate);
      const data = await api.getApplications(params.toString());
      setApplications(data.applications || []);
    } catch (err) {
      setError(err.message || 'Failed to load applications');
      setApplications([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Debounced fetch for company typing (400ms), immediate for other filters
  const debounceRef = useRef(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchApplications();
    }, filters.company ? 400 : 0);
    return () => clearTimeout(debounceRef.current);
  }, [fetchApplications]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-gray-900">Search & Filter</h2>
        <button
          onClick={() => setFilters({ status: '', company: '', fromDate: '', toDate: '' })}
          className="text-sm text-gray-600 hover:text-gray-800 font-medium"
        >
          Clear filters
        </button>
      </div>

      {/* Filter controls */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label htmlFor="search-status" className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              id="search-status"
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            >
              <option value="">All statuses</option>
              <option value="WISHLIST">Wishlist</option>
              <option value="APPLIED">Applied</option>
              <option value="INTERVIEW">Interview</option>
              <option value="OFFER">Offer</option>
              <option value="REJECTED">Rejected</option>
              <option value="WITHDRAWN">Withdrawn</option>
            </select>
          </div>

          <div>
            <label htmlFor="search-company" className="block text-sm font-medium text-gray-700 mb-1">Company</label>
            <input
              id="search-company"
              type="text"
              placeholder="Search company..."
              value={filters.company}
              onChange={(e) => setFilters((f) => ({ ...f, company: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
          </div>

          <div>
            <label htmlFor="search-from" className="block text-sm font-medium text-gray-700 mb-1">From date</label>
            <input
              id="search-from"
              type="date"
              value={filters.fromDate}
              onChange={(e) => setFilters((f) => ({ ...f, fromDate: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
          </div>

          <div>
            <label htmlFor="search-to" className="block text-sm font-medium text-gray-700 mb-1">To date</label>
            <input
              id="search-to"
              type="date"
              value={filters.toDate}
              onChange={(e) => setFilters((f) => ({ ...f, toDate: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">
            {applications.length} result{applications.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={fetchApplications}
            className="text-sm bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition font-medium"
          >
            Apply filters
          </button>
        </div>
      </div>

      {/* Results table */}
      {loading ? (
        <div className="flex justify-center py-20" role="status" aria-live="polite">
          <div className="spinner" aria-label="Loading" />
          <span className="sr-only">Loading…</span>
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg" role="alert">
          {error}
        </div>
      ) : applications.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
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
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No matching applications
          </h3>
          <p className="text-gray-500 mb-4">
            Try adjusting your filters or create a new application.
          </p>
          <Link
            to="/applications/new"
            className="inline-block bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition font-medium"
          >
            Create Application
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-700">Company</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Job Title</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Location</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Applied</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => (
                <tr
                  key={app.id}
                  className="border-b border-gray-100 hover:bg-gray-50 transition"
                >
                  <td className="px-4 py-3 font-medium text-gray-900 truncate max-w-[150px]">
                    {app.company}
                  </td>
                  <td className="px-4 py-3 text-gray-600 truncate max-w-[200px]">
                    {app.jobTitle}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={app.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {app.location || '-'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {app.appliedDate
                      ? new Date(app.appliedDate).toLocaleDateString()
                      : '-'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/applications/${app.id}`}
                      className="text-primary-600 hover:text-primary-700 font-medium text-sm"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const colors = {
    WISHLIST: { bg: 'bg-gray-100', text: 'text-gray-700' },
    APPLIED: { bg: 'bg-blue-100', text: 'text-blue-700' },
    INTERVIEW: { bg: 'bg-amber-100', text: 'text-amber-700' },
    OFFER: { bg: 'bg-green-100', text: 'text-green-700' },
    REJECTED: { bg: 'bg-red-100', text: 'text-red-700' },
    WITHDRAWN: { bg: 'bg-gray-200', text: 'text-gray-600' },
  };
  const c = colors[status] || colors.WISHLIST;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      {status}
    </span>
  );
}
