/**
 * Truck Route Planner - localisation.
 *
 * Spanish is the default language; English is available from the selector in
 * the header. Every user-visible string in the app goes through `t()`, and
 * numbers, dates and durations follow the active locale.
 *
 * created by Gabor Gasko
 */
(function (global) {
  'use strict';

  var TRP = (global.TRP = global.TRP || {});

  var STORAGE_KEY = 'trp.lang';
  var DEFAULT_LANG = 'es';
  var LOCALES = { es: 'es-ES', en: 'en-GB' };
  var LANG_NAMES = { es: 'Español', en: 'English' };

  var STRINGS = {

    /* ------------------------------------------------------------- shell */
    'app.name': { es: 'Truck Route Planner', en: 'Truck Route Planner' },
    'app.tagline': {
      es: 'Rutas por carretera · tiempos de conducción UE · peajes · aparcamiento seguro',
      en: 'Road routing · EU driving time · tolls · safe parking'
    },
    'app.subtitle': {
      es: 'Rutas por carretera, cumplimiento de los tiempos de conducción de la UE, estimación de peajes y aparcamiento seguro para vehículos pesados.',
      en: 'Road routing, EU driving-time compliance, toll estimation and safe parking for heavy goods vehicles.'
    },
    'app.author': { es: 'created by Gabor Gasko', en: 'created by Gabor Gasko' },
    'app.userGuide': { es: 'Guía de usuario', en: 'User guide' },
    'app.mobileView': { es: 'Versión móvil', en: 'Mobile view' },
    'app.desktopView': { es: 'Versión de escritorio', en: 'Desktop view' },
    'app.source': { es: 'origen', en: 'source' },
    'app.builtInData': { es: 'datos integrados', en: 'built-in data' },
    'app.themeToDark': { es: 'Cambiar al tema oscuro', en: 'Switch to dark theme' },
    'app.themeToLight': { es: 'Cambiar al tema claro', en: 'Switch to light theme' },
    'app.language': { es: 'Idioma', en: 'Language' },
    'app.footerDisclaimer': {
      es: '<strong>Solo estimaciones.</strong> Las distancias, los tiempos de conducción, los peajes y las normativas nacionales son ayudas a la planificación y no son jurídicamente vinculantes. Verifique las restricciones de circulación, las tarifas de peaje y las limitaciones del vehículo con la autoridad nacional competente antes de la salida.',
      en: '<strong>Estimates only.</strong> Distances, driving times, tolls and national regulations are planning aids and are not legally binding. Verify driving bans, toll tariffs and vehicle restrictions with the competent national authority before departure.'
    },

    /* -------------------------------------------------------------- form */
    'form.route': { es: 'Ruta', en: 'Route' },
    'form.origin': { es: 'Dirección de origen', en: 'Origin address' },
    'form.originShort': { es: 'Origen', en: 'Origin' },
    'form.destination': { es: 'Dirección de destino', en: 'Destination address' },
    'form.destinationShort': { es: 'Destino', en: 'Destination' },
    'form.originPlaceholder': { es: 'p. ej. Calle de Alcalá 1, Madrid, España', en: 'e.g. Hafenstrasse 1, Hamburg, Germany' },
    'form.destinationPlaceholder': { es: 'p. ej. Gran Via 2, Barcelona, España', en: 'e.g. Via Roma 10, Milan, Italy' },
    'form.addressPlaceholder': { es: 'Calle, ciudad, país', en: 'Street, city, country' },
    'form.departure': { es: 'Salida', en: 'Departure' },
    'form.calculate': { es: 'Calcular ruta', en: 'Calculate Route' },
    'form.calculating': { es: 'Calculando…', en: 'Calculating…' },
    'form.showMap': { es: 'Ver mapa completo del itinerario', en: 'Show Full Itinerary Map' },
    'form.reset': { es: 'Restablecer', en: 'Reset' },
    'form.swap': { es: 'Intercambiar origen y destino', en: 'Swap origin and destination' },
    'form.formReset': { es: 'Formulario restablecido.', en: 'Form reset.' },

    'form.vehicle': { es: 'Perfil del vehículo', en: 'Vehicle profile' },
    'form.weight': { es: 'MMA (t)', en: 'Gross weight (t)' },
    'form.weightShort': { es: 'Peso (t)', en: 'Weight (t)' },
    'form.axles': { es: 'Ejes', en: 'Axles' },
    'form.emission': { es: 'Clase de emisión', en: 'Emission class' },
    'form.emissionShort': { es: 'Emisión', en: 'Emission' },
    'form.speed': { es: 'Vel. media (km/h)', en: 'Avg speed (km/h)' },
    'form.speedShort': { es: 'Velocidad (km/h)', en: 'Speed (km/h)' },
    'form.fuel': { es: 'Consumo (l/100 km)', en: 'Fuel (l/100 km)' },
    'form.fuelShort': { es: 'Consumo l/100 km', en: 'Fuel l/100km' },
    'form.fuelPrice': { es: 'Gasóleo (EUR/l)', en: 'Diesel (EUR/l)' },
    'form.adr': { es: 'Carga ADR / mercancías peligrosas', en: 'ADR / dangerous goods load' },

    'form.tollAnalysis': { es: 'Análisis de peajes', en: 'Toll analysis' },
    'form.tollDetail': { es: 'Detalle del muestreo', en: 'Sampling detail' },
    'form.tollDetailShort': { es: 'Detalle del análisis de peajes', en: 'Toll analysis detail' },
    'form.tollFast': { es: 'Rápido — un punto cada 150 km', en: 'Fast — sample every 150 km' },
    'form.tollBalanced': { es: 'Equilibrado — cada 100 km', en: 'Balanced — every 100 km' },
    'form.tollPrecise': { es: 'Preciso — cada 50 km', en: 'Precise — every 50 km' },
    'form.tollNote': {
      es: 'La detección de país usa primero cajas delimitadoras sin conexión y solo recurre al geocodificador inverso de Nominatim, limitado a una petición por segundo. El modo preciso es el más exacto, pero el más lento en rutas largas. Los resultados se guardan en este dispositivo.',
      en: 'Country detection uses offline bounding boxes first and only falls back to the Nominatim reverse-geocoder, which is limited to one request per second. Precise mode is the most accurate but the slowest on long routes. Results are cached on this device.'
    },
    'form.tollNoteShort': {
      es: 'El modo preciso es el más exacto, pero más lento, porque la detección de fronteras recurre a un geocodificador limitado a una petición por segundo.',
      en: 'Precise mode is the most accurate but slower, because border detection falls back to a reverse-geocoder limited to one request per second.'
    },
    'form.servicesNote': {
      es: 'Solo servicios gratuitos: Nominatim de OpenStreetMap para la geocodificación y el servidor de demostración OSRM para las rutas. Sin clave de API, sin cuenta y sin seguimiento.',
      en: 'Free services only — OpenStreetMap Nominatim for geocoding and the OSRM demo server for routing. No API key, no account, no tracking.'
    },
    'form.servicesNoteShort': {
      es: 'Servicios gratuitos de OpenStreetMap y OSRM. No se necesita clave de API ni cuenta.',
      en: 'Free OpenStreetMap and OSRM services. No API key and no account required.'
    },

    /* ------------------------------------------------------------- tabs */
    'tab.overview': { es: 'Resumen', en: 'Overview' },
    'tab.itinerary': { es: 'Itinerario', en: 'Itinerary' },
    'tab.tolls': { es: 'Peajes', en: 'Tolls' },
    'tab.stops': { es: 'Paradas y aparcamiento', en: 'Stops & parking' },
    'tab.legal': { es: 'Paradas legales', en: 'Legal stops' },
    'tab.regulations': { es: 'Normativa', en: 'Regulations' },
    'tab.map': { es: 'Mapa', en: 'Map' },
    'tab.report': { es: 'Informe', en: 'Report' },
    'nav.plan': { es: 'Plan', en: 'Plan' },
    'nav.result': { es: 'Resultado', en: 'Result' },
    'nav.map': { es: 'Mapa', en: 'Map' },
    'nav.rules': { es: 'Normas', en: 'Rules' },
    'nav.info': { es: 'Info', en: 'Info' },

    /* ---------------------------------------------------------- overview */
    'stat.roadDistance': { es: 'Distancia por carretera', en: 'Road distance' },
    'stat.roadNetwork': { es: 'red viaria OSRM', en: 'OSRM road network' },
    'stat.totalTime': { es: 'Tiempo total del viaje', en: 'Total trip time' },
    'stat.totalTimeSub': { es: 'incl. pausas y descanso diario', en: 'incl. breaks and daily rest' },
    'stat.pureDriving': { es: 'Conducción efectiva', en: 'Pure driving' },
    'stat.atAverage': { es: 'a {speed} km/h de media', en: 'at {speed} km/h average' },
    'stat.arrival': { es: 'Llegada estimada', en: 'Estimated arrival' },
    'stat.departureAt': { es: 'salida {time}', en: 'departure {time}' },
    'stat.toll': { es: 'Peajes estimados', en: 'Toll estimate' },
    'stat.countrySegments': { es: '{n} tramo(s) por país', en: '{n} country segment(s)' },
    'stat.fuel': { es: 'Combustible estimado', en: 'Fuel estimate' },
    'stat.fuelSub': { es: '{liters} l a {price} {cur}/l', en: '{liters} l at {price} {cur}/l' },
    'stat.notConfigured': { es: 'sin configurar', en: 'not configured' },
    'stat.totalCost': { es: 'Coste total del viaje', en: 'Total run cost' },
    'stat.legalBreaks': { es: 'Pausas obligatorias', en: 'Legal breaks' },
    'stat.legalBreaksSub': { es: '{days} descanso(s) diario(s) de {h} h', en: '{days} daily rest(s) of {h} h' },
    'stat.times45': { es: '× 45 min', en: '× 45 min' },
    'overview.warnings': { es: 'Avisos de planificación', en: 'Planning warnings' },
    'overview.stopsPreview': { es: 'Vista previa de las paradas', en: 'Rest stops preview' },
    'overview.empty': {
      es: 'Introduzca un origen y un destino y pulse <strong>Calcular ruta</strong>.',
      en: 'Enter an origin and a destination, then press <strong>Calculate Route</strong>.'
    },
    'overview.failed': { es: 'El cálculo ha fallado', en: 'Calculation failed' },
    'overview.failedNote': {
      es: 'La aplicación usa los servicios gratuitos Nominatim y OSRM. Tienen límites de uso y a veces no están disponibles; reintentar al cabo de un minuto suele funcionar.',
      en: 'The app uses the free Nominatim and OSRM demo services. They are rate limited and occasionally unavailable — retrying after a minute usually works.'
    },
    'overview.routeCountriesNA': { es: 'países de la ruta no disponibles', en: 'route countries unavailable' },
    'overview.calculated': {
      es: 'Ruta calculada: {km} km, {time} en total.',
      en: 'Route calculated: {km} km, {time} total.'
    },
    'overview.calculatedShort': {
      es: '{km} km, {time} de viaje total.',
      en: '{km} km, {time} total trip time.'
    },

    /* --------------------------------------------------------- itinerary */
    'itinerary.title': { es: 'Programa legal de conducción', en: 'Legal driving schedule' },
    'ev.depart': { es: 'Salida', en: 'Departure' },
    'ev.arrive': { es: 'Llegada', en: 'Arrival' },
    'ev.drive': { es: 'Conducir {d}', en: 'Drive {d}' },
    'ev.break': { es: 'Pausa obligatoria de {m} min', en: 'Mandatory break {m} min' },
    'ev.rest': { es: 'Descanso diario de {h} h', en: 'Daily rest {h} h' },
    'itinerary.note': {
      es: 'Las pausas y los descansos diarios se aplican de forma acumulativa, por lo que la hora de llegada es un peor caso conservador. La planificación real depende del historial del tacógrafo y de las ventanas de carga.',
      en: 'Breaks and daily rests are applied cumulatively, so the arrival time is a conservative worst case. Actual scheduling depends on tachograph history and loading windows.'
    },

    /* ------------------------------------------------------------- tolls */
    'toll.title': { es: 'Peajes estimados por país', en: 'Toll estimate by country' },
    'toll.country': { es: 'País', en: 'Country' },
    'toll.km': { es: 'km', en: 'km' },
    'toll.baseRate': { es: 'Tarifa base {cur}/km', en: 'Base {cur}/km' },
    'toll.appliedRate': { es: 'Tarifa aplicada {cur}/km', en: 'Applied {cur}/km' },
    'toll.cost': { es: 'Coste', en: 'Cost' },
    'toll.system': { es: 'Sistema de peaje', en: 'Toll system' },
    'toll.total': { es: 'Total', en: 'Total' },
    'toll.unclassified': { es: 'Sin clasificar', en: 'Unclassified' },
    'toll.notResolved': { es: 'país no resuelto', en: 'country not resolved' },
    'toll.none': { es: 'No se han podido determinar tramos de peaje para esta ruta.', en: 'No toll segments could be determined for this route.' },
    'toll.note': {
      es: 'Factor de vehículo <strong>{factor}</strong> aplicado ({weight} t, {axles} ejes, EURO {euro}). Intervalo de muestreo {interval} km, {calls} llamada(s) de geocodificación inversa. Los países con viñeta aparecen a 0,00 {cur}/km: adquiérala por separado.',
      en: 'Vehicle factor <strong>{factor}</strong> applied ({weight} t, {axles} axles, EURO {euro}). Sampling interval {interval} km, {calls} reverse-geocode call(s). Vignette countries appear at 0.00 {cur}/km — buy those separately.'
    },
    'toll.costSummary': { es: 'Resumen de costes', en: 'Cost summary' },
    'toll.tolls': { es: 'Peajes', en: 'Tolls' },
    'toll.fuel': { es: 'Combustible', en: 'Fuel' },
    'toll.litres': { es: '{liters} litros', en: '{liters} litres' },
    'toll.excluded': {
      es: 'Las cifras de peaje son promedios orientativos. No se incluyen viñetas, túneles, puentes, ferris ni tasas urbanas.',
      en: 'Toll figures are indicative averages. Vignettes, tunnels, bridges, ferries and city charges are not included.'
    },

    /* -------------------------------------------------- stops / parking */
    'stops.title': { es: 'Paradas sugeridas y aparcamiento seguro', en: 'Suggested stops and safe parking' },
    'stops.restStop': { es: 'Parada de descanso en el km {km}', en: 'Rest stop at km {km}' },
    'stops.restStopShort': { es: 'Parada {n}', en: 'Rest stop {n}' },
    'stops.securedNearby': { es: 'aparcamiento seguro cerca', en: 'secured parking nearby' },
    'stops.noneNearby': {
      es: 'No hay aparcamiento seguro en {radius} km en el conjunto de datos de muestra: planifique manualmente un área de servicio.',
      en: 'No safe parking within {radius} km in the sample dataset — plan a service area manually.'
    },
    'stops.noneNearbyShort': { es: 'Sin aparcamiento seguro en {radius} km', en: 'No safe parking within {radius} km' },
    'stops.tooShort': {
      es: 'La ruta es más corta que el intervalo de paradas de {interval} km, por lo que no se sugiere ninguna parada intermedia.',
      en: 'The route is shorter than the {interval} km stop interval, so no intermediate stop is suggested.'
    },
    'stops.fromStop': { es: '{km} km desde la parada', en: '{km} km from the stop' },
    'stops.spaces': { es: '{n} plazas', en: '{n} spaces' },
    'stops.secured': { es: 'Seguro N{level}', en: 'Secured L{level}' },
    'stops.standard': { es: 'Estándar', en: 'Standard' },
    'stops.securedLevel': { es: 'Seguro, nivel {level}', en: 'Secured, level {level}' },
    'stops.standardParking': { es: 'Aparcamiento estándar', en: 'Standard parking' },

    /* ------------------------------------------------------ regulations */
    'reg.title': { es: 'Normativa nacional a lo largo de la ruta', en: 'Country regulations along the route' },
    'reg.euBaseline': { es: 'base UE', en: 'EU baseline' },
    'reg.verify': {
      es: '<strong>Verifique antes de la salida.</strong> Las restricciones de circulación, los calendarios de festivos, los periodos de equipamiento invernal y los límites dimensionales cambian con frecuencia y varían por región. Estas notas son una ayuda a la planificación, no asesoramiento jurídico.',
      en: '<strong>Verify before departure.</strong> Driving bans, holiday calendars, winter equipment periods and dimension limits change frequently and differ by region. These notes are a planning aid, not legal advice.'
    },
    'reg.mapWarn': {
      es: 'Solo estimaciones: verifique todas las restricciones de circulación antes de la salida.',
      en: 'Estimates only — verify all driving bans and restrictions before departure.'
    },
    'reg.none': { es: 'No se ha resuelto ninguna normativa nacional.', en: 'No country regulations resolved.' },
    'reg.empty': {
      es: 'La normativa por país aparece después de calcular una ruta.',
      en: 'Country regulations appear after a route is calculated.'
    },

    /* ------------------------------------------------------ legal stops */
    'legal.title': { es: 'Paradas legales obligatorias (UE)', en: 'Mandatory legal stops (EU)' },
    'legal.planTitle': { es: 'Plan de paradas obligatorias', en: 'Mandatory stop plan' },
    'legal.rulesTitle': { es: 'Normativa europea de tiempos de conducción y descanso', en: 'European driving and rest time rules' },
    'legal.checksTitle': { es: 'Comprobaciones de cumplimiento del viaje', en: 'Trip compliance checks' },
    'legal.empty': {
      es: 'El plan de paradas obligatorias aparece después de calcular una ruta. La normativa de referencia se muestra debajo.',
      en: 'The mandatory stop plan appears after a route is calculated. The reference rules are shown below.'
    },
    'legal.stopNo': { es: 'Parada {n}', en: 'Stop {n}' },
    'legal.type.break': { es: 'Pausa de conducción', en: 'Driving break' },
    'legal.type.dailyRest': { es: 'Descanso diario', en: 'Daily rest' },
    'legal.type.weeklyRest': { es: 'Descanso semanal', en: 'Weekly rest' },
    'legal.minDuration': { es: 'Duración mínima', en: 'Minimum duration' },
    'legal.afterDriving': { es: 'tras {h} de conducción acumulada', en: 'after {h} of accumulated driving' },
    'legal.atKm': { es: 'km {km}', en: 'km {km}' },
    'legal.basis': { es: 'Base legal', en: 'Legal basis' },
    'legal.alternative': { es: 'Alternativa permitida', en: 'Permitted alternative' },
    'legal.noStops': {
      es: 'Esta ruta no alcanza el límite de 4 h 30 min de conducción continua, por lo que no exige ninguna pausa obligatoria por sí sola. El tiempo de conducción ya acumulado por el conductor sigue contando.',
      en: 'This route does not reach the 4h30 continuous driving limit, so it requires no mandatory break on its own. The driving time the driver has already accumulated still counts.'
    },
    'legal.ok': { es: 'Dentro de los límites', en: 'Within the limits' },
    'legal.attention': { es: 'Requiere atención', en: 'Needs attention' },
    'legal.disclaimer': {
      es: '<strong>El modelo no conoce el tacógrafo del conductor.</strong> Supone un conductor que inicia una jornada limpia, en conducción individual, sin descansos reducidos, sin jornadas ampliadas, sin reglas de ferri o tren y sin tiempos de carga o descarga. Contraste siempre el plan con las horas realmente registradas.',
      en: '<strong>The model does not know the driver tachograph.</strong> It assumes a fresh driver starting a clean shift, single manning, no reduced rests, no extended driving days, no ferry or train rules and no loading or unloading time. Always check the plan against the hours actually recorded.'
    },
    'legal.checkWeeklyDriving': { es: 'Conducción semanal (máx. 56 h)', en: 'Weekly driving (max 56 h)' },
    'legal.checkFortnightly': { es: 'Conducción en dos semanas (máx. 90 h)', en: 'Fortnightly driving (max 90 h)' },
    'legal.checkDailyDriving': { es: 'Jornadas de conducción necesarias', en: 'Driving days required' },
    'legal.checkWeeklyRest': { es: 'Descanso semanal', en: 'Weekly rest' },
    'legal.checkContinuous': { es: 'Conducción continua (máx. 4 h 30 min)', en: 'Continuous driving (max 4h30)' },
    'legal.days': { es: '{n} jornada(s)', en: '{n} day(s)' },
    'legal.ofLimit': { es: '{value} de {limit}', en: '{value} of {limit}' },
    'legal.weeklyRestNotDue': {
      es: 'No se alcanza dentro de este viaje. Aun así, el descanso semanal debe iniciarse como máximo tras seis periodos de 24 h desde el final del anterior.',
      en: 'Not reached within this trip. A weekly rest must still start no later than after six 24-hour periods from the end of the previous one.'
    },
    'legal.weeklyRestDue': {
      es: 'Este viaje supera los seis periodos de 24 h: debe programarse un descanso semanal de 45 h antes de que termine.',
      en: 'This trip exceeds six 24-hour periods: a 45-hour weekly rest must be scheduled before it ends.'
    },
    'legal.extendedNeeded': {
      es: 'Alguna jornada supera las 9 h de conducción: la ampliación a 10 h solo se permite dos veces por semana.',
      en: 'A driving day exceeds 9 h: extension to 10 h is allowed only twice a week.'
    },
    'legal.splitBreakHint': {
      es: 'La pausa de 45 min puede dividirse en 15 min + 30 min dentro del mismo periodo de 4 h 30 min.',
      en: 'The 45-minute break may be split into 15 min + 30 min within the same 4h30 period.'
    },
    'legal.splitRestHint': {
      es: 'El descanso diario de 11 h puede fraccionarse en 3 h + 9 h (total 12 h) o reducirse a 9 h como máximo tres veces entre dos descansos semanales.',
      en: 'The 11-hour daily rest may be split into 3 h + 9 h (12 h in total) or reduced to 9 h at most three times between two weekly rests.'
    },
    'legal.accommodationHint': {
      es: 'El descanso semanal regular de 45 h no puede realizarse en el vehículo: debe hacerse en un alojamiento adecuado a cargo del empresario.',
      en: 'A regular 45-hour weekly rest may not be taken in the vehicle: it must be in suitable accommodation paid for by the employer.'
    },

    /* ------------------------------------------------------------- map */
    'map.summary': { es: 'Resumen de la ruta', en: 'Route summary' },
    'map.summaryShort': { es: 'Resumen', en: 'Summary' },
    'map.regulations': { es: 'Normativa por país', en: 'Country regulations' },
    'map.regulationsShort': { es: 'Normas', en: 'Rules' },
    'map.distance': { es: 'Distancia', en: 'Distance' },
    'map.totalTime': { es: 'Tiempo total', en: 'Total time' },
    'map.driving': { es: 'Conducción', en: 'Driving' },
    'map.breaksRests': { es: 'Pausas / descansos', en: 'Breaks / rests' },
    'map.departure': { es: 'Salida', en: 'Departure' },
    'map.arrival': { es: 'Llegada', en: 'Arrival' },
    'map.toll': { es: 'Peaje', en: 'Toll' },
    'map.fuel': { es: 'Combustible', en: 'Fuel' },
    'map.total': { es: 'Total', en: 'Total' },
    'map.totalCost': { es: 'Coste total', en: 'Total cost' },
    'map.ctry': { es: 'País', en: 'Ctry' },
    'map.origin': { es: 'Origen', en: 'Origin' },
    'map.destination': { es: 'Destino', en: 'Destination' },
    'map.layerRoute': { es: 'Ruta', en: 'Route' },
    'map.layerStops': { es: 'Paradas', en: 'Rest stops' },
    'map.layerParkings': { es: 'Aparcamientos seguros', en: 'Safe parkings' },
    'map.legalStops': { es: 'Paradas legales', en: 'Legal stops' },
    'map.openStandalone': { es: 'Abrir mapa independiente', en: 'Open standalone map' },
    'map.downloadMap': { es: 'Descargar mapa (.html)', en: 'Download map (.html)' },
    'map.fullMap': { es: 'Mapa completo', en: 'Full map' },
    'map.saveMap': { es: 'Guardar mapa', en: 'Save map' },
    'map.popupBlocked': {
      es: 'El navegador ha bloqueado la nueva pestaña. Use «Descargar mapa» en su lugar.',
      en: 'The browser blocked the new tab. Use "Download map" instead.'
    },
    'map.initFailed': { es: 'No se ha podido inicializar el mapa: {msg}', en: 'Map could not be initialised: {msg}' },

    /* ---------------------------------------------------------- report */
    'report.title': { es: 'Informe de texto', en: 'Text report' },
    'report.exportTitle': { es: 'Informe de texto y exportación', en: 'Text report & export' },
    'report.copy': { es: 'Copiar', en: 'Copy' },
    'report.copyReport': { es: 'Copiar informe', en: 'Copy report' },
    'report.copied': { es: 'Informe copiado al portapapeles.', en: 'Report copied to the clipboard.' },
    'report.clipboardFail': { es: 'No se ha podido acceder al portapapeles.', en: 'Could not access the clipboard.' },
    'report.downloadTxt': { es: 'Descargar .txt', en: 'Download .txt' },
    'report.downloadGpx': { es: 'Descargar .gpx', en: 'Download .gpx' },
    'report.saveGpx': { es: 'Guardar .gpx', en: 'Save .gpx' },
    'report.downloadJson': { es: 'Descargar .json', en: 'Download .json' },
    'report.print': { es: 'Imprimir', en: 'Print' },
    'report.header': { es: 'informe de ruta', en: 'route report' },
    'report.generated': { es: 'Generado', en: 'Generated' },
    'report.origin': { es: 'Origen', en: 'Origin' },
    'report.destination': { es: 'Destino', en: 'Destination' },
    'report.countries': { es: 'Países', en: 'Countries' },
    'report.sectionTime': { es: 'DISTANCIA Y TIEMPO', en: 'DISTANCE AND TIME' },
    'report.roadDistance': { es: 'Distancia por carretera', en: 'Road distance' },
    'report.avgSpeed': { es: 'Velocidad media camión', en: 'Average truck speed' },
    'report.pureDriving': { es: 'Conducción efectiva', en: 'Pure driving time' },
    'report.breaks': { es: 'Pausas obligatorias', en: 'Mandatory breaks' },
    'report.dailyRests': { es: 'Descansos diarios', en: 'Daily rest periods' },
    'report.totalTime': { es: 'TIEMPO TOTAL DE VIAJE', en: 'TOTAL TRIP TIME' },
    'report.departure': { es: 'Salida', en: 'Departure' },
    'report.arrival': { es: 'Llegada estimada', en: 'Estimated arrival' },
    'report.sectionCost': { es: 'ESTIMACIÓN DE COSTES', en: 'COST ESTIMATE' },
    'report.tollTotal': { es: 'Total peajes', en: 'Toll total' },
    'report.fuelEstimate': { es: 'Combustible estimado', en: 'Fuel estimate' },
    'report.totalCost': { es: 'COSTE TOTAL DEL VIAJE', en: 'TOTAL RUN COST' },
    'report.excludedNote': { es: 'excluido', en: 'excluded' },
    'report.sectionStops': { es: 'PARADAS DE DESCANSO SUGERIDAS (cada {interval} km)', en: 'SUGGESTED REST STOPS (every {interval} km)' },
    'report.noStops': { es: 'ninguna — ruta más corta que el intervalo de paradas', en: 'none — route shorter than the stop interval' },
    'report.noParking': { es: 'sin aparcamiento seguro en {radius} km', en: 'no safe parking within {radius} km' },
    'report.sectionLegal': { es: 'PARADAS LEGALES OBLIGATORIAS — Reglamento (CE) 561/2006', en: 'MANDATORY LEGAL STOPS — Regulation (EC) 561/2006' },
    'report.sectionChecks': { es: 'COMPROBACIONES DE CUMPLIMIENTO', en: 'COMPLIANCE CHECKS' },
    'report.sectionRegs': { es: 'NORMATIVA NACIONAL (las {n} principales por país)', en: 'NATIONAL REGULATIONS (top {n} per country)' },
    'report.sectionWarnings': { es: 'AVISOS', en: 'WARNINGS' },

    /* ---------------------------------------------------------- errors */
    'err.generic': { es: 'Error inesperado.', en: 'Unexpected error.' },
    'err.EMPTY_QUERY': { es: 'Introduzca una dirección de origen y una de destino.', en: 'Enter both an origin and a destination address.' },
    'err.EMPTY_ORIGIN': { es: 'Introduzca una dirección de origen.', en: 'Please enter an origin address.' },
    'err.EMPTY_DESTINATION': { es: 'Introduzca una dirección de destino.', en: 'Please enter a destination address.' },
    'err.NOT_FOUND': { es: 'Pruebe con una dirección más completa, por ejemplo «Calle Mayor 1, Madrid, España».', en: 'Try a more complete address, for example "Bahnhofstrasse 1, Munich, Germany".' },
    'err.NOT_FOUND_MSG': { es: 'No se ha encontrado ninguna ubicación para «{q}».', en: 'No location found for "{q}".' },
    'err.NO_ROUTE': { es: 'No existe ninguna ruta por carretera entre estos puntos. Las islas y los pasos marítimos necesitan un tramo en ferri.', en: 'No road route exists between these points. Sea crossings and islands need a ferry leg.' },
    'err.NO_ROUTE_MSG': { es: 'No se ha encontrado una ruta por carretera transitable entre estos dos puntos.', en: 'No drivable road route was found between these two points.' },
    'err.EMPTY_GEOMETRY': { es: 'El servicio de rutas ha devuelto una geometría vacía.', en: 'The routing service returned an empty route geometry.' },
    'err.TIMEOUT': { es: 'El servicio gratuito de rutas no ha respondido a tiempo. Espere un momento e inténtelo de nuevo.', en: 'The free routing service did not answer in time. Wait a moment and try again.' },
    'err.TIMEOUT_MSG': { es: 'La petición ha superado el tiempo de espera de {s} s.', en: 'The request timed out after {s} s.' },
    'err.NETWORK': { es: 'Sin conexión con el servicio de rutas. Compruebe la conexión a internet.', en: 'No connection to the routing service. Check the internet connection.' },
    'err.NETWORK_MSG': { es: 'Error de red: compruebe la conexión a internet e inténtelo de nuevo.', en: 'Network error — check the internet connection and try again.' },
    'err.HTTP': { es: 'Los servidores gratuitos OSRM y Nominatim tienen límites de uso. Espere un minuto y reintente.', en: 'The free OSRM / Nominatim demo servers are rate limited. Wait a minute and retry.' },
    'err.HTTP_MSG': { es: 'El servicio de rutas ha respondido con HTTP {code}.', en: 'The routing service replied with HTTP {code}.' },
    'err.CANCELLED': { es: 'Cálculo cancelado.', en: 'Calculation cancelled.' },
    'err.speedRange': { es: 'La velocidad media debe estar entre 1 y 130 km/h.', en: 'Average speed must be between 1 and 130 km/h.' },
    'err.weightRange': { es: 'La MMA debe estar entre 1 y 100 t.', en: 'Gross weight must be between 1 and 100 t.' },
    'err.fuelNegative': { es: 'Los valores de combustible no pueden ser negativos.', en: 'Fuel figures cannot be negative.' },

    /* -------------------------------------------------------- progress */
    'prog.start': { es: 'Iniciando…', en: 'Starting…' },
    'prog.data': { es: 'Cargando datos de peajes, aparcamientos y normativa…', en: 'Loading toll, parking and regulation data…' },
    'prog.origin': { es: 'Localizando la dirección de origen…', en: 'Locating the origin address…' },
    'prog.destination': { es: 'Localizando la dirección de destino…', en: 'Locating the destination address…' },
    'prog.route': { es: 'Solicitando la ruta por carretera a OSRM…', en: 'Requesting the road route from OSRM…' },
    'prog.time': { es: 'Aplicando los tiempos de conducción y descanso de la UE…', en: 'Applying EU driving and rest time rules…' },
    'prog.countries': { es: 'Analizando tramos por país {i} / {n}…', en: 'Analysing country segments {i} / {n}…' },
    'prog.tolls': { es: 'Estimando peajes y combustible…', en: 'Estimating tolls and fuel…' },
    'prog.stops': { es: 'Sugiriendo paradas y aparcamientos seguros…', en: 'Suggesting rest stops and safe parkings…' },
    'prog.legal': { es: 'Comprobando el cumplimiento de los tiempos de conducción…', en: 'Checking driving time compliance…' },
    'prog.regs': { es: 'Recopilando la normativa nacional…', en: 'Collecting national regulations…' },
    'prog.done': { es: 'Plan de ruta completado.', en: 'Route plan complete.' },

    /* -------------------------------------------------------- warnings */
    'warn.embeddedData': {
      es: 'Los datos se han leído de la copia integrada sin conexión (no se han podido descargar los ficheros JSON).',
      en: 'Datasets were read from the built-in offline copy (the JSON files could not be fetched).'
    },
    'warn.weekendDeparture': {
      es: 'La salida cae en fin de semana: en muchos países hay restricciones de circulación para vehículos pesados (normalmente del sábado por la tarde al domingo por la noche).',
      en: 'Departure falls on a weekend — HGV driving bans apply in many countries (typically Saturday afternoon to Sunday evening).'
    },
    'warn.weekendArrival': {
      es: 'La llegada estimada cae en fin de semana: compruebe las restricciones del país de destino y las ventanas de entrega.',
      en: 'Estimated arrival falls on a weekend — check destination-country driving bans and delivery windows.'
    },
    'warn.countryFallback': {
      es: 'La detección de país no estaba disponible; toda la ruta se ha atribuido a {code}. La cifra de peaje es una aproximación basta.',
      en: 'Country detection was unavailable; the whole route was attributed to {code}. The toll figure is a rough approximation.'
    },
    'warn.countryUnavailable': {
      es: 'La detección de país no estaba disponible, por lo que no se ha podido estimar el peaje.',
      en: 'Country detection was unavailable, so no toll estimate could be produced.'
    },
    'warn.samplesUnresolved': {
      es: '{failed} de {total} puntos de muestreo no se han podido atribuir a un país; su distancia queda excluida de la estimación de peaje.',
      en: '{failed} of {total} sample points could not be attributed to a country; their distance is excluded from the toll estimate.'
    },
    'warn.noTollRate': {
      es: 'No hay tarifa de peaje registrada para: {codes}. Esos kilómetros se valoran a cero.',
      en: 'No toll rate on file for: {codes}. Those kilometres are costed at zero.'
    },
    'warn.stopsWithoutParking': {
      es: '{n} parada(s) sugerida(s) no tienen aparcamiento seguro conocido en {radius} km en el conjunto de datos de muestra.',
      en: '{n} suggested stop(s) have no known safe parking within {radius} km in the sample dataset.'
    },
    'warn.weeklyRest': {
      es: 'El viaje supera los seis periodos de 24 h desde el último descanso semanal: debe planificarse un descanso semanal de 45 h.',
      en: 'The trip exceeds six 24-hour periods since the last weekly rest: a 45-hour weekly rest must be planned.'
    },
    'warn.weeklyDriving': {
      es: 'La conducción de este viaje ({h}) supera el límite semanal de 56 h: repártala entre varios conductores o semanas.',
      en: 'Driving time on this trip ({h}) exceeds the 56-hour weekly limit: split it between drivers or weeks.'
    },
    'warn.fortnightlyDriving': {
      es: 'La conducción de este viaje ({h}) supera el límite de 90 h en dos semanas consecutivas.',
      en: 'Driving time on this trip ({h}) exceeds the 90-hour limit over two consecutive weeks.'
    },

    /* ------------------------------------------------------ facilities */
    'fac.fenced': { es: 'vallado', en: 'fenced' },
    'fac.cctv': { es: 'videovigilancia', en: 'cctv' },
    'fac.patrol': { es: 'vigilancia', en: 'patrol' },
    'fac.showers': { es: 'duchas', en: 'showers' },
    'fac.restaurant': { es: 'restaurante', en: 'restaurant' },
    'fac.fuel': { es: 'combustible', en: 'fuel' },
    'fac.shop': { es: 'tienda', en: 'shop' },
    'fac.toilets': { es: 'aseos', en: 'toilets' },
    'fac.workshop': { es: 'taller', en: 'workshop' },
    'fac.customs': { es: 'aduana', en: 'customs' },
    'fac.24h': { es: '24 h', en: '24h' },
    'booking.no': { es: 'sin reserva', en: 'no booking' },
    'booking.recommended': { es: 'reserva recomendada', en: 'booking recommended' },
    'booking.required': { es: 'reserva obligatoria', en: 'booking required' },

    /* ------------------------------------------------------------ info */
    'info.about': { es: 'Acerca de', en: 'About' },
    'info.dataSource': { es: 'origen de los datos', en: 'data source' },
    'info.aboutText': {
      es: 'Rutas por carretera con el servidor de demostración OSRM y geocodificación con Nominatim de OpenStreetMap. Las tarifas de peaje, los aparcamientos seguros y la normativa nacional proceden de los conjuntos de datos editables de <code>data/</code>.',
      en: 'Road routing by the OSRM demo server, geocoding by OpenStreetMap Nominatim. Toll rates, safe parkings and national regulations come from the editable datasets in <code>data/</code>.'
    },
    'info.howTitle': { es: 'Cómo se calculan los tiempos', en: 'How the times are calculated' },
    'info.how1': { es: 'Tiempo de conducción = distancia / velocidad media del camión (70 km/h por defecto).', en: 'Driving time = distance / average truck speed (default 70 km/h).' },
    'info.how2': { es: 'Pausa de 45 minutos tras cada 4 h 30 min de conducción.', en: 'A 45-minute break after every 4h30 of driving.' },
    'info.how3': { es: 'Descanso diario de 11 horas tras cada 9 horas de conducción.', en: 'An 11-hour daily rest after every 9 hours of driving.' },
    'info.how4': { es: 'Paradas sugeridas cada 350 km, con aparcamientos seguros en 50 km.', en: 'Rest stops are suggested every 350 km, with safe parkings within 50 km.' },
    'info.links': { es: 'Enlaces', en: 'Links' },
    'info.openGuide': { es: 'Abrir la guía de usuario', en: 'Open the user guide' },
    'info.switchDesktop': { es: 'Cambiar a la versión de escritorio', en: 'Switch to the desktop version' },

    /* ----------------------------------------------------------- splash */
    'splash.detecting': { es: 'Detectando su dispositivo…', en: 'Detecting your device…' },
    'splash.reasonUrl': { es: 'Usando la versión indicada en la dirección', en: 'Using the version requested in the address bar' },
    'splash.reasonSaved': { es: 'Usando su elección recordada', en: 'Using your remembered choice' },
    'splash.reasonAuto': { es: 'Detectado automáticamente', en: 'Detected automatically' },
    'splash.version': { es: 'versión', en: 'version' },
    'splash.desktop': { es: 'Versión de escritorio', en: 'Desktop version' },
    'splash.mobile': { es: 'Versión móvil', en: 'Mobile version' },
    'splash.screen': { es: 'Pantalla {w} px', en: 'Screen {w} px' },
    'splash.touch': { es: 'entrada táctil', en: 'touch input' },
    'splash.pointer': { es: 'ratón', en: 'pointer input' },
    'splash.phone': { es: 'teléfono', en: 'phone' },
    'splash.tablet': { es: 'tableta', en: 'tablet' },
    'splash.computer': { es: 'ordenador', en: 'computer' },
    'splash.override': {
      es: 'Elija una versión arriba para forzarla o añada <code>?view=desktop</code> / <code>?view=mobile</code> al enlace.',
      en: 'Pick a version above to override, or add <code>?view=desktop</code> / <code>?view=mobile</code> to the link.'
    },
    'splash.noscript': {
      es: 'Se necesita JavaScript. Elija arriba la versión de escritorio o la versión móvil.',
      en: 'JavaScript is required. Choose the desktop or mobile version above.'
    }
  };

  var current = DEFAULT_LANG;
  var listeners = [];

  function available() { return ['es', 'en']; }

  function languageName(code) { return LANG_NAMES[code] || code; }

  /** Two-letter label for tight layouts such as the mobile header. */
  function languageShort(code) { return String(code || '').toUpperCase(); }

  /** Active language code. */
  function lang() { return current; }

  /** BCP-47 locale for Intl formatting. */
  function locale() { return LOCALES[current] || LOCALES[DEFAULT_LANG]; }

  function stored() {
    try {
      var value = localStorage.getItem(STORAGE_KEY);
      return (value === 'es' || value === 'en') ? value : null;
    } catch (e) {
      return null;
    }
  }

  /** Spanish is the product default; a stored choice always wins. */
  function detect() {
    return stored() || DEFAULT_LANG;
  }

  function set(code, silent) {
    if (!LOCALES[code]) return current;
    current = code;
    try { localStorage.setItem(STORAGE_KEY, code); } catch (e) { /* ignore */ }
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.setAttribute('lang', code);
    }
    if (!silent) listeners.forEach(function (fn) { try { fn(code); } catch (e) { /* ignore */ } });
    return current;
  }

  function onChange(fn) { if (typeof fn === 'function') listeners.push(fn); }

  /**
   * Translate a key, interpolating `{name}` placeholders.
   * Unknown keys return the key itself, which makes gaps obvious.
   */
  function t(key, params) {
    var entry = STRINGS[key];
    var text = entry ? (entry[current] != null ? entry[current] : entry.en) : key;
    if (params) {
      text = String(text).replace(/\{(\w+)\}/g, function (match, name) {
        return params[name] != null ? params[name] : match;
      });
    }
    return text;
  }

  /** True when the key exists in the dictionary. */
  function has(key) { return Object.prototype.hasOwnProperty.call(STRINGS, key); }

  /**
   * Pick the right language out of a `{es: ..., en: ...}` value, or return
   * the value unchanged when it is not language-keyed.
   */
  function pick(value) {
    if (value == null) return value;
    if (Array.isArray(value) || typeof value !== 'object') return value;
    if (value[current] != null) return value[current];
    if (value.en != null) return value.en;
    if (value.es != null) return value.es;
    return value;
  }

  /** Translate a dataset keyword such as a parking facility. */
  function term(prefix, value) {
    var key = prefix + '.' + String(value).toLowerCase();
    return has(key) ? t(key) : value;
  }

  /**
   * Apply translations to a DOM tree.
   *   data-i18n="key"                 -> textContent
   *   data-i18n-html="key"            -> innerHTML
   *   data-i18n-attr="placeholder:key;title:key"
   */
  function applyDom(root) {
    var scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    scope.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      el.innerHTML = t(el.getAttribute('data-i18n-html'));
    });
    scope.querySelectorAll('[data-i18n-attr]').forEach(function (el) {
      el.getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
        var index = pair.indexOf(':');
        if (index < 1) return;
        el.setAttribute(pair.slice(0, index).trim(), t(pair.slice(index + 1).trim()));
      });
    });
  }

  /** Initialise from storage (Spanish unless the user chose otherwise). */
  function init() {
    set(detect(), true);
    return current;
  }

  TRP.i18n = {
    STORAGE_KEY: STORAGE_KEY,
    DEFAULT_LANG: DEFAULT_LANG,
    STRINGS: STRINGS,
    available: available,
    languageName: languageName,
    languageShort: languageShort,
    lang: lang,
    locale: locale,
    detect: detect,
    set: set,
    onChange: onChange,
    t: t,
    has: has,
    pick: pick,
    term: term,
    applyDom: applyDom,
    init: init
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TRP.i18n;
})(typeof globalThis !== 'undefined' ? globalThis : this);
