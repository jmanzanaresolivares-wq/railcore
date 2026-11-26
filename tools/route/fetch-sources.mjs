// RAILCORE — Descarga de fuentes abiertas para la ruta real C-1 Santa Justa – Utrera.
// Se ejecuta en GitHub Actions (necesita Internet). Guarda copias compactas en
// data/fuentes/c1/ para que la construcción de la ruta (build-route.mjs) sea
// reproducible sin conexión. Cada fuente es independiente: si una falla, el
// resto sigue y el fallo queda anotado en informe-descarga.json.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { toUTM } from './geo.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const OUT = path.join(ROOT, 'data', 'fuentes', 'c1');
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
fs.mkdirSync(OUT, { recursive: true });
const report = { fecha: new Date().toISOString(), pasos: {} };
const UA = 'RAILCORE-route-builder/0.1 (open-source railway simulator; github.com/jmanzanaresolivares-wq/railcore)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BBOX = { s: 37.15, w: -6.02, n: 37.42, e: -5.72 }; // Sevilla – Utrera

async function get(url, opts = {}, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(opts.timeoutMs || 120000), ...opts, headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
      if (r.ok) return r;
      last = new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 400));
      if (r.status === 400 || r.status === 404) break;
    } catch (e) { last = e; }
    await sleep(3000 * (i + 1));
  }
  throw last;
}
async function step(name, fn) {
  if (ONLY.length && !ONLY.includes(name)) return;
  const t0 = Date.now();
  console.log('▶', name);
  try { report.pasos[name] = { ok: true, ...(await fn()) }; }
  catch (e) { console.error('✖', name, e); report.pasos[name] = { ok: false, error: String(e && e.stack || e).slice(0, 2000) }; }
  report.pasos[name].segundos = Math.round((Date.now() - t0) / 1000);
  fs.writeFileSync(path.join(OUT, 'informe-descarga.json'), JSON.stringify(report, null, 1));
  console.log('  →', JSON.stringify(report.pasos[name]).slice(0, 600));
}

/* ---------- 1. OpenStreetMap (Overpass) ---------- */
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
async function overpass(q) {
  let last;
  for (const u of OVERPASS) {
    try { const r = await get(u, { method: 'POST', body: new URLSearchParams({ data: q }) }, 2); return await r.json(); }
    catch (e) { last = e; console.warn('  overpass', u, String(e).slice(0, 200)); }
  }
  throw last;
}
const bb = `${BBOX.s},${BBOX.w},${BBOX.n},${BBOX.e}`;
await step('osm', async () => {
  const q = `[out:json][timeout:300][bbox:${bb}];
(
  way["railway"];
  node["railway"];
  node["railway:signal:main"];
  node["railway:switch"];
  way["public_transport"="platform"];
  nwr["building"="train_station"];
  relation["route"="train"];
  relation["route"="railway"];
  way["bridge"]["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential)$"];
  way["waterway"~"^(river|canal)$"];
);
out body;
>;
out skel qt;`;
  const j = await overpass(q);
  fs.writeFileSync(path.join(OUT, 'osm.json'), JSON.stringify(j));
  const rels = j.elements.filter((e) => e.type === 'relation').map((r) => ({ id: r.id, ...r.tags }));
  fs.writeFileSync(path.join(OUT, 'osm-relaciones.json'), JSON.stringify(rels, null, 1));
  return { elementos: j.elements.length, relaciones: rels.length };
});

/* Corredor: teselas de 1 km (UTM 30) alrededor de las vías de la C-1. */
function corridorTiles(bufferKm) {
  const j = JSON.parse(fs.readFileSync(path.join(OUT, 'osm.json'), 'utf8'));
  const nodes = new Map();
  j.elements.forEach((e) => { if (e.type === 'node') nodes.set(e.id, e); });
  const tiles = new Set();
  j.elements.forEach((e) => {
    if (e.type !== 'way' || !e.tags || e.tags.railway !== 'rail') return;
    const u = e.tags.usage, s = e.tags.service;
    if (s && s !== 'siding' && s !== 'crossover') return; // mantener principales
    if (u && !/main|branch/.test(u)) return;
    e.nodes.forEach((id) => {
      const nd = nodes.get(id); if (!nd) return;
      const [E, N] = toUTM(nd.lat, nd.lon);
      if (N < 4122000 || N > 4146000 || E < 232000 || E > 262000) return; // Santa Justa–Utrera aprox.
      const ti = Math.floor(E / 1000), tj = Math.floor(N / 1000);
      for (let a = -bufferKm; a <= bufferKm; a++) for (let b = -bufferKm; b <= bufferKm; b++) tiles.add((ti + a) + '_' + (tj + b));
    });
  });
  return [...tiles].sort();
}

