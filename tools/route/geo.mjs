// Conversión geográfica ↔ UTM (huso 30, ETRS89 ≈ WGS84) sin dependencias.
// Fórmulas de Krüger (serie de 3.er orden), error < 1 mm en el huso.
const a = 6378137, f = 1 / 298.257222101; // GRS80 (ETRS89)
const k0 = 0.9996, E0 = 500000, ZONE = 30, lon0 = ((ZONE - 1) * 6 - 180 + 3) * Math.PI / 180;
const n = f / (2 - f), A = a / (1 + n) * (1 + n * n / 4 + n ** 4 / 64);
const al = [n / 2 - 2 * n * n / 3 + 5 * n ** 3 / 16, 13 * n * n / 48 - 3 * n ** 3 / 5, 61 * n ** 3 / 240];
const be = [n / 2 - 2 * n * n / 3 + 37 * n ** 3 / 96, n * n / 48 + n ** 3 / 15, 17 * n ** 3 / 480];
const de = [2 * n - 2 * n * n / 3 - 2 * n ** 3, 7 * n * n / 3 - 8 * n ** 3 / 5, 56 * n ** 3 / 15];

export function toUTM(lat, lon) {
  const p = lat * Math.PI / 180, l = lon * Math.PI / 180 - lon0;
  const t = Math.sinh(Math.atanh(Math.sin(p)) - 2 * Math.sqrt(n) / (1 + n) * Math.atanh(2 * Math.sqrt(n) / (1 + n) * Math.sin(p)));
  const xi = Math.atan2(t, Math.cos(l)), eta = Math.atanh(Math.sin(l) / Math.sqrt(1 + t * t));
  let x = eta, y = xi;
  for (let j = 1; j <= 3; j++) {
    x += al[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
    y += al[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
  }
  return [E0 + k0 * A * x, k0 * A * y];
}

export function fromUTM(E, N) {
  const xi = N / (k0 * A), eta = (E - E0) / (k0 * A);
  let xp = xi, ep = eta;
  for (let j = 1; j <= 3; j++) {
    xp -= be[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    ep -= be[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  }
  const chi = Math.asin(Math.sin(xp) / Math.cosh(ep));
  let p = chi;
  for (let j = 1; j <= 3; j++) p += de[j - 1] * Math.sin(2 * j * chi);
  const l = lon0 + Math.atan2(Math.sinh(ep), Math.cos(xp));
  return [p * 180 / Math.PI, l * 180 / Math.PI];
}
