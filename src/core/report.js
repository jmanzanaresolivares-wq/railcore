/* RAILCORE — Informe del inspector (a partir del registro de la simulación). */
(function (RC) {
  var U = RC.core.util;

  function build(sim) {
    var rows = sim.line.stations.map(function (st, i) {
      var tt = sim.timetable[i], ss = sim.stations[i];
      return {
        name: st.name,
        arrPlan: tt.arr, depPlan: tt.dep,
        arr: (i === 0 && sim.scenario !== 'dh') ? null : (ss.skipped ? null : ss.arrTime),
        dep: ss.depTime,
        delayArr: ss.arrTime !== null && tt.arr !== null && !ss.skipped ? ss.arrTime - tt.arr : null,
        skipped: ss.skipped && i >= (RC.core.sim.SCENARIOS[sim.scenario].startStation || 0),
        boarded: ss.boarded, alighted: ss.alighted
      };
    });
    var score = Math.max(0, Math.round(sim.score));
    var grade = score >= 900 ? 'EXCELENTE' : score >= 750 ? 'APTO' : score >= 500 ? 'APTO CON OBSERVACIONES' : 'NO APTO';
    var serious = sim.faults.filter(function (f) { return f.points >= 100; });
    if (serious.some(function (f) { return f.code === 'spad' || f.code === 'doors-moving'; })) grade = 'NO APTO';
    var comments = [];
    if (!sim.faults.length) comments.push('Conducción impecable: sin incidencias registradas.');
    if (sim.faults.some(function (f) { return f.code === 'overspeed'; })) comments.push('Revise el cuadro de velocidades máximas: la velocidad se aplica a todo el tren, no sólo a la cabina.');
    if (sim.faults.some(function (f) { return f.code === 'asfa'; })) comments.push('Reconozca las balizas ASFA en menos de 3 s y anticipe el frenado tras un anuncio de parada.');
    if (sim.faults.some(function (f) { return f.code === 'doors-wrongside' || f.code === 'doors-noplatform'; })) comments.push('Compruebe el lado del andén antes de liberar puertas.');
    if (sim.faults.some(function (f) { return f.code === 'late'; })) comments.push('Cuide la puntualidad: ajuste la marcha al horario del libro.');
    if (sim.faults.some(function (f) { return f.code === 'pax-left'; })) comments.push('No cierre puertas hasta que termine el intercambio de viajeros.');
    return {
      title: 'Informe del inspector',
      train: sim.line.trainNumber,
      scenario: sim.scenarioName,
      reason: sim.finishReason || 'En curso',
      score: score, grade: grade,
      rows: rows,
      faults: sim.faults.slice(),
      distance_km: sim.train.odometer / 1000,
      energy_kWh: sim.train.energy_kWh,
      maxKmh: sim.maxKmh || 0,
      duration: sim.elapsed,
      comments: comments
    };
  }

  RC.core.report = { build: build };
})(globalThis.RC);
