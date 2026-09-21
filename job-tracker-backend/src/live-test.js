require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const http = require('http');
const fs = require('fs');
const path = require('path');

const LOGFILE = path.join(__dirname, 'live-test.log');
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
  console.log('TEST_SERVER_PORT=' + port);
  log('UP port=' + port);
  runFullFlow(port);
});

function runFullFlow(port) {
  const requests = [
    { name: 'signup', method: 'POST', path: '/api/auth/signup', body: { name: 'LiveTest', email: 'livetest@tracker.test', password: 'test1234' }, cookieJar: {} },
    { name: 'login', method: 'POST', path: '/api/auth/login', body: { email: 'livetest@tracker.test', password: 'test1234' }, cookieJar: {} },
    { name: 'me-authed', method: 'GET', path: '/api/auth/me', cookieJar: null },
    { name: 'me-unauthed', method: 'GET', path: '/api/auth/me', cookieJar: {} }
  ];

  let i = 0;
  function next() {
    if (i >= requests.length) { finish(); return; }
    const r = requests[i++];
    const headers = { 'Content-Type': 'application/json', 'Origin': 'http://localhost:5173' };
    let body = r.body ? JSON.stringify(r.body) : null;
    if (body) headers['Content-Length'] = Buffer.byteLength(body);
    if (r.cookieJar && r.cookieJar.token) headers['Cookie'] = 'token=' + r.cookieJar.token;
    const req = http.request({ hostname: 'localhost', port, path: r.path, method: r.method, headers }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.headers['set-cookie']) {
          const m = res.headers['set-cookie'][0].match(/token=([^;]+)/);
          if (m) r.cookieJar.token = m[1];
        }
        log('RESULT', r.name, 'status=' + res.statusCode, 'body=' + data.slice(0, 500));
        console.log(r.name + ' -> ' + res.statusCode + ': ' + data.slice(0, 500));
        setTimeout(next, 200);
      });
    });
    req.on('error', e => { log('ERROR', r.name, e.message); setTimeout(next, 200); });
    if (body) req.write(body);
    req.end();
  }

  function finish() {
    console.log('\n=== FULL TEST RESULTS ===');
    console.log(fs.readFileSync(LOGFILE, 'utf8'));
    setTimeout(() => { server.close(); process.exit(0); }, 300);
  }
  next();
}
