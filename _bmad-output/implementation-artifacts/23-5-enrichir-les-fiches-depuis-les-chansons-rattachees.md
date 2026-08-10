---
baseline_commit: 9c48329
---

# Story 23.5: Enrichir les fiches Catalog depuis les chansons rattachées

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **curateur**,
I want **que les fiches créées par le seed arrivent déjà remplies avec la tonalité, le tempo, le genre et les liens des chansons dont elles proviennent**,
so that **le Catalog ait de la valeur dès le premier jour, au lieu d'être 75 coquilles à remplir à la main**.

## Contexte / origine

**Story née de la répétition de 23.4**, pas du cadrage initial. northwood, en lisant le rapport : *« ça va pas du tout, j'aurais voulu que t'exportes la tonalité, le BPM et tout »*.

C'est un **besoin légitime qui n'avait pas pu être exprimé plus tôt** : l'export de départ (`backups/songs_par_user_20260725_004820.csv`) ne contenait que `user,email,artist,title`. L'epic a donc été bâtie sur « titre + artiste seulement » — c'était la seule matière disponible. La répétition de 23.4 a restauré **toute la base de prod** en local, et cette matière-là existe désormais.

**Elle n'annule rien.** Les phases seed, attach et alias restent exactement ce qu'elles sont. Celle-ci vient **après** et remonte les valeurs le long du lien que le rattachement vient de créer.

## Ce que la répétition a mesuré, et qui rend cette story simple

- **88 chansons distinctes en prod, et AUCUNE possédée par plus d'un utilisateur.** Donc **aucun conflit de valeurs à arbitrer** : chaque chanson a un seul propriétaire, chaque fiche une seule source.
- **Le lien est exactement 1:1** : les 75 fiches brouillon créées par le seed sont chacune rattachée à **une** chanson, et une seule. Vérifié par agrégation.
- **Ce qui remonterait** : genre **75/75**, liens streaming **72/75**, BPM **61/75**, tonalité **49/75**.

## La raison profonde, au-delà du confort

Une fiche remplie **depuis la chanson d'origine** rend le « Refresh » inoffensif pour son propriétaire : il lui réécrit **ses propres valeurs**. Le risque de perte de données qui pesait sur toute l'epic — et qui justifiait la décision A (tout en brouillon) — **disparaît** pour ces 75 fiches.

⚠️ Cela **rouvre la décision brouillon / publication directe**, en faveur de northwood. Ce n'est **pas** l'objet de cette story : elle la rend seulement décidable sur de bonnes bases. À trancher après, avec des fiches qui ont du contenu.

## Décisions et invariants applicables

- **Invariant : rien de personnel ne monte dans une fiche partagée.** Instrument, accordage, notes, `lastPlayed`, `myInstrumentUid` restent chez l'utilisateur. La liste de ce qui monte est fermée et testée.
- **Invariant : une fiche déjà remplie par le curateur fait autorité.** L'enrichissement ne fait que **combler des trous**, il n'écrase jamais une valeur existante.
- **Invariant : on ne touche que les brouillons.** Une fiche publiée a été validée par un humain ; elle est hors périmètre.
- **Décision B toujours en vigueur** : aucune chanson ne doit se mettre à afficher « mise à jour disponible » à cause de cette story.

## Acceptance Criteria

