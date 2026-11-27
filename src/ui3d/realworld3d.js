/* RAILCORE — Entorno real de la ruta (sólo presentación).
 * Terreno del MDT del IGN con ortofoto PNOA (rebajado donde tapaba la vía y las
 * estaciones), edificios del Catastro, túneles con sus bocas, puentes, pasos a nivel
 * y desvíos. Las estaciones están en stations3d.js.
 * Se activa cuando la línea trae datos reales (line.real) y se carga por teselas
 * de 1 km alrededor del tren para no saturar ordenadores modestos. */
(function (RC) {
  var W3 = function () { return RC.ui3d.world; };
  var TILE = 1000;

  function b64ToInt16(s) {
    var bin = atob(s), n = bin.length >> 1, out = new Int16Array(n);
    for (var i = 0; i < n; i++) { var v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8); out[i] = v > 32767 ? v - 65536 : v; }
    return out;
  }

  /* Cargador de scripts de datos bajo demanda (funciona con file:// y en el .exe). */
  var pending = {};
  function loadScript(src, cb) {
    if (pending[src] === 'done') { cb(); return; }
    if (pending[src]) { pending[src].push(cb); return; }
    pending[src] = [cb];
    var s = document.createElement('script'); s.src = src; s.async = true;
    s.onload = s.onerror = function () { var l = pending[src]; pending[src] = 'done'; (l || []).forEach(function (f) { f(); }); };
    document.head.appendChild(s);
  }
  RC.data.c1orto = RC.data.c1orto || {};

  /* Posición local (m) de una tesela UTM */
  function tileOrigin(line, key) {
    var p = key.split('_').map(Number);
    return { x: p[0] * TILE - line.origin.E, z: -(p[1] * TILE - line.origin.N) };
  }

  /* Índices del trazado (cada 5 m) que pasan cerca de una tesela. */
  function tileTrack(R, key) {
    if (R.tileIdx[key]) return R.tileIdx[key];
    var o = tileOrigin(R.line, key), al = R.al, list = [], M = 160;
    for (var i = 0; i < al.n; i++) {
      var x = al.px[i], z = al.pz[i];
      if (x > o.x - M && x < o.x + TILE + M && z > o.z - TILE - M && z < o.z + M) list.push(i);
    }
    return (R.tileIdx[key] = list);
  }
  /* Punto kilométrico (x), desplazamiento lateral y cota de la vía más cercana a (wx, wz). */
  function locate(R, list, wx, wz) {
    var al = R.al, best = -1, bd = Infinity;
    for (var k = 0; k < list.length; k++) {
      var i = list[k], dx = wx - al.px[i], dz = wz - al.pz[i], d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0 || bd > 150 * 150) return null;
    var h = al.th[best], ddx = wx - al.px[best], ddz = wz - al.pz[best], W3m = W3();
    return { x: W3m.X0 + best * W3m.STEP + ddx * Math.sin(h) - ddz * Math.cos(h), lat: ddx * Math.cos(h) + ddz * Math.sin(h), y: al.py[best] };
  }
  /* ¿Está x dentro de un túnel, lejos de sus bocas? (ahí el terreno debe quedar encima) */
  function deepTunnel(R, x) {
    for (var i = 0; i < R.zones.length; i++) { var z = R.zones[i]; if (z.kind === 'underground' && x >= z.x0 && x <= z.x1) return true; }
    for (i = 0; i < R.runs.length; i++) {
      var r = R.runs[i];
      if (x < r.x0 || x > r.x1) continue;
      var d0 = r.startPortal ? x - r.x0 : Infinity, d1 = r.endPortal ? r.x1 - x : Infinity;
      return Math.min(d0, d1) > 22;
    }
    return false;
  }
  function zoneAt(R, x, pad) {
    for (var i = 0; i < R.zones.length; i++) { var z = R.zones[i]; if (x > z.x0 - pad && x < z.x1 + pad) return z; }
    return null;
  }
  /* Cota máxima del terreno en un punto: la plataforma de la vía y las estaciones quedan a la vista,
   * con taludes suaves hasta el terreno natural. null = no tocar. */
  function maxTerrain(R, L) {
    if (deepTunnel(R, L.x)) return null;
    var o2 = R.off2(L.x), l = o2 - 6, r = 6, z = zoneAt(R, L.x, 10);
    if (z && z.kind !== 'underground' && RC.ui3d.stations) { var c = RC.ui3d.stations.corridor(z, o2); l = Math.min(l, c.l); r = Math.max(r, c.r); }
    var e = Math.max(0, l - L.lat, L.lat - r);
    return L.y - 0.95 + e * 0.65;
  }

  function buildTerrainTile(R, key) {
    var T = RC.data.c1terrain, line = R.line;
    var h = b64ToInt16(T.tiles[key]), n = T.n, res = TILE / (n - 1);
    var o = tileOrigin(line, key);
    var g = new THREE.PlaneGeometry(TILE, TILE, n - 1, n - 1);
    var pos = g.attributes.position;
    // PlaneGeometry: filas de arriba (norte) a abajo (sur), columnas de oeste a este
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) {
      var i = r * n + c, hv = h[(n - 1 - r) * n + c];   // datos: fila 0 = sur
      pos.setXYZ(i, o.x + c * res, hv / 10 - line.origin.Z, o.z - (n - 1 - r) * res);
    }
    // Rebaje del terreno sobre la vía (el MDT de 20 m tapaba trincheras y la estación de Santa Justa)
    var list = tileTrack(R, key);
    if (list.length) for (var v = 0; v < pos.count; v++) {
      var L = locate(R, list, pos.getX(v), pos.getZ(v)); if (!L) continue;
      var mx = maxTerrain(R, L);
      if (mx !== null && pos.getY(v) > mx) pos.setY(v, mx);
    }
    g.computeVertexNormals();
    var mat = new THREE.MeshStandardMaterial({ color: 0xb9b49a, roughness: 1, metalness: 0, side: THREE.DoubleSide });
    if (RC.ui3d.orthohd) RC.ui3d.orthohd.groundDetail(mat);   // grano fino de cerca sobre la ortofoto
    var mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    R.group.add(mesh);
    var tile = { key: key, mesh: mesh, ortho: false, o: o, n: n, res: res };
    // Ortofoto PNOA de la misma tesela
    var src = 'src/data/c1/orto/' + key + '.js';
    if (T.orto && T.orto.indexOf(key) < 0) return tile;
    loadScript(src, function () {
      var d = RC.data.c1orto[key]; if (!d || !tile.mesh) return;
      var img = new Image();
      img.onload = function () {
        if (!tile.mesh) return;
        if (RC.ui3d.vegetation) RC.ui3d.vegetation.tileReady(R, tile, img);   // árboles según la ortofoto (vegetation3d.js)
        var t = new THREE.Texture(img); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.needsUpdate = true;
        // La ortofoto ya trae la luz del día: parte se pinta como emisiva para no apagarla
        mat.map = t; mat.emissiveMap = t; mat.emissive.setHex(0xffffff); mat.emissiveIntensity = R.orthoGlow;
        mat.color.setHex(0xffffff); mat.needsUpdate = true; tile.ortho = true; tile.tex = t;
        var bt = R.bTiles[key]; if (bt && bt.roofs && RC.ui3d.buildings) RC.ui3d.buildings.setOrtho(bt.roofs, t);
      };
      img.src = d;
    });
    return tile;
  }

  function disposeTile(R, tile) {
    if (RC.ui3d.vegetation) RC.ui3d.vegetation.disposeTile(R, tile);   // fuera la vegetación de la tesela (vegetation3d.js)
    R.group.remove(tile.mesh);
    tile.mesh.geometry.dispose();
    if (tile.mesh.material.map) tile.mesh.material.map.dispose();
    tile.mesh.material.dispose();
    tile.mesh = null;
    delete RC.data.c1orto[tile.key];
    var src = 'src/data/c1/orto/' + tile.key + '.js'; delete pending[src];
    document.querySelectorAll('script[src="' + src + '"]').forEach(function (s) { s.remove(); });
  }

  /* ---------- Edificios del Catastro, agrupados por tesela ---------- */
  /* ¿Se queda fuera este edificio? (los que pisan el andén o la playa de vías de una estación) */
  function skipBuilding(R, near, b) {
    if (!near.length || !R.zones.length) return false;
    var ring = b.p, cx = 0, cz = 0; ring.forEach(function (q) { cx += q[0]; cz += q[1]; }); cx /= ring.length; cz /= ring.length;
    var Lb = locate(R, near, cx, cz), zb = Lb && zoneAt(R, Lb.x, 20);
    if (zb && zb.kind !== 'underground' && RC.ui3d.stations) {
      var cb = RC.ui3d.stations.corridor(zb, R.off2(Lb.x));
      if (Lb.lat > cb.l - 1 && Lb.lat < cb.r + 1) return true;
      if (b.o && zb.kind === 'shed' && Math.abs(Lb.lat) < 60) return true;
    }
    return false;
  }
  function buildBuildings(R, key, bt) {
    var B3 = RC.ui3d.buildings, near = tileTrack(R, key);
    if (B3 && RC.data.facades) {
      var res = B3.build(R, key, bt.list, function (b) { return skipBuilding(R, near, b); }, tileOrigin(R.line, key));
      if (!res) return null;
      if (res.walls) R.group.add(res.walls);
      if (res.roofs) { R.group.add(res.roofs); var tt = R.tiles[key]; if (tt && tt.tex) B3.setOrtho(res.roofs, tt.tex); }
      bt.walls = res.walls; bt.roofs = res.roofs;
      return res.walls || res.roofs;
    }
    return buildBuildingsFlat(R, key, bt.list);
  }
  function buildBuildingsFlat(R, key, list) {
    var line = R.line, M = R.M, near = tileTrack(R, key);
    var pos = [], col = [], idx = [], base = 0, c = new THREE.Color();
    var palette = [0xf3efe6, 0xefe2c6, 0xe8cf9c, 0xdcb07a, 0xf6f3ee, 0xcf9a6b, 0xe4e1da];
    list.forEach(function (b, bi) {
      var ring = b.p, top = b.h, bot = b.z - 1.5;
      if (ring.length < 3) return;
      if (near.length && R.zones.length) {
        var cx = 0, cz = 0; ring.forEach(function (q) { cx += q[0]; cz += q[1]; }); cx /= ring.length; cz /= ring.length;
        var Lb = locate(R, near, cx, cz), zb = Lb && zoneAt(R, Lb.x, 20);
        if (zb && zb.kind !== 'underground' && RC.ui3d.stations) {
          var cb = RC.ui3d.stations.corridor(zb, R.off2(Lb.x));
          if (Lb.lat > cb.l - 1 && Lb.lat < cb.r + 1) return;
          if (b.o && zb.kind === 'shed' && Math.abs(Lb.lat) < 60) return;
        }
      }
      var pts2 = ring.map(function (p) { return new THREE.Vector2(p[0], p[1]); });
      if (THREE.ShapeUtils.isClockWise(pts2)) pts2.reverse();
      var tri;
      try { tri = THREE.ShapeUtils.triangulateShape(pts2, []); } catch (e) { return; }
      c.setHex(b.k === 'i' ? 0xc9c6bd : palette[(bi * 7 + ring.length) % palette.length]);
      var n = pts2.length, roofY = b.o ? Math.max(b.z + top, 8.5) : b.z + top;
      // techo
      for (var i = 0; i < n; i++) { pos.push(pts2[i].x, roofY, pts2[i].y); col.push(c.r * 0.82, c.g * 0.82, c.b * 0.82); }
      tri.forEach(function (t) { idx.push(base + t[0], base + t[2], base + t[1]); });
      base += n;
      // fachadas (no en los que cubren la vía: ahí sólo hay techo, como una marquesina)
      for (i = 0; i < n && !b.o; i++) {
        var a = pts2[i], d = pts2[(i + 1) % n];
        pos.push(a.x, bot, a.y, d.x, bot, d.y, d.x, roofY, d.y, a.x, roofY, a.y);
        var sh = 0.86 + 0.14 * Math.abs(Math.sin(Math.atan2(d.y - a.y, d.x - a.x)));
        for (var k = 0; k < 4; k++) col.push(c.r * sh, c.g * sh, c.b * sh);
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        base += 4;
      }
    });
    if (!pos.length) return null;
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    var m = new THREE.Mesh(g, M.buildings);
    m.castShadow = m.receiveShadow = true;
    R.group.add(m);
    return m;
  }

  /* ---------- Construcción ---------- */
  function build(W, sim) {
    var line = sim.line, al = W.al, root = W.root, W3m = W3();
    var R = { line: line, group: new THREE.Group(), tiles: {}, bTiles: {}, M: W.M, lastKey: null, orthoGlow: 0.3,
      al: al, off2: W.off2 || function () { return -4.3; }, zones: RC.ui3d.stations ? RC.ui3d.stations.zones(line) : [], runs: [], tileIdx: {} };
    root.add(R.group);
    R.M.buildings = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
    W.buildingMat = R.M.buildings; W.buildingMat.emissiveIntensity = 0;

    // Edificios: índice por tesela (local x,z ya calculados por la herramienta)
    var B = RC.data.c1buildings;
    if (B) {
      B.list.forEach(function (b) {
        var k = b.t; (R.bTiles[k] = R.bTiles[k] || { list: [], mesh: null }).list.push(b);
      });
    }

    var concrete = W.M.concrete, dark = W.M.dark, off2 = R.off2;
    // Túneles: bóveda de hormigón por tramos de 10 m. Se interrumpen en las estaciones: en las de superficie
    // (Santa Justa) la vía sale a cielo abierto con su boca; en las subterráneas empalman con la caverna.
    function zoneOver(x0, x1) { for (var i = 0; i < R.zones.length; i++) if (x1 > R.zones[i].x0 && x0 < R.zones[i].x1) return R.zones[i]; return null; }
    function segment(x0, x1) {
      var xc = (x0 + x1) / 2, o2 = off2(xc), len = x1 - x0 + 0.2, seg = new THREE.Group();
      var wallL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7, len), concrete); wallL.position.set(4.4, 3.5, 0); seg.add(wallL);
      var wallR = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7, len), concrete); wallR.position.set(o2 - 4.4, 3.5, 0); seg.add(wallR);
      var roof = new THREE.Mesh(new THREE.BoxGeometry(9.4 - o2, 0.6, len), dark); roof.position.set(o2 / 2, 7.3, 0); seg.add(roof);
      R.group.add(W3m.place(seg, al, xc, 0, 0));
    }
    function portal(px) {
      var o2 = off2(px), g = new THREE.Group();
      var lintel = new THREE.Mesh(new THREE.BoxGeometry(15.6 - o2, 3.6, 1.0), concrete); lintel.position.set(o2 / 2, 8.8, 0); g.add(lintel);
      [[4.4 + 1.7, 1], [o2 - 4.4 - 1.7, -1]].forEach(function (p) {
        var pier = new THREE.Mesh(new THREE.BoxGeometry(3.4, 10.6, 1.0), concrete); pier.position.set(p[0], 5.3, 0); g.add(pier);
      });
      R.group.add(W3m.place(g, al, px, 0, 0));
    }
    (line.tunnels || []).forEach(function (tn) {
      var run = null, prev = null;
      for (var x = tn.from; x < tn.to; x += 10) {
        var x2 = Math.min(tn.to, x + 10), z = zoneOver(x, x2);
        if (z) { if (run) { run.endPortal = z.kind !== 'underground'; R.runs.push(run); run = null; } prev = z; continue; }
        if (!run) run = { x0: x, x1: x2, startPortal: !prev || prev.kind !== 'underground' };
        run.x1 = x2;
        segment(x, x2);
      }
      if (run) { run.endPortal = true; R.runs.push(run); }
    });
    R.runs.forEach(function (r) { if (r.startPortal) portal(r.x0); if (r.endPortal) portal(r.x1); });
    // Puentes: tablero y barandillas
    var rail = new THREE.MeshStandardMaterial({ color: 0x6f757c, metalness: 0.5, roughness: 0.6 });
    (line.bridges || []).forEach(function (br) {
      R.group.add(W3m.ribbon(al, br.from, br.to, 5, function (x) { return off2(x) - 4.9; }, 4.9, -1.0, -1.0, concrete, 6));
      [function () { return 4.9; }, function (x) { return off2(x) - 4.9; }].forEach(function (offF) {
        for (var x = br.from; x < br.to; x += 8) {
          var r = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 8), rail);
          R.group.add(W3m.place(r, al, x + 4, offF(x + 4), 0.55));
        }
      });
    });
    // Pasos a nivel (cruces de carretera)
    (line.crossings || []).forEach(function (lc) {
      var g = new THREE.Group();
      var road = new THREE.Mesh(new THREE.BoxGeometry(30, 0.08, 6), new THREE.MeshStandardMaterial({ color: 0x3b3b3b, roughness: 0.95 }));
      road.position.set(off2(lc.x) / 2, 0.12, 0); g.add(road);
      R.group.add(W3m.place(g, al, lc.x, 0, 0));
    });
    // Desvíos: marca de la aguja (caja de accionamiento junto a la vía)
    var motor = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 1.2), new THREE.MeshStandardMaterial({ color: 0x4e5a3a, roughness: 0.8 }));
    (line.switches || []).forEach(function (sw) { R.group.add(W3m.place(motor.clone(), al, sw.x, sw.side > 0 ? 2.2 : off2(sw.x) - 2.2, 0.2)); });

    R.hd = RC.ui3d.orthohd ? RC.ui3d.orthohd.create(R) : null;   // ortofoto de 0,3 m/píxel junto a la vía
    W.real = R; RC.ui3d.realworld.last = R;
    update(W, sim, 0, true);
    return R;
  }

  /* Carga/descarga de teselas alrededor del tren (radio en km). */
  function update(W, sim, night, force, cam) {
    var R = W.real; if (!R) return;
    if (RC.ui3d.vegetation) RC.ui3d.vegetation.update(W, sim, night);   // árboles y hierba, cada fotograma (vegetation3d.js)
    var glow = 0.3 * (1 - (night || 0));
    if (Math.abs(glow - R.orthoGlow) > 0.01) { R.orthoGlow = glow; for (var tk in R.tiles) if (R.tiles[tk].mesh) R.tiles[tk].mesh.material.emissiveIntensity = glow; }
    if (RC.ui3d.buildings) RC.ui3d.buildings.update(R, night || 0, R.orthoGlow);
    var F = W3().frame(W.al, sim.train.x), line = R.line;
    if (R.hd) RC.ui3d.orthohd.update(R.hd, W, cam || { x: F.x, z: F.z });
    var E = F.x + line.origin.E, N = -F.z + line.origin.N;
    var ti = Math.floor(E / TILE), tj = Math.floor(N / TILE), key = ti + '_' + tj;
    if (key === R.lastKey && !force) return;
    R.lastKey = key;
    var want = {}, rad = RC.settings && RC.settings.terrainRadius || 3;
    for (var a = -rad; a <= rad; a++) for (var b = -rad; b <= rad; b++) want[(ti + a) + '_' + (tj + b)] = Math.abs(a) + Math.abs(b);
    var T = RC.data.c1terrain;
    for (var k in want) {
      if (T && T.tiles[k] && !R.tiles[k]) R.tiles[k] = buildTerrainTile(R, k);
      var bt = R.bTiles[k];
      if (bt && !bt.mesh && want[k] <= 3) bt.mesh = buildBuildings(R, k, bt);
    }
    for (k in R.tiles) if (!(k in want)) { disposeTile(R, R.tiles[k]); delete R.tiles[k]; }
    for (k in R.bTiles) {
      var bt2 = R.bTiles[k];
      if (bt2.mesh && !(k in want && want[k] <= 3)) {
        [bt2.mesh, bt2.walls, bt2.roofs].forEach(function (m) { if (m && m.parent) { R.group.remove(m); m.geometry.dispose(); } });
        if (bt2.roofs) bt2.roofs.material.dispose();
        bt2.mesh = bt2.walls = bt2.roofs = null;
      }
    }
  }

  /* Cota del terreno cargado en el punto (x, z) del mundo, o null si no hay tesela. */
  function heightAt(W, x, z) {
    var R = W && W.real; if (!R) return null;
    var line = R.line, E = x + line.origin.E, N = -z + line.origin.N;
    var tile = R.tiles[Math.floor(E / TILE) + '_' + Math.floor(N / TILE)];
    if (!tile || !tile.mesh) return null;
    var n = tile.n, res = tile.res, pos = tile.mesh.geometry.attributes.position;
    var c = clampN((x - tile.o.x) / res, n), r = clampN(n - 1 - (tile.o.z - z) / res, n);
    var c0 = Math.min(n - 2, Math.floor(c)), r0 = Math.min(n - 2, Math.floor(r)), fc = c - c0, fr = r - r0;
    function H(rr, cc) { return pos.getY(rr * n + cc); }
    return (H(r0, c0) * (1 - fc) + H(r0, c0 + 1) * fc) * (1 - fr) + (H(r0 + 1, c0) * (1 - fc) + H(r0 + 1, c0 + 1) * fc) * fr;
  }
  function clampN(v, n) { return Math.max(0, Math.min(n - 1, v)); }

  RC.ui3d = RC.ui3d || {};
  RC.ui3d.realworld = { build: build, update: update, heightAt: heightAt };
})(globalThis.RC);
