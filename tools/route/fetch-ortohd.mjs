// RAILCORE — Ortofoto PNOA de alta resolución en una franja junto a la vía de la C-1.
// Se ejecuta en GitHub Actions (necesita Internet; ver .github/workflows/orto-hd.yml).
// Descarga del WMS del IGN celdas UTM de 100 m × 100 m a PX×PX píxeles (≈0,31 m/píxel)
// a menos de BUF metros de la vía, las recomprime y genera:
//   src/data/c1/ortohd/<E100>_<N100>.js   (RC.data.c1ortohd[celda] = data URI JPEG)
//   src/data/c1/ortohd-indice.js           (lista de celdas disponibles)
// La ortofoto PNOA es © Instituto Geográfico Nacional, CC BY 4.0 (ver CREDITOS-DATOS.md).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import jpeg from 'jpeg-js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const OUT = path.join(ROOT, 'src', 'data', 'c1', 'ortohd');
const CELL = 100, PX = 320, BUF = 70, QUALITY = 70;
const UA = 'RAILCORE-route-builder/0.1 (open-source railway simulator; github.com/jmanzanaresolivares-wq/railcore)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Trazado de la vía (coordenadas locales respecto al origen UTM de la línea)
const ctx = { RC: { data: {} } }; ctx.globalThis = ctx;
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'src', 'data', 'c1', 'line-c1-real.js'), 'utf8'), ctx);
const L = ctx.RC.data.lineC1, G = L.geometry, O = L.origin;
const cells = new Set();
for (let i = 0; i < G.px.length; i++) {
  const E = O.E + G.px[i], N = O.N - G.pz[i];
  for (let e = Math.floor((E - BUF) / CELL); e <= Math.floor((E + BUF) / CELL); e++)
    for (let n = Math.floor((N - BUF) / CELL); n <= Math.floor((N + BUF) / CELL); n++) cells.add(e + '_' + n);
}
const list = [...cells].sort().slice(0, +process.env.MAX || Infinity); // MAX=n para pruebas
fs.mkdirSync(OUT, { recursive: true });
console.log('celdas', list.length);

async function get(url, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(60000), headers: { 'User-Agent': UA } });
      if (r.ok) return Buffer.from(await r.arrayBuffer());
      last = new Error('HTTP ' + r.status);
    } catch (e) { last = e; }
    await sleep(2000 * (i + 1));
  }
  throw last;
}

let ok = 0, fail = 0, bytes = 0, firstErr = null;
const done = [];
const queue = list.slice();
async function worker() {
  while (queue.length) {
    const key = queue.shift(), f = path.join(OUT, key + '.js');
    if (fs.existsSync(f)) { ok++; done.push(key); bytes += fs.statSync(f).size; continue; }
    const [e, n] = key.split('_').map(Number), E0 = e * CELL, N0 = n * CELL;
    const url = `https://www.ign.es/wms-inspire/pnoa-ma?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=OI.OrthoimageCoverage&STYLES=&CRS=EPSG:25830&BBOX=${E0},${N0},${E0 + CELL},${N0 + CELL}&WIDTH=${PX}&HEIGHT=${PX}&FORMAT=image/jpeg`;
    try {
      let buf = await get(url);
      if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error(buf.toString('utf8', 0, 300));
      // Recomprimir: la del IGN viene con calidad alta y pesa el doble
      try {
        const img = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 256 });
        const re = jpeg.encode({ data: img.data, width: img.width, height: img.height }, QUALITY).data;
        if (re.length < buf.length) buf = Buffer.from(re);
      } catch (e2) { /* se queda la original */ }
      const js = `RC.data.c1ortohd[${JSON.stringify(key)}]='data:image/jpeg;base64,${buf.toString('base64')}';\n`;
      fs.writeFileSync(f, js);
      ok++; done.push(key); bytes += js.length;
    } catch (e) { fail++; firstErr = firstErr || String(e).slice(0, 300); }
    await sleep(60);
  }
}
await Promise.all([worker(), worker(), worker()]);
done.sort();
fs.writeFileSync(path.join(ROOT, 'src', 'data', 'c1', 'ortohd-indice.js'),
  '/* GENERADO por tools/route/fetch-ortohd.mjs. Ortofoto PNOA © IGN, CC BY 4.0. */\n' +
  `RC.data.c1ortohdIndex={cell:${CELL},px:${PX},cells:${JSON.stringify(done)}};\n`);
console.log(JSON.stringify({ celdas: list.length, ok, fail, mb: +(bytes / 1e6).toFixed(1), firstErr }));
if (!ok) process.exit(1);
