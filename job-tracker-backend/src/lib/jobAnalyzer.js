// Job-link analyzer — fetches a job posting URL and extracts structured details.
// Strategy (best-effort, no dependencies):
//   1. JSON-LD <script type="application/ld+json"> with @type JobPosting (most career sites have this)
//   2. Open Graph meta tags (og:title, og:description, og:site_name)
//   3. <title> tag + "Title at Company" heuristic
// Sites that block bots / require login (e.g. LinkedIn) can't be read —
// the caller gets an empty suggestion and the user fills the form manually.

const FETCH_TIMEOUT_MS = 12000;
const MAX_HTML_BYTES = 3 * 1024 * 1024;

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .trim();
}

function stripTags(s) {
  return decodeEntities(
    s.replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim();
}

// ─── JSON-LD ──────────────────────────────────────────────────────────
function findJobPosting(nodes) {
  for (const n of nodes) {
    if (!n || typeof n !== 'object') continue;
    const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type']];
    if (types.includes('JobPosting')) return n;
    if (Array.isArray(n['@graph'])) {
      const found = findJobPosting(n['@graph']);
      if (found) return found;
    }
  }
  return null;
}

function extractJsonLd(html) {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1].trim());
      const found = findJobPosting(Array.isArray(data) ? data : [data]);
      if (found) return found;
    } catch {
      // malformed block — try the next one
    }
  }
  return null;
}

// ─── Meta / title ─────────────────────────────────────────────────────
function metaContent(html, name) {
  // matches <meta property|name="name" content="..."> in either attribute order
  const tagRe = new RegExp(`<meta[^>]*(?:property|name)=["']${name}["'][^>]*>`, 'i');
  const tag = html.match(tagRe);
  if (!tag) return null;
  const c = tag[0].match(/content=(["'])(.*?)\1/i);
  return c ? decodeEntities(c[2].trim()) : null;
}

function pageTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1].trim()) : null;
}

// ─── Field formatters ─────────────────────────────────────────────────
function formatLocation(jobLocation) {
  const locs = Array.isArray(jobLocation) ? jobLocation : [jobLocation];
  const parts = [];
  for (const loc of locs) {
    if (!loc) continue;
    if (typeof loc === 'string') { parts.push(loc); continue; }
    const addr = loc.address || loc;
    if (typeof addr === 'string') { parts.push(addr); continue; }
    if (typeof addr === 'object') {
      const bits = [addr.addressLocality, addr.addressRegion, addr.addressCountry]
        .filter(Boolean);
      const name = loc.name && !bits.includes(loc.name) ? loc.name : null;
      parts.push([name, ...bits].filter(Boolean).join(', '));
    }
  }
  return parts.filter(Boolean).join(' / ') || null;
}

function formatMoneyValue(v, currency) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' || typeof v === 'string') {
    return currency ? `${v} ${currency}` : String(v);
  }
  if (typeof v === 'object') {
    const num = v.minValue !== undefined && v.maxValue !== undefined
      ? `${v.minValue}-${v.maxValue}`
      : (v.value ?? v.minValue ?? v.maxValue ?? null);
    if (num === null) return null;
    const unit = v.unitText ? ` / ${v.unitText}` : '';
    const cur = v.currency || currency;
    return `${num}${cur ? ' ' + cur : ''}${unit}`;
  }
  return null;
}

function formatSalary(baseSalary) {
  if (!baseSalary) return null;
  const items = Array.isArray(baseSalary) ? baseSalary : [baseSalary];
  const out = [];
  for (const s of items) {
    if (!s) continue;
    if (typeof s === 'number' || typeof s === 'string') { out.push(String(s)); continue; }
    const formatted = formatMoneyValue(s.value ?? s, s.currency);
    if (formatted) out.push(formatted);
  }
  return out.join(' / ') || null;
}

function orgName(org) {
  if (!org) return null;
  if (typeof org === 'string') return org;
  if (Array.isArray(org)) return org.map(orgName).filter(Boolean).join(', ') || null;
  return org.name || null;
}

