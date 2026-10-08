#!/usr/bin/env node
/**
 * Truck Route Planner - the public privacy policy and support pages of the
 * iPhone app, for its App Store listing.
 *
 *     node tools/build-legal-pages.js        -> build/legal/
 *
 * App Store Connect needs a privacy policy URL and a support URL. The policy
 * on the website names the website's developer; the app is published by
 * Aissa Bamogo Redondo and names nobody else. So these pages are generated
 * from the app's own texts - the same translation files, put through the
 * same tools/app-flavour.js as the app bundle - and the store listing says
 * exactly what the app says, in all 24 languages.
 *
 * The output is plain HTML with inline styles: no scripts, no analytics, no
 * external requests. It is published from Aissa's GitHub (GitHub Pages);
 * MOBILE_APP_GUIDE.md B.6 has the steps.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const appFlavour = require('./app-flavour.js');

const root = path.resolve(__dirname, '..');
const OUT = path.join(root, 'build', 'legal');

/* The name on the App Store, which is what a reader arriving from the listing
   knows the app by. */
const STORE_NAME = 'Planificador de ruta camión';
const UPDATED = '2026-10-08';

/* The services the app contacts, as on PRIVACY.html (a test keeps the two
   lists identical). Google Analytics only with the visitor's consent. */
const THIRD_PARTIES = [
  { name: 'OpenStreetMap Nominatim', host: 'nominatim.openstreetmap.org', key: 'privacy.thirdNominatim' },
  { name: 'OSRM', host: 'router.project-osrm.org', key: 'privacy.thirdOsrm' },
  { name: 'OpenStreetMap tiles', host: 'tile.openstreetmap.org', key: 'privacy.thirdTiles' },
  { name: 'Cloudflare cdnjs', host: 'cdnjs.cloudflare.com', key: 'privacy.thirdCdn' },
  { name: 'Google Analytics', host: 'www.googletagmanager.com', key: 'privacy.thirdGoogle', ga: true }
];

