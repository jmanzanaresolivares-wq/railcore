/* Incrusta las texturas de la cabina (assets/textures-cabina) como data: URI en un script
 * clásico, para que WebGL pueda usarlas también al abrir el juego desde file:// (y en el .exe).
 * Uso: node tools/embed-cab-textures.js */
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'assets', 'textures-cabina');
const out = {};
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.jpg')).sort()) {
  out[f.replace('.jpg', '')] = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(dir, f)).toString('base64');
}
const js = '/* Generado por tools/embed-cab-textures.js — texturas CC0 de Poly Haven para la cabina (ver assets/textures-cabina/CREDITS.md). No editar a mano. */\n' +
  '(function (RC) { RC.data.cabTextures = ' + JSON.stringify(out) + '; })(globalThis.RC);\n';
fs.writeFileSync(path.join(__dirname, '..', 'src', 'data', 'cab-textures-data.js'), js);
console.log('texturas de cabina:', Object.keys(out).length, 'tamaño:', (js.length / 1e6).toFixed(2), 'MB');
