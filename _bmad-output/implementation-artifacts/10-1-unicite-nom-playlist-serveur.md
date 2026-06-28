---
baseline_commit: 1fcbf56
arch_decision: "Unicité nom de playlist par user, CÔTÉ SERVEUR, via index unique fonctionnel (user_uid, lower(name)) — case-insensitive (PAS d'accents/f_unaccent), pour parité avec le picker qui folde en .toLowerCase(). Prérequis de la story 10.2 (create on the fly). Calqué sur 7.12 (topics)."
---

# Story 10.1: Unicité de nom de playlist insensible à la casse (côté serveur)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a musicien qui range ses chansons,
I want que mes playlists ne se dédoublonnent pas selon la casse (« Rock » et « rock » = une seule),
so that je ne me retrouve jamais avec deux playlists au même nom, et que la création à la volée (10.2) puisse retomber proprement sur la playlist existante.

## Contexte & pourquoi

**Prérequis backend de la story 10.2** (« créer une playlist à la volée depuis la fiche chanson »). Constat (vérifié dans le code) : contrairement aux topics, **les noms de playlist ne sont PAS uniques** — `name` est `STRING` sans `unique` (`backend/models/playlist.js:21-24`), aucune migration d'index unique sur le nom, et `createPlaylist` ne fait **aucun** check de doublon → toujours `201`, **jamais 409** (`backend/controllers/playlistcontroller.js:103-131`). Il n'existe pas d'équivalent de `TopicConflictError`.

La story 10.2 mirrore le « create on the fly » des topics (8.2), lequel s'appuie sur le **409 serveur** pour gérer la course « catalogue client périmé ». Ce filet n'existe pas pour les playlists → cette story le pose, en **calquant fidèlement la story 7.12** (unicité topic côté serveur).

**Périmètre :** backend uniquement (migration + 2 contrôleurs + tests). **Aucun changement front** ici (le parse 409 + l'UI vivent en 10.2).

## ⚠️ Deux décisions à confirmer au démarrage du dev (modèle/donnée — terrain northwood)

1. **Granularité de l'unicité — `lower(name)` (RECOMMANDÉ) vs `lower(f_unaccent(name))`.**
   7.12 a pris `lower(f_unaccent(name))` (casse + accents) pour parité avec le `foldForSearch` client des topics. **Mais le picker de playlists folde en `.toLowerCase()`** (case seulement, pas d'accents — `Songs.tsx:234-236`). Pour une **parité client/serveur exacte** et éviter le finding de review qu'a connu 7.12 (« folding client plus étroit que le serveur » → 409 surprise sur `ø/æ/œ`), **prendre `lower(name)`** : pas d'extension `unaccent`, pas de wrapper `f_unaccent`, pas de souci de privilège `CREATE EXTENSION` en prod. _Alternative_ : `lower(f_unaccent(name))` si tu veux la même robustesse accents que les topics (le wrapper `f_unaccent` IMMUTABLE existe déjà depuis 7.12) — **au prix** d'aligner aussi le folding client de 10.2 sur `foldForSearch`. **Reco : `lower(name)`.**

2. **Politique de dédoublonnage des collisions existantes — RENAME (RECOMMANDÉ) vs MERGE.**
   Avant de poser l'index unique, il faut résoudre les collisions déjà en base (sinon la création de l'index échoue). 7.12 **fusionnait** les topics (repoint `SessionItems` → survivant, delete des perdants) car un topic est un simple label. **Une playlist contient des chansons curées** (lignes `PlaylistSongs`) → fusionner = unir deux collections (risque de surprise / perte de distinction). **Reco : RENAME non destructif** — garder le survivant (le plus ancien), **renommer** les playlists perdantes avec un suffixe (`« Rock » → « Rock (2) »`) ; zéro perte de données, zéro chirurgie sur `PlaylistSongs`. _Note :_ à l'échelle beta (1 user, peu de playlists), il n'y a quasi certainement **aucun** doublon → ce volet est défensif (no-op probable en prod). _Alternative_ : MERGE (façon 7.12) si tu préfères la sémantique « même nom = même playlist » — plus de code (déplacer/dédupliquer les `PlaylistSongs` du perdant vers le survivant avant delete) et **irréversible**. **Reco : RENAME.**

Le reste de la story est écrit pour **`lower(name)` + RENAME**.

## Acceptance Criteria

1. **Contrainte serveur insensible à la casse** — L'unicité par user porte sur `lower(name)` via un **index unique fonctionnel** `(user_uid, lower(name))` sur `"Playlists"`. `name` reste `varchar` (`lower()` couvre la casse). Aucun index unique sur le nom n'existait avant (rien à dropper).
2. **Migration idempotente + dédoublonnage one-shot (RENAME)** — La migration (testée **localement avant merge** — `main` = prod), dans une **transaction** : (a) **résout d'abord les collisions** par groupe `(user_uid, lower(name))` ayant >1 ligne → survivant = `ORDER BY "createdAt" ASC, uid ASC`, les autres **renommées** avec un suffixe les rendant uniques (`name || ' (' || rn || ')'`) ; (b) `CREATE UNIQUE INDEX IF NOT EXISTS playlists_user_uid_name_ci ON "Playlists" (user_uid, lower(name))`. **Rejouable sans erreur** (`IF NOT EXISTS`, dédoublonnage no-op au re-run une fois les noms uniques).
3. **`createPlaylist` mappe la collision en 409 + playlist existante** — Given une création dont le nom collide (casse comprise) avec une playlist existante du user, When la violation d'unicité DB (`23505` → `SequelizeUniqueConstraintError`) remonte, Then le contrôleur répond **409** avec le corps `{ message: 'Playlist already exists', playlist: <playlist existante> }` (lookup via `lower(name)`), **scopé `user_uid`** (pas d'oracle). Mirror exact de `createTopic`.
4. **`updatePlaylist` (rename) mappe la collision en 409 + playlist existante** — idem AC3 pour le renommage d'une playlist vers un nom déjà pris.
5. **Pas de régression** — Les playlists existantes restent lisibles/éditables ; `getAllPlaylists`/`getPlaylist`/`addSongToPlaylist`/`removeSongFromPlaylist` inchangés ; le contrat `songUids` (5.7) intact ; `sync({alter:false})` au boot ne bronche pas. Suites back + lint vertes, husky sans `--no-verify`.
6. **Modèle honnête** — `backend/models/playlist.js` documente (commentaire) que l'unicité vit dans l'index **fonctionnel** de la migration (non exprimable par le DSL Sequelize). Pas de déclaration d'index unique côté modèle (`sync` ne doit rien tenter de créer/dropper).

