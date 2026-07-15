# PRD Quality Review — Catalog (musician-tools)

## Overall verdict

PRD **solide**, prêt pour l'aval. Il tient une thèse claire (« friction zéro » : supprimer la Songlist vide), la décline en features et métriques cohérentes, et documente honnêtement ce qui est décidé, différé ou supposé. La force principale est la traçabilité vers l'aval (Glossaire verbatim, FR à conséquences testables, addendum qui isole le « comment » technique et acte la rupture mono-user → partagé). Le seul point réellement mou est la **calibration des métriques de succès** (cibles directionnelles sans chiffre), qui affaiblit un peu la mesurabilité de la thèse ; le reste relève de propreté mécanique mineure.

## Decision-readiness — strong

Un décideur peut agir sur ce PRD. Les décisions fondatrices sont **posées comme des décisions**, pas noyées : §0 les liste (« copie snapshot + provenance », « métadonnées + liens seulement », « connectés seulement », « bloquer + pointer l'existante »), et le `.decision-log.md` conserve les alternatives **rejetées** avec leur motif (lien-vivant pur « conflit avec l'édition + couplage dur aux logs/playlists/lastPlayed » ; snapshot-pur-sans-provenance « fermerait la porte au mettre-à-jour »). Le trade-off le plus contre-intuitif est nommé et argumenté : §5 pose que **les paroles sont juridiquement *les plus* risquées** (« licences Musixmatch/LyricFind payantes »), à rebours de l'intuition « les tabs sont pires ».

Les Questions ouvertes (§8) sont **réellement ouvertes** — six choix non tranchés (granularité de version de provenance, tri par défaut, booléen vs table de rôles, volume de seed, liste des champs canoniques vs perso, mapping Collection → Playlist), chacun renvoyant à sa section source. Les `[NOTE FOR PM]` tombent sur de vraies tensions (§6.2 « browse public… c'est l'argument d'acquisition ; à revisiter » ; §4.1 axes de tri par défaut). Rien n'est lissé au neutre.

## Substance over theater — strong

Pas de furniture notable.

- **Personas** : trois protagonistes (Léa, Marc, northwood), sous le seuil de quatre, chacun **portant un UJ et un JTBD** (Léa → JTBD fonctionnel #1 ; Marc → #2 ; northwood → JTBD curateur). Aucun persona décoratif.
- **Vision** (§1) : spécifique au produit (« chaque nouvel utilisateur arrive sur une Songlist vide et doit tout ressaisir »), non transposable telle quelle à un autre PRD.
- **NFR** : product-specific, pas du boilerplate. NFR-1 nomme un fait structurel réel (« première donnée non scopée par utilisateur… rupture vs le pattern tout est scopé `userUid` ») ; NFR-4 précise un choix d'ingénierie concret (référence souple, pas de FK vive). Aucun « must be scalable/secure » creux.
- **Innovation** : la sémantique « snapshot + provenance » est **issue de la recherche paysage** (digest concurrentiel dans le decision-log : UG/MuseScore/Spotify), pas d'une case de template.

## Strategic coherence — adequate

La thèse est nette et les features en découlent : Browse/Add/Collections servent directement « friction zéro », la Curation est l'**enabler** assumé (seed tenable sans SQL), et les chantiers différés (mise à jour depuis la source §4.5, contribution §4.6) sont explicitement « modèle-aware, non construits en v1 ». Le scope kind — *problem-solving* (supprimer une friction d'onboarding) — est cohérent avec la logique de périmètre. Les **counter-métriques existent et sont bien choisies** : SM-C1 (« Songs copiées jamais jouées ») garde précisément la *qualité* de la thèse contre du remplissage vide, ce qui est le bon garde-fou pour une métrique d'ajout.

Ce qui fait descendre à *adequate* : les **cibles des Success Metrics sont sous-spécifiées**. SM-2, qui mesure pourtant l'objectif-cœur (time-to-first-song), ne fixe qu'une « baisse nette » sans baseline ni chiffre ; SM-3 et SM-4 n'ont aucune cible ; seul SM-1 avance un « > 50 % (indicatif) ». Pour un PRD calibré « refonte structurante », l'absence de cible chiffrée sur la métrique-phare rend la validation de la thèse difficile à trancher a posteriori.

### Findings
- **medium** Cibles de métriques molles (§7, SM-2/SM-3/SM-4) — SM-2 se contente de « une **baisse nette** vs la saisie manuelle » sans baseline ni valeur, alors que c'est la traduction directe de la thèse ; SM-3/SM-4 n'ont pas de cible. *Fix :* fixer une baseline mesurée (time-to-first-song actuel) et une cible chiffrée même grossière pour SM-2, et un seuil de succès pour SM-3 (ex. « ≥ X % importent une Collection à 30 j ») et SM-4 (ex. « ≥ N fiches / ≥ M Collections au lancement »).

## Done-ness clarity — strong

Dimension la mieux tenue au niveau FR. **Chaque FR porte un bloc `Consequences (testable)`** avec des conditions vérifiables, pas des adjectifs : FR-4 « la Song porte `sourceCatalogUid` ; ce lien est inerte (aucune synchronisation, aucune dépendance de suppression) » ; FR-5 « Supprimer la fiche Catalog source laisse la Song perso intacte » ; FR-6 « n'ajoute aucune ligne » + message exact « Already in your songlist » ; FR-9 récap chiffré « 18 added, 2 already in your songlist ». Aucun « handles gracefully » / « reasonable performance » flou n'est laissé sans consequence attachée. Les critères d'acceptation sont portés par les consequences plutôt que par une section dédiée — approprié ici.

Deux bords doux, mineurs, plus près de l'UX/archi que du contrat :

### Findings
- **low** Recherche sans borne de résultat/latence (§4.2, FR-2) — les consequences couvrent le fonctionnel (casse/accents, ET des filtres, état vide) mais aucune borne de perf, alors que NFR-2 pose que le Catalog « croît bien au-delà d'une Songlist ». *Fix :* poser une borne indicative (taille de page, ou latence cible) ou renvoyer explicitement le chiffrage à l'UX/archi.
- **low** Choix « paginé **ou** virtualisé » laissé ouvert (FR-1, NFR-2) — acceptable comme décision déléguée, mais à acter en UX/archi pour que « done » soit sans ambiguïté côté implémentation. *Fix :* marquer d'un `[NOTE FOR PM]`/renvoi UX plutôt qu'un « ou » implicite.

## Scope honesty — strong

Les omissions sont **explicites et argumentées**, jamais laissées à l'inférence. §5 Non-Goals justifie chaque exclusion (paroles/tabs = risque juridique ; browse public = surface SEO/rate-limit ; write-back = FR-7) ; §6.2 range chaque hors-périmètre avec une cible de version (v2, v2/v3, non planifié). Les `[ASSUMPTION]` inline sont présents et indexés (§9), les `[NON-GOAL for MVP]` marquent les omissions silencieusement supposables (browse public en FR-3/§4.1), et le de-scoping est proposé ouvertement (§4.5, §4.6 « rien de tout cela n'est construit en v1 »). Densité open-items (6 Questions ouvertes + 5 assumptions + quelques NOTE FOR PM) **proportionnée** à un enjeu « refonte structurante » — ce n'est pas un green-light-to-build mais une base de cadrage assumée.

