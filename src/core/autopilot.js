/* RAILCORE — Maquinista automático de referencia.
 * Se usa en las pruebas (demuestra que el servicio completo es conducible
 * respetando señales, ASFA, velocidades y paradas) y como modo "demostración".
 * Sólo actúa mediante órdenes, igual que un jugador. */
(function (RC) {
  var U = RC.core.util, TR = RC.core.train, TT = RC.core.timetable, S = RC.core.sim;
  var B = 0.55; // deceleración de planificación (m/s²)

  var COLD_START = [
    { type: 'battery', on: true },
    { type: 'cabKey', on: true },
    { type: 'cabLight', on: true },
    { type: 'auxCompressor', on: true },
    { wait: function (sim) { return sim.train.air.panto >= 5.0; } },
    { type: 'auxCompressor', on: false },
    { type: 'panto', up: true },
    { wait: function (sim) { return sim.train.elec.pantoPos >= 1; } },
    { type: 'disyuntor', close: true },
    { type: 'mainCompressor', mode: 'auto' },
    { type: 'asfa:conex' },
    { type: 'headlights', mode: 1 },
    { wait: function (sim) { return sim.train.air.mr >= 6.5 && sim.asfa.connected; } },
    { type: 'parking', apply: false },
    { type: 'reverser', pos: 1 },
    { type: 'radioReady' }
  ];

  function create(opts) {
    return { script: (opts && opts.cold) ? COLD_START.slice() : [{ type: 'reverser', pos: 1 }, { type: 'radioReady' }], lastVigil: 0, phase: 'run' };
  }

  function nextSignalAhead(sim, x) {
    for (var i = 0; i < sim.signals.length; i++) if (sim.signals[i].x > x + 1) return sim.signals[i];
    return null;
  }

  function targetSpeed(sim) {
    var t = sim.train, x = t.x, L = sim.spec.length_m;
    var cons = [];
    // Velocidad de la vía: actual y cambios por delante
    var cur = TT.trackLimitKmh(sim.line, x, L);
    cons.push(U.ms(cur - 3));
    sim.line.speedLimits.forEach(function (s) {
      if (s.from > x && s.from - x < 2500) cons.push(Math.sqrt(Math.pow(U.ms(s.kmh - 3), 2) + 2 * B * (s.from - x - 10)));
    });
    // Señal en rojo por delante
    var sig = nextSignalAhead(sim, x);
    if (sig && sig.aspect === 'rojo') {
      var d = sig.x - 20 - x;
      cons.push(Math.sqrt(2 * B * Math.max(0, d)));
      var dp = sig.x - sim.line.previaOffset_m - 10 - x;
      if (dp > 0) cons.push(Math.sqrt(Math.pow(U.ms(52), 2) + 2 * B * dp));
    }
    // Parada en estación
    var i = sim.nextStation;
    if (i < sim.line.stations.length && !sim.stations[i].arrived) {
      var ds = sim.line.stations[i].stopX - 2 - x;
      cons.push(ds > 0 ? Math.sqrt(2 * 0.45 * ds) : 0);
    }
    // Curva de control ASFA
    if (sim.asfa.connected) {
      cons.push(U.ms(sim.asfa.limit_kmh - 6));
      if (sim.asfa.control) cons.push(U.ms(sim.asfa.control.vFinal - 6));
    }
    return Math.max(0, Math.min.apply(null, cons));
  }

  function act(ap, sim) {
    var t = sim.train, cmd = function (c) { S.command(sim, c); };
    // Guion de preparación
    while (ap.script.length) {
      var s = ap.script[0];
      if (s.wait) { if (!s.wait(sim)) return; ap.script.shift(); continue; }
      cmd(ap.script.shift());
      return;
    }
    // ASFA: reconocer balizas
    if (sim.asfa.pendingRec) cmd({ type: 'asfa:recAnPar' });
    if (sim.asfa.emergency && TR.stopped(t)) cmd({ type: 'asfa:rearme' });
    if (t.emergency.active) { if (t.controls.lever !== -7) cmd({ type: 'lever', pos: -7 }); return; }
    // Hombre muerto
    if (sim.clock - ap.lastVigil > 20) { ap.lastVigil = sim.clock; cmd({ type: 'vigil' }); }

    // Estación
    if (sim.atStation >= 0) {
      var i = sim.atStation, st = sim.line.stations[i], ss = sim.stations[i], tt = sim.timetable[i];
      var side = st.side === 'izquierda' ? 'left' : 'right';
      var cmdKey = side === 'left' ? 'cmdLeft' : 'cmdRight';
      var pending = (ss.toBoard - ss.boarded) + (ss.toAlight - ss.alighted);
      if (TR.stopped(t) && t.doors[cmdKey] === 'close' && !ss.doorsDone && (pending > 0 || tt.dep === null)) {
        if (t.controls.lever > -3) cmd({ type: 'lever', pos: -4 });
        cmd({ type: 'doors', side: side, action: 'open' });
        return;
      }
      if (t.doors[cmdKey] === 'open' && pending === 0 && tt.dep !== null && sim.clock >= tt.dep - 8) {
        ss.doorsDone = true;
        cmd({ type: 'doors', action: 'close' });
        return;
      }
      if (t.doors[cmdKey] === 'open' || !TR.doorsClosed(t)) return;
      if (tt.dep === null) return;
      var sig = nextSignalAhead(sim, t.x);
      if (sig && sig.aspect === 'rojo') { if (t.controls.lever > -3) cmd({ type: 'lever', pos: -4 }); return; }
    }

    var v = Math.abs(t.v), target = targetSpeed(sim);
    var aDes = U.clamp((target - v) / 2.5, -1.0, 0.8);
    var lever;
    if (target < 0.05 && v < 0.3) lever = -5;
    else if (aDes > 0.05) lever = Math.max(1, Math.ceil(aDes / 0.8 * 6));
    else if (aDes < -0.12) lever = -Math.min(7, Math.ceil(-aDes / 1.0 * 7));
    else lever = 0;
    if (lever !== t.controls.lever) cmd({ type: 'lever', pos: lever });
  }

  RC.core.autopilot = { create: create, act: act, targetSpeed: targetSpeed, COLD_START: COLD_START };
})(globalThis.RC);
