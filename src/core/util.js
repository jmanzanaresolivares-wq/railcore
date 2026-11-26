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
  RC.core.util = U;
})(globalThis.RC);
