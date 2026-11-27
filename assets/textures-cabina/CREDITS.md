# Texturas de la cabina

Todas las texturas de esta carpeta proceden de **Poly Haven** (https://polyhaven.com) y tienen
licencia **CC0 1.0** (dominio público): se pueden usar, modificar y distribuir libremente, también en
proyectos comerciales, sin necesidad de atribución (la damos igualmente).

Se han descargado en 1K desde `dl.polyhaven.org`, se han pasado a escala de grises cuando el color lo
pone el material del juego, se ha ajustado el contraste y se han recomprimido en JPG a 1024 px
(512 px o menos para las piezas pequeñas y los mapas casi uniformes). Los mapas de color de
`plastico` y `pintura` se tiñen con el color de cada pieza: por eso se han normalizado (brillo medio
alto y contraste reducido) para que sólo aporten el detalle de la superficie. Mapas: `_diff` (color),
`_nor` (normales, convención OpenGL) y `_rough` (rugosidad).

| Archivo | Recurso de Poly Haven | Autoría | Licencia | Uso en la cabina |
|---|---|---|---|---|
| `plastico_*` | [Leather White](https://polyhaven.com/a/leather_white) (`leather_white`) | Rob Tuytel | CC0 | Plástico granulado del pupitre, consolas y reposabrazos |
| `pintura_*` | [Blue Metal Plate](https://polyhaven.com/a/blue_metal_plate) (`blue_metal_plate`) | Rob Tuytel | CC0 | Chapa pintada con desgaste: paredes, montantes, puerta y armario |
| `suelo_*` | [Dashed Anti Skid Tiles](https://polyhaven.com/a/dashed_anti_skid_tiles) (`dashed_anti_skid_tiles`) | Amal Kumar | CC0 | Suelo de caucho antideslizante |
| `tejido_*` | [Scuba Suede](https://polyhaven.com/a/scuba_suede) (`scuba_suede`) | colormass, Rico Cilliers | CC0 | Tapicería del asiento del maquinista |
| `techo_*` | [Polystyrene](https://polyhaven.com/a/polystyrene) (`polystyrene`) | Dimitrios Savva, Dario Barresi | CC0 | Paneles del techo |

`tools/embed-cab-textures.js` las incrusta como `data:` URI en `src/data/cab-textures-data.js`
(`RC.data.cabTextures`) para que funcionen al abrir el juego desde `file://` y dentro del `.exe`.
