---
baseline_commit: 9f91cf3c563e590ecab36cbb4db7c60ed9bae7c3
---

# Story 1.1: Créer un sujet de travail

Status: done

## Story

As a musicien,
I want créer un sujet de travail avec un nom et une catégorie libre optionnelle,
so that je peux nommer ce que je travaille au-delà des chansons.

## Acceptance Criteria

1. **Création simple** — Given je suis authentifié, When je crée un sujet « Pentatonique » sans catégorie, Then le sujet est sauvegardé et m'appartient (invisible pour les autres utilisateurs), And il apparaît immédiatement dans ma liste de sujets.
2. **Création avec catégorie** — Given je crée un sujet « Walking bass » avec la catégorie « Technique », When je valide, Then le nom et la catégorie sont sauvegardés.
3. **Validation du nom** — Given un nom vide, When je valide, Then une erreur de validation s'affiche (client ET serveur) et rien n'est créé.
4. **Migration idempotente** — Given un déploiement, When la migration de la table des sujets s'exécute, Then elle est rejouable sans erreur (NFR5).
5. **Standards UI** — le formulaire est labellisé (NFR6), responsive et dark mode (NFR3).

## Tasks / Subtasks

- [x] Task 1 : Migration `Topics` (AC: 4)
  - [x] Créer `backend/migrations/20260607000000-create-topics.js` — table `Topics` : `uid` UUID PK default UUIDV4, `user_uid` UUID NOT NULL FK → `Users.uid` ON DELETE CASCADE, `name` STRING NOT NULL, `category` STRING NULL, `createdAt`/`updatedAt` DATE NOT NULL default `CURRENT_TIMESTAMP` (camelCase, comme `Instruments`)
  - [x] Garde d'idempotence OBLIGATOIRE : `const tables = await queryInterface.showAllTables(); if (!tables.includes('Topics')) { ... }` — createTable + addIndex (`user_uid`, `name`) DANS le if
  - [x] `down` : `dropTable('Topics')`
  - [x] Tester localement : `make migrate` (ou `cd backend && npx sequelize-cli db:migrate`) deux fois de suite — la seconde exécution ne doit pas échouer
- [x] Task 2 : Modèle `Topic` (AC: 1, 2)
  - [x] Créer `backend/models/topic.js` sur le modèle exact de `backend/models/instrument.js` : champs `uid`, `userUid` (field: `'user_uid'`, references Users, onDelete CASCADE), `name` (allowNull: false), `category` (allowNull: true) ; options `{ tableName: 'Topics', timestamps: true }`
  - [x] `Topic.associate` : `Topic.belongsTo(models.User, { foreignKey: 'userUid' })`
  - [x] Aucun enregistrement manuel : `models/index.js` charge le dossier automatiquement