1. **Quatrième phase `--phase=enrich`**, qui hérite comme les autres du garde sur l'hôte, du dry-run par défaut, du refus d'argument inconnu et des compteurs de sécurité. Elle s'exécute **en dernier** : `seed → attach → alias → enrich`.
2. **Périmètre : les fiches en brouillon uniquement** (`published_at IS NULL`), et **seulement** celles rattachées à **exactement une** chanson. Zéro ou plusieurs chansons ⇒ la fiche est **ignorée et signalée**, jamais arbitrée. *(Mesuré aujourd'hui : 75 fiches, toutes en 1:1 — la garde existe pour demain.)*
3. **Champs remontés, et rien d'autre** : `album`, `key`, `bpm`, `mode`, `timeSignature`, `durationSeconds`, `language`, `genre`, `streamingLinks`, `pitchStandard`. Un test vérifie la **liste exacte**. Aucun champ personnel ne doit pouvoir s'y glisser.
4. **On ne comble que les trous** — un champ déjà renseigné dans la fiche n'est **jamais** écrasé. ⚠️ **La chaîne vide compte comme un trou**, des deux côtés : `key = ''` doit être traité comme absent, sinon on recopie du vide qui *paraît* rempli et on croit la fiche complète.
5. **Les champs JSON sont clonés en profondeur** (`language`, `genre`, `streamingLinks`) — la fiche partagée ne doit jamais partager une référence avec la Song d'un utilisateur. Même discipline que `buildSongFromCatalog` et `refreshSongFromCatalog`.
6. **Aucune chanson ne se met à afficher « mise à jour disponible »** — modifier une fiche bouge son `updatedAt`, ce qui rendrait la drift vraie pour la chanson rattachée. La phase **doit** donc remettre `source_catalog_synced_at` à la nouvelle valeur de `CatalogSong.updatedAt` sur la chanson rattachée. **C'est le cœur de la story** : sans ça, on crée exactement l'alerte que toute l'epic cherche à éviter, chez 75 personnes.
7. **Les valeurs passent par la normalisation partagée** (`backend/utils/normalize.js` : `normalizeMode`, `normalizeLanguage`, `normalizeInt`, `normalizeDurationSeconds`). Une valeur qu'une Song accepte mais qu'une fiche refuserait doit être **écartée et signalée**, pas insérée telle quelle.
8. **`--dry-run` dit, fiche par fiche, quels champs seraient comblés** — c'est ce que northwood lira avant d'autoriser. Groupé lisiblement, sans afficher d'email.
9. **Idempotence** — une seconde exécution `--apply` ne remplit **rien** et le rapporte : tous les trous sont bouchés.
10. **Compteurs `Songs`, `SongPlays`, `SessionItems`, `PlaylistSongs` inchangés**, comme les autres phases. Aucune modification du schéma, du modèle, d'un contrôleur, d'une route ou du front. Aucune migration.

## Tasks / Subtasks

- [ ] **Task 1 — La phase** (AC: 1)
  - [ ] Ajouter `alias` → `enrich` à `PHASES` ; `--file` reste refusé hors phase `seed`.
  - [ ] Documenter l'ordre `seed → attach → alias → enrich` dans l'en-tête du script, et **pourquoi** enrich vient en dernier (il lui faut le lien que attach et alias posent).
- [ ] **Task 2 — Sélection des fiches à enrichir** (AC: 2)
  - [ ] En SQL : fiches `published_at IS NULL`, avec le **compte** de Songs rattachées. Retourner la fiche, ses champs actuels, et ceux de la chanson rattachée.
  - [ ] `count <> 1` ⇒ la fiche part dans un seau « ignorées », **nommée**, avec son compte. Jamais de choix arbitraire — même discipline que la sonde d'ambiguïté de 23.2/23.3.
- [ ] **Task 3 — Calcul des trous à combler** (AC: 3, 4, 7)
  - [ ] Une **constante exportée** listant les 10 champs, utilisée à la fois par le code et par le test : la liste ne doit pas exister en deux exemplaires.
  - [ ] Pour chaque champ : combler **seulement** si la fiche est vide (`null` **ou** chaîne vide) et la Song non vide. Réutiliser `utils/normalize.js`, ne pas réécrire les règles.
  - [ ] ⚠️ `pitchStandard` vaut **440 par défaut des deux côtés** : le recopier est un non-événement. Décider explicitement s'il fait partie du lot ou non, et l'écrire.
- [ ] **Task 4 — L'écriture** (AC: 4, 5, 6)
  - [ ] `CatalogSong.update(<champs comblés>, { where: { uid, published_at: null } })` — le `where` **re-vérifie** le brouillon à l'écriture, comme le `where` de 23.2/23.3 re-vérifie ses conditions.
  - [ ] Clonage profond des trois champs JSON avant écriture.
  - [ ] **Puis** relire le `updatedAt` de la fiche et poser `sourceCatalogSyncedAt` dessus sur la chanson rattachée, en `silent` (on ne modifie pas la chanson de l'utilisateur, on re-synchronise un marqueur). **Une fiche enrichie sans re-synchronisation est un bug**, pas un détail.
  - [ ] Garde par ligne (`try` englobant lecture et écriture).
- [ ] **Task 5 — Rapport** (AC: 8)
  - [ ] Par fiche : `artiste / titre` puis la liste des champs comblés (`bpm`, `genre`, …). Total par champ en fin de rapport.
  - [ ] Seau « ignorées » (0 ou plusieurs chansons) et seau « valeurs écartées par la normalisation », tous deux nommés.
- [ ] **Task 6 — Compteurs** (AC: 10)
  - [ ] Réutiliser `countGuardedTables` et `diffCounts`. **Ne pas les réécrire.**
- [ ] **Task 7 — Tests** (AC: 2, 3, 4, 5, 6, 9)
  - [ ] Modèles mockés. Couvrir : une fiche publiée n'est jamais touchée ; 0 ou 2 chansons ⇒ ignorée et signalée ; la liste **exacte** des champs écrits ; un champ déjà rempli n'est pas écrasé ; **la chaîne vide compte comme un trou** ; les JSON sont clonés (muter la Song après coup ne doit pas changer ce qui a été écrit) ; **`sourceCatalogSyncedAt` est bien re-posé après l'écriture** ; dry-run n'écrit rien ; second passage ne comble rien.
  - [ ] **Vérifier les gardes par mutation**, en visant la fonction **par sa ligne** — l'erreur de la review 23.3 était de muter la première occurrence du motif dans le fichier, qui appartenait à une autre phase. Inclure une **mutation neutre** en témoin.
  - [ ] Baseline backend à **mesurer** avant de commencer (483 au dernier relevé — le vérifier, pas le recopier).
- [ ] **Task 8 — Validation** (AC: 10)
  - [ ] `cd backend && npm test` + `npm run lint`. `git diff --stat` : script + test uniquement.
  - [ ] **Exécuter réellement le dry-run** sur la copie de prod restaurée. Environnement : `DB_ENABLE_SSL= NODE_ENV=test` (⚠️ `NODE_ENV=development` ne se connecte pas, SSL en dur).
  - [ ] Comparer aux chiffres de cadrage : **75 fiches**, genre **75**, liens **72**, BPM **61**, tonalité **49**. Un écart doit être **expliqué**.
  - [ ] Vérifier **en base** qu'aucune chanson n'est en drift après l'exécution (`count = 0`), et **au navigateur** qu'aucun bandeau « nouvelle version » n'apparaît.

## Dev Notes

### Le piège central de cette story

Il n'est pas dans la copie des valeurs, il est dans **l'effet de bord de la copie**. Modifier une fiche bouge son `updatedAt`, et la drift se calcule contre cette date. Enrichir 75 fiches sans re-synchroniser, c'est allumer « une nouvelle version est disponible » chez 75 personnes — pile l'alerte que la décision B avait été prise pour éviter. La re-synchronisation n'est pas une finition, c'est la moitié de la story.

### Pièges

- **La chaîne vide n'est pas `NULL`.** Mesuré en cadrage : un premier comptage annonçait « 75 chansons avec tonalité ou BPM », la vraie réponse était **61** — les `key = ''` gonflaient le chiffre. Traiter `''` comme absent des deux côtés, sinon on comble un trou avec du vide et on croit la fiche remplie.
- **Ne pas recopier les valeurs brutes.** `utils/normalize.js` existe déjà (`normalizeMode`, `normalizeLanguage`, `normalizeInt`, `normalizeDurationSeconds`) et une valeur tolérée sur une Song historique peut être refusée côté fiche. Écarter et signaler plutôt qu'insérer.
- **Les champs JSON doivent être clonés.** Sans clonage, la fiche partagée et la Song d'un utilisateur pointeraient sur le même objet — c'est explicitement ce que `refreshSongFromCatalog` évite avec `structuredClone`.
- **Une fiche publiée n'est pas un brouillon oublié** : c'est une fiche qu'un humain a validée. Hors périmètre, et le `where` doit le re-vérifier à l'écriture.
- **Le 1:1 est vrai aujourd'hui, pas par construction.** Rien n'empêche deux utilisateurs d'avoir demain la même chanson rattachée à la même fiche — avec des valeurs différentes, comme le montrent les 4 divergences relevées sur les 7 fiches déjà curées. D'où la garde de l'AC2.
- **Ces valeurs sont celles d'un utilisateur, pas une vérité.** Mesuré : sur les 7 fiches curées à la main, *Hysteria* est notée **C / 186** par l'utilisateur et **A / 93** par le curateur — exactement le double, donc une lecture en demi-mesure, pas une erreur. Le curateur reste libre de corriger ensuite ; l'enrichissement fournit un point de départ, pas un verdict.

### Anchors (lus, non devinés)

- `backend/models/catalogsong.js` — les 10 champs partageables : `album`, `key`, `bpm`, `mode`, `timeSignature`, `durationSeconds`, `language`, `genre`, `streamingLinks`, `pitchStandard` (défaut **440**), plus `publishedAt`.
- `backend/controllers/songcontroller.js:128` — `INTRINSIC_REFRESH_FIELDS`, et `:155-158` le clonage profond des trois champs JSON. C'est la liste de référence de « ce qui n'est pas personnel ».
- `backend/utils/normalize.js:77` — `normalizeInt`, `normalizeDurationSeconds`, `normalizeLanguage`, `normalizeMode`, `MODE_VALUES`.
- `backend/scripts/seed-catalog.js` — les 3 phases existantes, le garde sur l'hôte, `countGuardedTables`, `diffCounts`, la discipline du `where` qui re-vérifie, les rapports nominatifs.
- `_bmad-output/implementation-artifacts/epic-23-seed-report-2026-08-10.md` — toutes les mesures citées ici.

### Project Structure Notes

- **UPDATE** : `backend/scripts/seed-catalog.js`, `backend/__tests__/seedCatalog.test.js`.
- **Aucun** fichier nouveau ; aucun modèle, migration, contrôleur, route, front.
- Conventions backend : **CommonJS**, pas de `.ts`, modèles mockés dans les tests.

### References

- [Source: `_bmad-output/implementation-artifacts/epic-23-seed-report-2026-08-10.md` — 1:1 vérifié, couverture des champs, divergences mesurées]
- [Source: `_bmad-output/planning-artifacts/epics.md` § Epic 23 — décisions A et B, invariants]
- [Source: `_bmad-output/implementation-artifacts/23-3-alias-rattachement-et-correction-orthographe.md` § Review Findings — la discipline du `where`, la vérification par mutation et son piège]
- [Source: `_bmad-output/project-context.md`]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-10 | 0.1 | Story créée (create-story), née de la répétition de 23.4 : l'export de départ n'avait que `user,email,artist,title`, mais le dump prod restauré en local contient tout. Quatrième phase qui remonte les valeurs le long du lien de rattachement, mesuré **1:1** sur les 75 fiches brouillon, sans aucun conflit possible (88 chansons, **zéro** possédée par plus d'un utilisateur). Récupérable : genre 75/75, liens 72/75, BPM 61/75, tonalité 49/75. Cœur de la story posé en AC6 : re-synchroniser `source_catalog_synced_at` après l'écriture, faute de quoi l'enrichissement allume « mise à jour disponible » chez 75 personnes. Conséquence notée mais hors périmètre : une fiche remplie depuis sa chanson d'origine rend le Refresh inoffensif, ce qui **rouvre** la décision brouillon/publication. | northwood |
