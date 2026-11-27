/* RAILCORE — Estaciones de la C-1 en 3D (sólo presentación: lee la simulación, nunca la modifica).
 *
 * Cada estación se monta con los datos de la ruta (cartelón de parada, longitud y lado del andén):
 *  - andén a la derecha  → dos andenes laterales, uno junto a cada vía;
 *  - andén a la izquierda → andén central entre las dos vías (la vía 2 se separa, ver world3d);
 *  - la primera estación (Santa Justa) lleva una gran nave con cubierta abovedada;
 *  - si el andén queda dentro de un túnel, la estación es subterránea (San Bernardo).
 * Incluye borde de seguridad con banda táctil, rampas, vallas, marquesinas con luz, bancos,
 * papeleras, farolas, carteles con la marca de infraestructuras, pantallas de próximos trenes,
 * relojes con la hora de la simulación, cartelón de parada «P» y viajeros esperando. */
(function (RC) {
  var PH = 0.95, EDGE = 1.72, PW = 6.0, PW_TERM = 11.0, CAV_H = 7.0, MAIN = 120;
  function W3() { return RC.ui3d.world; }
  function val(v, x) { return typeof v === 'function' ? v(x) : v; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ---------- Zonas de estación (también las usan world3d y realworld3d) ---------- */
  function zones(line) {
    var tunnels = line.tunnels || [];
    return (line.stations || []).map(function (st, i) {
      var xa = st.stopX - st.platformLength - 6, xb = st.stopX + 20, tn = null;
      tunnels.forEach(function (t) { if (t.from < xa && t.to > xb) tn = t; });
      var kind = i === 0 ? 'shed' : tn ? 'underground' : 'surface';
      var z = { st: st, idx: i, xa: xa, xb: xb, island: st.side === 'izquierda', kind: kind, pw: kind === 'shed' ? PW_TERM : PW };
      if (tn) {   // la caverna se ajusta a la rejilla de 10 m del túnel para empalmar sin huecos
        z.x0 = tn.from + Math.floor((xa - 6 - tn.from) / 10) * 10;
        z.x1 = tn.from + Math.ceil((xb + 6 - tn.from) / 10) * 10;
      } else { z.x0 = xa - 12; z.x1 = xb + 12; }
      return z;
    });
  }
  /* Franja lateral que ocupa la estación (para rebajar el terreno real que la tapaba). */
  function corridor(z, o2) {
    if (z.island) return { l: o2 - 5.5, r: 5.5 };
    return { l: o2 - EDGE - z.pw - (z.kind === 'shed' ? 4 : 2), r: EDGE + z.pw + (z.kind === 'shed' ? 4 : 2) };
  }
  /* Andenes: a < b (desplazamiento lateral respecto a la vía 1); ea/eb = ese lado da a una vía. */
  function platformsOf(z, o2) {
    if (z.island) return [{ a: o2 + EDGE, b: -EDGE, ea: true, eb: true }];
    return [{ a: EDGE, b: EDGE + z.pw, ea: true, eb: false }, { a: o2 - EDGE - z.pw, b: o2 - EDGE, ea: false, eb: true }];
  }

  /* ---------- Geometría combinada con colores por vértice ---------- */
  function Merge() { this.p = []; this.n = []; this.c = []; this.i = []; this.k = 0; }
  Merge.prototype.add = function (geo, m4, color) {
    var g = geo.clone().applyMatrix4(m4), P = g.attributes.position, N = g.attributes.normal, c = new THREE.Color(color), j;
    for (j = 0; j < P.count; j++) { this.p.push(P.getX(j), P.getY(j), P.getZ(j)); this.n.push(N.getX(j), N.getY(j), N.getZ(j)); this.c.push(c.r, c.g, c.b); }
    if (g.index) for (j = 0; j < g.index.count; j++) this.i.push(this.k + g.index.getX(j));
    else for (j = 0; j < P.count; j++) this.i.push(this.k + j);
    this.k += P.count; g.dispose();
    return this;
  };
  Merge.prototype.geometry = function () {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i); g.computeBoundingSphere();
    return g;
  };

  var BOX = null, CYL = null;
  function prims() { if (!BOX) { BOX = new THREE.BoxGeometry(1, 1, 1); CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 12); } }
  var _o = new THREE.Object3D();
  /* Matriz de un objeto apoyado en la vía (x, lateral, altura, giro). Local: X a la derecha, +Z hacia atrás. */
  function frameM(al, x, lat, up, yaw) { W3().place(_o, al, x, lat, up, yaw || 0); _o.updateMatrix(); return _o.matrix.clone(); }
  function local(base, x, y, z, sx, sy, sz, rx, ry, rz) {
    var m = base.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, z));
    if (rx || ry || rz) m.multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)));
    return m.multiply(new THREE.Matrix4().makeScale(sx, sy, sz));
  }
  /* Giro para que el frente (+Z local) mire hacia el lado dir (+1 derecha, −1 izquierda). */
  function faceYaw(dir) { return dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
  function plane(w, h, mat, m4) { var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m4.decompose(m.position, m.quaternion, m.scale); return m; }

  /* Cinta a lo largo de la vía que acaba exactamente en x1. */
  function strip(al, x0, x1, offL, offR, upL, upR, mat, vScale) {
    var n = Math.max(1, Math.ceil((x1 - x0) / 4));
    return W3().ribbon(al, x0, x1, (x1 - x0) / n, offL, offR, upL, upR, mat, vScale);
  }
  /* Pared vertical a lo largo de la vía: u = metros a lo largo / uScale, v = 0 abajo … 1 arriba. */
  function wall(al, x0, x1, lat, y0, y1, mat, uScale, flipU) {
    var n = Math.max(1, Math.ceil((x1 - x0) / 4)), pos = [], uv = [], idx = [], at = W3().at;
    for (var i = 0; i <= n; i++) {
      var x = x0 + (x1 - x0) * i / n, l = val(lat, x), a = at(al, x, l, val(y0, x)), b = at(al, x, l, val(y1, x));
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      var u = (x - x0) / uScale * (flipU ? -1 : 1);
      uv.push(u, 0, u, 1);
      if (i) { var j = (i - 1) * 2; idx.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    return new THREE.Mesh(geo, mat);
  }
  /* Bóveda (sección en arco) entre dos laterales. */
  function vault(al, x0, x1, latL, latR, h0, rise, mat) {
    var nx = Math.max(1, Math.ceil((x1 - x0) / 6)), nt = 20, pos = [], uv = [], idx = [], at = W3().at;
    for (var i = 0; i <= nx; i++) {
      var x = x0 + (x1 - x0) * i / nx;
      for (var j = 0; j <= nt; j++) {
        var t = j / nt, p = at(al, x, latL + (latR - latL) * t, h0 + rise * Math.sin(Math.PI * t));
        pos.push(p.x, p.y, p.z); uv.push(t * (latR - latL) / 8, (x - x0) / 8);
      }
    }
    for (i = 0; i < nx; i++) for (j = 0; j < nt; j++) { var a = i * (nt + 1) + j, c = a + nt + 1; idx.push(a, c, a + 1, a + 1, c, c + 1); }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    return new THREE.Mesh(geo, mat);
  }

  /* ---------- Texturas dibujadas ---------- */
  function ctex(w, h, draw, rep) { return W3().canvasTex(w, h, draw, rep ? [1, 1] : null); }
  function edgeTex() {   // u: desde el borde hacia dentro (1,1 m); v: 1 m a lo largo
    return ctex(256, 64, function (g, w, h) {
      g.fillStyle = '#dcd8cf'; g.fillRect(0, 0, w * 0.3, h);                 // bordillo
      g.fillStyle = 'rgba(70,64,58,.55)'; g.fillRect(0, 0, w * 0.3, 2);       // junta cada metro
      g.fillStyle = '#f0c300'; g.fillRect(w * 0.3, 0, w * 0.1, h);            // línea amarilla
      g.fillStyle = '#cbc6bb'; g.fillRect(w * 0.4, 0, w * 0.6, h);            // banda táctil
      g.fillStyle = '#b1ab9d';
      for (var y = 5; y < h; y += 10) for (var x = w * 0.45; x < w * 0.98; x += 10) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
    }, true);
  }
  function fenceTex() {
    return ctex(128, 64, function (g, w, h) {
      g.clearRect(0, 0, w, h); g.fillStyle = '#5b646d';
      g.fillRect(0, 3, w, 5); g.fillRect(0, h - 12, w, 4);
      for (var x = 2; x < w; x += 8) g.fillRect(x, 3, 3, h - 4);
    }, true);
  }
  function poolTex() {
    return ctex(64, 128, function (g, w, h) {
      var r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, h / 2);
      r.addColorStop(0, 'rgba(255,232,190,0.95)'); r.addColorStop(0.45, 'rgba(255,232,190,0.35)'); r.addColorStop(1, 'rgba(255,232,190,0)');
      g.fillStyle = r; g.fillRect(0, 0, w, h);
    }, true);
  }
  function fasciaTex(S) {
    return ctex(16, 64, function (g, w, h) { g.fillStyle = S.stationBg; g.fillRect(0, 0, w, h); g.fillStyle = S.stationAccent; g.fillRect(0, 44, w, 6); }, true);
  }
  function vaultTex(emis) {
    return ctex(256, 256, function (g, w, h) {
      g.fillStyle = emis ? '#000' : '#c3c8cc'; g.fillRect(0, 0, w, h);
      if (!emis) { g.fillStyle = 'rgba(70,78,86,0.45)'; for (var y = 0; y < h; y += 32) g.fillRect(0, y, w, 2); for (var x = 0; x < w; x += 64) g.fillRect(x, 0, 2, h); }
      g.fillStyle = emis ? '#fff' : '#eef4f8'; g.fillRect(w * 0.32, 0, w * 0.36, h);   // lucernario
      if (!emis) { g.fillStyle = 'rgba(80,90,100,0.55)'; for (var y2 = 0; y2 < h; y2 += 16) g.fillRect(w * 0.32, y2, w * 0.36, 2); }
    }, true);
  }
  function shedWallTex() {
    return ctex(256, 256, function (g, w, h) {
      g.fillStyle = '#d4cfc6'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(90,84,76,.25)'; for (var y = 0; y < h; y += 26) g.fillRect(0, y, w, 2);
      for (var i = 0; i < 2; i++) {   // ventanales altos
        var x0 = i * w / 2 + w * 0.08;
        g.fillStyle = '#3c4852'; g.fillRect(x0, h * 0.08, w * 0.34, h * 0.42);
        g.fillStyle = 'rgba(200,220,235,.35)'; g.fillRect(x0 + 6, h * 0.08 + 6, w * 0.34 - 12, h * 0.42 * 0.35);
        g.fillStyle = '#9aa1a7'; for (var k = 1; k < 4; k++) g.fillRect(x0 + k * w * 0.085, h * 0.08, 3, h * 0.42);
      }
    }, true);
  }
  function tileWallTex(name, S) {   // 20 m a lo largo × altura de la caverna sobre el andén
    var H = CAV_H - PH;
    return ctex(1024, 320, function (g, w, h) {
      var pxm = h / H;
      function Y(m) { return h - m * pxm; }
      g.fillStyle = '#e8ebeb'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(120,128,132,0.35)';
      for (var x = 0; x < w; x += w / 20 / 4) g.fillRect(x, 0, 1, h);
      for (var y = 0; y < h; y += pxm * 0.25) g.fillRect(0, y, w, 1);
      g.fillStyle = '#59606a'; g.fillRect(0, Y(0.35), w, 0.35 * pxm);              // zócalo
      g.fillStyle = S.stationBg; g.fillRect(0, Y(2.55), w, 0.85 * pxm);            // franja con el nombre
      g.fillStyle = S.stationAccent; g.fillRect(0, Y(1.62), w, 0.08 * pxm);
      g.fillStyle = '#fff'; g.font = '600 ' + Math.round(0.52 * pxm) + 'px Segoe UI, Arial, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(name, w / 2, Y(2.12));
    }, true);
  }
  function clockTex() {
    var c = document.createElement('canvas'); c.width = c.height = 256;
    var g = c.getContext('2d');
    g.fillStyle = '#f7f7f2'; g.beginPath(); g.arc(128, 128, 122, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#1d1d1d'; g.lineWidth = 7; g.stroke();
    for (var i = 0; i < 60; i++) {
      var a = i / 60 * Math.PI * 2, r0 = i % 5 ? 104 : 86, r1 = 112;
      g.lineWidth = i % 5 ? 3 : 10; g.beginPath();
      g.moveTo(128 + Math.sin(a) * r0, 128 - Math.cos(a) * r0); g.lineTo(128 + Math.sin(a) * r1, 128 - Math.cos(a) * r1); g.stroke();
    }
    var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }
  /* Cartel de estación: fondo de la marca de infraestructuras, logotipo y nombre real. */
  function brandBoard(brand, name) {
    var S = brand.signage, c = document.createElement('canvas'); c.width = 1024; c.height = 256;
    var g = c.getContext('2d'), t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    function paint(logo) {
      g.fillStyle = S.stationBg; g.fillRect(0, 0, 1024, 256);
      g.fillStyle = S.stationAccent; g.fillRect(0, 232, 1024, 24);
      if (logo) { g.fillStyle = '#ffffff'; g.fillRect(18, 34, 176, 164); g.drawImage(logo, 0, 0, 120, 120, 30, 46, 140, 140); }
      g.fillStyle = S.stationFg; g.textAlign = 'left'; g.textBaseline = 'middle';
      var fs = 92; g.font = '600 ' + fs + 'px Segoe UI, Arial, sans-serif';
      while (g.measureText(name).width > 780 && fs > 40) { fs -= 4; g.font = '600 ' + fs + 'px Segoe UI, Arial, sans-serif'; }
      g.fillText(name, 220, 120);
      t.needsUpdate = true;
    }
    paint(null);
    if (brand.image && brand.infra && brand.infra.logoSvg) brand.image(brand.infra.logoSvg, paint);
    return t;
  }

  /* ---------- Materiales comunes ---------- */
  var MAT = null;
  var C = { seat: 0x34477d, metal: 0x7d858c, bin: 0x3e4a44, binLid: 0x262b28, steel: 0x8f979e, post: 0x5f666d, housing: 0x2a2e34,
    tile: 0xe3e6e6, rib: 0x9aa1a8, boardBack: 0x1f2c52 };
  function mats() {
    if (MAT) return MAT;
    prims();
    var T = RC.ui3d.pbr, b = RC.data.brand, S = (b && b.signage) || { stationBg: '#2C3E73', stationFg: '#FFFFFF', stationAccent: '#F2A900' };
    var pool = poolTex(), glow = W3().glowTex();
    MAT = {
      S: S, top: {},
      edge: new THREE.MeshStandardMaterial({ map: edgeTex(), roughness: 0.8, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      face: T('sleeper', [1, 1], { color: 0xbdb9b0, side: THREE.DoubleSide }),
      fence: new THREE.MeshStandardMaterial({ map: fenceTex(), alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.5, roughness: 0.5 }),
      roof: new THREE.MeshStandardMaterial({ color: 0xdadde0, roughness: 0.42, metalness: 0.6, side: THREE.DoubleSide }),
      fascia: new THREE.MeshStandardMaterial({ map: fasciaTex(S), roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide }),
      furn: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35 }),
      lamp: new THREE.MeshBasicMaterial({ color: 0x9a9a9a, side: THREE.DoubleSide, toneMapped: false }),
      lampOn: new THREE.MeshBasicMaterial({ color: 0xfff1d0, side: THREE.DoubleSide, toneMapped: false }),
      pool: new THREE.MeshBasicMaterial({ map: pool, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
      poolOn: new THREE.MeshBasicMaterial({ map: pool, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
      glow: new THREE.PointsMaterial({ map: glow, size: 1.8, transparent: true, opacity: 0, color: 0xffe0b0, blending: THREE.AdditiveBlending, depthWrite: false }),
      vault: new THREE.MeshStandardMaterial({ map: vaultTex(false), emissiveMap: vaultTex(true), emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide }),
      shedWall: new THREE.MeshStandardMaterial({ map: shedWallTex(), roughness: 0.85, side: THREE.DoubleSide }),
      ceiling: new THREE.MeshStandardMaterial({ color: 0x3b3f45, roughness: 0.9, side: THREE.DoubleSide }),
      people: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 }),
      clockFace: new THREE.MeshBasicMaterial({ map: clockTex(), transparent: true, alphaTest: 0.4 }),
      hand: new THREE.MeshBasicMaterial({ color: 0x111111 }),
      stopP: new THREE.MeshBasicMaterial({ map: W3().textTex('P', { bg: '#ffffff', fg: '#c00000', w: 128, h: 128, size: 0.8, border: '#c00000' }) }),
      hourGeo: new THREE.PlaneGeometry(0.036, 0.17).translate(0, 0.065, 0),
      minGeo: new THREE.PlaneGeometry(0.024, 0.25).translate(0, 0.1, 0)
    };
    return MAT;
  }
  function topMat(M, w) {
    var k = w.toFixed(1);
    return M.top[k] || (M.top[k] = RC.ui3d.pbr('platform', [Math.max(1, Math.round(w / 2)), 1], { color: 0xd9d5cd }));
  }

  /* ---------- Mobiliario (frente hacia +Z local) ---------- */
  function bench(F, base) {
    F.add(BOX, local(base, 0, 0.45, 0, 1.8, 0.05, 0.44), C.seat);
    F.add(BOX, local(base, 0, 0.74, -0.2, 1.8, 0.42, 0.04, -0.15, 0, 0), C.seat);
    [-0.75, 0.75].forEach(function (x) {
      F.add(BOX, local(base, x, 0.22, 0, 0.06, 0.44, 0.4), C.metal);
      F.add(BOX, local(base, x, 0.62, -0.22, 0.05, 0.5, 0.05), C.metal);
    });
  }
  function bin(F, base) {
    F.add(CYL, local(base, 0, 0.38, 0, 0.4, 0.76, 0.4), C.bin);
    F.add(CYL, local(base, 0, 0.78, 0, 0.44, 0.05, 0.44), C.binLid);
  }
  function lampPost(F, base, glows, both) {
    F.add(CYL, local(base, 0, 2.3, 0, 0.13, 4.6, 0.13), C.post);
    (both ? [1, -1] : [1]).forEach(function (s) {
      F.add(BOX, local(base, 0, 4.5, s * 0.45, 0.07, 0.07, 0.9), C.post);
      F.add(BOX, local(base, 0, 4.45, s * 0.95, 0.28, 0.1, 0.5), C.housing);
      glows.push(new THREE.Vector3(0, 4.33, s * 0.95).applyMatrix4(base));
    });
  }
  function column(F, base, h) {
    F.add(CYL, local(base, 0, h / 2, 0, 0.22, h, 0.22), C.steel);
    F.add(BOX, local(base, 0, 0.03, 0, 0.45, 0.06, 0.45), C.steel);
  }
  function beam(F, base, x0, y0, x1, y1, color) {   // viga en el plano lateral (X, Y) del marco base
    var len = Math.hypot(x1 - x0, y1 - y0), ang = Math.atan2(y1 - y0, x1 - x0);
    F.add(BOX, local(base, (x0 + x1) / 2, (y0 + y1) / 2, 0, len, 0.16, 0.12, 0, 0, ang), color || C.steel);
  }
  function boardPosts(F, g, base, mat, two) {
    [-1.55, 1.55].forEach(function (x) { F.add(CYL, local(base, x, 1.55, 0, 0.1, 3.1, 0.1), C.post); });
    F.add(BOX, local(base, 0, 2.6, 0, 3.75, 1.0, 0.08), C.boardBack);
    g.add(plane(3.6, 0.9, mat, local(base, 0, 2.6, 0.045, 1, 1, 1)));
    if (two) g.add(plane(3.6, 0.9, mat, local(base, 0, 2.6, -0.045, 1, 1, 1, 0, Math.PI, 0)));
  }
  function screenPost(F, g, base, mat) {
    F.add(CYL, local(base, 0, 1.5, 0, 0.12, 3.0, 0.12), C.post);
    F.add(BOX, local(base, 0, 2.75, 0, 1.62, 0.66, 0.14), C.housing);
    g.add(plane(1.5, 0.5625, mat, local(base, 0, 2.75, 0.075, 1, 1, 1)));
    g.add(plane(1.5, 0.5625, mat, local(base, 0, 2.75, -0.075, 1, 1, 1, 0, Math.PI, 0)));
  }
  function clockPost(F, g, base, M, rec) {
    F.add(CYL, local(base, 0, 1.55, 0, 0.1, 3.1, 0.1), C.post);
    F.add(CYL, local(base, 0, 3.0, 0, 0.74, 0.1, 0.74, Math.PI / 2, 0, 0), C.housing);
    var grp = new THREE.Group(); local(base, 0, 3.0, 0, 1, 1, 1).decompose(grp.position, grp.quaternion, grp.scale); g.add(grp);
    [0, Math.PI].forEach(function (ry) {
      var fg = new THREE.Group(); fg.rotation.y = ry; grp.add(fg);
      var face = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.66), M.clockFace); face.position.z = 0.052; fg.add(face);
      var hh = new THREE.Mesh(M.hourGeo, M.hand); hh.position.z = 0.056; fg.add(hh);
      var mm = new THREE.Mesh(M.minGeo, M.hand); mm.position.z = 0.058; fg.add(mm);
      rec.clocks.push({ h: hh, m: mm });
    });
  }
  function stopSign(F, g, base, M) {
    F.add(CYL, local(base, 0, 0.8, 0, 0.08, 1.6, 0.08), C.post);
    F.add(BOX, local(base, 0, 1.75, -0.03, 0.66, 0.66, 0.03), C.post);
    g.add(plane(0.6, 0.6, M.stopP, local(base, 0, 1.75, 0.0, 1, 1, 1)));
  }

  /* ---------- Viajeros: figura sencilla en tres piezas (ropa, piernas, piel) ---------- */
  var HUMAN = null;
  function humanGeos() {
    if (HUMAN) return HUMAN;
    prims();
    var cloth = new Merge(), legs = new Merge(), skin = new Merge(), I = new THREE.Matrix4();
    var sph = new THREE.SphereGeometry(0.5, 9, 7);
    function T(x, y, z, sx, sy, sz, rz) { return local(I, x, y, z, sx, sy, sz, 0, 0, rz || 0); }
    [-1, 1].forEach(function (s) {
      legs.add(BOX, T(s * 0.095, 0.47, 0, 0.15, 0.78, 0.17), 0xffffff);
      legs.add(BOX, T(s * 0.095, 0.045, 0.035, 0.13, 0.09, 0.27), 0x1a1a1a);
      cloth.add(CYL, T(s * 0.245, 1.13, 0, 0.1, 0.58, 0.11, s * 0.06), 0xffffff);
      skin.add(BOX, T(s * 0.262, 0.8, 0.01, 0.075, 0.1, 0.075), 0xffffff);
    });
    cloth.add(new THREE.CylinderGeometry(0.205, 0.175, 0.62, 10), T(0, 1.15, 0, 1, 1, 0.62), 0xffffff);
    cloth.add(sph, T(0, 1.43, 0, 0.42, 0.14, 0.25), 0xffffff);
    skin.add(CYL, T(0, 1.52, 0, 0.1, 0.12, 0.1), 0xffffff);
    skin.add(sph, T(0, 1.64, 0, 0.2, 0.25, 0.22), 0xffffff);
    skin.add(sph, T(0, 1.69, -0.025, 0.215, 0.2, 0.225), 0x2a1f18);   // pelo
    HUMAN = { cloth: cloth.geometry(), legs: legs.geometry(), skin: skin.geometry() };
    return HUMAN;
  }
  var CLOTH = [0xc0392b, 0x2e6fd1, 0xe8e8e8, 0xb7863a, 0x3c9a4b, 0x555555, 0x7d3c98, 0x1b1b1b, 0xd35400, 0x16a085, 0xf1c40f, 0x8e9aa6, 0x6d4c41, 0xe91e63, 0x24324f];
  var LEGS = [0x26324a, 0x1d1d1f, 0x4a4a4f, 0x6b5b45, 0x2f3b5c, 0x111111, 0x7a6a58, 0x3b4a6b];
  var SKIN = [0xf1c7a5, 0xe0ac86, 0xc68863, 0x8d5a3c, 0xf5d0b5, 0xb57a55, 0x6b4430];

  /* ---------- Una estación ---------- */
  function buildStation(W, sim, z, M, parent) {
    var al = W.al, st = z.st, o2 = W.off2 ? W.off2(st.stopX) : -4.3, brand = RC.data.brand;
    var g = new THREE.Group(); parent.add(g);
    var under = z.kind === 'underground', shed = z.kind === 'shed';
    var rec = { z: z, idx: z.idx, group: g, clocks: [], center: W3().at(al, (z.xa + z.xb) / 2, 0, 0), lastPaint: -1, amb: 0 };
    var X0 = under ? z.x0 : z.xa, X1 = under ? z.x1 : z.xb, Lp = z.xb - z.xa;
    var up = under ? PH : function (x) { return 0.2 + (PH - 0.2) * clamp((x - X0) / 5, 0, 1) * clamp((X1 - x) / 5, 0, 1); };
    var upE = function (x) { return val(up, x) + 0.012; };
    var P = platformsOf(z, o2), F = new Merge(), glows = [];
    var xm = (z.xa + z.xb) / 2 + 4, cl = clamp(Lp * 0.6, 40, 110);
    var xc0 = Math.max(z.xa + 6, xm - cl / 2), xc1 = Math.min(z.xb - 6, xm + cl / 2);
    if (shed || under) { xc0 = X0; xc1 = X1; }
    function covered(x) { return x >= xc0 && x <= xc1; }
    var board = brand ? new THREE.MeshBasicMaterial({ map: brandBoard(brand, st.name) }) : null;

    // Pantalla de próximos trenes (una textura por estación)
    var sc = document.createElement('canvas'); sc.width = 512; sc.height = 192;
    var stex = new THREE.CanvasTexture(sc); stex.colorSpace = THREE.SRGBColorSpace; stex.anisotropy = 4;
    rec.screen = { ctx: sc.getContext('2d'), tex: stex, mat: new THREE.MeshBasicMaterial({ map: stex, toneMapped: false }) };

    // --- Andenes: superficie, borde de seguridad, frentes y vallas ---
    P.forEach(function (p) {
      g.add(strip(al, X0, X1, p.a, p.b, up, up, topMat(M, p.b - p.a), 2));
      [[p.a, p.ea, 1], [p.b, p.eb, -1]].forEach(function (E) {
        var lat = E[0], s = E[2];   // s: hacia el interior del andén
        if (E[1]) {
          g.add(strip(al, X0, X1, lat, lat + s * 1.1, upE, upE, M.edge, 1));   // u = 0 en el borde (material de doble cara)
          g.add(wall(al, X0, X1, lat, 0, up, M.face, 2));
        } else {
          g.add(wall(al, X0, X1, lat, -0.9, up, M.face, 2));
          if (!under && !shed) g.add(wall(al, X0 + 3, X1 - 3, lat - s * 0.05, up, function (x) { return val(up, x) + 1.15; }, M.fence, 2));
        }
      });
    });

    // --- Marquesinas (estaciones en superficie) ---
    if (z.kind === 'surface') P.forEach(function (p) {
      if (p.ea && p.eb) {   // andén central: cubierta en «V» sobre columnas en el eje
        var mid = (p.a + p.b) / 2, H0 = PH + 3.5, H1 = PH + 3.9, la = p.a - 0.25, lb = p.b + 0.25;
        var roofH = function (l) { return l < mid ? H1 + (H0 - H1) * (l - la) / (mid - la) : H0 + (H1 - H0) * (l - mid) / (lb - mid); };
        g.add(strip(al, xc0, xc1, la, mid, H1, H0, M.roof, 6));
        g.add(strip(al, xc0, xc1, mid, lb, H0, H1, M.roof, 6));
        g.add(wall(al, xc0, xc1, la, H1 - 0.32, H1 + 0.1, M.fascia, 8));
        g.add(wall(al, xc0, xc1, lb, H1 - 0.32, H1 + 0.1, M.fascia, 8));
        [la + 1.2, lb - 1.2].forEach(function (ll) { var hh = roofH(ll) - 0.06; g.add(strip(al, xc0 + 2, xc1 - 2, ll - 0.09, ll + 0.09, hh, hh, M.lamp, 4)); });
        for (var x = xc0 + 5; x <= xc1 - 4; x += 12) {
          var base = frameM(al, x, mid, PH);
          column(F, base, H0 - PH - 0.08);
          beam(F, base, 0, H0 - PH - 0.12, lb - mid, H1 - PH - 0.12);
          beam(F, base, 0, H0 - PH - 0.12, la - mid, H1 - PH - 0.12);
        }
        g.add(strip(al, xc0, xc1, p.a + 0.3, p.b - 0.3, PH + 0.025, PH + 0.025, M.pool, 6));
      } else {              // andén lateral: cubierta a un agua con columnas al fondo
        var e = p.ea ? p.a : p.b, k = p.ea ? p.b : p.a, s = k > e ? 1 : -1;
        var lE = e + s * 0.35, lK = k + s * 0.2, HE = PH + 3.95, HK = PH + 3.55;
        g.add(strip(al, xc0, xc1, Math.min(lE, lK), Math.max(lE, lK), lE < lK ? HE : HK, lE < lK ? HK : HE, M.roof, 6));
        g.add(wall(al, xc0, xc1, lE, HE - 0.32, HE + 0.1, M.fascia, 8));
        g.add(wall(al, xc0, xc1, lK, HK - 0.14, HK + 0.06, M.fascia, 8));
        [1.6, 3.8].forEach(function (d) {
          var ll = e + s * d, hh = HE + (HK - HE) * (ll - lE) / (lK - lE) - 0.06;
          g.add(strip(al, xc0 + 2, xc1 - 2, ll - 0.09, ll + 0.09, hh, hh, M.lamp, 4));
        });
        for (var x2 = xc0 + 5; x2 <= xc1 - 4; x2 += 12) {
          var lc = k - s * 0.9, base2 = frameM(al, x2, lc, PH), hc = HE + (HK - HE) * (lc - lE) / (lK - lE) - PH;
          column(F, base2, hc - 0.08);
          beam(F, base2, 0, hc - 0.12, (lE - lc), HE - PH - 0.12);
        }
        g.add(strip(al, xc0, xc1, Math.min(e, k) + 0.3, Math.max(e, k) - 0.3, PH + 0.025, PH + 0.025, M.pool, 6));
      }
    });

    // --- Gran nave de Santa Justa ---
    if (shed) {
      var LR = P[0].b + 0.5, LL = P[1].a - 0.5, sx0 = z.x0, sx1 = z.x1 - 4;
      g.add(vault(al, sx0, sx1, LL, LR, 9.0, 4.2, M.vault));
      g.add(wall(al, sx0, sx1, LR, -0.9, 9.0, M.shedWall, 12));
      g.add(wall(al, sx0, sx1, LL, -0.9, 9.0, M.shedWall, 12));
      for (var xs = sx0 + 3; xs <= sx1 - 2; xs += 15) {
        var bS = frameM(al, xs, 0, 0);
        [LL + 0.45, LR - 0.45].forEach(function (l) { F.add(CYL, local(bS, l, 4.5, 0, 0.7, 9.0, 0.7), C.rib); });
        for (var j = 0; j < 18; j++) {   // costilla del arco
          var t0 = j / 18, t1 = (j + 1) / 18;
          beam(F, bS, LL + (LR - LL) * t0, 9.0 + 4.2 * Math.sin(Math.PI * t0) - 0.25, LL + (LR - LL) * t1, 9.0 + 4.2 * Math.sin(Math.PI * t1) - 0.25, C.rib);
        }
      }
      P.forEach(function (p) {
        var e = p.ea ? p.a : p.b, s = p.ea ? 1 : -1;
        [2.6, 7.4].forEach(function (d) { var ll = e + s * d; g.add(strip(al, X0 + 3, X1 - 3, ll - 0.12, ll + 0.12, 7.6, 7.6, M.lamp, 4)); });
        g.add(strip(al, X0, X1, Math.min(p.a, p.b) + 0.3, Math.max(p.a, p.b) - 0.3, PH + 0.025, PH + 0.025, M.pool, 6));
      });
    }

    // --- Estación subterránea (caverna con azulejos) ---
    if (under) {
      var wR = Math.max(P[0].b, 4.4), wL = Math.min(P[P.length - 1].a, o2 - 4.4);
      var tiles = new THREE.MeshStandardMaterial({ map: tileWallTex(st.name, M.S), emissive: 0xffffff, roughness: 0.35, side: THREE.DoubleSide });
      tiles.emissiveMap = tiles.map; tiles.emissiveIntensity = 0.45;
      g.add(wall(al, X0, X1, wR, PH, CAV_H, tiles, 20, true));
      g.add(wall(al, X0, X1, wL, PH, CAV_H, tiles, 20));
      g.add(strip(al, X0, X1, wL, wR, CAV_H, CAV_H, M.ceiling, 6));
      P.forEach(function (p) {
        var e = p.ea ? p.a : p.b, s = p.ea ? 1 : -1;
        [1.9, 4.3].forEach(function (d) { var ll = e + s * d; g.add(strip(al, X0 + 2, X1 - 2, ll - 0.11, ll + 0.11, CAV_H - 0.06, CAV_H - 0.06, M.lampOn, 4)); });
        g.add(strip(al, X0, X1, Math.min(p.a, p.b) + 0.3, Math.max(p.a, p.b) - 0.3, PH + 0.025, PH + 0.025, M.poolOn, 6));
      });
      [X0, X1].forEach(function (xe) {   // muros de cierre con la boca del túnel
        [[4.1, wR + 0.3], [wL - 0.3, o2 - 4.1]].forEach(function (r) {
          F.add(BOX, local(frameM(al, xe, (r[0] + r[1]) / 2, 0), 0, CAV_H / 2, 0, r[1] - r[0], CAV_H, 0.5), C.tile);
        });
      });
    }

    // --- Mobiliario, carteles, pantallas y relojes en cada andén ---
    P.forEach(function (p, pi) {
      var island = p.ea && p.eb, e = p.ea ? p.a : p.b, k = p.ea ? p.b : p.a, s = k > e ? 1 : -1, mid = (p.a + p.b) / 2;
      var xf0 = X0 + (under ? 10 : 12), xf1 = X1 - (under ? 10 : 9);
      // bancos y papeleras
      for (var xb = xf0; xb <= xf1; xb += shed ? 18 : 22) {
        if (island) {
          bench(F, frameM(al, xb, mid + 0.45, val(up, xb), faceYaw(1)));
          bench(F, frameM(al, xb, mid - 0.45, val(up, xb), faceYaw(-1)));
          bin(F, frameM(al, xb + 1.7, mid, val(up, xb)));
        } else {
          var lb2 = shed ? e + s * 4.2 : k - s * 1.0;
          bench(F, frameM(al, xb, lb2, val(up, xb), faceYaw(-s)));
          bin(F, frameM(al, xb + 1.6, lb2 + s * 0.05, val(up, xb)));
        }
      }
      // farolas donde no hay cubierta
      if (!under && !shed) for (var xl = X0 + 7; xl <= X1 - 5; xl += 16) {
        if (covered(xl)) continue;
        if (island) lampPost(F, frameM(al, xl, mid, val(up, xl), faceYaw(1)), glows, true);
        else lampPost(F, frameM(al, xl, k - s * 0.45, val(up, xl), faceYaw(-s)), glows, false);
      }
      // carteles con el nombre
      var fr = shed ? [0.12, 0.36, 0.62, 0.86] : [0.18, 0.5, 0.82];
      if (board) fr.forEach(function (f) {
        var xn = z.xa + (z.xb - z.xa) * f;
        if (under) g.add(plane(3.6, 0.9, board, local(frameM(al, xn, k - s * 0.03, PH, faceYaw(-s)), 0, 3.6, 0, 1, 1, 1)));
        else if (island) boardPosts(F, g, frameM(al, xn, mid, PH, faceYaw(1)), board, true);
        else boardPosts(F, g, frameM(al, xn, shed ? e + s * 3.0 : k - s * 0.35, PH, faceYaw(-s)), board, false);
      });
      // pantalla de próximos trenes y reloj
      var ld = island ? mid : e + s * (shed ? 3.0 : 2.6);
      screenPost(F, g, frameM(al, xm + 9 - pi * 4, ld, PH), rec.screen.mat);
      clockPost(F, g, frameM(al, xm - 9 + pi * 4, ld, PH), M, rec);
    });

    // --- Cartelones de parada: vía 1 (hacia Utrera) y vía 2 (hacia Santa Justa) ---
    var main = z.island ? { lat: -EDGE - 0.45 } : { lat: EDGE + 0.45 };
    stopSign(F, g, frameM(al, st.stopX, main.lat, PH), M);
    var x2s = st.stopX - st.platformLength + 2;
    stopSign(F, g, frameM(al, x2s, z.island ? o2 + EDGE + 0.45 : o2 - EDGE - 0.45, PH, Math.PI), M);

    // --- Malla combinada del mobiliario y brillos de las farolas ---
    var fm = new THREE.Mesh(F.geometry(), M.furn); g.add(fm);
    if (glows.length) { var gg = new THREE.BufferGeometry().setFromPoints(glows); g.add(new THREE.Points(gg, M.glow)); }

    // --- Viajeros ---
    var rng = RC.core.util.rng(z.idx * 97 + 3), amb = shed ? 30 : 8 + (z.idx * 5) % 14;
    var bandMain, faceMain, bandAmb, faceAmb;
    if (z.island) {
      var md = (P[0].a + P[0].b) / 2;
      bandMain = [md + 0.6, -EDGE - 1.4]; faceMain = 1;
      bandAmb = [o2 + EDGE + 1.4, md - 0.6]; faceAmb = -1;
    } else {
      bandMain = [EDGE + 1.4, EDGE + z.pw - (shed ? 3.5 : 1.4)]; faceMain = -1;
      bandAmb = [o2 - EDGE - z.pw + (shed ? 3.5 : 1.4), o2 - EDGE - 1.4]; faceAmb = 1;
    }
    var H = humanGeos(), cap = amb + MAIN, d = new THREE.Object3D(), col = new THREE.Color();
    var parts = ['cloth', 'legs', 'skin'].map(function (key) {
      var m = new THREE.InstancedMesh(H[key], M.people, cap); m.frustumCulled = false; g.add(m); return m;
    });
    for (var i = 0; i < cap; i++) {
      var isAmb = i < amb, band = isAmb ? bandAmb : bandMain, face = isAmb ? faceAmb : faceMain;
      var px = xm + (rng() + rng() - 1) * 0.5 * Lp;
      px = clamp(px, z.xa + 9, z.xb - 7);
      var pl = band[0] + (band[1] - band[0]) * rng();
      var yaw = rng() < 0.15 ? rng() * Math.PI * 2 : faceYaw(face) + (rng() - 0.5) * 1.2;
      W3().place(d, al, px, pl, PH, yaw);
      var sc2 = 0.9 + rng() * 0.17; d.scale.set(sc2 * (0.95 + rng() * 0.12), sc2, sc2); d.updateMatrix();
      var cc = [CLOTH[Math.floor(rng() * CLOTH.length)], LEGS[Math.floor(rng() * LEGS.length)], SKIN[Math.floor(rng() * SKIN.length)]];
      parts.forEach(function (m, pi2) { m.setMatrixAt(i, d.matrix); m.setColorAt(i, col.setHex(cc[pi2])); });
    }
    parts.forEach(function (m) { m.count = amb; });
    rec.people = parts; rec.amb = amb;
    return rec;
  }

  /* ---------- Construcción ---------- */
  function build(W, sim) {
    var M = mats(), root = new THREE.Group(); W.root.add(root);
    var S = { root: root, list: [], zones: zones(sim.line), M: M };
    S.zones.forEach(function (z) { S.list.push(buildStation(W, sim, z, M, root)); });
    W.st3d = S;
    return S;
  }

  /* ---------- Pantallas: próximos trenes ---------- */
  function fmt(t) { return t === null || t === undefined ? '--:--' : RC.core.util.fmtClock(t).slice(0, 5); }
  function shortName(n) { return String(n).replace(/^Sevilla-/, ''); }
  function screenRows(sim, idx) {
    var line = sim.line, n = line.stations.length, TF = RC.ui3d.traffic, rows = [];
    var toEnd = shortName(line.stations[n - 1].name), toStart = shortName(line.stations[0].name);
    if (idx < n - 1) {
      var ref = sim.timetable[idx].dep, ss = sim.stations[idx], t1 = ref;
      if (sim.atStation === idx && !ss.depTime) rows.push({ dest: toEnd, time: 'En andén' });
      else {
        if (ss.depTime || t1 < sim.clock - 30) t1 = ref + 1200 * Math.max(1, Math.ceil((sim.clock - 30 - ref) / 1200));
        rows.push({ dest: toEnd, time: fmt(t1) });
      }
      if (idx === 0) rows.push({ dest: toEnd, time: fmt((rows[0].time === 'En andén' ? ref : t1) + 1200) });
    }
    if (idx > 0 && TF) {
      rows.push({ dest: toStart, time: fmt(TF.nextOpposite(line, idx, sim.clock)) });
      if (idx === n - 1) rows.push({ dest: toStart, time: fmt(TF.nextOpposite(line, idx, sim.clock, 1)) });
    }
    return rows.slice(0, 2);
  }
  function paintScreen(rec, sim) {
    var g = rec.screen.ctx, w = 512, h = 192, S = MAT.S;
    g.fillStyle = '#060a12'; g.fillRect(0, 0, w, h);
    g.fillStyle = S.stationBg; g.fillRect(0, 0, w, 46);
    g.fillStyle = '#ffffff'; g.font = '600 25px Segoe UI, Arial, sans-serif'; g.textBaseline = 'middle';
    g.textAlign = 'left'; g.fillText('Próximos trenes', 14, 24);
    g.textAlign = 'right'; g.fillText(fmt(sim.clock), w - 14, 24);
    var lc = RC.data.brand && RC.data.brand.lines && RC.data.brand.lines.C1;
    screenRows(sim, rec.idx).forEach(function (r, i) {
      var y = 84 + i * 62;
      g.fillStyle = lc ? lc.color : '#1E88C8';
      g.beginPath(); g.arc(34, y, 19, Math.PI / 2, Math.PI * 1.5); g.arc(62, y, 19, -Math.PI / 2, Math.PI / 2); g.closePath(); g.fill();
      g.fillStyle = '#fff'; g.font = '800 22px Segoe UI, Arial, sans-serif'; g.textAlign = 'center'; g.fillText('C1', 48, y + 1);
      g.fillStyle = '#ffb21e'; g.font = '600 30px Consolas, Lucida Console, monospace'; g.textAlign = 'left'; g.fillText(r.dest, 96, y);
      g.textAlign = 'right'; g.fillText(r.time, w - 14, y);
    });
    rec.screen.tex.needsUpdate = true;
  }

  /* ---------- Actualización por fotograma ---------- */
  function update(W, sim, night, cam) {
    var S = W.st3d; if (!S) return;
    var M = S.M, k = clamp(night * 1.4 - 0.1, 0, 1);
    M.lamp.color.setRGB(0.55 + 0.45 * k, 0.55 + 0.4 * k, 0.55 + 0.27 * k);
    M.pool.opacity = 0.6 * k; M.glow.opacity = k;
    M.vault.emissiveIntensity = 0.12 + 0.45 * (1 - night);
    var hAng = (sim.clock / 3600 % 12) / 12 * Math.PI * 2, mAng = (sim.clock / 60 % 60) / 60 * Math.PI * 2, sec = Math.floor(sim.clock);
    S.list.forEach(function (r) {
      var d = cam ? cam.distanceTo(r.center) : 0;
      r.group.visible = d < 3200;
      if (!r.group.visible) return;
      var ss = sim.stations[r.idx], st = r.z.st;
      var waiting = !ss.arrived && r.idx > 0 ? st.waiting : Math.max(0, (ss.toBoard || 0) - (ss.boarded || 0));
      if (r.idx === 0 && !ss.depTime) waiting = Math.max(0, ss.toBoard - ss.boarded);
      var n = r.amb + Math.min(MAIN, waiting | 0);
      r.people.forEach(function (m) { m.count = n; });
      if (d > 700) return;
      r.clocks.forEach(function (c) { c.h.rotation.z = -hAng; c.m.rotation.z = -mAng; });
      if (sec !== r.lastPaint) { r.lastPaint = sec; paintScreen(r, sim); }
    });
  }

  RC.ui3d = RC.ui3d || {};
  RC.ui3d.stations = { zones: zones, corridor: corridor, build: build, update: update, brandBoard: brandBoard, PH: PH, EDGE: EDGE };
})(globalThis.RC);
