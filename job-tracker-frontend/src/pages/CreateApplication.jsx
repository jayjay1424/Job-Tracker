import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';

const STATUS_OPTIONS = [
  { value: 'WISHLIST', label: 'Wishlist' },
  { value: 'APPLIED', label: 'Applied' },
  { value: 'INTERVIEW', label: 'Interview' },
  { value: 'OFFER', label: 'Offer' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'WITHDRAWN', label: 'Withdrawn' },
];

export default function CreateApplication() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const [jobLink, setJobLink] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeMsg, setAnalyzeMsg] = useState(null); // { type: 'success' | 'error', text }
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [uncertain, setUncertain] = useState([]); // fields filled with low confidence — user should verify

  // Amber highlight for fields the parser is unsure about
  const uncertainRing = (name) =>
    uncertain.includes(name) ? ' !border-amber-400 !ring-2 !ring-amber-200 !bg-amber-50' : '';
  const [form, setForm] = useState({
    company: '',
    jobTitle: '',
    jobUrl: '',
    status: 'WISHLIST',
    appliedDate: '',
    location: '',
    salary: '',
    source: '',
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    async function load() {
      setFetching(true);
      setError('');
      try {
        const data = await api.getApplication(id);
        const app = data.application;
        if (!app || cancelled) return;
        setForm({
          company: app.company || '',
          jobTitle: app.jobTitle || '',
          jobUrl: app.jobUrl || '',
          status: app.status || 'WISHLIST',
          appliedDate: app.appliedDate ? app.appliedDate.slice(0, 10) : '',
          location: app.location || '',
          salary: app.salary != null ? String(app.salary) : '',
          source: app.source || '',
          notes: app.notes || '',
        });
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load application');
      } finally {
        if (!cancelled) setFetching(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id, isEdit]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setUncertain((prev) => prev.filter((f) => f !== name));
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const FIELD_LABELS = {
    company: 'Company',
    jobTitle: 'Job title',
    location: 'Location',
    salary: 'Salary',
    source: 'Source',
    notes: 'Notes',
  };

  const applySuggestion = (suggestion = {}, detected = [], sourceLabel, confidence = {}, method = 'local') => {
    const safeSuggestion = suggestion || {};
    const filled = [];
    const shaky = [];
    setForm((prev) => {
      const next = { ...prev };
      if (safeSuggestion.jobUrl && !String(prev.jobUrl || '').trim()) next.jobUrl = safeSuggestion.jobUrl;
      for (const key of Object.keys(FIELD_LABELS)) {
        if (safeSuggestion[key] && !String(prev[key] || '').trim()) {
          next[key] = safeSuggestion[key];
          filled.push(FIELD_LABELS[key]);
          if (confidence[key] === 'low') shaky.push(key);
        }
      }
      return next;
    });
    setUncertain(shaky);
    const prefix = method === 'ai' ? 'AI understood' : 'Detected';
    if (detected.length === 0) {
      setAnalyzeMsg({
        type: 'error',
        text: `Could not read details from ${sourceLabel}. Fill the form manually — anything detected was kept.`,
      });
    } else {
      setAnalyzeMsg({
        type: 'success',
        text: `${prefix}: ${filled.length ? filled.join(', ') : 'nothing new (your entries were kept)'}.`
          + (shaky.length ? ` Please double-check: ${shaky.map((k) => FIELD_LABELS[k]).join(',')}.` : ' Review and edit anything before creating.'),
      });
    }
  };

  const handleAnalyze = async (e) => {
    e.preventDefault();
    setAnalyzeMsg(null);
    setUncertain([]);
    if (!jobLink.trim()) {
      setAnalyzeMsg({ type: 'error', text: 'Paste a job link first.' });
      return;
    }
    setAnalyzing(true);
    try {
      const { suggestion, detected, confidence, method } = await api.analyzeJobLink({ url: jobLink.trim() });
      applySuggestion(suggestion, detected, 'that link', confidence, method);
    } catch (err) {
      setAnalyzeMsg({ type: 'error', text: err.message || 'Could not analyze that link.' });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAnalyzeText = async (e) => {
    e.preventDefault();
    setAnalyzeMsg(null);
    setUncertain([]);
    if (!pasteText.trim()) {
      setAnalyzeMsg({ type: 'error', text: 'Paste the posting text first.' });
      return;
    }
    setAnalyzing(true);
    try {
      const payload = { text: pasteText };
      if (jobLink.trim()) payload.url = jobLink.trim();
      const { suggestion, detected, confidence, method } = await api.analyzeJobLink(payload);
      applySuggestion(suggestion, detected, 'that text', confidence, method);
    } catch (err) {
      setAnalyzeMsg({ type: 'error', text: err.message || 'Could not analyze that text.' });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const payload = {
      ...form,
      company: form.company.trim(),
      jobTitle: form.jobTitle.trim(),
      jobUrl: form.jobUrl.trim() || undefined,
      location: form.location.trim() || undefined,
      source: form.source.trim() || undefined,
      notes: form.notes.trim() || undefined,
      appliedDate: form.appliedDate || undefined,
      salary: form.salary !== '' && form.salary != null ? String(form.salary).trim() || undefined : undefined,
    };
    // Remove empty strings to avoid backend validation issues
    Object.keys(payload).forEach((k) => payload[k] === '' && delete payload[k]);
    try {
      if (isEdit) {
        await api.updateApplication(id, payload);
        navigate(`/applications/${id}`);
      } else {
        await api.createApplication(payload);
        navigate('/board');
      }
    } catch (err) {
      const msg = err.data?.error || err.data?.errors?.map((x) => x.msg).join(', ') || err.message || 'Failed to save application';
      setError(msg);
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (window.history.length > 2) navigate(-1);
    else navigate(isEdit ? `/applications/${id}` : '/board');
  };

  if (fetching) {
    return (
      <div className="flex justify-center py-20" role="status" aria-live="polite">
        <div className="spinner" aria-label="Loading application" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-900">{isEdit ? 'Edit Application' : 'New Application'}</h2>
        <p className="text-gray-500 mt-1">
          {isEdit ? 'Update your job application' : 'Add a new job application to track'}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Have a job link? Auto-fill the form</h3>
        <p className="text-sm text-gray-500 mb-3">
          Paste the posting URL (or its text below) and we'll understand what was applied for — title, company,
          location, salary. Guesses are highlighted amber for a quick double-check. Edit anything after.
        </p>
        {analyzeMsg && (
          <div className={`mb-3 p-3 text-sm rounded-lg border ${
            analyzeMsg.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            {analyzeMsg.text}
          </div>
        )}
        <form onSubmit={handleAnalyze} className="flex gap-2">
          <input
            type="url"
            value={jobLink}
            onChange={(e) => setJobLink(e.target.value)}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition"
            placeholder="https://company.com/careers/job-posting..."
          />
          <button
            type="submit"
            disabled={analyzing}
            className="px-4 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {analyzing ? 'Reading…' : 'Analyze link'}
          </button>
        </form>
        <button
          type="button"
          onClick={() => setShowPaste((v) => !v)}
          className="mt-2 text-sm text-primary-600 hover:underline font-medium"
        >
          {showPaste ? 'Hide text pasting' : 'Site blocked it? Paste the posting text instead'}
        </button>
        {showPaste && (
          <form onSubmit={handleAnalyzeText} className="mt-2 space-y-2">
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={6}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition resize-y"
              placeholder="Copy the job posting (title, company, location, salary, description) and paste it here…"
            />
            <button
              type="submit"
              disabled={analyzing}
              className="px-4 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {analyzing ? 'Reading…' : 'Analyze pasted text'}
            </button>
          </form>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Company */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Company <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="company"
                value={form.company}
                onChange={handleChange}
                className={"w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition" + uncertainRing('company')}
                placeholder="e.g. Google, Microsoft, Startup Inc."
                required
              />
            </div>

            {/* Job Title */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Job Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="jobTitle"
                value={form.jobTitle}
                onChange={handleChange}
                className={"w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition" + uncertainRing('jobTitle')}
                placeholder="e.g. Software Engineer, Product Manager"
                required
              />
            </div>

            {/* Job URL */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Job URL
              </label>
              <input
                type="url"
                name="jobUrl"
                value={form.jobUrl}
                onChange={handleChange}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition"
                placeholder="https://..."
              />
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                name="status"
                value={form.status}
                onChange={handleChange}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition bg-white"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Applied Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Applied Date
              </label>
              <input
                type="date"
                name="appliedDate"
                value={form.appliedDate}
                onChange={handleChange}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition"
              />
            </div>

            {/* Location */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Location
              </label>
              <input
                type="text"
                name="location"
                value={form.location}
                onChange={handleChange}
                className={"w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition" + uncertainRing('location')}
                placeholder="e.g. San Francisco, CA or Remote"
              />
            </div>

            {/* Salary */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Salary (optional)
              </label>
              <input
                type="number"
                name="salary"
                value={form.salary}
                onChange={handleChange}
                className={"w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition" + uncertainRing('salary')}
                placeholder="e.g. 150000"
              />
            </div>

            {/* Source */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Source
              </label>
              <input
                type="text"
                name="source"
                value={form.source}
                onChange={handleChange}
                className={"w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition" + uncertainRing('source')}
                placeholder="e.g. LinkedIn, Referral, Indeed"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              name="notes"
              value={form.notes}
              onChange={handleChange}
              rows={4}
              className={"w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition resize-y" + uncertainRing('notes')}
              placeholder="Any notes about this application..."
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2.5 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (isEdit ? 'Saving…' : 'Creating…') : isEdit ? 'Save Changes' : 'Create Application'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
