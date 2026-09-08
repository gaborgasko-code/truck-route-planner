/**
 * Truck Route Planner - analytics storage on Firestore.
 *
 * This is the stateless twin of backend/store.js. The rules about what may be
 * stored live in events.js and are shared with it; only persistence differs.
 *
 * Why it is not a straight port
 * -----------------------------
 * The file-backed store keeps two things in memory: the daily salt, and the
 * set of visitor hashes already seen today. That is correct for a process that
 * owns a disk and runs for weeks. A Cloud Function is the opposite: it scales
 * to zero, and several instances answer requests at once. Kept in memory, the
 * salt would differ per instance and reset on every cold start, so one person
 * would be counted many times - the visitor number would quietly become
 * meaningless while still looking plausible.
 *
 * So both move into Firestore:
 *
 *   salts/{day}              one random salt per UTC day, created inside a
 *                            transaction so concurrent instances agree on it,
 *                            and expired by TTL two days later. Persisting it
 *                            is a real trade-off - see saltFor() - but it is
 *                            bounded by the same window as the in-memory
 *                            version, and the alternative is a broken count.
 *   visitors/{day}_{hash}    one marker per visitor per day, claimed with
 *                            create() so exactly one instance can win the
 *                            race and increment the counter.
 *   events/{autoId}          the raw record, if enabled, expired by TTL after
 *                            the retention window.
 *   rollups/{day}            daily counters, updated with atomic increments so
 *                            no read-modify-write can lose a concurrent hit.
 *
 * The IP address is still never written: it exists only as an argument to
 * visitorHash, whose output is truncated and salted with a value that is
 * deleted two days later.
 *
 * created by Gabor Gasko
 */
'use strict';

const crypto = require('crypto');
const events = require('./events.js');

const { dayKey, normaliseEvent, visitorHash, emptyDay, summarise } = events;

/** Firestore's gRPC status for "document already exists". */
const ALREADY_EXISTS = 6;

const DEFAULT_COLLECTIONS = {
  salts: 'salts',
  visitors: 'visitors',
  events: 'events',
  rollups: 'rollups'
};

/** Days a salt and a visitor marker are kept. Only today's are ever used. */
const EPHEMERAL_DAYS = 2;

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Build the atomic increment payload for one record.
 *
 * Mirrors aggregate() in events.js. The two must agree: aggregate() is what
 * rebuilds a rollup from raw events, and this is what maintains it live.
 * The shared test suite runs a record through both and compares.
 *
 * @param {Object} record already normalised
 * @param {boolean} isNewVisitor
 * @param {{increment:Function}} FieldValue
 */
function rollupDelta(record, isNewVisitor, FieldValue) {
  const day = dayKey(record.ts);
  const delta = { day };
  const one = () => FieldValue.increment(1);

  /* Counter maps are written as nested objects, never as dotted field paths:
     "desktop.html" and "www.google.com" contain dots, and a field path would
     silently split them into nested fields. */
  const put = (field, key) => {
    if (key === undefined || key === null || key === '') return;
    delta[field] = { [String(key)]: one() };
  };

  if (record.event === 'pageview') {
    delta.views = one();
    put('pages', record.path);
    put('langs', record.lang);
    put('builds', record.view);
    put('screens', record.screen);
    put('refs', record.ref || 'direct');
  } else if (record.event === 'route_calculated') {
    delta.routes = one();
    put('distances', record.distance);
    if (record.countries != null) put('countries', String(record.countries));
    if (record.drivers != null) put('drivers', String(record.drivers));
  } else if (record.event === 'route_failed') {
    delta.failures = one();
    put('errors', record.error || 'unknown');
  }

  if (isNewVisitor) delta.visitors = one();
  return delta;
}

class FirestoreStore {
  /**
   * @param {{db:Object, FieldValue:Object, retentionDays?:number,
   *          storeRawEvents?:boolean, collections?:Object}} options
   */
  constructor(options) {
    const opts = options || {};
    if (!opts.db) throw new Error('FirestoreStore needs a db');
    if (!opts.FieldValue) throw new Error('FirestoreStore needs FieldValue');

    this.db = opts.db;
    this.FieldValue = opts.FieldValue;
    this.retentionDays = opts.retentionDays || 90;
    this.storeRawEvents = opts.storeRawEvents !== false;
    this.collections = Object.assign({}, DEFAULT_COLLECTIONS, opts.collections);

    /*
     * The hard spending stop. Blaze bills past the free quota instead of
     * blocking, and a budget alert in the console is an alert, not a cap, so
     * the only thing that can actually guarantee a zero bill is refusing to
     * write. Past this many events in a UTC day the collector keeps answering
     * normally and simply stops persisting.
     *
     * Firestore's no-cost quota is 20,000 writes a day and an event costs two
     * (the record and the rollup) plus one per new visitor, so 8,000 leaves
     * real headroom. Losing counts past the cap is the intended trade: an
     * undercount is recoverable, a surprise invoice is not.
     */
    this.dailyEventCap = opts.dailyEventCap == null ? 8000 : opts.dailyEventCap;
    this.budgetRecheckMs = opts.budgetRecheckMs == null ? 60000 : opts.budgetRecheckMs;

    /* Per-instance caches. Only ever hold the current day, so a warm instance
       does not re-read the salt or the running total on every request. */
    this.saltCache = null;
    this.budgetCache = null;
  }

