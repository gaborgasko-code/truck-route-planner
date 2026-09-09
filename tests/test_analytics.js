/**
 * Truck Route Planner - audience measurement tests.
 *
 * Two halves, both pure and both offline:
 *
 *   client - `buildPayload` decides what leaves the browser. The tests assert
 *            that free text (addresses, coordinates, query strings) cannot get
 *            into a payload even when it is handed in deliberately, and that
 *            distances and timings arrive as coarse bands.
 *   server - `normaliseEvent` is the second gate: an allowlist applied to
 *            whatever actually arrives, so a forged POST cannot write new
 *            fields, and `aggregate` counts what the dashboard reads.
 *
 * created by Gabor Gasko
 */
(function (global) {
  'use strict';

  var TRP = (global.TRP = global.TRP || {});
  var isNode = typeof require === 'function' && typeof module !== 'undefined';

  if (isNode) {
    if (!global.TRPTest) require('./harness.js');
    if (!TRP.CONFIG) require('../js/core/config.js');
    if (!TRP.consent) require('../js/core/consent.js');
    if (!TRP.analytics) require('../js/core/analytics.js');
  }

  var T = global.TRPTest;
  var describe = T.describe;
  var test = T.test;
  var assert = T.assert;
  var analytics = TRP.analytics;

  /* The backend is Node-only; in the browser runner those suites are skipped. */
  var store = isNode ? require('../backend/store.js') : null;

  var CTX = {
    site: 'planificador',
    path: '/desktop.html',
    lang: 'es',
    view: 'desktop',
    referrer: 'https://www.google.com/search?q=camion+madrid+hamburgo',
    host: 'example.org',
    screenWidth: 1440
  };

  describe('analytics - the payload carries no free text', function () {
    test('a page view sends only coarse, non-identifying fields', function () {
      var p = analytics.buildPayload('pageview', null, CTX);
      assert.equal(p.event, 'pageview');
      assert.equal(p.path, 'desktop.html', 'the path is the file, not the full URL');
      assert.equal(p.lang, 'es');
      assert.equal(p.view, 'desktop');
      assert.equal(p.screen, 'lg', 'the screen is a bucket, not a resolution');
    });

    test('the referrer is reduced to a hostname, dropping the search query', function () {
      var p = analytics.buildPayload('pageview', null, CTX);
      assert.equal(p.ref, 'www.google.com');
      assert.equal(String(p.ref).indexOf('camion'), -1,
        'the visitor search terms must never be transmitted');
    });

    test('an internal referrer is dropped entirely', function () {
      var ctx = Object.assign({}, CTX, { referrer: 'https://example.org/index.html' });
      assert.equal(analytics.buildPayload('pageview', null, ctx).ref, '',
        'navigating within the site is not a referral');
    });

    test('a query string on our own page never reaches the payload', function () {
      var ctx = Object.assign({}, CTX, { path: '/mobile.html' });
      var p = analytics.buildPayload('pageview', null, ctx);
      assert.equal(p.path, 'mobile.html');
      assert.equal(p.path.indexOf('?'), -1, 'no query string survives');
    });

    test('addresses handed in as props are simply not copied', function () {
      var p = analytics.buildPayload('route_calculated', {
        distanceKm: 1780,
        durationMs: 4200,
        countries: 4,
        origin: 'Calle Mayor 1, Madrid',
        destination: 'Hafenstrasse 3, Hamburg',
        polyline: 'abcdefghijklmnop'
      }, CTX);
      var text = JSON.stringify(p);
      assert.equal(text.indexOf('Madrid'), -1, 'no origin address in the payload');
      assert.equal(text.indexOf('Hamburg'), -1, 'no destination address in the payload');
      assert.equal(text.indexOf('abcdefgh'), -1, 'no route geometry in the payload');
      assert.equal(p.countries, 4, 'the counted fields still arrive');
    });
  });

  describe('analytics - values are banded, not exact', function () {
    test('distances land in the expected bands', function () {
      var b = analytics.DISTANCE_BANDS;
      assert.equal(analytics.band(50, b, 'km'), '0-100km');
      assert.equal(analytics.band(250, b, 'km'), '100-300km');
      assert.equal(analytics.band(1780, b, 'km'), '1000-2000km');
      assert.equal(analytics.band(4200, b, 'km'), '2000+km', 'the top band is open-ended');
    });

    test('a band never reveals the exact figure', function () {
      var p = analytics.buildPayload('route_calculated', { distanceKm: 1783.4 }, CTX);
      assert.equal(p.distance, '1000-2000km');
      assert.equal(JSON.stringify(p).indexOf('1783'), -1, 'the exact distance is not sent');
    });

    test('screen widths bucket by size class', function () {
      assert.equal(analytics.screenBand(375), 'xs');
      assert.equal(analytics.screenBand(768), 'md');
      assert.equal(analytics.screenBand(1920), 'xl');
      assert.equal(analytics.screenBand(0), 'na', 'a missing width is not invented');
    });

    test('nonsense input degrades to "na" instead of throwing', function () {
      assert.equal(analytics.band(NaN, analytics.DISTANCE_BANDS, 'km'), 'na');
      assert.equal(analytics.band(-5, analytics.DISTANCE_BANDS, 'km'), 'na');
      assert.equal(analytics.referrerHost('not a url', 'example.org'), '');
    });
  });

  describe('analytics - consent gates every send', function () {
    test('nothing is enabled without a configured collector', function () {
      var before = TRP.CONFIG.ANALYTICS_ENDPOINT;
      TRP.CONFIG.ANALYTICS_ENDPOINT = '';
      try {
        assert.equal(analytics.enabled(), false,
          'with no endpoint there is nowhere to send and nothing is collected');
      } finally {
        TRP.CONFIG.ANALYTICS_ENDPOINT = before;
      }
    });
  });

  if (!isNode) return;

  describe('backend - the server allowlist is the second gate', function () {
    test('unknown fields are dropped, whatever a client posts', function () {
      var e = store.normaliseEvent({
        event: 'pageview',
        path: 'desktop.html',
        lang: 'es',
        ip: '203.0.113.7',
        ua: 'Mozilla/5.0',
        email: 'someone@example.org',
        origin: 'Calle Mayor 1, Madrid'
      }, { visitor: 'hash123' });
      assert.equal(e.ip, undefined, 'an IP is never stored');
      assert.equal(e.ua, undefined, 'a user agent is never stored');
      assert.equal(e.email, undefined, 'arbitrary fields are refused');
      assert.equal(e.origin, undefined, 'an address is refused even if posted');
      assert.equal(e.event, 'pageview', 'allowed fields still get through');
      assert.equal(e.v, 'hash123', 'the daily visitor hash is attached by the server');
    });

    test('every stored key is on the allowlist', function () {
      var e = store.normaliseEvent({
        event: 'route_calculated', path: 'a.html', countries: 3
      }, { visitor: 'h', site: 'planificador' });
      Object.keys(e).forEach(function (k) {
        var known = store.FIELDS[k] !== undefined || store.NUMERIC[k] !== undefined ||
          k === 'ts' || k === 'v' || k === 'site';
        assert.ok(known, k + ' is a known field');
      });
    });

    test('an unknown event name is rejected outright', function () {
      assert.equal(store.normaliseEvent({ event: 'exfiltrate' }, {}), null,
        'only the declared events are accepted');
      assert.equal(store.normaliseEvent({}, {}), null, 'and an event name is required');
      assert.equal(store.normaliseEvent(null, {}), null, 'a non-object is refused');
    });

    test('a field with a fixed vocabulary rejects anything else', function () {
      var e = store.normaliseEvent({
        event: 'pageview', view: 'kiosk', screen: 'enormous'
      }, {});
      assert.equal(e.view, undefined, 'an unknown build name is dropped');
      assert.equal(e.screen, undefined, 'an unknown screen bucket is dropped');
    });

    test('numeric fields are clamped to their declared range', function () {
      var e = store.normaliseEvent({
        event: 'route_calculated', countries: 9999, drivers: 7
      }, {});
      assert.ok(e.countries <= 20, 'countries clamped to the declared maximum');
      assert.ok(e.drivers >= 1 && e.drivers <= 2, 'drivers clamped to 1..2');
    });

    test('over-long and control-character text is trimmed and cleaned', function () {
      var e = store.normaliseEvent({
        event: 'pageview',
        path: 'x'.repeat(500),
        lang: 'e' + String.fromCharCode(0) + 's'
      }, {});
      assert.ok(e.path.length <= store.FIELDS.path.max, 'long values are truncated');
      assert.equal(e.lang.indexOf(String.fromCharCode(0)), -1,
        'control characters are stripped before anything is written');
    });
  });

  describe('backend - the visitor hash cannot be reversed', function () {
    test('the same visitor on the same day counts once', function () {
      var a = store.visitorHash('salt-of-the-day', '203.0.113.7', 'Mozilla/5.0');
      var b = store.visitorHash('salt-of-the-day', '203.0.113.7', 'Mozilla/5.0');
      assert.equal(a, b, 'stable within the day, so visitors are not double counted');
    });

    test('the next day the same visitor is a different value', function () {
      var a = store.visitorHash('salt-day-1', '203.0.113.7', 'Mozilla/5.0');
      var b = store.visitorHash('salt-day-2', '203.0.113.7', 'Mozilla/5.0');
      assert.ok(a !== b, 'rotating the salt breaks the link between days');
    });

    test('the hash contains no trace of the address it came from', function () {
      var h = store.visitorHash('salt', '203.0.113.7', 'Mozilla/5.0');
      assert.ok(/^[0-9a-f]+$/.test(h), 'it is a hex digest');
      assert.equal(h.indexOf('203'), -1, 'and carries none of the IP');
      assert.ok(h.length <= 16, 'truncated, so it is useless as a lasting identifier');
    });

    test('different visitors do not collide', function () {
      var a = store.visitorHash('salt', '203.0.113.7', 'Mozilla/5.0');
      var b = store.visitorHash('salt', '203.0.113.8', 'Mozilla/5.0');
      assert.ok(a !== b, 'distinct visitors count separately');
    });
  });

  describe('backend - aggregation', function () {
    var DAY = '2026-09-01';
    var events = [
      { ts: DAY + 'T08:00:00.000Z', event: 'pageview', path: 'desktop.html', lang: 'es', view: 'desktop', screen: 'lg', v: 'aaa' },
      { ts: DAY + 'T09:00:00.000Z', event: 'pageview', path: 'desktop.html', lang: 'es', view: 'desktop', screen: 'lg', v: 'aaa' },
      { ts: DAY + 'T10:00:00.000Z', event: 'pageview', path: 'mobile.html', lang: 'de', view: 'mobile', screen: 'xs', v: 'bbb' },
      { ts: DAY + 'T11:00:00.000Z', event: 'route_calculated', distance: '1000-2000km', countries: 3, drivers: 1, v: 'aaa' },
      { ts: DAY + 'T12:00:00.000Z', event: 'route_failed', error: 'TIMEOUT', v: 'bbb' }
    ];

    test('views count every hit but visitors count each person once', function () {
      var day = store.aggregate(events)[DAY];
      assert.equal(day.views, 3, 'three page views');
      assert.equal(day.visitors, 2, 'from two distinct visitors');
      assert.equal(day.routes, 1, 'one route calculated');
      assert.equal(day.failures, 1, 'and one failure');
    });

    test('breakdowns are tallied per dimension', function () {
      var day = store.aggregate(events)[DAY];
      assert.equal(day.pages['desktop.html'], 2, 'the busier page is counted twice');
      assert.equal(day.langs.es, 2, 'Spanish page views');
      assert.equal(day.langs.de, 1);
      assert.equal(day.builds.mobile, 1);
      assert.equal(day.errors.TIMEOUT, 1, 'failures are grouped by error code');
    });

    test('a visit with no referrer is grouped as direct', function () {
      var day = store.aggregate(events)[DAY];
      assert.equal(day.refs.direct, 3, 'no referrer means a direct visit');
    });

    test('events are bucketed into the UTC day they happened on', function () {
      var days = store.aggregate(events.concat([
        { ts: '2026-09-02T00:30:00.000Z', event: 'pageview', path: 'a.html', v: 'ccc' }
      ]));
      assert.equal(Object.keys(days).length, 2, 'two separate days');
      assert.equal(days['2026-09-02'].views, 1);
      assert.equal(days['2026-09-02'].visitors, 1,
        'a visitor seen on a new day is counted again on that day');
    });

    test('an empty day aggregates to zeroes rather than failing', function () {
      assert.equal(Object.keys(store.aggregate([])).length, 0, 'no events, no days');
      var blank = store.emptyDay('2026-09-01');
      assert.equal(blank.views, 0);
      assert.equal(blank.visitors, 0);
    });

    test('aggregate() accumulates into an existing rollup', function () {
      var days = store.aggregate(events.slice(0, 2));
      store.aggregate(events.slice(2, 3), days);
      assert.equal(days[DAY].views, 3, 'the second pass adds to the first');
    });

    test('top() ranks a breakdown highest first', function () {
      var ranked = store.top({ es: 3, de: 1, fr: 7 }, 2);
      assert.equal(ranked.length, 2, 'the limit is respected');
      assert.equal(ranked[0].key, 'fr', 'the largest comes first');
      assert.equal(ranked[0].count, 7);
    });
  });

  describe('dashboard - the page itself is valid', function () {
    const fsMod = require('fs');
    const pathMod = require('path');
    const html = fsMod.readFileSync(
      pathMod.join(__dirname, '..', 'backend', 'dashboard.html'), 'utf8');

    test('the inline script parses', function () {
      /* There is no build step and no module loader here, so nothing else
         would notice a broken script until the page was opened in a browser
         and silently did nothing. */
      const blocks = html.match(/<script>[\s\S]*?<\/script>/g) || [];
      assert.ok(blocks.length > 0, 'the dashboard has an inline script');
      blocks.forEach(function (block, i) {
        const body = block.replace(/^<script>/, '').replace(/<\/script>$/, '');
        try {
          new Function(body);
        } catch (err) {
          assert.ok(false, 'script block ' + i + ' does not parse: ' + err.message);
        }
      });
    });

    test('the API URL is built relative to the page', function () {
      /* An absolute '/api/stats' works on the Node service but misses the
         mount point of a Cloud Function, where the platform strips the
         function name and the server cannot tell where it lives. */
      assert.ok(html.indexOf("'/api/stats") === -1,
        'an absolute /api/stats would break under a function mount point');
      assert.ok(html.indexOf('location.href') !== -1,
        'the base is derived from the address the browser actually used');
    });

    test('the token is never put in the page address', function () {
      assert.ok(html.indexOf('sessionStorage') !== -1,
        'the token lives in sessionStorage');
      assert.ok(!/location\.(search|hash)\s*=/.test(html),
        'nothing writes the token into the URL');
    });
  });


  describe('analytics - one definition of what an event may carry', function () {
    test('eventParams bands the figures and drops everything else', function () {
      var p = analytics.eventParams({
        distanceKm: 1783.4, durationMs: 4200, countries: 4, drivers: 2,
        tollDetail: 'precise', errorCode: 'TIMEOUT',
        origin: 'Calle Mayor 1, Madrid', polyline: 'abcdefgh'
      });
      assert.equal(p.distance, '1000-2000km', 'banded, not the exact figure');
      assert.equal(p.countries, 4);
      assert.equal(p.drivers, 2);
      assert.equal(p.origin, undefined, 'an address is not copied');
      assert.equal(p.polyline, undefined, 'nor route geometry');
      assert.equal(JSON.stringify(p).indexOf('1783'), -1, 'the exact distance never leaves');
    });

    test('buildPayload and eventParams cannot disagree', function () {
      /* Google Analytics and the self-hosted collector are fed from the same
         function, so adding a destination never means re-deciding what is
         safe to send. */
      var props = { distanceKm: 250, countries: 2, drivers: 1 };
      var direct = analytics.eventParams(props);
      var payload = analytics.buildPayload('route_calculated', props, CTX);
      Object.keys(direct).forEach(function (k) {
        assert.equal(payload[k], direct[k], k + ' differs between the two paths');
      });
    });

    test('clamps a nonsense country count instead of passing it on', function () {
      assert.equal(analytics.eventParams({ countries: 9999 }).countries, 20);
      assert.equal(analytics.eventParams({ drivers: 7 }).drivers, 1);
    });
  });

})(typeof globalThis !== 'undefined' ? globalThis : this);
