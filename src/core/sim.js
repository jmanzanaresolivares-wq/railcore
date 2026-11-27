/* RAILCORE — Orquestador de la simulación.
 * Paso fijo (DT). Las órdenes del jugador se encolan y se aplican al inicio
 * del siguiente paso, así que la misma secuencia de órdenes produce siempre
 * exactamente el mismo resultado (determinismo, repeticiones, pruebas). */
(function (RC) {
  var U = RC.core.util, TR = RC.core.train, AS = RC.core.asfa, SG = RC.core.signalling, TT = RC.core.timetable;
  var CM = RC.core.comms, TC = RC.core.tcms;
  var DT = 0.05;

  /* Meteorología y estado del carril (afecta a la adherencia, al parabrisas y al vaho). [Simplificado] */
  var WEATHER = {
    seco: { id: 'seco', name: 'Despejado · carril seco', rail: 1.0, rain: 0, humidity: 0.25 },
    humedo: { id: 'humedo', name: 'Carril húmedo (rocío y humedad)', rail: 0.62, rain: 0, humidity: 0.9 },
    lluvia: { id: 'lluvia', name: 'Lluvia · carril mojado', rail: 0.5, rain: 0.8, humidity: 1 }
  };

  var SCENARIOS = {
    frio: { name: 'Arranque en frío en Santa Justa', startStation: 0, ready: false, clockFromDeparture: -720 },
    listo: { name: 'Tren preparado en Santa Justa', startStation: 0, ready: true, clockFromDeparture: -90 },
    dh: { name: 'Dos Hermanas → Utrera (tren preparado)', startStation: 5, ready: true, clockFromDeparture: -75 }
  };

  var VIGIL_PERIOD = 30, VIGIL_GRACE = 6;

  function create(scenarioId, overrides) {
    var sc = SCENARIOS[scenarioId] || SCENARIOS.listo;
    var line = RC.data.lineC1, spec = RC.data.civia;
    if (overrides && overrides.departure) {   // otra hora del día: mismo servicio desplazado
      line = Object.assign({}, line, { firstDeparture: overrides.departure });
    }
    var realDep = TT.realDeparture && TT.realDeparture(line, line.firstDeparture);
    if (realDep) {   // ruta real: la salida y el número de tren del horario publicado
      line = Object.assign({}, line, { firstDeparture: realDep.dep, trainNumber: String(realDep.number) });
    }
    var tt = TT.build(line, 0, {});
    var ghostTT = TT.build(line, -line.precedingTrain.headway_s, line.precedingTrain.extraDwell);
    var startSt = line.stations[sc.startStation];
    var clock = sc.clock ? U.parseClock(sc.clock) : tt[sc.startStation].dep + sc.clockFromDeparture;
    var weather = WEATHER[overrides && overrides.weather] || WEATHER.seco;
    var tOut = U.outsideTemp(clock);
    // Tras la noche a la intemperie el parabrisas amanece empañado si hace frío
    var fog0 = sc.ready ? 0 : U.clamp((15 - tOut) / 10, 0, 0.6) * (0.5 + 0.5 * weather.humidity);

    var sim = {
      scenario: scenarioId, scenarioName: sc.name,
      DT: DT, clock: clock, startClock: clock, elapsed: 0, stepCount: 0,
      line: line, spec: spec, timetable: tt,
      weather: weather,
      train: TR.create(spec, { ready: sc.ready, x: startSt.stopX, passengers: sc.startStation === 0 ? 0 : 150, tempOut: tOut, fog: fog0 }),
      asfa: AS.create(RC.data.asfa),
      signals: SG.buildSignals(line),
      ghost: SG.createGhost(line, ghostTT),
      queue: [],
      log: [], radio: [], faults: [],
      stations: line.stations.map(function (s, i) {
        var pax = s.waiting;
        if (i === 0) pax = 140;
        return {
          idx: i, arrived: i === sc.startStation, arrTime: i === sc.startStation ? clock : null, depTime: null,
          toBoard: i >= sc.startStation ? pax : 0, toAlight: 0, boarded: 0, alighted: 0, alightSet: i === sc.startStation,
          skipped: i < sc.startStation
        };
      }),
      nextStation: sc.startStation,   // estación en la que estamos o la próxima
      atStation: sc.startStation,     // índice si el tren está detenido en andén, si no −1
      vigil: { timer: 0, warning: false, emergency: false },
      episodes: {},
      lastLogAt: {},
      finished: false,
      score: 1000,
      inhibits: [],
      radioFlags: {},
      tcms: TC.create()
    };
    CM.create(sim, { cold: !sc.ready });
    if (sc.ready) { sim.asfa.connected = true; }
    sim.beacons = SG.buildBeacons(line, sim.signals);
    if (overrides && overrides.noGhost) sim.ghost.active = false, sim.noGhost = true;
    SG.updateGhost(sim.ghost, clock, 0);
    if (sim.noGhost) sim.ghost.active = false;
    refreshAspects(sim);
    logEvent(sim, 'scenario', 'Escenario: ' + sc.name + '. Tren ' + line.trainNumber + '.', 'info');
    radio(sim, 'Puesto de Mando', 'Buenos días, ' + line.trainNumber.split(' ')[0] + '. Servicio Santa Justa – Utrera, salida prevista ' + U.fmtClock(tt[sc.startStation].dep) + '. Radio tren-tierra en canal ' + sim.comms.zone + '. Comunique cuando esté listo.');
    if (weather.rain > 0) logEvent(sim, 'weather', 'Meteorología: ' + weather.name + '. Adherencia reducida: use el arenado si patina o desliza.', 'warn');
    else if (weather.rail < 1) logEvent(sim, 'weather', 'Meteorología: ' + weather.name + '. Adherencia reducida.', 'warn');
    return sim;
  }

  /* ---------- Registro y puntuación ---------- */
  function logEvent(sim, type, msg, severity) {
    sim.logSeq = (sim.logSeq || 0) + 1;
    sim.log.push({ seq: sim.logSeq, t: sim.clock, type: type, msg: msg, severity: severity || 'info' });
    if (sim.log.length > 400) sim.log.shift();
  }
  function fault(sim, code, msg, points) {
    sim.faults.push({ t: sim.clock, code: code, msg: msg, points: points, x: sim.train.x });
    sim.score -= points;
    logEvent(sim, 'fault', msg + ' (−' + points + ')', 'fault');
  }
  function radio(sim, from, text) {
    sim.radio.push({ t: sim.clock, from: from, text: text });
    logEvent(sim, 'radio', from + ': ' + text, 'radio');
  }
  /* Episodios: una falta por episodio continuo, no por cada paso. */
  function episode(sim, key, active, onStart, onEnd) {
    var was = sim.episodes[key];
    if (active && !was) { sim.episodes[key] = { start: sim.clock, peak: 0 }; if (onStart) onStart(sim.episodes[key]); }
    else if (!active && was) { if (onEnd) onEnd(was); delete sim.episodes[key]; }
    return sim.episodes[key];
  }

  /* ---------- Órdenes ---------- */
  function command(sim, cmd) { sim.queue.push(cmd); }

  function applyCommand(sim, cmd) {
    var t = sim.train;
    // Cualquier acción del maquinista cuenta como actividad (soltar la bocina o el arenado, no)
    if (!((cmd.type === 'horn' || cmd.type === 'sand') && !cmd.on)) resetVigil(sim, cmd.type === 'vigil');
    if (cmd.type === 'vigil') return;
    if (TC.command(sim, cmd)) return;
    if (CM.command(sim, cmd, function (ty, m, sv) { logEvent(sim, ty, m, sv); }, function (f, x) { radio(sim, f, x); })) return;
    if (cmd.type.indexOf('asfa:') === 0) {
      AS.button(sim.asfa, cmd.type.slice(5), { stopped: TR.stopped(t), power: TR.cabActive(t) });
      return;
    }
    if (cmd.type === 'finish') { finish(sim, 'Servicio terminado por el maquinista'); return; }
    if (cmd.type === 'radioReady') {
      if (!sim.radioFlags.ready) { sim.radioFlags.ready = true; radio(sim, 'Maquinista', 'Puesto de Mando, aquí el ' + sim.line.trainNumber.split(' ')[0] + ', tren preparado en ' + sim.line.stations[sim.nextStation].name + '.'); radio(sim, 'Puesto de Mando', 'Recibido. Atento a la señal de salida y al horario.'); }
      return;
    }
    if (cmd.type === 'doors' && cmd.action === 'open') {
      var side = cmd.side === 'left' ? 'izquierda' : 'derecha';
      var st = sim.atStation >= 0 ? sim.line.stations[sim.atStation] : null;
      TR.command(t, cmd);
      if (TR.stopped(t) && TR.cabActive(t)) {
        if (!st) fault(sim, 'doors-noplatform', 'Puertas abiertas fuera de andén', 100);
        else if (st.side !== side) fault(sim, 'doors-wrongside', 'Puertas abiertas por el lado sin andén en ' + st.name, 80);
      }
      return;
    }
    TR.command(t, cmd);
  }

  function resetVigil(sim, explicit) {
    var v = sim.vigil;
    v.timer = 0;
    if (v.warning) { v.warning = false; }
    if (explicit && v.emergency && TR.stopped(sim.train)) { v.emergency = false; logEvent(sim, 'vigil', 'Hombre muerto rearmado'); }
  }

  /* ---------- Paso de simulación ---------- */
  function step(sim) {
    if (sim.finished) return;
    var t = sim.train, dt = DT;
    while (sim.queue.length) applyCommand(sim, sim.queue.shift());

    var xPrev = t.x;
    var vKmh = U.kmh(Math.abs(t.v));

    // Hombre muerto / vigilancia (sólo en marcha)
    var v = sim.vigil;
    if (Math.abs(t.v) > 0.5 && TR.cabActive(t)) {
      v.timer += dt;
      if (v.timer > VIGIL_PERIOD && !v.warning) { v.warning = true; logEvent(sim, 'vigil', 'Hombre muerto: pulse VIGILANCIA', 'warn'); }
      if (v.timer > VIGIL_PERIOD + VIGIL_GRACE && !v.emergency) { v.emergency = true; fault(sim, 'vigil', 'Actuación del hombre muerto', 60); }
    } else if (!v.emergency) { v.timer = 0; v.warning = false; }

    // ASFA
    AS.step(sim.asfa, dt, vKmh);

    // Tren
    var W = sim.weather;
    var env = {
      lineV: sim.line.catenary_V,
      gradePermil: TT.gradeAt(sim.line, t.x - sim.spec.length_m / 2),
      asfaConnected: sim.asfa.connected,
      asfaEmergency: sim.asfa.emergency,
      vigilanceEmergency: v.emergency,
      railFactor: W.rail, rain: W.rain, humidity: W.humidity,
      tempOut: U.outsideTemp(sim.clock),
      sun: W.rain > 0 ? 0 : Math.max(0, Math.sin(U.sunElevation(sim.clock) * Math.PI / 180))
    };
    var wasEmergency = t.emergency.active;
    sim.inhibits = TR.step(t, dt, env);
    if (!wasEmergency && t.emergency.active && !TR.stopped(t)) {
      if (t.emergency.sources.seta || t.emergency.sources.manipulador) fault(sim, 'emerg-manual', 'Freno de emergencia en marcha', 30);
    }

    // Balizas cruzadas en este paso (sólo sentido normal de marcha)
    if (t.x > xPrev) {
      for (var i = 0; i < sim.beacons.length; i++) {
        var b = sim.beacons[i];
        if (b.x > xPrev && b.x <= t.x) {
          var code = SG.beaconCode(b, sim.signals[b.sig]);
          if (code === 'L8' && !(sim.asfa.connected && sim.asfa.rebaseRemaining > 0)) fault(sim, 'spad', 'Rebase de señal en rojo ' + sim.signals[b.sig].name + ' sin autorización', 200);
          AS.beacon(sim.asfa, code, vKmh);
        }
      }
    }
    if (sim.asfa.events.some(function (e) { return e.type === 'asfa-emergency'; })) fault(sim, 'asfa', 'Frenado de emergencia del ASFA', 100);

    // Tráfico y señales
    sim.clock += dt; sim.elapsed += dt; sim.stepCount++;
    if (!sim.noGhost) SG.updateGhost(sim.ghost, sim.clock, dt);
    refreshAspects(sim);

    sim.maxKmh = Math.max(sim.maxKmh || 0, U.kmh(Math.abs(t.v)));
    stationLogic(sim, dt);
    checkRules(sim);
    radioScript(sim);
    CM.step(sim, function (ty, m, sv) { logEvent(sim, ty, m, sv); }, function (f, x) { radio(sim, f, x); });
    TC.step(sim);
    drainEvents(sim);
  }

  function refreshAspects(sim) {
    var t = sim.train;
    SG.updateAspects(sim.signals, {
      ghost: sim.ghost,
      player: { x: t.x, length: sim.spec.length_m },
      clearSalida: function (s) {
        var st = sim.stations[s.station];
        var tt = sim.timetable[s.station];
        // Se abre cuando el tren está detenido en ese andén y faltan ≤ 15 s para la salida
        // (una vez abierta queda establecida hasta que el tren la rebasa)
        if (!s.cleared && sim.atStation === s.station && st.arrived && sim.clock >= tt.dep - 15) s.cleared = true;
        return s.cleared;
      }
    });
  }

  function onPlatform(sim, i) {
    var st = sim.line.stations[i], x = sim.train.x;
    return x <= st.stopX + 15 && x - sim.spec.length_m >= st.stopX - st.platformLength;
  }

  function stationLogic(sim, dt) {
    var t = sim.train, line = sim.line;
    var i = sim.nextStation;
    if (i >= line.stations.length) return;
    var st = line.stations[i], ss = sim.stations[i], tt = sim.timetable[i];

    // Llegada
    if (!ss.arrived && TR.stopped(t) && onPlatform(sim, i)) {
      ss.arrived = true; ss.arrTime = sim.clock; sim.atStation = i;
      var delay = sim.clock - tt.arr;
      var stopErr = t.x - st.stopX;
      logEvent(sim, 'station', 'Llegada a ' + st.name + ' (' + U.fmtDelay(delay) + ', parada a ' + Math.abs(stopErr).toFixed(1) + ' m ' + (stopErr > 0 ? 'pasado' : 'antes') + ' del cartelón)', 'info');
      if (delay > 60) fault(sim, 'late', 'Retraso de ' + Math.round(delay) + ' s en ' + st.name, Math.min(60, Math.round((delay - 60) / 5)));
      if (stopErr < -25) fault(sim, 'stop-short', 'Parada corta en ' + st.name + ' (' + Math.round(-stopErr) + ' m)', 15);
    }
    if (ss.arrived && !ss.alightSet) {
      ss.alightSet = true;
      ss.toAlight = i === line.stations.length - 1 ? t.passengers : Math.round(t.passengers * (st.id === 'DH' ? 0.4 : 0.2));
    }
    // Rebase del cartelón sin parar
    if (!ss.arrived && t.x > st.stopX + 15 && !TR.stopped(t)) {
      if (t.x > st.stopX + 120) {
        fault(sim, 'missed', 'Parada no realizada en ' + st.name, 200);
        ss.arrived = true; ss.skipped = true; ss.alightSet = true;
        sim.nextStation++;
        return;
      }
    }
    // Intercambio de viajeros
    if (ss.arrived && sim.atStation === i) {
      var sideKey = st.side === 'izquierda' ? 'left' : 'right';
      var open = t.doors[sideKey];
      if (open > 0.95) {
        var rate = sim.spec.doorsPerSide * sim.spec.boardingRatePerDoor_pps * dt;
        ss.flow = (ss.flow || 0) + rate;
        while (ss.flow >= 1) {
          ss.flow -= 1;
          if (ss.toAlight > ss.alighted) { ss.alighted++; t.passengers--; }
          else if (ss.toBoard > ss.boarded) { ss.boarded++; t.passengers++; }
          else { ss.flow = 0; break; }
        }
      }
      // Salida
      if (t.x > st.stopX + 30) {
        ss.depTime = sim.clock; sim.atStation = -1;
        if (tt.dep !== null && sim.clock < tt.dep - 5) fault(sim, 'early', 'Salida adelantada de ' + st.name, 50);
        var left = (ss.toBoard - ss.boarded) + (ss.toAlight - ss.alighted);
        if (left > 0) fault(sim, 'pax-left', left + ' viajeros sin poder subir/bajar en ' + st.name, Math.min(80, left));
        logEvent(sim, 'station', 'Salida de ' + st.name + (tt.dep ? ' (' + U.fmtDelay(sim.clock - tt.dep) + ')' : ''));
        sim.nextStation++;
      }
    }
    // Fin de servicio en Utrera
    if (i === line.stations.length - 1 && ss.arrived && !ss.skipped && ss.alighted >= ss.toAlight && t.passengers === 0 && t.doors.left + t.doors.right > 0) {
      finish(sim, 'Servicio completado en ' + st.name);
    }
  }

  function checkRules(sim) {
    var t = sim.train, vKmh = U.kmh(Math.abs(t.v));
    var lim = TT.trackLimitKmh(sim.line, t.x, sim.spec.length_m);
    var over = vKmh - lim;
    var ep = episode(sim, 'overspeed', over > 5, null, function (e) {
      fault(sim, 'overspeed', 'Exceso de velocidad: ' + Math.round(e.peak + lim) + ' km/h en zona de ' + e.lim + ' km/h', Math.min(80, 10 + Math.round(e.peak * 2)));
    });
    if (ep) { ep.peak = Math.max(ep.peak, over); ep.lim = lim; }
    episode(sim, 'doors', !TR.doorsClosed(t) && vKmh > 1, function () { fault(sim, 'doors-moving', 'Tren en marcha con puertas abiertas', 150); });
    episode(sim, 'parking', t.air.parking && vKmh > 2, function () { fault(sim, 'parking', 'Circulación con freno de estacionamiento', 40); });
    episode(sim, 'lights', t.controls.headlights === 0 && vKmh > 5, function () { fault(sim, 'lights', 'Circulación sin faros encendidos', 10); });
    episode(sim, 'jerk', Math.abs(t.jerk) > 2.5 && vKmh > 3 && t.passengers > 0, function () { fault(sim, 'comfort', 'Sacudida brusca: confort de viajeros', 2); });
  }

  function radioScript(sim) {
    var f = sim.radioFlags, t = sim.train;
    if (!f.ghostDelay && sim.ghost.state === 'en Dos Hermanas' && sim.clock > sim.ghost.tt[5].arr + 40 && t.x < 13000 && t.x > 6000) {
      f.ghostDelay = true;
      radio(sim, 'Puesto de Mando', 'Atención ' + sim.line.trainNumber.split(' ')[0] + ': el ' + sim.ghost.number.split(' ')[0] + ' está detenido en Dos Hermanas atendiendo a un viajero con movilidad reducida. Circule atento a las indicaciones de las señales.');
    }
    if (!f.departed && sim.nextStation > 0 && sim.stations[0].depTime) {
      f.departed = true;
    }
    if (!f.utrera && t.x > 27000) {
      f.utrera = true;
      radio(sim, 'Puesto de Mando', 'Entrada en ' + sim.line.stations[sim.line.stations.length - 1].name + ', andén a la ' + sim.line.stations[sim.line.stations.length - 1].side + '. Final de trayecto.');
    }
  }

  function drainEvents(sim) {
    var all = sim.train.events.concat(sim.asfa.events);
    sim.train.events = []; sim.asfa.events = [];
    for (var i = 0; i < all.length; i++) {
      var e = all[i];
      var key = e.type + '|' + e.msg;
      if (sim.lastLogAt[key] !== undefined && sim.clock - sim.lastLogAt[key] < 10) continue;
      sim.lastLogAt[key] = sim.clock;
      logEvent(sim, e.type, e.msg, e.severity);
    }
  }

  function finish(sim, reason) {
    if (sim.finished) return;
    sim.finished = true;
    sim.finishReason = reason;
    logEvent(sim, 'end', reason);
  }

  /* Huella del estado para comprobar determinismo. */
  function hash(sim) {
    var t = sim.train;
    return [sim.stepCount, t.x.toFixed(6), t.v.toFixed(6), t.air.mr.toFixed(5), t.air.bc.toFixed(5), sim.score, sim.asfa.emergency, t.passengers,
      t.sand.kg.toFixed(4), t.edForce.toFixed(4), t.hvac.cabT.toFixed(4), t.hvac.salonT.toFixed(4), t.screen.fog.toFixed(4), t.elec.battSoc.toFixed(6),
      sim.comms.state, sim.tcms.events.length].join('|');
  }

  RC.core.sim = { DT: DT, SCENARIOS: SCENARIOS, WEATHER: WEATHER, create: create, command: command, step: step, hash: hash, onPlatform: onPlatform };
})(globalThis.RC);
