---
project_name: 'musician-tools'
user_name: 'northwood'
date: '2026-06-06'
sections_completed:
  ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'quality_rules', 'workflow_rules', 'anti_patterns']
existing_patterns_found: 30
status: 'complete'
rule_count: 46
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

_Versions = état actuel du projet (aucune contrainte de montée de version documentée)._

**Frontend** (`/package.json`, app v1.2.0)
- React 19.1 + react-router-dom 6.28 — pas de lib de state management (useState/useMemo + Context pour l'auth uniquement)
- TypeScript ~5.8.3 en mode `strict` + `verbatimModuleSyntax` + `noUnusedLocals/Parameters` (tsconfig.app.json, pas d'alias de paths)
- Vite 7 (`vite.config.ts` : proxy `/api` → `localhost:3001`, fichier en `@ts-nocheck`)
- Tailwind CSS 3.4 (PAS v4) — `darkMode: 'class'`, couleurs custom `brand/primary/accent/secondary` (50→900)
- Jest 29 + ts-jest + jsdom + Testing Library

**Backend** (`backend/package.json`, Node 22.x)
- JavaScript CommonJS — PAS de TypeScript côté backend
- Express ~4.16 (pas 5), Sequelize 6 + sequelize-cli, PostgreSQL (pg)
- express-session + connect-pg-simple (store Postgres en prod, MemoryStore en dev)
- bcryptjs pour les mots de passe (bcrypt est présent dans les deps mais INUTILISÉ — ne pas l'importer)
- winston pour les logs (console + fichiers `logs/*.log`)

**Déploiement**
- Push sur `main` → GitHub Action → `flyctl deploy` (app `musician-tools`, port 3001)
- Migrations exécutées par `release_command` (`scripts/release-migrate.js` → sequelize-cli) PUIS `sequelize.sync({alter:false})` au boot — double filet
- `both.Dockerfile` multi-stage : build Vite copié dans `backend/public/`, Express sert le SPA (fallback `*` → index.html)
- Dev local : `docker-compose.yml` (Postgres 15 sur port 5433) + `Makefile` (`make setup/start/migrate`)

## Critical Implementation Rules

### Language-Specific Rules

**TypeScript (frontend uniquement)**
- `verbatimModuleSyntax` actif : les imports de types DOIVENT utiliser `import type { X } from '...'` — un import mélangé valeur/type casse le build
- `strict` + `noUnusedLocals` + `noUnusedParameters` : pas de variable morte, le build `tsc -b` échoue dessus
- Pas d'alias de paths — imports relatifs uniquement (`../services/songService`)
- Les tests utilisent `tsconfig.test.json` (CommonJS, `verbatimModuleSyntax: false`) — ne pas copier les patterns d'import des tests dans le code app

**JavaScript backend (CommonJS)**
- `require`/`module.exports` partout — JAMAIS de syntaxe ESM (`import`/`export`) dans `backend/`
- Pas de TypeScript : ne pas créer de fichiers `.ts` dans `backend/`
- Async/await dans les contrôleurs avec try/catch → `next(error)` ; erreurs HTTP via `http-errors` (`createError(403, '...')`)

**Langue (règle stricte)**
- TOUT en anglais : UI (labels, messages, boutons) ET commentaires de code — y compris dans les fichiers qui contiennent encore de vieux commentaires français (ne pas imiter l'existant sur ce point)

### Framework-Specific Rules

**React**
- Composants : fonction + hooks, PascalCase (`SongForm.tsx`) dans `src/components/` ou `src/pages/`
- State local massif (`useState`) + `useMemo` pour les calculs coûteux — pas de Redux/Zustand ; seul `AuthContext` (src/contexts/) est global
- Persistance UI : localStorage, clés préfixées par page (~30 clés `songs*` ex. `songsSortColumn`) — initialiser le state DEPUIS localStorage (lazy initializer), pas dans un useEffect
- Dark mode : classes Tailwind `dark:` sur chaque élément stylé ; le toggle vit dans `Header.tsx` (classe `dark` sur `<html>`, clé localStorage `darkMode`)
- Confirmations destructives : réutiliser `ConfirmDialog.tsx` (props isOpen/title/message/onConfirm/isDangerous)
- Toasts : pattern manuel `setToastMessage` + `setTimeout(2500)` — pas de système global (à réutiliser tel quel, pas de lib)

**Services frontend**
- Un objet `xxxService` par domaine dans `src/services/`, `fetch` brut, `const API_BASE = '/api'`
- TOUJOURS `credentials: 'include'` (sessions par cookie)
- Erreurs : `if (!res.ok) throw new Error('Failed to ...')` — pas de parsing du body d'erreur

**Express / Sequelize**
- Routes dans `backend/routes/` → contrôleurs `backend/controllers/xxxcontroller.js` (tout en minuscules, sans tiret)
- Pattern contrôleur OBLIGATOIRE (durci story 7.5) : `req.session.user` (uid) → 401 si absent → **requête scopée** `Model.findOne({ where: { uid, userUid } })` → 404 si `null`. L'ownership passe par le `where`, **jamais par un 403** : « pas à toi » doit être indistinguable de « n'existe pas » (anti-IDOR / anti-oracle d'énumération). Ne PAS revenir à `findByPk` + `entity.userUid !== userId → 403`. Un 403 ne subsiste que pour un refus **non-ownership** légitime (ex. topic système « Free practice »).
- Réponses : entité JSON brute (pas d'enveloppe `{data:...}`) ; delete → `{ message: '...' }`
- Auth : `middleware/authsess.js` vérifie `req.session.loggedIn === true` (le JWT en session n'est JAMAIS vérifié — ne pas s'appuyer dessus)
- Modèles : PK `uid` UUID v4, `timestamps: true` ; chargés automatiquement par lecture du dossier `models/` (créer le fichier suffit)
- Convention colonnes : camelCase JS + `field: 'snake_case'` en DB (comme `Songs`) — ATTENTION : `SongPlay` ne le fait pas (colonnes camelCase en DB), `Playlist` utilise `underscored: true` ; pour les NOUVELLES tables (Sessions, Sujets…), suivre le même pattern que l'existant majoritaire, c'est-à-dire le pattern `Songs` (field snake_case explicite)
- Migrations : sequelize-cli via `.sequelizerc` racine ; pattern d'idempotence OBLIGATOIRE —
  `const desc = await queryInterface.describeTable('X'); if (!desc.col) { await queryInterface.addColumn(...) }`
  (pour une création de table : garde sur `queryInterface.showAllTables()`)

### Testing Rules

- DEUX suites Jest indépendantes — ne jamais les mélanger :
  - Frontend : config dans `package.json` racine, env jsdom, tests dans `src/__tests__/`, setup `src/test/setupTests.ts`, lancés par `npm test` à la racine
  - Backend : `backend/jest.config.js`, env node, tests dans `backend/__tests__/`, lancés par `cd backend && npm test`
- Le hook husky pre-commit lance LES DEUX suites (frontend puis backend) — un commit ne passe que si tout est vert
- Backend : les modèles sont mockés via `jest.mock('../models')` — pas de DB réelle dans les tests, suivre ce pattern pour les nouveaux contrôleurs
- Frontend : Testing Library (render + screen + fireEvent/userEvent) — tester le comportement visible, pas l'implémentation
- Nouveaux tests nommés `*.test.ts(x)` à côté des existants dans `__tests__/`

### Code Quality & Style Rules

- ESLint : config racine (`eslint.config.js`) ne couvre que `**/*.{ts,tsx}` ; le backend a son propre lint (`cd backend && npm run lint`) — lancer les deux selon ce qui est touché
- Nommage : PascalCase composants/pages (`SongForm.tsx`), camelCase services/utils (`songService.ts`), contrôleurs backend en minuscules collées (`songcontroller.js`)
- Tailwind only — pas de CSS custom ni de styled-components ; réutiliser les couleurs du thème (`brand/primary/accent/secondary`)
- Commentaires : rares dans le codebase — n'en ajouter que pour du non-évident, en anglais

### Development Workflow Rules

- JAMAIS de travail direct sur `main` : créer une branche de feature (`feat/...`, `fix/...`), puis merger vers `main` une fois validée
- ATTENTION : tout merge/push sur `main` déploie en PRODUCTION via GitHub Action (pas d'environnement de staging) — `main` doit toujours être déployable
- Commits : Conventional Commits (`feat(songs): ...`, `fix(migrations): ...`, `chore:`, `ci:`) — cf. historique git
- Le hook pre-commit lance les deux suites de tests — ne JAMAIS commiter avec `--no-verify`
- Toute migration mergée part en prod : elle DOIT être idempotente et testée localement avant (`make migrate` ou release-migrate)
- Versions : bump de version dans package.json + tag → la CI crée la GitHub release

### Critical Don't-Miss Rules

**Anti-patterns à ne pas reproduire**
- Toute route à record DOIT scoper par `userUid` via `findOne({ where: { uid, userUid } })` → 404 (cf. pattern contrôleur). L'ancienne faille `getSong` (GET /api/songs/:uid sans ownership) a été fermée en story 7.5 ; ne jamais réintroduire de lecture/écriture scopée par `uid` seul
- `node-fetch` et `body-parser` sont utilisés mais absents des dépendances directes (transitifs) — ne pas les importer dans du nouveau code ; utiliser le `fetch` natif de Node 22 et `express.json()`
- La connexion Sequelize est créée deux fois (db.js puis models/index.js) — la source de vérité est `models/index.js`
- Fichiers morts à ignorer : `test-scrape.js`, `backend/test-*.js`, `cookies.txt` — ne pas s'en inspirer

**Pièges d'environnement**
- `NODE_ENV` non défini ⇒ défaut `production` (db.js, models/index.js) — en local, toujours exporter `NODE_ENV=development`
- ENV requis : `DATABASE_URL_DEV` / `DATABASE_URL_PROD`, `JWT_SECRET` ; la config dev exige SSL Postgres même en docker local (`rejectUnauthorized: false`)
- Postgres local sur le port 5433 (pas 5432) — cf. docker-compose

**Pièges métier (itération journal/heatmap/sujets)**
- `Song.lastPlayed` est DÉNORMALISÉ et global (pas par instrument) ; le vrai historique par instrument vit dans `SongPlays` (avec `instrumentType` string + `instrumentUid` nullable) — toute logique « dernier joué par instrument » se dérive de SongPlays
- `markSongPlayed` horodate côté serveur (`new Date()`) — à corriger : le « jour » doit venir de la date locale du client (FR19/FR21 du PRD)
- `SongPlay` n'a PAS de `userUid` : l'ownership passe par le Song parent — en tenir compte dans les requêtes d'agrégation (jointure obligatoire)
- Les colonnes de `SongPlays` sont en camelCase en DB (exception historique) — ne pas supposer du snake_case dans les requêtes brutes

**Sécurité**
- Mots de passe : bcryptjs via le setter du modèle User (jamais de hash manuel) ; `defaultScope` exclut `password` — ne jamais le contourner sauf login (`scope(null)`)
- CORS hardcodé (`https://musician-tools.app` / `localhost:5173`) dans server.js — à étendre si nouvel origin, pas de wildcard

**Catalog (données partagées) — 2 exceptions ASSUMÉES au réflexe 404/scoping (Epic 19+, archi 2026-07-12)**
- Le principe app-wide n'est PAS « tout est scopé `userUid` → 404 » mais : **« une réponse ne doit jamais révéler l'existence d'une ressource dont l'existence est confidentielle. »** Pour les données perso (existence secrète) → scoping + 404 anti-oracle (règle inchangée). Pour le **Catalog** (fiche lisible par TOUT connecté, existence non-secrète), le MÊME principe donne 2 exceptions :
  1. **Lecture Catalog non scopée `userUid`** : `catalogcontroller` fait `CatalogSong.findAll({ where: <filtres> })` **sans** `userUid` — c'est CORRECT (aucun secret à protéger), pas une régression IDOR. Ne PAS rescoper par réflexe.
  2. **Écriture Catalog → 403 franc** (middleware `requireCurator`, attribut `User.isCurator`), PAS 404 anti-oracle : la ressource est publique-aux-connectés, le seul secret est le privilège (pas une ressource). Le pattern 404 durci 7.5 ne s'applique donc PAS aux routes d'écriture Catalog.
- Frontière (v2) : si une fiche acquiert un état non-publié (draft/contribution communautaire), son existence redevient secrète → le 404 anti-oracle re-primerait. À re-décider le jour venu.
- ⚠️ Ces 2 points sont volontaires : ne pas les flagger en régression 7.5 en review. Marqués par un commentaire d'ancrage dans `catalogcontroller`/`requirecurator`.

---

## Usage Guidelines

**For AI Agents:**

- Read this file before implementing any code
- Follow ALL rules exactly as documented
- When in doubt, prefer the more restrictive option
- Update this file if new patterns emerge

**For Humans:**

- Keep this file lean and focused on agent needs
- Update when technology stack changes
- Review periodically for outdated rules
- Remove rules that become obvious over time

Last Updated: 2026-07-15 (ajout des 2 exceptions Catalog — données partagées, Epic 19+)
