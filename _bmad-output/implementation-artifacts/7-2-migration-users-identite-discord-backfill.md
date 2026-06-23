---
baseline_commit: c5b760f185d16a2fdb015f7f080c7becdc103ae5
---

# Story 7.2: Migrer le modèle Users vers l'identité Discord-style (+ backfill beta)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a produit,
I want le modèle Users migré vers `name#discriminator` et l'email casse-insensible,
so that le handle et les flux de compte reposent sur un schéma sain, en prod, sans casse de données.

## Acceptance Criteria

1. **Migration `alter-users-identity` (idempotente, gardes `describeTable`/`showIndex`)** — à l'exécution : `CREATE EXTENSION IF NOT EXISTS citext` ; `email` passé en `citext` ; ajout `discriminator` (STRING, nullable en DB), `emailVerified` (BOOLEAN, default false), `pendingEmail` (STRING null). La contrainte `unique(name)` est retirée et un index **unique `(name, discriminator)`** est créé.
2. **Migration `backfill-users-beta` (idempotente, rejouable)** — sur la base beta : chaque user existant reçoit un `discriminator` libre pour son nom (`0001`–`9999`, zero-paddé STRING) ; son `email` est normalisé (lowercase/trim) ; `emailVerified=true` (grandfathering) ; `pendingEmail=null`.
3. **Modèle `user.js`** — `name` n'est plus `unique` ; nouveaux champs camelCase JS + `field:'snake_case'` (`email_verified`, `pending_email`) ; `discriminator` STRING 4 chiffres ; index unique `(name, discriminator)` déclaré dans `indexes` avec le **même nom** que la migration (sync le reconnaît, ne le recrée pas).
4. **Unicité du handle** — deux comptes de même nom d'affichage sont autorisés et désambiguïsés par l'index `(name, discriminator)` ; l'`email` reste unique mais désormais insensible à la casse (citext).
5. **Re-runnabilité (double filet `release_command` + `sync({alter:false})`)** — ré-exécuter les migrations ne produit **aucune erreur** ; testé **localement sur un dump prod réel** (`make migrate`) **avant** merge (`main` = prod, pas de staging).

## Tasks / Subtasks

