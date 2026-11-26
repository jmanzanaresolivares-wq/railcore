// RAILCORE — Construye la ruta jugable C-1 Santa Justa – Utrera a partir de
// las copias de datos abiertos en data/fuentes/c1/ (ver fetch-sources.mjs).
// Salida en src/data/c1/: línea (formato de src/data/line-c1.js ampliado),
// terreno por teselas, edificios y ortofotos.  Sin conexión y determinista.
import fs from 'node:fs';
import path from 'node:path';
import { toUTM, fromUTM } from './geo.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const SRC = path.join(ROOT, 'data', 'fuentes', 'c1');
const OUT = path.join(ROOT, 'src', 'data', 'c1');
fs.mkdirSync(path.join(OUT, 'orto'), { recursive: true });
const STEP = 5, X0 = -800;
const log = (...a) => console.log(...a);
const rd = (f) => JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
const has = (f) => fs.existsSync(path.join(SRC, f));

/* ---------- OSM ---------- */
const osm = rd('osm.json');
const nodes = new Map(), ways = new Map();
osm.elements.forEach((e) => {
  if (e.type === 'node') { const prev = nodes.get(e.id); nodes.set(e.id, prev && prev.tags ? prev : e); }
  if (e.type === 'way') { const prev = ways.get(e.id); ways.set(e.id, prev && prev.tags ? prev : e); }
});
for (const nd of nodes.values()) { const [E, N] = toUTM(nd.lat, nd.lon); nd.E = E; nd.N = N; }

// Grafo de vías (railway=rail). Peso = longitud × penalización por tipo de vía.
const adj = new Map();
function addEdge(a, b, w, wayId) { if (!adj.has(a)) adj.set(a, []); adj.get(a).push({ to: b, w, way: wayId }); }
for (const w of ways.values()) {
  const t = w.tags || {};
  if (t.railway !== 'rail') continue;
  let pen = 1;
  if (t.service === 'yard' || t.service === 'spur') pen = 6;
  else if (t.service === 'siding') pen = 2.5;
  else if (t.service === 'crossover') pen = 3;
  if (t.usage === 'freight' || t.usage === 'industrial') pen *= 4;
  if (t.gauge && !/1668/.test(t.gauge)) pen *= 50; // ancho estándar (AVE): evitar
  for (let i = 0; i + 1 < w.nodes.length; i++) {
    const a = nodes.get(w.nodes[i]), b = nodes.get(w.nodes[i + 1]);
    if (!a || !b) continue;
    const d = Math.hypot(a.E - b.E, a.N - b.N) * pen;
    addEdge(a.id, b.id, d, w.id); addEdge(b.id, a.id, d, w.id);
  }
}
function dijkstra(src, dstSet) {
  const dist = new Map([[src, 0]]), prev = new Map(), done = new Set();
  const heap = [[0, src]];
  const push = (x) => { heap.push(x); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) {
    const [d, u] = pop();
    if (done.has(u)) continue; done.add(u);
    if (dstSet.has(u)) { const p = [u]; let c = u; while (prev.has(c)) { c = prev.get(c); p.push(c); } return p.reverse(); }
    for (const e of adj.get(u) || []) {
      const nd = d + e.w;
      if (nd < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, nd); prev.set(e.to, u); push([nd, e.to]); }
    }
  }
  return null;
}

/* ---------- Estaciones de la C-1 en orden ---------- */
const STATIONS = [
  { id: 'SJ', name: 'Sevilla-Santa Justa', re: /santa justa/i },
  { id: 'SB', name: 'San Bernardo', re: /san bernardo/i },
  { id: 'VR', name: 'Virgen del Rocío', re: /virgen del roc/i },
  { id: 'JH', name: 'Jardines de Hércules', re: /jardines de h/i },
  { id: 'BV', name: 'Bellavista', re: /bellavista/i },
  { id: 'DH', name: 'Dos Hermanas', re: /^dos hermanas$/i },
  { id: 'UT', name: 'Utrera', re: /^utrera$/i }
];
const stationNodes = [...nodes.values()].filter((n) => n.tags && /^(station|halt|stop)$/.test(n.tags.railway || n.tags.public_transport === 'station' && 'station'));
const platforms = [...ways.values()].filter((w) => w.tags && (w.tags.railway === 'platform' || w.tags.public_transport === 'platform') && w.nodes.every((id) => nodes.has(id)));
STATIONS.forEach((s) => {
  const cands = stationNodes.filter((n) => s.re.test(n.tags.name || '') || s.re.test(n.tags['name:es'] || ''));
  // Preferir railway=station del ancho ibérico
  // Preferir las paradas de tren (train=yes) sobre la red de vías; luego railway=station sin metro
  const rank = (n) => (n.tags.train === 'yes' && adj.has(n.id) ? 0 : n.tags.train === 'yes' ? 1 : n.tags.railway === 'station' && !n.tags.subway ? 2 : 3);
  cands.sort((a, b) => rank(a) - rank(b));
  s.stops = cands.filter((n) => n.tags.train === 'yes' && adj.has(n.id)).map((n) => n.id);
  if (!cands.length) throw new Error('Sin estación OSM para ' + s.name);
  s.node = cands[0];
  s.cands = cands.map((c) => c.id);
  log('estación', s.name, '→ nodo', s.node.id, s.node.tags.railway, s.node.tags.name);
});

