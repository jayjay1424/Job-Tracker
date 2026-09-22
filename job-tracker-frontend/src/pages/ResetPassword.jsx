import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';

export default function ResetPassword() {
  const [searchParams, setSearchParams] = useSearchParams();
  const token = (searchParams.get('token') || '').trim();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState(null); // { type: 'success' | 'error', message }
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus(null);
    if (password !== confirm) {
      setStatus({ type: 'error', message: 'Passwords do not match. Please ensure both fields are identical.' });
      return;
    }
    setLoading(true);
    try {
      const data = await api.resetPassword({ token, password });
      setStatus({ type: 'success', message: data.message || 'Password successfully updated!' });
      setPassword('');
      setConfirm('');
      // Clear token from URL for security
      setTimeout(() => setSearchParams({}, { replace: true }), 800);
    } catch (err) {
      setStatus({
        type: 'error',
        message: err.data?.error || err.data?.errors?.map((x) => x.msg).join(', ') || err.message || 'Password reset failed. The link may have expired.'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50/30 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-600 text-white font-bold text-xl shadow-lg shadow-indigo-200 mb-3">
            🎯
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Job Application Tracker</h1>
          <p className="mt-1 text-sm text-slate-500">Create a new secure password</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 p-8 sm:p-9">
          <h2 className="text-xl font-bold text-slate-900 mb-2">Set new password</h2>
          <p className="text-sm text-slate-500 mb-6">
            Enter your new password below. Must be at least 6 characters.
          </p>

          {!token && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl">
              <p className="font-semibold">Reset token missing</p>
              <p className="mt-1">
                This reset link is missing its security token. Please generate a new one from the{' '}
                <Link to="/forgot-password" className="underline font-medium hover:text-amber-900">
                  forgot password page
                </Link>.
              </p>
            </div>
          )}

          {status?.type === 'success' && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm rounded-xl space-y-3">
              <div className="flex items-center gap-2 font-semibold">
                <svg className="w-5 h-5 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>{status.message}</span>
              </div>
              <p className="text-xs text-emerald-700">
                You can now log into your account with your new credentials.
              </p>
              <Link
                to="/login"
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2.5 px-4 rounded-xl shadow-sm transition"
              >
                Sign in now →
              </Link>
            </div>
          )}

          {status?.type === 'error' && (
            <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl flex items-start gap-3">
              <svg className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>{status.message}</div>
            </div>
          )}

          {token && status?.type !== 'success' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="reset-password" className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                  New password
                </label>
                <input
                  id="reset-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-sm text-slate-900 transition"
                  placeholder="At least 6 characters"
                  required
                  minLength={6}
                />
              </div>

              <div>
                <label htmlFor="reset-confirm" className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                  Confirm new password
                </label>
                <input
                  id="reset-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-sm text-slate-900 transition"
                  placeholder="Repeat new password"
                  required
                  minLength={6}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 px-4 rounded-xl transition shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Updating password…</span>
                  </>
                ) : (
                  <span>Update password</span>
                )}
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-slate-500">
            <Link to="/login" className="text-indigo-600 hover:text-indigo-700 font-medium hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
