/* RAILCORE — ASFA Digital simplificado.
 * Lógica de seguridad DETERMINISTA y aislada: no sabe nada de la interfaz,
 * del sonido ni de la IA. Recibe balizas, pulsadores y velocidad; devuelve
 * si hay que aplicar el freno de emergencia y qué mostrar.
 *
 * Simplificaciones (documentadas en docs/ASFA.md):
 *  - Sólo se modelan L1 (anuncio de parada), L3 (vía libre), L7 (previa de
 *    señal en parada) y L8 (señal en parada).
 *  - Las curvas de control son rectas entre velocidad inicial y final. */
(function (RC) {
  function create(params) {
    return {
      p: params,
      connected: false,
      testing: 0,                 // segundos restantes de autotest
      emergency: false,
      emergencyReason: '',
      pendingRec: null,           // {code, remaining}
      control: null,              // {code, vStart, vFinal, T, elapsed}
      rebaseRemaining: 0,
      warning: false,
      lastBeacon: null,
      limit_kmh: params.vmax_kmh,
      events: []
    };
  }

  function emit(a, type, msg, severity) { a.events.push({ type: type, msg: msg, severity: severity || 'info' }); }

  function trip(a, reason) {
    if (a.emergency) return;
    a.emergency = true;
    a.emergencyReason = reason;
    a.pendingRec = null;
    emit(a, 'asfa-emergency', 'ASFA: FRENADO DE EMERGENCIA — ' + reason, 'alarm');
  }

  function currentLimit(a) {
    var lim = a.p.vmax_kmh;
    if (a.control) {
      var c = a.control;
      var f = Math.min(1, c.elapsed / c.T);
      lim = Math.min(lim, c.vStart + (c.vFinal - c.vStart) * f);
    }
    return lim;
  }

  /* Pulsadores del panel ASFA. */
  function button(a, name, ctx) {
    ctx = ctx || {};
    switch (name) {
      case 'conex':
        if (a.connected || a.testing > 0) {
          if (!ctx.stopped) { emit(a, 'asfa', 'ASFA: no se puede desconectar en marcha', 'warn'); return; }
          a.connected = false; a.testing = 0; a.control = null; a.pendingRec = null; a.emergency = false;
          emit(a, 'asfa', 'ASFA desconectado');
        } else {
          if (!ctx.power) { emit(a, 'asfa', 'ASFA: sin alimentación (habilite la cabina)', 'warn'); return; }
          a.testing = a.p.connectTest_s;
          emit(a, 'asfa-test', 'ASFA: autotest en curso…');
        }
        break;
      case 'recAnPar':
        if (a.pendingRec) {
          var code = a.pendingRec.code;
          a.pendingRec = null;
          emit(a, 'asfa-rec', 'ASFA: reconocido ' + a.p.codes[code].name);
        }
        break;
      case 'rebase':
        if (!a.connected) return;
        a.rebaseRemaining = a.p.rebaseWindow_s;
        emit(a, 'asfa', 'ASFA: rebase autorizado (' + a.p.rebaseWindow_s + ' s)', 'warn');
        break;
      case 'rearme':
        if (!a.emergency) return;
        if (!ctx.stopped) { emit(a, 'asfa', 'ASFA: el rearme del freno exige tren parado', 'warn'); return; }
        a.emergency = false; a.emergencyReason = '';
        emit(a, 'asfa', 'ASFA: freno rearmado');
        break;
    }
  }

  /* Paso sobre una baliza. */
  function beacon(a, code, vKmh) {
    if (!a.connected) return;
    a.lastBeacon = code;
    emit(a, 'asfa-beacon', 'Baliza ' + code + ' (' + a.p.codes[code].name + ')');
    switch (code) {
      case 'L3':
        a.control = null;
        a.pendingRec = null;
        break;
      case 'L1':
        a.pendingRec = { code: 'L1', remaining: a.p.recognitionTime_s };
        a.control = { code: 'L1', vStart: a.p.vmax_kmh, vFinal: a.p.anuncioParada.vFinal_kmh, T: a.p.anuncioParada.time_s, elapsed: 0 };
        break;
      case 'L7':
        var pp = a.p.previaParada;
        if (vKmh > pp.vCheck_kmh) { trip(a, 'velocidad ' + Math.round(vKmh) + ' km/h en baliza previa (máx. ' + pp.vCheck_kmh + ')'); break; }
        a.pendingRec = { code: 'L7', remaining: a.p.recognitionTime_s };
        a.control = { code: 'L7', vStart: Math.min(pp.vCheck_kmh, currentLimit(a)), vFinal: pp.vFinal_kmh, T: pp.time_s, elapsed: 0 };
        break;
      case 'L8':
        if (a.rebaseRemaining > 0) {
          emit(a, 'asfa', 'ASFA: rebase de señal en parada autorizado', 'warn');
          a.control = { code: 'L8', vStart: 30, vFinal: 30, T: 1, elapsed: 0 };
        } else {
          trip(a, 'rebase de señal en parada');
        }
        break;
    }
  }

  function step(a, dt, vKmh) {
    if (a.testing > 0) {
      a.testing -= dt;
      if (a.testing <= 0) { a.testing = 0; a.connected = true; emit(a, 'asfa-ok', 'ASFA conectado — ' + a.p.trainType); }
    }
    if (!a.connected) { a.warning = false; a.limit_kmh = a.p.vmax_kmh; return; }
    if (a.rebaseRemaining > 0) a.rebaseRemaining = Math.max(0, a.rebaseRemaining - dt);
    if (a.control) a.control.elapsed += dt;
    if (a.pendingRec) {
      a.pendingRec.remaining -= dt;
      if (a.pendingRec.remaining <= 0) trip(a, 'falta de reconocimiento de ' + a.p.codes[a.pendingRec.code].name.toLowerCase());
    }
    var lim = currentLimit(a);
    a.limit_kmh = lim;
    a.warning = vKmh > lim - a.p.warnMargin_kmh;
    if (vKmh > lim + 0.5) trip(a, 'exceso de velocidad (' + Math.round(vKmh) + ' > ' + Math.round(lim) + ' km/h)');
  }

  RC.core.asfa = { create: create, button: button, beacon: beacon, step: step, currentLimit: currentLimit };
})(globalThis.RC);
