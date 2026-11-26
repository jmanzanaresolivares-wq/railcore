# RAILCORE

Simulador ferroviario de conducción realista. Este es el **prototipo 0.1**: una Renfe Civia en
Cercanías Sevilla C-1, de **Sevilla-Santa Justa a Utrera**, con arranque en frío, cabina
funcional, física del tren, señales y ASFA.

> Los datos reales (distancias, velocidades, valores del tren y del ASFA) son **aproximados**
> y están marcados con `[Verificar]` en el código. No es material oficial de Renfe ni de Adif.

## Cómo jugar en Windows (.exe)

1. Entra en la pestaña **Releases** del repositorio (columna derecha de la página principal en GitHub).
2. Descarga **`RAILCORE-0.1.0-portable.exe`** (no necesita instalación) o
   **`RAILCORE-0.1.0-instalador.exe`** (crea un acceso directo).
3. Ábrelo con doble clic. Como el programa no está firmado, Windows puede mostrar
   «Windows protegió su PC»: pulsa **Más información → Ejecutar de todas formas**.

Mientras no haya una versión en *Releases*, el .exe también se puede descargar desde la
pestaña **Actions** → la última ejecución de «Compilar .exe de Windows» → apartado
**Artifacts** → `RAILCORE-Windows` (es un .zip que contiene los .exe).

También se puede jugar sin instalar nada abriendo `index.html` en Chrome o Edge.

## Qué puedes hacer

- **Cabina 3D en primera persona**: pupitre, parabrisas, armario de servicios, asiento,
  velocímetro, manómetros, pantalla del ASFA Digital y pantalla de estado, todo funcionando.
  Cada mando es un objeto 3D: el manipulador se arrastra, el inversor gira, los interruptores
  basculan, los pulsadores se hunden y se iluminan. Botón derecho del ratón para mirar
  alrededor; teclas 1-4 para mirar al frente, al armario, al pupitre o a la ventanilla.
- **Mundo 3D** con curvas y rampas, balasto, traviesas, carriles, catenaria, señales que cambian
  de aspecto, balizas, andenes con viajeros, edificios, olivares, cielo físico según la hora,
  amanecer, faros y limpiaparabrisas. Texturas reales CC0 de Poly Haven.
- **Hora de salida a elegir**: amanecer, mediodía, atardecer o noche.

- **Tres escenarios**: arranque en frío en Santa Justa, tren preparado en Santa Justa y
  servicio corto Dos Hermanas → Utrera.
- **Arranque en frío real**: baterías → llave de cabina → compresor auxiliar → pantógrafo →
  disyuntor → compresor principal → ASFA → faros → freno de estacionamiento → inversor.
  Cada paso tiene enclavamientos: si te saltas uno, el tren no obedece y te dice por qué.
- **Física longitudinal**: masa (que cambia con los viajeros), tracción limitada por esfuerzo y
  potencia, resistencia al avance, rampas y pendientes, freno neumático con depósito principal,
  tubería de freno y cilindros, freno de emergencia y de estacionamiento.
- **ASFA Digital (simplificado)**: balizas de anuncio de parada, previa de señal en rojo y
  señal en rojo, reconocimiento en 3 s, curvas de control de velocidad, frenado de urgencia y
  rearme sólo con el tren parado.
- **Señalización**: bloqueo automático con señales de tres aspectos, señales de entrada y de
  salida en cada estación, y un **tren precedente** que circula por delante (y que se retrasa
  en Dos Hermanas: la radio te avisará).
- **Viajeros**: suben y bajan si abres las puertas del lado correcto; si cierras antes de
  tiempo, se quedan en el andén.
- **Hombre muerto**: pulsa Vigilancia (Espacio) cuando lo pida.
- **Instructor** en cabina, **radio** con voz (si Windows tiene voz en español),
  **registrador de eventos** e **informe del inspector** con puntuación al terminar.
- **Modo demostración**: un maquinista automático conduce el servicio completo.

## Teclas principales

| Tecla | Acción |
|---|---|
| W / ↑ · S / ↓ | Manipulador hacia tracción · hacia freno |
| N · Retroceso | Manipulador a neutro · a emergencia |
| R / F | Inversor adelante / atrás |
| Q · E | ASFA: reconocer baliza · rearme de freno |
| Espacio | Vigilancia (hombre muerto) |
| Z / X · C | Abrir puertas izquierda / derecha · cerrar |
| H · L · B | Bocina · faros · freno de estacionamiento |
| T · P · F1 | Acelerar tiempo · pausa · ayuda |
| F11 | Pantalla completa (en el .exe) |
| 1 / 2 / 3 / 4 | Cabina 3D: frente / armario de servicios / pupitre / ventanilla |
| Botón derecho + arrastrar | Mirar alrededor en la cabina 3D |

Todos los mandos del pupitre también se pueden pulsar con el ratón.

## Cómo está hecho

- `src/core/` — **núcleo de simulación determinista** (sin gráficos ni sonido): tren
  (`train.js`), ASFA (`asfa.js`), señalización y tráfico (`signalling.js`), horario
  (`timetable.js`), orquestador de paso fijo (`sim.js`), informe (`report.js`) y maquinista
  automático de referencia (`autopilot.js`). La lógica de seguridad (ASFA, emergencia, hombre
  muerto, enclavamientos) es determinista y está separada de la presentación y de la radio.
- `src/data/` — datos del tren, de la línea y del ASFA, con las cifras pendientes de verificar.
- `src/ui/` — cabina, vista frontal, esquema de línea, sonido sintetizado e instructor.
- `src/ui3d/` — cabina y mundo 3D (Three.js r158, incluido en `vendor/`, MIT).
- `assets/textures/` — texturas CC0 de Poly Haven (ver `CREDITS.md`); `tools/embed-textures.js` las incrusta en `src/data/textures-data.js`.
- `electron/` — envoltorio de escritorio para generar el `.exe`.
- `tests/` — pruebas: física, enclavamientos, ASFA, señales, determinismo y tres servicios
  completos conducidos por el maquinista automático sin ninguna falta.

Para desarrolladores: `npm install`, `npm test`, `npm start` (abre la versión de escritorio) y
`npm run dist:win` (genera el .exe; en Linux necesita Wine, por eso se compila en GitHub Actions).

## Pendiente de verificar con fuentes oficiales

Ver [`docs/DATOS-A-VERIFICAR.md`](docs/DATOS-A-VERIFICAR.md).

## Modelos y marcas reales

La cabina 3D es un modelo original inspirado en la disposición de un puesto de conducción de
Cercanías; no reproduce planos del fabricante. Los modelos exactos de la Civia (CAD de CAF/Alstom),
sus texturas oficiales y los logotipos de Renfe y Adif necesitarían licencia de sus propietarios.
