/* Pruebas de los sistemas de cabina del núcleo: adherencia y arenado, regulador de
 * velocidad, freno eléctrico, bocina, alumbrado, limpiaparabrisas, luneta térmica,
 * climatización, baterías, megafonía, radio tren-tierra, destino y TCMS. */
const test = require('node:test');
const assert = require('node:assert');
const load = require('./load.js');

const DRY = { lineV: 3000, gradePermil: 0, asfaConnected: true, tempOut: 12 };
function env(extra) { return Object.assign({}, DRY, extra || {}); }
function runTrain(T, t, seconds, e, each) { for (let i = 0; i < Math.round(seconds * 20); i++) { if (each) each(i); T.step(t, 0.05, e); } }
function newSim(sc, opts) { const RC = load(); return { RC, sim: RC.core.sim.create(sc, opts) }; }
function runSim(RC, sim, seconds, each) {
  const n = Math.round(seconds / RC.core.sim.DT);
  for (let i = 0; i < n && !sim.finished; i++) { if (each) each(sim); RC.core.sim.step(sim); }
}

test('adherencia: en carril mojado el control antipatinaje limita la tracción y el arenado automático actúa', () => {
  const RC = load(); const T = RC.core.train;
  const t = T.create(RC.data.civia, { ready: true });
  T.command(t, { type: 'reverser', pos: 1 }); T.command(t, { type: 'lever', pos: 6 });
  const kg0 = t.sand.kg; let slipSeen = false, maxRatio = 0;
  runTrain(T, t, 15, env({ railFactor: 0.4 }), () => {
    if (t.adhesion.slipping) slipSeen = true;
    if (t.adhesion.limitTr > 0) maxRatio = Math.max(maxRatio, t.railForce / t.adhesion.limitTr);
  });
  assert.ok(slipSeen, 'debe detectarse patinaje con carril muy mojado');
  assert.ok(maxRatio <= 1.0001, 'al carril nunca llega más esfuerzo que la adherencia (' + maxRatio.toFixed(3) + ')');
  assert.ok(t.sand.kg < kg0, 'el arenado automático gasta arena');
  t.sand.kg = 0;   // sin arena el antipatinaje deja los motores por debajo del límite
  runTrain(T, t, 5, env({ railFactor: 0.4 }));
  assert.ok(t.tractionForce <= t.adhesion.limitTr + 0.01, 'antipatinaje: ' + t.tractionForce.toFixed(1) + ' kN ≤ ' + t.adhesion.limitTr.toFixed(1) + ' kN');
});

test('arenado: con arena el tren acelera más en carril mojado que con los areneros vacíos', () => {
  const RC = load(); const T = RC.core.train;
  const a = T.create(RC.data.civia, { ready: true }), b = T.create(RC.data.civia, { ready: true });
  b.sand.kg = 0;
  [a, b].forEach(t => { T.command(t, { type: 'reverser', pos: 1 }); T.command(t, { type: 'lever', pos: 6 }); T.command(t, { type: 'sand', on: true }); });
  const e = env({ railFactor: 0.4 });
  runTrain(T, a, 20, e); runTrain(T, b, 20, e);
  assert.ok(a.v > b.v + 0.5, 'con arena ' + (a.v * 3.6).toFixed(1) + ' km/h, sin arena ' + (b.v * 3.6).toFixed(1) + ' km/h');
  assert.strictEqual(b.sand.active, false, 'sin arena no puede arenar');
  const used = RC.data.civia.sandCapacity_kg * 0.92 - a.sand.kg;
  assert.ok(used > 1 && used < 20 * RC.data.civia.sandFlow_kgps + 0.01, 'consumo de arena coherente: ' + used.toFixed(2) + ' kg');
});

test('arenado: no se arena con el tren parado ni sin aire en el depósito principal', () => {
  const RC = load(); const T = RC.core.train;
  const t = T.create(RC.data.civia, { ready: true });
  T.command(t, { type: 'sand', on: true });
  runTrain(T, t, 2, env());
  assert.strictEqual(t.sand.active, false, 'parado no arena');
  const u = T.create(RC.data.civia, { ready: true }); u.v = 10; u.air.mr = 3; u.elec.mainCompSwitch = 'off';
  T.command(u, { type: 'sand', on: true });
  T.step(u, 0.05, env());
  assert.strictEqual(u.sand.active, false, 'sin aire no arena');
});

