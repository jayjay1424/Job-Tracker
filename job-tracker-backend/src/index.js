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
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.warn('WARNING: JWT_SECRET is missing or too short — set a strong random value in .env');
}
// CORS — allow CLIENT_URL plus local dev origins, never '*' with credentials
const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'http://localhost:4000',
  'http://localhost:3000',
].filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // same-origin / curl
    if (allowedOrigins.includes(origin)) return cb(null, true);
    // Allow any localhost in dev for convenience but log
    if (process.env.NODE_ENV !== 'production' && origin && origin.startsWith('http://localhost:')) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
// Security headers (minimal helmet-like)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // CSP not set to allow Vite inline scripts; can tighten later
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
  const MAX = 20;
  // Clean every 5m
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
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
// 404 for unknown API routes
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// ─── Serve frontend ────────────────────────────────────────────────
const dist = path.join(__dirname, '..', '..', 'job-tracker-frontend', 'dist');

if (fs.existsSync(dist)) {
  console.log('Frontend dist:', dist);
  console.log('Files:', fs.readdirSync(dist).join(', '));
  console.log('index.html:', fs.existsSync(path.join(dist, 'index.html')));

  // Use express.static — serves index.html for / and real files for assets
  app.use(express.static(dist));

  // SPA fallback for client-side routes: serve index.html for non-API GETs
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    const fp = path.join(dist, 'index.html');
    console.log('[SPA]', req.path);
    res.sendFile(fp, (err) => { if (err) next(err); });
  });
} else {
  console.log('WARNING: no frontend dist at', dist);
}

app.use((err, req, res, next) => {
  console.error('Error:', err.stack || err.message);
  res.status(500).json({ error: 'Internal server error' });
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
