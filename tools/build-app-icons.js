#!/usr/bin/env node
/**
 * Truck Route Planner - render the app icon and splash sources.
 *
 *     node tools/build-app-icons.js
 *
 * Produces the two PNGs `@capacitor/assets` expects, from the same SVG the
 * website already uses, so the app icon can never drift from the favicon:
 *
 *   assets/generated/icon.png          1024 x 1024
 *   assets/generated/splash.png        2732 x 2732  (light)
 *   assets/generated/splash-dark.png   2732 x 2732  (dark)
 *
 * The platform sizes are generated from these on the build machine, because
 * Xcode's asset catalogue only exists once `cap add ios` has run. See
 * .github/workflows/ios.yml.
 *
 * Two details that matter on iOS:
 *
 *   - The icon is rendered WITHOUT the rounded corners in the SVG. iOS applies
 *     its own mask, and a pre-rounded icon shows dark corners inside it.
 *   - The splash is square and heavily padded. iOS crops the same image to
 *     every aspect ratio from a 4:3 iPad to a 19.5:9 phone, so anything near
 *     the edge is lost on some device.
 *
 * created by Gabor Gasko
 */
'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'assets', 'generated');

const ICON = 1024;
const SPLASH = 2732;
/* The logo occupies this share of the splash's width; the rest is safe margin
   for cropping. A quarter looks small in isolation and correct on a phone. */
const SPLASH_LOGO_SHARE = 0.26;

const LIGHT_BG = '#f5f6f8';
const DARK_BG = '#0b1220';

/*
 * The drawn artwork sits at about (252, 270) in the 512 canvas and spans
 * roughly 327 units across - below centre and a little small once the icon is
 * shown at 60pt. These numbers recentre it and fill a bit more of the plate.
 * They describe the existing icon.svg, so if that drawing changes, re-measure.
 */
const ART_CENTRE = { x: 252, y: 270 };
const ART_SCALE = 1.12;

function recentre(inner) {
  return '<g transform="translate(256,256) scale(' + ART_SCALE + ') ' +
    'translate(' + -ART_CENTRE.x + ',' + -ART_CENTRE.y + ')">' + inner + '</g>';
}

/** The icon artwork with the rounded rect flattened to a full square. */
function squareIconSvg() {
  const svg = fs.readFileSync(path.join(root, 'assets', 'icon.svg'), 'utf8');
  /* iOS masks the icon itself, so the rx must go or the corners double up. */
  const flat = svg.replace('<rect width="512" height="512" rx="96"',
    '<rect width="512" height="512"');

  /* Recentre everything except the background plate, which must stay square
     and full-bleed. */
  const plate = flat.match(/<rect width="512" height="512"[^>]*\/>/);
  if (!plate) throw new Error('icon.svg no longer has the expected background rect');
  const open = flat.indexOf(plate[0]) + plate[0].length;
  const close = flat.lastIndexOf('</svg>');
  return flat.slice(0, open) + recentre(flat.slice(open, close)) + flat.slice(close);
}

/** The artwork with no background plate, for the splash. */
function logoOnlySvg() {
  const svg = fs.readFileSync(path.join(root, 'assets', 'icon.svg'), 'utf8');
  const stripped = svg.replace(/<rect width="512" height="512"[^>]*\/>/, '');
  const close = stripped.lastIndexOf('</svg>');
  const head = stripped.indexOf('</defs>') !== -1
    ? stripped.indexOf('</defs>') + '</defs>'.length
    : stripped.indexOf('>') + 1;
  return stripped.slice(0, head) + recentre(stripped.slice(head, close)) + stripped.slice(close);
}

async function renderIcon() {
  const file = path.join(outDir, 'icon.png');
  await sharp(Buffer.from(squareIconSvg()))
    .resize(ICON, ICON, { fit: 'contain', background: '#0b4ea2' })
    .png()
    .toFile(file);
  return file;
}

async function renderSplash(background, name) {
  const logoSize = Math.round(SPLASH * SPLASH_LOGO_SHARE);
  const logo = await sharp(Buffer.from(logoOnlySvg()))
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const file = path.join(outDir, name);
  await sharp({
    create: { width: SPLASH, height: SPLASH, channels: 4, background }
  })
    .composite([{ input: logo, gravity: 'centre' }])
    .png()
    .toFile(file);
  return file;
}

async function build() {
  fs.mkdirSync(outDir, { recursive: true });

  const made = [];
  made.push(await renderIcon());
  made.push(await renderSplash(LIGHT_BG, 'splash.png'));
  made.push(await renderSplash(DARK_BG, 'splash-dark.png'));

  made.forEach((file) => {
    const size = fs.statSync(file).size;
    process.stdout.write('  ' + path.relative(root, file).split(path.sep).join('/') +
      '  ' + (size / 1024).toFixed(0) + ' KB\n');
  });
  return made;
}

if (require.main === module) {
  build().catch((err) => {
    process.stderr.write('icon build failed: ' + err.message + '\n');
    process.exit(1);
  });
}

module.exports = { build, squareIconSvg, logoOnlySvg, ICON, SPLASH };
