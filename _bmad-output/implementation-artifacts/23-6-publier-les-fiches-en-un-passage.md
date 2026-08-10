---
baseline_commit: 67b7725
---

# Story 23.6: Publier les fiches en un passage, sans alerter personne

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **curateur**,
I want **que les fiches créées par le seed soient publiées d'un seul coup**,
so that **le Catalog soit utilisable immédiatement, sans que j'aie à cliquer sur 75 fiches une par une**.

## Contexte / origine

**Story née d'une décision de northwood**, prise après la répétition de 23.4 et l'enrichissement de 23.5 : *« je veux pas que les trucs soient en brouillon, je veux qu'elles soient publiées directes, je ne veux pas m'amuser à cliquer sur chaque truc pour les publier. »*

Elle **amende la décision A** de l'epic (« seed en BROUILLON »), qui était fondée sur un raisonnement devenu faux. Cette décision protégeait d'un risque précis : une fiche publiée mais **vide** dont le Refresh écraserait la tonalité et le tempo de l'utilisateur avec du néant. **La story 23.5 a supprimé ce risque** en remplissant les fiches depuis les chansons elles-mêmes : un Refresh y réécrirait à l'utilisateur ses propres valeurs.

La décision A reste juste **pour un seed vide**. Elle n'a plus de raison d'être pour un seed enrichi.

## Le piège, mesuré avant d'écrire cette story

**Publier une fiche la modifie**, donc bouge son `updatedAt`, donc rend la drift vraie. Vérifié en transaction annulée sur la copie de prod :

```
drift AVANT publication  :  0 chanson
drift APRÈS publication des 75 : 75 chansons
```

Sans précaution, publier allumerait « une nouvelle version est disponible » chez **tout le monde**, d'un coup. C'est exactement le piège de 23.5, et il a la même parade : **re-synchroniser `source_catalog_synced_at` juste après**. Cette story ne consiste pas à mettre une date dans une colonne, elle consiste à le faire **sans réveiller personne**.

## Ce qui rend la publication sûre aujourd'hui

- **Les fiches contiennent les valeurs de leurs propres chansons** (23.5) : un Refresh serait un non-événement pour leur propriétaire.
- **Aucune divergence de diapason** : les 75 chansons sont à **440**, comme le défaut des fiches. Vérifié — c'était le seul champ que 23.5 ne remplissait jamais, donc le seul qui aurait pu écraser une valeur au Refresh.
- **Rien de personnel n'est monté dans les fiches** : instrument, accordage et notes sont restés chez les utilisateurs.

## Décision explicite de northwood sur les fiches vides

Deux fiches n'ont **aucune donnée** — `Tool / Fear Inoculum` et `Wye Oak / Civilian` — parce que personne n'a jamais renseigné ces chansons. J'ai recommandé de les laisser en brouillon : publiées, elles apparaissent au Catalog et un « Add to my songlist » n'y récupère qu'un titre et un artiste.

**northwood a tranché : on les publie quand même** — *« mets-les dans le catalogue, je m'occuperai de remplir aussi. »* Elles doivent donc être **publiées ET nommées** dans le rapport, pour qu'il ait sa liste de ce qui reste à remplir.

## Acceptance Criteria

