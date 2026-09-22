import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { api } from '../api';

const STATUS_COLORS = {
  WISHLIST: '#64748b',
  APPLIED: '#0284c7',
  INTERVIEW: '#d97706',
  OFFER: '#16a34a',
  REJECTED: '#dc2626',
  WITHDRAWN: '#94a3b8',
};

const STATUS_BG = {
  WISHLIST: 'bg-slate-100 text-slate-700 border-slate-200',
  APPLIED: 'bg-sky-50 text-sky-700 border-sky-200',
  INTERVIEW: 'bg-amber-50 text-amber-700 border-amber-200',
  OFFER: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-700 border-rose-200',
  WITHDRAWN: 'bg-slate-50 text-slate-500 border-slate-200',
};

export default function AnalyticsDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const result = await api.getDashboard();
      setData(result);
    } catch (err) {
      setError(err.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatPercent = (value) => {
    if (value == null || isNaN(value)) return '0.0%';
    return Number(value).toFixed(1) + '%';
  };

  const formatDate = (isoString) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400" role="status" aria-live="polite">
        <div className="spinner mb-3" aria-label="Loading analytics" />
        <p className="text-sm font-medium">Computing pipeline metrics…</p>
        <span className="sr-only">Loading analytics…</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-md mx-auto shadow-subtle my-8">
        <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-xl flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h2 className="text-base font-bold text-slate-900 mb-1">No Analytics Available</h2>
        <p className="text-xs text-slate-500 mb-4">Add applications to your pipeline to view conversion trends.</p>
        <Link
          to="/board"
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-primary-700 hover:bg-primary-800 text-white text-xs font-semibold rounded-lg shadow-sm transition"
        >
          Go to Board
        </Link>
      </div>
    );
  }

  // Prepare chart data with guards
  const weeklyChartData = (data.applicationsPerWeek ?? []).map((item) => ({
    week: formatDate(item.week),
    applications: item.count ?? 0,
  }));

  const statusChartData = (data.statusBreakdown ?? [])
    .filter((s) => (s.count ?? 0) > 0)
    .map((s) => ({
      name: s.status,
      value: s.count,
      color: STATUS_COLORS[s.status] || '#94a3b8',
    }));

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-slate-200/80">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Pipeline Analytics</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Key metrics, response rates, and weekly application volume.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-3.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg shadow-subtle transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2">
          <svg className="w-4 h-4 text-rose-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Tracked"
          value={data.totalApplications}
          subtext="All pipeline entries"
          color="sky"
          icon={
            <svg className="w-5 h-5 text-primary-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
        />
        <StatCard
          label="Response Rate"
          value={formatPercent(data.responseRate)}
          subtext={
            data.totalApplications > 0
              ? `${data.statusBreakdown.filter((s) => s.status !== 'WISHLIST').reduce((a, s) => a + s.count, 0)} of ${data.totalApplications} responded`
              : 'Awaiting responses'
          }
          color="emerald"
          icon={
            <svg className="w-5 h-5 text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Avg. First Response"
          value={data.avgDaysToFirstResponse > 0 ? `${data.avgDaysToFirstResponse} days` : 'N/A'}
          subtext="From initial applied date"
          color="amber"
          icon={
            <svg className="w-5 h-5 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Recent Velocity"
          value={
            weeklyChartData.length > 0
              ? `${weeklyChartData[weeklyChartData.length - 1]?.applications || 0} sent`
              : '0'
          }
          subtext="In the current week"
          color="violet"
          icon={
            <svg className="w-5 h-5 text-violet-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          }
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Trend Bar Chart */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-card flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-sm text-slate-900">Application Velocity</h2>
              <p className="text-[11px] text-slate-500">Weekly submission volume (last 8 weeks)</p>
            </div>
            <span className="text-[10px] font-semibold text-primary-700 bg-sky-50 border border-sky-100 px-2 py-0.5 rounded-full">
              Trend
            </span>
          </div>

          {weeklyChartData.length > 0 ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="week"
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '10px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      fontSize: '12px',
                    }}
                  />
                  <Bar
                    dataKey="applications"
                    fill="#0284c7"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400 text-xs">
              No weekly data recorded yet
            </div>
          )}
        </div>

        {/* Status Breakdown Pie Chart */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-card flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-sm text-slate-900">Pipeline Stage Distribution</h2>
              <p className="text-[11px] text-slate-500">Breakdown by current application status</p>
            </div>
            <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
              Stages
            </span>
          </div>

          {statusChartData.length > 0 ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {statusChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="#ffffff" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '10px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      fontSize: '12px',
                    }}
                    formatter={(value, name) => [`${value} applications`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400 text-xs">
              No active applications
            </div>
          )}

          {/* Accessible Legend */}
          <div className="flex flex-wrap gap-2.5 mt-2 justify-center pt-3 border-t border-slate-100">
            {statusChartData.map((item) => (
              <div
                key={item.name}
                className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-[11px] font-medium">{item.name}</span>
                <span className="text-[11px] font-bold text-slate-900">({item.value})</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Applications Feed */}
      <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-card">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-sm text-slate-900">Recent Applications</h2>
          <Link
            to="/board"
            className="text-xs text-primary-700 hover:text-primary-800 font-semibold hover:underline"
          >
            View all on board &rarr;
          </Link>
        </div>

        {data.recentApplications && data.recentApplications.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {data.recentApplications.map((app) => {
              const initial = (app.company?.[0] || 'C').toUpperCase();
              return (
                <div
                  key={app.id}
                  className="px-5 py-3 flex items-center justify-between hover:bg-slate-50/80 transition"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-lg bg-sky-100 text-primary-800 flex items-center justify-center text-xs font-bold shrink-0 border border-sky-200/60">
                      {initial}
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/applications/${app.id}`}
                        className="font-semibold text-xs text-slate-900 hover:text-primary-700 truncate block transition"
                      >
                        {app.company}
                      </Link>
                      <p className="text-[11px] text-slate-500 truncate">
                        {app.jobTitle}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    <span
                      className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold border ${
                        STATUS_BG[app.status] || 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {app.status}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
                      {formatDate(app.createdAt)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-5 py-8 text-center text-slate-400 text-xs">
            No recent activity
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, subtext, icon, color }) {
  const bgMap = {
    sky: 'bg-sky-50 border-sky-100',
    emerald: 'bg-emerald-50 border-emerald-100',
    amber: 'bg-amber-50 border-amber-100',
    violet: 'bg-violet-50 border-violet-100',
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-card hover:shadow-card-hover transition-all duration-150">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
            {label}
          </p>
          <p className="text-2xl font-bold text-slate-900 tracking-tight">{value}</p>
          {subtext && (
            <p className="text-[11px] text-slate-400 mt-1 font-normal">{subtext}</p>
          )}
        </div>
        <div className={`p-2.5 rounded-xl border ${bgMap[color] || 'bg-slate-50 border-slate-100'}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}
