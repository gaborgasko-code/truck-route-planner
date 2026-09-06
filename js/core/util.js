/**
 * Truck Route Planner - small shared helpers (formatting, storage, DOM-free).
 *
 * created by Gabor Gasko
 */
(function (global) {
  'use strict';

  var TRP = (global.TRP = global.TRP || {});
  var CONFIG = TRP.CONFIG || (typeof require === 'function' ? require('./config.js') : {});

  /** Clamp a number into [min, max]. */
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  /** Round to a fixed number of decimals, returning a Number (not a string). */
  function round(value, decimals) {
    var f = Math.pow(10, decimals == null ? 2 : decimals);
    return Math.round((Number(value) + Number.EPSILON) * f) / f;
  }

  /** Escape a value for safe insertion into HTML. */
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Format a number with thousands separators. */
  function formatNumber(value, decimals) {
    var n = Number(value);
    if (!isFinite(n)) return '-';
    return n.toLocaleString('en-GB', {
      minimumFractionDigits: decimals == null ? 0 : decimals,
      maximumFractionDigits: decimals == null ? 0 : decimals
    });
  }

  /** Format a monetary amount, e.g. `1 234.56 EUR`. */
  function formatCurrency(value, currency) {
    var n = Number(value);
    if (!isFinite(n)) return '-';
    return formatNumber(n, 2) + ' ' + (currency || (CONFIG && CONFIG.CURRENCY) || 'EUR');
  }

  /** Format decimal hours as `2 d 05:30` / `05:30` / `45 min`. */
  function formatDuration(hours) {
    var n = Number(hours);
    if (!isFinite(n) || n < 0) return '-';
    var totalMinutes = Math.round(n * 60);
    if (totalMinutes < 60) return totalMinutes + ' min';
    var days = Math.floor(totalMinutes / (60 * 24));
    var rem = totalMinutes - days * 60 * 24;
    var h = Math.floor(rem / 60);
    var m = rem % 60;
    var hhmm = pad2(h) + ':' + pad2(m);
    return days > 0 ? days + ' d ' + hhmm : hhmm;
  }

  /** Compact duration used in the itinerary, e.g. `4h30`, `45min`, `11h`. */
  function formatShortDuration(hours) {
    var minutes = Math.round(Number(hours) * 60);
    if (!isFinite(minutes) || minutes <= 0) return '0min';
    var h = Math.floor(minutes / 60);
    var m = minutes % 60;
    if (h === 0) return m + 'min';
    if (m === 0) return h + 'h';
    return h + 'h' + pad2(m);
  }

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  /** Format an ISO timestamp as `Mon 12 May, 14:30`. */
  function formatDateTime(iso) {
    if (!iso) return '-';
    var d = iso instanceof Date ? iso : new Date(iso);
    if (isNaN(d.getTime())) return '-';
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return days[d.getDay()] + ' ' + d.getDate() + ' ' + months[d.getMonth()] +
      ', ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  /** Add decimal hours to a Date and return a new Date. */
  function addHours(date, hours) {
    return new Date(date.getTime() + hours * 3600 * 1000);
  }

  /** True when the date falls on a Saturday or Sunday. */
  function isWeekend(date) {
    var day = date.getDay();
    return day === 0 || day === 6;
  }

  /** Debounce a function by `wait` milliseconds. */
  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var args = arguments;
      var self = this;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        timer = null;
        fn.apply(self, args);
      }, wait);
    };
  }

  /** Promise-based sleep. */
  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  /* ---------------------------------------------------------------- storage */

  function storageAvailable() {
    try {
      return typeof localStorage !== 'undefined' && localStorage !== null;
    } catch (e) {
      return false;
    }
  }

  function storageGet(key, fallback) {
    if (!storageAvailable()) return fallback;
    try {
      var raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function storageSet(key, value) {
    if (!storageAvailable()) return false;
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  /** ISO-2 code to a regional-indicator flag emoji (falls back to the code). */
  function countryFlag(code) {
    if (!code || code.length !== 2 || !/^[A-Za-z]{2}$/.test(code)) return '';
    var cc = code.toUpperCase();
    return String.fromCodePoint(0x1f1e6 + cc.charCodeAt(0) - 65, 0x1f1e6 + cc.charCodeAt(1) - 65);
  }

  /** Application error carrying a machine-readable code. */
  function TrpError(code, message, cause) {
    var err = new Error(message);
    err.name = 'TrpError';
    err.code = code;
    err.cause = cause;
    return err;
  }

  TRP.util = {
    clamp: clamp,
    round: round,
    escapeHtml: escapeHtml,
    formatNumber: formatNumber,
    formatCurrency: formatCurrency,
    formatDuration: formatDuration,
    formatShortDuration: formatShortDuration,
    formatDateTime: formatDateTime,
    pad2: pad2,
    addHours: addHours,
    isWeekend: isWeekend,
    debounce: debounce,
    sleep: sleep,
    storageGet: storageGet,
    storageSet: storageSet,
    storageAvailable: storageAvailable,
    countryFlag: countryFlag,
    TrpError: TrpError
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TRP.util;
})(typeof globalThis !== 'undefined' ? globalThis : this);
