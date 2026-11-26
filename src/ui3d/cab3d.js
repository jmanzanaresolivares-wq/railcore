/* RAILCORE — Cabina 3D de la Civia (modelo original inspirado en la disposición
 * real del puesto de conducción; no reproduce planos ni marcas registradas).
 * Coordenadas locales: origen en el carril bajo la testera, X derecha, Y arriba,
 * −Z hacia delante. Cada mando es un objeto 3D que envía órdenes al núcleo y
 * se mueve según el estado REAL del sistema. */
(function (RC) {
  var TR = RC.core.train, D = RC.ui3d.displays;
  var EYE = new THREE.Vector3(0, 2.92, 1.85);

  function mat(color, rough, metal, extra) {
    var p = { color: color, roughness: rough === undefined ? 0.7 : rough, metalness: metal || 0 };
    for (var k in extra || {}) p[k] = extra[k];
    return new THREE.MeshStandardMaterial(p);
  }
  function box(w, h, d, m) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); }

  function labelTex(text, w, h, opts) {
    opts = opts || {};
    return RC.ui3d.world.canvasTex(w || 256, h || 64, function (g, W, H) {
      g.fillStyle = opts.bg || '#1e2125'; g.fillRect(0, 0, W, H);
      g.fillStyle = opts.fg || '#e9edf1';
      var lines = String(text).split('\n');
      var size = Math.round(H / lines.length * (opts.size || 0.5) * lines.length);
      size = Math.min(size, Math.round(H / lines.length * 0.8));
      g.font = 'bold ' + size + 'px Arial, sans-serif';
      var widest = Math.max.apply(null, lines.map(function (l) { return g.measureText(l).width; }));
      if (widest > W * 0.9) { size = Math.floor(size * W * 0.9 / widest); g.font = 'bold ' + size + 'px Arial, sans-serif'; }
      g.textAlign = 'center'; g.textBaseline = 'middle';
      lines.forEach(function (l, i) { g.fillText(l, W / 2, H / 2 + (i - (lines.length - 1) / 2) * size * 1.05); });
    });
  }
  function label(parent, text, u, v, w, opts) {
    var h = w * 0.25 * ((opts && opts.lines) || 1);
    var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: labelTex(text, 256, Math.round(64 * ((opts && opts.lines) || 1)), opts), transparent: false }));
    m.position.set(u, v, 0.002); parent.add(m); return m;
  }

  function build(rig) {
    var cab = new THREE.Group(); rig.add(cab);
    var C = { group: cab, controls: [], pickables: [], displays: {}, panels: {} };
    var T = RC.ui3d.pbr;
    var M = {
      shell: mat(0xc4c7cb, 0.55, 0.05),
      desk: mat(0x2a2e33, 0.82, 0.05),
      deskTop: mat(0x33383e, 0.9, 0.0),
      panel: mat(0x1f2226, 0.75, 0.1),
      trim: mat(0x15171a, 0.6, 0.2),
      floor: T('floor', [3, 3], { color: 0x6c7076, metalness: 0.6 }),
      seat: T('seat', [2, 2], { color: 0x2c3a5a }),
      chrome: mat(0xb9bec4, 0.25, 0.9),
      rubber: mat(0x0c0c0d, 0.95, 0),
      glass: new THREE.MeshPhysicalMaterial({ color: 0x9fb4c0, roughness: 0.05, metalness: 0, transmission: 0, transparent: true, opacity: 0.12, depthWrite: false })
    };
    C.M = M;

    // ---------- Carrocería interior ----------
    var floor = box(2.84, 0.05, 3.2, M.floor); floor.position.set(0, 1.25, 1.35); cab.add(floor);
    var ceil = box(2.84, 0.06, 3.0, M.shell); ceil.position.set(0, 3.52, 1.45); cab.add(ceil);
    // Paredes laterales con ventanas
    [-1, 1].forEach(function (s) {
      var low = box(0.06, 0.95, 3.0, M.shell); low.position.set(1.42 * s, 1.73, 1.45); cab.add(low);
      var top = box(0.06, 0.38, 3.0, M.shell); top.position.set(1.42 * s, 3.33, 1.45); cab.add(top);
      var front = box(0.06, 0.95, 0.5, M.shell); front.position.set(1.42 * s, 2.67, 0.2); cab.add(front);
      var back = box(0.06, 0.95, 1.2, M.shell); back.position.set(1.42 * s, 2.67, 2.35); cab.add(back);
      var gl = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.95), M.glass); gl.position.set(1.43 * s, 2.67, 1.1); gl.rotation.y = Math.PI / 2; cab.add(gl);
      var frame = box(0.08, 0.04, 1.3, M.rubber); frame.position.set(1.40 * s, 2.2, 1.1); cab.add(frame);
      var frame2 = frame.clone(); frame2.position.y = 3.14; cab.add(frame2);
    });
    // Pared trasera con puerta
    var bw = box(2.84, 2.27, 0.06, M.shell); bw.position.set(0, 2.39, 2.95); cab.add(bw);
    var door = box(0.75, 1.95, 0.03, mat(0x9ea3a8, 0.5, 0.2)); door.position.set(0.7, 2.25, 2.91); cab.add(door);
    var handle = box(0.03, 0.18, 0.05, M.chrome); handle.position.set(0.42, 2.2, 2.88); cab.add(handle);
    // Testera bajo el parabrisas
    var nose = box(2.84, 0.95, 0.08, M.shell); nose.position.set(0, 1.72, -0.02); cab.add(nose);

    // Parabrisas inclinado y montantes
    var wsBottom = new THREE.Vector3(0, 2.24, -0.02), wsTop = new THREE.Vector3(0, 3.3, 0.52);
    var wsLen = wsBottom.distanceTo(wsTop), wsAng = Math.atan2(wsTop.z - wsBottom.z, wsTop.y - wsBottom.y);
    var ws = new THREE.Mesh(new THREE.PlaneGeometry(2.7, wsLen), M.glass);
    ws.position.set(0, (wsBottom.y + wsTop.y) / 2, (wsBottom.z + wsTop.z) / 2); ws.rotation.x = -wsAng; cab.add(ws);
    [-1.38, 1.38].forEach(function (x) {
      var p = box(0.14, wsLen + 0.1, 0.12, M.trim); p.position.copy(ws.position); p.position.x = x; p.rotation.x = -wsAng; cab.add(p);
    });
    var header = box(2.84, 0.16, 0.22, M.shell); header.position.set(0, 3.38, 0.55); cab.add(header);
    var sunVisor = box(0.9, 0.02, 0.28, mat(0x2a2f36, 0.4, 0, { transparent: true, opacity: 0.85 })); sunVisor.position.set(-0.05, 3.27, 0.72); sunVisor.rotation.x = 0.25; cab.add(sunVisor);
    // Limpiaparabrisas (giran sobre el cristal)
    C.wipers = [-0.55, 0.65].map(function (x) {
      var pivot = new THREE.Group();
      pivot.position.set(x, 2.27, 0.0); pivot.rotation.x = -wsAng; cab.add(pivot);
      var arm = box(0.025, 0.85, 0.02, M.rubber); arm.position.y = 0.42; arm.position.z = 0.02;
      var arm2 = new THREE.Group(); arm2.add(arm); pivot.add(arm2);
      return arm2;
    });

    // ---------- Pupitre ----------
    // Cuerpo del pupitre
    var deskBody = box(2.3, 0.66, 0.95, M.desk); deskBody.position.set(0, 1.58, 0.62); cab.add(deskBody);
    // Superficie de mandos (casi horizontal, ligeramente inclinada hacia el maquinista)
    var top = new THREE.Group(); top.position.set(0, 1.93, 0.95); top.rotation.x = -Math.PI / 2 + 0.16; cab.add(top);
    var topPlate = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.62), M.deskTop); top.add(topPlate);
    var edge = box(2.32, 0.06, 0.06, M.trim); edge.position.set(0, 1.905, 1.27); cab.add(edge);
    // Panel de instrumentos (inclinado, mirando al maquinista)
    var inst = new THREE.Group(); inst.position.set(0, 2.14, 0.4); inst.rotation.x = -0.7; cab.add(inst);
    var instPlate = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.62), M.panel); inst.add(instPlate);
    var hood = box(2.3, 0.04, 0.3, M.trim); hood.position.set(0, 2.37, 0.2); hood.rotation.x = 0.15; cab.add(hood);
    // Faldón frontal bajo el panel
    var skirt = box(2.3, 0.3, 0.05, M.desk); skirt.position.set(0, 2.02, 0.1); cab.add(skirt);
    // Pedal de hombre muerto (decorativo; se usa el pulsador de vigilancia)
    var pedal = box(0.28, 0.03, 0.22, M.rubber); pedal.position.set(-0.1, 1.32, 1.05); pedal.rotation.x = 0.35; cab.add(pedal);

    // Asiento del maquinista
    var seat = new THREE.Group(); seat.position.set(0, 1.25, 2.05); cab.add(seat);
    var col = box(0.12, 0.45, 0.12, M.chrome); col.position.y = 0.22; seat.add(col);
    var cush = box(0.55, 0.12, 0.52, M.seat); cush.position.y = 0.5; seat.add(cush);
    var backr = box(0.55, 0.75, 0.12, M.seat); backr.position.set(0, 0.95, 0.27); backr.rotation.x = -0.12; seat.add(backr);
    [-1, 1].forEach(function (s) { var arm = box(0.06, 0.06, 0.4, M.rubber); arm.position.set(0.31 * s, 0.75, 0.05); seat.add(arm); });

    // Armario de servicios en la pared izquierda (mirando hacia +X)
    var svc = new THREE.Group(); svc.position.set(-1.37, 2.4, 1.95); svc.rotation.y = Math.PI / 2; cab.add(svc);
    var svcBox = box(1.05, 1.0, 0.1, M.panel); svcBox.position.z = -0.05; svc.add(svcBox);
    label(svc, 'ARMARIO DE SERVICIOS', 0, 0.44, 0.7, { size: 0.42, bg: '#0f1113', fg: '#f2a93b' });

    C.panels = { top: top, inst: inst, svc: svc };

    // ---------- Pantallas ----------
    function screen(parent, key, w, h, u, v, cw, ch) {
      var d = D.make(cw, ch);
      var frame = box(w + 0.03, h + 0.03, 0.025, M.trim); frame.position.set(u, v, 0.006); parent.add(frame);
      var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: d.tex, toneMapped: false }));
      m.position.set(u, v, 0.02); parent.add(m);
      C.displays[key] = d; return m;
    }
    screen(inst, 'lamps', 1.3, 0.075, 0, 0.255, 1024, 64);
    screen(inst, 'mrtfa', 0.21, 0.21, -0.84, 0.03, 384, 384);
    screen(inst, 'speedo', 0.34, 0.34, -0.47, 0.0, 512, 512);
    screen(inst, 'asfa', 0.38, 0.2, 0.03, 0.07, 640, 336);
    screen(inst, 'info', 0.34, 0.27, 0.48, 0.02, 512, 400);
    screen(inst, 'bc', 0.21, 0.21, 0.86, 0.03, 384, 384);
    label(inst, 'DEP. PPAL / TFA', -0.84, -0.12, 0.2, { size: 0.42 });
    label(inst, 'CIL. FRENO', 0.86, -0.12, 0.2, { size: 0.42 });

    // ---------- Fábrica de mandos ----------
    function register(ctrl, meshes) {
      C.controls.push(ctrl);
      meshes.forEach(function (m) { m.userData.ctl = ctrl; C.pickables.push(m); });
      return ctrl;
    }

    function pushButton(parent, o) {
      var g = new THREE.Group(); g.position.set(o.u, o.v, 0); parent.add(g);
      var ring = new THREE.Mesh(new THREE.CylinderGeometry(o.r * 1.35, o.r * 1.35, 0.012, 24), M.chrome); ring.rotation.x = Math.PI / 2; ring.position.z = 0.006; g.add(ring);
      var capMat = mat(o.color, 0.35, 0.05, { emissive: o.color, emissiveIntensity: 0 });
      var cap = new THREE.Mesh(new THREE.CylinderGeometry(o.r, o.r, 0.025, 24), capMat); cap.rotation.x = Math.PI / 2; cap.position.z = 0.02; g.add(cap);
      if (o.text) label(parent, o.text, o.u, o.v - o.r - 0.03, Math.max(0.12, o.r * 3.4), { size: 0.4, lines: o.lines });
      var ctrl = { id: o.id, kind: 'button', name: o.name, group: g, cap: cap, pressedUntil: 0,
        status: o.status || function () { return ''; },
        press: function (sim, send) { ctrl.pressedUntil = performance.now() + 160; o.onPress(sim, send); },
        release: o.onRelease ? function (sim, send) { o.onRelease(sim, send); } : null,
        update: function (sim, now) {
          cap.position.z = now < ctrl.pressedUntil || (o.held && o.held(sim)) ? 0.008 : 0.02;
          var lit = o.lit ? o.lit(sim, now) : 0;
          capMat.emissiveIntensity = lit ? 1.6 : 0.0;
        } };
      return register(ctrl, [cap, ring]);
    }

    function toggle(parent, o) {
      var g = new THREE.Group(); g.position.set(o.u, o.v, 0); parent.add(g);
      var base = box(0.06, 0.09, 0.012, M.chrome); base.position.z = 0.006; g.add(base);
      var pivot = new THREE.Group(); pivot.position.z = 0.012; g.add(pivot);
      var stick = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.01, 0.07, 10), M.chrome); stick.position.y = 0.035; pivot.add(stick);
      var knob = new THREE.Mesh(new THREE.SphereGeometry(0.013, 12, 10), mat(o.color || 0x111111, 0.4)); knob.position.y = 0.072; pivot.add(knob);
      pivot.rotation.x = Math.PI / 2;
      label(parent, o.text, o.u, o.v - 0.115, 0.17, { size: 0.36, lines: o.lines });
      if (o.lamp) {
        var lm = mat(o.lamp, 0.3, 0, { emissive: o.lamp, emissiveIntensity: 0 });
        var lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.01, 16), lm); lamp.rotation.x = Math.PI / 2; lamp.position.set(0.055, 0.02, 0.008); g.add(lamp);
      }
      var ctrl = { id: o.id, kind: 'toggle', name: o.name, group: g, status: o.status,
        press: function (sim, send) { o.onPress(sim, send); },
        update: function (sim) {
          var on = o.state(sim);
          var target = Math.PI / 2 + (on ? -0.55 : 0.55);
          pivot.rotation.x += (target - pivot.rotation.x) * 0.35;
          if (lm) lm.emissiveIntensity = o.lampOn && o.lampOn(sim) ? 1.8 : 0;
        } };
      return register(ctrl, [stick, knob, base]);
    }

    function rotary(parent, o) {
      var g = new THREE.Group(); g.position.set(o.u, o.v, 0); parent.add(g);
      var plate = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.006, 28), M.trim); plate.rotation.x = Math.PI / 2; g.add(plate);
      var knobG = new THREE.Group(); knobG.position.z = 0.006; g.add(knobG);
      var knob = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.03, 20), mat(o.color || 0x1a1a1a, 0.45)); knob.rotation.x = Math.PI / 2; knob.position.z = 0.015; knobG.add(knob);
      var ptr = box(0.008, 0.05, 0.012, o.key ? M.chrome : mat(0xffffff, 0.4)); ptr.position.set(0, 0.0, 0.034); knobG.add(ptr);
      if (o.key) { var bow = box(0.04, 0.035, 0.006, M.chrome); bow.position.set(0, 0.03, 0.05); knobG.add(bow); }
      // Marcas de posición
      o.positions.forEach(function (p) {
        var a = p.angle;
        var t = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.016), new THREE.MeshBasicMaterial({ map: labelTex(p.text, 128, 40, { size: 0.65, bg: '#1f2226' }) }));
        t.position.set(Math.sin(-a) * 0.068, Math.cos(a) * 0.068, 0.004); parent.add(t); t.position.add(g.position);
      });
      label(parent, o.text, o.u, o.v - 0.11, 0.17, { size: 0.36 });
      var ctrl = { id: o.id, kind: 'rotary', name: o.name, group: g, status: o.status,
        press: function (sim, send, dir) { o.onStep(sim, send, dir || 1); },
        wheel: function (sim, send, dir) { o.onStep(sim, send, dir); },
        update: function (sim) {
          var idx = o.index(sim), a = o.positions[idx] ? o.positions[idx].angle : 0;
          knobG.rotation.z += (a - knobG.rotation.z) * 0.35;
        } };
      return register(ctrl, [knob, ptr, plate]);
    }

    // ---------- Mandos del pupitre ----------
    var P = C.panels.top;
    // Manipulador combinado tracción/freno
    (function () {
      var g = new THREE.Group(); g.position.set(-0.55, 0.02, 0); P.add(g);
      var gate = box(0.12, 0.36, 0.02, M.trim); gate.position.z = 0.01; g.add(gate);
      var slot = box(0.025, 0.32, 0.022, M.rubber); slot.position.z = 0.012; g.add(slot);
      // Escala de posiciones
      var scale = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.34), new THREE.MeshBasicMaterial({ map: RC.ui3d.world.canvasTex(96, 512, function (gg, W, H) {
        gg.fillStyle = '#1f2226'; gg.fillRect(0, 0, W, H); gg.font = 'bold 22px Arial'; gg.textAlign = 'left'; gg.textBaseline = 'middle';
        for (var n = 6; n >= -8; n--) {
          var y = H * (0.04 + (6 - n) / 14 * 0.92);
          gg.fillStyle = n > 0 ? '#7cf0a8' : n === 0 ? '#ffffff' : n === -8 ? '#ff4d4d' : '#ffb070';
          gg.fillText(n > 0 ? 'T' + n : n === 0 ? '0' : n === -8 ? 'EM' : 'F' + (-n), 6, y);
        }
      }) }));
      scale.position.set(0.1, 0, 0.004); g.add(scale);
      var pivot = new THREE.Group(); pivot.position.z = 0.02; g.add(pivot);
      var arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.2, 12), M.chrome); arm.rotation.x = Math.PI / 2; arm.position.z = 0.1; pivot.add(arm);
      var grip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 20), mat(0x101010, 0.6)); grip.rotation.z = Math.PI / 2; grip.position.z = 0.2; pivot.add(grip);
      var cap = new THREE.Mesh(new THREE.SphereGeometry(0.031, 16, 12), mat(0xb8222a, 0.4)); cap.position.set(-0.06, 0, 0.2); pivot.add(cap);
      label(P, 'MANIPULADOR\nTRACCIÓN / FRENO', -0.55, -0.24, 0.2, { size: 0.32, lines: 2 });
      var ctrl = { id: 'lever', kind: 'lever', name: 'Manipulador combinado',
        status: function (sim) { var l = sim.train.controls.lever; return l > 0 ? 'Tracción T' + l : l === 0 ? 'Neutro' : l === -8 ? 'EMERGENCIA' : 'Freno F' + (-l); },
        press: function (sim, send, dir) { send({ type: 'leverStep', delta: dir || 1 }); },
        wheel: function (sim, send, dir) { send({ type: 'leverStep', delta: dir }); },
        drag: true,
        update: function (sim) {
          var l = sim.train.controls.lever, target = -l / 8 * 0.75;
          pivot.rotation.x += (target - pivot.rotation.x) * 0.3;
        } };
      register(ctrl, [arm, grip, cap, gate]);
    })();
    rotary(P, { id: 'reverser', name: 'Inversor (llave)', u: -0.86, v: 0.1, key: true, text: 'INVERSOR',
      positions: [{ text: 'AT', angle: 0.8 }, { text: '0', angle: 0 }, { text: 'AD', angle: -0.8 }],
      index: function (sim) { return sim.train.controls.reverser + 1; },
      status: function (sim) { return ['Atrás', 'Neutro', 'Adelante'][sim.train.controls.reverser + 1]; },
      onStep: function (sim, send, dir) { send({ type: 'reverser', pos: Math.max(-1, Math.min(1, sim.train.controls.reverser + dir)) }); } });
    pushButton(P, { id: 'parking', name: 'Freno de estacionamiento', u: -0.86, v: -0.13, r: 0.022, color: 0xd02020, text: 'F. ESTAC.',
      lit: function (sim) { return TR.controlPower(sim.train) && sim.train.air.parking; },
      status: function (sim) { return sim.train.air.parking ? 'Aplicado (pulse para aflojar)' : 'Aflojado (pulse para aplicar)'; },
      onPress: function (sim, send) { send({ type: 'parking', apply: !sim.train.air.parking }); } });
    pushButton(P, { id: 'vigil', name: 'Vigilancia (hombre muerto)', u: -0.27, v: -0.14, r: 0.035, color: 0xf2b01e, text: 'VIGILANCIA',
      lit: function (sim, now) { return (sim.vigil.warning || sim.vigil.emergency) && Math.floor(now / 250) % 2; },
      status: function (sim) { return sim.vigil.warning ? '¡PULSE YA!' : sim.vigil.emergency ? 'Actuado: pulse con el tren parado' : 'En reposo'; },
      onPress: function (sim, send) { send({ type: 'vigil' }); } });
    pushButton(P, { id: 'horn', name: 'Bocina', u: -0.08, v: -0.14, r: 0.028, color: 0x2a2a2a, text: 'BOCINA',
      held: function (sim) { return sim.train.controls.horn; },
      onPress: function (sim, send) { send({ type: 'horn', on: true }); },
      onRelease: function (sim, send) { send({ type: 'horn', on: false }); } });
    pushButton(P, { id: 'emReset', name: 'Rearme de emergencia', u: 0.13, v: -0.14, r: 0.024, color: 0x2b6fd6, text: 'REARME\nEMERG.', lines: 2,
      lit: function (sim) { return sim.train.emergency.active && TR.stopped(sim.train); },
      status: function (sim) { return sim.train.emergency.active ? 'Emergencia activa' : 'Sin emergencia'; },
      onPress: function (sim, send) { send({ type: 'emergencyReset' }); } });
    // Seta de emergencia
    (function () {
      var g = new THREE.Group(); g.position.set(0.15, 0.13, 0); P.add(g);
      var base = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.03, 24), mat(0xf2c200, 0.5)); base.rotation.x = Math.PI / 2; base.position.z = 0.015; g.add(base);
      var stem = new THREE.Group(); g.add(stem);
      var head = new THREE.Mesh(new THREE.SphereGeometry(0.055, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xd01010, 0.35)); head.rotation.x = Math.PI / 2; head.position.z = 0.05; stem.add(head);
      label(P, 'SETA EMERGENCIA', 0.15, 0.04, 0.17, { size: 0.36, bg: '#5a0d0d' });
      register({ id: 'seta', kind: 'button', name: 'Seta de emergencia',
        status: function (sim) { return sim.train.controls.seta ? 'PULSADA (pulse para rearmar)' : 'En reposo'; },
        press: function (sim, send) { send({ type: 'seta', on: !sim.train.controls.seta }); },
        update: function (sim) { stem.position.z = sim.train.controls.seta ? -0.02 : 0; } }, [head, base]);
    })();
    // Puertas
    pushButton(P, { id: 'doorL', name: 'Abrir puertas izquierda', u: 0.45, v: 0.13, r: 0.026, color: 0x16a34a, text: 'ABRIR IZQ.',
      lit: function (sim) { return sim.train.doors.left > 0; }, status: function (sim) { return sim.train.doors.left >= 1 ? 'Abiertas' : sim.train.doors.left > 0 ? 'Moviéndose' : 'Cerradas'; },
      onPress: function (sim, send) { send({ type: 'doors', side: 'left', action: 'open' }); } });
    pushButton(P, { id: 'doorC', name: 'Cerrar puertas', u: 0.62, v: 0.13, r: 0.026, color: 0xd97706, text: 'CERRAR',
      lit: function (sim) { return TR.controlPower(sim.train) && TR.doorsClosed(sim.train); }, status: function (sim) { return TR.doorsClosed(sim.train) ? 'Puertas cerradas y enclavadas' : 'Puertas abiertas'; },
      onPress: function (sim, send) { send({ type: 'doors', action: 'close' }); } });
    pushButton(P, { id: 'doorR', name: 'Abrir puertas derecha', u: 0.79, v: 0.13, r: 0.026, color: 0x16a34a, text: 'ABRIR DER.',
      lit: function (sim) { return sim.train.doors.right > 0; }, status: function (sim) { return sim.train.doors.right >= 1 ? 'Abiertas' : sim.train.doors.right > 0 ? 'Moviéndose' : 'Cerradas'; },
      onPress: function (sim, send) { send({ type: 'doors', side: 'right', action: 'open' }); } });
    rotary(P, { id: 'lights', name: 'Faros', u: 0.45, v: -0.11, text: 'FAROS',
      positions: [{ text: '0', angle: 0.7 }, { text: 'CR', angle: 0 }, { text: 'LG', angle: -0.7 }],
      index: function (sim) { return sim.train.controls.headlights; },
      status: function (sim) { return ['Apagados', 'Cruce', 'Largo alcance'][sim.train.controls.headlights]; },
      onStep: function (sim, send, dir) { send({ type: 'headlights', mode: Math.max(0, Math.min(2, sim.train.controls.headlights + dir)) }); } });
    toggle(P, { id: 'wipers', name: 'Limpiaparabrisas', u: 0.62, v: -0.1, text: 'LIMPIA', state: function (sim) { return sim.train.controls.wipers; },
      status: function (sim) { return sim.train.controls.wipers ? 'En marcha' : 'Parado'; }, onPress: function (sim, send) { send({ type: 'wipers', on: !sim.train.controls.wipers }); } });
    toggle(P, { id: 'cabLight', name: 'Alumbrado de cabina', u: 0.79, v: -0.1, text: 'LUZ CABINA', state: function (sim) { return sim.train.controls.cabLight; },
      status: function (sim) { return sim.train.controls.cabLight ? 'Encendido' : 'Apagado'; }, onPress: function (sim, send) { send({ type: 'cabLight', on: !sim.train.controls.cabLight }); } });

    // ---------- Pulsadores ASFA (bajo su pantalla) ----------
    var I = C.panels.inst;
    [['conex', 'CONEXIÓN', 0x1f6feb, 'asfa:conex', function (s) { return s.asfa.connected; }],
     ['rec', 'RECONOC.', 0xf2b01e, 'asfa:recAnPar', function (s, now) { return s.asfa.pendingRec && Math.floor(now / 200) % 2; }],
     ['rebase', 'REBASE', 0xe5e7eb, 'asfa:rebase', function (s) { return s.asfa.rebaseRemaining > 0; }],
     ['rearme', 'REARME FR.', 0xdc2626, 'asfa:rearme', function (s, now) { return s.asfa.emergency && Math.floor(now / 300) % 2; }]].forEach(function (b, i) {
      pushButton(I, { id: 'asfa-' + b[0], name: 'ASFA · ' + b[1], u: -0.12 + i * 0.1, v: -0.12, r: 0.02, color: b[2], text: b[1],
        lit: function (sim, now) { return TR.cabActive(sim.train) && b[4](sim, now); },
        status: function (sim) { return sim.asfa.testing > 0 ? 'Autotest…' : sim.asfa.connected ? 'ASFA conectado' : 'ASFA desconectado'; },
        onPress: function (sim, send) { send({ type: b[3] }); } });
    });

    // ---------- Armario de servicios ----------
    var S = C.panels.svc;
    var svcItems = [
      { id: 'battery', name: 'Baterías', text: 'BATERÍAS', state: function (s) { return s.train.elec.battery; }, cmd: function (s) { return { type: 'battery', on: !s.train.elec.battery }; }, status: function (s) { return s.train.elec.battery ? 'Conectadas ' + s.train.elec.battV + ' V' : 'Desconectadas'; }, lamp: 0x2bff7a, lampOn: function (s) { return s.train.elec.battery; } },
      { id: 'cabKey', name: 'Llave de cabina', text: 'LLAVE CABINA', key: true, state: function (s) { return s.train.elec.cabKey; }, cmd: function (s) { return { type: 'cabKey', on: !s.train.elec.cabKey }; }, status: function (s) { return s.train.elec.cabKey ? 'Cabina habilitada' : 'Retirada'; } },
      { id: 'aux', name: 'Compresor auxiliar', text: 'COMPRESOR\nAUXILIAR', state: function (s) { return s.train.elec.auxCompressor; }, cmd: function (s) { return { type: 'auxCompressor', on: !s.train.elec.auxCompressor }; }, status: function (s) { return (s.train.elec.auxCompressor ? 'En marcha' : 'Parado') + ' · dep. pantógrafo ' + s.train.air.panto.toFixed(1) + ' bar'; }, lamp: 0xffc72b, lampOn: function (s) { return s.train.elec.auxCompressor; } },
      { id: 'panto', name: 'Pantógrafo', text: 'PANTÓGRAFO', state: function (s) { return s.train.elec.pantoCmd; }, cmd: function (s) { return { type: 'panto', up: !s.train.elec.pantoCmd }; }, status: function (s) { var p = s.train.elec.pantoPos; return p >= 1 ? 'Arriba (en contacto)' : p > 0 ? 'En movimiento' : 'Abajo'; }, lamp: 0x2bff7a, lampOn: function (s) { return s.train.elec.pantoPos >= 1; } },
      { id: 'disy', name: 'Disyuntor', text: 'DISYUNTOR', state: function (s) { return s.train.elec.disyuntor; }, cmd: function (s) { return { type: 'disyuntor', close: !s.train.elec.disyuntor }; }, status: function (s) { return s.train.elec.disyuntor ? 'Cerrado' : 'Abierto'; }, lamp: 0x2bff7a, lampOn: function (s) { return s.train.elec.disyuntor; } },
      { id: 'comp', name: 'Compresor principal', text: 'COMPRESOR\nPRINCIPAL', state: function (s) { return s.train.elec.mainCompSwitch === 'auto'; }, cmd: function (s) { return { type: 'mainCompressor', mode: s.train.elec.mainCompSwitch === 'auto' ? 'off' : 'auto' }; }, status: function (s) { return (s.train.elec.mainCompSwitch === 'auto' ? 'Automático' : 'Desconectado') + (s.train.elec.mainCompRunning ? ' · comprimiendo' : '') + ' · dep. principal ' + s.train.air.mr.toFixed(1) + ' bar'; }, lamp: 0xffc72b, lampOn: function (s) { return s.train.elec.mainCompRunning; } }
    ];
    svcItems.forEach(function (it, i) {
      var u = -0.3 + (i % 2) * 0.6, v = 0.22 - Math.floor(i / 2) * 0.28;
      if (it.key) {
        rotary(S, { id: it.id, name: it.name, u: u, v: v, key: true, text: it.text,
          positions: [{ text: 'OFF', angle: 0.6 }, { text: 'ON', angle: -0.6 }],
          index: function (s) { return it.state(s) ? 1 : 0; }, status: it.status,
          onStep: function (s, send) { send(it.cmd(s)); } });
      } else {
        toggle(S, { id: it.id, name: it.name, u: u, v: v, text: it.text, lines: it.text.indexOf('\n') >= 0 ? 2 : 1, state: it.state, status: it.status, lamp: it.lamp, lampOn: it.lampOn,
          onPress: function (s, send) { send(it.cmd(s)); } });
      }
    });

    // Luz de cabina
    C.cabLight = new THREE.PointLight(0xffe7c2, 0, 5, 1.6); C.cabLight.position.set(0, 3.35, 1.3); cab.add(C.cabLight);
    // Iluminación de instrumentos (siempre suave cuando hay tensión)
    C.panelLight = new THREE.PointLight(0x9fc4ff, 0, 1.6, 2); C.panelLight.position.set(0, 2.6, 0.9); cab.add(C.panelLight);
    return C;
  }

  function update(C, sim, opts, now) {
    var t = sim.train, aids = opts && opts.aids;
    D.speedo(C.displays.speedo, sim, aids);
    D.asfa(C.displays.asfa, sim);
    D.info(C.displays.info, sim);
    D.lamps(C.displays.lamps, sim);
    D.gauge(C.displays.mrtfa, 'DEP / TFA', [{ v: t.air.mr, c: '#d22', l: 'DP' }, { v: t.air.tfa, c: '#111', l: 'TFA' }], 12);
    D.gauge(C.displays.bc, 'CIL. FRENO', [{ v: t.air.bc, c: '#d22', l: 'CF' }], 6);
    C.controls.forEach(function (c) { if (c.update) c.update(sim, now); });
    var power = TR.controlPower(t);
    C.cabLight.intensity = t.controls.cabLight && power ? 2.2 : 0;
    C.panelLight.intensity = power ? 0.35 : 0;
    // Limpiaparabrisas
    var wa = t.controls.wipers ? Math.sin(now / 1000 * 2.6) * 0.75 : 0.95;
    C.wipers.forEach(function (w, i) { w.rotation.z += ((i ? -wa : wa) - w.rotation.z) * 0.25; });
  }

  RC.ui3d = RC.ui3d || {};
  RC.ui3d.cab = { build: build, update: update, EYE: EYE };
})(globalThis.RC);
