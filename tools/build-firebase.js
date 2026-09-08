#!/usr/bin/env node
/**
 * Truck Route Planner - copy the shared analytics files into the functions dir.
 *
 *     node tools/build-firebase.js
 *
 * `firebase deploy` uploads only the functions directory, so anything the
 * function requires has to live inside it. Rather than keep a second, drifting
 * copy of the rules that decide what may be stored, the single source in
 * backend/lib/events.js is copied in and stamped as generated.
 *
 * Run this before deploying. `npm run deploy` in backend/firebase/functions
 * does it for you, and the test suite fails if the copy is stale.
 *
 * created by Gabor Gasko
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const target = path.join(root, 'backend', 'firebase', 'functions');

/* [source, destination, how to comment a line in that file type] */
const FILES = [
  [path.join(root, 'backend', 'lib', 'events.js'), 'events.js', 'js'],
  [path.join(root, 'backend', 'dashboard.html'), 'dashboard.html', 'html']
];

const BANNER_JS = [
  '/* GENERATED FILE - DO NOT EDIT.',
  ' * Copied from backend/lib/events.js by tools/build-firebase.js.',
  ' * Edit the original and re-run the script; edits here are overwritten.',
  ' */',
  ''
].join('\n');

const BANNER_HTML = [
  '<!--',
  '  GENERATED FILE - DO NOT EDIT.',
  '  Copied from backend/dashboard.html by tools/build-firebase.js.',
  '  Edit the original and re-run the script; edits here are overwritten.',
  '-->',
  ''
].join('\n');

/** The generated text for one file, so build and check agree exactly. */
function render(source, kind) {
  const body = fs.readFileSync(source, 'utf8');
  return (kind === 'html' ? BANNER_HTML : BANNER_JS) + body;
}

function build() {
  fs.mkdirSync(target, { recursive: true });
  FILES.forEach(([source, name, kind]) => {
    fs.writeFileSync(path.join(target, name), render(source, kind), 'utf8');
    process.stdout.write('wrote backend/firebase/functions/' + name + '\n');
  });
}

/** True when every generated copy matches its source. Used by the tests. */
function isCurrent() {
  return FILES.every(([source, name, kind]) => {
    const dest = path.join(target, name);
    if (!fs.existsSync(dest)) return false;
    return fs.readFileSync(dest, 'utf8') === render(source, kind);
  });
}

if (require.main === module) build();

module.exports = { build, isCurrent, FILES, target };
