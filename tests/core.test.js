const test = require('node:test');
const assert = require('node:assert');
const load = require('./load.js');

function newSim(sc, opts) { const RC = load(); return { RC, sim: RC.core.sim.create(sc, opts) }; }
function run(RC, sim, seconds, each) {
  const n = Math.round(seconds / RC.core.sim.DT);
  for (let i = 0; i < n && !sim.finished; i++) { if (each) each(sim); RC.core.sim.step(sim); }
}

test('física: el tren acelera en llano y respeta la velocidad máxima de la unidad', () => {
  const RC = load(); const T = RC.core.train;
  const t = T.create(RC.data.civia, { ready: true });
  T.command(t, { type: 'reverser', pos: 1 }); T.command(t, { type: 'lever', pos: 6 });
  const env = { lineV: 3000, gradePermil: 0, asfaConnected: true };
  for (let i = 0; i < 20 * 20; i++) T.step(t, 0.05, env);
  const v20 = t.v * 3.6;
  assert.ok(v20 > 40 && v20 < 90, 'a los 20 s debería ir entre 40 y 90 km/h, va a ' + v20.toFixed(1));
  for (let i = 0; i < 300 * 20; i++) T.step(t, 0.05, env);
  assert.ok(t.v * 3.6 <= RC.data.civia.vmax_kmh + 3, 'no supera la velocidad máxima: ' + (t.v * 3.6).toFixed(1));
});

test('física: el freno de emergencia detiene el tren desde 100 km/h en una distancia realista', () => {
  const RC = load(); const T = RC.core.train;
  const t = T.create(RC.data.civia, { ready: true });
  t.v = 100 / 3.6; t.controls.reverser = 1; t.controls.lever = 0;
  const env = { lineV: 3000, gradePermil: 0, asfaConnected: true };
  T.command(t, { type: 'lever', pos: -8 });
  const x0 = t.x;
  for (let i = 0; i < 120 * 20 && t.v > 0; i++) T.step(t, 0.05, env);
  const d = t.x - x0;
  assert.strictEqual(t.v, 0);
  assert.ok(d > 250 && d < 500, 'distancia de frenado de emergencia ' + d.toFixed(0) + ' m');
});

test('física: en rampa sin frenos el tren se va hacia atrás; con freno de estacionamiento no', () => {
  const RC = load(); const T = RC.core.train;
  const env = { lineV: 3000, gradePermil: 15, asfaConnected: true };
  const a = T.create(RC.data.civia, { ready: true });
  a.air.parking = true;
  for (let i = 0; i < 200; i++) T.step(a, 0.05, env);
  assert.strictEqual(a.v, 0);
  const b = T.create(RC.data.civia, { ready: true });
  b.controls.lever = 0; b.air.parking = false;
  for (let i = 0; i < 200; i++) T.step(b, 0.05, env);
  assert.ok(b.v < 0, 'debe retroceder en una rampa del 15‰ sin frenos');
});

test('arranque en frío: los enclavamientos impiden saltarse pasos', () => {
  const RC = load(); const T = RC.core.train;
  const t = T.create(RC.data.civia, { ready: false });
  const env = { lineV: 3000, gradePermil: 0, asfaConnected: false };
  T.command(t, { type: 'cabKey', on: true });
  assert.strictEqual(t.elec.cabKey, false, 'sin baterías la llave no actúa');
  T.command(t, { type: 'battery', on: true }); T.command(t, { type: 'cabKey', on: true });
  T.command(t, { type: 'panto', up: true });
  assert.strictEqual(t.elec.pantoCmd, false, 'sin presión no sube el pantógrafo');
  T.command(t, { type: 'disyuntor', close: true });
  assert.strictEqual(t.elec.disyuntor, false, 'sin pantógrafo no cierra el disyuntor');
  T.command(t, { type: 'auxCompressor', on: true });
  for (let i = 0; i < 40 * 20; i++) T.step(t, 0.05, env);
  T.command(t, { type: 'panto', up: true });
  for (let i = 0; i < 6 * 20; i++) T.step(t, 0.05, env);
  assert.strictEqual(t.elec.pantoPos, 1);
  T.command(t, { type: 'disyuntor', close: true });
  assert.strictEqual(t.elec.disyuntor, true);
  const inh = T.tractionInhibits(t, env);
  assert.ok(inh.includes('ASFA desconectado'));
  assert.ok(inh.includes('Freno de estacionamiento aplicado'));
  assert.ok(inh.includes('Inversor en neutro'));
});

test('ASFA: anuncio de parada sin reconocer → emergencia a los 3 s', () => {
  const RC = load(); const A = RC.core.asfa;
  const a = A.create(RC.data.asfa); a.connected = true;
  A.beacon(a, 'L1', 80);
  for (let i = 0; i < 59; i++) A.step(a, 0.05, 80);
  assert.strictEqual(a.emergency, false, 'aún dentro del plazo');
  for (let i = 0; i < 3; i++) A.step(a, 0.05, 80);
  assert.strictEqual(a.emergency, true);
});

