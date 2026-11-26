/* RAILCORE — Horario (determinista) y perfil de la vía. */
(function (RC) {
  var U = RC.core.util;

  /* Velocidad máxima para todo el tren: la más restrictiva entre cola y cabeza. */
  function trackLimitKmh(line, xHead, length) {
    var lim = Infinity;
    var xs = [xHead, xHead - (length || 0)];
    line.speedLimits.forEach(function (s) {
      if (s.to > xs[1] && s.from <= xs[0]) lim = Math.min(lim, s.kmh);
    });
    return lim === Infinity ? 30 : lim;
  }

  function gradeAt(line, x) {
    var g = U.rangeAt(line.gradients, x);
    return g ? g.permil : 0;
  }

  function curvatureAt(line, x) {
    var c = U.rangeAt(line.curves, x);
    return c ? 1 / c.radius : 0;
  }

  /* Próximo cambio de velocidad máxima por delante de x (dentro de `range`). */
  function nextLimitChange(line, x, range) {
    var cur = U.rangeAt(line.speedLimits, x);
    for (var i = 0; i < line.speedLimits.length; i++) {
      var s = line.speedLimits[i];
      if (s.from > x && s.from - x <= range && (!cur || s.kmh !== cur.kmh)) return { x: s.from, kmh: s.kmh, dist: s.from - x };
    }
    return null;
  }

  /* Tiempo de marcha estimado entre dos puntos, con márgenes (para el horario). */
  function runTime(line, x0, x1) {
    var t = 0, step = 50, vmax = 0;
    for (var x = x0; x < x1; x += step) {
      var lim = trackLimitKmh(line, x, 0);
      vmax = Math.max(vmax, lim);
      t += step / U.ms(lim * 0.92);
    }
    var v = U.ms(vmax * 0.92);
    t += v / (2 * 0.45) + v / (2 * 0.55);   // pérdidas por arranque y frenado
    return Math.ceil((t + 5) / 15) * 15;   // margen y redondeo a 15 s
  }

  /* Genera el horario del servicio: [{id, name, arr, dep}] en segundos del día. */
  function build(line, offset_s, extraDwell) {
    offset_s = offset_s || 0;
    extraDwell = extraDwell || {};
    var out = [];
    var t = U.parseClock(line.firstDeparture) + offset_s;
    line.stations.forEach(function (st, i) {
      var arr = null, dep = null;
      if (i > 0) {
        t += runTime(line, line.stations[i - 1].stopX, st.stopX);
        arr = t;
      }
      if (i < line.stations.length - 1) {
        if (i > 0) t += line.dwell_s + (extraDwell[st.id] || 0);
        dep = t;
      }
      out.push({ id: st.id, name: st.name, x: st.stopX, arr: arr, dep: dep });
    });
    return out;
  }

  RC.core.timetable = {
    build: build, runTime: runTime, trackLimitKmh: trackLimitKmh,
    gradeAt: gradeAt, curvatureAt: curvatureAt, nextLimitChange: nextLimitChange
  };
})(globalThis.RC);
