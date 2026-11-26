/* RAILCORE — Instructor en cabina (modo aprendizaje).
 * Guía el arranque en frío paso a paso y da consejos según la situación.
 * Sólo lee el estado; nunca actúa por el jugador. */
(function (RC) {
  var U = RC.core.util, TR = RC.core.train;

  var STEPS = [
    { txt: 'Conecte las BATERÍAS', done: function (s) { return s.train.elec.battery; } },
    { txt: 'Introduzca la LLAVE DE CABINA', done: function (s) { return s.train.elec.cabKey; } },
    { txt: 'Arranque el COMPRESOR AUXILIAR hasta ≥ 4,5 bar en el depósito del pantógrafo', done: function (s) { return s.train.air.panto >= 4.5 || s.train.elec.pantoPos > 0; } },
    { txt: 'Suba el PANTÓGRAFO', done: function (s) { return s.train.elec.pantoPos >= 1; } },
    { txt: 'Cierre el DISYUNTOR (necesita catenaria y manipulador fuera de tracción)', done: function (s) { return s.train.elec.disyuntor; } },
    { txt: 'Compresor principal en AUTO: espere ≥ 6 bar en el depósito principal', done: function (s) { return s.train.air.mr >= 6 && s.train.elec.mainCompSwitch === 'auto'; } },
    { txt: 'Conecte el ASFA (botón CONEXIÓN) y espere el autotest', done: function (s) { return s.asfa.connected; } },
    { txt: 'Encienda los FAROS (cruce)', done: function (s) { return s.train.controls.headlights > 0; } },
    { txt: 'Abra las puertas del lado DERECHO para que suban los viajeros', done: function (s) { return s.stations[0].boarded > 0 || s.nextStation > 0; } },
    { txt: 'Afloje el FRENO DE ESTACIONAMIENTO', done: function (s) { return !s.train.air.parking; } },
    { txt: 'Comunique «tren preparado» por radio', done: function (s) { return !!s.radioFlags.ready; } },
    { txt: 'Inversor ADELANTE', done: function (s) { return s.train.controls.reverser === 1; } },
    { txt: 'A la hora de salida: cierre puertas, señal de salida abierta y TRACCIÓN', done: function (s) { return s.nextStation > 0; } }
  ];

  function tip(sim) {
    var t = sim.train, a = sim.asfa;
    if (t.emergency.active) {
      if (!TR.stopped(t)) return 'Freno de emergencia aplicado: espere a que el tren se detenga.';
      if (a.emergency) return 'Tren parado: pulse REARME FRENO del ASFA (E) y lleve el manipulador a una posición de freno.';
      if (sim.vigil.emergency) return 'Pulse VIGILANCIA (Espacio) para rearmar el hombre muerto y lleve el manipulador a freno.';
      return 'Lleve el manipulador a una posición de freno (F1–F7) para rearmar la emergencia.';
    }
    if (a.pendingRec) return '¡Baliza ASFA! Pulse RECONOCER (Q) antes de 3 segundos.';
    if (sim.vigil.warning) return 'Hombre muerto: pulse VIGILANCIA (Espacio) ya.';
    if (a.control && a.control.code === 'L1') return 'Anuncio de parada: la siguiente señal está en rojo. Reduzca a ' + a.control.vFinal + ' km/h y prepárese para parar.';
    if (a.control && a.control.code === 'L7') return 'Señal en rojo a 300 m: no supere ' + Math.round(a.limit_kmh) + ' km/h y pare antes de ella.';
    var i = sim.nextStation;
    if (sim.atStation >= 0) {
      var st = sim.line.stations[sim.atStation], tt = sim.timetable[sim.atStation], ss = sim.stations[sim.atStation];
      var pend = (ss.toBoard - ss.boarded) + (ss.toAlight - ss.alighted);
      var side = st.side === 'izquierda' ? 'IZQUIERDA' : 'DERECHA';
      if (tt.dep === null) return 'Final de trayecto: abra puertas (' + side + ') para que bajen todos los viajeros.';
      if (pend > 0 && t.doors.left + t.doors.right === 0) return 'Abra las puertas del lado ' + side + ' (andén a la ' + st.side + ').';
      if (pend > 0) return 'Intercambio de viajeros: quedan ' + pend + '. No cierre todavía.';
      if (sim.clock < tt.dep - 10) return 'Espere a la hora de salida (' + U.fmtClock(tt.dep) + ').';
      if (!TR.doorsClosed(t)) return 'Hora de salida: cierre puertas (C).';
      var sig = sim.signals.filter(function (s) { return s.x > t.x; })[0];
      if (sig && sig.aspect === 'rojo') return 'Señal de salida en rojo: espere a que se abra.';
      if (t.controls.reverser !== 1) return 'Ponga el inversor ADELANTE (R).';
      return 'Vía libre: lleve el manipulador a tracción (W).';
    }
    if (i < sim.line.stations.length) {
      var nx = sim.line.stations[i], d = nx.stopX - t.x, v = U.kmh(Math.abs(t.v));
      var brakeDist = Math.pow(Math.abs(t.v), 2) / (2 * 0.7);
      if (d > 0 && d < brakeDist + 250 && v > 25) return 'Próxima parada ' + nx.name + ' a ' + Math.round(d) + ' m: empiece a frenar (S).';
      if (d > 0 && d < 300) return 'Pare con la cabina junto al cartelón «P» de ' + nx.name + ' (faltan ' + Math.round(d) + ' m).';
    }
    var lim = RC.core.timetable.trackLimitKmh(sim.line, t.x, sim.spec.length_m);
    if (U.kmh(Math.abs(t.v)) > lim + 2) return 'Exceso de velocidad: la vía está limitada a ' + lim + ' km/h.';
    return '';
  }

  function render(root, sim, show) {
    if (!show) { if (root._h !== '') { root.innerHTML = ''; root._h = ''; } return; }
    var html = '';
    var cold = sim.scenario === 'frio';
    if (cold && sim.nextStation === 0) {
      var cur = -1;
      STEPS.forEach(function (s, i) {
        var d = s.done(sim);
        if (!d && cur < 0) cur = i;
        html += '<div class="step ' + (d ? 'done' : i === cur ? 'cur' : '') + '">' + s.txt + '</div>';
      });
    }
    var tp = tip(sim);
    if (tp) html += '<div class="tip">' + tp + '</div>';
    if (!html) html = '<div class="tip">Todo en orden. Vigile señales y horario.</div>';
    if (root._h !== html) { root.innerHTML = html; root._h = html; }
  }

  RC.ui.instructor = { render: render, tip: tip, STEPS: STEPS };
})(globalThis.RC);
