/* RAILCORE — Trenes en la vía (sólo presentación: lee la simulación, nunca la modifica).
 *  - El tren propio visto desde fuera (vistas «exterior» y «junto a la vía»).
 *  - El tren precedente de la simulación (vía 1), con puertas que se abren en los andenes.
 *  - Trenes en sentido contrario por la vía 2 (Utrera → Santa Justa). Son ambiente
 *    determinista: salen de Utrera cada 20 minutos, paran en todas las estaciones y
 *    abren las puertas del lado del andén. No intervienen en la señalización. */
(function (RC) {
  var HEADWAY = 1200, DWELL = 30, PHASE = 437, POOL = 3;

  function smooth(f) { return f * f * (3 - 2 * f); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  /* Apertura de puertas (0…1) durante una parada: abren a los 3 s de llegar y cierran 3 s antes de salir. */
  function doorF(t, arr, dep) { return clamp((t - arr - 3) / 3, 0, 1) * clamp((dep - 3 - t) / 3, 0, 1); }

  /* ---------- Horario de los trenes en sentido contrario ---------- */
  var planCache = null, planKey = null;
  function oppPlan(line) {
    if (planKey === line.stations && planCache) return planCache;
    var st = line.stations || [], plan = [];
    for (var i = st.length - 1; i >= 0; i--) {
      var s = st[i], hx = s.stopX - s.platformLength + 2;   // cabeza junto al extremo del andén
      if (!plan.length) { plan.push({ idx: i, x: hx, arr: -150, dep: 0, island: s.side === 'izquierda' }); continue; }
      var p = plan[plan.length - 1], arr = p.dep + 45 + Math.abs(p.x - hx) / 22;
      plan.push({ idx: i, x: hx, arr: arr, dep: arr + (i === 0 ? 120 : DWELL), island: s.side === 'izquierda' });
    }
    planKey = line.stations; planCache = plan;
    return plan;
  }
  /* Estado del tren k (sale de Utrera a PHASE + k·HEADWAY) en el instante c. */
  function oppState(line, k, c) {
    var plan = oppPlan(line), tau = c - (PHASE + k * HEADWAY), last = plan[plan.length - 1];
    if (!plan.length || tau < plan[0].arr || tau > last.dep) return null;
    for (var i = 0; i < plan.length; i++) {
      var p = plan[i], q = plan[i + 1];
      if (tau >= p.arr && tau <= p.dep) return { x: p.x, door: doorF(tau, p.arr, p.dep), island: p.island, at: p.idx };
      if (q && tau > p.dep && tau < q.arr) return { x: p.x + (q.x - p.x) * smooth((tau - p.dep) / (q.arr - p.dep)), door: 0, island: false, at: -1 };
    }
    return null;
  }
  function oppActive(line, c) {
    var plan = oppPlan(line), out = [];
    if (!plan.length) return out;
    var last = plan[plan.length - 1];
    var k0 = Math.ceil((c - last.dep - PHASE) / HEADWAY), k1 = Math.floor((c - plan[0].arr - PHASE) / HEADWAY);
    for (var k = k0; k <= k1; k++) out.push(k);
    return out;
  }
  /* Próxima salida hacia Santa Justa desde la estación idx (en Santa Justa, la próxima llegada). */
  function nextOpposite(line, idx, c, skip) {
    var plan = oppPlan(line), p = null;
    plan.forEach(function (q) { if (q.idx === idx) p = q; });
    if (!p) return null;
    var ref = p.idx === 0 ? p.arr : p.dep;
    var k = Math.ceil((c - ref - PHASE) / HEADWAY) + (skip || 0);
    return PHASE + k * HEADWAY + ref;
  }

  /* Puertas del tren precedente cuando está parado en una estación. */
  function ghostDoors(sim, g) {
    var tt = g.tt || [], c = sim.clock;
    for (var i = 0; i < tt.length; i++) {
      var r = tt[i];
      if (Math.abs(g.x - r.x) > 1) continue;
      var arr = r.arr === null ? r.dep - 600 : r.arr, dep = r.dep === null ? arr + 90 : r.dep;
      if (c < arr || c > dep) continue;
      var f = doorF(c, arr, dep), st = sim.line.stations[i], right = !st || st.side === 'derecha';
      return { l: right ? 0 : f, r: right ? f : 0 };
    }
    return { l: 0, r: 0 };
  }

  /* ---------- Creación y actualización ---------- */
  function create(scene, W, sim) {
    var E = RC.ui3d.emu, TR = { W: W, E: E, own: null, ghost: null, opp: [] };
    if (!E) return TR;
    var sts = sim.line.stations, last = sts[sts.length - 1], first = sts[0];
    function shortName(n) { return String(n).replace(/^Sevilla-/, ''); }
    TR.own = E.create({ cars: 5, dest: shortName(last.name) });
    TR.ghost = E.create({ cars: 5, dest: shortName(last.name) });
    [TR.own, TR.ghost].forEach(function (T) { T.group.visible = false; scene.add(T.group); });
    for (var i = 0; i < POOL; i++) {
      var o = E.create({ cars: 5, dest: shortName(first.name) });
      o.group.visible = false; scene.add(o.group); TR.opp.push(o);
    }
    return TR;
  }

  /* En los túneles las luces de los trenes se ven como de noche. */
  function lampNight(line, x, len, dir, night) {
    var t = line.tunnels || [], a = Math.min(x, x - dir * len), b = Math.max(x, x - dir * len);
    for (var i = 0; i < t.length; i++) if (b > t[i].from && a < t[i].to) return Math.max(night, 0.75);
    return night;
  }

  /* o: { night, cam (Vector3), exterior (bool) } */
  function update(TR, sim, o) {
    if (!TR.own) return;
    var E = TR.E, al = TR.W.al, t = sim.train, night = o.night || 0, cam = o.cam;
    var off2 = TR.W.off2 || function () { return -4.3; }, zero = function () { return 0; };
    E.setNight(night, true);

    // Tren propio (sólo en las vistas exteriores; en cabina se ve el interior)
    if (o.exterior) {
      var power = RC.core.train.controlPower(t);
      E.update(TR.own, { al: al, x: t.x, dir: 1, off: zero, doorsL: t.doors.left, doorsR: t.doors.right,
        panto: t.elec.pantoPos, head: power ? t.controls.headlights : 0, tail: power, night: lampNight(sim.line, t.x, TR.own.length, 1, night), cam: cam, maxDist: 8000 });
    } else TR.own.group.visible = false;

    // Tren precedente (no se dibuja si ocupa el mismo sitio que el nuestro, p. ej. antes de salir)
    var g = sim.ghost, a0 = t.x - TR.own.length - 3, a1 = t.x + 3;
    var gOn = g && g.active && g.x > -1e8 && !(g.x > a0 && g.x - TR.ghost.length < a1);
    if (gOn) {
      var gd = ghostDoors(sim, g);
      E.update(TR.ghost, { al: al, x: g.x, dir: 1, off: zero, doorsL: gd.l, doorsR: gd.r, panto: 1, head: 1, tail: true,
        night: lampNight(sim.line, g.x, TR.ghost.length, 1, night), cam: cam, maxDist: 4500 });
    } else TR.ghost.group.visible = false;

    // Sentido contrario por la vía 2
    var ks = oppActive(sim.line, sim.clock), used = 0;
    for (var i = 0; i < ks.length && used < TR.opp.length; i++) {
      var s = oppState(sim.line, ks[i], sim.clock);
      if (!s) continue;
      // en los andenes centrales el andén queda a la izquierda del tren que va hacia Santa Justa
      E.update(TR.opp[used++], { al: al, x: s.x, dir: -1, off: off2, doorsL: s.island ? s.door : 0, doorsR: s.island ? 0 : s.door,
        panto: 1, head: 1, tail: true, night: lampNight(sim.line, s.x, TR.opp[used - 1].length, -1, night), cam: cam, maxDist: 4500 });
    }
    for (; used < TR.opp.length; used++) TR.opp[used].group.visible = false;
  }

  RC.ui3d = RC.ui3d || {};
  RC.ui3d.traffic = { create: create, update: update, nextOpposite: nextOpposite, oppState: oppState, oppActive: oppActive, HEADWAY: HEADWAY };
})(globalThis.RC);
