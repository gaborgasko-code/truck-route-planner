/**
 * Truck Route Planner - global configuration and legal driving constants.
 *
 * Every module attaches itself to the global `TRP` namespace so the app works
 * from `file://` (no ES-module CORS restrictions) and under Node for tests.
 *
 * created by Gabor Gasko
 */
(function (global) {
  'use strict';

  var TRP = (global.TRP = global.TRP || {});

  var CONFIG = {
    APP_NAME: 'Planificador de ruta - Gabor',
    APP_VERSION: '2.3.0',
    APP_BUILD: 'web',
    AUTHOR: 'created by Gabor Gasko',
    AUTHOR_URL: 'https://www.linkedin.com/in/gaborgasko/',

    /* ---- EU driving and rest time model (Regulation (EC) 561/2006) ---- */
    MAX_CONTINUOUS_DRIVING_H: 4.5,
    MANDATORY_BREAK_MIN: 45,
    MAX_DAILY_DRIVING_H: 9,
    DAILY_REST_H: 11,
    /* Multi-manning (Art. 8.5): each driver rests 9 h within a 30 h period. */
    MULTI_MANNING_DAILY_REST_H: 9,
    MULTI_MANNING_WINDOW_H: 30,
    AVG_TRUCK_SPEED_KMH: 70,

    /* ---- Planning parameters ---- */
    REST_STOP_INTERVAL_KM: 350,
    TOLL_SAMPLE_INTERVAL_KM: 50,
    PARKING_SEARCH_RADIUS_KM: 50,
    PARKING_RESULTS_PER_STOP: 3,
    REGULATIONS_PER_COUNTRY: 3,
    /* A suggested stop closer than this to the destination is dropped. */
    STOP_END_MARGIN_KM: 5,

    /* ---- Services (free, no API key) ---- */
    NOMINATIM_BASE: 'https://nominatim.openstreetmap.org',
    OSRM_BASE: 'https://router.project-osrm.org',
    TILE_URL: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    TILE_ATTRIBUTION: '&copy; OpenStreetMap contributors | routing by OSRM',

    /* ---- HTTP behaviour ---- */
    HTTP_TIMEOUT_MS: 20000,
    HTTP_RETRIES: 1,
    HTTP_RETRY_DELAY_MS: 900,
    /* Nominatim usage policy: at most one request per second. */
    NOMINATIM_MIN_INTERVAL_MS: 1100,

    /* ---- Reverse-geocode cache ---- */
    COUNTRY_CACHE_KEY: 'trp.countryCache.v1',
    COUNTRY_CACHE_DECIMALS: 1,
    COUNTRY_CACHE_MAX: 5000,
    UNKNOWN_COUNTRY: 'XX',

    /* ---- Toll sampling presets (km between samples) ---- */
    TOLL_DETAIL_PRESETS: { fast: 150, balanced: 100, precise: 50 },
    DEFAULT_TOLL_DETAIL: 'balanced',

    CURRENCY: 'EUR',
    CURRENCY_SYMBOL: '€',

    /* ---- Default vehicle profile (40 t articulated, EURO VI) ---- */
    DEFAULT_VEHICLE: {
      weightT: 40,
      axles: 5,
      euroClass: 'VI',
      speedKmh: 70,
      fuelL100: 30,
      fuelPrice: 1.65,
      adr: false,
      drivers: 1
    },

    /* ---- Toll multipliers (indicative) ---- */
    WEIGHT_FACTORS: [
      { maxT: 12, factor: 0.55 },
      { maxT: 18, factor: 0.75 },
      { maxT: 32, factor: 0.9 },
      { maxT: Infinity, factor: 1.0 }
    ],
    EURO_FACTORS: { VI: 1.0, V: 1.12, IV: 1.2, III: 1.35, II: 1.5 },
    AXLE_FACTORS: { 2: 0.85, 3: 0.92, 4: 1.0, 5: 1.05, 6: 1.1 },

    /* ---- Localisation ---- */
    /* Spanish stays the product default. Set true to follow the browser
       language instead, when it is one of the 24 EU languages. */
    LANG_AUTODETECT: false,

    /* ---- Consent (ePrivacy / GDPR) ---- */
    CONSENT_KEY: 'trp.consent',
    /* Bump when the categories change, to re-ask everyone. */
    CONSENT_VERSION: 1,
    /* Re-ask after this many months (AEPD guidance: 24 months maximum). */
    CONSENT_MONTHS: 12,

    /* ---- Audience measurement ---- */
    /* Absolute or relative URL of the collector. Empty disables analytics
       completely: nothing is sent and the category is hidden. */
    ANALYTICS_ENDPOINT: 'https://europe-southwest1-planificador--analytics.cloudfunctions.net/analytics/api/collect',
    ANALYTICS_SITE: 'planificador',
    /* Raw events are pruned on the server after this many days. */
    ANALYTICS_RETENTION_DAYS: 90,

    STORAGE_PREFIX: 'trp.',
    /* Language-neutral fallback; the UI uses i18n key app.footerDisclaimer. */
    DISCLAIMER: 'Solo estimaciones / Estimates only - verifique la normativa con la autoridad nacional competente antes de la salida.'
  };

  TRP.CONFIG = CONFIG;

  if (typeof module !== 'undefined' && module.exports) module.exports = CONFIG;
})(typeof globalThis !== 'undefined' ? globalThis : this);
