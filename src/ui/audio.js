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
    // Bocina (dos tonos)
    var h1 = osc('sawtooth', 370), h2 = osc('sawtooth', 466), hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 1800; var hg = gain(0);
    h1.connect(hf); h2.connect(hf); hf.connect(hg); hg.connect(master);
    // Zumbadores ASFA / hombre muerto
    var b1 = osc('square', 1000), bg = gain(0); b1.connect(bg); bg.connect(master);
    var b2 = osc('square', 2200), bg2 = gain(0); b2.connect(bg2); bg2.connect(master);
    var b3 = osc('sawtooth', 420), bg3 = gain(0); b3.connect(bg3); bg3.connect(master);
    // Freno (silbido de aire)
    var an = noise(), af = ctx.createBiquadFilter(); af.type = 'highpass'; af.frequency.value = 2500; var ag = gain(0);
    an.connect(af); af.connect(ag); ag.connect(master);
    A.nodes = { m1: m1, m2: m2, mg: mg, mf: mf, rg: rg, rf: rf, cg: cg, lfog: lfog, hg: hg, bg: bg, bg2: bg2, bg3: bg3, ag: ag };
  }

  function beep(A, freq, dur, vol) {
    if (!A.ctx || !A.enabled) return;
    var ctx = A.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = freq; g.gain.value = vol || 0.25;
    g.gain.setTargetAtTime(0, ctx.currentTime + dur * 0.7, dur * 0.2);
    o.connect(g); g.connect(A.master); o.start(); o.stop(ctx.currentTime + dur + 0.2);
  }

  function speak(A, text) {
    if (!A.voice || !window.speechSynthesis) return;
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
    A.master.gain.setTargetAtTime(A.enabled && !paused ? 0.6 : 0, now, 0.05);
    var v = Math.abs(t.v), tr = t.tractionForce;
    var set = function (p, val) { p.setTargetAtTime(val, now, 0.08); };
    set(N.mg.gain, Math.min(0.22, tr / 600 + (tr > 1 ? 0.03 : 0)));
    set(N.m1.frequency, 40 + v * 9); set(N.m2.frequency, 80 + v * 18);
    set(N.rg.gain, Math.min(0.35, v / 70)); set(N.rf.frequency, 150 + v * 18);
    var comp = t.elec.mainCompRunning || t.elec.auxCompressor;
    set(N.cg.gain, comp ? 0.10 : 0); set(N.lfog.gain, comp ? 0.05 : 0);
    set(N.hg.gain, t.controls.horn ? 0.22 : 0);
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
      if (e.type === 'radio') speak(A, e.msg.replace(/\(ficticio\)/g, ''));
    }
    if (sim.log.length) A.lastSeq = sim.log[sim.log.length - 1].seq;
  }

  RC.ui.audio = { create: create, init: init, update: update, beep: beep };
})(globalThis.RC);
