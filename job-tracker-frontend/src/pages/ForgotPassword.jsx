import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState(null); // { type: 'success' | 'error', message, resetLink? }
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus(null);
    setLoading(true);
    try {
      const trimmed = email.trim().toLowerCase();
      const data = await api.forgotPassword({ email: trimmed });
      setStatus({ type: 'success', message: data.message, resetLink: data.resetLink });
    } catch (err) {
      setStatus({ type: 'error', message: err.data?.error || err.data?.errors?.map((x) => x.msg).join(', ') || 'Request failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">Job Tracker</h1>
          <p className="mt-2 text-gray-500">Reset your password</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Forgot password</h2>
          <p className="text-sm text-gray-500 mb-6">
            Enter your account email and we'll generate a reset link (valid for 1 hour).
          </p>

          {status?.type === 'success' && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg" role="status">
              {status.message}
              {import.meta.env.DEV && status.resetLink && (
                <div className="mt-2">
                  <span className="font-medium">Dev reset link: </span>
                  <Link to={status.resetLink.replace(/^https?:\/\/[^/]+/, '')} className="underline break-all">
                    open reset page
                  </Link>
                </div>
              )}
            </div>
          )}
          {status?.type === 'error' && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
              {status.message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="forgot-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition"
                placeholder="you@example.com"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-2.5 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Remembered it?{' '}
            <Link to="/login" className="text-primary-600 hover:underline font-medium">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
