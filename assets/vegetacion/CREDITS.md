# Vegetación

Los árboles, matas y hierbas de esta carpeta salen de modelos 3D de **Poly Haven**
(https://polyhaven.com) con licencia **CC0** (dominio público): se pueden usar, modificar y
distribuir libremente, también en proyectos comerciales. No se distribuyen los modelos: con
`tools/vegetacion/hornear.js` se dibujaron (glTF 1K) en 8 vistas alrededor del eje vertical y se
guardaron como impostores:

- `<especie>.webp` — color con la oclusión ambiental horneada y alfa de cobertura (premultiplicado);
- `<especie>_n.webp` — normales en el espacio del modelo, para iluminarlo con el sol del juego;
- `vegetacion.json` — medidas de cada especie (ancho, alto, celdas del atlas).

`tools/vegetacion/incrustar.js` los incrusta en `src/data/vegetation-data.js`. El nombre de la
especie es el papel que hace en el juego, no la especie botánica del modelo.

| Especie en el juego | Recurso de Poly Haven | Variante (nodo) | Autores |
|---|---|---|---|
| jacaranda | [jacaranda_tree](https://polyhaven.com/a/jacaranda_tree) | — | Rob Tuytel, Rico Cilliers |
| arbolito | [tree_small_02](https://polyhaven.com/a/tree_small_02) | — | Rico Cilliers |
| pino | [pine_sapling_medium](https://polyhaven.com/a/pine_sapling_medium) | pine_sapling_medium_a_LOD0 | Rob Tuytel, Rico Cilliers |
| olivo | [island_tree_01](https://polyhaven.com/a/island_tree_01) | — | Rob Tuytel, Rico Cilliers |
| olivo_bajo | [island_tree_02](https://polyhaven.com/a/island_tree_02) | — | Rob Tuytel, Rico Cilliers |
| olivo_viejo | [island_tree_03](https://polyhaven.com/a/island_tree_03) | — | Rob Tuytel, Rico Cilliers |
| lentisco | [searsia_burchellii](https://polyhaven.com/a/searsia_burchellii) | searsia_burchellii_large_LOD0 | James Ray Cock, Jenelle van Heerden |
| acebuche | [searsia_lucida](https://polyhaven.com/a/searsia_lucida) | searsia_lucida_a_LOD0 | James Ray Cock, Jenelle van Heerden |
| arbusto | [shrub_02](https://polyhaven.com/a/shrub_02) | shrub_02_a | Rico Cilliers |
| retama | [wild_rooibos_bush](https://polyhaven.com/a/wild_rooibos_bush) | wild_rooibos_bush_a | James Ray Cock, Jenelle van Heerden |
| matorral | [othonna_cerarioides](https://polyhaven.com/a/othonna_cerarioides) | othonna_cerarioides_b | James Ray Cock, Jenelle van Heerden |
| hierba | [grass_medium_01](https://polyhaven.com/a/grass_medium_01) | grass_medium_01_large_a_LOD0 | Rob Tuytel, Rico Cilliers |
| hierba_alta | [grass_medium_01](https://polyhaven.com/a/grass_medium_01) | grass_medium_01_tall_a_LOD0 | Rob Tuytel, Rico Cilliers |
| hierba_seca | [grass_medium_02](https://polyhaven.com/a/grass_medium_02) | grass_medium_02_e (difuso «seco») | Rico Cilliers |
| ortiga | [nettle_plant](https://polyhaven.com/a/nettle_plant) | nettle_plant_tall_a_LOD0 | Rob Tuytel, Rico Cilliers |
| mala_hierba | [weed_plant_02](https://polyhaven.com/a/weed_plant_02) | weed_plant_02_a_LOD0 | Rob Tuytel, Rico Cilliers |
