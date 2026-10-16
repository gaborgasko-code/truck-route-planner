#!/usr/bin/env node
/**
 * Truck Route Planner - Google Play listing graphics.
 *
 *     node tools/store-graphics.js     -> store/google-play/icon-512.png
 *                                         store/google-play/feature-graphic-<locale>.png
 *
 * Google Play needs a 512 x 512 icon (full square; Play rounds the corners
 * itself) and a 1024 x 500 feature graphic, shown above the listing. The
 * graphic is laid out in HTML and photographed by headless Edge, so the text
 * is set by a real browser; it uses the app's own colours, icon and a real
 * screenshot from store/google-play/screenshots (run store-screenshots.js
 * --android first).
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { connect } = require('./store-screenshots.js');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const OUT = path.join(root, 'store', 'google-play');
const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
].find((p) => fs.existsSync(p));

/* One feature graphic per listing language, with that listing's title and a
   screenshot of the app in the same language. English is the default listing. */
const LOCALES = {
  'en-US': { title: 'Truck Route Planner EU',
    tagline: 'Mandatory breaks, tolls and the rules of every country on your trips across Europe.' },
  'es-ES': { title: 'Planificador de ruta camión',
    tagline: 'Pausas obligatorias, peajes y normativa de cada país para tus viajes por Europa.' }
};

function dataUri(file) {
  return 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
}

function featureHtml(icon, shot, TITLE, TAGLINE) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:1024px;height:500px;overflow:hidden}
  body{font-family:"Segoe UI",Roboto,Arial,sans-serif;color:#fff;
       background:linear-gradient(135deg,#0b4ea2 0%,#062546 100%);position:relative}
  .road{position:absolute;left:0;right:0;bottom:62px;height:10px;
        background:repeating-linear-gradient(90deg,#ffcc00 0 46px,transparent 46px 80px);opacity:.9}
  .text{position:absolute;left:64px;top:92px;width:560px}
  .brand{display:flex;align-items:center;gap:22px}
  .brand img{width:104px;height:104px;border-radius:24px;box-shadow:0 10px 30px rgba(0,0,0,.35)}
  h1{font-size:46px;line-height:1.08;margin:0;font-weight:700;letter-spacing:-.5px}
  p{font-size:25px;line-height:1.35;margin:30px 0 0;color:#dbe6ff}
  .phone{position:absolute;right:78px;top:34px;width:236px;height:420px;border-radius:30px;
         background:#0f1c2e;padding:9px;box-shadow:0 18px 50px rgba(0,0,0,.45);transform:rotate(4deg)}
  .phone img{width:100%;height:100%;object-fit:cover;object-position:top;border-radius:22px;display:block}
  </style></head><body>
  <div class="road"></div>
  <div class="text">
    <div class="brand"><img src="${icon}" alt=""><h1>${TITLE}</h1></div>
    <p>${TAGLINE}</p>
  </div>
  <div class="phone"><img src="${shot}" alt=""></div>
  </body></html>`;
}

/* Headless Edge over the DevTools protocol, as store-screenshots.js does;
   Edge's --screenshot switch writes nothing on this machine. */
async function photograph(url, file, tmp) {
  const port = 9300 + Math.floor(Math.random() * 500);
  const edge = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + port,
    '--user-data-dir=' + path.join(tmp, 'profile'), '--no-first-run', '--hide-scrollbars', 'about:blank'],
    { stdio: 'ignore' });
  const cdp = await connect(port);
  try {
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 500, deviceScaleFactor: 1, mobile: false });
    const loaded = cdp.once('Page.loadEventFired');
    await cdp.send('Page.navigate', { url: url });
    await loaded;
    await new Promise((r) => setTimeout(r, 800));
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  } finally {
    cdp.close();
    edge.kill();
    await new Promise((r) => setTimeout(r, 400));
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const icon512 = path.join(OUT, 'icon-512.png');
  await sharp(path.join(root, 'assets', 'generated', 'icon.png')).resize(512, 512)
    .flatten({ background: '#0b4ea2' }).png().toFile(icon512);

  if (!EDGE) throw new Error('Microsoft Edge not found');
  const made = [icon512];
  for (const locale of Object.keys(LOCALES)) {
    const shot = path.join(OUT, 'screenshots', locale, '2-result.png');
    if (!fs.existsSync(shot)) {
      throw new Error('missing ' + shot + ' - run node tools/store-screenshots.js --android' +
        (locale === 'es-ES' ? '' : ' --lang ' + locale.slice(0, 2)));
    }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'trp-feature-'));
    const html = path.join(tmp, 'feature.html');
    fs.writeFileSync(html, featureHtml(dataUri(icon512), dataUri(shot), LOCALES[locale].title, LOCALES[locale].tagline));
    const raw = path.join(tmp, 'feature.png');
    await photograph('file:///' + html.replace(/\\/g, '/'), raw, tmp);
    const feature = path.join(OUT, 'feature-graphic-' + locale + '.png');
    await sharp(raw).resize(1024, 500, { fit: 'cover', position: 'left top' })
      .flatten({ background: '#0b4ea2' }).removeAlpha().png().toFile(feature);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* Edge may hold it */ }
    made.push(feature);
  }

  for (const f of made) {
    const m = await sharp(f).metadata();
    process.stdout.write(path.relative(root, f) + '  ' + m.width + 'x' + m.height + (m.hasAlpha ? ' (alpha)' : '') + '\n');
  }
}

if (require.main === module) {
  main().catch((err) => { process.stderr.write(String(err.stack || err) + '\n'); process.exit(1); });
}
