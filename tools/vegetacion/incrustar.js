/* RAILCORE — Incrusta los atlas de vegetación de assets/vegetacion (hechos con hornear.js) como
 * data: URI en src/data/vegetation-data.js, un script clásico que funciona también desde file://
 * y en el .exe. Uso: node tools/vegetacion/incrustar.js */
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', '..', 'assets', 'vegetacion');
const man = JSON.parse(fs.readFileSync(path.join(dir, 'vegetacion.json'), 'utf8'));
const CAMPOS = ['w', 'h', 'y0', 'views', 'cols', 'rows', 'cw', 'ch', 'atlasW', 'atlasH'];
const out = {};
let bytes = 0;
for (const id of Object.keys(man.especies).sort()) {
  const m = man.especies[id], e = {};
  CAMPOS.forEach(k => { e[k] = m[k]; });
  ['color', 'normal'].forEach(k => {
    const f = path.join(dir, id + (k === 'normal' ? '_n' : '') + '.webp'), b = fs.readFileSync(f);
    bytes += b.length;
    e[k] = 'data:image/webp;base64,' + b.toString('base64');
  });
  out[id] = e;
}
const js = '/* Generado por tools/vegetacion/incrustar.js — impostores de vegetación horneados de modelos CC0 de Poly Haven\n' +
  ' * (ver assets/vegetacion/CREDITS.md). No editar a mano. */\n' +
  '(function (RC) { RC.data.vegetation = { especies: ' + JSON.stringify(out) + ' }; })(globalThis.RC);\n';
const dst = path.join(__dirname, '..', '..', 'src', 'data', 'vegetation-data.js');
fs.writeFileSync(dst, js);
console.log('vegetación:', Object.keys(out).length, 'especies ·', (bytes / 1e6).toFixed(2), 'MB de imágenes ·', (js.length / 1e6).toFixed(2), 'MB de script');
