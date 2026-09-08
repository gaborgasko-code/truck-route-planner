/**
 * Truck Route Planner - analytics collector as a Cloudflare Worker.
 *
 *   POST <base>/api/collect   receive one event from the browser  (public, CORS)
 *   GET  <base>/api/stats     aggregated numbers                  (token required)
 *   GET  <base>/api/health    liveness                            (public)
 *   GET  <base>/              the dashboard                       (asks for a token)
 *
 * Same routes and same behaviour as backend/server.js and the Firebase
 * function, so the dashboard and the browser client work against any of the
 * three without knowing which. Deployment is in backend/README.md.
 *
 * This file is ES modules while everything it imports is CommonJS. That is
 * deliberate rather than untidy: the Workers module format requires a default
 * export, but events.js has to stay CommonJS because Node and Cloud Functions
 * load the same file. The bundler handles the interop.
 *
 * The `scheduled` handler is the part with no equivalent elsewhere: D1 has no
 * TTL feature, so expiry has to be driven by a cron trigger. It is declared in
 * wrangler.toml so it ships with the code rather than being a step somebody
 * has to remember, because retention that depends on memory is retention the
 * privacy policy should not be promising.
 *
 * created by Gabor Gasko
 */

import { D1Store } from './d1-store.js';
import { dayKey } from './events.js';
import DASHBOARD from './dashboard.html';

const MAX_BODY_BYTES = 4096;

/* Per visitor, matching the other two backends. */
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_MAX = 120;

/*
 * Rate limit held in isolate memory. Cloudflare runs many isolates, so this is
 * a per-isolate ceiling rather than a global one - the same trade the Firebase
 * backend makes, and for the same reason: a shared counter would cost a D1
 * read and write on every request, spending more of the free plan than the
 * abuse it prevents. The hard guarantee is the daily cap in D1Store.
 */
const buckets = new Map();

function rateLimited(key) {
  if (!key) return false;
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now - entry.start > RATE_WINDOW_MS) {
    buckets.set(key, { start: now, count: 1 });
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

function allowedOrigins(env) {
  return String((env && env.ANALYTICS_ORIGINS) || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Reflect the origin only when it is on the allowlist, and return null when it
 * is not so the caller can refuse. A wildcard would let any site post events
 * into these counters.
 */
function corsHeaders(request, env) {
  const origin = request.headers.get('origin');
  if (!origin) return {};
  const allowed = allowedOrigins(env);
  if (allowed.indexOf('*') === -1 && allowed.indexOf(origin) === -1) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

/* --------------------------------------------------------------- helpers */

function json(body, status, extra) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign(
      { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      extra || {}
    )
  });
}

function empty(status, extra) {
  return new Response(null, {
    status,
    headers: Object.assign({ 'Cache-Control': 'no-store' }, extra || {})
  });
}

/**
 * The client address, used only to derive a salted hash and never stored.
 * CF-Connecting-IP is set by Cloudflare itself and cannot be spoofed by the
 * caller, which is why it is preferred over X-Forwarded-For here.
 */
function clientIp(request) {
  return request.headers.get('cf-connecting-ip') ||
    (request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
}

/** Constant-time-ish comparison, so a wrong token leaks no timing signal. */
function tokenOk(supplied, expected) {
  const want = String(expected || '');
  if (!want) return false;
  const got = String(supplied || '');
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i += 1) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

async function parseBody(request) {
  /* The browser sends text/plain via sendBeacon so the request stays
     CORS-simple and needs no preflight, so both shapes have to be handled. */
  const raw = await request.text();
  if (!raw || raw.length > MAX_BODY_BYTES) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function storeFor(env) {
  return new D1Store({
    db: env.DB,
    retentionDays: Number(env.ANALYTICS_RETENTION_DAYS) || 90,
    storeRawEvents: String(env.ANALYTICS_STORE_RAW) !== 'false',
    dailyEventCap: env.ANALYTICS_DAILY_CAP == null ? 8000 : Number(env.ANALYTICS_DAILY_CAP)
  });
}

/* ---------------------------------------------------------------- routes */

async function handle(request, env) {
  const url = new URL(request.url);
  const route = url.pathname.replace(/\/+$/, '') || '/';
  const cors = corsHeaders(request, env);

  if (request.method === 'OPTIONS') {
    return empty(cors ? 204 : 403, cors || {});
  }

  if (route === '/api/health') {
    return json({ ok: true, day: dayKey() }, 200, cors || {});
  }

  if (route === '/api/collect') {
    if (request.method !== 'POST') return empty(405, cors || {});
    if (cors === null) return empty(403);

    /* Otherwise 204 whatever happens: a rejected payload and an accepted one
       must look identical, or the collector becomes an oracle for probing the
       allowlist. 429 is the one exception. */
    try {
      const payload = await parseBody(request);
      if (payload) {
        const store = storeFor(env);
        const visitor = await store.visitorFor(
          clientIp(request), request.headers.get('user-agent'));
        if (rateLimited(visitor)) return empty(429, cors || {});
        await store.record(payload, { visitor, site: payload.site });
      }
    } catch (err) {
      console.error('collect failed: ' + (err && err.message));
    }
    return empty(204, cors || {});
  }

  if (route === '/api/stats') {
    const supplied = url.searchParams.get('token') ||
      String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!tokenOk(supplied, env.ANALYTICS_TOKEN)) {
      return json({ error: 'invalid or missing token' }, 401, cors || {});
    }
    const stats = await storeFor(env).summary(
      url.searchParams.get('from'), url.searchParams.get('to'));
    return json({
      site: env.ANALYTICS_SITE || 'planificador',
      generatedAt: new Date().toISOString(),
      retentionDays: Number(env.ANALYTICS_RETENTION_DAYS) || 90,
      stats
    }, 200, cors || {});
  }

  if (route === '/' && request.method === 'GET') {
    return new Response(DASHBOARD, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    });
  }

  return json({ error: 'not found' }, 404, cors || {});
}

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (err) {
      console.error('unhandled: ' + (err && err.stack));
      return json({ error: 'internal error' }, 500);
    }
  },

  /**
   * The retention job. D1 has no TTL, so without this nothing is ever deleted
   * and the ninety days promised in the privacy policy would be fiction.
   */
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      const removed = await storeFor(env).prune();
      console.log('prune removed ' + removed + ' expired row(s)');
    })());
  }
};
