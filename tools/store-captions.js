#!/usr/bin/env node
/**
 * Truck Route Planner - the store screenshots, framed with a caption in each
 * language.
 *
 *     node tools/store-captions.js            every language with bare shots
 *     node tools/store-captions.js de fr      only these
 *
 * Reads the bare app screens that tools/store-screenshots.js leaves in
 * build/store-shots/<ios|android>/<lang>/ and the six captions of each
 * language (screenshotCaptions in store/listings/<lang>.json), and writes:
 *
 *     store/screenshots/<Apple locale>/            1290 x 2796, App Store
 *     store/google-play/screenshots/<Play locale>/ 1080 x 1920, Google Play
 *
 * Only the first Apple and Play locale of a language gets files; the others
 * (en-US, the Catalan page) reuse them, see ALIASES in asc-upload-screenshots.js.
 * The stores show the first three shots in search results, so the caption is
 * what a driver reads before opening the page.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const listings = require('./store-listings.js');

const root = path.resolve(__dirname, '..');
const SHOTS = path.join(root, 'build', 'store-shots');
const NAMES = ['1-plan', '2-result', '3-tolls', '4-map', '5-stops', '6-rules'];

const PLATFORMS = {
  ios: { size: { width: 1290, height: 2796 }, font: 104, out: function (lang) {
    const l = listings.ASC_LOCALES[lang];
    return l ? path.join(root, 'store', 'screenshots', l[0]) : null;
  } },
  android: { size: { width: 1080, height: 1920 }, font: 74, out: function (lang) {
    return path.join(root, 'store', 'google-play', 'screenshots', listings.PLAY_LOCALES[lang][0]);
  } }
};

/* The app's header colours (css/theme.css --grad-header). */
const TOP = '#0f2a62';
const BOTTOM = '#1f5fd0';

const esc = function (s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };

/**
 * Greedy word wrap by an estimated text width. Bold sans-serif averages about
 * 0.56 em per character; good enough to keep a caption on two lines.
 */
function wrap(text, fontSize, maxWidth) {
  const perLine = Math.floor(maxWidth / (fontSize * 0.56));
  const lines = [];
  text.split(/\s+/).forEach(function (word) {
    const last = lines[lines.length - 1];
    if (last && (last + ' ' + word).length <= perLine) lines[lines.length - 1] = last + ' ' + word;
    else lines.push(word);
  });
  return lines;
}

/** Caption lines and font size: as large as fits on at most two lines. */
function layoutCaption(text, baseSize, maxWidth) {
  for (let size = baseSize; size > baseSize * 0.6; size -= 4) {
    const lines = wrap(text, size, maxWidth);
    if (lines.length <= 2 && lines.every(function (l) { return l.length * size * 0.56 <= maxWidth; })) {
      return { size: size, lines: lines };
    }
  }
  return { size: Math.round(baseSize * 0.6), lines: wrap(text, baseSize * 0.6, maxWidth).slice(0, 2) };
}

async function frame(rawFile, caption, platform, outFile) {
  const W = platform.size.width;
  const H = platform.size.height;
  const band = Math.round(H * 0.17);
  const margin = Math.round(W * 0.06);
  const cap = layoutCaption(caption, platform.font, W - 2 * margin);
  const lineH = Math.round(cap.size * 1.18);
  const firstY = Math.round(band / 2 - (cap.lines.length * lineH) / 2 + cap.size * 0.86);

  /* The screen, scaled to fit under the caption with a margin all round. */
  const meta = await sharp(rawFile).metadata();
  const scale = Math.min((W - 2 * margin) / meta.width, (H - band - margin) / meta.height);
  const w = Math.round(meta.width * scale);
  const h = Math.round(meta.height * scale);
  const radius = Math.round(w * 0.06);
  const left = Math.round((W - w) / 2);
  const top = band;
  const mask = Buffer.from('<svg width="' + w + '" height="' + h + '"><rect width="' + w + '" height="' + h +
    '" rx="' + radius + '" ry="' + radius + '"/></svg>');
  const screen = await sharp(rawFile).resize(w, h).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();

  const bg = Buffer.from(
    '<svg width="' + W + '" height="' + H + '" xmlns="http://www.w3.org/2000/svg">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="0.35" y2="1">' +
    '<stop offset="0" stop-color="' + TOP + '"/><stop offset="1" stop-color="' + BOTTOM + '"/></linearGradient>' +
    '<filter id="s" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="' + Math.round(W * 0.01) +
    '" stdDeviation="' + Math.round(W * 0.018) + '" flood-color="#000" flood-opacity="0.35"/></filter></defs>' +
    '<rect width="' + W + '" height="' + H + '" fill="url(#g)"/>' +
    '<rect x="' + left + '" y="' + top + '" width="' + w + '" height="' + h + '" rx="' + radius + '" fill="#fff" filter="url(#s)"/>' +
    cap.lines.map(function (line, i) {
      return '<text x="' + W / 2 + '" y="' + (firstY + i * lineH) + '" text-anchor="middle" fill="#ffffff" ' +
        'font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="' + cap.size + '">' + esc(line) + '</text>';
    }).join('') +
    '</svg>');

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  /* 256 colours with dithering: a fraction of the size, no visible loss on app screens. */
  await sharp(bg).composite([{ input: screen, left: left, top: top }])
    .flatten({ background: TOP }).removeAlpha()
    .png({ palette: true, quality: 92, effort: 8, dither: 0.6 }).toFile(outFile);
}

async function main() {
  const all = listings.load();
  const wanted = process.argv.slice(2);
  const written = [];
  for (const platformName of Object.keys(PLATFORMS)) {
    const platform = PLATFORMS[platformName];
    const dir = path.join(SHOTS, platformName);
    if (!fs.existsSync(dir)) continue;
    const langs = fs.readdirSync(dir).filter(function (l) { return !wanted.length || wanted.indexOf(l) !== -1; }).sort();
    for (const lang of langs) {
      const out = platform.out(lang);
      if (!out) continue;
      if (!all[lang]) throw new Error(lang + ': no store/listings/' + lang + '.json');
      const caps = all[lang].screenshotCaptions;
      fs.rmSync(out, { recursive: true, force: true });
      for (let i = 0; i < NAMES.length; i++) {
        const raw = path.join(dir, lang, NAMES[i] + '.png');
        if (!fs.existsSync(raw)) throw new Error('missing ' + path.relative(root, raw));
        await frame(raw, caps[i], platform, path.join(out, NAMES[i] + '.png'));
      }
      written.push(path.relative(root, out));
    }
  }
  process.stdout.write('framed:\n  ' + written.join('\n  ') + '\n');
}

module.exports = { wrap, layoutCaption, frame, PLATFORMS, NAMES };

if (require.main === module) {
  main().catch(function (err) { process.stderr.write(String(err && err.stack || err) + '\n'); process.exit(1); });
}
