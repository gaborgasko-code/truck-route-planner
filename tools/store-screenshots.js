#!/usr/bin/env node
/**
 * Truck Route Planner - App Store screenshots of the iPhone app.
 *
 *     node tools/store-screenshots.js        -> build/screenshots/*.png
 *
 * App Store Connect wants 6.9-inch iPhone screenshots, 1290 x 2796. These are
 * taken from the app bundle itself (www/, built by build-app.js, so they show
 * exactly what ships - no developer credit anywhere) in a hidden Edge window
 * sized like an iPhone: 430 x 932 points at 3x. A real route is calculated
 * against the live routing and geocoding services, so the figures are real.
 *
 * Needs Microsoft Edge (present on every Windows 11) and an internet
 * connection. Uses the Chrome DevTools Protocol over Node's own WebSocket, so
 * nothing extra is installed.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const sharp = require('sharp');
const buildApp = require('./build-app.js');

const root = path.resolve(__dirname, '..');
const WWW = path.join(root, 'www');
const OUT = path.join(root, 'build', 'screenshots');
const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
].find(function (p) { return fs.existsSync(p); });

const DEVICE = { width: 430, height: 932, deviceScaleFactor: 3, mobile: true };
const SIZE = { width: 1290, height: 2796 };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const ROUTE = { origin: 'Valencia, España', dest: 'Lyon, Francia', departure: '2026-10-12T06:00' };

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/*
 * Inside the app, Capacitor is present and the page shows what only the app
 * can do: "use my location" and the break reminders. A browser has neither,
 * so for the pictures a stand-in answers the same calls the way an iPhone
 * with both permissions granted would. Nothing is scheduled or located.
 */
const NATIVE_STAND_IN = [
  'window.Capacitor = {',
  '  isNativePlatform: function () { return true; },',
  '  getPlatform: function () { return "ios"; },',
  '  Plugins: {',
  '    LocalNotifications: {',
  '      checkPermissions: function () { return Promise.resolve({ display: "granted" }); },',
  '      requestPermissions: function () { return Promise.resolve({ display: "granted" }); },',
  '      getPending: function () { return Promise.resolve({ notifications: [] }); },',
  '      schedule: function () { return Promise.resolve({ notifications: [] }); },',
  '      cancel: function () { return Promise.resolve(); }',
  '    },',
  '    Geolocation: {',
  '      checkPermissions: function () { return Promise.resolve({ location: "granted" }); },',
  '      requestPermissions: function () { return Promise.resolve({ location: "granted" }); },',
  '      getCurrentPosition: function () { return Promise.resolve({ coords: { latitude: 39.4699, longitude: -0.3763, accuracy: 20 } }); }',
  '    }',
  '  }',
  '};'
].join('\n');

