/* Línea simplificada Cercanías Sevilla C-1: Sevilla-Santa Justa → Utrera.
 * Coordenada x en metros desde el punto de parada de Santa Justa, sentido Utrera.
 * TODAS las distancias, velocidades, rampas y lados de andén son aproximaciones
 * para el prototipo y están pendientes de verificar con el Libro Horario /
 * Cuadro de Velocidades Máximas de Adif.  [Verificar] */
(function (RC) {
  RC.data.lineC1 = {
    name: 'Cercanías Sevilla C-1 (tramo Santa Justa – Utrera)',
    fidelity: 'Simplificado [Verificar]',
    trainNumber: '36521 (ficticio)',
    catenary_V: 3000,
    // stopX: posición del cartelón de parada (cabeza del tren).
    stations: [
      { id: 'SJ', name: 'Sevilla-Santa Justa',  stopX: 0,     platformLength: 220, side: 'derecha',   waiting: 0 },
      { id: 'SB', name: 'San Bernardo',         stopX: 2100,  platformLength: 210, side: 'izquierda', waiting: 46 },
      { id: 'VR', name: 'Virgen del Rocío',     stopX: 4300,  platformLength: 210, side: 'derecha',   waiting: 31 },
      { id: 'JH', name: 'Jardines de Hércules', stopX: 6250,  platformLength: 210, side: 'derecha',   waiting: 22 },
      { id: 'BV', name: 'Bellavista',           stopX: 7700,  platformLength: 210, side: 'izquierda', waiting: 27 },
      { id: 'DH', name: 'Dos Hermanas',         stopX: 13500, platformLength: 230, side: 'derecha',   waiting: 64 },
      { id: 'UT', name: 'Utrera',               stopX: 30000, platformLength: 230, side: 'izquierda', waiting: 0 }
    ],
    // Velocidad máxima de la vía (km/h) por tramos [desde, hasta)
    speedLimits: [
      { from: -500,  to: 1500,  kmh: 60 },
      { from: 1500,  to: 5000,  kmh: 90 },
      { from: 5000,  to: 7000,  kmh: 100 },
      { from: 7000,  to: 12600, kmh: 120 },
      { from: 12600, to: 14400, kmh: 80 },
      { from: 14400, to: 28700, kmh: 120 },
      { from: 28700, to: 30500, kmh: 60 }
    ],
    // Perfil longitudinal: rampa (+) / pendiente (−) en milésimas (‰)
    gradients: [
      { from: -500,  to: 3000,  permil: 2 },
      { from: 3000,  to: 8000,  permil: -1 },
      { from: 8000,  to: 13500, permil: 0 },
      { from: 13500, to: 20000, permil: 3 },
      { from: 20000, to: 25000, permil: -2.5 },
      { from: 25000, to: 30500, permil: 1 }
    ],
    // Curvas solo para la vista (radio con signo: + derecha, − izquierda)
    curves: [
      { from: 400,   to: 1400,  radius: -900 },
      { from: 5200,  to: 5900,  radius: 1400 },
      { from: 9000,  to: 10200, radius: -2500 },
      { from: 16000, to: 17500, radius: 3000 },
      { from: 23500, to: 24800, radius: -2200 },
      { from: 28900, to: 29600, radius: 1200 }
    ],
    // Paso a nivel / puntos de interés sólo visuales
    landmarks: [
      { x: 900,   kind: 'puente', label: 'Paso superior' },
      { x: 10500, kind: 'puente', label: 'Autovía A-4' },
      { x: 21000, kind: 'campo',  label: 'Campiña' }
    ],
    signalSpacing_m: 2600,   // separación máxima entre señales de bloqueo
    entrySignalOffset_m: 450, // señal de entrada antes del cartelón de parada
    exitSignalOffset_m: 150,  // señal de salida después del cartelón de parada
    previaOffset_m: 300,      // baliza previa ASFA antes de cada señal [Verificar]
    // Tren precedente (tráfico IA determinista)
    precedingTrain: {
      number: '36519 (ficticio)',
      headway_s: 240,           // sale de Santa Justa 4 min antes
      extraDwell: { DH: 110 },  // incidencia: viajero con movilidad reducida en Dos Hermanas
      length_m: 98.6
    },
    // Horario base: salida de Santa Justa
    firstDeparture: '07:30:00',
    dwell_s: 30
  };
})(globalThis.RC);
