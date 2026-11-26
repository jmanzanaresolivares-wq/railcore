/* Datos del material rodante: Renfe Civia.
 * IMPORTANTE: los valores marcados [Verificar] son estimaciones razonables,
 * no datos oficiales. Deben contrastarse con documentación de Renfe/fabricante. */
(function (RC) {
  RC.data.civia = {
    name: 'Renfe Civia serie 465 (5 coches)',
    fidelity: 'Estimado [Verificar]',
    length_m: 98.6,               // [Verificar]
    massTare_t: 160,              // [Verificar]
    rotatingMassFactor: 1.08,     // [Verificar] masas rotativas
    seats: 280,                   // [Verificar]
    passengerMass_t: 0.075,       // masa media por viajero
    vmax_kmh: 120,                // [Verificar]
    power_kW: 2200,               // [Verificar] potencia en llanta aprox.
    maxTractiveEffort_kN: 170,    // [Verificar]
    tractionNotches: 6,           // [Simplificado] el manipulador real es continuo
    brakeNotches: 7,              // [Simplificado]
    tractionRamp_kNs: 45,         // limitación de sacudida
    // Resistencia al avance (Davis): R = A + B·v + C·v² (kN, v en km/h)  [Verificar]
    davis: { A: 2.6, B: 0.022, C: 0.00058 },
    // Freno
    bcMax_bar: 3.8,               // presión cilindro en emergencia [Verificar]
    bcServiceMax_bar: 3.0,        // presión cilindro en servicio máximo [Verificar]
    emergencyDecel_ms2: 1.3,      // [Verificar]
    bcRate_barps: 1.6,            // velocidad de llenado/vaciado del cilindro
    // Neumática
    mrMin_bar: 8.0, mrMax_bar: 10.0,        // regulador compresor principal [Verificar]
    compressorRate_barps: 0.09,             // [Verificar]
    auxCompressorRate_barps: 0.22,          // [Simplificado] acelerado para el juego
    pantoMin_bar: 4.5,                      // presión mínima para subir pantógrafo [Verificar]
    tfaNominal_bar: 5.0,                    // tubería de freno automático
    parkingReleaseMin_bar: 6.0,             // [Verificar]
    // Eléctrico
    batteryNominal_V: 72,                   // [Verificar]
    catenaryNominal_V: 3000,                // 3 kV CC (red convencional española)
    disyuntorMinLine_V: 2000,
    // Puertas
    doorTime_s: 3.0,
    doorsPerSide: 10,                       // [Verificar]
    boardingRatePerDoor_pps: 0.8            // viajeros por segundo y puerta
  };
})(globalThis.RC);
