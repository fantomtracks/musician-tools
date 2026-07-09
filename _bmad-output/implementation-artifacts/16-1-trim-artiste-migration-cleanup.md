---
baseline_commit: 620f21c
arch_decision: "Trimmer les 3 champs texte libre (`title`/`artist`/`album`) **côté serveur** dans `songcontroller` (create + update) via un helper `normalizeText` calqué sur `normalizeLanguage`/`normalizeCapo` déjà présents — `undefined` = champ absent (laissé intact à l'update), whitespace-only collapse en `null` (jamais un distinct « vide »), sinon `trim`. `title` reste **requis** : le trim passe AVANT le `if (!title)` du create (titre tout-espaces → 400) ; à l'update la sémantique `title || song.title` est préservée (titre absent/vide garde l'existant). Nettoyage des données déjà en prod par une migration **one-off idempotente** (`seq.query('UPDATE \"Songs\" SET … WHERE … <> trim(…)')`, `down()` no-op — même pattern que `20260623000100-backfill-users-beta`), avec `NULLIF(trim(x),'')` + `IS DISTINCT FROM` pour artist/album (collapse whitespace-only → NULL, cohérent avec le contrôleur) et `trim` simple pour `title` (colonne NOT NULL). Pas de merge FK : `artist`/`album`/`title` sont des strings libres par chanson — trimmer suffit à collapser les doublons dans les listes de distincts (suggestions/filtres). Story **back-only** : le front dérive ses distincts des valeurs stockées, aucune modif front requise."
---

# Story 16.1: Trim artiste/album/titre + migration de nettoyage des doublons

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a musicien qui saisit ses chansons,
I want que les espaces parasites en début/fin de nom d'artiste (ou album/titre) soient ignorés,
so that « michael jackson » et « michael jackson　» ne créent plus deux artistes distincts dans mes suggestions et mes filtres.

## Contexte & pourquoi

Première story de l'**Epic 16 (fix prod doublons artiste + confort tunings)**. Issue de la revue `deferred-work.md § À brainstormer` — **VRAI BUG prod** signalé par northwood le 2026-07-05 (« michael jackson » vs « michael jackson » avec espace final = deux artistes distincts). **Back pur, indépendante de 16.2.** Aucun FR/NFR du PRD (hygiène de données + confort). Baseline : `main` (620f21c) → branche `feat/epic-16-…`.

**Le trou (vérifié dans le code).** `title`, `artist`, `album` sont persistés **verbatim** depuis `req.body`, contrairement à `language` (helper `normalizeLanguage`) et `instrumentType` (trim dans `markSongPlayed`) :

- **`createSong`** (`songcontroller.js:110-147`) — destructure `title, …, artist, album, …` (l.110) et les passe **bruts** à `Song.create` : `title` (l.124), `artist` (l.134), `album` (l.135). Seuls `capo`/`durationSeconds`/`language` passent par un normaliseur.
- **`updateSong`** (`songcontroller.js:171-201`) — `title: title || song.title` (l.180), `artist: artist !== undefined ? artist : song.artist` (l.187), `album: … : song.album` (l.188). Bruts également.

Un espace en fin de saisie suffit à créer une valeur **distincte** en base → 2 « artistes » dans la liste des distincts qui alimente les suggestions et les filtres de la page Songs. `artist`/`album`/`title` étant des **strings libres par chanson** (pas de FK, pas de table d'entités), **trimmer suffit** à collapser — aucun merge d'entités requis.

**Insight de cadrage.** Le codebase a déjà l'idiome exact à copier : `normalizeLanguage` (`songcontroller.js:30-57`) et `normalizeCapo` (l.22-28) suivent le contrat `undefined → undefined` (champ absent, laissé intact à l'update) · `null`/vide `→ null` · sinon valeur normalisée. On ajoute un `normalizeText` du même moule et on l'applique à `title`/`artist`/`album`, au **create** et à l'**update**.

## ⚠️ Invariants à respecter

