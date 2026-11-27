/* RAILCORE — Descarga los modelos CC0 de Poly Haven que usa especies.js (herramienta de desarrollo).
 * Para cada modelo: el glTF 1K con sus texturas y, aparte, los mapas de alfa (y el difuso «seco»)
 * en JPG 1K, que el glTF no trae. Comprueba el md5 que publica Poly Haven. Los ficheros
 * descargados son sólo datos para hornear.js: nunca se ejecutan.
 * Uso: node tools/vegetacion/descargar.js [--modelos dir]   (por defecto <tmp>/railcore-vegetacion/dl)
 * Usa curl (respeta el proxy del sistema). */
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const ESPECIES = require('./especies.js');

const argv = process.argv.slice(2);
const i = argv.indexOf('--modelos');
const MODELOS = path.resolve(i >= 0 ? argv[i + 1] : path.join(os.tmpdir(), 'railcore-vegetacion', 'dl'));
const API = 'https://api.polyhaven.com/files/';

function curl(url, dst) {
  const args = ['-s', '-f', '-L', '--retry', '3', '-A', 'Mozilla/5.0 (railcore-vegetacion)'];
  if (dst) execFileSync('curl', args.concat(['-o', dst, url]));
  else return execFileSync('curl', args.concat([url]), { maxBuffer: 64 << 20 }).toString('utf8');
}
function bajar(meta, dst) {
  if (fs.existsSync(dst) && fs.statSync(dst).size === meta.size) return 'ya estaba';
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  curl(meta.url, dst);
  const md5 = crypto.createHash('md5').update(fs.readFileSync(dst)).digest('hex');
  if (meta.md5 && md5 !== meta.md5) throw new Error('md5 distinto en ' + dst);
  return 'ok';
}

const assets = [...new Set(ESPECIES.map(s => s.asset))];
for (const a of assets) {
  if (!/^[a-z0-9_]+$/.test(a)) throw new Error('nombre de modelo raro: ' + a);
  const info = JSON.parse(curl(API + a));
  const dir = path.join(MODELOS, a), g = info.gltf['1k'].gltf;
  const lista = [[path.basename(new URL(g.url).pathname), g]].concat(Object.entries(g.include || {}));
  // mapas de alfa y difuso seco (JPG 1K): las hojas son tarjetas recortadas
  for (const k in info) {
    if (!/alpha/i.test(k) && k !== 'dry_diff') continue;
    const m = info[k]['1k'] && info[k]['1k'].jpg; if (m) lista.push(['textures/' + path.basename(new URL(m.url).pathname), m]);
  }
  for (const [rel, meta] of lista) {
    const dst = path.resolve(dir, rel);
    if (!dst.startsWith(dir + path.sep)) throw new Error('ruta fuera de la carpeta: ' + rel);
    bajar(meta, dst);
  }
  console.log(a, '·', lista.length, 'ficheros');
}
console.log('modelos en', MODELOS);
