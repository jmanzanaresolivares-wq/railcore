/* RAILCORE — Escena 3D: render, cielo físico con hora del día, luces, faros,
 * cámara en primera persona dentro de la cabina, y ratón sobre los mandos. */
(function (RC) {
  var U = RC.core.util, W3 = RC.ui3d.world;

  function create(canvas, sim, send, opts) {
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.6;

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.05, 14000);

    // Cielo de dispersión atmosférica (modelo de Preetham)
    var sky = new THREE.Sky(); sky.scale.setScalar(12000); scene.add(sky);
    var su = sky.material.uniforms;
    su.turbidity.value = 5; su.rayleigh.value = 1.6; su.mieCoefficient.value = 0.006; su.mieDirectionalG.value = 0.82;
    var sunDir = new THREE.Vector3();
    var sun = new THREE.DirectionalLight(0xfff1dc, 1.0); scene.add(sun); scene.add(sun.target);
    var hemi = new THREE.HemisphereLight(0xbfd6ff, 0x4a4632, 0.6); scene.add(hemi);
    scene.fog = new THREE.FogExp2(0x9fb0c0, 0.00028);

    var world = W3.build(scene, sim);
    var rig = new THREE.Group(); scene.add(rig);
    var cab = RC.ui3d.cab.build(rig);
    rig.add(camera); camera.position.copy(RC.ui3d.cab.EYE);

    // Faros
    var head = new THREE.SpotLight(0xfff4dd, 0, 420, 0.32, 0.55, 1.2);
    head.position.set(0, 1.3, -0.3); rig.add(head);
    head.target.position.set(0, 0.0, -80); rig.add(head.target);

    var look = { yaw: 0, pitch: -0.3, tYaw: 0, tPitch: -0.3, fov: 66 };
    var S = { renderer: renderer, scene: scene, camera: camera, world: world, cab: cab, rig: rig, sky: sky, sun: sun, hemi: hemi, head: head, look: look, sim: sim, hover: null, active: null, send: send, opts: opts || {} };

    // ---------- Ratón ----------
    var ray = new THREE.Raycaster(), mouse = new THREE.Vector2(), tip = document.getElementById('tip3d');
    var dragLook = null, leverDrag = null;
    function pick(ev) {
      var r = canvas.getBoundingClientRect();
      mouse.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(mouse, camera);
      var hit = ray.intersectObjects(cab.pickables, false)[0];
      return hit && hit.distance < 3 ? hit.object.userData.ctl : null;
    }
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    canvas.addEventListener('mousedown', function (e) {
      if (!S.sim) return;
      if (e.button === 2 || e.button === 1) { dragLook = { x: e.clientX, y: e.clientY, yaw: look.tYaw, pitch: look.tPitch }; return; }
      var c = pick(e);
      if (!c) { dragLook = { x: e.clientX, y: e.clientY, yaw: look.tYaw, pitch: look.tPitch, left: true }; return; }
      S.active = c;
      if (c.kind === 'lever') { leverDrag = { y: e.clientY, acc: 0 }; return; }
      if (c.kind === 'rotary') { c.press(S.sim, S.send, e.shiftKey ? -1 : 1); return; }
      c.press(S.sim, S.send, 1);
    });
    window.addEventListener('mouseup', function () {
      if (S.active && S.active.release && S.sim) S.active.release(S.sim, S.send);
      S.active = null; dragLook = null; leverDrag = null;
    });
    canvas.addEventListener('mousemove', function (e) {
      if (dragLook) {
        look.tYaw = U.clamp(dragLook.yaw + (e.clientX - dragLook.x) * 0.004, -1.9, 1.3);
        look.tPitch = U.clamp(dragLook.pitch + (e.clientY - dragLook.y) * 0.004, -1.1, 0.5);
        tip.style.display = 'none'; return;
      }
      if (leverDrag && S.sim) {
        leverDrag.acc += (leverDrag.y - e.clientY); leverDrag.y = e.clientY;
        while (leverDrag.acc > 22) { S.send({ type: 'leverStep', delta: 1 }); leverDrag.acc -= 22; }
        while (leverDrag.acc < -22) { S.send({ type: 'leverStep', delta: -1 }); leverDrag.acc += 22; }
        return;
      }
      var c = S.sim ? pick(e) : null;
      S.hover = c;
      canvas.style.cursor = c ? 'pointer' : 'grab';
      if (c) {
        var st = c.status ? c.status(S.sim) : '';
        tip.innerHTML = '<b>' + c.name + '</b>' + (st ? '<br>' + st : '') + '<br><span>' + hint(c) + '</span>';
        tip.style.display = 'block'; tip.style.left = (e.clientX + 16) + 'px'; tip.style.top = (e.clientY + 14) + 'px';
      } else tip.style.display = 'none';
    });
    canvas.addEventListener('mouseleave', function () { tip.style.display = 'none'; });
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      if (!S.sim) return;
      var c = pick(e), dir = e.deltaY < 0 ? 1 : -1;
      if (c && c.wheel) { c.wheel(S.sim, S.send, dir); return; }
      look.fov = U.clamp(look.fov - dir * 4, 28, 75);
    }, { passive: false });
    function hint(c) {
      if (c.kind === 'lever') return 'Arrastre arriba/abajo o rueda del ratón (W/S)';
      if (c.kind === 'rotary') return 'Clic gira a la derecha · Mayús+clic a la izquierda · rueda';
      return 'Clic para accionar';
    }

    S.setView = function (n) {
      var v = [[0, -0.3], [1.3, -0.3], [0, -0.85], [-0.75, -0.2]][n] || [0, -0.3];
      look.tYaw = v[0]; look.tPitch = v[1];
    };
    return S;
  }

  function setSim(S, sim) { S.sim = sim; }


  function render(S, sim, opts, dt, realTime) {
    var cv = S.renderer.domElement, r = cv.getBoundingClientRect();
    var w = Math.max(2, Math.round(r.width)), h = Math.max(2, Math.round(r.height));
    var sz = S.renderer.getSize(new THREE.Vector2());
    if (sz.x !== w || sz.y !== h) { S.renderer.setSize(w, h, false); S.camera.aspect = w / h; S.camera.updateProjectionMatrix(); }

    var t = sim.train, F = W3.frame(S.world.al, t.x);
    // Movimiento del tren: posición, orientación y pequeños balanceos
    var v = Math.abs(t.v);
    var bounce = Math.sin(realTime * 9.1) * 0.004 * Math.min(1, v / 20) + Math.sin(realTime * 2.3) * 0.006 * Math.min(1, v / 30);
    S.rig.position.set(F.x, F.y + bounce, F.z);
    var pitchAcc = U.clamp(-t.a * 0.004, -0.006, 0.006);
    S.rig.rotation.set(pitchAcc, -F.heading, Math.sin(realTime * 1.3) * 0.004 * Math.min(1, v / 25), 'YXZ');

    // Cámara (mirada suavizada)
    var L = S.look;
    L.yaw += (L.tYaw - L.yaw) * Math.min(1, dt * 10); L.pitch += (L.tPitch - L.pitch) * Math.min(1, dt * 10);
    S.camera.rotation.set(L.pitch, L.yaw, 0, 'YXZ');
    if (Math.abs(S.camera.fov - L.fov) > 0.05) { S.camera.fov += (L.fov - S.camera.fov) * 0.2; S.camera.updateProjectionMatrix(); }

    // Sol según la hora (Sevilla, finales de noviembre, aprox.)
    var elevDeg = U.sunElevation(sim.clock);
    var az = THREE.MathUtils.degToRad(118);                     // este-sureste respecto al trazado
    var el = THREE.MathUtils.degToRad(elevDeg);
    var sunDir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az));
    S.sky.material.uniforms.sunPosition.value.copy(sunDir);
    S.sky.position.copy(S.rig.position);
    var day = U.clamp((elevDeg + 9) / 13, 0, 1);               // 0 noche … 1 día
    var night = 1 - day;
    S.sun.position.copy(S.rig.position).addScaledVector(sunDir, 500);
    S.sun.target.position.copy(S.rig.position);
    S.sun.intensity = 1.7 * U.clamp((elevDeg + 1) / 10, 0, 1);
    S.sun.color.setHSL(0.08, 0.7, 0.55 + 0.35 * U.clamp(elevDeg / 25, 0, 1));
    S.hemi.intensity = 0.16 + 0.32 * day;
    S.scene.fog.color.setRGB(0.05 + 0.55 * day, 0.06 + 0.62 * day, 0.10 + 0.68 * day);
    S.scene.fog.density = 0.00022 + 0.0002 * night;
    S.renderer.toneMappingExposure = 0.42 + 0.06 * day + 0.3 * night;
    // Mapa de entorno para reflejos (cada cierto tiempo de juego)
    if (Math.abs(sim.clock - S.envAt) > 60 || !S.env) {
      S.envAt = sim.clock;
      var es = S.envSky || (S.envSky = new THREE.Sky());
      if (!S.envScene) { S.envScene = new THREE.Scene(); es.scale.setScalar(1000); S.envScene.add(es); for (var k in S.sky.material.uniforms) es.material.uniforms[k].value = S.sky.material.uniforms[k].value; }
      es.material.uniforms.sunPosition.value.copy(sunDir);
      if (S.env) S.env.dispose();
      S.pm = S.pm || new THREE.PMREMGenerator(S.renderer);
      S.env = S.pm.fromScene(S.envScene).texture;
      S.scene.environment = S.env;
    }
    // Faros
    var hl = t.controls.headlights, power = RC.core.train.controlPower(t);
    S.head.intensity = power && hl ? (hl === 2 ? 900 : 380) * (0.3 + night) : 0;
    S.head.distance = hl === 2 ? 700 : 300;

    W3.update(S.world, sim, night);
    RC.ui3d.cab.update(S.cab, sim, opts, performance.now());
    S.renderer.render(S.scene, S.camera);
  }

  RC.ui3d.scene = { create: create, render: render, setSim: setSim };
})(globalThis.RC);
