/**
 * Truck Route Planner - analytics event rules and aggregation (pure).
 *
 * No file system, no database, no network: everything here is a plain function
 * over plain data. That is deliberate. The same rules have to hold whether the
 * collector is the Node service in backend/server.js or the Cloud Function in
 * backend/firebase/, and duplicating them would mean two chances to get the
 * privacy guarantees wrong.
 *
 * Those guarantees live here:
 *   - the IP address is never part of a stored record;
 *   - visitors are counted through a hash of (daily salt + IP + user agent),
 *     so yesterday's hashes cannot be matched against today's;
 *   - only the fields in FIELDS survive; anything else the client sends is
 *     dropped, so a bug upstream cannot start leaking addresses.
 *
 * Storage backends supply their own persistence and their own salt rotation,
 * and are expected to call normaliseEvent() before writing anything.
 *
 * created by Gabor Gasko
 */
'use strict';

/* The explicit node: specifier, not a bare 'crypto'. Node resolves both, but
   Cloudflare Workers only provide this module under that name with the
   nodejs_compat flag, and this file has to run there unchanged. */
const crypto = require('node:crypto');

/* Everything an event may contain. Unknown keys are discarded. */
const FIELDS = {
  event: { max: 40, values: ['pageview', 'route_calculated', 'route_failed', 'map_opened', 'export'] },
  path: { max: 40 },
  lang: { max: 5 },
  view: { max: 8, values: ['desktop', 'mobile'] },
  screen: { max: 4, values: ['xs', 'sm', 'md', 'lg', 'xl', 'na'] },
  ref: { max: 80 },
  distance: { max: 16 },
  speed: { max: 16 },
  detail: { max: 12 },
  error: { max: 24 }
};

const NUMERIC = { countries: { min: 0, max: 20 }, drivers: { min: 1, max: 2 } };

/** `YYYY-MM-DD` in UTC, which is what the salt and the rollups key on. */
function dayKey(date) {
  const d = date ? new Date(date) : new Date();
  return isNaN(d.getTime()) ? dayKey(new Date()) : d.toISOString().slice(0, 10);
}

/** Trim, strip control characters, cap the length. */
function clean(value, max) {
  if (value == null) return '';
  return String(value)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);
}

/**
 * Turn whatever the browser posted into a record that is safe to store.
 * @returns {Object|null} null when the payload is unusable
 */
function normaliseEvent(raw, meta) {
  if (!raw || typeof raw !== 'object') return null;
  const event = clean(raw.event, FIELDS.event.max);
  if (!event || FIELDS.event.values.indexOf(event) === -1) return null;

  const record = { ts: (meta && meta.ts) || new Date().toISOString(), event };

  Object.keys(FIELDS).forEach((field) => {
    if (field === 'event') return;
    const spec = FIELDS[field];
    const value = clean(raw[field], spec.max);
    if (!value) return;
    if (spec.values && spec.values.indexOf(value) === -1) return;
    record[field] = value;
  });

  Object.keys(NUMERIC).forEach((field) => {
    const spec = NUMERIC[field];
    const n = Number(raw[field]);
    if (!isFinite(n)) return;
    record[field] = Math.min(spec.max, Math.max(spec.min, Math.round(n)));
  });

  if (meta && meta.visitor) record.v = meta.visitor;
  if (meta && meta.site) record.site = clean(meta.site, 32);
  return record;
}

/**
 * Irreversible per-day visitor token. Never store the inputs.
 * Truncated to 16 hex characters: plenty to avoid collisions in a day's
 * traffic, short enough to be useless as an identifier later.
 */
function visitorHash(salt, ip, userAgent) {
  return crypto.createHash('sha256')
    .update(String(salt) + '|' + String(ip || '') + '|' + String(userAgent || ''))
    .digest('hex')
    .slice(0, 16);
}

function emptyDay(day) {
  return {
    day,
    views: 0,
    routes: 0,
    failures: 0,
    visitors: 0,
    pages: {},
    langs: {},
    builds: {},
    screens: {},
    refs: {},
    distances: {},
    countries: {},
    drivers: {},
    errors: {}
  };
}

function bump(map, key) {
  if (!key) return;
  map[key] = (map[key] || 0) + 1;
}

/**
 * Fold a list of records into per-day counters.
 * Visitors are counted as distinct daily hashes.
 *
 * @param {Array} records
 * @param {Object} [into] existing rollup `{ 'YYYY-MM-DD': {...} }`
 */
function aggregate(records, into) {
  const days = into || {};
  const seen = {};

  (records || []).forEach((r) => {
    if (!r || !r.event) return;
    const day = dayKey(r.ts);
    if (!days[day]) days[day] = emptyDay(day);
    const bucket = days[day];

    if (r.event === 'pageview') {
      bucket.views += 1;
      bump(bucket.pages, r.path);
      bump(bucket.langs, r.lang);
      bump(bucket.builds, r.view);
      bump(bucket.screens, r.screen);
      bump(bucket.refs, r.ref || 'direct');
    } else if (r.event === 'route_calculated') {
      bucket.routes += 1;
      bump(bucket.distances, r.distance);
      if (r.countries != null) bump(bucket.countries, String(r.countries));
      if (r.drivers != null) bump(bucket.drivers, String(r.drivers));
    } else if (r.event === 'route_failed') {
      bucket.failures += 1;
      bump(bucket.errors, r.error || 'unknown');
    }

    if (r.v) {
      if (!seen[day]) seen[day] = {};
      if (!seen[day][r.v]) {
        seen[day][r.v] = true;
        bucket.visitors += 1;
      }
    }
  });

  return days;
}

/** Top `limit` entries of a counter map, largest first. */
function top(map, limit) {
  return Object.keys(map || {})
    .map((key) => ({ key, count: map[key] }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit || 10);
}

function mergeCounters(target, source) {
  Object.keys(source || {}).forEach((key) => {
    target[key] = (target[key] || 0) + source[key];
  });
}

/**
 * Summarise a rollup over a date range, for the dashboard and the API.
 * `visitors` is summed per day, so it is "daily visitors", not uniques over
 * the whole range - which is the honest number when no cross-day identifier
 * exists.
 */
function summarise(rollup, from, to) {
  const days = Object.keys(rollup || {})
    .filter((d) => (!from || d >= from) && (!to || d <= to))
    .sort();

  const totals = { views: 0, routes: 0, failures: 0, visitors: 0 };
  const merged = {
    pages: {}, langs: {}, builds: {}, screens: {},
    refs: {}, distances: {}, countries: {}, drivers: {}, errors: {}
  };

  const series = days.map((day) => {
    const d = rollup[day];
    totals.views += d.views;
    totals.routes += d.routes;
    totals.failures += d.failures;
    totals.visitors += d.visitors;
    Object.keys(merged).forEach((k) => mergeCounters(merged[k], d[k]));
    return { day, views: d.views, visitors: d.visitors, routes: d.routes, failures: d.failures };
  });

  return {
    from: days[0] || null,
    to: days[days.length - 1] || null,
    totals,
    series,
    pages: top(merged.pages, 10),
    langs: top(merged.langs, 24),
    builds: top(merged.builds, 5),
    screens: top(merged.screens, 6),
    refs: top(merged.refs, 10),
    distances: top(merged.distances, 8),
    countries: top(merged.countries, 12),
    drivers: top(merged.drivers, 3),
    errors: top(merged.errors, 8)
  };
}

module.exports = {
  FIELDS,
  NUMERIC,
  dayKey,
  clean,
  normaliseEvent,
  visitorHash,
  emptyDay,
  bump,
  aggregate,
  mergeCounters,
  summarise,
  top
};
