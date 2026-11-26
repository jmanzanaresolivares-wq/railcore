# Marcas de RAILCORE

RAILCORE usa **nombres reales de lugares, líneas y estaciones** (Sevilla-Santa Justa, Utrera, C-1…),
pero **no** usa logotipos, libreas ni identidad visual de empresas reales. Tampoco versiones
«parecidas pero cambiadas»: una imitación de un logotipo o una librea sigue infringiendo la marca
si puede confundirse con la original.

En su lugar el juego trae un **paquete de marca ficticio y original** (`ficticia/`):

| Papel | Marca ficticia | Colores |
|---|---|---|
| Operador de viajeros | **Ferronda** (Ferronda Cercanías) | verde azulado `#0F6E6A` + azafrán `#F2A900` |
| Administrador de infraestructuras | **Trazia** | azul pizarra `#2C3E73` + azafrán |
| Distintivo de línea | cápsula «C1» | azul `#1E88C8` |

Los edificios de las estaciones se modelan a partir de su forma real (huella y alturas del
Catastro y de OpenStreetMap); cualquier rótulo de empresa se sustituye por esta marca.

## Cómo cambiar de marca (por ejemplo, si algún día hay licencia oficial)

Todo el juego lee la marca de un único sitio, `RC.data.brand` (`src/data/brand.js`):
carteles de estación, librea de los trenes, pantallas y textos de radio.

1. Crea una carpeta nueva, p. ej. `assets/brand/oficial/`, con un `brand.json` con la misma
   estructura que `ficticia/brand.json` y sus SVG.
2. Ejecuta `node tools/brand/embed-brand.js oficial`.
3. Guarda junto a los archivos el documento de licencia. **No subas al repositorio ningún
   logotipo real sin una licencia escrita del titular.**
