---
baseline_commit: 10b6e7f5afddc0d92c2c6f848285a7afdcd97957
---

<!-- Story créée 2026-07-15 via bmad-create-story ; Epic 19 (Catalog — Browse & Add) ; source epics.md § Epic 19 + architecture-catalog-2026-07-12.md -->

# Story 19.1: Fondation Catalog + le curateur gère les fiches (backend)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

En tant que **curateur** (`isCurator`),
je veux créer, éditer et supprimer des fiches Catalog via une API protégée,
afin que le Catalog dispose de contenu canonique unique, sans écrire de SQL.

## Contexte & pourquoi

Première story du **Catalog** — le pool **partagé** de fiches chansons pré-remplies dans lequel les utilisateurs pioment pour alimenter leur Songlist. Cette story pose **toute la fondation backend** dont dépendent les 3 stories suivantes de l'epic (19-2 admin front, 19-3 browse, 19-4 Add) et l'Epic 20 (Collections) :

- Le **modèle de données partagé** `CatalogSong` (première table sans `userUid` de l'app).
- Le **vecteur d'autorisation** `isCurator` + `requireCurator` (nouveau, à côté de l'ownership per-record).
- La **garde d'unicité canonique GLOBALE** (une entrée par titre+artiste, pour TOUS).

⚠️ **Rupture structurelle** (cf. architecture §3) : le Catalog introduit **2 exceptions ASSUMÉES** au réflexe app-wide « tout scopé `userUid` → 404 ». Elles sont **déjà inscrites dans `project-context.md`** — ne PAS les flagger en régression 7.5 :
1. **Lecture Catalog non scopée `userUid`** (arrive en 19-3, mais le contrôleur est nommé `catalogcontroller` ici).
2. **Écriture Catalog → 403 franc** (`requireCurator`), PAS 404 anti-oracle : la fiche est lisible par tout connecté, le seul secret est le privilège.

⚠️ **`main` = prod** : les migrations de cette story **partent en prod au merge** → idempotence obligatoire + test local (`make migrate`) avant de merger.

## Décisions verrouillées (architecture 2026-07-12 + PRD/addendum)

