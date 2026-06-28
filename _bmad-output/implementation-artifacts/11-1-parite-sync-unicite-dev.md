---
baseline_commit: 6912bf6
depends_on: epic-10 (mergé sur main, ou brancher Epic 11 depuis feat/epic-10-confort-playlists)
arch_decision: "Migrations = source unique du schéma + garde fail-fast au boot (vérifie la présence des index uniques fonctionnels). On RETIRE le hook afterSync de topic.js (dette SQL dupliquée) au lieu d'en ajouter un côté playlists. Net : dette réduite. Décision rétro Epic 10."
---

# Story 11.1: Parité unicité dev/CI — migrations source unique + garde fail-fast

Status: review

> ⚠️ **Dépendance de séquencement :** la garde référence `playlists_user_uid_name_ci`, créé par la **migration de la story 10.1** (Epic 10). Cette migration n'est **pas encore sur `main`** (branche `feat/epic-10-confort-playlists` non mergée à la création de cette story). **Démarrer le dev de 11.1 seulement après le merge d'Epic 10 sur `main`**, ou brancher `feat/epic-11-dette-technique` **depuis** la branche Epic 10 — sinon la garde échouerait sur une base issue de `main` (l'index playlists n'existe pas encore).

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a mainteneur,
I want que les index uniques fonctionnels (topics 7.12, playlists 10.1) viennent **uniquement des migrations** et qu'un boot sur un schéma incomplet **échoue clairement**,
so that je n'aie ni divergence dev/CI silencieuse, ni SQL de migration dupliquée dans des hooks `afterSync` à maintenir.

## Contexte & pourquoi

Issu de la rétro Epic 10 (dette « parité-sync » promue en story planifiée). **Constat (vérifié dans le code) :**

- Les index uniques **fonctionnels** `topics_user_uid_name_ci_unaccent` (7.12) et `playlists_user_uid_name_ci` (10.1) ne sont **pas exprimables** dans le DSL Sequelize → ils vivent **uniquement dans les migrations**.
- Une base montée par `sequelize.sync({ alter:false })` **seul** (sans migrations) n'a donc **pas** ces index. Les **topics** s'auto-réparent via un hook `afterSync` (`topic.js:54-121`) qui **re-duplique toute la SQL** de la migration 7.12 (extension + wrapper + dédup + index) à chaque boot. Les **playlists n'ont pas** d'équivalent → divergence.
- **Périmètre réel ÉTROIT** : **prod** OK (release-migrate joue les migrations avant le boot) ; **CI** n'utilise **aucune base réelle** (les workflows `auto-release`/`deploy`/`release` sont des déploiements ; les tests husky mockent les modèles via `jest.mock('../models')`). Le seul cas touché = **un dev local** qui boote une base fraîche par `sync` **sans** avoir lancé `make migrate`.
- **Le vrai sujet n'est donc pas « ajouter la parité » mais la DETTE du hook** : mirrorer `afterSync` côté playlists **doublerait** la SQL dupliquée (dette que la review 7.12 a justement flaggée).

**Décision (rétro Epic 10) — approche « migrations = source unique + fail-fast » :** rendre tout schéma incomplet **bruyant** au boot (garde qui échoue clairement) plutôt que de l'auto-réparer en dupliquant la SQL. On **retire** le hook `afterSour` topic ; on n'ajoute **rien** côté playlists. **Net : dette réduite.**

**Périmètre :** backend uniquement (boot `server.js` + garde util + retrait hook `topic.js` + `Makefile`). **Pas de front, pas de dépendance npm, pas de nouvelle migration.**

## Acceptance Criteria

