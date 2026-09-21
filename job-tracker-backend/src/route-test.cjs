require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const http = require('http');
const fs = require('fs');
const path = require('path');

const LOGFILE = path.join(__dirname, 'route-test.log');
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
  runFullTest(port);
});

function runFullTest(port) {
  let token = null;

  const steps = [
    {
      name: '1. Signup',
      method: 'POST',
      path: '/api/auth/signup',
      body: { name: 'RouteTest', email: 'routetest@tracker.test', password: 'test1234' }
    },
    {
      name: '2. Login',
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'routetest@tracker.test', password: 'test1234' }
    },
    {
      name: '3. Create application',
      method: 'POST',
      path: '/api/applications',
      body: { company: 'Acme Corp', jobTitle: 'Software Engineer', status: 'APPLIED', location: 'San Francisco' }
    },
    {
      name: '4. Create another application',
      method: 'POST',
      path: '/api/applications',
      body: { company: 'TechStart', jobTitle: 'Product Manager', status: 'INTERVIEW' }
    },
    {
      name: '5. Get applications',
      method: 'GET',
      path: '/api/applications'
    },
    {
      name: '6. Get one application',
      method: 'GET',
      path: '/api/applications'
    },
    {
      name: '7. Change status to INTERVIEW',
      method: 'PATCH',
      path: '/api/applications'
    },
    {
      name: '8. Get analytics',
      method: 'GET',
      path: '/api/analytics/dashboard'
    }
  ];

  let i = 0;
  function next() {
    if (i >= steps.length) { finish(); return; }

    const step = steps[i++];

    // For step 6, use the first app's ID
    if (step.name === '6. Get one application') {
      step.path = '/api/applications/' + lastAppId;
    }

    // For step 7, use the first app's ID and set body
    if (step.name === '7. Change status to INTERVIEW') {
      step.path = '/api/applications/' + lastAppId + '/status';
      step.body = { status: 'INTERVIEW' };
    }

    const headers = { 'Content-Type': 'application/json', 'Origin': 'http://localhost:5173' };
    let body = step.body ? JSON.stringify(step.body) : null;
    if (body) headers['Content-Length'] = Buffer.byteLength(body);

    if (token) headers['Cookie'] = 'token=' + token;

    const req = http.request({ hostname: 'localhost', port, path: step.path, method: step.method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.headers && res.headers['set-cookie']) {
          const m = res.headers['set-cookie'][0].match(/token=([^;]+)/);
          if (m) token = m[1];
        }
        // Try to extract application ID from response
        if (data.includes('"id"')) {
          const m = data.match(/"id":"([^"]+)"/);
          if (m) lastAppId = m[1];
        }
        log('STEP', step.name, 'status=' + res.statusCode, 'body=' + data.substring(0, 300));
        console.log(step.name + ' -> ' + res.statusCode);
        if (res.statusCode < 400 && data.length > 0) {
          const preview = data.length > 200 ? data.substring(0, 200) + '...' : data;
          console.log('  ' + preview.replace(/\n/g, ' '));
        }
        setTimeout(next, 200);
      });
    });
    req.on('error', (e) => { log('ERR', step.name, e.message); setTimeout(next, 200); });
    if (body) req.write(body);
    req.end();
  }

  let lastAppId = null;

  function finish() {
    log('DONE');
    console.log('\n=== FULL ROUTE TEST RESULTS ===');
    console.log(fs.readFileSync(LOGFILE, 'utf8'));
    setTimeout(() => { server.close(); process.exit(0); }, 300);
  }

  next();
}
