/* RAILCORE — Especies de vegetación que se hornean en impostores (atlas de 8 vistas).
 * Modelos CC0 de Poly Haven (https://polyhaven.com), glTF 1k.
 *   id         nombre de la especie en el juego (archivos assets/vegetacion/<id>.webp y <id>_n.webp)
 *   asset      modelo de Poly Haven
 *   nodo       variante dentro del modelo (nodo del glTF); sin nodo = el modelo entero
 *   px         tamaño de la celda de cada vista (lado mayor, en píxeles)
 *   suave      cuánto se redondean las normales de las hojas hacia la forma de la copa (0..1)
 *   umbral     corte de alfa de las hojas al hornear (más bajo = hojas algo más gruesas)
 *   cobertura  multiplica la cobertura del follaje fino para que no desaparezca al reducir
 *   seco       usa el difuso «seco» del modelo (hierba agostada)
 *   tinte      multiplicador de color del albedo horneado [r, g, b]
 *   aoMin      luz mínima que deja la oclusión ambiental horneada (0..1, por defecto 0.28)
 */
module.exports = [
  // Árboles urbanos y de parque
  { id: 'jacaranda', asset: 'jacaranda_tree', px: 384, suave: 0.6, umbral: 0.35, cobertura: 1.8, tinte: [0.95, 1.02, 0.95] },
  { id: 'arbolito', asset: 'tree_small_02', px: 288, suave: 0.6, cobertura: 1.4 },
  { id: 'pino', asset: 'pine_sapling_medium', nodo: 'pine_sapling_medium_a_LOD0', px: 320, suave: 0.45, cobertura: 1.7, tinte: [0.78, 1.0, 0.72] },
  // Árboles de aspecto de olivo (los «island trees» de Poly Haven son olivos mediterráneos)
  { id: 'olivo', asset: 'island_tree_01', px: 320, suave: 0.6, cobertura: 1.3 },
  { id: 'olivo_bajo', asset: 'island_tree_02', px: 288, suave: 0.6, cobertura: 1.3 },
  { id: 'olivo_viejo', asset: 'island_tree_03', px: 224, suave: 0.6, cobertura: 1.3 },
  // Arbolillos y matas grandes de monte (lentisco, acebuche)
  { id: 'lentisco', asset: 'searsia_burchellii', nodo: 'searsia_burchellii_large_LOD0', px: 224, suave: 0.6, umbral: 0.4, cobertura: 1.9, tinte: [0.9, 1.0, 0.85] },
  { id: 'acebuche', asset: 'searsia_lucida', nodo: 'searsia_lucida_a_LOD0', px: 192, suave: 0.6, cobertura: 1.6 },
  // Arbustos
  { id: 'arbusto', asset: 'shrub_02', nodo: 'shrub_02_a', px: 128, suave: 0.5, cobertura: 1.3, aoMin: 0.4, tinte: [1.1, 1.18, 1.0] },
  { id: 'retama', asset: 'wild_rooibos_bush', nodo: 'wild_rooibos_bush_a', px: 112, suave: 0.5, cobertura: 1.4, aoMin: 0.45, tinte: [1.45, 1.4, 1.1] },
  { id: 'matorral', asset: 'othonna_cerarioides', nodo: 'othonna_cerarioides_b', px: 112, suave: 0.5, cobertura: 1.2 },
  // Hierba y matas bajas
  { id: 'hierba', asset: 'grass_medium_01', nodo: 'grass_medium_01_large_a_LOD0', px: 112, suave: 0.35, cobertura: 1.3 },
  { id: 'hierba_alta', asset: 'grass_medium_01', nodo: 'grass_medium_01_tall_a_LOD0', px: 96, suave: 0.35, cobertura: 1.3 },
  { id: 'hierba_seca', asset: 'grass_medium_02', nodo: 'grass_medium_02_e', px: 112, suave: 0.35, seco: true, cobertura: 1.3 },
  { id: 'ortiga', asset: 'nettle_plant', nodo: 'nettle_plant_tall_a_LOD0', px: 96, suave: 0.35, cobertura: 1.2 },
  { id: 'mala_hierba', asset: 'weed_plant_02', nodo: 'weed_plant_02_a_LOD0', px: 96, suave: 0.35, cobertura: 1.2 }
];
