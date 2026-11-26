/* RAILCORE — Modelo de la unidad Civia: sistemas eléctricos, neumáticos,
 * puertas, enclavamientos de tracción y dinámica longitudinal.
 * Núcleo DETERMINISTA: sin DOM, sin aleatoriedad, sin reloj real.
 * Toda la entrada llega por comandos y por `env` en cada paso fijo. */
(function (RC) {
  var U = RC.core.util;
  var G = 9.81;

  var LEVER_EMERG = -8;   // posición de emergencia del manipulador combinado

  function create(spec, opts) {
    opts = opts || {};
    var ready = opts.ready === true;
    return {
      spec: spec,
      x: opts.x || 0,          // posición de la cabeza (m)
      v: 0,                    // velocidad con signo (m/s, + hacia Utrera)
      a: 0,                    // aceleración (m/s²)
      jerk: 0,
      odometer: 0,
      energy_kWh: 0,
      passengers: opts.passengers || 0,
      elec: {
        battery: ready,
        battV: ready ? 78 : 0,
        cabKey: ready,
        pantoCmd: ready,
        pantoPos: ready ? 1 : 0,   // 0 bajado … 1 en contacto
        disyuntor: ready,
        lineV: 0,
        auxCompressor: false,
        mainCompSwitch: 'auto',     // 'auto' | 'off'
        mainCompRunning: false
      },
      air: {
        mr: ready ? 9.2 : 3.1,        // depósito principal
        panto: ready ? 7.0 : 0.6,     // depósito del pantógrafo
        tfa: ready ? 5.0 : 0.0,       // tubería de freno automático
        bc: 0,                        // cilindro de freno
        parking: !ready               // freno de estacionamiento aplicado
      },
      controls: {
        lever: ready ? -3 : -7,       // −8 EMERG, −7…−1 freno, 0 neutro, 1…6 tracción
        reverser: 0,                  // −1 atrás, 0 neutro, 1 adelante
        headlights: ready ? 1 : 0,    // 0 apagadas, 1 cruce, 2 largo
        cabLight: false,
        wipers: false,
        horn: false,
        seta: false                   // seta de emergencia pulsada
      },
      doors: {
        left: 0, right: 0,            // posición 0 cerradas … 1 abiertas
        cmdLeft: 'close', cmdRight: 'close'
      },
      emergency: { active: false, sources: {} },
      tractionForce: 0,               // kN (siempre ≥ 0, la dirección la da el inversor)
      brakeForce: 0,                  // kN
      events: []                      // eventos generados en el último paso
    };
  }

  function emit(t, type, msg, severity) {
    t.events.push({ type: type, msg: msg, severity: severity || 'info' });
  }

  function controlPower(t) { return t.elec.battery && t.elec.battV > 50; }
  function cabActive(t) { return controlPower(t) && t.elec.cabKey; }
  function doorsClosed(t) { return t.doors.left === 0 && t.doors.right === 0 && t.doors.cmdLeft === 'close' && t.doors.cmdRight === 'close'; }
  function stopped(t) { return Math.abs(t.v) < 0.05; }
  function massT(t) { return t.spec.massTare_t + t.passengers * t.spec.passengerMass_t; }

  /* Lista de motivos por los que no hay tracción (vacía = tracción permitida). */
  function tractionInhibits(t, env) {
    var r = [];
    if (!controlPower(t)) r.push('Sin baterías');
    else if (!t.elec.cabKey) r.push('Cabina no habilitada');
    if (!t.elec.disyuntor) r.push('Disyuntor abierto');
    if (t.controls.reverser === 0) r.push('Inversor en neutro');
    if (!doorsClosed(t)) r.push('Puertas no cerradas');
    if (t.air.parking) r.push('Freno de estacionamiento aplicado');
    if (t.air.tfa < 4.6) r.push('Tubería de freno sin cargar');
    if (t.emergency.active) r.push('Freno de emergencia');
    if (env && !env.asfaConnected) r.push('ASFA desconectado');
    return r;
  }

  /* ---------- Comandos (desde la cabina) ---------- */
  function command(t, cmd) {
    var e = t.elec, c = t.controls;
    switch (cmd.type) {
      case 'battery':
        e.battery = !!cmd.on;
        e.battV = e.battery ? (e.disyuntor ? 78 : 72) : 0;
        emit(t, 'cab', cmd.on ? 'Baterías conectadas' : 'Baterías desconectadas');
        break;
      case 'cabKey':
        if (cmd.on && !controlPower(t)) { emit(t, 'cab', 'La llave no actúa: no hay tensión de baterías', 'warn'); break; }
        e.cabKey = !!cmd.on;
        emit(t, 'cab', cmd.on ? 'Cabina habilitada' : 'Cabina deshabilitada');
        break;
      case 'auxCompressor':
        if (cmd.on && !controlPower(t)) { emit(t, 'cab', 'El compresor auxiliar necesita baterías', 'warn'); break; }
        e.auxCompressor = !!cmd.on;
        emit(t, 'cab', cmd.on ? 'Compresor auxiliar en marcha' : 'Compresor auxiliar parado');
        break;
      case 'panto':
        if (cmd.up) {
          if (!cabActive(t)) { emit(t, 'cab', 'Pantógrafo: cabina no habilitada', 'warn'); break; }
          if (t.air.panto < t.spec.pantoMin_bar) { emit(t, 'cab', 'Pantógrafo: presión insuficiente (' + t.air.panto.toFixed(1) + ' bar). Use el compresor auxiliar', 'warn'); break; }
          e.pantoCmd = true; emit(t, 'cab', 'Subiendo pantógrafo');
        } else {
          e.pantoCmd = false; emit(t, 'cab', 'Bajando pantógrafo');
        }
        break;
      case 'disyuntor':
        if (cmd.close) {
          var why = null;
          if (!cabActive(t)) why = 'cabina no habilitada';
          else if (t.elec.pantoPos < 1) why = 'pantógrafo no está en contacto';
          else if (e.lineV < t.spec.disyuntorMinLine_V) why = 'sin tensión en catenaria';
          else if (c.lever > 0) why = 'manipulador en tracción';
          if (why) { emit(t, 'cab', 'No cierra el disyuntor: ' + why, 'warn'); break; }
          e.disyuntor = true; emit(t, 'cab', 'Disyuntor cerrado');
        } else if (e.disyuntor) {
          e.disyuntor = false; emit(t, 'cab', 'Disyuntor abierto');
        }
        break;
      case 'mainCompressor':
        e.mainCompSwitch = cmd.mode === 'off' ? 'off' : 'auto';
        emit(t, 'cab', 'Compresor principal: ' + (e.mainCompSwitch === 'auto' ? 'automático' : 'desconectado'));
        break;
      case 'parking':
        if (cmd.apply) { if (!t.air.parking) { t.air.parking = true; emit(t, 'cab', 'Freno de estacionamiento aplicado'); } }
        else {
          if (!cabActive(t)) { emit(t, 'cab', 'Freno de estacionamiento: cabina no habilitada', 'warn'); break; }
          if (t.air.mr < t.spec.parkingReleaseMin_bar) { emit(t, 'cab', 'No afloja el freno de estacionamiento: depósito principal por debajo de ' + t.spec.parkingReleaseMin_bar + ' bar', 'warn'); break; }
          if (t.air.parking) { t.air.parking = false; emit(t, 'cab', 'Freno de estacionamiento aflojado'); }
        }
        break;
      case 'lever':
        setLever(t, cmd.pos);
        break;
      case 'leverStep':
        setLever(t, c.lever + cmd.delta);
        break;
      case 'reverser':
        if (!stopped(t) && cmd.pos !== c.reverser) { emit(t, 'cab', 'No se puede mover el inversor con el tren en marcha', 'warn'); break; }
        if (c.lever > 0) { emit(t, 'cab', 'Lleve el manipulador a 0 o freno antes de mover el inversor', 'warn'); break; }
        c.reverser = U.clamp(cmd.pos | 0, -1, 1);
        emit(t, 'cab', 'Inversor: ' + (c.reverser === 1 ? 'ADELANTE' : c.reverser === -1 ? 'ATRÁS' : 'NEUTRO'));
        break;
      case 'headlights':
        c.headlights = U.clamp(cmd.mode | 0, 0, 2);
        emit(t, 'cab', 'Faros: ' + ['apagados', 'cruce', 'largo alcance'][c.headlights]);
        break;
      case 'cabLight': c.cabLight = !!cmd.on; break;
      case 'wipers': c.wipers = !!cmd.on; break;
      case 'horn': c.horn = !!cmd.on; break;
      case 'seta':
        if (cmd.on) { c.seta = true; triggerEmergency(t, 'seta', 'Seta de emergencia pulsada'); }
        else { c.seta = false; emit(t, 'cab', 'Seta de emergencia rearmada'); }
        break;
      case 'doors':
        doorCommand(t, cmd.side, cmd.action);
        break;
      case 'emergencyReset':
        tryResetEmergency(t, true);
        break;
    }
  }

  function setLever(t, pos) {
    var c = t.controls;
    pos = U.clamp(Math.round(pos), LEVER_EMERG, t.spec.tractionNotches);
    if (pos === c.lever) return;
    c.lever = pos;
    if (pos === LEVER_EMERG) triggerEmergency(t, 'manipulador', 'Manipulador en EMERGENCIA');
  }

  function doorCommand(t, side, action) {
    var key = side === 'left' ? 'cmdLeft' : 'cmdRight';
    if (action === 'open') {
      if (!cabActive(t)) { emit(t, 'doors', 'Puertas: cabina no habilitada', 'warn'); return; }
      if (!stopped(t)) { emit(t, 'doors', 'Puertas bloqueadas: tren en movimiento', 'warn'); return; }
      t.doors[key] = 'open';
      emit(t, 'doors', 'Liberación de puertas lado ' + (side === 'left' ? 'izquierdo' : 'derecho'), 'info');
    } else {
      t.doors.cmdLeft = 'close'; t.doors.cmdRight = 'close';
      emit(t, 'doors', 'Cierre de puertas');
    }
  }

  function triggerEmergency(t, source, msg) {
    if (!t.emergency.sources[source]) {
      t.emergency.sources[source] = true;
      emit(t, 'emergency', 'FRENO DE EMERGENCIA: ' + msg, 'alarm');
    }
    t.emergency.active = true;
  }

  /* El freno de emergencia sólo se rearma con el tren PARADO, todas las causas
   * eliminadas y el manipulador en posición de freno. */
  function tryResetEmergency(t, manual) {
    var em = t.emergency;
    if (!em.active) return;
    if (!stopped(t)) { if (manual) emit(t, 'emergency', 'Rearme imposible: el tren debe estar parado', 'warn'); return; }
    if (t.controls.lever > -1 || t.controls.lever === LEVER_EMERG) { if (manual) emit(t, 'emergency', 'Rearme: lleve el manipulador a una posición de freno (F1–F7)', 'warn'); return; }
    if (t.controls.seta) { if (manual) emit(t, 'emergency', 'Rearme: la seta de emergencia sigue pulsada', 'warn'); return; }
    em.sources.manipulador = false; em.sources.seta = false;
    for (var k in em.sources) if (em.sources[k]) { if (manual) emit(t, 'emergency', 'Rearme pendiente: ' + k, 'warn'); return; }
    em.active = false; em.sources = {};
    emit(t, 'emergency', 'Freno de emergencia rearmado');
  }

  /* ---------- Paso de simulación ---------- */
  /* env: { lineV, gradePermil, asfaConnected, asfaEmergency, vigilanceEmergency } */
  function step(t, dt, env) {
    var s = t.spec, e = t.elec, air = t.air, c = t.controls;

    // --- Eléctrico ---
    var power = controlPower(t);
    e.battV = e.battery ? (e.disyuntor ? 78 : 72) : 0;
    if (!e.battery) { e.cabKey = false; e.auxCompressor = false; }
    var cab = cabActive(t);

    // Pantógrafo: sube/baja en ~4 s; cae si falta aire o control
    var pantoTarget = (e.pantoCmd && cab && air.panto >= 3.5) ? 1 : 0;
    if (e.pantoCmd && pantoTarget === 0 && e.pantoPos > 0) {
      e.pantoCmd = false;
      emit(t, 'elec', 'Pantógrafo bajado por falta de ' + (cab ? 'presión' : 'control'), 'warn');
    }
    e.pantoPos = U.approach(e.pantoPos, pantoTarget, 0.25, dt);
    e.lineV = e.pantoPos >= 1 ? (env.lineV || 0) : 0;
    if (e.disyuntor && (e.lineV < s.disyuntorMinLine_V || !cab)) {
      e.disyuntor = false;
      emit(t, 'elec', 'Disyuntor abierto por falta de tensión/control', 'warn');
    }

    // --- Neumático ---
    if (e.auxCompressor && power) {
      air.panto = Math.min(7.0, air.panto + s.auxCompressorRate_barps * dt);
      if (air.panto >= 7.0) { e.auxCompressor = false; emit(t, 'air', 'Compresor auxiliar: presión alcanzada, se detiene'); }
    }
    // Regulador del compresor principal (histéresis)
    var canComp = e.disyuntor && e.mainCompSwitch === 'auto';
    if (!canComp) e.mainCompRunning = false;
    else if (air.mr <= s.mrMin_bar) e.mainCompRunning = true;
    else if (air.mr >= s.mrMax_bar) e.mainCompRunning = false;
    if (e.mainCompRunning) air.mr = Math.min(s.mrMax_bar + 0.05, air.mr + s.compressorRate_barps * dt);
    // El depósito principal alimenta al del pantógrafo
    if (air.mr > air.panto + 0.1) {
      var tr = Math.min(0.4 * dt, (air.mr - air.panto) / 2);
      air.panto += tr; air.mr -= tr * 0.1;
    }
    air.panto = Math.max(0, air.panto - (e.pantoPos > 0 ? 0.0015 : 0.0004) * dt); // fugas

    // Emergencias externas (ASFA, hombre muerto)
    if (env.asfaEmergency) triggerEmergency(t, 'asfa', 'actuación del ASFA');
    if (env.vigilanceEmergency) triggerEmergency(t, 'hombre muerto', 'dispositivo de hombre muerto');
    if (!env.asfaEmergency) t.emergency.sources.asfa = false;
    if (!env.vigilanceEmergency) t.emergency.sources['hombre muerto'] = false;
    if (t.emergency.active) tryResetEmergency(t, false);

    // Tubería de freno automático (TFA)
    if (t.emergency.active) {
      air.tfa = U.approach(air.tfa, 0, 2.5, dt);
    } else if (cab && air.mr > air.tfa + 0.2) {
      var before = air.tfa;
      air.tfa = U.approach(air.tfa, Math.min(s.tfaNominal_bar, air.mr - 0.2), 0.6, dt);
      air.mr -= (air.tfa - before) * 0.35;
    }

    // Cilindro de freno: máximo entre freno automático (TFA) y freno EP del manipulador
    var autoBc = U.clamp((s.tfaNominal_bar - air.tfa) * 2.6, 0, s.bcMax_bar);
    var epBc = 0;
    if (cab && c.lever < 0 && c.lever !== LEVER_EMERG) epBc = (-c.lever / s.brakeNotches) * s.bcServiceMax_bar;
    var bcTarget = Math.min(Math.max(autoBc, epBc), air.mr * 0.9);
    var bcBefore = air.bc;
    air.bc = U.approach(air.bc, bcTarget, t.emergency.active ? s.bcRate_barps * 2 : s.bcRate_barps, dt);
    if (air.bc > bcBefore) air.mr = Math.max(0, air.mr - (air.bc - bcBefore) * 0.22);

    // --- Puertas ---
    ['left', 'right'].forEach(function (side) {
      var cmdKey = side === 'left' ? 'cmdLeft' : 'cmdRight';
      var target = t.doors[cmdKey] === 'open' ? 1 : 0;
      t.doors[side] = U.approach(t.doors[side], target, 1 / s.doorTime_s, dt);
    });

    // --- Tracción ---
    var inhibits = tractionInhibits(t, env);
    var notch = c.lever > 0 ? c.lever : 0;
    var vabs = Math.abs(t.v);
    var targetF = 0;
    if (notch > 0 && inhibits.length === 0) {
      var frac = notch / s.tractionNotches;
      var fByPower = s.power_kW / Math.max(vabs, 1.0);
      targetF = frac * Math.min(s.maxTractiveEffort_kN, fByPower);
      if (U.kmh(vabs) > s.vmax_kmh + 2) targetF = 0;       // limitador de velocidad de la unidad
    }
    t.tractionForce = U.approach(t.tractionForce, targetF, targetF < t.tractionForce ? s.tractionRamp_kNs * 3 : s.tractionRamp_kNs, dt);

    // --- Dinámica longitudinal ---
    var m = massT(t);                                  // toneladas
    var meff = m * s.rotatingMassFactor;
    var Fb = (air.bc / s.bcMax_bar) * m * s.emergencyDecel_ms2;     // kN
    t.brakeForce = Fb;
    if (air.parking) Fb += 90;                         // freno de muelle [Simplificado]
    var vk = U.kmh(vabs);
    var Rdavis = s.davis.A + s.davis.B * vk + s.davis.C * vk * vk;
    var Fgrade = m * G * (env.gradePermil || 0) / 1000;  // + se opone al avance hacia +x
    var Fdrive = t.tractionForce * c.reverser - Fgrade;   // fuerzas "activas"
    var Fopp = Fb + Rdavis;                               // fuerzas que se oponen al movimiento
    var aPrev = t.a, a;
    if (vabs < 1e-3) {
      if (Math.abs(Fdrive) <= Fopp) { a = 0; t.v = 0; }
      else a = (Fdrive - Math.sign(Fdrive) * Fopp) / meff;
    } else {
      a = (Fdrive - Math.sign(t.v) * Fopp) / meff;
    }
    var vNew = t.v + a * dt;
    if (vabs >= 1e-3 && Math.sign(vNew) !== Math.sign(t.v) && Math.abs(Fdrive) <= Fopp) vNew = 0;
    if (Math.abs(vNew) < 1e-3 && Math.abs(Fdrive) <= Fopp) vNew = 0;
    var dx = (t.v + vNew) / 2 * dt;
    t.v = vNew; t.x += dx; t.odometer += Math.abs(dx);
    t.a = vNew === 0 && t.v === 0 && a === 0 ? 0 : a;
    t.jerk = (t.a - aPrev) / dt;
    if (t.tractionForce > 0) t.energy_kWh += t.tractionForce * Math.abs(t.v) * dt / 3600 / 0.86;

    if (air.parking && vabs > 0.5) emit(t, 'warn-parking', 'Circulando con freno de estacionamiento aplicado', 'warn');
    if (!doorsClosed(t) && vabs > 0.3) emit(t, 'warn-doors', 'Tren en marcha con puertas abiertas', 'alarm');

    return inhibits;
  }

  RC.core.train = {
    LEVER_EMERG: LEVER_EMERG,
    create: create,
    command: command,
    step: step,
    tractionInhibits: tractionInhibits,
    doorsClosed: doorsClosed,
    cabActive: cabActive,
    controlPower: controlPower,
    massT: massT,
    stopped: stopped
  };
})(globalThis.RC);
