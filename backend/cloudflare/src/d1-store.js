/**
 * Truck Route Planner - analytics storage on Cloudflare D1.
 *
 * The third storage backend. The rules about what may be stored live in
 * events.js and are shared with the other two; only persistence differs.
 *
 * D1 is SQLite, so the counters that Firestore held as atomic increments on
 * nested maps become two small tables and an UPSERT:
 *
 *   salts(day)                    one random salt per UTC day, inserted with
 *                                 INSERT OR IGNORE so concurrent isolates
 *                                 agree on whoever got there first.
 *   visitors(day, visitor)        one row per visitor per day. The primary key
 *                                 does the de-duplication: an insert that
 *                                 changes no rows means "already seen".
 *   events(...)                   the raw record, if enabled.
 *   counters(day, metric)         views / routes / failures / visitors.
 *   breakdowns(day, dimension, k) everything the dashboard groups by.
 *
 * `ON CONFLICT ... DO UPDATE SET value = value + 1` is the SQL equivalent of
 * FieldValue.increment: one statement, no read-modify-write, so concurrent
 * requests cannot lose a count.
 *
 * Unlike Firestore there is no TTL feature, so expiry is a scheduled worker -
 * see the `scheduled` handler in worker.js.
 *
 * created by Gabor Gasko
 */
'use strict';

const events = require('./events.js');

const { dayKey, normaliseEvent, visitorHash, emptyDay, summarise, FIELDS, NUMERIC } = events;

/** Days a salt and a visitor marker are kept. Only today's are ever used. */
const EPHEMERAL_DAYS = 2;

/** The counter maps the dashboard groups by, and where each comes from. */
const DIMENSIONS = {
  pages: 'path',
  langs: 'lang',
  builds: 'view',
  screens: 'screen',
  refs: 'ref',
  distances: 'distance',
  countries: 'countries',
  drivers: 'drivers',
  errors: 'error'
};

function epochDaysFromNow(days) {
  return Math.floor(Date.now() / 1000) + days * 24 * 60 * 60;
}

/** Random hex, from WebCrypto so this works in a Worker isolate. */
function randomSalt() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Which counters one record moves. Mirrors aggregate() in events.js, exactly
 * as rollupDelta() does for Firestore; the tests run a record through this and
 * through aggregate() and compare, because nothing else keeps them in step.
 *
 * @returns {{metrics:string[], breakdowns:Array<[string,string]>}}
 */
function countersFor(record) {
  const metrics = [];
  const breakdowns = [];
  const put = (dimension, value) => {
    if (value === undefined || value === null || value === '') return;
    breakdowns.push([dimension, String(value)]);
  };

  if (record.event === 'pageview') {
    metrics.push('views');
    put('pages', record.path);
    put('langs', record.lang);
    put('builds', record.view);
    put('screens', record.screen);
    put('refs', record.ref || 'direct');
  } else if (record.event === 'route_calculated') {
    metrics.push('routes');
    put('distances', record.distance);
    if (record.countries != null) put('countries', String(record.countries));
    if (record.drivers != null) put('drivers', String(record.drivers));
  } else if (record.event === 'route_failed') {
    metrics.push('failures');
    put('errors', record.error || 'unknown');
  }

  return { metrics, breakdowns };
}

class D1Store {
  /**
   * @param {{db:Object, retentionDays?:number, storeRawEvents?:boolean,
   *          dailyEventCap?:number, budgetRecheckMs?:number}} options
   */
  constructor(options) {
    const opts = options || {};
    if (!opts.db) throw new Error('D1Store needs a db');

    this.db = opts.db;
    this.retentionDays = opts.retentionDays || 90;
    this.storeRawEvents = opts.storeRawEvents !== false;

    /* The hard spending stop. D1's free plan is generous rather than
       unlimited, and the cap is what makes "genuinely free" a guarantee
       instead of a hope. Same reasoning as the Firestore backend. */
    this.dailyEventCap = opts.dailyEventCap == null ? 8000 : opts.dailyEventCap;
    this.budgetRecheckMs = opts.budgetRecheckMs == null ? 60000 : opts.budgetRecheckMs;

    /* Per-isolate caches, current day only. */
    this.saltCache = null;
    this.budgetCache = null;
  }

