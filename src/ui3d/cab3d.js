/* RAILCORE — Cabina 3D de la unidad (modelo ORIGINAL inspirado en la disposición de
 * un puesto de conducción de Cercanías moderno; no reproduce planos ni marcas reales).
 * Coordenadas locales: origen en el carril bajo la testera, X derecha, Y arriba,
 * −Z hacia delante. Cada mando es un objeto 3D que envía órdenes al núcleo y se mueve
 * según el estado REAL del sistema. La geometría fija se agrupa por material.
 *
 * Paneles: pupitre (mandos), frente de instrumentos (manómetros, velocímetro, ASFA,
 * TCMS, pilotos), consola de megafonía y destino (izquierda), radio tren-tierra
 * (derecha), panel de techo (alumbrado, luneta, climatización) y armario de servicios. */
(function (RC) {
  var TR = RC.core.train, D = RC.ui3d.displays, K = RC.ui3d.cabkit, U = RC.core.util;
  var EYE = new THREE.Vector3(0, 2.92, 1.85);

  // Dimensiones (m)
  var FLOOR = 1.55, HW = 1.40, BACK = 2.95, CEIL_S = 3.44, CEIL_C = 3.62;
  var WS_B = new THREE.Vector3(0, 2.58, -0.02), WS_T = new THREE.Vector3(0, 3.40, 0.44), WS_W = 2.62;
  var WS_LEN = WS_B.distanceTo(WS_T);
  var WIPER_SWEEP = 1.92;   // rad

  // Colores (de vértice, se multiplican por la textura)
  var COL = {
    desk: 0x3a3f46, deskDark: 0x24282d, black: 0x15171a, rubber: 0x101112, wall: 0xd3d6d8, wallLow: 0xb9bdc1,
    door: 0xaeb2b6, cabinet: 0x9aa0a6, alu: 0xc8ccd0, chrome: 0xe4e7ea, steel: 0x8d9298, red: 0xc0221b, teal: 0x0f6e6a, saffron: 0xf2a900
  };

  function vec(x, y, z) { return new THREE.Vector3(x, y, z); }

  /* ======================= Construcción ======================= */
  function build(rig) {
    var cab = new THREE.Group(); cab.name = 'cabina'; rig.add(cab);
    var C = { group: cab, controls: [], pickables: [], displays: {}, screens: [], dials: [], plates: [], panels: {}, lamps: [] };
    var B = new K.Batch(cab);
    var M = C.M = materials();
    C.batch = B;

    shell(C, B, M);
    desk(C, B, M);
    seat(B);
    panelsAndControls(C, B, M);
    windscreenParts(C, B, M);

    var meshes = B.flush(M.bucket, { glass: { cast: false, receive: false }, lamp: { cast: false, receive: false } });
    if (meshes.glass) meshes.glass.renderOrder = 2;
    for (var bk in meshes) meshes[bk].userData.sombra = bk === 'glass' || bk === 'lamp' ? '' : 'pr';
    // Las superficies grandes también tapan al ratón (un mando detrás de una pared no se puede pulsar)
    ['plastic', 'paint', 'metal'].forEach(function (k) { if (meshes[k]) C.pickables.push(meshes[k]); });
    C.plates.forEach(function (m) { C.pickables.push(m.mesh); });

    // Luces: plafón de techo y luz de lectura del pupitre (no se añaden más luces a la escena)
    C.cabLight = new THREE.PointLight(0xffe9c8, 0, 5.5, 1.6); C.cabLight.position.set(0, CEIL_C - 0.12, 1.7); cab.add(C.cabLight);
    C.deskLight = new THREE.PointLight(0xffd9a0, 0, 1.9, 2); C.deskLight.position.set(0.55, 2.95, 0.95); cab.add(C.deskLight);
    markShadows(C);
    CABS.push(C);
    return C;
  }

  /* ---------- Sombras ----------
   * Las sombras del sol las activa la escena (scene3d). La cabina sólo marca sus mallas con
   * userData.sombra: 'p' proyecta, 'r' recibe, 'pr' ambas; sin marca, ninguna. Proyectan las piezas
   * opacas (carrocería, techo, pupitre, asiento, manipulador, seta, escobillas, microteléfono), así el
   * sol sólo entra por el parabrisas y las ventanillas; reciben las superficies grandes y las placas de
   * rótulos. Las piezas emisivas (pantallas, esferas, plafones, pilotos) y las transparentes (cristales,
   * gotas, vaho, cortinilla) ni proyectan ni reciben. */
  var CABS = [];
  function markShadows(C) {
    C.group.traverse(function (o) {
      if (!o.isMesh) return;
      var sm = o.userData.sombra || '';
      o.castShadow = sm.indexOf('p') >= 0; o.receiveShadow = sm.indexOf('r') >= 0;
    });
  }

  function materials() {
    var bucket = {
      plastic: K.pbr('plastico', 0.3, { vertexColors: true, normalScale: 0.55, envMapIntensity: 0.45 }),
      paint: K.pbr('pintura', 1.25, { vertexColors: true, normalScale: 0.6, envMapIntensity: 0.5 }),
      ceiling: K.pbr('techo', 1.5, { color: 0xeceeef, envMapIntensity: 0.45 }),
      floor: K.pbr('suelo', 0.9, { color: 0x5d6268, normalScale: 0.9, envMapIntensity: 0.35 }),
      metal: K.mat(0xffffff, 1.0, 0.85, { vertexColors: true, roughnessMap: K.tex('pintura_rough', [1.5, 1.5]), envMapIntensity: 0.9 }),
      fabric: K.pbr('tejido', 0.28, { color: 0xd8e6e5, normalScale: 0.8, envMapIntensity: 0.3 }),
      glass: new THREE.MeshStandardMaterial({ color: 0xa9bcc6, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.1, depthWrite: false, envMapIntensity: 1.2 }),
      lamp: new THREE.MeshStandardMaterial({ color: 0xf4f2ec, roughness: 0.5, emissive: 0xfff1d8, emissiveIntensity: 0 })
    };
    return {
      bucket: bucket,
      frosted: new THREE.MeshStandardMaterial({ color: 0xdfe6e9, roughness: 0.55, metalness: 0, emissive: 0xfff3dc, emissiveIntensity: 0, envMapIntensity: 0.8 }),
      blind: new THREE.MeshStandardMaterial({ color: 0x1c2228, roughness: 0.7, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false }),
      knob: K.mat(0x1b1d20, 0.45, 0.1, { vertexColors: true }),
      rubber: K.mat(0x0e0f10, 0.95, 0),
      chrome: K.mat(0xd5d9dd, 0.25, 0.95)
    };
  }

  /* ---------- Carrocería interior ---------- */
  function rrPath(cx, cy, w, h, r) {
    var p = new THREE.Path(), x = cx - w / 2, y = cy - h / 2;
    p.moveTo(x + r, y); p.lineTo(x + w - r, y); p.quadraticCurveTo(x + w, y, x + w, y + r);
    p.lineTo(x + w, y + h - r); p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    p.lineTo(x + r, y + h); p.quadraticCurveTo(x, y + h, x, y + h - r);
    p.lineTo(x, y + r); p.quadraticCurveTo(x, y, x + r, y);
    return p;
  }
  /* Pared lateral (plano YZ) con hueco de ventana; u = −z. */
  function sideWall(B, side) {
    var s = new THREE.Shape();
    s.moveTo(0.02, FLOOR - 0.05); s.lineTo(-(BACK + 0.03), FLOOR - 0.05); s.lineTo(-(BACK + 0.03), CEIL_S + 0.03);
    s.lineTo(-0.47, CEIL_S + 0.03); s.lineTo(-WS_T.z - 0.02, WS_T.y); s.lineTo(-WS_B.z, WS_B.y);
    s.holes.push(rrPath(-0.87, 2.85, 0.80, 0.74, 0.07));
    var g = K.slab(s, 0.05); g.rotateY(Math.PI / 2); g.translate(side < 0 ? -HW - 0.05 : HW, 0, 0);
    B.add('paint', g, null, COL.wall);
  }
  function shell(C, B, M) {
    // Suelo de caucho y zócalos
    B.add('floor', K.box(2.80, 0.06, 3.02), K.matrix(0, FLOOR - 0.03, 1.47));
    [-1, 1].forEach(function (s) {
      B.add('plastic', K.box(0.02, 0.09, 2.92), K.matrix(s * (HW - 0.01), FLOOR + 0.045, 1.50), COL.rubber);
      sideWall(B, s);
      // Ventana lateral: marco de goma, cristal, travesaño y pestillo
      B.add('plastic', K.frame(0.86, 0.80, 0.055, 0.035, 0.08), K.matrix(s * (HW - 0.002), 2.85, 0.87, 0, -s * Math.PI / 2, 0), COL.black);
      B.add('glass', new THREE.PlaneGeometry(0.80, 0.74), K.matrix(s * (HW + 0.024), 2.85, 0.87, 0, -s * Math.PI / 2, 0));
      B.add('metal', K.rbox(0.03, 0.03, 0.78, 0.01), K.matrix(s * (HW - 0.02), 2.86, 0.87), COL.alu);
      B.add('metal', K.rbox(0.04, 0.07, 0.05, 0.012), K.matrix(s * (HW - 0.03), 2.90, 0.52), COL.chrome);
      // Zona baja de la pared (revestimiento más oscuro) y pasamanos
      B.add('paint', K.box(0.012, 0.62, 2.40), K.matrix(s * (HW - 0.006), FLOOR + 0.40, 1.70), COL.wallLow);
      B.add('metal', new THREE.CylinderGeometry(0.014, 0.014, 0.42, 12), K.matrix(s * (HW - 0.06), 2.70, 1.55 + 0.9 * (s > 0 ? 1 : 0), Math.PI / 2, 0, 0), COL.chrome);
      [-1, 1].forEach(function (e) {
        B.add('metal', new THREE.CylinderGeometry(0.01, 0.01, 0.05, 8), K.matrix(s * (HW - 0.035), 2.70, 1.55 + 0.9 * (s > 0 ? 1 : 0) + e * 0.19, 0, 0, Math.PI / 2), COL.chrome);
      });
    });
    // Techo abovedado (arco de circunferencia entre las paredes)
    var sag = CEIL_C - CEIL_S, R = (HW * HW + sag * sag) / (2 * sag), cy = CEIL_C - R, ph = Math.asin((HW + 0.05) / R);
    var arc = new THREE.Shape(), N = 24, k;
    for (k = 0; k <= N; k++) { var a = -ph + 2 * ph * k / N; var px = Math.sin(a) * (R + 0.04), py = cy + Math.cos(a) * (R + 0.04); if (k) arc.lineTo(px, py); else arc.moveTo(px, py); }
    for (k = N; k >= 0; k--) { var b = -ph + 2 * ph * k / N; arc.lineTo(Math.sin(b) * R, cy + Math.cos(b) * R); }
    var ceil = K.slab(arc, BACK - 0.40); ceil.translate(0, 0, 0.40);
    B.add('ceiling', ceil);
    C.ceilAt = function (x) { return cy + Math.sqrt(R * R - x * x); };
    // Plafones de luz, rejillas de climatización y altavoz
    [1.18, 2.30].forEach(function (z) {
      B.add('lamp', K.box(0.66, 0.02, 0.24), K.matrix(0, C.ceilAt(0) - 0.012, z));
      B.add('metal', K.frame(0.72, 0.30, 0.03, 0.02, 0.02), K.matrix(0, C.ceilAt(0) - 0.012, z, Math.PI / 2, 0, 0), COL.alu);
    });
    [-0.62, 0.62].forEach(function (x) {
      for (var i = 0; i < 6; i++) B.add('plastic', K.box(0.30, 0.012, 0.012), K.matrix(x, C.ceilAt(x) - 0.008, 1.55 + i * 0.03), COL.black);
      B.add('plastic', K.frame(0.36, 0.22, 0.02, 0.012, 0.02), K.matrix(x, C.ceilAt(x) - 0.01, 1.625, Math.PI / 2, 0, 0), COL.deskDark);
    });
    B.add('plastic', new THREE.CylinderGeometry(0.07, 0.07, 0.012, 24), K.matrix(0, C.ceilAt(0) - 0.006, 2.75), COL.deskDark);
    // Cabecero sobre el parabrisas
    B.add('plastic', K.box(2.80, 0.26, 0.10), K.matrix(0, 3.53, 0.45), COL.deskDark);

    // Pared trasera con el hueco de la puerta al salón
    var bw = new THREE.Shape();
    bw.moveTo(-HW - 0.05, FLOOR - 0.05); bw.lineTo(HW + 0.05, FLOOR - 0.05); bw.lineTo(HW + 0.05, CEIL_C + 0.06); bw.lineTo(-HW - 0.05, CEIL_C + 0.06);
    bw.holes.push(rrPath(0.65, FLOOR + 0.975, 0.80, 1.99, 0.02));
    var bwg = K.slab(bw, 0.05); bwg.translate(0, 0, BACK);
    B.add('paint', bwg, null, COL.wall);
    // Marco y hoja de la puerta (con ventanilla esmerilada), manilla, cerradura y chapa de protección
    B.add('metal', K.frame(0.86, 2.03, 0.04, 0.03, 0.01), K.matrix(0.65, FLOOR + 0.985, BACK - 0.02), COL.alu);
    var leaf = new THREE.Shape();
    leaf.moveTo(-0.39, -0.965); leaf.lineTo(0.39, -0.965); leaf.lineTo(0.39, 0.965); leaf.lineTo(-0.39, 0.965);
    leaf.holes.push(rrPath(0, 0.45, 0.34, 0.44, 0.03));
    B.add('paint', K.slab(leaf, 0.035), K.matrix(0.65, FLOOR + 0.975, BACK + 0.008), COL.door);
    B.add('plastic', K.frame(0.40, 0.50, 0.035, 0.015, 0.04), K.matrix(0.65, FLOOR + 1.425, BACK + 0.0), COL.black);
    C.doorGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.44).rotateY(Math.PI), M.frosted);   // mira hacia la cabina
    C.doorGlass.position.set(0.65, FLOOR + 1.425, BACK + 0.025); C.doorGlass.userData.sombra = 'r'; cab(C).add(C.doorGlass);
    B.add('metal', K.box(0.74, 0.20, 0.006), K.matrix(0.65, FLOOR + 0.12, BACK + 0.005), COL.alu);
    B.add('metal', K.rbox(0.05, 0.16, 0.03, 0.012), K.matrix(0.33, FLOOR + 1.0, BACK - 0.012), COL.chrome);
    B.add('metal', K.rbox(0.15, 0.028, 0.028, 0.012), K.matrix(0.39, FLOOR + 1.03, BACK - 0.045), COL.chrome);
    B.add('metal', new THREE.CylinderGeometry(0.018, 0.018, 0.02, 16), K.matrix(0.33, FLOOR + 0.90, BACK - 0.01, Math.PI / 2, 0, 0), COL.chrome);
    // Extintor con su soporte, gancho para la ropa y portadocumentos
    B.add('plastic', new THREE.CylinderGeometry(0.075, 0.075, 0.44, 20), K.matrix(-1.08, FLOOR + 0.42, BACK - 0.09), COL.red);
    B.add('plastic', new THREE.SphereGeometry(0.075, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), K.matrix(-1.08, FLOOR + 0.64, BACK - 0.09), COL.red);
    B.add('plastic', K.rbox(0.05, 0.08, 0.05, 0.01), K.matrix(-1.08, FLOOR + 0.74, BACK - 0.09), COL.black);
    B.add('plastic', new THREE.CylinderGeometry(0.012, 0.012, 0.36, 8), K.matrix(-1.0, FLOOR + 0.55, BACK - 0.03, 0, 0, 0.25), COL.black);
    B.add('metal', K.box(0.20, 0.04, 0.10), K.matrix(-1.08, FLOOR + 0.25, BACK - 0.06), COL.steel);
    B.add('metal', K.box(0.17, 0.03, 0.03), K.matrix(-1.08, FLOOR + 0.55, BACK - 0.035), COL.steel);
    B.add('metal', K.rbox(0.03, 0.10, 0.06, 0.01), K.matrix(1.25, 2.95, BACK - 0.03), COL.chrome);
    B.add('plastic', K.rbox(0.30, 0.36, 0.05, 0.01), K.matrix(-0.55, 2.65, BACK - 0.025), COL.deskDark);
  }
  function cab(C) { return C.group; }

  /* ---------- Pupitre envolvente ---------- */
  var DESK = {
    // Perfil lateral (z, y) del pupitre central
    profile: [['M', 0.02, FLOOR], ['L', 0.02, 2.53], ['L', 0.28, 2.618], ['Q', 0.375, 2.64, 0.37, 2.59], ['L', 0.345, 2.592],
      ['L', 0.48, 2.302], ['L', 0.52, 2.305], ['L', 1.20, 2.285], ['Q', 1.31, 2.282, 1.30, 2.225], ['L', 1.245, 2.17],
      ['L', 1.02, 2.15], ['L', 0.95, 2.08], ['L', 0.91, FLOOR + 0.12], ['L', 0.95, FLOOR]],
    wing: [['M', 0.02, FLOOR], ['L', 0.02, 2.40], ['L', 0.40, 2.425], ['L', 1.02, 2.37], ['Q', 1.10, 2.37, 1.10, 2.30], ['L', 1.08, FLOOR]],
    x: 0.95, bevel: 0.01
  };
  function desk(C, B, M) {
    B.add('plastic', K.profileX(DESK.profile, -DESK.x, DESK.x, DESK.bevel, 8), null, COL.desk);
    B.add('plastic', K.profileX(DESK.wing, -HW + 0.02, -DESK.x - 0.02, DESK.bevel, 6), null, COL.desk);
    B.add('plastic', K.profileX(DESK.wing, DESK.x + 0.02, HW - 0.02, DESK.bevel, 6), null, COL.desk);
    // Banda de confort del borde (más oscura) y reposapiés
    B.add('plastic', K.rbox(1.86, 0.05, 0.06, 0.02), K.matrix(0, 2.255, 1.285), COL.deskDark);
    B.add('metal', new THREE.CylinderGeometry(0.016, 0.016, 0.56, 12), K.matrix(0, FLOOR + 0.17, 1.30, 0, 0, Math.PI / 2), COL.steel);
    [-0.26, 0.26].forEach(function (x) { B.add('metal', K.box(0.03, 0.17, 0.03), K.matrix(x, FLOOR + 0.085, 1.30), COL.steel); });
    // Base del pedal de hombre muerto
    B.add('metal', K.rbox(0.34, 0.02, 0.30, 0.008), K.matrix(-0.06, FLOOR + 0.01, 1.16), COL.steel);
  }

  /* ---------- Asiento del maquinista ---------- */
  function seat(B) {
    var z = 2.20;
    B.add('metal', new THREE.CylinderGeometry(0.17, 0.2, 0.03, 24), K.matrix(0, FLOOR + 0.015, z), COL.steel);
    B.add('metal', new THREE.CylinderGeometry(0.05, 0.06, 0.32, 16), K.matrix(0, FLOOR + 0.19, z), COL.chrome);
    B.add('plastic', K.rbox(0.44, 0.06, 0.42, 0.02), K.matrix(0, FLOOR + 0.37, z - 0.02), COL.black);
    B.add('fabric', K.rbox(0.50, 0.12, 0.48, 0.05, 3), K.matrix(0, FLOOR + 0.46, z - 0.03));
    B.add('fabric', K.rbox(0.48, 0.64, 0.11, 0.05, 3), K.matrix(0, FLOOR + 0.84, z + 0.24, 0.13, 0, 0));
    B.add('plastic', K.rbox(0.50, 0.66, 0.04, 0.02), K.matrix(0, FLOOR + 0.84, z + 0.31, 0.13, 0, 0), COL.deskDark);
    B.add('fabric', K.rbox(0.30, 0.17, 0.09, 0.05, 3), K.matrix(0, FLOOR + 1.27, z + 0.30, 0.13, 0, 0));
    [-1, 1].forEach(function (s) {
      B.add('metal', new THREE.CylinderGeometry(0.009, 0.009, 0.12, 8), K.matrix(s * 0.08, FLOOR + 1.16, z + 0.29, 0.13, 0, 0), COL.chrome);
      B.add('plastic', K.rbox(0.06, 0.05, 0.32, 0.02), K.matrix(s * 0.29, FLOOR + 0.68, z - 0.02), COL.deskDark);
      B.add('metal', K.box(0.03, 0.22, 0.03), K.matrix(s * 0.29, FLOOR + 0.55, z + 0.10), COL.steel);
    });
    B.add('metal', K.rbox(0.12, 0.02, 0.025, 0.008), K.matrix(0.29, FLOOR + 0.36, z - 0.22), COL.chrome);
  }

  /* ======================= Mandos ======================= */
  function register(C, ctrl, meshes) {
    C.controls.push(ctrl);
    meshes.forEach(function (m) { m.userData.ctl = ctrl; C.pickables.push(m); });
    return ctrl;
  }
  function capMaterial(color) { return K.mat(color, 0.35, 0.05, { emissive: color, emissiveIntensity: 0 }); }

  /* Pulsador redondo o cuadrado con aro fijo, capuchón que se hunde y, si procede, luz. */
  function pushButton(C, B, P, fp, o) {
    var r = o.r || 0.02, g = new THREE.Group(); g.position.set(o.u, o.v, 0); P.add(g);
    var ring = o.square ? K.frame(2 * r + 0.012, 2 * r + 0.012, 0.007, 0.008, 0.005) : new THREE.TorusGeometry(r + 0.004, 0.004, 8, 24);
    B.add(o.square ? 'plastic' : 'metal', ring, K.matrix(o.u, o.v, o.square ? 0 : 0.004), o.square ? COL.black : COL.chrome, P);
    var mat = capMaterial(o.color);
    var capG = o.square ? K.rbox(2 * r, 2 * r, 0.016, 0.004) : new THREE.CylinderGeometry(r, r * 1.02, 0.016, 24);
    if (!o.square) capG.rotateX(Math.PI / 2);
    var cap = new THREE.Mesh(capG, mat); cap.position.z = 0.012; g.add(cap);
    if (o.label) fp.text(o.u + (o.lu || 0), o.v + (o.lv !== undefined ? o.lv : -r - 0.016), o.label, o.ls || 0.0115, { maxW: o.lw || 0.11 });
    // pressFrames: el capuchón se ve hundido al menos 2 fotogramas aunque el equipo vaya a pocos FPS
    var ctrl = { id: o.id, kind: 'button', name: o.name, group: g, cap: cap, pressedUntil: 0, pressFrames: 0,
      status: o.status || function () { return ''; },
      press: function (sim, send) { ctrl.pressedUntil = performance.now() + 170; ctrl.pressFrames = 2; o.onPress(sim, send); },
      release: o.onRelease ? function (sim, send) { o.onRelease(sim, send); } : null,
      update: function (sim, now, pw) {
        var down = now < ctrl.pressedUntil || ctrl.pressFrames > 0 || (o.held && o.held(sim));
        if (ctrl.pressFrames > 0) ctrl.pressFrames--;
        cap.position.z = down ? 0.004 : 0.012;
        var lit = o.lit ? o.lit(sim, now) : 0;
        mat.emissiveIntensity = lit ? (o.litK || 1.7) : 0;
      } };
    return register(C, ctrl, [cap]);
  }

  /* Interruptor de palanca con base fija y luz opcional (o.scale lo agranda entero). */
  function toggle(C, B, P, fp, o) {
    var sc = o.scale || 1;
    var g = new THREE.Group(); g.position.set(o.u, o.v, 0); g.scale.setScalar(sc); P.add(g);
    B.add('metal', K.rbox(0.042, 0.062, 0.01, 0.004), K.matrix(o.u, o.v, 0.005 * sc, 0, 0, 0, sc), COL.chrome, P);
    var pivot = new THREE.Group(); pivot.position.z = 0.01; g.add(pivot);
    var geo = K.merge([
      { geo: new THREE.CylinderGeometry(0.0045, 0.006, 0.045, 10).translate(0, 0.0225, 0), color: new THREE.Color(COL.chrome) },
      { geo: new THREE.CylinderGeometry(0.0085, 0.0075, 0.016, 12).translate(0, 0.05, 0), color: new THREE.Color(o.color || 0x1a1a1a) }
    ], true);
    var stick = new THREE.Mesh(geo, M_KNOB); pivot.add(stick);
    pivot.rotation.x = Math.PI / 2;
    if (o.label) fp.text(o.u, o.v - (o.lv || 0.052), o.label, o.ls || 0.0105, { maxW: o.lw || 0.085 });
    fp.text(o.u, o.v + (o.iv || 0.040), o.onText || 'I', o.is || 0.009, { color: '#9fe6b8' });
    var lm = null;
    if (o.lamp) {
      lm = capMaterial(o.lamp);
      var lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.006, 14).rotateX(Math.PI / 2), lm); lamp.position.set(0.03, 0.02, 0.006); g.add(lamp);
      B.add('metal', new THREE.TorusGeometry(0.0075, 0.0018, 6, 16), K.matrix(o.u + 0.03 * sc, o.v + 0.02 * sc, 0.006 * sc, 0, 0, 0, sc), COL.chrome, P);
    }
    var ctrl = { id: o.id, kind: 'toggle', name: o.name, group: g, status: o.status,
      press: function (sim, send) { o.onPress(sim, send); },
      update: function (sim) {
        var target = Math.PI / 2 + (o.state(sim) ? -0.55 : 0.55);
        pivot.rotation.x += (target - pivot.rotation.x) * 0.35;
        if (lm) lm.emissiveIntensity = o.lampOn && o.lampOn(sim) ? 1.9 : 0;
      } };
    return register(C, ctrl, [stick]);
  }
  var M_KNOB = null;

  /* Selector giratorio (o de llave) con las posiciones serigrafiadas en la placa. */
  function rotary(C, B, P, fp, o) {
    var g = new THREE.Group(); g.position.set(o.u, o.v, 0); P.add(g);
    var rk = o.rk || 0.024;
    B.add('plastic', new THREE.CylinderGeometry(rk + 0.012, rk + 0.014, 0.006, 32).rotateX(Math.PI / 2), K.matrix(o.u, o.v, 0.003), COL.black, P);
    var knobG = new THREE.Group(); knobG.position.z = 0.006; g.add(knobG);
    var parts = [
      { geo: new THREE.CylinderGeometry(rk, rk * 1.12, 0.026, 24).rotateX(Math.PI / 2).translate(0, 0, 0.013), color: new THREE.Color(o.color || 0x1d1f22) },
      { geo: K.box(0.006, rk * 1.7, 0.008).translate(0, rk * 0.15, 0.028), color: new THREE.Color(o.key ? COL.chrome : 0xf2f2f2) }
    ];
    if (o.key) parts.push({ geo: K.rbox(0.034, 0.03, 0.006, 0.006).translate(0, rk + 0.012, 0.03), color: new THREE.Color(COL.chrome) });
    var knob = new THREE.Mesh(K.merge(parts, true), M_KNOB); knobG.add(knob);
    o.positions.forEach(function (p) {
      var R = rk + 0.022;
      fp.text(o.u + Math.sin(-p.angle) * R, o.v + Math.cos(p.angle) * R, p.text, o.ps || 0.0095, { color: p.color || '#dfe3e6' });
    });
    if (o.label) fp.text(o.u, o.v - rk - 0.03, o.label, o.ls || 0.011, { maxW: 0.12 });
    var ctrl = { id: o.id, kind: 'rotary', name: o.name, group: g, status: o.status,
      press: function (sim, send, dir) { o.onStep(sim, send, dir || 1); },
      wheel: function (sim, send, dir) { o.onStep(sim, send, dir); },
      update: function (sim) {
        var a = o.angle ? o.angle(sim) : (o.positions[o.index(sim)] || { angle: 0 }).angle;
        knobG.rotation.z += (a - knobG.rotation.z) * 0.35;
      } };
    return register(C, ctrl, [knob]);
  }

  /* Pantalla con marco. kind: 'lcd' (se ilumina sola) o 'dial' (esfera retroiluminada). */
  function screen(C, B, P, key, o) {
    var d = D.make(o.cw, o.ch);
    var mesh;
    if (o.round) {
      B.add('metal', new THREE.TorusGeometry(o.r + 0.006, 0.009, 10, 48), K.matrix(o.u, o.v, 0.006), COL.chrome, P);
      B.add('plastic', new THREE.CylinderGeometry(o.r + 0.016, o.r + 0.018, 0.012, 48).rotateX(Math.PI / 2), K.matrix(o.u, o.v, 0.002), COL.black, P);
      var dm = new THREE.MeshStandardMaterial({ map: d.tex, emissive: 0xffffff, emissiveMap: d.tex, emissiveIntensity: 0, roughness: 0.35, metalness: 0, envMapIntensity: 0.6 });
      mesh = new THREE.Mesh(new THREE.CircleGeometry(o.r, 48), dm);
      mesh.position.set(o.u, o.v, 0.009);
      C.dials.push(dm);
    } else {
      B.add('plastic', K.rbox(o.w + 0.026, o.h + 0.026, 0.018, 0.008), K.matrix(o.u, o.v, 0.003), COL.black, P);
      var sm = new THREE.MeshBasicMaterial({ map: d.tex, toneMapped: false });
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.h), sm);
      mesh.position.set(o.u, o.v, 0.0125);
      C.screens.push(sm);
    }
    P.add(mesh);
    C.displays[key] = d;
    return mesh;
  }

  /* Placa de rótulos del panel (se crea al final, con todos los textos dibujados). */
  function plate(C, P, fp, z, opts) {
    var m = fp.mesh(opts); m.position.z = z === undefined ? 0.0015 : z; m.userData.sombra = 'r'; P.add(m);
    C.plates.push({ mesh: m, mat: m.material });
    return m;
  }

  function panelsAndControls(C, B, M) {
    var cabG = C.group;
    M_KNOB = M.knob;
    var b = DESK.bevel;

    // ---------- Frente de instrumentos ----------
    var E = vec(0, 2.592, 0.345), F = vec(0, 2.302, 0.48);
    var nI = vec(0, F.z - E.z, -(F.y - E.y)).normalize();   // perpendicular hacia el maquinista
    nI.set(0, Math.abs(nI.y) * Math.sign(1), Math.abs(nI.z));
    var I = K.panel(cabG, E.clone().add(F).multiplyScalar(0.5).addScaledVector(nI, b + 0.001), nI);
    var fI = new K.Faceplate(1.86, E.distanceTo(F) + 0.006, { ppm: 1000, bg: '#2c3136', seed: 3 });
    C.panels.inst = I;
    screen(C, B, I, 'lamps', { u: -0.26, v: 0.113, w: 0.72, h: 0.05, cw: 1024, ch: 72 });
    screen(C, B, I, 'mrtfa', { round: true, r: 0.072, u: -0.75, v: -0.03, cw: 384, ch: 384 });
    screen(C, B, I, 'speedo', { round: true, r: 0.108, u: -0.47, v: -0.035, cw: 512, ch: 512 });
    screen(C, B, I, 'asfa', { u: -0.11, v: 0.012, w: 0.27, h: 0.142, cw: 640, ch: 336 });
    screen(C, B, I, 'tcms', { u: 0.285, v: 0.0, w: 0.31, h: 0.19, cw: 800, ch: 490 });
    screen(C, B, I, 'bc', { round: true, r: 0.072, u: 0.69, v: -0.03, cw: 384, ch: 384 });
    fI.text(-0.75, -0.135, 'DEP. PRINCIPAL / TFA', 0.0105);
    fI.text(-0.47, -0.152, 'VELOCIDAD', 0.0105);
    fI.text(0.69, -0.135, 'CILINDRO DE FRENO', 0.0105);
    fI.text(0.285, 0.108, 'PANTALLA DE ESTADO (TCMS)', 0.0105, { color: '#f2a93b' });
    // Pulsadores del ASFA
    [['conex', 'CONEX.', 0x1f6feb, 'asfa:conex', function (s) { return s.asfa.connected; }],
     ['rec', 'RECONOC.', 0xf2b01e, 'asfa:recAnPar', function (s, now) { return s.asfa.pendingRec && Math.floor(now / 200) % 2; }],
     ['rebase', 'REBASE', 0xe5e7eb, 'asfa:rebase', function (s) { return s.asfa.rebaseRemaining > 0; }],
     ['rearme', 'REARME FR.', 0xdc2626, 'asfa:rearme', function (s, now) { return s.asfa.emergency && Math.floor(now / 300) % 2; }]].forEach(function (bt, i) {
      pushButton(C, B, I, fI, { id: 'asfa-' + bt[0], name: 'ASFA · ' + bt[1], u: -0.215 + i * 0.07, v: -0.118, r: 0.0145, color: bt[2], label: bt[1], lv: 0.027, ls: 0.0092, lw: 0.064,
        lit: function (sim, now) { return TR.cabActive(sim.train) && bt[4](sim, now); },
        status: function (sim) { return sim.asfa.testing > 0 ? 'Autotest…' : sim.asfa.connected ? 'ASFA conectado' : 'ASFA desconectado'; },
        onPress: function (sim, send) { send({ type: bt[3] }); } });
    });
    // Teclas de función del TCMS, una bajo cada rótulo de la pantalla (los rótulos los dibuja la pantalla).
    // La de AVERÍAS, con esa página ya abierta, reconoce las alarmas.
    RC.core.tcms.PAGES.forEach(function (pg, i) {
      var keyNo = (i + 5) % 10;
      pushButton(C, B, I, fI, { id: 'tcms-' + pg, name: 'TCMS · ' + RC.core.tcms.PAGE_NAMES[pg].toLowerCase() + (pg === 'averias' ? ' (otra vez: reconocer)' : ''), u: 0.285 - 0.155 + (i + 0.5) / 6 * 0.31, v: -0.122, r: 0.012, square: true, color: 0x3b4148,
        lit: function (sim) { return TR.controlPower(sim.train) && sim.tcms.page === pg; }, litK: 0.6,
        status: function (sim) { return (sim.tcms.page === pg ? 'Página actual' : 'Tecla ' + keyNo) + (pg === 'averias' ? ' · ' + RC.core.tcms.activeList(sim).length + ' alarmas activas' : ''); },
        onPress: function (sim, send) { send(pg === 'averias' && sim.tcms.page === 'averias' ? { type: 'tcms', ack: true } : { type: 'tcms', page: pg }); } });
    });
    plate(C, I, fI, 0.0015);

    // ---------- Pupitre (superficie de mandos) ----------
    var G0 = vec(0, 2.305, 0.52), H0 = vec(0, 2.285, 1.20);
    var nT = vec(0, H0.z - G0.z, -(H0.y - G0.y)).normalize(); nT.set(0, Math.abs(nT.y), Math.abs(nT.z));
    var P = K.panel(cabG, G0.clone().add(H0).multiplyScalar(0.5).addScaledVector(nT, b + 0.001), nT);
    var fT = new K.Faceplate(1.86, G0.distanceTo(H0) - 0.01, { ppm: 900, bg: '#30353b', seed: 5 });
    C.panels.top = P;
    // Serigrafía de zonas
    fT.rect(-0.60, 0.0, 0.62, 0.64, { stroke: '#596169', lw: 0.002, r: 0.02 });
    fT.rect(0.53, -0.08, 0.52, 0.17, { stroke: '#596169', lw: 0.002, r: 0.02 });
    fT.text(0.53, 0.025, 'PUERTAS', 0.012, { color: '#f2a93b' });
    fT.text(-0.21, 0.30, 'REGULADOR DE VELOCIDAD', 0.0105, { color: '#f2a93b' });
    lever(C, B, P, fT);
    rotary(C, B, P, fT, { id: 'reverser', name: 'Inversor (llave)', u: -0.80, v: -0.01, key: true, label: 'INVERSOR',
      positions: [{ text: 'AT', angle: 0.8 }, { text: '0', angle: 0 }, { text: 'AD', angle: -0.8 }],
      index: function (sim) { return sim.train.controls.reverser + 1; },
      status: function (sim) { return ['Atrás', 'Neutro', 'Adelante'][sim.train.controls.reverser + 1]; },
      onStep: function (sim, send, dir) { send({ type: 'reverser', pos: Math.max(-1, Math.min(1, sim.train.controls.reverser + dir)) }); } });
    pushButton(C, B, P, fT, { id: 'parking', name: 'Freno de estacionamiento', u: -0.80, v: -0.21, r: 0.021, color: 0xd02020, label: 'FRENO\nESTACIONAM.',
      lit: function (sim) { return TR.controlPower(sim.train) && sim.train.air.parking; },
      status: function (sim) { return sim.train.air.parking ? 'Aplicado (pulse para aflojar)' : 'Aflojado (pulse para aplicar)'; },
      onPress: function (sim, send) { send({ type: 'parking', apply: !sim.train.air.parking }); } });
    pushButton(C, B, P, fT, { id: 'sand', name: 'Arenado (mantener pulsado)', u: -0.32, v: -0.22, r: 0.02, color: 0xb0772a, label: 'ARENADO',
      held: function (sim) { return sim.train.sand.button; },
      lit: function (sim) { return sim.train.sand.active; },
      status: function (sim) { var s = sim.train.sand; return (s.active ? 'Arenando' : s.auto > 0 ? 'Automático' : 'En reposo') + ' · arena ' + Math.round(s.kg) + ' kg (' + Math.round(s.kg / sim.spec.sandCapacity_kg * 100) + ' %)'; },
      onPress: function (sim, send) { send({ type: 'sand', on: true }); },
      onRelease: function (sim, send) { send({ type: 'sand', on: false }); } });
    // Regulador de velocidad
    pushButton(C, B, P, fT, { id: 'regOn', name: 'Regulador de velocidad (conectar/desconectar)', u: -0.33, v: 0.22, r: 0.017, color: 0xe8e8e8, label: 'REG.', lv: -0.03,
      lit: function (sim) { return TR.cabActive(sim.train) && sim.train.reg.on; },
      status: function (sim) { var r = sim.train.reg; return (r.on ? (r.active ? 'ACTIVO' : 'Conectado (lleve el manipulador a tracción)') : 'Desconectado') + ' · consigna ' + r.set_kmh + ' km/h'; },
      onPress: function (sim, send) { send({ type: 'regulator', on: !sim.train.reg.on }); } });
    pushButton(C, B, P, fT, { id: 'regDown', name: 'Regulador: bajar consigna 5 km/h', u: -0.27, v: 0.22, r: 0.014, square: true, color: 0x40464d, label: '−', ls: 0.016, lv: -0.03,
      status: function (sim) { return 'Consigna ' + sim.train.reg.set_kmh + ' km/h'; },
      onPress: function (sim, send) { send({ type: 'regulatorSet', delta: -1 }); } });
    pushButton(C, B, P, fT, { id: 'regUp', name: 'Regulador: subir consigna 5 km/h', u: -0.225, v: 0.22, r: 0.014, square: true, color: 0x40464d, label: '+', ls: 0.016, lv: -0.03,
      status: function (sim) { return 'Consigna ' + sim.train.reg.set_kmh + ' km/h'; },
      onPress: function (sim, send) { send({ type: 'regulatorSet', delta: 1 }); } });
    screen(C, B, P, 'reg', { u: -0.115, v: 0.225, w: 0.105, h: 0.042, cw: 256, ch: 96 });
    pushButton(C, B, P, fT, { id: 'vigil', name: 'Vigilancia (hombre muerto)', u: -0.155, v: -0.20, r: 0.034, color: 0xf2b01e, label: 'VIGILANCIA',
      lit: function (sim, now) { return (sim.vigil.warning || sim.vigil.emergency) && Math.floor(now / 250) % 2; },
      status: function (sim) { return sim.vigil.warning ? '¡PULSE YA!' : sim.vigil.emergency ? 'Actuado: pulse con el tren parado' : 'En reposo'; },
      onPress: function (sim, send) { send({ type: 'vigil' }); } });
    pushButton(C, B, P, fT, { id: 'horn', name: 'Bocina tono alto (mantener)', u: -0.01, v: -0.215, r: 0.02, color: 0x2a2a2a, label: 'BOCINA\nALTA',
      held: function (sim) { return sim.train.controls.horn; },
      onPress: function (sim, send) { send({ type: 'horn', on: true }); },
      onRelease: function (sim, send) { send({ type: 'horn', on: false }); } });
    pushButton(C, B, P, fT, { id: 'hornLow', name: 'Bocina tono bajo (mantener)', u: 0.07, v: -0.215, r: 0.02, color: 0x2a2a2a, label: 'BOCINA\nBAJA',
      held: function (sim) { return sim.train.controls.hornLow; },
      onPress: function (sim, send) { send({ type: 'horn', on: true, tone: 'baja' }); },
      onRelease: function (sim, send) { send({ type: 'horn', on: false, tone: 'baja' }); } });
    pushButton(C, B, P, fT, { id: 'emReset', name: 'Rearme de emergencia', u: 0.17, v: -0.215, r: 0.02, color: 0x2b6fd6, label: 'REARME\nEMERG.',
      lit: function (sim) { return sim.train.emergency.active && TR.stopped(sim.train); },
      status: function (sim) { return sim.train.emergency.active ? 'Emergencia activa' : 'Sin emergencia'; },
      onPress: function (sim, send) { send({ type: 'emergencyReset' }); } });
    seta(C, B, P, fT);
    pushButton(C, B, P, fT, { id: 'doorL', name: 'Abrir puertas izquierda', u: 0.37, v: -0.085, r: 0.025, color: 0x16a34a, label: 'ABRIR IZQ.',
      lit: function (sim) { return sim.train.doors.left > 0; }, status: function (sim) { return sim.train.doors.left >= 1 ? 'Abiertas' : sim.train.doors.left > 0 ? 'Moviéndose' : 'Cerradas'; },
      onPress: function (sim, send) { send({ type: 'doors', side: 'left', action: 'open' }); } });
    pushButton(C, B, P, fT, { id: 'doorC', name: 'Cerrar puertas', u: 0.53, v: -0.085, r: 0.025, color: 0xd97706, label: 'CERRAR',
      lit: function (sim) { return TR.controlPower(sim.train) && TR.doorsClosed(sim.train); }, status: function (sim) { return TR.doorsClosed(sim.train) ? 'Puertas cerradas y enclavadas' : 'Puertas abiertas'; },
      onPress: function (sim, send) { send({ type: 'doors', action: 'close' }); } });
    pushButton(C, B, P, fT, { id: 'doorR', name: 'Abrir puertas derecha', u: 0.69, v: -0.085, r: 0.025, color: 0x16a34a, label: 'ABRIR DER.',
      lit: function (sim) { return sim.train.doors.right > 0; }, status: function (sim) { return sim.train.doors.right >= 1 ? 'Abiertas' : sim.train.doors.right > 0 ? 'Moviéndose' : 'Cerradas'; },
      onPress: function (sim, send) { send({ type: 'doors', side: 'right', action: 'open' }); } });
    rotary(C, B, P, fT, { id: 'lights', name: 'Faros', u: 0.36, v: 0.16, label: 'FAROS',
      positions: [{ text: '0', angle: 0.75 }, { text: 'CRUCE', angle: 0 }, { text: 'LARGO', angle: -0.75 }],
      index: function (sim) { return sim.train.controls.headlights; },
      status: function (sim) { return ['Apagados', 'Cruce', 'Largo alcance'][sim.train.controls.headlights]; },
      onStep: function (sim, send, dir) { send({ type: 'headlights', mode: Math.max(0, Math.min(2, sim.train.controls.headlights + dir)) }); } });
    rotary(C, B, P, fT, { id: 'wipers', name: 'Limpiaparabrisas', u: 0.55, v: 0.16, label: 'LIMPIAPARABRISAS',
      positions: [{ text: '0', angle: 0.95 }, { text: 'INT', angle: 0.32 }, { text: '1', angle: -0.32 }, { text: '2', angle: -0.95 }],
      index: function (sim) { return sim.train.controls.wipers; },
      status: function (sim) { return 'Limpiaparabrisas ' + TR.WIPER_NAMES[sim.train.controls.wipers]; },
      onStep: function (sim, send, dir) { send({ type: 'wipers', mode: Math.max(0, Math.min(3, sim.train.controls.wipers + dir)) }); } });
    pushButton(C, B, P, fT, { id: 'washer', name: 'Lavaparabrisas', u: 0.72, v: 0.16, r: 0.017, color: 0x2f7fc1, label: 'LAVA-\nPARABRISAS',
      held: function (sim) { return sim.train.controls.washer > 0; },
      lit: function (sim) { return sim.train.controls.washer > 0; },
      status: function (sim) { return 'Depósito ' + sim.train.screen.washerL.toFixed(1) + ' L de ' + sim.spec.washerTank_L + ' L'; },
      onPress: function (sim, send) { send({ type: 'washer' }); } });
    timetableHolder(C, B, P);
    plate(C, P, fT, 0.0015);

    // ---------- Consolas laterales: megafonía/destino (izq.) y radio (der.) ----------
    podPA(C, B, M);
    podRadio(C, B, M);

    // ---------- Panel de techo ----------
    overhead(C, B, M);

    // ---------- Armario de servicios ----------
    services(C, B, M);

    // ---------- Pedal de hombre muerto ----------
    pedal(C, B, M);
  }

  /* Manipulador combinado tracción/freno (empujar = tracción, tirar = freno). */
  function lever(C, B, P, fp) {
    var u = -0.52, v = 0.0;
    var g = new THREE.Group(); g.position.set(u, v, 0); P.add(g);
    B.add('plastic', K.rbox(0.11, 0.32, 0.018, 0.012), K.matrix(u, v - 0.012, 0.009), COL.black, P);
    B.add('plastic', K.box(0.018, 0.27, 0.02), K.matrix(u, v - 0.012, 0.012), COL.rubber, P);
    // Escala serigrafiada
    for (var n = 6; n >= -8; n--) {
      var vv = v + Math.sin(-(-n / 8 * 0.75)) * 0.205 * (n === -8 ? 1.02 : 1);
      fp.text(u + 0.085, vv, n > 0 ? 'T' + n : n === 0 ? '0' : n === -8 ? 'EM' : 'F' + (-n), 0.0105,
        { color: n > 0 ? '#7cf0a8' : n === 0 ? '#ffffff' : n === -8 ? '#ff5a5a' : '#ffb070', align: 'left', weight: '700' });
      fp.line(u + 0.06, vv, u + 0.078, vv, { color: '#8a939b', lw: 0.0015 });
    }
    fp.text(u, -0.30, 'MANIPULADOR TRACCIÓN / FRENO', 0.011);
    var pivot = new THREE.Group(); pivot.position.z = 0.02; g.add(pivot);
    var shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.015, 0.19, 14).rotateX(Math.PI / 2).translate(0, 0, 0.095), C.M.chrome); pivot.add(shaft);
    var handle = new THREE.Mesh(K.merge([
      { geo: new THREE.CylinderGeometry(0.028, 0.03, 0.12, 22).rotateZ(Math.PI / 2).translate(0.01, 0, 0.2), color: new THREE.Color(0x141517) },
      { geo: new THREE.SphereGeometry(0.03, 18, 12).translate(-0.058, 0, 0.2), color: new THREE.Color(0xb3231f) },
      { geo: K.box(0.03, 0.02, 0.02).translate(0.03, 0, 0.226), color: new THREE.Color(0x2a2d31) }
    ], true), C.M.knob);
    pivot.add(handle);
    shaft.userData.sombra = handle.userData.sombra = 'pr';
    var ctrl = { id: 'lever', kind: 'lever', name: 'Manipulador combinado',
      status: function (sim) { var l = sim.train.controls.lever; return l > 0 ? 'Tracción T' + l : l === 0 ? 'Neutro' : l === -8 ? 'EMERGENCIA' : 'Freno F' + (-l); },
      press: function (sim, send, dir) { send({ type: 'leverStep', delta: dir || 1 }); },
      wheel: function (sim, send, dir) { send({ type: 'leverStep', delta: dir }); },
      drag: true,
      update: function (sim) {
        var l = sim.train.controls.lever, target = -l / 8 * 0.75;
        pivot.rotation.x += (target - pivot.rotation.x) * 0.3;
      } };
    register(C, ctrl, [shaft, handle]);
  }

  /* Seta de emergencia con collar amarillo. */
  function seta(C, B, P, fp) {
    var u = 0.07, v = 0.14;
    var g = new THREE.Group(); g.position.set(u, v, 0); P.add(g);
    B.add('plastic', new THREE.CylinderGeometry(0.05, 0.056, 0.03, 28).rotateX(Math.PI / 2), K.matrix(u, v, 0.015), COL.saffron, P);
    var stem = new THREE.Group(); g.add(stem);
    var head = new THREE.Mesh(K.merge([
      { geo: new THREE.CylinderGeometry(0.014, 0.014, 0.03, 12).rotateX(Math.PI / 2).translate(0, 0, 0.04), color: new THREE.Color(0x8a1010) },
      { geo: new THREE.SphereGeometry(0.052, 26, 12, 0, Math.PI * 2, 0, Math.PI / 2.2).rotateX(Math.PI / 2).translate(0, 0, 0.05), color: new THREE.Color(0xd01010) }
    ], true), K.mat(0xffffff, 0.3, 0, { vertexColors: true }));
    head.userData.sombra = 'p';
    stem.add(head);
    fp.text(u, v - 0.078, 'SETA DE EMERGENCIA', 0.0105, { color: '#ff8a7a' });
    register(C, { id: 'seta', kind: 'button', name: 'Seta de emergencia',
      status: function (sim) { return sim.train.controls.seta ? 'PULSADA (pulse para rearmar)' : 'En reposo'; },
      press: function (sim, send) { send({ type: 'seta', on: !sim.train.controls.seta }); },
      update: function (sim) { stem.position.z = sim.train.controls.seta ? -0.018 : 0; } }, [head]);
  }

  /* Portahorarios con la hoja de ruta del servicio (se dibuja con el horario real del juego). */
  function timetableHolder(C, B, P) {
    var u = 0.84, v = -0.06;
    B.add('plastic', K.rbox(0.17, 0.25, 0.012, 0.008), K.matrix(u, v, 0.03, -0.35, 0, 0), COL.black, P);
    B.add('metal', K.box(0.13, 0.012, 0.012), K.matrix(u, v + 0.115, 0.075, -0.35, 0, 0), COL.chrome, P);
    B.add('plastic', K.box(0.02, 0.10, 0.06), K.matrix(u, v - 0.06, 0.012), COL.black, P);
    var d = D.make(256, 384);
    var m = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.225), new THREE.MeshStandardMaterial({ map: d.tex, roughness: 0.9, envMapIntensity: 0.5 }));
    m.position.set(u, v, 0.0375); m.rotation.x = -0.35; P.add(m);
    C.displays.libro = d;
  }

  /* Consola izquierda: megafonía, destino y número de tren. */
  function podFrame(C, B, center) {
    var n = EYE.clone().sub(center).normalize();
    var right = new THREE.Vector3(0, 1, 0).cross(n);
    var Pn = K.panel(C.group, center, n, right);
    B.add('plastic', K.rbox(0.38, 0.22, 0.16, 0.025), K.matrix(0, 0, -0.08), COL.desk, Pn);
    B.add('plastic', K.rbox(0.34, 0.06, 0.24, 0.02), K.matrix(0, -0.12, -0.12), COL.deskDark, Pn);
    return Pn;
  }
  function podPA(C, B, M) {
    var P = podFrame(C, B, vec(-1.13, 2.53, 0.62));
    var fp = new K.Faceplate(0.36, 0.20, { ppm: 1400, bg: '#2f343a', seed: 11 });
    C.panels.pa = P;
    fp.text(0, 0.088, 'MEGAFONÍA · DESTINO', 0.0105, { color: '#f2a93b' });
    screen(C, B, P, 'pa', { u: -0.045, v: 0.035, w: 0.215, h: 0.07, cw: 512, ch: 168 });
    [['next', 'PRÓX.\nESTACIÓN'], ['doors', 'CIERRE\nPUERTAS'], ['welcome', 'BIEN-\nVENIDA'], ['delay', 'AVISO\nRETRASO'], ['terminus', 'FINAL\nTRAYECTO']].forEach(function (it, i) {
      pushButton(C, B, P, fp, { id: 'pa-' + it[0], name: 'Megafonía: ' + it[1].replace('\n', ' ').replace('- ', '').toLowerCase(), u: -0.14 + i * 0.058, v: -0.04, r: 0.0135, square: true, color: 0x4a5058, label: it[1], ls: 0.0082, lv: -0.035, lw: 0.054,
        lit: function (sim) { return sim.pa.active && sim.pa.active.kind === it[0]; }, litK: 1.2,
        status: function (sim) { return sim.pa.active ? 'Emitiendo: «' + sim.pa.active.text.slice(0, 60) + '…»' : 'Pulse para emitir el aviso'; },
        onPress: function (sim, send) { send({ type: 'pa', msg: it[0] }); } });
    });
    [['dest', 'DESTINO', 0.054], ['trainNo', 'Nº TREN', 0.006]].forEach(function (it) {
      fp.text(0.125, it[2] + 0.022, it[1], 0.0085);
      fp.text(0.081, it[2], '◀', 0.0085, { color: '#c9d1d8' });
      fp.text(0.169, it[2], '▶', 0.0085, { color: '#c9d1d8' });
      [-1, 1].forEach(function (dir) {
        pushButton(C, B, P, fp, { id: it[0] + (dir > 0 ? 'Up' : 'Down'), name: (it[0] === 'dest' ? 'Destino' : 'Número de tren') + (dir > 0 ? ': siguiente' : ': anterior'), u: 0.125 + dir * 0.022, v: it[2], r: 0.0095, square: true, color: 0x40464d,
          status: function (sim) { return it[0] === 'dest' ? 'Destino: ' + sim.service.dest : 'Tren ' + sim.service.number; },
          onPress: function (sim, send) { send({ type: it[0], delta: dir }); } });
      });
    });
    plate(C, P, fp, 0.0015);
    // Micrófono de cuello de cisne (corto, negro)
    var mic = [];
    for (var i = 0; i <= 8; i++) { var f = i / 8; mic.push(vec(0.150 + 0.012 * Math.sin(f * 2.2), 0.10 + f * 0.085, 0.012 + 0.05 * f * f)); }
    B.add('plastic', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(mic), 12, 0.005, 8, false), null, COL.black, P);
    B.add('plastic', new THREE.CylinderGeometry(0.008, 0.008, 0.012, 12), K.matrix(0.150, 0.094, 0.012), COL.black, P);
    B.add('plastic', new THREE.CylinderGeometry(0.014, 0.011, 0.04, 14), K.matrix(mic[8].x, mic[8].y + 0.012, mic[8].z + 0.012, 0.6, 0, 0), COL.black, P);
  }

  /* Consola derecha: radio tren-tierra con microteléfono. */
  function podRadio(C, B, M) {
    var P = podFrame(C, B, vec(1.13, 2.53, 0.62));
    var fp = new K.Faceplate(0.36, 0.20, { ppm: 1400, bg: '#2f343a', seed: 13 });
    C.panels.radio = P;
    fp.text(-0.03, 0.088, 'RADIO TREN-TIERRA', 0.0105, { color: '#f2a93b' });
    screen(C, B, P, 'radio', { u: -0.045, v: 0.035, w: 0.215, h: 0.07, cw: 512, ch: 168 });
    pushButton(C, B, P, fp, { id: 'radioChDown', name: 'Radio: canal anterior', u: -0.13, v: -0.04, r: 0.0135, square: true, color: 0x40464d, label: 'CANAL −', ls: 0.0085, lv: -0.03,
      status: function (sim) { return 'Canal ' + sim.comms.channel + ' (zona: canal ' + sim.comms.zone + ')'; },
      onPress: function (sim, send) { send({ type: 'radio:channel', delta: -1 }); } });
    pushButton(C, B, P, fp, { id: 'radioChUp', name: 'Radio: canal siguiente', u: -0.075, v: -0.04, r: 0.0135, square: true, color: 0x40464d, label: 'CANAL +', ls: 0.0085, lv: -0.03,
      status: function (sim) { return 'Canal ' + sim.comms.channel + ' (zona: canal ' + sim.comms.zone + ')'; },
      onPress: function (sim, send) { send({ type: 'radio:channel', delta: 1 }); } });
    pushButton(C, B, P, fp, { id: 'radioCall', name: 'Radio: llamar al Puesto de Mando', u: 0.0, v: -0.04, r: 0.016, color: 0x1f9d4c, label: 'LLAMADA\nP. MANDO', ls: 0.0085, lv: -0.036,
      lit: function (sim, now) { var s = sim.comms.state; return s === 'comunicando' || (s === 'llamando' && Math.floor(now / 300) % 2); },
      status: function (sim) { return 'Estado: ' + sim.comms.state; },
      onPress: function (sim, send) { send({ type: 'radio:call' }); } });
    pushButton(C, B, P, fp, { id: 'radioEmerg', name: 'Radio: llamada de EMERGENCIA', u: 0.07, v: -0.04, r: 0.016, color: 0xd11a1a, label: 'EMERGENCIA', ls: 0.0085, lv: -0.033,
      lit: function (sim, now) { return sim.comms.emergency && Math.floor(now / 250) % 2; },
      status: function (sim) { return sim.comms.emergency ? 'Llamada de emergencia en curso (pulse para terminar)' : 'Pulse sólo en caso de peligro'; },
      onPress: function (sim, send) { send({ type: 'radio:emergency' }); } });
    // Marco rojo de seguridad del pulsador de emergencia y horquilla del microteléfono
    fp.rect(0.07, -0.04, 0.046, 0.046, { stroke: '#c81e1e', lw: 0.003, r: 0.006 });
    B.add('plastic', K.frame(0.05, 0.05, 0.005, 0.006, 0.008), K.matrix(0.07, -0.04, 0.0), 0x8a1616, P);
    B.add('plastic', K.rbox(0.05, 0.12, 0.03, 0.01), K.matrix(0.145, 0.02, 0.015), COL.black, P);
    var hs = new THREE.Mesh(K.merge([
      { geo: K.rbox(0.035, 0.16, 0.03, 0.012), color: new THREE.Color(0x1a1c1f) },
      { geo: K.rbox(0.045, 0.04, 0.04, 0.015).translate(0, 0.075, 0.012), color: new THREE.Color(0x1a1c1f) },
      { geo: K.rbox(0.045, 0.04, 0.04, 0.015).translate(0, -0.075, 0.012), color: new THREE.Color(0x1a1c1f) }
    ], true), C.M.knob);
    hs.userData.sombra = 'p';
    var hg = new THREE.Group(); hg.position.set(0.145, 0.02, 0.045); hg.add(hs); P.add(hg);
    plate(C, P, fp, 0.0015);
    register(C, { id: 'handset', kind: 'button', name: 'Microteléfono de la radio',
      status: function (sim) { return 'Radio: ' + sim.comms.state + ' · canal ' + sim.comms.channel; },
      press: function (sim, send) { send({ type: 'radio:call' }); },
      update: function (sim) {
        var up = sim.comms.state === 'llamando' || sim.comms.state === 'comunicando' || sim.comms.state === 'emergencia';
        hg.position.z += ((up ? 0.10 : 0.045) - hg.position.z) * 0.2;
        hg.rotation.x += ((up ? 0.5 : 0) - hg.rotation.x) * 0.2;
      } }, [hs]);
  }

  /* Panel de techo: alumbrado, atenuador, luneta térmica y climatización. */
  function overhead(C, B, M) {
    var prof = [['M', 0.50, 3.64], ['L', 0.50, 3.40], ['L', 0.58, 3.352], ['L', 0.665, 3.56], ['L', 0.70, 3.64]];
    B.add('plastic', K.profileX(prof, -0.72, 0.72, 0.008, 4), null, COL.desk);
    var A = vec(0, 3.352, 0.58), Bt = vec(0, 3.56, 0.665);
    var n = vec(0, -(Bt.z - A.z), Bt.y - A.y).normalize(); if (n.z < 0) n.negate();
    var P = K.panel(C.group, A.clone().add(Bt).multiplyScalar(0.5).addScaledVector(n, 0.0095), n);
    var fp = new K.Faceplate(1.40, A.distanceTo(Bt) - 0.006, { ppm: 1100, bg: '#2f343a', seed: 17 });
    C.panels.ovh = P;
    fp.text(-0.40, 0.085, 'ALUMBRADO', 0.0105, { color: '#f2a93b' });
    fp.text(0.06, 0.085, 'PARABRISAS', 0.0105, { color: '#f2a93b' });
    fp.text(0.42, 0.085, 'CLIMATIZACIÓN', 0.0105, { color: '#f2a93b' });
    var lights = [
      ['markers', 'LUCES\nPOSICIÓN', function (s) { return s.train.controls.markers; }, function (s) { return { type: 'markers', on: !s.train.controls.markers }; }],
      ['tailLights', 'PILOTOS\nCOLA', function (s) { return s.train.controls.tailLights; }, function (s) { return { type: 'tailLights', on: !s.train.controls.tailLights }; }],
      ['cabLight', 'LUZ\nCABINA', function (s) { return s.train.controls.cabLight; }, function (s) { return { type: 'cabLight', on: !s.train.controls.cabLight }; }],
      ['deskLight', 'LUZ\nPUPITRE', function (s) { return s.train.controls.deskLight; }, function (s) { return { type: 'deskLight', on: !s.train.controls.deskLight }; }]
    ];
    lights.forEach(function (it, i) {
      toggle(C, B, P, fp, { id: it[0], name: it[1].replace('\n', ' ').toLowerCase().replace(/^./, function (c) { return c.toUpperCase(); }), u: -0.62 + i * 0.095, v: 0.01, label: it[1], ls: 0.0085, state: it[2],
        lamp: 0x47ff8a, lampOn: function (s) { return TR.controlPower(s.train) && it[2](s); },
        status: function (s) { return it[2](s) ? 'Encendido' : 'Apagado'; }, onPress: function (s, send) { send(it[3](s)); } });
    });
    rotary(C, B, P, fp, { id: 'dimmer', name: 'Intensidad de pantallas y rótulos', u: -0.205, v: 0.012, rk: 0.018, label: 'INTENSIDAD', ls: 0.0085,
      positions: [{ text: '−', angle: 1.2 }, { text: '+', angle: -1.2 }],
      angle: function (sim) { return 1.2 - 2.4 * (sim.train.controls.dimmer - 0.1) / 0.9; },
      status: function (sim) { return 'Intensidad ' + Math.round(sim.train.controls.dimmer * 100) + ' %'; },
      onStep: function (sim, send, dir) { send({ type: 'dimmer', delta: dir * 0.1 }); } });
    toggle(C, B, P, fp, { id: 'demister', name: 'Luneta térmica (desempañador)', u: 0.02, v: 0.01, label: 'LUNETA\nTÉRMICA', ls: 0.0085, state: function (s) { return s.train.controls.demister; },
      lamp: 0xffb02b, lampOn: function (s) { return s.train.controls.demister && s.train.elec.auxPower; },
      status: function (s) { var c = s.train.controls.demister; return (c ? (s.train.elec.auxPower ? 'Calentando' : 'Conectada, SIN alimentación') : 'Desconectada') + ' · vaho ' + Math.round(s.train.screen.fog * 100) + ' %'; },
      onPress: function (s, send) { send({ type: 'demister', on: !s.train.controls.demister }); } });
    pushButton(C, B, P, fp, { id: 'visorBtn', name: 'Cortinilla parasol', u: 0.11, v: 0.012, r: 0.013, square: true, color: 0x40464d, label: 'CORTINILLA', ls: 0.0085, lv: -0.035,
      status: function (s) { return ['Recogida', 'A media altura', 'Bajada'][s.train.controls.visor]; },
      onPress: function (s, send) { send({ type: 'visor', pos: (s.train.controls.visor + 1) % 3 }); } });
    screen(C, B, P, 'hvac', { u: 0.42, v: 0.035, w: 0.15, h: 0.05, cw: 384, ch: 128 });
    pushButton(C, B, P, fp, { id: 'hvacCab', name: 'Climatización de cabina', u: 0.30, v: -0.035, r: 0.0125, square: true, color: 0x40464d, label: 'CABINA', ls: 0.0082, lv: -0.026,
      lit: function (s) { return s.train.hvac.cabOn && TR.controlPower(s.train); }, litK: 0.9,
      status: function (s) { var h = s.train.hvac; return (h.cabOn ? 'Conectada' : 'Desconectada') + ' · ' + h.cabT.toFixed(1) + ' °C (consigna ' + h.cabSet.toFixed(1) + ' °C)' + (s.train.elec.auxPower ? '' : ' · sin convertidor'); },
      onPress: function (s, send) { send({ type: 'hvacCab', on: !s.train.hvac.cabOn }); } });
    pushButton(C, B, P, fp, { id: 'hvacDown', name: 'Climatización: bajar consigna 0,5 °C', u: 0.37, v: -0.035, r: 0.0125, square: true, color: 0x2f6fb0, label: '−', ls: 0.014, lv: -0.026,
      status: function (s) { return 'Consigna ' + s.train.hvac.cabSet.toFixed(1) + ' °C'; }, onPress: function (s, send) { send({ type: 'hvacCabSet', delta: -1 }); } });
    pushButton(C, B, P, fp, { id: 'hvacUp', name: 'Climatización: subir consigna 0,5 °C', u: 0.44, v: -0.035, r: 0.0125, square: true, color: 0xb0452f, label: '+', ls: 0.014, lv: -0.026,
      status: function (s) { return 'Consigna ' + s.train.hvac.cabSet.toFixed(1) + ' °C'; }, onPress: function (s, send) { send({ type: 'hvacCabSet', delta: 1 }); } });
    pushButton(C, B, P, fp, { id: 'hvacSalon', name: 'Climatización del salón de viajeros', u: 0.53, v: -0.035, r: 0.0125, square: true, color: 0x40464d, label: 'SALÓN', ls: 0.0082, lv: -0.026,
      lit: function (s) { return s.train.hvac.salonOn && TR.controlPower(s.train); }, litK: 0.9,
      status: function (s) { var h = s.train.hvac; return (h.salonOn ? 'Conectada' : 'Desconectada') + ' · salón ' + h.salonT.toFixed(1) + ' °C'; },
      onPress: function (s, send) { send({ type: 'hvacSalon', on: !s.train.hvac.salonOn }); } });
    plate(C, P, fp, 0.0015);
  }

  /* Armario de servicios (pared izquierda): baterías, llave, compresores, pantógrafo, disyuntor. */
  function services(C, B, M) {
    var P = K.panel(C.group, vec(-HW + 0.12, 2.50, 1.90), vec(1, 0, 0), vec(0, 0, -1));
    C.panels.svc = P;
    B.add('paint', K.rbox(1.12, 1.14, 0.11, 0.015), K.matrix(0, 0, -0.06), COL.cabinet, P);
    B.add('metal', K.frame(1.12, 1.14, 0.03, 0.012, 0.015), K.matrix(0, 0, -0.004), COL.alu, P);
    var fp = new K.Faceplate(1.04, 1.06, { ppm: 700, bg: '#33383e', seed: 19 });
    fp.text(0, 0.47, 'ARMARIO DE SERVICIOS', 0.026, { color: '#f2a93b' });
    // Magnetotérmicos en carril DIN (todos rearmados)
    var brk = ['MANDO', 'ALUMBR.', 'PUERTAS', 'ASFA', 'RADIO', 'TCMS', 'CLIMA', 'FAROS', 'LIMPIA', 'MEGAF.'];
    B.add('metal', K.box(0.92, 0.035, 0.008), K.matrix(0, 0.33, 0.004), COL.alu, P);
    brk.forEach(function (n, i) {
      var u = -0.405 + i * 0.09;
      B.add('plastic', K.rbox(0.07, 0.11, 0.06, 0.006), K.matrix(u, 0.33, 0.03), 0xe9e9e6, P);
      B.add('plastic', K.box(0.018, 0.03, 0.02), K.matrix(u, 0.345, 0.065), 0x1a1a1a, P);
      fp.text(u, 0.255, n, 0.0135);
    });
    screen(C, B, P, 'batt', { u: 0, v: 0.155, w: 0.30, h: 0.06, cw: 512, ch: 112 });
    fp.text(0, 0.21, 'TENSIÓN DE BATERÍAS', 0.0125, { color: '#c9d1d8' });
    var items = [
      { id: 'battery', name: 'Baterías', text: 'BATERÍAS', state: function (s) { return s.train.elec.battery; }, cmd: function (s) { return { type: 'battery', on: !s.train.elec.battery }; }, status: function (s) { var e = s.train.elec; return e.battery ? 'Conectadas ' + e.battV.toFixed(0) + ' V · carga ' + Math.round(e.battSoc * 100) + ' %' + (e.charging ? ' · cargando' : '') : 'Desconectadas'; }, lamp: 0x2bff7a, lampOn: function (s) { return s.train.elec.battery; } },
      { id: 'cabKey', name: 'Llave de cabina', text: 'LLAVE DE CABINA', key: true, state: function (s) { return s.train.elec.cabKey; }, cmd: function (s) { return { type: 'cabKey', on: !s.train.elec.cabKey }; }, status: function (s) { return s.train.elec.cabKey ? 'Cabina habilitada' : 'Retirada'; } },
      { id: 'aux', name: 'Compresor auxiliar', text: 'COMPRESOR\nAUXILIAR', state: function (s) { return s.train.elec.auxCompressor; }, cmd: function (s) { return { type: 'auxCompressor', on: !s.train.elec.auxCompressor }; }, status: function (s) { return (s.train.elec.auxCompressor ? 'En marcha' : 'Parado') + ' · dep. pantógrafo ' + s.train.air.panto.toFixed(1) + ' bar'; }, lamp: 0xffc72b, lampOn: function (s) { return s.train.elec.auxCompressor; } },
      { id: 'panto', name: 'Pantógrafo', text: 'PANTÓGRAFO', state: function (s) { return s.train.elec.pantoCmd; }, cmd: function (s) { return { type: 'panto', up: !s.train.elec.pantoCmd }; }, status: function (s) { var p = s.train.elec.pantoPos; return p >= 1 ? 'Arriba (en contacto)' : p > 0 ? 'En movimiento' : 'Abajo'; }, lamp: 0x2bff7a, lampOn: function (s) { return s.train.elec.pantoPos >= 1; } },
      { id: 'disy', name: 'Disyuntor', text: 'DISYUNTOR', state: function (s) { return s.train.elec.disyuntor; }, cmd: function (s) { return { type: 'disyuntor', close: !s.train.elec.disyuntor }; }, status: function (s) { return s.train.elec.disyuntor ? 'Cerrado' : 'Abierto'; }, lamp: 0x2bff7a, lampOn: function (s) { return s.train.elec.disyuntor; } },
      { id: 'comp', name: 'Compresor principal', text: 'COMPRESOR\nPRINCIPAL', state: function (s) { return s.train.elec.mainCompSwitch === 'auto'; }, cmd: function (s) { return { type: 'mainCompressor', mode: s.train.elec.mainCompSwitch === 'auto' ? 'off' : 'auto' }; }, status: function (s) { return (s.train.elec.mainCompSwitch === 'auto' ? 'Automático' : 'Desconectado') + (s.train.elec.mainCompRunning ? ' · comprimiendo' : '') + ' · dep. principal ' + s.train.air.mr.toFixed(1) + ' bar'; }, lamp: 0xffc72b, lampOn: function (s) { return s.train.elec.mainCompRunning; } }
    ];
    items.forEach(function (it, i) {
      var u = -0.24 + (i % 2) * 0.48, v = 0.02 - Math.floor(i / 2) * 0.20;
      fp.rect(u, v - 0.015, 0.36, 0.17, { stroke: '#5b636b', lw: 0.002, r: 0.012 });
      if (it.key) {
        rotary(C, B, P, fp, { id: it.id, name: it.name, u: u, v: v, key: true, rk: 0.03, label: it.text, ls: 0.018, ps: 0.013,
          positions: [{ text: 'OFF', angle: 0.6 }, { text: 'ON', angle: -0.6 }],
          index: function (s) { return it.state(s) ? 1 : 0; }, status: it.status,
          onStep: function (s, send) { send(it.cmd(s)); } });
      } else {
        toggle(C, B, P, fp, { id: it.id, name: it.name, u: u, v: v + 0.012, scale: 1.45, label: it.text, ls: 0.016, lv: 0.072, lw: 0.2, iv: 0.06, is: 0.012, state: it.state, status: it.status, lamp: it.lamp, lampOn: it.lampOn,
          onPress: function (s, send) { send(it.cmd(s)); } });
      }
    });
    plate(C, P, fp, 0.0015, { glowColor: 0xffd9a0 });
  }

  /* Pedal de hombre muerto (pulsarlo equivale a VIGILANCIA). */
  function pedal(C, B, M) {
    var g = new THREE.Group(); g.position.set(-0.06, FLOOR + 0.03, 1.28); C.group.add(g);
    var p = new THREE.Mesh(K.rbox(0.28, 0.026, 0.24, 0.01), M.rubber); p.position.set(0, 0.02, -0.12); g.add(p);
    B.add('metal', K.box(0.30, 0.03, 0.03), K.matrix(-0.06, FLOOR + 0.03, 1.28), COL.steel);
    var ctrl = { id: 'pedal', kind: 'button', name: 'Pedal de hombre muerto', pressedUntil: 0,
      status: function (sim) { return sim.vigil.warning ? '¡PISE YA!' : 'Equivale al pulsador VIGILANCIA (Espacio)'; },
      press: function (sim, send) { ctrl.pressedUntil = performance.now() + 400; send({ type: 'vigil' }); },
      update: function (sim, now) { var t = now < ctrl.pressedUntil ? 0.0 : 0.16; g.rotation.x += (t - g.rotation.x) * 0.3; } };
    register(C, ctrl, [p]);
  }

  /* ---------- Parabrisas: cristal, marco, montantes, limpiaparabrisas exteriores, cortinilla,
   *            gotas/suciedad (fuera) y vaho (dentro) ---------- */
  function windscreenParts(C, B, M) {
    var n = vec(0, -(WS_T.z - WS_B.z), WS_T.y - WS_B.y).normalize(); if (n.z < 0) n.negate();
    var W = K.panel(C.group, WS_B.clone().add(WS_T).multiplyScalar(0.5), n);
    C.panels.ws = W;
    B.add('glass', new THREE.PlaneGeometry(WS_W, WS_LEN), null, null, W);
    B.add('plastic', K.frame(WS_W + 0.12, WS_LEN + 0.10, 0.075, 0.03, 0.07), K.matrix(0, 0, 0.0), COL.black, W);
    [-1, 1].forEach(function (s) {
      B.add('plastic', K.rbox(0.16, WS_LEN + 0.14, 0.10, 0.03), K.matrix(s * (WS_W / 2 + 0.07), 0, 0.03), COL.deskDark, W);
    });
    // Cortinilla parasol enrollable
    B.add('plastic', K.rbox(2.34, 0.07, 0.075, 0.02), K.matrix(0, WS_LEN / 2 - 0.01, 0.07), COL.deskDark, W);
    var blindG = new THREE.PlaneGeometry(2.24, 1).translate(0, -0.5, 0);
    C.blind = new THREE.Mesh(blindG, M.blind); C.blind.position.set(0, WS_LEN / 2 - 0.04, 0.06); C.blind.scale.y = 0.001; C.blind.renderOrder = 3; W.add(C.blind);
    C.blindBar = new THREE.Mesh(K.rbox(2.26, 0.022, 0.016, 0.006), C.M.knob); C.blindBar.position.set(0, WS_LEN / 2 - 0.045, 0.062); W.add(C.blindBar);
    register(C, { id: 'visor', kind: 'button', name: 'Cortinilla parasol',
      status: function (s) { return ['Recogida', 'A media altura', 'Bajada'][s.train.controls.visor] + ' (clic para cambiar)'; },
      press: function (s, send) { send({ type: 'visor', pos: (s.train.controls.visor + 1) % 3 }); },
      update: function (s) {
        var len = [0.001, 0.30, 0.56][s.train.controls.visor];
        C.blind.scale.y += (len - C.blind.scale.y) * 0.15;
        C.blindBar.position.y = WS_LEN / 2 - 0.045 - C.blind.scale.y;
      } }, [C.blindBar]);
    // Limpiaparabrisas exteriores (sistema paralelo): eje, brazo y escobilla
    C.wipers = [{ u: -0.45, L: 0.80 }, { u: 0.56, L: 0.72 }].map(function (w) {
      var pv = new THREE.Group(); pv.position.set(w.u, -WS_LEN / 2 + 0.05, -0.035); W.add(pv);
      var arm = new THREE.Mesh(K.merge([
        { geo: new THREE.CylinderGeometry(0.022, 0.026, 0.03, 16).rotateX(Math.PI / 2), color: new THREE.Color(0x111214) },
        { geo: K.box(w.L * 0.92, 0.018, 0.012).translate(w.L * 0.46, 0, -0.006), color: new THREE.Color(0x15171a) },
        { geo: K.box(w.L * 0.88, 0.012, 0.02).translate(w.L * 0.50, 0.0, 0.012), color: new THREE.Color(0x060606) }
      ], true), C.M.knob);
      arm.userData.sombra = 'p';
      pv.add(arm);
      B.add('plastic', new THREE.CylinderGeometry(0.035, 0.04, 0.04, 16).rotateX(Math.PI / 2), K.matrix(w.u, -WS_LEN / 2 + 0.05, -0.05), 0x0c0d0e, W);
      return { pivot: pv, L: w.L, u: w.u, prev: 0 };
    });
    // Capas de gotas/suciedad (por fuera) y de vaho (por dentro)
    var rc = document.createElement('canvas'); rc.width = 512; rc.height = 184;
    var rt = new THREE.CanvasTexture(rc); rt.colorSpace = THREE.SRGBColorSpace;
    C.rain = { c: rc, g: rc.getContext('2d'), tex: rt, drops: [], rng: U.rng(99), acc: 0, last: '', stamp: 0 };
    C.rainMesh = new THREE.Mesh(new THREE.PlaneGeometry(WS_W, WS_LEN), new THREE.MeshStandardMaterial({ map: rt, transparent: true, roughness: 0.15, metalness: 0, depthWrite: false, envMapIntensity: 1 }));
    C.rainMesh.position.z = -0.004; C.rainMesh.renderOrder = 1; W.add(C.rainMesh);
    var fc = document.createElement('canvas'); fc.width = 256; fc.height = 96;
    var fg = fc.getContext('2d'), rng = U.rng(5);
    fg.fillStyle = 'rgba(235,238,240,0.82)'; fg.fillRect(0, 0, 256, 96);
    for (var i = 0; i < 2600; i++) { fg.fillStyle = 'rgba(255,255,255,' + (0.05 + rng() * 0.2).toFixed(3) + ')'; fg.beginPath(); fg.arc(rng() * 256, rng() * 96, 0.6 + rng() * 1.8, 0, 7); fg.fill(); }
    var ft = new THREE.CanvasTexture(fc); ft.colorSpace = THREE.SRGBColorSpace;
    C.fogMesh = new THREE.Mesh(new THREE.PlaneGeometry(WS_W, WS_LEN), new THREE.MeshStandardMaterial({ map: ft, transparent: true, opacity: 0, roughness: 0.9, depthWrite: false, envMapIntensity: 0.6 }));
    C.fogMesh.position.z = 0.004; C.fogMesh.renderOrder = 3; W.add(C.fogMesh);
    // Lluvia que cae delante del tren (sólo con lluvia)
    var NR = 700, pos = new Float32Array(NR * 6), r2 = U.rng(31);
    for (var k = 0; k < NR; k++) { pos[k * 6] = -5 + r2() * 10; pos[k * 6 + 1] = 0.5 + r2() * 6; pos[k * 6 + 2] = -18 + r2() * 17.6; }
    var lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    C.rainLines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xc4ccd4, transparent: true, opacity: 0.35, depthWrite: false }));
    C.rainLines.frustumCulled = false; C.rainLines.visible = false; C.group.add(C.rainLines);
  }

  /* ======================= Actualización ======================= */
  function update(C, sim, opts, now) {
    var t = sim.train, aids = opts && opts.aids, pw = TR.controlPower(t);
    var elev = U.sunElevation(sim.clock), night = 1 - U.clamp((elev + 9) / 13, 0, 1);
    var dim = t.controls.dimmer;
    D.speedo(C.displays.speedo, sim, aids);
    D.asfa(C.displays.asfa, sim);
    D.tcms(C.displays.tcms, sim, now);
    D.lamps(C.displays.lamps, sim);
    D.gauge(C.displays.mrtfa, 'DP / TFA', [{ v: t.air.mr, c: '#d22', l: 'DP' }, { v: t.air.tfa, c: '#111', l: 'TFA' }], 12, pw);
    D.gauge(C.displays.bc, 'C. FRENO', [{ v: t.air.bc, c: '#d22', l: 'CF' }], 6, pw);
    D.regulator(C.displays.reg, sim);
    D.paPanel(C.displays.pa, sim, now);
    D.radioPanel(C.displays.radio, sim, now);
    D.hvacPanel(C.displays.hvac, sim);
    D.battery(C.displays.batt, sim);
    D.timetableSheet(C.displays.libro, sim);
    C.controls.forEach(function (c) { if (c.update) c.update(sim, now, pw); });

    // Retroiluminación de rótulos y esferas, y brillo de las pantallas (atenuador)
    var bl = pw ? (0.18 + 0.9 * night) * dim : 0;
    C.plates.forEach(function (p) { p.mat.emissiveIntensity = bl; });
    C.dials.forEach(function (m) { m.emissiveIntensity = pw ? (0.25 + 0.75 * night) * dim : 0; });
    C.screens.forEach(function (m) { m.color.setScalar(pw ? 0.3 + 0.7 * dim : 1); });

    // Alumbrado
    var cl = t.controls.cabLight && pw;
    C.cabLight.intensity = cl ? 2.4 : 0;
    C.M.bucket.lamp.emissiveIntensity = cl ? 2.2 : 0;
    C.deskLight.intensity = t.controls.deskLight && pw ? 1.1 : 0;
    C.M.frosted.emissiveIntensity = (t.elec.auxPower ? 0.55 : t.elec.battery ? 0.12 : 0) * (0.3 + 0.7 * night);

    // Limpiaparabrisas (posición real del núcleo)
    var wa = t.screen.wiperPos * WIPER_SWEEP;
    C.wipers.forEach(function (w) { w.pivot.rotation.z = wa; });
    windscreenLayers(C, sim, wa, now);
  }

  /* Gotas y suciedad que los limpiaparabrisas barren de verdad; vaho por dentro; lluvia fuera. */
  function windscreenLayers(C, sim, wa, now) {
    var t = sim.train, w = t.screen, R = C.rain, rain = (sim.weather && sim.weather.rain) || 0;
    var Wc = R.c.width, Hc = R.c.height, sx = Wc / WS_W, sy = Hc / WS_LEN;
    var dt = Math.min(0.1, (now - (R.stamp || now)) / 1000); R.stamp = now;
    // Gotas nuevas según la lluvia y la velocidad
    if (rain > 0 && dt > 0) {
      R.acc += rain * (40 + Math.abs(t.v) * 9) * dt;
      while (R.acc >= 1 && R.drops.length < 900) { R.acc -= 1; R.drops.push({ x: R.rng() * Wc, y: R.rng() * Hc, r: 0.8 + R.rng() * 2.4 }); }
    } else if (!rain && R.drops.length) R.drops.length = Math.max(0, R.drops.length - Math.ceil(dt * 40));
    // Barrido: se borran las gotas del sector recorrido por cada escobilla desde el último fotograma
    C.wipers.forEach(function (wp) {
      var a0 = Math.min(wp.prev, wa), a1 = Math.max(wp.prev, wa);
      if (a1 - a0 > 1e-4) {
        var cx = (wp.u + WS_W / 2) * sx, cy = (WS_LEN / 2 - (-WS_LEN / 2 + 0.05)) * sy;
        R.drops = R.drops.filter(function (d) {
          var dx = (d.x - cx) / sx, dy = (cy - d.y) / sy, rr = Math.sqrt(dx * dx + dy * dy), an = Math.atan2(dy, dx);
          return !(rr > 0.1 && rr < wp.L && an >= a0 - 0.04 && an <= a1 + 0.04);
        });
      }
      wp.prev = wa;
    });
    var key = R.drops.length + '|' + Math.round(w.dirt * 100) + '|' + Math.round(w.dirtTotal * 100) + '|' + Math.round(w.washWet * 10);
    if (key !== R.last) {
      R.last = key;
      var g = R.g; g.clearRect(0, 0, Wc, Hc);
      // Suciedad: fuera de la zona barrida la acumulada; dentro, la que queda tras limpiar
      var outside = w.dirtTotal * 0.35, inside = w.dirt * 0.35;
      g.fillStyle = 'rgba(120,112,98,' + outside.toFixed(3) + ')'; g.fillRect(0, 0, Wc, Hc);
      C.wipers.forEach(function (wp) {
        var cx = (wp.u + WS_W / 2) * sx, cy = Hc - 0.05 * sy;
        g.save(); g.beginPath(); g.moveTo(cx, cy);
        g.ellipse(cx, cy, wp.L * sx, wp.L * sy, 0, -WIPER_SWEEP, 0); g.closePath(); g.clip();
        g.clearRect(0, 0, Wc, Hc);
        g.fillStyle = 'rgba(120,112,98,' + inside.toFixed(3) + ')'; g.fillRect(0, 0, Wc, Hc);
        if (w.washWet > 0.05) { g.fillStyle = 'rgba(190,215,235,' + (w.washWet * 0.25).toFixed(3) + ')'; g.fillRect(0, 0, Wc, Hc); }
        g.restore();
      });
      R.drops.forEach(function (d) {
        g.fillStyle = 'rgba(40,52,62,0.28)'; g.beginPath(); g.arc(d.x, d.y, d.r, 0, 7); g.fill();
        g.fillStyle = 'rgba(230,240,250,0.55)'; g.beginPath(); g.arc(d.x - d.r * 0.3, d.y - d.r * 0.3, d.r * 0.45, 0, 7); g.fill();
      });
      R.tex.needsUpdate = true;
    }
    C.rainMesh.visible = R.drops.length > 0 || w.dirtTotal > 0.02;
    C.fogMesh.material.opacity = Math.min(0.9, w.fog * 0.95);
    C.fogMesh.visible = w.fog > 0.01;
    // Lluvia cayendo delante (relativa al tren)
    C.rainLines.visible = rain > 0;
    if (rain > 0) {
      var p = C.rainLines.geometry.attributes.position, a = p.array, v = Math.abs(t.v), n = a.length / 6;
      for (var i = 0; i < n; i++) {
        var o = i * 6;
        a[o + 1] -= 9 * dt; a[o + 2] += v * dt;
        if (a[o + 1] < 0.3 || a[o + 2] > -0.4) { a[o + 1] = 6 + (i % 7) * 0.1; a[o + 2] = -18 + ((i * 37) % 100) / 100 * 17; }
        a[o + 3] = a[o]; a[o + 4] = a[o + 1] + 0.28; a[o + 5] = a[o + 2] - Math.min(1.2, v * 0.03);
      }
      p.needsUpdate = true;
      C.rainLines.material.opacity = 0.18 + 0.25 * rain;
    }
  }

  /* Gancho que llama scene3d.js al crear la escena: SÓLO marca castShadow/receiveShadow en las mallas
   * de la cabina (según userData.sombra). No toca el renderizador, el mapa de sombras, la cámara de
   * sombras, el sesgo ni el sol: las sombras globales del sol las configura la escena. Los argumentos
   * se reciben por compatibilidad con la llamada de scene3d, pero no se usan. */
  function shadows(renderer, sun) {
    CABS.forEach(markShadows);
  }

  RC.ui3d = RC.ui3d || {};
  RC.ui3d.cab = { build: build, update: update, shadows: shadows, EYE: EYE, FLOOR: FLOOR };
})(globalThis.RC);
