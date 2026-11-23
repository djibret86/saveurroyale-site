// Tests de la page /quiz/ (Playwright, Chromium préinstallé).
// 1. Servir la racine du dépôt avec l'en-tête CSP de production sur http://localhost:8765
// 2. node quiz/tests/page.js [dossier_captures]
'use strict';
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const M = require('../moteur.js');
const matrice = require('../royaumes.json');
const BASE = 'http://localhost:8765/quiz/';
const CAPT = process.argv[2] || path.join(__dirname, 'captures');
fs.mkdirSync(CAPT, { recursive: true });

const APPAREILS = [['iphone-se', devices['iPhone SE']], ['iphone-12', devices['iPhone 12']],
  ['pixel-5', devices['Pixel 5']], ['ordinateur', { viewport: { width: 1366, height: 860 } }]];
// Un parcours par royaume (réponses 1 à 4 pour Q1..Q7), vérifié ensuite contre le moteur
const PARCOURS = { VC: '1111111', DE: '2121111', CO: '3223111', FP: '3433111', EA: '3344111', ET: '4321112' };
const STOCKS = {
  ok: { etats: Object.fromEntries(Object.keys(require('../produits.json').produits).map(k => [k, 'ok'])) },
  low: null, out: null, absent: 'absent'
};
STOCKS.low = { etats: Object.fromEntries(Object.keys(STOCKS.ok.etats).map(k => [k, 'low'])) };
STOCKS.out = { etats: Object.fromEntries(Object.keys(STOCKS.ok.etats).map(k => [k, 'out'])) };

let echecs = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) echecs++; };

async function nouvellePage(b, opts, stock, ageDeja) {
  const c = await b.newContext(opts);
  const p = await c.newPage();
  const erreurs = [], csp = [];
  p.on('pageerror', e => erreurs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') erreurs.push(m.text()); });
  await p.addInitScript(age => {
    window.__ev = []; window.__csp = [];
    window.goatcounter = { count: o => window.__ev.push(o.path) };
    document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));
    if (age) sessionStorage.setItem('ageVerified', 'true');
    window.open = (u) => { window.__ouvert = u; return null; };
  }, ageDeja);
  await c.route(u => !u.hostname.includes('localhost'), r => r.fulfill({ status: 200, body: '' }));
  if (stock === 'absent') await c.route('**/stock.json', r => r.fulfill({ status: 404, body: '' }));
  else if (stock) await c.route('**/stock.json', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(stock) }));
  return { c, p, erreurs };
}

async function jouer(p, suite) {
  await p.click('#q-commencer');
  for (const ch of suite) {
    await p.waitForSelector('.q-reponse:not([disabled])');
    await p.locator('.q-reponse').nth(Number(ch) - 1).click();
  }
  await p.waitForSelector('#q-resultat:not([hidden])', { timeout: 8000 });
}