// Nodos de vía cercanos a cada estación (≤ 250 m), por los que forzar el paso
function railNodesNear(E, N, r) {
  const out = new Set();
  for (const id of adj.keys()) { const n = nodes.get(id); if (Math.hypot(n.E - E, n.N - N) < r) out.add(id); }
  return out;
}
let path_ = null;
{
  const near = STATIONS.map((s) => railNodesNear(s.node.E, s.node.N, 220));
  // Destinos: puntos de parada de tren de cada estación si existen; si no, vías cercanas
  const targets = STATIONS.map((s, i) => (s.stops.length ? new Set(s.stops) : near[i]));
  // Inicio: la vía de Santa Justa con el camino más corto hacia San Bernardo
  let start = null, bestLen = Infinity;
  for (const c of (STATIONS[0].stops.length ? STATIONS[0].stops : [...near[0]])) {
    const p = dijkstra(c, targets[1]); if (!p) continue;
    let L = 0; for (let k = 0; k + 1 < p.length; k++) L += (adj.get(p[k]).find((e) => e.to === p[k + 1]) || { w: 1e9 }).w;
    if (L < bestLen) { bestLen = L; start = c; }
  }
  log('salida de Santa Justa desde', nodes.get(start).tags ? nodes.get(start).tags.name : start);
  let full = [start];
  for (let i = 1; i < STATIONS.length; i++) {
    const p = dijkstra(full[full.length - 1], targets[i]);
    if (!p) throw new Error('Sin camino hasta ' + STATIONS[i].name);
    full = full.concat(p.slice(1));
  }
  // Prolongar 900 m pasado Utrera y 900 m antes de Santa Justa (para ver el final de la vía)
  path_ = full;
}

// Polilínea en UTM y vías OSM que recorre
const wayOf = []; // para cada tramo i→i+1, id de vía
for (let i = 0; i + 1 < path_.length; i++) {
  const e = (adj.get(path_[i]) || []).find((x) => x.to === path_[i + 1]);
  wayOf.push(e ? e.way : null);
}
let pl = path_.map((id) => [nodes.get(id).E, nodes.get(id).N]);
const cum = [0];
for (let i = 1; i < pl.length; i++) cum.push(cum[i - 1] + Math.hypot(pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]));
log('camino', path_.length, 'nodos,', (cum[cum.length - 1] / 1000).toFixed(2), 'km');

// Proyección de un punto sobre la polilínea → {s, d (con signo: + derecha), seg}
function project(E, N) {
  let best = { d2: Infinity };
  for (let i = 0; i + 1 < pl.length; i++) {
    const [ax, ay] = pl[i], [bx, by] = pl[i + 1], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    let t = ((E - ax) * dx + (N - ay) * dy) / L2; t = Math.max(0, Math.min(1, t));
    const px = ax + t * dx, py = ay + t * dy, d2 = (E - px) ** 2 + (N - py) ** 2;
    if (d2 < best.d2) {
      const cross = dx * (N - ay) - dy * (E - ax); // >0 izquierda
      best = { d2, s: cum[i] + t * Math.sqrt(L2), seg: i, side: cross > 0 ? -1 : 1 };
    }
  }
  best.d = Math.sqrt(best.d2) * best.side;
  return best;
}
function pointAt(s) {
  if (s <= 0) { const [a, b] = [pl[0], pl[1]], L = cum[1]; return [a[0] + (b[0] - a[0]) * s / L, a[1] + (b[1] - a[1]) * s / L]; }
  let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
  const L = cum[i] - cum[i - 1] || 1, t = (s - cum[i - 1]) / L;
  return [pl[i - 1][0] + (pl[i][0] - pl[i - 1][0]) * t, pl[i - 1][1] + (pl[i][1] - pl[i - 1][1]) * t];
}