1. **Cinquième phase `--phase=publish`**, héritant du garde sur l'hôte, du dry-run par défaut, du refus d'argument inconnu et des compteurs. Elle s'exécute **en dernier** : `seed → attach → alias → enrich → publish`.
2. **Toutes les fiches en brouillon sont publiées**, y compris celles sans donnée (décision northwood). `published_at` reçoit l'horodatage de l'exécution.
3. **Personne ne doit voir « mise à jour disponible »** — après avoir publié une fiche, la phase relit son `updatedAt` **frais** et le repose sur `source_catalog_synced_at` de **chaque** chanson rattachée. ⚠️ Ici une fiche peut avoir **plusieurs** chansons rattachées (contrairement à 23.5, qui refusait ce cas) : il faut re-synchroniser **toutes** celles qui pendent à la fiche, pas une seule.
4. **Le rapport nomme les fiches publiées SANS aucune donnée** — c'est la liste de travail de northwood, pas un avertissement. Attendu : **2** (`Tool / Fear Inoculum`, `Wye Oak / Civilian`).
5. **Le `where` re-vérifie le brouillon à l'écriture** (`published_at IS NULL`) : une fiche publiée à la main entre le SELECT et l'UPDATE ne doit pas être re-publiée, ce qui écraserait sa date d'origine.
6. **Idempotence** — une seconde exécution `--apply` publie **zéro** fiche et le rapporte. Aucune date de publication existante n'est jamais réécrite.
7. **`--dry-run` annonce combien de fiches seraient publiées**, dont combien sans donnée, sans rien écrire.
8. **Compteurs `Songs`, `SongPlays`, `SessionItems`, `PlaylistSongs` inchangés.** Aucune modification du schéma, du modèle, d'un contrôleur, d'une route ou du front. Aucune migration.
9. **Vérification finale sur la copie de prod** : après exécution, `0` chanson en drift, et au navigateur **aucun bandeau « nouvelle version »** sur une chanson rattachée — alors que la ligne « Added from the Catalog », elle, apparaît désormais (c'est l'effet voulu de la publication).

## Tasks / Subtasks

- [x] **Task 1 — La phase** (AC: 1)
  - [x] Ajouter `publish` à `PHASES`, documenter l'ordre complet dans l'en-tête et **pourquoi** publish vient en dernier (il lui faut des fiches déjà remplies, sinon on republie le problème que la décision A évitait).
- [x] **Task 2 — Sélection** (AC: 2, 4)
  - [x] En SQL : fiches `published_at IS NULL`, avec pour chacune la liste (ou le nombre) de chansons rattachées **et** un indicateur « sans aucune donnée » calculé sur les champs porteurs d'information.
  - [x] ⚠️ Réutiliser `ENRICH_SIGNAL_FIELDS` pour « sans donnée » : `pitchStandard` vaut 440 par défaut et ne dit rien. Ne pas réécrire la règle.
- [x] **Task 3 — Publication et re-synchronisation** (AC: 2, 3, 5)
  - [x] `CatalogSong.update({ publishedAt: <date> }, { where: { uid, publishedAt: null } })`.
  - [x] **Puis** relire le `updatedAt` frais de la fiche et le poser sur `source_catalog_synced_at` de **TOUTES** les chansons rattachées, en `silent`. Un `Song.update(..., { where: { sourceCatalogUid: <fiche> } })` couvre le cas multiple en une requête.
  - [x] Garde par ligne (`try` englobant lecture et écriture).
- [x] **Task 4 — Rapport** (AC: 4, 7)
  - [x] Nombre publié ; **liste nommée** des fiches publiées sans donnée, présentée comme une liste de travail (« à remplir ») et non comme une erreur ; nombre de chansons re-synchronisées.
- [x] **Task 5 — Compteurs** (AC: 8)
  - [x] Réutiliser `countGuardedTables` et `diffCounts`. **Ne pas les réécrire.**
- [x] **Task 6 — Tests** (AC: 2, 3, 5, 6)
  - [x] Modèles mockés. Couvrir : dry-run n'écrit rien ; le `where` re-vérifie `publishedAt: null` ; **la re-synchronisation touche TOUTES les chansons rattachées, pas la première** ; elle utilise le `updatedAt` **frais** ; une fiche déjà publiée n'est pas retouchée ; second passage publie 0 ; une fiche sans donnée est publiée **et** nommée ; une erreur en cours de lot ne jette pas le rapport.
  - [x] **Vérifier les gardes par mutation**, en visant par motif unique ou par index de ligne, avec un **témoin neutre**.
  - [x] Baseline backend à **mesurer** avant de commencer (508 au dernier relevé — le vérifier).
- [x] **Task 7 — Validation** (AC: 8, 9)
  - [x] `cd backend && npm test` + `npm run lint`. `git diff --name-only` : script + test uniquement.
  - [x] **Exécuter réellement** sur la copie de prod (`DB_ENABLE_SSL= NODE_ENV=test`), puis vérifier **en base** que la drift est à `0`.
  - [x] **Au navigateur** : sur une chanson rattachée, la ligne « Added from the Catalog » apparaît **sans** bandeau ambre ni bouton Refresh. Et le Catalog public montre les nouvelles fiches avec leurs valeurs.

