/**
 * Truck Route Planner - national trailer / HGV regulation lookup.
 *
 * created by Gabor Gasko
 */
(function (global) {
  'use strict';

  var TRP = (global.TRP = global.TRP || {});
  if (typeof require === 'function') {
    if (!TRP.CONFIG) require('./config.js');
    if (!TRP.i18n) require('./i18n.js');
  }
  var CONFIG = TRP.CONFIG;

  /** Resolve a `{es, en}` value to the active language, or pass it through. */
  function pick(value) {
    return TRP.i18n ? TRP.i18n.pick(value) : value;
  }

  /**
   * Accept the full document, a plain `{DE: [...]}` map, schema v1 (rules as a
   * flat array) or schema v2 (rules keyed by language).
   */
  function normalise(source) {
    var raw = source && source.regulations ? source.regulations : (source || {});
    var out = {};
    Object.keys(raw).forEach(function (code) {
      var entry = raw[code];
      var key = String(code).toUpperCase();
      if (Array.isArray(entry)) {
        out[key] = { name: key, rules: entry.slice() };
        return;
      }
      if (!entry || !entry.rules) return;
      var rules = pick(entry.rules);
      if (!Array.isArray(rules)) return;
      out[key] = { name: pick(entry.name) || key, rules: rules.slice() };
    });
    return out;
  }

  /**
   * Regulations for every country on the route.
   *
   * @param {string[]} codes ISO-2 country codes, in route order
   * @param {Object} source trailer_regulations.json document
   * @param {number} [limit=3] rules shown up front per country
   * @returns {Array<{country:string, name:string, rules:string[], allRules:string[], fallback:boolean}>}
   */
  function forCountries(codes, source, limit) {
    var regs = normalise(source);
    var max = limit == null ? CONFIG.REGULATIONS_PER_COUNTRY : Number(limit);
    var fallback = regs.DEFAULT || { name: 'General EU baseline', rules: [] };
    var seen = {};
    var out = [];

    (codes || []).forEach(function (raw) {
      var code = String(raw || '').toUpperCase();
      if (!code || code === CONFIG.UNKNOWN_COUNTRY || seen[code]) return;
      seen[code] = true;
      var entry = regs[code];
      var isFallback = !entry;
      var source2 = entry || fallback;
      out.push({
        country: code,
        name: source2.name || code,
        rules: max > 0 ? source2.rules.slice(0, max) : source2.rules.slice(),
        allRules: source2.rules.slice(),
        fallback: isFallback
      });
    });

    return out;
  }

  /** The general EU baseline entry, always shown alongside country rules. */
  function baseline(source, limit) {
    var regs = normalise(source);
    var entry = regs.DEFAULT || { name: 'General EU baseline', rules: [] };
    var max = limit == null ? CONFIG.REGULATIONS_PER_COUNTRY : Number(limit);
    return {
      country: 'EU',
      name: entry.name,
      rules: max > 0 ? entry.rules.slice(0, max) : entry.rules.slice(),
      allRules: entry.rules.slice(),
      fallback: false
    };
  }

  TRP.regulations = {
    normalise: normalise,
    forCountries: forCountries,
    baseline: baseline
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TRP.regulations;
})(typeof globalThis !== 'undefined' ? globalThis : this);
