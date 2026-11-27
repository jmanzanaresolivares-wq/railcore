/* RAILCORE — Exterior de la unidad eléctrica de Cercanías (5 coches).
 * Diseño propio inspirado en un tren de Cercanías moderno; no copia ningún modelo
 * real ni ninguna librea: los colores salen de la marca activa (Ferronda).
 *
 * Incluye: morro redondeado con parabrisas envolvente, coches con ventanas,
 * puertas de dos hojas que se abren, techo con climatizadores y pantógrafo que
 * sube y baja, bogies con ruedas que giran, fuelles entre coches, faros, pilotos
 * rojos, indicador de destino y luz interior por la noche.
 *
 * Sólo presentación: lee el estado de la simulación, nunca lo modifica.
 * Ejes locales de cada coche: X derecha, Y arriba (0 = plataforma de la vía),
 * Z hacia atrás (el tren avanza hacia −Z, igual que el resto del mundo 3D). */
(function (RC) {
  var RAIL = 0.172;                 // altura de la cabeza del carril sobre la plataforma
  var Y0 = 0.62, YT = 4.05;         // bajo y techo de la caja (sobre el carril)
  var END_L = 20.7, MID_L = 18.4, GAP = 0.5;
  var WHEEL_R = 0.42;

  /* ---------- Sección transversal de la caja ---------- */
  function W(y) {                   // semiancho de la caja a la altura y (sobre el carril)
    if (y <= 0.95) return 1.36 + 0.10 * Math.sin(Math.PI / 2 * Math.max(0, y - Y0) / (0.95 - Y0));
    if (y <= 1.2) return 1.46 + 0.01 * (y - 0.95) / 0.25;
    if (y <= 3.3) { var q = (y - 1.2) / 2.1; return 1.47 - 0.05 * q * q; }
    var t = Math.min(1, (y - 3.3) / (YT - 3.3)), p = 2.4;
    return 1.42 * Math.pow(Math.max(0, 1 - Math.pow(t, p)), 1 / p);
  }
  var ROWS = [0.62, 0.68, 0.76, 0.85, 0.95, 1.1, 1.25, 1.33, 1.5, 1.7, 1.86, 1.98, 2.2, 2.5, 2.8, 2.96, 3.02, 3.15, 3.3,
    3.42, 3.53, 3.63, 3.72, 3.8, 3.87, 3.93, 3.98, 4.015, 4.04, 4.05];
  var NR = ROWS.length;

  /* Anillo de la sección: lado derecho de abajo arriba, cumbrera, lado izquierdo de arriba abajo. */
  var RING = (function () {
    var r = [], j;
    for (j = 0; j < NR; j++) r.push({ x: W(ROWS[j]), y: ROWS[j], side: 1, j: j });
    for (j = NR - 2; j >= 0; j--) r.push({ x: -W(ROWS[j]), y: ROWS[j], side: -1, j: j });
    var s = 0; r[0].s = 0;
    for (var i = 1; i < r.length; i++) { s += Math.hypot(r[i].x - r[i - 1].x, r[i].y - r[i - 1].y); r[i].s = s; }
    r.forEach(function (p) { p.v = p.s / s; });
    return r;
  })();
  /* v de la textura del costado para una altura y en un lado (+1 derecha, −1 izquierda). */
  function vAt(side, y) {
    var pts = RING.filter(function (p) { return p.side === side || p.j === NR - 1; });
    pts.sort(function (a, b) { return a.y - b.y; });
    if (y <= pts[0].y) return pts[0].v;
    for (var i = 1; i < pts.length; i++) {
      if (y <= pts[i].y) { var f = (y - pts[i - 1].y) / (pts[i].y - pts[i - 1].y); return pts[i - 1].v + (pts[i].v - pts[i - 1].v) * f; }
    }
    return pts[pts.length - 1].v;
  }

  /* ---------- Superficie del morro ---------- */
  function rake(y) {                // retranqueo del frontal según la altura (perfil lateral)
    if (y < 1.6) { var a = (1.6 - y) / (1.6 - Y0); return 0.32 * a * a; }
    if (y < 1.95) { var b = (y - 1.6) / 0.35; return 0.12 * b * b; }
    if (y < 3.55) return 0.12 + (y - 1.95) * 0.72;
    var c = Math.min(1, (y - 3.55) / (YT - 3.55));
    return 1.272 + 0.36 * c + 0.9 * (1 - Math.sqrt(Math.max(0, 1 - c * c)));
  }
  function cornerDepth(y) {
    if (y < 1.9) return 0.85;
    if (y < 3.6) return 0.85 - 0.25 * (y - 1.9) / 1.7;
    return 0.6 - 0.2 * Math.min(1, (y - 3.6) / 0.45);
  }
  function noseZ(x, y, zF) {        // z de la superficie frontal en (x, y)
    var w = Math.max(1e-4, W(y)), m = 2.2, r = Math.min(1, Math.abs(x) / w);
    return zF + rake(y) + cornerDepth(y) * (1 - Math.pow(Math.max(0, 1 - Math.pow(r, m)), 1 / m));
  }

  /* ---------- Utilidades ---------- */
  function canvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function tex(c, srgb) {
    var t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8; return t;
  }
  function hex(c) { return '#' + ('000000' + (typeof c === 'number' ? c : parseInt(String(c).replace('#', ''), 16)).toString(16)).slice(-6); }
  function brandLivery() {
    var b = RC.data.brand, L = b && b.livery || {};
    return {
      body: L.body || '#F4F5F2', lower: L.lower || '#0F6E6A', stripe: L.stripe || '#F2A900',
      band: L.windowBand || '#1B2630', roof: L.roof || '#B9BEC2'
    };
  }

  /* Acumulador de geometrías con colores por vértice (para fusionar piezas en una sola malla). */
  function Merger() { this.p = []; this.n = []; this.c = []; }
  Merger.prototype.add = function (geo, m, color) {
    var g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(m);
    if (!g.attributes.normal) g.computeVertexNormals();
    var P = g.attributes.position.array, N = g.attributes.normal.array, col = new THREE.Color(color);
    for (var i = 0; i < P.length; i++) { this.p.push(P[i]); this.n.push(N[i]); }
    for (i = 0; i < P.length / 3; i++) this.c.push(col.r, col.g, col.b);
    g.dispose();
  };
  Merger.prototype.box = function (w, h, d, x, y, z, color, rx, ry, rz) {
    var m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), new THREE.Vector3(1, 1, 1));
    this.add(new THREE.BoxGeometry(w, h, d), m, color);
  };
  Merger.prototype.cyl = function (r1, r2, h, x, y, z, color, rx, ry, rz, seg) {
    var m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), new THREE.Vector3(1, 1, 1));
    this.add(new THREE.CylinderGeometry(r1, r2, h, seg || 12), m, color);
  };
  Merger.prototype.geometry = function () {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    return g;
  };

  /* ---------- Disposición de puertas y ventanas ---------- */
  function layout(kind) {
    var L = kind === 'end' ? END_L : MID_L, h = L / 2;
    var doors = kind === 'end' ? [-5.5, 6.75] : [-5.4, 5.4];
    var DW = 1.36, segs = [], wins = [];
    // tramos libres entre puertas y extremos
    var edges = [kind === 'end' ? -6.9 : -h + 0.45];
    doors.forEach(function (d) { edges.push(d - DW / 2 - 0.3, d + DW / 2 + 0.3); });
    edges.push(h - 0.45);
    for (var i = 0; i < edges.length; i += 2) segs.push([edges[i], edges[i + 1]]);
    segs.forEach(function (sg) {
      var len = sg[1] - sg[0]; if (len < 0.8) return;
      var n = Math.max(1, Math.round(len / 1.75)), w = (len - (n - 1) * 0.14) / n;
      for (var k = 0; k < n; k++) wins.push([sg[0] + k * (w + 0.14), sg[0] + k * (w + 0.14) + w]);
    });
    return { L: L, doors: doors, DW: DW, wins: wins };
  }

  /* ---------- Texturas de la caja (color, emisiva y rugosidad/metal) ---------- */
  var TW = 2048, TH = 512;
  function paintBody(kind, liv, logo) {
    var lay = layout(kind), L = lay.L, zMin = -L / 2;
    var C = canvas(TW, TH), E = canvas(1024, 256), O = canvas(1024, 256);
    var g = C.getContext('2d'), ge = E.getContext('2d'), go = O.getContext('2d');
    function px(z) { return (z - zMin) / L * TW; }
    function py(side, y) { return (1 - vAt(side, y)) * TH; }
    // rect en coordenadas del coche sobre los tres lienzos
    function rect(side, z0, z1, y0, y1, col, emis, rough, metal) {
      var a = px(z0), b = px(z1), t = py(side, y1), u = py(side, y0);
      var top = Math.min(t, u), hh = Math.abs(u - t);
      if (col) { g.fillStyle = col; g.fillRect(a, top, b - a, hh); }
      if (emis !== undefined) { ge.fillStyle = emis; ge.fillRect(a / 2, top / 2, (b - a) / 2, hh / 2); }
      if (rough !== undefined) { go.fillStyle = 'rgb(0,' + Math.round(rough * 255) + ',' + Math.round((metal || 0) * 255) + ')'; go.fillRect(a / 2, top / 2, (b - a) / 2, hh / 2); }
    }
    // fondo: pintura de la caja
    g.fillStyle = liv.body; g.fillRect(0, 0, TW, TH);
    ge.fillStyle = '#000'; ge.fillRect(0, 0, 1024, 256);
    go.fillStyle = 'rgb(0,96,0)'; go.fillRect(0, 0, 1024, 256);
    [1, -1].forEach(function (s) {
      // techo (por encima de la línea de imposta)
      rect(s, zMin, -zMin, 3.42, YT + 0.01, liv.roof, undefined, 0.62, 0.1);
      // franja baja, filete y banda de ventanas
      rect(s, zMin, -zMin, Y0 - 0.01, 1.25, liv.lower, undefined, 0.42, 0);
      rect(s, zMin, -zMin, 1.25, 1.33, liv.stripe, undefined, 0.4, 0);
      var bandFrom = kind === 'end' ? -7.2 : zMin + 0.35;
      rect(s, bandFrom, -zMin - 0.35, 1.92, 3.02, liv.band, undefined, 0.3, 0.2);
      // cabina: banda negra que enlaza con el parabrisas
      if (kind === 'end') {
        rect(s, zMin, -7.2, 1.86, 3.3, liv.band, undefined, 0.3, 0.2);
        rect(s, -8.55, -7.35, 2.0, 3.05, '#0c1218', '#000', 0.05, 0.3);   // ventanilla de cabina
      }
      // ventanas de viajeros
      lay.wins.forEach(function (w) {
        rect(s, w[0], w[1], 1.98, 2.96, '#101820', '#ffe6b8', 0.05, 0.35);
        var gr = g.createLinearGradient(0, py(s, 2.96), 0, py(s, 1.98));
        gr.addColorStop(0, 'rgba(120,150,175,0.35)'); gr.addColorStop(0.5, 'rgba(40,55,70,0.15)'); gr.addColorStop(1, 'rgba(10,16,22,0)');
        g.fillStyle = gr; g.fillRect(px(w[0]), Math.min(py(s, 2.96), py(s, 1.98)), px(w[1]) - px(w[0]), Math.abs(py(s, 1.98) - py(s, 2.96)));
      });
      // huecos de puerta (se ven al abrir): interior oscuro con suelo y asideros
      lay.doors.forEach(function (d) {
        rect(s, d - lay.DW / 2, d + lay.DW / 2, 1.0, 3.1, '#2a3036', '#c9b48e', 0.9, 0);
        rect(s, d - lay.DW / 2, d + lay.DW / 2, 1.0, 1.08, '#5b6067');
        rect(s, d - 0.03, d + 0.03, 1.3, 2.9, '#e0b000');
        rect(s, d - lay.DW / 2 - 0.05, d - lay.DW / 2, 1.0, 3.12, '#15181b');
        rect(s, d + lay.DW / 2, d + lay.DW / 2 + 0.05, 1.0, 3.12, '#15181b');
        rect(s, d - lay.DW / 2 - 0.05, d + lay.DW / 2 + 0.05, 3.1, 3.14, '#15181b');
        // indicador lateral de destino junto a la puerta
        rect(s, d + lay.DW / 2 + 0.25, d + lay.DW / 2 + 1.05, 3.13, 3.33, '#090a0b', '#000', 0.2, 0);
      });
      // juntas de paneles del techo
      for (var z = zMin + 1.5; z < -zMin; z += 1.5) rect(s, z, z + 0.04, 3.45, YT, 'rgba(70,75,80,0.35)');
    });
    // testeros (zona oscura reservada en la esquina de la textura)
    g.fillStyle = '#3d4248'; g.fillRect(0, 0, 6, 6);
    // logotipo y número a ambos lados (el derecho en espejo para leerse bien)
    function drawLogos() {
      var mids = kind === 'end' ? [0.6] : [0];
      [1, -1].forEach(function (s) {
        mids.forEach(function (zc) {
          var y0 = 1.42, y1 = 1.84, a = py(s, y1), b = py(s, y0), hh = Math.abs(b - a), cy = (a + b) / 2;
          var wpx = hh * 3.5, cx = px(zc);
          g.save(); g.translate(cx, cy); g.scale(s > 0 ? -1 : 1, s > 0 ? 1 : -1);
          if (logo) g.drawImage(logo, -wpx / 2, -hh / 2, wpx, hh);
          g.restore();
        });
        if (kind === 'end') {
          var a2 = py(s, 1.72), b2 = py(s, 1.48), hh2 = Math.abs(b2 - a2);
          g.save(); g.translate(px(-6.6 + 0.0), (a2 + b2) / 2); g.scale(s > 0 ? -1 : 1, s > 0 ? 1 : -1);
          g.fillStyle = '#1b2630'; g.font = '700 ' + Math.round(hh2 * 0.8) + 'px Segoe UI, Arial, sans-serif';
          g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('FR 4651', 0, 0);
          g.restore();
        }
      });
    }
    drawLogos();
    return { color: C, emis: E, orm: O, redraw: drawLogos, lay: lay };
  }

  function paintFront(liv) {
    var S = 512, C = canvas(S, S), E = canvas(256, 256), O = canvas(256, 256);
    var g = C.getContext('2d'), ge = E.getContext('2d'), go = O.getContext('2d');
    var WX = 1.48;
    function X(x) { return (x / WX + 1) / 2 * S; }
    function Yp(y) { return (1 - (y - Y0) / (YT - Y0)) * S; }
    function band(y0, y1, frac, col, emis, rough, metal) {   // franja horizontal acotada al ancho de la caja
      for (var y = y0; y < y1; y += 0.01) {
        var w = W(y) * frac, a = X(-w), b = X(w), t = Yp(y + 0.01), h = Yp(y) - t + 0.6;
        if (col) { g.fillStyle = col; g.fillRect(a, t, b - a, h); }
        if (emis) { ge.fillStyle = emis; ge.fillRect(a / 2, t / 2, (b - a) / 2, h / 2); }
        if (rough !== undefined) { go.fillStyle = 'rgb(0,' + Math.round(rough * 255) + ',' + Math.round((metal || 0) * 255) + ')'; go.fillRect(a / 2, t / 2, (b - a) / 2, h / 2); }
      }
    }
    g.fillStyle = liv.body; g.fillRect(0, 0, S, S);
    ge.fillStyle = '#000'; ge.fillRect(0, 0, 256, 256);
    go.fillStyle = 'rgb(0,90,0)'; go.fillRect(0, 0, 256, 256);
    band(Y0 - 0.02, 1.25, 1.01, liv.lower, null, 0.42, 0);
    band(1.25, 1.33, 1.01, liv.stripe, null, 0.4, 0);
    band(3.6, YT + 0.01, 1.01, liv.roof, null, 0.6, 0.1);
    // marco negro y parabrisas
    band(1.86, 3.58, 0.985, liv.band, null, 0.3, 0.2);
    band(1.98, 3.46, 0.93, '#0b1117', null, 0.04, 0.4);
    var gr = g.createLinearGradient(0, Yp(3.46), 0, Yp(1.98));
    gr.addColorStop(0, 'rgba(150,175,200,0.35)'); gr.addColorStop(0.45, 'rgba(60,80,100,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(X(-1.4), Yp(3.46), X(1.4) - X(-1.4), Yp(1.98) - Yp(3.46));
    // limpiaparabrisas
    g.strokeStyle = '#1a1a1a'; g.lineWidth = 4;
    [-0.45, 0.45].forEach(function (x0) { g.beginPath(); g.moveTo(X(x0), Yp(2.02)); g.lineTo(X(x0 + (x0 < 0 ? -0.55 : 0.55)), Yp(2.75)); g.stroke(); });
    // grupos ópticos (carcasas)
    [-1, 1].forEach(function (s) {
      var a = X(s * 0.66), b = X(s * 1.24);
      g.fillStyle = '#14181c'; g.beginPath();
      var x0 = Math.min(a, b), x1 = Math.max(a, b), t = Yp(1.66), u = Yp(1.4), r = 10;
      g.moveTo(x0 + r, t); g.lineTo(x1 - r, t); g.quadraticCurveTo(x1, t, x1, t + r); g.lineTo(x1, u - r); g.quadraticCurveTo(x1, u, x1 - r, u);
      g.lineTo(x0 + r, u); g.quadraticCurveTo(x0, u, x0, u - r); g.lineTo(x0, t + r); g.quadraticCurveTo(x0, t, x0 + r, t); g.fill();
      go.fillStyle = 'rgb(0,30,100)'; go.fillRect(x0 / 2, t / 2, (x1 - x0) / 2, (u - t) / 2);
    });
    // tapa del enganche
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 2; g.strokeRect(X(-0.42), Yp(1.02), X(0.42) - X(-0.42), Yp(0.68) - Yp(1.02));
    return { color: C, emis: E, orm: O };
  }

  function paintDoor(liv) {
    var C = canvas(128, 256), g = C.getContext('2d');
    function Yd(y) { return (1 - (y - 1.0) / 2.1) * 256; }
    g.fillStyle = liv.body; g.fillRect(0, 0, 128, 256);
    g.fillStyle = liv.lower; g.fillRect(0, Yd(1.25), 128, Yd(1.0) - Yd(1.25));
    g.fillStyle = liv.stripe; g.fillRect(0, Yd(1.33), 128, Yd(1.25) - Yd(1.33));
    g.fillStyle = '#0f171e'; g.fillRect(18, Yd(2.9), 92, Yd(1.95) - Yd(2.9));
    var gr = g.createLinearGradient(0, Yd(2.9), 0, Yd(1.95));
    gr.addColorStop(0, 'rgba(140,165,190,0.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(18, Yd(2.9), 92, Yd(1.95) - Yd(2.9));
    g.strokeStyle = liv.stripe; g.lineWidth = 7; g.strokeRect(3.5, 3.5, 121, 249);   // contorno de aviso
    g.strokeStyle = '#111'; g.lineWidth = 2; g.strokeRect(1, 1, 126, 254);
    return C;
  }

  /* ---------- Geometrías ---------- */
  function bodyGeometry(kind) {
    var L = kind === 'end' ? END_L : MID_L, zF = -L / 2, zB = L / 2;
    var pos = [], uv = [], idx = [], n = RING.length;
    for (var i = 0; i < n; i++) {
      var p = RING[i], zf = kind === 'end' ? noseZ(p.x, p.y, zF) : zF;
      pos.push(p.x, p.y + RAIL, zf, p.x, p.y + RAIL, zB);
      uv.push((zf - zF) / L, p.v, 1, p.v);
    }
    for (i = 0; i < n - 1; i++) {
      var a = 2 * i, b = 2 * i + 1, c = 2 * (i + 1), d = 2 * (i + 1) + 1;
      idx.push(a, c, b, b, c, d);
    }
    // testeros planos (atrás y, en los intermedios, delante)
    function endWall(z, flip) {
      var base = pos.length / 3;
      pos.push(0, 2.2 + RAIL, z); uv.push(0.001, 0.999);
      for (var k = 0; k < n; k++) { pos.push(RING[k].x, RING[k].y + RAIL, z); uv.push(0.001, 0.999); }
      for (k = 0; k < n - 1; k++) { if (flip) idx.push(base, base + 1 + k, base + 2 + k); else idx.push(base, base + 2 + k, base + 1 + k); }
      idx.push(base, flip ? base + n : base + 1, flip ? base + 1 : base + n);
    }
    endWall(zB, true);
    if (kind !== 'end') endWall(zF, false);
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }

  function capGeometry() {
    var L = END_L, zF = -L / 2, NC = 26, pos = [], uv = [], idx = [];
    for (var j = 0; j < NR; j++) {
      var y = ROWS[j], w = W(y);
      for (var c = 0; c <= NC; c++) {
        var s = -1 + 2 * c / NC, sx = Math.sin(s * Math.PI / 2), x = sx * w;
        pos.push(x, y + RAIL, noseZ(x, y, zF));
        uv.push((x / 1.48 + 1) / 2, (y - Y0) / (YT - Y0));
      }
    }
    for (j = 0; j < NR - 1; j++) for (c = 0; c < NC; c++) {
      var a = j * (NC + 1) + c, b = a + 1, d = a + NC + 1, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
    // cierre inferior del morro
    var base = pos.length / 3;
    for (c = 0; c <= NC; c++) { var s2 = -1 + 2 * c / NC, x2 = Math.sin(s2 * Math.PI / 2) * W(Y0); pos.push(x2, Y0 + RAIL, noseZ(x2, Y0, zF)); uv.push(0.5, 0.01); pos.push(x2, Y0 + RAIL, zF + 2.6); uv.push(0.5, 0.01); }
    for (c = 0; c < NC; c++) { var q = base + 2 * c; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }

  /* Hoja de puerta: trozo curvo del costado, algo hacia fuera. */
  function doorLeafGeometry(width) {
    var rows = ROWS.filter(function (y) { return y >= 1.0 && y <= 3.1; });
    rows.unshift(1.0); rows.push(3.1);
    rows = rows.filter(function (y, i) { return i === 0 || y !== rows[i - 1]; });
    var pos = [], uv = [], idx = [];
    rows.forEach(function (y) {
      var x = W(y) + 0.022;
      pos.push(x, y + RAIL, -width / 2, x, y + RAIL, width / 2);
      uv.push(1, (y - 1.0) / 2.1, 0, (y - 1.0) / 2.1);
    });
    for (var i = 0; i < rows.length - 1; i++) { var a = 2 * i; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }

  /* Bastidor, bogies, equipos bajo bastidor, climatizadores y fuelle: una sola malla por tipo de coche. */
  function detailGeometry(kind, liv, bellows) {
    var L = kind === 'end' ? END_L : MID_L, h = L / 2, M = new Merger();
    var dark = 0x2a2d31, grey = 0x4a4f55, roofEq = new THREE.Color(liv.roof).multiplyScalar(0.86).getHex();
    var bog = kind === 'end' ? [-h + 3.9, h - 3.3] : [-h + 3.2, h - 3.2];
    // equipos bajo bastidor entre bogies
    var rng = RC.core.util.rng(kind === 'end' ? 11 : 23);
    for (var z = bog[0] + 1.9; z < bog[1] - 1.9;) {
      var len = 1.2 + rng() * 2.2; if (z + len > bog[1] - 1.9) len = bog[1] - 1.9 - z; if (len < 0.4) break;
      var hh = 0.24 + rng() * 0.12;
      M.box(2.5 - rng() * 0.5, hh, len, 0, Y0 + RAIL - hh / 2 + 0.02, z + len / 2, rng() < 0.3 ? grey : dark);
      z += len + 0.15 + rng() * 0.3;
    }
    // faldón bajo la caja (en el coche de cabeza empieza detrás del morro) y quitapiedras
    var fz0 = kind === 'end' ? -h + 1.3 : -h + 0.2;
    M.box(2.6, 0.12, h - 0.2 - fz0, 0, Y0 + RAIL - 0.03, (fz0 + h - 0.2) / 2, dark);
    if (kind === 'end') {
      M.box(2.2, 0.34, 0.5, 0, Y0 + RAIL - 0.12, -h + 0.75, dark);
      M.box(0.5, 0.22, 0.7, 0, Y0 + RAIL + 0.18, -h + 0.75, 0x3a3e43);   // enganche automático (tras la tapa)
    }
    // bogies: largueros, travesaño, cajas de grasa, muelles
    bog.forEach(function (bz) {
      [-1, 1].forEach(function (s) {
        M.box(0.2, 0.3, 2.9, s * 1.02, 0.6 + RAIL, bz, dark);
        [-1.25, 1.25].forEach(function (az) {
          M.box(0.26, 0.24, 0.36, s * 1.04, 0.42 + RAIL, bz + az, grey);
          M.cyl(0.11, 0.11, 0.26, s * 1.02, 0.72 + RAIL, bz + az * 0.55, 0x1c1e20);
        });
      });
      M.box(2.1, 0.26, 0.42, 0, 0.62 + RAIL, bz, dark);
      M.box(1.4, 0.18, 0.5, 0, 0.42 + RAIL, bz - 0.9, grey);   // motor / caja de transmisión
    });
    // climatizadores y escotillas del techo
    [-h + 2.6, h - 2.6].forEach(function (cz, i) {
      if (kind === 'end' && i === 0) cz = -h + 5.2;
      M.box(1.9, 0.3, 3.0, 0, YT + RAIL + 0.1, cz, roofEq);
      M.box(1.5, 0.06, 2.6, 0, YT + RAIL + 0.28, cz, new THREE.Color(roofEq).multiplyScalar(0.8).getHex());
    });
    // fuelle de intercirculación (en el extremo trasero de cada coche, salvo el de cola)
    if (bellows !== false) {
      var bel = 0x1d1f22;
      M.box(2.35, 2.75, GAP + 0.06, 0, 2.38 + RAIL, h + GAP / 2, bel);
      for (var k = 0; k < 4; k++) M.box(2.42, 2.82, 0.04, 0, 2.38 + RAIL, h + 0.06 + k * 0.12, 0x2b2e32);
    }
    return M.geometry();
  }

  /* Pantógrafo monobrazo. Devuelve el grupo y una función para fijar la altura (0 bajado … 1 arriba). */
  function buildPantograph(mats) {
    var g = new THREE.Group(), M = mats;
    var base = YT + RAIL + 0.02;
    var ins = new THREE.CylinderGeometry(0.06, 0.075, 0.26, 10);
    [[-0.45, -0.55], [0.45, -0.55], [-0.45, 0.55], [0.45, 0.55]].forEach(function (p) {
      var m = new THREE.Mesh(ins, M.insul); m.position.set(p[0], base + 0.13, p[1]); g.add(m);
    });
    var frame = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 1.4), M.panto); frame.position.set(0, base + 0.29, 0); g.add(frame);
    var tube = new THREE.CylinderGeometry(1, 1, 1, 8);
    function bar(r) { var m = new THREE.Mesh(tube, M.panto); m.userData.r = r; g.add(m); return m; }
    var lowA = bar(0.05), lowB = bar(0.05), upA = bar(0.032), upB = bar(0.032), rod = bar(0.015);
    var head = new THREE.Group(); g.add(head);
    var pan = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.05, 0.08), M.panto); head.add(pan);
    var strip = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.035, 0.06), M.carbon); strip.position.y = 0.04; head.add(strip);
    var pan2 = pan.clone(); pan2.position.z = 0.32; head.add(pan2);
    var strip2 = strip.clone(); strip2.position.z = 0.32; head.add(strip2);
    [-1, 1].forEach(function (s) {
      var horn = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.36, 6), M.panto);
      horn.position.set(s * 0.9, -0.08, 0.16); horn.rotation.z = s * 0.9; head.add(horn);
      var link = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.42), M.panto); link.position.set(s * 0.45, -0.02, 0.16); head.add(link);
    });
    var A = new THREE.Vector3(), K = new THREE.Vector3(), B = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3();
    function setBar(m, p, q, xo) {
      tmp.subVectors(q, p); var len = tmp.length();
      m.position.copy(p).add(q).multiplyScalar(0.5); m.position.x += xo || 0;
      m.quaternion.setFromUnitVectors(up, tmp.normalize());
      m.scale.set(m.userData.r, len, m.userData.r);
    }
    var L1 = 1.8, L2 = 1.75;
    function set(f) {
      var H = 4.72 + (5.6 - 4.72) * f;       // altura del frotador sobre la plataforma (hilo de contacto a 5,6 m)
      A.set(0, base + 0.32, 0.9); B.set(0, H - 0.06, 0.0);
      // rodilla: intersección de dos circunferencias en el plano YZ (solución hacia delante)
      var dz = B.z - A.z, dy = B.y - A.y, d = Math.min(L1 + L2 - 1e-3, Math.hypot(dz, dy));
      var a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), hgt = Math.sqrt(Math.max(0, L1 * L1 - a * a));
      var mz = A.z + a * dz / d, my = A.y + a * dy / d;
      var k1z = mz + hgt * dy / d, k1y = my - hgt * dz / d, k2z = mz - hgt * dy / d, k2y = my + hgt * dz / d;
      if (k1z < k2z) K.set(0, k1y, k1z); else K.set(0, k2y, k2z);
      setBar(lowA, A, K, -0.16); setBar(lowB, A, K, 0.16);
      setBar(upA, K, B, -0.05); setBar(upB, K, B, 0.05);
      setBar(rod, A.clone().setZ(A.z - 0.25), K.clone().setY(K.y - 0.12));
      head.position.set(0, H - 0.03, -0.16);
    }
    set(0);
    return { group: g, set: set };
  }

  /* ---------- Recursos compartidos por todos los trenes ---------- */
  var SH = null;
  function shared() {
    if (SH) return SH;
    var liv = brandLivery();
    var bodies = {}, mats = {};
    ['end', 'mid'].forEach(function (k) {
      var p = paintBody(k, liv, null);
      var orm = tex(p.orm);
      mats[k] = new THREE.MeshStandardMaterial({ map: tex(p.color, true), emissiveMap: tex(p.emis, true), emissive: 0xffffff, emissiveIntensity: 0.1,
        roughnessMap: orm, metalnessMap: orm, roughness: 1, metalness: 1, envMapIntensity: 1.1 });
      bodies[k] = { paint: p, geo: bodyGeometry(k), detail: detailGeometry(k, liv), lay: p.lay };
      if (k === 'end') bodies[k].detailTail = detailGeometry(k, liv, false);
    });
    var f = paintFront(liv), form = tex(f.orm);
    mats.cap = new THREE.MeshStandardMaterial({ map: tex(f.color, true), emissiveMap: tex(f.emis, true), emissive: 0xffffff, emissiveIntensity: 0.1,
      roughnessMap: form, metalnessMap: form, roughness: 1, metalness: 1, envMapIntensity: 1.2 });
    mats.detail = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.35 });
    mats.door = new THREE.MeshStandardMaterial({ map: tex(paintDoor(liv), true), roughness: 0.35, metalness: 0.15, side: THREE.DoubleSide });
    mats.wheel = new THREE.MeshStandardMaterial({ color: 0x75797e, roughness: 0.4, metalness: 0.85 });
    mats.panto = new THREE.MeshStandardMaterial({ color: 0x8b9096, roughness: 0.45, metalness: 0.7 });
    mats.insul = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.4, metalness: 0 });
    mats.carbon = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.6 });
    // logotipo de la marca en los costados cuando cargue la imagen
    var b = RC.data.brand;
    if (b && b.image && b.operator && b.operator.logoSvg) {
      b.image(b.operator.logoSvg, function (img) {
        ['end', 'mid'].forEach(function (k) {
          var p = paintBody(k, liv, img);
          mats[k].map.image = p.color; mats[k].map.needsUpdate = true;
        });
      });
    }
    // rueda (con pestaña) para instanciar
    var wheel = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.13, 18); wheel.rotateZ(Math.PI / 2);
    var flange = new THREE.CylinderGeometry(WHEEL_R + 0.03, WHEEL_R + 0.03, 0.03, 18); flange.rotateZ(Math.PI / 2); flange.translate(-0.06, 0, 0);
    var axle = new THREE.CylinderGeometry(0.07, 0.07, 1.5, 8); axle.rotateZ(Math.PI / 2);
    var wm = new Merger();
    [-1, 1].forEach(function (s) {
      var m = new THREE.Matrix4().makeTranslation(s * 0.8, 0, 0);
      wm.add(wheel, m, 0x7a7e83);
      var mf = new THREE.Matrix4().makeScale(s, 1, 1).premultiply(new THREE.Matrix4().makeTranslation(s * 0.8, 0, 0));
      wm.add(flange, mf, 0x5a5d61);
      wm.add(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 12).rotateZ(Math.PI / 2), new THREE.Matrix4().makeTranslation(s * 0.88, 0, 0), 0x3a3c3f);
    });
    wm.add(axle, new THREE.Matrix4(), 0x4a4d50);
    mats.wheelset = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.8 });
    SH = { liv: liv, bodies: bodies, mats: mats, cap: capGeometry(), leaf: doorLeafGeometry(0.68), wheelset: wm.geometry(), glow: null };
    return SH;
  }

  function glowTex() {
    if (shared().glow) return SH.glow;
    var c = canvas(64, 64), g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.22, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    SH.glow = tex(c, true); return SH.glow;
  }

  /* Rótulo de destino (LED ámbar) */
  var destCache = {};
  function destTex(text) {
    if (destCache[text]) return destCache[text];
    var c = canvas(512, 96), g = c.getContext('2d');
    g.fillStyle = '#050505'; g.fillRect(0, 0, 512, 96);
    g.fillStyle = '#ffb21e'; g.font = '700 58px Consolas, Lucida Console, monospace'; g.textBaseline = 'middle';
    var lc = RC.data.brand && RC.data.brand.lines && RC.data.brand.lines.C1;
    g.fillStyle = lc ? lc.color : '#1E88C8'; g.beginPath(); g.arc(52, 48, 34, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = '800 34px Segoe UI, Arial, sans-serif'; g.textAlign = 'center'; g.fillText('C1', 52, 50);
    g.fillStyle = '#ffb21e'; g.font = '700 50px Consolas, Lucida Console, monospace'; g.textAlign = 'left'; g.fillText(text.toUpperCase(), 100, 50);
    // rejilla de LED
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (var x = 0; x < 512; x += 4) g.fillRect(x, 0, 1, 96);
    for (var y = 0; y < 96; y += 4) g.fillRect(0, y, 512, 1);
    return (destCache[text] = tex(c, true));
  }

  /* Punto y normal de la superficie del morro (coordenadas locales del coche de cabeza). */
  function nosePoint(x, y) {
    var zF = -END_L / 2, z = noseZ(x, y, zF), e = 0.01;
    var dx = (noseZ(x + e, y, zF) - noseZ(x - e, y, zF)) / (2 * e), dy = (noseZ(x, y + e, zF) - noseZ(x, y - e, zF)) / (2 * e);
    var n = new THREE.Vector3(dx, dy, -1).normalize();
    return { p: new THREE.Vector3(x, y + RAIL, z), n: n };
  }

  /* ---------- Un tren completo ---------- */
  function create(opts) {
    opts = opts || {};
    var S = shared(), M = S.mats, nCars = opts.cars || 5;
    var T = { group: new THREE.Group(), cars: [], dest: opts.dest || 'Utrera', length: 0, lamps: [], wheelAngle: 0 };
    var kinds = [];
    for (var i = 0; i < nCars; i++) kinds.push(i === 0 || i === nCars - 1 ? 'end' : 'mid');
    var acc = 0;
    kinds.forEach(function (k, i) {
      var L = k === 'end' ? END_L : MID_L, B = S.bodies[k];
      var car = new THREE.Group(); car.userData.L = L;
      var inner = new THREE.Group(); car.add(inner);
      if (i === nCars - 1 && nCars > 1) inner.rotation.y = Math.PI;   // coche de cola: mismo coche girado
      inner.add(new THREE.Mesh(B.geo, M[k]));
      var det = new THREE.Mesh(i === nCars - 1 && nCars > 1 ? B.detailTail : B.detail, M.detail); inner.add(det);
      if (k === 'end') {
        inner.add(new THREE.Mesh(S.cap, M.cap));
        // rótulo de destino tras el parabrisas
        var dp = nosePoint(0, 3.3);
        var disp = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.22), new THREE.MeshBasicMaterial({ map: destTex(T.dest), toneMapped: false }));
        disp.position.copy(dp.p).addScaledVector(dp.n, 0.012); disp.lookAt(disp.position.clone().add(dp.n)); inner.add(disp);
        T.lamps.push(buildLamps(inner, i === 0));
      }
      // puertas: dos hojas por puerta y lado
      var leaves = [];
      B.lay.doors.forEach(function (dz) {
        [-1, 1].forEach(function (side) {
          [-1, 1].forEach(function (half) {
            var m = new THREE.Mesh(S.leaf, M.door);
            if (side < 0) m.scale.x = -1;
            m.position.set(0, 0, dz + half * 0.34);
            inner.add(m);
            // en el coche de cola (girado) el lado de la vía es el contrario
            var worldSide = (i === nCars - 1 && nCars > 1) ? -side : side;
            leaves.push({ mesh: m, z0: dz + half * 0.34, half: half, side: worldSide, localSide: side });
          });
        });
      });
      // bogies con ruedas que giran
      var h = L / 2, bog = k === 'end' ? [-h + 3.9, h - 3.3] : [-h + 3.2, h - 3.2], wheels = [];
      bog.forEach(function (bz) { [-1.25, 1.25].forEach(function (az) { var w = new THREE.Mesh(S.wheelset, M.wheelset); w.position.set(0, RAIL + WHEEL_R, bz + az); inner.add(w); wheels.push(w); }); });
      // pantógrafo en el segundo coche
      var panto = null;
      if (i === 1 || (nCars === 1 && i === 0)) { panto = buildPantograph(M); panto.group.position.z = -2.0; inner.add(panto.group); }
      T.cars.push({ group: car, inner: inner, L: L, offset: acc + L / 2, leaves: leaves, wheels: wheels, panto: panto, detail: det });
      T.group.add(car);
      acc += L + (i < nCars - 1 ? GAP : 0);
    });
    T.length = acc;
    T.state = { doorsL: -1, doorsR: -1, panto: -1, front: -1, rear: -1 };
    return T;
  }

  /* Faros (blancos) y pilotos (rojos) de un testero. */
  function buildLamps(inner, isHead) {
    var G = glowTex(), set = { white: [], red: [] };
    function lamp(x, y, r, kind) {
      var np = nosePoint(x, y);
      var mat = new THREE.MeshBasicMaterial({ color: 0x2a2a2a, toneMapped: false });
      var m = new THREE.Mesh(new THREE.CircleGeometry(r, 16), mat);
      m.position.copy(np.p).addScaledVector(np.n, 0.01); m.lookAt(m.position.clone().add(np.n)); inner.add(m);
      var spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: G, color: kind === 'red' ? 0xff2a1a : 0xfff4dc, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      spr.position.copy(np.p).addScaledVector(np.n, 0.12); spr.visible = false; inner.add(spr);
      set[kind].push({ mat: mat, spr: spr, on: kind === 'red' ? 0xff3322 : 0xfffbf0 });
    }
    [-1, 1].forEach(function (s) {
      lamp(s * 1.06, 1.53, 0.075, 'white');
      lamp(s * 0.86, 1.53, 0.06, 'white');
      lamp(s * 0.74, 1.53, 0.045, 'red');
    });
    lamp(0, 3.66, 0.07, 'white');
    return set;
  }
  function setLamps(set, white, red, night) {
    if (!set) return;
    set.white.forEach(function (l) {
      l.mat.color.setHex(white ? l.on : 0x2a2a2a); l.spr.visible = !!white;
      var s = (white === 2 ? 2.0 : 1.3) * (0.3 + night * 1.2); l.spr.scale.set(s, s, 1);
    });
    set.red.forEach(function (l) {
      l.mat.color.setHex(red ? l.on : 0x301010); l.spr.visible = !!red;
      var s = 0.9 * (0.35 + night * 1.6); l.spr.scale.set(s, s, 1);
    });
  }

  /* Coloca el tren sobre la vía y actualiza puertas, pantógrafo, luces y ruedas.
   * o: { al, x (cabeza), dir (+1 hacia Utrera, −1 hacia Santa Justa), off(x) desplazamiento lateral,
   *      doorsL, doorsR (0…1, lados respecto al sentido de marcha), panto (0…1), head (0/1/2),
   *      tail (bool), night (0…1), cam (Vector3) } */
  function update(T, o) {
    var W3 = RC.ui3d.world, al = o.al, dir = o.dir || 1, off = o.off || function () { return 0; };
    T.group.visible = true;
    var far = o.cam ? o.cam.distanceTo(W3.at(al, o.x - dir * T.length / 2, off(o.x), 0)) : 0;
    if (far > (o.maxDist || 3500)) { T.group.visible = false; return; }
    var detail = far < 420, doorsNear = far < 260 || (o.doorsL || 0) > 0 || (o.doorsR || 0) > 0;
    T.wheelAngle = o.x / WHEEL_R;
    T.cars.forEach(function (c, i) {
      var xc = o.x - dir * c.offset;
      var F = W3.frame(al, xc), lat = off(xc), dOff = (off(xc + 2) - off(xc - 2)) / 4;   // la vía 2 se abre en los andenes centrales
      var ya = W3.frame(al, xc - c.L / 2).y, yb = W3.frame(al, xc + c.L / 2).y;
      var slope = Math.atan2(yb - ya, c.L) * dir;
      c.group.position.set(F.x + F.rx * lat, F.y, F.z + F.rz * lat);
      c.group.rotation.set(slope, -F.heading - Math.atan(dOff) + (dir < 0 ? Math.PI : 0), 0, 'YXZ');
      c.detail.visible = detail;
      if (c.leavesOn !== doorsNear) { c.leavesOn = doorsNear; c.leaves.forEach(function (lf) { lf.mesh.visible = doorsNear; }); }   // de lejos y cerradas, bastan las puertas pintadas
      c.wheels.forEach(function (w) { w.visible = detail; w.rotation.x = -T.wheelAngle; });
      if (c.panto) c.panto.group.visible = far < 900;
    });
    // puertas (sólo cuando cambian)
    var dl = Math.round((o.doorsL || 0) * 40) / 40, dr = Math.round((o.doorsR || 0) * 40) / 40;
    if (dl !== T.state.doorsL || dr !== T.state.doorsR) {
      T.state.doorsL = dl; T.state.doorsR = dr;
      T.cars.forEach(function (c) {
        c.leaves.forEach(function (lf) {
          var f = lf.side < 0 ? dl : dr;
          var out = Math.min(1, f * 4) * 0.05, slide = Math.max(0, (f - 0.12) / 0.88) * 0.66;
          lf.mesh.position.set(lf.localSide * out, 0, lf.z0 + lf.half * slide);
        });
      });
    }
    var pv = Math.round((o.panto || 0) * 100) / 100;
    if (pv !== T.state.panto) { T.state.panto = pv; T.cars.forEach(function (c) { if (c.panto) c.panto.set(pv); }); }
    // luces: el testero de cabeza lleva faros; el de cola, pilotos rojos
    var night = o.night || 0;
    setLamps(T.lamps[0], o.head || 0, false, night);
    if (T.lamps[1]) setLamps(T.lamps[1], 0, !!o.tail, night);
  }

  /* Luz interior y del rótulo según la noche (común a todos los trenes). */
  function setNight(night, interiorOn) {
    var S = shared(), k = interiorOn === false ? 0 : 0.03 + 1.25 * night;
    S.mats.end.emissiveIntensity = k; S.mats.mid.emissiveIntensity = k; S.mats.cap.emissiveIntensity = k * 0.4;
  }

  RC.ui3d = RC.ui3d || {};
  RC.ui3d.emu = { create: create, update: update, setNight: setNight, END_L: END_L, MID_L: MID_L, GAP: GAP, W: W, nosePoint: nosePoint };
})(globalThis.RC);