test('ASFA: anuncio reconocido y velocidad reducida a tiempo → sin emergencia', () => {
  const RC = load(); const A = RC.core.asfa;
  const a = A.create(RC.data.asfa); a.connected = true;
  A.beacon(a, 'L1', 90);
  A.step(a, 0.05, 90); A.button(a, 'recAnPar');
  let v = 90;
  for (let i = 0; i < 40 * 20; i++) { v = Math.max(50, v - 0.05 * 3); A.step(a, 0.05, v); }
  assert.strictEqual(a.emergency, false);
  assert.ok(a.limit_kmh <= 60.01);
});

test('ASFA: exceder la curva de control → emergencia; rearme sólo parado', () => {
  const RC = load(); const A = RC.core.asfa;
  const a = A.create(RC.data.asfa); a.connected = true;
  A.beacon(a, 'L1', 100); A.button(a, 'recAnPar');
  for (let i = 0; i < 40 * 20; i++) A.step(a, 0.05, 100);
  assert.strictEqual(a.emergency, true);
  A.button(a, 'rearme', { stopped: false });
  assert.strictEqual(a.emergency, true);
  A.button(a, 'rearme', { stopped: true });
  assert.strictEqual(a.emergency, false);
});

test('ASFA: señal en rojo (L8) → emergencia salvo rebase autorizado', () => {
  const RC = load(); const A = RC.core.asfa;
  const a = A.create(RC.data.asfa); a.connected = true;
  A.beacon(a, 'L8', 20); assert.strictEqual(a.emergency, true);
  const b = A.create(RC.data.asfa); b.connected = true;
  A.button(b, 'rebase'); A.beacon(b, 'L8', 20); assert.strictEqual(b.emergency, false);
});

test('ASFA: previa de señal en rojo (L7) a más de 60 km/h → emergencia', () => {
  const RC = load(); const A = RC.core.asfa;
  const a = A.create(RC.data.asfa); a.connected = true;
  A.beacon(a, 'L7', 75); assert.strictEqual(a.emergency, true);
});

test('señalización: tres aspectos según ocupación del tren precedente', () => {
  const { RC, sim } = newSim('listo');
  const SG = RC.core.signalling;
  const sig = sim.signals;
  const k = sig.findIndex(s => s.kind === 'bloqueo');
  sim.ghost.active = true; sim.ghost.x = sig[k].x + 300; sim.ghost.length = 98;
  SG.updateAspects(sig, { ghost: sim.ghost, player: { x: -5000, length: 98 }, clearSalida: () => true });
  assert.strictEqual(sig[k].aspect, 'rojo');
  assert.strictEqual(sig[k - 1].aspect, 'amarillo');
  assert.strictEqual(sig[k - 2].aspect, 'verde');
});

test('determinismo: misma secuencia de órdenes → mismo estado exacto', () => {
  const hashes = [];
  for (let r = 0; r < 2; r++) {
    const { RC, sim } = newSim('listo');
    const ap = RC.core.autopilot.create({});
    run(RC, sim, 400, s => RC.core.autopilot.act(ap, s));
    hashes.push(RC.core.sim.hash(sim));
  }
  assert.strictEqual(hashes[0], hashes[1]);
});

for (const sc of ['frio', 'listo', 'dh']) {
  test('servicio completo conducible (' + sc + '): el maquinista automático llega a Utrera sin faltas', () => {
    const { RC, sim } = newSim(sc);
    const ap = RC.core.autopilot.create({ cold: sc === 'frio' });
    run(RC, sim, 3600, s => RC.core.autopilot.act(ap, s));
    assert.ok(sim.finished, 'debe terminar el servicio');
    assert.strictEqual(JSON.stringify(sim.faults.map(f => f.msg)), '[]');
    const rep = RC.core.report.build(sim);
    assert.strictEqual(rep.grade, 'EXCELENTE');
  });
}

test('faltas: abrir puertas en marcha está bloqueado; por el lado sin andén penaliza', () => {
  const { RC, sim } = newSim('listo');
  RC.core.sim.command(sim, { type: 'doors', side: 'left', action: 'open' });  // Santa Justa: andén a la derecha
  run(RC, sim, 0.1);
  assert.ok(sim.faults.some(f => f.code === 'doors-wrongside'));
});

test('faltas: rebasar una señal en rojo con el ASFA conectado provoca frenado y falta grave', () => {
  const { RC, sim } = newSim('listo', { noGhost: true });
  const C = c => RC.core.sim.command(sim, c);
  C({ type: 'reverser', pos: 1 }); C({ type: 'lever', pos: 6 });
  run(RC, sim, 60, s => { if (s.asfa.pendingRec) C({ type: 'asfa:recAnPar' }); });
  assert.ok(sim.faults.some(f => f.code === 'spad' || f.code === 'asfa'));
  assert.ok(sim.train.emergency.active || sim.train.v === 0);
});
