# Réconciliation — Brainstorming 2026-06-06 ↔ PRD + Addendum

> Source : `_bmad-output/brainstorming/brainstorming-session-2026-06-06-1603.md`
> Cibles : `prd.md` et `addendum.md` (même dossier)
> Périmètre attendu : priorités 1 et 2 (idées #1–#6 + plan d'action), pont « Mark as Played », philosophie #24. Tout le reste = backlog (§4 Exclu du PRD ou addendum).

## 1. Éléments couverts (traçabilité du périmètre)

| Élément du brainstorming | Où dans le PRD/addendum | Verdict |
|---|---|---|
| **#1 Enregistreur de session (chrono)** — arbitré « v2 » dans le plan d'action | §4 Exclu (« Mode session temps réel avec chrono — v2 ») + addendum backlog | ✅ Conforme à l'arbitrage du brainstorming |
| **#2 Sessions éditables a posteriori** | FR8 (édition complète : date, durée, instrument, entrées, notes) | ✅ |
| **#2 Sessions rétroactives** | FR5 (« toute date passée autorisée ») + UJ-2 | ✅ |
| **#2 Novelty « fidèle à la réalité, pas à l'usage de l'app — condition de confiance »** | Reprise quasi verbatim en §1 (Philosophie) et UJ-2 | ✅ Le ressenti est préservé, pas aplati |
| **#3 Note libre globale par session** (« le pont coince encore ») | FR7 (avec l'exemple du brainstorming) | ✅ |
| **#4 Sujets de travail première classe** | Groupe A entier (FR1–FR4), métrique M4 dédiée | ✅ Renforcé (FR4 sur la suppression sans trouer l'historique va au-delà du brainstorming) |
| **#5 Liste plate, pas de hiérarchie** | FR1 (« Pas de hiérarchie : liste plate ») + addendum (modèle Sujet) | ✅ |
| **#5 Note contextuelle par entrée** (« à 30 BPM ») | FR6 (note libre par entrée, exemple repris) | ✅ Les deux niveaux de notes (par entrée FR6 **et** par session FR7) sont distincts et présents |
| **#6 Durée par élément** (« Pentatonique — 25 min ») | FR6 (minutes par entrée) + FR11 (somme pré-calculée, surchargeable) | ✅ |
| **Plan P1.1 — Modèle Session** : date, durée, instrument, items (chanson **ou** sujet + minutes + note), note de session | FR5–FR7 + esquisse de modèle dans l'addendum (Session/SessionItem/Sujet), fidèle champ par champ | ✅ |
| **Plan P1.2 — CRUD manuel d'abord, rétroactif inclus, chrono en v2** | FR5/FR8/FR9 ; chrono explicitement exclu | ✅ |
| **Plan P1.3 — Heatmap** : grille annuelle, intensité = minutes totales, clic jour → détail | FR13, FR14, FR15 | ✅ (FR13 précise même le cas « session sans durée = intensité minimale ») |
| **Plan P1.4 — Bouton « joué » alimente la session du jour** | FR18 + UJ-3 ; FR19 ajoute la cohérence inverse (enrichissement raisonnable) | ✅ |
| **Plan P2.1–2.3 — Sujet minimal, page de gestion, intégration aux sessions** | FR1, FR3, FR6 | ✅ |
| **Plan P2.4 — « Plus tard : lien chanson ↔ sujets (#11) »** | §4 Exclu + addendum backlog | ✅ |
| **Critère de succès P1** (« un trou = un vrai jour sans jouer ») | UJ-4 + CM1 (contre-métrique churn post-rupture) | ✅ |
| **Critère de succès P2** (« Sweet Child 15 min + pentatonique 25 min à 30 BPM ») | UJ-1 le rejoue presque mot pour mot | ✅ |
| **Obstacle commun — ne pas enrichir le modèle Session trop tôt** | §1 (pari produit), §7 (ligne de risque dédiée), addendum (rappel explicite) | ✅ Triple ancrage |
| **#24 Philosophie « miroir, pas fouet », pas de rouge agressif, pas de notification culpabilisante** | §1 « Philosophie produit (non négociable) » + FR16 (exigence testable) + risque Duolingo/Anki en §7 | ✅ La philosophie est élevée au rang d'exigence, pas aplatie |
| **#9 Insight terrain « basse + dernier joué » / morceaux délaissés** | UJ-3 (Marc filtre par instrument + dernier joué) | ✅ L'insight irrigue le parcours |
| **Insight « le PC est à portée de main »** | UJ-1 (repris textuellement) | ✅ |
| **« Session = unité atomique, heatmap = projection »** | §1, pari produit, repris quasi verbatim | ✅ |

## 2. Écarts trouvés

### Écart 1 (mineur) — La « novelty » de l'idée #5 n'a pas de vue de restitution : *historique daté de progression*

Le brainstorming valorise #5 pour son résultat : « **Historique daté de progression** sans champ structuré » — pouvoir relire, pour un sujet donné, la suite des notes contextuelles (« à 30 BPM » → « à 60 BPM »...). Le PRD capture bien la donnée (FR6) mais ne spécifie **aucune vue de consultation par sujet ou par chanson** : FR12 n'offre qu'une liste antichronologique de *sessions*, et FR14 un détail *par jour*. La promesse de progression lisible n'est ni incluse ni explicitement backloggée. Recommandation : ajouter soit un FR léger (« depuis la fiche d'un sujet, voir ses entrées de session passées »), soit une ligne de backlog explicite.

### Écart 2 (mineur) — La valeur déclarée de l'idée #6 (« où va mon temps de pratique ») n'est restituée nulle part

Le brainstorming justifie la durée par élément ainsi : « Révèle *où va mon temps de pratique* — la donnée que tout prof réclame ». Le PRD capture les minutes (FR6/FR11) et la heatmap montre le volume *par jour*, mais aucune répartition du temps *par sujet/chanson* n'existe, et le backlog ne la nomme pas (les « récaps hebdo » exclus en sont le véhicule probable, mais le lien n'est pas fait). Recommandation : une mention dans le backlog (« répartition du temps par sujet — via récaps futurs ») suffirait à tracer l'intention.

### Écart 3 (cosmétique) — Le but initial n°2 du brainstorming (« vue chansons travaillées ») n'est pas tracé explicitement

C'était l'une des trois pistes d'entrée de la session. Elle a été absorbée par le journal (FR12/FR14 la couvrent partiellement), mais ni le PRD ni l'addendum ne disent que cette piste a été fusionnée dans le journal de sessions. Sans gravité — la transformation est le résultat naturel de la session — mais une ligne dans l'addendum éviterait qu'on la croie perdue.

### Écart 4 (cohérence interne, non bloquant) — Les idées #7 et #8 ne sont que dans l'addendum, pas dans §4 Exclu du PRD

Les filtres composables drag & drop (#7) et les playlists intelligentes (#8) figurent dans le backlog de l'addendum mais pas dans la liste « Exclu » du PRD, alors que tous les autres thèmes hors périmètre y sont. Conforme à la consigne (PRD **ou** addendum), mais l'asymétrie peut faire croire à un oubli lors d'une lecture du PRD seul.

### Non-écarts vérifiés (points sensibles contrôlés un par un)

- **Notes à deux niveaux** : par entrée (FR6) ET par session (FR7) — les deux sont là, distinctes, avec les exemples d'origine. Pas de fusion abusive.
- **Sessions rétroactives** : présentes trois fois (FR5, UJ-2, §1). Pas d'affaiblissement.
- **Modèle Session champ par champ** : aucun champ du plan d'action n'est perdu ; l'addendum reproduit l'esquisse exacte.
- **Philosophie #24** : non seulement préservée mais opérationnalisée (FR16 testable + contre-métrique CM1). C'est l'inverse d'un aplatissement.
- **Durée minimale** : le PRD ajoute explicitement « aucune durée minimale » (FR5) — enrichissement cohérent avec l'esprit « zéro friction » du brainstorming, pas une dérive.

## 3. Hors-périmètre vérifiés (chaque idée exclue est bien backloggée)

| Idée(s) | §4 Exclu (PRD) | Addendum (backlog) |
|---|---|---|
| #1 Mode chrono temps réel (v2) | ✅ | ✅ |
| #7 Filtres composables drag & drop | ❌ | ✅ |
| #8 Playlists intelligentes | ❌ | ✅ |
| #10 Santé du répertoire + menu du jour | ✅ | ✅ |
| #11 Lien chanson ↔ sujets | ✅ | ✅ |
| #12 Métronome/accordeur contextuels | ✅ | ✅ |
| #13/#14 Lecteur YouTube intégré (vitesse, boucle A-B) | ✅ | ✅ |
| #15 Vidéothèque par instrument | ✅ | ✅ |
| #16–#19 École du manche / moteur audio / micro-leçons | ✅ | ✅ |
| #20 Récap hebdo | ✅ | ✅ |
| #21 Wrapped annuel | ✅ | ✅ |
| #22 Records personnels | ✅ | ✅ |
| #23 Objectifs de pratique | ✅ | ✅ |
| #24 Mode discret des objectifs | (philosophie intégrée au PRD §1/FR16 ; le mécanisme « objectifs » est backloggé avec #23) | ✅ |
| #9 Rotation de répertoire | Insight d'usage existant, pas une fonctionnalité nouvelle — irrigue UJ-3 | n/a |

**Conclusion** : aucune idée hors périmètre n'est orpheline. Les 24 idées sont toutes tracées (incluses, exclues-backloggées, ou absorbées en insight). Les quatre écarts relevés sont mineurs : deux concernent des *vues de restitution* promises par les novelties #5 et #6 (donnée capturée mais lecture non spécifiée), un la traçabilité du but initial n°2, un une asymétrie PRD/addendum pour #7–#8.