/* ---------- Andenes y punto de parada ---------- */
const stationInfo = STATIONS.map((s, i) => {
  const proj = project(s.node.E, s.node.N);
  // Andenes junto a la vía recorrida (borde a 1,5–6 m del eje) en ±400 m de la estación
  let best = null;
  for (const pw of platforms) {
    const pts = pw.nodes.map((id) => nodes.get(id)).map((n) => project(n.E, n.N));
    const sMin = Math.min(...pts.map((p) => p.s)), sMax = Math.max(...pts.map((p) => p.s));
    if (sMax < proj.s - 500 || sMin > proj.s + 500) continue;
    const near = pts.filter((p) => Math.abs(p.d) < 7.5);
    if (near.length < 1 || sMax - sMin < 40) continue;
    const side = Math.sign(near.reduce((a, p) => a + p.d, 0));
    const score = Math.min(...near.map((p) => Math.abs(p.d))) + Math.abs((sMin + sMax) / 2 - proj.s) / 100;
    if (!best || score < best.score) best = { score, sMin, sMax, side, id: pw.id };
  }
  let stopS, len, side;
  const stopNode = s.stops.find((id) => path_.includes(id));
  if (stopNode && !best) { len = 200; stopS = cum[path_.indexOf(stopNode)]; side = 'derecha'; }
  else if (best) { len = Math.round(best.sMax - best.sMin); stopS = best.sMax - 8; side = best.side > 0 ? 'derecha' : 'izquierda'; }
  else { len = 200; stopS = proj.s + 100; side = 'derecha'; }
  if (stopNode && best) stopS = Math.min(stopS, cum[path_.indexOf(stopNode)] + 20);
  log('andén', s.name, best ? 'OSM ' + best.id : 'SIN ANDÉN (estimado)', stopNode ? 'parada OSM ' + stopNode : '', 'long', len, 'lado', side, 's', stopS.toFixed(0));
  return { ...s, stopS, platformLength: Math.min(len, 260), side, platformOsm: best ? best.id : null, verified: !!best };
});

// Origen de la coordenada x: punto de parada de Santa Justa
const S0 = stationInfo[0].stopS;
const xOf = (s) => s - S0;
const LEN = Math.round(xOf(stationInfo[stationInfo.length - 1].stopS));
const X1 = LEN + 900;

/* ---------- Geometría muestreada cada 5 m ---------- */
const [oE, oN] = pointAt(S0);
const geoPts = [];
for (let x = X0; x <= X1 + 1e-6; x += STEP) geoPts.push(pointAt(x + S0));

/* ---------- MDT: altitud del terreno ---------- */
let demTiles = null;
async function loadDem() {
  const dir = path.join(SRC, 'mdt');
  if (!fs.existsSync(dir)) return null;
  const { fromArrayBuffer } = await import('geotiff');
  const tiles = new Map();
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.tif'))) {
    const buf = fs.readFileSync(path.join(dir, f));
    const tif = await fromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
    const img = await tif.getImage();
    const [data] = await img.readRasters();
    const [x0, y1] = img.getOrigin(), [rx, ry] = img.getResolution();
    const nod = img.getGDALNoData();
    tiles.set(f.replace('.tif', ''), { data, w: img.getWidth(), h: img.getHeight(), x0, y1, rx, ry: Math.abs(ry), nod });
  }
  return tiles;
}
function demAt(E, N) {
  if (!demTiles) return null;
  const t = demTiles.get(Math.floor(E / 1000) + '_' + Math.floor(N / 1000));
  if (!t) return null;
  const fx = (E - t.x0) / t.rx - 0.5, fy = (t.y1 - N) / t.ry - 0.5;
  const ix = Math.max(0, Math.min(t.w - 2, Math.floor(fx))), iy = Math.max(0, Math.min(t.h - 2, Math.floor(fy)));
  const ax = Math.min(1, Math.max(0, fx - ix)), ay = Math.min(1, Math.max(0, fy - iy));
  const g = (x, y) => t.data[y * t.w + x];
  const v = [g(ix, iy), g(ix + 1, iy), g(ix, iy + 1), g(ix + 1, iy + 1)];
  if (v.some((q) => q === t.nod || q < -100 || q > 3500 || !isFinite(q))) return null;
  return (v[0] * (1 - ax) + v[1] * ax) * (1 - ay) + (v[2] * (1 - ax) + v[3] * ax) * ay;
}
demTiles = await loadDem();
log('MDT teselas', demTiles ? demTiles.size : 0);

// Tramos en puente / túnel / trinchera cubierta según OSM, en coordenada x
function waySpans(pred) {
  const spans = [];
  let cur = null;
  for (let i = 0; i < wayOf.length; i++) {
    const w = ways.get(wayOf[i]), on = !!(w && w.tags && pred(w.tags));
    const a = xOf(cum[i]), b = xOf(cum[i + 1]);
    if (on) { if (cur && Math.abs(cur.to - a) < 1) cur.to = b; else { cur = { from: Math.round(a), to: Math.round(b) }; spans.push(cur); } }
  }
  spans.forEach((s) => { s.from = Math.round(s.from); s.to = Math.round(s.to); });
  return spans.filter((s) => s.to - s.from > 8);
}
const bridges = waySpans((t) => t.bridge && t.bridge !== 'no');
const tunnels = waySpans((t) => t.tunnel && t.tunnel !== 'no' && t.tunnel !== 'building_passage');
const covered = waySpans((t) => t.covered === 'yes' || t.tunnel === 'building_passage');
const inSpan = (spans, x) => spans.some((s) => x >= s.from - 20 && x <= s.to + 20);

