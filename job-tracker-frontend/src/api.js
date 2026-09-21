// API client — relative paths so it works when Express serves frontend + API together.
// When frontend and backend share one origin, requests go to /api/... automatically.
// Override with VITE_API_URL for separate dev servers.
const BASE = import.meta.env.VITE_API_URL || '';

async function request(path, options = {}) {
  const url = `${BASE}${path}`;
  const hasBody = options.body !== undefined;
  const headers = { ...options.headers };
  if (hasBody) headers['Content-Type'] = 'application/json';
  headers['Accept'] = 'application/json';
  const res = await fetch(url, {
    credentials: 'include',
    headers,
    ...options,
    body: hasBody ? JSON.stringify(options.body) : undefined,
  });

  let data = {};
  try {
    data = await res.json();
  } catch {
    // non-JSON (e.g., HTML error) — try text
    const text = await res.text().catch(() => '');
    data = text ? { error: text.slice(0, 500) } : {};
  }
  if (!res.ok) {
    const msg = data.error || data.message || (Array.isArray(data.errors) ? data.errors.map((e) => e.msg).join(', ') : null) || 'Request failed';
    throw Object.assign(new Error(msg), { status: res.status, data });
  }
  return data;
}

export const api = {
  // Auth
  signup: (body) => request('/api/auth/signup', { method: 'POST', body }),
  login: (body) => request('/api/auth/login', { method: 'POST', body }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  me: () => request('/api/auth/me'),
  forgotPassword: (body) => request('/api/auth/forgot-password', { method: 'POST', body }),
  resetPassword: (body) => request('/api/auth/reset-password', { method: 'POST', body }),

  // Applications
  getApplications: (params) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/applications${qs ? '?' + qs : ''}`);
  },
  getApplication: (id) => request(`/api/applications/${id}`),
  createApplication: (body) => request('/api/applications', { method: 'POST', body }),
  analyzeJobLink: (body) => request('/api/applications/analyze', { method: 'POST', body }),
  updateApplication: (id, body) => request(`/api/applications/${id}`, { method: 'PUT', body }),
  deleteApplication: (id) => request(`/api/applications/${id}`, { method: 'DELETE' }),
  changeStatus: (id, body) => request(`/api/applications/${id}/status`, { method: 'PATCH', body }),

  // Reminders
  getReminders: () => request('/api/reminders'),
  createReminder: (body) => request('/api/reminders', { method: 'POST', body }),
  toggleReminder: (id, body) => request(`/api/reminders/${id}`, { method: 'PATCH', body }),
  deleteReminder: (id) => request(`/api/reminders/${id}`, { method: 'DELETE' }),

  // Analytics
  getDashboard: () => request('/api/analytics/dashboard'),
};
