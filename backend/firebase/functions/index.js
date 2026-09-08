/**
 * Truck Route Planner - analytics collector as a Cloud Function.
 *
 *   POST <base>/api/collect   receive one event from the browser  (public, CORS)
 *   GET  <base>/api/stats     aggregated numbers                  (token required)
 *   GET  <base>/api/health    liveness                            (public)
 *   GET  <base>/              the dashboard                       (asks for a token)
 *
 * Same routes and same behaviour as backend/server.js, so the dashboard and the
 * browser client work against either without changes. Deployment lives in
 * backend/README.md.
 *
 * created by Gabor Gasko
 */
'use strict';

const fs = require('fs');
const path = require('path');

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret, defineString, defineBoolean } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const { FirestoreStore } = require('./firestore-store.js');
const { dayKey } = require('./events.js');

/* --------------------------------------------------------------- settings */

/* Held in Secret Manager, never in source or in the deployed config. */
const ANALYTICS_TOKEN = defineSecret('ANALYTICS_TOKEN');

const ANALYTICS_ORIGINS = defineString('ANALYTICS_ORIGINS', {
  default: 'https://planificador.ggabor.online',
  description: 'Comma-separated list of origins allowed to POST events.'
});
const ANALYTICS_RETENTION_DAYS = defineString('ANALYTICS_RETENTION_DAYS', {
  default: '90',
  description: 'Days a raw event is kept before the TTL policy deletes it.'
});
const ANALYTICS_STORE_RAW = defineBoolean('ANALYTICS_STORE_RAW', {
  default: true,
  description: 'Store individual events as well as the daily rollup. Turning ' +
    'this off halves the write cost and leaves only aggregate counts.'
});

const ANALYTICS_DAILY_CAP = defineString('ANALYTICS_DAILY_CAP', {
  default: '8000',
  description: 'Events stored per day before the collector stops writing. ' +
    'The hard stop on spending; 0 disables it.'
});

const REGION = 'europe-southwest1';
const MAX_BODY_BYTES = 4096;

/* Per visitor, matching backend/server.js. */
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_MAX = 120;

initializeApp();
const db = getFirestore();
/* Undefined properties would otherwise throw; we would rather drop them. */
db.settings({ ignoreUndefinedProperties: true });

let store = null;
function getStore() {
  if (!store) {
    store = new FirestoreStore({
      db,
      FieldValue,
      retentionDays: Number(ANALYTICS_RETENTION_DAYS.value()) || 90,
      storeRawEvents: ANALYTICS_STORE_RAW.value(),
      dailyEventCap: Number(ANALYTICS_DAILY_CAP.value())
    });
  }
  return store;
}

/*
 * Per-visitor rate limit, held in instance memory.
 *
 * The Node service keeps this in memory too, but there it is the whole story
 * because one process sees every request. Here each instance has its own map,
 * so the real ceiling is this limit times the instance count - which is why
 * maxInstances is set low. That is deliberately the cheap defence: a shared
 * counter in Firestore would cost a read and a write per request, spending
 * more of the free quota than the abuse it prevents. The hard guarantee comes
 * from the daily cap in FirestoreStore, not from here.
 */
const buckets = new Map();

function rateLimited(key) {
  if (!key) return false;
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now - entry.start > RATE_WINDOW_MS) {
    buckets.set(key, { start: now, count: 1 });
    /* Instances are recycled often, but a long-lived one should not grow this
       map without bound. */
    if (buckets.size > 5000) {
      const cutoff = now - RATE_WINDOW_MS;
      buckets.forEach((v, k) => { if (v.start < cutoff) buckets.delete(k); });
    }
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_MAX;
}

/* ------------------------------------------------------------------ CORS */

function allowedOrigins() {
  return String(ANALYTICS_ORIGINS.value() || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Reflect the origin only when it is on the allowlist. A wildcard would let
 * any site post events into these counters.
 */
function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const allowed = allowedOrigins();
  if (allowed.indexOf('*') !== -1 || allowed.indexOf(origin) !== -1) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Max-Age', '86400');
    return true;
  }
  return false;
}

/* --------------------------------------------------------------- helpers */

/**
 * The client address, used only to derive a salted hash and never stored.
 * Behind Google's load balancer X-Forwarded-For is "client, proxy...", so the
 * first entry is the caller.
 */
