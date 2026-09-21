require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const http = require('http');
const fs = require('fs');
const path = require('path');

const LOGFILE = path.join(__dirname, 'verify-final.log');
fs.writeFileSync(LOGFILE, '');
function log(...a) { fs.appendFileSync(LOGFILE, new Date().toISOString() + ' | ' + a.join(' ') + '\n'); }

const PORT = 4000;

function makeRequest(options, callback) {
  const headers = {
    'Content-Type': 'application/json',
    'Origin': 'http://localhost:5173'
  };
  if (options.cookie) {
    headers['Cookie'] = 'token=' + options.cookie;
  }
  let body = options.body ? JSON.stringify(options.body) : null;
  if (body) headers['Content-Length'] = Buffer.byteLength(body);

  const req = http.request({
    hostname: 'localhost',
    port: PORT,
    path: options.path,
    method: options.method,
    headers
  }, (res) => {
    let data = '';
    res.on('data', (c) => { data += c; });
    res.on('end', () => {
      // Extract token from Set-Cookie header
      if (res.headers['set-cookie']) {
        const match = res.headers['set-cookie'][0].match(/token=([^;]+)/);
        if (match) options.cookieOut = match[1];
      }
      callback({
        statusCode: res.statusCode,
        body: data,
        headers: res.headers
      }, options);
    });
  });
  req.on('error', (e) => {
    callback({ statusCode: -1, body: e.message, error: true }, options);
  });
  if (body) req.write(body);
  req.end();
}

(async () => {
  log('START');
  console.log('=== AUTH FLOW VERIFICATION ===');

  let token = null;
  const steps = [
    {
      name: '1. Signup',
      method: 'POST',
      path: '/api/auth/signup',
      body: { name: 'VerifyUser', email: 'verifyuser@tracker.test', password: 'test1234' }
    },
    {
      name: '2. Login',
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'verifyuser@tracker.test', password: 'test1234' }
    },
    {
      name: '3. GET /me (with cookie)',
      method: 'GET',
      path: '/api/auth/me'
    },
    {
      name: '4. GET /me (no cookie)',
      method: 'GET',
      path: '/api/auth/me'
    }
  ];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    // For step 3, send the token we got from login
    if (step.name.includes('with cookie')) {
      step.cookie = token;
    }
    log('STEP_START', step.name);

    const result = await new Promise((resolve) => {
      makeRequest(step, (response, opts) => {
        // Capture token from Set-Cookie if present
        if (response.headers && response.headers['set-cookie']) {
          const match = response.headers['set-cookie'][0].match(/token=([^;]+)/);
          if (match) {
            token = match[1];
            log('TOKEN_RECEIVED', token.substring(0, 30) + '...');
          }
        }
        resolve({ response, step });
      });
    });

    const { response, step: s } = result;
    log('RESULT', s.name, 'status=' + response.statusCode);
    console.log(s.name + ' -> ' + response.statusCode);
    if (response.statusCode > 0) {
      log('BODY', response.body.substring(0, 300));
    }

    // Small delay between requests
    await new Promise(r => setTimeout(r, 200));
  }

  log('ALL_STEPS_COMPLETE');
  console.log('\n=== VERIFICATION COMPLETE ===');
  console.log(fs.readFileSync(LOGFILE, 'utf8'));
  process.exit(0);
})().catch((err) => {
  console.log('FATAL:', err.message);
  log('FATAL', err.message);
  process.exit(1);
});
