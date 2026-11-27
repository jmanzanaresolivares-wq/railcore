/* RAILCORE — Horneado de impostores de vegetación (herramienta de desarrollo, no va en el juego).
 *
 * Convierte modelos CC0 de Poly Haven (cientos de miles a millones de polígonos) en atlas de
 * 8 vistas alrededor del eje vertical que el juego dibuja como carteles que miran a la cámara:
 *   <id>.webp    color con oclusión ambiental horneada, alfa de cobertura (premultiplicado en lineal)
 *   <id>_n.webp  normales en espacio del objeto (para iluminar con el sol del juego)
 * y vegetacion.json con las medidas de cada especie. Después, incrustar.js genera
 * src/data/vegetation-data.js.
 *
 * Uso (desde tools/vegetacion, tras «npm install»):
 *   node descargar.js [--modelos dir]                       (glTF 1K y mapas de alfa de Poly Haven)
 *   node hornear.js [--modelos dir] [--solo id1,id2] [--previas dir]
 * Por defecto los modelos van a <tmp>/railcore-vegetacion/dl/<asset>/ y las vistas previas a
 * <tmp>/railcore-vegetacion/previas. Se tratan como datos: el navegador sólo los lee para dibujarlos.
 * Dibuja con Chromium sin ventana (Playwright) y WebGL por software (SwiftShader). */
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { chromium } = require('playwright');
const ESPECIES = require('./especies.js');

const argv = process.argv.slice(2);
function opt(name, def) { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : def; }
const TMP = path.join(os.tmpdir(), 'railcore-vegetacion');
const MODELOS = path.resolve(opt('modelos', path.join(TMP, 'dl')));
const SALIDA = path.resolve(__dirname, '../../assets/vegetacion');
const PREVIAS = path.resolve(opt('previas', path.join(TMP, 'previas')));
const SOLO = opt('solo', '') ? opt('solo', '').split(',') : null;
const THREE_DIR = path.join(__dirname, 'node_modules', 'three');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.jpg': 'image/jpeg', '.png': 'image/png' };
function serve(req, res) {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let base = null, rel = null;
  if (url === '/pagina.html') { base = __dirname; rel = 'hornear.html'; }
  else if (url.startsWith('/three/')) { base = THREE_DIR; rel = url.slice(7); }
  else if (url.startsWith('/modelos/')) { base = MODELOS; rel = url.slice(9); }
  const file = base && path.resolve(base, rel);
  if (!file || !file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

function saveDataUrl(file, url) { fs.writeFileSync(file, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')); }

(async () => {
  fs.mkdirSync(SALIDA, { recursive: true }); fs.mkdirSync(PREVIAS, { recursive: true });
  const server = http.createServer(serve);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=8192'] });
  const manPath = path.join(SALIDA, 'vegetacion.json');
  const manifest = fs.existsSync(manPath) ? JSON.parse(fs.readFileSync(manPath, 'utf8')) : { especies: {} };
  for (const sp of ESPECIES) {
    if (SOLO && SOLO.indexOf(sp.id) < 0) continue;
    const t0 = Date.now();
    const texDir = path.join(MODELOS, sp.asset, 'textures');
    const texturas = fs.existsSync(texDir) ? fs.readdirSync(texDir) : [];
    const gltf = fs.readdirSync(path.join(MODELOS, sp.asset)).find(f => f.endsWith('.gltf'));
    const page = await browser.newPage();
    page.on('console', m => console.log('  [página]', m.text()));
    page.on('pageerror', e => console.log('  [error]', e.message));
    await page.goto('http://127.0.0.1:' + port + '/pagina.html');
    await page.waitForFunction('window.listo === true');
    const r = await page.evaluate(a => window.hornear(a), Object.assign({}, sp, { gltf: sp.asset + '/' + gltf, texturas: texturas }));
    await page.close();
    saveDataUrl(path.join(SALIDA, sp.id + '.webp'), r.color);
    saveDataUrl(path.join(SALIDA, sp.id + '_n.webp'), r.normal);
    saveDataUrl(path.join(PREVIAS, sp.id + '.png'), r.previa);
    manifest.especies[sp.id] = Object.assign({ asset: sp.asset, nodo: sp.nodo || null }, r.meta);
    fs.writeFileSync(manPath, JSON.stringify(manifest, null, 1) + '\n');
    const kb = f => (fs.statSync(path.join(SALIDA, f)).size / 1024).toFixed(0);
    console.log(sp.id, 'listo en', ((Date.now() - t0) / 1000).toFixed(0) + ' s', '·', r.meta.w.toFixed(2) + '×' + r.meta.h.toFixed(2) + ' m', '·', r.meta.atlasW + '×' + r.meta.atlasH, '·', kb(sp.id + '.webp') + ' + ' + kb(sp.id + '_n.webp') + ' KB', '·', r.info);
  }
  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
