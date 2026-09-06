#!/usr/bin/env node
/**
 * Truck Route Planner - generate js/core/embedded-data.js from data/*.json.
 *
 * The generated file lets the app run straight from `file://`, where `fetch()`
 * of a local JSON file is blocked by the browser. Re-run this after editing
 * any dataset:
 *
 *     node tools/build-embedded-data.js
 *
 * created by Gabor Gasko
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const datasets = [
  ['tollRates', 'toll_rates.json'],
  ['parkings', 'safe_parkings.json'],
  ['regulations', 'trailer_regulations.json']
];

const parts = datasets.map(([key, file]) => {
  const full = path.join(root, 'data', file);
  const json = JSON.parse(fs.readFileSync(full, 'utf8'));
  return '    ' + key + ': ' + JSON.stringify(json);
});

const out = [
  '/**',
  ' * Truck Route Planner - AUTO-GENERATED offline copy of data/*.json.',
  ' *',
  ' * DO NOT EDIT BY HAND. Edit the JSON files in data/ and run:',
  ' *     node tools/build-embedded-data.js',
  ' *',
  ' * Used as a fallback when fetch() cannot read the JSON files, which is the',
  ' * case when the app is opened directly from the file system.',
  ' *',
  ' * created by Gabor Gasko',
  ' */',
  '(function (global) {',
  "  'use strict';",
  '  var TRP = (global.TRP = global.TRP || {});',
  '  TRP.EMBEDDED_DATA = {',
  parts.join(',\n'),
  '  };',
  "  if (typeof module !== 'undefined' && module.exports) module.exports = TRP.EMBEDDED_DATA;",
  "})(typeof globalThis !== 'undefined' ? globalThis : this);",
  ''
].join('\n');

const target = path.join(root, 'js', 'core', 'embedded-data.js');
fs.writeFileSync(target, out, 'utf8');
console.log('Wrote ' + path.relative(root, target) + ' (' + out.length + ' bytes)');
