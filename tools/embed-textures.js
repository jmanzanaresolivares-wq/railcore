/* Incrusta las texturas de assets/textures como data: URI en un script clásico,
 * para que WebGL pueda usarlas también al abrir el juego desde file:// (y en el .exe). */
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'assets', 'textures');
const out = {};
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.jpg')).sort()) {
  out[f.replace('.jpg', '')] = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(dir, f)).toString('base64');
}
const js = '/* Generado por tools/embed-textures.js — texturas CC0 de Poly Haven (ver assets/textures/CREDITS.md). */\n' +
  '(function (RC) { RC.data.textures = ' + JSON.stringify(out) + '; })(globalThis.RC);\n';
fs.writeFileSync(path.join(__dirname, '..', 'src', 'data', 'textures-data.js'), js);
console.log('texturas:', Object.keys(out).length, 'tamaño:', (js.length / 1e6).toFixed(1), 'MB');
