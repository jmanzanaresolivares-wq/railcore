/* RAILCORE — Arranque de la aplicación, bucle principal y teclado. */
(function (RC) {
  var U = RC.core.util, S = RC.core.sim;
  var $ = function (id) { return document.getElementById(id); };

  var state = {
    sim: null, scenario: 'frio', paused: false, timeScale: 1,
    opts: { instructor: true, aids: true, sound: true, voice: true, auto: false, cab3d: true },
    scene3d: null,
    acc: 0, last: 0, realTime: 0, lastLogSeq: 0, ap: null, reportShown: false
  };
  var view = RC.ui.view.create($('view'));
  var audio = RC.ui.audio.create();
  var cab = RC.ui.cab.build($('desk'), send);

  function send(cmd) {
    if (!state.sim || state.paused) return;
    S.command(state.sim, cmd);
  }

  /* ---------- Pantalla de inicio ---------- */
  var SC_DESC = {
    frio: 'La unidad está apagada («cold and dark»). Prepárela paso a paso: baterías, aire, pantógrafo, disyuntor, ASFA… y salga a la hora prevista.',
    listo: 'Unidad preparada en Santa Justa, 90 s antes de la salida. Directo a conducir el servicio completo hasta Utrera.',
    dh: 'Servicio corto: Dos Hermanas → Utrera, 16 km de vía rápida. Ideal para practicar.'
  };
  var list = $('scenarioList');
  Object.keys(S.SCENARIOS).forEach(function (id) {
    var b = document.createElement('button');
    b.className = 'scn' + (id === state.scenario ? ' sel' : '');
    b.innerHTML = '<b>' + S.SCENARIOS[id].name + '</b><span>' + SC_DESC[id] + '</span>';
    b.onclick = function () { state.scenario = id; Array.prototype.forEach.call(list.children, function (c) { c.classList.remove('sel'); }); b.classList.add('sel'); };
    list.appendChild(b);
  });

  var KEYS = [
    ['W / ↑', 'Manipulador hacia TRACCIÓN (un punto)'],
    ['S / ↓', 'Manipulador hacia FRENO (un punto)'],
    ['N', 'Manipulador a NEUTRO (0)'],
    ['Retroceso', 'Manipulador a EMERGENCIA'],
    ['R / F', 'Inversor adelante / atrás (un paso)'],
    ['Q', 'ASFA: reconocer baliza'],
    ['E', 'ASFA: rearme de freno (tren parado)'],
    ['Espacio', 'Vigilancia (hombre muerto)'],
    ['Z / X', 'Abrir puertas izquierda / derecha'],
    ['C', 'Cerrar puertas'],
    ['H (mantener)', 'Bocina'],
    ['L', 'Faros (apagados / cruce / largo)'],
    ['B', 'Freno de estacionamiento (aplicar / aflojar)'],
    ['T', 'Acelerar el tiempo (×1, ×2, ×4)'],
    ['P / Esc', 'Pausa'],
    ['M', 'Silenciar sonido'],
    ['I', 'Mostrar / ocultar instructor'],
    ['F1', 'Esta ayuda'],
    ['V', 'Cambiar de vista: cabina / exterior (arrastre para girar, rueda para acercar) / junto a la vía'],
    ['1 / 2 / 3 / 4', 'Cabina 3D: mirar al frente / armario de servicios (izquierda) / pupitre / ventanilla'],
    ['Botón derecho (arrastrar)', 'Cabina 3D: mirar alrededor. Rueda: zoom (o mover el mando bajo el ratón)'],
    ['Ratón', 'Todos los mandos del pupitre se pueden pulsar. La rueda sobre el manipulador lo mueve.']
  ];
  $('helpContent').innerHTML = '<div class="keys">' + KEYS.map(function (k) { return '<div><kbd>' + k[0] + '</kbd></div><div>' + k[1] + '</div>'; }).join('') + '</div>' +
    '<p class="note">Consejo: en el escenario de arranque en frío, el panel «Instructor» de la derecha te guía paso a paso.</p>';

  function showDialog(id) {
    $('overlay').classList.remove('hidden');
    ['startDialog', 'helpDialog', 'reportDialog'].forEach(function (d) { $(d).classList.toggle('hidden', d !== id); });
  }
  function hideOverlay() { $('overlay').classList.add('hidden'); }

  $('btnStart').onclick = function () {
    state.opts.instructor = $('optInstructor').checked;
    state.opts.aids = $('optAids').checked;
    state.opts.sound = $('optSound').checked;
    state.opts.voice = $('optVoice').checked;
    state.opts.auto = $('optAuto').checked;
    state.opts.cab3d = $('optCab3d').checked && !!window.THREE;
    start();
  };
  $('btnCloseHelp').onclick = function () { if (state.sim) { hideOverlay(); state.paused = false; } else showDialog('startDialog'); };
  $('btnHelp').onclick = function () { state.paused = true; showDialog('helpDialog'); };
  $('btnPause').onclick = function () { togglePause(); };
  $('btnSpeed').onclick = function () { cycleSpeed(); };
  $('btnRadioReady').onclick = function () { send({ type: 'radioReady' }); };
  $('btnRestart').onclick = function () { showDialog('startDialog'); state.sim = null; };
  $('btnContinue').onclick = function () { hideOverlay(); };

  function start() {
    RC.ui.audio.init(audio);
    audio.enabled = state.opts.sound; audio.voice = state.opts.voice && state.opts.sound;
    if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
    state.sim = S.create(state.scenario, { departure: $('optHour').value });
    document.body.classList.toggle('mode3d', state.opts.cab3d);
    if (state.opts.cab3d) {
      try {
        if (!state.scene3d) state.scene3d = RC.ui3d.scene.create($('view3d'), state.sim, send, state.opts);
        RC.ui3d.scene.setSim(state.scene3d, state.sim);
        state.scene3d.setView(0);
      } catch (err) {
        console.error(err);
        state.opts.cab3d = false; document.body.classList.remove('mode3d');
        toast('No se pudo iniciar la cabina 3D en este equipo: se usa la vista clásica', 'warn');
      }
    }
    state.ap = state.opts.auto ? RC.core.autopilot.create({ cold: state.scenario === 'frio' }) : null;
    state.paused = false; state.timeScale = 1; state.acc = 0; state.reportShown = false; state.lastLogSeq = 0;
    $('btnSpeed').textContent = 'Tiempo ×1 (T)';
    $('instructorCard').style.display = state.opts.instructor ? '' : 'none';
    $('log').innerHTML = ''; $('radio').innerHTML = ''; $('toast').innerHTML = '';
    hideOverlay();
  }

  function togglePause() {
    if (!state.sim) return;
    state.paused = !state.paused;
    $('btnPause').textContent = state.paused ? 'Seguir (P)' : 'Pausa (P)';
  }
  function cycleSpeed() {
    state.timeScale = state.timeScale === 1 ? 2 : state.timeScale === 2 ? 4 : 1;
    $('btnSpeed').textContent = 'Tiempo ×' + state.timeScale + ' (T)';
  }

  /* ---------- Teclado ---------- */
  var down = {};
  window.addEventListener('keydown', function (e) {
    if (e.key === 'F1') { e.preventDefault(); state.paused = true; showDialog('helpDialog'); return; }
    if (!state.sim) return;
    var k = e.key.toLowerCase();
    if (e.repeat && k !== 'w' && k !== 's' && k !== 'arrowup' && k !== 'arrowdown') return;
    if (k === 'p' || k === 'escape') { togglePause(); return; }
    if (k === 'm') { audio.enabled = !audio.enabled; toast(audio.enabled ? 'Sonido activado' : 'Sonido silenciado', 'info'); return; }
    if (k === 'i') { state.opts.instructor = !state.opts.instructor; $('instructorCard').style.display = state.opts.instructor ? '' : 'none'; return; }
    if (k === 't') { cycleSpeed(); return; }
    if (state.scene3d && state.opts.cab3d && ['1', '2', '3', '4'].indexOf(k) >= 0) {
      if (state.scene3d.ext.mode) state.scene3d.setExterior(0);
      state.scene3d.setView(+k - 1); return;
    }
    if (k === 'v' && state.scene3d && state.opts.cab3d) { toast('Vista: ' + state.scene3d.cycleView(), 'info'); return; }
    var t = state.sim.train;
    var map = {
      'w': { type: 'leverStep', delta: 1 }, 'arrowup': { type: 'leverStep', delta: 1 },
      's': { type: 'leverStep', delta: -1 }, 'arrowdown': { type: 'leverStep', delta: -1 },
      'n': { type: 'lever', pos: 0 }, 'backspace': { type: 'lever', pos: -8 },
      'r': { type: 'reverser', pos: Math.min(1, t.controls.reverser + 1) },
      'f': { type: 'reverser', pos: Math.max(-1, t.controls.reverser - 1) },
      'q': { type: 'asfa:recAnPar' }, 'e': { type: 'asfa:rearme' }, ' ': { type: 'vigil' },
      'z': { type: 'doors', side: 'left', action: 'open' }, 'x': { type: 'doors', side: 'right', action: 'open' },
      'c': { type: 'doors', action: 'close' },
      'l': { type: 'headlights', mode: (t.controls.headlights + 1) % 3 },
      'b': { type: 'parking', apply: !t.air.parking }
    };
    if (k === 'h') { if (!down.h) send({ type: 'horn', on: true }); down.h = true; e.preventDefault(); return; }
    if (map[k]) { e.preventDefault(); send(map[k]); }
  });
  window.addEventListener('keyup', function (e) {
    if (e.key.toLowerCase() === 'h') { down.h = false; send({ type: 'horn', on: false }); }
  });

  /* ---------- Interfaz lateral ---------- */
  function toast(msg, cls) {
    var d = document.createElement('div');
    d.className = 'toast ' + (cls || ''); d.textContent = msg;
    $('toast').appendChild(d);
    setTimeout(function () { d.remove(); }, 4600);
    while ($('toast').children.length > 4) $('toast').firstChild.remove();
  }

  function renderSide(sim) {
    $('clock').textContent = U.fmtClock(sim.clock);
    $('trainInfo').textContent = 'Tren ' + sim.line.trainNumber + ' · ' + sim.spec.name;
    var i = sim.nextStation, tt = sim.timetable;
    var d = '';
    if (i < tt.length) {
      var ref = sim.atStation >= 0 ? tt[i].dep : tt[i].arr;
      if (ref !== null) {
        var delay = sim.clock - ref;
        if (sim.atStation >= 0) d = 'Salida ' + U.fmtClock(ref) + (delay > 0 ? ' · <b class="late">' + U.fmtDelay(delay) + '</b>' : ' · faltan ' + Math.ceil(-delay) + ' s');
        else {
          var dist = sim.line.stations[i].stopX - sim.train.x;
          d = 'Próxima: ' + sim.line.stations[i].name + ' ' + U.fmtClock(ref) + ' · ' + (dist / 1000).toFixed(2) + ' km';
        }
      }
    }
    d += ' · Puntos: ' + Math.round(sim.score);
    if ($('delayInfo')._h !== d) { $('delayInfo').innerHTML = d; $('delayInfo')._h = d; }

    var rows = tt.map(function (r, k) {
      var ss = sim.stations[k];
      var cls = k < sim.nextStation ? 'done' : k === sim.nextStation ? 'next' : '';
      var real = ss.arrTime && k > 0 ? U.fmtClock(ss.arrTime).slice(0, 5) : '';
      return '<tr class="' + cls + '"><td>' + r.name + '</td><td class="t">' + (r.arr ? U.fmtClock(r.arr).slice(0, 5) : '') + '</td><td class="t">' + (r.dep ? U.fmtClock(r.dep).slice(0, 5) : '') + '</td><td class="t">' + real + '</td></tr>';
    }).join('');
    var html = '<tr><td></td><td class="t">Lleg.</td><td class="t">Sal.</td><td class="t">Real</td></tr>' + rows;
    if ($('roster')._h !== html) { $('roster').innerHTML = html; $('roster')._h = html; }

    // Nuevas entradas del registro
    var logEl = $('log'), radioEl = $('radio');
    sim.log.forEach(function (e) {
      if (e.seq <= state.lastLogSeq) return;
      if (e.type === 'asfa-beacon') return;
      var div = document.createElement('div');
      div.className = 'e ' + e.severity;
      div.innerHTML = '<span class="t">' + U.fmtClock(e.t) + '</span>';
      div.appendChild(document.createTextNode(e.msg));
      logEl.appendChild(div);
      if (e.type === 'radio') {
        var r = sim.radio[sim.radio.length - 1];
        var m = document.createElement('div'); m.className = 'msg';
        var parts = e.msg.split(': ');
        m.innerHTML = '<span class="from">' + U.fmtClock(e.t).slice(0, 5) + ' ' + parts.shift() + ':</span> ';
        m.appendChild(document.createTextNode(parts.join(': ')));
        radioEl.appendChild(m); radioEl.scrollTop = 1e6;
      }
      if (e.severity === 'alarm' || e.severity === 'fault' || e.severity === 'radio' || (e.severity === 'warn' && e.type !== 'vigil') || e.type === 'station') toast(e.msg, e.severity);
    });
    if (sim.log.length) state.lastLogSeq = sim.log[sim.log.length - 1].seq;
    while (logEl.children.length > 150) logEl.firstChild.remove();
    logEl.scrollTop = 1e6;
    $('btnRadioReady').disabled = !!sim.radioFlags.ready;
  }

  function renderHud(sim) {
    var t = sim.train, parts = [];
    var vk = Math.round(U.kmh(Math.abs(t.v)));
    parts.push('<div class="hudbox"><span class="lbl">Velocidad</span>' + vk + ' km/h</div>');
    if (state.opts.aids) {
      var lim = RC.core.timetable.trackLimitKmh(sim.line, t.x, sim.spec.length_m);
      parts.push('<div class="hudbox"><span class="lbl">Máx. vía</span>' + lim + '</div>');
      var nx = RC.core.timetable.nextLimitChange(sim.line, t.x, 2000);
      if (nx) parts.push('<div class="hudbox"><span class="lbl">Siguiente</span>' + nx.kmh + ' a ' + Math.round(nx.dist) + ' m</div>');
      var sig = sim.signals.filter(function (s) { return s.x > t.x; })[0];
      if (sig && sig.x - t.x < 1500) parts.push('<div class="hudbox"><span class="lbl">Señal ' + sig.name + '</span>' + sig.aspect.toUpperCase() + ' · ' + Math.round(sig.x - t.x) + ' m</div>');
    }
    if (state.paused) parts.push('<div class="hudbox" style="color:#f2a93b">PAUSA</div>');
    if (state.timeScale > 1) parts.push('<div class="hudbox">Tiempo ×' + state.timeScale + '</div>');
    if (state.ap) parts.push('<div class="hudbox" style="color:#5aa9ff">DEMOSTRACIÓN</div>');
    var html = parts.join('');
    if ($('hud')._h !== html) { $('hud').innerHTML = html; $('hud')._h = html; }
  }

  function showReport(sim) {
    var r = RC.core.report.build(sim);
    var startIdx = S.SCENARIOS[sim.scenario].startStation;
    var gcls = r.grade === 'EXCELENTE' || r.grade === 'APTO' ? 'ok' : r.grade === 'NO APTO' ? 'bad' : 'mid';
    var html = '<div class="report"><h2>' + r.title + '</h2><div class="stats"><span>Tren ' + r.train + '</span><span>' + r.scenario + '</span><span>' + r.reason + '</span></div>' +
      '<div class="grade ' + gcls + '">' + r.grade + ' · ' + r.score + ' / 1000</div>' +
      '<div class="stats"><span>Recorrido: ' + r.distance_km.toFixed(2) + ' km</span><span>Energía: ' + r.energy_kWh.toFixed(0) + ' kWh</span><span>V. máx: ' + Math.round(r.maxKmh) + ' km/h</span><span>Duración: ' + Math.round(r.duration / 60) + ' min</span></div>' +
      '<table><tr><th>Estación</th><th>Llegada prevista</th><th>Llegada real</th><th>Desvío</th><th>Suben/bajan</th></tr>' +
      r.rows.slice(startIdx).map(function (row) {
        return '<tr><td>' + row.name + '</td><td>' + (row.arrPlan ? U.fmtClock(row.arrPlan) : '—') + '</td><td>' + (row.arr ? U.fmtClock(row.arr) : row.skipped ? 'NO PARÓ' : '—') + '</td><td>' + (row.delayArr !== null ? U.fmtDelay(row.delayArr) : '') + '</td><td>' + row.boarded + ' / ' + row.alighted + '</td></tr>';
      }).join('') + '</table>' +
      '<h3>Incidencias (' + r.faults.length + ')</h3>' +
      (r.faults.length ? '<table>' + r.faults.map(function (f) { return '<tr><td>' + U.fmtClock(f.t) + '</td><td>' + U.fmtKm(f.x) + '</td><td>' + f.msg + '</td><td>−' + f.points + '</td></tr>'; }).join('') + '</table>' : '<p>Ninguna.</p>') +
      '<h3>Observaciones</h3><ul>' + r.comments.map(function (c) { return '<li>' + c + '</li>'; }).join('') + '</ul></div>';
    $('reportContent').innerHTML = html;
    showDialog('reportDialog');
  }

  /* ---------- Bucle principal ---------- */
  function frame(now) {
    requestAnimationFrame(frame);
    var dtReal = Math.min(0.1, (now - (state.last || now)) / 1000);
    state.last = now; state.realTime += dtReal;
    var sim = state.sim;
    if (!sim) return;
    if (!state.paused && !sim.finished) {
      state.acc += dtReal * state.timeScale;
      var n = 0;
      while (state.acc >= S.DT && n < 400) {
        if (state.ap) RC.core.autopilot.act(state.ap, sim);
        S.step(sim); state.acc -= S.DT; n++;
      }
    }
    if (state.opts.cab3d && state.scene3d) RC.ui3d.scene.render(state.scene3d, sim, state.opts, dtReal, state.realTime);
    else RC.ui.view.render(view, sim, state.opts, state.realTime);
    RC.ui.map.render($('map'), sim);
    if (!state.opts.cab3d) cab.update(sim, state.opts);
    renderSide(sim);
    renderHud(sim);
    RC.ui.instructor.render($('instructor'), sim, state.opts.instructor);
    RC.ui.audio.update(audio, sim, state.realTime, state.paused || sim.finished);
    if (sim.finished && !state.reportShown) { state.reportShown = true; setTimeout(function () { showReport(sim); }, 1200); }
  }

  // Botón para terminar el servicio y ver el informe en cualquier momento
  var endBtn = document.createElement('button');
  endBtn.className = 'small'; endBtn.textContent = 'Terminar e informe';
  endBtn.onclick = function () { if (state.sim) { send({ type: 'finish' }); } };
  document.querySelector('.clock-card .row').appendChild(endBtn);

  // Primer dibujo con un escenario de fondo para que la pantalla no esté vacía
  state.sim = S.create('listo');
  RC.ui.view.render(view, state.sim, state.opts, 0);
  RC.ui.map.render($('map'), state.sim);
  cab.update(state.sim, state.opts);
  state.sim = null;
  showDialog('startDialog');
  requestAnimationFrame(frame);

  RC.ui.state = state;
})(globalThis.RC);
