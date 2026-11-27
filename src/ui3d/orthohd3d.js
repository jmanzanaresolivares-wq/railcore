/* RAILCORE — Ortofoto PNOA de alta resolución junto a la vía (sólo presentación).
 * La ortofoto normal del terreno tiene unos 2 m por píxel; en una franja de ±70 m alrededor de la
 * vía hay además celdas de 100 m × 100 m a 0,3 m por píxel (descargadas del IGN por
 * tools/route/fetch-ortohd.mjs; © IGN, CC BY 4.0). Aquí se cargan las celdas cercanas a la cámara
 * y se pintan como un «calco» encima del terreno, con su misma malla (mismos vértices cada 20 m),
 * así que no hay huecos ni parpadeos. Las lejanas se descargan para no gastar memoria. */
(function (RC) {
  var CELL = 100, SEG = 5, RAD = 330, MAXLOAD = 3;

  function create(R) {
    var I = RC.data.c1ortohdIndex; if (!I || !I.cells || !I.cells.length) return null;
    var H = { R: R, have: {}, cells: {}, loading: 0, lastE: 1e12, lastN: 1e12, tick: 0, glow: -1 };
    I.cells.forEach(function (k) { H.have[k] = true; });
    RC.data.c1ortohd = RC.data.c1ortohd || {};
    return H;
  }

  /* Malla de la celda con las mismas cotas que el terreno ya cargado (o null si aún no está). */
  function makeMesh(H, W, key, tex) {
    var line = H.R.line, p = key.split('_').map(Number), E0 = p[0] * CELL, N0 = p[1] * CELL;
    var g = new THREE.PlaneGeometry(CELL, CELL, SEG, SEG), pos = g.attributes.position, step = CELL / SEG;
    for (var r = 0; r <= SEG; r++) for (var c = 0; c <= SEG; c++) {
      var x = E0 + c * step - line.origin.E, z = -(N0 + CELL - r * step - line.origin.N);
      var y = RC.ui3d.realworld.heightAt(W, x, z);
      if (y === null || y === undefined || !isFinite(y)) { g.dispose(); return null; }
      pos.setXYZ(r * (SEG + 1) + c, x, y + 0.02, z);
    }
    g.computeVertexNormals();
    var m = groundDetail(new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: H.R.orthoGlow, roughness: 1, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    var mesh = new THREE.Mesh(g, m);
    mesh.receiveShadow = true; mesh.renderOrder = 1;
    H.R.group.add(mesh);
    return mesh;
  }

  function load(H, key) {
    var C = H.cells[key] = { state: 'loading', mesh: null, tex: null, script: null };
    H.loading++;
    var s = document.createElement('script'); s.src = 'src/data/c1/ortohd/' + key + '.js'; s.async = true;
    C.script = s;
    s.onload = s.onerror = function () {
      var d = RC.data.c1ortohd[key]; delete RC.data.c1ortohd[key]; s.remove(); C.script = null;
      if (!d || C.state === 'gone') { H.loading--; C.state = 'failed'; return; }
      var img = new Image();
      img.onload = img.onerror = function () {
        H.loading--;
        if (C.state === 'gone' || !img.width) { C.state = 'failed'; return; }
        var t = new THREE.Texture(img); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.needsUpdate = true;
        C.tex = t; C.state = 'ready';
      };
      img.src = d;
    };
    document.head.appendChild(s);
  }

  function unload(H, key) {
    var C = H.cells[key]; if (!C) return;
    C.state = 'gone';
    if (C.mesh) { H.R.group.remove(C.mesh); C.mesh.geometry.dispose(); C.mesh.material.dispose(); }
    if (C.tex) C.tex.dispose();
    if (C.script) C.script.remove();
    delete H.cells[key];
  }

  function update(H, W, cam) {
    if (!H || !cam) return;
    var line = H.R.line, E = cam.x + line.origin.E, N = -cam.z + line.origin.N, k;
    // Mallas pendientes (textura lista pero el terreno aún no estaba) y brillo de día/noche
    for (k in H.cells) {
      var C = H.cells[k];
      if (C.state === 'ready' && !C.mesh) { C.mesh = makeMesh(H, W, k, C.tex); if (C.mesh) C.state = 'shown'; }
    }
    if (Math.abs(H.glow - H.R.orthoGlow) > 0.01) {
      H.glow = H.R.orthoGlow;
      for (k in H.cells) if (H.cells[k].mesh) H.cells[k].mesh.material.emissiveIntensity = H.glow;
    }
    var moved = Math.abs(E - H.lastE) >= 15 || Math.abs(N - H.lastN) >= 15;
    if (!moved && (H.loading >= MAXLOAD || (++H.tick % 3))) return;
    H.lastE = E; H.lastN = N;
    var want = {}, e0 = Math.floor((E - RAD) / CELL), e1 = Math.floor((E + RAD) / CELL), n0 = Math.floor((N - RAD) / CELL), n1 = Math.floor((N + RAD) / CELL);
    for (var e = e0; e <= e1; e++) for (var n = n0; n <= n1; n++) {
      k = e + '_' + n; if (!H.have[k]) continue;
      var d = Math.hypot((e + 0.5) * CELL - E, (n + 0.5) * CELL - N);
      if (d < RAD) want[k] = d;
    }
    for (k in H.cells) {
      if (k in want) continue;
      var q = k.split('_').map(Number);
      if (Math.hypot((q[0] + 0.5) * CELL - E, (q[1] + 0.5) * CELL - N) > RAD + 90) unload(H, k);
    }
    Object.keys(want).filter(function (kk) { return !H.cells[kk]; }).sort(function (a, b) { return want[a] - want[b]; })
      .forEach(function (kk) { if (H.loading < MAXLOAD) load(H, kk); });
  }

  /* Detalle de cerca para el suelo fotográfico: de lejos manda la ortofoto; a menos de unos 60 m se
   * le suma la textura fina (dos escalas, para que no se note la repetición) de tierra y grava CC0. */
  var DET = null, GAIN = { value: 0.74 };   // la foto ya trae el sol: se aclara menos para no «quemar» el suelo
  function detailTextures() {
    if (DET) return DET;
    var T = RC.data.textures; if (!T || !T.dry_diff || !T.ground_diff) return null;
    function mk(src) {
      var t = new THREE.Texture(), img = new Image();
      img.onload = function () { t.image = img; t.needsUpdate = true; };
      img.src = src; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
      return t;
    }
    return (DET = { a: mk(T.dry_diff), b: mk(T.ground_diff) });
  }
  function groundDetail(mat) {
    var D = detailTextures(); if (!D) return mat;
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.gDetA = { value: D.a }; sh.uniforms.gDetB = { value: D.b }; sh.uniforms.gGain = GAIN;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D gDetA, gDetB; uniform float gGain; varying vec3 vGW;\n' +
          'float gLum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }')
        .replace('#include <map_fragment>', '#include <map_fragment>\n' +
          'float gD = gLum(texture(gDetA, vGW.xz / 3.1).rgb) / max(0.05, gLum(textureLod(gDetA, vec2(0.5), 12.0).rgb)) * 0.5 +' +
          ' gLum(texture(gDetB, vGW.xz / 7.3).rgb) / max(0.05, gLum(textureLod(gDetB, vec2(0.5), 12.0).rgb)) * 0.5;\n' +
          'float gK = 0.7 * (1.0 - smoothstep(12.0, 80.0, distance(vGW, cameraPosition)));\n' +
          'float gF = mix(1.0, clamp(gD, 0.35, 1.8), gK) * gGain;\n' +
          'diffuseColor.rgb *= gF;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= gF;');
    };
    mat.customProgramCacheKey = function () { return 'rc-suelo-1'; };
    return mat;
  }

  RC.ui3d = RC.ui3d || {};
  RC.ui3d.orthohd = { create: create, update: update, groundDetail: groundDetail, gain: GAIN };
})(globalThis.RC);