// Perfil: altitud del terreno a lo largo del eje, ignorando puentes y túneles; se suaviza
// (el MDT es la superficie del suelo; la rasante de la vía es mucho más regular).
const raw = geoPts.map(([E, N], i) => {
  const x = X0 + i * STEP;
  if (inSpan(bridges, x) || inSpan(tunnels, x)) return null;
  return demAt(E, N);
});
function fillNulls(a) {
  const out = a.slice(); let last = -1;
  for (let i = 0; i < out.length; i++) {
    if (out[i] == null) continue;
    if (last < 0) for (let k = 0; k < i; k++) out[k] = out[i];
    else for (let k = last + 1; k < i; k++) out[k] = out[last] + (out[i] - out[last]) * (k - last) / (i - last);
    last = i;
  }
  if (last < 0) return out.map(() => 10);
  for (let k = last + 1; k < out.length; k++) out[k] = out[last];
  return out;
}
let prof = fillNulls(raw);
// Mediana móvil (±75 m) + media móvil (±150 m)
const med = (a, r) => a.map((_, i) => { const w = a.slice(Math.max(0, i - r), i + r + 1).sort((p, q) => p - q); return w[w.length >> 1]; });
const avg = (a, r) => a.map((_, i) => { let s = 0, n = 0; for (let k = Math.max(0, i - r); k <= Math.min(a.length - 1, i + r); k++) { s += a[k]; n++; } return s / n; });
prof = avg(avg(med(prof, 15), 30), 30);
const Z0 = prof[Math.round((0 - X0) / STEP)];

// Rasantes: tramos de ~250 m con pendiente constante (‰), redondeada a 0,5 ‰
const gradients = [];
for (let x = X0; x < X1; x += 250) {
  const i0 = Math.round((x - X0) / STEP), i1 = Math.min(prof.length - 1, Math.round((x + 250 - X0) / STEP));
  const pm = Math.round(((prof[i1] - prof[i0]) / ((i1 - i0) * STEP)) * 2000) / 2;
  const last = gradients[gradients.length - 1];
  if (last && last.permil === pm) last.to = x + 250; else gradients.push({ from: x, to: x + 250, permil: pm });
}
// Altura de la vía en la geometría: integrar las rasantes (coherente con la física)
const pyArr = []; {
  let y = 0; const i0 = Math.round((0 - X0) / STEP);
  const gAt = (x) => (gradients.find((g) => x >= g.from && x < g.to) || { permil: 0 }).permil;
  const ys = new Array(geoPts.length);
  ys[i0] = 0;
  for (let i = i0 + 1; i < geoPts.length; i++) { y += gAt(X0 + (i - 1) * STEP) / 1000 * STEP; ys[i] = y; }
  y = 0; for (let i = i0 - 1; i >= 0; i--) { y -= gAt(X0 + i * STEP) / 1000 * STEP; ys[i] = y; }
  pyArr.push(...ys);
}

/* ---------- Curvas (radio con signo, + derecha) ---------- */
const headings = geoPts.map((_, i) => {
  const a = geoPts[Math.max(0, i - 4)], b = geoPts[Math.min(geoPts.length - 1, i + 4)];
  return Math.atan2(b[0] - a[0], b[1] - a[1]);
});
const curves = [];
for (let i = 0; i + 20 < headings.length; i += 20) {
  let dh = headings[i + 20] - headings[i]; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
  const k = dh / (20 * STEP);
  if (Math.abs(k) < 1 / 6000) continue;
  let R = Math.round(1 / k / 50) * 50;
  const from = X0 + i * STEP, to = from + 100, last = curves[curves.length - 1];
  if (last && last.to === from && Math.sign(last.radius) === Math.sign(R) && Math.abs(Math.abs(last.radius) - Math.abs(R)) / Math.abs(R) < 0.25) last.to = to;
  else curves.push({ from, to, radius: R });
}

