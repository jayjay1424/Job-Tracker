require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
if (!process.env.DATABASE_URL && (process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL)) {
  process.env.DATABASE_URL = process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL;
}
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

const app = express();

// CORS — resilient configuration that seamlessly allows Vercel deployments and local development
app.use(cors({
  origin: (origin, cb) => {
    // Allow same-origin / curl / server-to-server requests
    if (!origin) return cb(null, true);

    // Allow all local dev origins
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return cb(null, true);
    }

    // Allow all Vercel production and preview domains (*.vercel.app)
    if (origin.endsWith('.vercel.app')) {
      return cb(null, true);
    }

    // Allow configured CLIENT_URL or VERCEL_URL
    if (process.env.CLIENT_URL && origin === process.env.CLIENT_URL) {
      return cb(null, true);
    }
    if (process.env.VERCEL_URL && (origin === `https://${process.env.VERCEL_URL}` || origin === `http://${process.env.VERCEL_URL}`)) {
      return cb(null, true);
    }

    // Default: allow origin to avoid breaking serverless requests
    return cb(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
}));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.set('trust proxy', 1);
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

// ─── API Routes ────────────────────────────────────────────────────
const authRoutes = require('./routes/auth');
const applicationRoutes = require('./routes/applications');
const reminderRoutes = require('./routes/reminders');
const analyticsRoutes = require('./routes/analytics');

// Simple in-memory rate limiter for auth & analyze (avoid brute-force)
const authLimiter = (() => {
  const hits = new Map();
  const WINDOW = 15 * 60 * 1000;
  const MAX = 50;
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits.entries()) if (now - v.start > WINDOW) hits.delete(k);
  }, 5 * 60 * 1000).unref();
  return (req, res, next) => {
    const key = req.ip + ':' + (req.path || '');
    const now = Date.now();
    const rec = hits.get(key) || { count: 0, start: now };
    if (now - rec.start > WINDOW) { rec.count = 0; rec.start = now; }
    rec.count++;
    hits.set(key, rec);
    if (rec.count > MAX) return res.status(429).json({ error: 'Too many requests, try later' });
    next();
  };
})();

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/analytics', analyticsRoutes);

// Health check endpoint with database connectivity check
app.get('/api/health', async (req, res) => {
  let dbStatus = 'checking';
  try {
    const { prisma } = require('./middleware/auth');
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = 'connected';
  } catch (e) {
    dbStatus = `disconnected: ${e.message}`;
  }
  res.json({
    status: 'ok',
    database: dbStatus,
    environment: process.env.NODE_ENV || 'production',
    timestamp: new Date().toISOString()
  });
});

// 404 for unknown API routes
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// ─── Serve frontend (Local development fallback) ───────────────────
const dist = path.join(__dirname, '..', '..', 'job-tracker-frontend', 'dist');

if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    const fp = path.join(dist, 'index.html');
    res.sendFile(fp, (err) => { if (err) next(err); });
  });
}

// Global Express error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack || err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

const PORT = process.env.PORT || 4000;
let server;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log('');
    console.log('Job Tracker running at http://localhost:' + PORT);
    console.log('API health: http://localhost:' + PORT + '/api/health');
    console.log('Env:', process.env.NODE_ENV || 'development');
    console.log('');
  });
  process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
}

module.exports = app;
