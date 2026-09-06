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

  function t(key, params) {
    return TRP.i18n ? TRP.i18n.t(key, params) : key;
  }

  var MAX_POLYLINE_POINTS = 2500;

  /** Every label the exported document needs, already translated. */
  function labels() {
    return {
      summary: t('map.summary'), summaryShort: t('map.summaryShort'),
      regulations: t('map.regulations'), regulationsShort: t('map.regulationsShort'),
      legalStops: t('map.legalStops'),
      distance: t('map.distance'), totalTime: t('map.totalTime'), driving: t('map.driving'),
      breaksRests: t('map.breaksRests'), departure: t('map.departure'), arrival: t('map.arrival'),
      toll: t('map.toll'), fuel: t('map.fuel'), totalCost: t('map.totalCost'), ctry: t('map.ctry'),
      origin: t('map.origin'), destination: t('map.destination'),
      restStop: t('stops.restStopShort', { n: '{n}' }),
      noParking: t('stops.noneNearbyShort', { radius: '{radius}' }),
      securedLevel: t('stops.securedLevel', { level: '{level}' }),
      standardParking: t('stops.standardParking'),
      spaces: t('stops.spaces', { n: '{n}' }),
      minDuration: t('legal.minDuration'),
      noRegulations: t('reg.none')
    };
  }

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
      lang: TRP.i18n ? TRP.i18n.lang() : 'es',
      labels: labels(),
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
      legalStops: ((r.legal && r.legal.plan) || []).map(function (stop) {
        return {
          type: t('legal.type.' + stop.type),
          at: util.formatDateTime(stop.at),
          km: stop.km,
          minutes: util.formatShortDuration(stop.minMinutes / 60),
          article: stop.article
        };
      }),
      warnings: (r.warnings || []).map(function (w) {
        return TRP.render ? TRP.render.warningText(w) : String(w && w.key || w);
      }),
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
    'html,body{height:100%;margin:0;font:14px/1.45 Inter,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#101828}',
    '#map{position:absolute;inset:0}',
    '.hdr{position:absolute;top:0;left:0;right:0;height:48px;z-index:1200;background:#fff;color:#101828;',
    'display:flex;align-items:center;gap:12px;padding:0 16px;border-bottom:1px solid #e4e7ec;box-shadow:0 1px 3px rgba(16,24,40,.08)}',
    '.hdr b{font-size:15px;font-weight:600}.hdr>span{color:#667085;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.hdr .by{margin-left:auto;font-size:12.5px;font-weight:500;color:#fff;text-decoration:none;white-space:nowrap;',
    'background:#0a66c2;padding:6px 12px;border-radius:999px}',
    '.hdr .by:hover{background:#004182}',
    '#map{top:48px}',
    '.pnl{background:rgba(255,255,255,.97);border:1px solid #e4e7ec;border-radius:10px;box-shadow:0 12px 16px -4px rgba(16,24,40,.12),0 4px 6px -2px rgba(16,24,40,.06);',
    'padding:10px 12px;max-width:290px;font-size:12.5px}',
    '.pnl h3{margin:0 0 6px;font-size:12.5px;font-weight:600;color:#101828}',
    '.kv{display:flex;justify-content:space-between;gap:10px;padding:2px 0;border-bottom:1px solid #f0f2f5}',
    '.kv:last-of-type{border-bottom:0}',
    '.kv b{color:#101828}',
    '.tot{background:#eef4ff;border-radius:6px;padding:5px 7px;margin-top:6px;border:1px solid #b9d0fb;font-weight:600}',
    'table{width:100%;border-collapse:collapse;margin-top:8px;font-size:12px}',
    'th,td{padding:3px 4px;text-align:left;border-bottom:1px solid #f0f2f5}',
    'th{color:#667085;font-weight:500}',
    '.num{text-align:right;font-variant-numeric:tabular-nums}',
    '.reg{max-height:52vh;overflow:auto}',
    '.reg h4{margin:8px 0 3px;font-size:12.5px;color:#101828}',
    '.reg ul{margin:0;padding-left:16px}',
    '.reg li{margin-bottom:3px}',
    '.tgl{width:100%;border:1px solid #e4e7ec;background:#fff;color:#101828;border-radius:6px;padding:6px 8px;font-weight:600;',
    'cursor:pointer;display:flex;justify-content:space-between;align-items:center;font-size:12.5px}',
    '.warn{margin-top:8px;background:#fffaeb;border:1px solid #fedf89;padding:6px 8px;border-radius:6px;font-size:11.5px;color:#344054}',
    '.foot{margin-top:8px;font-size:11px;color:#667085;text-align:right}',
    '.mk{display:flex;align-items:center;justify-content:center;border-radius:50%;color:#fff;font-weight:700;',
    'font-size:12px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);width:100%;height:100%}',
    '.mk-a{background:#17b26a}.mk-b{background:#f04438}.mk-s{background:#2563eb}',
    '.mk-p{background:#667085;font-size:11px}.mk-ps{background:#101828;font-size:11px}',
    '.leaflet-popup-content{font-size:12.5px}',
    '.leaflet-popup-content ul{margin:4px 0 0;padding-left:16px}',
    '.bd{max-height:52vh;overflow:auto}',
    '.pnl.cmp{max-width:46vw;font-size:11.5px;padding:7px 8px}',
    '.pnl.cmp .bd{max-height:38vh}',
    '.pnl.cmp .tgl{padding:5px 7px;font-size:11.5px}'
  ].join('');

  var SCRIPT = [
    'var D = window.__TRP_ROUTE__;',
    'var LB = D.labels || {};',
    'function fill(tpl, map){ return String(tpl||"").replace(/\{(\w+)\}/g, function(m,k){ return map[k]!=null?map[k]:m; }); }',
    'function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){',
    'return {"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c];});}',
    'function n(v,d){return Number(v).toLocaleString("en-GB",{minimumFractionDigits:d,maximumFractionDigits:d});}',
    'var map = L.map("map",{preferCanvas:true}).setView([50,10],5);',
    'L.tileLayer(D.tileUrl,{maxZoom:19,attribution:D.attribution}).addTo(map);',
    'L.polyline(D.coords,{color:"#ffffff",weight:10,opacity:.9,lineCap:"round"}).addTo(map);',
    'L.polyline(D.coords,{color:"#2563eb",weight:5,opacity:.95,lineCap:"round"}).addTo(map);',
    'function icon(cls,txt,size){return L.divIcon({className:"",html:\'<div class="mk \'+cls+\'">\'+txt+"</div>",',
    'iconSize:[size,size],iconAnchor:[size/2,size/2]});}',
    'L.marker([D.origin.lat,D.origin.lon],{icon:icon("mk-a","A",30)}).addTo(map)',
    '.bindPopup("<b>"+esc(LB.origin)+"</b><br>"+esc(D.origin.label));',
    'L.marker([D.destination.lat,D.destination.lon],{icon:icon("mk-b","B",30)}).addTo(map)',
    '.bindPopup("<b>"+esc(LB.destination)+"</b><br>"+esc(D.destination.label));',
    'D.stops.forEach(function(s){',
    ' var li = s.parkings.map(function(p){return "<li>"+(p.secured?"&#128274; ":"")+esc(p.name)+" - "+n(p.distanceKm,1)+" km</li>";}).join("");',
    ' L.marker([s.lat,s.lon],{icon:icon("mk-s",String(s.index),28)}).addTo(map)',
    '  .bindPopup("<b>"+esc(fill(LB.restStop,{n:s.index}))+"</b><br>km "+n(s.km,0)+',
    '   (li?"<ul>"+li+"</ul>":"<br><i>"+esc(fill(LB.noParking,{radius:D.parkingRadiusKm}))+"</i>"));',
    '});',
    'var pk = (typeof L.markerClusterGroup === "function") ? L.markerClusterGroup({maxClusterRadius:45}) : L.layerGroup();',
    'D.parkings.forEach(function(p){',
    ' pk.addLayer(L.marker([p.lat,p.lon],{icon:icon(p.secured?"mk-ps":"mk-p","P",22)})',
    '  .bindPopup("<b>"+esc(p.name)+"</b><br>"+esc(p.city||"")+" ("+esc(p.country)+")<br>"+',
    '   esc(p.secured?fill(LB.securedLevel,{level:p.security_level||3}):LB.standardParking)+"<br>"+',
    '   (p.spaces?esc(fill(LB.spaces,{n:p.spaces}))+"<br>":"")+esc((p.facilities||[]).join(", "))));',
    '});',
    'map.addLayer(pk);',
    'map.fitBounds(L.latLngBounds(D.coords),{padding:[40,40]});',
    'var S = D.summary;',
    'var rows = D.tolls.map(function(c){return "<tr><td>"+esc(c.country)+"</td><td class=num>"+n(c.km,0)+',
    '"</td><td class=num>"+n(c.cost,2)+"</td></tr>";}).join("");',
    'var COMPACT = (window.innerWidth || 1024) < 760;',
    'function panel(title, body, collapsible, open){',
    ' if(!collapsible) return "<h3>"+esc(title)+"</h3><div class=bd>"+body+"</div>";',
    ' return "<button class=tgl type=button><span>"+esc(title)+"</span><span>"+(open?"&#9650;":"&#9660;")+',
    '  "</span></button><div class=bd"+(open?"":" style=\'display:none\'")+">"+body+"</div>";}',
    'function wire(d){var btn=d.querySelector(".tgl"), bd=d.querySelector(".bd");',
    ' if(!btn||!bd) return;',
    ' btn.onclick=function(){var open = bd.style.display !== "none";',
    '  bd.style.display = open ? "none" : "block";',
    '  btn.lastChild.innerHTML = open ? "&#9660;" : "&#9650;";};}',
    'var sum = L.control({position:"topleft"});',
    'sum.onAdd = function(){var d=L.DomUtil.create("div","pnl"+(COMPACT?" cmp":""));',
    ' var body = ',
    '  "<div class=kv><span>"+esc(LB.distance)+"</span><b>"+n(S.distanceKm,1)+" km</b></div>"+',
    '  "<div class=kv><span>"+esc(LB.totalTime)+"</span><b>"+esc(S.totalLabel)+"</b></div>"+',
    '  "<div class=kv><span>"+esc(LB.driving)+"</span><b>"+esc(S.drivingLabel)+"</b></div>"+',
    '  "<div class=kv><span>"+esc(LB.breaksRests)+"</span><b>"+S.breaksCount+" / "+S.fullDays+"</b></div>"+',
    '  "<div class=kv><span>"+esc(LB.departure)+"</span><b>"+esc(S.departure)+"</b></div>"+',
    '  "<div class=kv><span>"+esc(LB.arrival)+"</span><b>"+esc(S.arrival)+"</b></div>"+',
    '  "<div class=kv><span>"+esc(LB.toll)+"</span><b>"+n(S.tollCost,2)+" "+D.currency+"</b></div>"+',
    '  "<div class=kv><span>"+esc(LB.fuel)+"</span><b>"+n(S.fuelCost,2)+" "+D.currency+"</b></div>"+',
    '  "<div class=\'kv tot\'><span>"+esc(LB.totalCost)+"</span><b>"+n(S.totalCost,2)+" "+D.currency+"</b></div>"+',
    '  (rows?"<table><thead><tr><th>"+esc(LB.ctry)+"</th><th class=num>km</th><th class=num>"+D.currency+"</th></tr></thead><tbody>"+rows+"</tbody></table>":"")+',
    '  "<div class=foot>"+esc(D.author)+"</div>";',
    ' d.innerHTML = panel(COMPACT?LB.summaryShort:LB.summary, body, COMPACT, false);',
    ' wire(d);',
    ' L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d); return d;};',
    'sum.addTo(map);',
    'var reg = L.control({position:"topright"});',
    'reg.onAdd = function(){var d=L.DomUtil.create("div","pnl"+(COMPACT?" cmp":""));',
    ' var body = D.regulations.map(function(e){return "<h4>"+esc(e.country)+" - "+esc(e.name)+"</h4><ul>"+',
    '  e.rules.map(function(x){return "<li>"+esc(x)+"</li>";}).join("")+"</ul>";}).join("");',
    ' var ls = (D.legalStops||[]).map(function(x){ return "<li><b>"+esc(x.type)+"</b> - "+esc(x.at)+", km "+n(x.km,0)+", "+esc(LB.minDuration)+" "+esc(x.minutes)+" ["+esc(x.article)+"]</li>"; }).join("");',
    ' if (ls) body = "<h4>"+esc(LB.legalStops)+"</h4><ul>"+ls+"</ul>"+body;',
    ' body = (body||"<p>"+esc(LB.noRegulations)+"</p>")+',
    '  "<div class=warn>"+esc(D.disclaimer)+"</div><div class=foot>"+esc(D.author)+"</div>";',
    ' d.innerHTML = panel(COMPACT?LB.regulationsShort:LB.regulations, body, true, !COMPACT);',
    ' wire(d);',
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
      '<a class="by" href="' + util.escapeHtml(CONFIG.AUTHOR_URL) + '" target="_blank" rel="noopener noreferrer">' +
        util.escapeHtml(CONFIG.AUTHOR) + '</a></div>',
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
