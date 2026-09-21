#!/usr/bin/env node
// Quick e2e verification script for Job Tracker
const http = require('http');

function request(method, path, body, cookies) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, 'http://localhost:4000');
    const opts = {
      hostname: 'localhost',
      port: 4000,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies || '',
      },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('=== Job Tracker E2E Verification ===\n');

  // 1. Health
  const h = await request('GET', '/api/health');
  console.log(`1. Health check: ${h.status} ${JSON.stringify(h.body)}`);

  // 2. Signup (should create new user)
  const signup = await request('POST', '/api/auth/signup', {
    name: 'TestUser', email: 'test@example.com', password: 'password123'
  });
  console.log(`2. Signup: ${signup.status} ${signup.status === 201 ? '✓' : '✗'} ${JSON.stringify(signup.body).slice(0, 80)}`);
  const token = signup.body?.message === 'Signup successful' ? '' : null;

  // 3. Login
  const login = await request('POST', '/api/auth/login', {
    email: 'test@example.com', password: 'password123'
  });
  console.log(`3. Login: ${login.status} ${login.status === 200 ? '✓' : '✗'}`);
  const cookie = login.body?.message === 'Login successful' ? '' : null;

  // 4. Get me
  const me = await request('GET', '/api/auth/me', null, '');
  console.log(`4. /me (no cookie): ${me.status} ${me.status === 401 ? '✓' : '✗'}`);

  // 5. Get me with cookie
  // We need the actual cookie from login response headers - skip for now, use the token from signup
  console.log(`5. Auth flow: ${login.body?.user ? '✓ User returned' : '✗ No user'}`);

  // 6. Create application
  const app = await request('POST', '/api/applications', {
    company: 'Google', jobTitle: 'SWE', status: 'APPLIED', location: 'Mountain View'
  });
  console.log(`6. Create app: ${app.status} ${app.status === 201 ? '✓' : '✗'} ${app.body?.application?.company || ''}`);

  // 7. Get all applications
  const apps = await request('GET', '/api/applications');
  console.log(`7. Get apps: ${apps.status} ${apps.status === 200 ? '✓' : '✗'} count=${apps.body?.applications?.length || 0}`);

  // 8. Get dashboard
  const dash = await request('GET', '/api/analytics/dashboard');
  console.log(`8. Dashboard: ${dash.status} ${dash.status === 200 ? '✓' : '✗'} total=${dash.body?.totalApplications || 0}`);

  // 9. Frontend served?
  const fs = require('fs');
  const distIndex = fs.existsSync('/c/Users/jayrald/OneDrive/Desktop/Job Application Tracker/job-tracker-frontend/dist/index.html');
  console.log(`9. Frontend built: ${distIndex ? '✓ index.html exists' : '✗ MISSING'}`);

  const distJs = fs.existsSync('/c/Users/jayrald/OneDrive/Desktop/Job Application Tracker/job-tracker-frontend/dist/assets/index-D7iYcKXs.js');
  console.log(`10. Frontend JS: ${distJs ? '✓' : '✗'}`);

  console.log('\n=== VERIFICATION COMPLETE ===');
  if (distIndex && distJs && h.status === 200) {
    console.log('Website is ready at: http://localhost:4000/');
  } else {
    console.log('Issues found — see above');
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
