import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [status, setStatus] = useState(null); // { type: 'success' | 'error', message, emailSent, resetLink, resetToken, notice }
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus(null);
    setLoading(true);
    const trimmed = email.trim().toLowerCase();
    try {
      const data = await api.forgotPassword({ email: trimmed });
      setSubmittedEmail(trimmed);
      setStatus({
        type: 'success',
        message: data.message,
        emailSent: !!data.emailSent,
        resetLink: data.resetLink,
        resetToken: data.resetToken,
        notice: data.notice
      });
    } catch (err) {
      setStatus({
        type: 'error',
        message: err.data?.error || err.data?.errors?.map((x) => x.msg).join(', ') || err.message || 'Request failed. Please try again.'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (!status?.resetLink) return;
    navigator.clipboard.writeText(status.resetLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const internalResetPath = status?.resetToken
    ? `/reset-password?token=${status.resetToken}`
    : status?.resetLink
    ? status.resetLink.replace(/^https?:\/\/[^/]+/, '')
    : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50/30 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Header Branding */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-600 text-white font-bold text-xl shadow-lg shadow-indigo-200 mb-3">
            🎯
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Job Application Tracker</h1>
          <p className="mt-1 text-sm text-slate-500">Account Recovery</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 p-8 sm:p-9">
          <h2 className="text-xl font-bold text-slate-900 mb-2">Forgot your password?</h2>
          <p className="text-sm text-slate-500 mb-6 leading-relaxed">
            Enter your email address below. We'll generate a secure reset link valid for 1 hour.
          </p>

          {/* Success Card */}
          {status?.type === 'success' && (
            <div className="mb-6 space-y-4">
              {status.emailSent ? (
                /* Email was successfully dispatched via Resend or SMTP */
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-sm">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <div>
                      <p className="font-semibold text-emerald-900">Reset email sent!</p>
                      <p className="mt-1 text-emerald-700">
                        We sent a password reset link to <span className="font-medium underline">{submittedEmail}</span>.
                      </p>
                      <p className="mt-2 text-xs text-emerald-600">
                        Check your inbox and spam folder. The link expires in 1 hour.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                /* Email delivery service not yet configured — show instant reset button */
                <div className="p-4 bg-indigo-50/80 border border-indigo-200 rounded-xl text-indigo-950 text-sm">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="w-full">
                      <p className="font-semibold text-indigo-900">Reset link ready!</p>
                      <p className="mt-1 text-xs text-indigo-700">
                        Click the button below to choose a new password immediately:
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Direct Reset Action Button (works both in dev & production) */}
              {internalResetPath && (
                <div className="pt-2">
                  <Link
                    to={internalResetPath}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-4 rounded-xl shadow-sm transition hover:shadow-indigo-200 hover:shadow-md"
                  >
                    <span>Proceed to Reset Password</span>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </Link>

                  <div className="mt-3 flex items-center justify-between text-xs text-slate-500 px-1">
                    <span>Token is valid for 60 minutes</span>
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="text-indigo-600 hover:text-indigo-700 font-medium inline-flex items-center gap-1 cursor-pointer"
                    >
                      {copied ? '✓ Copied!' : 'Copy direct link'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error Message */}
          {status?.type === 'error' && (
            <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl flex items-start gap-3">
              <svg className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>{status.message}</div>
            </div>
          )}

          {/* Form */}
          {(!status || status.type === 'error' || !status.emailSent) && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="forgot-email" className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                  Email address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                    </svg>
                  </div>
                  <input
                    id="forgot-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-sm text-slate-900 transition"
                    placeholder="you@example.com"
                    required
                  />
                </div>
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
                    <span>Generating reset link…</span>
                  </>
                ) : (
                  <span>Send reset link</span>
                )}
              </button>
            </form>
          )}

          {/* Footer Back to Login */}
          <p className="mt-6 text-center text-sm text-slate-500">
            Remembered your password?{' '}
            <Link to="/login" className="text-indigo-600 hover:text-indigo-700 font-medium hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