/* ---------- Velocidades máximas (OSM maxspeed) ---------- */
const parseKmh = (v) => { const m = String(v || '').match(/\d+/); return m ? +m[0] : null; };
// Sin dato en OSM: 80 km/h prudente y marcado [Verificar]
const UNKNOWN_KMH = 80, unknownSpans = [];
let speedLimits = [], cur = null, unknown = 0;
for (let i = 0; i < wayOf.length; i++) {
  const t = (ways.get(wayOf[i]) || {}).tags || {};
  let v = parseKmh(t['maxspeed:forward'] || t.maxspeed);
  if (v == null) { unknown += cum[i + 1] - cum[i]; unknownSpans.push([Math.round(xOf(cum[i])), Math.round(xOf(cum[i + 1]))]); v = UNKNOWN_KMH; }
  v = Math.min(v, 120); // Civia: 120 km/h
  const a = Math.round(xOf(cum[i])), b = Math.round(xOf(cum[i + 1]));
  if (cur && cur.kmh === v) cur.to = b; else { cur = { from: a, to: b, kmh: v }; speedLimits.push(cur); }
}
log('velocidades OSM en bruto', JSON.stringify(speedLimits.map((q) => [q.from, q.to, q.kmh])));
speedLimits[0].from = X0; speedLimits[speedLimits.length - 1].to = X1;
// Fusionar tramos muy cortos (< 150 m) con el más restrictivo vecino
speedLimits = speedLimits.reduce((acc, s) => {
  const last = acc[acc.length - 1];
  if (last && (s.to - s.from < 150)) { last.to = s.to; last.kmh = Math.min(last.kmh, s.kmh); }
  else if (last && last.kmh === s.kmh) last.to = s.to; else acc.push({ ...s });
  return acc;
}, []);
speedLimits.forEach((q) => { if (unknownSpans.some(([a, b]) => a < q.to && b > q.from && b - a > 50)) q.verificar = 'sin dato en OSM'; });
// Entrada y salida de estaciones terminales a 30–60 (prudencia, en ausencia de datos)
log('velocidad desconocida en', (unknown / 1000).toFixed(1), 'km', JSON.stringify(unknownSpans.reduce((a, q) => { const l = a[a.length - 1]; if (l && Math.abs(l[1] - q[0]) < 2) l[1] = q[1]; else a.push(q.slice()); return a; }, [])));

/* ---------- Señales, desvíos, pasos a nivel y postes kilométricos ---------- */
const onPath = new Set(path_);
const pathIdx = new Map(path_.map((id, i) => [id, i]));
function nodeX(n) { if (pathIdx.has(n.id)) return xOf(cum[pathIdx.get(n.id)]); return xOf(project(n.E, n.N).s); }
const signals = [], switches = [], crossings = [], kmPosts = [];
for (const n of nodes.values()) {
  const t = n.tags; if (!t) continue;
  if (t.railway === 'signal' || t['railway:signal:main'] || t['railway:signal:combined'] || t['railway:signal:distant']) {
    const p = project(n.E, n.N); if (Math.abs(p.d) > 12) continue;
    const x = xOf(p.s); if (x < -300 || x > LEN + 300) continue;
    // ¿mira en nuestro sentido? railway:signal:direction=forward|backward respecto a la vía que lo contiene
    let dir = t['railway:signal:direction'] || '';
    let ok = true;
    if (onPath.has(n.id) && dir) {
      const i = pathIdx.get(n.id), wy = ways.get(wayOf[Math.min(i, wayOf.length - 1)]);
      if (wy) { const k = wy.nodes.indexOf(n.id), nb = wy.nodes[k + 1] ?? wy.nodes[k - 1], fw = (wy.nodes.indexOf(nb) > k); const nbOnNext = path_[i + 1] === nb; const wayForward = fw === nbOnNext; ok = (dir === 'forward') === wayForward || dir === 'both'; }
    } else if (!onPath.has(n.id)) ok = false; // señales de otras vías paralelas
    const kind = t['railway:signal:main:function'] || t['railway:signal:combined:function'] || (t['railway:signal:distant'] ? 'distant' : '');
    signals.push({ x: Math.round(x), ref: t.ref || '', kind, ours: ok, tags: Object.fromEntries(Object.entries(t).filter(([k]) => /signal|ref/.test(k))) });
  }
  if (t.railway === 'switch' && onPath.has(n.id)) switches.push({ x: Math.round(nodeX(n)), ref: t.ref || '', side: 1 });
  if ((t.railway === 'level_crossing' || t.railway === 'crossing') && onPath.has(n.id)) crossings.push({ x: Math.round(nodeX(n)), kind: t.railway });
  if (t.railway === 'milestone' && t['railway:position']) {
    const p = project(n.E, n.N); if (Math.abs(p.d) > 25) continue;
    const x = xOf(p.s); if (x < X0 || x > X1) continue;
    kmPosts.push({ x: Math.round(x), label: String(t['railway:position']).replace(',', '.') });
  }
}
signals.sort((a, b) => a.x - b.x); switches.sort((a, b) => a.x - b.x); kmPosts.sort((a, b) => a.x - b.x);
log('señales', signals.length, '(nuestro sentido', signals.filter((s) => s.ours).length + ') desvíos', switches.length, 'PN', crossings.length, 'postes km', kmPosts.length);

