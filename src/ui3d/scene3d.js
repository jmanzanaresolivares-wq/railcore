/* RAILCORE — Escena 3D: render, cielo físico con hora del día, luces, faros,
 * cámara en primera persona dentro de la cabina (con ratón sobre los mandos) y dos
 * vistas desde fuera: «exterior» (girar alrededor del tren) y «junto a la vía». */
(function (RC) {
  var U = RC.core.util, W3 = RC.ui3d.world;
  var SHADOW_RES = 2048, SHADOW_HALF = 85;   // mapa de sombras de 2048² sobre 170 m × 170 m (≈8 cm por texel)
  var _dir = new THREE.Vector3(), _f = new THREE.Vector3(), _lx = new THREE.Vector3(), _ly = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

  /* Encaja el mapa de sombras del sol alrededor de lo que se ve. El centro se ajusta a la
   * rejilla de texeles del propio mapa para que las sombras no «tiemblen» al moverse. */
  function placeShadow(S, sunDir, ahead) {
    var cam = S.camera;
    cam.getWorldPosition(_f); cam.getWorldDirection(_dir);
    _dir.y = 0; if (_dir.lengthSq() < 1e-6) _dir.set(0, 0, -1); _dir.normalize();
    _f.addScaledVector(_dir, ahead);
    _lx.crossVectors(_up, sunDir).normalize(); _ly.crossVectors(sunDir, _lx);
    var texel = 2 * SHADOW_HALF / SHADOW_RES, a = _f.dot(_lx), b = _f.dot(_ly);
    _f.addScaledVector(_lx, Math.round(a / texel) * texel - a).addScaledVector(_ly, Math.round(b / texel) * texel - b);
    S.sun.target.position.copy(_f); S.sun.target.updateMatrixWorld();
    S.sun.position.copy(_f).addScaledVector(sunDir, 700);
  }

  function create(canvas, sim, send, opts) {
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.6;
    // Sombras del sol (mapa de sombras suave que sigue a la cámara)
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.05, 14000);

    // Cielo de dispersión atmosférica (modelo de Preetham)
    var sky = new THREE.Sky(); sky.scale.setScalar(12000); scene.add(sky);
    var su = sky.material.uniforms;
    su.turbidity.value = 5; su.rayleigh.value = 1.6; su.mieCoefficient.value = 0.006; su.mieDirectionalG.value = 0.82;
    var sunDir = new THREE.Vector3();
    var sun = new THREE.DirectionalLight(0xfff1dc, 1.0); scene.add(sun); scene.add(sun.target);
    sun.castShadow = true;
    sun.shadow.mapSize.set(SHADOW_RES, SHADOW_RES);
    var shc = sun.shadow.camera;
    shc.left = -SHADOW_HALF; shc.right = SHADOW_HALF; shc.top = SHADOW_HALF; shc.bottom = -SHADOW_HALF;
    shc.near = 10; shc.far = 1600; shc.updateProjectionMatrix();
    sun.shadow.bias = -0.00025; sun.shadow.normalBias = 0.035;
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
    // Vistas exteriores: 0 cabina, 1 exterior (órbita), 2 junto a la vía
    var ext = { mode: 0, yaw: 0.62, pitch: 0.14, dist: 30, fov: 34, side: null };
    var S = { renderer: renderer, scene: scene, camera: camera, world: world, cab: cab, rig: rig, sky: sky, sun: sun, hemi: hemi, head: head, look: look, ext: ext, sim: sim, hover: null, active: null, send: send, opts: opts || {} };
    S.traffic = RC.ui3d.traffic ? RC.ui3d.traffic.create(scene, world, sim) : null;
    if (S.traffic && S.traffic.own) [S.traffic.own, S.traffic.ghost].concat(S.traffic.opp).forEach(function (T) { W3.markShadows(T.group); });

    // ---------- Ratón ----------
    var ray = new THREE.Raycaster(), mouse = new THREE.Vector2(), tip = document.getElementById('tip3d');
    var dragLook = null, leverDrag = null;
    function pick(ev) {
      if (ext.mode > 0) return null;
      var r = canvas.getBoundingClientRect();
      mouse.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(mouse, camera);
      var hit = ray.intersectObjects(cab.pickables, false)[0];
      return hit && hit.distance < 3 ? hit.object.userData.ctl : null;
    }
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    canvas.addEventListener('mousedown', function (e) {
      if (!S.sim) return;
      if (ext.mode > 0) { dragLook = { x: e.clientX, y: e.clientY, yaw: ext.yaw, pitch: ext.pitch, ext: true }; return; }
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
      if (dragLook && dragLook.ext) {
        ext.yaw = dragLook.yaw - (e.clientX - dragLook.x) * 0.006;
        ext.pitch = U.clamp(dragLook.pitch + (e.clientY - dragLook.y) * 0.004, 0.02, 1.3);
        tip.style.display = 'none'; return;
      }
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
      var dir = e.deltaY < 0 ? 1 : -1;
      if (ext.mode === 1) { ext.dist = U.clamp(ext.dist * (dir > 0 ? 0.88 : 1.14), 7, 220); return; }
      if (ext.mode === 2) { ext.fov = U.clamp(ext.fov - dir * 4, 12, 70); return; }
      var c = pick(e);
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
    /* Cambia de vista: 0 cabina, 1 exterior, 2 junto a la vía (yaw opcional para la órbita). */
    S.setExterior = function (m, yaw) {
      ext.mode = (m | 0) % 3; ext.side = null;
      if (yaw !== undefined && !isNaN(yaw)) ext.yaw = yaw;
      tip.style.display = 'none';
      canvas.style.cursor = ext.mode ? 'grab' : 'default';
      return VIEW_NAMES[ext.mode];
    };
    S.cycleView = function () { return S.setExterior(ext.mode + 1); };
    S.viewName = function () { return VIEW_NAMES[ext.mode]; };
    return S;
  }

  var VIEW_NAMES = ['Cabina', 'Exterior', 'Junto a la vía'];
  function setSim(S, sim) { S.sim = sim; S.ext.side = null; S.zones = null; }

  function inTunnel(line, x) {
    var t = line.tunnels || [];
    for (var i = 0; i < t.length; i++) if (x > t[i].from - 5 && x < t[i].to + 5) return true;
    return false;
  }
  /* Espacio cerrado alrededor de la vía en x (túnel, estación subterránea o nave de Santa Justa):
   * la cámara exterior se queda dentro para no ver el tren a través de paredes. */
  function enclosure(S, line, x, o2) {
    var Z = S.zones || (S.zones = RC.ui3d.stations ? RC.ui3d.stations.zones(line) : []);
    for (var i = 0; i < Z.length; i++) {
      var z = Z[i];
      if (z.kind === 'shed' && x > z.x0 && x < z.x1 - 4) return { l: o2 - 1.72 - z.pw + 0.6, r: 1.72 + z.pw - 0.6, h: 8.3 };
      if (z.kind === 'underground' && x > z.x0 && x < z.x1) return { l: o2 - 1.72 - z.pw + 0.6, r: 1.72 + z.pw - 0.6, h: 6.5 };
    }
    return inTunnel(line, x) ? { l: o2 - 3.6, r: 3.6, h: 6.3 } : null;
  }
  var _v = new THREE.Vector3(), _w = new THREE.Vector3();
  /* Coloca la cámara de las vistas exteriores (en coordenadas del mundo). */
  function exteriorCamera(S, sim, dt) {
    var E = S.ext, cam = S.camera, al = S.world.al, t = sim.train, line = sim.line;
    var len = S.traffic && S.traffic.own ? S.traffic.own.length : 98.6, off2 = S.world.off2 || function () { return -4.3; };
    var target, pos;
    if (E.mode === 1) {
      var fx = t.x - 14, F = W3.frame(al, fx);
      target = _v.set(F.x, F.y + 2.3, F.z);
      var dx = F.fx * Math.cos(E.yaw) + F.rx * Math.sin(E.yaw), dz = F.fz * Math.cos(E.yaw) + F.rz * Math.sin(E.yaw);
      pos = _w.set(target.x + dx * Math.cos(E.pitch) * E.dist, target.y + Math.sin(E.pitch) * E.dist, target.z + dz * Math.cos(E.pitch) * E.dist);
    } else {
      // junto a la vía: la cámara se adelanta al tren y lo ve pasar; luego salta más adelante
      var v = Math.abs(t.v);
      if (!E.side || t.x - len > E.side.x + 35 || E.side.x - t.x > 900 || t.x < E.side.x - 1400) {
        var ax = t.x + 60 + Math.min(240, v * 6), tun = inTunnel(line, ax);
        E.side = { x: ax, lat: tun ? 3.0 : 6.2, up: 2.3 };
      }
      var Fs = W3.frame(al, E.side.x);
      pos = _w.set(Fs.x + Fs.rx * E.side.lat, Fs.y + E.side.up, Fs.z + Fs.rz * E.side.lat);
      var lx = U.clamp(E.side.x - 6, t.x - len + 8, t.x - 4), Ft = W3.frame(al, lx);
      target = _v.set(Ft.x, Ft.y + 2.2, Ft.z);
    }
    // No meterse bajo tierra ni atravesar las paredes del túnel
    var Fh = W3.frame(al, t.x), xc = t.x + (pos.x - Fh.x) * Fh.fx + (pos.z - Fh.z) * Fh.fz, Fc = W3.frame(al, xc);
    var lat = (pos.x - Fc.x) * Fc.rx + (pos.z - Fc.z) * Fc.rz;
    var box = enclosure(S, line, xc, off2(xc));
    if (box) {
      var lc = U.clamp(lat, box.l, box.r);
      pos.set(Fc.x + Fc.rx * lc, Math.min(Math.max(pos.y, Fc.y + 0.8), Fc.y + box.h), Fc.z + Fc.rz * lc);
    } else {
      var hT = RC.ui3d.realworld && RC.ui3d.realworld.heightAt(S.world, pos.x, pos.z);
      var floorY = Math.max(Fc.y + 0.6, hT === null || hT === undefined ? -1e9 : hT + 1.0);
      if (pos.y < floorY) pos.y = floorY;
    }
    cam.position.copy(pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(target);
    var fov = E.mode === 1 ? 50 : E.fov;
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 8); cam.updateProjectionMatrix(); }
  }


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

    // Cámara: en cabina (mirada suavizada) o fuera del tren
    var exterior = S.ext.mode > 0, cam = S.camera;
    S.cab.group.visible = !exterior;
    var near = exterior ? 0.3 : 0.05;
    if (cam.near !== near) { cam.near = near; cam.updateProjectionMatrix(); }
    if (exterior) {
      if (cam.parent !== S.scene) S.scene.add(cam);
      exteriorCamera(S, sim, dt);
    } else {
      if (cam.parent !== S.rig) { S.rig.add(cam); cam.position.copy(RC.ui3d.cab.EYE); }
      var L = S.look;
      L.yaw += (L.tYaw - L.yaw) * Math.min(1, dt * 10); L.pitch += (L.tPitch - L.pitch) * Math.min(1, dt * 10);
      cam.rotation.set(L.pitch, L.yaw, 0, 'YXZ');
      if (Math.abs(cam.fov - L.fov) > 0.05) { cam.fov += (L.fov - cam.fov) * 0.2; cam.updateProjectionMatrix(); }
    }
    var camPos = exterior ? cam.position : S.rig.position;

    // Sol real según la hora (Sevilla, finales de noviembre): x = este, −z = norte
    var sunP = U.sun(sim.clock), elevDeg = sunP.el;
    var az = THREE.MathUtils.degToRad(sunP.az);
    var el = THREE.MathUtils.degToRad(elevDeg);
    var sunDir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az));
    S.sky.material.uniforms.sunPosition.value.copy(sunDir);
    S.sky.position.copy(S.rig.position);
    var day = U.clamp((elevDeg + 9) / 13, 0, 1);               // 0 noche … 1 día
    var night = 1 - day;
    // Reparto de luz como en un día real: el sol directo manda y el cielo rellena las sombras
    var LC = S.light || (S.light = { sun: 3.0, sky: 0.22, hemi: 0.08, exposure: 0.9 });
    S.sun.intensity = LC.sun * U.clamp((elevDeg + 1) / 10, 0, 1);
    // Sombras sólo con sol: delante de la cabina, o alrededor del tren en las vistas exteriores
    S.sun.castShadow = elevDeg > 0.5 && S.opts.shadows !== false;
    if (S.sun.castShadow) placeShadow(S, sunDir, exterior ? (S.ext.mode === 1 ? S.ext.dist : 60) : 48);
    else { S.sun.position.copy(S.rig.position).addScaledVector(sunDir, 500); S.sun.target.position.copy(S.rig.position); }
    S.sun.color.setHSL(0.08, 0.7, 0.55 + 0.35 * U.clamp(elevDeg / 25, 0, 1));
    S.hemi.intensity = 0.07 + LC.hemi * day;
    S.scene.fog.color.setRGB(0.05 + 0.55 * day, 0.06 + 0.62 * day, 0.10 + 0.68 * day);
    S.scene.fog.density = 0.00022 + 0.0002 * night;
    S.renderer.toneMappingExposure = LC.exposure * (0.62 + 0.38 * day) + 0.25 * night;
    // Mapa de entorno para reflejos (cada cierto tiempo de juego)
    if (Math.abs(sim.clock - S.envAt) > 60 || !S.env) {
      S.envAt = sim.clock;
      var es = S.envSky || (S.envSky = new THREE.Sky());
      if (!S.envScene) {
        S.envScene = new THREE.Scene(); es.scale.setScalar(1000); S.envScene.add(es);
        for (var k in S.sky.material.uniforms) es.material.uniforms[k].value = S.sky.material.uniforms[k].value;
        // El cielo de los reflejos se atenúa: si no, su luz difusa borra las sombras del sol
        es.material.uniforms.envScale = { value: 1 };
        es.material.fragmentShader = 'uniform float envScale;\n' + es.material.fragmentShader.replace('gl_FragColor = vec4( retColor, 1.0 );', 'gl_FragColor = vec4( retColor * envScale, 1.0 );');
        es.material.needsUpdate = true;
      }
      es.material.uniforms.envScale.value = LC.sky;
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

    W3.update(S.world, sim, night, camPos);
    if (S.traffic) RC.ui3d.traffic.update(S.traffic, sim, { night: night, cam: camPos, exterior: exterior });
    if (!exterior) RC.ui3d.cab.update(S.cab, sim, opts, performance.now());
    S.renderer.render(S.scene, S.camera);
  }

  RC.ui3d.scene = { create: create, render: render, setSim: setSim };
})(globalThis.RC);