## Downstream usability — strong

PRD chain-top (alimente UX → architecture → epics), et il l'assume bien.

- **Glossaire** (§3) présent, riche, avec consigne d'emploi verbatim ; les noms de domaine (Catalog entry, Provenance, Clé canonique, Curator…) sont utilisés de façon cohérente dans les FR/UJ/SM.
- **IDs** contigus et uniques : FR-1→FR-13 sans trou, UJ-1→UJ-3, SM-1→SM-4 + SM-C1/C2, NFR-1→NFR-6.
- **Cross-refs internes résolvent** (§4.5 → §6.2/§8 ; §4.6 → §5/§8 ; assumptions → §9).
- Chaque **UJ a un protagoniste nommé** portant le contexte inline (état d'entrée, chemin, climax, edge case).
- L'**addendum** donne à l'architecture une amorce directement exploitable (esquisse `CatalogSong`, index unique global, mécanique Add en 4 étapes, réutilisation nominale de `findDuplicateSong`/`fetchFromSongBpm`/data-router Epic 18) et **acte la rupture structurelle** à trancher en `bmad-create-architecture`.

Réserve mineure de traçabilité (voir Mechanical notes) : quelques références externes cryptiques (« miroir 10.1/17.1 ») et un verbe d'action non glossé.

## Shape fit — strong

Le PRD n'est pas forcé dans une forme inadaptée. Produit **consumer à UX signifiante + rôle opérateur (Curator)** : les UJ à protagoniste nommé sont load-bearing pour les parcours utilisateurs (Léa, Marc), tandis que la curation reçoit à juste titre un traitement **capability-spec** (FR-10→FR-13) plus un UJ opérateur unique (UJ-3, northwood) — la forme mixte colle au produit. Contexte **brownfield** correctement traité : les références à l'existant sont précises et plausibles (Epic 17 / garde d'unicité, story 7.5 / pattern anti-oracle, story 8.1 / auto-fill, Epic 18 / data-router), et l'addendum **distingue** clairement le neuf (`CatalogSong`, rôle) de l'existant réutilisé. Ni sur-formalisé (pas de densité UJ gratuite pour la partie admin), ni sous-formalisé (le geste central Add est couvert par UJ + FR + mécanique).

## Mechanical notes

- **Roundtrip Assumptions Index (low)** — l'index §9 contient 5 entrées, mais deux d'entre elles — « §0 / addendum » (nouvelle table `CatalogSong`) et « §6.1 » (même SPA React + réutilisation auto-fill) — **n'ont pas de tag `[ASSUMPTION]` inline** à l'endroit cité (§0 et §6.1 n'en portent pas). Les 3 assumptions réellement taguées inline (§4.1, §4.3/FR-9, §4.4) sont bien indexées. Sens inverse incomplet. *Fix :* ajouter les tags inline manquants en §0/§6.1, ou retirer ces entrées de l'index.
- **Glossaire — verbe d'import non glossé (low)** — « **Add collection to my songlist** » est employé en UJ-2 et §11 comme l'action d'import en lot, mais seul « Add to my songlist » figure au Glossaire (§3). *Fix :* ajouter l'action Collection au Glossaire pour rester verbatim en aval.
- **Références externes cryptiques (low)** — « miroir 10.1/17.1 » (FR-13, addendum) et « 10.1/17.1 » ne se résolvent pas depuis ce PRD seul (numérotation d'un autre artefact/epic). *Fix :* nommer la source (« index unique per-user d'Epic 17 ») partout, sans renvoi numérique opaque.
- **ID continuity** — OK : FR-1→13, UJ-1→3, SM-1→4 + SM-C1/C2, NFR-1→6, tous contigus, uniques, sans cross-ref cassée.
- **Sections requises** — présentes et adaptées à l'enjeu « refonte structurante » (Vision, Utilisateur/JTBD/UJ, Glossaire, Features+FR, Non-Goals, MVP, Métriques + counter-métriques, Questions ouvertes, Assumptions Index, NFR, IA, Garde-fous, Plateforme, + addendum technique).

---

### Compte de findings par sévérité
- critical : 0
- high : 0
- medium : 1
- low : 5