/* ---------- 2. Modelo Digital del Terreno (IGN, LiDAR PNOA) ---------- */
await step('mdt', async () => {
  const caps = await (await get('https://servicios.idee.es/wcs-inspire/mdt?SERVICE=WCS&REQUEST=GetCapabilities&VERSION=2.0.1')).text();
  fs.writeFileSync(path.join(OUT, 'mdt-capacidades.xml'), caps);
  const ids = [...caps.matchAll(/<wcs:CoverageId>([^<]+)<\/wcs:CoverageId>/g)].map((m) => m[1]);
  const cov = ['Elevacion25830_5', 'Elevacion25830_25'].find((c) => ids.includes(c)) || ids.find((c) => /25830/.test(c)) || ids[0];
  const dir = path.join(OUT, 'mdt'); fs.mkdirSync(dir, { recursive: true });
  const tiles = corridorTiles(1);
  let ok = 0, fail = 0, firstErr = null;
  for (const t of tiles) {
    const f = path.join(dir, t + '.tif');
    if (fs.existsSync(f)) { ok++; continue; }
    const [ti, tj] = t.split('_').map(Number), E0 = ti * 1000, N0 = tj * 1000;
    const variants = [
      `SUBSET=x(${E0},${E0 + 1000})&SUBSET=y(${N0},${N0 + 1000})`,
      `SUBSET=E(${E0},${E0 + 1000})&SUBSET=N(${N0},${N0 + 1000})`,
      `SUBSET=X(${E0},${E0 + 1000})&SUBSET=Y(${N0},${N0 + 1000})`
    ];
    let done = false;
    for (const v of variants) {
      try {
        const r = await get(`https://servicios.idee.es/wcs-inspire/mdt?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=${cov}&${v}&FORMAT=image/tiff`, {}, 2);
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf[0] === 0x49 || buf[0] === 0x4d) { fs.writeFileSync(f, buf); done = true; break; }
        firstErr = firstErr || buf.toString('utf8', 0, 400);
      } catch (e) { firstErr = firstErr || String(e).slice(0, 400); }
    }
    done ? ok++ : fail++;
    await sleep(150);
  }
  return { cobertura: cov, coberturas: ids.slice(0, 20), teselas: tiles.length, ok, fail, firstErr };
});

/* ---------- 3. Ortofoto PNOA (IGN) ---------- */
await step('pnoa', async () => {
  const dir = path.join(OUT, 'pnoa'); fs.mkdirSync(dir, { recursive: true });
  // Corredor a 1024 px/km (≈1 m/píxel) y anillo exterior a 512 px/km
  const inner = new Set(corridorTiles(0)), tiles = corridorTiles(1);
  let ok = 0, fail = 0, firstErr = null, bytes = 0;
  for (const t of tiles) {
    const f = path.join(dir, t + '.jpg');
    if (fs.existsSync(f)) { ok++; bytes += fs.statSync(f).size; continue; }
    const [ti, tj] = t.split('_').map(Number), E0 = ti * 1000, N0 = tj * 1000;
    const url = `https://www.ign.es/wms-inspire/pnoa-ma?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=OI.OrthoimageCoverage&STYLES=&CRS=EPSG:25830&BBOX=${E0},${N0},${E0 + 1000},${N0 + 1000}&WIDTH=${inner.has(t) ? 1024 : 512}&HEIGHT=${inner.has(t) ? 1024 : 512}&FORMAT=image/jpeg`;
    try {
      const buf = Buffer.from(await (await get(url, {}, 3)).arrayBuffer());
      if (buf[0] === 0xff && buf[1] === 0xd8) { fs.writeFileSync(f, buf); ok++; bytes += buf.length; }
      else { fail++; firstErr = firstErr || buf.toString('utf8', 0, 400); }
    } catch (e) { fail++; firstErr = firstErr || String(e).slice(0, 400); }
    await sleep(150);
  }
  return { teselas: tiles.length, ok, fail, mb: +(bytes / 1e6).toFixed(1), firstErr };
});

