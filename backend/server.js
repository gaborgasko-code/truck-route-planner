#!/usr/bin/env node
/**
 * Truck Route Planner - analytics collector and dashboard.
 *
 * A single-file Node service with no dependencies:
 *
 *   POST /api/collect   receive one event from the browser  (public, CORS)
 *   GET  /api/stats     aggregated numbers                  (token required)
 *   GET  /api/health    liveness                            (public)
 *   GET  /              the dashboard                       (asks for a token)
 *
 * Start it with:
 *
 *   ANALYTICS_TOKEN=some-long-secret \
 *   ANALYTICS_ORIGINS=https://planificador.ggabor.online \
 *   node backend/server.js
 *
 * This is the variant for a host that runs a long-lived process and owns a
 * disk. For Firebase Cloud Functions, which own neither, see backend/firebase/.
 * Deployment for both is in backend/README.md.
 *
 * created by Gabor Gasko
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { Store, normaliseEvent, dayKey } = require('./store.js');

const CONFIG = {
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || '0.0.0.0',
  dir: process.env.ANALYTICS_DIR || path.join(__dirname, 'data'),
  token: process.env.ANALYTICS_TOKEN || '',
  /* Comma-separated allowlist. "*" allows any origin (development only). */
  origins: (process.env.ANALYTICS_ORIGINS || 'http://localhost:8080,http://127.0.0.1:8080')
    .split(',').map((s) => s.trim()).filter(Boolean),
  retentionDays: Number(process.env.ANALYTICS_RETENTION_DAYS || 90),
  /* Set to 1 only when a reverse proxy you control sets X-Forwarded-For. */
  trustProxy: process.env.TRUST_PROXY === '1',
  maxBodyBytes: 4096,
  rateLimit: { windowMs: 5 * 60 * 1000, max: 120 }
};

const store = new Store({ dir: CONFIG.dir, retentionDays: CONFIG.retentionDays });

/* ------------------------------------------------------------ rate limit */

const buckets = new Map();