/* ---------- Horario real (GTFS) ---------- */
let timetable = null;
if (has('gtfs-c1.json')) {
  const g = rd('gtfs-c1.json');
  const stopName = new Map(g.stops.map((s) => [s.stop_id, s.stop_name]));
  const idxOf = (name) => STATIONS.findIndex((s) => s.re.test(name) || (s.id === 'DH' && /dos hermanas/i.test(name) && !/cantaelgallo/i.test(name)) || (s.id === 'UT' && /utrera/i.test(name)));
  const trips = [];
  for (const t of g.trips) {
    const seq = t.stops.map(([sid, arr, dep]) => ({ k: idxOf(stopName.get(sid) || ''), name: stopName.get(sid), arr, dep })).filter((s) => s.k >= 0);
    const ks = seq.map((s) => s.k);
    const iSJ = ks.indexOf(0), iUT = ks.indexOf(6);
    if (iSJ < 0 || iUT < 0 || iSJ > iUT) continue; // sólo sentido Santa Justa → Utrera
    trips.push({ id: t.id, number: t.short || ((t.id.match(/[A-Z](\d{5})C\d*$/) || [])[1]) || t.id, service: t.service, headsign: t.headsign, calls: seq.slice(iSJ, iUT + 1).map((s) => ({ st: STATIONS[s.k].id, arr: s.arr, dep: s.dep })) });
  }
  trips.sort((a, b) => a.calls[0].dep.localeCompare(b.calls[0].dep));
  // Tiempos de recorrido más frecuentes entre estaciones consecutivas
  const runs = {};
  const sec = (h) => { const p = h.split(':').map(Number); return p[0] * 3600 + p[1] * 60 + (p[2] || 0); };
  trips.forEach((t) => { for (let i = 0; i + 1 < t.calls.length; i++) { const k = t.calls[i].st + '-' + t.calls[i + 1].st; (runs[k] = runs[k] || []).push(sec(t.calls[i + 1].arr) - sec(t.calls[i].dep)); } });
  const mode = (a) => { const c = {}; a.forEach((v) => (c[v] = (c[v] || 0) + 1)); return +Object.entries(c).sort((p, q) => q[1] - p[1])[0][0]; };
  const runTimes = Object.fromEntries(Object.entries(runs).map(([k, v]) => [k, mode(v)]));
  const stopsServed = {};
  trips.forEach((t) => t.calls.forEach((c) => (stopsServed[c.st] = (stopsServed[c.st] || 0) + 1)));
  timetable = {
    fuente: 'GTFS Renfe Cercanías', descargado: g.descargado,
    calendar: g.calendar, viajes: trips.length,
    runTimes_s: runTimes, paradasServidas: stopsServed,
    // Una salida por hora (el GTFS repite cada tren para cada calendario de servicio)
    departures: trips.filter((t, i, a) => i === a.findIndex((u) => u.calls[0].dep === t.calls[0].dep)).map((t) => ({ number: t.number, service: t.service, dep: t.calls[0].dep, calls: t.calls.map((c) => [c.st, c.arr, c.dep]) }))
  };
  log('GTFS viajes SJ→UT', trips.length, 'tiempos', JSON.stringify(runTimes));
}

/* ---------- Terreno por teselas (MDT a 20 m) ---------- */
const TN = 51, TRES = 1000 / (TN - 1);
const terrain = { n: TN, tiles: {} };
const ortoDir = path.join(SRC, 'pnoa');
const tileKeys = new Set();
if (demTiles) for (const k of demTiles.keys()) tileKeys.add(k);
// Altura de vía para aplanar el terreno bajo la plataforma (local Y = Z - Z0)
const trackYAt = (x) => pyArr[Math.max(0, Math.min(pyArr.length - 1, Math.round((x - X0) / STEP)))];
for (const key of [...tileKeys].sort()) {
  const [ti, tj] = key.split('_').map(Number);
  const arr = new Int16Array(TN * TN);
  for (let r = 0; r < TN; r++) for (let c = 0; c < TN; c++) {
    const E = ti * 1000 + c * TRES, N = tj * 1000 + r * TRES;
    let z = demAt(Math.min(E, ti * 1000 + 999.9), Math.min(N, tj * 1000 + 999.9));
    if (z == null) z = demAt(E - 1, N - 1) ?? Z0;
    // Cerca de la vía: el terreno pasa a la cota de la plataforma (terraplén/desmonte suave)
    const p = project(E, N), x = xOf(p.s), ad = Math.abs(p.d);
    if (x > X0 && x < X1 && ad < 70) {
      // En túnel el terreno cubre la bóveda (trinchera cubierta); fuera, plataforma de la vía
      const ty = trackYAt(x) + Z0 + (inSpan(tunnels, x) ? 8.2 : -1.2);
      const w = ad < 14 ? 1 : 1 - (ad - 14) / 56;
      z = inSpan(bridges, x) ? Math.min(z, ty - 6) * w + z * (1 - w) : ty * w + z * (1 - w);
    }
    arr[r * TN + c] = Math.round(z * 10);
  }
  terrain.tiles[key] = Buffer.from(arr.buffer).toString('base64');
}
log('teselas de terreno', Object.keys(terrain.tiles).length);

