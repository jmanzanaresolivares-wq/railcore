/* RAILCORE — Hornea las piezas de fachada (herramienta de desarrollo, no forma parte del juego).
 * 1) Descarga de Poly Haven (CC0) el modelo «modular_urban_apartments_facade» en glTF 2K y déjalo en
 *    tools/fachadas/modelo/ (el .gltf, el .bin y la carpeta textures/).
 * 2) Instala three@0.158.0 en la raíz (npm i --no-save three@0.158.0) y sirve la raíz del proyecto:
 *    python3 -m http.server 8765 --bind 127.0.0.1
 * 3) node tools/fachadas/hornear.js   → tools/fachadas/salida/{albedo,mask,normal}/<pieza>.png
 * 4) python3 tools/fachadas/componer.py   → assets/fachadas/fachadas-*.webp
 * 5) node tools/embed-fachadas.js         → src/data/facades-data.js */
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
(async () => {
  const tiles = JSON.parse(fs.readFileSync(path.join(__dirname, 'piezas.json'), 'utf8'));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  page.on('console', m => { if (m.type() === 'error') console.log('[consola]', m.text()); });
  page.on('pageerror', e => console.log('[error]', e.message));
  await page.goto('http://127.0.0.1:8765/tools/fachadas/hornear.html');
  await page.waitForFunction(() => window.ready, null, { timeout: 120000 });
  for (const pass of ['albedo', 'mask', 'normal']) {
    const dir = path.join(__dirname, 'salida', pass);
    fs.mkdirSync(dir, { recursive: true });
    for (const t of tiles) {
      const d = await page.evaluate(([p, h, pass]) => window.render(p, h, pass), [t.parts, t.h, pass]);
      fs.writeFileSync(path.join(dir, t.id + '.png'), Buffer.from(d.split(',')[1], 'base64'));
    }
    console.log('hecho', pass);
  }
  await browser.close();
})();
