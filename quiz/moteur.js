/* Moteur du quiz Saveur Royale : calcul pur, sans accès à la page.
   Utilisé par la page (window.SRQuizMoteur) et par les tests Node (require). */
(function (racine) {
  'use strict';

  // Maximum de points atteignable par royaume (somme, question par question, du meilleur gain possible)
  function maxima(matrice) {
    var m = {};
    matrice.ordre_royaumes.forEach(function (c) {
      m[c] = 0;
      matrice.questions.forEach(function (q) {
        m[c] += Math.max.apply(null, q.reponses.map(function (r) { return r.royaumes[c] || 0; }));
      });
    });
    return m;
  }

  // reponses : { q1: 'r1', q2: 'r3', ... } — une réponse par question
  // alpha : 0 = score brut, 1 = score relatif ; par défaut, la valeur de royaumes.json
  function calculer(matrice, reponses, alpha) {
    var ordre = matrice.ordre_royaumes;
    if (alpha === undefined) alpha = matrice.normalisation ? matrice.normalisation.alpha : 0;
    var maxi = maxima(matrice);
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

    // Score normalisé : points / maximum^alpha (arrondi pour comparer sans erreur de virgule)
    var score = {};
    ordre.forEach(function (c) { score[c] = Math.round(1e9 * ptsRoyaumes[c] / Math.pow(maxi[c], alpha)) / 1e9; });

    // Royaume gagnant et règles d'égalité (documentées dans royaumes.json)
    var max = Math.max.apply(null, ordre.map(function (c) { return score[c]; }));
    var exAequo = ordre.filter(function (c) { return score[c] === max; });
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

    // Produits d'un royaume, du meilleur au moins bon.
    // Égalité : règle conditionnelle de royaumes.json (« departage_produits »), sinon ordre de la liste.
    function classer(code) {
      var ordreFam = parCode[code].produits.slice();
      (matrice.departage_produits || []).forEach(function (d) {
        if (d.royaume === code && reponses[d.question] === d.reponse && ordreFam.indexOf(d.favoriser) > 0) {
          ordreFam.splice(ordreFam.indexOf(d.favoriser), 1);
          ordreFam.unshift(d.favoriser);
        }
      });
      return ordreFam.slice().sort(function (a, b) {
        return ptsProduits[b] - ptsProduits[a] || ordreFam.indexOf(a) - ordreFam.indexOf(b);
      });
    }
    var famille = classer(royaume);
    // « À découvrir aussi » : l'autre bouteille du royaume, ou, pour une famille d'une seule bouteille,
    // la meilleure du royaume complémentaire (« Dans le royaume voisin »).
    var voisin = famille.length > 1 ? null : parCode[royaume].complementaire;
    var decouvrir = voisin ? classer(voisin)[0] : famille[1];
    var egaliteProduit = famille.length > 1 && ptsProduits[famille[0]] === ptsProduits[famille[1]];

    return {
      royaume: royaume,
      produit: famille[0],          // profil gustatif : ne dépend jamais du stock
      decouvrir: decouvrir,         // « À découvrir aussi »
      decouvrirVoisin: voisin,      // code du royaume voisin, ou null
      famille: famille,
      regle: regle,
      egaliteProduit: egaliteProduit,
      ptsRoyaumes: ptsRoyaumes,
      scores: score,
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

  var M = { calculer: calculer, disponibilite: disponibilite, maxima: maxima };
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
  else racine.SRQuizMoteur = M;
})(this);