test('antideslizamiento: frenada de emergencia más larga en carril mojado, y el arena la acorta', () => {
  const RC = load(); const T = RC.core.train;
  function stopDist(rail, sand) {
    const t = T.create(RC.data.civia, { ready: true });
    t.v = 100 / 3.6; t.controls.reverser = 1; t.controls.lever = 0;
    if (!sand) t.sand.kg = 0;
    T.command(t, { type: 'lever', pos: -8 });
    const x0 = t.x; let slid = false;
    for (let i = 0; i < 200 * 20 && t.v > 0; i++) { T.step(t, 0.05, env({ railFactor: rail })); if (t.adhesion.sliding) slid = true; }
    return { d: t.x - x0, slid };
  }
  const dry = stopDist(1, false), wet = stopDist(0.4, false), wetSand = stopDist(0.4, true);
  assert.strictEqual(dry.slid, false, 'en seco no desliza');
  assert.ok(wet.slid, 'en mojado desliza');
  assert.ok(wet.d > dry.d * 1.15, 'mojado ' + wet.d.toFixed(0) + ' m frente a seco ' + dry.d.toFixed(0) + ' m');
  assert.ok(wetSand.d < wet.d - 10, 'con arena ' + wetSand.d.toFixed(0) + ' m frente a ' + wet.d.toFixed(0) + ' m');
});

test('regulador de velocidad: mantiene la consigna en llano y en pendiente, y el manipulador lo anula', () => {
  const RC = load(); const T = RC.core.train;
  const t = T.create(RC.data.civia, { ready: true });
  T.command(t, { type: 'reverser', pos: 1 });
  T.command(t, { type: 'regulatorSet', kmh: 60 });
  T.command(t, { type: 'regulator', on: true });
  T.command(t, { type: 'lever', pos: 6 });
  runTrain(T, t, 150, env());
  assert.ok(t.reg.active);
  assert.ok(Math.abs(t.v * 3.6 - 60) < 2, 'en llano mantiene 60 km/h: ' + (t.v * 3.6).toFixed(1));
  let braked = false;
  runTrain(T, t, 120, env({ gradePermil: -15 }), () => { if (t.reg.brake > 0 || t.edForce > 1) braked = true; });
  assert.ok(braked, 'en pendiente el regulador frena');
  assert.ok(t.v * 3.6 < 64, 'en pendiente no se embala: ' + (t.v * 3.6).toFixed(1));
  T.command(t, { type: 'regulatorSet', delta: 2 });
  assert.strictEqual(t.reg.set_kmh, 70, 'la consigna sube de 5 en 5');
  T.command(t, { type: 'lever', pos: -4 });
  runTrain(T, t, 5, env());
  assert.strictEqual(t.reg.active, false, 'con el manipulador en freno el regulador no actúa');
  assert.ok(t.v * 3.6 < 58, 'el maquinista frena por encima del regulador');
});

test('freno eléctrico: se mezcla con el neumático, recupera energía y no actúa en emergencia', () => {
  const RC = load(); const T = RC.core.train;
  const t = T.create(RC.data.civia, { ready: true });
  t.v = 80 / 3.6; t.controls.reverser = 1;
  T.command(t, { type: 'lever', pos: -3 });
  runTrain(T, t, 3, env());
  assert.ok(t.edForce > 20, 'freno eléctrico ' + t.edForce.toFixed(1) + ' kN');
  assert.ok(t.air.bc < 3 / 7 * RC.data.civia.bcServiceMax_bar - 0.2, 'el cilindro queda por debajo del freno neumático puro: ' + t.air.bc.toFixed(2) + ' bar');
  assert.ok(t.energyRegen_kWh > 0);
  T.command(t, { type: 'lever', pos: -8 });
  runTrain(T, t, 3, env());
  assert.ok(t.edForce < 1, 'en emergencia sólo frena el neumático');
});