- **`CatalogSong` = sous-ensemble INTRINSÈQUE des colonnes de `Song`** (parité de noms/formes → l'Add en 19-4 est une copie 1:1). **Exclus** : `userUid` + tous les champs perso/instrument.
- **Index unique canonique GLOBAL** `(lower(title), COALESCE(lower(artist), ''))` — **même mécanique qu'Epic 17 mais SANS `user_uid`**. Créé par **migration** (fonctionnel), **absent du modèle** Sequelize (`sync()` ne le touche pas). Accents **GARDÉS distincts** (`lower` seul, PAS de `unaccent` — « Beyoncé » ≠ « Beyonce »).
- **`isCurator`** = attribut booléen sur `User` (pas de table de rôles). Posé à la main en base pour northwood (pas d'UI de gestion des rôles en v1).
- **Refus d'écriture = 403** (`You don't have curator access.`), jamais 404.
- **Édition IN-PLACE** : corriger une fiche = `UPDATE` sur la même ligne, **`uid` préservé** (jamais delete+recreate) → les `sourceCatalogUid` futurs ne pendront pas.
- **409 typé sur create ET rename** : `{ error: 'duplicate_catalog_entry', message, entry }` (miroir de `respondDuplicateSong` d'Epic 17, mais global).

## Acceptance Criteria

1. **Migrations idempotentes** : `CatalogSongs` (colonnes intrinsèques, `field:'snake_case'`, `timestamps`, PK `uid` UUID, **sans** `user_uid`) + index unique fonctionnel GLOBAL `catalog_songs_title_artist_ci` `(lower(title), COALESCE(lower(artist),''))` créé par migration (`CREATE UNIQUE INDEX IF NOT EXISTS`, absent du modèle) ; colonne `Users.is_curator` (BOOLEAN NOT NULL DEFAULT false). Chaque migration gardée (`showAllTables`/`describeTable`) et testée en local.
2. **Create** : un curateur `POST /api/catalog {title}` → **201** + fiche (entité brute). Sans titre (ou titre whitespace-only) → **400** « Title is required ».
3. **Autorisation** : `POST`/`PUT`/`DELETE /api/catalog*` par un **non-curateur** (ou anonyme) → **403** « You don't have curator access. » (via `requireCurator`) — **jamais** 404.
4. **Unicité canonique (create)** : créer une fiche dont `(lower(title), COALESCE(lower(artist),''))` existe déjà → **409** `{ error:'duplicate_catalog_entry', message, entry }` (l'`entry` existante est jointe best-effort).
5. **Unicité canonique (rename)** : éditer une fiche vers une clé canonique déjà prise par une AUTRE fiche → **409** (même shape). Éditer une fiche vers sa propre clé (aucune collision) → **200** + `uid` préservé (in-place).
6. **Delete** : un curateur `DELETE /api/catalog/:uid` d'une fiche existante → suppression + `{ message: '...' }` ; `uid` inconnu/invalide → **404**.
7. **Modèle honnête** : `CatalogSong` déclare ses colonnes mais **PAS** l'index fonctionnel (commentaire d'ancrage expliquant pourquoi, comme `song.js`). Contrôleur nommé `catalogcontroller.js` + commentaire d'ancrage au principe partagé §3.
8. **Tests backend** (modèles mockés `jest.mock('../models')`) : `requireCurator` (403 non-curateur / passe curateur), create 201/400, 409 create ET rename, delete 200/404.

## Tasks / Subtasks

### Task 1 — Migration : table `CatalogSongs` + index canonique global (AC 1)
- [x] Nouvelle migration `backend/migrations/20260715000000-create-catalog-songs.js`.
  - [x] `up` : garde `const tables = await queryInterface.showAllTables(); if (!tables.includes('CatalogSongs')) { createTable(...) }`.
  - [x] Colonnes : `uid` (UUID PK, defaultValue `Sequelize.UUIDV4`), `title` (STRING NOT NULL), `artist`, `album`, `key`, `bpm` (INTEGER), `mode`, `time_signature`, `duration_seconds` (INTEGER), `language` (JSONB), `genre` (JSONB), `streaming_links` (JSONB), `pitch_standard` (INTEGER, default 440), `created_at`, `updated_at` (DATE NOT NULL). **PAS de `user_uid` ni de colonne instrument/perso.**
  - [x] Index unique fonctionnel : `CREATE UNIQUE INDEX IF NOT EXISTS catalog_songs_title_artist_ci ON "CatalogSongs" (lower(title), COALESCE(lower(artist), ''));` (via `queryInterface.sequelize.query`). `lower`/`COALESCE` sont IMMUTABLE → pas d'extension, pas de privilège (cf. migration 17.1).
  - [x] `down` : `DROP INDEX IF EXISTS catalog_songs_title_artist_ci;` puis `dropTable('CatalogSongs')`.
- [x] Tester en local : `make migrate` (up + down + re-up pour prouver l'idempotence).

### Task 2 — Migration : `Users.is_curator` (AC 1)
- [x] Nouvelle migration `backend/migrations/20260715000100-add-is-curator-to-users.js`.
  - [x] `up` : `const desc = await queryInterface.describeTable('Users'); if (!desc.is_curator) { addColumn('Users','is_curator',{ type: BOOLEAN, allowNull:false, defaultValue:false }) }`.
  - [x] `down` : `removeColumn('Users','is_curator')` gardé par `describeTable`.

### Task 3 — Modèles Sequelize (AC 1, 7)
- [x] `backend/models/catalogsong.js` : `sequelize.define('CatalogSong', {...}, { tableName: 'CatalogSongs', timestamps: true })`. Colonnes camelCase JS + `field:'snake_case'` (miroir `song.js` : `timeSignature`→`time_signature`, `durationSeconds`→`duration_seconds`, `streamingLinks`→`streaming_links`, `pitchStandard`→`pitch_standard`). **Commentaire d'ancrage** : l'index unique fonctionnel est créé par migration, PAS déclaré ici (sync() ne doit ni le créer ni le dropper) — copier le commentaire de `song.js` (story 17.1) en retirant `user_uid`. Pas d'`associate` pour l'instant (Collections en 20-1).
- [x] `backend/models/user.js` : ajouter le champ `isCurator` (`type: BOOLEAN, allowNull:false, defaultValue:false, field:'is_curator'`). **Additif** : ne rien changer d'autre au modèle User.

### Task 4 — Middleware `requireCurator` (AC 3)
- [x] `backend/middleware/requirecurator.js` : après `authsess`, lire `req.session.user` (uid) → 401 si absent ; charger le `User` (scope incluant `isCurator`) ; si `user.isCurator !== true` → `next(createError(403, "You don't have curator access."))` ; sinon `next()`. **Commentaire d'ancrage** : 403 franc et non 404 anti-oracle (ressource lisible par tout connecté — cf. project-context.md « Catalog exceptions »). `module.exports`.

### Task 5 — Contrôleur `catalogcontroller.js` (AC 2, 4, 5, 6, 7)
- [x] `backend/controllers/catalogcontroller.js` (nouveau). **Commentaire d'en-tête d'ancrage** : « Catalog = donnée PARTAGÉE, lecture non scopée userUid (principe §3, cf. project-context.md). NE PAS rescoper. »
- [x] Helper `normalizeText` : répliquer le comportement de `songcontroller` (trim ; whitespace-only → null/undefined) — ne PAS importer/modifier `songcontroller` (additif strict).
- [x] Helper `respondDuplicateCatalogEntry(res, error, title, artist, excludeUid)` : si `error.name === 'SequelizeUniqueConstraintError'`, retrouver la fiche existante par clé canonique GLOBALE (`lower(title)`, `COALESCE(lower(artist),'')`, hors `excludeUid`) et répondre **409** `{ error:'duplicate_catalog_entry', message, entry }`. **Ne jamais throw** (échec de lookup → 409 avec `entry: null`). Miroir de `respondDuplicateSong` **sans** `userUid`.
- [x] `createCatalogEntry` : normaliser `title` (400 si vide) + champs intrinsèques ; `CatalogSong.create(...)` ; `catch` → `respondDuplicateCatalogEntry` sinon 500. 201 entité brute.
- [x] `updateCatalogEntry` : `findByPk(uid)` → 404 si null ; `UPDATE` in-place des champs fournis (uid préservé) ; `catch` → `respondDuplicateCatalogEntry(..., excludeUid=uid)` sinon 500. 200 entité.
- [x] `deleteCatalogEntry` : `findByPk(uid)` → 404 si null ; `destroy()` ; `{ message: 'Catalog entry deleted' }`.

### Task 6 — Routes + montage (AC 2, 3, 6)
- [x] `backend/routes/catalog.js` (nouveau) : `router.use(bodyParser.json())` ; **écritures** gardées `authsess, requireCurator` : `POST '/'` → create, `PUT '/:uid'` → update, `DELETE '/:uid'` → delete. (Les GET liste/détail arrivent en 19-3 — laisser un commentaire `// GET routes: story 19-3`.)
- [x] Monter le router sur **`/api/catalog`** dans le fichier d'app (chercher le pattern de montage des autres routers, ex. `app.use('/api/songs', songsRouter)`). Vérifier que la **CSRF app-wide** couvre bien ces mutations (comme `/api/songs`).

### Task 7 — Tests backend (AC 8)
- [x] `backend/__tests__/requirecurator.test.js` : 403 si `isCurator` absent/false, `next()` si true, 401 si pas de session.
- [x] `backend/__tests__/catalogcontroller.test.js` (`jest.mock('../models')`) : create 201, 400 titre vide, 409 create (collision), 409 rename (collision sur autre fiche), 200 rename sans collision (uid préservé), delete 200 + 404.

## Dev Notes

### Design retenu (calqué sur 17.1 / 10.1, GLOBAL au lieu de per-user)
La garde d'unicité **réutilise exactement la discipline d'Epic 17** (`17-1-unicite-chanson-serveur.md`) : index fonctionnel créé par migration, absent du modèle, `SequelizeUniqueConstraintError` (code PG `23505`) mappé en 409 typé côté contrôleur. **Seule différence** : la clé n'a **pas** de `user_uid` → surface de collision **globale** (la 1ʳᵉ fiche verrouille `(title, artist)` pour tous). C'est le **faux-ami** signalé dans l'addendum : même mécanique, portée radicalement différente. Choix v1 assumé (une entrée canonique, pas de variantes).

### Fichiers UPDATE — état actuel & ce qui change (à lire intégralement avant de coder)
- **`backend/models/user.js`** — ajouter UNIQUEMENT le champ `isCurator` (additif). Ne pas toucher au `defaultScope`/hooks password. Vérifier que `requireCurator` peut lire `isCurator` (si un scope exclut des colonnes, s'assurer que `isCurator` reste lisible — a priori oui, seul `password` est exclu).
- **`backend/models/song.js`** — NE PAS modifier (`sourceCatalogUid` arrive en 19-4). Le lire pour **copier la forme exacte** des colonnes intrinsèques + le commentaire « index fonctionnel non déclaré » (lignes ~15-25).
- **`backend/controllers/songcontroller.js`** — NE PAS modifier. Le lire pour **répliquer** `normalizeText` (lignes ~64-77) et le pattern `respondDuplicateSong` (lignes ~91-104) dans `catalogcontroller`.
- **Fichier d'app (montage routes)** — ajouter `app.use('/api/catalog', catalogRouter)` sans toucher aux montages existants.

### Risque principal = migrations en prod (`main` = prod)
Les 2 migrations partent en prod au merge (double filet `release-migrate` puis `sync({alter:false})`). **Idempotence non négociable** : garde `showAllTables` (table), `CREATE UNIQUE INDEX IF NOT EXISTS` (index), `describeTable` (colonne). Tester up→down→up en local. Contrairement à 17.1, **aucun merge de données existantes** (table neuve, colonne à défaut) → risque bien plus faible, mais la discipline reste la même.

### Les 2 exceptions à NE PAS « corriger » (déjà dans project-context.md)
- `requireCurator` renvoie **403**, pas 404. Un reviewer/`bmad-code-review` pourrait le prendre pour une régression 7.5 → le commentaire d'ancrage l'explique.
- Le `catalogcontroller` est nommé et commenté pour rendre la **lecture non-scopée** (19-3) visiblement intentionnelle. Ici (19-1, écritures seules) : pas encore de lecture, mais poser le nom + le commentaire d'en-tête dès maintenant.

### Conventions (cf. project-context.md)
- CommonJS backend (`require`/`module.exports`), pas de `.ts`. Contrôleurs minuscules collées (`catalogcontroller.js`), middleware à plat (`requirecurator.js`).
- Colonnes : camelCase JS + `field:'snake_case'` (pattern `Songs`). PK `uid` UUID v4, `timestamps:true`.
- Erreurs via `http-errors` (`createError(403, ...)`) → `next(error)`. Réponses = entité JSON brute (pas d'enveloppe) ; delete → `{ message }`.
- Tests backend : `backend/jest.config.js`, env node, `jest.mock('../models')`. Le hook pre-commit lance front+back — commit vert obligatoire, jamais `--no-verify`.
- UI/commentaires en **anglais**.

### Interim 19.1 → suite (à savoir)
- **19-2** (admin front) consommera `POST/PUT /api/catalog` + le 409 `duplicate_catalog_entry`.
- **19-3** (browse) AJOUTERA les GET (liste paginée à enveloppe + détail) dans `catalogcontroller`/`routes/catalog.js` — d'où le commentaire réservé.
- **19-4** (Add) ajoutera `Songs.sourceCatalogUid` + l'endpoint Add ; il réutilise `CatalogSong.findByPk`.
- **20-1** étendra `deleteCatalogEntry` pour nettoyer les jointures Collections (dépendance arrière, pas de changement ici).

### Project Structure Notes
- NEW : `backend/migrations/20260715000000-create-catalog-songs.js`, `20260715000100-add-is-curator-to-users.js`, `backend/models/catalogsong.js`, `backend/middleware/requirecurator.js`, `backend/controllers/catalogcontroller.js`, `backend/routes/catalog.js`, `backend/__tests__/catalogcontroller.test.js`, `backend/__tests__/requirecurator.test.js`.
- UPDATE : `backend/models/user.js` (+ `isCurator`), fichier d'app (montage `/api/catalog`).
- Les modèles sont auto-chargés par lecture du dossier `models/` — créer le fichier suffit.

### References
- [Source: architecture-catalog-2026-07-12.md#Data Architecture] — modèle `CatalogSong`, index canonique global, ordre de migration.
- [Source: architecture-catalog-2026-07-12.md#Authentication & Security] — `isCurator`/`requireCurator`/403, lecture non-scopée.
- [Source: architecture-catalog-2026-07-12.md#Implementation Patterns — Process Patterns ①②③] — normalisation canonique (accents gardés) vs folding recherche ; lecture non-scopée ancrée ; requireCurator.
- [Source: epics.md#Story 19.1] — user story + acceptance criteria complets.
- [Source: project-context.md#Catalog (données partagées) — 2 exceptions ASSUMÉES] — principe + exceptions.
- [Source: _bmad-output/implementation-artifacts/17-1-unicite-chanson-serveur.md] — discipline index fonctionnel + `respondDuplicateSong` (à calquer sans `user_uid`).
- [Source: backend/models/song.js] — forme des colonnes intrinsèques + commentaire index non déclaré.
- [Source: backend/controllers/songcontroller.js#respondDuplicateSong] — pattern 23505 → 409 à répliquer.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (bmad-dev-story)

### Debug Log References

- Suite backend complète : **280/280** (21 suites) — dont 15 nouveaux (catalogcontroller 11 + requirecurator 4). `cd backend && npx jest`.
- Lint backend : **clean** (`npm run lint`).
- Migrations validées sur la base de dev (Postgres 5433, `make migrate`) :
  - Schéma vérifié : `CatalogSongs` (timestamps camelCase, `streaming_links`/`time_signature`/`pitch_standard` snake_case, `title` NOT NULL), index unique GLOBAL `catalog_songs_title_artist_ci` sur `(lower(title), COALESCE(lower(artist),''))`, `Users.is_curator` (bool, défaut false).
  - **Idempotence** : re-migrate = no-op ; cycle down→up propre.
  - **Smoke 23505** : `Zombie/The Cranberries` OK puis `zombie/THE CRANBERRIES` → `duplicate key ... catalog_songs_title_artist_ci` (casse-insensible global). `Zombié` distinct (accents gardés). Rows de smoke nettoyées.

### Completion Notes List

- **Piège évité** : la migration initiale utilisait `created_at/updated_at` (snake_case) alors que `Songs` stocke les timestamps en **camelCase** (`createdAt/updatedAt`) avec `timestamps:true` sans `underscored`. Corrigé pour parité avec `Songs` (sinon `sync()`/queries en échec sur les timestamps).
- **`respondDuplicateCatalogEntry`** = miroir exact de `respondDuplicateSong` (Epic 17) mais **global** (pas de `userUid`) ; couvre create ET rename (lookup avec `excludeUid` sur l'update). `normalizeText` répliqué (additif strict, `songcontroller` non modifié).
- **CSRF** : les 3 routes mutantes héritent de la garde CSRF app-wide (`routes/index.js` `router.use(csrf)`) — aucune action requise (comme `/api/songs`).
- **Exceptions §3 ancrées** : commentaires dans `catalogcontroller`, `requirecurator`, `catalog.js` + migration `create-catalog-songs` ; déjà documentées dans `project-context.md`.
- **Réservé pour la suite** : GET liste/détail (19-3), `sourceCatalogUid` + Add (19-4), Collections + nettoyage jointure sur delete (20-1).

### File List

**NEW**
- `backend/migrations/20260715000000-create-catalog-songs.js`
- `backend/migrations/20260715000100-add-is-curator-to-users.js`
- `backend/models/catalogsong.js`
- `backend/middleware/requirecurator.js`
- `backend/controllers/catalogcontroller.js`
- `backend/routes/catalog.js`
- `backend/__tests__/catalogcontroller.test.js`
- `backend/__tests__/requirecurator.test.js`

**UPDATE**
- `backend/models/user.js` (+ champ `isCurator`, `field:'is_curator'`)
- `backend/routes/index.js` (montage `/catalog` + require)

## Change Log

| Date | Version | Description |
|------|---------|-------------|
| 2026-07-15 | 0.1 | Story créée (ready-for-dev) — fondation Catalog + curation fiches backend |
| 2026-07-15 | 0.2 | Implémentée : migrations (CatalogSong + index canonique global + Users.isCurator), requireCurator (403), catalogcontroller CRUD + 409 create/rename, routes montées. Back 280✓ lint✓ migrations validées (idempotence + smoke 23505). Status → review. |
| 2026-07-15 | 0.3 | Code review 3 couches → 3 patch appliqués (P1 entry-fallback 409 rename partiel ; P2 normalizeDurationSeconds anti-500/négatif ; P3 down idempotent) + 2 tests, 1 defer (language → deferred-work), 4 dismiss (dont faux crash-boot vérifié). Back 282✓ lint✓ down→up revalidé. Status → done. ⚠️ migration part en prod au merge (northwood). |

## Review Findings

_Code review 3 couches (Blind Hunter / Edge Case Hunter / Acceptance Auditor), 2026-07-15. 3 patch, 1 defer, 4 dismiss._

- [x] [Review][Patch] [MED] 409 sur rename artiste-seul renvoie `entry: null` — `lookupTitle` reste `undefined` quand le titre est absent du body PUT, folde sur `''` et ne retrouve pas la fiche en conflit. Divergence de `songcontroller` (fallback `effectiveTitle`). Retomber sur `entry.title`. `[backend/controllers/catalogcontroller.js ~330-354]` (blind+edge+auditor)
- [x] [Review][Patch] [MED] `durationSeconds` non normalisé → 500 sur non-entier (`"abc"`, `1.5`) et durée négative persistée (`-5`), copiée 1:1 en 19-4. `songcontroller` applique `normalizeDurationSeconds` (1–86400 sinon null). Répliquer. `[backend/controllers/catalogcontroller.js ~244-247]` (edge)
- [x] [Review][Patch] [LOW] Migration `down` non idempotente : `dropTable('CatalogSongs')` inconditionnel (asymétrique du `up` gardé) — un replay du down sur table absente lève. Garder par `showAllTables`. Dev-only. `[backend/migrations/20260715000000-create-catalog-songs.js]` (blind+edge)
- [x] [Review][Defer] [LOW] `language` stocké non normalisé (vs `normalizeLanguage` de Song) — cosmétique (pas de crash), donnée saisie par le curateur ; à normaliser dans le form d'admin (19-2) ou en suivi. `[backend/controllers/catalogcontroller.js]` — deferred, non bloquant

**Dismiss (bruit / faux positif / vérifié) :**
- ❌ Crash boot par divergence de signature de factory (`catalogsong.js` en `(sequelize, DataTypes)` vs `user.js` en `(sequelize)`) — **vérifié faux** : `models/index.js:27` appelle `(sequelize, Sequelize.DataTypes)`, exactement comme `song.js`. Aucun crash.
- ❌ Dépendance à la forme de `showAllTables()` (array de strings) — c'est le pattern de garde **prescrit par project-context** pour ce stack (Sequelize 6 / PG renvoie des strings).
- ❌ TOCTOU find→update/destroy (200 sur ligne supprimée en concurrence) — reproduit le pattern **existant** de `songcontroller`, pas un nouveau défaut.
- ❌ AC3 « anonyme → 403 » : l'anonyme reçoit **401** (via `authsess` avant `requireCurator`) — c'est le **statut REST correct** (401 non authentifié / 403 non autorisé), l'intention anti-oracle est préservée. Le libellé de l'AC était imprécis ; le code est correct.