/* ---------- 4b. Edificios de OpenStreetMap (respaldo; en España muchos vienen del Catastro) ---------- */
await step('osmedificios', async () => {
  // Extracto de Andalucía de Geofabrik + osmium (Overpass no aguanta tantas consultas de edificios)
  const tmp = fs.mkdtempSync('/tmp/osm-');
  const pbf = path.join(tmp, 'andalucia.osm.pbf');
  execFileSync('curl', ['-sSL', '--max-time', '900', '-A', UA, '-o', pbf, 'https://download.geofabrik.de/europe/spain/andalucia-latest.osm.pbf']);
  const box = `${BBOX.w},${BBOX.s},${BBOX.e},${BBOX.n}`;
  execFileSync('osmium', ['extract', '-b', box, pbf, '-o', path.join(tmp, 'box.pbf'), '--overwrite']);
  execFileSync('osmium', ['tags-filter', path.join(tmp, 'box.pbf'), 'w/building', '-o', path.join(tmp, 'b.pbf'), '--overwrite']);
  execFileSync('osmium', ['export', path.join(tmp, 'b.pbf'), '-f', 'geojsonseq', '-o', path.join(tmp, 'b.geojsonseq'), '--overwrite', '--geometry-types=polygon']);
  // Sólo los cercanos a las vías principales (≤ 700 m)
  const keep = new Set(corridorTiles(0));
  const out = [];
  for (const line of fs.readFileSync(path.join(tmp, 'b.geojsonseq'), 'utf8').split('\n')) {
    const l = line.replace(/^\x1e/, '').trim(); if (!l) continue;
    const f = JSON.parse(l), ring = f.geometry && (f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates[0][0] : null);
    if (!ring) continue;
    const [E, N] = toUTM(ring[0][1], ring[0][0]);
    if (!keep.has(Math.floor(E / 1000) + '_' + Math.floor(N / 1000))) continue;
    const t = f.properties || {};
    out.push({ id: t['@id'] || out.length, t: { b: t.building, l: t['building:levels'], h: t.height, n: t.name }, g: ring.map(([lo, la]) => [+la.toFixed(7), +lo.toFixed(7)]) });
  }
  fs.writeFileSync(path.join(OUT, 'osm-edificios.json'), JSON.stringify(out));
  return { edificios: out.length, conPlantas: out.filter((b) => b.t.l).length };
});

/* ---------- 4. Catastro INSPIRE: partes de edificio con número de plantas ---------- */
function parseGmlParts(xml) {
  const out = [];
  const re = /<(?:bu-ext2d:BuildingPart|bu-core2d:Building)\b[\s\S]*?<\/(?:bu-ext2d:BuildingPart|bu-core2d:Building)>/g;
  for (const m of xml.matchAll(re)) {
    const s = m[0];
    const id = (s.match(/gml:id="([^"]+)"/) || [])[1];
    const floors = +((s.match(/numberOfFloorsAboveGround>(\d+)</) || [])[1] || 0);
    const use = (s.match(/currentUse>([^<]+)</) || [])[1];
    const rings = [...s.matchAll(/<gml:posList[^>]*>([^<]+)<\/gml:posList>/g)].map((r) => {
      const v = r[1].trim().split(/\s+/).map(Number), pts = [];
      for (let i = 0; i + 1 < v.length; i += 2) pts.push([+v[i].toFixed(1), +v[i + 1].toFixed(1)]);
      return pts;
    });
    if (rings.length) out.push({ id, f: floors, u: use, r: rings });
  }
  return out;
}
await step('catastro', async () => {
  // Partes de edificio (con número de plantas) por teselas de 1 km. Reanudable: guarda
  // qué teselas están hechas, así una nueva ejecución continúa donde se quedó.
  const tiles = corridorTiles(0);
  const fParts = path.join(OUT, 'catastro-partes.json'), fDone = path.join(OUT, 'catastro-teselas.json');
  const parts = new Map((fs.existsSync(fParts) ? JSON.parse(fs.readFileSync(fParts, 'utf8')) : []).map((p) => [p.id, p]));
  const done = new Set(fs.existsSync(fDone) ? JSON.parse(fs.readFileSync(fDone, 'utf8')) : []);
  const base = 'https://ovc.catastro.meh.es/INSPIRE/wfsBU.aspx?service=wfs&version=2.0.0&request=GetFeature&srsname=EPSG::25830&typenames=BU:BUILDINGPART';
  const deadline = Date.now() + (+process.env.CATASTRO_MIN || 25) * 60 * 1000;
  let ok = 0, fail = 0, lastErr = null;
  const save = () => { fs.writeFileSync(fParts, JSON.stringify([...parts.values()])); fs.writeFileSync(fDone, JSON.stringify([...done])); };
  for (const t of tiles) {
    if (done.has(t)) continue;
    if (Date.now() > deadline) break;
    const [ti, tj] = t.split('_').map(Number), E0 = ti * 1000, N0 = tj * 1000;
    // 4 consultas de 500 m (las de 1 km tardan demasiado en zonas densas)
    let tileOk = true;
    for (const [dx, dy] of [[0, 0], [500, 0], [0, 500], [500, 500]]) {
      try {
        const xml = await (await get(`${base}&bbox=${E0 + dx},${N0 + dy},${E0 + dx + 500},${N0 + dy + 500}`, { timeoutMs: 90000 }, 2)).text();
        if (/ExceptionReport/.test(xml)) { tileOk = false; lastErr = xml.slice(0, 300); continue; }
        parseGmlParts(xml).forEach((p) => parts.set(p.id, p));
      } catch (e) { tileOk = false; lastErr = String(e).slice(0, 300); }
      await sleep(200);
    }
    if (tileOk) { done.add(t); ok++; } else fail++;
    save();
  }
  save();
  return { teselas: tiles.length, hechas: done.size, ok, fail, partes: parts.size, lastErr };
});