- **`title` reste requis.** Le trim doit passer **avant** le check `if (!title)` du create → un titre tout-espaces (`"   "`) devient `null` et retourne **400** (aujourd'hui il passe le check car la string est truthy, puis est stocké tel quel). À l'**update**, préserver la sémantique actuelle « titre absent/vide → garde l'existant » (pas de 400 à l'update).
- **`title` est NOT NULL** (`models/song.js:21-24`) — ne jamais lui assigner `null` : au create c'est un 400, à l'update on garde l'existant. La **migration** ne peut pas mettre `title` à NULL (colonne NOT NULL) → `trim` simple sur title, `NULLIF(trim(),'')` **uniquement** sur artist/album (nullable).
- **whitespace-only → `null`** pour artist/album (au contrôleur ET à la migration) : sinon on troque un doublon (`"x "` vs `"x"`) contre un autre (`""` vs `NULL`) dans la liste des distincts. Cohérence contrôleur/migration.
- **Pattern contrôleur inchangé** (story 7.5) : `req.session.user` → 401 ; lookup scopé `findOne({ where: { uid, userUid } })` → 404 ; garde `req.body || {}` ; garde `isUuid` sur update. On ne touche QUE la normalisation des 3 champs texte.
- **Toute migration part en prod** (pas de staging) : idempotente + **testée en local** (`make migrate`, idéalement up → (down no-op) → up) avant tout merge.

## Décision d'architecture (déjà tranchée — à implémenter telle quelle)

### 1) Helper `normalizeText` (nouveau, à côté de `normalizeLanguage`)

```js
// Trim a free-text field before persisting (title/artist/album). undefined =
// field absent from the payload → leave it untouched on update. Whitespace-only
// collapses to null so it never becomes a distinct "empty" value in the
// suggestion/filter lists. Mirrors normalizeLanguage's undefined/null contract.
const normalizeText = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
};
```

### 2) `createSong`

- `const normalizedTitle = normalizeText(title);` **avant** le check requis, puis `if (!normalizedTitle) return next(createError(400, 'Title is required'));` (couvre titre absent, vide, ou tout-espaces).
- `const normalizedArtist = normalizeText(artist);` / `const normalizedAlbum = normalizeText(album);`.
- Dans `Song.create({ … })` : `title: normalizedTitle`, `artist: normalizedArtist !== undefined ? normalizedArtist : null`, `album: normalizedAlbum !== undefined ? normalizedAlbum : null` (miroir exact de la ligne `language:` l.136).

### 3) `updateSong`

- `const normalizedTitle = normalizeText(title);` / `normalizedArtist` / `normalizedAlbum`.
- `title: normalizedTitle || song.title` (avec `const normalizedTitle = normalizeText(title)`) — normalizeText renvoie `undefined` (absent) / `null` (tout-espaces) / string trimmée ; `||` fait retomber `undefined` **et** `null` sur `song.title`, et ne garde que la string trimmée non vide. Reproduit exactement l'ancienne sémantique `title || song.title` en la faisant porter sur la valeur **trimmée**. Invariant : titre tout-espaces à l'update NE remplace PAS l'existant et ne 400 pas.
- `artist: normalizedArtist !== undefined ? normalizedArtist : song.artist` (miroir de `language:` l.189) — absent → garde ; explicit vide/spaces → `null` ; sinon trimmé. Idem `album`.

### 4) Migration `backend/migrations/<timestamp>-trim-song-text-fields.js`

`up` — trois `seq.query` idempotents (le `WHERE` rend le 2e passage no-op) ; `down` no-op (data backfill, rien de structurel) :