## Dev Notes

### Le piège central

Il est identique à celui de 23.5, avec une aggravation : **une fiche peut avoir plusieurs chansons rattachées**. 23.5 refusait ce cas (il ne savait pas de quelle chanson tirer les valeurs) ; ici il n'y a rien à arbitrer — on publie la fiche, et **toutes** ses chansons doivent être re-synchronisées. Ne re-synchroniser que la première laisserait les autres en drift, avec une alerte que personne ne comprendrait.

Mesuré aujourd'hui : le lien est 1:1 sur les 75 brouillons, donc le cas multiple ne se produit pas encore. Il se produira dès que deux utilisateurs auront la même chanson.

### Pièges

- **Publier, c'est modifier.** Vérifié en transaction annulée : publier les 75 fait passer la drift de 0 à 75. La re-synchronisation n'est pas une finition, c'est la story.
- **Ne jamais réécrire une `published_at` existante** — une fiche publiée à la main a une date qui veut dire quelque chose. D'où le `where`.
- **`pitchStandard` ne compte pas comme « de la donnée »** : 440 par défaut des deux côtés. C'est déjà tranché en 23.5, `ENRICH_SIGNAL_FIELDS` existe pour ça.
- **Ce que la publication rend visible est voulu** : la ligne « Added from the Catalog » va apparaître sur les chansons rattachées. Ce n'est pas une régression, c'est le but. Ce qui ne doit **pas** apparaître, c'est le bandeau ambre.
- **Les 4 fiches déjà publiées plus pauvres que la saisie des utilisateurs** (relevé en 23.4) ne sont **pas** concernées par cette story : elles sont déjà publiées. Elles restent un sujet de curation manuelle.

### Anchors (lus, non devinés)

- `backend/scripts/seed-catalog.js` — les 4 phases, `ENRICH_SIGNAL_FIELDS`, `countGuardedTables`, `diffCounts`, la discipline du `where` qui re-vérifie, la re-synchronisation de 23.5 (le modèle exact à suivre).
- `backend/models/catalogsong.js` — `publishedAt` (`field: 'published_at'`, nullable), `timestamps: true` : c'est ce qui fait bouger `updatedAt` à la publication.
- `backend/controllers/songcontroller.js:113-116` — le calcul de la drift, et `:147` le 409 sur une source non publiée qui **cessera** de se produire une fois les fiches publiées.
- `_bmad-output/implementation-artifacts/epic-23-seed-report-2026-08-10.md` — les mesures citées.

### Project Structure Notes

- **UPDATE** : `backend/scripts/seed-catalog.js`, `backend/__tests__/seedCatalog.test.js`.
- **Aucun** fichier nouveau ; aucun modèle, migration, contrôleur, route, front.
- Conventions backend : **CommonJS**, pas de `.ts`, modèles mockés dans les tests.

### References

- [Source: décision northwood du 2026-08-10 — publication directe, fiches vides comprises]
- [Source: `_bmad-output/planning-artifacts/epics.md` § Epic 23 — décision A, **amendée** par cette story]
- [Source: `_bmad-output/implementation-artifacts/23-5-enrichir-les-fiches-depuis-les-chansons-rattachees.md` — la re-synchronisation, le modèle à reproduire]
- [Source: `_bmad-output/project-context.md`]

## Dev Agent Record

### Agent Model Used

claude-opus-5[1m] (dev-story)

### Debug Log References

**Baseline backend** : 513 (vérifiée). Après : **527** (+14).

**Exécution réelle sur la copie de prod**, et c'est la mesure qui compte :

```
drift AVANT            : 0
=== PUBLICATION APPLIQUÉE ===
  fiches brouillon: 75
  publiées        : 75
  marqueurs resynchro.: 75   (personne ne verra « nouvelle version disponible »)
  À REMPLIR       : 2      • Tool / Fear Inoculum   • Wye Oak / Civilian
Compteurs après : Songs=88  SongPlays=133  SessionItems=94  PlaylistSongs=1
drift APRÈS publication des 75 : 0
```

