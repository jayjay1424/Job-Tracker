// Smart posting-text understanding — no AI key needed.
// Multi-pass, scored extraction: labels beat patterns, patterns beat guesses.
// Every field carries a confidence ('high' | 'medium' | 'low') so the UI can
// ask the user to double-check shaky guesses.

function hostSource(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function cleanCandidate(s, maxWords = 6, maxLen = 70) {
  if (!s) return null;
  let v = String(s).trim().replace(/\s+/g, ' ').replace(/[.\u2026,;:!?]+$/, '').trim();
  if (!v || v.length > maxLen || v.split(' ').length > maxWords) return null;
  // Reject sentence-like leftovers
  if (/^(we|you|they|it|this|that|join|apply|send|email|please|must|will|are|is)\b/i.test(v)) return null;
  return v || null;
}

function prettifyDomain(domain) {
  const base = domain.split('.')[0].replace(/[-_]+/g, ' ').trim();
  return base.replace(/\b\w/g, (c) => c.toUpperCase()) || null;
}

const FREE_MAIL = new Set(['gmail', 'yahoo', 'outlook', 'hotmail', 'live', 'icloud', 'aol', 'protonmail', 'zoho', 'mail', 'email']);

// Job-board names that sometimes leak into pasted titles ("X | LinkedIn") —
// they are never the hiring company.
const JOB_BOARDS = new Set([
  'linkedin', 'indeed', 'glassdoor', 'jobstreet', 'kalibrr', 'monster',
  'ziprecruiter', 'simplyhired', 'dice', 'builtin', 'wellfound', 'angellist',
  'totaljobs', 'reed', 'seek', 'foundit', 'naukri', 'timesjobs', 'bossjob',
  'hiredly', 'pinoyjobs', 'mynimo', 'trabaho', 'jobable', 'snagajob',
  'greenhouse', 'lever', 'ashby', 'workable', 'workday',
]);

function isJobBoardName(s) {
  if (!s) return false;
  const norm = String(s).toLowerCase().replace(/[^a-z]/g, '');
  return JOB_BOARDS.has(norm);
}

function splitLines(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 300);
}

function labelValue(line) {
  const m = line.match(/^([^:|\-–—]{2,40})\s*[:|\-–—]\s*(.+)$/);
  if (!m) return null;
  const label = m[1].trim();
  // A real label is words — reject amounts/sentences ("Pay is ₱90k", "2+ years: ...")
  if (/[\d₱$€£₹]/.test(label)) return null;
  const lower = label.toLowerCase();
  return { label: lower, value: m[2].trim() };
}

