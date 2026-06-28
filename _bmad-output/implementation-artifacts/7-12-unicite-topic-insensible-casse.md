---
baseline_commit: d5f05691d7105c2020ce991c76f29b82868dd696
---

# Story 7.12: Unicité de topic insensible à la casse ET aux accents (côté serveur)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur,
I want que mes topics ne se dédoublonnent pas selon la casse **ni les accents**,
so that « Pentatonique », « pentatonique » et « Pentatônique » ne créent jamais plusieurs topics distincts.

## Acceptance Criteria

1. **Contrainte serveur insensible casse + accents** — l'unicité par user porte sur `lower(f_unaccent(name))` via un **index unique fonctionnel** `(user_uid, lower(f_unaccent(name)))`, qui **remplace** l'index sensible à la casse `topics_user_uid_name`. Nécessite l'extension Postgres **`unaccent`** + un wrapper **`IMMUTABLE`** `f_unaccent(text)` (unaccent n'est pas immutable par défaut, donc inutilisable tel quel dans un index). `name` reste `varchar` (pas besoin de citext : `lower()` couvre la casse). [Source: epics.md#Story 7.12 L845-847 — « citext **ou comparaison LOWER()** »]
2. **Migration idempotente + dédoublonnage one-shot** — la migration (testée **localement avant merge** — `main` = prod), dans une transaction : (a) `CREATE EXTENSION IF NOT EXISTS unaccent` ; (b) `CREATE OR REPLACE FUNCTION f_unaccent(text) … IMMUTABLE` ; (c) **résout d'abord les doublons** par groupe `(user_uid, lower(f_unaccent(name)))` (repointe `SessionItems.topic_uid` perdant → survivant, puis supprime les perdants) ; (d) `DROP INDEX IF EXISTS topics_user_uid_name` ; (e) `CREATE UNIQUE INDEX IF NOT EXISTS topics_user_uid_name_ci_unaccent ON "Topics" (user_uid, lower(f_unaccent(name)))`. Re-jouable sans casse. [Source: epics.md#Story 7.12 L849-851]
3. **Contrôleur s'appuie sur la contrainte serveur, erreur normalisée** — création / rename en collision (casse OU accents) → la violation d'unicité DB (`23505`) remonte en **409 normalisé** (« Topic already exists »). Le contrôleur **gère déjà** `SequelizeUniqueConstraintError → 409` (createTopic + updateTopic) — un index **fonctionnel** lève le même code `23505` que Sequelize mappe en `SequelizeUniqueConstraintError`. Pas de changement de logique contrôleur ; pas d'oracle (topics scopés `user_uid`, NFR-S4). [Source: epics.md#Story 7.12 L853-855]
4. **Tests** — créer « Pentatonique » puis « pentatonique » → refus (409) ; créer « Pentatonique » puis « Pentatônique » → refus (409) ; rename en collision casse/accent → refus (409). (Au niveau contrôleur : violation DB **simulée** ; la (casse+accent)-insensibilité réelle est validée par l'exécution **locale** de la migration sur des données de collision.) [Source: epics.md#Story 7.12 L857]

## Tasks / Subtasks

- [x] **Task 1 — Migration : extension + wrapper + dédoublonnage + index fonctionnel** (AC: 1, 2)
  - [x] Nouveau fichier `backend/migrations/20260625000000-topics-name-ci-unaccent.js`.
  - [x] `up` (transaction) :
    1. `CREATE EXTENSION IF NOT EXISTS unaccent;`
    2. Wrapper immutable (pin du dictionnaire pour pouvoir le marquer IMMUTABLE) :
       ```sql
       CREATE OR REPLACE FUNCTION f_unaccent(text)
         RETURNS text
         LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
       AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;
       ```
    3. **Dédoublonnage** par groupe `(user_uid, lower(f_unaccent(name)))` ayant >1 ligne : survivant = `ORDER BY is_system DESC, "createdAt" ASC, uid ASC`. `UPDATE "SessionItems" SET topic_uid = survivant WHERE topic_uid = perdant` (préserver le lien des entrées ; snapshot `topic_name` inchangé). Puis `DELETE FROM "Topics"` les perdants. (Utiliser `first_value(uid) OVER (PARTITION BY user_uid, lower(f_unaccent(name)) ORDER BY …)` pour le survivant.)
    4. `DROP INDEX IF EXISTS topics_user_uid_name;`
    5. `CREATE UNIQUE INDEX IF NOT EXISTS topics_user_uid_name_ci_unaccent ON "Topics" (user_uid, lower(f_unaccent(name)));`
  - [x] `down` : `DROP INDEX IF EXISTS topics_user_uid_name_ci_unaccent;` puis recréer l'index unique simple `CREATE UNIQUE INDEX IF NOT EXISTS topics_user_uid_name ON "Topics" (user_uid, name);` ; `DROP FUNCTION IF EXISTS f_unaccent(text);` (laisser l'extension). **Documenter** que le dédoublonnage n'est pas réversible.
  - [x] **Exécuter en local** : insérer des cas (« Jazz »+« jazz », « Été »+« ete ») via SQL, lancer la migration, vérifier dédoublonnage + repoint `SessionItems`, idempotence (re-run = no-op), puis `down`/`up`. ⚠️ **Vérifier que le rôle DB de prod peut `CREATE EXTENSION unaccent`** (citext y a été créé en 7.2 → privilège a priori OK, à confirmer).
- [x] **Task 2 — Modèle Topic (déclaration d'index honnête)** (AC: 1)
  - [x] `backend/models/topic.js` : **retirer** la déclaration `{ unique: true, fields: ['user_uid','name'], name: 'topics_user_uid_name' }` de `indexes` (l'unicité vit désormais dans un index **fonctionnel** non exprimable par le DSL Sequelize) et la **remplacer par un commentaire** pointant la migration `20260625…` (`UNIQUE (user_uid, lower(f_unaccent(name)))`). Garder l'index non-unique `topics_name`. `name` reste `DataTypes.STRING`. `sync({alter:false})` ne droppe rien : pas de régression au boot.
- [x] **Task 3 — Tests contrôleur (collision casse ET accent → 409)** (AC: 3, 4)
  - [x] `backend/__tests__/topiccontroller.test.js` : les tests « maps unique constraint violation to 409 » (create l.117, rename l.276) couvrent le mapping. Ajouter/renommer des tests explicites « créer Pentatonique puis pentatonique → 409 » et « créer Pentatonique puis Pentatônique → 409 » + « rename en collision casse/accent → 409 », en **simulant** `SequelizeUniqueConstraintError` (pas de DB en test) — pour ancrer l'intention de l'AC.
  - [x] Suite back + lint, husky vert sans `--no-verify`.

## Dev Notes

### Contexte & design retenu (Option B — parité client)

Gap historique (AC10 story 8-2, deferred-work 2026-06-21) : dédoublonnage des topics garanti **côté client seulement** (`foldForSearch`, qui plie casse **et** accents) ; l'index `(user_uid, name)` était **sensible à la casse**. Cette story porte la garantie côté **serveur**, avec **parité totale** vis-à-vis du client : insensibilité **casse + accents**.

**Choix technique** (validé avec le PO, 2026-06-25) : index unique **fonctionnel** `(user_uid, lower(f_unaccent(name)))` plutôt que `citext` (qui ne couvrirait que la casse). L'AC autorise explicitement « citext **ou comparaison LOWER()** » → on prend `lower(f_unaccent(...))`. `name` reste `varchar` (pas de citext : `lower()` suffit pour la casse, `f_unaccent` pour les accents).

**Pourquoi un wrapper `f_unaccent`** : `unaccent()` du contrib n'est **pas** `IMMUTABLE` (dépend d'un dictionnaire), donc Postgres refuse de l'utiliser dans un index. Le pattern standard est un wrapper SQL qui **épingle le dictionnaire** (`unaccent('public.unaccent'::regdictionary, $1)`) et qu'on peut alors marquer `IMMUTABLE`.

**Contrôleur déjà prêt** : `createTopic` et `updateTopic` mappent déjà `SequelizeUniqueConstraintError → 409 'Topic already exists'` (scopé `user_uid`). Un index **fonctionnel** lève le code Postgres `23505` exactement comme un index colonne → Sequelize le mappe en `SequelizeUniqueConstraintError`. **Aucun changement de logique contrôleur.** Le 409 porte sur les **propres** topics de l'utilisateur → pas d'oracle (NFR-S4).

### Risque principal = migration prod

`main` = prod (`release_command = node scripts/release-migrate.js`). La migration **doit** :
- être **idempotente** (`IF NOT EXISTS` partout, `CREATE OR REPLACE`, dédoublonnage no-op au re-run) ;
- **dédoublonner AVANT** de créer l'index unique (sinon création échoue si un user a « Jazz »+« jazz » ou « Été »+« ete ») ;
- **préserver les entrées** : `SessionItems.topic_uid` (`onDelete: SET NULL` + snapshot `topic_name`) → **repointer** les perdants vers le survivant avant `DELETE`, sinon les entrées perdraient leur lien ;
- **être testée en local** sur des données de collision avant merge (Task 1) ;
- ⚠️ **privilège prod** : `CREATE EXTENSION unaccent` nécessite les droits adéquats — `citext` ayant été créé en 7.2, le rôle a a priori ce privilège, **à confirmer** avant push.

### Briques / fichiers (lus 2026-06-25)

- **`models/topic.js`** : `name STRING NOT NULL` ; index `{ unique:true, fields:['user_uid','name'], name:'topics_user_uid_name' }` (**à retirer/commenter**) + `{ fields:['name'], name:'topics_name' }` (à garder). `isSystem` (8.2). belongsTo User.
- **`models/sessionitem.js`** : `topicUid` (`field: topic_uid`) → `Topics`, `onDelete: SET NULL` ; snapshot `topic_name` (FR4 : l'entrée garde son nom même après suppression du topic).
- **`controllers/topiccontroller.js`** : createTopic (catch unique→409 l.57), updateTopic (garde isSystem ; catch unique→409 l.~120). Scopés `user_uid`. **Inchangés.**
- **Migration patron** : `migrations/20260623000000-alter-users-identity.js` (extension + ALTER), `20260623000200-create-auth-tokens.js`. Style = `queryInterface.sequelize.query(...)` SQL brut, transaction.
- **`models/user.js`** : pattern « le modèle garde STRING, la migration fait le type DB » (7.2) — s'en inspirer pour ne pas surcharger le modèle.

### Pièges à éviter

- **Wrapper `IMMUTABLE` obligatoire** : un index sur `unaccent(name)` direct échoue (« functions in index expression must be marked IMMUTABLE »).
- **Dédoublonnage AVANT la création de l'index** (ordre critique) ; clé de groupe = `lower(f_unaccent(name))` (la **même** expression que l'index).
- **Repointer SessionItems** avant `DELETE` des perdants.
- **Idempotence** : `IF NOT EXISTS` / `CREATE OR REPLACE` ; dédoublonnage no-op si plus de doublons ; re-run complet sans erreur.
- **Modèle honnête** : retirer la déclaration de l'ancien index unique du modèle (sync ne droppe pas, mais éviter la dérive) ; l'index fonctionnel n'est pas exprimable en Sequelize → vit dans la migration (documenté).
- Transaction sur tout le `up`. `down` ne restaure pas les topics fusionnés (documenté).
- Backend **CommonJS** ; pas de nouvelle dépendance npm (unaccent = extension Postgres native).

### Project Structure Notes

- **NEW** : `backend/migrations/20260625000000-topics-name-ci-unaccent.js`.
- **EDIT** : `backend/models/topic.js` (retrait/commentaire index unique), `backend/__tests__/topiccontroller.test.js` (tests collision casse + accent).
- **Pas de changement front** (`foldForSearch` reste ; l'UI gère déjà le 409). **Pas de dépendance npm.**
- ⚠️ **Migration prod** : tester en local avant merge ; confirmer le privilège `CREATE EXTENSION unaccent`.

### References

- [Source: epics.md#Story 7.12] — unicité serveur (« citext **ou LOWER()** »), dédoublonnage one-shot, erreur normalisée, indépendance
- [Source: deferred-work.md 2026-06-21 — gap AC10 story 8-2 (dédoublonnage client-only, casse+accents)]
- [Source: models/topic.js, models/sessionitem.js (FK topic_uid SET NULL + snapshot), controllers/topiccontroller.js (409 unique)]
- [Source: migrations/20260623000000-alter-users-identity.js (extension + ALTER en transaction), fly.toml release_command]
- [Décision PO 2026-06-25 : Option B (casse + accents) plutôt que citext casse-seule, pour parité avec le `foldForSearch` client]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

- **Migration testée en local** (Docker `db:migrate`) : index fonctionnel `topics_user_uid_name_ci_unaccent` créé, ancien `topics_user_uid_name` droppé, `lower(f_unaccent('Pentatônique'))`→`pentatonique`.
- **Dédoublonnage validé** : seedé « Été »+« ete » (casse+accent) et « Jazz »+« jazz » (casse) + un SessionItem sur le perdant → après `up`, perdants supprimés, survivants « Été »/« Jazz » conservés, SessionItem **repointé** vers le survivant.
- **Index rejette** une nouvelle collision casse+accent (`ETE` vs `Été` → `23505`). **Idempotence** OK (re-run du up SQL sans erreur). **down/up** OK. Seed nettoyé.
- `sync({alter:false})` au boot ne bronche pas avec la déclaration d'index retirée du modèle.
- Tests : back 215 (+4 topiccontroller). Lint OK. Pas de front, pas de dépendance npm.

### Completion Notes List

- **AC1** : unicité par user **casse + accents** via index unique fonctionnel `(user_uid, lower(f_unaccent(name)))` (extension `unaccent` + wrapper `f_unaccent` `IMMUTABLE`). `name` reste `varchar`.
- **AC2** : migration `20260625000000-topics-name-ci-unaccent` en transaction, idempotente (`IF NOT EXISTS`/`CREATE OR REPLACE`), **dédoublonnage one-shot AVANT** l'index (repoint `SessionItems` → survivant puis delete des perdants). Testée localement (dédoublonnage, repoint, rejet, idempotence, down/up).
- **AC3** : contrôleurs `createTopic`/`updateTopic` **inchangés** — ils mappent déjà `SequelizeUniqueConstraintError (23505) → 409`. Un index fonctionnel lève le même code. Pas d'oracle (scopé `user_uid`).
- **AC4** : tests contrôleur ancrant les refus casse (« pentatonique ») et accent (« Pentatônique ») en create et rename → 409.
- **Modèle** : déclaration de l'ancien index unique retirée + commentaire (l'index fonctionnel vit dans la migration, non exprimable en Sequelize).

### File List

- `backend/migrations/20260625000000-topics-name-ci-unaccent.js` (NEW)
- `backend/models/topic.js` (EDIT — commentaire name + index unique retiré/commenté)
- `backend/__tests__/topiccontroller.test.js` (EDIT — tests collision casse + accent → 409)

### Change Log

- 2026-06-25 — Story 7.12 : unicité topic insensible **casse + accents** (option B, validée PO). Index unique **fonctionnel** `(user_uid, lower(f_unaccent(name)))` + extension `unaccent` + wrapper `f_unaccent` IMMUTABLE ; migration idempotente avec **dédoublonnage one-shot** (repoint `SessionItems` avant delete), **testée en local** (dédoublonnage/repoint/rejet/idempotence/down-up). Contrôleurs inchangés (déjà 23505→409). Back 215 verts ; pas de front, pas de dépendance. ⚠️ Prod : vérifier le privilège `CREATE EXTENSION unaccent` avant push.

## Review Findings

_Code review adversariale 3 couches (Blind / Edge / Auditor) — 2026-06-28. Tous les AC satisfaits ; aucun bug bloquant. Findings résiduels :_

- [ ] [Review][Decision] Folding client (NFD) plus étroit que le serveur (`unaccent`) — `src/pages/MySessionsPage.tsx:23` `foldForSearch` strippe uniquement les diacritiques **combinants** (`é è à ç` OK) ; le serveur `lower(f_unaccent(name))` folde aussi les lettres **non-décomposables** (`ø æ œ ß ł đ`). Conséquence : pour « Køln » vs « Koln » existant, le combobox propose **Create** (`:85`/`:415`) mais le serveur renvoie un `409 Topic already exists` surprise. Sévérité Medium (déclenché seulement par caractères exotiques, rares dans des topics FR/EN).
- [x] [Review][Defer] Hook `afterSync` duplique la logique migration + exige `CREATE EXTENSION` au boot + ne drop pas l'index legacy sur DB sync [`backend/models/topic.js:54-121`] — deferred, dette de maintenance (dev/CI uniquement, prod OK via migration).
- [x] [Review][Defer] Migration hardcode `public.unaccent` [`backend/migrations/20260625000000-topics-name-ci-unaccent.js:84`] — deferred, fragile sur PG managé à schéma `extensions` dédié (prod validée via citext 7.2, OK aujourd'hui).
- [x] [Review][Defer] Tests collision casse/accent tautologiques [`backend/__tests__/topiccontroller.test.js:13-26`] — deferred, mockent `Topic.create` → ne testent pas le folding réel (validé seulement par migration locale ; le projet mocke les modèles, pas de DB en test).
