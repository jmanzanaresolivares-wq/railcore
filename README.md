# RAILCORE

Simulador ferroviario de conducción realista. Este es el **prototipo 0.6**: una Renfe Civia en
Cercanías Sevilla C-1, de **Sevilla-Santa Justa a Utrera**, con arranque en frío, cabina
funcional, física del tren, señales y ASFA.

> Los datos reales (distancias, velocidades, valores del tren y del ASFA) son **aproximados**
> y están marcados con `[Verificar]` en el código. No es material oficial de Renfe ni de Adif.

## Ruta real C-1 (datos abiertos)

La línea Sevilla-Santa Justa – Utrera está construida con **datos reales abiertos**: trazado,
túneles, puentes, desvíos y andenes de OpenStreetMap; relieve del MDT LiDAR del IGN; suelo con la
ortofoto PNOA; edificios del Catastro; horarios y números de tren del GTFS de Cercanías. Cómo se
genera: `tools/route/README.md`. Créditos y licencias: `CREDITOS-DATOS.md`.

## Marcas

El operador **Ferronda** y el administrador de infraestructuras **Trazia** son marcas
**ficticias y originales**. No se usan logotipos ni libreas de Renfe, Adif ni otras empresas.
Ver `assets/brand/README.md` (incluye cómo cambiar de paquete de marca).

## Cómo jugar en Windows (.exe)

1. Entra en la pestaña **Releases** del repositorio (columna derecha de la página principal en GitHub).
2. Descarga **`RAILCORE-0.6.0-portable.exe`** (no necesita instalación) o
   **`RAILCORE-0.6.0-instalador.exe`** (crea un acceso directo).
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
- **Mundo 3D fotográfico** con curvas y rampas, balasto, traviesas, carriles, señales que cambian
  de aspecto, balizas, cielo físico según la hora, amanecer, faros y limpiaparabrisas. Texturas
  reales CC0 de Poly Haven.
- **Luz real de Sevilla**: el sol sale y se pone a la hora y en la dirección de verdad para la
  fecha del juego, y proyecta **sombras** de edificios, postes, andenes y del propio tren. Las
  **nubes** derivan con el viento y, cuando tapan el sol, la luz baja como en un día real.
- **Fachadas fotográficas** en todos los edificios del Catastro: paredes encaladas con zócalo y
  recercado en albero o almagra, balcones, rejas, persianas, ladrillo visto y naves industriales,
  con ventanas que se encienden de noche. Los tejados toman su color de la foto aérea real.
- **Suelo con foto aérea de 0,3 m por píxel** en una franja de 70 m a cada lado de la vía (se ven
  coches, árboles y marcas viales), y grano fino de tierra y grava cuando se mira de cerca.
- **Catenaria como la real**: postes en H con macizo de hormigón, ménsulas con aisladores de
  porcelana, hilo de contacto en zigzag, sustentador con su flecha y péndolas.
- **El tren visto desde fuera** (tecla **V**): unidad de 5 coches con los colores de Ferronda,
  pintura barnizada que refleja el cielo, suciedad de servicio en bajos y techo, morro redondeado, puertas que se abren de verdad, pantógrafo que sube y baja, ruedas que giran,
  faros, pilotos rojos, rótulo de destino y luz interior de noche. Vista «exterior» (arrastre
  para girar alrededor, rueda para acercar) y vista «junto a la vía» (la cámara ve pasar el tren).
- **Estaciones de la C-1** construidas con los datos de la ruta: andenes laterales o centrales
  con borde de seguridad y banda táctil, marquesinas con luz, bancos, papeleras, farolas,
  carteles con la marca Trazia, pantallas de próximos trenes y relojes con la hora del juego,
  cartelón de parada y viajeros. San Bernardo es subterránea (paredes de azulejo) y Santa Justa
  tiene una gran nave abovedada.
- **Tráfico**: el tren precedente es una unidad completa que abre puertas en las estaciones, y
  por la vía 2 vienen trenes hacia Santa Justa cada 20 minutos (sólo ambiente, no afectan a las
  señales).
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
| V | Cambiar de vista: cabina / exterior / junto a la vía |
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
- `src/ui3d/` — cabina y mundo 3D (Three.js r158, incluido en `vendor/`, MIT): tren por fuera
  (`emu3d.js`), estaciones (`stations3d.js`), trenes en la vía (`traffic3d.js`), terreno y
  edificios reales (`realworld3d.js`), fachadas y tejados (`buildings3d.js`), ortofoto de 0,3 m
  junto a la vía (`orthohd3d.js`), nubes (`clouds3d.js`) y vía y catenaria (`world3d.js`).
- `tools/fachadas/` — cómo se hornea el atlas de fachadas a partir del kit CC0 de Poly Haven
  (`assets/fachadas/`, ver su `CREDITS.md`); `tools/embed-fachadas.js` lo incrusta en
  `src/data/facades-data.js`.
- `tools/captura/` — capturas automáticas del juego y banco de pruebas del tren, para revisar
  cambios visuales sin abrir el juego.
- `assets/textures/` — texturas CC0 de Poly Haven (ver `CREDITS.md`); `tools/embed-textures.js` las incrusta en `src/data/textures-data.js`.
- `assets/vegetacion/` — árboles, matas y hierba: modelos CC0 de Poly Haven horneados en impostores de 8 vistas con `tools/vegetacion/` (ver `CREDITS.md`); `src/ui3d/vegetation3d.js` los planta donde la ortofoto muestra copas y prados.
- `electron/` — envoltorio de escritorio para generar el `.exe`.
- `tests/` — pruebas: física, enclavamientos, ASFA, señales, determinismo y tres servicios
  completos conducidos por el maquinista automático sin ninguna falta.

Para desarrolladores: `npm install`, `npm test`, `npm start` (abre la versión de escritorio) y
`npm run dist:win` (genera el .exe; en Linux necesita Wine, por eso se compila en GitHub Actions).

## Pendiente de verificar con fuentes oficiales

Ver [`docs/DATOS-A-VERIFICAR.md`](docs/DATOS-A-VERIFICAR.md).

## Modelos y marcas reales

La cabina 3D y el tren visto desde fuera son modelos originales inspirados en un tren de
Cercanías moderno; no reproducen planos del fabricante ni ninguna librea real. Los modelos exactos de la Civia (CAD de CAF/Alstom),
sus texturas oficiales y los logotipos de Renfe y Adif necesitarían licencia de sus propietarios.
