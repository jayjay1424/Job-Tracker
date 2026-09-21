// Optional LLM understanding for job postings (OpenAI-compatible API).
// Inactive unless AI_API_KEY is set — otherwise the local smart parser is used.
// Works with OpenAI, Groq, DeepSeek, OpenRouter, Ollama, or any server that
// speaks POST {baseURL}/chat/completions. See .env.example for setup.
//
// Accuracy design:
//   - Structured page facts (JSON-LD / URL inference) are passed in as a hint
//     so the model cross-checks instead of guessing blind.
//   - Fields that agree with those facts get 'high' confidence; everything
//     else is 'medium' so the UI asks the user to verify.
//   - Strict validation drops invented-looking values (job-board names as
//     company, salary without numbers, title echoing the company).

const AI_TIMEOUT_MS = 25000;

function aiConfig() {
  if (!process.env.AI_API_KEY) return null;
  return {
    apiKey: process.env.AI_API_KEY,
    baseURL: (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    model: process.env.AI_MODEL || 'gpt-4o-mini',
    // Some providers/models reject response_format — set AI_JSON_MODE=false
    // to skip it, or leave on for automatic retry without it.
    jsonMode: process.env.AI_JSON_MODE !== 'false',
  };
}

function sanitize(value, max = 300) {
  if (value === null || value === undefined) return null;
  const v = String(value).trim().replace(/\s+/g, ' ');
  if (!v || /^n\/?a$/i.test(v) || /^unknown$/i.test(v) || /^none$/i.test(v)) return null;
  return v.length > max ? v.slice(0, max).trim() : v;
}

function norm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function agrees(a, b) {
  if (!a || !b) return false;
  const na = norm(a);
  const nb = norm(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

const SYSTEM_PROMPT = `You extract structured fields from a job posting for a job-application tracker. Reply with ONLY a JSON object with exactly these string-or-null keys: company, jobTitle, location, salary, notes.

Rules — follow them strictly:
1. company: the EMPLOYER hiring for the role only (e.g. "Acme Corp"). Never a job board (LinkedIn, Indeed, Glassdoor, JobStreet, Kalibrr), never a recruiter mentioned in passing unless they are clearly the hiring employer. Strip suffixes like "Careers", "Jobs", "Hiring".
2. jobTitle: the role title only (e.g. "Senior Software Engineer"). No company name, no location, no arrangement words (Remote/Hybrid), no requisition IDs, no site names like "| LinkedIn".
3. location: city/region/country as written, or "Remote", "Hybrid", "On-site". Prefer combos like "Remote - Philippines" or "Hybrid - Makati" when both appear. Never invent a city.
4. salary: the pay EXACTLY as written (e.g. "₱80,000 - ₱100,000 per month"). Must contain a number — otherwise null. Never convert currencies or periods, never invent ranges.
5. notes: one short neutral summary (what the role does) under 400 chars, or null if there is no description.
6. NEVER invent values. When unsure, use null — an empty field is better than a wrong one.
7. Facts from the page metadata are given below under KNOWN FACTS. Trust them unless the posting text clearly contradicts them; prefer them over your own guess for the same field.

Example:
Posting: "Acme Corp is hiring a Senior Backend Engineer. Location: Hybrid - Taguig. Pay: ₱120,000 per month. You will build payment APIs."
{"company":"Acme Corp","jobTitle":"Senior Backend Engineer","location":"Hybrid - Taguig","salary":"₱120,000 per month","notes":"Backend engineer building payment APIs at Acme Corp."}`;

function buildUserContent(text, url, pageHint) {
  const parts = [`Posting URL: ${url || 'unknown'}`];
  if (pageHint && Object.values(pageHint).some(Boolean)) {
    const facts = ['company', 'jobTitle', 'location', 'salary']
      .filter((k) => pageHint[k])
      .map((k) => `${k}: ${pageHint[k]}`)
      .join('\n');
    if (facts) parts.push(`KNOWN FACTS (from page metadata, trust unless contradicted):\n${facts}`);
  }
  parts.push(`Posting text:\n${text}`);
  return parts.join('\n\n');
}

function parseJsonLoose(raw) {
  if (!raw) return null;
  const cleaned = String(raw).replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch { /* try to salvage */ }
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[0]);
    } catch { /* give up */ }
  }
  return null;
}

async function callChat(cfg, body, useJsonMode) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
  try {
    const payload = {
      model: cfg.model,
      temperature: 0,
      max_tokens: 700,
      messages: body,
    };
    if (useJsonMode) payload.response_format = { type: 'json_object' };
    const res = await fetch(`${cfg.baseURL}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function tryAiExtract(text, url, opts = {}) {
  const cfg = aiConfig();
  if (!cfg) return null;

  const clipped = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 12000);
  if (!clipped) return null;

  const pageHint = opts.pageHint || null;

  try {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserContent(clipped, url, pageHint) },
    ];
    let res = await callChat(cfg, messages, cfg.jsonMode);
    // Some providers reject response_format — retry once without it.
    if (!res.ok && cfg.jsonMode && [400, 422].includes(res.status)) {
      res = await callChat(cfg, messages, false);
    }
    if (!res.ok) {
      console.error('AI extract: provider responded', res.status);
      return null;
    }
    const data = await res.json();
    const parsed = parseJsonLoose(data.choices?.[0]?.message?.content);
    if (!parsed) return null;

    const { isJobBoardName } = require('./smartExtract');
    const { smartExtractText } = require('./smartExtract');

    let company = sanitize(parsed.company, 70);
    if (company && isJobBoardName(company)) company = null;
    let jobTitle = sanitize(parsed.jobTitle, 90);
    if (jobTitle && company && agrees(jobTitle, company)) jobTitle = null;
    if (jobTitle && /(linkedin|indeed|glassdoor|jobstreet|kalibrr)\b/i.test(jobTitle)) {
      jobTitle = jobTitle.replace(/\s*[|｜·•-]\s*(linkedin|indeed|glassdoor|jobstreet|kalibrr).*$/i, '').trim() || null;
    }
    let salary = sanitize(parsed.salary, 60);
    if (salary && !/\d/.test(salary)) salary = null;

    const fallbackSource = smartExtractText('', url).suggestion.source;
    const suggestion = {
      company,
      jobTitle,
      jobUrl: url || null,
      location: sanitize(parsed.location, 80),
      salary,
      source: fallbackSource,
      notes: sanitize(parsed.notes, 400),
    };
    const detected = Object.entries(suggestion)
      .filter(([k, v]) => k !== 'jobUrl' && k !== 'source' && v)
      .map(([k]) => k);
    if (detected.length === 0) return null;

    // Confidence: 'high' only when the model agrees with independent page
    // facts; otherwise 'medium' so the UI asks for a quick verify.
    const confidence = {};
    for (const k of detected) {
      confidence[k] = pageHint && pageHint[k] && agrees(suggestion[k], pageHint[k]) ? 'high' : 'medium';
    }
    return { suggestion, detected, confidence, method: 'ai' };
  } catch (err) {
    console.error('AI extract failed, falling back to local parser:', err.message);
    return null;
  }
}

module.exports = { tryAiExtract, aiConfig };
