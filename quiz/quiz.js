/* Quiz Saveur Royale : interface. Le calcul est dans moteur.js, les contenus dans les fichiers JSON. */
(function () {
  'use strict';

  var WHATSAPP = '2250544705530';
  var URL_QUIZ = 'https://www.saveurroyale.com/quiz/';
  var EURO = 655.957;

  var matrice = null, catalogue = null, etats = null, stockCharge = null;
  var etape = 0, reponses = {};
  var $ = function (id) { return document.getElementById(id); };

  // ── Statistiques GoatCounter (sans cookie, aucune donnée personnelle) ──
  function evenement(nom, titre) {
    try {
      if (window.goatcounter && window.goatcounter.count) {
        window.goatcounter.count({ path: nom, title: titre || nom, event: true });
      }
    } catch (e) { /* jamais bloquant */ }
  }

  // ── Porte d'âge : même clé que l'accueil ──
  function ageVerifie() {
    try { return sessionStorage.getItem('ageVerified') === 'true'; } catch (e) { return false; }
  }
  function porteAge() {
    if (ageVerifie()) return;
    var porte = $('q-age');
    porte.hidden = false;
    porte.querySelector('[data-age="oui"]').focus();
    porte.addEventListener('click', function (e) {
      var choix = e.target.getAttribute('data-age');
      if (choix === 'oui') {
        try { sessionStorage.setItem('ageVerified', 'true'); } catch (err) { /* navigation privée */ }
        porte.hidden = true;
      } else if (choix === 'non') {
        window.location.href = 'https://www.google.com';
      }
    });
  }

  // ── Écrans ──
  function montrer(id) {
    ['q-intro', 'q-questions', 'q-revelation', 'q-resultat'].forEach(function (e) {
      var el = $(e);
      el.hidden = e !== id;
      if (e === id) { el.classList.remove('actif'); void el.offsetWidth; el.classList.add('actif'); }
    });
    window.scrollTo(0, 0);
  }

  function afficherQuestion(sens) {
    var q = matrice.questions[etape], total = matrice.questions.length;
    var bloc = $('q-question');
    bloc.classList.remove('sortie');
    bloc.style.animation = 'none'; void bloc.offsetWidth; bloc.style.animation = '';
    $('q-question-numero').textContent = 'Question ' + (etape + 1) + ' sur ' + total;
    $('q-question-titre').textContent = q.titre;
    $('q-progression-remplie').style.width = (100 * etape / total) + '%';
    var zone = $('q-reponses');
    zone.innerHTML = '';
    q.reponses.forEach(function (r, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'q-reponse';
      b.setAttribute('aria-pressed', reponses[q.id] === r.id ? 'true' : 'false');
      b.dataset.reponse = r.id;
      var lettre = document.createElement('span');
      lettre.className = 'q-reponse-lettre';
      lettre.setAttribute('aria-hidden', 'true');
      lettre.textContent = 'ABCD'.charAt(i);
      var texte = document.createElement('span');
      texte.textContent = r.texte;
      b.appendChild(lettre); b.appendChild(texte);
      zone.appendChild(b);
    });
    $('q-precedent').disabled = etape === 0;
    if (sens !== 'debut') $('q-question-titre').focus({ preventScroll: true });
  }

  function choisir(idReponse, bouton) {
    var q = matrice.questions[etape];
    reponses[q.id] = idReponse;
    Array.prototype.forEach.call($('q-reponses').children, function (b) {
      b.setAttribute('aria-pressed', b === bouton ? 'true' : 'false');
      b.disabled = true;
    });
    $('q-progression-remplie').style.width = (100 * (etape + 1) / matrice.questions.length) + '%';
    setTimeout(function () {
      $('q-question').classList.add('sortie');
      setTimeout(function () {
        if (etape < matrice.questions.length - 1) { etape++; afficherQuestion(); }
        else { reveler(); }
      }, 260);
    }, 320);
  }

  // ── Résultat ──
  function prix(p) {
    var euros = (p.prix / EURO).toFixed(2).replace('.', ',');
    return p.prix.toLocaleString('fr-FR') + ' FCFA · ≈ ' + euros + ' €';
  }
  function specs(p) { return p.degre + '° · ' + catalogue.volume_cl + ' cl · ' + prix(p); }
  function badge(el, p) { if (p.badge) { el.textContent = p.badge; el.hidden = false; } else { el.hidden = true; } }
  function lienWhatsApp(message) { return 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(message); }

  function reveler() {
    montrer('q-revelation');
    var resultat = SRQuizMoteur.calculer(matrice, reponses);
    var attente = new Promise(function (ok) { setTimeout(ok, 1600); });
    Promise.all([attente, stockCharge]).then(function () { afficherResultat(resultat); });
  }

  function afficherResultat(r) {
    var royaume = matrice.royaumes.filter(function (x) { return x.code === r.royaume; })[0];
    var p = catalogue.produits[r.produit];
    evenement('quiz_completed', royaume.nom);

    $('q-royaume-nom').textContent = royaume.nom;
    $('q-royaume-accroche').textContent = royaume.accroche;
    $('q-royaume-presentation').textContent = royaume.presentation;

    var img = $('q-bouteille-img');
    img.src = p.image; img.alt = 'Bouteille Saveur Royale ' + p.nom;
    $('q-bouteille-nom').textContent = p.nom;
    $('q-bouteille-specs').textContent = specs(p);
    $('q-bouteille-texte').textContent = p.explication;
    badge($('q-bouteille-badge'), p);

    // Disponibilité : appliquée après le calcul, ne change jamais le royaume
    var d = SRQuizMoteur.disponibilite(r, etats);
    var dispo = $('q-dispo'), cible = null, message;
    dispo.className = 'q-dispo';
    if (d.etat === 'inconnu') {
      dispo.hidden = true;
      cible = p;
    } else if (d.aCommander === r.produit) {
      dispo.hidden = false;
      dispo.classList.add(d.etat);
      dispo.textContent = d.etat === 'low' ? 'Disponible · stock limité' : 'Disponible';
      cible = p;
    } else if (d.aCommander) {
      var rempl = catalogue.produits[d.aCommander];
      dispo.hidden = false;
      dispo.classList.add('out');
      dispo.textContent = 'Momentanément épuisée · disponible dans votre royaume : ' + rempl.nom;
      cible = rempl;
    } else {
      dispo.hidden = false;
      dispo.classList.add('out');
      dispo.textContent = 'Momentanément épuisée';
    }
    if (cible) {
      message = 'Bonjour Saveur Royale ! Mon royaume est « ' + royaume.nom + ' » (quiz). Je souhaite commander : ' +
        cible.nom + ' (' + catalogue.volume_cl + ' cl, ' + cible.prix.toLocaleString('fr-FR') + ' FCFA).';
      $('q-commander').textContent = 'Commander ' + (cible === p ? 'sur WhatsApp' : cible.nom + ' sur WhatsApp');
    } else {
      message = 'Bonjour Saveur Royale ! Mon royaume est « ' + royaume.nom + ' » (quiz). La ' + p.nom +
        ' est épuisée : pouvez-vous me prévenir de son retour ou me conseiller ?';
      $('q-commander').textContent = 'Être conseillé sur WhatsApp';
    }
    $('q-commander').href = lienWhatsApp(message);
    $('q-partage-retour').textContent = '';

    // À découvrir aussi
    var autre = catalogue.produits[r.decouvrir];
    $('q-decouvrir-titre').textContent = r.decouvrirVoisin ? matrice.voisin.titre : 'À découvrir aussi';
    var im2 = $('q-decouvrir-img');
    im2.src = autre.image; im2.alt = 'Bouteille Saveur Royale ' + autre.nom;
    $('q-decouvrir-nom').textContent = autre.nom;
    $('q-decouvrir-specs').textContent = specs(autre);
    // Royaume voisin : texte neutre s'il existe (ne suppose pas les préférences du visiteur)
    $('q-decouvrir-texte').textContent = (r.decouvrirVoisin && autre.explication_voisin) || autre.explication;
    badge($('q-decouvrir-badge'), autre);

    montrer('q-resultat');
    $('q-royaume-nom').focus({ preventScroll: true });
    window.__quizResultat = r; // pour les tests automatiques
  }

  function partager() {
    var titre = $('q-royaume-nom').textContent;
    var texte = 'Mon royaume Saveur Royale : ' + titre + ' ! Et toi, quel est ton royaume ?';
    evenement('result_shared', titre);
    if (navigator.share) {
      navigator.share({ title: 'Quel est ton royaume Saveur Royale ?', text: texte, url: URL_QUIZ }).catch(function () {});
    } else {
      window.open('https://wa.me/?text=' + encodeURIComponent(texte + ' ' + URL_QUIZ), '_blank', 'noopener');
      $('q-partage-retour').textContent = 'Le partage s’ouvre dans WhatsApp.';
    }
  }

  // ── Démarrage ──
  function charger(url) { return fetch(url, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(url); return r.json(); }); }

  function init() {
    porteAge();
    stockCharge = charger('../stock.json')
      .then(function (s) { etats = s && s.etats ? s.etats : null; })
      .catch(function () { etats = null; }); // stock inconnu : on n'invente rien

    Promise.all([charger('royaumes.json'), charger('produits.json')]).then(function (res) {
      matrice = res[0]; catalogue = res[1];
      $('q-commencer').disabled = false;
    }).catch(function () {
      $('q-commencer').textContent = 'Quiz momentanément indisponible';
      $('q-commencer').disabled = true;
    });
    $('q-commencer').disabled = true;

    $('q-commencer').addEventListener('click', function () {
      if (!matrice) return;
      etape = 0; reponses = {};
      evenement('quiz_started');
      montrer('q-questions');
      afficherQuestion('debut');
      $('q-question-titre').focus({ preventScroll: true });
    });
    $('q-reponses').addEventListener('click', function (e) {
      var b = e.target.closest('.q-reponse');
      if (b && !b.disabled) choisir(b.dataset.reponse, b);
    });
    $('q-precedent').addEventListener('click', function () {
      if (etape > 0) { etape--; afficherQuestion(); }
    });
    $('q-commander').addEventListener('click', function () { evenement('whatsapp_clicked', $('q-royaume-nom').textContent); });
    $('q-partager').addEventListener('click', partager);
    $('q-recommencer').addEventListener('click', function () {
      etape = 0; reponses = {};
      montrer('q-intro');
      $('q-commencer').focus({ preventScroll: true });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
