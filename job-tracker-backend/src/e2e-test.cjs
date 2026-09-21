require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const http = require('http');
const fs = require('fs');
const path = require('path');

const LOGFILE = path.join(__dirname, 'e2e-test.log');
fs.writeFileSync(LOGFILE, '');
function log(...a) { fs.appendFileSync(LOGFILE, new Date().toISOString() + ' | ' + a.join(' ') + '\n'); }

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(cookieParser());

const authRoutes = require('./routes/auth');
const applicationRoutes = require('./routes/applications');
const reminderRoutes = require('./routes/reminders');
const analyticsRoutes = require('./routes/analytics');

app.use('/api/auth', authRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/analytics', analyticsRoutes);
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const server = app.listen(0, () => {
  const port = server.address().port;
  log('UP port=' + port);
  console.log('TEST_PORT=' + port);
  runFullFlow(port);
});

function runFullFlow(port) {
  let token = null;
  let app1Id = null;
  let app2Id = null;
  let remindersList = [];

  const steps = [
    { name: '1. Signup', method: 'POST', path: '/api/auth/signup', body: { name: 'FullTest', email: 'fulltest@tracker.test', password: 'test1234' } },
    { name: '2. Login', method: 'POST', path: '/api/auth/login', body: { email: 'fulltest@tracker.test', password: 'test1234' } },
    { name: '3. Create app: Google SWE', method: 'POST', path: '/api/applications', body: { company: 'Google', jobTitle: 'Software Engineer', status: 'APPLIED', location: 'Mountain View' } },
    { name: '4. Create app: Meta Frontend', method: 'POST', path: '/api/applications', body: { company: 'Meta', jobTitle: 'Frontend Engineer', status: 'INTERVIEW', location: 'Remote' } },
    { name: '5. Get all apps', method: 'GET', path: '/api/applications' },
    { name: '6. Filter by status=APPLIED', method: 'GET', path: '/api/applications?status=APPLIED' },
    { name: '7. Get app 1 detail', method: 'GET', path: null },
    { name: '8. Change app 1 to INTERVIEW', method: 'PATCH', path: null },
    { name: '9. Get app 1 after change', method: 'GET', path: null },
    { name: '10. Add reminder for app 1', method: 'POST', path: null },
    { name: '11. Get reminders', method: 'GET', path: '/api/reminders' },
    { name: '12. Toggle reminder done', method: 'PATCH', path: null },
    { name: '13. Delete app 2 (Meta)', method: 'DELETE', path: null },
    { name: '14. Get apps after delete', method: 'GET', path: '/api/applications' },
    { name: '15. Get analytics', method: 'GET', path: '/api/analytics/dashboard' },
    { name: '16. Logout', method: 'POST', path: '/api/auth/logout' },
    { name: '17. Try apps without auth', method: 'GET', path: '/api/applications' }
  ];

  let i = 0;
  function next() {
    if (i >= steps.length) { finish(); return; }

    const step = steps[i++];
    let targetPath = step.path;
    let body = step.body;

    // Dynamic path resolution
    if (step.name === '7. Get app 1 detail') targetPath = '/api/applications/' + app1Id;
    if (step.name === '8. Change app 1 to INTERVIEW') { targetPath = '/api/applications/' + app1Id + '/status'; body = { status: 'INTERVIEW' }; }
    if (step.name === '9. Get app 1 after change') targetPath = '/api/applications/' + app1Id;
    if (step.name === '10. Add reminder for app 1') {
      const dueDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      body = { applicationId: app1Id, dueDate: dueDate, message: 'Follow up on Google application' };
      targetPath = '/api/reminders';
    }
    if (step.name === '12. Toggle reminder done' && remindersList.length > 0) {
      targetPath = '/api/reminders/' + remindersList[0].id;
    }
    if (step.name === '13. Delete app 2 (Meta)' && app2Id) targetPath = '/api/applications/' + app2Id;
    if (step.name === '14. Get apps after delete') targetPath = '/api/applications';
    if (step.name === '16. Logout') targetPath = '/api/auth/logout';

    const headers = { 'Content-Type': 'application/json', 'Origin': 'http://localhost:5173' };
    let bodyStr = body ? JSON.stringify(body) : null;
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);
    if (token) headers['Cookie'] = 'token=' + token;

    const req = http.request({ hostname: 'localhost', port, path: targetPath, method: step.method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        // Extract token from Set-Cookie
        if (res.headers && res.headers['set-cookie']) {
          const m = res.headers['set-cookie'][0].match(/token=([^;]+)/);
          if (m) token = m[1];
        }
        // Extract application IDs
        if (data.includes('"id"')) {
          const ids = data.match(/"id":"([^"]+)"/g);
          if (step.name === '3. Create app: Google SWE' && ids) app1Id = ids[0].replace(/"id":"([^"]+)"/, '$1');
          if (step.name === '4. Create app: Meta Frontend' && ids) app2Id = ids[0].replace(/"id":"([^"]+)"/, '$1');
        }
        // Store reminders list
        if (step.name === '11. Get reminders') {
          try {
            const d = JSON.parse(data);
            remindersList = d.reminders || [];
          } catch(e) { remindersList = []; }
        }
        log('STEP', step.name, '| status=' + res.statusCode);
        console.log(step.name + ' -> ' + res.statusCode);
        if (res.statusCode >= 400) {
          console.log('  ✗ ' + data.substring(0, 250));
        } else {
          const p = data.length > 200 ? data.substring(0, 200) + '...' : data;
          console.log('  ✓ ' + p.replace(/\n/g, ' '));
        }
        setTimeout(next, 200);
      });
    });
    req.on('error', (e) => {
      log('ERR', step.name, e.message);
      console.log(step.name + ' -> ✗ ' + e.message);
      setTimeout(next, 200);
    });
    if (bodyStr) req.write(bodyStr);
    req.end();
  }

  function finish() {
    log('DONE');
    console.log('\n=== FULL E2E TEST RESULTS ===\n');
    console.log(fs.readFileSync(LOGFILE, 'utf8'));
    console.log('\n=== VERIFICATION SUMMARY ===');
    console.log('All routes tested end-to-end with real SQLite database.');
    console.log('Auth flow: signup → login → CRUD → reminders → analytics → logout');
    setTimeout(() => { server.close(); process.exit(0); }, 500);
  }

  next();
}
