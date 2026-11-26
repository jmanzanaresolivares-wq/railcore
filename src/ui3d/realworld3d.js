/* RAILCORE — Entorno real de la ruta (sólo presentación).
 * Terreno del MDT del IGN con ortofoto PNOA, edificios del Catastro, túneles,
 * puentes, pasos a nivel, desvíos y edificios de estación con la marca activa.
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
    g.computeVertexNormals();
    var mat = new THREE.MeshStandardMaterial({ color: 0xb9b49a, roughness: 1, metalness: 0 });
    var mesh = new THREE.Mesh(g, mat);
    R.group.add(mesh);
    var tile = { key: key, mesh: mesh, ortho: false };
    // Ortofoto PNOA de la misma tesela
    var src = 'src/data/c1/orto/' + key + '.js';
    if (T.orto && T.orto.indexOf(key) < 0) return tile;
    loadScript(src, function () {
      var d = RC.data.c1orto[key]; if (!d || !tile.mesh) return;
      var img = new Image();
      img.onload = function () {
        if (!tile.mesh) return;
        var t = new THREE.Texture(img); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.needsUpdate = true;
        mat.map = t; mat.color.setHex(0xffffff); mat.needsUpdate = true; tile.ortho = true;
      };
      img.src = d;
    });
    return tile;
  }

  function disposeTile(R, tile) {
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
  function buildBuildings(R, key, list) {
    var line = R.line, M = R.M;
    var pos = [], col = [], idx = [], base = 0, c = new THREE.Color();
    var palette = [0xf3efe6, 0xefe2c6, 0xe8cf9c, 0xdcb07a, 0xf6f3ee, 0xcf9a6b, 0xe4e1da];
    list.forEach(function (b, bi) {
      var ring = b.p, top = b.h, bot = b.z - 1.5;
      if (ring.length < 3) return;
      var pts2 = ring.map(function (p) { return new THREE.Vector2(p[0], p[1]); });
      if (THREE.ShapeUtils.isClockWise(pts2)) pts2.reverse();
      var tri;
      try { tri = THREE.ShapeUtils.triangulateShape(pts2, []); } catch (e) { return; }
      c.setHex(b.k === 'i' ? 0xc9c6bd : palette[(bi * 7 + ring.length) % palette.length]);
      var n = pts2.length, roofY = b.z + top;
      // techo
      for (var i = 0; i < n; i++) { pos.push(pts2[i].x, roofY, pts2[i].y); col.push(c.r * 0.82, c.g * 0.82, c.b * 0.82); }
      tri.forEach(function (t) { idx.push(base + t[0], base + t[2], base + t[1]); });
      base += n;
      // fachadas
      for (i = 0; i < n; i++) {
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
    R.group.add(m);
    return m;
  }

  /* ---------- Construcción ---------- */
  function build(W, sim) {
    var line = sim.line, al = W.al, root = W.root, W3m = W3();
    var R = { line: line, group: new THREE.Group(), tiles: {}, bTiles: {}, M: W.M, lastKey: null };
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

    var concrete = W.M.concrete, dark = W.M.dark;
    // Túneles: bóveda de hormigón y bocas
    (line.tunnels || []).forEach(function (tn) {
      for (var x = tn.from; x < tn.to; x += 10) {
        var seg = new THREE.Group();
        var wallL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7, 10.2), concrete); wallL.position.set(4.4, 3.5, 0); seg.add(wallL);
        var wallR = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7, 10.2), concrete); wallR.position.set(-4.3 - 4.4, 3.5, 0); seg.add(wallR);
        var roof = new THREE.Mesh(new THREE.BoxGeometry(14.0, 0.6, 10.2), dark); roof.position.set(-2.15, 7.3, 0); seg.add(roof);
        R.group.add(W3m.place(seg, al, x + 5, 0, 0));
      }
      [tn.from, tn.to].forEach(function (px) {
        var portal = new THREE.Mesh(new THREE.BoxGeometry(18, 4, 1.2), concrete);
        R.group.add(W3m.place(portal, al, px, -2.15, 9.6));
      });
    });
    // Puentes: tablero y barandillas
    var rail = new THREE.MeshStandardMaterial({ color: 0x6f757c, metalness: 0.5, roughness: 0.6 });
    (line.bridges || []).forEach(function (br) {
      R.group.add(W3m.ribbon ? W3m.ribbon(al, br.from, br.to, 5, -9.2, 4.9, -1.0, -1.0, concrete, 6) : new THREE.Group());
      [4.9, -9.2].forEach(function (off) {
        for (var x = br.from; x < br.to; x += 8) {
          var r = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 8), rail);
          R.group.add(W3m.place(r, al, x + 4, off, 0.55));
        }
      });
    });
    // Pasos a nivel (cruces de carretera)
    (line.crossings || []).forEach(function (lc) {
      var g = new THREE.Group();
      var road = new THREE.Mesh(new THREE.BoxGeometry(30, 0.08, 6), new THREE.MeshStandardMaterial({ color: 0x3b3b3b, roughness: 0.95 }));
      road.position.set(-2.15, 0.12, 0); g.add(road);
      R.group.add(W3m.place(g, al, lc.x, 0, 0));
    });
    // Desvíos: marca de la aguja (caja de accionamiento junto a la vía)
    var motor = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 1.2), new THREE.MeshStandardMaterial({ color: 0x4e5a3a, roughness: 0.8 }));
    (line.switches || []).forEach(function (sw) { R.group.add(W3m.place(motor.clone(), al, sw.x, sw.side > 0 ? 2.2 : -6.5, 0.2)); });

    // Edificios de viajeros con la marca activa (Trazia en el edificio, Ferronda en el andén)
    var brand = RC.data.brand;
    if (brand) {
      line.stations.forEach(function (st) {
        var side = st.side === 'derecha' ? 1 : -1;
        var board = brandBoard(brand, st.name);
        [st.stopX - 25, st.stopX - st.platformLength * 0.55].forEach(function (sx) {
          var m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshBasicMaterial({ map: board, side: THREE.DoubleSide }));
          R.group.add(W3m.place(m, al, sx, side > 0 ? 9.2 : -4.3 - 9.2, 3.4));
        });
      });
    }

    W.real = R;
    update(W, sim, 0, true);
    return R;
  }

  /* Cartel de estación: fondo de la marca de infraestructuras, logotipo y nombre real. */
  function brandBoard(brand, name) {
    var S = brand.signage, c = document.createElement('canvas'); c.width = 1024; c.height = 256;
    var g = c.getContext('2d');
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
    var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    paint(null);
    brand.image(brand.infra.logoSvg, paint);
    return t;
  }

  /* Carga/descarga de teselas alrededor del tren (radio en km). */
  function update(W, sim, night, force) {
    var R = W.real; if (!R) return;
    var F = W3().frame(W.al, sim.train.x), line = R.line;
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
      if (bt && !bt.mesh && want[k] <= 3) bt.mesh = buildBuildings(R, k, bt.list);
    }
    for (k in R.tiles) if (!(k in want)) { disposeTile(R, R.tiles[k]); delete R.tiles[k]; }
    for (k in R.bTiles) {
      var bt2 = R.bTiles[k];
      if (bt2.mesh && !(k in want && want[k] <= 3)) { R.group.remove(bt2.mesh); bt2.mesh.geometry.dispose(); bt2.mesh = null; }
    }
  }

  RC.ui3d = RC.ui3d || {};
  RC.ui3d.realworld = { build: build, update: update };
})(globalThis.RC);
