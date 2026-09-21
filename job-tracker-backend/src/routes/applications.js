const { Router } = require('express');
const { body, validationResult } = require('express-validator');
const { authMiddleware, prisma } = require('../middleware/auth');
const { analyzeJobHtml, fetchJobPage, stripTags } = require('../lib/jobAnalyzer');
const { smartExtractText } = require('../lib/smartExtract');
const { tryAiExtract, aiConfig } = require('../lib/aiExtract');
const { inferFromUrl } = require('../lib/atsExtract');

const router = Router();

// ─── Suggestion merging ─────────────────────────────────────────────
// Several independent readers (structured page data, AI, ATS/URL inference,
// local parser) each vote per field. Best rank wins; when 2+ independent
// sources agree on a value, confidence is boosted to 'high'.
const MERGE_FIELDS = ['company', 'jobTitle', 'location', 'salary', 'notes'];

function rankOf(method, conf) {
  const table = {
    page: { high: 0, medium: 4, low: 6 },
    ai: { high: 1, medium: 4, low: 6 },
    url: { high: 2, medium: 3, low: 7 },
    local: { high: 2, medium: 5, low: 6 },
  };
  return (table[method] || {})[conf] ?? 9;
}

function valuesAgree(a, b) {
  if (!a || !b) return false;
  const na = String(a).toLowerCase().replace(/[^a-z0-9]/g, '');
  const nb = String(b).toLowerCase().replace(/[^a-z0-9]/g, '');
  return !!na && !!nb && (na === nb || na.includes(nb) || nb.includes(na));
}

function mergeResults(candidates) {
  const valid = (candidates || []).filter((c) => c && c.suggestion);
  const suggestion = {
    company: null, jobTitle: null, jobUrl: null,
    location: null, salary: null, source: null, notes: null,
  };
  const confidence = {};
  const fieldMethod = {};
  for (const c of valid) {
    if (!suggestion.jobUrl && c.suggestion.jobUrl) suggestion.jobUrl = c.suggestion.jobUrl;
    if (!suggestion.source && c.suggestion.source) suggestion.source = c.suggestion.source;
  }
  for (const f of MERGE_FIELDS) {
    let best = null;
    for (const c of valid) {
      const v = c.suggestion[f];
      if (!v) continue;
      const rank = rankOf(c.method, (c.confidence || {})[f] || 'low');
      if (!best || rank < best.rank) best = { value: v, rank, method: c.method };
    }
    if (best) {
      suggestion[f] = best.value;
      // Agreement boost: another independent source voting the same way
      const agreers = new Set();
      for (const c of valid) {
        if (c.suggestion[f] && valuesAgree(c.suggestion[f], best.value)) agreers.add(c.method);
      }
      const baseConf = (valid.find((c) => c.method === best.method) || {}).confidence || {};
      confidence[f] = agreers.size >= 2 ? 'high' : (baseConf[f] || 'low');
      fieldMethod[f] = best.method;
    }
  }
  const detected = MERGE_FIELDS.filter((f) => suggestion[f]);
  // Response method = the source behind most fields (UI shows "AI understood"
  // only when the AI actually did the work).
  const wins = {};
  for (const f of detected) wins[fieldMethod[f]] = (wins[fieldMethod[f]] || 0) + 1;
  const order = ['ai', 'page', 'local', 'url'];
  let method = order.find((m) => wins[m]) || 'local';
  let top = -1;
  for (const [m, n] of Object.entries(wins)) {
    if (n > top || (n === top && order.indexOf(m) < order.indexOf(method))) {
      method = m; top = n;
    }
  }
  if (method === 'url') method = 'page';
  return { suggestion, detected, confidence, method };
}

function urlCandidate(cleanUrl) {
  if (!cleanUrl) return null;
  const info = inferFromUrl(cleanUrl);
  return {
    suggestion: {
      company: info.company,
      jobTitle: info.jobTitle,
      jobUrl: cleanUrl,
      location: null,
      salary: null,
      source: info.source,
      notes: null,
    },
    detected: ['company', 'jobTitle'].filter((k) => info[k]),
    confidence: info.confidence,
    method: 'url',
  };
}

// All routes require auth
router.use(authMiddleware);

// ─── Validation helpers ───────────────────────────────────────────────
const validate = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  return null;
};

