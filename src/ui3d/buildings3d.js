/* RAILCORE — Edificios del Catastro con fachadas fotográficas (sólo presentación).
 * Cada pared se reparte en módulos de unos 3 m: puertas, portales y ventanas en la planta baja,
 * ventanas y balconeras en las de arriba, zócalo, cornisa y remate. Los módulos salen de un atlas
 * horneado de un modelo CC0 de Poly Haven (ver assets/fachadas/CREDITS.md); el enlucido y las
 * molduras se tiñen con colores de Sevilla (blanco y albero, crema, ocre, almagra…). Algunos bloques
 * son de ladrillo visto y las naves grandes llevan paredes lisas. Hay persianas bajadas a distintas
 * alturas y, de noche, se encienden algunas ventanas.
 * Los tejados toman su color de la ortofoto PNOA y le suman un detalle de teja, baldosa o chapa. */
(function (RC) {
  var FH = 3.1;   // altura de planta con la que se generaron los datos (h = plantas × 3,1 + 0,8)

  // Parejas de color (enlucido, molduras) en sRGB, con su peso
  var PAIRS = [
    [[0.96, 0.95, 0.92], [0.93, 0.74, 0.40], 5],   // blanco y albero
    [[0.96, 0.95, 0.92], [0.97, 0.96, 0.94], 4],   // todo blanco
    [[0.95, 0.94, 0.91], [0.62, 0.60, 0.57], 2],   // blanco y piedra gris
    [[0.95, 0.89, 0.76], [0.97, 0.96, 0.94], 3],   // crema y blanco
    [[0.92, 0.76, 0.43], [0.97, 0.96, 0.94], 2],   // albero y blanco
    [[0.84, 0.60, 0.37], [0.96, 0.94, 0.90], 1],   // ocre y blanco
    [[0.93, 0.77, 0.67], [0.97, 0.96, 0.94], 1],   // salmón y blanco
    [[0.97, 0.96, 0.93], [0.60, 0.30, 0.22], 2]    // blanco y almagra
  ];
  var INDUSTRIAL = [[0.86, 0.86, 0.84], [0.66, 0.66, 0.64]];
  var BLINDS = [[0.86, 0.82, 0.72], [0.36, 0.44, 0.34], [0.46, 0.34, 0.25], [0.92, 0.92, 0.90], [0.62, 0.62, 0.60], [0.70, 0.56, 0.36]];

  function lin(c, k) { k = k || 1; return new THREE.Color().setRGB(c[0] * k, c[1] * k, c[2] * k, THREE.SRGBColorSpace); }

  var shared = null;
  function loadTex(src, srgb, repeat) {
    var t = new THREE.Texture(), img = new Image();
    img.onload = function () { t.image = img; t.needsUpdate = true; };
    img.src = src;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  function textures() {
    if (shared) return shared;
    var I = RC.data.facades && RC.data.facades.img; if (!I) return null;
    shared = {
      alb: loadTex(I['fachadas-albedo'], true), nrm: loadTex(I['fachadas-normal'], false), msk: loadTex(I['fachadas-mascaras'], false),
      brk: loadTex(I.ladrillo_diff, true, true), brkN: loadTex(I.ladrillo_nor, false, true),
      roofD: loadTex(I['tejados-detalle'], false, true), white: new THREE.DataTexture(new Uint8Array([200, 190, 180, 255]), 1, 1)
    };
    shared.white.needsUpdate = true;
    return shared;
  }

  /* ---------- Shader de fachada ---------- */
  var F_PARS = [
    'uniform sampler2D fAlb, fNrm, fMsk, fBrk, fBrkN;',
    'uniform float uNight;',
    'uniform vec3 uWall[9], uTrim[9], uBlind[6];',
    'varying vec2 vFU; flat varying vec4 vFac;',
    'float fRough; vec3 fEmis; vec3 fN;',
    'float rh(float a, float b) {',
    '  uvec2 q = uvec2(uint(int(a) + 65536), uint(int(b) + 65536)) * uvec2(1597334673u, 3812015801u);',
    '  uint n = (q.x ^ q.y) * 1597334673u; return float(n >> 8u) / 16777216.0; }',
    'vec2 cellUV(float t, vec2 lu) { float c = mod(t, 7.0), r = floor(t / 7.0 + 0.001); return (vec2(c, r) * 272.0 + 8.0 + lu * 256.0) / 2048.0; }',
    'mat3 fTBN(vec3 eye, vec3 N, vec2 uv) {',
    '  vec3 q0 = dFdx(eye), q1 = dFdy(eye); vec2 st0 = dFdx(uv), st1 = dFdy(uv);',
    '  vec3 q1p = cross(q1, N), q0p = cross(N, q0);',
    '  vec3 T = q1p * st0.x + q0p * st1.x, B = q1p * st0.y + q0p * st1.y;',
    '  float det = max(dot(T, T), dot(B, B)); float sc = det == 0.0 ? 0.0 : inversesqrt(det);',
    '  return mat3(T * sc, B * sc, N); }'
  ].join('\n');

  var F_MAP = [
    'float seed = floor(mod(vFac.x + 0.5, 1024.0)), style = floor((vFac.x + 0.5) / 1024.0), floors = vFac.y, pal = vFac.z, bayW = vFac.w;',
    'float u = vFU.x, y = vFU.y;',
    'vec2 dXu = vec2(dFdx(u), dFdx(y)), dYu = vec2(dFdy(u), dFdy(y));',
    'float top = floors * ' + FH.toFixed(2) + ', bay = floor(u), fl = floor(y / ' + FH.toFixed(2) + ');',
    'float tile = 40.0, vs = 1.0 / ' + FH.toFixed(2) + ', tileY = -1.0; vec2 lu = vec2(fract(u), 0.0);',
    'bool ind = style > 0.5 && style < 1.5;',
    'if (y < 0.0) { tile = 42.0; lu.y = fract(y / 0.75); vs = 1.0 / 0.75; fl = -1.0; }',
    'else if (y >= top) { tile = 41.0; lu.y = clamp((y - top) / 0.8, 0.0, 1.0); vs = 1.0 / 0.8; fl = floors; }',
    'else {',
    '  float yl = y - fl * ' + FH.toFixed(2) + '; lu.y = yl / ' + FH.toFixed(2) + '; tileY = lu.y * 3.0;',
    '  if (fl < 0.5) {',
    '    float r = rh(seed * 8.0 + 1.0, bay);',
    '    if (ind) tile = r < 0.82 ? 0.0 : 1.0;',
    '    else if (r < 0.16) tile = 0.0;',
    '    else if (r < 0.42) tile = 1.0 + floor(rh(seed * 8.0 + 2.0, bay) * 7.0);',
    '    else tile = 8.0 + floor(rh(seed * 8.0 + 3.0, bay) * 5.0);',
    '    if (floors > 1.5 && yl > 2.9) { tile = 43.0; lu.y = (yl - 2.9) / 0.2; vs = 5.0; tileY = -1.0; }',
    '  } else {',
    '    float fam = floor(rh(seed, 11.0) * 3.0);',
    '    if (fl > floors - 1.5 && floors > 2.5 && rh(seed, 12.0) < 0.35) fam = 2.0;',
    '    float tA = floor(rh(seed, 13.0) * 5.0);',
    '    float tB = rh(seed, 14.0) < 0.45 ? tA : floor(rh(seed, 15.0) * 9.0);',
    '    if (tA > 2.5) tB = 7.0 - tA;',   // ventanas descentradas: en parejas simétricas
    '    tile = 13.0 + fam * 9.0 + (mod(bay, 2.0) < 0.5 ? tA : tB);',
    '    if (rh(seed * 8.0 + 4.0, bay) < 0.07) tile = 40.0;',
    '    if (ind) tile = rh(seed * 8.0 + 5.0, bay + fl * 97.0) < 0.78 ? 40.0 : 31.0 + floor(rh(seed, 16.0) * 3.0);',
    '  }',
    '  if (bayW < 1.6) tile = fl < 0.5 ? 0.0 : 40.0;',
    '}',
    'vec2 auv = cellUV(tile, clamp(lu, vec2(0.002), vec2(0.998)));',
    'vec2 gx = vec2(dXu.x, dXu.y * vs) * 0.125, gy = vec2(dYu.x, dYu.y * vs) * 0.125;',
    'vec3 alb = textureGrad(fAlb, auv, gx, gy).rgb;',
    'vec3 msk = textureGrad(fMsk, auv, gx, gy).rgb;',
    'vec3 nrm = textureGrad(fNrm, auv, gx, gy).xyz * 2.0 - 1.0;',
    'int pi = int(pal + 0.5); int wi = pi - (pi / 16) * 16, ti = pi / 16;',
    'vec3 col = alb * mix(vec3(1.0), uWall[wi], msk.r) * mix(vec3(1.0), uTrim[ti], msk.b);',
    'if (style > 1.5) {',   // ladrillo visto en el enlucido
    '  vec2 bu = vec2(u * bayW, y) * 0.5;',
    '  vec3 bc = texture(fBrk, bu).rgb * clamp(alb.g * 1.25, 0.0, 1.15);',
    '  col = mix(col, bc, msk.r);',
    '  nrm = mix(nrm, texture(fBrkN, bu).xyz * 2.0 - 1.0, msk.r);',
    '}',
    // Persianas: bajadas desde arriba hasta una altura distinta en cada ventana
    'float wk = bay * 64.0 + fl;',
    'float drop = rh(seed * 8.0 + 6.0, wk); drop = drop * drop * 1.8;',
    'float blind = msk.g * step(2.32 - drop, tileY) * step(tileY, 2.34);',
    'float slat = fract(tileY * 22.0), aa = clamp(1.0 - fwidth(tileY * 22.0) * 1.5, 0.0, 1.0);',
    'vec3 bcol = uBlind[int(rh(seed, 17.0) * 5.99)] * (1.0 - aa * 0.25 * smoothstep(0.55, 0.95, slat));',
    'col = mix(col, bcol, blind);',
    'col *= mix(0.72, 1.0, smoothstep(-0.3, 0.9, y));',   // suciedad y contacto con la acera
    'diffuseColor.rgb = col;',
    'float objm = clamp(1.0 - msk.r - msk.g - msk.b, 0.0, 1.0);',
    'fRough = mix(mix(0.92, 0.55, objm), 0.07, msk.g * (1.0 - blind));',
    // Ventanas encendidas de noche (cálidas; alguna con luz fría de pantalla)
    'float lit = step(0.62, rh(seed * 8.0 + 7.0, wk)) * step(0.0, fl) * step(fl, floors - 0.5);',
    'vec3 warm = rh(seed * 8.0 + 8.0, wk) < 0.82 ? vec3(1.0, 0.66, 0.34) : vec3(0.70, 0.82, 1.0);',
    'fEmis = msk.g * lit * uNight * warm * mix(1.7, 0.5, blind);',
    'fN = nrm;'
  ].join('\n');

  var F_NORMAL = [
    'mat3 ftbn = fTBN(-vViewPosition, normal, vec2(vFU.x * vFac.w, vFU.y));',
    '#if defined( DOUBLE_SIDED )',
    '  ftbn[0] *= faceDirection; ftbn[1] *= faceDirection;',
    '#endif',
    'normal = normalize(ftbn * fN);'
  ].join('\n');

  function facadeMaterial() {
    var T = textures(); if (!T) return null;
    var m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
    var walls = PAIRS.map(function (p) { return lin(p[0], 0.92); }).concat([lin(INDUSTRIAL[0], 0.92)]);   // un poco por debajo del blanco puro: al sol no se quema
    var trims = PAIRS.map(function (p) { return lin(p[1]); }).concat([lin(INDUSTRIAL[1])]);
    var U = m.userData.uniforms = {
      fAlb: { value: T.alb }, fNrm: { value: T.nrm }, fMsk: { value: T.msk }, fBrk: { value: T.brk }, fBrkN: { value: T.brkN },
      uNight: { value: 0 }, uWall: { value: walls }, uTrim: { value: trims }, uBlind: { value: BLINDS.map(lin) }
    };
    m.onBeforeCompile = function (sh) {
      for (var k in U) sh.uniforms[k] = U[k];
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 fuv; attribute vec4 fac; varying vec2 vFU; flat varying vec4 vFac;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFU = fuv; vFac = fac;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + F_PARS)
        .replace('#include <map_fragment>', F_MAP)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = fRough;')
        .replace('#include <normal_fragment_maps>', F_NORMAL)
        .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance = fEmis;');
    };
    m.customProgramCacheKey = function () { return 'rc-fachadas-1'; };
    return m;
  }

  /* ---------- Tejados: color de la ortofoto + detalle ---------- */
  var R_PARS = [
    'uniform sampler2D rOrt, rDet; uniform vec2 rO; uniform float rGlow;',
    'varying vec3 vRW; flat varying float vKind;',
    'float rDetail(float k, float sz, vec2 wm, vec2 dx, vec2 dy) {',
    '  vec2 q = wm / sz, duv = vec2(1.0 / (3.0 * sz), 1.0 / sz);',
    '  return textureGrad(rDet, vec2((k + fract(q.x)) / 3.0, q.y), dx * duv, dy * duv).r; }'
  ].join('\n');
  var R_MAP = [
    'vec2 ou = vec2((vRW.x - rO.x) / 1000.0, (rO.y - vRW.z) / 1000.0);',
    'vec3 oc = texture(rOrt, ou).rgb;',
    'vec2 wm = vRW.xz, dx = dFdx(wm), dy = dFdy(wm);',
    'float red = clamp((oc.r - oc.g) * 6.0 - 0.25, 0.0, 1.0) * (1.0 - vKind);',
    'float dT = rDetail(0.0, 2.5, wm, dx, dy), dF = rDetail(1.0, 2.08, wm, dx, dy), dM = rDetail(2.0, 2.0, wm, dx, dy);',
    'float det = (vKind > 0.5 ? dM : mix(dF, dT, red)) * 2.0;',
    'vec3 rc = oc * mix(1.0, det, 0.75);',
    'diffuseColor.rgb = rc;',
    'vec3 rEmis = rc * rGlow;'
  ].join('\n');

  function roofMaterial(origin) {
    var T = textures(); if (!T) return null;
    var m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0, side: THREE.DoubleSide });
    var U = m.userData.uniforms = { rOrt: { value: T.white }, rDet: { value: T.roofD }, rO: { value: new THREE.Vector2(origin.x, origin.z) }, rGlow: { value: 0.3 } };
    m.onBeforeCompile = function (sh) {
      for (var k in U) sh.uniforms[k] = U[k];
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float rkind; varying vec3 vRW; flat varying float vKind;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRW = position; vKind = rkind;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + R_PARS)
        .replace('#include <map_fragment>', R_MAP)
        .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance = rEmis;');
    };
    m.customProgramCacheKey = function () { return 'rc-tejados-1'; };
    return m;
  }

  /* ---------- Geometría ---------- */
  function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function pickPair(r) {
    var tot = 0, i; for (i = 0; i < PAIRS.length; i++) tot += PAIRS[i][2];
    var x = r * tot; for (i = 0; i < PAIRS.length; i++) { x -= PAIRS[i][2]; if (x < 0) return i; }
    return 0;
  }

  /* list: edificios {p: anillo local (x,z), z, h, o}. skip(b) → true para no dibujarlo.
   * Devuelve { walls, roofs } (mallas) o null. */
  function build(R, key, list, skip, origin) {
    var mat = R.facadeMat || (R.facadeMat = facadeMaterial());
    if (!mat) return null;
    var wp = [], wn = [], wu = [], wf = [], wi = [], wb = 0;
    var rp = [], rk = [], ri = [], rb = 0;
    var rnd = RC.core.util.rng(hashStr(key));
    list.forEach(function (b) {
      var ring = b.p; if (ring.length < 3 || skip(b)) return;
      var pts = ring.map(function (p) { return new THREE.Vector2(p[0], p[1]); });
      if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
      var tri; try { tri = THREE.ShapeUtils.triangulateShape(pts, []); } catch (e) { return; }
      var n = pts.length, area = Math.abs(THREE.ShapeUtils.area(pts));
      var roofY = b.o ? Math.max(b.z + b.h, 8.5) : b.z + b.h, bot = b.z - 1.5;
      var floors = Math.max(1, Math.round((b.h - 0.8) / FH));
      var ind = !b.o && area > 1200 && floors <= 2;
      var r0 = rnd(), seed = Math.floor(rnd() * 1024);
      var style = ind ? 1 : (floors >= 3 && r0 < 0.2 ? 2 : 0);
      var pair = ind ? 8 : pickPair(rnd());
      var pal = ind ? 8 + 16 * 8 : pair + 16 * pair;
      // tejado
      for (var i = 0; i < n; i++) { rp.push(pts[i].x, roofY, pts[i].y); rk.push(ind ? 1 : 0); }
      tri.forEach(function (t) { ri.push(rb + t[0], rb + t[2], rb + t[1]); });
      rb += n;
      if (b.o) return;   // los que cubren la vía son sólo techo (como una marquesina)
      // fachadas: u en módulos (de izquierda a derecha mirando desde fuera), y en metros sobre la acera
      var U0 = 0;
      for (i = 0; i < n; i++) {
        var a = pts[i], d = pts[(i + 1) % n], dx = d.x - a.x, dz = d.y - a.y, L = Math.hypot(dx, dz);
        if (L < 0.05) continue;
        var nb = Math.max(1, Math.round(L / 3.0)), bw = L / nb;
        var nx = dz / L, nz = -dx / L;   // normal hacia fuera (polígono en sentido antihorario)
        wp.push(a.x, bot, a.y, d.x, bot, d.y, d.x, roofY, d.y, a.x, roofY, a.y);
        for (var k = 0; k < 4; k++) { wn.push(nx, 0, nz); wf.push(style * 1024 + seed, floors, pal, bw); }
        var yb = bot - b.z, yt = roofY - b.z;
        wu.push(U0 + nb, yb, U0, yb, U0, yt, U0 + nb, yt);
        wi.push(wb, wb + 2, wb + 1, wb, wb + 3, wb + 2);   // cara delantera hacia fuera
        wb += 4; U0 += nb;
      }
    });
    var out = {};
    if (wp.length) {
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(wn, 3));
      g.setAttribute('fuv', new THREE.Float32BufferAttribute(wu, 2));
      g.setAttribute('fac', new THREE.Float32BufferAttribute(wf, 4));
      g.setIndex(wi);
      out.walls = new THREE.Mesh(g, mat);
      out.walls.castShadow = out.walls.receiveShadow = true;
    }
    if (rp.length) {
      var gr = new THREE.BufferGeometry();
      gr.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
      gr.setAttribute('rkind', new THREE.Float32BufferAttribute(rk, 1));
      gr.setIndex(ri);
      gr.computeVertexNormals();
      var rm = roofMaterial(origin);
      out.roofs = new THREE.Mesh(gr, rm);
      out.roofs.castShadow = out.roofs.receiveShadow = true;
    }
    return out.walls || out.roofs ? out : null;
  }

  function setOrtho(mesh, tex) {
    if (mesh && mesh.material.userData.uniforms && tex) mesh.material.userData.uniforms.rOrt.value = tex;
  }
  function update(R, night, glow) {
    if (R.facadeMat) R.facadeMat.userData.uniforms.uNight.value = night;
    for (var k in R.bTiles) { var bt = R.bTiles[k]; if (bt.roofs) bt.roofs.material.userData.uniforms.rGlow.value = glow; }
  }

  RC.ui3d = RC.ui3d || {};
  RC.ui3d.buildings = { build: build, setOrtho: setOrtho, update: update, FH: FH };
})(globalThis.RC);
