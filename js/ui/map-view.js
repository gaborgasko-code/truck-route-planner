/**
 * Truck Route Planner - embedded Leaflet map.
 *
 * Draws the route polyline, origin/destination markers, suggested rest stops,
 * safe parkings (clustered when the plugin is present) and two overlay
 * panels: a route summary top-left and a regulations panel top-right. On
 * narrow screens both panels start collapsed so they never cover the map.
 *
 * created by Gabor Gasko
 */
(function (global) {
  'use strict';

  var TRP = (global.TRP = global.TRP || {});
  var CONFIG = TRP.CONFIG;
  var util = TRP.util;
  var esc = util.escapeHtml;

  function t(key, params) {
    return TRP.i18n ? TRP.i18n.t(key, params) : key;
  }
  function term(prefix, value) {
    return TRP.i18n ? TRP.i18n.term(prefix, value) : value;
  }

  var COMPACT_BREAKPOINT = 760;

  function divIcon(className, label, size) {
    return L.divIcon({
      className: 'trp-marker ' + className,
      html: '<span>' + label + '</span>',
      iconSize: size || [30, 30],
      iconAnchor: [(size ? size[0] : 30) / 2, (size ? size[1] : 30) / 2]
    });
  }

  /* ------------------------------------------------------------- panels */

  function summaryBody(r) {
    var rows = r.tolls.countries.slice(0, 8).map(function (c) {
      return '<tr><td>' + esc(c.country) + '</td><td class="num">' + util.formatNumber(c.km, 0) +
        '</td><td class="num">' + util.formatNumber(c.cost, 2) + '</td></tr>';
    }).join('');
    function kv(label, value, cls) {
      return '<div class="mapx__kv' + (cls || '') + '"><span>' + esc(label) + '</span><strong>' + value + '</strong></div>';
    }
    return kv(t('map.distance'), util.formatNumber(r.route.distanceKm, 1) + ' km') +
      kv(t('map.totalTime'), esc(util.formatDuration(r.time.totalHours))) +
      kv(t('map.driving'), esc(util.formatDuration(r.time.drivingHours))) +
      kv(t('map.breaksRests'), r.time.breaksCount + ' / ' + r.time.fullDays) +
      kv(t('map.departure'), esc(util.formatDateTime(r.departure))) +
      kv(t('map.arrival'), esc(util.formatDateTime(r.arrival))) +
      kv(t('map.toll'), util.formatNumber(r.costs.toll, 2) + ' ' + CONFIG.CURRENCY) +
      kv(t('map.fuel'), util.formatNumber(r.costs.fuel, 2) + ' ' + CONFIG.CURRENCY) +
      kv(t('map.total'), util.formatNumber(r.costs.total, 2) + ' ' + CONFIG.CURRENCY, ' mapx__kv--total') +
      (rows ? '<table class="mapx__table"><thead><tr><th>' + esc(t('map.ctry')) + '</th><th class="num">km</th><th class="num">' +
        CONFIG.CURRENCY + '</th></tr></thead><tbody>' + rows + '</tbody></table>' : '') +
      '<div class="mapx__foot">' + esc(CONFIG.AUTHOR) + '</div>';
  }

  function regulationsBody(r) {
    var body = (r.regulations || []).map(function (entry) {
      return '<div class="mapx__reg"><div class="mapx__reg-title">' + esc(entry.country) + ' - ' + esc(entry.name) + '</div>' +
        '<ul>' + entry.rules.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
    }).join('');
    return (body || '<p class="mapx__muted">' + esc(t('reg.none')) + '</p>') +
      '<p class="mapx__warn">' + esc(t('reg.mapWarn')) + '</p>';
  }

  /** A panel that is either a static block or a collapsible one. */
  function panelHtml(title, body, collapsible, startOpen) {
    if (!collapsible) {
      return '<div class="mapx__title">' + esc(title) + '</div>' +
        '<div class="mapx__body" data-role="body">' + body + '</div>';
    }
    return '<button type="button" class="mapx__toggle" data-role="toggle" aria-expanded="' + String(!!startOpen) + '">' +
      '<span>' + esc(title) + '</span><span class="mapx__chev">' + (startOpen ? '&#9650;' : '&#9660;') + '</span></button>' +
      '<div class="mapx__body" data-role="body"' + (startOpen ? '' : ' style="display:none"') + '>' + body + '</div>';
  }

  function attachToggle(div) {
    var toggle = div.querySelector('[data-role="toggle"]');
    var body = div.querySelector('[data-role="body"]');
    if (!toggle || !body) return;
    toggle.addEventListener('click', function () {
      var open = body.style.display !== 'none';
      body.style.display = open ? 'none' : 'block';
      toggle.setAttribute('aria-expanded', String(!open));
      div.classList.toggle('mapx--collapsed', open);
      toggle.querySelector('.mapx__chev').innerHTML = open ? '&#9660;' : '&#9650;';
    });
    if (body.style.display === 'none') div.classList.add('mapx--collapsed');
  }

  function makeControl(position, className, html, onAttach) {
    var Control = L.Control.extend({
      options: { position: position },
      onAdd: function () {
        var div = L.DomUtil.create('div', className);
        div.innerHTML = html;
        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.disableScrollPropagation(div);
        if (onAttach) onAttach(div);
        return div;
      }
    });
    return new Control();
  }

  /* --------------------------------------------------------------- view */

  /**
   * Create a map view bound to a container element.
   * @param {string|HTMLElement} container
   */
  function create(container) {
    var el = typeof container === 'string' ? document.getElementById(container) : container;
    if (!el) throw new Error('map container not found');
    if (typeof L === 'undefined') throw new Error('Leaflet is not loaded');

    /* SVG rendering keeps the polyline aligned after invalidateSize(), which
       happens every time a hidden tab becomes visible. */
    var map = L.map(el, { zoomControl: true, preferCanvas: false }).setView([50.0, 10.0], 5);
    L.tileLayer(CONFIG.TILE_URL, {
      maxZoom: 19,
      attribution: CONFIG.TILE_ATTRIBUTION
    }).addTo(map);

    var layers = { route: null, stops: null, parkings: null, endpoints: null };
    var controls = { summary: null, regs: null, layers: null };

    /*
     * A map is often drawn the instant its tab becomes visible, or while the
     * window is minimised, so the container can still measure zero. Fitting
     * against a zero-size container makes Leaflet choose the maximum zoom and
     * land the view on a random street. Remember the wanted view and apply it
     * as soon as the container really has a size.
     */
    var fitState = null;

    function tryFit() {
      if (!fitState || fitState.fitted) return false;
      map.invalidateSize({ animate: false });
      var size = map.getSize();
      if (size.x < 40 || size.y < 40) return false;
      map.fitBounds(fitState.bounds, fitState.options);
      fitState.fitted = true;
      return true;
    }

    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(function () { tryFit(); }).observe(el);
    }
    if (typeof global.addEventListener === 'function') {
      global.addEventListener('resize', tryFit);
    }

    function clear() {
      Object.keys(layers).forEach(function (key) {
        if (layers[key]) { map.removeLayer(layers[key]); layers[key] = null; }
      });
      Object.keys(controls).forEach(function (key) {
        if (controls[key]) { map.removeControl(controls[key]); controls[key] = null; }
      });
      fitState = null;
    }

    function render(r) {
      clear();
      /* Measure the container before drawing: the map tab may have just
         become visible, in which case Leaflet still holds the old size. */
      map.invalidateSize({ animate: false });
      var compact = (global.innerWidth || 1024) < COMPACT_BREAKPOINT;
      var latlngs = r.route.coords.map(function (c) { return [c.lat, c.lon]; });

      /* Route: yellow casing under a blue line, matching the app palette. */
      layers.route = L.layerGroup([
        L.polyline(latlngs, { color: '#ffcc00', weight: 11, opacity: 0.85, lineCap: 'round' }),
        L.polyline(latlngs, { color: '#0b4ea2', weight: 5, opacity: 0.95, lineCap: 'round' })
      ]).addTo(map);

      layers.endpoints = L.layerGroup([
        L.marker([r.origin.lat, r.origin.lon], { icon: divIcon('trp-marker--origin', 'A') })
          .bindPopup('<strong>' + esc(t('map.origin')) + '</strong><br>' + esc(r.origin.label)),
        L.marker([r.destination.lat, r.destination.lon], { icon: divIcon('trp-marker--dest', 'B') })
          .bindPopup('<strong>' + esc(t('map.destination')) + '</strong><br>' + esc(r.destination.label))
      ]).addTo(map);

      layers.stops = L.layerGroup((r.stops || []).map(function (stop) {
        var list = (stop.parkings || []).map(function (p) {
          return '<li>' + (p.secured ? '&#128274; ' : '') + esc(p.name) + ' - ' +
            util.formatNumber(p.distanceKm, 1) + ' km</li>';
        }).join('');
        return L.marker([stop.lat, stop.lon], { icon: divIcon('trp-marker--stop', String(stop.index)) })
          .bindPopup('<strong>' + esc(t('stops.restStopShort', { n: stop.index })) + '</strong><br>km ' +
            util.formatNumber(stop.km, 0) + '<br>' +
            (list ? '<ul class="popup-list">' + list + '</ul>'
              : '<em>' + esc(t('stops.noneNearbyShort', { radius: CONFIG.PARKING_SEARCH_RADIUS_KM })) + '</em>'));
      })).addTo(map);

      var parkingMarkers = (r.parkings || []).map(function (p) {
        return L.marker([p.lat, p.lon], {
          icon: divIcon(p.secured ? 'trp-marker--park-secure' : 'trp-marker--park', 'P', [24, 24])
        }).bindPopup('<strong>' + esc(p.name) + '</strong><br>' +
          esc(p.city || '') + ' (' + esc(p.country) + ')<br>' +
          esc(p.secured ? t('stops.securedLevel', { level: p.security_level || 3 }) : t('stops.standardParking')) + '<br>' +
          (p.spaces ? esc(t('stops.spaces', { n: p.spaces })) + '<br>' : '') +
          '<span class="popup-facilities">' +
          esc((p.facilities || []).map(function (f) { return term('fac', f); }).join(', ')) + '</span>');
      });
      layers.parkings = (typeof L.markerClusterGroup === 'function')
        ? L.markerClusterGroup({ maxClusterRadius: 45 })
        : L.layerGroup();
      parkingMarkers.forEach(function (m) { layers.parkings.addLayer(m); });
      map.addLayer(layers.parkings);

      /* Overlay panels: static summary on desktop, both collapsed on phones. */
      controls.summary = makeControl(
        'topleft',
        'mapx mapx--summary' + (compact ? ' mapx--compact' : ''),
        panelHtml(compact ? t('map.summaryShort') : t('map.summary'), summaryBody(r), compact, false),
        attachToggle
      );
      controls.summary.addTo(map);

      controls.regs = makeControl(
        'topright',
        'mapx mapx--regs' + (compact ? ' mapx--compact' : ''),
        panelHtml(compact ? t('map.regulationsShort') : t('map.regulations'), regulationsBody(r), true, !compact),
        attachToggle
      );
      controls.regs.addTo(map);

      controls.layers = L.control.layers(null, {
        [t('map.layerRoute')]: layers.route,
        [t('map.layerStops')]: layers.stops,
        [t('map.layerParkings')]: layers.parkings
      }, { position: 'bottomright', collapsed: true });
      controls.layers.addTo(map);

      fitState = {
        bounds: L.latLngBounds(latlngs),
        options: {
          animate: false,
          paddingTopLeft: compact ? [12, 52] : [40, 40],
          paddingBottomRight: compact ? [12, 60] : [40, 40]
        },
        fitted: false
      };

      /* Try immediately, then again once the surrounding layout has settled.
         If the container is still not sized, the resize observer takes over. */
      tryFit();
      setTimeout(tryFit, 120);
      setTimeout(tryFit, 400);
    }

    function invalidate() {
      setTimeout(function () {
        map.invalidateSize();
        tryFit();
      }, 40);
    }

    return {
      map: map,
      render: render,
      clear: clear,
      invalidate: invalidate
    };
  }

  TRP.mapView = { create: create, COMPACT_BREAKPOINT: COMPACT_BREAKPOINT };
})(typeof globalThis !== 'undefined' ? globalThis : this);
