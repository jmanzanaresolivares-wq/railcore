/* RAILCORE — Esquema de la línea (banda inferior): estaciones, señales,
 * tren precedente y tren propio. */
(function (RC) {
  function render(cv, sim) {
    var r = cv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    var g = cv.getContext('2d');
    var st = sim.line.stations, x0 = -300, x1 = st[st.length - 1].stopX + 300;
    var pad = 20 * dpr, X = function (x) { return pad + (x - x0) / (x1 - x0) * (W - 2 * pad); };
    var y = H * 0.56;
    g.fillStyle = '#101418'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#4a5560'; g.lineWidth = 3 * dpr;
    g.beginPath(); g.moveTo(X(x0), y); g.lineTo(X(x1), y); g.stroke();
    g.font = (10 * dpr) + 'px Segoe UI, sans-serif'; g.textAlign = 'center';
    st.forEach(function (s, i) {
      g.fillStyle = sim.nextStation === i ? '#f2a93b' : '#9aa6b1';
      g.fillRect(X(s.stopX - s.platformLength), y - 6 * dpr, Math.max(2, X(s.stopX) - X(s.stopX - s.platformLength)), 12 * dpr);
      var lx = Math.max(40 * dpr, Math.min(W - 30 * dpr, X(s.stopX - s.platformLength / 2)));
      g.fillText(s.name, lx, i % 2 ? y - 11 * dpr : y - 23 * dpr);
    });
    var col = { verde: '#3ddc84', amarillo: '#ffd84d', rojo: '#ff4d4d' };
    sim.signals.forEach(function (s) {
      g.fillStyle = col[s.aspect];
      g.beginPath(); g.arc(X(s.x), y + 13 * dpr, 3.2 * dpr, 0, Math.PI * 2); g.fill();
    });
    if (sim.ghost.active) {
      g.fillStyle = '#9fb3c8';
      g.fillRect(X(sim.ghost.x - sim.ghost.length), y - 3 * dpr, Math.max(3 * dpr, X(sim.ghost.x) - X(sim.ghost.x - sim.ghost.length)), 6 * dpr);
      
    }
    var t = sim.train;
    g.fillStyle = '#f2a93b';
    g.fillRect(X(t.x - sim.spec.length_m), y - 4 * dpr, Math.max(4 * dpr, X(t.x) - X(t.x - sim.spec.length_m)), 8 * dpr);
    g.beginPath(); g.moveTo(X(t.x), y + 6 * dpr); g.lineTo(X(t.x) - 5 * dpr, y + 16 * dpr); g.lineTo(X(t.x) + 5 * dpr, y + 16 * dpr); g.fill();
    g.fillStyle = '#dfe6ec'; g.textAlign = 'left';
    g.fillText(RC.core.util.fmtKm(t.x), 6 * dpr, H - 5 * dpr);
  }
  RC.ui.map = { render: render };
})(globalThis.RC);
