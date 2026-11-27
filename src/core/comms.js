/* RAILCORE — Comunicaciones de cabina (núcleo DETERMINISTA):
 *  - Megafonía (PA) a los viajeros: próxima estación, cierre de puertas, bienvenida,
 *    retraso y final de trayecto. El texto se muestra en pantalla y la voz lo lee.
 *  - Radio tren-tierra: canal, llamada al Puesto de Mando con respuestas
 *    preparadas según la situación del tren y llamada de emergencia.
 *  - Indicador de destino y número de tren (los datos quedan en sim.service para
 *    que el rótulo exterior del tren pueda usarlos).
 * Las respuestas llegan con retardos fijos de tiempo de simulación: la misma
 * secuencia de órdenes produce siempre las mismas conversaciones. */
(function (RC) {
  var U = RC.core.util, TR = RC.core.train;

  /* Canales tren-tierra por zona de cobertura (ficticios para el prototipo) [Verificar] */
  var CHANNELS = 8;
  var REPLY_DELAY_S = 2.5, NO_ANSWER_S = 6, TALK_S = 7;
  var NON_SERVICE = ['Sin servicio', 'Tren especial'];

  function trainNo(sim) { return String(sim.line.trainNumber).split(' ')[0]; }
  function pmName() { return 'Puesto de Mando'; }
  function shortStation(n) { return String(n); }

  /* Zonas de radio: hasta Dos Hermanas canal 3; desde allí hasta Utrera canal 4. */
  function zones(line) {
    var dh = null;
    line.stations.forEach(function (s) { if (s.id === 'DH') dh = s; });
    var cut = dh ? dh.stopX + 400 : line.stations[Math.floor(line.stations.length / 2)].stopX;
    return [{ from: -Infinity, to: cut, channel: 3, name: 'Sevilla – Dos Hermanas' }, { from: cut, to: Infinity, channel: 4, name: 'Dos Hermanas – Utrera' }];
  }
  function zoneAt(sim, x) {
    var z = sim.comms.zones;
    for (var i = 0; i < z.length; i++) if (x >= z[i].from && x < z[i].to) return z[i];
    return z[z.length - 1];
  }

  function destinations(line) {
    var names = line.stations.map(function (s) { return s.name; }).reverse();
    return names.concat(NON_SERVICE);
  }
  function numbers(line, own) {
    var list = [];
    var deps = line.timetableReal && line.timetableReal.departures;
    if (deps) deps.forEach(function (d) { var n = String(d.number); if (list.indexOf(n) < 0) list.push(n); });
    if (list.indexOf(own) < 0) list.push(own);
    list.sort();
    return list;
  }

  function create(sim, opts) {
    opts = opts || {};
    var line = sim.line, own = trainNo(sim), dl = destinations(line);
    sim.comms = {
      zones: zones(line), channel: 3, zone: 3,
      state: 'reposo', stateUntil: 0, pending: [], emergency: false,
      last: null, calls: 0
    };
    sim.pa = { active: null, last: null, count: {} };
    sim.service = {
      number: own, expectedNumber: own,
      dest: opts.cold ? NON_SERVICE[0] : line.stations[line.stations.length - 1].name,
      expectedDest: line.stations[line.stations.length - 1].name,
      destList: dl, numberList: numbers(line, own)
    };
    sim.comms.zone = zoneAt(sim, sim.train.x).channel;
  }

  /* ---------- Megafonía ---------- */
  function nextStopIndex(sim) {
    var i = sim.atStation >= 0 ? sim.atStation + 1 : sim.nextStation;
    return Math.min(i, sim.line.stations.length - 1);
  }
  function paText(sim, kind) {
    var line = sim.line, n = line.stations.length, svc = sim.service;
    switch (kind) {
      case 'next': {
        var i = nextStopIndex(sim), st = line.stations[i];
        if (i === n - 1) return 'Próxima estación: ' + st.name + ', final de trayecto. Salida por el lado ' + (st.side === 'izquierda' ? 'izquierdo' : 'derecho') + '.';
        return 'Próxima estación: ' + st.name + '. Salida por el lado ' + (st.side === 'izquierda' ? 'izquierdo' : 'derecho') + '.';
      }
      case 'doors': return 'Atención: cierre de puertas. Por favor, no entorpezcan el cierre.';
      case 'welcome': return 'Bienvenidos al tren de Cercanías con destino ' + svc.dest + '. Les deseamos un buen viaje.';
      case 'delay': {
        var d = delayNow(sim);
        if (d < 90) return 'Les informamos de que este tren circula según su horario previsto.';
        return 'Les informamos de que este tren circula con un retraso de ' + Math.round(d / 60) + ' minutos por una incidencia en la línea. Disculpen las molestias.';
      }
      case 'terminus': return 'Final de trayecto. Por favor, no olviden sus objetos personales. Gracias por viajar con nosotros.';
    }
    return null;
  }
  function delayNow(sim) {
    var i = Math.min(sim.nextStation, sim.timetable.length - 1), tt = sim.timetable[i];
    var ref = sim.atStation >= 0 ? tt.dep : tt.arr;
    return ref === null || ref === undefined ? 0 : sim.clock - ref;
  }

  function pa(sim, kind, log) {
    var t = sim.train;
    if (!TR.cabActive(t)) { log('pa', 'Megafonía: sin alimentación (habilite la cabina)', 'warn'); return; }
    var text = paText(sim, kind);
    if (!text) return;
    var dur = Math.max(3, text.length * 0.065);
    sim.pa.active = { kind: kind, text: text, start: sim.clock, until: sim.clock + dur };
    sim.pa.last = sim.pa.active;
    sim.pa.count[kind] = (sim.pa.count[kind] || 0) + 1;
    log('pa', 'Megafonía: ' + text, 'info');
  }

  /* ---------- Radio tren-tierra ---------- */
  function setState(c, st, until) { c.state = st; c.stateUntil = until; }

  function schedule(sim, delay, from, text, then) {
    sim.comms.pending.push({ at: sim.clock + delay, from: from, text: text, then: then || null });
  }

  /* Respuesta preparada del Puesto de Mando según la situación (determinista). */
  function replyFor(sim) {
    var t = sim.train, n = trainNo(sim), tt = sim.timetable;
    if (t.emergency.active) return { text: 'Recibido, ' + n + '. Tomo nota de la incidencia. Comunique cuando pueda reanudar la marcha.' };
    if (sim.atStation >= 0) {
      var st = sim.line.stations[sim.atStation], row = tt[sim.atStation];
      if (row.dep === null) return { text: 'Recibido, ' + n + '. Final de trayecto en ' + st.name + '. Deje la unidad estacionada y asegurada. Buen servicio.' };
      if (!sim.radioFlags.ready) return { ready: true, text: 'Recibido, ' + n + '. Tren preparado en ' + st.name + '. Atento a la señal de salida y al horario.' };
      return { text: 'Recibido, ' + n + '. Salida prevista de ' + st.name + ' a las ' + U.fmtClock(row.dep).slice(0, 5) + '. Atento a la señal.' };
    }
    var sig = null;
    for (var i = 0; i < sim.signals.length; i++) if (sim.signals[i].x > t.x + 1) { sig = sim.signals[i]; break; }
    if (sig && sig.aspect === 'rojo' && TR.stopped(t) && sig.x - t.x < 500) {
      var extra = sim.ghost && sim.ghost.state === 'en Dos Hermanas' ? ' El ' + String(sim.ghost.number).split(' ')[0] + ' está detenido en Dos Hermanas.' : '';
      return { text: 'Recibido, ' + n + '. La señal ' + sig.name + ' está en rojo por ocupación del cantón siguiente.' + extra + ' Espere a que se abra; no la rebase sin autorización.' };
    }
    var d = delayNow(sim);
    if (d > 120) return { text: 'Recibido, ' + n + '. Circula con ' + Math.round(d / 60) + ' minutos de retraso. Recupere en lo posible sin superar las velocidades máximas.' };
    return { text: 'Recibido, ' + n + '. Sin novedad en el trayecto. Continúe según horario.' };
  }

  function radioCall(sim, log, radio) {
    var c = sim.comms, t = sim.train, n = trainNo(sim);
    if (!TR.controlPower(t)) { log('radio-ui', 'Radio tren-tierra: sin alimentación', 'warn'); return; }
    if (c.state === 'llamando' || c.state === 'comunicando') { log('radio-ui', 'Radio: ya hay una comunicación en curso', 'warn'); return; }
    c.calls++;
    radio('Maquinista', pmName() + ', aquí el ' + n + ', en canal ' + c.channel + '.');
    if (c.channel !== c.zone) {
      setState(c, 'llamando', sim.clock + NO_ANSWER_S);
      schedule(sim, NO_ANSWER_S, null, 'Sin respuesta en el canal ' + c.channel + ': esta zona se atiende por el canal ' + c.zone + '.', 'noanswer');
      return;
    }
    setState(c, 'llamando', sim.clock + REPLY_DELAY_S);
    var r = replyFor(sim);
    schedule(sim, REPLY_DELAY_S, pmName(), r.text, r.ready ? 'ready' : 'talk');
  }

  function radioEmergency(sim, log, radio) {
    var c = sim.comms, n = trainNo(sim);
    if (!TR.controlPower(sim.train)) { log('radio-ui', 'Radio tren-tierra: sin alimentación', 'warn'); return; }
    if (c.emergency) {
      c.emergency = false; setState(c, 'reposo', sim.clock);
      log('radio-ui', 'Radio: fin de la llamada de emergencia', 'info');
      return;
    }
    c.emergency = true; c.pending = [];
    setState(c, 'emergencia', sim.clock + 60);
    log('radio-emerg', 'RADIO: LLAMADA DE EMERGENCIA del ' + n + ' en canal ' + c.zone, 'alarm');
    radio('Maquinista', 'Emergencia, emergencia, emergencia. Aquí el ' + n + ' en el ' + U.fmtKm(sim.train.x) + '.');
    var txt = sim.train.emergency.active || TR.stopped(sim.train) ?
      'Recibida la emergencia del ' + n + '. Protejo el trayecto y detengo la circulación en la zona. Informe de la incidencia.' :
      'Recibida la emergencia del ' + n + '. Detenga el tren y proteja el trayecto. Informe de la incidencia.';
    schedule(sim, 2, pmName(), txt, 'emerg');
  }

  /* ---------- Órdenes ---------- */
  /* Devuelve true si la orden es de comunicaciones. log(type,msg,sev) y radio(from,text) los da sim. */
  function command(sim, cmd, log, radio) {
    var svc = sim.service, c = sim.comms;
    switch (cmd.type) {
      case 'pa': pa(sim, cmd.msg, log); return true;
      case 'radio:channel': {
        var ch = cmd.channel !== undefined ? cmd.channel | 0 : c.channel + (cmd.delta || 1);
        c.channel = ((ch - 1 + CHANNELS * 4) % CHANNELS) + 1;
        if (c.state === 'llamando' || c.state === 'comunicando') { c.pending = []; setState(c, 'reposo', sim.clock); }
        return true;
      }
      case 'radio:call': radioCall(sim, log, radio); return true;
      case 'radio:emergency': radioEmergency(sim, log, radio); return true;
      case 'dest': {
        var i = svc.destList.indexOf(svc.dest);
        if (cmd.value !== undefined) { if (svc.destList.indexOf(cmd.value) >= 0) svc.dest = cmd.value; }
        else svc.dest = svc.destList[(i + (cmd.delta || 1) + svc.destList.length) % svc.destList.length];
        log('service', 'Indicador de destino: ' + svc.dest.toUpperCase(), 'info');
        return true;
      }
      case 'trainNo': {
        var j = svc.numberList.indexOf(svc.number);
        if (cmd.value !== undefined) { if (svc.numberList.indexOf(String(cmd.value)) >= 0) svc.number = String(cmd.value); }
        else svc.number = svc.numberList[(j + (cmd.delta || 1) + svc.numberList.length) % svc.numberList.length];
        log('service', 'Número de tren: ' + svc.number, 'info');
        return true;
      }
    }
    return false;
  }

  /* ---------- Paso ---------- */
  function step(sim, log, radio) {
    var c = sim.comms;
    c.zone = zoneAt(sim, sim.train.x).channel;
    if (sim.pa.active && sim.clock >= sim.pa.active.until) sim.pa.active = null;
    for (var i = 0; i < c.pending.length; i++) {
      var p = c.pending[i];
      if (sim.clock < p.at) continue;
      c.pending.splice(i--, 1);
      if (p.from) { radio(p.from, p.text); c.last = { from: p.from, text: p.text, t: sim.clock }; }
      else { log('radio-ui', 'Radio: ' + p.text, 'warn'); c.last = { from: 'Radio', text: p.text, t: sim.clock }; }
      if (p.then === 'ready') sim.radioFlags.ready = true;
      if (p.then === 'noanswer') setState(c, 'reposo', sim.clock);
      else if (p.then === 'emerg') setState(c, 'emergencia', sim.clock + 30);
      else setState(c, 'comunicando', sim.clock + TALK_S);
    }
    if ((c.state === 'comunicando' || c.state === 'llamando') && sim.clock >= c.stateUntil && !c.pending.length) setState(c, 'reposo', sim.clock);
    if (c.state === 'emergencia' && sim.clock >= c.stateUntil) { c.emergency = false; setState(c, 'reposo', sim.clock); }
  }

  RC.core.comms = {
    CHANNELS: CHANNELS, create: create, command: command, step: step,
    paText: paText, replyFor: replyFor, zoneAt: zoneAt, nextStopIndex: nextStopIndex, delayNow: delayNow,
    destOk: function (sim) { return sim.service.dest === sim.service.expectedDest; },
    numberOk: function (sim) { return sim.service.number === sim.service.expectedNumber; }
  };
})(globalThis.RC);
