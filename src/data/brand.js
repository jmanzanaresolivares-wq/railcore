/* RAILCORE — Marca activa: paquete «ficticia».
 * GENERADO por tools/brand/embed-brand.js a partir de assets/brand/ficticia/. No editar a mano.
 * Ver assets/brand/README.md. */
(function (RC) {
  RC.data = RC.data || {};
  var B = {
 "nota": "Marcas inventadas para RAILCORE. No imitan ni derivan de ninguna marca real.",
 "operator": {
  "name": "Ferronda",
  "short": "FRD",
  "service": "Ferronda Cercanías",
  "colors": {
   "primary": "#0F6E6A",
   "accent": "#F2A900",
   "text": "#FFFFFF"
  },
  "logoSvg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 420 120\" role=\"img\" aria-label=\"Ferronda\"> <rect x=\"6\" y=\"10\" width=\"100\" height=\"100\" rx=\"26\" fill=\"#0F6E6A\"/> <path d=\"M30 40 H82\" stroke=\"#FFFFFF\" stroke-width=\"11\" stroke-linecap=\"round\"/> <path d=\"M30 62 C42 52 52 72 64 62 S80 54 82 58\" fill=\"none\" stroke=\"#F2A900\" stroke-width=\"10\" stroke-linecap=\"round\"/> <path d=\"M30 40 V88\" stroke=\"#FFFFFF\" stroke-width=\"11\" stroke-linecap=\"round\"/> <text x=\"124\" y=\"82\" font-family=\"Segoe UI, Arial, sans-serif\" font-size=\"58\" font-weight=\"700\" fill=\"#0F6E6A\" letter-spacing=\"-1\">ferronda</text> </svg>"
 },
 "infra": {
  "name": "Trazia",
  "short": "TRZ",
  "control": "Puesto de Mando Trazia Sevilla",
  "colors": {
   "primary": "#2C3E73",
   "accent": "#F2A900",
   "text": "#FFFFFF",
   "light": "#E9EDF5"
  },
  "logoSvg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 420 120\" role=\"img\" aria-label=\"Trazia\"> <polygon points=\"56,10 106,110 6,110\" fill=\"#2C3E73\"/> <path d=\"M44 104 L56 46 L68 104\" fill=\"none\" stroke=\"#FFFFFF\" stroke-width=\"7\" stroke-linejoin=\"round\"/> <path d=\"M46 92 H66 M49 78 H63 M52 64 H60\" stroke=\"#E9EDF5\" stroke-width=\"4\"/> <circle cx=\"56\" cy=\"34\" r=\"7\" fill=\"#F2A900\"/> <text x=\"124\" y=\"84\" font-family=\"Segoe UI, Arial, sans-serif\" font-size=\"60\" font-weight=\"600\" fill=\"#2C3E73\" letter-spacing=\"4\">TRAZIA</text> </svg>"
 },
 "lines": {
  "C1": {
   "color": "#1E88C8",
   "text": "#FFFFFF",
   "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 120 80\" role=\"img\" aria-label=\"Línea C1\"> <rect x=\"4\" y=\"4\" width=\"112\" height=\"72\" rx=\"36\" fill=\"#1E88C8\"/> <text x=\"60\" y=\"55\" text-anchor=\"middle\" font-family=\"Segoe UI, Arial, sans-serif\" font-size=\"42\" font-weight=\"800\" fill=\"#FFFFFF\">C1</text> </svg>"
  }
 },
 "livery": {
  "body": "#F4F5F2",
  "lower": "#0F6E6A",
  "stripe": "#F2A900",
  "windowBand": "#1B2630",
  "roof": "#B9BEC2"
 },
 "signage": {
  "stationBg": "#2C3E73",
  "stationFg": "#FFFFFF",
  "stationAccent": "#F2A900"
 },
 "pack": "ficticia"
};
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
