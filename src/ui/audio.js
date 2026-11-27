/* RAILCORE — Sonido sintetizado con WebAudio (sin archivos externos).
 * Sólo presentación: lee el estado y los eventos de la simulación. */
(function (RC) {
  function create() {
    var A = { ctx: null, enabled: true, voice: true, nodes: {}, lastLog: 0 };
    return A;
  }

  function init(A) {
    if (A.ctx) return;
    var C = window.AudioContext || window.webkitAudioContext;
    if (!C) { A.enabled = false; return; }
    var ctx = A.ctx = new C();
    var master = ctx.createGain(); master.gain.value = 0.6; master.connect(ctx.destination);
    A.master = master;
    function osc(type, freq) { var o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.start(); return o; }
    function gain(v) { var g = ctx.createGain(); g.gain.value = v; return g; }
    // Ruido blanco (rodadura, compresor)
    var buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    function noise() { var s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; }
    // Motores de tracción
    var m1 = osc('sawtooth', 60), m2 = osc('square', 120), mf = ctx.createBiquadFilter(); mf.type = 'lowpass'; mf.frequency.value = 900;
    var mg = gain(0); m1.connect(mf); m2.connect(mf); mf.connect(mg); mg.connect(master);
    // Rodadura
    var rn = noise(), rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 300; var rg = gain(0);
    rn.connect(rf); rf.connect(rg); rg.connect(master);
    // Compresor
    var cn = noise(), cf = ctx.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 180; cf.Q.value = 2; var cg = gain(0);
    var lfo = osc('square', 9), lfog = gain(0.0); lfo.connect(lfog); lfog.connect(cg.gain);
    cn.connect(cf); cf.connect(cg); cg.connect(master);
    // Bocina de dos tonos: alto y bajo (cada uno con dos bocinas ligeramente desafinadas)
    function horn(f) {
      var o1 = osc('sawtooth', f), o2 = osc('sawtooth', f * 1.006), hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 2000; var g = gain(0);
      o1.connect(hf); o2.connect(hf); hf.connect(g); g.connect(master); return g;
    }
    var hg = horn(466), hgl = horn(349);
    // Arenado (silbido del aire con arena), motor y escobillas del limpiaparabrisas, chorro del lavaparabrisas, ventilador
    function hiss(type, f, q) { var n = noise(), fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; if (q) fl.Q.value = q; var g = gain(0); n.connect(fl); fl.connect(g); g.connect(master); return g; }
    var sg = hiss('bandpass', 3200, 0.8), wsg = hiss('highpass', 4500), fg = hiss('lowpass', 650);
    var wm = osc('sawtooth', 95), wmf = ctx.createBiquadFilter(); wmf.type = 'lowpass'; wmf.frequency.value = 400; var wg = gain(0); wm.connect(wmf); wmf.connect(wg); wg.connect(master);
    // Tono de la llamada de emergencia de la radio (dos tonos alternos)
    var re = osc('square', 800), reg = gain(0); re.connect(reg); reg.connect(master);
    // Zumbadores ASFA / hombre muerto
    var b1 = osc('square', 1000), bg = gain(0); b1.connect(bg); bg.connect(master);
    var b2 = osc('square', 2200), bg2 = gain(0); b2.connect(bg2); bg2.connect(master);
    var b3 = osc('sawtooth', 420), bg3 = gain(0); b3.connect(bg3); bg3.connect(master);
    // Freno (silbido de aire)
    var an = noise(), af = ctx.createBiquadFilter(); af.type = 'highpass'; af.frequency.value = 2500; var ag = gain(0);
    an.connect(af); af.connect(ag); ag.connect(master);
    A.nodes = { m1: m1, m2: m2, mg: mg, mf: mf, rg: rg, rf: rf, cg: cg, lfog: lfog, hg: hg, hgl: hgl, bg: bg, bg2: bg2, bg3: bg3, ag: ag,
      sg: sg, wsg: wsg, fg: fg, wg: wg, wm: wm, re: re, reg: reg };
  }

  function beep(A, freq, dur, vol) {
    if (!A.ctx || !A.enabled) return;
    var ctx = A.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = freq; g.gain.value = vol || 0.25;
    g.gain.setTargetAtTime(0, ctx.currentTime + dur * 0.7, dur * 0.2);
    o.connect(g); g.connect(A.master); o.start(); o.stop(ctx.currentTime + dur + 0.2);
  }

  /* Gong de megafonía (tres notas descendentes) antes del aviso. */
  function chime(A) {
    [659, 523, 392].forEach(function (f, i) { setTimeout(function () { beep(A, f, 0.45, 0.16); }, i * 330); });
  }

  function paAnnounce(A, text) { chime(A); setTimeout(function () { speak(A, text); }, 1100); }

  function speak(A, text) {
    if (!A.voice || !A.enabled || !window.speechSynthesis) return;
    try {
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'es-ES'; u.rate = 1.05;
      var vs = window.speechSynthesis.getVoices().filter(function (v) { return /^es/i.test(v.lang); });
      if (vs.length) u.voice = vs[0];
      window.speechSynthesis.speak(u);
    } catch (e) { /* sin voz */ }
  }

  function update(A, sim, realTime, paused) {
    if (!A.ctx) return;
    var N = A.nodes, now = A.ctx.currentTime, t = sim.train;
    if (A.sim !== sim) { A.sim = sim; A.lastSeq = 0; A.tcmsSeq = sim.tcms ? sim.tcms.seq : 0; A.lastWiper = undefined; A.lastDw = 0; }   // jornada nueva
    A.master.gain.setTargetAtTime(A.enabled && !paused ? 0.6 : 0, now, 0.05);
    var v = Math.abs(t.v), tr = t.tractionForce;
    var set = function (p, val) { p.setTargetAtTime(val, now, 0.08); };
    set(N.mg.gain, Math.min(0.22, tr / 600 + (tr > 1 ? 0.03 : 0)));
    set(N.m1.frequency, 40 + v * 9); set(N.m2.frequency, 80 + v * 18);
    set(N.rg.gain, Math.min(0.35, v / 70)); set(N.rf.frequency, 150 + v * 18);
    var comp = t.elec.mainCompRunning || t.elec.auxCompressor;
    set(N.cg.gain, comp ? 0.10 : 0); set(N.lfog.gain, comp ? 0.05 : 0);
    set(N.hg.gain, t.controls.horn ? 0.2 : 0);
    set(N.hgl.gain, t.controls.hornLow ? 0.22 : 0);
    set(N.sg.gain, t.sand.active ? 0.05 : 0);
    set(N.wsg.gain, t.controls.washer > 0 ? 0.035 : 0);
    set(N.fg.gain, t.elec.auxPower ? t.hvac.fan * 0.025 : 0);
    // Limpiaparabrisas: zumbido del motor mientras se mueve y golpe suave al cambiar de sentido
    var wp = t.screen.wiperPos, dw = wp - (A.lastWiper === undefined ? wp : A.lastWiper);
    set(N.wg.gain, Math.abs(dw) > 1e-4 ? 0.035 : 0);
    if (A.lastDw && dw && Math.sign(dw) !== Math.sign(A.lastDw)) beep(A, 140, 0.08, 0.06);
    if (dw) A.lastDw = dw;
    A.lastWiper = wp;
    // Radio: tono alterno durante la llamada de emergencia
    var c = sim.comms;
    set(N.reg.gain, c && c.emergency && c.state === 'emergencia' && Math.floor(realTime * 2.5) % 4 === 0 ? 0.05 : 0);
    N.re.frequency.setValueAtTime(Math.floor(realTime * 5) % 2 ? 800 : 1000, now);
    // ASFA: anuncio pendiente → pitido intermitente; emergencia → continuo; aviso de velocidad → agudo rápido
    var a = sim.asfa;
    var pulse = Math.floor(realTime * 4) % 2 === 0;
    set(N.bg.gain, a.connected && ((a.pendingRec && pulse) || a.emergency) ? 0.12 : 0);
    set(N.bg2.gain, a.connected && !a.emergency && a.warning && Math.floor(realTime * 8) % 2 === 0 ? 0.08 : 0);
    set(N.bg3.gain, (sim.vigil.warning || sim.vigil.emergency) && pulse ? 0.10 : 0);
    var bcRising = t.air.bc > (A.lastBc || 0) + 0.002;
    set(N.ag.gain, bcRising ? 0.05 : 0);
    A.lastBc = t.air.bc;
    // Sonidos de eventos nuevos
    for (var i = 0; i < sim.log.length; i++) {
      var e = sim.log[i];
      if (e.seq <= (A.lastSeq || 0)) continue;
      if (/Liberación de puertas|Cierre de puertas/.test(e.msg)) { beep(A, 880, 0.18); setTimeout(function () { beep(A, 660, 0.25); }, 220); }
      if (e.type === 'asfa-rec') beep(A, 1400, 0.12, 0.2);
      if (e.type === 'asfa-ok') { beep(A, 900, 0.15); setTimeout(function () { beep(A, 1200, 0.2); }, 180); }
      if (e.type === 'asfa-beacon') beep(A, 2000, 0.05, 0.08);
      if (e.type === 'radio') { beep(A, 1750, 0.07, 0.08); speak(A, e.msg.replace(/\(ficticio\)/g, '')); }
      if (e.type === 'radio-ui') { beep(A, 480, 0.25, 0.12); }
      if (e.type === 'pa' && !/sin alimentación/.test(e.msg)) paAnnounce(A, e.msg.replace(/^Megafonía: /, ''));
    }
    if (sim.log.length) A.lastSeq = sim.log[sim.log.length - 1].seq;
    // TCMS: aviso acústico al aparecer una alarma grave (dos tonos) o un aviso (un tono)
    var T = sim.tcms;
    if (T && A.tcmsSeq === undefined) A.tcmsSeq = T.seq;
    if (T && T.seq !== A.tcmsSeq) {
      T.events.forEach(function (ev) {
        if (ev.seq <= A.tcmsSeq || !ev.on) return;
        if (ev.level === 'A') { beep(A, 1320, 0.16, 0.12); setTimeout(function () { beep(A, 990, 0.22, 0.12); }, 190); }
        else if (ev.level === 'B') beep(A, 1100, 0.14, 0.08);
      });
      A.tcmsSeq = T.seq;
    }
  }

  RC.ui.audio = { create: create, init: init, update: update, beep: beep };
})(globalThis.RC);