- [x] Task 3 : Contrôleur + routes (AC: 1, 2, 3)
  - [x] Créer `backend/controllers/topiccontroller.js` (nom de fichier tout en minuscules, sans tiret) avec `getAllTopics` et `createTopic`, copie conforme du pattern `instrumentcontroller.js` : `req.session.user` → 401 si absent ; `createTopic` → 400 `'Name is required'` si `!name` ; `Topic.create({ userUid: userId, name, category })` → `res.status(201).json(topic)` ; `getAllTopics` → `findAll({ where: { userUid: userId }, order: [['createdAt', 'DESC']] })` → `res.json(topics)` (entité brute, pas d'enveloppe)
  - [x] PAS de `updateTopic`/`deleteTopic` dans cette story — c'est le périmètre de la story 1.2
  - [x] Créer `backend/routes/topics.js` : `router.use(express.json())` (PAS `body-parser` — dépendance transitive interdite dans le nouveau code), puis `router.get('/', authsess, ...)` et `router.post('/', authsess, ...)`
  - [x] Enregistrer dans `backend/routes/index.js` : `router.use('/topics', topicsRouter)` (même pattern que `/instruments`)
- [x] Task 4 : Service frontend (AC: 1, 2)
  - [x] Créer `src/services/topicService.ts` sur le modèle exact de `instrumentService.ts` : type `Topic` (`uid`, `name`, `category?`, `createdAt?`, `updatedAt?`), `CreateTopicDTO = Omit<Topic, 'uid' | 'createdAt' | 'updatedAt'>`, objet `topicService` avec `getAll()` et `create(payload)` — `fetch` brut, `const API_BASE = '/api'`, TOUJOURS `credentials: 'include'`, erreurs `if (!res.ok) throw new Error('Failed to ...')`
  - [x] ATTENTION `verbatimModuleSyntax` : les imports de types côté consommateur utilisent `import { topicService, type Topic } from ...`
- [x] Task 5 : Page « Topics » (AC: 1, 2, 3, 5)
  - [x] Créer `src/pages/MyTopicsPage.tsx` sur le modèle de `MyInstrumentsPage.tsx` : chargement initial dans `useEffect` + `topicService.getAll()`, formulaire d'ajout (input `name` requis + input texte libre `category`), liste/table des sujets existants (colonnes Name / Category), états loading / error / liste vide (« No topics saved yet. »)
  - [x] Validation client : bouton submit `disabled={loading || !name.trim()}` + `if (!name.trim()) return` dans le handler ; afficher l'erreur serveur via le bandeau d'erreur existant (pattern `MyInstrumentsPage`)
  - [x] NFR6 : chaque champ a un `<label htmlFor>` réel (améliorer le pattern placeholder-seul de `MyInstrumentsPage`) — classes `input-base`, `btn-primary`, `card-base glass-effect`
  - [x] NFR3 : variantes `dark:` sur chaque élément stylé, grid responsive (`grid-cols-1 md:grid-cols-3`)
  - [x] UI 100 % en ANGLAIS : « Topics », « Add », « Name (e.g. Pentatonic scale) », « Category (e.g. Technique) » — jamais de français dans l'UI ni les commentaires
  - [x] Ajout en tête de liste après création (`setList([created, ...list])`) — apparition immédiate (AC 1)
- [x] Task 6 : Routing + navigation (AC: 1)
  - [x] `src/App.tsx` : route `/my-topics` gardée par `isAuthenticated ? <MyTopicsPage /> : <Navigate to="/login" replace />` (pattern existant)
  - [x] `src/components/Header.tsx` : lien « Topics » dans la nav authentifiée, mêmes classes que les liens « Instruments »/« Playlists »
- [x] Task 7 : Tests (AC: 1, 2, 3)
  - [x] Backend : `backend/__tests__/topiccontroller.test.js` avec `jest.mock('../models')` (pattern `songcontroller.test.js` : mockRes/mockNext) — cas : création avec name seul (201), création avec name + category (201, category transmise), name manquant → `next` appelé avec erreur 400, session absente → 401, getAllTopics filtre par `userUid`
  - [x] Frontend : `src/__tests__/MyTopicsPage.test.tsx` (Testing Library, comportement visible) — cas : la liste s'affiche après chargement, soumettre le formulaire appelle `topicService.create` et ajoute le sujet à la liste, bouton Add désactivé si nom vide
  - [x] Lancer les DEUX suites : `npm test` (racine) ET `cd backend && npm test` — le hook pre-commit exige les deux vertes
- [x] Task 8 : Lint + build
  - [x] `npm run lint` (racine, couvre ts/tsx) et `cd backend && npm run lint`
  - [x] `npm run build` (tsc -b + vite) — `noUnusedLocals`/`noUnusedParameters` font échouer le build sur toute variable morte

### Review Findings

- [x] [Review][Decision] Unicité du nom de sujet par utilisateur — RÉSOLU (2026-06-07) : unicité choisie → index unique `topics_user_uid_name`, 409 API, message « Topic already exists » côté front
- [x] [Review][Decision] Validation client du nom vide silencieuse — RÉSOLU (2026-06-07) : bouton désactivé jugé suffisant (prévention plus forte qu'un message), pattern conservé
- [x] [Review][Patch] Nom/catégorie > 255 caractères → 500 au lieu de 400 (Med, blind+edge) [backend/controllers/topiccontroller.js:32-44] — corrigé : 400 explicite + maxLength=255 sur les inputs
- [x] [Review][Patch] Bandeau d'erreur jamais nettoyé après un ajout réussi (blind+edge) [src/pages/MyTopicsPage.tsx:25-40] — corrigé : setError(null) en début de handleAdd
- [x] [Review][Patch] Échec de chargement affiche « No topics saved yet. » (état vide mensonger) (blind+edge) [src/pages/MyTopicsPage.tsx:99-101] — corrigé : état loadFailed → « Topics could not be loaded. »
- [x] [Review][Patch] Bandeau d'erreur : pas de role="alert" ni de nom accessible sur le bouton ✕ (blind, NFR6) [src/pages/MyTopicsPage.tsx:44-49] — corrigé : role="alert" + aria-label="Dismiss error"
- [x] [Review][Patch] Migration : addIndex sautés si la table a été créée par sequelize.sync avant la migration — cas réellement observé en dev local (blind+edge) [backend/migrations/20260607000000-create-topics.js] — corrigé : gardes d'index individuelles via showIndex, hors de la garde de table ; indexes ajoutés au modèle pour que sync les crée aussi ; auto-réparation validée en local
- [x] [Review][Patch] Bandeau d'erreur sans variantes dark: (auditor, NFR3) [src/pages/MyTopicsPage.tsx:44] — corrigé : dark:text-red-300 dark:bg-red-900/40 dark:border-red-800
- [x] [Review][Defer] Session serveur expirée → page morte (auth localStorage vs cookie, 401 non distingué) [src/contexts/AuthContext.tsx] — deferred, pre-existing (pattern app-wide, toutes les pages)
- [x] [Review][Defer] `loading` partagé masque toute la liste pendant un create [src/pages/MyTopicsPage.tsx:31] — deferred, pre-existing (pattern maison identique dans MyInstrumentsPage)
- [x] [Review][Defer] Aucune navigation mobile (nav `hidden md:flex`, pas de menu hamburger) [src/components/Header.tsx:57] — deferred, pre-existing (toutes les pages affectées, pas seulement Topics)

## Dev Notes

### Décision de nommage (à suivre partout)

L'entité PRD « Sujet de travail » s'appelle **`Topic`** dans le code (UI anglaise obligatoire) : table `Topics`, modèle `topic.js`, contrôleur `topiccontroller.js`, routes `/api/topics`, service `topicService.ts`, page `MyTopicsPage.tsx`, route front `/my-topics`, lien nav « Topics ». Ne PAS utiliser « Subject » (ambigu) ni « WorkTopic ».

### Modèle de référence : l'entité Instrument

Cette story est un clone structurel de l'entité Instrument, en plus simple (2 champs au lieu de 4, pas d'update/delete). Fichiers de référence à imiter ligne à ligne :

- `backend/models/instrument.js` → `topic.js`
- `backend/controllers/instrumentcontroller.js` (getAll + create uniquement) → `topiccontroller.js`
- `backend/routes/instruments.js` → `routes/topics.js` (MAIS `express.json()` au lieu de `body-parser`)
- `src/services/instrumentService.ts` → `topicService.ts`
- `src/pages/MyInstrumentsPage.tsx` → `MyTopicsPage.tsx`

### Contraintes critiques (project-context.md)

- **Backend = JavaScript CommonJS** : `require`/`module.exports`, JAMAIS d'ESM ni de `.ts` dans `backend/`
- **Pattern contrôleur obligatoire** : `req.session.user` → 401 si absent → action ; erreurs via `createError(4xx, '...')` de `http-errors` + `logger.error` (winston) + try/catch → `next(error)`
- **Réponses JSON brutes** : entité directe, pas d'enveloppe `{data:...}`
- **Auth** : middleware `backend/middleware/authsess.js` sur chaque route (vérifie `req.session.loggedIn === true`) — ne pas s'appuyer sur le JWT en session
- **Anti-pattern à NE PAS copier** : `getSong` ne vérifie pas l'ownership — ici `getAllTopics` filtre par `where: { userUid }`, c'est suffisant pour cette story (pas de GET /:uid)
- **`bcrypt` et `body-parser` interdits** dans le nouveau code (transitifs) — `express.json()` natif
- **Frontend strict TS** : `verbatimModuleSyntax` → `import type` pour les types ; `noUnusedLocals` → pas de variable morte
- **Pas de lib UI/state** : useState + Tailwind only, couleurs du thème (`brand/primary/accent/secondary`), pattern toast manuel si besoin (pas nécessaire ici, le bandeau d'erreur suffit)
- **Langue** : code, commentaires et UI en anglais — le français reste dans les docs BMad uniquement

### Migration — pattern exact

Convention DB du projet pour les nouvelles tables (alignée sur `Instruments` : colonnes une-seule-minuscule + `user_uid` snake + timestamps camelCase) :

```js
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tables = await queryInterface.showAllTables();
    if (!tables.includes('Topics')) {
      await queryInterface.createTable('Topics', {
        uid: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true, allowNull: false },
        user_uid: {
          type: Sequelize.UUID, allowNull: false,
          references: { model: 'Users', key: 'uid' }, onDelete: 'CASCADE'
        },
        name: { type: Sequelize.STRING, allowNull: false },
        category: { type: Sequelize.STRING, allowNull: true },
        createdAt: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updatedAt: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
      await queryInterface.addIndex('Topics', ['user_uid']);
      await queryInterface.addIndex('Topics', ['name']);
    }
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('Topics');
  }
};
```

ATTENTION : toute migration mergée part en PRODUCTION au push sur `main` (release_command Fly.io puis `sequelize.sync({alter:false})` au boot). Elle DOIT être testée localement avant (`make migrate`, deux fois pour prouver l'idempotence). Postgres local : port **5433**, `NODE_ENV=development` exporté.

### Périmètre — garde-fous

- **PAS de PUT/DELETE** ni de renommage/suppression dans cette story → story 1.2 (`updateTopic`/`deleteTopic`, ConfirmDialog, sémantique FR4)
- **PAS de hiérarchie** de sujets : liste plate (FR1)
- **NE PAS toucher** au formulaire chanson ni au champ `technique` existant (FR5) — aucun rapprochement sujets ↔ techniques
- **Modèle Topic minimal** (name + category, c'est tout) : les évolutions futures (lien chanson↔sujet, progression par sujet) sont au backlog et se brancheront dessus sans le modifier
- `category` est un **texte libre** (input), PAS un select à options fixes (contrairement au `type` d'Instrument)
- Normalisation côté contrôleur : trimmer `name`; `category` vide/blanche → `null`

### Préparation FR4 (story 1.2 / epic 2 — à connaître, pas à implémenter)

La suppression d'un sujet devra préserver son nom dans l'historique des sessions. Cette décision (dénormalisation du nom dans la future table d'entrées vs FK SET NULL) appartient à l'epic 2 — ici, garder la table `Topics` simple avec CASCADE sur `user_uid` uniquement ; AUCUNE FK d'une autre table ne pointe encore vers `Topics`.

### Testing standards

- Backend : Jest env node (`backend/jest.config.js`), modèles mockés via `jest.mock('../models')` — JAMAIS de DB réelle ; lancer avec `cd backend && npm test`
- Frontend : Jest jsdom + Testing Library (config dans `package.json` racine, setup `src/test/setupTests.ts`), tests dans `src/__tests__/*.test.tsx` — tester le comportement visible, pas l'implémentation ; lancer avec `npm test` à la racine
- Les imports des tests suivent `tsconfig.test.json` (CommonJS) — ne pas copier ces patterns dans le code app
- Pre-commit husky = les deux suites ; commit interdit avec `--no-verify`

### Workflow git

- Brancher depuis `main` : `feat/topics` (ou `feat/1-1-create-topic`) — JAMAIS de travail direct sur `main` (tout push sur main déploie en prod, sans staging)
- Commit : Conventional Commits, ex. `feat(topics): add practice topics creation and listing`

### Project Structure Notes

- Nouveaux fichiers : `backend/migrations/20260607000000-create-topics.js`, `backend/models/topic.js`, `backend/controllers/topiccontroller.js`, `backend/routes/topics.js`, `src/services/topicService.ts`, `src/pages/MyTopicsPage.tsx`, `backend/__tests__/topiccontroller.test.js`, `src/__tests__/MyTopicsPage.test.tsx`
- Fichiers modifiés (UPDATE) : `backend/routes/index.js` (ajout `router.use('/topics', ...)` — ne rien toucher d'autre), `src/App.tsx` (ajout d'une route — préserver l'ordre et le catch-all `*`), `src/components/Header.tsx` (un lien nav — préserver dark mode toggle et menu auth)
- Aucun conflit de structure détecté : l'arborescence cible suit exactement le découpage existant routes/controllers/models + services/pages

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.1] — story et ACs
- [Source: _bmad-output/planning-artifacts/prds/prd-musician-tools-2026-06-06/prd.md#Groupe A] — FR1-FR5, NFR3/4/5/6
- [Source: _bmad-output/planning-artifacts/prds/prd-musician-tools-2026-06-06/addendum.md] — modèle de données Sujet minimal
- [Source: _bmad-output/project-context.md] — règles d'implémentation (46 règles, à lire avant de coder)
- [Source: backend/models/instrument.js, backend/controllers/instrumentcontroller.js, backend/routes/instruments.js] — patterns backend de référence
- [Source: src/services/instrumentService.ts, src/pages/MyInstrumentsPage.tsx, src/App.tsx:64-70, src/components/Header.tsx:67-72] — patterns frontend de référence
- [Source: backend/migrations/20251222100000-add-album-to-songs.js] — pattern d'idempotence (commit e5400c5)
- [Source: backend/__tests__/songcontroller.test.js] — pattern de test contrôleur avec mocks

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (create-story workflow)

### Debug Log References

- Suite backend : 12/12 tests verts (3 suites) — `cd backend && npm test`
- Suite frontend : 54/54 tests verts (10 suites) — `npm test`
- Lint backend : 0 erreur ; lint frontend : 8 erreurs préexistantes (SongForm.test, AuthContext, MyPlaylistsPage, vite.config), 0 nouvelle
- Build `tsc -b && vite build` : OK
- Migration testée localement (Docker Postgres 5433) : créée puis rejouée avec la table existante sans erreur (garde `showAllTables` validée) ; table finale avec index `topics_user_uid` et `topics_name`
- Smoke test : `GET /api/topics` sans session → 401 (authsess actif)

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- Pas de document architecture dédié : project-context.md + code existant font foi
- Analogie structurelle complète avec l'entité Instrument validée par lecture du code
- TDD respecté : tests écrits et vus en échec avant l'implémentation (backend puis frontend)
- Entité `Topic` implémentée : migration idempotente, modèle, contrôleur (getAll + create), routes `/api/topics` (express.json, pas body-parser), service frontend, page `/my-topics`, lien nav « Topics »
- Normalisation contrôleur : `name` trimé (400 si vide/blanc), `category` vide → null
- NFR6 : labels `<label htmlFor>` réels sur les deux champs (amélioration vs pattern placeholder-seul de MyInstrumentsPage)
- Découverte dev local : le `sequelize.sync({alter:false})` au boot (nodemon) peut créer la table avant la migration → la garde d'idempotence couvre ce cas, mais les index secondaires ne viennent que de la migration ; en prod le `release_command` exécute la migration avant le boot, donc ordre correct. À garder en tête pour les stories suivantes (epic 2)
- Périmètre respecté : pas de PUT/DELETE (story 1.2), pas de hiérarchie, formulaire chanson intact (FR5)
- Implémenté sur la branche `bmad-and-claude` (même commit que `main`) — aucun commit effectué, à la main de l'utilisateur

### File List

**Nouveaux :**
- backend/migrations/20260607000000-create-topics.js
- backend/models/topic.js
- backend/controllers/topiccontroller.js
- backend/routes/topics.js
- backend/__tests__/topiccontroller.test.js
- src/services/topicService.ts
- src/pages/MyTopicsPage.tsx
- src/__tests__/MyTopicsPage.test.tsx

**Modifiés :**
- backend/routes/index.js (enregistrement du router `/topics`)
- src/App.tsx (route `/my-topics` gardée par auth)
- src/components/Header.tsx (lien nav « Topics »)

## Change Log

- 2026-06-07 : Story 1.1 implémentée (entité Topic : création + liste, migration idempotente, tests backend 7 + frontend 5) — statut → review
- 2026-06-07 : Code review adversariale (3 couches) — 6 patches appliqués + 2 décisions résolues (unicité par utilisateur → 409 ; validation client conservée), 3 différés pré-existants dans deferred-work.md, 5 écartés. Tests backend 9, frontend 8 (14 + 57 au total, tous verts). Statut → done
