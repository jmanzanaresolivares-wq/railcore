/* RAILCORE — Vegetación de la ruta real (sólo presentación: lee la simulación, nunca la modifica).
 *
 * Árboles, arbustos y hierba dibujados con impostores: modelos CC0 de Poly Haven horneados en
 * atlas de 8 vistas (src/data/vegetation-data.js, herramienta en tools/vegetacion/).
 *  - Árboles y arbustos por tesela de 1 km: cuando llega la ortofoto PNOA de la tesela se analiza
 *    la imagen. Las manchas verdes oscuras y las manchas oscuras sobre tierra de labor (olivares)
 *    son copas: se planta un árbol en cada copa detectada, con semilla fija por tesela, y la
 *    especie sale del entorno (jacarandas y árboles de calle en la ciudad, olivos en los olivares,
 *    lentiscos y acebuches en el monte). Se respetan la vía con margen, las estaciones, las bocas
 *    de los túneles, los puentes, los pasos a nivel y las huellas de los edificios del Catastro.
 *    El trabajo de cada tesela se reparte en seis fotogramas para no dar tirones.
 *  - Hierba y matas bajas cerca de la cámara (≈150 m): en los bordes de la vía y en las zonas
 *    verdes, en manchas, celda a celda y siempre igual en el mismo sitio.
 *  - Un InstancedMesh por especie (cerca con sombra; lejos, sin sombra y menos denso según la
 *    distancia en teselas). Cada instancia es un cartel que mira a la cámara y elige (y funde)
 *    las dos vistas horneadas más próximas; se ilumina con las normales horneadas, proyecta una
 *    sombra con su silueta, se mece con el viento y se oscurece de noche.
 * Se engancha a realworld3d.js en tres puntos: ortofoto cargada, tesela descargada y update. */
