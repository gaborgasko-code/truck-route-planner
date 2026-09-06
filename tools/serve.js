#!/usr/bin/env node
/**
 * Truck Route Planner - zero-dependency static development server.
 *
 *     node tools/serve.js            (http://localhost:8080)
 *     node tools/serve.js 3000
 *
 * The app also runs by double-clicking index.html, but a local server is
 * needed for the service worker, for editable data/*.json and for testing the
 * installable (PWA) behaviour.
 *
 * created by Gabor Gasko
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const root = path.resolve(__dirname, '..');
const port = Number(process.argv[2]) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.gpx': 'application/gpx+xml',
  '.txt': 'text/plain; charset=utf-8'
};

const server = http.createServer((req, res) => {
  let pathname = decodeURIComponent(url.parse(req.url).pathname);
  if (pathname === '/') pathname = '/index.html';

  const target = path.normalize(path.join(root, pathname));
  if (!target.startsWith(root)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.stat(target, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404 Not Found: ' + pathname);
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Service-Worker-Allowed': '/'
    });
    fs.createReadStream(target).pipe(res);
  });
});

server.listen(port, () => {
  console.log('Truck Route Planner - created by Gabor Gasko');
  console.log('Serving ' + root);
  console.log('  http://localhost:' + port + '/            (auto-detect device)');
  console.log('  http://localhost:' + port + '/desktop.html');
  console.log('  http://localhost:' + port + '/mobile.html');
  console.log('  http://localhost:' + port + '/tests/test_runner.html');
  console.log('Press Ctrl+C to stop.');
});
