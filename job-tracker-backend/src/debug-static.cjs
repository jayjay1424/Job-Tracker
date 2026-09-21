const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

const dist = path.join(__dirname, '..', 'job-tracker-frontend', 'dist');
console.log('dist exists:', fs.existsSync(dist));
console.log('dist path:', dist);
console.log('index.html exists:', fs.existsSync(path.join(dist, 'index.html')));
if (fs.existsSync(path.join(dist, 'index.html'))) {
  console.log('index.html size:', fs.statSync(path.join(dist, 'index.html')).size);
  console.log('index.html content (first 100 chars):', fs.readFileSync(path.join(dist, 'index.html'), 'utf8').slice(0, 100));
}

const serveStatic = require('serve-static');
const staticMiddleware = serveStatic(dist, { index: false });
app.use(staticMiddleware);

app.get('*', (req, res) => {
  console.log('SPA fallback called for:', req.path);
  const fp = path.join(dist, 'index.html');
  console.log('Sending:', fp, 'exists:', fs.existsSync(fp));
  res.sendFile(fp);
});

app.listen(4002, () => {
  console.log('Debug server on 4002');
});
