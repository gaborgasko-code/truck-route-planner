/**
 * Truck Route Planner - Cloudflare D1 analytics backend tests.
 *
 * There are now three ways of counting the same events: aggregate() rebuilds a
 * rollup from raw records, rollupDelta() maintains it live in Firestore, and
 * countersFor() does the same in SQL. Nothing in the language forces the three
 * to agree, and if they drift the dashboard shows numbers that are wrong but
 * entirely plausible. The central test here runs the same events through the
 * D1 path and through aggregate() and compares, exactly as the Firestore suite
 * does.
 *
 * Everything runs against a fake D1 that really executes the SQL semantics we
 * depend on - INSERT OR IGNORE and ON CONFLICT DO UPDATE - so there is no
 * wrangler, no network and no account involved.
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
  const { D1Store, countersFor } = require('../backend/cloudflare/src/d1-store.js');
  const buildBackends = require('../tools/build-backends.js');

  /* ------------------------------------------------------------- fake D1 */

  /**
   * Enough of the D1 client to exercise the statements this code actually
   * issues. Rather than parse SQL properly it matches the handful of shapes
   * used, and throws on anything unrecognised so a new query cannot silently
   * pass untested.
   */
  class FakeD1 {
    constructor() {
      this.tables = { salts: [], visitors: [], events: [], counters: [], breakdowns: [] };
      this.statements = 0;
    }

    prepare(sql) {
      const db = this;
      return {
        sql,
        args: [],
        bind(...args) { this.args = args; return this; },
        async run() { return db._exec(this.sql, this.args); },
        async first() {
          const out = db._exec(this.sql, this.args);
          return out.results.length ? out.results[0] : null;
        },
        async all() { return db._exec(this.sql, this.args); }
      };
    }

    async batch(statements) {
      const out = [];
      for (const s of statements) out.push(await s.run());
      return out;
    }

    _exec(sql, args) {
      this.statements += 1;
      const s = sql.replace(/\s+/g, ' ').trim();

      if (s.startsWith('INSERT OR IGNORE INTO salts')) {
        const [day, salt, exp] = args;
        if (this.tables.salts.some((r) => r.day === day)) return this._res([], 0);
        this.tables.salts.push({ day, salt, expires_at: exp });
        return this._res([], 1);
      }

      if (s.startsWith('SELECT salt FROM salts')) {
        const row = this.tables.salts.find((r) => r.day === args[0]);
        return this._res(row ? [{ salt: row.salt }] : [], 0);
      }

      if (s.startsWith('INSERT OR IGNORE INTO visitors')) {
        const [day, visitor, exp] = args;
        if (this.tables.visitors.some((r) => r.day === day && r.visitor === visitor)) {
          return this._res([], 0);
        }
        this.tables.visitors.push({ day, visitor, expires_at: exp });
        return this._res([], 1);
      }

      if (s.startsWith('INSERT INTO events')) {
        const cols = ['ts', 'day', 'event', 'path', 'lang', 'view', 'screen', 'ref',
          'distance', 'speed', 'detail', 'error', 'countries', 'drivers',
          'visitor', 'site', 'expires_at'];
        const row = {};
        cols.forEach((c, i) => { row[c] = args[i]; });
        this.tables.events.push(row);
        return this._res([], 1);
      }

      if (s.startsWith('INSERT INTO counters')) {
        const [day, metric] = args;
        const found = this.tables.counters.find((r) => r.day === day && r.metric === metric);
        if (found) found.value += 1;
        else this.tables.counters.push({ day, metric, value: 1 });
        return this._res([], 1);
      }

      if (s.startsWith('INSERT INTO breakdowns')) {
        const [day, dimension, key] = args;
        const found = this.tables.breakdowns.find(
          (r) => r.day === day && r.dimension === dimension && r.key === key);
        if (found) found.value += 1;
        else this.tables.breakdowns.push({ day, dimension, key, value: 1 });
        return this._res([], 1);
      }

      if (s.indexOf('SUM(value)') !== -1 && s.indexOf('FROM counters') !== -1) {
        const day = args[0];
        const total = this.tables.counters
          .filter((r) => r.day === day && ['views', 'routes', 'failures'].indexOf(r.metric) !== -1)
          .reduce((n, r) => n + r.value, 0);
        return this._res([{ total }], 0);
      }

      if (s.startsWith('SELECT day, metric, value FROM counters')) {
        return this._res(this._range(this.tables.counters, s, args), 0);
      }

      if (s.startsWith('SELECT day, dimension, key, value FROM breakdowns')) {
        return this._res(this._range(this.tables.breakdowns, s, args), 0);
      }

      const del = s.match(/^DELETE FROM (\w+) WHERE expires_at <= \?$/);
      if (del) {
        const name = del[1];
        const before = this.tables[name].length;
        this.tables[name] = this.tables[name].filter((r) => r.expires_at > args[0]);
        return this._res([], before - this.tables[name].length);
      }

      throw new Error('FakeD1 does not know this statement: ' + s);
    }

    /** Apply the optional `day >= ?` / `day <= ?` clauses. */
    _range(rows, sql, args) {
      let i = 0;
      const from = sql.indexOf('day >= ?') !== -1 ? args[i++] : null;
      const to = sql.indexOf('day <= ?') !== -1 ? args[i++] : null;
      return rows.filter((r) => (!from || r.day >= from) && (!to || r.day <= to))
        .map((r) => Object.assign({}, r));
    }

    _res(results, changes) {
      return { results, meta: { changes }, success: true };
    }
  }

  function makeStore(db, options) {
    return new D1Store(Object.assign({ db }, options || {}));
  }

  const IP = '203.0.113.7';
  const UA = 'Mozilla/5.0 (TestRunner)';

  function pageview(extra) {
    return Object.assign({
      event: 'pageview', path: 'desktop.html', lang: 'es',
      view: 'desktop', screen: 'lg', ref: 'www.google.com'
    }, extra || {});
  }

  /** Rebuild the emptyDay shape from the fake's tables, as summary() does. */
  function liveDay(db, day) {
    const bucket = events.emptyDay(day);
    db.tables.counters.filter((r) => r.day === day)
      .forEach((r) => { bucket[r.metric] = r.value; });
    db.tables.breakdowns.filter((r) => r.day === day)
      .forEach((r) => {
        if (!bucket[r.dimension]) bucket[r.dimension] = {};
        bucket[r.dimension][r.key] = r.value;
      });
    return bucket;
  }

  /* ------------------------------------------------- the agreement test */

  describe('d1 - the live counters agree with a rebuild', function () {
    test('SQL increments reproduce aggregate() exactly', async function () {
      const db = new FakeD1();
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
      const live = liveDay(db, day);

      const raw = db.tables.events.map((r) => ({
        ts: r.ts, event: r.event, path: r.path, lang: r.lang, view: r.view,
        screen: r.screen, ref: r.ref, distance: r.distance,
        countries: r.countries, drivers: r.drivers, error: r.error, v: r.visitor
      }));
      const rebuilt = events.aggregate(raw)[day];

      ['views', 'routes', 'failures', 'visitors'].forEach((f) => {
        assert.equal(live[f] || 0, rebuilt[f] || 0,
          f + ': live ' + (live[f] || 0) + ' vs rebuilt ' + (rebuilt[f] || 0));
      });
      ['pages', 'langs', 'builds', 'screens', 'refs', 'distances', 'countries', 'drivers', 'errors']
        .forEach((f) => {
          assert.deepEqual(live[f] || {}, rebuilt[f] || {},
            f + ' differs between the SQL counters and a rebuild');
        });
    });

    test('countersFor and the Firestore delta pick the same buckets', function () {
      /* Two adapters, one meaning. If someone adds a dimension to one and not
         the other, the two dashboards start disagreeing. */
      const { rollupDelta } = require('../backend/firebase/functions/firestore-store.js');
      const FieldValue = { increment: () => ({ inc: true }) };
      const record = events.normaliseEvent(pageview(), { visitor: 'v1' });

      const sql = countersFor(record);
      const fire = rollupDelta(record, false, FieldValue);

      sql.breakdowns.forEach(([dimension, key]) => {
        assert.ok(fire[dimension], 'Firestore is missing dimension ' + dimension);
        assert.ok(fire[dimension][key] !== undefined,
          'Firestore is missing ' + dimension + '.' + key);
      });
      assert.ok(sql.metrics.indexOf('views') !== -1, 'a page view counts as a view in SQL');
      assert.ok(fire.views, 'and in Firestore');
    });

    test('keys containing dots stay whole', async function () {
      const db = new FakeD1();
      await makeStore(db).record(pageview(), { ip: IP, userAgent: UA });
      const day = events.dayKey();
      const live = liveDay(db, day);
      assert.equal(live.pages['desktop.html'], 1);
      assert.equal(live.refs['www.google.com'], 1);
    });
  });

  /* ------------------------------------------------------------ visitors */

  describe('d1 - visitor counting is stateless-safe', function () {
    test('two isolates share one salt', async function () {
      const db = new FakeD1();
      const a = await makeStore(db).saltFor('2026-09-08');
      const b = await makeStore(db).saltFor('2026-09-08');
      assert.equal(a, b, 'INSERT OR IGNORE must make the loser read the winner');
      assert.ok(a.length >= 32, 'the salt is long enough to be unguessable');
    });

    test('a different day gets a different salt', async function () {
      const db = new FakeD1();
      const a = await makeStore(db).saltFor('2026-09-08');
      const b = await makeStore(db).saltFor('2026-09-09');
      assert.ok(a !== b, 'rotating daily is what stops cross-day linking');
    });

    test('one person hitting two isolates counts once', async function () {
      const db = new FakeD1();
      await makeStore(db).record(pageview(), { ip: IP, userAgent: UA });
      await makeStore(db).record(pageview(), { ip: IP, userAgent: UA });
      const live = liveDay(db, events.dayKey());
      assert.equal(live.views, 2, 'both views are counted');
      assert.equal(live.visitors, 1, 'but they are one visitor');
    });

    test('two people are counted separately', async function () {
      const db = new FakeD1();
      const store = makeStore(db);
      await store.record(pageview(), { ip: '203.0.113.7', userAgent: UA });
      await store.record(pageview(), { ip: '203.0.113.8', userAgent: UA });
      assert.equal(liveDay(db, events.dayKey()).visitors, 2);
    });
  });

  /* ------------------------------------------------------------- privacy */

  describe('d1 - nothing identifying is written', function () {
    test('no IP or user agent appears anywhere in the database', async function () {
      const db = new FakeD1();
      await makeStore(db).record(pageview({
        ip: IP, ua: UA, origin: 'Calle Mayor 1, Madrid'
      }), { ip: IP, userAgent: UA });

      const dump = JSON.stringify(db.tables);
      assert.equal(dump.indexOf(IP), -1, 'the IP address must never be stored');
      assert.equal(dump.indexOf('Mozilla'), -1, 'the user agent must never be stored');
      assert.equal(dump.indexOf('Madrid'), -1, 'an address posted on purpose is dropped');
    });

    test('the schema has no column that could hold an IP', function () {
      const fs = require('fs');
      const path = require('path');
      const sql = fs.readFileSync(
        path.join(__dirname, '..', 'backend', 'cloudflare', 'schema.sql'), 'utf8');
      assert.equal(/\bip\b\s+TEXT/i.test(sql), false, 'no ip column');
      assert.equal(/user_agent|useragent/i.test(sql.replace(/--.*$/gm, '')), false,
        'no user agent column');
    });

    test('raw events can be switched off, leaving only counts', async function () {
      const db = new FakeD1();
      await makeStore(db, { storeRawEvents: false }).record(pageview(), { ip: IP, userAgent: UA });
      assert.equal(db.tables.events.length, 0, 'no per-event row is written');
      assert.equal(liveDay(db, events.dayKey()).views, 1, 'the count still happens');
    });

    test('an unknown event writes nothing at all', async function () {
      const db = new FakeD1();
      const result = await makeStore(db).record({ event: 'exfiltrate' }, { ip: IP, userAgent: UA });
      assert.equal(result.stored, false);
      assert.equal(db.tables.events.length, 0);
      assert.equal(db.tables.counters.length, 0, 'not even a counter is created');
    });
  });

  /* -------------------------------------------------------------- prune */

  describe('d1 - retention is enforced by the scheduled prune', function () {
    test('expired rows are deleted and current ones are kept', async function () {
      const db = new FakeD1();
      const store = makeStore(db);
      await store.record(pageview(), { ip: IP, userAgent: UA });

      const future = Math.floor(Date.now() / 1000) + 86400;
      assert.equal(db.tables.events.length, 1, 'the event is there to begin with');

      /* Nothing has expired yet. */
      const none = await store.prune(Math.floor(Date.now() / 1000));
      assert.equal(none, 0, 'a fresh event survives');
      assert.equal(db.tables.events.length, 1);

      /* Far enough ahead that the retention window has passed. */
      const removed = await store.prune(future + 400 * 86400);
      assert.ok(removed >= 1, 'expired rows are removed, got ' + removed);
      assert.equal(db.tables.events.length, 0, 'the raw event is gone');
      assert.equal(db.tables.salts.length, 0, 'and so is the salt');
      assert.equal(db.tables.visitors.length, 0, 'and the visitor marker');
    });

    test('the counters survive the prune', async function () {
      /* Only raw data expires. The daily totals hold nothing but numbers, so
         deleting them would lose the history for no privacy gain. */
      const db = new FakeD1();
      const store = makeStore(db);
      await store.record(pageview(), { ip: IP, userAgent: UA });
      await store.prune(Math.floor(Date.now() / 1000) + 400 * 86400);
      assert.equal(liveDay(db, events.dayKey()).views, 1, 'the count remains');
    });
  });

  /* --------------------------------------------------------- spending cap */

  describe('d1 - the daily cap is a real stop', function () {
    test('events are refused once the cap is reached', async function () {
      const db = new FakeD1();
      const store = makeStore(db, { dailyEventCap: 3, budgetRecheckMs: 0 });
      const results = [];
      for (let i = 0; i < 6; i += 1) {
        results.push(await store.record(pageview(), { ip: IP, userAgent: UA }));
      }
      assert.equal(results.filter((r) => r.stored).length, 3, 'exactly the cap is stored');
      assert.equal(results[5].reason, 'budget');
      assert.equal(liveDay(db, events.dayKey()).views, 3);
    });

    test('a cap of 0 disables the stop', async function () {
      const db = new FakeD1();
      const store = makeStore(db, { dailyEventCap: 0 });
      for (let i = 0; i < 5; i += 1) await store.record(pageview(), { ip: IP, userAgent: UA });
      assert.equal(liveDay(db, events.dayKey()).views, 5);
    });

    test('a fresh isolate still sees the cap as reached', async function () {
      const db = new FakeD1();
      const first = makeStore(db, { dailyEventCap: 4, budgetRecheckMs: 0 });
      for (let i = 0; i < 4; i += 1) await first.record(pageview(), { ip: IP, userAgent: UA });
      const second = makeStore(db, { dailyEventCap: 4, budgetRecheckMs: 0 });
      const result = await second.record(pageview(), { ip: IP, userAgent: UA });
      assert.equal(result.stored, false, 'the count is shared, not per isolate');
    });
  });

  /* ----------------------------------------------------------- summarise */

  describe('d1 - reading the numbers back', function () {
    test('summary() matches what was recorded', async function () {
      const db = new FakeD1();
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

    test('a day with only a route does not produce NaN', async function () {
      const db = new FakeD1();
      const store = makeStore(db);
      await store.record({ event: 'route_calculated', distance: '100-300km' },
        { ip: IP, userAgent: UA });
      const out = await store.summary(null, null);
      assert.equal(out.totals.views, 0, 'a missing counter reads as zero');
      assert.ok(Number.isFinite(out.totals.failures), 'every total stays a real number');
    });

    test('the range filter is applied', async function () {
      const db = new FakeD1();
      const store = makeStore(db);
      db.tables.counters = [
        { day: '2026-09-01', metric: 'views', value: 5 },
        { day: '2026-09-08', metric: 'views', value: 3 }
      ];
      assert.equal((await store.summary(null, null)).totals.views, 8);
      assert.equal((await store.summary('2026-09-05', '2026-09-30')).totals.views, 3);
    });
  });

  /* -------------------------------------------------------- generated copy */

  describe('d1 - the deployed copy is current', function () {
    test('every generated backend copy matches its source', function () {
      assert.ok(buildBackends.isCurrent(),
        'run `node tools/build-backends.js` - stale: ' + buildBackends.stale().join(', '));
    });
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