(async () => {
  const b = await chromium.launch();

  console.log('Porte d\'âge');
  { const { c, p } = await nouvellePage(b, devices['iPhone 12'], null, false);
    await p.goto(BASE, { waitUntil: 'load' });
    ok(await p.isVisible('#q-age'), 'visible sur une visite directe');
    await p.click('[data-age="oui"]');
    ok(!(await p.isVisible('#q-age')), 'disparaît après « Oui »');
    ok(await p.evaluate(() => sessionStorage.getItem('ageVerified')) === 'true', 'enregistre ageVerified (même clé que l\'accueil)');
    await c.close(); }
  { const { c, p } = await nouvellePage(b, devices['iPhone 12'], null, true);
    await p.goto(BASE, { waitUntil: 'load' });
    ok(!(await p.isVisible('#q-age')), 'non redemandée si l\'âge est déjà confirmé sur l\'accueil');
    await c.close(); }

  console.log('\nParcours des 6 royaumes (comparés au moteur)');
  for (const [code, suite] of Object.entries(PARCOURS)) {
    const { c, p, erreurs } = await nouvellePage(b, devices['iPhone 12'], STOCKS.ok, true);
    await p.goto(BASE, { waitUntil: 'load' });
    await jouer(p, suite);
    const rep = {}; matrice.questions.forEach((q, i) => rep[q.id] = 'r' + suite[i]);
    const attendu = M.calculer(matrice, rep);
    const affiche = await p.evaluate(() => window.__quizResultat);
    const nom = await p.textContent('#q-royaume-nom');
    const href = await p.getAttribute('#q-commander', 'href');
    ok(attendu.royaume === code && affiche.royaume === code && affiche.produit === attendu.produit,
      `${code} → ${nom} / ${await p.textContent('#q-bouteille-nom')} (moteur : ${attendu.produit})`);
    ok(href.startsWith('https://wa.me/2250544705530?text=') && decodeURIComponent(href).includes(nom), '  lien WhatsApp avec le royaume');
    const titreDec = await p.textContent('#q-decouvrir-titre');
    ok(code === 'VC' ? titreDec.includes('royaume voisin') : titreDec === 'À découvrir aussi', `  rubrique « ${titreDec} » : ${await p.textContent('#q-decouvrir-nom')}`);
    if (code === 'VC') ok((await p.textContent('#q-decouvrir-texte')).includes('une autre facette des saveurs de Cocota') && !(await p.textContent('#q-decouvrir-texte')).includes('que vous recherchez'), '  texte neutre dans « Dans le royaume voisin »');
    await p.click('#q-commander'); await p.click('#q-partager');
    const ev = await p.evaluate(() => window.__ev);
    ok(['quiz_started', 'quiz_completed', 'whatsapp_clicked', 'result_shared'].every(e => ev.includes(e)), '  événements GoatCounter : ' + ev.join(', '));
    ok(erreurs.length === 0, '  aucune erreur console' + (erreurs.length ? ' : ' + erreurs.join(' | ') : ''));
    await c.close();
  }

  console.log('\nScénarios de stock (parcours ET → Ananas)');
  for (const [nomStock, stock] of Object.entries(STOCKS)) {
    const { c, p } = await nouvellePage(b, devices['iPhone 12'], stock, true);
    await p.goto(BASE, { waitUntil: 'load' });
    await jouer(p, PARCOURS.ET);
    const r = await p.evaluate(() => window.__quizResultat);
    const visible = await p.isVisible('#q-dispo');
    const texte = visible ? await p.textContent('#q-dispo') : '(aucune mention)';
    const btn = await p.textContent('#q-commander');
    ok(r.royaume === 'ET', `${nomStock.padEnd(6)} royaume inchangé (${r.royaume}) · ${texte} · bouton « ${btn} »`);
    if (nomStock === 'absent') ok(!visible, '  stock inconnu : aucune disponibilité inventée');
    if (nomStock === 'out') ok(btn.includes('conseillé'), '  tout épuisé : orientation WhatsApp');
    const dansPage = await p.content();
    ok(!/\b\d+\s*(bouteilles? restantes?|en stock)/i.test(dansPage), '  aucune quantité de stock affichée');
    await c.close();
  }

  console.log('\nAffichage, CSP et captures');
  for (const [nom, opts] of APPAREILS) {
    const { c, p, erreurs } = await nouvellePage(b, opts, STOCKS.ok, false);
    await p.goto(BASE, { waitUntil: 'load' });
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${CAPT}/${nom}-0-age.png` });
    await p.click('[data-age="oui"]'); await p.waitForTimeout(700);
    await p.screenshot({ path: `${CAPT}/${nom}-1-intro.png` });
    await p.click('#q-commencer'); await p.waitForTimeout(700);
    await p.locator('.q-reponse').nth(0).click(); await p.waitForTimeout(1000);
    await p.screenshot({ path: `${CAPT}/${nom}-2-question.png` });
    for (const ch of PARCOURS.DE.slice(1)) { await p.waitForSelector('.q-reponse:not([disabled])'); await p.locator('.q-reponse').nth(Number(ch) - 1).click(); }
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${CAPT}/${nom}-3-revelation.png` });
    await p.waitForSelector('#q-resultat:not([hidden])'); await p.waitForTimeout(1400);
    await p.screenshot({ path: `${CAPT}/${nom}-4-resultat.png`, fullPage: true });
    const larg = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    ok(larg[0] <= larg[1], `${nom.padEnd(10)} rien ne dépasse de l'écran (${larg[0]} / ${larg[1]} px)`);
    const tailles = await p.$$eval('.q-btn, .q-reponse', a => a.filter(e => e.offsetParent).map(e => e.getBoundingClientRect().height));
    ok(tailles.every(h => h >= 44), `${nom.padEnd(10)} zones tactiles ≥ 44 px`);
    const cspV = await p.evaluate(() => window.__csp);
    ok(cspV.length === 0, `${nom.padEnd(10)} aucune violation CSP` + (cspV.length ? ' : ' + cspV.join(' | ') : ''));
    ok(erreurs.length === 0, `${nom.padEnd(10)} aucune erreur console`);
    await c.close();
  }

  console.log('\nAccessibilité (axe-core, si disponible)');
  try {
    const axe = fs.readFileSync(process.env.AXE || '', 'utf8');
    const { c, p } = await nouvellePage(b, devices['iPhone 12'], STOCKS.ok, true);
    for (const etapeNom of ['intro', 'question', 'resultat']) {
      if (etapeNom === 'intro') await p.goto(BASE, { waitUntil: 'load' });
      if (etapeNom === 'question') { await p.click('#q-commencer'); await p.waitForTimeout(600); }
      if (etapeNom === 'resultat') { for (const ch of PARCOURS.FP) { await p.waitForSelector('.q-reponse:not([disabled])'); await p.locator('.q-reponse').nth(Number(ch) - 1).click(); } await p.waitForSelector('#q-resultat:not([hidden])'); await p.waitForTimeout(1400); }
      await p.addScriptTag({ content: axe });
      const v = await p.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] })).violations.map(x => x.id + '(' + x.nodes.length + ')'));
      ok(v.length === 0, `${etapeNom.padEnd(9)} ${v.length ? v.join(', ') : 'aucune erreur WCAG A/AA'}`);
    }
    await c.close();
  } catch (e) { console.log('  (axe-core non fourni : variable AXE)'); }

  await b.close();
  console.log(`\n${echecs === 0 ? 'TOUS LES TESTS SONT PASSÉS' : echecs + ' ÉCHEC(S)'} · captures : ${CAPT}`);
  process.exit(echecs ? 1 : 0);
})();
