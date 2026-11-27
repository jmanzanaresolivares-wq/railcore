/* Captura del banco de pruebas del tren: node tools/captura/tren.js salida.png "cam=9,3,-58&mira=0,2,-40" */
const path = require('path');
const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2] || 'tren.png', qs = process.argv[3] || '';
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: +(process.env.ANCHO || 1200), height: +(process.env.ALTO || 700) } });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[consola]', m.text()); });
  page.on('pageerror', e => console.log('[error]', e.message));
  await page.goto('file://' + path.resolve(__dirname, 'tren.html') + '?' + qs);
  await page.waitForFunction(() => window.__listo, null, { timeout: 60000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: out });
  await browser.close();
  console.log('captura:', out);
})().catch(e => { console.error(e); process.exit(1); });
