# Herramientas de ruta real

Construyen la ruta jugable **C-1 Sevilla-Santa Justa – Utrera** a partir de datos abiertos.

1. **Descarga** (`fetch-sources.mjs`): la ejecuta GitHub Actions (flujo «Descargar datos
   abiertos de la ruta C-1», pestaña *Actions* → *Run workflow*). Guarda copias en
   `data/fuentes/c1/`:
   - `osm.json` — vías, señales, desvíos, andenes… (Overpass API de OpenStreetMap)
   - `mdt/*.tif` — modelo digital del terreno del IGN en teselas UTM de 1 km
   - `pnoa/*.jpg` — ortofoto PNOA en teselas de 1 km
   - `catastro-*.json` — edificios del Catastro con número de plantas
   - `gtfs-c1.json` — horarios de la C-1 extraídos del GTFS de Cercanías
   - `informe-descarga.json` — qué salió bien o mal en cada fuente
2. **Construcción** (`build-route.mjs`): sin conexión, en cualquier ordenador con Node 20+:
   ```
   cd tools/route && npm install && node build-route.mjs
   ```
   Genera `src/data/c1/` (línea, terreno, edificios, ortofotos) y `src/data/c1/resumen.json`.

Coordenadas: ETRS89 / UTM huso 30 (EPSG:25830). En el juego, `x` es la distancia en metros
a lo largo de la vía desde el punto de parada de Santa Justa.

Lo que no sale de los datos abiertos (o sale incompleto) se marca `[Verificar]` y se resume en
`docs/DATOS-A-VERIFICAR.md`.