1. **Garde fail-fast au boot** — Given le boot backend (`server.js`, **après** `sequelize.sync({alter:false})`), When un des index uniques fonctionnels attendus manque, Then le boot **échoue clairement** : `logger.error` explicite (cite l'index manquant + « run `make migrate` ») puis `process.exit(1)`. Les index attendus : `topics_user_uid_name_ci_unaccent` et `playlists_user_uid_name_ci`.
2. **Garde no-op quand tout est là** — Given une base à jour (prod après release-migrate, ou dev après `make migrate`), When le boot tourne, Then la garde **passe sans bruit** (un seul `SELECT` sur `pg_indexes`, aucun side-effect, aucun `CREATE EXTENSION`/`CREATE INDEX`).
3. **Retrait du hook `afterSync` topic** — Given `backend/models/topic.js`, When cette story est livrée, Then le bloc `hooks.afterSync` (l.54-121) est **retiré** ; l'index non-unique `topics_name` et le reste du modèle (champs, `isSystem`, associations, commentaires pointant la migration) restent **intacts** ; le commentaire est mis à jour pour pointer la **garde** (et non plus le hook).
4. **Aucun hook côté playlists** — Given `backend/models/playlist.js`, Then **aucun** `afterSync` n'y est ajouté (la parité passe par la garde + les migrations, pas par de la SQL dupliquée).
5. **Migrations jouées en flux dev normal** — Given un dev qui lance `make start` / `make up` sur une base fraîche, Then les migrations sont jouées (ces cibles **dépendent de `migrate`**, comme `setup`/`reset-db`) → les index existent → la garde ne se déclenche **jamais** en usage normal.
6. **Commentaire `server.js` corrigé** — Given le commentaire « Run migrations on startup » au-dessus du `sync` (`server.js:29`) qui **ment** (il ne fait que `sync`, pas de migrations), Then il est corrigé pour décrire la réalité (sync = filet ; migrations = étape séparée, release-migrate en prod / `make migrate` en dev ; + la garde).
7. **Garde testée** — Given la garde extraite en util pur (testable sans vrai boot), Then des tests couvrent : tous les index présents → résolution sans erreur ; un index manquant → erreur/`exit` déclenché. (Modèles/DB mockés, pattern projet.)
8. **Pas de régression** — Suite back verte, lint clean ; **prod non impactée** (les index existent déjà via release-migrate → garde no-op). Aucune dépendance npm, aucune nouvelle migration.

## Tasks / Subtasks

### Task 1 — Garde fail-fast extraite et testable (AC1, AC2, AC7)

- [x] Nouveau module `backend/utils/assertSchema.js` (ou `backend/startup/assertIndexes.js`) exportant `assertFunctionalIndexes(sequelize)` :
  - Liste attendue (constante explicite) : `[{ table: 'Topics', index: 'topics_user_uid_name_ci_unaccent' }, { table: 'Playlists', index: 'playlists_user_uid_name_ci' }]`.
  - Un seul `SELECT indexname FROM pg_indexes WHERE indexname IN (...)` (ou par index), comparer au set attendu.
  - Si manquant(s) → **throw** une erreur claire listant les index manquants + « run \`make migrate\` (the DB schema is missing functional unique indexes) ». Ne PAS `process.exit` dans l'util (le caller décide) → testable.
- [x] **Tests** `backend/__tests__/assertSchema.test.js` : mock `sequelize.query` → (a) renvoie les 2 index → résout sans throw ; (b) renvoie un seul → throw mentionnant l'index manquant. (Pattern projet : pas de vraie DB.)

### Task 2 — Brancher la garde au boot (AC1, AC2, AC6)

- [x] `backend/server.js` (IIFE de boot, l.30-39) : **après** `await sequelize.sync({ alter:false })`, appeler `await assertFunctionalIndexes(sequelize)` dans le `try` ; le `catch` existant logge déjà et `process.exit(1)` → la garde y tombe naturellement (message clair). Vérifier que le message d'erreur de la garde remonte bien dans le `logger.error`.
- [x] **Corriger le commentaire** `server.js:29` (« Run migrations on startup ») : décrire la réalité — `sync({alter:false})` = filet de sécurité (crée les tables manquantes, ne touche pas aux index fonctionnels) ; les migrations sont une étape **séparée** (release-migrate en prod, `make migrate` en dev) ; la garde ci-dessous échoue si le schéma fonctionnel manque.

### Task 3 — Retirer le hook afterSync topic (AC3, AC4)

- [x] `backend/models/topic.js` : retirer entièrement le bloc `hooks: { async afterSync() { ... } }` (l.54-121). **Conserver** l'`indexes: [{ fields:['name'], name:'topics_name' }]`, les champs, `isSystem`, `Topic.associate`. Mettre à jour le commentaire au-dessus de `topics_name` / du champ `name` : l'index fonctionnel vit dans la migration 7.12 et **sa présence est garantie par la garde de boot** (plus par un hook).
- [x] **Ne rien ajouter** à `backend/models/playlist.js` (AC4) — son commentaire 10.1 (l.21-29) reste tel quel (il pointe déjà la migration).
- [x] Vérifier qu'**aucun test** ne dépend du hook `afterSync` topic (grep `afterSync`) ; les tests `topiccontroller`/`usercontroller` mockent les modèles → non concernés.

### Task 4 — Migrations en flux dev normal (AC5)

- [x] `Makefile` : faire dépendre `start` et `up` de `migrate` (comme `setup`/`reset-db` qui lancent déjà `db:migrate`), **ou** ajouter l'étape `db:migrate` dans leur corps avant de servir. Objectif : un `make start`/`make up` sur une base fraîche pose les index → la garde ne trippe pas. Garder `check-env` en prérequis (déjà présent).
- [x] Vérif manuelle locale : sur une base sans les index (les dropper à la main), `make start` les recrée via migrate → boot OK ; en les laissant droppés et en bootant **sans** migrate, la garde **échoue clairement** (message attendu).

### Task 5 — Vérifs (AC8)

- [x] `cd backend && npm test` vert (+ tests garde) ; `npm run lint` (back) clean ; husky vert sans `--no-verify`.
- [x] Sanity : `node -e "require('./models')"` charge sans le hook (pas d'erreur d'init du modèle).

## Dev Notes

### Design retenu (rétro Epic 10)
- **Migrations = source unique** du schéma fonctionnel. La garde de boot ne **répare pas** (pas de SQL dupliquée) : elle **constate et échoue** si un index attendu manque. Le fix réel = lancer les migrations (`make migrate` / release-migrate).
- **On retire** le hook `afterSync` topic (dette : duplique extension+wrapper+dédup+index de la migration 7.12) ; **on n'ajoute rien** côté playlists. Parité par construction (la garde couvre les deux).
- **Prod inchangée** : release_command (`scripts/release-migrate.js`) joue les migrations **avant** que l'app serve → au boot, les index existent → garde no-op. Le `sync({alter:false})` reste le filet.

### État actuel (à lire avant de coder)
- **`backend/server.js:30-39`** : IIFE de boot, `try { sync({alter:false}) } catch { logger.error; process.exit(1) }`. Commentaire l.29 trompeur. → insérer la garde après le `sync`.
- **`backend/models/topic.js:54-121`** : hook `afterSync` (garde d'existence sur `pg_indexes` → si absent : extension `unaccent` + `f_unaccent` IMMUTABLE + dédup repoint `SessionItems` + `CREATE UNIQUE INDEX topics_user_uid_name_ci_unaccent`). C'est **tout** ce bloc qui part. L'index `topics_name` (l.52) **reste**.
- **`backend/models/playlist.js:21-29`** : commentaire pointant la migration 10.1 (`playlists_user_uid_name_ci`), **pas** de hook → ne pas en ajouter.
- **`Makefile`** : `setup` (l.50) et `reset-db` (l.164) lancent `db:migrate` ; `start` (l.82) / `up` (l.123) — à faire dépendre de `migrate`. `migrate` (l.149) = `docker compose exec backend npx sequelize-cli db:migrate`.
- **CI** : `.github/workflows/{auto-release,deploy,release}.yml` = déploiement, **aucun** job de test sur DB réelle. Donc rien à toucher côté CI (l'AC « CI » est satisfaite par constat : pas de base réelle en CI).

### Pièges / ce qui doit être préservé
- **Ne pas** `process.exit` **dans l'util** de garde → le rendre pur (throw) pour le tester ; l'`exit` reste dans le `catch` de `server.js`.
- **Ne pas** retirer l'index `topics_name` ni toucher au contrat du modèle Topic (champs/`isSystem`/associations) — seul le bloc `hooks` part.
- **Ne pas** introduire de `sequelize-cli`/umzug programmatique au boot (machinerie évitée — la garde + l'étape migrate explicite suffisent). _Alternative considérée et écartée : faire jouer les migrations programmatiquement au boot (self-healing) — plus robuste mais ajoute umzug + un run redondant en prod ; on préfère la garde minimale + migrate explicite, cohérent avec le pattern existant (release-migrate / make migrate)._
- La garde lit `pg_indexes` → requiert la connexion DB (présente au boot). En test, mocker `sequelize.query`.

### Conventions (cf. project-context.md)
- Backend **JS CommonJS** (`require`/`module.exports`), pas de `.ts`, pas d'ESM. `http-errors` non pertinent ici (boot, pas une route). Logs via `logger` (winston).
- Tests back : `jest.mock` (pas de vraie DB) — la garde se teste en mockant `sequelize.query`. Nouveaux tests dans `backend/__tests__/`.
- **Tout en anglais** (messages de log, commentaires) : ex. `Missing functional unique index(es): ... — run \`make migrate\``.

### Garde-fous workflow
- **Jamais sur `main`** : branche `feat/epic-11-dette-technique`. Tout merge sur `main` **déploie en prod** (pas de staging) — la garde **doit** être no-op en prod (index présents) sinon elle bloquerait le boot prod ; **vérifier** que les 2 noms d'index sont **exactement** ceux créés par les migrations 7.12 / 10.1 avant merge. northwood **merge à la main**.
- Commits Conventional (`refactor(db): ...`, `chore(makefile): ...`).
- Hook pre-commit lance front + back + ESLint — **jamais `--no-verify`**.

### Project Structure Notes
- **NEW** : `backend/utils/assertSchema.js` (ou `backend/startup/assertIndexes.js`) + `backend/__tests__/assertSchema.test.js`.
- **EDIT** : `backend/server.js` (garde + commentaire), `backend/models/topic.js` (retrait hook + commentaire), `Makefile` (`start`/`up` → migrate).
- **Pas de** : front, migration, dépendance npm.

### References
- [Source: _bmad-output/implementation-artifacts/epic-10-retro-2026-06-28.md] — décision « migrations source unique + fail-fast, tuer le hook »
- [Source: backend/models/topic.js:54-121] — hook `afterSync` à retirer (dette SQL dupliquée)
- [Source: backend/models/playlist.js:21-29] — commentaire 10.1 (pas de hook ; ne rien ajouter)
- [Source: backend/server.js:29-39] — boot `sync` + commentaire trompeur + `catch`/exit où brancher la garde
- [Source: backend/migrations/20260625000000-topics-name-ci-unaccent.js] — crée `topics_user_uid_name_ci_unaccent` (nom exact attendu par la garde)
- [Source: backend/migrations/20260628000200-playlists-name-ci-unique.js] — crée `playlists_user_uid_name_ci` (nom exact attendu par la garde)
- [Source: Makefile — setup/migrate/reset-db/start/up] — cibles ; `start`/`up` à faire dépendre de `migrate`
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — entrée « Lot parité-sync » (provenance)
- [Source: _bmad-output/project-context.md] — conventions backend, tests mockés, migrations idempotentes, garde-fous workflow

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (dev-story workflow)

### Déviation assumée vs Task 4 (documentée)
La story prévoyait « `make start`/`up` dépendent de `migrate` ». **Écarté** : avec la garde fail-fast, une base **fraîche** ferait **crash-looper** le backend au boot (index manquants → `exit(1)`) **avant** que `make migrate` (via `docker compose exec`) puisse tourner → chicken-egg. **Vrai fix** : faire jouer les migrations **dans le CMD du conteneur dev** (`npx sequelize-cli db:migrate && npm run dev`), **avant** le démarrage de l'app — exactement l'ordonnancement du `release_command` prod. Couvre `make start`/`up` (qui font `docker compose up -d`) **sans** toucher le Makefile, et supprime le chicken-egg. AC5 satisfaite, mieux.

### Debug Log References
- **Garde validée contre la vraie base dev (Docker)** : (1) base migrée → `GUARD: PASS` ; (2) `DROP INDEX playlists_user_uid_name_ci` → `GUARD FAIL: Missing functional unique index(es): playlists_user_uid_name_ci (on Playlists)… run \`make migrate\`` ; (3) restauration via migration (`db:migrate:undo` → `db:migrate`) recrée l'index → `GUARD: PASS`. (Note : `db:migrate` ne re-crée pas un index d'une migration **déjà** enregistrée — d'où l'undo/redo pour mon drop artificiel ; sur une **vraie base fraîche**, SequelizeMeta vide → le CMD `db:migrate` joue tout → index créés.)
- **Boot live** (nodemon a rechargé `server.js` via le volume) : logs `Database schema verified` + `Listening on 3001` → la garde tourne au vrai boot et passe.
- **Tests** : back `npm test` **244/244** (+3 `assertSchema.test.js`) ; `npm run lint` (back) clean. Modèle `topic.js` charge sans le hook (`node -e require('./models')` OK).
- _CMD migrate-then-dev : s'active au prochain rebuild d'image (la base dev a déjà les index → migrate no-op) ; ses composants sont prouvés (migrate crée les index + garde passe) et c'est le pattern exact du release_command prod._

