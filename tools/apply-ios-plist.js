#!/usr/bin/env node
/**
 * Truck Route Planner - merge our keys into the generated Info.plist.
 *
 *     node tools/apply-ios-plist.js
 *
 * `cap add ios` writes a fresh Info.plist from Capacitor's template, so any
 * edit made by hand is lost the next time the project is regenerated. These
 * three keys have to survive that, so they are applied by a script instead:
 *
 *   CFBundleLocalizations          Without it iOS ignores the .lproj folders
 *                                  and both the system and the App Store
 *                                  listing report the app as English-only,
 *                                  despite it speaking 24 languages.
 *
 *   ITSAppUsesNonExemptEncryption  Declared false so every TestFlight upload
 *                                  stops asking the export-compliance
 *                                  question. The app uses HTTPS and nothing
 *                                  else, which is the exempt case.
 *
 *   CFBundleDisplayName            The name under the icon, kept short.
 *
 * The transformation is a pure function over the file's text so it can be
 * tested without an Xcode project, which is the point: this runs on a macOS
 * runner, but it is written and changed on Windows.
 *
 * created by Gabor Gasko
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const PLIST = path.join(root, 'ios', 'App', 'App', 'Info.plist');
const LANGS = path.join(root, 'ios-resources', 'CFBundleLocalizations.json');

const DISPLAY_NAME = 'Planificador';

/** Remove a top-level key and its value, so re-running cannot duplicate it. */
function removeKey(xml, key) {
  const pattern = new RegExp(
    '[ \\t]*<key>' + key + '</key>\\s*' +
    '(?:<(?:string|true|false|integer|real)\\s*/>|' +
    '<(string|integer|real)>[\\s\\S]*?</\\1>|' +
    '<true\\s*/>|<false\\s*/>|' +
    '<array>[\\s\\S]*?</array>)\\r?\\n?',
    'g'
  );
  return xml.replace(pattern, '');
}

/**
 * Apply our keys to an Info.plist's text.
 *
 * @param {string} xml       the existing file
 * @param {string[]} langs   language codes, in the order they should appear
 * @returns {string}
 */
function applyKeys(xml, langs, purpose) {
  let out = xml;
  ['CFBundleLocalizations', 'ITSAppUsesNonExemptEncryption', 'CFBundleDisplayName',
    'NSLocationWhenInUseUsageDescription']
    .forEach((key) => { out = removeKey(out, key); });

  const close = out.lastIndexOf('</dict>');
  if (close === -1) throw new Error('Info.plist has no closing <dict>');

  /* XML, so the text has to survive an ampersand or an angle bracket. */
  const esc = (v) => String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const block = [
    '\t<key>CFBundleDisplayName</key>',
    '\t<string>' + DISPLAY_NAME + '</string>',
    '\t<key>ITSAppUsesNonExemptEncryption</key>',
    '\t<false/>',
    /* The base value. Each <lang>.lproj overrides it, but a missing base key
       means iOS shows no explanation at all in an unlisted language, and Apple
       rejects a location request with no purpose string. */
    '\t<key>NSLocationWhenInUseUsageDescription</key>',
    '\t<string>' + esc(purpose || 'Used only to fill in the starting point of a route.') + '</string>',
    '\t<key>CFBundleLocalizations</key>',
    '\t<array>'
  ]
    .concat(langs.map((code) => '\t\t<string>' + code + '</string>'))
    .concat(['\t</array>', ''])
    .join('\n');

  return out.slice(0, close) + block + out.slice(close);
}

function main() {
  if (!fs.existsSync(PLIST)) {
    process.stdout.write(
      'ios/ is not present - nothing to patch.\n' +
      'This runs after `cap add ios`, which needs macOS.\n');
    return false;
  }
  if (!fs.existsSync(LANGS)) {
    throw new Error('run tools/build-ios-resources.js first');
  }

  const langs = JSON.parse(fs.readFileSync(LANGS, 'utf8'));
  const i18n = require(path.join(root, 'js', 'core', 'i18n.js'));
  const purpose = i18n.STRINGS['location.purpose'].en;
  const before = fs.readFileSync(PLIST, 'utf8');
  const after = applyKeys(before, langs, purpose);
  fs.writeFileSync(PLIST, after, 'utf8');

  process.stdout.write('Info.plist: display name, export-compliance flag and ' +
    langs.length + ' localisations applied\n');
  return true;
}

if (require.main === module) main();

module.exports = { applyKeys, removeKey, DISPLAY_NAME };
