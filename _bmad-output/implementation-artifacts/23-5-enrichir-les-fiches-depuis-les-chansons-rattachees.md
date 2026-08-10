---
baseline_commit: 9c48329
---

# Story 23.5: Enrichir les fiches Catalog depuis les chansons rattachées

Status: review

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

- [x] **Task 1 — La phase** (AC: 1)
  - [x] Ajouter `alias` → `enrich` à `PHASES` ; `--file` reste refusé hors phase `seed`.
  - [x] Documenter l'ordre `seed → attach → alias → enrich` dans l'en-tête du script, et **pourquoi** enrich vient en dernier (il lui faut le lien que attach et alias posent).
- [x] **Task 2 — Sélection des fiches à enrichir** (AC: 2)
  - [x] En SQL : fiches `published_at IS NULL`, avec le **compte** de Songs rattachées. Retourner la fiche, ses champs actuels, et ceux de la chanson rattachée.
  - [x] `count <> 1` ⇒ la fiche part dans un seau « ignorées », **nommée**, avec son compte. Jamais de choix arbitraire — même discipline que la sonde d'ambiguïté de 23.2/23.3.
- [x] **Task 3 — Calcul des trous à combler** (AC: 3, 4, 7)
  - [x] Une **constante exportée** listant les 10 champs, utilisée à la fois par le code et par le test : la liste ne doit pas exister en deux exemplaires.
  - [x] Pour chaque champ : combler **seulement** si la fiche est vide (`null` **ou** chaîne vide) et la Song non vide. Réutiliser `utils/normalize.js`, ne pas réécrire les règles.
  - [x] ⚠️ `pitchStandard` vaut **440 par défaut des deux côtés** : le recopier est un non-événement. Décider explicitement s'il fait partie du lot ou non, et l'écrire.