```js
'use strict';
// Epic 16 story 16.1: collapse duplicate artists/albums/titles created by
// untrimmed input (e.g. "michael jackson" vs "michael jackson "). One-off,
// idempotent (the WHERE re-checks trim => a second run is a no-op), replayable.
module.exports = {
  async up(queryInterface) {
    const seq = queryInterface.sequelize;
    // artist/album are nullable → collapse whitespace-only to NULL to match the
    // controller (normalizeText). IS DISTINCT FROM handles the NULL result.
    await seq.query(`UPDATE "Songs" SET artist = NULLIF(trim(artist), '') WHERE artist IS NOT NULL AND artist IS DISTINCT FROM NULLIF(trim(artist), '');`);
    await seq.query(`UPDATE "Songs" SET album  = NULLIF(trim(album),  '') WHERE album  IS NOT NULL AND album  IS DISTINCT FROM NULLIF(trim(album),  '');`);
    // title is NOT NULL → plain trim (never null it).
    await seq.query(`UPDATE "Songs" SET title = trim(title) WHERE title IS NOT NULL AND title <> trim(title);`);
  },
  async down() {
    // No-op: data backfill, nothing structural to reverse.
  },
};
```

- Colonnes : `title`/`artist`/`album` n'ont **pas** de `field:` custom dans `models/song.js` → colonnes DB `title`/`artist`/`album` (pas de snake_case) ; SQL ci-dessus correct tel quel. Table = `"Songs"`.
- Fichier nommé avec un timestamp **postérieur** à `20260628000200` (dernière migration). Enregistré via `.sequelizerc` racine (rien à câbler).

**Hors périmètre (à NE PAS toucher) :**
- Le **front** (`SongForm.tsx`, `Songs.tsx`, listes de distincts) : les distincts sont dérivés des valeurs **stockées** → une fois la saisie trimmée + les données nettoyées, ils collapsent sans modif front. Un éventuel trim client est redondant (le serveur est la source de vérité) — **pas dans cette story**.
- `markSongPlayed` (`instrumentType` déjà trimmé l.284), `normalizeLanguage`/`normalizeCapo`/`normalizeDurationSeconds` (inchangés), tout autre champ de `Song`.
- Le champ `genre` (JSONB array, comme `language`) — pas signalé, hors scope ; ne pas élargir.

## Acceptance Criteria

### Saisie (contrôleur — create + update)