test('bocina de dos tonos, alumbrado y regulador de intensidad', () => {
  const RC = load(); const T = RC.core.train;
  const t = T.create(RC.data.civia, { ready: false });
  T.command(t, { type: 'horn', on: true, tone: 'baja' });
  assert.strictEqual(t.controls.hornLow, true); assert.strictEqual(t.controls.horn, false);
  T.command(t, { type: 'horn', on: true }); T.command(t, { type: 'horn', on: false, tone: 'baja' });
  assert.strictEqual(t.controls.horn, true); assert.strictEqual(t.controls.hornLow, false);
  T.command(t, { type: 'markers', on: true }); T.command(t, { type: 'tailLights', on: true }); T.command(t, { type: 'deskLight', on: true });
  assert.ok(t.controls.markers && t.controls.tailLights && t.controls.deskLight);
  T.command(t, { type: 'dimmer', level: 0.5 }); T.command(t, { type: 'dimmer', delta: -0.7 });
  assert.strictEqual(t.controls.dimmer, 0.1, 'el atenuador no apaga del todo');
  T.command(t, { type: 'dimmer', delta: 2 });
  assert.strictEqual(t.controls.dimmer, 1);
});

test('limpiaparabrisas: velocidades, pausa del intermitente, aparcado automático y lavado', () => {
  const RC = load(); const T = RC.core.train;
  function sweeps(mode, secs) { const t = T.create(RC.data.civia, { ready: true }); T.command(t, { type: 'wipers', mode }); runTrain(T, t, secs, env()); return t.screen.sweeps; }
  const slow = sweeps(2, 30), fast = sweeps(3, 30), inter = sweeps(1, 30);
  assert.ok(fast > slow && slow > inter && inter > 0, 'rápido ' + fast + ' > lento ' + slow + ' > intermitente ' + inter);
  const t = T.create(RC.data.civia, { ready: true });
  T.command(t, { type: 'wipers', mode: 2 }); runTrain(T, t, 0.5, env());
  assert.ok(t.screen.wiperPos > 0, 'las escobillas se mueven');
  T.command(t, { type: 'wipers', mode: 0 }); runTrain(T, t, 3, env());
  assert.strictEqual(t.screen.wiperPos, 0, 'al apagar vuelven a la posición de aparcado');
  t.screen.dirt = 0.6; const L0 = t.screen.washerL;
  T.command(t, { type: 'washer' }); runTrain(T, t, 8, env());
  assert.ok(t.screen.washerL < L0, 'el lavaparabrisas gasta líquido');
  assert.ok(t.screen.dirt < 0.2, 'lavar y barrer limpia el parabrisas: ' + t.screen.dirt.toFixed(2));
  assert.strictEqual(t.screen.wiperPos, 0, 'tras los barridos automáticos aparca');
});

test('lluvia: el parabrisas se moja y el limpiaparabrisas lo mantiene despejado', () => {
  const RC = load(); const T = RC.core.train;
  const a = T.create(RC.data.civia, { ready: true }), b = T.create(RC.data.civia, { ready: true });
  a.v = b.v = 20; T.command(b, { type: 'wipers', mode: 3 });
  const e = env({ rain: 0.8 });
  for (let i = 0; i < 400; i++) { a.v = b.v = 20; T.step(a, 0.05, e); T.step(b, 0.05, e); }
  assert.ok(a.screen.wet > 0.8, 'sin limpiar se moja: ' + a.screen.wet.toFixed(2));
  assert.ok(b.screen.wet < 0.4, 'con el limpia rápido queda despejado: ' + b.screen.wet.toFixed(2));
});

test('luneta térmica: quita el vaho sólo con el convertidor estático en marcha', () => {
  const RC = load(); const T = RC.core.train;
  const a = T.create(RC.data.civia, { ready: true, fog: 0.8 }), b = T.create(RC.data.civia, { ready: false, fog: 0.8 });
  b.elec.battery = true;
  [a, b].forEach(t => T.command(t, { type: 'demister', on: true }));
  runTrain(T, a, 40, env({ tempOut: 8 })); runTrain(T, b, 40, env({ tempOut: 8 }));
  assert.ok(a.screen.fog < 0.1, 'con alimentación se desempaña: ' + a.screen.fog.toFixed(2));
  assert.ok(b.screen.fog > 0.7, 'sin convertidor no hace nada: ' + b.screen.fog.toFixed(2));
});

