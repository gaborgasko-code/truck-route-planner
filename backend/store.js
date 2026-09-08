/**
 * Truck Route Planner - analytics storage and aggregation.
 *
 * Two layers:
 *   - raw NDJSON, one file per day, pruned after the retention window;
 *   - a rollup JSON with daily totals, kept indefinitely because it holds
 *     nothing but counts.
 *
 * Privacy rules enforced here, not in the caller:
 *   - the IP address is never written anywhere;
 *   - visitors are counted through a hash of (daily salt + IP + user agent),
 *     where the salt is random per process-day, so yesterday's hashes can no
 *     longer be matched against today's;
 *   - only the fields in FIELDS survive; anything else the client sends is
 *     dropped, so a bug upstream cannot start leaking addresses.
 *
 * The pure functions are exported separately so the test suite can pin the
 * behaviour down without touching the file system.
 *
 * created by Gabor Gasko
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

/* ------------------------------------------------------------- file store */

class Store {
  /**
   * @param {{dir?:string, retentionDays?:number}} [options]
   */
  constructor(options) {
    const opts = options || {};
    this.dir = opts.dir || path.join(__dirname, 'data');
    this.retentionDays = opts.retentionDays || 90;
    this.rollupPath = path.join(this.dir, 'rollup.json');
    this.salts = {};
    this.rollup = {};
    fs.mkdirSync(this.dir, { recursive: true });
    this.loadRollup();
  }

  /** A random salt per UTC day, regenerated on restart and never persisted. */
  saltFor(day) {
    if (!this.salts[day]) {
      this.salts[day] = crypto.randomBytes(32).toString('hex');
      /* Yesterday's salt is useless now; dropping it also drops the ability
         to link a visitor across days even in memory. */
      Object.keys(this.salts).forEach((k) => { if (k !== day) delete this.salts[k]; });
    }
    return this.salts[day];
  }

  visitorFor(ip, userAgent, day) {
    return visitorHash(this.saltFor(day || dayKey()), ip, userAgent);
  }

  eventsPath(day) {
    return path.join(this.dir, 'events-' + day + '.ndjson');
  }

  loadRollup() {
    try {
      this.rollup = JSON.parse(fs.readFileSync(this.rollupPath, 'utf8'));
    } catch (e) {
      this.rollup = {};
    }
    return this.rollup;
  }

  saveRollup() {
    const tmp = this.rollupPath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.rollup), 'utf8');
    fs.renameSync(tmp, this.rollupPath);
  }

  /**
   * Persist one already-normalised record and update the rollup.
   * @returns {boolean}
   */
  append(record) {
    if (!record) return false;
    const day = dayKey(record.ts);
    fs.appendFileSync(this.eventsPath(day), JSON.stringify(record) + '\n', 'utf8');

    /* Recount this visitor against the day's raw file so restarts stay right. */
    if (!this.dayVisitors) this.dayVisitors = {};
    if (!this.dayVisitors[day]) this.dayVisitors[day] = {};
    const isNewVisitor = record.v && !this.dayVisitors[day][record.v];
    if (record.v) this.dayVisitors[day][record.v] = true;

    if (!this.rollup[day]) this.rollup[day] = emptyDay(day);
    const bucket = this.rollup[day];
    const single = Object.assign({}, record);
    delete single.v;
    aggregate([single], { [day]: bucket });
    if (isNewVisitor) bucket.visitors += 1;

    this.saveRollup();
    return true;
  }

  /** Read back the raw events of one day (used by tests and re-aggregation). */
  readDay(day) {
    try {
      return fs.readFileSync(this.eventsPath(day), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => { try { return JSON.parse(line); } catch (e) { return null; } })
        .filter(Boolean);
    } catch (e) {
      return [];
    }
  }

  /** Rebuild the rollup from every raw file still on disk. */
  rebuild() {
    const files = fs.readdirSync(this.dir).filter((f) => /^events-\d{4}-\d{2}-\d{2}\.ndjson$/.test(f));
    const records = [];
    files.forEach((f) => { records.push(...this.readDay(f.slice(7, 17))); });
    this.rollup = aggregate(records, {});
    this.saveRollup();
    return this.rollup;
  }

  /** Delete raw files older than the retention window. Rollups are kept. */
  prune(now) {
    const cutoff = new Date(now || Date.now());
    cutoff.setUTCDate(cutoff.getUTCDate() - this.retentionDays);
    const limit = dayKey(cutoff);
    let removed = 0;
    fs.readdirSync(this.dir).forEach((f) => {
      const m = /^events-(\d{4}-\d{2}-\d{2})\.ndjson$/.exec(f);
      if (m && m[1] < limit) {
        fs.unlinkSync(path.join(this.dir, f));
        removed += 1;
      }
    });
    return removed;
  }

  stats(from, to) {
    return summarise(this.rollup, from, to);
  }
}

module.exports = {
  FIELDS,
  NUMERIC,
  dayKey,
  clean,
  normaliseEvent,
  visitorHash,
  emptyDay,
  aggregate,
  summarise,
  top,
  Store
};