/* ---------- Ortofotos ---------- */
// Si no hay copia local de la ortofoto (no se guarda en git), se conservan las ya generadas
let orto = 0;
if (fs.existsSync(ortoDir)) for (const f of fs.readdirSync(ortoDir).filter((f) => f.endsWith('.jpg'))) {
  const key = f.replace('.jpg', '');
  const b64 = fs.readFileSync(path.join(ortoDir, f)).toString('base64');
  fs.writeFileSync(path.join(OUT, 'orto', key + '.js'), `RC.data.c1orto[${JSON.stringify(key)}]='data:image/jpeg;base64,${b64}';\n`);
  orto++;
}
if (!orto) orto = fs.readdirSync(path.join(OUT, 'orto')).length;
terrain.orto = fs.readdirSync(path.join(OUT, 'orto')).map((f) => f.replace('.js', ''));
log('ortofotos', orto);

/* ---------- Edificios (Catastro; respaldo OSM) ---------- */
let buildingsSrc = 'ninguna', blist = [];
if (has('catastro-partes.json')) {
  const parts = rd('catastro-partes.json');
  const uses = new Map(); if (has('catastro-edificios.json')) rd('catastro-edificios.json').forEach((b) => uses.set(b.id.replace(/^ES\.SDGC\.BU\./, ''), b.u));
  for (const p of parts) {
    if (!p.f || p.f < 1) continue;
    const ring = p.r[0]; if (!ring || ring.length < 4) continue;
    const ref = (p.id || '').replace(/^ES\.SDGC\.BU\./, '').split('_')[0];
    blist.push({ ring, floors: p.f, use: uses.get(ref) || '' });
  }
  buildingsSrc = 'Catastro';
}
if (!blist.length && has('osm-edificios.json')) {
  // Respaldo: edificios de OpenStreetMap (en España gran parte procede del Catastro)
  const defLevels = { house: 2, detached: 2, terrace: 2, residential: 3, apartments: 5, industrial: 3, warehouse: 3, commercial: 2, retail: 2, school: 2, church: 4, train_station: 3, roof: 1, garage: 1, shed: 1 };
  for (const b of rd('osm-edificios.json')) {
    const ring = b.g.map(([la, lo]) => toUTM(la, lo)).map(([E, N]) => [+E.toFixed(1), +N.toFixed(1)]);
    if (ring.length < 4) continue;
    const lv = parseFloat(b.t.l), hm = parseFloat(b.t.h);
    const floors = isFinite(lv) && lv > 0 ? lv : (defLevels[b.t.b] || 2);
    blist.push({ ring, floors, hMeters: isFinite(hm) ? hm : null, use: /industrial|warehouse/.test(b.t.b) ? 'industrial' : '', station: b.t.b === 'train_station', name: b.t.n });
  }
  buildingsSrc = 'OpenStreetMap';
}
const buildings = [];
for (const b of blist) {
  let cx = 0, cy = 0; b.ring.forEach(([E, N]) => { cx += E; cy += N; }); cx /= b.ring.length; cy /= b.ring.length;
  const p = project(cx, cy), x = xOf(p.s);
  if (x < X0 || x > X1 || Math.abs(p.d) > 650) continue;
  const z = (demAt(cx, cy) ?? Z0) - Z0;
  // ¿Cubre la vía? (marquesinas, vestíbulos de estación, pasos superiores): sólo se pinta el techo
  let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
  b.ring.forEach(([E, N]) => { minE = Math.min(minE, E); maxE = Math.max(maxE, E); minN = Math.min(minN, N); maxN = Math.max(maxN, N); });
  const area = Math.abs(b.ring.reduce((a, [E, N], i) => { const [E2, N2] = b.ring[(i + 1) % b.ring.length]; return a + E * N2 - E2 * N; }, 0)) / 2;
  if (area > 60000) continue;
  let over = false;
  const near = b.ring.some(([E, N]) => Math.abs(project(E, N).d) < 7);
  if (near) over = true;
  else for (let i = 0; i < geoPts.length && !over; i += 2) {
    const [E, N] = geoPts[i];
    if (E < minE || E > maxE || N < minN || N > maxN) continue;
    let inside = false;
    for (let a = 0, c = b.ring.length - 1; a < b.ring.length; c = a++) {
      const [xa, ya] = b.ring[a], [xc, yc] = b.ring[c];
      if ((ya > N) !== (yc > N) && E < (xc - xa) * (N - ya) / (yc - ya) + xa) inside = !inside;
    }
    over = inside;
  }
  let ring = b.ring; if (ring.length > 2 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) ring = ring.slice(0, -1);
  buildings.push({ t: Math.floor(cx / 1000) + '_' + Math.floor(cy / 1000), z: +z.toFixed(1), h: +(b.hMeters || b.floors * 3.1 + 0.8).toFixed(1), s: b.station ? 1 : undefined, o: over ? 1 : undefined, k: /industrial|agriculture/i.test(b.use) ? 'i' : '', p: ring.map(([E, N]) => [+(E - oE).toFixed(1), +(-(N - oN)).toFixed(1)]) });
}
log('edificios', buildings.length, 'de', buildingsSrc);

