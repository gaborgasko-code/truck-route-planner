#!/usr/bin/env node
/**
 * Truck Route Planner - copy the shared analytics files into each backend.
 *
 *     node tools/build-backends.js
 *
 * Both hosted backends are deployed by uploading a single directory, so
 * anything they require has to live inside it. Rather than keep two drifting
 * copies of the rules that decide what may be stored, the single source in
 * backend/lib/events.js is copied in and stamped as generated.
 *
 * Run this before deploying either one. The npm scripts do it for you, and the
 * test suite fails if a copy is stale - deploying stale rules is how the
 * allowlist would quietly fall out of step with the app.
 *
 * created by Gabor Gasko
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const SOURCES = {
  events: path.join(root, 'backend', 'lib', 'events.js'),
  dashboard: path.join(root, 'backend', 'dashboard.html')
};

/* Each entry: [absolute source, destination directory, file name, kind] */
const FILES = [
  [SOURCES.events, path.join(root, 'backend', 'firebase', 'functions'), 'events.js', 'js'],
  [SOURCES.dashboard, path.join(root, 'backend', 'firebase', 'functions'), 'dashboard.html', 'html'],
  [SOURCES.events, path.join(root, 'backend', 'cloudflare', 'src'), 'events.js', 'js'],
  [SOURCES.dashboard, path.join(root, 'backend', 'cloudflare', 'src'), 'dashboard.html', 'html']
];

function banner(source, kind) {
  const from = path.relative(root, source).split(path.sep).join('/');
  const lines = [
    'GENERATED FILE - DO NOT EDIT.',
    'Copied from ' + from + ' by tools/build-backends.js.',
    'Edit the original and re-run the script; edits here are overwritten.'
  ];
  return kind === 'html'
    ? '<!--\n  ' + lines.join('\n  ') + '\n-->\n'
    : '/* ' + lines[0] + '\n * ' + lines[1] + '\n * ' + lines[2] + '\n */\n';
}

/** The generated text for one file, so build and check agree exactly. */
function render(source, kind) {
  return banner(source, kind) + fs.readFileSync(source, 'utf8');
}

function build() {
  FILES.forEach(([source, dir, name, kind]) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), render(source, kind), 'utf8');
    process.stdout.write('wrote ' + path.relative(root, path.join(dir, name))
      .split(path.sep).join('/') + '\n');
  });
}

/** True when every generated copy matches its source. Used by the tests. */
function isCurrent() {
  return FILES.every(([source, dir, name, kind]) => {
    const dest = path.join(dir, name);
    if (!fs.existsSync(dest)) return false;
    return fs.readFileSync(dest, 'utf8') === render(source, kind);
  });
}

/** Which copies are stale, so a failing test can say what to look at. */
function stale() {
  return FILES.filter(([source, dir, name, kind]) => {
    const dest = path.join(dir, name);
    return !fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== render(source, kind);
  }).map(([, dir, name]) => path.relative(root, path.join(dir, name)).split(path.sep).join('/'));
}

if (require.main === module) build();

module.exports = { build, isCurrent, stale, FILES };
