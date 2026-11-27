# Fachadas, ladrillo y tejados

Todo procede de **Poly Haven** (https://polyhaven.com), licencia **CC0** (dominio público).

| Archivo | Recurso de Poly Haven | Autor |
|---|---|---|
| fachadas-albedo.webp, fachadas-normal.webp, fachadas-mascaras.webp | modular_urban_apartments_facade (modelo 3D) | Poly Haven |
| ladrillo_diff.jpg, ladrillo_nor.jpg | large_red_bricks | Rob Tuytel |
| tejados-detalle.jpg (franja 1: teja) y teja_nor.jpg | clay_roof_tiles_02 | Amal Kumar |
| tejados-detalle.jpg (franja 2: baldosa de azotea) | terracotta_floor_tiles | Dimitrios Savva |
| tejados-detalle.jpg (franja 3: chapa) | box_profile_metal_sheet | Amal Kumar |

Los atlas de fachada se hornean con `tools/fachadas/` a partir de las piezas del modelo
(puertas, ventanas, zócalos, cornisas y remates): un render ortográfico de cada módulo de 3 m
por pase (color con oclusión, máscaras de enlucido/cristal/moldura y normales). El enlucido y las
molduras se pasan a gris para teñirlos en el juego con colores de Sevilla (blanco, albero, ocre…).
`tools/embed-fachadas.js` los incrusta en `src/data/facades-data.js`.
