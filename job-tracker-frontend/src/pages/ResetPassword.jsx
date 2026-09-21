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
      setStatus({ type: 'error', message: 'Passwords do not match' });
      return;
    }
    setLoading(true);
    try {
      const data = await api.resetPassword({ token, password });
      setStatus({ type: 'success', message: data.message });
      setPassword('');
      setConfirm('');
      // Clear token from URL for security
      setTimeout(() => setSearchParams({}, { replace: true }), 800);
    } catch (err) {
      setStatus({ type: 'error', message: err.data?.error || err.data?.errors?.map((x) => x.msg).join(', ') || 'Reset failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">Job Tracker</h1>
          <p className="mt-2 text-gray-500">Choose a new password</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Set new password</h2>

          {!token && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
              This reset link is missing its token. Please request a new one from the{' '}
              <Link to="/forgot-password" className="underline font-medium">forgot password</Link> page.
            </div>
          )}

          {status?.type === 'success' && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg">
              {status.message}{' '}
              <Link to="/login" className="underline font-medium">Sign in now</Link>
            </div>
          )}
          {status?.type === 'error' && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
              {status.message}
            </div>
          )}

          {token && status?.type !== 'success' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="reset-password" className="block text-sm font-medium text-gray-700 mb-1">New password</label>
                <input
                  id="reset-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>

              <div>
                <label htmlFor="reset-confirm" className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
                <input
                  id="reset-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-2.5 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Resetting…' : 'Reset password'}
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-gray-500">
            <Link to="/login" className="text-primary-600 hover:underline font-medium">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
