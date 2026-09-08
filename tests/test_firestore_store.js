/**
 * Truck Route Planner - Firestore analytics backend tests.
 *
 * The Cloud Function keeps a second copy of the counting logic: aggregate()
 * rebuilds a rollup from raw events, while rollupDelta() maintains the same
 * rollup live with atomic increments. Nothing forces those two to agree, and
 * if they drift the dashboard shows numbers that are wrong but plausible. The
 * central test here runs the same events through both and compares.
 *
 * Everything runs against a fake Firestore, so there is no emulator, no
 * credentials and no network - which is only possible because FirestoreStore
 * takes `db` and `FieldValue` as arguments instead of importing them.
 *
 * created by Gabor Gasko
 */
(function (global) {
  'use strict';

  /* Node only: the browser runner has no access to the backend. */
  if (typeof require !== 'function' || typeof module === 'undefined') return;

  if (!global.TRPTest) require('./harness.js');
  const T = global.TRPTest;
  const { describe, test, assert } = T;

  const events = require('../backend/lib/events.js');
  const { FirestoreStore, rollupDelta } =
    require('../backend/firebase/functions/firestore-store.js');
  const buildFirebase = require('../tools/build-backends.js');

  /* ------------------------------------------------------- fake Firestore */

  /** Matches FieldValue.increment closely enough to exercise merge semantics. */
  const FieldValue = {
    increment(n) { return { __increment: n }; }
  };

  function isIncrement(v) {
    return v && typeof v === 'object' && typeof v.__increment === 'number';
  }

  /** Apply one `set(..., {merge:true})` payload onto an existing document. */
  function mergeInto(target, patch) {
    Object.keys(patch).forEach((key) => {
      const value = patch[key];
      if (isIncrement(value)) {
        target[key] = (typeof target[key] === 'number' ? target[key] : 0) + value.__increment;
      } else if (value && typeof value === 'object' && !(value instanceof Date)) {
        if (!target[key] || typeof target[key] !== 'object') target[key] = {};
        mergeInto(target[key], value);
      } else {
        target[key] = value;
      }
    });
    return target;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value, (k, v) => (v instanceof Date ? v.toISOString() : v)));
  }

  class FakeDb {
    constructor() {
      this.data = {};       /* collection -> id -> document */
      this.writes = 0;
      this.autoId = 0;
    }
    _col(name) {
      if (!this.data[name]) this.data[name] = {};
      return this.data[name];
    }
    collection(name) {
      const db = this;
      return {
        _name: name,
        doc(id) {
          const docId = id || 'auto-' + (++db.autoId);
          return {
            id: docId,
            _collection: name,
            get path() { return name + '/' + docId; },
            async get() {
              const raw = db._col(name)[docId];
              return { exists: raw !== undefined, id: docId, data: () => clone(raw || {}) };
            },
            async create(value) {
              if (db._col(name)[docId] !== undefined) {
                const err = new Error('ALREADY_EXISTS');
                err.code = 6;
                throw err;
              }
              db._col(name)[docId] = clone(value);
              db.writes += 1;
            },
            async set(value, options) {
              const col = db._col(name);
              if (options && options.merge && col[docId]) mergeInto(col[docId], value);
              else col[docId] = mergeInto({}, value);
              db.writes += 1;
            }
          };
        },
        where(field, op, ref) {
          const filters = [{ field, op, ref }];
          const build = (fs) => ({
            where: (f, o, r) => build(fs.concat([{ field: f, op: o, ref: r }])),
            get: async () => {
              const col = db._col(name);
              const ids = Object.keys(col).filter((id) => fs.every((f) => {
                const bound = f.ref && f.ref.id ? f.ref.id : String(f.ref);
                if (f.op === '>=') return id >= bound;
                if (f.op === '<=') return id <= bound;
                return true;
              })).sort();
              return {
                forEach: (fn) => ids.forEach((id) => fn({ id, data: () => clone(col[id]) }))
              };
            }
          });
          return build(filters);
        },
        async get() {
          const col = db._col(name);
          const ids = Object.keys(col).sort();
          return { forEach: (fn) => ids.forEach((id) => fn({ id, data: () => clone(col[id]) })) };
        }
      };
    }
    batch() {
      const ops = [];
      return {
        set(ref, value, options) { ops.push({ ref, value, options }); },
        async commit() { for (const op of ops) await op.ref.set(op.value, op.options); }
      };
    }
    async runTransaction(fn) {
      /* Serial, which is enough: the contended path is tested explicitly by
         driving two stores against one db. */
      return fn({
        get: (ref) => ref.get(),
        set: (ref, value) => { ref.set(value); }
      });
    }
  }

  function makeStore(db, options) {
    return new FirestoreStore(Object.assign({ db, FieldValue }, options || {}));
  }

  const IP = '203.0.113.7';
  const UA = 'Mozilla/5.0 (TestRunner)';

  function pageview(extra) {
    return Object.assign({
      event: 'pageview', path: 'desktop.html', lang: 'es',
      view: 'desktop', screen: 'lg', ref: 'www.google.com'
    }, extra || {});
  }

  /* ------------------------------------------------- the agreement test */

  describe('firestore - the live rollup agrees with a rebuild', function () {
    test('increments reproduce aggregate() exactly', async function () {
      const db = new FakeDb();
      const store = makeStore(db);

      const posted = [
        pageview(),
        pageview(),
        pageview({ path: 'mobile.html', lang: 'de', view: 'mobile', screen: 'xs', ref: '' }),
        { event: 'route_calculated', distance: '1000-2000km', countries: 4, drivers: 2 },
        { event: 'route_calculated', distance: '100-300km', countries: 2, drivers: 1 },
        { event: 'route_failed', error: 'TIMEOUT' }
      ];
      for (const p of posted) await store.record(p, { ip: IP, userAgent: UA });

      const day = events.dayKey();
      const live = db.data.rollups[day];

      /* Rebuild from the raw events the same way a recovery would. */
      const raw = Object.keys(db.data.events).map((id) => db.data.events[id]);
      const rebuilt = events.aggregate(raw)[day];

      const fields = ['views', 'routes', 'failures', 'visitors'];
      fields.forEach((f) => {
        assert.equal(live[f] || 0, rebuilt[f] || 0,
          f + ': live ' + (live[f] || 0) + ' vs rebuilt ' + (rebuilt[f] || 0));
      });
      ['pages', 'langs', 'builds', 'screens', 'refs', 'distances', 'countries', 'drivers', 'errors']
        .forEach((f) => {
          assert.deepEqual(live[f] || {}, rebuilt[f] || {}, f + ' differs between live and rebuilt');
        });
    });

    test('a referrer-less visit is grouped as direct in both paths', async function () {
      const db = new FakeDb();
      await makeStore(db).record(pageview({ ref: '' }), { ip: IP, userAgent: UA });
      const day = events.dayKey();
      assert.equal(db.data.rollups[day].refs.direct, 1, 'live rollup says direct');
      const raw = Object.keys(db.data.events).map((id) => db.data.events[id]);
      assert.equal(events.aggregate(raw)[day].refs.direct, 1, 'rebuild agrees');
    });

    test('keys containing dots stay whole', async function () {
      const db = new FakeDb();
      await makeStore(db).record(pageview({ path: 'desktop.html', ref: 'www.google.com' }),
        { ip: IP, userAgent: UA });
      const day = events.dayKey();
      const r = db.data.rollups[day];
      assert.equal(r.pages['desktop.html'], 1,
        'a dotted page key must not be split into nested fields');
      assert.equal(r.refs['www.google.com'], 1, 'a dotted referrer key must not be split');
    });
  });

  /* ------------------------------------------------------------ visitors */

  describe('firestore - visitor counting is stateless-safe', function () {
    test('two instances of the store share one salt', async function () {
      const db = new FakeDb();
      const a = await makeStore(db).saltFor('2026-09-08');
      const b = await makeStore(db).saltFor('2026-09-08');
      assert.equal(a, b, 'a cold start must not mint a second salt for the day');
      assert.ok(a.length >= 32, 'the salt is long enough to be unguessable');
    });

    test('a different day gets a different salt', async function () {
      const db = new FakeDb();
      const a = await makeStore(db).saltFor('2026-09-08');
      const b = await makeStore(db).saltFor('2026-09-09');
      assert.ok(a !== b, 'rotating daily is what stops cross-day linking');
    });

    test('one person hitting two instances counts once', async function () {
      const db = new FakeDb();
      const first = makeStore(db);
      const second = makeStore(db);
      await first.record(pageview(), { ip: IP, userAgent: UA });
      await second.record(pageview(), { ip: IP, userAgent: UA });
      const day = events.dayKey();
      assert.equal(db.data.rollups[day].views, 2, 'both views are counted');
      assert.equal(db.data.rollups[day].visitors, 1,
        'but they are one visitor - this is what the shared salt buys');
    });

    test('two people are counted separately', async function () {
      const db = new FakeDb();
      const store = makeStore(db);
      await store.record(pageview(), { ip: '203.0.113.7', userAgent: UA });
      await store.record(pageview(), { ip: '203.0.113.8', userAgent: UA });
      assert.equal(db.data.rollups[events.dayKey()].visitors, 2);
    });

    test('claimVisitor only succeeds once', async function () {
      const db = new FakeDb();
      const store = makeStore(db);
      assert.equal(await store.claimVisitor('2026-09-08', 'abc'), true, 'first claim wins');
      assert.equal(await store.claimVisitor('2026-09-08', 'abc'), false, 'second does not');
    });
  });

  /* ------------------------------------------------------------- privacy */

  describe('firestore - nothing identifying is written', function () {
    test('no IP or user agent appears anywhere in the database', async function () {
      const db = new FakeDb();
      await makeStore(db).record(pageview({
        ip: IP, ua: UA, origin: 'Calle Mayor 1, Madrid'
      }), { ip: IP, userAgent: UA });

      const dump = JSON.stringify(db.data);
      assert.equal(dump.indexOf(IP), -1, 'the IP address must never be stored');
      assert.equal(dump.indexOf('Mozilla'), -1, 'the user agent must never be stored');
      assert.equal(dump.indexOf('Madrid'), -1, 'an address posted on purpose is dropped');
    });

    test('the stored event carries only allowlisted fields', async function () {
      const db = new FakeDb();
      await makeStore(db).record(pageview({ email: 'a@b.c' }), { ip: IP, userAgent: UA });
      const stored = db.data.events[Object.keys(db.data.events)[0]];
      Object.keys(stored).forEach((k) => {
        const known = events.FIELDS[k] !== undefined || events.NUMERIC[k] !== undefined ||
          k === 'ts' || k === 'v' || k === 'site' || k === 'expiresAt';
        assert.ok(known, k + ' is not an allowlisted field');
      });
    });

    test('raw events can be switched off, leaving only counts', async function () {
      const db = new FakeDb();
      await makeStore(db, { storeRawEvents: false }).record(pageview(), { ip: IP, userAgent: UA });
      assert.equal(db.data.events, undefined, 'no per-event document is written');
      assert.equal(db.data.rollups[events.dayKey()].views, 1, 'the count still happens');
    });

    test('salts and visitor markers are given an expiry', async function () {
      const db = new FakeDb();
      await makeStore(db).record(pageview(), { ip: IP, userAgent: UA });
      const salt = db.data.salts[Object.keys(db.data.salts)[0]];
      const visitor = db.data.visitors[Object.keys(db.data.visitors)[0]];
      assert.ok(salt.expiresAt, 'the salt expires, or it could link days later');
      assert.ok(visitor.expiresAt, 'the visitor marker expires');
      const stored = db.data.events[Object.keys(db.data.events)[0]];
      assert.ok(stored.expiresAt, 'the raw event expires after the retention window');
    });

    test('an unknown event writes nothing at all', async function () {
      const db = new FakeDb();
      const result = await makeStore(db).record({ event: 'exfiltrate' }, { ip: IP, userAgent: UA });
      assert.equal(result.stored, false, 'the event is rejected');
      assert.equal(db.data.events, undefined, 'and nothing is persisted');
      assert.equal(db.data.rollups, undefined, 'not even a rollup is created');
    });
  });

  /* ----------------------------------------------------------- summarise */

  describe('firestore - reading the numbers back', function () {
    test('summary() matches what was recorded', async function () {
      const db = new FakeDb();
      const store = makeStore(db);
      await store.record(pageview(), { ip: '203.0.113.7', userAgent: UA });
      await store.record(pageview(), { ip: '203.0.113.8', userAgent: UA });
      await store.record({ event: 'route_calculated', distance: '100-300km', countries: 2 },
        { ip: '203.0.113.7', userAgent: UA });

      const out = await store.summary(null, null);
      assert.equal(out.totals.views, 2);
      assert.equal(out.totals.visitors, 2);
      assert.equal(out.totals.routes, 1);
      assert.equal(out.langs[0].key, 'es');
    });

    test('a partial rollup does not produce NaN', async function () {
      /* Increments only create the fields an event touched, so a day with just
         one route calculation has no `views` field at all. */
      const db = new FakeDb();
      const store = makeStore(db);
      await store.record({ event: 'route_calculated', distance: '100-300km' },
        { ip: IP, userAgent: UA });
      const out = await store.summary(null, null);
      assert.equal(out.totals.views, 0, 'a missing counter reads as zero, not NaN');
      assert.equal(out.totals.routes, 1);
      assert.ok(Number.isFinite(out.totals.failures), 'every total stays a real number');
    });

    test('the range filter is applied', async function () {
      const db = new FakeDb();
      const store = makeStore(db);
      db.data.rollups = {
        '2026-09-01': Object.assign(events.emptyDay('2026-09-01'), { views: 5 }),
        '2026-09-08': Object.assign(events.emptyDay('2026-09-08'), { views: 3 })
      };
      const all = await store.summary(null, null);
      assert.equal(all.totals.views, 8, 'no range means everything');
      const recent = await store.summary('2026-09-05', '2026-09-30');
      assert.equal(recent.totals.views, 3, 'the older day is excluded');
    });
  });

  /* ------------------------------------------------------- spending cap */

  /*
   * On the Blaze plan Firestore bills past the free quota rather than blocking,
   * and a console budget alert is an alert, not a cap. The daily cap is the
   * only thing that can actually guarantee a zero bill, so it is worth pinning
   * down properly.
   */
  describe('firestore - the daily cap is a real stop', function () {
    test('events are refused once the cap is reached', async function () {
      const db = new FakeDb();
      const store = makeStore(db, { dailyEventCap: 3, budgetRecheckMs: 0 });
      const results = [];
      for (let i = 0; i < 6; i += 1) {
        results.push(await store.record(pageview(), { ip: IP, userAgent: UA }));
      }
      const stored = results.filter((r) => r.stored).length;
      assert.equal(stored, 3, 'exactly the cap is stored, got ' + stored);
      assert.equal(results[5].reason, 'budget', 'and the refusal says why');
      assert.equal(db.data.rollups[events.dayKey()].views, 3,
        'nothing is counted past the cap either');
    });

    test('a rejected payload does not consume budget', async function () {
      const db = new FakeDb();
      const store = makeStore(db, { dailyEventCap: 2, budgetRecheckMs: 0 });
      for (let i = 0; i < 10; i += 1) {
        await store.record({ event: 'exfiltrate' }, { ip: IP, userAgent: UA });
      }
      const after = await store.record(pageview(), { ip: IP, userAgent: UA });
      assert.equal(after.stored, true,
        'a flood of junk must not use up the budget for real events');
    });

    test('a cap of 0 disables the stop', async function () {
      const db = new FakeDb();
      const store = makeStore(db, { dailyEventCap: 0 });
      for (let i = 0; i < 5; i += 1) await store.record(pageview(), { ip: IP, userAgent: UA });
      assert.equal(db.data.rollups[events.dayKey()].views, 5, 'everything is stored');
    });

    test('the running total is counted across instances, not per instance', async function () {
      /* Each instance reads the shared rollup, so a second cold start cannot
         start the count again from zero. */
      const db = new FakeDb();
      const first = makeStore(db, { dailyEventCap: 4, budgetRecheckMs: 0 });
      for (let i = 0; i < 4; i += 1) await first.record(pageview(), { ip: IP, userAgent: UA });
      const second = makeStore(db, { dailyEventCap: 4, budgetRecheckMs: 0 });
      const result = await second.record(pageview(), { ip: IP, userAgent: UA });
      assert.equal(result.stored, false, 'a fresh instance still sees the cap as reached');
      assert.equal(result.reason, 'budget');
    });

    test('the cap does not re-read the rollup on every request', async function () {
      /* The check has to be nearly free, or it costs more of the free quota
         than the abuse it is there to prevent. */
      const db = new FakeDb();
      const store = makeStore(db, { dailyEventCap: 1000, budgetRecheckMs: 60000 });

      let reads = 0;
      const realRollupRef = store.rollupRef.bind(store);
      store.rollupRef = function (day) {
        const ref = realRollupRef(day);
        const innerGet = ref.get.bind(ref);
        ref.get = function () { reads += 1; return innerGet(); };
        return ref;
      };

      for (let i = 0; i < 20; i += 1) await store.record(pageview(), { ip: IP, userAgent: UA });
      assert.ok(reads <= 2,
        'the running total is cached; got ' + reads + ' reads for 20 events');
    });
  });

  /* -------------------------------------------------------- generated copy */

  describe('firestore - the deployed copy is current', function () {
    test('functions/events.js matches backend/lib/events.js', function () {
      assert.ok(buildFirebase.isCurrent(),
        'run `node tools/build-backends.js` - the function would deploy stale rules');
    });
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
