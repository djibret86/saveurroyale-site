// Simulation exhaustive des 4^7 = 16 384 combinaisons du quiz.
// Lancement : node quiz/tests/simulation.js   (depuis la racine du dépôt)
'use strict';
const path = require('path');
const M = require('../moteur.js');
const matrice = require('../royaumes.json');
const catalogue = require('../produits.json').produits;
const stockReel = require('../../stock.json').etats; // lecture seule

const Q = matrice.questions;
const N = Math.pow(4, Q.length);
const freqR = {}, freqP = {}, regles = {}, egalProd = {};
matrice.ordre_royaumes.forEach(c => freqR[c] = 0);
Object.keys(catalogue).forEach(k => freqP[k] = 0);
let egaliteRoyaumes = 0, egalitesProduits = 0, invariantStock = 0;
const exemples = {};

const scenariosStock = {
  tout_ok: Object.fromEntries(Object.keys(catalogue).map(k => [k, 'ok'])),
  tout_low: Object.fromEntries(Object.keys(catalogue).map(k => [k, 'low'])),
  tout_out: Object.fromEntries(Object.keys(catalogue).map(k => [k, 'out'])),
  reel: stockReel
};
const dispo = {}; Object.keys(scenariosStock).forEach(s => dispo[s] = { direct: 0, remplacement: 0, whatsapp: 0 });

for (let n = 0; n < N; n++) {
  const reponses = {}; let x = n;
  Q.forEach(q => { reponses[q.id] = 'r' + (x % 4 + 1); x = Math.floor(x / 4); });
  const r = M.calculer(matrice, reponses);
  freqR[r.royaume]++; freqP[r.produit]++;
  regles[r.regle] = (regles[r.regle] || 0) + 1;
  if (r.regle !== 'points') egaliteRoyaumes++;
  if (r.egaliteProduit) { egalitesProduits++; egalProd[r.royaume] = (egalProd[r.royaume] || 0) + 1; }
  if (!exemples[r.produit]) exemples[r.produit] = Q.map(q => reponses[q.id].replace('r', '')).join('-');
  // Le stock ne doit jamais changer le profil
  for (const s in scenariosStock) {
    const d = M.disponibilite(r, scenariosStock[s]);
    const r2 = M.calculer(matrice, reponses);
    if (r2.royaume !== r.royaume || r2.produit !== r.produit) invariantStock++;
    dispo[s][d.aCommander === null ? 'whatsapp' : d.remplacement ? 'remplacement' : 'direct']++;
  }
}
const pct = v => (100 * v / N).toFixed(2).padStart(6) + ' %';
console.log(`Combinaisons simulées : ${N}`);
console.log('\nRoyaumes :');
matrice.royaumes.forEach(r => console.log(`  ${r.code} ${r.nom.padEnd(28)} ${String(freqR[r.code]).padStart(5)} ${pct(freqR[r.code])}`));
console.log('\nProduits recommandés (profil gustatif, hors stock) :');
Object.keys(catalogue).sort((a, b) => freqP[b] - freqP[a]).forEach(k =>
  console.log(`  ${catalogue[k].nom.padEnd(20)} ${String(freqP[k]).padStart(5)} ${pct(freqP[k])}   ex. réponses ${exemples[k] || '—'}`));
console.log('\nRègle ayant désigné le royaume :');
Object.entries(regles).forEach(([k, v]) => console.log(`  ${k.padEnd(16)} ${String(v).padStart(5)} ${pct(v)}`));
console.log(`\nÉgalités entre produits d'une même famille : ${egalitesProduits} (${pct(egalitesProduits).trim()})`, egalProd);
console.log(`Produits jamais recommandés : ${Object.keys(freqP).filter(k => !freqP[k]).join(', ') || 'aucun'}`);
console.log(`Contrôle « le stock ne change pas le profil » : ${invariantStock === 0 ? 'OK (0 écart)' : invariantStock + ' ÉCARTS'}`);
console.log('\nScénarios de stock (direct / remplacement dans la famille / orientation WhatsApp) :');
Object.entries(dispo).forEach(([s, v]) => console.log(`  ${s.padEnd(9)} ${v.direct} / ${v.remplacement} / ${v.whatsapp}`));
