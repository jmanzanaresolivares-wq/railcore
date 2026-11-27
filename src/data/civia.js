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
    boardingRatePerDoor_pps: 0.8,           // viajeros por segundo y puerta

    // ---------- Sistemas de cabina (cifras aproximadas [Verificar]) ----------
    // Adherencia rueda-carril: Curtius–Kniffler μ = 0,161 + 7,5/(v + 44) en carril seco
    adhesiveMassFraction: 0.6,              // masa sobre ejes motores / masa total [Verificar]
    antiSlipMargin: 0.93,                   // el control de patinaje deja la tracción al 93 % del límite
    wspMargin: 0.90,                        // el antideslizamiento deja el freno al 90 % del límite
    sandAdhesionGain: 1.7,                  // el arena multiplica la adherencia del carril mojado [Verificar]
    // Areneros: 4 depósitos en los bogies extremos [Verificar]
    sandCapacity_kg: 120,
    sandFlow_kgps: 0.12,                    // caudal total con todos los areneros abiertos
    sandMinAir_bar: 5.0,                    // el arenado es neumático: necesita depósito principal
    sandAutoTime_s: 3.0,                    // arenado automático tras detectar patinaje/deslizamiento
    // Freno eléctrico de recuperación (mezclado con el neumático) [Verificar]
    edMax_kN: 140,
    edPower_kW: 2400,
    edRamp_kNs: 70,
    edFadeFrom_kmh: 3, edFadeTo_kmh: 9,     // por debajo se desvanece y entra el neumático
    // Regulador de velocidad
    regStep_kmh: 5,
    regBrakeMax: 0.45,                      // freno máximo que puede pedir el regulador (fracción del servicio)
    // Baterías y convertidor estático [Verificar]
    batteryCapacity_kWh: 11.5,              // 160 Ah a 72 V
    batteryChargeRate_kW: 3.0,
    controlLoad_kW: 0.45,                   // electrónica de control y pantallas
    // Climatización
    cabHvacRate_Cps: 0.035,                 // °C/s máximo que aporta la climatización de cabina
    salonHvacRate_Cps: 0.018,
    salonSetpoint_C: 22,
    cabLoss_s: 1800, salonLoss_s: 2600,     // constantes de tiempo de pérdidas hacia el exterior
    // Parabrisas
    washerTank_L: 8,
    washerFlow_Lps: 0.04,
    washerSpray_s: 2.5
  };
})(globalThis.RC);
