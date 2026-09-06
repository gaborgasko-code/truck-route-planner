/**
 * Truck Route Planner - embedded Leaflet map.
 *
 * Draws the route polyline, origin/destination markers, suggested rest stops,
 * safe parkings (clustered when the plugin is present) and two overlay
 * panels: a route summary top-left and a collapsible regulations panel
 * top-right.
 *
 * created by Gabor Gasko
 */
(function (global) {
  'use strict';

  var TRP = (global.TRP = global.TRP || {});
  var CONFIG = TRP.CONFIG;
  var util = TRP.util;
  var esc = util.escapeHtml;

  function divIcon(className, label, size) {
    return L.divIcon({
      className: 'trp-marker ' + className,
      html: '<span>' + label + '</span>',
      iconSize: size || [30, 30],
      iconAnchor: [(size ? size[0] : 30) / 2, (size ? size[1] : 30) / 2]
    });
  }

  function summaryPanelHtml(r) {
    var rows = r.tolls.countries.slice(0, 8).map(function (c) {
      return '<tr><td>' + esc(c.country) + '</td><td class="num">' + util.formatNumber(c.km, 0) +
        '</td><td class="num">' + util.formatNumber(c.cost, 2) + '</td></tr>';
    }).join('');
    return '<div class="mapx__title">Route summary</div>' +
      '<div class="mapx__kv"><span>Distance</span><strong>' + util.formatNumber(r.route.distanceKm, 1) + ' km</strong></div>' +
      '<div class="mapx__kv"><span>Total time</span><strong>' + esc(util.formatDuration(r.time.totalHours)) + '</strong></div>' +
      '<div class="mapx__kv"><span>Driving</span><strong>' + esc(util.formatDuration(r.time.drivingHours)) + '</strong></div>' +
      '<div class="mapx__kv"><span>Breaks / rests</span><strong>' + r.time.breaksCount + ' / ' + r.time.fullDays + '</strong></div>' +
      '<div class="mapx__kv"><span>Toll</span><strong>' + util.formatNumber(r.costs.toll, 2) + ' ' + CONFIG.CURRENCY + '</strong></div>' +
      '<div class="mapx__kv"><span>Fuel</span><strong>' + util.formatNumber(r.costs.fuel, 2) + ' ' + CONFIG.CURRENCY + '</strong></div>' +
      '<div class="mapx__kv mapx__kv--total"><span>Total</span><strong>' + util.formatNumber(r.costs.total, 2) + ' ' + CONFIG.CURRENCY + '</strong></div>' +
      (rows ? '<table class="mapx__table"><thead><tr><th>Ctry</th><th class="num">km</th><th class="num">' +
        CONFIG.CURRENCY + '</th></tr></thead><tbody>' + rows + '</tbody></table>' : '') +
      '<div class="mapx__foot">' + esc(CONFIG.AUTHOR) + '</div>';
  }

  function regulationsPanelHtml(r) {
    var body = (r.regulations || []).map(function (entry) {
      return '<div class="mapx__reg"><div class="mapx__reg-title">' + esc(entry.country) + ' - ' + esc(entry.name) + '</div>' +
        '<ul>' + entry.rules.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
    }).join('');
    return '<button type="button" class="mapx__toggle" data-role="reg-toggle" aria-expanded="true">' +
      'Country regulations <span class="mapx__chev">&#9650;</span></button>' +
      '<div class="mapx__reg-body" data-role="reg-body">' +
      (body || '<p class="mapx__muted">No country regulations resolved.</p>') +
      '<p class="mapx__warn">Estimates only - verify all driving bans and restrictions before departure.</p>' +
      '</div>';
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

  /**
   * Create a map view bound to a container element.
   * @param {string|HTMLElement} container
   */
  function create(container) {
    var el = typeof container === 'string' ? document.getElementById(container) : container;
    if (!el) throw new Error('map container not found');
    if (typeof L === 'undefined') throw new Error('Leaflet is not loaded');

    var map = L.map(el, { zoomControl: true, preferCanvas: true }).setView([50.0, 10.0], 5);
    L.tileLayer(CONFIG.TILE_URL, {
      maxZoom: 19,
      attribution: CONFIG.TILE_ATTRIBUTION
    }).addTo(map);

    var layers = { route: null, stops: null, parkings: null, endpoints: null };
    var controls = { summary: null, regs: null, layers: null };

    function clear() {
      Object.keys(layers).forEach(function (key) {
        if (layers[key]) { map.removeLayer(layers[key]); layers[key] = null; }
      });
      Object.keys(controls).forEach(function (key) {
        if (controls[key]) { map.removeControl(controls[key]); controls[key] = null; }
      });
    }

    function render(r) {
      clear();
      var latlngs = r.route.coords.map(function (c) { return [c.lat, c.lon]; });

      /* Route: yellow casing under a blue line, matching the app palette. */
      layers.route = L.layerGroup([
        L.polyline(latlngs, { color: '#ffcc00', weight: 11, opacity: 0.85, lineCap: 'round' }),
        L.polyline(latlngs, { color: '#0b4ea2', weight: 5, opacity: 0.95, lineCap: 'round' })
      ]).addTo(map);

      layers.endpoints = L.layerGroup([
        L.marker([r.origin.lat, r.origin.lon], { icon: divIcon('trp-marker--origin', 'A') })
          .bindPopup('<strong>Origin</strong><br>' + esc(r.origin.label)),
        L.marker([r.destination.lat, r.destination.lon], { icon: divIcon('trp-marker--dest', 'B') })
          .bindPopup('<strong>Destination</strong><br>' + esc(r.destination.label))
      ]).addTo(map);

      layers.stops = L.layerGroup((r.stops || []).map(function (stop) {
        var list = (stop.parkings || []).map(function (p) {
          return '<li>' + (p.secured ? '&#128274; ' : '') + esc(p.name) + ' - ' +
            util.formatNumber(p.distanceKm, 1) + ' km</li>';
        }).join('');
        return L.marker([stop.lat, stop.lon], { icon: divIcon('trp-marker--stop', String(stop.index)) })
          .bindPopup('<strong>Rest stop ' + stop.index + '</strong><br>km ' +
            util.formatNumber(stop.km, 0) + '<br>' +
            (list ? '<ul class="popup-list">' + list + '</ul>'
              : '<em>No safe parking within ' + CONFIG.PARKING_SEARCH_RADIUS_KM + ' km</em>'));
      })).addTo(map);

      var parkingMarkers = (r.parkings || []).map(function (p) {
        return L.marker([p.lat, p.lon], {
          icon: divIcon(p.secured ? 'trp-marker--park-secure' : 'trp-marker--park', 'P', [24, 24])
        }).bindPopup('<strong>' + esc(p.name) + '</strong><br>' +
          esc(p.city || '') + ' (' + esc(p.country) + ')<br>' +
          (p.secured ? 'Secured, level ' + (p.security_level || 3) : 'Standard parking') + '<br>' +
          (p.spaces ? p.spaces + ' spaces<br>' : '') +
          '<span class="popup-facilities">' + esc((p.facilities || []).join(', ')) + '</span>');
      });
      layers.parkings = (typeof L.markerClusterGroup === 'function')
        ? L.markerClusterGroup({ maxClusterRadius: 45 })
        : L.layerGroup();
      parkingMarkers.forEach(function (m) { layers.parkings.addLayer(m); });
      map.addLayer(layers.parkings);

      controls.summary = makeControl('topleft', 'mapx mapx--summary', summaryPanelHtml(r));
      controls.summary.addTo(map);

      controls.regs = makeControl('topright', 'mapx mapx--regs', regulationsPanelHtml(r), function (div) {
        var toggle = div.querySelector('[data-role="reg-toggle"]');
        var body = div.querySelector('[data-role="reg-body"]');
        toggle.addEventListener('click', function () {
          var open = body.style.display !== 'none';
          body.style.display = open ? 'none' : 'block';
          toggle.setAttribute('aria-expanded', String(!open));
          div.classList.toggle('mapx--collapsed', open);
          toggle.querySelector('.mapx__chev').innerHTML = open ? '&#9660;' : '&#9650;';
        });
      });
      controls.regs.addTo(map);

      controls.layers = L.control.layers(null, {
        'Route': layers.route,
        'Rest stops': layers.stops,
        'Safe parkings': layers.parkings
      }, { position: 'bottomright', collapsed: true });
      controls.layers.addTo(map);

      map.fitBounds(L.latLngBounds(latlngs), { padding: [40, 40] });
      setTimeout(function () { map.invalidateSize(); }, 60);
    }

    function invalidate() {
      setTimeout(function () { map.invalidateSize(); }, 40);
    }

    return {
      map: map,
      render: render,
      clear: clear,
      invalidate: invalidate
    };
  }

  TRP.mapView = { create: create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
