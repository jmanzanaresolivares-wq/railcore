// Regenera src/data/brand.js a partir de assets/brand/<paquete>/brand.json y sus SVG.
// Uso: node tools/brand/embed-brand.js [paquete]   (por defecto «ficticia»)
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const pack = process.argv[2] || 'ficticia';
const dir = path.join(ROOT, 'assets', 'brand', pack);
const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'brand.json'), 'utf8'));
const svg = (f) => fs.readFileSync(path.join(dir, f), 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').trim();
// Sustituye cada campo "*.svg" por su contenido
(function walk(o) {
  for (const k in o) {
    if (typeof o[k] === 'string' && /\.svg$/.test(o[k])) o[k] = svg(o[k]);
    else if (o[k] && typeof o[k] === 'object') walk(o[k]);
  }
})(cfg);
cfg.pack = pack;
const js = `/* RAILCORE — Marca activa: paquete «${pack}».
 * GENERADO por tools/brand/embed-brand.js a partir de assets/brand/${pack}/. No editar a mano.
 * Ver assets/brand/README.md. */
(function (RC) {
  RC.data = RC.data || {};
  var B = ${JSON.stringify(cfg, null, 1)};
  /* Convierte un SVG de la marca en imagen (para texturas de carteles y del tren). */
  B.image = function (svg, cb) {
    var img = new Image();
    img.onload = function () { cb(img); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    return img;
  };
  B.hex = function (c) { return parseInt(String(c).replace('#', ''), 16); };
  RC.data.brand = B;
})(globalThis.RC);
`;
fs.writeFileSync(path.join(ROOT, 'src', 'data', 'brand.js'), js);
console.log('src/data/brand.js ←', pack);