// ─── Headline helpers ───────────────────────────────────────────────
// Pasted postings often start with a headline like:
//   "Senior Engineer at Acme" | "Senior Engineer | Acme" |
//   "Senior Engineer - Remote" | "Senior Engineer (Makati)" |
//   "ACME: Senior Engineer" | "Senior Engineer | LinkedIn"
function stripHeadlineNoise(line) {
  return String(line || '')
    .replace(/\s+[|｜·•]\s*(linkedin|indeed|glassdoor|jobstreet|kalibrr|monster|ziprecruiter|simplyhired|dice)\s*$/i, '')
    .replace(/\s*[-–—]\s*(req(uisition)?|job|ref(erence)?|id|no)\.?\s*#?\s*:?\s*[a-z0-9\-/]+$/i, '')
    .replace(/\s*\(\s*(req(uisition)?|job|ref|id|no)\.?\s*#?\s*:?\s*[a-z0-9\-/]+\s*\)$/i, '')
    .replace(/^(urgent(ly)?\s+)?(hiring( now)?!*|we'?re hiring!*|apply now!*)\s*[:–—-]?\s*/i, '')
    .trim();
}

// "Title | Company" or "Company: Title" headline pair. Returns { title, company? }
function splitHeadlinePair(line) {
  const clean = stripHeadlineNoise(line);
  // Guard: either side looking like a form label means this isn't a pair
  // ("Job Title: X", "Location: Y", "X | Remote").
  const LABEL_GUARD = /(job|position|role|vacancy|opening|hiring|title|company|location|salary|pay|description|about|responsibilities|requirements?|qualifications?|benefits?|how to apply|remote|hybrid|on-?site|wfh)\b/i;
  let m = clean.match(/^(.+?)\s*[|｜·•]\s*([A-Z0-9][\s\S]{1,60})$/);
  if (m) {
    if (LABEL_GUARD.test(m[1]) || LABEL_GUARD.test(m[2])) return null;
    const right = m[2].replace(/\s+(careers?|jobs?|hiring|talent)$/i, '').trim();
    if (isJobBoardName(right)) return { title: m[1].trim() };
    return { title: m[1].trim(), company: right };
  }
  m = clean.match(/^([A-Z][\w&.'’\-]*(?:\s+[A-Z][\w&.'’\-]*){0,4})\s*:\s*([^:]{2,90})$/);
  if (m && !LABEL_GUARD.test(m[1]) && !isJobBoardName(m[1])) return { title: m[2].trim(), company: m[1].trim() };
  return null;
}

// Trailing work-arrangement tacked onto a headline: "X - Remote", "X (Hybrid)"
function stripArrangementSuffix(line) {
  const m = String(line || '').match(/^(.+?)\s*[-–—]\s*(remote|hybrid|on-?site|wfh|work\s+from\s+home)\s*$/i)
    || String(line || '').match(/^(.+?)\s*\(\s*(remote|hybrid|on-?site|wfh|work\s+from\s+home)[^)]*\)\s*$/i);
  return m ? { title: m[1].trim(), arrangement: m[2].trim() } : null;
}

// ─── Title ────────────────────────────────────────────────────────────
function findTitle(lines) {
  // 0. "Title | Company" / "Company: Title" headline pair
  const pair = splitHeadlinePair(lines[0] || '');
  if (pair && pair.title) {
    const v = cleanCandidate(pair.title, 8, 90);
    if (v) return { value: v, confidence: 'medium', companyHint: pair.company || null };
  }
  // 1. Explicit labels
  for (const line of lines.slice(0, 40)) {
    const lv = labelValue(line);
    if (lv && /(job\s*title|position(\s*title)?|role(\s*title)?|vacancy|opening|hiring(\s*for)?|job\s*opening|job\s*name|title\s*of\s*position)\b/.test(lv.label) && !/\b(title|position|role)\s*only\b/.test(lv.label) && !/(company|companys|organization|organisation|employer)\b/.test(lv.label)) {
      const v = cleanCandidate(lv.value.replace(/^["“”']+|["“”']+$/g, ''), 8, 90);
      if (v) return { value: v, confidence: 'high' };
    }
  }
  const first = stripHeadlineNoise(lines[0] || '');
  const second = stripHeadlineNoise(lines[1] || '');
  // 2. "We're hiring a X" / "Hiring: X" / "Looking for a X" / "Need X"
  //    (periods inside words like "Node.js" are kept)
  const hirePatterns = [
    /(?:we'?re\s+hiring|hiring|looking\s+for|in\s+need\s+of|need(?:s|ed)?|recruiting|join\s+us\s+as)\s*(?:an?\s+|the\s+)?((?:[^.,!|\n]|\.(?!\s|$)){3,80})/i,
  ];
  const stripTail = (s) => s
    .replace(/\s+to\s+join\b.*$/i, '')
    .replace(/\s+for\s+our\b.*$/i, '')
    .replace(/\s+(with|who|that|which|including)\b.*$/i, '')
    .trim();
  for (const re of hirePatterns) {
    const m = first.match(re) || second.match(re);
    if (m) {
      const v = cleanCandidate(stripTail(m[1]), 8, 90);
      if (v) return { value: v, confidence: 'medium' };
    }
  }
  // 2b. Trailing arrangement on the headline doubles as title cleanup
  const arr = stripArrangementSuffix(first);
  if (arr) {
    const v = cleanCandidate(arr.title, 8, 90);
    if (v) return { value: v, confidence: 'medium', arrangementHint: arr.arrangement };
  }
  // 3. "Title at Company" headline
  const at = first.match(/^(.+?)\s+at\s+([A-Z0-9][\s\S]*)$/);
  if (at) {
    const v = cleanCandidate(at[1], 8, 90);
    if (v) return { value: v, confidence: 'medium' };
  }
  // 4. First headline-like line (skip shout-outs like "URGENT HIRING!!")
  const CTA = /^(urgent|hir(e|ing)|apply|send|email|contact|dm|pm|comment|share|tag|looking)\b/i;
  for (const line of lines.slice(0, 5)) {
    const cleaned = stripHeadlineNoise(line);
    if (cleaned.length <= 85 && !labelValue(cleaned) && !CTA.test(cleaned) && /[a-zA-Z]{3,}/.test(cleaned)) {
      const v = cleanCandidate(cleaned, 8, 90);
      if (v) return { value: v, confidence: 'low' };
    }
  }
  return { value: null, confidence: 'low' };
}

// ─── Company ──────────────────────────────────────────────────────────
function findCompany(lines, titleLine, hints = {}) {
  // 0. Headline pair hint ("Title | Company" / "Company: Title")
  if (hints.companyHint) {
    const v = cleanCandidate(hints.companyHint);
    if (v && !isJobBoardName(v)) return { value: v, confidence: 'medium' };
  }
  // 1. Explicit labels (bare "Hiring:" is a title cue, not a company — the
  //    company form needs a qualifier: "Hiring Company:", "Hiring Organization:")
  for (const line of lines.slice(0, 60)) {
    const lv = labelValue(line);
    if (lv && /(company(\s*name)?|hiring\s+(company|organization)|organization(\s*name)?|organisation|employer(\s*name)?|client|firm|business(\s*name)?|startup)\b/.test(lv.label)) {
      const v = cleanCandidate(lv.value);
      if (v && !isJobBoardName(v)) return { value: v, confidence: 'high' };
    }
  }
  const head = [lines[0] || '', lines[1] || '', lines[2] || ''].join('\n');
  // 2. "X is hiring / are hiring / is looking for"
  let m = head.match(/\b([A-Z][\w&.'’\-]*(?:\s+[A-Z][\w&.'’\-]*){0,4})\s+(?:is|are)\s+(?:hiring|looking\s+for|recruiting)\b/);
  if (m) {
    const v = cleanCandidate(m[1].replace(/['’]s$/i, ''));
    if (v) return { value: v, confidence: 'high' };
  }
  // 3. "at Company" in the title line (board suffixes like "| LinkedIn" stripped)
  const tl = String(titleLine || '').replace(/\s*[|｜·•]\s*[A-Za-z][\s\S]*$/, '');
  m = tl.match(/\s+at\s+([A-Z0-9][\w&'’\-]*(?:\s+[A-Z][\w&'’\-]*){0,4})\s*$/);
  if (m) {
    const v = cleanCandidate(m[1]);
    if (v && !isJobBoardName(v)) return { value: v, confidence: 'medium' };
  }
  // 4. "join X's team" / "join X"
  m = head.match(/\bjoin\s+([A-Z][\w&.'’\-]*(?:\s+[A-Z][\w&.'’\-]*){0,3})(?:'s)?\s+team\b/i)
    || head.match(/\bjoin\s+(?:our\s+team\s+at\s+)?([A-Z][\w&.'’\-]*(?:\s+[A-Z][\w&.'’\-]*){0,3})\b/);
  if (m) {
    const v = cleanCandidate(m[1].replace(/['’]s$/i, ''));
    if (v && !/^(our|the|us|me)\b/i.test(v)) return { value: v, confidence: 'medium' };
  }
  // 5. "About X" section header
  m = head.match(/^about\s+([A-Z][\w&.'’\-]*(?:\s+[A-Z][\w&.'’\-]*){0,4})$/im);
  if (m) {
    const v = cleanCandidate(m[1]);
    if (v && !/^(us|the\s+(company|role|job|team)|this)\b/i.test(v)) return { value: v, confidence: 'medium' };
  }
  // 6. "About Us: DevForge is a ..." -> DevForge
  const body = lines.join('\n');
  m = body.match(/\babout\s+us\s*:?\s*([A-Z][\w&.'’\-]*(?:\s+[A-Z][\w&.'’\-]*){0,3})\s+is\s+a\b/i);
  if (m) {
    const v = cleanCandidate(m[1].replace(/['’]s$/i, ''));
    if (v) return { value: v, confidence: 'medium' };
  }
  // 6b. "X is an equal opportunity employer" -> X
  m = body.match(/\b([A-Z][\w&.'’\-]*(?:\s+[A-Z][\w&.'’\-]*){0,3})\s+is\s+an?\s+equal\s+opportunity\s+employer\b/);
  if (m) {
    const v = cleanCandidate(m[1]);
    if (v && !/^(we|an?)$/i.test(v)) return { value: v, confidence: 'medium' };
  }
  // 6c. Copyright / rights footer: "© 2025 Acme Corp", "Copyright Acme. All rights reserved"
  m = body.match(/(?:©|\(c\)|copyright)\s*(?:\d{4}(?:\s*[-–—]\s*\d{4})?\s*)?([A-Z][\w&.'’\-]*(?:\s+[A-Z][\w&.'’\-]*){0,3})/i)
    || body.match(/\b([A-Z][\w&.'’\-]*(?:\s+[A-Z][\w&.'’\-]*){0,3})\s+all\s+rights\s+reserved\b/i);
  if (m) {
    const v = cleanCandidate(m[1]);
    if (v && !isJobBoardName(v)) return { value: v, confidence: 'low' };
  }
  // 7. Work email domain (acme-corp.com -> Acme Corp), skipping free mail
  const full = lines.join('\n');
  const emails = [...full.matchAll(/[\w.+-]+@([\w-]+)\.(\w[\w.]*)/g)];
  for (const e of emails) {
    const domain = e[1].toLowerCase();
    if (!FREE_MAIL.has(domain)) {
      const v = prettifyDomain(domain + '.' + e[2]);
      if (v) return { value: v, confidence: 'low' };
    }
  }
  return { value: null, confidence: 'low' };
}

// ─── Location ─────────────────────────────────────────────────────────
function findLocation(lines, hints = {}) {
  // 0. Arrangement hint from the headline ("X - Remote") upgrades a bare
  //    arrangement keyword found in the body into "Remote" instead of null.
  for (const line of lines.slice(0, 60)) {
    const lv = labelValue(line);
    if (lv && /(job\s*location|posting\s*location|location|work\s*location|office(\s*location)?|work\s*setup|work\s*arrangement|work\s*mode|base(d)?\s*(in|at)?|workplace|region|area)\b/.test(lv.label)) {
      const v = cleanCandidate(lv.value, 10, 80);
      if (v) return { value: v, confidence: 'high' };
    }
  }
  const full = lines.join('\n');
  // "Remote - Makati" / "Hybrid (Taguig)" / "Onsite: Cebu" combos
  let m = full.match(/\b(remote|hybrid|on-?site|wfh|work\s+from\s+home)\s*[-–—(),:]*\s*([A-Z][\w'\-]*(?:\s+[A-Z][\w'\-]*){0,3})/i);
  if (m && !/^(work|team|job|role|position|set|up|and|or|with|for|from)$/i.test(m[2])) {
    const w = m[1].toLowerCase().replace(/\s+/g, ' ');
    const pretty = w.startsWith('on') ? 'On-site' : w === 'wfh' || w.startsWith('work') ? 'Remote' : w[0].toUpperCase() + w.slice(1);
    const v = cleanCandidate(`${pretty} - ${m[2].trim()}`, 10, 80);
    if (v) return { value: v, confidence: 'medium' };
  }
  // "based in X" / "located in X" / "work from X" / "office in X" / "X-based" / "team in X"
  // (periods excluded from names so captures stop at sentence ends)
  m = full.match(/\b(?:based|located|stationed)\s+in\s+([A-Z][\w'\-]*(?:\s+[A-Z][\w'\-]*){0,3})/)
    || full.match(/\bwork\s+from\s+(?:our\s+)?([A-Z][\w'\-]*(?:\s+[A-Z][\w'\-]*){0,3})/)
    || full.match(/\boffice\s+in\s+([A-Z][\w'\-]*(?:\s+[A-Z][\w'\-]*){0,3})/)
    || full.match(/\b([A-Z][\w'\-]+(?:\s+[A-Z][\w'\-]+){0,2})-based\b/)
    || full.match(/\b(?:team|role|position)\s+in\s+([A-Z][\w'\-]*(?:\s+[A-Z][\w'\-]*){0,2})/);
  if (m) {
    const v = cleanCandidate(m[1], 8, 80);
    if (v) return { value: v, confidence: 'medium' };
  }
  // "City, Country" / "City, ST" / "City, ST 12345"
  m = full.match(/\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,2},\s+[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?(?:\s+\d{4,5}(?:-\d{4})?)?)\b/);
  if (m) {
    const v = cleanCandidate(m[1], 10, 80);
    if (v) return { value: v, confidence: 'medium' };
  }
  // "X City" / "X Province" (e.g. Makati City, Cebu Province)
  m = full.match(/\b([A-Z][\w'\-]+(?:\s+[A-Z][\w'\-]+){0,2}\s+(?:City|Province))\b/);
  if (m) {
    const v = cleanCandidate(m[1], 8, 80);
    if (v) return { value: v, confidence: 'medium' };
  }
  // Arrangement keyword
  m = full.match(/\b(remote|hybrid|on-?site|wfh|work\s+from\s+home)\b/i)
    || (hints.arrangementHint || '').match(/\b(remote|hybrid|on-?site|wfh)\b/i);
  if (m) {
    const w = m[1].toLowerCase().replace(/\s+/g, ' ');
    const pretty = w.startsWith('on') ? 'On-site' : w === 'wfh' || w.startsWith('work') ? 'Remote' : w[0].toUpperCase() + w.slice(1);
    return { value: pretty, confidence: 'low' };
  }
  return { value: null, confidence: 'low' };
}

// ─── Salary ───────────────────────────────────────────────────────────
const CURR = '(?:₱|PHP|\\$|USD|US\\$|€|EUR|£|GBP|₹|INR|RM|MYR|S\\$|¥|JPY|₩|KRW|CNY|C\\$|CAD|A\\$|AUD|SGD|HK\\$|HKD|NT\\$|TWD|CHF|kr|SEK|NOK|DKK|zł|PLN|R\\$|BRL|MXN|₺|TRY|AED|SAR|QAR|KWD|Rp|IDR|฿|THB|₫|VND|PKR|BDT|LKR|NPR|MMK|NGN|KES|EGP|ZAR)';
const SALARY_RES = [
  // ₱80,000 - ₱120,000 per month / $5,000/mo / 50000 USD per year
  new RegExp(`((?:${CURR})\\s?[\\d,]+(?:\\.\\d+)?\\s?[kK]?(?:\\s?(?:[-–—]|to)\\s?(?:(?:${CURR})\\s?)?[\\d,]+(?:\\.\\d+)?\\s?[kK]?)?\\s?(?:per\\s|\\/\\s?)?(?:month|mo|year|yr|annum|hour|hr|week|wk|day)?)`),
  // 30000 PHP per month / 80k PHP (currency word after the number)
  /\b([\d,]+(?:\.\d+)?\s?[kK]?\s?(?:PHP|USD|EUR|GBP|INR|RM|MYR|JPY|KRW|SGD|CAD|AUD|HKD|TWD|CHF|PLN|BRL|MXN|AED|SAR|IDR|THB|VND|PKR|BDT|ZAR)(?:\s?(?:per\s|\/\s?)?(?:month|mo|year|yr|annum|hour|hr|week|day))?)/,
  // up to ₱X / starting at 30000 PHP / from X per month
  new RegExp(`\\b((?:up\\s+to|starting\\s+at|from)\\s+(?:(?:${CURR})\\s?)?[\\d,]+(?:\\.\\d+)?\\s?[kK]?(?:\\s?(?:PHP|USD|EUR|GBP|INR|RM|MYR|JPY|KRW|SGD|CAD|AUD))?(?:\\s?(?:per\\s|\\/\\s?)?(?:month|mo|year|yr|annum|hour|hr))?)`, 'i'),
];

// "Salary: Negotiable" style non-values — better left empty than filled with junk
const SALARY_JUNK = /^(negotiable|competitive|depends|depending|doe|tbd|tba|n\/a|market(\s*rate)?|to\s*be\s*(discussed|determined|advised)|unpaid|unpaid\s*internship|commission(\s*only)?(\s*based)?)$/i;

function findSalary(lines) {
  for (const line of lines.slice(0, 80)) {
    const lv = labelValue(line);
    if (lv && /(salary(\s*range)?|compensation|base\s*pay|pay(\s*range)?|rate|remuneration|package|wage|stipend)\b/.test(lv.label)) {
      if (SALARY_JUNK.test(lv.value.trim())) return { value: null, confidence: 'low' };
      const v = cleanCandidate(lv.value, 10, 90);
      if (v) return { value: v, confidence: 'high' };
    }
  }
  const full = lines.join('\n');
  for (const re of SALARY_RES) {
    const m = full.match(re);
    if (m && /\d/.test(m[1])) {
      const v = m[1].trim().replace(/\s+/g, ' ');
      if (v.length <= 60) return { value: v, confidence: 'medium' };
    }
  }
  return { value: null, confidence: 'low' };
}

// ─── Notes (best description section) ─────────────────────────────────
// Ordered: real description sections first, company blurbs last.
const DESC_HEADERS_PRIMARY = ['job description', 'about the role', 'the role', 'about the job', 'overview', 'the opportunity', 'role overview', 'position overview', 'job overview'];
const DESC_HEADERS_SECONDARY = ['description', 'what you will do', 'what you\u2019ll do', 'responsibilities', 'key responsibilities', 'your role', 'the position'];

function sectionBody(lines, i) {
  const body = [];
  for (let j = i + 1; j < lines.length && body.join(' ').length < 600; j++) {
    if (lines[j].length < 70 && /^[A-Z][\w\s&/,-]{2,60}:?$/.test(lines[j]) && /(qualification|requirement|benefit|how to apply|about|nice to|preferred|what we|salary|location|company)/i.test(lines[j])) break;
    body.push(lines[j]);
  }
  const text = body.join(' ').replace(/\s+/g, ' ').trim();
  return text.length > 40 ? text : null;
}

function findNotes(lines, full) {
  const norm = (l) => l.toLowerCase().replace(/[:\s]+$/, '');
  for (const group of [DESC_HEADERS_PRIMARY, DESC_HEADERS_SECONDARY]) {
    for (let i = 0; i < lines.length; i++) {
      if (group.includes(norm(lines[i]))) {
        const text = sectionBody(lines, i);
        if (text) {
          return { value: text.length > 400 ? text.slice(0, 400).trim() + '…' : text, confidence: 'medium' };
        }
      }
    }
  }
  const flat = full.replace(/\s+/g, ' ').trim();
  if (!flat) return { value: null, confidence: 'low' };
  return { value: flat.length > 400 ? flat.slice(0, 400).trim() + '…' : flat, confidence: 'low' };
}

// ─── Main ─────────────────────────────────────────────────────────────
function smartExtractText(text, url) {
  const full = String(text || '').replace(/\r/g, '').slice(0, 20000);
  const lines = splitLines(full);

  const suggestion = {
    company: null,
    jobTitle: null,
    jobUrl: url || null,
    location: null,
    salary: null,
    source: url ? hostSource(url) : null,
    notes: null,
  };
  const confidence = {};

  if (lines.length === 0) {
    return { suggestion, detected: [], confidence, method: 'local' };
  }

  const title = findTitle(lines);
  if (title.value) { suggestion.jobTitle = title.value; confidence.jobTitle = title.confidence; }

  // Raw headline (not the cleaned title) so "Title at Company" still resolves
  const company = findCompany(lines, lines[0], { companyHint: title.companyHint });
  if (company.value) { suggestion.company = company.value; confidence.company = company.confidence; }

  const location = findLocation(lines, { arrangementHint: title.arrangementHint });
  if (location.value) { suggestion.location = location.value; confidence.location = location.confidence; }

  const salary = findSalary(lines);
  if (salary.value) { suggestion.salary = salary.value; confidence.salary = salary.confidence; }

  const notes = findNotes(lines, full);
  if (notes.value) { suggestion.notes = notes.value; confidence.notes = notes.confidence; }

  const detected = Object.entries(suggestion)
    .filter(([k, v]) => k !== 'jobUrl' && k !== 'source' && v)
    .map(([k]) => k);

  return { suggestion, detected, confidence, method: 'local' };
}

module.exports = { smartExtractText, isJobBoardName };
