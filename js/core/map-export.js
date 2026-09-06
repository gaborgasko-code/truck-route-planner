/**
 * Truck Route Planner - standalone itinerary map export.
 *
 * Builds a single self-contained HTML document (Leaflet from CDN + an embedded
 * JSON payload) that can be opened in a new tab, saved, e-mailed to a driver
 * or archived with the transport order. It has no dependency on the app.
 *
 * created by Gabor Gasko
 */
(function (global) {
  'use strict';

  var TRP = (global.TRP = global.TRP || {});
  var CONFIG = TRP.CONFIG;
  var util = TRP.util;

  var MAX_POLYLINE_POINTS = 2500;

  /** Compact, JSON-serialisable payload for the exported page. */
  function buildPayload(r) {
    var coords = TRP.geo.simplify(r.route.coords, MAX_POLYLINE_POINTS)
      .map(function (c) { return [util.round(c.lat, 5), util.round(c.lon, 5)]; });

    return {
      app: CONFIG.APP_NAME,
      version: CONFIG.APP_VERSION,
      author: CONFIG.AUTHOR,
      createdAt: r.createdAt,
      tileUrl: CONFIG.TILE_URL,
      attribution: CONFIG.TILE_ATTRIBUTION,
      currency: CONFIG.CURRENCY,
      parkingRadiusKm: CONFIG.PARKING_SEARCH_RADIUS_KM,
      origin: { label: r.origin.label, lat: r.origin.lat, lon: r.origin.lon },
      destination: { label: r.destination.label, lat: r.destination.lat, lon: r.destination.lon },
      coords: coords,
      summary: {
        distanceKm: util.round(r.route.distanceKm, 1),
        drivingHours: util.round(r.time.drivingHours, 2),
        totalHours: util.round(r.time.totalHours, 2),
        totalLabel: util.formatDuration(r.time.totalHours),
        drivingLabel: util.formatDuration(r.time.drivingHours),
        breaksCount: r.time.breaksCount,
        fullDays: r.time.fullDays,
        departure: util.formatDateTime(r.departure),
        arrival: util.formatDateTime(r.arrival),
        tollCost: r.costs.toll,
        fuelCost: r.costs.fuel,
        totalCost: r.costs.total,
        countries: r.countries
      },
      tolls: r.tolls.countries.map(function (c) {
        return { country: c.country, name: c.name, km: c.km, rate: c.effectiveRate, cost: c.cost, system: c.system };
      }),
      unclassifiedKm: r.tolls.unclassifiedKm,
      stops: (r.stops || []).map(function (s) {
        return {
          index: s.index, km: s.km, lat: s.lat, lon: s.lon,
          parkings: (s.parkings || []).map(function (p) {
            return { name: p.name, country: p.country, secured: !!p.secured, distanceKm: p.distanceKm };
          })
        };
      }),
      parkings: (r.parkings || []).map(function (p) {
        return {
          name: p.name, country: p.country, city: p.city, lat: p.lat, lon: p.lon,
          secured: !!p.secured, security_level: p.security_level, spaces: p.spaces,
          facilities: p.facilities || [], access: p.access || ''
        };
      }),
      regulations: (r.regulations || []).map(function (e) {
        return { country: e.country, name: e.name, rules: e.rules };
      }),
      warnings: r.warnings || [],
      disclaimer: CONFIG.DISCLAIMER
    };
  }

  /** JSON safe to inline inside a <script> block. */
  function safeJson(value) {
    return JSON.stringify(value)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(new RegExp(String.fromCharCode(0x2028), 'g'), '\\u2028')
      .replace(new RegExp(String.fromCharCode(0x2029), 'g'), '\\u2029');
  }

  var STYLE = [
    '*{box-sizing:border-box}',
    'html,body{height:100%;margin:0;font:14px/1.45 "Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#0f1c2e}',
    '#map{position:absolute;inset:0}',
    '.hdr{position:absolute;top:0;left:0;right:0;height:44px;z-index:1200;background:linear-gradient(90deg,#0b4ea2,#0a3a78);',
    'color:#fff;display:flex;align-items:center;gap:12px;padding:0 14px;box-shadow:0 2px 8px rgba(0,0,0,.25)}',
    '.hdr b{font-size:15px;letter-spacing:.3px}',
    '.hdr .by{margin-left:auto;font-size:12px;color:#ffcc00}',
    '#map{top:44px}',
    '.pnl{background:rgba(255,255,255,.97);border:1px solid #d3dced;border-radius:10px;box-shadow:0 6px 20px rgba(10,40,80,.22);',
    'padding:10px 12px;max-width:290px;font-size:12.5px}',
    '.pnl h3{margin:0 0 6px;font-size:13px;color:#0b4ea2;text-transform:uppercase;letter-spacing:.6px}',
    '.kv{display:flex;justify-content:space-between;gap:10px;padding:2px 0;border-bottom:1px dotted #e2e8f2}',
    '.kv:last-of-type{border-bottom:0}',
    '.kv b{color:#0f1c2e}',
    '.tot{background:#fff8dd;border-radius:6px;padding:4px 6px;margin-top:4px;border:1px solid #ffe08a}',
    'table{width:100%;border-collapse:collapse;margin-top:8px;font-size:12px}',
    'th,td{padding:3px 4px;text-align:left;border-bottom:1px solid #eef2f8}',
    'th{color:#5b6b84;font-weight:600}',
    '.num{text-align:right;font-variant-numeric:tabular-nums}',
    '.reg{max-height:52vh;overflow:auto}',
    '.reg h4{margin:8px 0 3px;font-size:12.5px;color:#0b4ea2}',
    '.reg ul{margin:0;padding-left:16px}',
    '.reg li{margin-bottom:3px}',
    '.tgl{width:100%;border:0;background:#0b4ea2;color:#fff;border-radius:6px;padding:6px 8px;font-weight:600;',
    'cursor:pointer;display:flex;justify-content:space-between;align-items:center;font-size:12.5px}',
    '.warn{margin-top:8px;background:#fff3cd;border-left:3px solid #ffcc00;padding:6px 8px;border-radius:4px;font-size:11.5px}',
    '.foot{margin-top:8px;font-size:11px;color:#5b6b84;text-align:right}',
    '.mk{display:flex;align-items:center;justify-content:center;border-radius:50%;color:#fff;font-weight:700;',
    'font-size:12px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);width:100%;height:100%}',
    '.mk-a{background:#1a9c53}.mk-b{background:#c8322e}.mk-s{background:#ffcc00;color:#0f1c2e}',
    '.mk-p{background:#5b6b84;font-size:11px}.mk-ps{background:#0b4ea2;font-size:11px}',
    '.leaflet-popup-content{font-size:12.5px}',
    '.leaflet-popup-content ul{margin:4px 0 0;padding-left:16px}'
  ].join('');

  var SCRIPT = [
    'var D = window.__TRP_ROUTE__;',
    'function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){',
    'return {"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c];});}',
    'function n(v,d){return Number(v).toLocaleString("en-GB",{minimumFractionDigits:d,maximumFractionDigits:d});}',
    'var map = L.map("map",{preferCanvas:true}).setView([50,10],5);',
    'L.tileLayer(D.tileUrl,{maxZoom:19,attribution:D.attribution}).addTo(map);',
    'L.polyline(D.coords,{color:"#ffcc00",weight:11,opacity:.85,lineCap:"round"}).addTo(map);',
    'L.polyline(D.coords,{color:"#0b4ea2",weight:5,opacity:.95,lineCap:"round"}).addTo(map);',
    'function icon(cls,txt,size){return L.divIcon({className:"",html:\'<div class="mk \'+cls+\'">\'+txt+"</div>",',
    'iconSize:[size,size],iconAnchor:[size/2,size/2]});}',
    'L.marker([D.origin.lat,D.origin.lon],{icon:icon("mk-a","A",30)}).addTo(map)',
    '.bindPopup("<b>Origin</b><br>"+esc(D.origin.label));',
    'L.marker([D.destination.lat,D.destination.lon],{icon:icon("mk-b","B",30)}).addTo(map)',
    '.bindPopup("<b>Destination</b><br>"+esc(D.destination.label));',
    'D.stops.forEach(function(s){',
    ' var li = s.parkings.map(function(p){return "<li>"+(p.secured?"&#128274; ":"")+esc(p.name)+" - "+n(p.distanceKm,1)+" km</li>";}).join("");',
    ' L.marker([s.lat,s.lon],{icon:icon("mk-s",String(s.index),28)}).addTo(map)',
    '  .bindPopup("<b>Rest stop "+s.index+"</b><br>km "+n(s.km,0)+(li?"<ul>"+li+"</ul>":"<br><i>no safe parking within "+D.parkingRadiusKm+" km</i>"));',
    '});',
    'var pk = (typeof L.markerClusterGroup === "function") ? L.markerClusterGroup({maxClusterRadius:45}) : L.layerGroup();',
    'D.parkings.forEach(function(p){',
    ' pk.addLayer(L.marker([p.lat,p.lon],{icon:icon(p.secured?"mk-ps":"mk-p","P",22)})',
    '  .bindPopup("<b>"+esc(p.name)+"</b><br>"+esc(p.city||"")+" ("+esc(p.country)+")<br>"+',
    '   (p.secured?"Secured, level "+(p.security_level||3):"Standard parking")+"<br>"+',
    '   (p.spaces?p.spaces+" spaces<br>":"")+esc((p.facilities||[]).join(", "))));',
    '});',
    'map.addLayer(pk);',
    'map.fitBounds(L.latLngBounds(D.coords),{padding:[40,40]});',
    'var S = D.summary;',
    'var rows = D.tolls.map(function(c){return "<tr><td>"+esc(c.country)+"</td><td class=num>"+n(c.km,0)+',
    '"</td><td class=num>"+n(c.cost,2)+"</td></tr>";}).join("");',
    'var sum = L.control({position:"topleft"});',
    'sum.onAdd = function(){var d=L.DomUtil.create("div","pnl");',
    ' d.innerHTML = "<h3>Route summary</h3>"+',
    '  "<div class=kv><span>Distance</span><b>"+n(S.distanceKm,1)+" km</b></div>"+',
    '  "<div class=kv><span>Total time</span><b>"+esc(S.totalLabel)+"</b></div>"+',
    '  "<div class=kv><span>Driving</span><b>"+esc(S.drivingLabel)+"</b></div>"+',
    '  "<div class=kv><span>Breaks / rests</span><b>"+S.breaksCount+" / "+S.fullDays+"</b></div>"+',
    '  "<div class=kv><span>Departure</span><b>"+esc(S.departure)+"</b></div>"+',
    '  "<div class=kv><span>Arrival</span><b>"+esc(S.arrival)+"</b></div>"+',
    '  "<div class=kv><span>Toll</span><b>"+n(S.tollCost,2)+" "+D.currency+"</b></div>"+',
    '  "<div class=kv><span>Fuel</span><b>"+n(S.fuelCost,2)+" "+D.currency+"</b></div>"+',
    '  "<div class=\'kv tot\'><span>Total cost</span><b>"+n(S.totalCost,2)+" "+D.currency+"</b></div>"+',
    '  (rows?"<table><thead><tr><th>Country</th><th class=num>km</th><th class=num>"+D.currency+"</th></tr></thead><tbody>"+rows+"</tbody></table>":"")+',
    '  "<div class=foot>"+esc(D.author)+"</div>";',
    ' L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d); return d;};',
    'sum.addTo(map);',
    'var reg = L.control({position:"topright"});',
    'reg.onAdd = function(){var d=L.DomUtil.create("div","pnl");',
    ' var body = D.regulations.map(function(e){return "<h4>"+esc(e.country)+" - "+esc(e.name)+"</h4><ul>"+',
    '  e.rules.map(function(x){return "<li>"+esc(x)+"</li>";}).join("")+"</ul>";}).join("");',
    ' d.innerHTML = "<button class=tgl type=button>Country regulations <span>&#9650;</span></button>"+',
    '  "<div class=reg id=regbody>"+(body||"<p>No regulations resolved.</p>")+',
    '  "<div class=warn>"+esc(D.disclaimer)+"</div><div class=foot>"+esc(D.author)+"</div></div>";',
    ' var btn = d.querySelector(".tgl"), bd = d.querySelector("#regbody");',
    ' btn.onclick = function(){var open = bd.style.display !== "none";',
    '  bd.style.display = open ? "none" : "block";',
    '  btn.querySelector("span").innerHTML = open ? "&#9660;" : "&#9650;";};',
    ' L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d); return d;};',
    'reg.addTo(map);'
  ].join('\n');

  /**
   * Build the complete standalone HTML document for a route plan.
   * @returns {string}
   */
  function buildHtml(r) {
    var payload = buildPayload(r);
    var title = CONFIG.APP_NAME + ' - ' + (r.origin.label || '').split(',')[0] +
      ' to ' + (r.destination.label || '').split(',')[0];
    return [
      '<!DOCTYPE html>',
      '<html lang="en"><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<title>' + util.escapeHtml(title) + '</title>',
      '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">',
      '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.min.css">',
      '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.Default.min.css">',
      '<style>' + STYLE + '</style></head><body>',
      '<div class="hdr"><b>' + util.escapeHtml(CONFIG.APP_NAME) + '</b>',
      '<span>' + util.escapeHtml(title) + '</span>',
      '<span class="by">' + util.escapeHtml(CONFIG.AUTHOR) + '</span></div>',
      '<div id="map"></div>',
      '<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"><\/script>',
      '<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.min.js"><\/script>',
      '<script>window.__TRP_ROUTE__ = ' + safeJson(payload) + ';<\/script>',
      '<script>' + SCRIPT + '<\/script>',
      '</body></html>'
    ].join('\n');
  }

  function makeBlobUrl(html) {
    return URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  }

  function fileName(r) {
    function slug(s) {
      return String(s || 'route').split(',')[0].toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'point';
    }
    return 'truck-route_' + slug(r.origin.label) + '_to_' + slug(r.destination.label) + '.html';
  }

  /** Open the exported map in a new browser tab. Returns false if blocked. */
  function openInNewTab(r) {
    var url = makeBlobUrl(buildHtml(r));
    var win = window.open(url, '_blank');
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    return !!win;
  }

  /** Download the exported map as an .html file. */
  function download(r) {
    var url = makeBlobUrl(buildHtml(r));
    var a = document.createElement('a');
    a.href = url;
    a.download = fileName(r);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
  }

  TRP.mapExport = {
    buildPayload: buildPayload,
    buildHtml: buildHtml,
    openInNewTab: openInNewTab,
    download: download,
    fileName: fileName
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TRP.mapExport;
})(typeof globalThis !== 'undefined' ? globalThis : this);