## Tasks / Subtasks

### Task 1 — Migration : dédoublonnage RENAME + index unique fonctionnel (AC 1, 2)

- [x] Nouveau fichier `backend/migrations/<timestamp>-playlists-name-ci-unique.js` (timestamp après `20260628000100`, ex. `20260628000200`). Pattern SQL brut `queryInterface.sequelize.query(...)` en **transaction** (mirror `20260625000000-topics-name-ci-unaccent.js`).
- [x] `up` (transaction) :
  1. **Dédoublonnage RENAME** — pour chaque groupe `(user_uid, lower(name))` ayant >1 ligne, garder le survivant (`first_value(uid) OVER (PARTITION BY user_uid, lower(name) ORDER BY "createdAt" ASC, uid ASC)`) et **renommer les perdants** avec un suffixe rendant le nom unique. Approche : calculer un `row_number()` par groupe et, pour `rn >= 2`, `UPDATE "Playlists" SET name = name || ' (' || rn || ')'`. ⚠️ **Edge** : un nom renommé pourrait théoriquement entrer en collision avec un `"X (2)"` déjà existant — rarissime à l'échelle beta ; le documenter, ou (option collision-proof) suffixer avec un fragment d'uid au lieu d'un compteur.
  2. `CREATE UNIQUE INDEX IF NOT EXISTS playlists_user_uid_name_ci ON "Playlists" (user_uid, lower(name));`
- [x] `down` : `DROP INDEX IF EXISTS playlists_user_uid_name_ci;`. **Documenter** que le RENAME du dédoublonnage **n'est pas réversible** (les suffixes restent).
- [x] **Exécuter en local** (`make migrate`) : insérer un cas de collision (« Rock »+« rock ») via SQL, lancer la migration, vérifier le rename du perdant + la création de l'index, l'**idempotence** (re-run = no-op), puis `down`/`up`. Idéalement **rejouer sur un dump prod réel** (précédent 5.7/7.12) puisque la migration touche de la donnée prod.

### Task 2 — Contrôleur : mapper la collision en 409 (AC 3, 4)