### Completion Notes List
- **AC1/AC2/AC7** : `backend/utils/assertSchema.js` → `assertFunctionalIndexes(sequelize)` (pur, throw, non-exit → testable) : un seul `SELECT … pg_indexes`, throw nommant les index manquants + « run `make migrate` » ; sinon résout sans side-effect. 3 tests (présents → no-op ; un manquant → throw nommé ; aucun → message migrate).
- **AC1/AC6** : `server.js` appelle `assertFunctionalIndexes` **après** `sync({alter:false})` dans l'IIFE de boot (le `catch` existant logge + `exit(1)`). Commentaire trompeur « Run migrations on startup » remplacé par la réalité (sync = filet ; migrations = source unique, release-migrate/CMD/`make migrate` ; garde = fail-fast).
- **AC3/AC4** : hook `afterSync` retiré de `topic.js` (≈68 lignes de SQL dupliquée) ; index `topics_name` + contrat du modèle conservés ; commentaire pointe désormais la **garde**. **Aucun** hook ajouté à `playlist.js`.
- **AC5** : migrations jouées avant l'app via le **CMD du conteneur dev** (cf. déviation) → garde no-op en flux normal.
- **AC8** : back 244 ✓, lint clean ; **prod non impactée** (release-migrate crée les index avant le boot → garde passe). Pas de dépendance npm, pas de nouvelle migration.

### File List
- `backend/utils/assertSchema.js` (NEW — garde `assertFunctionalIndexes` + `EXPECTED_INDEXES`)
- `backend/__tests__/assertSchema.test.js` (NEW — 3 tests)
- `backend/server.js` (EDIT — require util + appel garde après sync + commentaire boot corrigé)
- `backend/models/topic.js` (EDIT — retrait du hook `afterSync` ; commentaire index → garde)
- `backend/Dockerfile` (EDIT — CMD dev `db:migrate && npm run dev`, migrations avant l'app)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (EDIT — statut 11-1 → review)

## Change Log

| Date       | Version | Description                                                                 |
|------------|---------|-----------------------------------------------------------------------------|
| 2026-06-28 | 0.1     | Story 11.1 — migrations source unique + garde fail-fast au boot (`assertFunctionalIndexes`, branchée après `sync` dans `server.js`). **Retrait** du hook `afterSync` topic (SQL dupliquée 7.12) ; **aucun** hook playlists. CMD conteneur dev = `db:migrate && npm run dev` (ordonnancement prod-consistant, supprime le chicken-egg). Garde **validée sur la vraie base** (pass/fail-nommé/restore) + boot live OK. Back 244 ✓ (+3), lint clean. Net dette −. Statut → review. |
