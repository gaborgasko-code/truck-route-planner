/**
 * Truck Route Planner - the two things only the packaged app can do.
 *
 *   Break reminders   Local notifications timed to the legal stop plan, so a
 *                     driver is warned before the 4 h 30 min runs out rather
 *                     than finding out afterwards.
 *   Your location     A GPS fix turned into a street address for the origin
 *                     field, instead of typing where you already are.
 *
 * Both are deliberately absent on the web. A browser tab cannot fire a
 * notification hours later while the phone is in a pocket, and pretending
 * otherwise would be worse than not offering it: the whole value is that the
 * reminder arrives when nobody is looking at the screen.
 *
 * Everything here checks `available()` first and returns a reason rather than
 * throwing, so the same code runs unchanged in a browser where none of it
 * exists.
 *
 * created by Gabor Gasko
 */
(function (global) {
  'use strict';

  var TRP = (global.TRP = global.TRP || {});

  function cap() {
    return global.Capacitor || null;
  }

  function plugin(name) {
    var c = cap();
    return (c && c.Plugins && c.Plugins[name]) || null;
  }

  /** True only inside the packaged app. */
  function available() {
    var c = cap();
    return !!(c && typeof c.isNativePlatform === 'function' && c.isNativePlatform());
  }

  function platform() {
    var c = cap();
    return (c && typeof c.getPlatform === 'function') ? c.getPlatform() : 'web';
  }

  /* ------------------------------------------------------- notifications */

  function notifications() {
    return plugin('LocalNotifications');
  }

  /**
   * Ask for permission, once.
   * @returns {Promise<{granted:boolean, reason:string}>}
   */
  function requestPermission() {
    var api = notifications();
    if (!available() || !api) {
      return Promise.resolve({ granted: false, reason: 'unavailable' });
    }
    return api.checkPermissions()
      .then(function (status) {
        if (status.display === 'granted') return { granted: true, reason: 'granted' };
        /* Asking again after a refusal does nothing on iOS - the system never
           shows the prompt twice - so send the user to Settings instead of
           silently failing. */
        if (status.display === 'denied') return { granted: false, reason: 'denied' };
        return api.requestPermissions().then(function (result) {
          return {
            granted: result.display === 'granted',
            reason: result.display === 'granted' ? 'granted' : 'denied'
          };
        });
      })
      .catch(function () { return { granted: false, reason: 'error' }; });
  }

  /**
   * Replace any scheduled reminders with these.
   *
   * @param {Array} list     from TRP.reminders.schedule
   * @param {Function} text  (key, params) -> translated string
   * @returns {Promise<{ok:boolean, count:number, reason:string}>}
   */
  function scheduleReminders(list, text) {
    var api = notifications();
    if (!available() || !api) {
      return Promise.resolve({ ok: false, count: 0, reason: 'unavailable' });
    }
    if (!list || !list.length) {
      return cancelReminders().then(function () {
        return { ok: true, count: 0, reason: 'empty' };
      });
    }

    return requestPermission().then(function (perm) {
      if (!perm.granted) return { ok: false, count: 0, reason: perm.reason };

      /* Clear first: rescheduling after a new route must not leave the old
         trip's reminders behind, which would fire at meaningless times. */
      return cancelReminders().then(function () {
        return api.schedule({
          notifications: list.map(function (n) {
            return {
              id: n.id,
              title: text(n.titleKey, n.params),
              body: text(n.bodyKey, n.params),
              schedule: { at: n.at, allowWhileIdle: true },
              sound: null,
              smallIcon: 'ic_stat_icon',
              extra: { kind: n.kind }
            };
          })
        });
      }).then(function () {
        return { ok: true, count: list.length, reason: 'scheduled' };
      });
    }).catch(function (err) {
      return { ok: false, count: 0, reason: (err && err.message) || 'error' };
    });
  }

  /** Remove everything this app scheduled. */
  function cancelReminders() {
    var api = notifications();
    if (!available() || !api) return Promise.resolve(false);
    var ids = TRP.reminders.allIds().map(function (id) { return { id: id }; });
    return api.cancel({ notifications: ids })
      .then(function () { return true; })
      .catch(function () { return false; });
  }

  /** How many of our reminders are currently pending. */
  function pendingReminders() {
    var api = notifications();
    if (!available() || !api) return Promise.resolve(0);
    return api.getPending().then(function (result) {
      var mine = TRP.reminders.allIds();
      return ((result && result.notifications) || []).filter(function (n) {
        return mine.indexOf(Number(n.id)) !== -1;
      }).length;
    }).catch(function () { return 0; });
  }

  /* ----------------------------------------------------------- location */

  /**
   * A GPS fix.
   * @returns {Promise<{ok:boolean, lat:number, lon:number, reason:string}>}
   */
  function currentPosition() {
    var api = plugin('Geolocation');

    /* In a browser the standard API is the right one; the plugin only exists
       to get iOS to show its permission sheet at the proper moment. */
    if (!available() || !api) {
      if (!global.navigator || !global.navigator.geolocation) {
        return Promise.resolve({ ok: false, reason: 'unavailable' });
      }
      return new Promise(function (resolve) {
        global.navigator.geolocation.getCurrentPosition(
          function (pos) {
            resolve({ ok: true, lat: pos.coords.latitude, lon: pos.coords.longitude,
              reason: 'ok' });
          },
          function (err) {
            resolve({ ok: false, reason: err && err.code === 1 ? 'denied' : 'error' });
          },
          { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
        );
      });
    }

    return api.checkPermissions().then(function (status) {
      if (status.location === 'denied') return { ok: false, reason: 'denied' };
      if (status.location !== 'granted') {
        return api.requestPermissions().then(function (result) {
          if (result.location !== 'granted') return { ok: false, reason: 'denied' };
          return fix(api);
        });
      }
      return fix(api);
    }).catch(function () { return { ok: false, reason: 'error' }; });
  }

  function fix(api) {
    return api.getCurrentPosition({ enableHighAccuracy: false, timeout: 15000 })
      .then(function (pos) {
        return { ok: true, lat: pos.coords.latitude, lon: pos.coords.longitude, reason: 'ok' };
      })
      .catch(function () { return { ok: false, reason: 'error' }; });
  }

  TRP.native = {
    available: available,
    platform: platform,
    requestPermission: requestPermission,
    scheduleReminders: scheduleReminders,
    cancelReminders: cancelReminders,
    pendingReminders: pendingReminders,
    currentPosition: currentPosition
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TRP.native;
})(typeof globalThis !== 'undefined' ? globalThis : this);
