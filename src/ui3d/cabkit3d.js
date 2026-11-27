/* RAILCORE — Utilidades para construir la cabina 3D:
 *  - materiales PBR con las texturas CC0 de la cabina (RC.data.cabTextures),
 *  - cajas con UV en metros (la textura tiene su tamaño real), cajas redondeadas y
 *    perfiles extruidos con biselado,
 *  - un agrupador que junta toda la geometría fija por material (pocas llamadas de dibujo),
 *  - placas de rótulos: un lienzo por panel con los textos, que además se retroiluminan.
 * Sólo presentación. */
(function (RC) {
  var K = {};

  /* ---------- Texturas y materiales ---------- */
  var texCache = {};
  function tex(key, repeat, srgb) {
    var src = RC.data.cabTextures && RC.data.cabTextures[key];
    if (!src) return null;
    var id = key + ':' + repeat[0].toFixed(3) + 'x' + repeat[1].toFixed(3);
    if (texCache[id]) return texCache[id];
    var t = new THREE.TextureLoader().load(src);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return (texCache[id] = t);
  }
  K.tex = tex;

  /* Material PBR de la cabina. name: plastico | pintura | suelo | tejido | techo;
   * tile: metros que ocupa una repetición de la textura (las UV van en metros). */
  K.pbr = function (name, tile, p) {
    var rep = [1 / tile, 1 / tile];
    var params = { map: tex(name + '_diff', rep, true), normalMap: tex(name + '_nor', rep), roughnessMap: tex(name + '_rough', rep), roughness: 1, metalness: 0 };
    for (var k in p || {}) params[k] = p[k];
    if (params.color !== undefined && !(params.color instanceof THREE.Color)) params.color = new THREE.Color(params.color);
    if (params.normalScale !== undefined && !(params.normalScale instanceof THREE.Vector2)) params.normalScale = new THREE.Vector2(params.normalScale, params.normalScale);
    return new THREE.MeshStandardMaterial(params);
  };
  K.mat = function (color, rough, metal, extra) {
    var p = { color: color, roughness: rough === undefined ? 0.7 : rough, metalness: metal || 0 };
    for (var k in extra || {}) p[k] = extra[k];
    return new THREE.MeshStandardMaterial(p);
  };

  /* ---------- Geometría ---------- */
  /* Caja con UV en metros. */
  K.box = function (w, h, d) {
    var g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
    var sc = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (var f = 0; f < 6; f++) for (var i = 0; i < 4; i++) { var k = f * 4 + i; uv.setXY(k, uv.getX(k) * sc[f][0], uv.getY(k) * sc[f][1]); }
    return g;
  };
  function roundedRect(w, h, r) {
    var s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    r = Math.max(0, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4));
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }
  K.roundedRect = roundedRect;
  /* Caja con todas las aristas redondeadas (radio r), centrada. */
  K.rbox = function (w, h, d, r, seg) {
    var b = Math.min(r * 0.5, d / 2 - 1e-3, w / 4, h / 4);
    var g = new THREE.ExtrudeGeometry(roundedRect(w - 2 * b, h - 2 * b, r * 0.5), {
      depth: Math.max(1e-3, d - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: seg || 2, curveSegments: 3 });
    g.translate(0, 0, -(d - 2 * b) / 2);
    return g;
  };
  /* Marco (rectángulo con hueco), en el plano XY, grosor d hacia +Z. */
  K.frame = function (w, h, border, d, r) {
    var s = roundedRect(w, h, r || 0.02), hole = roundedRect(w - 2 * border, h - 2 * border, Math.max(0.005, (r || 0.02) - border * 0.5));
    s.holes.push(new THREE.Path(hole.getPoints(6).reverse()));
    var g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1, curveSegments: 4 });
    return g;
  };
  /* Perfil lateral (z hacia atrás, y arriba) extruido a lo ancho entre x0 y x1, con biselado b.
   * cmds: [['M', z, y], ['L', z, y], ['Q', cz, cy, z, y], ...] */
  K.profileX = function (cmds, x0, x1, b, curveSeg) {
    var s = new THREE.Shape();
    cmds.forEach(function (c) {
      if (c[0] === 'M') s.moveTo(-c[1], c[2]);
      else if (c[0] === 'L') s.lineTo(-c[1], c[2]);
      else if (c[0] === 'Q') s.quadraticCurveTo(-c[1], c[2], -c[3], c[4]);
    });
    b = b || 0;
    var g = new THREE.ExtrudeGeometry(s, { depth: Math.max(1e-3, x1 - x0 - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: curveSeg || 6 });
    g.rotateY(Math.PI / 2);          // extrusión → +X; −u → +Z
    g.translate(x0 + b, 0, 0);
    return g;
  };
  /* Prisma de una forma en el plano XY con grosor d (hacia +Z), sin biselar. */
  K.slab = function (shape, d) { return new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false, curveSegments: 6 }); };

  var _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
  K.matrix = function (x, y, z, rx, ry, rz, sx, sy, sz) {
    _e.set(rx || 0, ry || 0, rz || 0, 'XYZ'); _q.setFromEuler(_e);
    _p.set(x || 0, y || 0, z || 0); _s.set(sx === undefined ? 1 : sx, sy === undefined ? (sx === undefined ? 1 : sx) : sy, sz === undefined ? (sx === undefined ? 1 : sx) : sz);
    return new THREE.Matrix4().compose(_p, _q, _s);
  };

  /* Grupo de panel: origen, normal (hacia el maquinista) y eje "derecha" del panel.
   * En coordenadas locales: u = X (derecha), v = Y (arriba del panel), Z = normal. */
  K.panel = function (parent, origin, normal, right) {
    var g = new THREE.Group();
    var N = normal.clone().normalize(), R = (right || new THREE.Vector3(1, 0, 0)).clone();
    R.sub(N.clone().multiplyScalar(R.dot(N))).normalize();
    var Up = new THREE.Vector3().crossVectors(N, R);
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(R, Up, N));
    g.position.copy(origin); parent.add(g); g.updateMatrix();
    return g;
  };

  /* ---------- Agrupador de geometría estática por material ---------- */
  function Batch(root) { this.root = root; this.items = {}; }
  /* Añade una geometría (se clona) con su matriz local y, opcionalmente, un color de vértice
   * y el panel en el que está (hijo directo de root). */
  Batch.prototype.add = function (key, geo, matrix, color, panel) {
    var g = geo.clone();
    var M = matrix ? matrix.clone() : new THREE.Matrix4();
    if (panel) { panel.updateMatrix(); M.premultiply(panel.matrix); }
    g.applyMatrix4(M);
    (this.items[key] = this.items[key] || []).push({ geo: g, color: color === undefined ? null : new THREE.Color(color) });
    return this;
  };
  Batch.prototype.flush = function (materials, flags) {
    var root = this.root, out = {};
    for (var key in this.items) {
      var list = this.items[key], mat = materials[key];
      if (!mat) { console.warn('Cabina: material sin definir', key); continue; }
      var geo = merge(list, !!mat.vertexColors);
      var mesh = new THREE.Mesh(geo, mat);
      var f = (flags && flags[key]) || { cast: true, receive: true };
      mesh.castShadow = !!f.cast; mesh.receiveShadow = !!f.receive;
      mesh.name = 'cabina:' + key;
      root.add(mesh); out[key] = mesh;
      list.forEach(function (it) { it.geo.dispose(); });
    }
    this.items = {};
    return out;
  };
  function merge(list, withColor) {
    var nv = 0, ni = 0;
    list.forEach(function (it) {
      var g = it.geo, n = g.attributes.position.count;
      nv += n; ni += g.index ? g.index.count : n;
    });
    var pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
    var col = withColor ? new Float32Array(nv * 3) : null;
    var idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    var vo = 0, io = 0;
    list.forEach(function (it) {
      var g = it.geo, P = g.attributes.position, N = g.attributes.normal, T = g.attributes.uv, n = P.count;
      if (!N) { g.computeVertexNormals(); N = g.attributes.normal; }
      pos.set(P.array.length === n * 3 ? P.array : Float32Array.from({ length: n * 3 }, function (_, k) { return P.getComponent(Math.floor(k / 3), k % 3); }), vo * 3);
      nor.set(N.array, vo * 3);
      if (T) uv.set(T.array, vo * 2);
      if (col) { var c = it.color || new THREE.Color(1, 1, 1); for (var k = 0; k < n; k++) { col[(vo + k) * 3] = c.r; col[(vo + k) * 3 + 1] = c.g; col[(vo + k) * 3 + 2] = c.b; } }
      if (g.index) { var I = g.index.array; for (var j = 0; j < I.length; j++) idx[io + j] = I[j] + vo; io += I.length; }
      else { for (var q = 0; q < n; q++) idx[io + q] = vo + q; io += n; }
      vo += n;
    });
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    out.computeBoundingSphere(); out.computeBoundingBox();
    return out;
  }
  K.Batch = Batch;
  K.merge = merge;

  /* ---------- Placa de rótulos retroiluminados ----------
   * Un lienzo para todo el panel (w × h metros): rótulos, escalas, marcos serigrafiados.
   * El color va en `map` y el texto que se ilumina de noche en `emissiveMap`. */
  function Faceplate(w, h, opts) {
    opts = opts || {};
    this.w = w; this.h = h;
    this.ppm = opts.ppm || 800;
    this.W = Math.max(16, Math.round(w * this.ppm)); this.H = Math.max(16, Math.round(h * this.ppm));
    this.c = document.createElement('canvas'); this.c.width = this.W; this.c.height = this.H;
    this.ce = document.createElement('canvas'); this.ce.width = Math.ceil(this.W / 2); this.ce.height = Math.ceil(this.H / 2);
    this.g = this.c.getContext('2d'); this.ge = this.ce.getContext('2d');
    this.bg = opts.bg || '#30353b';
    this.g.fillStyle = this.bg; this.g.fillRect(0, 0, this.W, this.H);
    if (opts.grain !== false) {   // ligera variación del plástico
      var rng = RC.core.util.rng(opts.seed || 7);
      for (var i = 0; i < this.W * this.H / 90; i++) {
        this.g.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.04)';
        this.g.fillRect(rng() * this.W, rng() * this.H, 2, 2);
      }
    }
    this.ge.fillStyle = '#000'; this.ge.fillRect(0, 0, this.ce.width, this.ce.height);
  }
  Faceplate.prototype.px = function (u) { return (u + this.w / 2) * this.ppm; };
  Faceplate.prototype.py = function (v) { return (this.h / 2 - v) * this.ppm; };
  /* Texto centrado en (u, v); size = altura de letra en metros. o: { color, glow (bool, def. true), align, weight, font } */
  Faceplate.prototype.text = function (u, v, str, size, o) {
    o = o || {};
    var g = this.g, ge = this.ge, px = Math.max(6, Math.round(size * this.ppm));
    var font = (o.weight || '700') + ' ' + px + 'px ' + (o.font || 'Arial, Helvetica, sans-serif');
    var lines = String(str).split('\n'), self = this;
    [g, ge].forEach(function (ctx, k) {
      var s = k ? 0.5 : 1;
      ctx.save(); ctx.scale(s, s);
      ctx.font = font; ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'middle';
      var maxW = o.maxW ? o.maxW * self.ppm : Infinity;
      lines.forEach(function (l, i) {
        var y = self.py(v) + (i - (lines.length - 1) / 2) * px * 1.12;
        var mw = ctx.measureText(l).width, sx = mw > maxW ? maxW / mw : 1;
        ctx.save(); ctx.translate(self.px(u), y); ctx.scale(sx, 1);
        if (k === 0) { ctx.fillStyle = o.color || '#e8ecef'; ctx.fillText(l, 0, 0); }
        else if (o.glow !== false) { ctx.fillStyle = o.glowColor || '#ffffff'; ctx.fillText(l, 0, 0); }
        ctx.restore();
      });
      ctx.restore();
    });
    return this;
  };
  /* Rectángulo (u, v = centro). o: { fill, stroke, lw (m), r (m), glow } */
  Faceplate.prototype.rect = function (u, v, w, h, o) {
    o = o || {};
    var x = this.px(u - w / 2), y = this.py(v + h / 2), W = w * this.ppm, H = h * this.ppm, r = (o.r || 0) * this.ppm;
    var g = this.g;
    function path(ctx, s) {
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x * s, y * s, W * s, H * s, r * s); else ctx.rect(x * s, y * s, W * s, H * s);
    }
    if (o.fill) { g.fillStyle = o.fill; path(g, 1); g.fill(); }
    if (o.stroke) { g.strokeStyle = o.stroke; g.lineWidth = (o.lw || 0.0025) * this.ppm; path(g, 1); g.stroke(); }
    if (o.glow) { var ge = this.ge; ge.strokeStyle = o.glow; ge.lineWidth = (o.lw || 0.0025) * this.ppm * 0.5; path(ge, 0.5); ge.stroke(); }
    return this;
  };
  Faceplate.prototype.circle = function (u, v, r, o) {
    o = o || {};
    var g = this.g;
    g.beginPath(); g.arc(this.px(u), this.py(v), r * this.ppm, 0, Math.PI * 2);
    if (o.fill) { g.fillStyle = o.fill; g.fill(); }
    if (o.stroke) { g.strokeStyle = o.stroke; g.lineWidth = (o.lw || 0.002) * this.ppm; g.stroke(); }
    return this;
  };
  Faceplate.prototype.line = function (u0, v0, u1, v1, o) {
    o = o || {};
    var g = this.g; g.strokeStyle = o.color || '#9aa3ab'; g.lineWidth = (o.lw || 0.002) * this.ppm;
    g.beginPath(); g.moveTo(this.px(u0), this.py(v0)); g.lineTo(this.px(u1), this.py(v1)); g.stroke();
    if (o.glow) { var ge = this.ge; ge.strokeStyle = o.glow; ge.lineWidth = (o.lw || 0.002) * this.ppm * 0.5; ge.beginPath(); ge.moveTo(this.px(u0) / 2, this.py(v0) / 2); ge.lineTo(this.px(u1) / 2, this.py(v1) / 2); ge.stroke(); }
    return this;
  };
  /* Crea la malla de la placa (plano w × h) con material PBR plástico y retroiluminación. */
  Faceplate.prototype.mesh = function (opts) {
    opts = opts || {};
    var map = new THREE.CanvasTexture(this.c), em = new THREE.CanvasTexture(this.ce);
    map.colorSpace = THREE.SRGBColorSpace; em.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8; em.anisotropy = 4;
    var tile = opts.tile || 0.3, nrep = [this.w / tile, this.h / tile];
    var mat = new THREE.MeshStandardMaterial({
      map: map, emissive: new THREE.Color(opts.glowColor || 0xffe2b8), emissiveMap: em, emissiveIntensity: 0,
      normalMap: tex((opts.texture || 'plastico') + '_nor', nrep), normalScale: new THREE.Vector2(0.5, 0.5),
      roughnessMap: tex((opts.texture || 'plastico') + '_rough', nrep), roughness: opts.roughness || 0.85, metalness: 0,
      envMapIntensity: opts.envMapIntensity === undefined ? 0.5 : opts.envMapIntensity
    });
    var m = new THREE.Mesh(new THREE.PlaneGeometry(this.w, this.h), mat);
    m.name = 'placa';
    return m;
  };
  K.Faceplate = Faceplate;

  RC.ui3d = RC.ui3d || {};
  RC.ui3d.cabkit = K;
})(globalThis.RC);
