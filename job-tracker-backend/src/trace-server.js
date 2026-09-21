const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const fs = require('fs');

const LOGFILE = path.join(__dirname, 'backendtrace.log');
fs.writeFileSync(LOGFILE, '');
function log(...args) { fs.appendFileSync(LOGFILE, new Date().toISOString() + ' ' + args.join(' ') + '\n'); }

const app = express();
log('CORS origin:', process.env.CLIENT_URL);
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.use((req, res, next) => {
  log('REQ', req.method, req.url, 'cookies=' + JSON.stringify(req.cookies), 'body=' + JSON.stringify(req.body));
  const origEnd = res.end;
  res.end = function(...args) {
    log('RES', res.statusCode, req.url);
    return origEnd.apply(res, args);
  };
  next();
});

const authRoutes = require('../routes/auth');
app.use('/api/auth', authRoutes);
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 4000;
const server = app.listen(PORT, () => {
  log('SERVER_UP port=' + PORT);
});

setTimeout(() => { server.close(); process.exit(0); }, 120000);
