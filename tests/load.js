/* Carga los scripts del núcleo (los mismos que usa el juego) en Node. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const FILES = [
  'src/core/namespace.js', 'src/core/util.js',
  'src/data/civia.js', 'src/data/asfa.js', 'src/data/line-c1.js',
  'src/core/train.js', 'src/core/asfa.js', 'src/core/timetable.js',
  'src/core/signalling.js', 'src/core/sim.js', 'src/core/report.js', 'src/core/autopilot.js'
];
module.exports = function load() {
  const ctx = vm.createContext({ console });
  for (const f of FILES) {
    const p = path.join(__dirname, '..', f);
    if (!fs.existsSync(p)) continue;
    vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f });
  }
  return ctx.RC;
};
module.exports.FILES = FILES;
