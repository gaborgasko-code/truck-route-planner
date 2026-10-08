#!/usr/bin/env node
/**
 * Truck Route Planner - upload the App Store screenshots with the App Store
 * Connect API.
 *
 *     node tools/asc-upload-screenshots.js            (in CI, see below)
 *     node tools/asc-upload-screenshots.js --dry-run  (checks the files only)
 *
 * Runs in .github/workflows/store-screenshots.yml on Aissa's repository,
 * which holds the API key as secrets - the key is never on a developer's
 * screen or in a chat. It replaces the 6.9-inch iPhone screenshots of the
 * editable App Store version (package.json's version) in each locale folder
 * under store/screenshots/, in file-name order, and waits until Apple has
 * processed every one.
 *
 * Environment: ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY_B64 (base64 of the
 * AuthKey_<id>.p8, as tools/ios-signing.sh stores it).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const SHOTS = path.join(root, 'store', 'screenshots');
const API = 'https://api.appstoreconnect.apple.com/v1';
/* 1290x2796 and 1320x2868 both belong to this display type (6.7" and 6.9"). */
const DISPLAY_TYPE = 'APP_IPHONE_67';
const SIZES = ['1290x2796', '1320x2868'];

const bundleId = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8')).appId;
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;

function pngSize(buf) {
  /* Width and height sit in the IHDR chunk, right after the signature. */
  if (buf.toString('latin1', 1, 4) !== 'PNG') return null;
  return buf.readUInt32BE(16) + 'x' + buf.readUInt32BE(20);
}

/** Every locale folder and its screenshots, checked before anything is sent. */
function collect() {
  if (!fs.existsSync(SHOTS)) throw new Error('no ' + path.relative(root, SHOTS));
  return fs.readdirSync(SHOTS).filter((d) => fs.statSync(path.join(SHOTS, d)).isDirectory()).sort()
    .map((locale) => {
      const files = fs.readdirSync(path.join(SHOTS, locale)).filter((f) => /\.png$/i.test(f)).sort();
      if (!files.length || files.length > 10) throw new Error(locale + ': ' + files.length + ' screenshots, need 1-10');
      return {
        locale,
        files: files.map((f) => {
          const file = path.join(SHOTS, locale, f);
          const buf = fs.readFileSync(file);
          const size = pngSize(buf);
          if (SIZES.indexOf(size) === -1) throw new Error(locale + '/' + f + ' is ' + size + ', need ' + SIZES.join(' or '));
          return { name: f, buf, size };
        })
      };
    });
}

