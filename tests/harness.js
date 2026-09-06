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
  function run(onResult) {
    var passed = 0;
    var failed = 0;
    var results = [];

    suites.forEach(function (suite) {
      suite.tests.forEach(function (t) {
        var entry = { suite: suite.name, name: t.name, ok: true, error: null };
        try {
          t.fn();
          passed++;
        } catch (err) {
          entry.ok = false;
          entry.error = (err && err.message) || String(err);
          failed++;
        }
        results.push(entry);
        if (onResult) onResult(entry);
      });
    });

    return { passed: passed, failed: failed, results: results, suites: suites };
  }

  global.TRPTest = { describe: describe, test: test, assert: assert, run: run, suites: suites };

  if (typeof module !== 'undefined' && module.exports) module.exports = global.TRPTest;
})(typeof globalThis !== 'undefined' ? globalThis : this);