(function (RC) {
  var TILE = 1000, N = 512, CN = 256, ST = 9;          // análisis a 512 px (≈2 m/px); mapa de suelo a 256
  var GCELL = 8, GRAD = 150, GSTEP = 10;               // hierba: celdas de 8 m hasta 150 m; se resiembra cada 10 m
  var LOD_FAR = [1, 1, 0.42, 0.2];                     // fracción de árboles por anillo de teselas
  var MAX_TREES = 5000, MAX_SHRUBS = 1800;             // por tesela
  var BALLAST = 2.3;                                   // borde del balasto respecto al eje de cada vía (m)

  /* Especies: tipo (árbol: también lejos; arbusto: sólo cerca; hierba: junto a la cámara),
   * altura (m) y amplitud del viento (relativa a la altura). */
  var SP = {
    jacaranda: { tipo: 'arbol', alto: [7, 12], viento: 0.010 },
    arbolito: { tipo: 'arbol', alto: [3.5, 6.5], viento: 0.012 },
    pino: { tipo: 'arbol', alto: [6, 11], viento: 0.008 },
    olivo: { tipo: 'arbol', alto: [4, 6.5], viento: 0.010 },
    olivo_bajo: { tipo: 'arbol', alto: [3, 5], viento: 0.010 },
    olivo_viejo: { tipo: 'arbol', alto: [2.6, 4.2], viento: 0.010 },
    lentisco: { tipo: 'arbol', alto: [2.2, 3.8], viento: 0.012 },
    acebuche: { tipo: 'arbusto', alto: [1.5, 2.6], viento: 0.015 },
    arbusto: { tipo: 'arbusto', alto: [0.9, 1.7], viento: 0.02 },
    retama: { tipo: 'arbusto', alto: [0.7, 1.4], viento: 0.025 },
    matorral: { tipo: 'arbusto', alto: [0.8, 1.5], viento: 0.02 },
    hierba: { tipo: 'hierba', alto: [0.28, 0.5], viento: 0.05 },
    hierba_alta: { tipo: 'hierba', alto: [0.45, 0.85], viento: 0.06 },
    hierba_seca: { tipo: 'hierba', alto: [0.35, 0.75], viento: 0.05 },
    ortiga: { tipo: 'hierba', alto: [0.3, 0.6], viento: 0.05 },
    mala_hierba: { tipo: 'hierba', alto: [0.1, 0.22], viento: 0.03 }
  };
  /* Mezclas de especies (pesos) según el entorno del árbol detectado. */
  var MIX = {
    ciudad: { jacaranda: 30, arbolito: 34, olivo: 10, pino: 5, olivo_bajo: 10, lentisco: 5, acebuche: 6 },
    ribera: { arbolito: 30, olivo: 16, pino: 8, lentisco: 20, olivo_bajo: 10, jacaranda: 6, acebuche: 10 },
    olivar: { olivo: 44, olivo_bajo: 32, olivo_viejo: 18, lentisco: 6 },
    monte: { lentisco: 34, acebuche: 28, olivo_bajo: 14, olivo_viejo: 10, arbusto: 6, matorral: 8 },
    matas: { acebuche: 32, matorral: 26, arbusto: 22, retama: 20 }
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function pick(mix, r) {
    var t = 0, k; for (k in mix) t += mix[k];
    r *= t; for (k in mix) { r -= mix[k]; if (r <= 0) return k; }
    return k;
  }
  /* Ruido de valor suave (0..1) para que la hierba crezca a manchas. */
  function h2(x, z) { var h = (Math.imul(x, 374761393) + Math.imul(z, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function vnoise(x, z) {
    var xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi;
    fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
    var a = h2(xi, zi), b = h2(xi + 1, zi), c = h2(xi, zi + 1), d = h2(xi + 1, zi + 1);
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  }

  /* ---------- Material del impostor: cartel que mira a la cámara con 8 vistas ---------- */
  var V_DECL = [
    'uniform vec4 vegGrid;', 'uniform vec4 vegWind;',
    'varying vec2 vegUv0;', 'varying vec2 vegUv1;', 'varying float vegBlend;', 'varying vec2 vegRot;',
    'vec2 vegCell( float i, vec2 q ) { float c = mod( i, vegGrid.x ), r = floor( i / vegGrid.x + 0.001 );',
    '  return vec2( ( c + q.x ) / vegGrid.x, 1.0 - ( r + 1.0 - q.y ) / vegGrid.y ); }'
  ].join('\n');
  var V_BEGIN = [
    'vec3 transformed = vec3( position );',
    'vec3 vegC = ( modelMatrix * vec4( instanceMatrix[ 3 ].xyz, 1.0 ) ).xyz;',      // pie del árbol (mundo)
    'float vegSw = length( instanceMatrix[ 0 ].xyz ), vegSh = instanceMatrix[ 1 ].y;',
    'vegRot = vec2( instanceMatrix[ 0 ].x, -instanceMatrix[ 0 ].z ) / vegSw;',        // cos y sen del giro
    // hacia la cámara; en la sombra, hacia el sol (cámara ortográfica de la luz: la uniforme
    // isOrthographic no llega al material de profundidad, se mira la proyección)
    'vec3 vegTo = projectionMatrix[ 3 ][ 3 ] > 0.5 ? vec3( viewMatrix[ 0 ][ 2 ], viewMatrix[ 1 ][ 2 ], viewMatrix[ 2 ][ 2 ] ) : cameraPosition - vegC;',
    'vec2 vegF = vegTo.xz; float vegL = length( vegF ); vegF = vegL > 1e-4 ? vegF / vegL : vec2( 0.0, 1.0 );',
    'vec3 vegR = vec3( vegF.y, 0.0, -vegF.x );',
    'float vegPh = dot( vegC.xz, vec2( 0.37, 0.61 ) ), vegT = vegWind.x * vegWind.z;',
    'float vegSway = ( sin( vegT + vegPh ) + 0.4 * sin( vegT * 2.3 + vegPh * 1.7 ) ) * vegWind.y * uv.y * uv.y;',
    'vec3 vegWorld = vegC + vegR * ( position.x * vegSw + vegSway * vegSh ) + vec3( 0.0, position.y * vegSh, 0.0 );',
    // vista horneada: ángulo de la cámara en el espacio del árbol
    'vec2 vegO = vec2( vegRot.x * vegF.x - vegRot.y * vegF.y, vegRot.y * vegF.x + vegRot.x * vegF.y );',
    'float vegV = mod( atan( vegO.x, vegO.y ) * 0.15915494 * vegGrid.z + vegGrid.z, vegGrid.z );',
    'float vegI0 = floor( vegV ); vegBlend = vegV - vegI0;',
    'vegUv0 = vegCell( vegI0, uv ); vegUv1 = vegCell( mod( vegI0 + 1.0, vegGrid.z ), uv );'
  ].join('\n');
  var V_PROJECT = 'vec4 mvPosition = viewMatrix * vec4( vegWorld, 1.0 );\ngl_Position = projectionMatrix * mvPosition;';
  var F_DECL = ['uniform vec2 vegTex;', 'uniform sampler2D vegN;', 'varying vec2 vegUv0;', 'varying vec2 vegUv1;', 'varying float vegBlend;', 'varying vec2 vegRot;'].join('\n');
  // color premultiplicado (en lineal) de las dos vistas; el alfa crece con la distancia para no perder follaje en los mipmaps
  var F_ALPHA = [
    'vec4 vegCol = mix( texture2D( map, vegUv0 ), texture2D( map, vegUv1 ), vegBlend );',
    'vec2 vegDx = dFdx( vegUv0 * vegTex ), vegDy = dFdy( vegUv0 * vegTex );',
    'float vegMip = max( 0.0, 0.5 * log2( max( dot( vegDx, vegDx ), dot( vegDy, vegDy ) ) ) );',
    'diffuseColor.a *= vegCol.a * ( 1.0 + vegMip * 0.3 );'
  ].join('\n');
  var F_MAP = F_ALPHA + '\ndiffuseColor.rgb *= vegCol.rgb / max( vegCol.a, 0.02 );';
  // normal horneada (espacio del árbol) → mundo (giro de la instancia) → vista
  var F_NORMAL = [
    '#include <normal_fragment_maps>',
    'vec3 vegNo = mix( texture2D( vegN, vegUv0 ).xyz, texture2D( vegN, vegUv1 ).xyz, vegBlend ) * 2.0 - 1.0;',
    'vec3 vegNw = vec3( vegRot.x * vegNo.x + vegRot.y * vegNo.z, vegNo.y, -vegRot.y * vegNo.x + vegRot.x * vegNo.z );',
    'normal = normalize( ( viewMatrix * vec4( vegNw, 0.0 ) ).xyz );'
  ].join('\n');
  function patchVertex(s) {
    return s.replace('#include <common>', '#include <common>\n' + V_DECL)
      .replace('#include <begin_vertex>', V_BEGIN)
      .replace('#include <project_vertex>', V_PROJECT)
      .replace('#include <worldpos_vertex>', 'vec4 worldPosition = vec4( vegWorld, 1.0 );');
  }

  function loadTex(src, srgb) {
    var t = new THREE.Texture(), img = new Image();
    img.onload = function () { t.image = img; t.needsUpdate = true; };
    img.src = src;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.anisotropy = 4; t.generateMipmaps = true;
    return t;
  }

  function makeSpecies(id, d) {
    var def = SP[id], tex = loadTex(d.color, true), ntex = loadTex(d.normal, false);
    var U = {
      vegN: { value: ntex }, vegGrid: { value: new THREE.Vector4(d.cols, d.rows, d.views, 0) },
      vegTex: { value: new THREE.Vector2(d.atlasW, d.atlasH) }, vegWind: { value: new THREE.Vector4(0, def.viento, 1.3, 0) }
    };
    var mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.88, metalness: 0, alphaTest: 0.5, side: THREE.FrontSide, shadowSide: THREE.DoubleSide });
    mat.onBeforeCompile = function (s) {
      for (var k in U) s.uniforms[k] = U[k];
      s.vertexShader = patchVertex(s.vertexShader);
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\n' + F_DECL)
        .replace('#include <map_fragment>', F_MAP).replace('#include <normal_fragment_maps>', F_NORMAL);
    };
    mat.customProgramCacheKey = function () { return 'railcore-vegetacion'; };
    // sombra: la silueta del cartel orientado hacia el sol
    var depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5 });
    depth.onBeforeCompile = function (s) {
      for (var k in U) s.uniforms[k] = U[k];
      s.vertexShader = patchVertex(s.vertexShader);
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\n' + F_DECL).replace('#include <map_fragment>', F_ALPHA);
    };
    depth.customProgramCacheKey = function () { return 'railcore-vegetacion-sombra'; };
    // Cartel: x de -w/2 a w/2, y de y0 a y0+h (pie del tronco en el origen), uv 0..1
    var g = new THREE.BufferGeometry(), w = d.w / 2, y0 = d.y0, y1 = d.y0 + d.h;
    g.setAttribute('position', new THREE.Float32BufferAttribute([-w, y0, 0, w, y0, 0, -w, y1, 0, w, y1, 0], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
    g.setIndex([0, 1, 2, 2, 1, 3]);
    return { id: id, def: def, d: d, tex: tex, ntex: ntex, U: U, mat: mat, depth: depth, geo: g, base: d.h / 1.03, near: null, far: null, grass: null };
  }

  /* Malla instanciada con capacidad que crece (y encoge) por potencias de dos. */
  function ensureMesh(V, S, slot, need, shadow) {
    var m = S[slot], cap = m ? m.instanceMatrix.count : 0;
    if (m && need <= cap && (need > cap / 4 || cap <= 256)) return m;
    if (m) { V.group.remove(m); m.dispose(); S[slot] = null; }
    if (!need) return null;
    var c = 256; while (c < need) c *= 2;
    m = new THREE.InstancedMesh(S.geo, S.mat, c);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(c * 3), 3);
    m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.castShadow = !!shadow; m.receiveShadow = slot === 'grass';
    m.customDepthMaterial = S.depth;
    m.count = 0;
    m.name = 'vegetacion-' + S.id + '-' + slot;
    V.group.add(m);
    return (S[slot] = m);
  }
  /* Copia n instancias (x, y, z, ancho, alto, giro, r, g, b; paso «stride») a la malla desde «at». */
  function writeInst(m, at, arr, from, n, stride) {
    if (!m || n <= 0) return;
    var M = m.instanceMatrix.array, C = m.instanceColor.array;
    for (var i = 0; i < n; i++) {
      var s = from + i * stride, o = (at + i) * 16, sw = arr[s + 3], sh = arr[s + 4], c = Math.cos(arr[s + 5]), sn = Math.sin(arr[s + 5]);
      M[o] = sw * c; M[o + 1] = 0; M[o + 2] = -sw * sn; M[o + 3] = 0;
      M[o + 4] = 0; M[o + 5] = sh; M[o + 6] = 0; M[o + 7] = 0;
      M[o + 8] = sw * sn; M[o + 9] = 0; M[o + 10] = sw * c; M[o + 11] = 0;
      M[o + 12] = arr[s]; M[o + 13] = arr[s + 1]; M[o + 14] = arr[s + 2]; M[o + 15] = 1;
      var q = (at + i) * 3; C[q] = arr[s + 6]; C[q + 1] = arr[s + 7]; C[q + 2] = arr[s + 8];
    }
  }
  function flush(m, n) { if (!m) return; m.count = n; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }

  /* ---------- Estado ---------- */
  function init(R) {
    if (R.veg) return R.veg;
    var D = RC.data.vegetation;
    var V = R.veg = { R: R, group: new THREE.Group(), sp: {}, tiles: {}, queue: [], job: null, dirty: false, rebuiltAt: 0, center: null,
      cam: new THREE.Vector3(), camOk: false, grassAt: null, cells: {}, camIdx: -1, stat: {}, ok: !!(D && D.especies), t0: performance.now() };
    V.group.name = 'vegetacion';
    R.group.add(V.group);
    if (!V.ok) return V;
    for (var id in SP) if (D.especies[id]) V.sp[id] = makeSpecies(id, D.especies[id]);
    V.grassIds = Object.keys(V.sp).filter(function (k) { return SP[k].tipo === 'hierba' || k === 'retama' || k === 'matorral' || k === 'arbusto'; });
    return V;
  }

  /* ---------- Vía: punto kilométrico y desplazamiento lateral de un punto del mundo ---------- */
  var W3 = function () { return RC.ui3d.world; };
  function project(al, i, wx, wz) {
    var h = al.th[i], dx = wx - al.px[i], dz = wz - al.pz[i], w = W3();
    return { x: w.X0 + i * w.STEP + dx * Math.sin(h) - dz * Math.cos(h), lat: dx * Math.cos(h) + dz * Math.sin(h), y: al.py[i], i: i };
  }
  /* Índice del trazado más cercano partiendo de una pista (búsqueda gruesa y luego fina). */
  function nearestIdx(al, wx, wz, hint, span) {
    var best = -1, bd = Infinity, lo = Math.max(0, hint - span), hi = Math.min(al.n - 1, hint + span), i, d, dx, dz;
    for (i = lo; i <= hi; i += 4) { dx = wx - al.px[i]; dz = wz - al.pz[i]; d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } }
    lo = Math.max(0, best - 4); hi = Math.min(al.n - 1, best + 4);
    for (i = lo; i <= hi; i++) { dx = wx - al.px[i]; dz = wz - al.pz[i]; d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } }
    return { i: best, d2: bd };
  }
  /* Índices del trazado (cada 5 m) que pasan cerca de una tesela. */
  function tileTrack(R, o) {
    var al = R.al, list = [], M = 200;
    for (var i = 0; i < al.n; i++) { var x = al.px[i], z = al.pz[i]; if (x > o.x - M && x < o.x + TILE + M && z > o.z - TILE - M && z < o.z + M) list.push(i); }
    return list;
  }
  function locateIn(R, list, wx, wz) {
    var al = R.al, best = -1, bd = Infinity;
    for (var k = 0; k < list.length; k++) { var i = list[k], dx = wx - al.px[i], dz = wz - al.pz[i], d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } }
    if (best < 0 || bd > 190 * 190) return null;
    return project(al, best, wx, wz);
  }
  /* ¿Cae (x, lat) en la franja de la vía, una estación, un túnel o la trinchera de su boca, un
   * puente, un paso superior o un paso a nivel? m = margen además del balasto (árboles más,
   * hierba casi nada). */
  function blocked(R, L, m) {
    var x = L.x, o2 = R.off2(x), l = o2 - BALLAST - m, r = BALLAST + m, i, line = R.line;
    var zs = R.zones, ST3 = RC.ui3d.stations;
    for (i = 0; i < zs.length; i++) {
      var z = zs[i]; if (x < z.x0 - 15 || x > z.x1 + 15) continue;
      var c = ST3.corridor(z, o2), extra = m * 0.6 + (z.kind === 'shed' ? 30 : 0);
      if (c.l - extra < l) l = c.l - extra; if (c.r + extra > r) r = c.r + extra;
    }
    for (i = 0; i < R.runs.length; i++) {
      var u = R.runs[i];
      if (x > u.x0 - 10 && x < u.x1 + 10) { l = Math.min(l, o2 - 9 - m * 0.4); r = Math.max(r, 9 + m * 0.4); }
      var pd = Math.min(u.startPortal ? Math.abs(x - u.x0) : 1e9, u.endPortal ? Math.abs(x - u.x1) : 1e9);
      if (pd < 100) { var k = 1 - pd / 100; l = Math.min(l, o2 - 9 - 24 * k - m * 0.4); r = Math.max(r, 9 + 24 * k + m * 0.4); }
    }
    var br = line.bridges || [];
    for (i = 0; i < br.length; i++) if (x > br[i].from - 25 && x < br[i].to + 25) { l = Math.min(l, o2 - 16 - m * 0.4); r = Math.max(r, 16 + m * 0.4); }
    var lm = line.landmarks || [];   // pasos superiores (tablero de 34 m de ancho a 8 m de altura)
    for (i = 0; i < lm.length; i++) if (lm[i].kind === 'puente' && Math.abs(x - lm[i].x) < 5 + m * 0.5) { l = Math.min(l, -19 - m); r = Math.max(r, 15 + m); }
    var lc = line.crossings || [];   // pasos a nivel (calzada de 30 m)
    for (i = 0; i < lc.length; i++) if (Math.abs(x - lc[i].x) < 3.5 + m * 0.5) { l = Math.min(l, o2 / 2 - 15 - m); r = Math.max(r, o2 / 2 + 15 + m); }
    return L.lat > l && L.lat < r;
  }

  /* Cota exacta del terreno (mismos triángulos que la malla de la tesela). */
  function groundAt(R, x, z) {
    var line = R.line, E = x + line.origin.E, Nn = -z + line.origin.N;
    var t = R.tiles[Math.floor(E / TILE) + '_' + Math.floor(Nn / TILE)];
    if (!t || !t.mesh) return null;
    var n = t.n, P = t.mesh.geometry.attributes.position;
    if (!n || !t.res || !t.o || P.count !== n * n) return RC.ui3d.realworld.heightAt({ real: R }, x, z);
    var fc = clamp((x - t.o.x) / t.res, 0, n - 1.0001), fr = clamp(n - 1 - (t.o.z - z) / t.res, 0, n - 1.0001);
    var c0 = Math.floor(fc), r0 = Math.floor(fr), u = fc - c0, w = fr - r0, a = P.array, i = (r0 * n + c0) * 3 + 1;
    var ha = a[i], hd = a[i + 3], hb = a[i + n * 3], hc = a[i + n * 3 + 3];
    // PlaneGeometry: triángulos (a, b, d) y (b, c, d) con la diagonal b–d
    return u + w <= 1 ? ha + (hd - ha) * u + (hb - ha) * w : hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - w);
  }

  /* ---------- Análisis de la ortofoto de una tesela ---------- */
  var BUF = null;
  function buffers() {
    if (BUF) return BUF;
    var n2 = N * N;
    BUF = { lum: new Float32Array(n2), r: new Float32Array(n2), b: new Float32Array(n2), g: new Float32Array(n2), tree: new Float32Array(n2), green: new Float32Array(n2),
      bld: new Float32Array(n2), t1: new Float32Array(n2), lm: new Float32Array(n2), lr: new Float32Array(n2), lb: new Float32Array(n2),
      bc: new Float32Array(n2), dk: new Uint8Array(n2), roof: new Float32Array(n2), sat: new Float64Array((N + 1) * (N + 1)) };
    return BUF;
  }
  /* Media en una ventana (2r+1)² con imagen integral. */
  function boxMean(src, dst, r) {
    var S = BUF.sat, W1 = N + 1, x, y;
    for (x = 0; x < W1; x++) S[x] = 0;
    for (y = 0; y < N; y++) {
      var row = 0; S[(y + 1) * W1] = 0;
      for (x = 0; x < N; x++) { row += src[y * N + x]; S[(y + 1) * W1 + x + 1] = S[y * W1 + x + 1] + row; }
    }
    for (y = 0; y < N; y++) {
      var y0 = Math.max(0, y - r), y1 = Math.min(N, y + r + 1);
      for (x = 0; x < N; x++) {
        var x0 = Math.max(0, x - r), x1 = Math.min(N, x + r + 1);
        dst[y * N + x] = (S[y1 * W1 + x1] - S[y0 * W1 + x1] - S[y1 * W1 + x0] + S[y0 * W1 + x0]) / ((y1 - y0) * (x1 - x0));
      }
    }
  }

  /* Etapa 1: píxeles de la ortofoto (512², ≈2 m/px). */
  function readOrtho(V, R, J) {
    var B = buffers(), n2 = N * N, i;
    var cv = V.cv || (V.cv = document.createElement('canvas'));
    cv.width = cv.height = N;
    var g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(J.img, 0, 0, N, N);
    var px = J.px = g.getImageData(0, 0, N, N).data;
    for (i = 0; i < n2; i++) {
      var r = px[i * 4], gg = px[i * 4 + 1], b = px[i * 4 + 2];
      B.r[i] = r; B.g[i] = gg; B.b[i] = b; B.lum[i] = 0.299 * r + 0.587 * gg + 0.114 * b;
      // tejas: tono rojo (R-G mucho mayor que G-B); la tierra de labor es más amarilla
      B.roof[i] = clamp(((r - gg) - (gg - b) - 12) / 14, 0, 1);
    }
  }
  /* Etapa 2: huellas de los edificios del Catastro (con un píxel de margen). */
  function buildingMask(V, R, J) {
    var B = BUF, n2 = N * N, o = J.tile.o, i, g = V.cv.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#000'; g.fillRect(0, 0, N, N);
    var bt = R.bTiles && R.bTiles[J.tile.key], nb = 0;
    if (bt && bt.list) {
      g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineWidth = 1.2;
      var sx = N / TILE, oz = o.z - TILE;
      bt.list.forEach(function (bb) {
        var p = bb.p; if (!p || p.length < 3) return;
        g.beginPath(); g.moveTo((p[0][0] - o.x) * sx, (p[0][1] - oz) * sx);
        for (var k = 1; k < p.length; k++) g.lineTo((p[k][0] - o.x) * sx, (p[k][1] - oz) * sx);
        g.closePath(); g.fill(); g.stroke(); nb++;
      });
    }
    var bp = g.getImageData(0, 0, N, N).data;
    for (i = 0; i < n2; i++) B.bld[i] = bp[i * 4] > 100 ? 1 : 0;
    J.urbanTile = clamp(nb / 900, 0, 1);   // entorno urbano de la tesela (densidad de edificios)
  }

  /* Etapa 3: medias locales (brillo, rojo y azul del entorno; densidad de edificios). */
  function means(V, R, J) {
    var B = BUF;
    boxMean(B.lum, B.lm, 4); boxMean(B.r, B.lr, 4); boxMean(B.b, B.lb, 4); boxMean(B.bld, B.bc, 8);
  }
  /* Etapa 4: índices de copa (verde; mancha oscura sobre tierra cálida = olivar de secano) y mapa de suelo. */
  function indices(V, R, J) {
    var B = BUF, n2 = N * N, i;
    for (i = 0; i < n2; i++) {
      var R0 = B.r[i], G0 = B.g[i], B0 = B.b[i], lum = B.lum[i], exg = 2 * G0 - R0 - B0;
      var notCyan = clamp((G0 - B0 + 10) / 25, 0, 1), notRoof = 1 - B.roof[i];
      var green = clamp((exg - 2) / 25, 0, 1) * clamp((165 - lum) / 70, 0, 1) * notCyan;
      var dark = clamp(((B.lm[i] - lum) / Math.max(B.lm[i], 1) - 0.12) * 4, 0, 1);
      var warm = clamp((B.lr[i] - B.lb[i] - 18) / 25, 0, 1), notBlue = clamp((R0 - B0 + 5) / 20, 0, 1);
      var spot = dark * warm * notBlue * notRoof * 0.9 * (1 - Math.min(1, B.bc[i] * 2));
      B.tree[i] = B.bld[i] ? 0 : Math.max(green, spot);
      B.dk[i] = spot > green ? 1 : 0;                                  // copa detectada por su sombra (olivar)
      // prado: verde claro u oscuro no tan oscuro como una copa
      B.green[i] = B.bld[i] ? 0 : clamp((exg + 2) / 22, 0, 1) * clamp((215 - lum) / 40, 0, 1) * notCyan;
    }
    boxMean(B.tree, B.t1, 1);
    // Mapa de suelo para la hierba (256²): [verde, seco]; 0 en edificios, tejados, asfalto y agua
    var cover = J.cover = new Uint8Array(CN * CN * 2);
    for (var cy = 0; cy < CN; cy++) for (var cx = 0; cx < CN; cx++) {
      var gsum = 0, dsum = 0, blk = 0;
      for (var k2 = 0; k2 < 4; k2++) {
        var j = (cy * 2 + (k2 >> 1)) * N + cx * 2 + (k2 & 1), Rr = B.r[j], Bb = B.b[j], L2 = B.lum[j];
        if (B.bld[j] || B.roof[j] > 0.5 || Bb > Rr + 8 || L2 > 218) { blk++; continue; }
        if (Math.abs(Rr - Bb) < 14 && Math.abs(B.g[j] - Rr) < 14) { blk++; continue; }   // asfalto, hormigón
        gsum += B.green[j]; dsum += clamp((Rr - Bb - 20) / 30, 0, 1) * (1 - B.roof[j]);
      }
      if (blk >= 3) continue;
      cover[(cy * CN + cx) * 2] = Math.round(gsum / 4 * 255);
      cover[(cy * CN + cx) * 2 + 1] = Math.round(dsum / 4 * 255);
    }
  }

  /* Plantación: comprobaciones comunes de árboles y matas de una tesela. */
  function plant(V, R, J, id, i, xr, zr, size, margin) {
    var S = V.sp[id]; if (!S) return false;
    var o = J.tile.o, res = TILE / N, rnd = J.rnd;
    var wx = o.x + ((i % N) + 0.5 + xr) * res, wz = o.z - TILE + (Math.floor(i / N) + 0.5 + zr) * res;
    var def = S.def, h = def.alto[0] + (def.alto[1] - def.alto[0]) * clamp(size * 0.7 + rnd() * 0.45, 0, 1);
    var sh = h / S.base, sw = sh * (0.85 + rnd() * 0.3), crown = S.d.w * sw * 0.32, rad = Math.max(1.6, crown * 0.75);
    // separación mínima entre troncos (rejilla de 3 m)
    var gx = Math.floor(wx / 3), gz = Math.floor(wz / 3), a, b, k;
    for (a = -2; a <= 2; a++) for (b = -2; b <= 2; b++) {
      var c = J.occ[(gx + a) + ',' + (gz + b)]; if (!c) continue;
      for (k = 0; k < c.length; k += 3) { var dx = c[k] - wx, dz = c[k + 1] - wz, rr = Math.min(rad, c[k + 2]); if (dx * dx + dz * dz < rr * rr) return false; }
    }
    if (J.list.length) { var L = locateIn(R, J.list, wx, wz); if (L && blocked(R, L, margin + crown)) return false; }
    var y = groundAt(R, wx, wz); if (y === null || y === undefined || !isFinite(y)) return false;
    // leve tinte por instancia con el color de la ortofoto en el pie del árbol
    var px = J.px, v = 0.9 + rnd() * 0.2;
    var tr = clamp(v * (1 + 0.28 * (px[i * 4] / 255 / 0.33 - 1)), 0.8, 1.2), tg = clamp(v * (1 + 0.28 * (px[i * 4 + 1] / 255 / 0.36 - 1)), 0.8, 1.2), tb = clamp(v * (1 + 0.28 * (px[i * 4 + 2] / 255 / 0.27 - 1)), 0.8, 1.2);
    var arr = J.out[id] || (J.out[id] = []);
    arr.push(wx, y - 0.12 - h * 0.02, wz, sw, sh, rnd() * Math.PI * 2, tr, tg, tb);   // algo enterrado: nunca flota
    var ck = gx + ',' + gz; (J.occ[ck] || (J.occ[ck] = [])).push(wx, wz, rad);
    return true;
  }

  /* Etapa 5: árboles en los máximos locales del índice de copa. */
  function plantTrees(V, R, J) {
    var B = BUF, peaks = [], i, x, y, rnd = J.rnd;
    for (y = 1; y < N - 1; y++) for (x = 1; x < N - 1; x++) {
      i = y * N + x; var v = B.t1[i];
      if (v < 0.2 || B.bld[i]) continue;
      if (v < B.t1[i - 1] || v < B.t1[i + 1] || v < B.t1[i - N] || v < B.t1[i + N] || v < B.t1[i - N - 1] || v < B.t1[i - N + 1] || v < B.t1[i + N - 1] || v < B.t1[i + N + 1]) continue;
      peaks.push(i);
    }
    peaks.sort(function (a, b) { return B.t1[b] - B.t1[a]; });
    for (var p = 0; p < peaks.length && J.nTrees < MAX_TREES; p++) {
      i = peaks[p];
      // tamaño de la copa: píxeles de árbol en 5×5
      var cnt5 = 0, px = i % N, py = (i / N) | 0;
      for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) { var q = (py + dy) * N + px + dx; if (q >= 0 && q < N * N && B.tree[q] > 0.3) cnt5++; }
      var size = clamp((cnt5 - 2) / 16, 0, 1);
      // entorno: edificios cerca (ciudad), sombra sobre tierra (olivar), verde (ribera, parque) o débil (monte)
      var urban = Math.max(B.bc[i] * 2.2, J.urbanTile * 0.5), ctx;
      if (urban > 0.3) ctx = 'ciudad';
      else if (B.dk[i]) ctx = B.t1[i] > 0.3 ? 'olivar' : 'monte';
      else ctx = B.t1[i] > 0.32 ? 'ribera' : 'monte';
      if (plant(V, R, J, pick(MIX[ctx], rnd()), i, (rnd() - 0.5) * 0.8, (rnd() - 0.5) * 0.8, size, 6)) J.nTrees++;
    }
  }

  /* Etapa 6: matas al azar en lindes, prados y monte (sólo se ven cerca) y orden para el nivel de detalle. */
  function plantShrubs(V, R, J) {
    var B = BUF, rnd = J.rnd, i;
    for (var s = 0; s < 9000 && J.nSh < MAX_SHRUBS; s++) {
      i = (rnd() * N * N) | 0;
      if (B.bld[i]) continue;
      var tv = B.t1[i], gv = B.green[i], pr = Math.max(tv > 0.06 && tv < 0.22 ? tv * 2.2 : 0, gv * 0.35);
      if (rnd() > pr) continue;
      if (plant(V, R, J, pick(MIX.matas, rnd()), i, rnd() - 0.5, rnd() - 0.5, rnd() * 0.6, 3)) J.nSh++;
    }
    // primero los más grandes (con algo de azar): el nivel de detalle lejano toma un prefijo
    var key = J.tile.key, T = { key: key, ti: +key.split('_')[0], tj: +key.split('_')[1], sp: {}, n: {}, cover: J.cover };
    for (var id in J.out) {
      var a = J.out[id], n = a.length / ST, ord = [], k, c;
      for (k = 0; k < n; k++) ord.push([k, a[k * ST + 4] * (0.55 + rnd() * 0.45)]);
      ord.sort(function (u, w) { return w[1] - u[1]; });
      var f = new Float32Array(n * ST);
      for (k = 0; k < n; k++) for (c = 0; c < ST; c++) f[k * ST + c] = a[ord[k][0] * ST + c];
      T.sp[id] = f; T.n[id] = n;
    }
    V.tiles[key] = T;
    V.dirty = true;
    // la hierba de esta tesela se siembra ahora que hay mapa de suelo (y se rehacen las celdas
    // vecinas que asomaban a ella cuando aún no lo tenía)
    var o = J.tile.o;
    for (var ck in V.cells) {
      var p = ck.split(','), cx = (+p[0] + 0.5) * GCELL, cz = (+p[1] + 0.5) * GCELL;
      if (cx > o.x - GCELL && cx < o.x + TILE + GCELL && cz > o.z - TILE - GCELL && cz < o.z + GCELL) delete V.cells[ck];
    }
    V.grassAt = null;
  }

  var STEPS = [readOrtho, buildingMask, means, indices, plantTrees, plantShrubs];
  /* Avanza el trabajo de la tesela en curso; true al terminar. */
  function runJob(V, R, J) {
    var t0 = performance.now();
    if (!J.step) { J.rnd = RC.core.util.rng(hash('veg' + J.tile.key)); J.list = tileTrack(R, J.tile.o); J.out = {}; J.occ = {}; J.nTrees = 0; J.nSh = 0; J.ms = 0; }
    STEPS[J.step++](V, R, J);
    J.ms += performance.now() - t0;
    if (J.step < STEPS.length) return false;
    V.stat[J.tile.key] = { arboles: J.nTrees, matas: J.nSh, ms: Math.round(J.ms) };
    return true;
  }

  /* ---------- Reparto por anillos de teselas (nivel de detalle) ---------- */
  function ringOf(V, T) { return Math.max(Math.abs(T.ti - V.center[0]), Math.abs(T.tj - V.center[1])); }
  function rebuild(V) {
    if (!V.center) return;
    for (var id in V.sp) {
      var S = V.sp[id], tipo = S.def.tipo; if (tipo === 'hierba') continue;
      var nearN = 0, farN = 0, k, T, ring;
      for (k in V.tiles) {
        T = V.tiles[k]; if (!T.n[id]) continue;
        ring = ringOf(V, T);
        if (ring <= 1) nearN += T.n[id];
        else if (tipo === 'arbol' && ring < LOD_FAR.length) farN += Math.floor(T.n[id] * LOD_FAR[ring]);
      }
      var mn = ensureMesh(V, S, 'near', nearN, true), mf = ensureMesh(V, S, 'far', farN, false), an = 0, af = 0;
      for (k in V.tiles) {
        T = V.tiles[k]; if (!T.n[id]) continue;
        ring = ringOf(V, T);
        if (ring <= 1) { writeInst(mn, an, T.sp[id], 0, T.n[id], ST); an += T.n[id]; }
        else if (tipo === 'arbol' && ring < LOD_FAR.length) { var take = Math.floor(T.n[id] * LOD_FAR[ring]); writeInst(mf, af, T.sp[id], 0, take, ST); af += take; }
      }
      flush(mn, an); flush(mf, af);
    }
  }

  /* ---------- Hierba y matas bajas cerca de la cámara ---------- */
  function coverAt(V, R, x, z) {
    var line = R.line, E = x + line.origin.E, Nn = -z + line.origin.N, key = Math.floor(E / TILE) + '_' + Math.floor(Nn / TILE);
    var T = V.tiles[key]; if (!T) return null;
    var cx = Math.floor((E - T.ti * TILE) / TILE * CN), cy = Math.floor((TILE - (Nn - T.tj * TILE)) / TILE * CN);
    if (cx < 0 || cy < 0 || cx >= CN || cy >= CN) return null;
    var q = (cy * CN + cx) * 2;
    return { g: T.cover[q] / 255, d: T.cover[q + 1] / 255, key: key };
  }
  /* Siembra de una celda de 8 m: cuneta de la vía (densa, a manchas), prados y tierra seca (más rala). */
  var GS = 10;   // paso de las listas de hierba: id + 9 valores
  function grassCell(V, R, ix, iz, hint, c0) {
    var al = R.al, cx = (ix + 0.5) * GCELL, cz = (iz + 0.5) * GCELL, cell = { list: [], tile: c0.key };
    var nI = nearestIdx(al, cx, cz, hint, 120), L0 = project(al, nI.i, cx, cz), o20 = R.off2(L0.x);
    var out0 = Math.max(L0.lat - BALLAST, o20 - BALLAST - L0.lat), nearTrack = nI.d2 < 70 * 70 && out0 < 22;
    // intentos por celda según la densidad máxima posible (matas por m²: cuneta 2,4; prado 1,4; secano 0,45)
    var rnd = RC.core.util.rng(hash('h' + ix + ',' + iz)), tries = nearTrack ? 150 : c0.g > 0.15 ? 60 : 24, per = GCELL * GCELL / tries;
    for (var k = 0; k < tries; k++) {
      var x = ix * GCELL + rnd() * GCELL, z = iz * GCELL + rnd() * GCELL, r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd();
      var L = nearTrack ? project(al, nearestIdx(al, x, z, nI.i, 8).i, x, z) : project(al, nI.i, x, z);
      if (blocked(R, L, 0.35)) continue;
      var o2 = R.off2(L.x), out = L.lat > 0 ? L.lat - BALLAST : o2 - BALLAST - L.lat;   // distancia al borde del balasto
      var c = coverAt(V, R, x, z); if (!c) continue;
      var patch = smooth(0.3, 0.7, 0.65 * vnoise(x / 6, z / 6) + 0.35 * vnoise(x / 21 + 31.7, z / 21 + 7.3));
      var verge = nearTrack ? clamp(1 - (out - 0.3) / 13, 0, 1) * (out < 1.2 ? 0.4 : 1) : 0;   // junto al balasto, grava
      var dens = Math.max(verge * (0.12 + 0.88 * patch) * 2.4, c.g * (0.1 + 0.9 * patch) * 1.4, c.d * patch * 0.45);
      if (r1 > dens * per) continue;
      var id;
      if (r2 < 0.03 && out > 2.5) id = r3 < 0.4 ? 'retama' : r3 < 0.75 ? 'matorral' : 'arbusto';
      else if (r2 < 0.11) id = r3 < 0.55 ? 'ortiga' : 'mala_hierba';
      else { var wet = c.g * 1.1 + (verge > 0 ? 0.2 : 0); id = r3 < wet * 0.75 ? (r4 < 0.35 ? 'hierba_alta' : 'hierba') : 'hierba_seca'; }
      var S = V.sp[id]; if (!S) continue;
      var y;
      if (out < 1.9) y = W3().frame(al, L.x).y - 0.9;                           // plataforma de la vía
      else { y = groundAt(R, x, z); if (y === null || y === undefined) continue; }
      var def = S.def, h = def.alto[0] + (def.alto[1] - def.alto[0]) * (0.35 + 0.65 * patch) * (0.7 + 0.3 * rnd()), sh = h / S.base, sw = sh * (0.8 + rnd() * 0.4);
      var dry = id === 'hierba_seca' ? 0.78 + rnd() * 0.14 : 1, v = 0.86 + rnd() * 0.24;   // la paja, algo apagada
      cell.list.push(id, x, y - 0.04, z, sw, sh, rnd() * Math.PI * 2, v * dry * (1 + 0.06 * (r4 - 0.5)), v, v * (0.92 + 0.12 * r4));
    }
    return cell;
  }
  function updateGrass(V, R, camIdx) {
    var cam = V.cam, keep = {}, n = {}, id, k, changed = false, t0 = performance.now();
    var i0 = Math.floor((cam.x - GRAD) / GCELL), i1 = Math.floor((cam.x + GRAD) / GCELL);
    var j0 = Math.floor((cam.z - GRAD) / GCELL), j1 = Math.floor((cam.z + GRAD) / GCELL);
    for (var ix = i0; ix <= i1; ix++) for (var iz = j0; iz <= j1; iz++) {
      var dx = (ix + 0.5) * GCELL - cam.x, dz = (iz + 0.5) * GCELL - cam.z;
      if (dx * dx + dz * dz > GRAD * GRAD) continue;
      k = ix + ',' + iz; keep[k] = 1;
      if (V.cells[k]) continue;
      var c0 = coverAt(V, R, (ix + 0.5) * GCELL, (iz + 0.5) * GCELL);
      if (!c0) continue;                                              // tesela aún sin analizar
      if (performance.now() - t0 > 6) { V.grassAt = null; continue; } // el resto, en el siguiente fotograma
      V.cells[k] = grassCell(V, R, ix, iz, camIdx, c0); changed = true;
    }
    for (k in V.cells) if (!keep[k]) { delete V.cells[k]; changed = true; }
    if (!changed) return;
    for (id in V.sp) n[id] = 0;
    for (k in V.cells) { var l = V.cells[k].list; for (var q = 0; q < l.length; q += GS) n[l[q]]++; }
    var at = {};
    V.grassIds.forEach(function (gid) { ensureMesh(V, V.sp[gid], 'grass', n[gid], false); at[gid] = 0; });
    for (k in V.cells) {
      var l2 = V.cells[k].list;
      for (var q2 = 0; q2 < l2.length; q2 += GS) { var m = V.sp[l2[q2]].grass; if (m) writeInst(m, at[l2[q2]]++, l2, q2 + 1, 1, GS); }
    }
    V.grassIds.forEach(function (gid) { flush(V.sp[gid].grass, at[gid]); });
  }

  /* ---------- Enganches con realworld3d.js ---------- */
  /* Ortofoto de la tesela cargada: se analiza por etapas en update. */
  function tileReady(R, tile, img) {
    var V = init(R); if (!V.ok) return;
    V.queue.push({ tile: tile, img: img, step: 0 });
  }
  /* Tesela descargada: fuera sus árboles, su mapa de suelo y su hierba. */
  function disposeTile(R, tile) {
    var V = R.veg; if (!V) return;
    V.queue = V.queue.filter(function (q) { return q.tile !== tile; });
    if (V.job && V.job.tile === tile) V.job = null;
    if (V.tiles[tile.key]) { delete V.tiles[tile.key]; delete V.stat[tile.key]; V.dirty = true; }
    for (var ck in V.cells) if (V.cells[ck].tile === tile.key) { delete V.cells[ck]; V.grassAt = null; }
  }
  /* Cada fotograma: teselas pendientes, anillos de detalle, hierba cerca de la cámara, viento y noche.
   * La vegetación es sólo decorado: un fallo aquí se anota una vez y nunca para el juego. */
  function update(W, sim, night) {
    try { step(W, sim, night); }
    catch (e) {
      var V = W.real && W.real.veg; if (V) V.job = null;   // la tesela que falló no se reintenta
      if (!update.failed) { update.failed = true; console.error('RAILCORE vegetación:', e); }
    }
  }
  function step(W, sim, night) {
    var R = W.real; if (!R) return;
    var V = init(R); if (!V.ok) return;
    if (!V.hooked && W.scene) {   // posición real de la cámara (cabina o vistas exteriores), sin tocar scene3d
      V.hooked = true;
      var prev = W.scene.onBeforeRender;
      W.scene.onBeforeRender = function (renderer, scene, camera, target) {
        if (!target && camera && camera.isPerspectiveCamera) { V.cam.setFromMatrixPosition(camera.matrixWorld); V.camOk = true; }
        return prev.apply(this, arguments);
      };
    }
    var al = R.al, F = W3().frame(al, sim.train.x), now = performance.now();
    if (!V.camOk) V.cam.set(F.x, F.y + 3, F.z);
    // Teselas pendientes: primero la más cercana al tren; una etapa por fotograma o más mientras
    // quepan en ~8 ms (o en la cuarta parte del fotograma si el equipo va lento: no se eterniza)
    var budget = clamp((now - (V.lastNow || now)) * 0.25, 8, 120);
    V.lastNow = now;
    while ((V.job || V.queue.length) && performance.now() - now < budget) {
      if (!V.job) {
        V.queue.sort(function (a, b) {
          var da = Math.abs(a.tile.o.x + TILE / 2 - F.x) + Math.abs(a.tile.o.z - TILE / 2 - F.z), db = Math.abs(b.tile.o.x + TILE / 2 - F.x) + Math.abs(b.tile.o.z - TILE / 2 - F.z);
          return da - db;
        });
        V.job = V.queue.shift();
        if (!V.job.tile.mesh) { V.job = null; continue; }
      }
      if (runJob(V, R, V.job)) V.job = null;
    }
    // Anillos de detalle alrededor de la tesela del tren (se rehacen al cambiar de tesela o al
    // terminar teselas; mientras llegan muchas, como mucho dos veces por segundo)
    var E = F.x + R.line.origin.E, Nn = -F.z + R.line.origin.N, c = [Math.floor(E / TILE), Math.floor(Nn / TILE)];
    if (!V.center || V.center[0] !== c[0] || V.center[1] !== c[1]) { V.center = c; V.dirty = true; V.rebuiltAt = 0; }
    if (V.dirty && (!V.job && !V.queue.length || now - V.rebuiltAt > 500)) { V.dirty = false; V.rebuiltAt = now; rebuild(V); }
    // Hierba: se resiembra al moverse la cámara unos metros
    var cam = V.cam;
    if (!V.grassAt || Math.abs(cam.x - V.grassAt.x) + Math.abs(cam.z - V.grassAt.z) > GSTEP) {
      // punto del trazado más cercano a la cámara, buscado alrededor del tren (la cámara nunca anda lejos)
      var hint = clamp(Math.round((sim.train.x - W3().X0) / W3().STEP), 0, al.n - 1);
      V.camIdx = nearestIdx(al, cam.x, cam.z, hint, 400).i;
      V.grassAt = cam.clone();
      updateGrass(V, R, V.camIdx);
    }
    // Viento y noche
    var t = (now - V.t0) / 1000, dim = 1 - 0.35 * (night || 0);
    for (var id in V.sp) { var S = V.sp[id]; S.U.vegWind.value.x = t; S.mat.color.setScalar(dim); }
  }

  RC.ui3d = RC.ui3d || {};
  RC.ui3d.vegetation = { tileReady: tileReady, disposeTile: disposeTile, update: update, SP: SP };
})(globalThis.RC);
