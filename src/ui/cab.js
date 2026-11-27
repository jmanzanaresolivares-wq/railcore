/* RAILCORE — Pupitre de la Civia (interfaz). Cada mando envía una orden al
 * núcleo y muestra el estado REAL del sistema, no el de la interfaz. */
(function (RC) {
  var U = RC.core.util;

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function build(root, send) {
    root.innerHTML = '';
    var ui = { ctl: {}, lamps: {}, bars: {} };

    function panel(title) { var p = el('div', 'pnl'); p.appendChild(el('h4', null, title)); root.appendChild(p); return p; }
    function ctl(parent, id, label, onClick, cls) {
      var b = el('button', 'ctl' + (cls ? ' ' + cls : ''), label + '<span class="st"></span>');
      b.addEventListener('mousedown', function (ev) { ev.preventDefault(); onClick(true); });
      b.addEventListener('mouseup', function () { onClick(false); });
      b.addEventListener('mouseleave', function () { onClick(false, true); });
      parent.appendChild(b); ui.ctl[id] = b; return b;
    }
    function click(fn) { return function (down) { if (down) fn(); }; }

    // --- Servicios ---
    var p1 = panel('Servicios');
    var g1 = el('div', 'grid2'); p1.appendChild(g1);
    var T = function () { return ui.sim.train; };
    ctl(g1, 'battery', 'Baterías', click(function () { send({ type: 'battery', on: !T().elec.battery }); }));
    ctl(g1, 'cabKey', 'Llave de cabina', click(function () { send({ type: 'cabKey', on: !T().elec.cabKey }); }));
    ctl(g1, 'aux', 'Compresor auxiliar', click(function () { send({ type: 'auxCompressor', on: !T().elec.auxCompressor }); }));
    ctl(g1, 'panto', 'Pantógrafo', click(function () { send({ type: 'panto', up: !T().elec.pantoCmd }); }));
    ctl(g1, 'disy', 'Disyuntor', click(function () { send({ type: 'disyuntor', close: !T().elec.disyuntor }); }));
    ctl(g1, 'comp', 'Compresor principal', click(function () { send({ type: 'mainCompressor', mode: T().elec.mainCompSwitch === 'auto' ? 'off' : 'auto' }); }));
    ctl(g1, 'parking', 'Freno estacionam.', click(function () { send({ type: 'parking', apply: !T().air.parking }); }));
    ctl(g1, 'lights', 'Faros', click(function () { send({ type: 'headlights', mode: (T().controls.headlights + 1) % 3 }); }));
    ctl(g1, 'cabLight', 'Alumbrado cabina', click(function () { send({ type: 'cabLight', on: !T().controls.cabLight }); }));
    ctl(g1, 'wipers', 'Limpiaparabrisas', click(function () { send({ type: 'wipers', on: !T().controls.wipers }); }));

    // --- Instrumentos ---
    var p2 = panel('Instrumentos');
    var gz = el('div', 'gauges'); p2.appendChild(gz);
    var sp = el('canvas'); sp.width = 340; sp.height = 340; sp.style.width = '150px'; sp.style.height = '150px';
    gz.appendChild(sp); ui.speedo = sp;
    var bars = el('div', 'bars'); gz.appendChild(bars);
    [['mr', 'Dep. principal', 'air'], ['tfa', 'Tub. freno (TFA)', 'air'], ['bc', 'Cil. freno', 'bc'], ['pres', 'Dep. pantógrafo', 'air'],
     ['line', 'Catenaria', 'el'], ['batt', 'Baterías', 'el'], ['force', 'Esfuerzo', 'tr']].forEach(function (b) {
      bars.appendChild(el('span', null, b[1]));
      var bar = el('div', 'bar ' + b[2]); var fill = el('i'); bar.appendChild(fill); bars.appendChild(bar);
      var v = el('span', 'v'); bars.appendChild(v);
      ui.bars[b[0]] = { fill: fill, v: v };
    });
    var lamps = el('div', 'lamps'); p2.appendChild(lamps);
    [['disy', 'DISYUNTOR'], ['panto', 'PANTÓG.'], ['comp', 'COMPRESOR'], ['doors', 'PUERTAS'], ['park', 'F. ESTAC.'], ['emerg', 'EMERGENCIA'], ['vigil', 'H. MUERTO'], ['trac', 'TRACCIÓN']].forEach(function (l) {
      var d = el('div', 'lamp', l[1]); lamps.appendChild(d); ui.lamps[l[0]] = d;
    });
    ui.inhibit = el('div', 'inhibit'); p2.appendChild(ui.inhibit);

    // --- Manipulador combinado e inversor ---
    var p3 = panel('Manipulador');
    var row = el('div', 'row'); row.style.marginTop = '0'; p3.appendChild(row);
    var lever = el('div'); lever.id = 'lever'; row.appendChild(lever);
    ui.leverBtns = {};
    for (var n = 6; n >= -8; n--) {
      var lab = n > 0 ? 'T' + n : n === 0 ? '0 — NEUTRO' : n === -8 ? 'EMERGENCIA' : 'F' + (-n);
      var b = el('button', n > 0 ? 'tr' : n === -8 ? 'em' : n < 0 ? 'br' : '', lab);
      (function (pos) { b.addEventListener('mousedown', function (e) { e.preventDefault(); send({ type: 'lever', pos: pos }); }); })(n);
      lever.appendChild(b); ui.leverBtns[n] = b;
    }
    lever.addEventListener('wheel', function (e) { e.preventDefault(); send({ type: 'leverStep', delta: e.deltaY < 0 ? 1 : -1 }); });
    var rev = el('div'); rev.style.display = 'flex'; rev.style.flexDirection = 'column'; rev.style.gap = '5px'; row.appendChild(rev);
    rev.appendChild(el('h4', null, 'Inversor'));
    [[1, 'Adelante'], [0, 'Neutro'], [-1, 'Atrás']].forEach(function (r) {
      ctl(rev, 'rev' + r[0], r[1], click(function () { send({ type: 'reverser', pos: r[0] }); }));
    });
    rev.appendChild(el('h4', null, 'Viajeros'));
    ui.pax = el('div', null, '0'); ui.pax.style.fontSize = '18px'; ui.pax.style.fontWeight = '700'; rev.appendChild(ui.pax);

    // --- ASFA Digital ---
    var p4 = panel('ASFA Digital');
    ui.lcd = el('div', 'lcd'); p4.appendChild(ui.lcd);
    var g4 = el('div', 'grid2'); p4.appendChild(g4);
    ctl(g4, 'conex', 'Conexión', click(function () { send({ type: 'asfa:conex' }); }));
    ctl(g4, 'rec', 'Reconocer (Q)', click(function () { send({ type: 'asfa:recAnPar' }); }));
    ctl(g4, 'rebase', 'Rebase autoriz.', click(function () { send({ type: 'asfa:rebase' }); }));
    ctl(g4, 'rearme', 'Rearme freno (E)', click(function () { send({ type: 'asfa:rearme' }); }));

    // --- Puertas y seguridad ---
    var p5 = panel('Puertas y seguridad');
    var g5 = el('div', 'grid2'); p5.appendChild(g5);
    ctl(g5, 'doorL', 'Abrir izquierda', click(function () { send({ type: 'doors', side: 'left', action: 'open' }); }));
    ctl(g5, 'doorR', 'Abrir derecha', click(function () { send({ type: 'doors', side: 'right', action: 'open' }); }));
    ctl(g5, 'doorC', 'Cerrar puertas', click(function () { send({ type: 'doors', action: 'close' }); }));
    ctl(g5, 'horn', 'Bocina (H)', function (down) { send({ type: 'horn', on: !!down }); });
    ctl(g5, 'vigil', 'Vigilancia (Espacio)', click(function () { send({ type: 'vigil' }); }));
    ctl(g5, 'emReset', 'Rearme emergencia', click(function () { send({ type: 'emergencyReset' }); }));
    ctl(g5, 'seta', 'SETA EMERGENCIA', click(function () { send({ type: 'seta', on: !T().controls.seta }); }), 'danger');

    // --- Sistemas de cabina ---
    var p6 = panel('Sistemas');
    var g6 = el('div', 'grid2'); p6.appendChild(g6);
    ctl(g6, 'sand', 'Arenado (A)', function (down) { send({ type: 'sand', on: !!down }); });
    ctl(g6, 'hornLow', 'Bocina baja (J)', function (down) { send({ type: 'horn', on: !!down, tone: 'baja' }); });
    ctl(g6, 'reg', 'Regulador (G)', click(function () { send({ type: 'regulator', on: !T().reg.on }); }));
    ctl(g6, 'regSet', 'Consigna +5 (+)', click(function () { var r = T().reg; send({ type: 'regulatorSet', kmh: r.set_kmh >= T().spec.vmax_kmh ? 30 : r.set_kmh + 5 }); }));
    ctl(g6, 'washer', 'Lavaparabrisas', click(function () { send({ type: 'washer' }); }));
    ctl(g6, 'demister', 'Luneta (D)', click(function () { send({ type: 'demister', on: !T().controls.demister }); }));
    ctl(g6, 'hvacSalon', 'Clima salón', click(function () { send({ type: 'hvacSalon', on: !T().hvac.salonOn }); }));
    ctl(g6, 'pa', 'Megafonía (F2)', click(function () { send({ type: 'pa', msg: 'next' }); }));
    ctl(g6, 'radioCall', 'Radio P. Mando (F4)', click(function () { send({ type: 'radio:call' }); }));
    ctl(g6, 'radioCh', 'Canal radio (F8)', click(function () { send({ type: 'radio:channel', delta: 1 }); }));

    ui.update = function (sim, opts) { update(ui, sim, opts || {}); };
    return ui;
  }

  function setCtl(b, on, status, flash) {
    if (!b) return;
    b.classList.toggle('on', !!on);
    b.classList.toggle('flash', !!flash);
    var st = b.querySelector('.st');
    if (st && st.textContent !== status) st.textContent = status || '';
  }
  function lamp(d, cls, blink) {
    var c = 'lamp' + (cls ? ' ' + cls : '') + (blink ? ' blink' : '');
    if (d.className !== c) d.className = c;
  }
  function setBar(b, frac, text) {
    b.fill.style.width = (U.clamp(frac, 0, 1) * 100).toFixed(1) + '%';
    if (b.v.textContent !== text) b.v.textContent = text;
  }

  function update(ui, sim, opts) {
    ui.sim = sim;
    var t = sim.train, e = t.elec, a = t.air, c = t.controls, asfa = sim.asfa;
    var power = RC.core.train.controlPower(t), cab = RC.core.train.cabActive(t);
    var C = ui.ctl;
    setCtl(C.battery, e.battery, e.battery ? e.battV.toFixed(0) + ' V' : 'Desconectadas');
    setCtl(C.cabKey, e.cabKey, e.cabKey ? 'Habilitada' : 'Retirada');
    setCtl(C.aux, e.auxCompressor, e.auxCompressor ? 'En marcha' : 'Parado');
    setCtl(C.panto, e.pantoPos >= 1, e.pantoPos >= 1 ? 'Arriba (en contacto)' : e.pantoPos > 0 ? (e.pantoCmd ? 'Subiendo…' : 'Bajando…') : 'Abajo');
    setCtl(C.disy, e.disyuntor, e.disyuntor ? 'Cerrado' : 'Abierto');
    setCtl(C.comp, e.mainCompRunning, e.mainCompSwitch === 'auto' ? (e.mainCompRunning ? 'Auto · comprimiendo' : 'Auto') : 'Desconectado');
    setCtl(C.parking, !a.parking, a.parking ? 'Aplicado' : 'Aflojado');
    setCtl(C.lights, c.headlights > 0, ['Apagados', 'Cruce', 'Largo alcance'][c.headlights]);
    setCtl(C.cabLight, c.cabLight, c.cabLight ? 'Encendido' : 'Apagado');
    setCtl(C.wipers, c.wipers, RC.core.train.WIPER_NAMES[c.wipers]);
    setCtl(C.sand, t.sand.active, Math.round(t.sand.kg) + ' kg' + (t.sand.active ? ' · arenando' : ''));
    setCtl(C.hornLow, c.hornLow, '');
    setCtl(C.reg, t.reg.on, t.reg.on ? t.reg.set_kmh + ' km/h' + (t.reg.active ? ' · activo' : '') : 'Desconectado');
    setCtl(C.regSet, false, 'Consigna ' + t.reg.set_kmh);
    setCtl(C.washer, c.washer > 0, t.screen.washerL.toFixed(1) + ' L');
    setCtl(C.demister, c.demister, 'Vaho ' + Math.round(t.screen.fog * 100) + ' %');
    setCtl(C.hvacSalon, t.hvac.salonOn, t.hvac.salonT.toFixed(1) + ' °C');
    setCtl(C.pa, !!sim.pa.active, sim.pa.active ? 'Emitiendo' : '');
    setCtl(C.radioCall, sim.comms.state !== 'reposo', sim.comms.state);
    setCtl(C.radioCh, sim.comms.channel === sim.comms.zone, 'Canal ' + sim.comms.channel + (sim.comms.channel !== sim.comms.zone ? ' (zona ' + sim.comms.zone + ')' : ''), sim.comms.channel !== sim.comms.zone);
    setCtl(C.rev1, c.reverser === 1, ''); setCtl(C.rev0, c.reverser === 0, ''); setCtl(C['rev-1'], c.reverser === -1, '');
    setCtl(C.doorL, t.doors.left > 0, t.doors.left >= 1 ? 'Abiertas' : t.doors.left > 0 ? 'Moviéndose' : '');
    setCtl(C.doorR, t.doors.right > 0, t.doors.right >= 1 ? 'Abiertas' : t.doors.right > 0 ? 'Moviéndose' : '');
    setCtl(C.horn, c.horn, '');
    setCtl(C.vigil, false, sim.vigil.warning ? '¡PULSE YA!' : '', sim.vigil.warning || sim.vigil.emergency);
    setCtl(C.emReset, false, t.emergency.active ? 'Pendiente' : '', t.emergency.active && RC.core.train.stopped(t));
    setCtl(C.seta, c.seta, c.seta ? 'PULSADA' : '');
    setCtl(C.conex, asfa.connected, asfa.testing > 0 ? 'Autotest…' : asfa.connected ? 'Conectado' : 'Desconectado');
    setCtl(C.rec, false, asfa.pendingRec ? '¡RECONOCER!' : '', !!asfa.pendingRec);
    setCtl(C.rebase, asfa.rebaseRemaining > 0, asfa.rebaseRemaining > 0 ? Math.ceil(asfa.rebaseRemaining) + ' s' : '');
    setCtl(C.rearme, false, asfa.emergency ? 'Necesario' : '', asfa.emergency && RC.core.train.stopped(t));

    for (var n in ui.leverBtns) ui.leverBtns[n].classList.toggle('cur', +n === c.lever);

    setBar(ui.bars.mr, a.mr / 12, a.mr.toFixed(1) + ' bar');
    setBar(ui.bars.tfa, a.tfa / 6, a.tfa.toFixed(1) + ' bar');
    setBar(ui.bars.bc, a.bc / 4, a.bc.toFixed(1) + ' bar');
    setBar(ui.bars.pres, a.panto / 8, a.panto.toFixed(1) + ' bar');
    setBar(ui.bars.line, e.lineV / 4000, e.lineV.toFixed(0) + ' V');
    setBar(ui.bars.batt, e.battV / 100, e.battV.toFixed(0) + ' V');
    var force = t.tractionForce > 0.5 ? t.tractionForce : -t.brakeForce;
    setBar(ui.bars.force, Math.abs(force) / 200, (force >= 0 ? '+' : '') + force.toFixed(0) + ' kN');
    ui.bars.force.fill.style.background = force >= 0 ? 'var(--green)' : 'var(--red)';

    var L = ui.lamps;
    lamp(L.disy, !power ? '' : e.disyuntor ? 'g' : 'r');
    lamp(L.panto, !power ? '' : e.pantoPos >= 1 ? 'g' : e.pantoPos > 0 ? 'y' : 'r');
    lamp(L.comp, !power ? '' : e.mainCompRunning ? 'y' : '');
    lamp(L.doors, !power ? '' : RC.core.train.doorsClosed(t) ? 'g' : 'r', !RC.core.train.doorsClosed(t));
    lamp(L.park, !power ? '' : a.parking ? 'r' : '');
    lamp(L.emerg, !power ? '' : t.emergency.active ? 'r' : '', t.emergency.active);
    lamp(L.vigil, !power ? '' : sim.vigil.emergency ? 'r' : sim.vigil.warning ? 'y' : '', sim.vigil.warning);
    var inh = sim.inhibits || [];
    lamp(L.trac, !power ? '' : inh.length ? 'r' : t.tractionForce > 1 ? 'g' : '');
    var txt = power && inh.length ? 'Tracción bloqueada: ' + inh.join(' · ') : '';
    if (ui.inhibit.textContent !== txt) ui.inhibit.textContent = txt;
    ui.pax.textContent = t.passengers;

    drawLcd(ui, sim, cab);
    drawSpeedo(ui.speedo, sim, opts);
  }

  function drawLcd(ui, sim, cab) {
    var a = sim.asfa, lcd = ui.lcd, html, cls = 'lcd';
    if (!cab) { cls += ' off'; html = ''; }
    else if (a.testing > 0) html = '<div class="big">AUTOTEST</div>ASFA DIGITAL<br>Comprobando…';
    else if (!a.connected) html = '<div class="big">DESCONECTADO</div>Pulse CONEXIÓN<br>' + RC.data.asfa.trainType;
    else if (a.emergency) { cls += ' alarm'; html = '<div class="big">FRENO URG.</div>' + a.emergencyReason + '<br>Parar y REARME'; }
    else {
      var ctrl = a.control ? RC.data.asfa.codes[a.control.code].name.toUpperCase() : 'SIN CONTROL';
      html = '<div class="big">V.CTRL ' + Math.round(a.limit_kmh) + '</div>' + ctrl +
        (a.control ? ' → ' + a.control.vFinal + ' km/h' : '') +
        '<br>' + RC.data.asfa.trainType + (a.lastBeacon ? ' · Últ. baliza ' + a.lastBeacon : '') +
        (a.pendingRec ? '<br>◆ RECONOCER ' + Math.max(0, a.pendingRec.remaining).toFixed(1) + ' s' : '') +
        (a.rebaseRemaining > 0 ? '<br>REBASE AUTORIZADO' : '');
    }
    if (lcd.className !== cls) lcd.className = cls;
    if (lcd._h !== html) { lcd.innerHTML = html; lcd._h = html; }
  }

  function drawSpeedo(cv, sim, opts) {
    var g = cv.getContext('2d'), W = cv.width, cx = W / 2, cy = W / 2, R = W / 2 - 14;
    var t = sim.train, power = RC.core.train.cabActive(t);
    var vk = U.kmh(Math.abs(t.v)), VMAX = 140;
    var ang = function (v) { return Math.PI * 0.75 + (v / VMAX) * Math.PI * 1.5; };
    g.clearRect(0, 0, W, W);
    g.fillStyle = '#0b0e11'; g.beginPath(); g.arc(cx, cy, R + 10, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#333c45'; g.lineWidth = 4; g.stroke();
    // Zona de límite de vía
    if (opts.aids) {
      var lim = RC.core.timetable.trackLimitKmh(sim.line, t.x, sim.spec.length_m);
      g.strokeStyle = 'rgba(242,169,59,.55)'; g.lineWidth = 10;
      g.beginPath(); g.arc(cx, cy, R - 6, ang(lim), ang(VMAX)); g.stroke();
    }
    g.lineWidth = 3; g.strokeStyle = '#cfd8e0'; g.fillStyle = '#cfd8e0';
    g.font = 'bold 22px Segoe UI, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (var v = 0; v <= VMAX; v += 10) {
      var a = ang(v), major = v % 20 === 0;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * (R - (major ? 22 : 12)), cy + Math.sin(a) * (R - (major ? 22 : 12)));
      g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.stroke();
      if (major) g.fillText(v, cx + Math.cos(a) * (R - 44), cy + Math.sin(a) * (R - 44));
    }
    if (!power) { g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.arc(cx, cy, R + 10, 0, Math.PI * 2); g.fill(); return; }
    // Marca ASFA
    if (sim.asfa.connected) {
      var al = ang(Math.min(VMAX, sim.asfa.limit_kmh));
      g.fillStyle = sim.asfa.warning ? '#ffd84d' : '#ff4d4d';
      g.beginPath();
      g.moveTo(cx + Math.cos(al) * (R + 8), cy + Math.sin(al) * (R + 8));
      g.lineTo(cx + Math.cos(al - 0.06) * (R - 16), cy + Math.sin(al - 0.06) * (R - 16));
      g.lineTo(cx + Math.cos(al + 0.06) * (R - 16), cy + Math.sin(al + 0.06) * (R - 16));
      g.fill();
    }
    // Aguja
    var na = ang(Math.min(VMAX + 4, vk));
    g.strokeStyle = '#f2a93b'; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx - Math.cos(na) * 18, cy - Math.sin(na) * 18); g.lineTo(cx + Math.cos(na) * (R - 16), cy + Math.sin(na) * (R - 16)); g.stroke();
    g.fillStyle = '#f2a93b'; g.beginPath(); g.arc(cx, cy, 12, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 44px Consolas, monospace';
    g.fillText(Math.round(vk), cx, cy + R * 0.48);
    g.font = '18px Segoe UI'; g.fillStyle = '#8b98a5'; g.fillText('km/h', cx, cy + R * 0.7);
  }

  RC.ui.cab = { build: build };
})(globalThis.RC);