  /**
   * The salt for a UTC day, identical across every isolate.
   *
   * INSERT OR IGNORE then SELECT rather than the reverse: two isolates can
   * reach this at the same moment on a cold start, and the primary key makes
   * the loser read the winner's value instead of overwriting it.
   */
  async saltFor(day) {
    const key = day || dayKey();
    if (this.saltCache && this.saltCache.day === key) return this.saltCache.salt;

    await this.db.prepare(
      'INSERT OR IGNORE INTO salts (day, salt, expires_at) VALUES (?, ?, ?)'
    ).bind(key, randomSalt(), epochDaysFromNow(EPHEMERAL_DAYS)).run();

    const row = await this.db.prepare('SELECT salt FROM salts WHERE day = ?')
      .bind(key).first();
    const salt = row && row.salt;
    if (!salt) throw new Error('could not establish a salt for ' + key);

    this.saltCache = { day: key, salt };
    return salt;
  }

  /** The visitor token for this request. The IP goes no further than here. */
  async visitorFor(ip, userAgent, day) {
    const key = day || dayKey();
    return visitorHash(await this.saltFor(key), ip, userAgent);
  }

  /**
   * Record this visitor for the day. True only for the first caller: the
   * primary key rejects the rest, and `meta.changes` tells us which we were.
   */
  async claimVisitor(day, visitor) {
    if (!visitor) return false;
    const result = await this.db.prepare(
      'INSERT OR IGNORE INTO visitors (day, visitor, expires_at) VALUES (?, ?, ?)'
    ).bind(day, visitor, epochDaysFromNow(EPHEMERAL_DAYS)).run();
    const meta = result && result.meta;
    return !!(meta && meta.changes);
  }

  /**
   * Is there still budget for another event today?
   * Cached per isolate, so the check costs nothing on the common path. It
   * therefore lags: a circuit breaker, not an accountant.
   */
  async withinBudget(day) {
    if (!this.dailyEventCap) return true;

    const now = Date.now();
    const cached = this.budgetCache;
    if (cached && cached.day === day) {
      cached.seen += 1;
      if (cached.total + cached.seen < this.dailyEventCap) return true;
      if (now - cached.checkedAt < this.budgetRecheckMs) {
        return cached.total + cached.seen < this.dailyEventCap;
      }
    }

    const row = await this.db.prepare(
      "SELECT COALESCE(SUM(value), 0) AS total FROM counters " +
      "WHERE day = ? AND metric IN ('views','routes','failures')"
    ).bind(day).first();
    const total = (row && Number(row.total)) || 0;
    this.budgetCache = { day, total, seen: 0, checkedAt: now };
    return total < this.dailyEventCap;
  }