  /**
   * Is there still budget for another event today?
   *
   * The running total is read from the rollup at most once a
   * `budgetRecheckMs` window per instance, so the check itself costs close to
   * nothing. That means it lags: with several instances running, the cap can
   * be overshot by roughly one window's traffic. It is a circuit breaker, not
   * an accountant - stopping a runaway, not enforcing an exact number.
   */
  async withinBudget(day) {
    if (!this.dailyEventCap) return true;   /* 0 disables the cap */

    const now = Date.now();
    const cached = this.budgetCache;
    if (cached && cached.day === day) {
      cached.seen += 1;
      if (cached.total + cached.seen < this.dailyEventCap) return true;
      if (now - cached.checkedAt < this.budgetRecheckMs) {
        return cached.total + cached.seen < this.dailyEventCap;
      }
    }

    const snap = await this.rollupRef(day).get();
    const data = snap.exists ? snap.data() : {};
    const total = (data.views || 0) + (data.routes || 0) + (data.failures || 0);
    this.budgetCache = { day, total, seen: 0, checkedAt: now };
    return total < this.dailyEventCap;
  }

  /**
   * The salt for a UTC day, identical across every instance.
   *
   * Persisting a salt is weaker than keeping it only in memory: for as long as
   * the document exists, someone holding both it and an IP address could
   * recompute that visitor's hash for the current day. The TTL bounds that to
   * roughly the same window the in-memory version had, and without a shared
   * salt the visitor count is simply wrong. The transaction matters because
   * two cold starts can land on the same day at the same moment; whoever loses
   * reads the winner's value rather than overwriting it.
   */
  async saltFor(day) {
    const key = day || dayKey();
    if (this.saltCache && this.saltCache.day === key) return this.saltCache.salt;

    const ref = this.db.collection(this.collections.salts).doc(key);
    const salt = await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) {
        const existing = snap.data();
        if (existing && existing.salt) return existing.salt;
      }
      const fresh = crypto.randomBytes(32).toString('hex');
      tx.set(ref, { salt: fresh, expiresAt: addDays(new Date(), EPHEMERAL_DAYS) });
      return fresh;
    });

    this.saltCache = { day: key, salt };
    return salt;
  }

  /** The visitor token for this request. The IP goes no further than here. */
  async visitorFor(ip, userAgent, day) {
    const key = day || dayKey();
    return visitorHash(await this.saltFor(key), ip, userAgent);
  }

  /**
   * Record this visitor for the day. Returns true only for the first caller,
   * so exactly one request increments the counter however many run at once.
   */
  async claimVisitor(day, visitor) {
    if (!visitor) return false;
    const ref = this.db.collection(this.collections.visitors).doc(day + '_' + visitor);
    try {
      await ref.create({ expiresAt: addDays(new Date(), EPHEMERAL_DAYS) });
      return true;
    } catch (err) {
      if (err && (err.code === ALREADY_EXISTS || err.code === 'already-exists')) return false;
      throw err;
    }
  }

  /**
   * Normalise, store and count one incoming event.
   *
   * @param {Object} raw   whatever the client posted
   * @param {{ip?:string, userAgent?:string, site?:string, visitor?:string}} meta
   *   `visitor` may be supplied when the caller has already derived it - the
   *   rate limiter needs it before this point, and deriving it twice would
   *   mean a second salt lookup.
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

    const batch = this.db.batch();

    if (this.storeRawEvents) {
      const eventRef = this.db.collection(this.collections.events).doc();
      batch.set(eventRef, Object.assign({}, record, {
        expiresAt: addDays(new Date(), this.retentionDays)
      }));
    }

    const rollupRef = this.db.collection(this.collections.rollups).doc(day);
    batch.set(rollupRef, rollupDelta(record, newVisitor, this.FieldValue), { merge: true });

    await batch.commit();
    return { stored: true, newVisitor };
  }

  /**
   * Read the rollups for a date range and summarise them.
   * Document ids are `YYYY-MM-DD`, which sorts lexicographically, so this is a
   * key range scan and needs no index.
   */
  async summary(from, to) {
    let query = this.db.collection(this.collections.rollups);
    if (from) query = query.where('__name__', '>=', this.rollupRef(from));
    if (to) query = query.where('__name__', '<=', this.rollupRef(to));

    const snap = await query.get();
    const rollup = {};
    snap.forEach((doc) => {
      /* Fill in anything the increments never created, so summarise() is not
         handed an undefined counter and quietly produces NaN. */
      rollup[doc.id] = Object.assign(emptyDay(doc.id), doc.data());
    });
    return summarise(rollup, from, to);
  }

  rollupRef(day) {
    return this.db.collection(this.collections.rollups).doc(day);
  }
}

module.exports = { FirestoreStore, rollupDelta, EPHEMERAL_DAYS };