// ─── GET /api/applications ────────────────────────────────────────────
// Query params: status, company (partial match), from, to
router.get('/', async (req, res) => {
  try {
    const {
      status, company, from, to,
      page = '1', limit = '50',
    } = req.query;
    const userId = req.user.id;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const where = { userId };
    const validStatuses = ['WISHLIST', 'APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN'];

    if (status) {
      const s = status.toUpperCase();
      if (!validStatuses.includes(s)) {
        return res.status(400).json({ error: 'Invalid status filter' });
      }
      where.status = s;
    }
    if (company) {
      // NOTE: no `mode: 'insensitive'` — SQLite doesn't support it, and its
      // LIKE is already case-insensitive for ASCII text.
      where.company = { contains: String(company).slice(0, 100) };
    }
    if (from || to) {
      where.appliedDate = {};
      if (from) {
        const d = new Date(from);
        if (isNaN(d.getTime())) return res.status(400).json({ error: 'Invalid from date' });
        where.appliedDate.gte = d;
      }
      if (to) {
        const d = new Date(to);
        if (isNaN(d.getTime())) return res.status(400).json({ error: 'Invalid to date' });
        // If 'to' is YYYY-MM-DD, include whole day
        const toStr = String(to);
        where.appliedDate.lte = toStr.length === 10 ? new Date(toStr + 'T23:59:59.999Z') : d;
      }
      if (Object.keys(where.appliedDate).length === 0) delete where.appliedDate;
    }

    const [applications, total] = await Promise.all([
      prisma.application.findMany({
        where,
        include: {
          statusHistory: {
            orderBy: { changedAt: 'desc' },
            take: 1,
          },
          reminders: {
            where: { isCompleted: false },
            orderBy: { dueDate: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.application.count({ where }),
    ]);

    // Format dates
    const formatted = applications.map((app) => ({
      ...app,
      statusHistory: app.statusHistory.map((h) => ({
        ...h,
        changedAt: h.changedAt.toISOString(),
      })),
      reminders: app.reminders.map((r) => ({
        ...r,
        dueDate: r.dueDate.toISOString(),
      })),
      createdAt: app.createdAt.toISOString(),
      updatedAt: app.updatedAt.toISOString(),
      appliedDate: app.appliedDate?.toISOString() || null,
    }));

    res.json({
      applications: formatted,
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    console.error('Get applications error:', err);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

// ─── GET /api/applications/:id ────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const application = await prisma.application.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: {
        statusHistory: {
          orderBy: { changedAt: 'asc' },
        },
        reminders: {
          orderBy: { dueDate: 'asc' },
        },
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const formatted = {
      ...application,
      statusHistory: application.statusHistory.map((h) => ({
        ...h,
        changedAt: h.changedAt.toISOString(),
      })),
      reminders: application.reminders.map((r) => ({
        ...r,
        dueDate: r.dueDate.toISOString(),
      })),
      createdAt: application.createdAt.toISOString(),
      updatedAt: application.updatedAt.toISOString(),
      appliedDate: application.appliedDate?.toISOString() || null,
    };

    res.json({ application: formatted });
  } catch (err) {
    console.error('Get application error:', err);
    res.status(500).json({ error: 'Failed to fetch application' });
  }
});

// ─── POST /api/applications ───────────────────────────────────────────
router.post(
  '/',
  [
    body('company').trim().isLength({ min: 1, max: 100 }).withMessage('Company is required (max 100)'),
    body('jobTitle').trim().isLength({ min: 1, max: 100 }).withMessage('Job title is required (max 100)'),
    body('status').optional().isIn([
      'WISHLIST', 'APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN'
    ]).withMessage('Invalid status'),
    body('jobUrl').optional({ values: 'null' }).trim().isLength({ max: 2048 }).withMessage('Job URL too long'),
    body('location').optional({ values: 'null' }).trim().isLength({ max: 200 }),
    body('notes').optional({ values: 'null' }).trim().isLength({ max: 5000 }),
  ],
  async (req, res) => {
    try {
      const errors = validate(req, res);
      if (errors) return;

      let { company, jobTitle, jobUrl, status, appliedDate, location, salary, source, notes } = req.body;
      const userId = req.user.id;

      company = String(company || '').trim().slice(0, 100);
      jobTitle = String(jobTitle || '').trim().slice(0, 100);
      if (jobUrl) {
        jobUrl = String(jobUrl).trim();
        try {
          const u = new URL(jobUrl);
          if (!['http:', 'https:'].includes(u.protocol)) return res.status(400).json({ error: 'Job URL must be http or https' });
        } catch { return res.status(400).json({ error: 'Invalid Job URL' }); }
      } else jobUrl = null;
      let parsedAppliedDate = null;
      if (appliedDate) {
        parsedAppliedDate = new Date(appliedDate);
        if (isNaN(parsedAppliedDate.getTime())) return res.status(400).json({ error: 'Invalid appliedDate' });
      }
      const finalStatus = (status || 'WISHLIST').toUpperCase();
      const salaryVal = salary !== undefined && String(salary).trim() !== '' ? String(salary).trim().slice(0, 50) : null;

      const result = await prisma.$transaction(async (tx) => {
        const app = await tx.application.create({
          data: {
            userId,
            company,
            jobTitle,
            jobUrl,
            status: finalStatus,
            appliedDate: parsedAppliedDate,
            location: location ? String(location).trim().slice(0, 200) : null,
            salary: salaryVal,
            source: source ? String(source).trim().slice(0, 100) : null,
            notes: notes ? String(notes).trim().slice(0, 5000) : null,
          },
        });
        await tx.statusHistory.create({
          data: { applicationId: app.id, status: finalStatus },
        });
        return tx.application.findFirst({
          where: { id: app.id },
          include: { statusHistory: { orderBy: { changedAt: 'asc' } } },
        });
      });

      const formatted = {
        ...result,
        statusHistory: result.statusHistory.map((h) => ({
          ...h,
          changedAt: h.changedAt.toISOString(),
        })),
        createdAt: result.createdAt.toISOString(),
        updatedAt: result.updatedAt.toISOString(),
        appliedDate: result.appliedDate?.toISOString() || null,
      };

      res.status(201).json({ application: formatted });
    } catch (err) {
      console.error('Create application error:', err);
      res.status(500).json({ error: 'Failed to create application' });
    }
  }
);

// ─── POST /api/applications/analyze ───────────────────────────────────
// Understands a job posting and suggests form values (company, title,
// location, salary, notes). Accepts a link ({ url }), pasted text
// ({ text, url? }), or both.
// Understanding order: real AI (if AI_API_KEY is set) → structured page
// data (JSON-LD / preview tags) → ATS/URL inference → local smart parser.
// Independent readers vote per field and agreement boosts confidence, so the
// UI can flag shaky guesses for review.
router.post(
  '/analyze',
  async (req, res) => {
    try {
      const { url, text } = req.body;
      const cleanUrl = url && String(url).trim() ? String(url).trim() : null;

      // Pasted text: AI first (cross-checked against URL facts when a link
      // is also given), local parser + URL inference fill the gaps.
      if (text && String(text).trim()) {
        const pasted = String(text).trim();
        const urlInfo = urlCandidate(cleanUrl);
        const pageHint = urlInfo ? {
          company: urlInfo.suggestion.company,
          jobTitle: urlInfo.suggestion.jobTitle,
        } : null;
        const ai = await tryAiExtract(pasted, cleanUrl, { pageHint });
        const local = smartExtractText(pasted, cleanUrl);
        return res.json(mergeResults([ai, urlInfo, local]));
      }

      if (!cleanUrl) {
        return res.status(400).json({ error: 'Provide a job link or pasted posting text' });
      }

      const html = await fetchJobPage(cleanUrl);
      const { suggestion, detected } = analyzeJobHtml(html, cleanUrl);
      const structured = {
        suggestion,
        detected,
        confidence: Object.fromEntries(detected.map((k) => [k, 'high'])),
        method: 'page',
      };
      const urlInfo = urlCandidate(cleanUrl);
      const pageText = stripTags(html).slice(0, 20000);

      // Structured data already complete — skip the AI call, just merge
      // structured + URL + local (local may still add notes).
      const needsAi = !(suggestion.jobTitle && suggestion.company && suggestion.location && suggestion.salary);
      let ai = null;
      if (needsAi && aiConfig()) {
        ai = await tryAiExtract(pageText.slice(0, 12000), cleanUrl, {
          pageHint: {
            company: suggestion.company,
            jobTitle: suggestion.jobTitle,
            location: suggestion.location,
            salary: suggestion.salary,
          },
        });
      }

      const local = smartExtractText(pageText, cleanUrl);
      const merged = mergeResults([structured, ai, urlInfo, local]);
      if (!merged.suggestion.jobUrl) merged.suggestion.jobUrl = cleanUrl;
      return res.json(merged);
    } catch (err) {
      console.error('Analyze job link error:', err.message);
      res.status(err.status || 500).json({ error: err.message || 'Failed to analyze link' });
    }
  }
);

// ─── PUT /api/applications/:id ────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { company, jobTitle, jobUrl, status, appliedDate, location, salary, source, notes } = req.body;
    const userId = req.user.id;

    // Verify ownership
    const existing = await prisma.application.findFirst({
      where: { id: req.params.id, userId },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Validate inputs if provided
    const validStatuses = ['WISHLIST', 'APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN'];
    if (status && !validStatuses.includes(String(status).toUpperCase())) return res.status(400).json({ error: 'Invalid status' });
    if (company !== undefined && String(company).trim().length === 0) return res.status(400).json({ error: 'Company cannot be empty' });
    if (jobTitle !== undefined && String(jobTitle).trim().length === 0) return res.status(400).json({ error: 'Job title cannot be empty' });
    if (jobUrl !== undefined && jobUrl) {
      try { const u = new URL(String(jobUrl).trim()); if (!['http:', 'https:'].includes(u.protocol)) return res.status(400).json({ error: 'Job URL must be http or https' }); } catch { return res.status(400).json({ error: 'Invalid Job URL' }); }
    }
    let parsedAppliedDate = existing.appliedDate;
    if (appliedDate !== undefined) {
      if (appliedDate) {
        parsedAppliedDate = new Date(appliedDate);
        if (isNaN(parsedAppliedDate.getTime())) return res.status(400).json({ error: 'Invalid appliedDate' });
      } else parsedAppliedDate = null;
    }

    const newStatus = status ? String(status).toUpperCase() : existing.status;
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.application.update({
        where: { id: req.params.id },
        data: {
          company: company !== undefined ? String(company).trim().slice(0, 100) : existing.company,
          jobTitle: jobTitle !== undefined ? String(jobTitle).trim().slice(0, 100) : existing.jobTitle,
          jobUrl: jobUrl !== undefined ? (jobUrl ? String(jobUrl).trim().slice(0, 2048) : null) : existing.jobUrl,
          status: newStatus,
          appliedDate: parsedAppliedDate,
          location: location !== undefined ? (location ? String(location).trim().slice(0, 200) : null) : existing.location,
          salary: salary !== undefined ? (String(salary).trim() !== '' ? String(salary).trim().slice(0, 50) : null) : existing.salary,
          source: source !== undefined ? (source ? String(source).trim().slice(0, 100) : null) : existing.source,
          notes: notes !== undefined ? (notes ? String(notes).trim().slice(0, 5000) : null) : existing.notes,
        },
      });
      if (status && newStatus !== existing.status) {
        await tx.statusHistory.create({ data: { applicationId: updated.id, status: newStatus } });
      }
      return tx.application.findFirst({
        where: { id: updated.id },
        include: { statusHistory: { orderBy: { changedAt: 'asc' } } },
      });
    });

    const formatted = {
      ...result,
      statusHistory: result.statusHistory.map((h) => ({
        ...h,
        changedAt: h.changedAt.toISOString(),
      })),
      createdAt: result.createdAt.toISOString(),
      updatedAt: result.updatedAt.toISOString(),
      appliedDate: result.appliedDate?.toISOString() || null,
    };

    res.json({ application: formatted });
  } catch (err) {
    console.error('Update application error:', err);
    res.status(500).json({ error: 'Failed to update application' });
  }
});

// ─── DELETE /api/applications/:id ─────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;

    const existing = await prisma.application.findFirst({
      where: { id: req.params.id, userId },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Application not found' });
    }

    await prisma.application.delete({
      where: { id: req.params.id },
    });

    res.json({ message: 'Application deleted' });
  } catch (err) {
    console.error('Delete application error:', err);
    res.status(500).json({ error: 'Failed to delete application' });
  }
});

// ─── PATCH /api/applications/:id/status ───────────────────────────────
// Change status — auto-logs to StatusHistory (idempotent)
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const userId = req.user.id;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const newStatus = String(status).toUpperCase();
    const validStatuses = ['WISHLIST', 'APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN'];
    if (!validStatuses.includes(newStatus)) {
      return res.status(400).json({ error: 'Invalid status. Must be one of: WISHLIST, APPLIED, INTERVIEW, OFFER, REJECTED, WITHDRAWN' });
    }

    // Verify ownership and get current status
    const application = await prisma.application.findFirst({
      where: { id: req.params.id, userId },
    });

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const oldStatus = application.status;
    if (oldStatus === newStatus) {
      // Idempotent — return current without duplicate history
      const current = await prisma.application.findFirst({
        where: { id: application.id },
        include: { statusHistory: { orderBy: { changedAt: 'asc' } } },
      });
      const formattedSame = {
        ...current,
        statusHistory: current.statusHistory.map((h) => ({ ...h, changedAt: h.changedAt.toISOString() })),
        createdAt: current.createdAt.toISOString(),
        updatedAt: current.updatedAt.toISOString(),
        appliedDate: current.appliedDate?.toISOString() || null,
      };
      return res.json({ application: formattedSame, statusChange: { from: oldStatus, to: newStatus } });
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.application.update({ where: { id: application.id }, data: { status: newStatus } });
      await tx.statusHistory.create({ data: { applicationId: application.id, status: newStatus } });
      return tx.application.findFirst({
        where: { id: application.id },
        include: { statusHistory: { orderBy: { changedAt: 'asc' } } },
      });
    });

    const formatted = {
      ...updated,
      statusHistory: updated.statusHistory.map((h) => ({
        ...h,
        changedAt: h.changedAt.toISOString(),
      })),
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      appliedDate: updated.appliedDate?.toISOString() || null,
    };

    res.json({
      application: formatted,
      statusChange: {
        from: oldStatus,
        to: newStatus,
      },
    });
  } catch (err) {
    console.error('Change status error:', err);
    res.status(500).json({ error: 'Failed to change status' });
  }
});

module.exports = router;