Sans la re-synchronisation, la mesure de cadrage annonçait **75 chansons en drift**. Après exécution : **0**. Le Catalog est passé à **125 fiches publiées, 0 brouillon**. Idempotence : second passage `fiches brouillon: 0`.

**6 gardes vérifiés par mutation.** Une mutation n'a pas pu s'appliquer au premier essai (`if (!synced) {` existe dans les phases enrich **et** publish) — son « 155 verts » ne prouvait rien ; refaite par index de ligne sur la bonne occurrence, elle tue bien 1 test. C'est la troisième fois que ce piège se présente, et la deuxième fois que le garde d'unicité du script de mutation l'attrape.

### Completion Notes List

- **La re-synchronisation vise `sourceCatalogUid`, pas `uid`** — une seule requête couvre toutes les chansons de la fiche. C'était l'aggravation par rapport à 23.5 : là-bas une fiche n'avait qu'une chanson par construction (le cas multiple était refusé), ici il n'y a rien à arbitrer mais tout le monde doit être resynchronisé. Un test mute précisément ce `where` et meurt.
- **`returning: true` plutôt qu'une relecture**, même raison qu'en 23.5 corrigé : une relecture rapporterait l'horodatage d'un curateur concurrent et marquerait *son* changement comme déjà vu.
- **Le `where` re-vérifie `publishedAt: null`** : une fiche que tu aurais publiée à la main entre la sélection et l'écriture garde **sa** date, qui veut dire quelque chose.
- **Les 2 fiches sans donnée sont publiées et présentées comme une liste de travail** (« À REMPLIR »), pas comme un avertissement — c'est ce que northwood a demandé.
- **`hasData` est calculé en SQL** à partir de `ENRICH_FIELDS`, qui ne contient plus `pitchStandard` depuis la review de 23.5. La règle « ce qui compte comme de la donnée » n'existe donc qu'à un seul endroit.
- **Observation hors périmètre, reportée** : le bouton « Publier » du curateur (`catalogcontroller.js:200`) fait `entry.update({ publishedAt })` **sans** re-synchroniser. Il a donc exactement le défaut que cette phase corrige : publier une fiche à la main depuis l'UI allumera la bannière chez ses détenteurs. L'AC8 interdit de toucher aux contrôleurs ; consigné en deferred-work.
- **Contrôle navigateur fait** (northwood s'est reconnecté). `Vulfpeck / Dean Town` — qui n'affichait **rien** tant que sa fiche était brouillon — montre maintenant « ↳ Added from the Catalog » **et rien d'autre** : pas de bandeau ambre, pas de bouton Refresh. C'est exactement l'effet voulu : la provenance devient visible parce que la fiche est publiée, l'alerte ne l'est pas parce que le marqueur a été reposé.

### File List

- `backend/scripts/seed-catalog.js` — MODIFIÉ (phase publish)
- `backend/__tests__/seedCatalog.test.js` — MODIFIÉ (+14 tests)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — MODIFIÉ (suivi)

Aucun modèle, migration, contrôleur, route ni front (AC8).

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-10 | 0.1 | Story créée (create-story) sur décision de northwood : publication directe, sans clic par fiche. **Amende la décision A** de l'epic, dont le fondement (une fiche publiée vide appauvrirait l'utilisateur au Refresh) a été supprimé par 23.5. Piège central mesuré avant rédaction, en transaction annulée : publier les 75 fiches fait passer la drift de **0 à 75** — la re-synchronisation est la story, pas une finition. Aggravation par rapport à 23.5 : une fiche peut avoir **plusieurs** chansons rattachées, il faut toutes les re-synchroniser. Les 2 fiches sans donnée sont publiées **et nommées** dans le rapport, à la demande de northwood, comme liste de travail. | northwood |
| 2026-08-10 | 0.2 | Phase publish implémentée et exécutée sur la copie de prod : **75 fiches publiées, 75 marqueurs resynchronisés, drift 0** alors que la mesure de cadrage annonçait 75 en drift sans précaution. Catalog à 125 publiées / 0 brouillon. Compteurs inchangés, idempotent. Backend 513 → 527, 6 gardes vérifiés par mutation. Reporté : le bouton Publier du curateur a le même défaut et n'est pas corrigé ici (AC8). | northwood |