/* ---------- Escribir ---------- */
const stations = stationInfo.map((s, i) => ({
  id: s.id, name: s.name, stopX: Math.round(xOf(s.stopS)), platformLength: s.platformLength, side: s.side,
  waiting: [0, 46, 31, 22, 27, 64, 0][i], osm: { station: s.node.id, platform: s.platformOsm }, verified: s.verified
}));
const line = {
  name: 'Cercanías Sevilla C-1 (Sevilla-Santa Justa – Utrera) · ruta real',
  fidelity: 'Datos abiertos: OSM, MDT IGN, Catastro, GTFS [Verificar con la Declaración sobre la Red de Adif]',
  real: true,
  origin: { E: +oE.toFixed(2), N: +oN.toFixed(2), Z: +Z0.toFixed(2), crs: 'EPSG:25830' },
  length: LEN,
  stations, speedLimits, gradients, curves, bridges, tunnels, covered, crossings, switches, kmPosts,
  osmSignals: signals,
  geometry: {
    step: STEP, x0: X0,
    px: geoPts.map(([E]) => +(E - oE).toFixed(2)),
    pz: geoPts.map(([, N]) => +(-(N - oN)).toFixed(2)),
    py: pyArr.map((y) => +y.toFixed(2))
  },
  timetableReal: timetable,
  sources: [
    '© colaboradores de OpenStreetMap, ODbL 1.0 (trazado, desvíos, señales, andenes, velocidades)',
    'MDT05 / MDT25 © Instituto Geográfico Nacional (CNIG), CC BY 4.0 (relieve)',
    'PNOA © Instituto Geográfico Nacional, CC BY 4.0 (ortofoto)',
    'Dirección General del Catastro (edificios y alturas)',
    'Renfe Viajeros — GTFS Cercanías, datos abiertos (horarios)'
  ],
  generated: new Date().toISOString().slice(0, 10)
};
const header = '/* RAILCORE — Ruta real C-1 Sevilla-Santa Justa – Utrera.\n * GENERADO por tools/route/build-route.mjs a partir de data/fuentes/c1/. No editar a mano.\n * Base de datos derivada de OpenStreetMap: ODbL 1.0 (ver CREDITOS-DATOS.md). */\n';
fs.writeFileSync(path.join(OUT, 'line-c1-real.js'), header +
  '(function (RC) {\n  var base = RC.data.lineC1 || {};\n  var real = ' + JSON.stringify(line) + ';\n' +
  '  ["trainNumber","catenary_V","landmarks","signalSpacing_m","entrySignalOffset_m","exitSignalOffset_m","previaOffset_m","precedingTrain","firstDeparture","dwell_s"].forEach(function (k) { if (real[k] === undefined && base[k] !== undefined) real[k] = base[k]; });\n' +
  '  real.landmarks = [];\n  RC.data.lineC1Simplified = base;\n  RC.data.lineC1 = real;\n})(globalThis.RC);\n');
fs.writeFileSync(path.join(OUT, 'terrain-c1.js'), header + 'RC.data.c1terrain=' + JSON.stringify(terrain) + ';\n');
fs.writeFileSync(path.join(OUT, 'buildings-c1.js'), header.replace('ODbL 1.0', 'ODbL 1.0; edificios: Dirección General del Catastro') + 'RC.data.c1buildings={src:' + JSON.stringify(buildingsSrc) + ',list:' + JSON.stringify(buildings) + '};\n');
const summary = { longitud_km: LEN / 1000, estaciones: stations.map((s) => [s.name, s.stopX, s.side, s.platformLength, s.verified ? 'andén OSM' : 'estimado']), velocidades: speedLimits, puentes: bridges.length, tuneles: tunnels, señales: signals.length, desvios: switches.length, pn: crossings.length, postesKm: kmPosts.length, curvas: curves.length, rasantes: gradients.length, edificios: buildings.length, ortofotos: orto, terreno: Object.keys(terrain.tiles).length, horario: timetable ? timetable.viajes : 0 };
fs.writeFileSync(path.join(OUT, 'resumen.json'), JSON.stringify(summary, null, 1));
log(JSON.stringify(summary, null, 1));