  /**
   * Normalise, store and count one incoming event.
   *
   * @param {Object} raw   whatever the client posted
   * @param {{ip?:string, userAgent?:string, site?:string, visitor?:string}} meta
   * @returns {Promise<{stored:boolean, newVisitor:boolean, reason?:string}>}
   */
  async record(raw, meta) {
    const info = meta || {};
    const day = dayKey();
    const visitor = info.visitor || await this.visitorFor(info.ip, info.userAgent, day);

    const record = normaliseEvent(raw, { visitor, site: info.site });
    if (!record) return { stored: false, newVisitor: false, reason: 'rejected' };

    /* Checked after normalising, so a malformed flood cannot burn the budget
       on events that would have been thrown away anyway. */
    if (!(await this.withinBudget(day))) {
      return { stored: false, newVisitor: false, reason: 'budget' };
    }

    const newVisitor = await this.claimVisitor(day, visitor);
    const { metrics, breakdowns } = countersFor(record);
    if (newVisitor) metrics.push('visitors');

    const statements = [];

    if (this.storeRawEvents) {
      statements.push(this.db.prepare(
        'INSERT INTO events (ts, day, event, path, lang, view, screen, ref, ' +
        'distance, speed, detail, error, countries, drivers, visitor, site, expires_at) ' +
        'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
      ).bind(
        record.ts, day, record.event,
        record.path || null, record.lang || null, record.view || null,
        record.screen || null, record.ref || null, record.distance || null,
        record.speed || null, record.detail || null, record.error || null,
        record.countries == null ? null : record.countries,
        record.drivers == null ? null : record.drivers,
        record.v || null, record.site || null,
        epochDaysFromNow(this.retentionDays)
      ));
    }

    metrics.forEach((metric) => {
      statements.push(this.db.prepare(
        'INSERT INTO counters (day, metric, value) VALUES (?, ?, 1) ' +
        'ON CONFLICT(day, metric) DO UPDATE SET value = value + 1'
      ).bind(day, metric));
    });

    breakdowns.forEach(([dimension, key]) => {
      statements.push(this.db.prepare(
        'INSERT INTO breakdowns (day, dimension, key, value) VALUES (?, ?, ?, 1) ' +
        'ON CONFLICT(day, dimension, key) DO UPDATE SET value = value + 1'
      ).bind(day, dimension, key));
    });

    await this.db.batch(statements);
    return { stored: true, newVisitor };
  }

  /**
   * Read the counters for a date range and summarise them.
   * Days are `YYYY-MM-DD` strings, so a plain range comparison works.
   */
  async summary(from, to) {
    const where = [];
    const args = [];
    if (from) { where.push('day >= ?'); args.push(from); }
    if (to) { where.push('day <= ?'); args.push(to); }
    const clause = where.length ? ' WHERE ' + where.join(' AND ') : '';

    const counters = await this.db
      .prepare('SELECT day, metric, value FROM counters' + clause)
      .bind(...args).all();
    const breakdowns = await this.db
      .prepare('SELECT day, dimension, key, value FROM breakdowns' + clause)
      .bind(...args).all();

    const rollup = {};
    const dayOf = (d) => {
      if (!rollup[d]) rollup[d] = emptyDay(d);
      return rollup[d];
    };

    ((counters && counters.results) || []).forEach((row) => {
      dayOf(row.day)[row.metric] = Number(row.value) || 0;
    });
    ((breakdowns && breakdowns.results) || []).forEach((row) => {
      const bucket = dayOf(row.day);
      if (!bucket[row.dimension]) bucket[row.dimension] = {};
      bucket[row.dimension][row.key] = Number(row.value) || 0;
    });

    return summarise(rollup, from, to);
  }

  /**
   * Delete whatever has passed its expiry.
   *
   * D1 has no TTL feature, so this is the scheduled worker's job. Without it
   * nothing is ever removed and the retention promise in the privacy policy
   * would be untrue - which is why the cron trigger is declared in
   * wrangler.toml rather than left as a manual step.
   */
  async prune(nowSeconds) {
    const cutoff = nowSeconds || Math.floor(Date.now() / 1000);
    const results = await this.db.batch([
      this.db.prepare('DELETE FROM events WHERE expires_at <= ?').bind(cutoff),
      this.db.prepare('DELETE FROM visitors WHERE expires_at <= ?').bind(cutoff),
      this.db.prepare('DELETE FROM salts WHERE expires_at <= ?').bind(cutoff)
    ]);
    return (results || []).reduce(
      (n, r) => n + ((r && r.meta && r.meta.changes) || 0), 0);
  }
}

module.exports = { D1Store, countersFor, DIMENSIONS, EPHEMERAL_DAYS, FIELDS, NUMERIC };
