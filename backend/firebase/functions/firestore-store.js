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

    /* Per-instance cache. Only ever holds the current day, so a warm instance
       does not re-read the salt on every request. */
    this.saltCache = null;
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
   * @param {{ip?:string, userAgent?:string, site?:string}} meta
   * @returns {Promise<{stored:boolean, newVisitor:boolean}>}
   */
  async record(raw, meta) {
    const info = meta || {};
    const day = dayKey();
    const visitor = await this.visitorFor(info.ip, info.userAgent, day);

    const record = normaliseEvent(raw, { visitor, site: info.site });
    if (!record) return { stored: false, newVisitor: false };

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