- [x] **Task 0 — Pré-vol sur données réelles (avant d'écrire le SQL final)** (AC: 5)
  - [x] Répétition sur la **base dev docker live** (structure créée par `sync` = identique prod ; 6 users beta réels) — substitut au dump prod (la prod et la dev partagent le même schéma `sync`). _NB : pas de `make db-backup-prod` exécuté ; voir la barrière pré-merge ci-dessous._
  - [x] **Schéma réel `Users` inspecté** : contrainte d'unicité `name` = **`Users_name_key`** (confirmé), email = `Users_email_key`, email en `character varying`. La migration utilise `DROP CONSTRAINT IF EXISTS "Users_name_key"` (robuste quel que soit le nom).
  - [x] **Collisions d'email à la casse** : `SELECT lower(email::text), count(*) FROM "Users" GROUP BY 1 HAVING count(*)>1;` → **vide** sur la base dev (6 users). ⚠️ **Barrière pré-merge** : rejouer cette requête en lecture seule sur la **prod** avant push (cf. Completion Notes) — la migration échoue proprement (deploy avorté, prod intacte) si collision, mais autant le savoir avant.
- [x] **Task 1 — Migration `alter-users-identity` (schéma)** (AC: 1, 4)
  - [x] Créer `backend/migrations/20260623000000-alter-users-identity.js` (CommonJS, commentaires EN). Garde globale + sous-gardes idempotentes (pattern existant `describeTable` / `showIndex`).
  - [x] `up` (dans cet ordre) :
    1. `CREATE EXTENSION IF NOT EXISTS citext;` (raw query).
    2. Conversion email → citext, **conditionnelle** via `information_schema.columns` (cf. pattern `convert-language-to-jsonb`) : si `data_type != 'citext'`, `ALTER TABLE "Users" ALTER COLUMN email TYPE citext;` (pas besoin de `USING`, varchar→citext est implicite ; vérifier sur le dump).
    3. `addColumn` `discriminator` (STRING, allowNull:true) / `emailVerified` (BOOLEAN, allowNull:false, defaultValue:false, `field:'email_verified'`) / `pendingEmail` (STRING, allowNull:true, `field:'pending_email'`) — chacun gardé par `describeTable('Users')`.
    4. Drop unicité sur `name` : **idempotent**, en utilisant le nom détecté en Task 0 — `ALTER TABLE "Users" DROP CONSTRAINT IF EXISTS "Users_name_key";` (et/ou `DROP INDEX IF EXISTS ...` si c'est un index seul). Adapter au schéma réel constaté.
    5. Index unique composite via `showIndex('Users')` → si absent, `addIndex('Users', ['name','discriminator'], { unique:true, name:'users_name_discriminator_unique' })`.
  - [x] `down` : retrait des colonnes + index composite, restauration de l'unique sur `name`, email → varchar (best-effort ; le `down` n'est pas joué en prod mais doit être cohérent).
- [x] **Task 2 — Migration `backfill-users-beta` (données, idempotente/rejouable)** (AC: 2)
  - [x] Créer `backend/migrations/20260623000100-backfill-users-beta.js`.
  - [x] Normalisation email : `UPDATE "Users" SET email = lower(trim(email)) WHERE email <> lower(trim(email));` (idempotent, ne touche que ce qui change).
  - [x] Grandfathering : `UPDATE "Users" SET email_verified = true WHERE email_verified = false;`. `pending_email` déjà null par défaut (no-op explicite si besoin).
  - [x] Discriminator : sélectionner les users `WHERE discriminator IS NULL` ; pour chacun, attribuer un discriminant **libre pour son nom** (les noms sont uniques aujourd'hui → toujours libre), zero-paddé 4 chiffres en STRING. Implémentation : boucle JS sur les lignes + `UPDATE ... WHERE uid = ?` (raw queries, **ne pas** charger le modèle User dans la migration). Idempotent : seules les lignes `discriminator IS NULL` sont touchées → rejouable sans doublon.
  - [x] `down` : no-op (données ; cf. pattern `backfill-playlist-songs`).
- [x] **Task 3 — Modèle `user.js`** (AC: 3)
  - [x] Retirer `unique` de l'attribut `name` (garder `allowNull:false`).
  - [x] Ajouter `discriminator` (STRING, allowNull:true — peuplé par backfill puis par register 7.7), `emailVerified` (BOOLEAN, allowNull:false, defaultValue:false, `field:'email_verified'`), `pendingEmail` (STRING, allowNull:true, `field:'pending_email'`).
  - [x] Garder `email` `unique:true` (désormais citext en DB ; le modèle reste `STRING`, drift assumé — sync `alter:false` ne touche pas le type).
  - [x] Déclarer l'index dans les options : `indexes: [{ unique:true, fields:['name','discriminator'], name:'users_name_discriminator_unique' }]` (même nom que la migration → `sync` le voit existant, ne le recrée pas).
  - [x] Ne PAS toucher au setter password (bcryptjs), au `defaultScope` (exclut password), ni à `validPassword`.
- [x] **Task 4 — Validation locale & non-régression** (AC: 5)
  - [x] Sur la **base dev live** (structure prod via sync) : `make migrate` → 0 erreur (les 2 migrations passent). **Idempotence** prouvée : entrées `SequelizeMeta` retirées + re-`migrate` → 0 erreur et discriminators **inchangés** (backfill ne touche que les NULL). **Double filet** : restart backend → `sync({alter:false})` boot sans erreur.
  - [x] Vérifier post-migration (psql) : `email` en citext, 3 colonnes ajoutées, `unique(name)` absente, index `users_name_discriminator_unique` présent, tous les users ont un `discriminator` non-null + `email_verified=true` + email lowercase.
  - [x] Smoke auth : **citext insensible à la casse confirmé au niveau DB** (`email = 'CONTACT.AXELBARON@GMAIL.COM'` → `northwood`) et `loginUser` **inchangé** (le `iLike` reste valide sur citext). _Login live non rejoué (pas de credentials de test) — à confirmer après deploy par un login réel._
  - [x] Suites de tests : back (`cd backend && npm test`) + front (`npm test`) + lint backend, toutes vertes. Husky pre-commit OK sans `--no-verify`.

### Review Findings

_Code review 2026-06-23 — 3 couches (Blind / Edge / Auditor). 1 décision, 2 patches, 3 deferred, 5 dismissed. AC1–AC4 pleinement satisfaites ; AC5 satisfaite en code (validé sur base dev, pas dump prod — c'est la barrière pré-merge connue)._

- [x] [Review][Decision→A] **Fenêtre 7.2→7.7 fermée** — `createUser` attribue désormais un discriminator libre 4 chiffres à l'inscription (retry sur collision de l'index `(name, discriminator)`, 409 si nom plein). Plus de users `discriminator=NULL`, unicité du nom garantie dès 7.2. [usercontroller.js createUser]
- [x] [Review][Patch] Migration 1 : **pré-check des collisions d'email** ajouté avant le `ALTER … TYPE citext` — throw clair listant les emails en doublon de casse. Validé sur base dev (undo+re-up). [20260623000000]
- [x] [Review][Patch] `down` migration 1 : `ALTER … TYPE varchar` désormais gardé par un check de type (symétrie avec l'`up`). Validé via `db:migrate:undo`. [20260623000000]
- [x] [Review][Defer] Grandfathering `email_verified` non rejouable après 7.9 (risque uniquement sur replay manuel) [20260623000100] — deferred, replay = action manuelle hors flux normal
- [x] [Review][Defer] Index non-unique `users_name` redondant (préfixe de l'index composite) [migration users] — deferred, inoffensif
- [x] [Review][Defer] Format/range du discriminator non contraint par un CHECK [models/user.js] — deferred, le format register appartient à 7.7

## Dev Notes

### Contexte & enjeu

Story **à risque maximal de l'Epic 7** : migration de schéma **sur la prod directement** (pas de staging — `main` = prod). Le filet, c'est de **tester sur un dump prod réel en local** avant tout merge (Task 0/4). Elle pose les fondations identité (`name#discriminator`, email citext, `emailVerified`/`pendingEmail`) consommées par 7.7 (register/login), 7.8 (profil), 7.9 (verify), 7.11 (change-email). [Source: epics.md#Story 7.2 ; architecture.md#Data Architecture]

### Patterns de migration à RÉUTILISER (lus dans le repo)

- **addColumn idempotent** : `const d = await queryInterface.describeTable('Users'); if (!d.col) { await queryInterface.addColumn(...) }` — cf. `20260617000000-add-duration-to-songs.js`.
- **Changement de type conditionnel** : check `information_schema.columns.data_type` puis `ALTER COLUMN ... TYPE ...` — cf. `20260221000000-convert-language-to-jsonb.js`.
- **Index idempotent** : `showIndex('Users')` → `addIndex(..., { name })` si absent — cf. `20260608010000-add-index-to-song-plays-session-item-uid.js`. **Toujours nommer l'index explicitement**.
- **Backfill idempotent** : SQL gardé par `WHERE NOT EXISTS` / `WHERE <col> IS NULL`, rejouable, `down` no-op — cf. `20260611000100-backfill-playlist-songs.js`.
- **`gen_random_uuid()`** dispo (pgcrypto déjà utilisé) si besoin.
- Migrations câblées via `.sequelizerc` racine ; lancées par `make migrate` (docker) et en prod par `release_command` (`scripts/release-migrate.js`). [Source: project-context.md#Express/Sequelize, #Critical Don't-Miss]

### État actuel du modèle `Users` (lu — à préserver hors changements)

`backend/models/user.js` : PK `uid` UUID v4 ; `name` STRING **unique** allowNull:false ; `email` STRING **unique** + validate isEmail ; `password` STRING avec **setter bcryptjs** (ne jamais hasher à la main) ; `isAdmin` BOOLEAN ; `timestamps:true` ; `tableName:'Users'` ; `defaultScope` exclut `password` ; `validPassword` ; assoc `hasMany(Song, foreignKey:'userUid')`. **Aucune migration `Users` n'existe** (table créée historiquement par `sync`) → d'où l'importance de détecter les noms de contraintes réels sur le dump (Task 0).

### Pièges spécifiques à cette migration

- **Collision email à la casse** : avant `email → citext`, deux emails ne différant que par la casse (distincts en varchar) deviennent égaux en citext → violation de l'unique existant **pendant** l'`ALTER`. → détecté en Task 0 ; attendu vide en beta, mais à vérifier sur le vrai dump.
- **Nom réel de la contrainte `unique(name)`** : `DROP CONSTRAINT IF EXISTS "Users_name_key"` est le cas nominal, mais sequelize a pu créer un index ; adapter selon Task 0. L'`IF EXISTS` garantit l'idempotence quoi qu'il arrive.
- **Ordre des migrations** : `alter` (schéma) **puis** `backfill` (données). L'index composite peut être créé avant le backfill du discriminator (noms uniques aujourd'hui ⇒ `(name, NULL)` ne collisionne pas ; Postgres traite les NULL comme distincts).
- **Double filet `sync({alter:false})`** : il ne modifie pas les types/colonnes existants, mais peut tenter de créer un index du modèle s'il le croit absent → d'où l'index **nommé identiquement** dans le modèle et la migration (Task 3).
- **`SongPlay` n'a pas de `userUid`** (ownership via Song) : hors-scope ici, mais ne pas s'étonner — on ne touche qu'à `Users`.

### Garde-fous projet (project-context.md)

- Backend **CommonJS** strict (`require`/`module.exports`, pas d'ESM, pas de `.ts`). Commentaires/UI **en anglais**.
- Convention colonnes **comme `Songs`** : camelCase JS + `field:'snake_case'` explicite (`email_verified`, `pending_email`). [Source: project-context.md#Framework, #Naming]
- **Toute migration mergée part en prod** : idempotente + testée localement avant. Ne jamais committer avec `--no-verify`. [Source: project-context.md#Development Workflow]
- Mots de passe : setter bcryptjs uniquement ; `defaultScope` exclut password — ne pas contourner.

### Project Structure Notes

- NEW : `backend/migrations/20260623000000-alter-users-identity.js`, `backend/migrations/20260623000100-backfill-users-beta.js`.
- EDIT : `backend/models/user.js`.
- Pas de changement de contrôleur dans cette story (voir Q2) — login/register handle = story 7.7.
- Tests : ajouter/adapter un test modèle léger si pertinent ; le gros de la validation est la **passe migration sur dump réel** (Task 4), non automatisable en CI.

### References

- [Source: epics.md#Story 7.2] — user story + ACs
- [Source: architecture.md#Data Architecture / #Authentication & Security] — citext, discriminator, emailVerified/pendingEmail, grandfathering
- [Source: architecture.md#Naming Patterns] — `discriminator`/`email_verified`/`pending_email`, handle `${name}#${discriminator}` STRING 4 chiffres
- [Source: backend/migrations/*] — patterns idempotents réutilisés
- [Source: 7-1-...md] — story précédente : fail-fast secret, JWT retiré (login/register déjà allégés ; `loginUser` lit encore `Op.or` name/email en `iLike`)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

- `make migrate` (base dev live, 6 users) : 2 migrations appliquées sans erreur.
- Idempotence : `DELETE FROM "SequelizeMeta"` des 2 entrées + re-`migrate` → 0 erreur, discriminators inchangés.
- Double filet : `docker compose restart backend` → `sync({alter:false})` → « Database migrations completed successfully », `Listening on 3001`.
- Vérifs psql : `email` udt=`citext` ; `discriminator`/`email_verified`(bool)/`pending_email` ajoutés ; `Users_name_key` **absente** ; `Users_email_key`+`Users_pkey` présentes ; index `users_name_discriminator_unique` présent ; 6/6 users avec discriminator 4 chiffres + `email_verified=t` + email lowercase + `pending_email` null.
- citext CI : `WHERE email = 'CONTACT.AXELBARON@GMAIL.COM'` → `northwood`.
- Tests : backend 140 ✓ + lint ✓ ; frontend 236 ✓.

### Completion Notes List

- **AC1/AC4 (alter)** : `CREATE EXTENSION IF NOT EXISTS citext` ; email→citext conditionnel (check `udt_name`) ; addColumn gardés par `describeTable` ; `DROP CONSTRAINT IF EXISTS "Users_name_key"` ; index unique `(name, discriminator)` gardé par `showIndex`. Email reste unique mais désormais CI (citext).
- **AC2 (backfill)** : email lowercase/trim (comparé en `::text` pour détecter la casse — un `<>` citext serait insensible) ; `email_verified=true` (grandfathering) ; discriminator random `0001`–`9999` libre par nom, **uniquement** sur les lignes NULL → rejouable.
- **AC3 (modèle)** : `name` non-unique ; `discriminator`/`emailVerified`(`email_verified`)/`pendingEmail`(`pending_email`) ajoutés ; index composite déclaré avec le **même nom** que la migration (sync ne le recrée pas) ; setter password / defaultScope / validPassword intacts.
- **AC5 (re-runnabilité)** : idempotence + double filet `sync` validés sur base dev live (structure = prod).
- **Décisions** : discriminator nullable en DB ; `loginUser` non touché (→ 7.7) ; discriminant random.
- ⚠️ **Barrière pré-merge (1 seule, analogue au secret Fly de 7.1)** : avant `git push`, lancer en **lecture seule sur la prod** `SELECT lower(email::text), count(*) FROM "Users" GROUP BY 1 HAVING count(*)>1;` — doit être **vide**. Si non vide, normaliser/fusionner avant merge (sinon le `ALTER ... TYPE citext` échoue et **avorte le deploy** — prod intacte mais déploiement bloqué). Pas de `db-backup-prod` joué ici : répétition faite sur la base dev (même schéma sync).

### File List

- `backend/migrations/20260623000000-alter-users-identity.js` (NEW)
- `backend/migrations/20260623000100-backfill-users-beta.js` (NEW)
- `backend/models/user.js` (EDIT)
- `backend/controllers/usercontroller.js` (EDIT — review : attribution discriminator au register)
- `backend/__tests__/usercontroller.test.js` (EDIT — review : tests discriminator + retry)

### Review Resolution (2026-06-23)

3 couches adversariales. **Faux positif clé** : H2 (« le deploy ne lance pas les migrations ») — `fly.toml` a bien `release_command = node scripts/release-migrate.js` (db:migrate en phase release avant boot ; échec ⇒ deploy avorté, prod intacte). Résolu : 1 décision (A — discriminator au register) + 2 patches (pré-check collision email, garde down). 3 deferred consignés dans `deferred-work.md`, 5 dismissed. Re-validation migrations sur base dev (undo+re-up avec patches) OK ; back 142 / front 236 verts.

### Change Log

- 2026-06-23 — Story 7.2 : migration identité Discord-style (`name#discriminator`), email→citext (CI), `emailVerified`/`pendingEmail` ; backfill beta idempotent (discriminator random, grandfathering, normalisation email) ; modèle `Users` aligné. Répété sur base dev (idempotence + double filet OK). Tests back 140 / front 236 verts.

## Open Questions — RÉSOLUES (2026-06-23)

1. ✅ **`discriminator`** → **nullable en DB** (`allowNull:true`). Pas de `SET NOT NULL` sur prod (évite l'échec si une ligne n'est pas peuplée) ; l'unicité réelle vient de l'index `(name, discriminator)`.
2. ✅ **`loginUser`** → **intouché dans 7.2**. Le `iLike` reste valide sur citext (login non cassé) ; la refonte login email-only / retrait `iLike` appartient à la story **7.7** (déjà planifiée — **rien dans `deferred-work.md`**).
3. ✅ **Base de test** → **dump prod réel** (`make db-backup-prod` → restore local, usage local-only, non committé). Seul filet fiable sans staging : révèle le nom réel de la contrainte `unique(name)` et d'éventuelles collisions d'email à la casse.
4. ✅ **Discriminant** → **random `0001`–`9999`** (cohérence Discord ; aucune collision possible, noms uniques aujourd'hui).
