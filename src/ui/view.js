/* RAILCORE — Vista frontal desde la cabina (canvas 2D en perspectiva).
 * Sólo presentación: lee el estado de la simulación, nunca lo modifica. */
(function (RC) {
  var U = RC.core.util, TT = RC.core.timetable;
  var CAM_H = 3.1;          // altura de los ojos sobre el carril (m)
  var FAR = 1600;           // distancia de dibujo (m)
  var GAUGE = 1.668 / 2;    // ancho ibérico
  var TRACK2 = -4.3;        // vía 2 a la izquierda

  function lerp(a, b, f) { return a + (b - a) * f; }
  function mix(c1, c2, f) {
    return 'rgb(' + [0, 1, 2].map(function (i) { return Math.round(lerp(c1[i], c2[i], f)); }).join(',') + ')';
  }

  function create(canvas) {
    return { cv: canvas, g: canvas.getContext('2d'), lat: null };
  }

  function resize(v) {
    var r = v.cv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(200, Math.round(r.width * dpr)), h = Math.max(120, Math.round(r.height * dpr));
    if (v.cv.width !== w || v.cv.height !== h) { v.cv.width = w; v.cv.height = h; }
  }

  /* Desplazamiento lateral de la vía por delante (curvas). */
  function buildLateral(sim, x) {
    var n = Math.ceil(FAR / 5) + 1, lat = new Float32Array(n), th = 0, y = 0;
    for (var i = 0; i < n; i++) {
      lat[i] = y;
      th += TT.curvatureAt(sim.line, x + i * 5) * 5;
      y += Math.sin(th) * 5;
    }
    return lat;
  }

  function render(v, sim, opts, realTime) {
    resize(v);
    var g = v.g, W = v.cv.width, H = v.cv.height;
    var t = sim.train, x = t.x;
    var F = H * 0.95, cx = W / 2, hor = H * 0.40;
    var lat = buildLateral(sim, x);
    // Pequeño balanceo de la caja con la velocidad
    var sway = Math.sin(realTime * 1.7) * Math.min(1, Math.abs(t.v) / 30) * 1.2 * (H / 700);
    hor += sway;

    function latAt(s) { var i = s / 5, i0 = Math.floor(i); if (i0 >= lat.length - 1) return lat[lat.length - 1]; return lerp(lat[i0], lat[i0 + 1], i - i0); }
    function P(s, o, h) {
      s = Math.max(s, 0.8);
      return { x: cx + (latAt(s) + o) * F / s, y: hor + (CAM_H - (h || 0)) * F / s, k: F / s };
    }

    // Luz ambiente: amanecer en Sevilla a finales de noviembre (~08:10) [aprox.]
    var night = U.clamp((2 - U.sunElevation(sim.clock)) / 10, 0, 1);
    var day = 1 - night;

    // Cielo
    var sky = g.createLinearGradient(0, 0, 0, hor);
    sky.addColorStop(0, mix([8, 12, 30], [92, 148, 205], day));
    sky.addColorStop(1, mix([70, 52, 70], [235, 196, 150], day * 0.9 + 0.1 * (1 - night)));
    g.fillStyle = sky; g.fillRect(0, 0, W, hor + 2);
    // Sol / resplandor
    var glow = g.createRadialGradient(cx + W * 0.25, hor, 2, cx + W * 0.25, hor, W * 0.45);
    glow.addColorStop(0, 'rgba(255,190,120,' + (0.55 * (1 - Math.abs(day - 0.6))) + ')');
    glow.addColorStop(1, 'rgba(255,190,120,0)');
    g.fillStyle = glow; g.fillRect(0, 0, W, hor + 2);
    // Horizonte lejano (sierra suave)
    g.fillStyle = mix([18, 20, 26], [96, 110, 96], day);
    g.beginPath(); g.moveTo(0, hor);
    for (var i = 0; i <= 40; i++) {
      var px = i / 40 * W;
      g.lineTo(px, hor - (H * 0.018) * (1 + Math.sin(i * 1.3 + 2) * 0.6 + Math.sin(i * 0.37) * 0.8));
    }
    g.lineTo(W, hor); g.closePath(); g.fill();
    // Terreno
    var ground = g.createLinearGradient(0, hor, 0, H);
    ground.addColorStop(0, mix([16, 18, 14], [120, 122, 84], day));
    ground.addColorStop(1, mix([10, 12, 8], [74, 86, 46], day));
    g.fillStyle = ground; g.fillRect(0, hor, W, H - hor);

    // Balasto y carriles de ambas vías
    var ballast = mix([28, 26, 24], [128, 118, 104], day), rail = mix([90, 92, 96], [200, 205, 210], day);
    [0, TRACK2].forEach(function (off) {
      g.fillStyle = ballast;
      g.beginPath();
      var s, p;
      for (s = 2; s <= FAR; s += s < 100 ? 2 : 10) { p = P(s, off - 2.0, 0); g.lineTo(p.x, p.y); }
      for (s = FAR; s >= 2; s -= s <= 100 ? 2 : 10) { p = P(s, off + 2.0, 0); g.lineTo(p.x, p.y); }
      g.closePath(); g.fill();
      // Traviesas (sólo cerca, con desplazamiento según la posición → sensación de velocidad)
      g.strokeStyle = mix([20, 16, 12], [84, 70, 58], day);
      var first = 0.6 - ((x % 0.6) + 0.6) % 0.6;
      for (s = Math.max(2, first); s < 70; s += 0.6) {
        var a = P(s, off - 1.3, 0), b = P(s, off + 1.3, 0);
        g.lineWidth = Math.max(1, 0.22 * a.k);
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      }
      g.strokeStyle = rail;
      [-GAUGE, GAUGE].forEach(function (ro) {
        g.beginPath();
        for (s = 2; s <= FAR; s += s < 60 ? 1 : 10) { p = P(s, off + ro, 0.17); g.lineTo(p.x, p.y); }
        g.lineWidth = Math.max(1, 0.08 * F / 6);
        g.stroke();
      });
    });

    // Objetos (de lejos a cerca)
    var objs = [];
    function add(s, draw) { if (s > 1.5 && s < FAR) objs.push({ s: s, draw: draw }); }
    // Postes de catenaria cada 60 m
    var firstPole = Math.ceil(x / 60) * 60;
    for (var px2 = firstPole; px2 < x + FAR; px2 += 60) (function (s) {
      add(s, function () {
        var base = P(s, 3.6, 0), top = P(s, 3.6, 7.2), arm = P(s, -0.3, 6.6);
        g.strokeStyle = mix([30, 30, 34], [110, 112, 118], day); g.lineWidth = Math.max(1, 0.25 * base.k);
        g.beginPath(); g.moveTo(base.x, base.y); g.lineTo(top.x, top.y); g.lineTo(arm.x, arm.y); g.stroke();
        var b2 = P(s, TRACK2 - 3.2, 0), t2 = P(s, TRACK2 - 3.2, 7.2), a2 = P(s, TRACK2 + 0.3, 6.6);
        g.beginPath(); g.moveTo(b2.x, b2.y); g.lineTo(t2.x, t2.y); g.lineTo(a2.x, a2.y); g.stroke();
      });
    })(px2 - x);
    // Hilo de contacto
    objs.push({ s: FAR + 1, draw: function () {
      g.strokeStyle = mix([20, 20, 24], [60, 60, 66], day); g.lineWidth = Math.max(1, H / 700);
      [0, TRACK2].forEach(function (off) {
        g.beginPath();
        for (var s = 3; s <= FAR; s += s < 80 ? 2 : 20) { var p = P(s, off, 5.6); g.lineTo(p.x, p.y); }
        g.stroke();
      });
    } });
    // Estaciones (andén, marquesina, cartel, viajeros esperando)
    sim.line.stations.forEach(function (st, idx) {
      var side = st.side === 'derecha' ? 1 : -1;
      var off0 = side > 0 ? 1.75 : TRACK2 - 1.75, off1 = side > 0 ? 7 : TRACK2 - 7;
      var s0 = st.stopX - st.platformLength - x, s1 = st.stopX + 15 - x;
      if (s1 < 1 || s0 > FAR) return;
      add(Math.max(2, s0), function () {
        var a0 = Math.max(2, s0), a1 = Math.min(FAR, s1), s;
        g.fillStyle = mix([40, 40, 44], [176, 170, 160], day);
        g.beginPath();
        for (s = a0; s <= a1; s += 4) { var p = P(s, off0, 0.9); g.lineTo(p.x, p.y); }
        for (s = a1; s >= a0; s -= 4) { var q = P(s, off1, 0.9); g.lineTo(q.x, q.y); }
        g.closePath(); g.fill();
        // Borde del andén (franja amarilla)
        g.strokeStyle = '#d9b400'; g.lineWidth = Math.max(1, H / 500);
        g.beginPath(); for (s = a0; s <= a1; s += 4) { var r = P(s, off0 + side * 0.3, 0.9); g.lineTo(r.x, r.y); } g.stroke();
        // Cara vertical del andén
        g.fillStyle = mix([25, 25, 28], [110, 104, 96], day);
        g.beginPath();
        for (s = a0; s <= a1; s += 4) { var u = P(s, off0, 0.9); g.lineTo(u.x, u.y); }
        for (s = a1; s >= a0; s -= 4) { var w = P(s, off0, 0); g.lineTo(w.x, w.y); }
        g.closePath(); g.fill();
        // Marquesina
        for (s = Math.max(a0, st.stopX - 150 - x); s <= Math.min(a1, st.stopX - 20 - x); s += 25) {
          var c1 = P(s, off0 + side * 3, 0.9), c2 = P(s, off0 + side * 3, 4.2);
          g.strokeStyle = mix([30, 30, 34], [90, 90, 96], day); g.lineWidth = Math.max(1, 0.2 * c1.k);
          g.beginPath(); g.moveTo(c1.x, c1.y); g.lineTo(c2.x, c2.y); g.stroke();
        }
        // Viajeros esperando
        var ss = sim.stations[idx];
        var waiting = Math.max(0, (ss.toBoard || 0) - (ss.boarded || 0));
        if (!ss.arrived && idx > 0) waiting = st.waiting;
        var rng = U.rng(idx * 77 + 1);
        for (var k = 0; k < Math.min(60, waiting); k++) {
          var ps = st.stopX - 10 - rng() * (st.platformLength - 30) - x, po = off0 + side * (1.2 + rng() * 3.2);
          if (ps < 2 || ps > FAR) continue;
          var foot = P(ps, po, 0.9), head = P(ps, po, 2.6);
          g.strokeStyle = ['#c44', '#36c', '#ddd', '#a83', '#4a4', '#555'][k % 6];
          g.lineWidth = Math.max(1, 0.45 * foot.k);
          g.beginPath(); g.moveTo(foot.x, foot.y); g.lineTo(head.x, head.y); g.stroke();
        }
      });
      // Cartel con nombre de la estación
      var sn = st.stopX - 60 - x;
      add(sn, function () {
        var p = P(sn, (side > 0 ? 4.5 : TRACK2 - 4.5), 3.2), k = p.k;
        if (k < 0.8) return;
        var w = 9 * k, h = 1.1 * k;
        g.fillStyle = '#0d3b78'; g.fillRect(p.x - w / 2, p.y - h, w, h);
        g.fillStyle = '#fff'; g.font = 'bold ' + Math.round(h * 0.62) + 'px Segoe UI, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(st.name, p.x, p.y - h / 2);
      });
      // Cartelón de parada (cabeza del tren)
      var sp = st.stopX - x;
      add(sp, function () {
        var p = P(sp, side > 0 ? 2.2 : -2.2, 1.6), k = p.k, q = P(sp, side > 0 ? 2.2 : -2.2, 0);
        g.strokeStyle = '#777'; g.lineWidth = Math.max(1, 0.08 * k); g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(p.x, p.y); g.stroke();
        g.fillStyle = '#fff'; g.fillRect(p.x - 0.35 * k, p.y - 0.7 * k, 0.7 * k, 0.7 * k);
        g.fillStyle = '#c00'; g.font = 'bold ' + Math.max(6, Math.round(0.5 * k)) + 'px Segoe UI'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('P', p.x, p.y - 0.35 * k);
      });
    });
    // Señales y balizas ASFA
    sim.signals.forEach(function (sg) {
      var s = sg.x - x;
      add(s, function () {
        var base = P(s, 2.6, 0), top = P(s, 2.6, 5.2), k = base.k;
        g.strokeStyle = '#30343a'; g.lineWidth = Math.max(1, 0.18 * k);
        g.beginPath(); g.moveTo(base.x, base.y); g.lineTo(top.x, top.y); g.stroke();
        var hw = 0.55 * k, hh = 1.55 * k;
        g.fillStyle = '#0b0b0b'; g.fillRect(top.x - hw / 2, top.y - hh * 0.3, hw, hh);
        var colors = { verde: '#3dff7a', amarillo: '#ffd23d', rojo: '#ff3030' };
        var order = ['verde', 'amarillo', 'rojo'];
        order.forEach(function (asp, i) {
          var ly = top.y - hh * 0.3 + hh * (0.18 + i * 0.32), lr = Math.max(1, 0.17 * k);
          var lit = sg.aspect === asp;
          g.fillStyle = lit ? colors[asp] : '#1a1a1a';
          g.beginPath(); g.arc(top.x, ly, lr, 0, Math.PI * 2); g.fill();
          if (lit) {
            var gr = g.createRadialGradient(top.x, ly, 0, top.x, ly, lr * (6 + night * 8));
            gr.addColorStop(0, colors[asp] + 'aa'); gr.addColorStop(1, colors[asp] + '00');
            g.fillStyle = gr; g.beginPath(); g.arc(top.x, ly, lr * (6 + night * 8), 0, Math.PI * 2); g.fill();
          }
        });
        if (k > 2.5) {
          g.fillStyle = '#f2f2f2'; g.fillRect(base.x - 0.5 * k, base.y - 2.0 * k, 1.0 * k, 0.45 * k);
          g.fillStyle = '#111'; g.font = 'bold ' + Math.round(0.3 * k) + 'px Consolas'; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText(sg.name, base.x, base.y - 1.77 * k);
        }
      });
    });
    sim.beacons.forEach(function (b) {
      var s = b.x - x;
      if (s > 400) return;
      add(s, function () {
        var p = P(s, 0, 0.18), k = p.k;
        g.fillStyle = '#e0b400'; g.fillRect(p.x - 0.25 * k, p.y - 0.1 * k, 0.5 * k, 0.12 * k);
      });
    });
    // Cartelones de velocidad máxima
    sim.line.speedLimits.forEach(function (sl) {
      var s = sl.from - x;
      add(s, function () {
        var p = P(s, 2.9, 2.4), q = P(s, 2.9, 0), k = p.k;
        g.strokeStyle = '#666'; g.lineWidth = Math.max(1, 0.08 * k); g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(p.x, p.y); g.stroke();
        g.fillStyle = '#fff'; g.fillRect(p.x - 0.45 * k, p.y - 0.9 * k, 0.9 * k, 0.9 * k);
        g.strokeStyle = '#000'; g.lineWidth = Math.max(1, 0.05 * k); g.strokeRect(p.x - 0.45 * k, p.y - 0.9 * k, 0.9 * k, 0.9 * k);
        g.fillStyle = '#000'; g.font = 'bold ' + Math.max(5, Math.round(0.42 * k)) + 'px Segoe UI'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(sl.kmh, p.x, p.y - 0.45 * k);
      });
    });
    // Postes kilométricos cada 500 m
    for (var pk = Math.ceil(x / 500) * 500; pk < x + 600; pk += 500) (function (s, val) {
      add(s, function () {
        var p = P(s, -2.3, 1.1), k = p.k;
        if (k < 1) return;
        g.fillStyle = '#eee'; g.fillRect(p.x - 0.18 * k, p.y, 0.36 * k, 1.1 * k);
        g.fillStyle = '#000'; g.font = Math.round(0.2 * k) + 'px Consolas'; g.textAlign = 'center';
        g.fillText((val / 1000).toFixed(1), p.x, p.y + 0.3 * k);
      });
    })(pk - x, pk);
    // Puentes / pasos superiores
    sim.line.landmarks.forEach(function (lm) {
      if (lm.kind !== 'puente') return;
      var s = lm.x - x;
      add(s, function () {
        var l = P(s, -16, 7.5), r = P(s, 12, 7.5), lb = P(s, -16, 0), k = l.k;
        g.fillStyle = mix([28, 28, 30], [150, 146, 138], day);
        g.fillRect(l.x, l.y - 1.4 * k, r.x - l.x, 1.4 * k);
        g.fillRect(l.x, l.y, 1.2 * k, lb.y - l.y);
        var rb = P(s, 12, 0); g.fillRect(r.x - 1.2 * k, r.y, 1.2 * k, rb.y - r.y);
      });
    });
    // Tren precedente
    if (sim.ghost.active) {
      var gs = (sim.ghost.x - sim.ghost.length) - x;
      if (gs > 2 && gs < FAR) add(gs, function () {
        var bl = P(gs, -1.45, 0.4), tr = P(gs, 1.45, 4.0), k = bl.k;
        g.fillStyle = mix([40, 40, 46], [205, 208, 212], day);
        g.fillRect(bl.x, tr.y, tr.x - bl.x, bl.y - tr.y);
        g.fillStyle = '#7a0d0d'; g.fillRect(bl.x, tr.y + (bl.y - tr.y) * 0.55, tr.x - bl.x, (bl.y - tr.y) * 0.12);
        g.fillStyle = '#1b2633'; g.fillRect(bl.x + (tr.x - bl.x) * 0.15, tr.y + (bl.y - tr.y) * 0.12, (tr.x - bl.x) * 0.7, (bl.y - tr.y) * 0.3);
        g.fillStyle = '#ff2a2a';
        [0.12, 0.88].forEach(function (f) { g.beginPath(); g.arc(bl.x + (tr.x - bl.x) * f, tr.y + (bl.y - tr.y) * 0.82, Math.max(1.5, 0.12 * k), 0, Math.PI * 2); g.fill(); });
      });
    }
    objs.sort(function (a, b) { return b.s - a.s; });
    objs.forEach(function (o) { o.draw(); });

    // Haz de los faros
    var hl = t.controls.headlights;
    if (hl > 0 && night > 0.05) {
      var reach = hl === 2 ? 0.5 : 0.75;
      var hg = g.createRadialGradient(cx, H * 1.05, 10, cx, H * reach, H * 0.55);
      hg.addColorStop(0, 'rgba(255,245,210,' + (0.30 * night) + ')');
      hg.addColorStop(1, 'rgba(255,245,210,0)');
      g.fillStyle = hg; g.fillRect(0, hor, W, H - hor);
    }
    // Oscuridad general si es de noche
    if (night > 0) { g.fillStyle = 'rgba(0,0,10,' + (0.25 * night) + ')'; g.fillRect(0, 0, W, H); }

    // Limpiaparabrisas
    if (t.controls.wipers) {
      var wa = Math.sin(realTime * 3.2) * 0.9;
      g.strokeStyle = '#111'; g.lineWidth = Math.max(3, H / 140);
      [W * 0.3, W * 0.7].forEach(function (bx) {
        g.beginPath(); g.moveTo(bx, H); g.lineTo(bx + Math.sin(wa) * H * 0.55, H - Math.cos(wa) * H * 0.55); g.stroke();
      });
    }
    // Marco del parabrisas
    g.fillStyle = '#0d1013';
    g.fillRect(0, 0, W, H * 0.03);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(W * 0.05, 0); g.lineTo(0, H * 0.25); g.fill();
    g.beginPath(); g.moveTo(W, 0); g.lineTo(W * 0.95, 0); g.lineTo(W, H * 0.25); g.fill();
    g.fillRect(W * 0.497, 0, W * 0.006, H);
    // Cabina iluminada
    if (t.controls.cabLight && RC.core.train.controlPower(t)) { g.fillStyle = 'rgba(255,230,180,0.06)'; g.fillRect(0, 0, W, H); }
    // Unidad sin tensión: la cabina está a oscuras
    if (!RC.core.train.controlPower(t)) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, W, H); }
  }

  RC.ui.view = { create: create, render: render };
})(globalThis.RC);
