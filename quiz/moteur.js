/* Moteur du quiz Saveur Royale : calcul pur, sans accès à la page.
   Utilisé par la page (window.SRQuizMoteur) et par les tests Node (require). */
(function (racine) {
  'use strict';

  // reponses : { q1: 'r1', q2: 'r3', ... } — une réponse par question
  function calculer(matrice, reponses) {
    var ordre = matrice.ordre_royaumes;
    var ptsRoyaumes = {}, ptsProduits = {};
    ordre.forEach(function (c) { ptsRoyaumes[c] = 0; });
    matrice.royaumes.forEach(function (r) {
      r.produits.forEach(function (k) { ptsProduits[k] = 0; });
    });

    matrice.questions.forEach(function (q) {
      var rep = q.reponses.filter(function (r) { return r.id === reponses[q.id]; })[0];
      if (!rep) throw new Error('Réponse manquante pour ' + q.id);
      Object.keys(rep.royaumes).forEach(function (c) { ptsRoyaumes[c] += rep.royaumes[c]; });
      Object.keys(rep.produits).forEach(function (k) { ptsProduits[k] += rep.produits[k]; });
    });

    var parCode = {};
    matrice.royaumes.forEach(function (r) { parCode[r.code] = r; });

    function meilleurProduit(code) {
      var liste = parCode[code].produits, meilleur = liste[0];
      liste.forEach(function (k) { if (ptsProduits[k] > ptsProduits[meilleur]) meilleur = k; });
      return meilleur;
    }

    // Royaume gagnant et règles d'égalité (documentées dans royaumes.json)
    var max = Math.max.apply(null, ordre.map(function (c) { return ptsRoyaumes[c]; }));
    var exAequo = ordre.filter(function (c) { return ptsRoyaumes[c] === max; });
    var regle = 'points';
    if (exAequo.length > 1) {
      regle = 'score_produit';
      var maxP = Math.max.apply(null, exAequo.map(function (c) { return ptsProduits[meilleurProduit(c)]; }));
      exAequo = exAequo.filter(function (c) { return ptsProduits[meilleurProduit(c)] === maxP; });
    }
    if (exAequo.length > 1) {
      for (var i = 0; i < matrice.revelatrices.length && exAequo.length > 1; i++) {
        var qId = matrice.revelatrices[i];
        var q = matrice.questions.filter(function (x) { return x.id === qId; })[0];
        var rep = q.reponses.filter(function (r) { return r.id === reponses[qId]; })[0];
        var principal = Object.keys(rep.royaumes).filter(function (c) { return rep.royaumes[c] === 2; })[0];
        if (exAequo.indexOf(principal) !== -1) { exAequo = [principal]; regle = 'revelatrice_' + qId; }
      }
    }
    if (exAequo.length > 1) regle = 'ordre_fixe';
    var royaume = exAequo[0];

    // Produits de la famille, du meilleur au moins bon (égalité : ordre de la liste)
    var famille = parCode[royaume].produits.slice().sort(function (a, b) {
      return ptsProduits[b] - ptsProduits[a] || parCode[royaume].produits.indexOf(a) - parCode[royaume].produits.indexOf(b);
    });
    var egaliteProduit = famille.length > 1 && ptsProduits[famille[0]] === ptsProduits[famille[1]];

    return {
      royaume: royaume,
      produit: famille[0],          // profil gustatif : ne dépend jamais du stock
      famille: famille,
      regle: regle,
      egaliteProduit: egaliteProduit,
      ptsRoyaumes: ptsRoyaumes,
      ptsProduits: ptsProduits
    };
  }

  // Disponibilité, appliquée APRÈS le calcul. etats = stock.json.etats (ou null si absent)
  function disponibilite(resultat, etats) {
    if (!etats) return { aCommander: resultat.produit, etat: 'inconnu', remplacement: false };
    var etatDe = function (k) { return etats[k] || 'inconnu'; };
    if (etatDe(resultat.produit) !== 'out') {
      return { aCommander: resultat.produit, etat: etatDe(resultat.produit), remplacement: false };
    }
    for (var i = 1; i < resultat.famille.length; i++) {
      var k = resultat.famille[i];
      if (etatDe(k) !== 'out') return { aCommander: k, etat: etatDe(k), remplacement: true };
    }
    return { aCommander: null, etat: 'out', remplacement: false };
  }

  var M = { calculer: calculer, disponibilite: disponibilite };
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
  else racine.SRQuizMoteur = M;
})(this);