function rateLimited(key) {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now - entry.start > CONFIG.rateLimit.windowMs) {
    buckets.set(key, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > CONFIG.rateLimit.max;
}

/* Keep the map from growing without bound on a long-running process. */
setInterval(() => {
  const cutoff = Date.now() - CONFIG.rateLimit.windowMs;
  buckets.forEach((entry, key) => { if (entry.start < cutoff) buckets.delete(key); });
}, CONFIG.rateLimit.windowMs).unref();

/* Prune raw events once an hour; cheap, and survives long uptimes. */
setInterval(() => {
  try { store.prune(); } catch (e) { log('prune failed: ' + e.message); }
}, 60 * 60 * 1000).unref();

/* ---------------------------------------------------------------- helpers */

function log(message) {
  process.stdout.write('[' + new Date().toISOString() + '] ' + message + '\n');
}

/**
 * The client address. Only trusts X-Forwarded-For when explicitly told to,
 * because otherwise anyone could forge it and split their own rate limit.
 */
function clientIp(req) {
  if (CONFIG.trustProxy) {
    const header = req.headers['x-forwarded-for'];
    if (header) return String(header).split(',')[0].trim();
  }
  return (req.socket && req.socket.remoteAddress) || '';
}

function corsHeaders(origin) {
  const allowAny = CONFIG.origins.indexOf('*') !== -1;
  const allowed = allowAny || (origin && CONFIG.origins.indexOf(origin) !== -1);
  if (!allowed) return null;
  return {
    'Access-Control-Allow-Origin': allowAny ? '*' : origin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

function send(res, status, body, headers) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, Object.assign({
    'Content-Type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  }, headers || {}));
  res.end(payload);
}

/**
 * Read a request body with two ceilings: past `limit` we stop collecting but
 * keep draining, so the client still gets a clean 413 instead of a dropped
 * socket; past `limit * 8` the peer is abusive and the socket is closed.
 *
 * @returns {Promise<string|null>} null when the body was over the limit
 */
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const hardLimit = limit * 8;
    let size = 0;
    let overflow = false;
    const chunks = [];

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > hardLimit) { req.destroy(); return; }
      if (size > limit) { overflow = true; chunks.length = 0; return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(overflow ? null : Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Constant-time-ish token comparison. */
function tokenOk(supplied) {
  if (!CONFIG.token) return false;
  const a = String(supplied || '');
  const b = CONFIG.token;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ----------------------------------------------------------------- routes */

async function handleCollect(req, res, url, cors) {
  if (!cors) { send(res, 403, { error: 'origin not allowed' }); return; }

  let raw;
  try {
    raw = await readBody(req, CONFIG.maxBodyBytes);
  } catch (e) {
    return; /* the socket is already gone */
  }
  if (raw === null) { send(res, 413, { error: 'payload too large' }, cors); return; }

  let parsed;
  try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
  if (!parsed) { send(res, 400, { error: 'invalid json' }, cors); return; }

  const ip = clientIp(req);
  const day = dayKey();
  const visitor = store.visitorFor(ip, req.headers['user-agent'] || '', day);

  if (rateLimited(visitor)) { send(res, 429, { error: 'too many events' }, cors); return; }

  const record = normaliseEvent(parsed, {
    ts: new Date().toISOString(),
    visitor,
    site: parsed.site
  });
  if (!record) { send(res, 422, { error: 'unknown event' }, cors); return; }

  try {
    store.append(record);
  } catch (e) {
    log('append failed: ' + e.message);
    send(res, 500, { error: 'store unavailable' }, cors);
    return;
  }

  /* 204 keeps sendBeacon happy and sends nothing back to correlate. */
  res.writeHead(204, Object.assign({ 'Cache-Control': 'no-store' }, cors));
  res.end();
}

function handleStats(req, res, url, cors) {
  const supplied = url.searchParams.get('token') ||
    String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!tokenOk(supplied)) {
    send(res, 401, { error: 'invalid or missing token' }, cors || {});
    return;
  }
  const stats = store.stats(url.searchParams.get('from'), url.searchParams.get('to'));
  send(res, 200, {
    site: process.env.ANALYTICS_SITE || 'planificador',
    generatedAt: new Date().toISOString(),
    retentionDays: CONFIG.retentionDays,
    stats
  }, cors || {});
}

function handleDashboard(res) {
  const file = path.join(__dirname, 'dashboard.html');
  fs.readFile(file, 'utf8', (err, html) => {
    if (err) { send(res, 500, 'dashboard.html is missing'); return; }
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer'
    });
    res.end(html);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const origin = req.headers.origin;
  const cors = corsHeaders(origin);

  if (req.method === 'OPTIONS') {
    if (!cors) { send(res, 403, { error: 'origin not allowed' }); return; }
    res.writeHead(204, cors);
    res.end();
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/collect') {
    handleCollect(req, res, url, cors).catch((e) => {
      log('collect failed: ' + e.message);
      if (!res.headersSent) send(res, 500, { error: 'internal error' }, cors || {});
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/stats') { handleStats(req, res, url, cors); return; }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    send(res, 200, { ok: true, days: Object.keys(store.rollup).length, uptime: Math.round(process.uptime()) });
    return;
  }

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/dashboard')) {
    handleDashboard(res);
    return;
  }

  send(res, 404, { error: 'not found' });
});

if (require.main === module) {
  if (!CONFIG.token) {
    log('WARNING: ANALYTICS_TOKEN is not set, so /api/stats and the dashboard are locked out.');
  }
  if (CONFIG.origins.indexOf('*') !== -1) {
    log('WARNING: ANALYTICS_ORIGINS is "*", which accepts events from any site.');
  }
  server.listen(CONFIG.port, CONFIG.host, () => {
    log('Truck Route Planner analytics - created by Gabor Gasko');
    log('listening on http://' + CONFIG.host + ':' + CONFIG.port);
    log('data dir ' + CONFIG.dir + ', retention ' + CONFIG.retentionDays + ' days');
    log('allowed origins: ' + CONFIG.origins.join(', '));
  });

  /*
   * Stop cleanly when a supervisor asks. Events are already safe - every write
   * is synchronous - but without this the process is killed mid-request and
   * the caller sees a connection reset rather than its 204. Ten seconds is
   * well under the usual grace period.
   */
  let closing = false;
  ['SIGTERM', 'SIGINT'].forEach((signal) => {
    process.on(signal, () => {
      if (closing) return;
      closing = true;
      log('received ' + signal + ', finishing in-flight requests');
      const forced = setTimeout(() => {
        log('shutdown timed out, exiting anyway');
        process.exit(0);
      }, 10000);
      forced.unref();
      server.close(() => {
        log('stopped');
        process.exit(0);
      });
    });
  });
}

module.exports = { server, store, CONFIG, tokenOk, corsHeaders, clientIp };
