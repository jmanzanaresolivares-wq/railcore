/* RAILCORE — espacio de nombres global.
 * Se usan scripts clásicos (no módulos ES) para que el juego funcione
 * abriendo index.html directamente, dentro del .exe y en las pruebas de Node. */
(function (g) {
  g.RC = g.RC || { core: {}, data: {}, ui: {} };
})(typeof globalThis !== 'undefined' ? globalThis : window);