function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || '';
}

/** Constant-time-ish comparison, so a wrong token leaks no timing signal. */
function tokenOk(supplied) {
  const expected = ANALYTICS_TOKEN.value() || '';
  if (!expected) return false;
  const a = String(supplied || '');
  if (a.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function parseBody(req) {
  /* onRequest already parses JSON and text bodies. The browser sends
     text/plain via sendBeacon so the request stays CORS-simple and needs no
     preflight, so both shapes have to be handled. */
  const body = req.body;
  if (!body) return null;
  if (typeof body === 'object' && !Buffer.isBuffer(body)) return body;
  const raw = Buffer.isBuffer(body) ? body.toString('utf8') : String(body);
  if (raw.length > MAX_BODY_BYTES) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

let dashboardHtml = null;
function dashboard() {
  if (dashboardHtml === null) {
    try {
      dashboardHtml = fs.readFileSync(path.join(__dirname, 'dashboard.html'), 'utf8');
    } catch (err) {
      dashboardHtml = '<!doctype html><title>Traffic</title><p>Dashboard file missing.</p>';
    }
  }
  return dashboardHtml;
}

/** The path within this function, with the mount point removed. */
function routeOf(req) {
  const p = req.path || '/';
  return p.replace(/\/+$/, '') || '/';
}

/* ---------------------------------------------------------------- routes */

async function handler(req, res) {
  const corsOk = applyCors(req, res);

  if (req.method === 'OPTIONS') {
    res.status(corsOk ? 204 : 403).end();
    return;
  }

  const route = routeOf(req);

  if (route === '/api/health') {
    res.set('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, day: dayKey() });
    return;
  }

  if (route === '/api/collect') {
    if (req.method !== 'POST') { res.status(405).end(); return; }
    if (!corsOk) { res.status(403).end(); return; }

    res.set('Cache-Control', 'no-store');

    /* Otherwise 204 whatever happens: a rejected payload and an accepted one
       must look identical, or the collector becomes an oracle for probing the
       allowlist. 429 is the one exception, and matches backend/server.js. */
    try {
      const payload = parseBody(req);
      if (payload) {
        const s = getStore();
        const visitor = await s.visitorFor(clientIp(req), req.headers['user-agent']);
        if (rateLimited(visitor)) { res.status(429).end(); return; }
        await s.record(payload, { visitor, site: payload.site });
      }
    } catch (err) {
      console.error('collect failed: ' + (err && err.message));
    }
    res.status(204).end();
    return;
  }

  if (route === '/api/stats') {
    const query = req.query || {};
    /* Same contract as backend/server.js: a `token` parameter or a Bearer
       header, and an optional `from`/`to` day range. The dashboard is served
       by both and cannot tell them apart. */
    const supplied = query.token ||
      String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!tokenOk(supplied)) {
      res.set('Cache-Control', 'no-store');
      res.status(401).json({ error: 'invalid or missing token' });
      return;
    }
    const stats = await getStore().summary(query.from || null, query.to || null);
    res.set('Cache-Control', 'no-store');
    res.status(200).json({
      site: 'planificador',
      generatedAt: new Date().toISOString(),
      retentionDays: Number(ANALYTICS_RETENTION_DAYS.value()) || 90,
      stats
    });
    return;
  }

  if (route === '/' && req.method === 'GET') {
    /*
     * No redirect to a trailing slash here, though it would be the usual fix.
     * The platform strips the function name before the request arrives, so
     * req.path is '/' whether the browser asked for /analytics or
     * /analytics/, and this code cannot tell the two apart or reconstruct the
     * public URL. The dashboard therefore derives its own base from
     * location.href, which is the only place the real address is known.
     */
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    res.status(200).send(dashboard());
    return;
  }

  res.status(404).json({ error: 'not found' });
}

exports.analytics = onRequest(
  {
    region: REGION,
    secrets: [ANALYTICS_TOKEN],
    /* CORS is handled above against the allowlist; the built-in helper would
       answer preflights before that check runs. */
    cors: false,
    memory: '256MiB',
    /* A handful of instances is plenty and caps the bill if someone floods
       the endpoint. */
    maxInstances: 5,
    invoker: 'public'
  },
  handler
);
