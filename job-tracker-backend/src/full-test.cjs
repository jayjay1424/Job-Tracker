require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const http = require('http');
const fs = require('fs');
const path = require('path');

const LOGFILE = path.join(__dirname, 'full-test.log');
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
  runTest(port);
});

function runTest(port) {
  let token = null;
  let app1Id = null;
  let app2Id = null;

  const steps = [
    { name: '1. Signup', method: 'POST', path: '/api/auth/signup', body: { name: 'FullTest', email: 'fulltest@tracker.test', password: 'test1234' } },
    { name: '2. Login', method: 'POST', path: '/api/auth/login', body: { email: 'fulltest@tracker.test', password: 'test1234' } },
    { name: '3. Create app 1', method: 'POST', path: '/api/applications', body: { company: 'Google', jobTitle: 'SWE', status: 'APPLIED', location: 'Mountain View' } },
    { name: '4. Create app 2', method: 'POST', path: '/api/applications', body: { company: 'Meta', jobTitle: 'Frontend', status: 'INTERVIEW', location: 'Remote' } },
    { name: '5. Create app 3', method: 'POST', path: '/api/applications', body: { company: 'Startup', jobTitle: 'CTO', status: 'OFFER' } },
    { name: '6. Get all apps', method: 'GET', path: '/api/applications' },
    { name: '7. Filter by status=APPLIED', method: 'GET', path: '/api/applications?status=APPLIED' },
    { name: '8. Get app 1 detail', method: 'GET', path: null },
    { name: '9. Change app 1 status to INTERVIEW', method: 'PATCH', path: null },
    { name: '10. Get app 1 after change', method: 'GET', path: null },
    { name: '11. Create reminder for app 1', method: 'POST', path: '/api/reminders', body: { applicationId: null, dueDate: null, message: 'Follow up on Google application' } },
    { name: '12. Get reminders', method: 'GET', path: '/api/reminders' },
    { name: '13. Toggle reminder', method: 'PATCH', path: null },
    { name: '14. Get analytics', method: 'GET', path: '/api/analytics/dashboard' },
    { name: '15. Delete app 3', method: 'DELETE', path: null },
    { name: '16. Get apps after delete', method: 'GET', path: '/api/applications' },
    { name: '17. Logout', method: 'POST', path: '/api/auth/logout' },
    { name: '18. Get apps (unauthenticated)', method: 'GET', path: '/api/applications' }
  ];

  let i = 0;
  function next() {
    if (i >= steps.length) { finish(); return; }

    const step = steps[i++];
    let path = step.path;
    let body = step.body;

    // Resolve dynamic paths
    if (step.name === '8. Get app 1 detail') path = '/api/applications/' + app1Id;
    if (step.name === '9. Change app 1 status to INTERVIEW') { path = '/api/applications/' + app1Id + '/status'; body = { status: 'INTERVIEW' }; }
    if (step.name === '10. Get app 1 after change') path = '/api/applications/' + app1Id;
    if (step.name === '11. Create reminder for app 1') { body = { applicationId: app1Id, dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], message: 'Follow up on Google application' }; }
    if (step.name === '13. Toggle reminder' && reminders.length > 0) { path = '/api/reminders/' + reminders[0].id; }
    if (step.name === '15. Delete app 3' && app2Id) { path = '/api/applications/' + app2Id; }
    if (step.name === '16. Get apps after delete') path = '/api/applications';

    const headers = { 'Content-Type': 'application/json', 'Origin': 'http://localhost:5173' };
    let bodyStr = body ? JSON.stringify(body) : null;
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);

    if (token) headers['Cookie'] = 'token=' + token;

    const req = http.request({ hostname: 'localhost', port, path, method: step.method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.headers && res.headers['set-cookie']) {
          const m = res.headers['set-cookie'][0].match(/token=([^;]+)/);
          if (m) token = m[1];
        }
        // Extract IDs
        if (data.includes('"id"') && step.name.startsWith('3') || step.name.startsWith('4')) {
          const m = data.match(/"id":"([^"]+)"/);
          if (m) {
            if (step.name.startsWith('3')) app1Id = m[1];
            if (step.name.startsWith('4')) app2Id = m[1];
          }
        }
        if (step.name === '12. Get reminders') {
          try {
            const d = JSON.parse(data);
            reminders = d.reminders || [];
          } catch(e) {}
        }
        log('STEP', step.name, 'status=' + res.statusCode);
        console.log(step.name + ' -> ' + res.statusCode);
        if (res.statusCode >= 400) {
          console.log('  ERROR: ' + data.substring(0, 200));
        } else if (data.length > 0) {
          const preview = data.length > 150 ? data.substring(0, 150) + '...' : data;
          console.log('  ' + preview.replace(/\n/g, ' '));
        }
        setTimeout(next, 250);
      });
    });
    req.on('error', (e) => { log('ERR', step.name, e.message); console.log(step.name + ' -> ERROR: ' + e.message); setTimeout(next, 250); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  }

  let reminders = [];

  function finish() {
    log('DONE');
    console.log('\n=== FULL END-TO-END TEST RESULTS ===');
    console.log(fs.readFileSync(LOGFILE, 'utf8').split('\n').slice(-50).join('\n'));
    setTimeout(() => { server.close(); process.exit(0); }, 300);
  }

  next();
}
