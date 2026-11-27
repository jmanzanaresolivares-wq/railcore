/* RAILCORE — Mundo 3D (Three.js): trazado de la vía con curvas y rampas,
 * balasto, carriles, traviesas, catenaria, señales, balizas, edificios, olivares
 * y cartelones. Las estaciones están en stations3d.js y los trenes en traffic3d.js.
 * Sólo presentación: lee la simulación, nunca la modifica.
 * Ejes: X derecha, Y arriba, el tren avanza hacia −Z. */
(function (RC) {
  var U = RC.core.util, TT = RC.core.timetable;
  var STEP = 5, X0 = -800, X1 = 31000;   // X1 se ajusta a la longitud de la línea
  var GAUGE = 1.668 / 2, TRACK2 = -4.3;

  /* Material PBR con texturas CC0 reales (Poly Haven) incrustadas. */
  var texCache = {};
  function loadTex(key, repeat, srgb) {
    var src = RC.data.textures && RC.data.textures[key];
    if (!src) return null;
    var id = key + repeat.join('x');
    if (texCache[id]) return texCache[id];
    var t = new THREE.TextureLoader().load(src);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return (texCache[id] = t);
  }
  function pbr(name, repeat, extra) {
    repeat = repeat || [1, 1];
    var p = { map: loadTex(name + '_diff', repeat, true), normalMap: loadTex(name + '_nor', repeat), roughnessMap: loadTex(name + '_rough', repeat), roughness: 1, metalness: 0 };
    for (var k in extra || {}) p[k] = extra[k];
    if (p.color !== undefined) p.color = new THREE.Color(p.color);
    return new THREE.MeshStandardMaterial(p);
  }
  RC.ui3d = RC.ui3d || {};
  RC.ui3d.pbr = pbr;

  /* ---------- Trazado: centro de la vía 1 a lo largo de x ---------- */
  function buildAlignment(line) {
    // Ruta real: geometría medida (OpenStreetMap + MDT del IGN), muestreada cada STEP m desde X0
    if (line.geometry) {
      var G = line.geometry, m = G.px.length;
      var qx = new Float64Array(G.px), qz = new Float64Array(G.pz), qy = new Float64Array(G.py), qh = new Float64Array(m);
      for (var j = 0; j < m; j++) {
        var a0 = Math.max(0, j - 1), a1 = Math.min(m - 1, j + 1);
        qh[j] = Math.atan2(qx[a1] - qx[a0], -(qz[a1] - qz[a0]));
        if (j > 0) { while (qh[j] - qh[j - 1] > Math.PI) qh[j] -= 2 * Math.PI; while (qh[j] - qh[j - 1] < -Math.PI) qh[j] += 2 * Math.PI; }
      }
      return { px: qx, pz: qz, py: qy, th: qh, n: m };
    }
    var n = Math.ceil((X1 - X0) / STEP) + 1;
    var px = new Float64Array(n), pz = new Float64Array(n), py = new Float64Array(n), th = new Float64Array(n);
    var heading = 0, X = 0, Z = 0, Y = 0;
    // Integrar desde x=0 hacia delante y hacia atrás para que x=0 sea el origen
    var i0 = Math.round((0 - X0) / STEP);
    px[i0] = 0; pz[i0] = 0; py[i0] = 0; th[i0] = 0;
    for (var i = i0 + 1; i < n; i++) {
      var x = X0 + (i - 1) * STEP;
      heading += TT.curvatureAt(line, x) * STEP;
      X += Math.sin(heading) * STEP; Z -= Math.cos(heading) * STEP;
      Y += TT.gradeAt(line, x) / 1000 * STEP;
      px[i] = X; pz[i] = Z; py[i] = Y; th[i] = heading;
    }
    heading = 0; X = 0; Z = 0; Y = 0;
    for (i = i0 - 1; i >= 0; i--) {
      x = X0 + i * STEP;
      heading -= TT.curvatureAt(line, x) * STEP;
      X -= Math.sin(heading) * STEP; Z += Math.cos(heading) * STEP;
      Y -= TT.gradeAt(line, x) / 1000 * STEP;
      px[i] = X; pz[i] = Z; py[i] = Y; th[i] = heading;
    }
    return { px: px, pz: pz, py: py, th: th, n: n };
  }

  /* Marco local en el punto x: posición, avance y derecha. */
  function frame(al, x) {
    var f = (x - X0) / STEP, i = Math.floor(f);
    if (i < 0) { i = 0; f = 0; } if (i >= al.n - 1) { i = al.n - 2; f = 1; } else f -= i;
    var h = al.th[i] + (al.th[i + 1] - al.th[i]) * f;
    return {
      x: al.px[i] + (al.px[i + 1] - al.px[i]) * f,
      y: al.py[i] + (al.py[i + 1] - al.py[i]) * f,
      z: al.pz[i] + (al.pz[i + 1] - al.pz[i]) * f,
      heading: h,
      fx: Math.sin(h), fz: -Math.cos(h),   // avance
      rx: Math.cos(h), rz: Math.sin(h)     // derecha
    };
  }
  function at(al, x, off, up) {
    var F = frame(al, x);
    return new THREE.Vector3(F.x + F.rx * off, F.y + (up || 0), F.z + F.rz * off);
  }
  function place(obj, al, x, off, up, yawExtra) {
    var F = frame(al, x);
    obj.position.set(F.x + F.rx * off, F.y + (up || 0), F.z + F.rz * off);
    obj.rotation.set(0, -F.heading + (yawExtra || 0), 0);
    return obj;
  }

  /* Valor fijo o función de x (para desplazamientos que cambian a lo largo de la vía). */
  function val(v, x) { return typeof v === 'function' ? v(x) : v; }

  /* Cinta a lo largo de la vía entre dos desplazamientos laterales (números o funciones de x). */
  function ribbon(al, x0, x1, step, offL, offR, upL, upR, material, vScale) {
    var pos = [], uv = [], idx = [], k = 0;
    for (var x = x0; x <= x1 + 1e-6; x += step) {
      var a = at(al, x, val(offL, x), val(upL, x)), b = at(al, x, val(offR, x), val(upR, x));
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      var v = (x - x0) / (vScale || 10);
      uv.push(0, v, 1, v);
      if (k > 0) { var j = (k - 1) * 2; idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
      k++;
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    var m = new THREE.Mesh(g, material);
    m.receiveShadow = false;
    return m;
  }

  /* ---------- Texturas procedurales ---------- */
  function brandHex(c) { return typeof c === 'number' ? c : parseInt(String(c).replace('#', ''), 16); }
  function canvasTex(w, h, draw, repeat) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    return t;
  }
  function noiseTex(base, vary, size, repeat, seed) {
    var rng = U.rng(seed || 1);
    return canvasTex(size, size, function (g, w, h) {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      for (var i = 0; i < w * h / 6; i++) {
        var c = vary[Math.floor(rng() * vary.length)];
        g.fillStyle = c; g.globalAlpha = 0.35 + rng() * 0.5;
        g.fillRect(rng() * w, rng() * h, 1 + rng() * 2, 1 + rng() * 2);
      }
      g.globalAlpha = 1;
    }, repeat);
  }
  function textTex(text, opts) {
    opts = opts || {};
    var w = opts.w || 512, h = opts.h || 128;
    return canvasTex(w, h, function (g) {
      g.fillStyle = opts.bg || '#0d3b78'; g.fillRect(0, 0, w, h);
      if (opts.border) { g.strokeStyle = opts.border; g.lineWidth = h * 0.06; g.strokeRect(0, 0, w, h); }
      g.fillStyle = opts.fg || '#fff';
      g.font = 'bold ' + Math.round(h * (opts.size || 0.55)) + 'px Segoe UI, Arial, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + h * 0.03);
    });
  }
  function glowTex() {
    return canvasTex(64, 64, function (g) {
      var r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    });
  }

  function G_X1(line) { return X0 + (line.geometry.px.length - 1) * STEP; }

  /* Desplazamiento de la vía 2 respecto a la vía 1 (negativo = a la izquierda).
   * En las estaciones con andén a la izquierda del tren, la vía 2 se separa para dejar
   * un andén central entre las dos vías, con transiciones suaves. */
  var ISLAND_W = 6.0, EDGE = 1.72, TRANS = 180;
  function makeOff2(line) {
    var isl = (line.stations || []).filter(function (st) { return st.side === 'izquierda'; }).map(function (st) {
      return { x0: st.stopX - st.platformLength - 12, x1: st.stopX + 25 };
    });
    var wide = -(EDGE + ISLAND_W + EDGE);
    function smooth(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
    return function (x) {
      var o = TRACK2;
      for (var i = 0; i < isl.length; i++) {
        var r = isl[i];
        if (x <= r.x0 - TRANS || x >= r.x1 + TRANS) continue;
        var k = x < r.x0 ? smooth((x - (r.x0 - TRANS)) / TRANS) : x > r.x1 ? smooth((r.x1 + TRANS - x) / TRANS) : 1;
        o = Math.min(o, TRACK2 + (wide - TRACK2) * k);
      }
      return o;
    };
  }

  /* ---------- Construcción del mundo ---------- */
  function build(scene, sim) {
    var line = sim.line;
    X1 = line.geometry ? G_X1(line) : 31000;
    var al = buildAlignment(line);
    var off2 = makeOff2(line);
    var W = { al: al, scene: scene, signals: [], stations: [], dyn: {}, off2: off2 };
    var root = new THREE.Group(); scene.add(root); W.root = root;

    var T = RC.ui3d.pbr;
    var M = {
      ground: T('ground', [35, 1], { color: 0xcfcfb8 }),
      ballast: T('ballast', [1, 1]),
      rail: new THREE.MeshStandardMaterial({ color: 0xc9ccd1, metalness: 0.9, roughness: 0.28 }),
      railSide: T('rust', [0.05, 1], { color: 0x9a7a62 }),
      sleeper: T('sleeper', [1, 0.15]),
      pole: new THREE.MeshStandardMaterial({ color: 0x8a9099, metalness: 0.6, roughness: 0.55 }),
      wire: new THREE.LineBasicMaterial({ color: 0x3a3226 }),
      platform: T('platform', [2, 1]),
      platformEdge: new THREE.MeshStandardMaterial({ color: 0xe0b800, roughness: 0.7 }),
      concrete: T('sleeper', [4, 1], { color: 0xb8b4ac }),
      canopy: new THREE.MeshStandardMaterial({ color: 0xe6e6e6, roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide }),
      dark: new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.6 })
    };
    W.M = M;

    // Terreno: ancha cinta que sigue el perfil, algo por debajo del carril
    if (line.real) {   // con terreno real sólo la plataforma de la vía; el resto lo pone realworld3d
      root.add(ribbon(al, X0, X1, 10, function (x) { return off2(x) - 4.2; }, 4.2, -0.9, -0.9, M.ground, 40));
    } else root.add(ribbon(al, X0, X1, 20, -700, 700, -0.9, -0.9, M.ground, 40));
    // Balasto y carriles de las dos vías
    root.add(ribbon(al, X0, X1, 10, function (x) { return off2(x) + 1.4; }, -1.4, 0, 0, M.ballast, 1.5));   // entrevía
    function shift(f, d) { return typeof f === 'function' ? function (x) { return f(x) + d; } : f + d; }
    [0, off2].forEach(function (off) {
      var two = off !== 0;
      if (two) root.add(ribbon(al, X0, X1, 10, shift(off, -2.2), shift(off, -1.4), -0.85, 0, M.ballast, 1.2));
      root.add(ribbon(al, X0, X1, 10, shift(off, -1.4), shift(off, 1.4), 0, 0, M.ballast, 2.8));
      if (!two) root.add(ribbon(al, X0, X1, 10, 1.4, 2.2, 0, -0.85, M.ballast, 1.2));
      [-GAUGE, GAUGE].forEach(function (ro) {
        root.add(ribbon(al, X0, X1, 5, shift(off, ro - 0.036), shift(off, ro + 0.036), 0.172, 0.172, M.rail, 10));
        root.add(ribbon(al, X0, X1, 5, shift(off, ro - 0.036), shift(off, ro - 0.036), 0.0, 0.17, M.railSide, 10));
        root.add(ribbon(al, X0, X1, 5, shift(off, ro + 0.036), shift(off, ro + 0.036), 0.17, 0.0, M.railSide, 10));
      });
    });
    // Traviesas: piscina instanciada que se recoloca alrededor del tren
    var SLEEPERS = 1900;
    var slGeo = new THREE.BoxGeometry(2.6, 0.12, 0.24);
    W.sleepers = [0, off2].map(function (off) {
      var im = new THREE.InstancedMesh(slGeo, M.sleeper, SLEEPERS);
      im.frustumCulled = false; im.userData.off = off; root.add(im); return im;
    });

    // Catenaria: postes cada 60 m, ménsulas y hilo de contacto. En los andenes laterales los postes
    // van detrás del andén; bajo la nave de Santa Justa y en la estación subterránea el hilo cuelga del techo.
    var Zs = RC.ui3d.stations ? RC.ui3d.stations.zones(line) : [];
    function zoneAtX(x) { for (var i = 0; i < Zs.length; i++) if (x > Zs[i].x0 - 5 && x < Zs[i].x1 + 5) return Zs[i]; return null; }
    var poleGeo = new THREE.BoxGeometry(0.25, 7.6, 0.25), armGeo = new THREE.BoxGeometry(4.0, 0.12, 0.12);
    var polesN = Math.ceil((X1 - X0) / 60) * 2;
    var poles = new THREE.InstancedMesh(poleGeo, M.pole, polesN), arms = new THREE.InstancedMesh(armGeo, M.pole, polesN);
    var dummy = new THREE.Object3D(), k = 0;
    for (var px = X0; px < X1; px += 60) {
      var zz = zoneAtX(px);
      if (zz && zz.kind !== 'surface') continue;
      var o2p = off2(px), sidePl = zz && !zz.island;
      [[sidePl ? 1.72 + zz.pw + 0.6 : 3.6, -0.3], [sidePl ? o2p - 1.72 - zz.pw - 0.6 : o2p - 3.6, o2p + 0.3]].forEach(function (pp) {
        place(dummy, al, px, pp[0], 3.8); dummy.updateMatrix(); poles.setMatrixAt(k, dummy.matrix);
        var len = Math.abs(pp[0] - pp[1]);
        place(dummy, al, px, (pp[0] + pp[1]) / 2, 6.9); dummy.scale.set(len / 4.0, 1, 1); dummy.updateMatrix(); arms.setMatrixAt(k, dummy.matrix);
        dummy.scale.set(1, 1, 1);
        k++;
      });
    }
    poles.count = k; arms.count = k;
    root.add(poles); root.add(arms);
    [0, off2].forEach(function (off) {
      [5.6, 6.8].forEach(function (hh) {
        var pts = [];
        for (var x = X0; x <= X1; x += 15) pts.push(at(al, x, val(off, x), hh));
        var g = new THREE.BufferGeometry().setFromPoints(pts);
        root.add(new THREE.Line(g, M.wire));
      });
    });

    // Señales
    var glow = glowTex();
    var lampGeo = new THREE.CircleGeometry(0.11, 20);
    sim.signals.forEach(function (sg) {
      var grp = new THREE.Group();
      var mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 5.0, 10), M.pole); mast.position.y = 2.5; grp.add(mast);
      var head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.15, 0.22), M.dark); head.position.set(0, 4.6, 0); grp.add(head);
      var hood = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.3, 0.04), M.dark); hood.position.set(0, 4.6, 0.12); grp.add(hood);
      var plate = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.3), new THREE.MeshBasicMaterial({ map: textTex(sg.name, { bg: '#f1f1f1', fg: '#111', w: 256, h: 84, size: 0.6 }) }));
      plate.position.set(0, 3.55, 0.07); grp.add(plate);
      var lamps = {};
      [['verde', 0x2bff6a, 4.95], ['amarillo', 0xffc928, 4.6], ['rojo', 0xff2a2a, 4.25]].forEach(function (L) {
        var mat = new THREE.MeshBasicMaterial({ color: 0x111111 });
        var lamp = new THREE.Mesh(lampGeo, mat); lamp.position.set(0, L[2], 0.115); grp.add(lamp);
        var spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: L[1], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        spr.position.set(0, L[2], 0.2); spr.scale.set(1.6, 1.6, 1); spr.visible = false; grp.add(spr);
        lamps[L[0]] = { mat: mat, spr: spr, color: L[1] };
      });
      place(grp, al, sg.x, 2.7, 0);
      root.add(grp);
      W.signals.push({ idx: sg.idx, lamps: lamps, aspect: null });
    });
    // Balizas ASFA (cajas amarillas entre carriles)
    var bGeo = new THREE.BoxGeometry(0.5, 0.1, 0.35), bMat = new THREE.MeshLambertMaterial({ color: 0xe8b400 });
    sim.beacons.forEach(function (b) { root.add(place(new THREE.Mesh(bGeo, bMat), al, b.x, 0, 0.12)); });

    // Edificios en zona urbana y olivares en el campo (deterministas)
    var rngB = U.rng(42);
    var winCanvas = document.createElement('canvas'); winCanvas.width = 256; winCanvas.height = 512;
    var litCanvas = document.createElement('canvas'); litCanvas.width = 256; litCanvas.height = 512;
    var winTex = new THREE.CanvasTexture(winCanvas), litTex = new THREE.CanvasTexture(litCanvas);
    winTex.colorSpace = THREE.SRGBColorSpace; litTex.colorSpace = THREE.SRGBColorSpace;
    function paintFacade(img) {
      var g = winCanvas.getContext('2d'), gl = litCanvas.getContext('2d'), rr = U.rng(7);
      if (img) g.drawImage(img, 0, 0, 256, 512); else { g.fillStyle = '#e9e4da'; g.fillRect(0, 0, 256, 512); }
      gl.fillStyle = '#000'; gl.fillRect(0, 0, 256, 512);
      for (var y = 24; y < 490; y += 48) for (var x = 18; x < 240; x += 56) {
        var lit = rr() < 0.35;
        g.fillStyle = '#2d3640'; g.fillRect(x, y, 30, 30);
        g.fillStyle = rr() < 0.5 ? '#3a5a3c' : '#6b4a2b'; g.fillRect(x - 5, y, 4, 30); g.fillRect(x + 31, y, 4, 30); // contraventanas
        g.fillStyle = '#ddd'; g.fillRect(x - 2, y + 30, 34, 4);
        if (lit) { gl.fillStyle = '#ffcf7a'; gl.fillRect(x, y, 30, 30); }
      }
      winTex.needsUpdate = true; litTex.needsUpdate = true;
    }
    paintFacade(null);
    var facadeImg = new Image(); facadeImg.onload = function () { paintFacade(facadeImg); }; facadeImg.src = RC.data.textures.facade_diff;
    var bMatB = new THREE.MeshStandardMaterial({ map: winTex, roughness: 0.9, emissive: 0xffffff, emissiveMap: litTex, emissiveIntensity: 0 });
    W.buildingMat = bMatB;
    var urban = line.real ? function () { return false; } : function (x) { return x < 8200 || (x > 12300 && x < 14800) || x > 28800; };
    var bGeo2 = new THREE.BoxGeometry(1, 1, 1);
    var bIm = new THREE.InstancedMesh(bGeo2, bMatB, 1400), bi = 0;
    var tGeo = new THREE.IcosahedronGeometry(1, 1), tMat = new THREE.MeshStandardMaterial({ color: 0x55663a, roughness: 0.95, flatShading: true });
    var trunkGeo = new THREE.CylinderGeometry(0.15, 0.2, 1.2, 5), trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a3a28 });
    var tIm = new THREE.InstancedMesh(tGeo, tMat, 5000), trIm = new THREE.InstancedMesh(trunkGeo, trunkMat, 5000), ti = 0;
    for (var bx = X0; bx < X1; bx += 18) {
      for (var s2 = -1; s2 <= 1; s2 += 2) {
        if (urban(bx)) {
          if (rngB() < 0.55 && bi < 1400) {
            var lat = s2 * (18 + rngB() * 90) + (s2 < 0 ? TRACK2 : 0), hgt = 6 + rngB() * 22, wdt = 10 + rngB() * 14;
            place(dummy, al, bx, lat, hgt / 2 - 0.9, rngB() * 0.2);
            dummy.scale.set(wdt, hgt, 10 + rngB() * 12); dummy.updateMatrix(); bIm.setMatrixAt(bi, dummy.matrix); dummy.scale.set(1, 1, 1);
            bIm.setColorAt(bi++, new THREE.Color([0xffffff, 0xf3e6c4, 0xe9c98f, 0xd9a066, 0xf6f1e7, 0xc98b5e][Math.floor(rngB() * 6)]));
          }
        } else {
          for (var r2 = 0; r2 < 3 && ti < 5000; r2++) {
            if (!line.real && rngB() < 0.6) {
              var lat2 = s2 * (14 + rngB() * 160) + (s2 < 0 ? TRACK2 : 0), sc = 1.4 + rngB() * 1.4;
              place(dummy, al, bx + rngB() * 18, lat2, 0.0); dummy.position.y += -0.3; dummy.updateMatrix(); trIm.setMatrixAt(ti, dummy.matrix);
              dummy.position.y += 1.3 + sc * 0.6; dummy.scale.set(sc * 1.3, sc, sc * 1.3); dummy.updateMatrix(); tIm.setMatrixAt(ti, dummy.matrix); dummy.scale.set(1, 1, 1);
              ti++;
            }
          }
        }
      }
    }
    bIm.count = bi; tIm.count = ti; trIm.count = ti;
    root.add(bIm); root.add(tIm); root.add(trIm);

    // Cartelones de velocidad máxima y postes kilométricos
    line.speedLimits.forEach(function (sl) {
      if (sl.from < 0) return;
      var g = new THREE.Group();
      var post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), M.pole); post.position.y = 1.1; g.add(post);
      var board = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ map: textTex(String(sl.kmh), { bg: '#ffffff', fg: '#000', w: 128, h: 128, size: 0.55, border: '#000' }) }));
      board.position.set(0, 2.4, 0.03); g.add(board);
      root.add(place(g, al, sl.from, 3.1, 0));
    });
    // Postes kilométricos: los reales (PK de la línea) si la ruta los trae
    var posts = line.kmPosts || [];
    if (!posts.length) for (var kx = 0; kx <= 30000; kx += 500) posts.push({ x: kx, label: (kx / 1000).toFixed(1) });
    posts.forEach(function (kp0) {
      var kp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.0, 0.08), new THREE.MeshBasicMaterial({ map: textTex(kp0.label, { bg: '#f4f4f4', fg: '#111', w: 128, h: 256, size: 0.3 }) }));
      root.add(place(kp, al, kp0.x, -2.6, 0.5));
    });
    // Pasos superiores
    (line.landmarks || []).forEach(function (lm) {
      if (lm.kind !== 'puente') return;
      var g = new THREE.Group();
      var deck = new THREE.Mesh(new THREE.BoxGeometry(34, 1.4, 9), M.concrete); deck.position.set(-2, 8.2, 0); g.add(deck);
      [-16, 12].forEach(function (lx) { var pier = new THREE.Mesh(new THREE.BoxGeometry(1.4, 8, 7), M.concrete); pier.position.set(lx, 3.6, 0); g.add(pier); });
      root.add(place(g, al, lm.x, 0, 0));
    });

    if (line.real && RC.ui3d.realworld) RC.ui3d.realworld.build(W, sim);
    if (RC.ui3d.stations) RC.ui3d.stations.build(W, sim);
    // Suelos, balasto, carriles y traviesas sólo reciben sombra (proyectarla no se ve y cuesta)
    [M.ground, M.ballast, M.rail, M.railSide, M.sleeper].forEach(function (m) { if (m) m.userData.noCast = true; });
    markShadows(root);
    return W;
  }

  /* Sombras del sol: lo opaco las proyecta y las recibe; lo transparente o aditivo (halos,
   * charcos de luz) no participa. Un material o un objeto con userData.noCast sólo las recibe. */
  function markShadows(obj, cast) {
    obj.traverse(function (o) {
      if (!o.isMesh) return;
      var m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!m) return;
      var glow = m.blending !== THREE.NormalBlending || (m.transparent && m.depthWrite === false);
      o.receiveShadow = !glow;
      o.castShadow = cast !== false && !glow && !m.userData.noCast && !o.userData.noCast;
    });
  }

  /* ---------- Actualización por fotograma ---------- */
  function update(W, sim, night, cam) {
    var al = W.al, x = sim.train.x;
    // Traviesas alrededor del tren
    var d = new THREE.Object3D(), start = Math.floor((x - 60) / 0.6) * 0.6;
    W.sleepers.forEach(function (im) {
      var off = im.userData.off;
      for (var i = 0; i < im.count; i++) { var xx = start + i * 0.6; place(d, al, xx, val(off, xx), 0.0); d.updateMatrix(); im.setMatrixAt(i, d.matrix); }
      im.instanceMatrix.needsUpdate = true;
    });
    // Aspectos de señales
    W.signals.forEach(function (s) {
      var asp = sim.signals[s.idx].aspect;
      if (s.aspect === asp && s.night === night) return;
      s.aspect = asp; s.night = night;
      for (var k in s.lamps) {
        var L = s.lamps[k], lit = k === s.aspect;
        L.mat.color.setHex(lit ? L.color : 0x111111);
        L.spr.visible = lit;
        var sc = 1.0 + night * 2.2;
        L.spr.scale.set(sc, sc, 1);
      }
    });
    // Estaciones (viajeros, luces, relojes y pantallas)
    if (RC.ui3d.stations) RC.ui3d.stations.update(W, sim, night, cam);
    if (W.real) RC.ui3d.realworld.update(W, sim, night);
    else W.buildingMat.emissiveIntensity = night * 1.2;
  }

  RC.ui3d = RC.ui3d || {};
  RC.ui3d.world = { ribbon: ribbon, build: build, update: update, frame: frame, at: at, place: place, buildAlignment: buildAlignment,
    markShadows: markShadows, textTex: textTex, canvasTex: canvasTex, glowTex: glowTex, val: val, brandHex: brandHex, TRACK2: TRACK2, GAUGE: GAUGE, X0: X0, STEP: STEP };
})(globalThis.RC);
