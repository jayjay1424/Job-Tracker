require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const http = require('http');
const fs = require('fs');
const path = require('path');

const LOGFILE = path.join(__dirname, '..', 'frontend-test.log');
fs.writeFileSync(LOGFILE, '');
function log(...a) { fs.appendFileSync(LOGFILE, new Date().toISOString() + ' | ' + a.join(' ') + '\n'); }

const PORT = 5173;

const server = http.createServer((req, res) => {
  log('REQ', req.method, req.url, 'from=' + req.headers['origin'] || '-');
  res.writeHead(200, { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' });
  res.end(`<!DOCTYPE html>
<html>
<head><title>Job Tracker - Test</title>
<style>
body { font-family: system-ui, sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; background: #f9fafb; }
.card { background: white; border-radius: 8px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border: 1px solid #e5e7eb; }
h1 { color: #111827; margin: 0 0 8px; }
h1 .logo { display: inline-block; width: 32px; height: 32px; background: #2563eb; border-radius: 6px; text-align: center; line-height: 32px; color: white; font-weight: bold; margin-right: 8px; }
p { color: #6b7280; margin: 0 0 24px; }
.label { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
.input { width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; margin-bottom: 16px; box-sizing: border-box; }
.input:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
.btn { background: #2563eb; color: white; padding: 10px 20px; border: none; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer; width: 100%; }
.btn:hover { background: #1d4ed8; }
.link { color: #2563eb; text-decoration: none; }
.link:hover { text-decoration: underline; }
.status { padding: 8px 12px; border-radius: 4px; font-size: 13px; margin-bottom: 16px; }
.status.ok { background: #d1fae5; color: #065f46; }
.status.err { background: #fee2e2; color: #991b1b; }
.result { padding: 12px; background: #f3f4f6; border-radius: 6px; font-family: monospace; font-size: 12px; white-space: pre-wrap; margin-top: 16px; }
footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px; text-align: center; }
</style>
</head>
<body>
<div class="card">
  <h1><span class="logo">JT</span> Job Tracker</h1>
  <p>Frontend dev server — React app loads here.</p>

  <div class="status ok">Frontend server is running on port ${PORT}</div>

  <div class="label">Test: Backend API (health check)</div>
  <div id="result" class="result">Testing...</div>

  <br>
  <button class="btn" onclick="testBackend()">Test Backend Connection</button>
  <br><br>
  <a href="http://localhost:4000/api/health" class="link" target="_blank">Open backend health directly</a>
</div>

<footer>Job Tracker — React + Express + Prisma + SQLite</footer>

<script>
async function testBackend() {
  const el = document.getElementById('result');
  el.textContent = 'Testing backend at http://localhost:4000/api/health ...';
  try {
    const res = await fetch('http://localhost:4000/api/health');
    const data = await res.json();
    if (res.ok) {
      el.textContent = 'Backend OK: ' + JSON.stringify(data);
      el.style.background = '#d1fae5';
      el.style.color = '#065f46';
    } else {
      el.textContent = 'Backend error: ' + res.status;
      el.style.background = '#fee2e2';
      el.style.color = '#991b1b';
    }
  } catch (e) {
    el.textContent = 'Cannot reach backend: ' + e.message;
    el.style.background = '#fee2e2';
    el.style.color = '#991b1b';
  }
}
// Auto-test on load
setTimeout(testBackend, 500);
</script>
</body>
</html>`);
});

server.listen(PORT, '0.0.0.0', () => {
  log('UP', 'port=' + PORT);
  console.log('Frontend test server running on http://localhost:' + PORT);
});

process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
