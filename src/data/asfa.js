/* Parámetros del ASFA Digital simplificado para el prototipo.
 * Los valores de curvas, tiempos y frecuencias son aproximados [Verificar]
 * contra la Especificación Técnica ASFA Digital de Adif. */
(function (RC) {
  RC.data.asfa = {
    name: 'ASFA Digital (simplificado)',
    trainType: 'TIPO 120',
    vmax_kmh: 120,
    warnMargin_kmh: 3,        // aviso acústico por encima de (límite − margen)
    recognitionTime_s: 3,     // tiempo para reconocer una baliza
    connectTest_s: 3,
    // Códigos de baliza (frecuencias aproximadas [Verificar])
    codes: {
      L1: { name: 'Anuncio de parada', freq_kHz: 60 },
      L3: { name: 'Vía libre',          freq_kHz: 50 },
      L7: { name: 'Previa señal parada', freq_kHz: 95 },
      L8: { name: 'Señal de parada',    freq_kHz: 103 }
    },
    anuncioParada: { vFinal_kmh: 60, time_s: 30 },        // [Verificar]
    previaParada: { vCheck_kmh: 60, vFinal_kmh: 40, time_s: 14 }, // [Verificar]
    rebaseWindow_s: 10        // tiempo que dura el "rebase autorizado"
  };
})(globalThis.RC);
