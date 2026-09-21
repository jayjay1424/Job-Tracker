require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const http = require('http');
const fs = require('fs');
const path = require('path');

const LOGFILE = path.join(__dirname, 'auth-final.log');
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
  console.log('PORT=' + port);
  runFlow(port);
});

function runFlow(port) {
  let token = null;
  const steps = [
    // 1. Signup — should return 201 and set-cookie
    { name: 'signup', method: 'POST', path: '/api/auth/signup', body: { name: 'Final', email: 'finalauth@tracker.test', password: 'test1234' } },
    // 2. Login — should return 200 and set-cookie
    { name: 'login', method: 'POST', path: '/api/auth/login', body: { email: 'finalauth@tracker.test', password: 'test1234' } },
    // 3. /me with cookie — should return 200
    { name: 'me-with-cookie', method: 'GET', path: '/api/auth/me' },
    // 4. /me without cookie — should return 401
    { name: 'me-no-cookie', method: 'GET', path: '/api/auth/me' }
  ];

  let i = 0;
  function next() {
    if (i >= steps.length) { finish(); return; }
    const s = steps[i++];
    const headers = { 'Content-Type': 'application/json', 'Origin': 'http://localhost:5173' };
    let body = s.body ? JSON.stringify(s.body) : null;
    if (body) headers['Content-Length'] = Buffer.byteLength(body);
    // For step 3, send the token we got from login
    if (s.name === 'me-with-cookie' && token) {
      headers['Cookie'] = 'token=' + token;
      log('SENDING_COOKIE', token.slice(0, 30) + '...');
    }
    const req = http.request({ hostname: 'localhost', port, path: s.path, method: s.method, headers }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        // Extract token from Set-Cookie
        if (res.headers['set-cookie']) {
          const m = res.headers['set-cookie'][0].match(/token=([^;]+)/);
          if (m) {
            token = m[1];
            log('EXTRACTED_TOKEN', token.slice(0, 30) + '...');
          }
        }
        log('RESULT', s.name, 'status=' + res.statusCode, 'body=' + data.slice(0, 500));
        console.log(s.name + ' -> ' + res.statusCode + ': ' + data.slice(0, 500));
        setTimeout(next, 200);
      });
    });
    req.on('error', e => { log('ERR', s.name, e.message); setTimeout(next, 200); });
    if (body) req.write(body);
    req.end();
  }

  function finish() {
    log('DONE');
    console.log('\n=== FINAL AUTH FLOW RESULTS ===');
    console.log(fs.readFileSync(LOGFILE, 'utf8'));
    setTimeout(() => { server.close(); process.exit(0); }, 300);
  }
  next();
}
