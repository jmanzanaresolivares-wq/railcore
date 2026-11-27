/* Utilidades puras (sin DOM). */
(function (RC) {
  var U = {};
  U.clamp = function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; };
  /* Acerca `v` hacia `target` con una velocidad máxima `rate` por segundo. */
  U.approach = function (v, target, rate, dt) {
    var d = target - v, m = rate * dt;
    if (d > m) return v + m;
    if (d < -m) return v - m;
    return target;
  };
  /* Busca en una lista de tramos {from,to,...} el que contiene x. */
  U.rangeAt = function (list, x) {
    for (var i = 0; i < list.length; i++) {
      if (x >= list[i].from && x < list[i].to) return list[i];
    }
    return null;
  };
  U.kmh = function (ms) { return ms * 3.6; };
  U.ms = function (kmh) { return kmh / 3.6; };
  U.parseClock = function (s) {
    var p = s.split(':').map(Number);
    return p[0] * 3600 + p[1] * 60 + (p[2] || 0);
  };
  U.fmtClock = function (t) {
    t = Math.floor(((t % 86400) + 86400) % 86400);
    var h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  };
  U.fmtKm = function (x) { return 'PK ' + (x / 1000).toFixed(3).replace('.', '+'); };
  U.fmtDelay = function (s) {
    var sign = s >= 0 ? '+' : '−'; s = Math.abs(Math.round(s));
    return sign + Math.floor(s / 60) + ':' + ((s % 60) < 10 ? '0' : '') + (s % 60);
  };
  /* Generador pseudoaleatorio determinista (mulberry32). */
  U.rng = function (seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  /* Posición del sol en Sevilla (37,39° N; 5,98° O) con la hora oficial peninsular, para un día
   * del año (por defecto el 331, finales de noviembre). Fórmulas de la NOAA simplificadas.
   * Devuelve elevación y acimut en grados (acimut desde el norte, en sentido horario). */
  U.sun = function (clock, doy) {
    var D = Math.PI / 180, lat = 37.39 * D, lon = -5.98;
    doy = doy || 331;
    var tz = (doy > 87 && doy < 301) ? 2 : 1;                 // horario de verano aproximado
    var t = ((clock % 86400) + 86400) % 86400 / 60;           // minutos del día (hora local)
    var g = 2 * Math.PI / 365 * (doy - 1 + (t / 60 - tz - 12) / 24);
    var eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    var decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    var ha = ((t + eqt + 4 * lon - 60 * tz) / 4 - 180) * D;
    var cz = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
    var el = 90 - Math.acos(Math.max(-1, Math.min(1, cz))) / D;
    var az = (180 + Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)) / D) % 360;
    if (el > -1) el += 0.57 * Math.exp(-Math.max(0, el) / 2.5);   // refracción cerca del horizonte (aprox.)
    return { el: el, az: az };
  };
  U.sunElevation = function (clock) { return U.sun(clock).el; };
  U.sunAzimuth = function (clock) { return U.sun(clock).az; };
  /* Temperatura exterior aproximada en Sevilla a finales de noviembre (°C). [aprox.]
   * Mínima ~8 °C hacia las 07:45 y máxima ~19 °C hacia las 15:00. */
  U.outsideTemp = function (clock) {
    var tMin = U.parseClock('07:45:00'), tMax = U.parseClock('15:00:00'), lo = 8, hi = 19;
    var c = ((clock % 86400) + 86400) % 86400, f;
    if (c >= tMin && c <= tMax) f = (c - tMin) / (tMax - tMin);                   // subiendo
    else f = 1 - ((c - tMax + 86400) % 86400) / (86400 - (tMax - tMin));          // bajando
    return lo + (hi - lo) * (0.5 - 0.5 * Math.cos(Math.PI * f));
  };
  RC.core.util = U;
})(globalThis.RC);