- [x] `backend/controllers/playlistcontroller.js` — en tête, importer `{ Op, fn, col, where: whereFn }` de `sequelize` et définir un helper `foldedNameMatch(name)` calqué sur `topiccontroller.js:9-14`, **version casse seule** :
  ```js
  function foldedNameMatch(name) {
    return whereFn(fn('lower', col('name')), String(name).trim().toLowerCase());
  }
  ```
- [x] `createPlaylist` (`:103-131`) — entourer le `Playlist.create(...)` (déjà en transaction) d'un `catch` mappant `error.name === 'SequelizeUniqueConstraintError'` → lookup `Playlist.findOne({ where: { [Op.and]: [{ userUid }, foldedNameMatch(name)] } })` puis `res.status(409).json({ message: 'Playlist already exists', playlist: existing })`. **Mirror exact** de `createTopic` (`topiccontroller.js:68-87`). Le `name` est déjà requis (400 si absent, `:112-114`).
- [x] `updatePlaylist` (`:134-171`) — même `catch` 409 autour de l'`update` (rename en collision). Le lookup exclut idéalement la playlist en cours d'édition (`uid <> :uid`), comme un rename topic.
- [x] Ne **rien** changer d'autre : `getAllPlaylists`/`getPlaylist`/`deletePlaylist`/`addSongToPlaylist`/`removeSongFromPlaylist` et `syncPlaylistSongs` (contrat `songUids` 5.7) **inchangés**.

### Task 3 — Modèle (déclaration honnête) (AC 6)

- [x] `backend/models/playlist.js` — ajouter un **commentaire** au-dessus du champ `name` pointant la migration `<timestamp>-playlists-name-ci-unique` (`UNIQUE (user_uid, lower(name))`). **Ne pas** ajouter de `indexes: [{ unique: true, ... }]` (l'index fonctionnel n'est pas exprimable en Sequelize ; `sync` ne doit rien créer/dropper). `name` reste `DataTypes.STRING`.

### Task 4 — Tests contrôleur (collision casse → 409) (AC 3, 4)

- [x] `backend/__tests__/playlistcontroller.test.js` — ajouter : `createPlaylist` avec un nom en collision **simule** `SequelizeUniqueConstraintError` (la création rejette) → `res.status(409)` avec `{ message: 'Playlist already exists', playlist: <existing mocké> }` ; idem `updatePlaylist`. Mocker `Playlist.create`/`update` pour rejeter avec `{ name: 'SequelizeUniqueConstraintError' }` et `Playlist.findOne` pour renvoyer l'existante. (Pas de DB en test — le projet mocke `../models` ; la casse-insensibilité **réelle** est validée par l'exécution locale de la migration, Task 1.)
- [x] Vérifs finales : `cd backend && npm test` vert (+ nouveaux tests), `npm run lint` (back) propre, husky vert.

## Dev Notes

### Design retenu (calqué sur 7.12, simplifié pour les playlists)
- **`lower(name)` (casse seulement)**, pas `f_unaccent` : parité exacte avec le picker (`.toLowerCase()`), pas d'extension Postgres, pas de privilège `CREATE EXTENSION` à confirmer, pas de finding « folding client plus étroit ». C'est l'écart **assumé** vs 7.12 (qui visait la parité avec `foldForSearch`, plus large).
- **RENAME (non destructif)** plutôt que MERGE : une playlist porte des chansons curées (lignes `PlaylistSongs` FK CASCADE) ; renommer les collisions préserve tout et évite toute chirurgie/irréversibilité. À l'échelle beta, dédoublonnage quasi certainement **no-op**.
- **Contrôleur = mirror `topiccontroller`** : `createTopic`/`updateTopic` mappent déjà `SequelizeUniqueConstraintError → 409 { message, topic: existing }` via `foldedNameMatch` (`topiccontroller.js:9-14, 68-87`). On reproduit ce pattern pour les playlists, en `lower(name)`. Le 409 est scopé `user_uid` → **pas d'oracle** d'énumération (NFR-S4).

### Risque principal = migration prod (`main` = prod)
- `release_command` lance les migrations avant que l'app serve. La migration **doit** : être **idempotente** ; **dédoublonner AVANT** de créer l'index unique (sinon échec si un user a « Rock »+« rock ») ; **être testée en local** (idéalement sur dump prod) avant merge. `down` ne restaure pas les noms renommés (documenté).
- ✅ **Pas d'extension Postgres** requise avec `lower(name)` → pas de question de privilège (contrairement à 7.12/unaccent).