/** The app's i18n and consent code, flavoured as in the bundle, run in a sandbox. */
function loadApp() {
  const ctx = { console: console, navigator: { language: 'es', languages: ['es'] } };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  const run = function (rel) {
    const text = appFlavour.flavour(fs.readFileSync(path.join(root, rel), 'utf8'), rel);
    vm.runInContext(text, ctx, { filename: rel });
  };
  ['js/core/config.js', 'js/core/util.js', 'js/core/i18n.js', 'js/core/consent.js'].forEach(run);
  fs.readdirSync(path.join(root, 'js', 'i18n')).sort().forEach(function (f) { run('js/i18n/' + f); });
  return ctx.TRP;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function pageFile(code) { return code === 'es' ? 'privacy.html' : 'privacy-' + code + '.html'; }

const STYLE = [
  ':root{color-scheme:light dark;--bg:#f6f8fc;--card:#fff;--ink:#0f1b33;--muted:#5b6b86;--line:#dbe3f0;--brand:#1d4fd8;--accent:#f5b800}',
  '@media (prefers-color-scheme:dark){:root{--bg:#0b1220;--card:#121c30;--ink:#e6edf8;--muted:#9fb0cc;--line:#24324d;--brand:#7aa2ff}}',
  '*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}',
  'header{background:linear-gradient(135deg,#0f2f86,#1d4fd8);color:#fff;padding:28px 16px 22px;border-bottom:4px solid var(--accent)}',
  'header .in,main,footer .in{max-width:860px;margin:0 auto}',
  'header h1{margin:0 0 4px;font-size:26px;line-height:1.25}header p{margin:0;opacity:.85}',
  'main{padding:8px 16px 32px}section{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:4px 20px 12px;margin:16px 0}',
  'h2{font-size:19px;margin:16px 0 6px}p{margin:8px 0}a{color:var(--brand)}code{font-size:13px}',
  '.meta{color:var(--muted);font-size:14px;margin:18px 0 0}',
  'table{width:100%;border-collapse:collapse;font-size:14px;margin:8px 0}th,td{text-align:left;vertical-align:top;padding:8px 6px;border-top:1px solid var(--line)}th{color:var(--muted);font-weight:600}',
  '.wrap{overflow-x:auto}nav.langs{font-size:14px;line-height:2;margin:14px 0 0}nav.langs a,nav.langs strong{margin-right:10px;white-space:nowrap}',
  'footer{color:var(--muted);font-size:14px;padding:0 16px 32px}'
].join('\n');

function shell(lang, title, subtitle, body) {
  return '<!doctype html>\n<html lang="' + esc(lang) + '">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + esc(title + ' — ' + STORE_NAME) + '</title>\n' +
    '<meta name="description" content="' + esc(title + ' — ' + STORE_NAME) + '">\n' +
    '<style>\n' + STYLE + '\n</style>\n</head>\n<body>\n' +
    '<header><div class="in"><h1>' + esc(title) + '</h1><p>' + esc(subtitle) + '</p></div></header>\n' +
    '<main>\n' + body + '\n</main>\n' +
    '<footer><div class="in">' + esc(STORE_NAME) + ' · ' + esc(appFlavour.PUBLISHER) +
    ' · <a href="mailto:' + esc(appFlavour.CONTACT) + '">' + esc(appFlavour.CONTACT) + '</a>' +
    ' · <a href="privacy.html">Privacidad / Privacy</a> · <a href="support.html">Soporte / Support</a></div></footer>\n' +
    '</body>\n</html>\n';
}

function privacyPage(TRP, code) {
  const i18n = TRP.i18n;
  i18n.set(code);
  const t = i18n.t;
  const CONFIG = TRP.CONFIG;

  const langs = i18n.available().map(function (c) {
    const label = esc(i18n.languageName(c));
    return c === code ? '<strong>' + label + '</strong>'
      : '<a href="' + pageFile(c) + '" hreflang="' + c + '" lang="' + c + '">' + label + '</a>';
  }).join(' ');

  const storage = TRP.consent.inventory().map(function (item) {
    const retention = item.retentionMonths
      ? t('privacy.retentionMonths', { n: item.retentionMonths })
      : t('privacy.retentionUntilCleared');
    return '<tr><td><strong>' + esc(t('store.' + item.id + '.name')) + '</strong><br><code>' +
      esc(item.key) + (item.prefix ? '*' : '') + '</code> ' + (item.kind === 'cookie' ? 'cookie' : 'localStorage') +
      '</td><td>' + esc(t('store.' + item.id + '.purpose')) + '</td><td>' +
      esc(t('cookie.cat.' + item.category)) + '</td><td>' + esc(retention) + '</td></tr>';
  }).join('\n');

  const third = THIRD_PARTIES.filter(function (p) { return !p.ga || !!CONFIG.GA_MEASUREMENT_ID; })
    .map(function (p) {
      return '<tr><td><strong>' + esc(p.name) + '</strong><br><code>' + esc(p.host) + '</code></td><td>' +
        esc(t(p.key)) + '</td></tr>';
    }).join('\n');

  const body = [
    '<nav class="langs" aria-label="Language">' + langs + '</nav>',
    '<p class="meta">' + esc(t('privacy.updated')) + ': ' + UPDATED + '</p>',
    '<section><h2>' + esc(t('privacy.s1')) + '</h2><p>' + esc(t('privacy.intro')) + '</p><p>' + esc(t('privacy.s1body')) + '</p></section>',
    '<section><h2>' + esc(t('privacy.s2')) + '</h2><p>' + esc(t('privacy.s2body')) + '</p><div class="wrap"><table>' +
      '<thead><tr><th>' + esc(t('privacy.colItem')) + '</th><th>' + esc(t('privacy.colPurpose')) + '</th><th>' +
      esc(t('privacy.colCategory')) + '</th><th>' + esc(t('privacy.colRetention')) + '</th></tr></thead><tbody>\n' +
      storage + '\n</tbody></table></div></section>',
    '<section><h2>' + esc(t('privacy.s3')) + '</h2><p>' + esc(t('privacy.s3body')) + '</p><p>' + esc(t('location.purpose')) + '</p>' +
      '<div class="wrap"><table><thead><tr><th>' + esc(t('privacy.colService')) + '</th><th>' + esc(t('privacy.colData')) +
      '</th></tr></thead><tbody>\n' + third + '\n</tbody></table></div></section>',
    /* s4list carries <strong> by design; it comes from the app's own files. */
    '<section><h2>' + esc(t('privacy.s4')) + '</h2><p>' + esc(t('privacy.s4body')) + '</p><p>' + t('privacy.s4list') + '</p></section>',
    '<section><h2>' + esc(t('privacy.s5')) + '</h2><p>' + esc(t('privacy.s5body')) + '</p></section>',
    '<section><h2>' + esc(t('privacy.s6')) + '</h2><p>' + esc(t('privacy.s6body')) + '</p></section>',
    '<section><h2>' + esc(t('privacy.s7')) + '</h2><p>' + esc(t('privacy.s7body', {
      months: CONFIG.CONSENT_MONTHS, days: CONFIG.ANALYTICS_RETENTION_DAYS })) + '</p></section>',
    '<section><h2>' + esc(t('privacy.s8')) + '</h2><p>' + esc(t('privacy.s8body')) + '</p></section>'
  ].join('\n');

  return shell(code, t('privacy.title'), STORE_NAME, body);
}

/* Support: Spanish first, English below. Answers describe what the app does. */
function supportPage() {
  const C = esc(appFlavour.CONTACT);
  const body = [
    '<section lang="es"><h2>Contacto</h2>',
    '<p>Para cualquier pregunta, problema o sugerencia, escriba a <a href="mailto:' + C + '">' + C + '</a>.</p>',
    '<h2>Preguntas frecuentes</h2>',
    '<p><strong>¿Qué hace la app?</strong> Calcula rutas por carretera para vehículos pesados en Europa: tiempos de conducción y pausas según el Reglamento (CE) n.º 561/2006, paradas obligatorias, peajes estimados y aparcamientos seguros cercanos. Funciona en los 24 idiomas oficiales de la UE.</p>',
    '<p><strong>¿Los resultados son oficiales?</strong> No. Distancias, tiempos, peajes y normas nacionales son ayudas para planificar y no son jurídicamente vinculantes. Compruebe siempre las restricciones, tarifas y señales vigentes.</p>',
    '<p><strong>«Usar mi ubicación» no funciona.</strong> Abra Ajustes → Planificador → Ubicación y elija «Mientras se usa la app». La ubicación solo se usa para rellenar el punto de partida.</p>',
    '<p><strong>No recibo los avisos de pausa.</strong> Abra Ajustes → Planificador → Notificaciones y active «Permitir notificaciones». Los avisos se programan en el propio iPhone para cada viaje.</p>',
    '<p><strong>¿Qué datos se recogen?</strong> No hay cuentas ni publicidad. Consulte la <a href="privacy.html">política de privacidad</a>.</p>',
    '</section>',
    '<section lang="en"><h2>Contact</h2>',
    '<p>For any question, problem or suggestion, write to <a href="mailto:' + C + '">' + C + '</a>.</p>',
    '<h2>Frequently asked questions</h2>',
    '<p><strong>What does the app do?</strong> It plans road routes for heavy goods vehicles in Europe: driving and rest times under Regulation (EC) No 561/2006, mandatory stops, estimated tolls and nearby secure parking. It works in all 24 official EU languages.</p>',
    '<p><strong>Are the results official?</strong> No. Distances, times, tolls and national rules are planning aids and are not legally binding. Always check the restrictions, rates and signs in force.</p>',
    '<p><strong>“Use my location” does not work.</strong> Open Settings → Planificador → Location and choose “While Using the App”. Your location is only used to fill in the starting point.</p>',
    '<p><strong>I do not get the break reminders.</strong> Open Settings → Planificador → Notifications and turn on “Allow Notifications”. Reminders are scheduled on the iPhone itself, for each trip.</p>',
    '<p><strong>What data is collected?</strong> There are no accounts and no advertising. See the <a href="privacy-en.html">privacy policy</a>.</p>',
    '</section>'
  ].join('\n');
  return shell('es', 'Soporte / Support', STORE_NAME, body);
}

function indexPage() {
  return shell('es', STORE_NAME, appFlavour.PUBLISHER, [
    '<section><h2>' + esc(STORE_NAME) + '</h2>',
    '<p><a href="privacy.html">Política de privacidad</a> · <a href="privacy-en.html">Privacy policy</a></p>',
    '<p><a href="support.html">Soporte / Support</a></p></section>'
  ].join('\n'));
}

function build(outDir) {
  const out = outDir || OUT;
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const TRP = loadApp();
  const codes = TRP.i18n.available();
  codes.forEach(function (code) {
    fs.writeFileSync(path.join(out, pageFile(code)), privacyPage(TRP, code), 'utf8');
  });
  fs.writeFileSync(path.join(out, 'support.html'), supportPage(), 'utf8');
  fs.writeFileSync(path.join(out, 'index.html'), indexPage(), 'utf8');
  /* GitHub Pages: serve the files as they are, no Jekyll. */
  fs.writeFileSync(path.join(out, '.nojekyll'), '', 'utf8');

  const named = appFlavour.leftovers(out);
  if (named.length) throw new Error('the legal pages must not name the developer:\n  ' + named.join('\n  '));
  return { out: out, pages: codes.length + 2, languages: codes };
}

if (require.main === module) {
  const r = build();
  process.stdout.write('legal pages built: ' + r.pages + ' files in ' + path.relative(root, r.out) +
    ' (privacy in ' + r.languages.length + ' languages, support, index)\n');
}

module.exports = { build, THIRD_PARTIES, STORE_NAME, pageFile };
