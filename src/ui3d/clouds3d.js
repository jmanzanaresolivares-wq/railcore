/* RAILCORE — Capa de nubes (sólo presentación).
 * Un plano de cumulitos a unos 1.600 m que deriva con el viento, iluminado según la hora (blancas
 * a mediodía, doradas al atardecer, casi invisibles de noche). Cuando una nube tapa el sol, la luz
 * directa baja durante un rato, como en un día real de otoño en Sevilla. La misma función de ruido
 * se evalúa en JavaScript (con aritmética de 32 bits) para saber si el sol está tapado. */
(function (RC) {
  var H = 1600, SCALE = 2600, WX = 0.0021, WZ = 0.0007;

  var FRAG = [
    'uniform vec3 uSun, uCol, uShade; uniform float uTime, uCover;',
    'varying vec3 vW;',
    'float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
    'float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }',
    'float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; } return s; }',
    'void main() {',
    '  vec3 d = normalize(vW - cameraPosition);',
    '  if (d.y < 0.012) discard;',
    '  float t = ' + H.toFixed(1) + ' / d.y;',
    '  vec2 p = (cameraPosition.xz + d.xz * t) / ' + SCALE.toFixed(1) + ' + vec2(uTime * ' + WX + ', uTime * ' + WZ + ');',
    '  float n = fbm(p);',
    '  float c = smoothstep(1.0 - uCover, 1.0 - uCover + 0.26, n);',
    '  float n2 = fbm(p + normalize(uSun.xz + 1e-4) * 0.05);',
    '  float lit = clamp(0.6 + (n - n2) * 2.4, 0.2, 1.0);',
    '  float edge = 1.0 - smoothstep(0.0, 0.5, c);',            // bordes más finos: más luz
    '  vec3 col = mix(uShade, uCol, clamp(lit + edge * 0.25, 0.0, 1.0));',
    '  float fade = 1.0 - smoothstep(8000.0, 28000.0, t);',
    '  gl_FragColor = vec4(col, c * fade * 0.94);',
    '  #include <tonemapping_fragment>',
    '  #include <colorspace_fragment>',
    '}'
  ].join('\n');

  function create(scene) {
    var mat = new THREE.ShaderMaterial({
      uniforms: { uSun: { value: new THREE.Vector3(0, 1, 0) }, uCol: { value: new THREE.Color(1, 1, 1) }, uShade: { value: new THREE.Color(0.6, 0.6, 0.6) },
        uTime: { value: 0 }, uCover: { value: 0.48 } },
      vertexShader: 'varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: FRAG, side: THREE.BackSide, transparent: true, depthWrite: false, fog: false
    });
    var mesh = new THREE.Mesh(new THREE.SphereGeometry(10000, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    mesh.renderOrder = -1; mesh.frustumCulled = false;
    scene.add(mesh);
    return { mesh: mesh, mat: mat };
  }

  // Misma función de ruido en JavaScript con aritmética de 32 bits (como la GPU)
  var f = Math.fround;
  function fract(x) { return f(x - Math.floor(x)); }
  function hash(px, py) {
    var x = fract(f(px * f(123.34))), y = fract(f(py * f(456.21)));
    var dd = f(f(x * f(x + f(45.32))) + f(y * f(y + f(45.32))));
    x = f(x + dd); y = f(y + dd);
    return fract(f(x * y));
  }
  function noise(px, py) {
    var ix = Math.floor(px), iy = Math.floor(py), fx = f(px - ix), fy = f(py - iy);
    var ux = f(fx * fx * (3 - 2 * fx)), uy = f(fy * fy * (3 - 2 * fy));
    var a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    return f((a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy);
  }
  function fbm(px, py) {
    var a = 0.5, s = 0;
    for (var i = 0; i < 5; i++) { s += a * noise(px, py); px = f(px * f(2.03) + f(17.1)); py = f(py * f(2.03) + f(9.2)); a *= 0.5; }
    return s;
  }
  function smooth(e0, e1, x) { var t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }
  /* Cobertura de nubes (0…1) en la dirección dir vista desde cam. */
  function coverAt(C, cam, dir, time) {
    if (dir.y < 0.012) return 0;
    var t = H / dir.y, px = f(f(cam.x + dir.x * t) / SCALE + time * WX), py = f(f(cam.z + dir.z * t) / SCALE + time * WZ);
    var cov = C.mat.uniforms.uCover.value;
    return smooth(1 - cov, 1 - cov + 0.26, fbm(px, py));
  }

  /* Devuelve el factor de luz directa (1 sol despejado … ~0,3 tapado). */
  function update(C, cam, sunDir, time, day, dusk) {
    var U = C.mat.uniforms;
    C.mesh.position.set(cam.x, 0, cam.z);
    U.uSun.value.copy(sunDir); U.uTime.value = time;
    // lado iluminado y lado en sombra según la hora (lineal, antes del tono)
    var lr = 1.65 * day, lg = (1.65 - 0.55 * dusk) * day, lb = (1.7 - 0.9 * dusk) * day;
    U.uCol.value.setRGB(0.05 + lr, 0.055 + lg, 0.07 + lb);
    U.uShade.value.setRGB(0.03 + 0.62 * day, 0.035 + 0.64 * day - 0.12 * dusk * day, 0.045 + 0.72 * day - 0.18 * dusk * day);
    var cov = coverAt(C, cam, sunDir, time);
    return 1 - 0.72 * cov;
  }

  RC.ui3d = RC.ui3d || {};
  RC.ui3d.clouds = { create: create, update: update, coverAt: coverAt };
})(globalThis.RC);