function b64url(data) {
  return Buffer.from(data).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/** A 20-minute ES256 token, as App Store Connect requires. */
function token() {
  const keyId = process.env.ASC_KEY_ID;
  const issuer = process.env.ASC_ISSUER_ID;
  const pem = Buffer.from(process.env.ASC_PRIVATE_KEY_B64 || '', 'base64').toString('utf8');
  if (!keyId || !issuer || pem.indexOf('PRIVATE KEY') === -1) {
    throw new Error('ASC_KEY_ID, ASC_ISSUER_ID and ASC_PRIVATE_KEY_B64 must be set');
  }
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
  const body = b64url(JSON.stringify({ iss: issuer, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' }));
  const sig = crypto.sign('sha256', Buffer.from(head + '.' + body), { key: pem, dsaEncoding: 'ieee-p1363' });
  return head + '.' + body + '.' + b64url(sig);
}

let bearer = null;
async function api(method, url, body) {
  const res = await fetch(url.startsWith('http') ? url : API + url, {
    method,
    headers: { Authorization: 'Bearer ' + bearer, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 204) return null;
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const errs = json && json.errors ? json.errors.map((e) => e.status + ' ' + e.code + ': ' + e.detail).join('; ') : text;
    throw new Error(method + ' ' + url + ' -> ' + res.status + ' ' + errs);
  }
  return json;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function uploadOne(setId, shot) {
  const reserved = await api('POST', '/appScreenshots', {
    data: {
      type: 'appScreenshots',
      attributes: { fileName: shot.name, fileSize: shot.buf.length },
      relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: setId } } }
    }
  });
  const id = reserved.data.id;
  for (const op of reserved.data.attributes.uploadOperations) {
    const headers = {};
    (op.requestHeaders || []).forEach((h) => { headers[h.name] = h.value; });
    const res = await fetch(op.url, { method: op.method, headers, body: shot.buf.subarray(op.offset, op.offset + op.length) });
    if (!res.ok) throw new Error('uploading ' + shot.name + ' failed: ' + res.status);
  }
  await api('PATCH', '/appScreenshots/' + id, {
    data: {
      type: 'appScreenshots', id,
      attributes: { uploaded: true, sourceFileChecksum: crypto.createHash('md5').update(shot.buf).digest('hex') }
    }
  });
  return id;
}

async function waitProcessed(ids) {
  for (let i = 0; i < 60; i++) {
    const states = await Promise.all(ids.map((id) =>
      api('GET', '/appScreenshots/' + id + '?fields[appScreenshots]=fileName,assetDeliveryState')));
    const failed = states.filter((s) => s.data.attributes.assetDeliveryState.state === 'FAILED');
    if (failed.length) {
      throw new Error('Apple rejected: ' + failed.map((s) => s.data.attributes.fileName + ' ' +
        JSON.stringify(s.data.attributes.assetDeliveryState.errors)).join('; '));
    }
    if (states.every((s) => s.data.attributes.assetDeliveryState.state === 'COMPLETE')) return;
    await sleep(5000);
  }
  throw new Error('screenshots still processing after 5 minutes');
}

async function main() {
  const locales = collect();
  locales.forEach((l) => process.stdout.write(l.locale + ': ' + l.files.map((f) => f.name + ' ' + f.size).join(', ') + '\n'));
  if (process.argv.indexOf('--dry-run') !== -1) return;

  bearer = token();
  const app = (await api('GET', '/apps?filter[bundleId]=' + encodeURIComponent(bundleId))).data[0];
  if (!app) throw new Error('no app with bundle id ' + bundleId);
  const versions = await api('GET', '/apps/' + app.id + '/appStoreVersions?filter[platform]=IOS&filter[versionString]=' + version);
  const v = versions.data[0];
  if (!v) throw new Error('App Store Connect has no iOS version ' + version + ' - create it first');
  process.stdout.write(app.attributes.name + ' ' + version + ' (' + v.attributes.appStoreState + ')\n');

  const locs = await api('GET', '/appStoreVersions/' + v.id + '/appStoreVersionLocalizations');
  for (const l of locales) {
    const loc = locs.data.find((x) => x.attributes.locale === l.locale);
    if (!loc) throw new Error('version ' + version + ' has no ' + l.locale + ' listing');

    const sets = await api('GET', '/appStoreVersionLocalizations/' + loc.id +
      '/appScreenshotSets?filter[screenshotDisplayType]=' + DISPLAY_TYPE);
    let set = sets.data[0];
    if (set) {
      /* Replace, so a rerun does not stack up duplicates. */
      const old = await api('GET', '/appScreenshotSets/' + set.id + '/appScreenshots');
      for (const s of old.data) await api('DELETE', '/appScreenshots/' + s.id);
      process.stdout.write(l.locale + ': removed ' + old.data.length + ' old screenshot(s)\n');
    } else {
      set = (await api('POST', '/appScreenshotSets', {
        data: {
          type: 'appScreenshotSets',
          attributes: { screenshotDisplayType: DISPLAY_TYPE },
          relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: loc.id } } }
        }
      })).data;
    }

    const ids = [];
    for (const shot of l.files) {
      ids.push(await uploadOne(set.id, shot));
      process.stdout.write(l.locale + ': uploaded ' + shot.name + '\n');
    }
    await waitProcessed(ids);
    await api('PATCH', '/appScreenshotSets/' + set.id + '/relationships/appScreenshots', {
      data: ids.map((id) => ({ type: 'appScreenshots', id }))
    });
    process.stdout.write(l.locale + ': ' + ids.length + ' screenshots processed and in order\n');
  }
}

if (require.main === module) {
  main().catch((err) => { process.stderr.write('error: ' + err.message + '\n'); process.exit(1); });
}

module.exports = { collect, pngSize, token, DISPLAY_TYPE };
