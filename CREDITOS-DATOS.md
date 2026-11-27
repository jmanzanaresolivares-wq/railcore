# Créditos y licencias de los datos de la ruta real C-1

La ruta **Sevilla-Santa Justa – Utrera** se construye automáticamente con datos abiertos.
Cada fuente se usa respetando su licencia y se cita aquí y en el juego.

| Qué | Fuente | Licencia y atribución |
|---|---|---|
| Trazado de la vía, desvíos, señales, andenes, pasos a nivel, puentes, túneles, velocidades máximas, postes kilométricos | **OpenStreetMap** | © colaboradores de OpenStreetMap. **ODbL 1.0**. Los archivos derivados (`src/data/c1/line-c1-real.js` y `data/fuentes/c1/osm*.json`) son una *base de datos derivada* y se distribuyen también bajo **ODbL 1.0** (https://opendatacommons.org/licenses/odbl/). |
| Relieve (rampas y pendientes, terreno) | **MDT05 / MDT25 del IGN**, obtenido del vuelo LiDAR del PNOA (servicio WCS de la IDEE) | «© Instituto Geográfico Nacional» — **CC BY 4.0** |
| Textura del suelo | **Ortofoto PNOA máxima actualidad** (servicio WMS del IGN) | «PNOA cedido por © Instituto Geográfico Nacional» — **CC BY 4.0** |
| Suelo de alta resolución junto a la vía (0,3 m por píxel, franja de ±70 m) y color de los tejados | **Ortofoto PNOA máxima actualidad** (servicio WMS del IGN), descargada por `tools/route/fetch-ortohd.mjs` | «PNOA cedido por © Instituto Geográfico Nacional» — **CC BY 4.0** |
| Fachadas (atlas fotográfico) y texturas de ladrillo y teja | Kit de fachadas y texturas de **Poly Haven** | **CC0** (dominio público). Detalle en `assets/fachadas/CREDITS.md`. |
| Huella y número de plantas de los edificios | **Dirección General del Catastro**, servicio INSPIRE de edificios | «Fuente: Dirección General del Catastro». Reutilización libre con cita de la fuente. |
| Horarios y tiempos de recorrido | **GTFS de Cercanías** publicado por Renfe Viajeros en su portal de datos abiertos | Datos abiertos de Renfe; se cita la fuente. [Verificar los términos vigentes en data.renfe.com] |
| Velocidades y estaciones (referencia) | **Declaración sobre la Red de Adif** | Sólo consulta para contrastar. No se copia su contenido. |
| Aspecto general | Vídeos de cabina publicados en Internet | Sólo referencia visual. No se incluye ninguna imagen ni fotograma. |

## Marcas

Los nombres de lugares, líneas y estaciones son reales. **No** se usan logotipos, libreas ni la
identidad visual de Renfe, Adif ni de ninguna otra empresa. El operador **Ferronda** y el
administrador de infraestructuras **Trazia** son marcas inventadas para RAILCORE
(ver `assets/brand/README.md`). La mención de Renfe y Adif en esta página es sólo para citar
la procedencia de los datos.