- [x] **Task 4 — L'écriture** (AC: 4, 5, 6)
  - [x] `CatalogSong.update(<champs comblés>, { where: { uid, published_at: null } })` — le `where` **re-vérifie** le brouillon à l'écriture, comme le `where` de 23.2/23.3 re-vérifie ses conditions.
  - [x] Clonage profond des trois champs JSON avant écriture.
  - [x] **Puis** relire le `updatedAt` de la fiche et poser `sourceCatalogSyncedAt` dessus sur la chanson rattachée, en `silent` (on ne modifie pas la chanson de l'utilisateur, on re-synchronise un marqueur). **Une fiche enrichie sans re-synchronisation est un bug**, pas un détail.
  - [x] Garde par ligne (`try` englobant lecture et écriture).
- [x] **Task 5 — Rapport** (AC: 8)
  - [x] Par fiche : `artiste / titre` puis la liste des champs comblés (`bpm`, `genre`, …). Total par champ en fin de rapport.
  - [x] Seau « ignorées » (0 ou plusieurs chansons) et seau « valeurs écartées par la normalisation », tous deux nommés.
- [x] **Task 6 — Compteurs** (AC: 10)
  - [x] Réutiliser `countGuardedTables` et `diffCounts`. **Ne pas les réécrire.**
- [x] **Task 7 — Tests** (AC: 2, 3, 4, 5, 6, 9)
  - [x] Modèles mockés. Couvrir : une fiche publiée n'est jamais touchée ; 0 ou 2 chansons ⇒ ignorée et signalée ; la liste **exacte** des champs écrits ; un champ déjà rempli n'est pas écrasé ; **la chaîne vide compte comme un trou** ; les JSON sont clonés (muter la Song après coup ne doit pas changer ce qui a été écrit) ; **`sourceCatalogSyncedAt` est bien re-posé après l'écriture** ; dry-run n'écrit rien ; second passage ne comble rien.
  - [x] **Vérifier les gardes par mutation**, en visant la fonction **par sa ligne** — l'erreur de la review 23.3 était de muter la première occurrence du motif dans le fichier, qui appartenait à une autre phase. Inclure une **mutation neutre** en témoin.
  - [x] Baseline backend à **mesurer** avant de commencer (483 au dernier relevé — le vérifier, pas le recopier).
- [x] **Task 8 — Validation** (AC: 10)
  - [x] `cd backend && npm test` + `npm run lint`. `git diff --stat` : script + test uniquement.
  - [x] **Exécuter réellement le dry-run** sur la copie de prod restaurée. Environnement : `DB_ENABLE_SSL= NODE_ENV=test` (⚠️ `NODE_ENV=development` ne se connecte pas, SSL en dur).
  - [x] Comparer aux chiffres de cadrage : **75 fiches**, genre **75**, liens **72**, BPM **61**, tonalité **49**. Un écart doit être **expliqué**.
  - [x] Vérifier **en base** qu'aucune chanson n'est en drift après l'exécution (`count = 0`), et **au navigateur** qu'aucun bandeau « nouvelle version » n'apparaît.

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

claude-opus-5[1m] (dev-story)

### Debug Log References

**Baseline backend mesurée** : 483 (le chiffre annoncé, vérifié). Après : **508** (+25).

**Colonnes vérifiées avant d'écrire le SQL**, via `information_schema` : les 10 champs portent le **même nom sur `Songs` et `CatalogSongs`**, donc une seule table de correspondance sert les deux côtés. Une erreur de nom ne se serait vue qu'à l'exécution.

**Bornes de normalisation relevées dans le code**, pas devinées : BPM `1..1000`, diapason `380..500` — identiques dans `songcontroller` et `catalogcontroller`.

**Exécution réelle sur la copie de prod** (73 fiches enrichies) :

```
  fiches brouillon: 75
  enrichies       : 73
  source SANS DONNÉE: 2      • Tool / Fear Inoculum   • Wye Oak / Civilian
  ce qui remonte : streamingLinks 72 · genre 69 · album 61 · bpm 61 · key 49
                   timeSignature 34 · mode 29 · durationSeconds 26 · language 9
```

**Le point critique, vérifié en base avant et après** : `0` chanson en drift **avant**, `0` **après** avoir modifié 73 fiches. La re-synchronisation fait son travail — sans elle, 73 personnes auraient vu « mise à jour disponible ». Compteurs `88|133|94|1` inchangés. Idempotence : second passage `enrichies : 0`.

**Les 7 gardes sont vérifiés par mutation**, en visant par motif unique et avec un **témoin neutre** resté vert. Une mutation (le clonage profond) n'a pas pu s'appliquer au premier essai — motif non trouvé — donc son résultat ne prouvait rien ; refaite par index de ligne, elle tue bien 1 test. C'est exactement le piège de la review 23.3, cette fois détecté par le garde d'unicité du script de mutation.

### Completion Notes List

- **Deux écarts avec les chiffres de cadrage, expliqués et non absorbés.** (a) Genre **69** et non 75 : six chansons portent `genre = []`, un tableau **vide**. Ma mesure de cadrage utilisait `IS NOT NULL`, qui compte `[]` comme rempli. Le code traite `[]` comme un trou sans rien à donner — c'est le piège de l'AC4 dans sa version JSON, et il s'est déclenché tout seul. (b) `album` remonte sur **61** fiches alors que je ne l'avais pas mesuré au cadrage : gain non anticipé.
- **Le premier run réel a montré un défaut de mon propre rapport, corrigé.** Deux fiches **neuves** étaient étiquetées « déjà complètes » alors que c'est leur **chanson source** qui n'avait rien à donner. Deux causes très différentes partageaient un libellé qui disait « c'est fait ».
- **Puis la correction en a créé un autre, corrigé aussi.** Le second passage annonçait « source SANS DONNÉE : 74 » juste après en avoir enrichi 73 — vrai au sens strict, illisible en pratique. Séparé en deux : `rien à combler` (état normal, compté) et `source SANS DONNÉE` (fiche qui restera une coquille, **nommée**). Même famille de défaut que la garde « alias morts » de 23.3 : un garde qui crie sur le cas normal est un garde qu'on désactive.
- **`pitchStandard` vaut 440 par défaut des deux côtés** (Task 3 demandait de trancher explicitement). Il **reste** dans la liste des champs — la règle « combler un trou » doit rester uniforme, et un `null` explicite est un vrai trou. En revanche il est **exclu du signal « fiche vide »** : le juger dessus rendait ce seau silencieux pour **toutes** les fiches. Mesuré : le seau ne se déclenchait plus du tout avant cette correction.
- **Une fiche sans trou n'est pas mise à jour du tout.** Un `UPDATE` vide bougerait quand même `updatedAt` et allumerait la drift pour rien — c'est ce qui fait qu'un second passage est un vrai non-événement, pas juste un « 0 écrit ».
- **Les valeurs refusées par la normalisation sont écartées ET signalées**, jamais insérées : les normalisateurs rejettent vers `null`, donc écrire leur retour comblerait un trou avec du vide en le comptant comme un succès.
- **Non couvert par les tests unitaires, et assumé** : que le SQL coïncide avec les colonnes réelles. C'est du Postgres — vérifié par `information_schema` avant écriture, puis par l'exécution réelle sur 75 fiches.
- **Contrôle navigateur fait** (northwood s'est reconnecté). Côté utilisateur : `Vulfpeck / Dean Town` n'affiche **toujours aucune provenance** après enrichissement — la fiche est remplie mais reste brouillon. Côté curateur, « Manage the Catalog » montre **125 entrées** dont les brouillons portent maintenant tonalité, mode et métrique : `AC/DC / Back in Black` en **A · Major · 4/4**, `Alain Souchon / Foule sentimentale` en **E · Minor · 4/4**.
- **Observation faite à l'écran, hors périmètre** : plusieurs entrées **déjà publiées** (`AC/DC / Thunderstuck`, `Black Sabbath / Iron Man`) sont **plus pauvres** que les brouillons qu'on vient d'enrichir — colonnes tonalité/mode/métrique vides. Elles ne sont rattachées à aucune chanson de la base, donc cette phase ne peut rien pour elles. Elles relèvent de la curation manuelle.

### File List

- `backend/scripts/seed-catalog.js` — MODIFIÉ (phase enrich : SQL, calcul des trous, écriture + re-synchronisation, rapport)
- `backend/__tests__/seedCatalog.test.js` — MODIFIÉ (+25 tests)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — MODIFIÉ (suivi)

Aucun modèle, migration, contrôleur, route ni front (AC10, vérifié par `git diff --name-only`).

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-08-10 | 0.1 | Story créée (create-story), née de la répétition de 23.4 : l'export de départ n'avait que `user,email,artist,title`, mais le dump prod restauré en local contient tout. Quatrième phase qui remonte les valeurs le long du lien de rattachement, mesuré **1:1** sur les 75 fiches brouillon, sans aucun conflit possible (88 chansons, **zéro** possédée par plus d'un utilisateur). Récupérable : genre 75/75, liens 72/75, BPM 61/75, tonalité 49/75. Cœur de la story posé en AC6 : re-synchroniser `source_catalog_synced_at` après l'écriture, faute de quoi l'enrichissement allume « mise à jour disponible » chez 75 personnes. Conséquence notée mais hors périmètre : une fiche remplie depuis sa chanson d'origine rend le Refresh inoffensif, ce qui **rouvre** la décision brouillon/publication. | northwood |
| 2026-08-10 | 0.2 | Phase enrich implémentée et exécutée sur la copie de prod : **73 fiches enrichies** sur 75, drift **0 avant et après**, compteurs inchangés, idempotent. Backend 483 → 508. 7 gardes vérifiés par mutation, témoin neutre inclus. Deux écarts de cadrage expliqués (genre 69 et non 75 : six `genre = []` que `IS NOT NULL` comptait comme remplis ; `album` en bonus sur 61 fiches). Deux défauts de rapport découverts **par l'exécution réelle** et corrigés : « déjà complètes » confondait fiche pleine et source vide, puis la correction faisait crier « source SANS DONNÉE : 74 » sur un re-run réussi. |northwood |