### Briques / fichiers (référencés)
- **`backend/models/playlist.js:3-49`** : `name STRING NOT NULL` (pas d'`unique`), `userUid` FK CASCADE, `songUids` legacy JSON (non source de vérité depuis 5.7), `underscored`. → ajouter commentaire (Task 3).
- **`backend/models/playlistsong.js`** : join `(playlist_uid, song_uid)` unique, FK CASCADE — **non touché**.
- **`backend/controllers/playlistcontroller.js:103-171`** : `createPlaylist`/`updatePlaylist` → ajouter le `catch` 409. Helpers `syncPlaylistSongs`/`songUidsByPlaylist`/`withSongUids` (5.7) **inchangés**.
- **`backend/controllers/topiccontroller.js:9-14, 68-87`** : gabarit `foldedNameMatch` + 409-avec-entité à mirrorer (version casse seule).
- **`backend/migrations/20260625000000-topics-name-ci-unaccent.js`** : patron migration (transaction, dédoublonnage AVANT index, idempotence) — adapter en `lower(name)` + RENAME.
- **`backend/migrations/20260611000100-backfill-playlist-songs.js`** : précédent de migration de backfill côté playlists (style SQL brut idempotent).

### Conventions (cf. project-context.md)
- Backend **JS CommonJS** (`require`/`module.exports`), pas de `.ts`, pas d'ESM. Contrôleurs : try/catch → `next(createError(...))` ; `http-errors`. **Pas de nouvelle dépendance npm** (rien à installer).
- Modèles : camelCase JS + `field: 'snake_case'` (déjà le cas, `underscored`). Migration **idempotente** obligatoire (`IF NOT EXISTS`/`CREATE OR REPLACE`).
- Tests back : `jest.mock('../models')` (pas de DB) — suivre le pattern de `topiccontroller.test.js` (mock create/update rejette `SequelizeUniqueConstraintError`, `findOne` renvoie l'existante).
- **Tout en anglais** (messages, commentaires) : `'Playlist already exists'`.

### Garde-fous workflow
- **Jamais sur `main`** : branche `feat/epic-10-confort-playlists` (partagée avec 10.2). Tout merge sur `main` **déploie en prod** (pas de staging) ; northwood **merge à la main**. Migration testée localement avant.
- Commits Conventional (`feat(playlists): ...`, `fix(migrations): ...`).
- Hook pre-commit lance front + back + ESLint — **jamais `--no-verify`**.

### Interim entre 10.1 et 10.2 (à savoir)
- Une fois 10.1 mergée, `MyPlaylistsPage` (création/rename de playlist) recevra un **409** sur nom en doublon, aujourd'hui catché en message générique `setError('Error while saving')` (`MyPlaylistsPage.tsx`). C'est **correct** (plus de doublon créé silencieusement) mais peu explicite — **10.2** affine le message + le parse `PlaylistConflictError`. Acceptable comme état transitoire (amélioration nette : plus de doublons).

### Project Structure Notes
- **NEW** : `backend/migrations/<timestamp>-playlists-name-ci-unique.js`.
- **EDIT** : `backend/controllers/playlistcontroller.js` (catch 409 create+update), `backend/models/playlist.js` (commentaire), `backend/__tests__/playlistcontroller.test.js` (tests 409).
- **Pas de front, pas de dépendance npm.**

### References
- [Source: _bmad-output/implementation-artifacts/7-12-unicite-topic-insensible-casse.md] — patron complet (migration dédoublonnante en transaction, 409-avec-entité, modèle honnête, risque prod)
- [Source: backend/controllers/topiccontroller.js:9-14,68-87] — `foldedNameMatch` + mapping `SequelizeUniqueConstraintError → 409 { message, topic }`
- [Source: backend/migrations/20260625000000-topics-name-ci-unaccent.js] — migration patron (à adapter en `lower(name)` + RENAME)
- [Source: backend/controllers/playlistcontroller.js:103-171] — `createPlaylist`/`updatePlaylist` à instrumenter
- [Source: backend/models/playlist.js:21-24] — `name` STRING sans `unique` (constat)
- [Source: _bmad-output/implementation-artifacts/5-7-playlists-vrai-lien-base-fk.md] — modèle playlists (FK `PlaylistSongs`, contrat `songUids`, `syncPlaylistSongs`)
- [Source: _bmad-output/project-context.md] — règles backend, migrations idempotentes, conventions de tests
- [Décision à confirmer northwood : (1) `lower(name)` vs `lower(f_unaccent(name))` ; (2) RENAME vs MERGE — reco `lower(name)` + RENAME]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (dev-story workflow)

### Décisions tranchées (2026-06-28, avec northwood)

- **Granularité = `lower(name)`** (casse seule, PAS `f_unaccent`) — parité exacte avec le picker (`.toLowerCase()`), pas d'extension Postgres, pas de finding « folding client plus étroit ».
- **Dédoublonnage = RENAME non destructif** — les perdantes d'un groupe `(user_uid, lower(name))` sont renommées avec un suffixe `(2)`, `(3)` ; survivant = la plus ancienne. Aucune chirurgie sur `PlaylistSongs`, aucune perte de données.

### Debug Log References

- **Migration testée sur la vraie base dev (Docker Postgres 15)** — seed d'une collision « Z Test CI » + « z test ci » (créées vieilles, ordre contrôlé) :
  - `db:migrate` → perdante renommée **`z test ci (2)`**, survivante **`Z Test CI`** (la plus ancienne) conservée.
  - Index fonctionnel créé : `CREATE UNIQUE INDEX playlists_user_uid_name_ci ON public."Playlists" USING btree (user_uid, lower((name)::text))`.
  - Nouvelle collision (`INSERT 'Z TEST CI'`) **rejetée** → `duplicate key value violates unique constraint "playlists_user_uid_name_ci"` (23505).
  - `db:migrate:undo` → index droppé ; `db:migrate` re-run → index recréé, **dédoublonnage no-op** (pas de double-suffixe `(2) (2)`) → idempotence confirmée.
  - Lignes de seed supprimées après coup ; données dev réelles intactes.
- **Tests** : back `npm test` **240/240** (+2 nouveaux : 409 create + 409 update) ; `npm run lint` (back) propre. Front `npm test` **290/290** (aucun changement front, non-régression).

### Completion Notes List

- **AC1/AC2** : index unique **fonctionnel** `(user_uid, lower(name))` posé par la migration `20260628000200-playlists-name-ci-unique` (transaction). Dédoublonnage **RENAME** AVANT l'index ; idempotent (re-run = no-op). Pas d'extension Postgres (`lower(name)` suffit). `down` droppe l'index (rename non réversible, documenté).
- **AC3/AC4** : `createPlaylist` et `updatePlaylist` mappent `SequelizeUniqueConstraintError → 409 { message: 'Playlist already exists', playlist: <existante avec songUids dérivés> }`. Helper `findExistingByName(userId, name, excludeUid)` (mirror `topiccontroller`), lookup `lower(name)` scopé `user_uid` (pas d'oracle) ; best-effort (ne throw jamais, renvoie `null` si non résolu). `updatePlaylist` exclut la playlist en cours d'édition (`Op.ne`).
- **AC5** : reste des handlers (`getAll`/`getPlaylist`/`delete`/`addSong`/`removeSong`) + `syncPlaylistSongs` (contrat `songUids` 5.7) inchangés. `sync({alter:false})` au boot ne bronche pas (aucun index déclaré côté modèle).
- **AC6** : commentaire dans `playlist.js` pointant la migration (l'index fonctionnel vit dans la migration, non exprimable en Sequelize) ; pas de déclaration d'index côté modèle.
- **Interim 10.1→10.2** : `MyPlaylistsPage` recevra un 409 sur nom doublon (aujourd'hui message générique `setError`) — correct (plus de doublon créé), affiné en 10.2.

### File List

- `backend/migrations/20260628000200-playlists-name-ci-unique.js` (NEW)
- `backend/controllers/playlistcontroller.js` (EDIT — import sequelize Op/fn/col/where, helper `foldedNameMatch` + `findExistingByName`, catch 409 dans `createPlaylist` et `updatePlaylist`)
- `backend/models/playlist.js` (EDIT — commentaire pointant l'index fonctionnel de la migration)
- `backend/__tests__/playlistcontroller.test.js` (EDIT — tests 409 create + 409 update/rename)
- `CHANGELOG.md` (EDIT — entrée `[Unreleased]`)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (EDIT — statut 10-1 → review)

## Change Log

| Date       | Version | Description                                                                 |
|------------|---------|-----------------------------------------------------------------------------|
| 2026-06-28 | 0.2     | Code review 3 couches : 2 patches appliqués — (1) trim `name` à l'écriture + garde ≤255 (corrige le `playlist: null` du 409 sur noms espacés, mirror topic) ; (2) suffixe de dédup basé sur l'uid + borné (anti-collision `Rock (2)` / anti-overflow), **re-validé sur base dev**. +1 test (trim). 1 report (hook afterSync parité dev/CI). Back 241 ✓, lint clean. Statut → done. |
| 2026-06-28 | 0.1     | Story 10.1 — unicité de nom de playlist insensible à la casse (serveur). Index unique **fonctionnel** `(user_uid, lower(name))` + dédoublonnage **RENAME** non destructif (migration `20260628000200`, idempotente, **testée sur la vraie base dev** : rename/index/rejet 23505/down-up/idempotence). Contrôleurs `create`/`update` → 409 `{ message, playlist }` (mirror `topiccontroller`, scopé `user_uid`). Back 240 ✓ (+2), lint clean, front 290 ✓. ⚠️ `main` = prod : migration validée localement avant merge. Statut → review. |

## Review Findings

_Code review adversariale 3 couches (Blind Hunter / Edge Case Hunter / Acceptance Auditor) — 2026-06-28. Aucun bug bloquant ; les 6 AC satisfaites. 2 patches, 1 report, 4 écartés (bruit/déjà géré)._

- [x] [Review][Patch→Fixed] **Trimmer `name` à l'écriture (create + update)** [backend/controllers/playlistcontroller.js] — `createPlaylist`/`updatePlaylist` stockaient `name` brut alors que `foldedNameMatch` trim et l'index est `lower(name)` → deux playlists `" Rock"` (espaces) collident sur l'index, le 409 part, mais `findExistingByName` renvoie `playlist: null` → le client 10.2 ne peut pas sélectionner l'existante. Convergent Blind+Edge+Auditor. **Corrigé** : `name` trimmé avant `create`/`update` (mirror `topiccontroller`) + garde longueur ≤255 (400 au lieu d'un 500). Test de régression ajouté (« trims the name before persisting »).
- [x] [Review][Patch→Fixed] **Suffixe de dédoublonnage robuste (anti-collision + anti-overflow)** [backend/migrations/20260628000200-playlists-name-ci-unique.js] — le suffixe numérique `(rn)` pouvait colider avec un littéral pré-existant `Rock (2)` → la création de l'index unique **abort** dans la transaction → **deploy bloqué** (Blind High) ; et dépasser `varchar(255)` (Edge Low). **Corrigé** : suffixe basé sur le fragment d'`uid` (unique par construction) + base bornée à 240 chars (`left(name,240) || ' (' || left(uid::text,8) || ')'`). **Re-validé sur la base dev** avec le cas `Rock`/`rock`/`Rock (2)` : `rock` → `rock (0ae0a428)` (pas `rock (2)`), index construit sans abort (l'ancien suffixe aurait planté).
- [x] [Review][Defer] **Pas de hook `afterSync` de parité sur Playlist → DB construites par `sync` (dev/CI) sans unicité** [backend/models/playlist.js:21-29] — sur une base montée par `sync({alter:false})` seul (dev local, CI), l'index n'existe pas → le 409 est du code mort en dev, les doublons de casse passent (les tests sont mockés, ne le voient pas). Prod protégée (release-migrate). `Topic` a ajouté un hook `afterSync` pour exactement ça (`topic.js:54-121`) — mais ce hook est **lui-même** une dette de maintenance déjà reportée (review 7.12). — deferred, divergence dev/prod assumée, même posture que la dette afterSync 7.12 ; à traiter en lot si on durcit la parité sync.

### Findings écartés (bruit / déjà géré, non persistés)
- **409 suppose l'index de nom** (autre contrainte unique mal étiquetée) — Edge a vérifié : seuls `playlists_user_uid_name_ci` + PK sur Playlists ; l'unique `PlaylistSongs` est inatteignable (dédup `seen` dans `syncPlaylistSongs`). `topiccontroller` ne garde pas non plus → mirror fidèle. Écarté (inatteignable).
- **Lookup `name` vide/undefined** — `create` exige `name` (400 avant) ; `update` sans `name` ne renomme pas → pas de violation d'unicité de nom. Inatteignable. Écarté.
- **Nom NULL non contraint** — `name` est `allowNull:false` → aucun NULL. Écarté (géré).
- **`down` sans transaction** — un seul `DROP INDEX`, inoffensif. Écarté (cosmétique).