test('climatización: la cabina va a la consigna con el convertidor; sin él se enfría hacia el exterior', () => {
  const RC = load(); const T = RC.core.train;
  const a = T.create(RC.data.civia, { ready: true, tempOut: 8 });
  a.hvac.cabT = 12; a.hvac.salonT = 12;
  T.command(a, { type: 'hvacCabSet', value: 23 });
  runTrain(T, a, 600, env({ tempOut: 8 }));
  assert.ok(Math.abs(a.hvac.cabT - 23) < 1, 'cabina a la consigna: ' + a.hvac.cabT.toFixed(1) + ' °C');
  assert.ok(a.hvac.salonT > 18, 'salón calentándose: ' + a.hvac.salonT.toFixed(1) + ' °C');
  const b = T.create(RC.data.civia, { ready: true, tempOut: 8 });
  b.hvac.cabT = 20; T.command(b, { type: 'panto', up: false });
  runTrain(T, b, 600, env({ tempOut: 8 }));
  assert.strictEqual(b.elec.auxPower, false);
  assert.ok(b.hvac.cabT < 19, 'sin alimentación se enfría: ' + b.hvac.cabT.toFixed(1) + ' °C');
  T.command(b, { type: 'hvacCabSet', delta: 20 });
  assert.strictEqual(b.hvac.cabSet, 28, 'consigna limitada a 28 °C');
});

test('baterías: se descargan sin convertidor y se cargan con el disyuntor cerrado', () => {
  const RC = load(); const T = RC.core.train;
  const t = T.create(RC.data.civia, { ready: false });
  T.command(t, { type: 'battery', on: true });
  const soc0 = t.elec.battSoc;
  runTrain(T, t, 300, env());
  assert.ok(t.elec.battSoc < soc0 && t.elec.battV < 72, 'descarga: ' + t.elec.battV.toFixed(1) + ' V');
  const r = T.create(RC.data.civia, { ready: true }); r.elec.battSoc = 0.6;
  runTrain(T, r, 300, env());
  assert.ok(r.elec.charging && r.elec.battSoc > 0.6 && r.elec.battV === 78);
});

test('megafonía: anuncia la próxima estación y el cierre de puertas, sólo con la cabina habilitada', () => {
  const { RC, sim } = newSim('listo');
  const C = c => RC.core.sim.command(sim, c);
  C({ type: 'pa', msg: 'next' }); runSim(RC, sim, 0.1);
  assert.ok(sim.pa.active && /Próxima estación: San Bernardo/.test(sim.pa.active.text), sim.pa.active && sim.pa.active.text);
  assert.ok(sim.log.some(e => e.type === 'pa' && /Megafonía: Próxima estación/.test(e.msg)));
  runSim(RC, sim, 10);
  assert.strictEqual(sim.pa.active, null, 'el anuncio termina');
  C({ type: 'pa', msg: 'doors' }); runSim(RC, sim, 0.1);
  assert.ok(/cierre de puertas/.test(sim.pa.last.text));
  const cold = newSim('frio');
  RC.core.sim.command(cold.sim, { type: 'pa', msg: 'next' }); runSim(cold.RC, cold.sim, 0.1);
  assert.strictEqual(cold.sim.pa.active, null, 'sin cabina habilitada no hay megafonía');
});

test('radio tren-tierra: canal equivocado sin respuesta; canal correcto con respuesta del Puesto de Mando', () => {
  const { RC, sim } = newSim('listo');
  const C = c => RC.core.sim.command(sim, c);
  C({ type: 'radio:channel', channel: 5 }); C({ type: 'radio:call' }); runSim(RC, sim, 1);
  assert.strictEqual(sim.comms.state, 'llamando');
  runSim(RC, sim, 6);
  assert.ok(sim.log.some(e => /Sin respuesta en el canal 5/.test(e.msg)));
  assert.strictEqual(sim.comms.state, 'reposo');
  C({ type: 'radio:channel', channel: sim.comms.zone }); C({ type: 'radio:call' }); runSim(RC, sim, 3);
  const r = sim.radio[sim.radio.length - 1];
  assert.strictEqual(r.from, 'Puesto de Mando');
  assert.ok(/Tren preparado en Sevilla-Santa Justa/.test(r.text), r.text);
  assert.strictEqual(sim.radioFlags.ready, true, 'la llamada en el andén comunica «tren preparado»');
  assert.strictEqual(sim.comms.state, 'comunicando');
});

