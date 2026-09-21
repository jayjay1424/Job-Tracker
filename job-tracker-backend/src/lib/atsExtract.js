// URL-based inference for known job boards / ATS platforms.
// Many applicant-tracking systems embed the hiring company (and sometimes the
// role) in the posting URL, which stays readable even when the site blocks
// scraping. This runs before any fetch, so it can fill gaps later with
// 'medium' confidence. Returns { company, jobTitle, source, confidence } —
// any field may be null.

const ATS_HOSTS = [
  { match: /(^|\.)jobs\.lever\.co$/, companyFromPath: 0, source: 'lever.co' },
  { match: /(^|\.)(boards|job-boards)\.greenhouse\.io$/, companyFromPath: 0, source: 'greenhouse.io' },
  { match: /(^|\.)jobs\.ashbyhq\.com$/, companyFromPath: 0, source: 'ashbyhq.com' },
  { match: /(^|\.)apply\.workable\.com$/, companyFromPath: 0, source: 'workable.com' },
  { match: /\.workable\.com$/, companyFromSubdomain: true, source: 'workable.com' },
  { match: /\.breezy\.hr$/, companyFromSubdomain: true, source: 'breezy.hr' },
  { match: /\.recruitee\.com$/, companyFromSubdomain: true, source: 'recruitee.com' },
  { match: /\.jobs\.personio\.de$/, companyFromSubdomain: true, source: 'personio.de' },
  { match: /(^|\.)jobs\.smartrecruiters\.com$/, companyFromPath: 0, source: 'smartrecruiters.com' },
  { match: /\.icims\.com$/, companyFromSubdomain: true, source: 'icims.com' },
  { match: /\.myworkdayjobs\.com$/, companyFromSubdomain: true, source: 'myworkdayjobs.com' },
  { match: /\.wd\d+\.myworkday\.com$/, companyFromSubdomain: true, source: 'myworkday.com' },
  { match: /(^|\.)kalibrr\.com$/, kalibrr: true, source: 'kalibrr.com' },
  { match: /(^|\.)linkedin\.com$/, linkedIn: true, source: 'linkedin.com' },
];

const TWO_PART_SUFFIXES = new Set([
  'com.ph', 'net.ph', 'org.ph', 'co.uk', 'org.uk', 'com.au', 'net.au',
  'co.jp', 'ne.jp', 'com.sg', 'com.my', 'co.in', 'com.hk', 'co.nz',
  'com.br', 'com.mx', 'co.za', 'com.ng', 'com.pk', 'com.bd',
]);

// Site-owned career paths: acme.com/careers/senior-engineer → Acme
const CAREER_FIRST_SEGMENTS = new Set([
  'careers', 'career', 'jobs', 'job', 'vacancies', 'vacancy', 'openings',
  'opening', 'join', 'join-us', 'work-with-us', 'opportunities',
]);

function registrableDomain(hostname) {
  const parts = String(hostname || '').toLowerCase().replace(/^www\./, '').split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');
  const lastTwo = parts.slice(-2).join('.');
  if (TWO_PART_SUFFIXES.has(lastTwo)) return parts.slice(-3).join('.');
  return lastTwo;
}

function prettifySlug(slug) {
  if (!slug) return null;
  let s = String(slug).trim();
  // strip trailing numeric job ids: "...-12345" or "/12345"
  s = s.replace(/[-_](\d{4,})$/, '').replace(/^(\d{4,})[-_]/, '');
  if (!s || /^\d+$/.test(s)) return null;
  const words = s.split(/[-_]+/).filter(Boolean);
  if (words.length === 0 || words.length > 10) return null;
  if (words.some((w) => w.length > 25)) return null;
  return words
    .map((w) => {
      if (/^[A-Z0-9]+$/.test(w) && w.length <= 4) return w; // acronyms: HR, IT, US
      return w[0].toUpperCase() + w.slice(1);
    })
    .join(' ') || null;
}

function prettifyCompanySlug(slug) {
  if (!slug) return null;
  let s = String(slug).trim();
  // camelCase / PascalCase: AcmeCorp -> Acme Corp
  if (!/[-_]/.test(s) && /[a-z][A-Z]/.test(s)) {
    s = s.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    return s.split(/\s+/).map((w) => (/^[A-Z0-9]+$/.test(w) && w.length <= 4 ? w : w[0].toUpperCase() + w.slice(1))).join(' ') || null;
  }
  return prettifySlug(s);
}