1. **`createSong` trim artist/album/title** — Given un create avec `artist: '  michael jackson  '` (idem album/title avec espaces), When le contrôleur s'exécute, Then `Song.create` est appelé avec les valeurs **trimmées** (`'michael jackson'`), pas les valeurs brutes.
2. **`createSong` whitespace-only artist/album → null** — Given `artist: '   '` (ou `''`), Then `Song.create` reçoit `artist: null` (pas `''`, pas d'espaces).
3. **`createSong` titre tout-espaces → 400** — Given `title: '   '` (ou absent/`null`), Then le contrôleur renvoie **400 « Title is required »** et `Song.create` n'est **pas** appelé.
4. **`updateSong` trim artist/album/title** — Given un update avec `artist: '  bowie  '`, Then `song.update` reçoit `artist: 'bowie'`.
5. **`updateSong` champ absent laissé intact** — Given un update **sans** `artist` dans le body (`undefined`), Then `song.update` conserve `song.artist` (comportement actuel préservé). Idem album/title.
6. **`updateSong` titre tout-espaces ne remplace pas l'existant** — Given un update avec `title: '   '`, Then `song.update` garde `song.title` (aucun 400, aucun remplacement par du vide), cohérent avec la sémantique `title || song.title`.

### Données existantes (migration)

7. **Migration idempotente de nettoyage** — Given des lignes `Songs` avec artist/album/title non trimmés (ou artist/album whitespace-only), When la migration s'exécute, Then chaque valeur est trimmée (artist/album whitespace-only → `NULL`, title trimmé) ; un **2e passage est un no-op** (le `WHERE … <> trim(…)` / `IS DISTINCT FROM` ne re-matche plus) ; `down()` est un no-op assumé. Testée en local (`make migrate`) avant merge.

### Tests & qualité

8. **Tests contrôleur** — dans `backend/__tests__/songcontroller.test.js` (modèles mockés, patron existant `Song.create.mock.calls[0][0]`) : un test create-trim (AC1), un create-vide→null (AC2), un create-titre-espaces→400 (AC3), un update-trim + update-champ-absent-intact (AC4/AC5). Réutiliser `mockRes()`/`mockNext()`/`ownedSong()`.
9. **Suite back verte** — `cd backend && npm test` + `npm run lint` clean ; les tests existants de `createSong`/`updateSong` (timeSignature, durationSeconds, req.body guard, uid guard) restent **verts**. Front non modifié → front vert par construction (mais le hook pre-commit lance les deux suites : commit vert obligatoire).

## Tasks / Subtasks

- [x] **T1 — Helper `normalizeText`** (AC: 1, 2, 4)
  - [x] `songcontroller.js` : ajouté `normalizeText` à côté de `normalizeLanguage` (contrat undefined/null, whitespace-only → null). Commentaire en anglais.
- [x] **T2 — `createSong` : trim + titre requis** (AC: 1, 2, 3)
  - [x] `normalizedTitle` calculé **avant** le check → `if (!normalizedTitle) 400`. `title/artist/album` normalisés passés à `Song.create` (artist/album en miroir de la ligne `language:`). 401 / `req.body || {}` / autres champs préservés.
- [x] **T3 — `updateSong` : trim + sémantique préservée** (AC: 4, 5, 6)
  - [x] `normalizeText` appliqué à `title`/`artist`/`album` : `title: normalizedTitle || song.title` (absent/vide → existant, jamais de null) ; `artist`/`album` `!== undefined ? … : song.xxx` (absent → existant, vide explicite → null). Lookup scopé / `isUuid` / autres champs intacts.
- [x] **T4 — Migration de nettoyage** (AC: 7)
  - [x] Créé `backend/migrations/20260709000000-trim-song-text-fields.js` (up = 3 `seq.query` idempotents, down = no-op). Timestamp > `20260628000200`.
  - [x] Testé en local (docker dev DB) : lignes semées avec espaces → `db:migrate` → title/album trimmés, artist « michael jackson »/« michael jackson » collapsés (**2 → 1 distinct**), blancs → NULL ; re-run des 3 UPDATE → **0/0/0** ligne affectée (idempotent). Lignes de test nettoyées.
- [x] **T5 — Tests contrôleur** (AC: 8)
  - [x] 4 tests ajoutés dans `songcontroller.test.js` (bloc `16.1 — trim …`) : create-trim, create-vide→null, create-titre-espaces→400, update-trim/absent-intact/titre-espaces-garde-existant.
- [x] **T6 — Validation** (AC: 9)
  - [x] `cd backend && npm test` → **19 suites / 259 tests** verts (était 255 → +4) ; `npm run lint` → exit 0. Tests song existants (timeSignature/durationSeconds/req.body guard/uid guard) toujours verts. Front `npm test` → **36 suites / 327 tests** verts (non modifié).

### Review Findings

_Code review adversariale 3 couches (Blind Hunter · Edge Case Hunter · Acceptance Auditor) — 2026-07-09. Auditor : 9/9 ACs + 5/5 invariants SATISFIED, aucun scope creep (seuls title/artist/album touchés, pattern 7.5 intact). 1 décision, 2 patches, 1 defer, 1 écarté. **Décision + 2 patches appliqués ; 1 deferred ; 0 résidu ouvert.**_

- [x] **[Review][Patch, ex-Decision] Divergence `String.trim()` (JS) vs `trim()` (SQL) sur les espaces non-ASCII** [backend/controllers/songcontroller.js + backend/migrations/20260709000000-trim-song-text-fields.js] — **Corroboré Blind (MED) + Edge (HIGH).** JS `.trim()` retire tout le jeu Unicode (NBSP U+00A0, `\t`, `\n`, `\r`, …) ; PostgreSQL `trim(x)` ne retire que l'espace ASCII U+0020 → la migration sautait les lignes paddées NBSP/tab et divergeait du contrôleur (doublon résiduel dans la liste de suggestions `Songs.tsx:978-989`). **Décision northwood : aligner (option 1). Corrigé 2026-07-09** : migration passée de `trim(x)` à `btrim(x, E' \t\n\r ')` (space/tab/LF/CR/NBSP) sur les 3 UPDATE (`NULLIF` conservé) ; `normalizeText` (JS) reste un superset. **Re-testé en local** : lignes paddées **tab** + **NBSP** collapsées (3 → 1 artiste distinct « nina simone »), re-migration propre, idempotence conservée.
- [x] **[Review][Patch] `normalizeText` coerce les entrées non-string via `String(value)`** [backend/controllers/songcontroller.js] — **Blind (LOW) + Edge (MED).** `title: 0` → nouveau `String(0).trim()='0'` truthy → chanson créée avec titre `'0'` (avant : 400) ; `artist: {}` → `'[object Object]'`. **Corrigé 2026-07-09** : garde `if (typeof value !== 'string') return value;` en tête de `normalizeText` → restaure l'ancien comportement (0/false → 400 au create, non-string laissé tel quel, pas de coercition). Test ajouté (`createSong` non-string title `0` → 400).
- [x] **[Review][Patch] Couverture de tests AC4/AC5 partielle sur l'update** [backend/__tests__/songcontroller.test.js] — **Auditor.** **Corrigé 2026-07-09** : test `updateSong trims album and title` ajouté (album `'  Off the Wall  '` → `'Off the Wall'`, title `'  Real Title  '` → `'Real Title'`), verrouille le trim d'album/title à l'update.
- [x] **[Review][Defer] Titre legacy tout-espaces → `''` par la migration** [backend/migrations/20260709000000-trim-song-text-fields.js] — deferred, pre-existing. `trim('   ')='' ` : une ligne pré-existante au titre tout-espaces devient `title=''` (valide sous NOT NULL, mais que `createSong` refuserait en 400). Donnée déjà invalide avant la migration (l'ancien `if(!title)` acceptait un titre truthy tout-espaces) ; la story ne promettait que le dédoublonnage d'espaces, pas la réparation des titres vides. Hors périmètre — voir deferred-work.

## Dev Notes

### État actuel (lu — à préserver sauf la normalisation ciblée)

**`createSong`** (`songcontroller.js:103-152`)
- l.110 : destructuring incluant `title, …, artist, album, …`.
- l.112-114 : `if (!title) return next(createError(400, 'Title is required'));` → **déplacer après** le calcul de `normalizedTitle` et tester `!normalizedTitle`.
- l.122-145 : `Song.create({ … title, … artist, album, language: normalizedLanguage !== undefined ? normalizedLanguage : null, … })` → title/artist/album à normaliser ; `artist`/`album` en miroir de la ligne `language:`.
- Garde `req.body || {}` (l.110) et le 401 (l.105-108) : **préserver** (tests 7.5 les asservissent).

**`updateSong`** (`songcontroller.js:155-208`)
- Lookup scopé `findOne({ where: { uid, userUid } })` + `isUuid` guard (l.162-169) : **préserver**.
- l.180 `title: title || song.title` · l.187-188 `artist`/`album` `!== undefined ? … : song.xxx` → normaliser en gardant la sémantique (voir Décision §3).
- Tous les autres champs (bpm, key, capo, notes, instrument, genre, pitchStandard, instrumentTuning, technique, links, difficulty, lastPlayed, myInstrumentUid, streamingLinks, timeSignature, mode) : **inchangés**.

**Modèle** (`models/song.js`) : `title` `allowNull:false` (l.21-24) ; `album`/`artist` `STRING allowNull:true`. Pas de `field:` custom sur ces 3 → colonnes DB homonymes (`title`/`artist`/`album`), pas de snake_case. `Songs` = table.

### Migration — pattern maison

- Copier le style de `20260623000100-backfill-users-beta.js` : `queryInterface.sequelize.query('UPDATE "…" SET … WHERE …')`, idempotent par le `WHERE`, `down()` no-op commenté « data backfill, nothing structural to reverse ».
- `NULLIF(trim(x), '')` collapse whitespace-only → NULL ; `IS DISTINCT FROM` gère la comparaison avec le résultat NULL (un `<>` classique laisserait passer/raterait les lignes NULL). Pour `title` (NOT NULL) : `trim(title)` + `title <> trim(title)` (pas de NULLIF — ne jamais nuller un NOT NULL).
- ⚠️ **Ordre de déploiement prod** (project-context) : `release_command` lance les migrations PUIS `sequelize.sync({alter:false})` au boot — cette migration est du pur data-UPDATE, aucun risque de collision avec le sync.

### Conventions backend (project-context.md)

- **CommonJS** (`require`/`module.exports`) — jamais d'ESM, pas de `.ts` back.
- Contrôleurs : `try/catch → next(error)` ; erreurs via `http-errors` (`createError`). Ne pas changer les signatures `(req, res, next)`.
- **Migrations idempotentes obligatoires**, testées en local avant merge ; `.sequelizerc` racine (créer le fichier suffit).
- **Deux suites Jest séparées** : ici **backend** (`cd backend && npm test`, env node, modèles mockés via `jest.mock('../models')`). Le hook husky pre-commit lance **les deux** suites — jamais `--no-verify`.
- Tout en **anglais** (commentaires inclus). Réutiliser l'idiome `normalizeXxx` existant (ne pas réinventer une lib de validation).

### Previous story intelligence (Epic 15, `done`)

- Leçon transverse récente (rétro 15) : **énumérer toutes les surfaces** d'un changement. Ici → traiter les **deux** points d'écriture (`createSong` ET `updateSong`) et les **trois** champs (title/artist/album), pas seulement artist ; et **ne pas** élargir à `genre`/`language` (déjà gérés / hors signalement).
- Discipline dette (rétro Epic 8/10) : trancher net (empty→null cohérent contrôleur+migration) plutôt que laisser un demi-fix qui déplace le doublon.

### Project Structure Notes

- 1 fichier modifié (`songcontroller.js`) + 1 migration nouvelle + 1 fichier de tests étendu. **Aucune** dépendance npm, **aucun** changement de route/middleware/modèle, **aucune** modif front.
- 16.1 livrée → enchaîner 16.2 (tuning basse, front pur) sur la même branche `feat/epic-16-…`, puis QA + merge main (rétro Epic 16 `optional`).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 16.1] — ACs BDD, deux volets saisie/données, zéro merge FK.
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 16] — cadrage epic, exclusion auto-création SongForm.
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] (§ À brainstormer) — signalement bug prod northwood 2026-07-05 + volets fix.
- [Source: backend/controllers/songcontroller.js:30-57] — `normalizeLanguage` (idiome à copier pour `normalizeText`).
- [Source: backend/controllers/songcontroller.js:103-152] — `createSong` (title requis l.112, artist/album l.134-135).
- [Source: backend/controllers/songcontroller.js:155-208] — `updateSong` (title/artist/album l.180/187-188).
- [Source: backend/models/song.js:21-24] — `title` NOT NULL (la migration ne peut pas le nuller).
- [Source: backend/migrations/20260623000100-backfill-users-beta.js] — pattern migration data idempotente + `down()` no-op.
- [Source: backend/__tests__/songcontroller.test.js:1-108] — mocks (`Song.create`/`findOne`), `mockRes`/`mockNext`/`ownedSong`, patron `.mock.calls[0][0]`.
- [Source: _bmad-output/project-context.md] — conventions back CommonJS / migrations idempotentes / deux suites Jest / anglais.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m]