test('radio tren-tierra: llamada de emergencia con respuesta y cambio de zona en Dos Hermanas', () => {
  const { RC, sim } = newSim('listo');
  RC.core.sim.command(sim, { type: 'radio:emergency' }); runSim(RC, sim, 3);
  assert.strictEqual(sim.comms.state, 'emergencia');
  assert.ok(sim.log.some(e => e.severity === 'alarm' && /LLAMADA DE EMERGENCIA/.test(e.msg)));
  assert.ok(/Recibida la emergencia/.test(sim.radio[sim.radio.length - 1].text));
  const dh = sim.line.stations.find(s => s.id === 'DH');
  assert.strictEqual(RC.core.comms.zoneAt(sim, 0).channel, 3);
  assert.strictEqual(RC.core.comms.zoneAt(sim, dh.stopX + 1000).channel, 4);
});

test('destino y número de tren: selector, datos para el rótulo y alarma del TCMS si no coincide', () => {
  const { RC, sim } = newSim('frio');
  assert.strictEqual(sim.service.dest, 'Sin servicio', 'en frío el indicador está sin servicio');
  const C = c => RC.core.sim.command(sim, c);
  C({ type: 'dest', value: 'Utrera' }); runSim(RC, sim, 0.1);
  assert.strictEqual(sim.service.dest, 'Utrera');
  assert.ok(RC.core.comms.destOk(sim));
  C({ type: 'dest', delta: 1 }); runSim(RC, sim, 0.1);
  assert.notStrictEqual(sim.service.dest, 'Utrera');
  const n0 = sim.service.number;
  C({ type: 'trainNo', delta: 1 }); runSim(RC, sim, 0.1);
  assert.notStrictEqual(sim.service.number, n0);
  C({ type: 'battery', on: true }); runSim(RC, sim, 0.2);
  assert.ok(sim.tcms.active.NUM, 'el TCMS avisa del número equivocado');
});

test('TCMS: páginas y registro de averías y eventos (aparición y fin)', () => {
  const { RC, sim } = newSim('frio');
  const C = c => RC.core.sim.command(sim, c);
  C({ type: 'tcms', page: 'freno' }); runSim(RC, sim, 0.1);
  assert.strictEqual(sim.tcms.page, 'freno');
  C({ type: 'tcms', delta: 1 }); runSim(RC, sim, 0.1);
  assert.strictEqual(sim.tcms.page, 'puertas');
  assert.strictEqual(sim.tcms.events.length, 0, 'sin baterías el TCMS está apagado');
  C({ type: 'battery', on: true }); C({ type: 'cabKey', on: true }); runSim(RC, sim, 0.2);
  assert.ok(sim.tcms.active.FEST && sim.tcms.active.PANTO && sim.tcms.active['ASFA-D']);
  const list = RC.core.tcms.activeList(sim);
  for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].level <= list[i].level, 'ordenadas por gravedad');
  C({ type: 'regulator', on: true }); runSim(RC, sim, 0.1);
  C({ type: 'regulator', on: false }); runSim(RC, sim, 0.1);
  const reg = sim.tcms.events.filter(e => e.code === 'REG');
  assert.strictEqual(JSON.stringify(reg.map(e => e.on)), '[true,false]', 'registra aparición y fin');
});

test('meteorología: con lluvia hay menos adherencia y el parabrisas se moja; servicio completo determinista', () => {
  const { RC, sim } = newSim('listo', { weather: 'lluvia' });
  assert.strictEqual(sim.weather.rain, 0.8);
  sim.train.v = 15;
  runSim(RC, sim, 5, s => { s.train.v = 15; });
  assert.ok(sim.train.screen.wet > 0.2);
  assert.ok(sim.train.adhesion.mu < RC.core.train.adhesionCoef(sim.train, 54, 1, false));
  const hashes = [];
  for (let r = 0; r < 2; r++) {
    const s = newSim('listo', { weather: 'lluvia' });
    const ap = s.RC.core.autopilot.create({});
    const C = c => s.RC.core.sim.command(s.sim, c);
    C({ type: 'regulatorSet', kmh: 70 }); C({ type: 'pa', msg: 'welcome' }); C({ type: 'radio:call' }); C({ type: 'tcms', page: 'clima' });
    runSim(s.RC, s.sim, 600, x => s.RC.core.autopilot.act(ap, x));
    hashes.push(s.RC.core.sim.hash(s.sim));
  }
  assert.strictEqual(hashes[0], hashes[1]);
});
