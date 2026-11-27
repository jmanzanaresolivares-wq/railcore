/* RAILCORE — Pantallas e instrumentos de la cabina 3D, dibujados en canvas
 * y usados como texturas. Muestran SIEMPRE el estado real de la simulación.
 * Cada función redibuja sólo cuando cambia lo que enseña (clave en d.last). */
(function (RC) {
  var U = RC.core.util, TR = RC.core.train;
  var FONT = 'Segoe UI, Arial, Helvetica, sans-serif', MONO = 'Consolas, "DejaVu Sans Mono", "Liberation Mono", monospace';

  function make(w, h) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return { c: c, g: c.getContext('2d'), tex: t, w: w, h: h, last: '', stamp: 0 };
  }

  function off(d, msg) {
    var g = d.g; g.fillStyle = '#050607'; g.fillRect(0, 0, d.w, d.h);
    if (msg) { g.fillStyle = '#1a1d20'; g.font = '20px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(msg, d.w / 2, d.h / 2); }
  }
  /* Apaga la pantalla una sola vez (no vuelve a subir la textura mientras siga apagada). */
  function offOnce(d, msg) {
    if (d.last === 'off') return true;
    d.last = 'off'; off(d, msg); d.tex.needsUpdate = true; return true;
  }
  function txt(g, s, x, y, font, color, align) {
    g.font = font; g.fillStyle = color; g.textAlign = align || 'left'; g.textBaseline = 'middle'; g.fillText(s, x, y);
  }
  /* Texto ajustado a un ancho: varias líneas, como máximo maxLines. */
  function wrap(g, s, x, y, maxW, lineH, maxLines) {
    var words = String(s).split(' '), line = '', n = 0;
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + ' ' + words[i] : words[i];
      if (g.measureText(test).width > maxW && line) {
        if (n === maxLines - 1) { g.fillText(line + '…', x, y + n * lineH); return n + 1; }
        g.fillText(line, x, y + n * lineH); n++; line = words[i];
      } else line = test;
    }
    if (line) { g.fillText(line, x, y + n * lineH); n++; }
    return n;
  }
  function rrect(g, x, y, w, h, r) {
    g.beginPath();
    if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h);
  }
  function bar(g, x, y, w, h, frac, col, bg) {
    g.fillStyle = bg || '#1a2430'; g.fillRect(x, y, w, h);
    g.fillStyle = col; g.fillRect(x, y, w * U.clamp(frac, 0, 1), h);
  }

  /* ======================= Instrumentos ======================= */

  /* Velocímetro de aguja con la velocidad de control ASFA y la consigna del regulador. */
  function speedo(d, sim, aids) {
    var g = d.g, W = d.w, cx = W / 2, cy = W / 2, R = W / 2 - 22, t = sim.train, rg = t.reg;
    var vk = U.kmh(Math.abs(t.v)), V = 160;
    var key = [Math.round(vk * 4), Math.round(sim.asfa.limit_kmh), sim.asfa.warning, TR.cabActive(t), aids, rg.on, rg.active, rg.set_kmh].join();
    if (key === d.last) return; d.last = key;
    var ang = function (v) { return Math.PI * 0.75 + v / V * Math.PI * 1.5; };
    g.fillStyle = '#0a0b0c'; g.fillRect(0, 0, W, W);
    var bez = g.createRadialGradient(cx, cy, R * 0.6, cx, cy, R + 20); bez.addColorStop(0, '#15181b'); bez.addColorStop(1, '#2a2f35');
    g.fillStyle = bez; g.beginPath(); g.arc(cx, cy, R + 18, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0c0e10'; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    if (!TR.cabActive(t)) { d.tex.needsUpdate = true; return; }
    if (aids) {
      var lim = RC.core.timetable.trackLimitKmh(sim.line, t.x, sim.spec.length_m);
      g.strokeStyle = 'rgba(242,169,59,.6)'; g.lineWidth = 14; g.beginPath(); g.arc(cx, cy, R - 10, ang(lim), ang(V)); g.stroke();
    }
    g.strokeStyle = '#e8edf2'; g.fillStyle = '#e8edf2'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (var v = 0; v <= V; v += 5) {
      var a = ang(v), major = v % 20 === 0, mid = v % 10 === 0;
      var r0 = R - (major ? 34 : mid ? 22 : 14);
      g.lineWidth = major ? 5 : 2.5;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * (R - 3), cy + Math.sin(a) * (R - 3)); g.stroke();
      if (major) { g.font = 'bold 34px ' + FONT; g.fillText(v, cx + Math.cos(a) * (R - 64), cy + Math.sin(a) * (R - 64)); }
    }
    if (sim.asfa.connected) {
      var al = ang(Math.min(V, sim.asfa.limit_kmh));
      g.fillStyle = sim.asfa.warning ? '#ffd23d' : '#ff3b3b';
      g.beginPath();
      g.moveTo(cx + Math.cos(al) * (R + 14), cy + Math.sin(al) * (R + 14));
      g.lineTo(cx + Math.cos(al - 0.05) * (R - 20), cy + Math.sin(al - 0.05) * (R - 20));
      g.lineTo(cx + Math.cos(al + 0.05) * (R - 20), cy + Math.sin(al + 0.05) * (R - 20)); g.fill();
    }
    // Consigna del regulador: marca cian por fuera de la escala
    if (rg.on) {
      var ar = ang(Math.min(V, rg.set_kmh));
      g.fillStyle = rg.active ? '#2ee6ff' : '#4f7f8a';
      g.beginPath();
      g.moveTo(cx + Math.cos(ar) * (R + 1), cy + Math.sin(ar) * (R + 1));
      g.lineTo(cx + Math.cos(ar - 0.045) * (R + 17), cy + Math.sin(ar - 0.045) * (R + 17));
      g.lineTo(cx + Math.cos(ar + 0.045) * (R + 17), cy + Math.sin(ar + 0.045) * (R + 17)); g.fill();
      g.font = 'bold 26px ' + MONO; g.fillText('REG ' + rg.set_kmh, cx, cy - R * 0.36);
      g.fillStyle = '#e8edf2';
    }
    g.font = '22px ' + FONT; g.fillStyle = '#7f8b96'; g.fillText('km/h', cx, cy + R * 0.32);
    g.fillStyle = '#000'; g.fillRect(cx - 70, cy + R * 0.42, 140, 58);
    g.strokeStyle = '#333'; g.lineWidth = 2; g.strokeRect(cx - 70, cy + R * 0.42, 140, 58);
    g.fillStyle = '#ffffff'; g.font = 'bold 48px ' + MONO; g.fillText(Math.round(vk), cx, cy + R * 0.42 + 31);
    var na = ang(Math.min(V + 3, vk));
    g.save(); g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 10;
    g.strokeStyle = '#ff8a1f'; g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx - Math.cos(na) * 30, cy - Math.sin(na) * 30); g.lineTo(cx + Math.cos(na) * (R - 24), cy + Math.sin(na) * (R - 24)); g.stroke();
    g.restore();
    g.fillStyle = '#30353b'; g.beginPath(); g.arc(cx, cy, 20, 0, Math.PI * 2); g.fill();
    d.tex.needsUpdate = true;
  }

  /* Manómetro doble (aguja roja y negra). Es neumático: marca aunque no haya tensión
   * de mando; `pw` sólo decide si la esfera se retroilumina (lo hace el material). */
  function gauge(d, title, vals, max, pw) {
    var g = d.g, W = d.w, cx = W / 2, cy = W / 2, R = W / 2 - 16;
    var key = vals.map(function (v) { return v.v.toFixed(2); }).join();
    if (key === d.last) return; d.last = key;
    var ang = function (v) { return Math.PI * 0.75 + v / max * Math.PI * 1.5; };
    g.fillStyle = '#121416'; g.fillRect(0, 0, W, W);
    g.fillStyle = '#2b3036'; g.beginPath(); g.arc(cx, cy, R + 12, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f3f1ea'; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#111'; g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle';
    var step = max > 8 ? 2 : 1;
    for (var v = 0; v <= max + 1e-6; v += 0.5) {
      var a = ang(v), major = v % step === 0, mid = v % 1 === 0;
      g.lineWidth = major ? 4 : 2;
      var r0 = R - (major ? 26 : mid ? 18 : 10);
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * (R - 3), cy + Math.sin(a) * (R - 3)); g.stroke();
      if (major) { g.font = 'bold 26px Arial, Helvetica, sans-serif'; g.fillText(v, cx + Math.cos(a) * (R - 48), cy + Math.sin(a) * (R - 48)); }
    }
    g.font = 'bold 20px Arial, Helvetica, sans-serif'; g.fillText(title, cx, cy + R * 0.42);
    g.font = '18px Arial, Helvetica, sans-serif'; g.fillText('bar', cx, cy + R * 0.62);
    vals.forEach(function (vv) {
      var a = ang(U.clamp(vv.v, 0, max));
      g.strokeStyle = vv.c; g.lineWidth = 7; g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx - Math.cos(a) * 20, cy - Math.sin(a) * 20); g.lineTo(cx + Math.cos(a) * (R - 22), cy + Math.sin(a) * (R - 22)); g.stroke();
    });
    g.fillStyle = '#222'; g.beginPath(); g.arc(cx, cy, 12, 0, Math.PI * 2); g.fill();
    var x0 = cx - (vals.length - 1) * 45;
    vals.forEach(function (vv, i) { g.fillStyle = vv.c; g.fillRect(x0 - 35 + i * 90, cy - R * 0.5 - 7, 14, 14); g.fillStyle = '#111'; g.font = '16px Arial, Helvetica, sans-serif'; g.textAlign = 'left'; g.fillText(vv.l, x0 - 17 + i * 90, cy - R * 0.5); g.textAlign = 'center'; });
    d.tex.needsUpdate = true;
  }

  /* Pantalla del ASFA Digital. */
  function asfa(d, sim) {
    var g = d.g, a = sim.asfa, t = sim.train, W = d.w, H = d.h;
    if (!TR.cabActive(t)) { offOnce(d); return; }
    var key = [a.testing > 0, a.connected, a.emergency, Math.round(a.limit_kmh), a.control && a.control.code, a.pendingRec ? Math.ceil(a.pendingRec.remaining * 5) : 0, a.lastBeacon, Math.ceil(a.rebaseRemaining), Math.floor(performance.now() / 400) % 2].join();
    if (key === d.last) return; d.last = key;
    var bg = a.emergency ? '#2a0606' : '#06140c';
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = '#0f2a1a'; g.fillRect(0, 0, W, 44);
    g.fillStyle = '#8cffb5'; g.font = 'bold 26px ' + MONO; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText('ASFA DIGITAL', 16, 22); g.textAlign = 'right'; g.fillText(RC.data.asfa.trainType, W - 16, 22);
    g.textAlign = 'left';
    var y = 90;
    if (a.testing > 0) { g.font = 'bold 54px ' + MONO; g.fillText('AUTOTEST', 16, y + 10); }
    else if (!a.connected) { g.font = 'bold 46px ' + MONO; g.fillStyle = '#5f8f72'; g.fillText('DESCONECTADO', 16, y + 10); g.font = '26px ' + MONO; g.fillText('Pulse CONEXIÓN', 16, y + 70); }
    else if (a.emergency) {
      g.fillStyle = Math.floor(performance.now() / 400) % 2 ? '#ff5a5a' : '#ffc2c2';
      g.font = 'bold 54px ' + MONO; g.fillText('FRENO URGENCIA', 16, y + 10);
      g.font = '24px ' + MONO; g.fillStyle = '#ffc2c2'; g.fillText(a.emergencyReason.slice(0, 38), 16, y + 66); g.fillText('Parar y REARME FRENO', 16, y + 100);
    } else {
      g.font = 'bold 74px ' + MONO; g.fillText('V ' + Math.round(a.limit_kmh), 16, y + 14);
      g.font = '26px ' + MONO;
      g.fillText(a.control ? RC.data.asfa.codes[a.control.code].name.toUpperCase() + ' → ' + a.control.vFinal : 'SIN CONTROL', 16, y + 74);
      g.fillText('Última baliza: ' + (a.lastBeacon || '—'), 16, y + 106);
      if (a.pendingRec && Math.floor(performance.now() / 250) % 2) { g.fillStyle = '#ffd23d'; g.fillRect(W - 220, 60, 200, 60); g.fillStyle = '#000'; g.font = 'bold 30px ' + MONO; g.fillText('RECONOCER', W - 208, 90); }
      if (a.rebaseRemaining > 0) { g.fillStyle = '#ffd23d'; g.fillText('REBASE AUTORIZADO ' + Math.ceil(a.rebaseRemaining) + ' s', 16, y + 138); }
    }
    d.tex.needsUpdate = true;
  }

  /* Pantalla de información del tren (estado, tracción, viajeros…). Se conserva para otras vistas. */
  function info(d, sim) {
    var g = d.g, t = sim.train, W = d.w, H = d.h;
    var key = [TR.cabActive(t), Math.round(t.tractionForce), Math.round(t.brakeForce), t.passengers, (sim.inhibits || []).join(), Math.floor(sim.clock), t.elec.lineV, t.doors.left > 0, t.doors.right > 0].join();
    if (key === d.last) return; d.last = key;
    if (!TR.cabActive(t)) { off(d); d.tex.needsUpdate = true; return; }
    g.fillStyle = '#0b1220'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#16233a'; g.fillRect(0, 0, W, 46);
    g.fillStyle = '#e6eefc'; g.font = 'bold 26px ' + FONT; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillText('TREN ' + sim.line.trainNumber.split(' ')[0], 14, 23);
    g.textAlign = 'right'; g.fillText(U.fmtClock(sim.clock), W - 14, 23); g.textAlign = 'left';
    var F = t.tractionForce > 0.5 ? t.tractionForce : -t.brakeForce;
    g.fillStyle = '#26324a'; g.fillRect(14, 64, W - 28, 30);
    g.fillStyle = F >= 0 ? '#36d27a' : '#ff5050';
    var mid = W / 2, len = Math.min(1, Math.abs(F) / 200) * (W / 2 - 14);
    g.fillRect(F >= 0 ? mid : mid - len, 64, len, 30);
    g.fillStyle = '#fff'; g.fillRect(mid - 1, 60, 2, 38);
    g.font = '22px ' + FONT; g.fillText('Esfuerzo ' + (F >= 0 ? '+' : '') + Math.round(F) + ' kN', 14, 116);
    g.fillText('Catenaria ' + Math.round(t.elec.lineV) + ' V · Baterías ' + Math.round(t.elec.battV) + ' V', 14, 146);
    g.fillText('Viajeros ' + t.passengers + ' · Masa ' + TR.massT(t).toFixed(0) + ' t', 14, 176);
    g.fillText('Puertas: ' + (TR.doorsClosed(t) ? 'cerradas y enclavadas' : 'ABIERTAS'), 14, 206);
    var inh = sim.inhibits || [];
    g.fillStyle = inh.length ? '#ffb070' : '#7cf0a8';
    g.font = 'bold 22px ' + FONT;
    g.fillText(inh.length ? 'TRACCIÓN BLOQUEADA:' : 'TRACCIÓN DISPONIBLE', 14, 240);
    g.font = '20px ' + FONT;
    inh.slice(0, 3).forEach(function (s, i) { g.fillText('· ' + s, 14, 268 + i * 26); });
    d.tex.needsUpdate = true;
  }

  /* Pilotos luminosos del pupitre: dos filas de ocho. */
  function lamps(d, sim) {
    var g = d.g, t = sim.train, W = d.w, H = d.h, pw = TR.controlPower(t), e = t.elec, ad = t.adhesion;
    var nA = 0, nB = 0, unack = false;
    for (var k in sim.tcms.active) { var al = sim.tcms.active[k]; if (al.level === 'A') nA++; else if (al.level === 'B') nB++; if (!al.ack && al.level !== 'C') unack = true; }
    // [rótulo, color ('g' verde, 'r' rojo, 'y' ámbar, 'b' azul, 'w' blanco) o 0 apagado, parpadea]
    var list = [
      ['DISYUNTOR', e.disyuntor ? 'g' : 'r'],
      ['PANTÓGRAFO', e.pantoPos >= 1 ? 'g' : e.pantoPos > 0 ? 'y' : 'r'],
      ['COMPRESOR', e.mainCompRunning ? 'y' : 0],
      ['PUERTAS', TR.doorsClosed(t) ? 'g' : 'r'],
      ['F. ESTACION.', t.air.parking ? 'r' : 0],
      ['EMERGENCIA', t.emergency.active ? 'r' : 0, t.emergency.active],
      ['H. MUERTO', sim.vigil.emergency ? 'r' : sim.vigil.warning ? 'y' : 0, sim.vigil.warning],
      ['TRACCIÓN', (sim.inhibits || []).length ? 'r' : t.tractionForce > 1 ? 'g' : 0],
      ['PATINAJE', ad.slipping ? 'y' : 0, ad.slipping],
      ['DESLIZAM.', ad.sliding ? 'y' : 0, ad.sliding],
      ['ARENADO', t.sand.active ? 'y' : t.sand.empty ? 'r' : 0],
      ['REGULADOR', t.reg.active ? 'b' : t.reg.on ? 'w' : 0],
      ['F. ELÉCTRICO', t.edForce > 2 ? 'g' : 0],
      ['CONVERTIDOR', e.auxPower ? 'g' : 'r'],
      ['LUNETA', t.controls.demister && e.auxPower ? 'y' : 0],
      ['AVERÍA', nA ? 'r' : nB ? 'y' : 0, unack]
    ];
    var blink = Math.floor(performance.now() / 300) % 2;
    var key = pw ? list.map(function (l) { return l[1] + (l[2] ? 'f' : ''); }).join() + blink : 'apagado';
    if (key === d.last) return; d.last = key;
    g.fillStyle = '#141619'; g.fillRect(0, 0, W, H);
    var cols = 8, rows = 2, cw = W / cols, rh = H / rows;
    var COLS = { g: '#2bff7a', r: '#ff3535', y: '#ffc72b', b: '#38c8ff', w: '#f2f4f6' };
    list.forEach(function (l, i) {
      var x = (i % cols) * cw + 4, y = Math.floor(i / cols) * rh + 2, w = cw - 8, h = rh - 4;
      var col = pw && COLS[l[1]], on = col && (!l[2] || blink);
      g.fillStyle = on ? col : '#25282c'; rrect(g, x, y, w, h, 5); g.fill();
      if (on) {
        var gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.15)');
        g.fillStyle = gr; rrect(g, x, y, w, h, 5); g.fill();
      }
      g.fillStyle = on ? '#101112' : '#5b6168'; g.font = 'bold ' + Math.round(h * 0.55) + 'px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
      var tw = g.measureText(l[0]).width, sc = tw > w - 8 ? (w - 8) / tw : 1;
      g.save(); g.translate(x + w / 2, y + h / 2 + 1); g.scale(sc, 1); g.fillText(l[0], 0, 0); g.restore();
    });
    d.tex.needsUpdate = true;
  }

  /* ======================= TCMS (pantalla de estado) ======================= */
  var TK = { bg: '#0a0f14', card: '#101920', edge: '#1f2c38', text: '#dce6ee', dim: '#7f8e9b', teal: '#0F6E6A', saffron: '#F2A900',
    ok: '#38d27a', warn: '#ffb020', bad: '#ff4d4d', info: '#4aa8ff', ed: '#2ee6ff', off: '#3a4652' };
  var LEVEL_COL = { A: '#ff4d4d', B: '#ffb020', C: '#4aa8ff' };
  var SOFT = { traccion: 'TRACCIÓN', freno: 'FRENO', puertas: 'PUERTAS', at: 'A. TENSIÓN', clima: 'CLIMA', averias: 'AVERÍAS' };
  var HEAD = 48, BANNER_Y = 402, SOFT_Y = 444;

  function card(g, x, y, w, h, title) {
    g.fillStyle = TK.card; rrect(g, x, y, w, h, 8); g.fill();
    g.strokeStyle = TK.edge; g.lineWidth = 1.5; rrect(g, x + 0.5, y + 0.5, w - 1, h - 1, 8); g.stroke();
    if (title) txt(g, title, x + 12, y + 16, 'bold 14px ' + FONT, TK.dim);
  }
  function kv(g, x, y, k, v, col, w) {
    txt(g, k, x, y, '17px ' + FONT, TK.dim);
    txt(g, v, x + (w || 170), y, 'bold 18px ' + FONT, col || TK.text);
  }
  function fmt1(x) { return x.toFixed(1).replace('.', ','); }

  /* Esquema del tren (5 coches) visto en planta; el coche 1 (cabina activa) a la derecha. */
  function trainDiagram(g, x, y, w, h, drawCar) {
    var n = 5, gap = 8, cw = (w - gap * (n - 1)) / n;
    for (var i = 0; i < n; i++) {
      var cx = x + (n - 1 - i) * (cw + gap);
      drawCar(i, cx, y, cw, h);
    }
  }
  function carBox(g, cx, y, cw, h, i, fill) {
    g.fillStyle = fill || '#1b2733'; g.strokeStyle = '#4a5b6b'; g.lineWidth = 2;
    g.beginPath();
    if (i === 0) { g.moveTo(cx, y); g.lineTo(cx + cw - 16, y); g.quadraticCurveTo(cx + cw, y, cx + cw, y + h / 2); g.quadraticCurveTo(cx + cw, y + h, cx + cw - 16, y + h); g.lineTo(cx, y + h); g.closePath(); }
    else if (i === 4) { g.moveTo(cx + 16, y); g.lineTo(cx + cw, y); g.lineTo(cx + cw, y + h); g.lineTo(cx + 16, y + h); g.quadraticCurveTo(cx, y + h, cx, y + h / 2); g.quadraticCurveTo(cx, y, cx + 16, y); }
    else g.rect(cx, y, cw, h);
    g.fill(); g.stroke();
  }

  function pageTraccion(g, sim, W) {
    var t = sim.train, s = sim.spec, ad = t.adhesion, vk = U.kmh(Math.abs(t.v)), c = t.controls, rg = t.reg;
    // Velocidad y mandos
    card(g, 16, 58, 376, 112, 'VELOCIDAD');
    txt(g, String(Math.round(vk)), 28, 112, 'bold 58px ' + MONO, TK.text);
    txt(g, 'km/h', 28 + g.measureText(String(Math.round(vk))).width + 8, 126, '18px ' + FONT, TK.dim);
    var l = c.lever;
    kv(g, 210, 86, 'Manipulador', l > 0 ? 'T' + l : l === 0 ? '0' : l === -8 ? 'EMERG.' : 'F' + (-l), l > 0 ? TK.ok : l < 0 ? TK.warn : TK.text, 104);
    kv(g, 210, 114, 'Inversor', ['ATRÁS', 'NEUTRO', 'ADELANTE'][c.reverser + 1], c.reverser ? TK.text : TK.warn, 104);
    kv(g, 210, 142, 'Regulador', rg.on ? (rg.active ? rg.set_kmh + ' km/h' : 'conectado') : 'no', rg.active ? TK.ed : TK.text, 104);
    // Bogies motores
    card(g, 408, 58, 376, 112, 'BOGIES MOTORES');
    var motor = [[true, false], [false, false], [true, true], [false, false], [false, true]];
    var share = t.tractionForce / 4, edS = t.edForce / 4;
    trainDiagram(g, 422, 92, 348, 42, function (i, cx, y, cw, h) {
      carBox(g, cx, y, cw, h, i);
      txt(g, String(i + 1), cx + cw / 2, y + h / 2, 'bold 15px ' + FONT, TK.dim, 'center');
      [0, 1].forEach(function (b) {
        var bx = b ? cx + cw - 22 : cx + 6, isM = motor[i][b];
        var col = !isM ? '#2a3540' : ad.slipping && share > 1 ? TK.warn : share > 1 ? TK.ok : edS > 1 ? TK.ed : '#405060';
        g.fillStyle = col; g.fillRect(bx, y + h + 4, 16, 10);
        if (isM) txt(g, 'M', bx + 8, y + h + 22, 'bold 11px ' + FONT, TK.dim, 'center');
      });
    });
    // Esfuerzo en llanta
    card(g, 16, 180, 768, 92, 'ESFUERZO EN LLANTA (kN)');
    var X0 = 40, X1 = 760, mid = (X0 + X1) / 2, sc = (X1 - X0) / 2 / 200;
    g.fillStyle = '#18222c'; g.fillRect(X0, 206, X1 - X0, 26);
    for (var f = -200; f <= 200; f += 50) { g.fillStyle = f === 0 ? '#ffffff' : '#3a4856'; g.fillRect(mid + f * sc - 1, 202, 2, 34); }
    g.fillStyle = TK.ok; g.fillRect(mid, 208, Math.min(200, t.railForce) * sc, 22);
    var ed = Math.min(200, t.edForce), pn = Math.min(200 - ed, t.pneuForce);
    g.fillStyle = TK.ed; g.fillRect(mid - ed * sc, 208, ed * sc, 22);
    g.fillStyle = TK.bad; g.fillRect(mid - (ed + pn) * sc, 208, pn * sc, 22);
    txt(g, 'Tracción ' + Math.round(t.railForce) + ' kN', 40, 252, 'bold 17px ' + FONT, TK.ok);
    txt(g, 'Freno eléctrico ' + Math.round(t.edForce) + ' kN', 300, 252, 'bold 17px ' + FONT, TK.ed);
    txt(g, 'Neumático ' + Math.round(t.pneuForce) + ' kN', 560, 252, 'bold 17px ' + FONT, TK.bad);
    // Adherencia y arenado
    card(g, 16, 282, 376, 114, 'ADHERENCIA');
    kv(g, 28, 320, 'Coeficiente μ', ad.mu.toFixed(3).replace('.', ',') + '  (carril ' + Math.round(ad.railFactor * 100) + ' %)', TK.text, 128);
    kv(g, 28, 342, 'Límite tracción', Math.round(ad.limitTr) + ' kN', TK.text, 128);
    var adTxt = ad.slipping ? 'PATINAJE · antipatinaje actuando' : ad.sliding ? 'DESLIZAMIENTO · WSP actuando' : 'Sin patinaje ni deslizamiento';
    txt(g, adTxt, 28, 365, 'bold 17px ' + FONT, ad.slipping || ad.sliding ? TK.warn : TK.ok);
    txt(g, 'Arenado: ' + (t.sand.active ? (t.sand.button ? 'MANUAL' : 'AUTOMÁTICO') : 'en reposo') + ' · ' + Math.round(t.sand.kg) + ' kg', 28, 386, '16px ' + FONT, t.sand.active ? TK.warn : TK.dim);
    // Bloqueos y energía
    card(g, 408, 282, 376, 114, 'BLOQUEOS DE TRACCIÓN');
    var inh = sim.inhibits || [];
    if (!inh.length) txt(g, 'TRACCIÓN DISPONIBLE', 420, 322, 'bold 18px ' + FONT, TK.ok);
    else inh.slice(0, 3).forEach(function (s, i) { txt(g, '· ' + (s.length > 40 ? s.slice(0, 39) + '…' : s), 420, 320 + i * 21, '16px ' + FONT, TK.bad); });
    txt(g, 'Energía ' + fmt1(t.energy_kWh) + ' kWh · recuperada ' + fmt1(t.energyRegen_kWh) + ' kWh', 420, 386, '15px ' + FONT, TK.dim);
  }

  function pageFreno(g, sim, W) {
    var t = sim.train, s = sim.spec, air = t.air, c = t.controls;
    card(g, 16, 58, 376, 338, 'NEUMÁTICA (bar)');
    [['Dep. principal', air.mr, 10, '#e45d5d'], ['Tubería freno (TFA)', air.tfa, 6, '#d9dee3'], ['Cilindro freno', air.bc, 4, '#ffb020'], ['Dep. pantógrafo', air.panto, 10, '#7cb6ff']].forEach(function (r, i) {
      var y = 96 + i * 76;
      txt(g, r[0], 28, y, '17px ' + FONT, TK.dim);
      txt(g, fmt1(r[1]), 380, y, 'bold 22px ' + MONO, TK.text, 'right');
      bar(g, 28, y + 16, 352, 18, r[1] / r[2], r[3]);
      for (var k = 0; k <= r[2]; k++) { g.fillStyle = '#0a0f14'; g.fillRect(28 + 352 * k / r[2] - 1, y + 16, 2, 18); }
    });
    card(g, 408, 58, 376, 170, 'DEMANDA DE FRENO');
    var l = c.lever, frac = l < 0 && l !== -8 ? -l / s.brakeNotches : 0;
    var dem = t.emergency.active ? 'EMERGENCIA' : l < 0 ? 'F' + (-l) + ' · ' + Math.round(frac * 100) + ' %' : t.reg.brake > 0 ? 'REGULADOR ' + Math.round(t.reg.brake * 100) + ' %' : 'SIN FRENO';
    txt(g, dem, 420, 100, 'bold 30px ' + FONT, t.emergency.active ? TK.bad : l < 0 || t.reg.brake > 0 ? TK.warn : TK.dim);
    txt(g, 'Eléctrico', 420, 138, '16px ' + FONT, TK.dim); bar(g, 510, 130, 200, 16, t.edForce / s.edMax_kN, TK.ed); txt(g, Math.round(t.edForce) + ' kN', 772, 138, 'bold 16px ' + FONT, TK.text, 'right');
    txt(g, 'Neumático', 420, 166, '16px ' + FONT, TK.dim); bar(g, 510, 158, 200, 16, t.pneuForce / 250, TK.bad); txt(g, Math.round(t.pneuForce) + ' kN', 772, 166, 'bold 16px ' + FONT, TK.text, 'right');
    txt(g, t.adhesion.sliding ? 'ANTIDESLIZAMIENTO ACTUANDO' : 'Antideslizamiento en reposo', 420, 204, 'bold 16px ' + FONT, t.adhesion.sliding ? TK.warn : TK.dim);
    card(g, 408, 238, 376, 158, 'ESTADO');
    kv(g, 420, 270, 'Estacionamiento', air.parking ? 'APLICADO' : 'aflojado', air.parking ? TK.bad : TK.ok, 150);
    var src = []; for (var k in t.emergency.sources) if (t.emergency.sources[k]) src.push(k);
    kv(g, 420, 298, 'Emergencia', t.emergency.active ? 'ACTIVA' + (src.length ? ' (' + src[0] + ')' : '') : 'normal', t.emergency.active ? TK.bad : TK.ok, 150);
    kv(g, 420, 326, 'Areneros', Math.round(t.sand.kg) + ' kg (' + Math.round(t.sand.kg / s.sandCapacity_kg * 100) + ' %)', t.sand.kg < s.sandCapacity_kg * 0.15 ? TK.warn : TK.text, 150);
    kv(g, 420, 354, 'Recuperada', fmt1(t.energyRegen_kWh) + ' kWh', TK.text, 150);
    kv(g, 420, 382, 'Masa del tren', TR.massT(t).toFixed(0) + ' t', TK.text, 150);
  }

  function pagePuertas(g, sim, W) {
    var t = sim.train, dr = t.doors;
    card(g, 16, 58, 768, 200, 'PUERTAS DE VIAJEROS · cabina activa a la derecha');
    txt(g, 'LADO IZQUIERDO', 400, 92, 'bold 15px ' + FONT, TK.dim, 'center');
    txt(g, 'LADO DERECHO', 400, 238, 'bold 15px ' + FONT, TK.dim, 'center');
    function dcol(p) { return p <= 0.001 ? TK.ok : p >= 0.999 ? TK.bad : TK.warn; }
    trainDiagram(g, 40, 124, 720, 82, function (i, cx, y, cw, h) {
      carBox(g, cx, y, cw, h, i);
      txt(g, 'Coche ' + (i + 1), cx + cw / 2, y + h / 2, 'bold 15px ' + FONT, TK.dim, 'center');
      [0.3, 0.7].forEach(function (f) {
        var dx = cx + cw * f - 14;
        g.fillStyle = dcol(dr.left); g.fillRect(dx, y - 7, 28, 12);
        g.fillStyle = dcol(dr.right); g.fillRect(dx, y + h - 5, 28, 12);
      });
    });
    card(g, 16, 268, 768, 128, 'ESTADO');
    var closed = TR.doorsClosed(t);
    var st = closed ? 'CERRADAS Y ENCLAVADAS' : (dr.left > 0 && dr.right > 0 ? 'ABIERTAS AMBOS LADOS' : dr.left > 0 ? 'ABIERTAS LADO IZQUIERDO' : 'ABIERTAS LADO DERECHO');
    txt(g, st, 28, 302, 'bold 22px ' + FONT, closed ? TK.ok : TK.bad);
    var i = Math.min(sim.atStation >= 0 ? sim.atStation : sim.nextStation, sim.line.stations.length - 1), stn = sim.line.stations[i];
    kv(g, 28, 336, sim.atStation >= 0 ? 'En andén' : 'Próxima parada', stn.name + ' · andén a la ' + stn.side, TK.text, 150);
    kv(g, 28, 364, 'Viajeros a bordo', String(t.passengers), TK.text, 150);
    kv(g, 430, 364, 'Enclavamiento', closed ? 'tracción permitida' : 'tracción bloqueada', closed ? TK.ok : TK.warn, 130);
  }

  function pageAT(g, sim, W) {
    var t = sim.train, e = t.elec, s = sim.spec;
    card(g, 16, 58, 768, 244, 'ESQUEMA DE ALTA TENSIÓN Y AUXILIARES');
    var lineOn = e.lineV > 100, pantoOn = lineOn && e.pantoPos >= 1, busOn = pantoOn && e.disyuntor;
    var HOT = TK.saffron, COLD = TK.off;
    g.lineWidth = 4; g.lineCap = 'round';
    function ln(x0, y0, x1, y1, on) { g.strokeStyle = on ? HOT : COLD; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
    // Catenaria
    g.setLineDash([]); ln(40, 88, 760, 88, lineOn);
    txt(g, 'CATENARIA ' + Math.round(e.lineV) + ' V', 760, 106, 'bold 15px ' + FONT, lineOn ? HOT : TK.dim, 'right');
    // Pantógrafo (rombo que sube y baja)
    var ph = 10 + 26 * e.pantoPos, px = 110, py = 150;
    g.strokeStyle = pantoOn ? HOT : COLD;
    g.beginPath(); g.moveTo(px - 34, py - ph); g.lineTo(px + 34, py - ph); g.stroke();
    g.beginPath(); g.moveTo(px - 26, py - ph); g.lineTo(px, py); g.lineTo(px + 26, py - ph); g.stroke();
    txt(g, 'PANTÓGRAFO', px, py + 20, 'bold 14px ' + FONT, TK.dim, 'center');
    txt(g, e.pantoPos >= 1 ? 'ARRIBA' : e.pantoPos > 0 ? 'SUBIENDO' : 'ABAJO', px, py + 38, 'bold 14px ' + FONT, e.pantoPos >= 1 ? TK.ok : TK.warn, 'center');
    ln(px, py, px, 190, pantoOn); ln(px, 190, 228, 190, pantoOn);
    // Disyuntor (interruptor)
    g.strokeStyle = busOn ? HOT : COLD; g.beginPath(); g.moveTo(228, 190);
    if (e.disyuntor) g.lineTo(290, 190); else g.lineTo(284, 166);
    g.stroke();
    g.fillStyle = TK.text; g.beginPath(); g.arc(228, 190, 5, 0, 7); g.fill(); g.beginPath(); g.arc(290, 190, 5, 0, 7); g.fill();
    txt(g, 'DISYUNTOR', 259, 214, 'bold 14px ' + FONT, TK.dim, 'center');
    txt(g, e.disyuntor ? 'CERRADO' : 'ABIERTO', 259, 232, 'bold 14px ' + FONT, e.disyuntor ? TK.ok : TK.bad, 'center');
    ln(290, 190, 730, 190, busOn);
    // Consumidores
    function box(x, label, on, sub, ok) {
      ln(x, 190, x, 214, busOn);
      g.fillStyle = on ? '#2a2410' : '#151d25'; g.strokeStyle = on ? HOT : COLD; g.lineWidth = 2; rrect(g, x - 70, 214, 140, 56, 6); g.fill(); g.stroke(); g.lineWidth = 4;
      txt(g, label, x, 232, 'bold 15px ' + FONT, on ? TK.text : TK.dim, 'center');
      txt(g, sub, x, 254, '14px ' + FONT, ok ? TK.ok : TK.dim, 'center');
    }
    box(400, 'TRACCIÓN', busOn, t.tractionForce > 1 ? Math.round(t.tractionForce) + ' kN' : t.edForce > 1 ? 'recuperando' : 'en espera', t.tractionForce > 1 || t.edForce > 1);
    box(560, 'CONVERTIDOR', e.auxPower, e.auxPower ? 'en marcha' : 'parado', e.auxPower);
    box(710, 'COMPRESOR', e.mainCompRunning, e.mainCompSwitch === 'auto' ? (e.mainCompRunning ? 'comprimiendo' : 'automático') : 'desconectado', e.mainCompRunning);
    card(g, 16, 312, 768, 84, 'BATERÍAS Y AUXILIARES');
    kv(g, 28, 344, 'Baterías', e.battery ? Math.round(e.battV) + ' V · ' + Math.round(e.battSoc * 100) + ' % · ' + (e.charging ? 'cargando' : 'descargando') : 'desconectadas', !e.battery ? TK.dim : e.charging ? TK.ok : TK.warn, 92);
    bar(g, 28, 362, 360, 14, e.battSoc, e.battSoc < 0.35 ? TK.bad : TK.ok);
    kv(g, 430, 344, 'Dep. pantóg.', fmt1(t.air.panto) + ' bar', t.air.panto < s.pantoMin_bar ? TK.warn : TK.text, 110);
    kv(g, 430, 372, 'Comp. auxiliar', e.auxCompressor ? 'en marcha' : 'parado', e.auxCompressor ? TK.warn : TK.text, 110);
  }

  function hvacMode(h, on) { return !on || h.mode === 'off' ? 'en espera' : h.mode === 'calor' ? 'calefacción' : h.mode === 'frío' ? 'refrigeración' : 'ventilación'; }
  function pageClima(g, sim, W) {
    var t = sim.train, h = t.hvac, e = t.elec, w = t.screen;
    card(g, 16, 58, 376, 200, 'CABINA DE CONDUCCIÓN');
    txt(g, fmt1(h.cabT) + ' °C', 28, 116, 'bold 50px ' + FONT, TK.text);
    kv(g, 28, 168, 'Consigna', fmt1(h.cabSet) + ' °C', TK.ed, 110);
    kv(g, 28, 196, 'Estado', h.cabOn ? (e.auxPower ? 'conectada · ' + hvacMode(h, h.cabOn && h.fan > 0.02) : 'SIN CONVERTIDOR') : 'desconectada', h.cabOn ? (e.auxPower ? TK.ok : TK.warn) : TK.dim, 110);
    txt(g, 'Ventilador', 28, 228, '16px ' + FONT, TK.dim); bar(g, 138, 221, 230, 14, h.fan, TK.info);
    card(g, 408, 58, 376, 200, 'SALÓN DE VIAJEROS');
    var bad = t.passengers > 0 && (h.salonT < 17 || h.salonT > 28);
    txt(g, fmt1(h.salonT) + ' °C', 420, 116, 'bold 50px ' + FONT, bad ? TK.warn : TK.text);
    kv(g, 420, 168, 'Consigna', fmt1(sim.spec.salonSetpoint_C) + ' °C', TK.ed, 110);
    kv(g, 420, 196, 'Estado', h.salonOn ? (e.auxPower ? 'conectada' : 'SIN CONVERTIDOR') : 'desconectada', h.salonOn ? (e.auxPower ? TK.ok : TK.warn) : (t.passengers > 0 ? TK.bad : TK.dim), 110);
    kv(g, 420, 228, 'Viajeros', String(t.passengers), TK.text, 110);
    card(g, 16, 268, 768, 128, 'EXTERIOR Y PARABRISAS');
    kv(g, 28, 300, 'Temp. exterior', fmt1(U.outsideTemp(sim.clock)) + ' °C', TK.text, 140);
    kv(g, 28, 328, 'Meteorología', sim.weather ? sim.weather.name : '—', TK.text, 140);
    kv(g, 28, 356, 'Limpiaparabrisas', TR.WIPER_NAMES[t.controls.wipers], TK.text, 140);
    kv(g, 28, 384, 'Lavaparabrisas', fmt1(w.washerL) + ' L', w.washerL < sim.spec.washerTank_L * 0.15 ? TK.warn : TK.text, 140);
    kv(g, 430, 300, 'Luneta térmica', t.controls.demister ? (e.auxPower ? 'calentando' : 'sin alimentación') : 'desconectada', t.controls.demister && e.auxPower ? TK.ok : TK.dim, 140);
    kv(g, 430, 328, 'Vaho', Math.round(w.fog * 100) + ' %', w.fog > 0.35 ? TK.warn : TK.text, 140);
    kv(g, 430, 356, 'Suciedad', Math.round(w.dirt * 100) + ' %', w.dirt > 0.3 ? TK.warn : TK.text, 140);
    kv(g, 430, 384, 'Cortinilla', ['recogida', 'media altura', 'bajada'][t.controls.visor], TK.text, 140);
  }

  function pageAverias(g, sim, W, act) {
    card(g, 16, 58, 768, 168, 'ALARMAS ACTIVAS (' + act.length + ')');
    if (!act.length) txt(g, 'Sin alarmas activas', 28, 100, 'bold 20px ' + FONT, TK.ok);
    act.slice(0, 5).forEach(function (a, i) {
      var y = 92 + i * 27;
      g.fillStyle = LEVEL_COL[a.level]; rrect(g, 28, y - 10, 26, 20, 4); g.fill();
      txt(g, a.level, 41, y + 1, 'bold 15px ' + FONT, '#0a0f14', 'center');
      txt(g, a.code, 66, y, 'bold 16px ' + MONO, LEVEL_COL[a.level]);
      txt(g, a.text, 150, y, '17px ' + FONT, TK.text);
      txt(g, U.fmtClock(a.since) + (a.ack ? '  ✓' : ''), 772, y, '15px ' + MONO, a.ack ? TK.dim : TK.text, 'right');
    });
    if (act.length > 5) txt(g, '… y ' + (act.length - 5) + ' más', 772, 216, '14px ' + FONT, TK.dim, 'right');
    card(g, 16, 236, 768, 160, 'REGISTRO DE EVENTOS');
    var ev = sim.tcms.events.slice(-5).reverse();
    if (!ev.length) txt(g, 'Sin eventos registrados', 28, 274, '17px ' + FONT, TK.dim);
    ev.forEach(function (e, i) {
      var y = 268 + i * 26;
      txt(g, U.fmtClock(e.t), 28, y, '15px ' + MONO, TK.dim);
      txt(g, e.on ? '▲ APARECE' : '▼ CESA', 128, y, 'bold 14px ' + FONT, e.on ? LEVEL_COL[e.level] : TK.ok);
      txt(g, e.code, 236, y, 'bold 15px ' + MONO, TK.text);
      txt(g, e.text, 316, y, '16px ' + FONT, e.on ? TK.text : TK.dim);
    });
  }

  /* Datos que cambian lo que se ve en cada página (para no redibujar sin necesidad). */
  function pageKey(sim, page) {
    var t = sim.train, e = t.elec, a = t.air, h = t.hvac;
    switch (page) {
      case 'traccion': return [Math.round(U.kmh(Math.abs(t.v))), Math.round(t.railForce / 2), Math.round(t.edForce / 2), Math.round(t.pneuForce / 2), t.controls.lever, t.controls.reverser, t.reg.on, t.reg.active, t.reg.set_kmh, t.adhesion.slipping, t.adhesion.sliding, Math.round(t.adhesion.mu * 200), t.sand.active, Math.round(t.sand.kg), (sim.inhibits || []).join(), Math.round(t.energy_kWh * 10), Math.round(t.energyRegen_kWh * 10)].join();
      case 'freno': return [a.mr.toFixed(1), a.tfa.toFixed(1), a.bc.toFixed(1), a.panto.toFixed(1), Math.round(t.edForce / 2), Math.round(t.pneuForce / 2), t.controls.lever, t.emergency.active, a.parking, t.adhesion.sliding, Math.round(t.sand.kg), Math.round(t.energyRegen_kWh * 10), t.passengers, Math.round(t.reg.brake * 100)].join();
      case 'puertas': return [t.doors.left.toFixed(2), t.doors.right.toFixed(2), sim.atStation, sim.nextStation, t.passengers].join();
      case 'at': return [Math.round(e.lineV), e.pantoPos.toFixed(2), e.disyuntor, e.auxPower, e.mainCompRunning, e.mainCompSwitch, e.battery, Math.round(e.battV), Math.round(e.battSoc * 100), e.charging, a.panto.toFixed(1), e.auxCompressor, Math.round(t.tractionForce), t.edForce > 1].join();
      case 'clima': return [h.cabT.toFixed(1), h.cabSet, h.cabOn, h.salonOn, h.salonT.toFixed(1), Math.round(h.fan * 20), h.mode, e.auxPower, t.passengers, Math.round(U.outsideTemp(sim.clock) * 10), t.controls.wipers, t.screen.washerL.toFixed(1), t.controls.demister, Math.round(t.screen.fog * 100), Math.round(t.screen.dirt * 100), t.controls.visor].join();
      case 'averias': return sim.tcms.seq + ':' + Object.keys(sim.tcms.active).map(function (k) { return sim.tcms.active[k].ack ? 1 : 0; }).join('');
    }
    return '';
  }

  function tcms(d, sim, now) {
    var g = d.g, W = d.w, H = d.h, t = sim.train, T = sim.tcms, pw = TR.controlPower(t);
    if (!pw) { d.bootAt = 0; offOnce(d); return; }
    if (!d.bootAt) d.bootAt = now;
    var boot = now - d.bootAt < 2600;
    var act = RC.core.tcms.activeList(sim), unack = false;
    act.forEach(function (a) { if (!a.ack && a.level !== 'C') unack = true; });
    var blink = Math.floor(now / 500) % 2;
    var key = boot ? 'boot' + Math.floor((now - d.bootAt) / 200) : [TR.cabActive(t), T.page, pageKey(sim, T.page), act.length, act.length ? act[0].code + act[0].ack : '', unack ? blink : 0, Math.floor(sim.clock), sim.service.number].join('|');
    if (key === d.last) return;
    // Como mucho unas 6 actualizaciones por segundo (salvo cambio de página o de alarmas)
    var sig = T.page + '|' + act.length + '|' + (unack ? blink : 0);
    if (!boot && d.sig === sig && now - d.stamp < 160) return;
    d.last = key; d.sig = sig; d.stamp = now;
    g.fillStyle = TK.bg; g.fillRect(0, 0, W, H);
    if (boot) {
      var p = (now - d.bootAt) / 2600;
      txt(g, 'FERRONDA', W / 2, H / 2 - 40, 'bold 46px ' + FONT, TK.saffron, 'center');
      txt(g, 'Sistema de control y diagnóstico del tren', W / 2, H / 2 + 6, '20px ' + FONT, TK.dim, 'center');
      bar(g, W / 2 - 180, H / 2 + 40, 360, 10, p, TK.teal);
      txt(g, 'Iniciando… autotest de equipos', W / 2, H / 2 + 74, '16px ' + MONO, TK.dim, 'center');
      d.tex.needsUpdate = true;
      return;
    }
    // Cabecera
    g.fillStyle = TK.teal; g.fillRect(0, 0, W, HEAD);
    g.fillStyle = TK.saffron; g.fillRect(0, HEAD - 4, W, 4);
    txt(g, 'FERRONDA', 14, 23, 'bold 22px ' + FONT, '#ffffff');
    txt(g, RC.core.tcms.PAGE_NAMES[T.page], W / 2, 23, 'bold 22px ' + FONT, '#ffffff', 'center');
    txt(g, 'Tren ' + sim.service.number + '  ' + U.fmtClock(sim.clock), W - 14, 23, 'bold 20px ' + MONO, '#ffffff', 'right');
    switch (T.page) {
      case 'traccion': pageTraccion(g, sim, W); break;
      case 'freno': pageFreno(g, sim, W); break;
      case 'puertas': pagePuertas(g, sim, W); break;
      case 'at': pageAT(g, sim, W); break;
      case 'clima': pageClima(g, sim, W); break;
      case 'averias': pageAverias(g, sim, W, act); break;
    }
    if (!TR.cabActive(t)) {
      g.fillStyle = 'rgba(10,15,20,0.72)'; g.fillRect(0, HEAD, W, BANNER_Y - HEAD);
      txt(g, 'CABINA NO HABILITADA', W / 2, 200, 'bold 34px ' + FONT, TK.warn, 'center');
      txt(g, 'Gire la llave de cabina para tomar el mando', W / 2, 240, '20px ' + FONT, TK.text, 'center');
    }
    // Franja de alarmas
    if (act.length) {
      var top = act[0], col = LEVEL_COL[top.level], hot = !top.ack && top.level !== 'C' && blink;
      g.fillStyle = hot ? col : '#16202a'; g.fillRect(0, BANNER_Y, W, 38);
      g.fillStyle = col; g.fillRect(0, BANNER_Y, 10, 38);
      txt(g, top.code + '  ' + top.text, 22, BANNER_Y + 19, 'bold 19px ' + FONT, hot ? '#0a0f14' : col);
      txt(g, (act.length > 1 ? '+' + (act.length - 1) + '  ' : '') + (unack ? 'SIN RECONOCER' : 'reconocidas'), W - 14, BANNER_Y + 19, 'bold 15px ' + FONT, hot ? '#0a0f14' : TK.dim, 'right');
    } else {
      g.fillStyle = '#0f1a14'; g.fillRect(0, BANNER_Y, W, 38);
      txt(g, 'SIN ALARMAS ACTIVAS', 22, BANNER_Y + 19, 'bold 17px ' + FONT, TK.ok);
    }
    // Rótulos de las teclas de función (alineados con las teclas físicas de debajo)
    RC.core.tcms.PAGES.forEach(function (pg, i) {
      var cx = (i + 0.5) * W / 6, cur = pg === T.page, lab = SOFT[pg];
      if (pg === 'averias' && cur && unack) lab = 'RECONOCER';
      g.fillStyle = cur ? TK.teal : '#17212b'; rrect(g, cx - W / 12 + 5, SOFT_Y, W / 6 - 10, 40, 6); g.fill();
      if (pg === 'averias' && unack && !cur) { g.strokeStyle = blink ? TK.bad : '#5a2020'; g.lineWidth = 3; rrect(g, cx - W / 12 + 6, SOFT_Y + 1, W / 6 - 12, 38, 6); g.stroke(); }
      txt(g, lab, cx, SOFT_Y + 21, 'bold 17px ' + FONT, cur ? '#ffffff' : TK.text, 'center');
    });
    d.tex.needsUpdate = true;
  }

  /* ======================= Pantallas pequeñas ======================= */

  /* Regulador de velocidad (pupitre). */
  function regulator(d, sim) {
    var g = d.g, W = d.w, H = d.h, t = sim.train, r = t.reg;
    if (!TR.cabActive(t)) { offOnce(d); return; }
    var key = [r.on, r.active, r.set_kmh].join();
    if (key === d.last) return; d.last = key;
    g.fillStyle = '#05090c'; g.fillRect(0, 0, W, H);
    var col = r.active ? '#2ee6ff' : r.on ? '#e8f4f8' : '#4a5a64';
    txt(g, 'REG', 10, 24, 'bold 20px ' + FONT, col);
    txt(g, r.active ? 'ACTIVO' : r.on ? 'CONECT.' : 'DESCON.', 10, 70, 'bold 18px ' + FONT, col);
    txt(g, String(r.set_kmh), W - 52, H / 2 + 2, 'bold 64px ' + MONO, col, 'right');
    txt(g, 'km/h', W - 8, H - 22, '16px ' + FONT, '#7f8e9b', 'right');
    d.tex.needsUpdate = true;
  }

  /* Consola de megafonía, destino y número de tren. */
  function paPanel(d, sim, now) {
    var g = d.g, W = d.w, H = d.h, t = sim.train, svc = sim.service, pa = sim.pa;
    if (!TR.cabActive(t)) { offOnce(d); return; }
    var blink = Math.floor(now / 450) % 2, destOk = svc.dest === svc.expectedDest, numOk = svc.number === svc.expectedNumber;
    var scroll = pa.active ? Math.floor(now / 40) : 0;
    var nxt = sim.line.stations[RC.core.comms.nextStopIndex(sim)].name;
    var key = [svc.dest, svc.number, destOk && numOk ? 0 : blink, pa.active ? pa.active.text : '', scroll, pa.last ? pa.last.kind : '', nxt].join('|');
    if (key === d.last) return; d.last = key;
    g.fillStyle = '#06100f'; g.fillRect(0, 0, W, H);
    txt(g, 'DESTINO', 12, 22, 'bold 16px ' + FONT, '#6f9a96');
    txt(g, svc.dest.toUpperCase(), 98, 22, 'bold 24px ' + FONT, destOk ? '#F2A900' : (blink ? '#ff5a5a' : '#7a2a2a'));
    txt(g, 'TREN', 12, 56, 'bold 16px ' + FONT, '#6f9a96');
    txt(g, svc.number, 98, 56, 'bold 24px ' + MONO, numOk ? '#F2A900' : (blink ? '#ff5a5a' : '#7a2a2a'));
    txt(g, 'Próx.: ' + nxt, W - 12, 56, '17px ' + FONT, '#9fc4c0', 'right');
    g.fillStyle = '#0d2321'; g.fillRect(0, 78, W, 2);
    if (pa.active) {
      g.fillStyle = '#ff4040'; g.beginPath(); g.arc(20, 104, 7, 0, 7); g.fill();
      txt(g, 'EMITIENDO AVISO', 36, 104, 'bold 18px ' + FONT, '#ff8080');
      g.save(); g.beginPath(); g.rect(10, 120, W - 20, 40); g.clip();
      g.font = '22px ' + FONT; var tw = g.measureText(pa.active.text).width, span = tw + 120;
      var x = 10 + W - (scroll * 3) % (span + W - 20);
      txt(g, pa.active.text, x, 141, '22px ' + FONT, '#e6f2f0');
      g.restore();
    } else {
      txt(g, 'Megafonía en reposo', 12, 104, 'bold 18px ' + FONT, '#4f7a76');
      if (pa.last) { g.font = '17px ' + FONT; g.fillStyle = '#6f9a96'; g.textAlign = 'left'; wrap(g, 'Último: ' + pa.last.text, 12, 130, W - 24, 22, 2); }
    }
    d.tex.needsUpdate = true;
  }

  /* Radio tren-tierra. */
  function radioPanel(d, sim, now) {
    var g = d.g, W = d.w, H = d.h, t = sim.train, c = sim.comms;
    if (!TR.controlPower(t)) { offOnce(d); return; }
    var blink = Math.floor(now / 400) % 2, wrong = c.channel !== c.zone;
    var key = [c.channel, c.zone, c.state, c.emergency, c.last ? c.last.t : 0, wrong || c.state !== 'reposo' ? blink : 0].join('|');
    if (key === d.last) return; d.last = key;
    g.fillStyle = c.emergency ? '#1c0606' : '#060a10'; g.fillRect(0, 0, W, H);
    txt(g, 'CANAL', 12, 20, 'bold 15px ' + FONT, '#6f86a0');
    txt(g, String(c.channel), 12, 62, 'bold 56px ' + MONO, wrong ? (blink ? '#ffb020' : '#7a5a10') : '#e6eefc');
    var z = RC.core.comms.zoneAt(sim, t.x);
    txt(g, 'Zona: ' + z.name + ' (canal ' + z.channel + ')', 84, 22, '16px ' + FONT, '#8fa6bf');
    var ST = { reposo: ['REPOSO', '#4b5d70'], llamando: ['LLAMANDO…', '#ffb020'], comunicando: ['COMUNICANDO', '#38d27a'], emergencia: ['EMERGENCIA', '#ff4d4d'] }[c.state] || ['—', '#888'];
    var lit = c.state === 'reposo' || c.state === 'comunicando' || blink;
    g.fillStyle = lit ? ST[1] : '#1a222c'; rrect(g, W - 176, 36, 164, 32, 6); g.fill();
    txt(g, ST[0], W - 94, 53, 'bold 17px ' + FONT, lit ? '#081018' : ST[1], 'center');
    if (wrong) txt(g, 'CAMBIE AL CANAL ' + c.zone, 84, 52, 'bold 18px ' + FONT, blink ? '#ffb020' : '#a07010');
    g.fillStyle = '#122030'; g.fillRect(0, 80, W, 2);
    if (c.last) {
      txt(g, c.last.from + ' · ' + U.fmtClock(c.last.t).slice(0, 5), 12, 98, 'bold 15px ' + FONT, '#8fa6bf');
      g.font = '17px ' + FONT; g.fillStyle = '#dbe6f2'; g.textAlign = 'left'; g.textBaseline = 'middle';
      wrap(g, c.last.text, 12, 122, W - 24, 21, 2);
    } else txt(g, 'Sin mensajes', 12, 110, '17px ' + FONT, '#4b5d70');
    d.tex.needsUpdate = true;
  }

  /* Climatización (panel de techo). */
  function hvacPanel(d, sim) {
    var g = d.g, W = d.w, H = d.h, t = sim.train, h = t.hvac, e = t.elec;
    if (!TR.controlPower(t)) { offOnce(d); return; }
    var key = [h.cabT.toFixed(1), h.cabSet, h.cabOn, h.salonOn, h.salonT.toFixed(1), h.mode, e.auxPower, Math.round(U.outsideTemp(sim.clock))].join();
    if (key === d.last) return; d.last = key;
    g.fillStyle = '#05080b'; g.fillRect(0, 0, W, H);
    var cab = h.cabOn ? (e.auxPower ? '#e6eefc' : '#ffb020') : '#4b5d70';
    txt(g, 'CABINA', 10, 22, 'bold 15px ' + FONT, '#6f86a0');
    txt(g, fmt1(h.cabT) + '°', 10, 62, 'bold 40px ' + MONO, cab);
    txt(g, '→ ' + fmt1(h.cabSet) + '°', 150, 62, 'bold 26px ' + MONO, h.cabOn ? '#2ee6ff' : '#3a5a64');
    txt(g, h.cabOn ? (e.auxPower ? hvacMode(h, h.fan > 0.02).toUpperCase() : 'SIN CONVERT.') : 'APAGADA', W - 10, 22, 'bold 14px ' + FONT, cab, 'right');
    g.fillStyle = '#14202a'; g.fillRect(0, 86, W, 2);
    txt(g, 'SALÓN ' + fmt1(h.salonT) + '° ' + (h.salonOn ? 'ON' : 'OFF'), 10, 108, 'bold 18px ' + FONT, h.salonOn ? '#cfe0f0' : '#ff8a5a');
    txt(g, 'EXT ' + Math.round(U.outsideTemp(sim.clock)) + '°', W - 10, 108, 'bold 18px ' + FONT, '#8fa6bf', 'right');
    d.tex.needsUpdate = true;
  }

  /* Voltímetro y estado de las baterías (armario de servicios). */
  function battery(d, sim) {
    var g = d.g, W = d.w, H = d.h, e = sim.train.elec;
    if (!e.battery) { offOnce(d); return; }
    var key = [Math.round(e.battV), Math.round(e.battSoc * 100), e.charging, e.auxPower].join();
    if (key === d.last) return; d.last = key;
    g.fillStyle = '#050807'; g.fillRect(0, 0, W, H);
    var low = e.battSoc < 0.35;
    txt(g, Math.round(e.battV) + ' V', 14, 42, 'bold 48px ' + MONO, low ? '#ff5a5a' : '#7cf0a8');
    txt(g, Math.round(e.battSoc * 100) + ' %', W - 14, 30, 'bold 26px ' + MONO, low ? '#ff5a5a' : '#e6eefc', 'right');
    txt(g, e.charging ? 'CARGANDO' : 'DESCARGANDO', W - 14, 62, 'bold 18px ' + FONT, e.charging ? '#7cf0a8' : '#ffb020', 'right');
    bar(g, 14, 84, W - 28, 16, e.battSoc, low ? '#ff5a5a' : '#38d27a', '#16201c');
    d.tex.needsUpdate = true;
  }

  /* Hoja de ruta del portahorarios (papel): horario real del servicio y siguiente parada marcada. */
  function timetableSheet(d, sim) {
    var g = d.g, W = d.w, H = d.h, tt = sim.timetable;
    var key = [sim.nextStation, sim.atStation, sim.service.number, tt.length].join();
    if (key === d.last) return; d.last = key;
    g.fillStyle = '#f2efe6'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#0F6E6A'; g.fillRect(0, 0, W, 34);
    txt(g, 'HOJA DE RUTA', 10, 17, 'bold 17px ' + FONT, '#ffffff');
    txt(g, sim.service.expectedNumber, W - 10, 17, 'bold 17px ' + MONO, '#F2A900', 'right');
    txt(g, 'Línea C-1 · ' + sim.line.stations[0].name.split('-').pop() + ' → ' + sim.line.stations[sim.line.stations.length - 1].name, 10, 50, '13px ' + FONT, '#333');
    g.fillStyle = '#999'; g.fillRect(8, 62, W - 16, 1);
    txt(g, 'ESTACIÓN', 10, 76, 'bold 12px ' + FONT, '#555');
    txt(g, 'LLEG.', 178, 76, 'bold 12px ' + FONT, '#555', 'center');
    txt(g, 'SAL.', 226, 76, 'bold 12px ' + FONT, '#555', 'center');
    var cur = sim.atStation >= 0 ? sim.atStation : sim.nextStation;
    tt.forEach(function (r, i) {
      var y = 100 + i * 36;
      if (i === cur) { g.fillStyle = 'rgba(242,169,0,0.45)'; g.fillRect(4, y - 15, W - 8, 30); }
      var done = i < cur;
      var nm = r.name.length > 18 ? r.name.slice(0, 17) + '.' : r.name;
      txt(g, nm, 10, y, (i === cur ? 'bold ' : '') + '15px ' + FONT, done ? '#9a968c' : '#151515');
      txt(g, r.arr === null || r.arr === undefined ? '—' : U.fmtClock(r.arr).slice(0, 5), 178, y, '14px ' + MONO, done ? '#9a968c' : '#151515', 'center');
      txt(g, r.dep === null || r.dep === undefined ? '—' : U.fmtClock(r.dep).slice(0, 5), 226, y, 'bold 14px ' + MONO, done ? '#9a968c' : '#151515', 'center');
      g.fillStyle = '#d8d3c4'; g.fillRect(8, y + 17, W - 16, 1);
    });
    txt(g, 'Vmáx. línea según cuadro de velocidades', 10, H - 14, 'italic 11px ' + FONT, '#666');
    d.tex.needsUpdate = true;
  }

  RC.ui3d = RC.ui3d || {};
  RC.ui3d.displays = {
    make: make, speedo: speedo, gauge: gauge, asfa: asfa, info: info, lamps: lamps, tcms: tcms,
    regulator: regulator, paPanel: paPanel, radioPanel: radioPanel, hvacPanel: hvacPanel, battery: battery, timetableSheet: timetableSheet
  };
})(globalThis.RC);
