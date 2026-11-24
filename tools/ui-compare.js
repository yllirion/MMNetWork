// Compare two runs of tools/ui-monkey.js:  node tools/ui-compare.js <dirA> <dirB>
// Same actions + same game state at every step, and the same HTML of every window except the hover popup (#info),
// which can differ by mouse-event timing even between two runs of the same build.
const fs = require('fs');
const [a, b] = process.argv.slice(2);
const A = JSON.parse(fs.readFileSync(a + '/log.json')).log, B = JSON.parse(fs.readFileSync(b + '/log.json')).log;
let soft = 0;
for (let i = 0; i < Math.min(A.length, B.length); i++) {
  const x = A[i], y = B[i];
  if (x.act !== y.act || x.state !== y.state) { console.log('HARD DIFF at step', x.step, x.act, '/', y.act); process.exit(1); }
  const dk = Object.keys(x.dom).filter((k) => x.dom[k] !== y.dom[k]);
  if (dk.some((k) => k !== 'info')) { console.log('DOM DIFF at step', x.step, dk, '— compare', `${a}/s${String(x.step).padStart(3, '0')}.json`); process.exit(1); }
  if (dk.length || x.cv !== y.cv) soft++;
}
console.log('OK', A.length, 'steps; hover-popup-only diffs:', soft);
