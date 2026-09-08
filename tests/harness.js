/**
 * Truck Route Planner - minimal zero-dependency test harness.
 *
 * Works both under Node (tests/run_node.js) and in the browser
 * (tests/test_runner.html). No build step, no test framework install.
 *
 * created by Gabor Gasko
 */
(function (global) {
  'use strict';

  var suites = [];
  var current = null;

  function describe(name, fn) {
    current = { name: name, tests: [] };
    suites.push(current);
    fn();
    current = null;
  }

  function test(name, fn) {
    if (!current) describe('ungrouped', function () {});
    current.tests.push({ name: name, fn: fn });
  }

  function fail(message) {
    var err = new Error(message);
    err.name = 'AssertionError';
    throw err;
  }

  var assert = {
    ok: function (value, message) {
      if (!value) fail(message || 'expected a truthy value, got ' + JSON.stringify(value));
    },
    equal: function (actual, expected, message) {
      if (actual !== expected) {
        fail(message || 'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
      }
    },
    closeTo: function (actual, expected, tolerance, message) {
      var tol = tolerance == null ? 1e-9 : tolerance;
      if (!isFinite(actual) || Math.abs(actual - expected) > tol) {
        fail(message || 'expected ' + actual + ' to be within ' + tol + ' of ' + expected);
      }
    },
    deepEqual: function (actual, expected, message) {
      var a = JSON.stringify(actual);
      var b = JSON.stringify(expected);
      if (a !== b) fail(message || 'expected ' + b + ', got ' + a);
    },
    throws: function (fn, message) {
      var threw = false;
      try { fn(); } catch (e) { threw = true; }
      if (!threw) fail(message || 'expected the call to throw');
    },
    lengthOf: function (list, n, message) {
      var len = list ? list.length : -1;
      if (len !== n) fail(message || 'expected length ' + n + ', got ' + len);
    }
  };

  /**
   * Run every registered suite.
   * @returns {{passed:number, failed:number, results:Array}}
   */
  /**
   * Run every registered test and resolve with a summary.
   *
   * Returns a promise, because a test function is allowed to be async: the
   * Firestore backend can only be exercised through promises. A synchronous
   * loop would call such a test, get a promise back, and count it as passed
   * without ever seeing its assertions - a test suite that reports green
   * regardless of the code is worse than none.
   *
   * Tests run one at a time and in registration order. Several suites set
   * shared state (the active language, for one), so overlapping them would
   * make results depend on timing.
   */
  function run(onResult) {
    var passed = 0;
    var failed = 0;
    var results = [];
    var queue = [];

    suites.forEach(function (suite) {
      suite.tests.forEach(function (t) { queue.push({ suite: suite, test: t }); });
    });

    return queue.reduce(function (chain, item) {
      return chain.then(function () {
        var entry = { suite: item.suite.name, name: item.test.name, ok: true, error: null };
        return Promise.resolve()
          .then(function () { return item.test.fn(); })
          .then(
            function () { passed++; },
            function (err) {
              entry.ok = false;
              entry.error = (err && err.message) || String(err);
              failed++;
            }
          )
          .then(function () {
            results.push(entry);
            if (onResult) onResult(entry);
          });
      });
    }, Promise.resolve()).then(function () {
      return { passed: passed, failed: failed, results: results, suites: suites };
    });
  }

  global.TRPTest = { describe: describe, test: test, assert: assert, run: run, suites: suites };

  if (typeof module !== 'undefined' && module.exports) module.exports = global.TRPTest;
})(typeof globalThis !== 'undefined' ? globalThis : this);