/** A static server for www/, on a free port, for the duration of the run. */
function serve() {
  const server = http.createServer(function (req, res) {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const file = path.join(WWW, rel);
    if (!file.startsWith(WWW) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); return res.end();
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/** A minimal DevTools Protocol client for one page. */
async function connect(port) {
  let target = null;
  for (let i = 0; i < 50 && !target; i++) {
    try {
      const list = await fetch('http://127.0.0.1:' + port + '/json/list').then((r) => r.json());
      target = list.find((t) => t.type === 'page');
    } catch (e) { /* not up yet */ }
    if (!target) await sleep(200);
  }
  if (!target) throw new Error('Edge did not open a page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  const waiters = [];
  ws.onmessage = function (msg) {
    const data = JSON.parse(msg.data);
    if (data.id && pending.has(data.id)) {
      const p = pending.get(data.id); pending.delete(data.id);
      data.error ? p.reject(new Error(data.error.message)) : p.resolve(data.result);
    } else if (data.method) {
      waiters.filter((w) => w.method === data.method).forEach((w) => { w.resolve(data.params); });
    }
  };
  return {
    send(method, params) {
      const n = ++id;
      ws.send(JSON.stringify({ id: n, method: method, params: params || {} }));
      return new Promise((resolve, reject) => pending.set(n, { resolve, reject }));
    },
    once(method) { return new Promise((resolve) => waiters.push({ method, resolve })); },
    close() { ws.close(); }
  };
}

async function main() {
  if (!EDGE) throw new Error('Microsoft Edge not found');
  buildApp.build();
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const server = await serve();
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const port = 9300 + Math.floor(Math.random() * 500);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'trp-edge-'));
  const edge = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + profile,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--lang=es-ES', 'about:blank'],
    { stdio: 'ignore' });

  const cdp = await connect(port);
  const evaluate = async function (expr) {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('page error: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
    return r.result.value;
  };
  const waitFor = async function (expr, ms, what) {
    for (let t = 0; t < ms; t += 250) {
      if (await evaluate(expr)) return;
      await sleep(250);
    }
    throw new Error('timed out waiting for ' + what);
  };
  const shots = [];
  const shoot = async function (name) {
    /* Passing notices ("980 km, ...") would cover part of the picture. */
    await evaluate('document.querySelectorAll(".toast-host").forEach(function (e) { e.style.display = "none"; }), true');
    await sleep(400);
    const r = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const file = path.join(OUT, name + '.png');
    /* App Store Connect wants opaque images at the exact size. */
    await sharp(Buffer.from(r.data, 'base64')).resize(SIZE.width, SIZE.height, { fit: 'fill' })
      .flatten({ background: '#ffffff' }).removeAlpha().png().toFile(file);
    const meta = await sharp(file).metadata();
    shots.push(name + '.png ' + meta.width + 'x' + meta.height + (meta.hasAlpha ? ' (alpha!)' : ''));
  };
  const view = (name) => evaluate('document.querySelector(\'.nav-btn[data-view="' + name + '"]\').click(), true');

  try {
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', DEVICE);
    await cdp.send('Emulation.setUserAgentOverride', { userAgent: UA });
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: NATIVE_STAND_IN });

    /* First visit: answer the privacy question (necessary storage only), so
       the banner is not in the pictures, then start clean. */
    let loaded = cdp.once('Page.loadEventFired');
    await cdp.send('Page.navigate', { url: base + 'mobile.html?view=mobile' });
    await loaded;
    await waitFor('!!(window.TRP && TRP.consent)', 10000, 'the app');
    await evaluate('TRP.consent.rejectAll(), localStorage.setItem("trp.lang", JSON.stringify("es")), true');
    loaded = cdp.once('Page.loadEventFired');
    await cdp.send('Page.reload', {});
    await loaded;
    await waitFor('!!(window.TRP && document.getElementById("m_calc"))', 10000, 'the app');
    await sleep(800);

    /* 1. The plan, filled in, with the app's "use my location" button. */
    if (!await evaluate('TRP.native.available() && !document.getElementById("m_locateBtn").hidden')) {
      throw new Error('the page did not start in app mode');
    }
    await evaluate([
      'var o = document.getElementById("m_origin"), d = document.getElementById("m_dest");',
      'o.value = ' + JSON.stringify(ROUTE.origin) + '; d.value = ' + JSON.stringify(ROUTE.dest) + ';',
      'document.getElementById("m_departure").value = ' + JSON.stringify(ROUTE.departure) + ';',
      '[o, d].forEach(function (e) { e.dispatchEvent(new Event("change", { bubbles: true })); });',
      'document.querySelectorAll(".suggest").forEach(function (s) { s.hidden = true; });',
      'window.scrollTo(0, 0); true'
    ].join('\n'));
    await shoot('1-plan');

    /* 2. The result: summary, legal stops, tolls. */
    await evaluate('document.getElementById("m_calc").click(), true');
    await waitFor('(function(){var b=document.getElementById("m_resultBody");return !!b && !b.hidden && document.getElementById("viewResult").offsetParent !== null;})()',
      90000, 'the route result');
    await sleep(1200);
    await evaluate('window.scrollTo(0, 0), true');
    await shoot('2-result');

    /* 3. Further down the result: tolls country by country. The sections are
       collapsible, so open this one before scrolling to it. */
    await evaluate([
      'var box = document.getElementById("m_tolls").closest("details"); box.open = true;',
      'var y = box.getBoundingClientRect().top + window.scrollY - 76;',
      'window.scrollTo(0, y); true'
    ].join('\n'));
    await sleep(600);
    await shoot('3-tolls');

    /* 4. The map. */
    await view('map');
    await sleep(800);
    await evaluate('window.dispatchEvent(new Event("resize")), true');
    await waitFor('document.querySelectorAll("#m_mapCanvas img.leaflet-tile-loaded").length > 6', 30000, 'map tiles');
    await sleep(2500);
    await evaluate('window.scrollTo(0, 0), true');
    await shoot('4-map');

    /* 5. The mandatory stops, with the app's break reminders on top. */
    await view('rules');
    await sleep(800);
    if (await evaluate('document.getElementById("m_remindCard").hidden || !document.getElementById("m_remindBtn").textContent.trim()')) {
      throw new Error('the reminder card is not showing as it does in the app');
    }
    await evaluate('window.scrollTo(0, 0), true');
    await shoot('5-stops');

    /* 6. The national rules of each country on the route. */
    await evaluate([
      'var h = document.getElementById("m_rules").previousElementSibling;',
      'window.scrollTo(0, h.getBoundingClientRect().top + window.scrollY - 76); true'
    ].join('\n'));
    await sleep(600);
    await shoot('6-rules');
  } finally {
    cdp.close();
    edge.kill();
    server.close();
    await sleep(500);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* Edge may still hold it */ }
  }

  process.stdout.write('screenshots in ' + path.relative(root, OUT) + ':\n  ' + shots.join('\n  ') + '\n');
}

if (require.main === module) {
  main().catch(function (err) { process.stderr.write(String(err && err.stack || err) + '\n'); process.exit(1); });
}