/* ---------- 5. Horarios: GTFS de Renfe Cercanías ---------- */
await step('gtfs', async () => {
  const tmp = fs.mkdtempSync('/tmp/gtfs-');
  const zip = path.join(tmp, 'gtfs.zip');
  const buf = Buffer.from(await (await get('https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip')).arrayBuffer());
  fs.writeFileSync(zip, buf);
  execFileSync('unzip', ['-o', '-q', zip, '-d', tmp]);
  const csv = (name) => {
    const p = path.join(tmp, name); if (!fs.existsSync(p)) return [];
    const lines = fs.readFileSync(p, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
    const split = (l) => { const o = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { o.push(cur); cur = ''; } else cur += ch; } o.push(cur); return o.map((s) => s.trim()); };
    const h = split(lines[0]);
    return lines.slice(1).map((l) => { const v = split(l), o = {}; h.forEach((k, i) => (o[k] = v[i])); return o; });
  };
  const stops = csv('stops.txt'), routes = csv('routes.txt');
  const wanted = new Set(stops.filter((s) => /santa justa|utrera|dos hermanas|bellavista|san bernardo|virgen del roc|jardines de h/i.test(s.stop_name)).map((s) => s.stop_id));
  const c1Routes = routes.filter((r) => /^C-?1$/i.test((r.route_short_name || '').trim()) || /utrera/i.test(r.route_long_name || ''));
  const routeIds = new Set(c1Routes.map((r) => r.route_id));
  const trips = csv('trips.txt').filter((t) => routeIds.has(t.route_id));
  const tripIds = new Set(trips.map((t) => t.trip_id));
  const st = csv('stop_times.txt').filter((x) => tripIds.has(x.trip_id));
  const byTrip = {};
  st.forEach((x) => (byTrip[x.trip_id] = byTrip[x.trip_id] || []).push([+x.stop_sequence, x.stop_id, x.arrival_time, x.departure_time]));
  const keep = trips.filter((t) => (byTrip[t.trip_id] || []).some((s) => wanted.has(s[1])));
  const usedStops = new Set(); keep.forEach((t) => byTrip[t.trip_id].forEach((s) => usedStops.add(s[1])));
  const services = new Set(keep.map((t) => t.service_id));
  const out = {
    fuente: 'Renfe Viajeros — GTFS Cercanías (ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip)',
    descargado: new Date().toISOString(),
    agency: csv('agency.txt'), feed_info: csv('feed_info.txt'),
    routes: c1Routes,
    stops: stops.filter((s) => usedStops.has(s.stop_id)),
    calendar: csv('calendar.txt').filter((c) => services.has(c.service_id)),
    calendar_dates: csv('calendar_dates.txt').filter((c) => services.has(c.service_id)),
    trips: keep.map((t) => ({ id: t.trip_id, route: t.route_id, service: t.service_id, headsign: t.trip_headsign, dir: t.direction_id, short: t.trip_short_name, stops: byTrip[t.trip_id].sort((a, b) => a[0] - b[0]).map((s) => [s[1], s[2], s[3]]) }))
  };
  fs.writeFileSync(path.join(OUT, 'gtfs-c1.json'), JSON.stringify(out));
  return { mb_zip: +(buf.length / 1e6).toFixed(1), rutas: c1Routes.map((r) => r.route_id + ' ' + r.route_short_name + ' ' + r.route_long_name).slice(0, 30), viajes: keep.length, paradas: out.stops.length };
});

fs.writeFileSync(path.join(OUT, 'informe-descarga.json'), JSON.stringify(report, null, 1));
console.log('Hecho.');
