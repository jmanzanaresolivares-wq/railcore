/* RAILCORE — Modelo de la unidad Civia: sistemas eléctricos, neumáticos,
 * puertas, enclavamientos de tracción, dinámica longitudinal y sistemas de
 * cabina (adherencia y arenado, regulador de velocidad, freno eléctrico,
 * baterías, alumbrado, bocina, limpiaparabrisas, luneta térmica y climatización).
 * Núcleo DETERMINISTA: sin DOM, sin aleatoriedad, sin reloj real.
 * Toda la entrada llega por comandos y por `env` en cada paso fijo. */
(function (RC) {
  var U = RC.core.util;
  var G = 9.81;

  var LEVER_EMERG = -8;   // posición de emergencia del manipulador combinado
  var WIPER_NAMES = ['parado', 'intermitente', 'lento', 'rápido'];
  var WIPER_CYCLE_S = [0, 1.6, 1.6, 1.0];   // duración de un barrido completo (ida y vuelta)
  var WIPER_PAUSE_S = 5;                    // pausa del modo intermitente

  function create(spec, opts) {
    opts = opts || {};
    var ready = opts.ready === true;
    var tOut = opts.tempOut === undefined ? 15 : opts.tempOut;
    return {
      spec: spec,
      x: opts.x || 0,          // posición de la cabeza (m)
      v: 0,                    // velocidad con signo (m/s, + hacia Utrera)
      a: 0,                    // aceleración (m/s²)
      jerk: 0,
      odometer: 0,
      energy_kWh: 0,
      energyRegen_kWh: 0,      // energía devuelta a la catenaria por el freno eléctrico
      passengers: opts.passengers || 0,
      elec: {
        battery: ready,
        battV: ready ? 78 : 0,
        battSoc: ready ? 0.93 : 0.8,  // estado de carga de las baterías (0…1)
        charging: false,              // cargador alimentado por el convertidor estático
        auxPower: false,              // convertidor estático en marcha (necesita catenaria y disyuntor)
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
        markers: ready,               // luces de posición (gálibo) del testero de cabeza
        tailLights: ready,            // pilotos rojos del testero de cola
        cabLight: false,
        deskLight: false,             // luz de lectura del pupitre (libro horario)
        dimmer: 0.8,                  // regulador de intensidad de pantallas y rótulos (0,1…1)
        wipers: 0,                    // 0 parado, 1 intermitente, 2 lento, 3 rápido
        washer: 0,                    // segundos de chorro del lavaparabrisas que quedan
        demister: false,              // luneta térmica (parabrisas calefactado)
        visor: 0,                     // cortinilla parasol: 0 recogida, 1 media, 2 bajada
        horn: false,                  // bocina tono alto
        hornLow: false,               // bocina tono bajo
        seta: false                   // seta de emergencia pulsada
      },
      doors: {
        left: 0, right: 0,            // posición 0 cerradas … 1 abiertas
        cmdLeft: 'close', cmdRight: 'close'
      },
      sand: { kg: spec.sandCapacity_kg * (ready ? 0.92 : 0.88), button: false, auto: 0, active: false, empty: false },
      adhesion: { mu: 0, railFactor: 1, limitTr: 0, limitBr: 0, slip: 0, slide: 0, slipping: false, sliding: false },
      reg: { on: false, set_kmh: 60, active: false, integ: 0, demand: 0, brake: 0 },
      hvac: {
        cabOn: ready, cabSet: 21, cabT: ready ? 20.5 : tOut + 1.5,
        salonOn: ready, salonT: ready ? 21 : tOut + 1.5, fan: 0, mode: 'off'
      },
      screen: {
        wet: 0, dirt: 0.04, dirtTotal: 0.2,  // gotas, suciedad en la zona barrida y fuera de ella (0…1)
        fog: opts.fog || 0,                  // vaho por dentro (0…1)
        washWet: 0, washerL: spec.washerTank_L * 0.75,
        wiperPhase: 0, wiperPos: 0, wiperPause: 0, autoCycles: 0, sweeps: 0, washerEmpty: false
      },
      emergency: { active: false, sources: {} },
      tractionForce: 0,               // kN de los motores (siempre ≥ 0, la dirección la da el inversor)
      railForce: 0,                   // kN que llegan al carril (limitados por la adherencia)
      brakeForce: 0,                  // kN, freno total (eléctrico + neumático)
      edForce: 0,                     // kN, freno eléctrico de recuperación
      pneuForce: 0,                   // kN, freno neumático
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
  function batteryVolts(t) {
    var e = t.elec;
    if (!e.battery) return 0;
    return e.charging ? 78 : 56 + 20 * e.battSoc;   // 72 V con el 80 % de carga
  }

  /* Adherencia rueda-carril (Curtius–Kniffler) con el factor del carril y el arena. */
  function adhesionCoef(t, vKmh, railFactor, sanding) {
    var mu0 = 0.161 + 7.5 / (vKmh + 44);
    var k = (railFactor === undefined ? 1 : railFactor) * (sanding ? t.spec.sandAdhesionGain : 1);
    return mu0 * Math.min(1.15, k);
  }

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
    var e = t.elec, c = t.controls, s = t.spec;
    switch (cmd.type) {
      case 'battery':
        e.battery = !!cmd.on;
        e.battV = batteryVolts(t);
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
          if (t.air.panto < s.pantoMin_bar) { emit(t, 'cab', 'Pantógrafo: presión insuficiente (' + t.air.panto.toFixed(1) + ' bar). Use el compresor auxiliar', 'warn'); break; }
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
          else if (e.lineV < s.disyuntorMinLine_V) why = 'sin tensión en catenaria';
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
          if (t.air.mr < s.parkingReleaseMin_bar) { emit(t, 'cab', 'No afloja el freno de estacionamiento: depósito principal por debajo de ' + s.parkingReleaseMin_bar + ' bar', 'warn'); break; }
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
      case 'markers':
        c.markers = !!cmd.on; emit(t, 'cab', 'Luces de posición ' + (c.markers ? 'encendidas' : 'apagadas'));
        break;
      case 'tailLights':
        c.tailLights = !!cmd.on; emit(t, 'cab', 'Pilotos de cola ' + (c.tailLights ? 'encendidos' : 'apagados'));
        break;
      case 'cabLight': c.cabLight = !!cmd.on; break;
      case 'deskLight': c.deskLight = !!cmd.on; break;
      case 'dimmer': {
        var lv = cmd.level !== undefined ? +cmd.level : c.dimmer + (+cmd.delta || 0);
        c.dimmer = Math.round(U.clamp(lv, 0.1, 1) * 10) / 10;
        break;
      }
      case 'wipers': {
        var mode = cmd.mode !== undefined ? cmd.mode | 0 : (cmd.on ? 2 : 0);
        c.wipers = U.clamp(mode, 0, 3);
        emit(t, 'cab', 'Limpiaparabrisas: ' + WIPER_NAMES[c.wipers]);
        break;
      }
      case 'washer':
        if (!controlPower(t)) { emit(t, 'cab', 'Lavaparabrisas: sin tensión de baterías', 'warn'); break; }
        if (t.screen.washerL <= 0) { emit(t, 'cab', 'Lavaparabrisas: depósito vacío', 'warn'); break; }
        c.washer = s.washerSpray_s;
        t.screen.autoCycles = Math.max(t.screen.autoCycles, 3);   // barridos automáticos tras el chorro
        break;
      case 'demister':
        c.demister = !!cmd.on;
        emit(t, 'cab', 'Luneta térmica ' + (c.demister ? 'conectada' : 'desconectada') + (c.demister && !t.elec.auxPower ? ' (sin alimentación: necesita el convertidor estático)' : ''));
        break;
      case 'visor': c.visor = U.clamp(cmd.pos | 0, 0, 2); break;
      case 'horn':
        if (cmd.tone === 'baja') c.hornLow = !!cmd.on; else c.horn = !!cmd.on;
        break;
      case 'sand':
        t.sand.button = !!cmd.on;
        if (cmd.on && t.sand.kg <= 0) emit(t, 'adh', 'Arenado: areneros vacíos', 'warn');
        break;
      case 'regulator':
        t.reg.on = !!cmd.on;
        t.reg.integ = 0;
        emit(t, 'cab', 'Regulador de velocidad ' + (t.reg.on ? 'CONECTADO: consigna ' + t.reg.set_kmh + ' km/h (el manipulador limita el esfuerzo)' : 'desconectado'));
        break;
      case 'regulatorSet': {
        var v = cmd.kmh !== undefined ? +cmd.kmh : t.reg.set_kmh + (cmd.delta || 0) * s.regStep_kmh;
        t.reg.set_kmh = U.clamp(Math.round(v / s.regStep_kmh) * s.regStep_kmh, 0, s.vmax_kmh);
        break;
      }
      case 'hvacCab':
        t.hvac.cabOn = !!cmd.on; emit(t, 'cab', 'Climatización de cabina ' + (t.hvac.cabOn ? 'conectada' : 'desconectada'));
        break;
      case 'hvacCabSet': {
        var sp = cmd.value !== undefined ? +cmd.value : t.hvac.cabSet + (cmd.delta || 0) * 0.5;
        t.hvac.cabSet = U.clamp(Math.round(sp * 2) / 2, 16, 28);
        break;
      }
      case 'hvacSalon':
        t.hvac.salonOn = !!cmd.on; emit(t, 'cab', 'Climatización del salón de viajeros ' + (t.hvac.salonOn ? 'conectada' : 'desconectada'));
        break;
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

  /* ---------- Sistemas auxiliares (paso) ---------- */

  /* Baterías: el convertidor estático (con catenaria y disyuntor cerrado) alimenta los
   * servicios y carga las baterías; sin él, todo consume de las baterías. */
  function stepBattery(t, dt) {
    var s = t.spec, e = t.elec, c = t.controls;
    e.auxPower = e.disyuntor && e.lineV >= s.disyuntorMinLine_V;
    e.charging = e.battery && e.auxPower;
    if (e.battery) {
      if (e.charging) e.battSoc = Math.min(1, e.battSoc + s.batteryChargeRate_kW * dt / 3600 / s.batteryCapacity_kWh);
      else {
        var load = s.controlLoad_kW + (c.cabLight ? 0.04 : 0) + (c.deskLight ? 0.01 : 0) + (c.headlights ? 0.25 : 0) +
          (c.markers ? 0.04 : 0) + (c.tailLights ? 0.04 : 0) + (e.auxCompressor ? 1.5 : 0) + (c.wipers ? 0.15 : 0);
        e.battSoc = Math.max(0, e.battSoc - load * dt / 3600 / s.batteryCapacity_kWh);
        if (e.battSoc < 0.2) { e.battery = false; emit(t, 'elec', 'Baterías desconectadas por mínima tensión', 'alarm'); }
      }
    }
    e.battV = batteryVolts(t);
  }

  /* Climatización: modelo térmico sencillo de cabina y salón (°C). */
  function stepHvac(t, dt, env) {
    var s = t.spec, hv = t.hvac, aux = t.elec.auxPower;
    var tOut = env.tempOut === undefined ? 15 : env.tempOut, sun = env.sun || 0;
    var dCab = (tOut - hv.cabT) / s.cabLoss_s + sun * 0.0005, hc = 0;
    if (hv.cabOn && aux) hc = U.clamp((hv.cabSet - hv.cabT) * 0.01, -s.cabHvacRate_Cps, s.cabHvacRate_Cps);
    hv.cabT += (dCab + hc) * dt;
    var doorsOpen = t.doors.left + t.doors.right;
    var dSal = (tOut - hv.salonT) * (1 / s.salonLoss_s + doorsOpen * 0.0012) + t.passengers * 0.000012 + sun * 0.0004, hs = 0;
    if (hv.salonOn && aux) hs = U.clamp((s.salonSetpoint_C - hv.salonT) * 0.006, -s.salonHvacRate_Cps, s.salonHvacRate_Cps);
    hv.salonT += (dSal + hs) * dt;
    hv.mode = !aux || (!hv.cabOn && !hv.salonOn) ? 'off' : hc > 0.002 ? 'calor' : hc < -0.002 ? 'frío' : 'ventilación';
    hv.fan = aux && (hv.cabOn || hv.salonOn) ? U.clamp(0.3 + Math.abs(hv.cabSet - hv.cabT) / 5, 0.3, 1) : 0;
  }

  /* Parabrisas: lluvia, suciedad, lavaparabrisas, limpiaparabrisas (con aparcado
   * automático) y vaho por dentro. */
  function stepScreen(t, dt, env, dx) {
    var s = t.spec, w = t.screen, c = t.controls, e = t.elec, power = controlPower(t);
    var rain = env.rain || 0, vabs = Math.abs(t.v);
    // Lavaparabrisas
    if (c.washer > 0) {
      c.washer = Math.max(0, c.washer - dt);
      if (w.washerL > 0) { w.washerL = Math.max(0, w.washerL - s.washerFlow_Lps * dt); w.washWet = 1; }
      if (w.washerL <= 0 && !w.washerEmpty) { w.washerEmpty = true; emit(t, 'cab', 'Lavaparabrisas: depósito vacío', 'warn'); }
    }
    w.washWet = Math.max(0, w.washWet - 0.12 * dt);
    // Agua y suciedad
    w.wet = U.clamp(w.wet + (rain * (0.04 + vabs * 0.004) - (rain > 0 ? 0 : 0.012)) * dt, 0, 1);
    w.dirt = Math.min(1, w.dirt + Math.abs(dx) * 1.2e-5);
    w.dirtTotal = Math.min(1, w.dirtTotal + Math.abs(dx) * 1.2e-5);
    // Limpiaparabrisas: motor con aparcado automático; el intermitente hace pausas
    var mode = power ? c.wipers : 0;
    if (mode !== 1) w.wiperPause = 0;
    var run = power && (mode > 0 || w.autoCycles > 0 || w.wiperPhase > 0);
    if (run && w.wiperPhase === 0 && w.wiperPause > 0 && w.autoCycles === 0) { w.wiperPause = Math.max(0, w.wiperPause - dt); run = false; }
    if (run) {
      w.wiperPhase += dt / WIPER_CYCLE_S[mode === 3 ? 3 : 2];   // al aparcar o tras el lavado, a velocidad lenta
      if (w.wiperPhase >= 1) {   // barrido completo: limpia la zona barrida
        w.wiperPhase = 0; w.sweeps++;
        if (w.autoCycles > 0) w.autoCycles--;
        var wetGlass = w.washWet > 0.15 || w.wet > 0.3;
        w.wet *= 0.08;
        if (wetGlass) w.dirt *= w.washWet > 0.15 ? 0.5 : 0.85;
        if (mode === 1 && w.autoCycles === 0) w.wiperPause = WIPER_PAUSE_S;
      }
    }
    w.wiperPos = w.wiperPhase < 0.5 ? w.wiperPhase * 2 : (1 - w.wiperPhase) * 2;
    // Vaho: cabina más caliente que el exterior y aire húmedo; la luneta térmica y el aire seco lo quitan
    var humid = Math.max(rain, env.humidity || 0);
    var dT = t.hvac.cabT - (env.tempOut === undefined ? 15 : env.tempOut);
    var risk = U.clamp((dT - 4) / 10, 0, 1) * (0.35 + 0.65 * humid);
    var dFog = risk * 0.004;
    if (c.demister && e.auxPower) dFog -= 0.025;
    if (t.hvac.cabOn && e.auxPower) dFog -= 0.003;
    w.fog = U.clamp(w.fog + dFog * dt, 0, 1);
  }

  /* Arenado: manual (pulsador) o automático (al detectar patinaje o deslizamiento). */
  function stepSand(t, dt) {
    var s = t.spec, sd = t.sand;
    if (sd.auto > 0) sd.auto = Math.max(0, sd.auto - dt);
    var want = sd.button || sd.auto > 0;
    var moving = Math.abs(t.v) > 0.3 || t.tractionForce > 1;
    sd.active = want && controlPower(t) && t.air.mr >= s.sandMinAir_bar && sd.kg > 0 && moving;
    if (sd.active) {
      sd.kg = Math.max(0, sd.kg - s.sandFlow_kgps * dt);
      t.air.mr = Math.max(0, t.air.mr - 0.004 * dt);
      if (sd.kg <= 0 && !sd.empty) { sd.empty = true; emit(t, 'adh', 'Arenado: areneros vacíos', 'warn'); }
    }
  }

  /* ---------- Paso de simulación ---------- */
  /* env: { lineV, gradePermil, asfaConnected, asfaEmergency, vigilanceEmergency,
   *        railFactor (1 seco … 0,3 muy deslizante), rain (0…1), humidity (0…1), tempOut (°C), sun (0…1) } */
  function step(t, dt, env) {
    var s = t.spec, e = t.elec, air = t.air, c = t.controls;

    // --- Eléctrico ---
    var power = controlPower(t);
    e.battV = batteryVolts(t);
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
    stepBattery(t, dt);

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

    // --- Adherencia y arenado ---
    var vabs = Math.abs(t.v), vk = U.kmh(vabs), m = massT(t);
    stepSand(t, dt);
    var ad = t.adhesion;
    ad.railFactor = env.railFactor === undefined ? 1 : env.railFactor;
    ad.mu = adhesionCoef(t, vk, ad.railFactor, t.sand.active);
    ad.limitTr = ad.mu * m * s.adhesiveMassFraction * G;   // kN (t·m/s²)
    ad.limitBr = ad.mu * m * G;

    // --- Regulador de velocidad ---
    // Con el manipulador en tracción, el punto de tracción limita el esfuerzo y el regulador
    // pide tracción o freno para mantener la consigna. Freno o neutro en el manipulador lo anulan.
    var notch = c.lever > 0 ? c.lever : 0;
    var rg = t.reg, regBrake = 0, tracFrac = notch / s.tractionNotches;
    rg.active = rg.on && cab && notch > 0 && c.reverser !== 0 && !t.emergency.active;
    if (rg.active) {
      var err = rg.set_kmh - vk;
      if (Math.abs(err) < 6) rg.integ = U.clamp(rg.integ + err * dt, -30, 30);
      else rg.integ *= Math.max(0, 1 - dt);
      var u = 0.12 * err + 0.02 * rg.integ;
      rg.demand = u;
      tracFrac = U.clamp(u, 0, tracFrac);
      if (err < -1.5) regBrake = U.clamp((-err - 1.5) * 0.08, 0, s.regBrakeMax);
    } else { rg.integ = 0; rg.demand = 0; }
    rg.brake = regBrake;

    // --- Freno: eléctrico de recuperación mezclado con el neumático (EP) ---
    var leverBrake = (cab && c.lever < 0 && c.lever !== LEVER_EMERG) ? -c.lever / s.brakeNotches : 0;
    var brakeFrac = Math.max(leverBrake, regBrake);
    var fFull = m * s.emergencyDecel_ms2;                              // kN con el cilindro al máximo
    var fDemand = brakeFrac * (s.bcServiceMax_bar / s.bcMax_bar) * fFull;
    var edOk = e.disyuntor && e.lineV >= s.disyuntorMinLine_V && !t.emergency.active && c.reverser !== 0;
    var fade = U.clamp((vk - s.edFadeFrom_kmh) / (s.edFadeTo_kmh - s.edFadeFrom_kmh), 0, 1);
    var edAvail = edOk ? Math.min(s.edMax_kN, s.edPower_kW / Math.max(vabs, 0.1)) * fade : 0;
    t.edForce = U.approach(t.edForce, Math.min(fDemand, edAvail), s.edRamp_kNs, dt);
    if (t.edForce > edAvail) t.edForce = edAvail;
    // Cilindro de freno: máximo entre freno automático (TFA) y lo que el eléctrico no cubre
    var autoBc = U.clamp((s.tfaNominal_bar - air.tfa) * 2.6, 0, s.bcMax_bar);
    var epBc = Math.max(0, fDemand - t.edForce) / fFull * s.bcMax_bar;
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

    // --- Tracción (con control antipatinaje) ---
    var inhibits = tractionInhibits(t, env);
    var targetF = 0, wantF = 0;
    if (notch > 0 && inhibits.length === 0) {
      var fByPower = s.power_kW / Math.max(vabs, 1.0);
      wantF = tracFrac * Math.min(s.maxTractiveEffort_kN, fByPower);
      if (vk > s.vmax_kmh + 2) wantF = 0;       // limitador de velocidad de la unidad
      targetF = wantF;
      if (wantF > ad.limitTr) targetF = ad.limitTr * s.antiSlipMargin;
    }
    t.tractionForce = U.approach(t.tractionForce, targetF, targetF < t.tractionForce ? s.tractionRamp_kNs * 3 : s.tractionRamp_kNs, dt);
    // Lo que llega al carril nunca supera la adherencia: el exceso sólo hace patinar las ruedas
    var asked = Math.max(wantF, t.tractionForce);
    ad.slip = asked > ad.limitTr ? (asked - ad.limitTr) / asked : 0;
    if (ad.slip > 0.02 && !ad.slipping) emit(t, 'adh', 'Patinaje: el control antipatinaje reduce la tracción', 'warn');
    ad.slipping = ad.slip > 0.02;
    t.railForce = Math.min(t.tractionForce, ad.limitTr);

    // --- Dinámica longitudinal ---
    var meff = m * s.rotatingMassFactor;
    var fPneu = (air.bc / s.bcMax_bar) * fFull;          // kN
    var Fb = fPneu + t.edForce;
    // Antideslizamiento (WSP): si el freno pide más de lo que da la adherencia, se limita
    ad.slide = vabs > 0.5 && Fb > ad.limitBr ? (Fb - ad.limitBr) / Fb : 0;
    if (ad.slide > 0) Fb = ad.limitBr * s.wspMargin;
    if (ad.slide > 0.02 && !ad.sliding) emit(t, 'adh', 'Deslizamiento: el antideslizamiento limita el freno', 'warn');
    ad.sliding = ad.slide > 0.02;
    if (ad.slipping || ad.sliding) t.sand.auto = s.sandAutoTime_s;   // arenado automático
    t.brakeForce = Fb;
    t.pneuForce = ad.slide > 0 ? Fb * fPneu / (fPneu + t.edForce) : fPneu;
    if (air.parking) Fb += 90;                         // freno de muelle [Simplificado]
    var Rdavis = s.davis.A + s.davis.B * vk + s.davis.C * vk * vk;
    var Fgrade = m * G * (env.gradePermil || 0) / 1000;  // + se opone al avance hacia +x
    var Fdrive = t.railForce * c.reverser - Fgrade;       // fuerzas "activas"
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
    if (t.edForce > 0) t.energyRegen_kWh += t.edForce * Math.abs(t.v) * dt / 3600 * 0.85;

    // --- Sistemas de confort y visibilidad ---
    stepHvac(t, dt, env);
    stepScreen(t, dt, env, dx);

    if (air.parking && vabs > 0.5) emit(t, 'warn-parking', 'Circulando con freno de estacionamiento aplicado', 'warn');
    if (!doorsClosed(t) && vabs > 0.3) emit(t, 'warn-doors', 'Tren en marcha con puertas abiertas', 'alarm');

    return inhibits;
  }

  RC.core.train = {
    LEVER_EMERG: LEVER_EMERG,
    WIPER_NAMES: WIPER_NAMES,
    create: create,
    command: command,
    step: step,
    tractionInhibits: tractionInhibits,
    adhesionCoef: adhesionCoef,
    doorsClosed: doorsClosed,
    cabActive: cabActive,
    controlPower: controlPower,
    massT: massT,
    stopped: stopped
  };
})(globalThis.RC);
