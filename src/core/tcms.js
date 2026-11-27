/* RAILCORE — Sistema de control y diagnóstico del tren (TCMS), núcleo DETERMINISTA.
 * Evalúa en cada paso las alarmas a partir del estado real de los equipos, guarda
 * el registro de averías y eventos (aparición y desaparición) y la página que
 * muestra la pantalla de estado. No actúa sobre el tren: sólo diagnostica. */
(function (RC) {
  var TR = RC.core.train;

  var PAGES = ['traccion', 'freno', 'puertas', 'at', 'clima', 'averias'];
  var PAGE_NAMES = { traccion: 'TRACCIÓN', freno: 'FRENO', puertas: 'PUERTAS', at: 'ALTA TENSIÓN', clima: 'CLIMATIZACIÓN', averias: 'AVERÍAS Y EVENTOS' };
  var MAX_EVENTS = 60;

  function inService(sim) { return sim.train.passengers > 0 || Math.abs(sim.train.v) > 0.5 || sim.nextStation > (RC.core.sim.SCENARIOS[sim.scenario] || {}).startStation; }

  /* Nivel: A grave (rojo), B aviso (ámbar), C información (azul). */
  var ALARMS = [
    { code: 'EMERG', level: 'A', text: 'Freno de emergencia aplicado', test: function (s) { return s.train.emergency.active; } },
    { code: 'ASFA-U', level: 'A', text: 'ASFA: frenado de urgencia', test: function (s) { return s.asfa.emergency; } },
    { code: 'HM', level: 'A', text: 'Hombre muerto: actuación', test: function (s) { return s.vigil.emergency; } },
    { code: 'PUERTA', level: 'A', text: 'Puertas no cerradas o no enclavadas', test: function (s) { return !TR.doorsClosed(s.train) && Math.abs(s.train.v) > 0.3; } },
    { code: 'TFA', level: 'A', text: 'Tubería de freno automático descargada', test: function (s) { return TR.cabActive(s.train) && s.train.air.tfa < 4.6; } },
    { code: 'DP', level: 'B', text: 'Presión baja en el depósito principal', test: function (s) { return s.train.air.mr < 6.5; } },
    { code: 'ASFA-D', level: 'B', text: 'ASFA desconectado', test: function (s) { return TR.cabActive(s.train) && !s.asfa.connected; } },
    { code: 'PANTO', level: 'B', text: 'Pantógrafo bajado', test: function (s) { return TR.cabActive(s.train) && s.train.elec.pantoPos < 1; } },
    { code: 'DISY', level: 'B', text: 'Disyuntor abierto: sin tracción ni convertidor', test: function (s) { return TR.cabActive(s.train) && !s.train.elec.disyuntor; } },
    { code: 'CATEN', level: 'A', text: 'Sin tensión en la catenaria', test: function (s) { return s.train.elec.pantoPos >= 1 && s.train.elec.lineV < s.spec.disyuntorMinLine_V; } },
    { code: 'BAT', level: 'B', text: 'Baterías descargándose (sin convertidor)', test: function (s) { return s.train.elec.battery && !s.train.elec.charging; } },
    { code: 'BAT-L', level: 'A', text: 'Tensión de baterías baja', test: function (s) { return s.train.elec.battery && s.train.elec.battSoc < 0.35; } },
    { code: 'FEST', level: 'C', text: 'Freno de estacionamiento aplicado', test: function (s) { return s.train.air.parking; } },
    { code: 'PATIN', level: 'B', text: 'Patinaje: control antipatinaje actuando', test: function (s) { return s.train.adhesion.slipping; } },
    { code: 'DESLZ', level: 'B', text: 'Deslizamiento: antideslizamiento actuando', test: function (s) { return s.train.adhesion.sliding; } },
    { code: 'ARENA', level: 'B', text: 'Areneros en reserva', test: function (s) { return s.train.sand.kg < s.spec.sandCapacity_kg * 0.15; } },
    { code: 'LAVA', level: 'C', text: 'Lavaparabrisas: depósito en reserva', test: function (s) { return s.train.screen.washerL < s.spec.washerTank_L * 0.15; } },
    { code: 'VAHO', level: 'C', text: 'Parabrisas empañado: conecte la luneta térmica', test: function (s) { return s.train.screen.fog > 0.35; } },
    { code: 'LUNETA', level: 'C', text: 'Luneta térmica sin alimentación', test: function (s) { return s.train.controls.demister && !s.train.elec.auxPower && TR.controlPower(s.train); } },
    { code: 'CLIMA', level: 'B', text: 'Climatización del salón desconectada con viajeros', test: function (s) { return !s.train.hvac.salonOn && s.train.passengers > 0; } },
    { code: 'TEMP', level: 'B', text: 'Temperatura del salón fuera de confort', test: function (s) { var T = s.train.hvac.salonT; return s.train.passengers > 0 && (T < 17 || T > 28); } },
    { code: 'DEST', level: 'C', text: 'Indicador de destino no coincide con el servicio', test: function (s) { return s.service && s.service.dest !== s.service.expectedDest && inService(s); } },
    { code: 'NUM', level: 'C', text: 'Número de tren no coincide con el servicio', test: function (s) { return s.service && s.service.number !== s.service.expectedNumber; } },
    { code: 'LUCES', level: 'B', text: 'Circulación sin faros encendidos', test: function (s) { return s.train.controls.headlights === 0 && Math.abs(s.train.v) > 1.5; } },
    { code: 'REG', level: 'C', text: 'Regulador de velocidad conectado', test: function (s) { return s.train.reg.on; } }
  ];

  function create() { return { page: 'traccion', active: {}, events: [], seq: 0 }; }

  function command(sim, cmd) {
    if (cmd.type !== 'tcms') return false;
    var T = sim.tcms;
    if (cmd.page && PAGES.indexOf(cmd.page) >= 0) T.page = cmd.page;
    else if (cmd.delta) T.page = PAGES[(PAGES.indexOf(T.page) + cmd.delta + PAGES.length) % PAGES.length];
    if (cmd.ack) for (var k in T.active) T.active[k].ack = true;   // reconocer alarmas
    return true;
  }

  function step(sim) {
    var T = sim.tcms;
    if (!TR.controlPower(sim.train)) return;   // sin baterías la pantalla y el diagnóstico están apagados
    for (var i = 0; i < ALARMS.length; i++) {
      var al = ALARMS[i], on = !!al.test(sim), was = T.active[al.code];
      if (on && !was) {
        T.active[al.code] = { code: al.code, level: al.level, text: al.text, since: sim.clock, ack: false };
        record(T, sim.clock, al, true);
      } else if (!on && was) {
        delete T.active[al.code];
        record(T, sim.clock, al, false);
      }
    }
  }

  function record(T, clock, al, on) {
    T.seq++;
    T.events.push({ seq: T.seq, t: clock, code: al.code, level: al.level, text: al.text, on: on });
    if (T.events.length > MAX_EVENTS) T.events.shift();
  }

  /* Alarmas activas ordenadas por gravedad y antigüedad. */
  function activeList(sim) {
    var a = [];
    for (var k in sim.tcms.active) a.push(sim.tcms.active[k]);
    a.sort(function (x, y) { return x.level < y.level ? -1 : x.level > y.level ? 1 : x.since - y.since; });
    return a;
  }

  RC.core.tcms = { PAGES: PAGES, PAGE_NAMES: PAGE_NAMES, ALARMS: ALARMS, create: create, command: command, step: step, activeList: activeList };
})(globalThis.RC);