### Debug Log References

- `cd backend && npm test` → **19 suites / 259 tests** verts (255 → +4 tests 16.1). Les `console.log` « Email delivery failed » / « store down » sont attendus (tests best-effort d'autres suites).
- `cd backend && npm run lint` → exit 0.
- `npm test` (front) → **36 suites / 327 tests** verts (aucun fichier front touché).
- Migration en local (docker dev DB, `docker compose exec backend npx sequelize-cli db:migrate`) : `20260709000000-trim-song-text-fields` migrated (0.011s). Preuve : 3 lignes semées (« michael jackson » + « michael jackson » avec espace, blancs, title/album non trimmés) → après migration, **1 seul** artiste « michael » distinct (était 2), title/album trimmés, artist/album blancs → NULL. Idempotence : re-run des 3 UPDATE → **0/0/0** ligne affectée. Lignes de test supprimées.

### Completion Notes List

- **Helper `normalizeText`** (`songcontroller.js`) calqué sur `normalizeLanguage` : `undefined` → undefined (champ absent, intact à l'update) · `null`/whitespace-only → `null` · sinon `trim`. Appliqué à `title`/`artist`/`album` au create ET à l'update.
- **`createSong`** : trim de `title` **avant** le check requis → un titre tout-espaces renvoie 400 (avant : stocké tel quel, la colonne étant NOT NULL). `artist`/`album` passés en miroir exact de la ligne `language:` (`!== undefined ? … : null`).
- **`updateSong`** : `title: normalizedTitle || song.title` reproduit l'ancienne sémantique `title || song.title` sur la valeur **trimmée** (titre absent ou tout-espaces → garde l'existant, jamais de blanc, jamais de 400). `artist`/`album` : absent → existant, vide explicite → `null`, sinon trimmé. Lookup scopé 7.5 / garde `isUuid` / tous les autres champs **inchangés**.
- **Migration** `20260709000000-trim-song-text-fields.js` : pattern data idempotent (`seq.query('UPDATE "Songs" …')`, `down()` no-op) copié sur `20260623000100-backfill-users-beta`. `NULLIF(trim(x),'') … IS DISTINCT FROM` pour artist/album (nullable, collapse blanc → NULL cohérent avec le contrôleur) ; `trim` simple pour `title` (colonne NOT NULL, jamais nullée).
- **Zéro modif front** : les listes de distincts (suggestions/filtres) dérivent des valeurs stockées → collapsent une fois la saisie trimmée + les données nettoyées. `genre`/`language` non touchés (hors signalement). Aucune dépendance npm, aucun changement de route/middleware/modèle.

### File List

**Modifié — backend**
- `backend/controllers/songcontroller.js` — helper `normalizeText` + trim de `title`/`artist`/`album` dans `createSong` (title requis après trim) et `updateSong`.

**Nouveau — backend**
- `backend/migrations/20260709000000-trim-song-text-fields.js` — migration one-off idempotente de nettoyage des doublons (trim + blanc→NULL sur artist/album, trim sur title).

**Modifié — tests backend**
- `backend/__tests__/songcontroller.test.js` — bloc `16.1 — trim title/artist/album (dedup)` (4 tests create/update).

## Change Log

| Date | Version | Description |
|------|---------|-------------|
| 2026-07-09 | 0.1 | Création story 16.1 — trim title/artist/album (create+update, helper `normalizeText`) + migration one-off idempotente de nettoyage des doublons. Back-only. Status → ready-for-dev. |
| 2026-07-09 | 0.2 | Implémentation : helper `normalizeText`, trim create+update (title requis après trim), migration `20260709000000` (NULLIF(trim)+IS DISTINCT FROM artist/album, trim title). Migration testée en local (collapse 2→1 michael, idempotence 0/0/0). Back 259✓, front 327✓, lint clean. Status → review. |
| 2026-07-09 | 1.0 | Code review 3 couches : 9/9 ACs + 5/5 invariants OK, 0 scope creep. 1 décision + 2 patches appliqués — P1 : migration `trim`→`btrim(x, E' \t\n\r ')` (aligne JS/SQL sur NBSP/tab, referme la divergence contrôleur/migration) ; P2 : garde non-string dans `normalizeText` (fin de la coercition `String()`) ; P3 : +2 assertions update album/title + test non-string. Migration re-testée local (collapse tab/NBSP 3→1). 1 report deferred (titre legacy tout-espaces → '', pré-existant). Back 261✓, lint clean. Status → done. |
