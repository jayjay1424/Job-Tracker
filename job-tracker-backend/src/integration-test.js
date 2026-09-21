require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const http = require('http');
const path = require('path');
const fs = require('fs');

const LOGFILE = path.join(__dirname, 'trc.log');
fs.writeFileSync(LOGFILE, '');
function log(...a) { fs.appendFileSync(LOGFILE, new Date().toISOString() + ' | ' + a.join(' ') + '\n'); }

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(cookieParser());

const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const server = app.listen(0, () => {
  const port = server.address().port;
  log('UP port=' + port);
  console.log('UP port=' + port);
  runTest(port);
});

function runTest(port) {
  const tests = [
    {
      name: 'signup',
      method: 'POST',
      path: '/api/auth/signup',
      body: { name: 'Trace', email: 'trace@tracker.test', password: 'test1234' }
    },
    {
      name: 'login',
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'trace@tracker.test', password: 'test1234' }
    },
    {
      name: 'me-no-cookie',
      method: 'GET',
      path: '/api/auth/me'
    }
  ];

  let i = 0;
  function next() {
    if (i >= tests.length) { finish(); return; }
    const t = tests[i++];
    const data = JSON.stringify(t.body);
    const req = http.request({
      hostname: 'localhost',
      port,
      path: t.path,
      method: t.method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Origin': 'http://localhost:5173',
      }
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        log('TEST', t.name, 'status=' + res.statusCode, 'body=' + body.slice(0, 800));
        console.log(t.name + ' -> ' + res.statusCode + ': ' + body.slice(0, 800));
        if (res.headers['set-cookie']) log('SET-COOKIE', res.headers['set-cookie'].join('; '));
        setTimeout(next, 300);
      });
    });
    req.on('error', e => { log('ERR', t.name, e.message); next(); });
    if (t.body) req.write(data);
    req.end();
  }

  function finish() {
    log('DONE');
    console.log('\n=== FULL TRACE LOG ===');
    console.log(fs.readFileSync(LOGFILE, 'utf8'));
    setTimeout(() => { server.close(); process.exit(0); }, 500);
  }

  next();
}
