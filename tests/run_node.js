#!/usr/bin/env node
/**
 * Truck Route Planner - Node test runner.
 *
 *     node tests/run_node.js
 *
 * Loads the browser modules into the Node global scope (they all attach to
 * `globalThis.TRP`), runs every registered test and exits non-zero on failure.
 * No network access and no npm dependencies.
 *
 * created by Gabor Gasko
 */
'use strict';

const path = require('path');

const root = path.resolve(__dirname, '..');

/* Load order matters: each module reads the ones before it off globalThis. */
[
  'js/core/config.js',
  'js/core/i18n.js',
  'js/core/consent.js',
  'js/core/analytics.js',
  'js/core/ga.js',
  'js/core/util.js',
  'js/core/geo.js',
  'js/core/embedded-data.js',
  'js/core/data-store.js',
  'js/core/time-model.js',
  'js/core/eu-rules.js',
  'js/core/tolls.js',
  'js/core/stops.js',
  'js/core/regulations.js',
  'js/core/planner.js',
  'tests/harness.js',
  'tests/test_time_estimation.js',
  'tests/test_toll_estimation.js',
  'tests/test_stop_suggestions.js',
  'tests/test_legal_stops.js',
  'tests/test_multi_manning.js',
  'tests/test_i18n.js',
  'tests/test_consent.js',
  'tests/test_analytics.js',
  'tests/test_firestore_store.js',
  'tests/test_d1_store.js',
  'tests/test_ga.js'
].forEach((file) => require(path.join(root, file)));

const E = String.fromCharCode(27);
const GREEN = E + '[32m';
const RED = E + '[31m';
const DIM = E + '[2m';
const BOLD = E + '[1m';
const OFF = E + '[0m';

console.log(BOLD + 'Truck Route Planner - test suite' + OFF);
console.log(DIM + 'created by Gabor Gasko' + OFF + '\n');

let lastSuite = null;
globalThis.TRPTest.run((entry) => {
  if (entry.suite !== lastSuite) {
    lastSuite = entry.suite;
    console.log(BOLD + entry.suite + OFF);
  }
  if (entry.ok) {
    console.log('  ' + GREEN + 'PASS' + OFF + ' ' + entry.name);
  } else {
    console.log('  ' + RED + 'FAIL' + OFF + ' ' + entry.name);
    console.log('       ' + RED + entry.error + OFF);
  }
}).then((summary) => {
  const total = summary.passed + summary.failed;
  console.log('');
  console.log(BOLD + summary.passed + ' / ' + total + ' tests passed' + OFF +
    (summary.failed ? RED + ' (' + summary.failed + ' failed)' + OFF : GREEN + ' - all green' + OFF));

  process.exit(summary.failed ? 1 : 0);
}).catch((err) => {
  console.error(RED + 'the runner itself failed: ' + (err && err.stack || err) + OFF);
  process.exit(1);
});
