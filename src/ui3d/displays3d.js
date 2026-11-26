/* RAILCORE — Pantallas e instrumentos de la cabina 3D, dibujados en canvas
 * y usados como texturas. Muestran SIEMPRE el estado real de la simulación. */
(function (RC) {
  var U = RC.core.util, TR = RC.core.train;

  function make(w, h) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return { c: c, g: c.getContext('2d'), tex: t, w: w, h: h, last: '' };
  }

  function off(d, msg) {
    var g = d.g; g.fillStyle = '#050607'; g.fillRect(0, 0, d.w, d.h);
    if (msg) { g.fillStyle = '#1a1d20'; g.font = '20px Segoe UI'; g.textAlign = 'center'; g.fillText(msg, d.w / 2, d.h / 2); }
  }

  /* Velocímetro de aguja con indicación de la velocidad de control ASFA. */
  function speedo(d, sim, aids) {
    var g = d.g, W = d.w, cx = W / 2, cy = W / 2, R = W / 2 - 22, t = sim.train;
    var vk = U.kmh(Math.abs(t.v)), V = 160;
    var key = [Math.round(vk * 4), Math.round(sim.asfa.limit_kmh), sim.asfa.warning, TR.cabActive(t), aids].join();
    if (key === d.last) return; d.last = key;
    var ang = function (v) { return Math.PI * 0.75 + v / V * Math.PI * 1.5; };
    g.fillStyle = '#0a0b0c'; g.fillRect(0, 0, W, W);
    var bez = g.createRadialGradient(cx, cy, R * 0.6, cx, cy, R + 20); bez.addColorStop(0, '#15181b'); bez.addColorStop(1, '#2a2f35');
    g.fillStyle = bez; g.beginPath(); g.arc(cx, cy, R + 18, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0c0e10'; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    if (!TR.cabActive(t)) { return; }
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
      if (major) { g.font = 'bold 34px Segoe UI, Arial'; g.fillText(v, cx + Math.cos(a) * (R - 64), cy + Math.sin(a) * (R - 64)); }
    }
    if (sim.asfa.connected) {
      var al = ang(Math.min(V, sim.asfa.limit_kmh));
      g.fillStyle = sim.asfa.warning ? '#ffd23d' : '#ff3b3b';
      g.beginPath();
      g.moveTo(cx + Math.cos(al) * (R + 14), cy + Math.sin(al) * (R + 14));
      g.lineTo(cx + Math.cos(al - 0.05) * (R - 20), cy + Math.sin(al - 0.05) * (R - 20));
      g.lineTo(cx + Math.cos(al + 0.05) * (R - 20), cy + Math.sin(al + 0.05) * (R - 20)); g.fill();
    }
    g.font = '22px Segoe UI'; g.fillStyle = '#7f8b96'; g.fillText('km/h', cx, cy + R * 0.32);
    g.fillStyle = '#000'; g.fillRect(cx - 70, cy + R * 0.42, 140, 58);
    g.strokeStyle = '#333'; g.lineWidth = 2; g.strokeRect(cx - 70, cy + R * 0.42, 140, 58);
    g.fillStyle = '#ffffff'; g.font = 'bold 48px Consolas, monospace'; g.fillText(Math.round(vk), cx, cy + R * 0.42 + 31);
    var na = ang(Math.min(V + 3, vk));
    g.save(); g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 10;
    g.strokeStyle = '#ff8a1f'; g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx - Math.cos(na) * 30, cy - Math.sin(na) * 30); g.lineTo(cx + Math.cos(na) * (R - 24), cy + Math.sin(na) * (R - 24)); g.stroke();
    g.restore();
    g.fillStyle = '#30353b'; g.beginPath(); g.arc(cx, cy, 20, 0, Math.PI * 2); g.fill();
    d.tex.needsUpdate = true;
  }

  /* Manómetro doble (aguja roja y blanca). */
  function gauge(d, title, vals, max) {
    var g = d.g, W = d.w, cx = W / 2, cy = W / 2, R = W / 2 - 16;
    var key = vals.map(function (v) { return v.v.toFixed(2); }).join();
    if (key === d.last) return; d.last = key;
    var ang = function (v) { return Math.PI * 0.75 + v / max * Math.PI * 1.5; };
    g.fillStyle = '#121416'; g.fillRect(0, 0, W, W);
    g.fillStyle = '#2b3036'; g.beginPath(); g.arc(cx, cy, R + 12, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f3f1ea'; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#111'; g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (var v = 0; v <= max; v += 0.5) {
      var a = ang(v), major = v % 2 === 0, mid = v % 1 === 0;
      g.lineWidth = major ? 4 : 2;
      var r0 = R - (major ? 26 : mid ? 18 : 10);
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * (R - 3), cy + Math.sin(a) * (R - 3)); g.stroke();
      if (major) { g.font = 'bold 26px Arial'; g.fillText(v, cx + Math.cos(a) * (R - 48), cy + Math.sin(a) * (R - 48)); }
    }
    g.font = 'bold 20px Arial'; g.fillText(title, cx, cy + R * 0.42);
    g.font = '18px Arial'; g.fillText('bar', cx, cy + R * 0.62);
    vals.forEach(function (vv) {
      var a = ang(U.clamp(vv.v, 0, max));
      g.strokeStyle = vv.c; g.lineWidth = 7; g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx - Math.cos(a) * 20, cy - Math.sin(a) * 20); g.lineTo(cx + Math.cos(a) * (R - 22), cy + Math.sin(a) * (R - 22)); g.stroke();
    });
    g.fillStyle = '#222'; g.beginPath(); g.arc(cx, cy, 12, 0, Math.PI * 2); g.fill();
    vals.forEach(function (vv, i) { g.fillStyle = vv.c; g.fillRect(cx - 80 + i * 90, cy - R * 0.5, 14, 14); g.fillStyle = '#111'; g.font = '16px Arial'; g.textAlign = 'left'; g.fillText(vv.l, cx - 62 + i * 90, cy - R * 0.5 + 8); g.textAlign = 'center'; });
    d.tex.needsUpdate = true;
  }

  /* Pantalla del ASFA Digital. */
  function asfa(d, sim) {
    var g = d.g, a = sim.asfa, t = sim.train, W = d.w, H = d.h;
    var key = [TR.cabActive(t), a.testing > 0, a.connected, a.emergency, Math.round(a.limit_kmh), a.control && a.control.code, a.pendingRec ? Math.ceil(a.pendingRec.remaining * 5) : 0, a.lastBeacon, Math.ceil(a.rebaseRemaining), Math.floor(performance.now() / 400) % 2].join();
    if (key === d.last) return; d.last = key;
    if (!TR.cabActive(t)) { off(d); d.tex.needsUpdate = true; return; }
    var bg = a.emergency ? '#2a0606' : '#06140c';
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = '#0f2a1a'; g.fillRect(0, 0, W, 44);
    g.fillStyle = '#8cffb5'; g.font = 'bold 26px Consolas, monospace'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText('ASFA DIGITAL', 16, 22); g.textAlign = 'right'; g.fillText(RC.data.asfa.trainType, W - 16, 22);
    g.textAlign = 'left';
    var y = 90;
    if (a.testing > 0) { g.font = 'bold 54px Consolas'; g.fillText('AUTOTEST', 16, y + 10); }
    else if (!a.connected) { g.font = 'bold 46px Consolas'; g.fillStyle = '#5f8f72'; g.fillText('DESCONECTADO', 16, y + 10); g.font = '26px Consolas'; g.fillText('Pulse CONEXIÓN', 16, y + 70); }
    else if (a.emergency) {
      g.fillStyle = Math.floor(performance.now() / 400) % 2 ? '#ff5a5a' : '#ffc2c2';
      g.font = 'bold 54px Consolas'; g.fillText('FRENO URGENCIA', 16, y + 10);
      g.font = '24px Consolas'; g.fillStyle = '#ffc2c2'; g.fillText(a.emergencyReason.slice(0, 38), 16, y + 66); g.fillText('Parar y REARME FRENO', 16, y + 100);
    } else {
      g.font = 'bold 74px Consolas'; g.fillText('V ' + Math.round(a.limit_kmh), 16, y + 14);
      g.font = '26px Consolas';
      g.fillText(a.control ? RC.data.asfa.codes[a.control.code].name.toUpperCase() + ' → ' + a.control.vFinal : 'SIN CONTROL', 16, y + 74);
      g.fillText('Última baliza: ' + (a.lastBeacon || '—'), 16, y + 106);
      if (a.pendingRec && Math.floor(performance.now() / 250) % 2) { g.fillStyle = '#ffd23d'; g.fillRect(W - 220, 60, 200, 60); g.fillStyle = '#000'; g.font = 'bold 30px Consolas'; g.fillText('RECONOCER', W - 208, 90); }
      if (a.rebaseRemaining > 0) { g.fillStyle = '#ffd23d'; g.fillText('REBASE AUTORIZADO ' + Math.ceil(a.rebaseRemaining) + ' s', 16, y + 138); }
    }
    d.tex.needsUpdate = true;
  }

  /* Pantalla de información del tren (estado, tracción, viajeros…). */
  function info(d, sim) {
    var g = d.g, t = sim.train, W = d.w, H = d.h;
    var key = [TR.cabActive(t), Math.round(t.tractionForce), Math.round(t.brakeForce), t.passengers, (sim.inhibits || []).join(), Math.floor(sim.clock), t.elec.lineV, t.doors.left > 0, t.doors.right > 0].join();
    if (key === d.last) return; d.last = key;
    if (!TR.cabActive(t)) { off(d); d.tex.needsUpdate = true; return; }
    g.fillStyle = '#0b1220'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#16233a'; g.fillRect(0, 0, W, 46);
    g.fillStyle = '#e6eefc'; g.font = 'bold 26px Segoe UI'; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillText('CIVIA · ' + sim.line.trainNumber.split(' ')[0], 14, 23);
    g.textAlign = 'right'; g.fillText(U.fmtClock(sim.clock), W - 14, 23); g.textAlign = 'left';
    // Barra de esfuerzo
    var F = t.tractionForce > 0.5 ? t.tractionForce : -t.brakeForce;
    g.fillStyle = '#26324a'; g.fillRect(14, 64, W - 28, 30);
    g.fillStyle = F >= 0 ? '#36d27a' : '#ff5050';
    var mid = W / 2, len = Math.min(1, Math.abs(F) / 200) * (W / 2 - 14);
    g.fillRect(F >= 0 ? mid : mid - len, 64, len, 30);
    g.fillStyle = '#fff'; g.fillRect(mid - 1, 60, 2, 38);
    g.font = '22px Segoe UI'; g.fillText('Esfuerzo ' + (F >= 0 ? '+' : '') + Math.round(F) + ' kN', 14, 116);
    g.fillText('Catenaria ' + Math.round(t.elec.lineV) + ' V · Baterías ' + Math.round(t.elec.battV) + ' V', 14, 146);
    g.fillText('Viajeros ' + t.passengers + ' · Masa ' + RC.core.train.massT(t).toFixed(0) + ' t', 14, 176);
    g.fillText('Puertas: ' + (TR.doorsClosed(t) ? 'cerradas y enclavadas' : 'ABIERTAS'), 14, 206);
    var inh = sim.inhibits || [];
    g.fillStyle = inh.length ? '#ffb070' : '#7cf0a8';
    g.font = 'bold 22px Segoe UI';
    g.fillText(inh.length ? 'TRACCIÓN BLOQUEADA:' : 'TRACCIÓN DISPONIBLE', 14, 240);
    g.font = '20px Segoe UI';
    inh.slice(0, 3).forEach(function (s, i) { g.fillText('· ' + s, 14, 268 + i * 26); });
    d.tex.needsUpdate = true;
  }

  /* Fila de pilotos luminosos del pupitre. */
  function lamps(d, sim) {
    var g = d.g, t = sim.train, W = d.w, H = d.h, pw = TR.controlPower(t), e = t.elec;
    var list = [
      ['DISYUNTOR', !pw ? 0 : e.disyuntor ? 'g' : 'r'],
      ['PANTÓG.', !pw ? 0 : e.pantoPos >= 1 ? 'g' : e.pantoPos > 0 ? 'y' : 'r'],
      ['COMPRESOR', !pw ? 0 : e.mainCompRunning ? 'y' : 0],
      ['PUERTAS', !pw ? 0 : TR.doorsClosed(t) ? 'g' : 'r'],
      ['F. ESTAC.', !pw ? 0 : t.air.parking ? 'r' : 0],
      ['EMERG.', !pw ? 0 : t.emergency.active ? 'r' : 0],
      ['H. MUERTO', !pw ? 0 : sim.vigil.emergency ? 'r' : sim.vigil.warning ? 'y' : 0],
      ['TRACCIÓN', !pw ? 0 : (sim.inhibits || []).length ? 'r' : t.tractionForce > 1 ? 'g' : 0]
    ];
    var blink = Math.floor(performance.now() / 300) % 2;
    var key = list.map(function (l) { return l[1]; }).join() + blink;
    if (key === d.last) return; d.last = key;
    g.fillStyle = '#16181b'; g.fillRect(0, 0, W, H);
    var cw = W / list.length;
    list.forEach(function (l, i) {
      var x = i * cw + 6, col = { g: '#2bff7a', r: '#ff3535', y: '#ffc72b' }[l[1]];
      var flashing = (l[0] === 'H. MUERTO' && sim.vigil.warning) || (l[0] === 'EMERG.' && t.emergency.active);
      var on = col && (!flashing || blink);
      g.fillStyle = on ? col : '#2a2d31';
      g.fillRect(x, 8, cw - 12, H - 16);
      if (on) { g.shadowColor = col; g.shadowBlur = 18; g.fillRect(x, 8, cw - 12, H - 16); g.shadowBlur = 0; }
      g.fillStyle = on ? '#111' : '#6a7077'; g.font = 'bold 19px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(l[0], x + (cw - 12) / 2, H / 2);
    });
    d.tex.needsUpdate = true;
  }

  RC.ui3d = RC.ui3d || {};
  RC.ui3d.displays = { make: make, speedo: speedo, gauge: gauge, asfa: asfa, info: info, lamps: lamps };
})(globalThis.RC);
