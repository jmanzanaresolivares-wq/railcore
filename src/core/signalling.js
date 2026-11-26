/* RAILCORE — Señalización: bloqueo automático, señales de 3 aspectos,
 * balizas ASFA y tren precedente (tráfico IA determinista).
 * Lógica determinista: el aspecto depende sólo de la ocupación y del horario. */
(function (RC) {
  var U = RC.core.util;

  function buildSignals(line) {
    var sig = [], st = line.stations, n = st.length;
    st.forEach(function (s, i) {
      if (i > 0) sig.push({ kind: 'entrada', x: s.stopX - line.entrySignalOffset_m, station: i, name: 'E ' + s.id });
      if (i < n - 1) sig.push({ kind: 'salida', x: s.stopX + line.exitSignalOffset_m, station: i, name: 'S ' + s.id });
      else sig.push({ kind: 'fin', x: s.stopX + 70, station: i, name: 'Fin ' + s.id });
    });
    sig.sort(function (a, b) { return a.x - b.x; });
    // Señales de bloqueo intermedias en tramos largos
    var out = [];
    for (var i = 0; i < sig.length; i++) {
      out.push(sig[i]);
      var nx = sig[i + 1];
      if (sig[i].kind === 'salida' && nx) {
        var gap = nx.x - sig[i].x;
        var k = Math.ceil(gap / line.signalSpacing_m) - 1;
        for (var j = 1; j <= k; j++) {
          var x = Math.round(sig[i].x + gap * j / (k + 1));
          out.push({ kind: 'bloqueo', x: x, station: -1, name: 'B ' + (x / 1000).toFixed(1) });
        }
      }
    }
    out.forEach(function (s, idx) { s.idx = idx; s.aspect = 'rojo'; s.cleared = false; });
    return out;
  }

  function buildBeacons(line, signals) {
    var b = [];
    signals.forEach(function (s) {
      b.push({ x: s.x - line.previaOffset_m, sig: s.idx, kind: 'previa' });
      b.push({ x: s.x, sig: s.idx, kind: 'señal' });
    });
    b.sort(function (a, c) { return a.x - c.x; });
    return b;
  }

  /* ---------- Tren precedente ---------- */
  function createGhost(line, timetable) {
    return { number: line.precedingTrain.number, length: line.precedingTrain.length_m, tt: timetable, x: -1e9, v: 0, state: 'previo', active: true };
  }

  function smooth(f) { return f * f * (3 - 2 * f); }

  function ghostPositionAt(ghost, clock) {
    var tt = ghost.tt;
    if (clock < tt[0].dep) return { x: tt[0].x, state: 'en ' + tt[0].name, active: true };
    for (var i = 0; i < tt.length - 1; i++) {
      var a = tt[i], b = tt[i + 1];
      if (clock >= a.dep && clock < b.arr) {
        var f = (clock - a.dep) / (b.arr - a.dep);
        return { x: a.x + (b.x - a.x) * smooth(f), state: 'circulando hacia ' + b.name, active: true };
      }
      if (b.dep !== null && clock >= b.arr && clock < b.dep) return { x: b.x, state: 'en ' + b.name, active: true };
    }
    // Llega a Utrera y se aparta a otra vía: deja de ocupar el itinerario
    return { x: tt[tt.length - 1].x, state: 'apartado en ' + tt[tt.length - 1].name, active: false };
  }

  function updateGhost(ghost, clock, dt) {
    var p = ghostPositionAt(ghost, clock);
    ghost.v = dt > 0 ? Math.max(0, (p.x - ghost.x) / dt) : 0;
    if (ghost.x < -1e8) ghost.v = 0;
    ghost.x = p.x; ghost.state = p.state; ghost.active = p.active;
  }

  /* ---------- Aspectos ---------- */
  function blockOccupied(signals, k, segs) {
    var x0 = signals[k].x, x1 = k + 1 < signals.length ? signals[k + 1].x : Infinity;
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (s.head > x0 && s.tail < x1) return true;
    }
    return false;
  }

  /* ctx: { ghost, player:{x,length}, clearSalida(sigIdx) → bool } */
  function updateAspects(signals, ctx) {
    var segs = [{ head: ctx.player.x, tail: ctx.player.x - ctx.player.length }];
    var ghostSegs = ctx.ghost && ctx.ghost.active ? [{ head: ctx.ghost.x, tail: ctx.ghost.x - ctx.ghost.length }] : [];
    for (var k = signals.length - 1; k >= 0; k--) {
      var s = signals[k], asp;
      var next = signals[k + 1];
      var occupiedGhost = blockOccupied(signals, k, ghostSegs);
      var occupiedPlayer = blockOccupied(signals, k, segs);
      if (s.kind === 'fin') asp = 'rojo';
      else if (occupiedGhost || occupiedPlayer) asp = 'rojo';
      else if (s.kind === 'salida' && !ctx.clearSalida(s)) asp = 'rojo';
      else if (next && next.aspect === 'rojo') asp = 'amarillo';
      else asp = 'verde';
      s.aspect = asp;
    }
  }

  function beaconCode(beacon, signal) {
    if (beacon.kind === 'previa') return signal.aspect === 'rojo' ? 'L7' : 'L3';
    if (signal.aspect === 'rojo') return 'L8';
    if (signal.aspect === 'amarillo') return 'L1';
    return 'L3';
  }

  RC.core.signalling = {
    buildSignals: buildSignals, buildBeacons: buildBeacons,
    createGhost: createGhost, updateGhost: updateGhost, ghostPositionAt: ghostPositionAt,
    updateAspects: updateAspects, beaconCode: beaconCode
  };
})(globalThis.RC);
