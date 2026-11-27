/* RAILCORE — Capturas automáticas del mundo 3D (para revisar cambios visuales).
 * Uso: node tools/captura/captura.js salida.png [x=metros] [hora=13:30:00] [vista=0] [ancho=1400] [alto=800]
 *        [exterior=0|1|2] [orbita=radianes] [reloj=hh:mm:ss] [detras=metros tras el tren precedente] [espera=ms] [todo=1]
 * Abre index.html en Chromium sin ventana (WebGL por software), arranca el escenario
 * «listo», coloca el tren en el punto x y guarda una captura. Sólo herramienta de desarrollo. */
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const args = Object.fromEntries(process.argv.slice(3).map(a => a.split('=')));
  const out = process.argv[2] || 'captura.png';
  const W = +(args.ancho || 1400), H = +(args.alto || 800);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('console', m => { if (m.type() === 'error') console.log('[consola]', m.text()); });
  page.on('pageerror', e => console.log('[error]', e.message));
  await page.goto('file://' + path.resolve(__dirname, '../../index.html'));
  await page.evaluate((o) => {
    document.getElementById('optHour').value = o.hora || '13:30:00';
    document.getElementById('optSound').checked = false;
    document.getElementById('optVoice').checked = false;
    const b = [...document.querySelectorAll('#scenarioList button')].find(x => /preparad|listo/i.test(x.textContent)) || document.querySelectorAll('#scenarioList button')[1];
    if (b) b.click();
    document.getElementById('btnStart').click();
  }, args);
  await page.waitForTimeout(500);
  await page.evaluate((o) => {
    const st = RC.ui.state;
    st.paused = true;
    if (o.reloj && st.sim) st.sim.clock = o.reloj.split(':').reduce((a, b) => a * 60 + +b, 0);
    if (o.x !== undefined) st.sim.train.x = +o.x;
    if (o.detras !== undefined) { RC.core.signalling.updateGhost(st.sim.ghost, st.sim.clock, 0); st.sim.train.x = st.sim.ghost.x - +o.detras; }
    if (o.v !== undefined) st.sim.train.v = +o.v;
    if (st.scene3d) {
      st.scene3d.setView(+(o.vista || 0));
      if (o.exterior && st.scene3d.setExterior) st.scene3d.setExterior(+o.exterior, o.orbita ? +o.orbita : undefined);
    }
    if (o.reloj && st.sim) st.sim.clock = o.reloj.split(':').reduce((a, b) => a * 60 + +b, 0);
  }, args);
  // Deja que se carguen teselas, ortofotos y texturas
  await page.waitForTimeout(+(args.espera || 9000));
  const el = await page.$(args.todo ? '#app' : '#view3d');
  await el.screenshot({ path: out });
  await browser.close();
  console.log('captura guardada:', out);
})().catch(e => { console.error(e); process.exit(1); });