function parseLinkedInSlug(pathname) {
  // /jobs/view/senior-software-engineer-at-acme-corp-1234567890
  const m = pathname.match(/\/jobs\/view\/([a-z0-9][a-z0-9\-_]*?)-(\d{6,})\/?$/i);
  if (!m) return {};
  const slug = m[1];
  const atIdx = slug.toLowerCase().lastIndexOf('-at-');
  if (atIdx > 0) {
    return {
      jobTitle: prettifySlug(slug.slice(0, atIdx)),
      company: prettifyCompanySlug(slug.slice(atIdx + 4)),
    };
  }
  return { jobTitle: prettifySlug(slug) };
}

function emptyResult(url) {
  let source = null;
  try {
    source = new URL(url).hostname.replace(/^www\./, '');
  } catch { /* ignore */ }
  return { company: null, jobTitle: null, source, confidence: {} };
}

function inferFromUrl(rawUrl) {
  const out = emptyResult(rawUrl);
  if (!rawUrl) return out;
  let u;
  try {
    u = new URL(String(rawUrl).trim());
  } catch {
    return out;
  }
  const host = u.hostname.toLowerCase();
  const segs = u.pathname.split('/').filter(Boolean);

  for (const ats of ATS_HOSTS) {
    if (!ats.match.test(host)) continue;
    out.source = ats.source || host.replace(/^www\./, '');
    if (ats.companyFromPath !== undefined && segs[ats.companyFromPath]) {
      const v = prettifyCompanySlug(decodeURIComponent(segs[ats.companyFromPath]));
      if (v) { out.company = v; out.confidence.company = 'medium'; }
    }
    if (ats.companyFromSubdomain) {
      const reg = registrableDomain(host);
      const sub = host.slice(0, -(reg.length + 1));
      const first = sub.split('.').filter(Boolean)[0];
      // jobs.lever.co style hosts carry no company; skip generic prefixes
      if (first && !/^(jobs|boards?|job-boards?|apply|careers?|www|app|go|secure|jobs2?)$/.test(first)) {
        const v = prettifyCompanySlug(first);
        if (v) { out.company = v; out.confidence.company = 'medium'; }
      }
    }
    if (ats.kalibrr && segs[0] === 'c' && segs[1]) {
      const v = prettifyCompanySlug(decodeURIComponent(segs[1]));
      if (v) { out.company = v; out.confidence.company = 'medium'; }
    }
    if (ats.linkedIn) {
      const { jobTitle, company } = parseLinkedInSlug(u.pathname);
      if (jobTitle) { out.jobTitle = jobTitle; out.confidence.jobTitle = 'medium'; }
      if (company) { out.company = company; out.confidence.company = 'medium'; }
    }
    return out;
  }

  // Indeed company pages: indeed.com/cmp/Acme-Corp
  if (/(^|\.)indeed\.com$/.test(host)) {
    out.source = 'indeed.com';
    const m = u.pathname.match(/\/cmp\/([A-Za-z0-9][A-Za-z0-9\-_]*)/);
    if (m) {
      const v = prettifyCompanySlug(m[1]);
      if (v) { out.company = v; out.confidence.company = 'medium'; }
    }
    return out;
  }

  // Company-owned career pages: acme.com/careers/... or jobs.acme.com/...
  const reg = registrableDomain(host);
  const sub = host.endsWith(reg) ? host.slice(0, -(reg.length)).replace(/\.$/, '') : '';
  const firstSeg = (segs[0] || '').toLowerCase();
  const subPrefix = sub.split('.').filter(Boolean)[0] || '';
  const isCareerSub = /^(careers?|jobs?|apply|join|hiring|talent)$/.test(subPrefix);
  if (CAREER_FIRST_SEGMENTS.has(firstSeg) || isCareerSub) {
    const base = reg.split('.')[0];
    if (base && !/^(localhost|example|test)$/.test(base)) {
      const v = prettifyCompanySlug(base);
      if (v) { out.company = v; out.confidence.company = 'medium'; }
    }
    // Last slug segment is usually the role title: /careers/senior-engineer-manila-123
    const last = segs[segs.length - 1] || '';
    if (CAREER_FIRST_SEGMENTS.has(firstSeg) && segs.length >= 2 && /[-_]/.test(last)) {
      const v = prettifySlug(decodeURIComponent(last));
      if (v && !/^(apply|application|details?|view|show)$/i.test(v)) {
        out.jobTitle = v;
        out.confidence.jobTitle = 'low';
      }
    }
  }

  return out;
}

module.exports = { inferFromUrl, prettifySlug, prettifyCompanySlug, registrableDomain };
