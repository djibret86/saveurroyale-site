// Calibration de la normalisation : alpha de 0 (brut) à 1 (relatif). Coefficients inchangés.
// Lancement : node quiz/tests/calibration.js
'use strict';
const M = require('../moteur.js'), m = require('../royaumes.json'), cat = require('../produits.json').produits;
const R = m.ordre_royaumes, K = Object.keys(cat), N = 16384;
console.log('Maxima par royaume :', M.maxima(m));
const lignes = [];
for (const a of (process.argv[2] ? process.argv[2].split(',').map(Number) : [0, 0.25, 0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 1])) {
  const fr = {}, fp = {}; R.forEach(c => fr[c] = 0); K.forEach(k => fp[k] = 0);
  let eg = 0, egProd = 0, cocota = 0;
  for (let n = 0; n < N; n++) {
    const rep = {}; let x = n;
    m.questions.forEach(q => { rep[q.id] = 'r' + (x % 4 + 1); x = Math.floor(x / 4); });
    const r = M.calculer(m, rep, a);
    fr[r.royaume]++; fp[r.produit]++; if (r.regle !== 'points') eg++; if (r.egaliteProduit) egProd++;
  }
  const parts = R.map(c => 100 * fr[c] / N), ecart = Math.sqrt(parts.reduce((s, p) => s + (p - 100 / 6) ** 2, 0) / 6);
  lignes.push({ alpha: a, ...Object.fromEntries(R.map((c, i) => [c, parts[i].toFixed(1)])), 'écart-type': ecart.toFixed(2),
    'égalités royaumes %': (100 * eg / N).toFixed(1), 'égalités produits %': (100 * egProd / N).toFixed(1) });
  console.log(`\nalpha=${a} produits :`, K.map(k => `${k} ${(100 * fp[k] / N).toFixed(1)}`).join(' | '));
}
console.log(); console.table(lignes);