function hostSource(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// "Software Engineer at Acme" -> { title, company }
function splitTitleAt(title) {
  const m = title.match(/^(.+?)\s+at\s+([A-Z0-9][\s\S]*)$/i);
  if (m) return { title: m[1].trim(), company: m[2].trim() };
  return null;
}

// ─── Main extraction (pure — easy to test) ────────────────────────────
function analyzeJobHtml(html, url) {
  const suggestion = {
    company: null,
    jobTitle: null,
    jobUrl: url,
    location: null,
    salary: null,
    source: hostSource(url),
    notes: null,
  };

  // 1. JSON-LD JobPosting (richest source)
  const jp = extractJsonLd(html);
  if (jp) {
    if (jp.title) suggestion.jobTitle = String(jp.title).trim();
    suggestion.company = orgName(jp.hiringOrganization);
    suggestion.location = formatLocation(jp.jobLocation);
    suggestion.salary = formatSalary(jp.baseSalary);
    if (jp.description) {
      const text = stripTags(String(jp.description));
      if (text) suggestion.notes = text.length > 400 ? text.slice(0, 400).trim() + '…' : text;
    }
  }

  // 2. Open Graph fallback
  if (!suggestion.jobTitle) {
    const ogTitle = metaContent(html, 'og:title');
    if (ogTitle) {
      const split = splitTitleAt(ogTitle);
      if (split) {
        suggestion.jobTitle = split.title;
        if (!suggestion.company) suggestion.company = split.company;
      } else {
        suggestion.jobTitle = ogTitle;
      }
    }
  }
  if (!suggestion.company) {
    suggestion.company = metaContent(html, 'og:site_name');
  }
  if (!suggestion.notes) {
    const ogDesc = metaContent(html, 'og:description') || metaContent(html, 'description');
    if (ogDesc) suggestion.notes = ogDesc.length > 400 ? ogDesc.slice(0, 400).trim() + '…' : ogDesc;
  }

  // 3. <title> fallback
  if (!suggestion.jobTitle) {
    const t = pageTitle(html);
    if (t) {
      const split = splitTitleAt(t);
      if (split) {
        suggestion.jobTitle = split.title;
        if (!suggestion.company) suggestion.company = split.company;
      } else if (!/^(home|jobs|careers)$/i.test(t)) {
        suggestion.jobTitle = t.split(/ [|｜·] /)[0].trim();
      }
    }
  }

  const detected = Object.entries(suggestion)
    .filter(([k, v]) => k !== 'jobUrl' && k !== 'source' && v)
    .map(([k]) => k);

  return { suggestion, detected };
}

// ─── Fetch with timeout + size guard ──────────────────────────────────
function isBlockedHost(hostname) {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0' || h === '[::1]') return true;
  if (h === '169.254.169.254' || h === 'metadata.google.internal' || h.endsWith('.metadata.google.internal')) return true;
  // IPv4 private ranges
  if (/^10\.\d+\.\d+\.\d+$/.test(h)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(h)) return true;
  if (/^169\.254\.\d+\.\d+$/.test(h)) return true;
  if (/^0\.\d+\.\d+\.\d+$/.test(h)) return true;
  if (h.endsWith('.localhost')) return true;
  return false;
}

async function fetchJobPage(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw Object.assign(new Error('That does not look like a valid link'), { status: 400 });
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw Object.assign(new Error('Only http(s) links can be analyzed'), { status: 400 });
  }
  if (isBlockedHost(parsed.hostname)) {
    throw Object.assign(new Error('That link is not allowed'), { status: 400 });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Upgrade-Insecure-Requests': '1',
      },
    });
    if (res.status === 403) {
      throw Object.assign(
        new Error('That site blocked automatic reading (status 403). Paste the posting text below instead'),
        { status: 422 }
      );
    }
    if (!res.ok) {
      throw Object.assign(new Error(`The page responded with status ${res.status}`), { status: 422 });
    }
    const contentType = res.headers.get('content-type') || '';
    // Only allow HTML-like responses to avoid fetching binaries
    if (contentType && !/text\/html|application\/xhtml|text\/plain/.test(contentType) && !contentType.includes('text/')) {
      // Allow but log; strict blocking could break some postings that send application/json etc.
      // We enforce size limit anyway
    }
    // Check final URL after redirects for private IP
    try {
      const finalUrl = new URL(res.url);
      if (isBlockedHost(finalUrl.hostname)) {
        throw Object.assign(new Error('That link redirected to a blocked address'), { status: 400 });
      }
    } catch {}
    const len = parseInt(res.headers.get('content-length') || '0', 10);
    if (len > MAX_HTML_BYTES) {
      throw Object.assign(new Error('That page is too large to analyze'), { status: 422 });
    }
    const html = await res.text();
    if (html.length > MAX_HTML_BYTES) {
      throw Object.assign(new Error('That page is too large to analyze'), { status: 422 });
    }
    return html;
  } catch (err) {
    if (err.status) throw err;
    if (err.name === 'AbortError') {
      throw Object.assign(new Error('The page took too long to respond'), { status: 422 });
    }
    throw Object.assign(new Error('Could not reach that link. Check the URL and try again'), { status: 422 });
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { analyzeJobHtml, fetchJobPage, stripTags };
