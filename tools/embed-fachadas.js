/* Incrusta las texturas de assets/fachadas como data: URI en src/data/facades-data.js
 * (WebGL no puede leer imágenes desde file:// sin esto). Ver assets/fachadas/CREDITS.md. */
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'assets', 'fachadas');
const mime = { '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png' };
const out = {};
for (const f of fs.readdirSync(dir).sort()) {
  const ext = path.extname(f); if (!mime[ext]) continue;
  out[path.basename(f, ext)] = 'data:' + mime[ext] + ';base64,' + fs.readFileSync(path.join(dir, f)).toString('base64');
}
const piezas = JSON.parse(fs.readFileSync(path.join(__dirname, 'fachadas', 'piezas.json'), 'utf8')).map(t => t.id);
const js = '/* Generado por tools/embed-fachadas.js — fachadas, ladrillo y tejados CC0 de Poly Haven (ver assets/fachadas/CREDITS.md). */\n' +
  '(function (RC) { RC.data.facades = ' + JSON.stringify({ atlas: { size: 2048, cols: 7, cell: 272, pad: 8, tile: 256 }, tiles: piezas, img: out }) + '; })(globalThis.RC);\n';
fs.writeFileSync(path.join(__dirname, '..', 'src', 'data', 'facades-data.js'), js);
console.log('fachadas:', Object.keys(out).join(', '), '—', (js.length / 1e6).toFixed(2), 'MB');
