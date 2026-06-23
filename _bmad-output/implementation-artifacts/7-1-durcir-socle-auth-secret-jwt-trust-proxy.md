---
baseline_commit: 64aceb3ec98390c18d2e66ecd8afb0661e73c2f5
---

# Story 7.1: Durcir le socle d'auth (secret fail-fast, retrait du JWT, trust proxy)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a mainteneur du produit,
I want que l'app refuse de démarrer sans ses secrets et n'émette plus de JWT mort,
so that la base d'auth est saine avant d'exposer la moindre route de compte.

## Acceptance Criteria

1. **Secret fail-fast** — Au démarrage, si `SESSION_SECRET` est absent de l'environnement, le process échoue immédiatement (`process.exit(1)`) avec un log explicite. Plus aucun fallback `'musician-secret'` / `'MUSICIAN_SECRET'` / `'musician-secret-key'` ne subsiste dans le code.
2. **Retrait du JWT vestigial** — Sur login **et** register, aucun JWT n'est signé, renvoyé ni stocké en session (`jwt.sign` retiré, champ `token` retiré de `req.session` et des réponses JSON). `authsess` ne s'appuie que sur `req.session.loggedIn`. La dépendance `jsonwebtoken` est retirée de `backend/package.json`.
3. **Trust proxy** — `app.set('trust proxy', 1)` est posé (prérequis du rate-limiting par IP réelle, story 7.4).
4. **Tests** — La suite backend couvre (a) le fail-fast (secret absent → chemin d'échec/exit non-zéro) et (b) l'absence de tout champ `token` dans la réponse de login **et** de register.

## Tasks / Subtasks

- [x] **Task 1 — Secret fail-fast au boot** (AC: 1)
  - [x] Créer `backend/config/requireEnv.js` : fonction `requireEnv(keys)` qui lit `process.env`, et **throw** une `Error` listant les clés manquantes (testable unitairement, sans booter le serveur). CommonJS, commentaires en anglais.
  - [x] Dans `server.js`, **avant** `app.use(session(sessionConfig))`, résoudre `const SESSION_SECRET = process.env.SESSION_SECRET;` via `requireEnv(['SESSION_SECRET'])` enveloppé d'un `try/catch` → en cas d'erreur : `logger.error(...)` explicite puis `process.exit(1)`.
  - [x] Remplacer `secret: config.jwtsecret || 'musician-secret'` (server.js:73) par `secret: SESSION_SECRET`.
  - [x] Supprimer la clé `jwtsecret` (et ses fallbacks `'musician-secret-key'`) des 4 blocs de `backend/config/config.js` — elle devient morte (seul `server.js:73` la consommait). Ne PAS toucher `url`/`dialect`/`connectionoptions` (utilisés par sequelize-cli).
  - [x] Mettre à jour `backend/.env.example` : ajouter `SESSION_SECRET=your-session-secret-here` ; **marquer `JWT_SECRET` comme obsolète** (commentaire « deprecated, no longer consumed — see story 7.1 ») sans le retirer (décision Q2 : nettoyage Fly différé, dormant no-op).
- [x] **Task 2 — Retrait total du JWT vestigial** (AC: 2)
  - [x] `controllers/usercontroller.js` : retirer `const jwt = require('jsonwebtoken')` (l.4) ; dans `createUser` retirer le bloc `jwt.sign` (l.37-41), `newSession.token = token` (l.46) et `token` du JSON de réponse (l.53) ; dans `loginUser` retirer `jwt.sign` (l.88-92), `newSession.token = token` (l.97) et `token` du JSON (l.103). Conserver tout le reste (seed Free practice, `auth:true`, `user{...}`, `sessionId`).
  - [x] `middleware/authsess.js` : retirer `const jwt = require('jsonwebtoken')` (l.1, import mort). Aucune autre logique ne change.
  - [x] Retirer `"jsonwebtoken": "^8.5.1"` de `backend/package.json` (`dependencies`) et régénérer le lockfile (`cd backend && npm install`). Vérifier qu'aucun `require('jsonwebtoken')` ne subsiste (`grep -rn jsonwebtoken backend --include=*.js | grep -v node_modules`).
  - [x] Frontend (cleanup mineur) : retirer le champ `token?: string;` de `AuthResponse` dans `src/services/authService.ts:22` — aucun consommateur ne le lit (vérifié), donc 0 régression ; garde le type honnête.
- [x] **Task 3 — Trust proxy** (AC: 3)
  - [x] Vérifier que `app.set('trust proxy', 1)` est présent dans `server.js` (déjà à la l.69). Convertir le commentaire français adjacent (l.68 « Indique à Express… ») en anglais et y référencer la dépendance rate-limit (story 7.4). Aucun changement de comportement.
- [x] **Task 4 — Tests** (AC: 4)
  - [x] `backend/__tests__/requireEnv.test.js` (nouveau) : avec `SESSION_SECRET` supprimé de `process.env`, `requireEnv(['SESSION_SECRET'])` **throw** ; avec la clé présente, ne throw pas. (C'est la garantie testable du fail-fast.)
  - [x] `backend/__tests__/usercontroller.test.js` : **retirer** le `jest.mock('jsonwebtoken', …)` (l.11-13, devenu inutile) ; ajouter une assertion `expect(res.json.mock.calls[0][0]).not.toHaveProperty('token')` au test `createUser` 201 existant ; ajouter un `describe('usercontroller.loginUser')` avec un cas succès qui assert l'absence de `token` dans la réponse (mock `User.scope(null).findOne` → user avec `validPassword: async () => true`).
  - [x] Lancer les **deux** suites (`npm test` racine + `cd backend && npm test`) et le lint backend (`cd backend && npm run lint`). Husky pre-commit doit passer sans `--no-verify`.

### Review Findings

_Code review 2026-06-23 — 3 couches adversariales (Blind Hunter, Edge Case Hunter, Acceptance Auditor). **Les 4 AC sont pleinement satisfaites** ; 2 patches, 1 deferred, 8 dismissed (faux positifs / artefacts de périmètre du diff / choix intentionnels)._

- [x] [Review][Patch] README backend documente encore `JWT_SECRET` et omet `SESSION_SECRET` (désormais requis au boot) [backend/README.md:119] — corrigé : `SESSION_SECRET` documenté requis, `JWT_SECRET` marqué deprecated
- [x] [Review][Patch] Le `.env` local de dev n'a pas `SESSION_SECRET` → `make start` crash-loop au prochain boot [backend/.env] — corrigé : `SESSION_SECRET` ajouté au `.env` local (miroir de `JWT_SECRET`)
- [x] [Review][Defer→Fixed] Pré-flight env Makefile : `make start`/`setup` n'avertissaient pas de la variable requise [Makefile] — **finalement corrigé sur la branche** : cible `check-env` (garde `SESSION_SECRET`) branchée sur les cibles qui bootent le backend

## Dev Notes

### Contexte & objectif

Première story de l'Epic 7, **sans dépendance externe** : on assainit le socle d'auth existant avant d'exposer les routes de compte (stories 7.2+). Trois durcissements indépendants : (1) secret obligatoire au boot, (2) suppression d'un JWT qui n'a **jamais** été vérifié (mort), (3) confirmation de `trust proxy` (prérequis du rate-limiting 7.4). [Source: architecture.md#Authentication & Security ; epics.md#Story 7.1]

### État actuel des fichiers touchés (lu — à préserver hors des changements ci-dessus)

- **`backend/server.js`** — boot = IIFE async (`sequelize.sync`), puis config session. `secret: config.jwtsecret || 'musician-secret'` (l.73). **`app.set('trust proxy', 1)` existe déjà (l.69)** → AC3 quasi acquise (verif + commentaire EN). Store PG en prod seulement ; `sameSite: 'lax'`, `secure` en prod. Ne rien casser de la config session/CORS/static.
- **`backend/config/config.js`** — fournit `jwtsecret` par env (fallbacks `'musician-secret-key'` en dev/test/staging ; `process.env.JWT_SECRET` en prod). **Sert aussi de config sequelize-cli** → ne toucher QUE la clé `jwtsecret`.
- **`backend/controllers/usercontroller.js`** — `createUser` (avec seed Free practice story 8.2 — **à préserver intégralement**) et `loginUser` signent un JWT et le posent en session + réponse. `logoutUser` inchangé.
- **`backend/middleware/authsess.js`** — importe `jwt` mais ne l'utilise **pas** ; vérifie uniquement `session.loggedIn === true`. Import mort à retirer.

### Garde-fous (project-context.md)

- Backend = **JavaScript CommonJS** strict : `require`/`module.exports`, jamais d'ESM, pas de `.ts` dans `backend/`. [Source: project-context.md#JavaScript backend]
- **Langue : tout en anglais** (code + commentaires), y compris en réécrivant les vieux commentaires FR touchés. [Source: project-context.md#Langue]
- Erreurs HTTP via `http-errors` ; réponses JSON brutes (pas d'enveloppe `{data}`). [Source: project-context.md#Express / Sequelize]
- Mots de passe : `bcryptjs` via setter du modèle ; `defaultScope` exclut `password`, login utilise `User.scope(null)` (déjà le cas). Ne pas y toucher ici.
- **Pièges ENV** : `NODE_ENV` non défini ⇒ défaut `production`. Le fail-fast ne doit s'exécuter **qu'au boot serveur** (dans `server.js`), pas au `require` de `config.js` — sinon il casserait sequelize-cli et les tests de contrôleurs (qui ne bootent pas `server.js`). [Source: project-context.md#Pièges d'environnement]

### ⚠️ Prérequis de déploiement (CRITIQUE — `main` = prod, pas de staging)

Cette story rend `SESSION_SECRET` **obligatoire au boot**. **Avant** de merger sur `main` :
1. Définir `SESSION_SECRET` dans les secrets Fly.io (`flyctl secrets set SESSION_SECRET=…`), **sinon le boot prod fait `exit(1)` = outage**.
2. **Décidé (Q1)** : poser `SESSION_SECRET` = **valeur actuelle de `JWT_SECRET`**, pour **ne pas invalider les sessions existantes** (un secret différent re-signe les cookies → déconnexion de tous les users).
3. En **local**, ajouter `SESSION_SECRET` à ton `.env` avant `make start`, sinon le serveur dev ne démarre plus.

### Patterns testing

- Deux suites Jest indépendantes ; ne pas les mélanger. Backend : `backend/jest.config.js`, env node, mocks via `jest.mock('../models')`. [Source: project-context.md#Testing Rules]
- Les tests de contrôleurs **n'instancient pas** le serveur (pas de supertest dans le repo) : ils appellent la fonction avec `req/res/next` mockés (cf. `usercontroller.test.js`). C'est pourquoi le fail-fast est testé via le helper `requireEnv` isolé, pas via un boot réel.
- Variante optionnelle plus fidèle (non requise) : un test `child_process.spawnSync(node, ['server.js'])` sans `SESSION_SECRET` assertant un code de sortie non-zéro. Coûteux/flaky → préférer le test unitaire du helper.

### Anti-régression (vérifié)

- Le champ `token` des réponses login/register **n'est lu nulle part** côté front (seul `AuthResponse.token?` le déclare, jamais consommé — l'auth repose sur le cookie de session `credentials:'include'`). Le retirer est sûr. [Source: src/services/authService.ts ; project-context.md#Sécurité « JWT jamais vérifié »]
- `authsess` ne dépend pas de `jwt` → retrait de l'import sans impact.

### Project Structure Notes

- Nouveau fichier : `backend/config/requireEnv.js` (helper d'env, CommonJS). Cohérent avec l'arborescence cible architecture (`server.js` [EXT] « secret fail-fast »). [Source: architecture.md#Project Structure & Boundaries]
- Nouveau test : `backend/__tests__/requireEnv.test.js`. Édité : `backend/__tests__/usercontroller.test.js`.
- Aucune migration, aucun modèle, aucune route nouvelle dans cette story (purement durcissement).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.1] — user story + ACs
- [Source: _bmad-output/planning-artifacts/architecture.md#Secrets / #Authentication & Security] — fail-fast, retrait JWT, trust proxy, `SESSION_SECRET`
- [Source: _bmad-output/planning-artifacts/architecture.md#Decision Impact Analysis] — séquence : 7.1 = socle sans dépendance externe
- [Source: _bmad-output/project-context.md] — règles CommonJS, langue EN, pièges ENV, testing, sécurité

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

- Backend Jest : 7 suites / **140 tests** verts (dont `requireEnv` x3 + `loginUser` no-JWT).
- Backend ESLint : clean.
- Frontend `tsc -b` : exit 0 ; Jest : 23 suites / **236 tests** verts.
- Greps de contrôle : 0 occurrence de `musician-secret` / `MUSICIAN_SECRET` / `musician-secret-key` ; 0 `require('jsonwebtoken')` hors `node_modules` ; `jsonwebtoken` absent de `package.json`.

### Completion Notes List

- **AC1 (fail-fast)** : helper `requireEnv.js` (throw sur clé manquante/vide) + garde `try/catch → logger.error + process.exit(1)` au boot de `server.js`, **avant** la config session. Secret session = `process.env.SESSION_SECRET` (plus de fallback). Clé morte `jwtsecret` retirée des 4 blocs de `config.js`.
- **AC2 (no JWT)** : `jwt.sign`, `newSession.token` et le champ `token` supprimés de `createUser` **et** `loginUser` ; import mort retiré de `authsess.js` (inchangé fonctionnellement — repose sur `session.loggedIn`) ; `jsonwebtoken` retiré de `package.json` + lockfile régénéré. Cleanup front : champ `token?` retiré de `AuthResponse` (aucun consommateur).
- **AC3 (trust proxy)** : `app.set('trust proxy', 1)` déjà présent ; commentaire FR→EN avec référence au rate-limit (7.4).
- **AC4 (tests)** : `requireEnv.test.js` (fail-fast) + assertions « pas de `token` » sur register et login.
- **Régressions** : aucune (seed Free practice 8.2, flux session, CORS, store PG préservés).
- ⚠️ **Avant merge** : `flyctl secrets set SESSION_SECRET=<valeur actuelle de JWT_SECRET>` (cf. Q1). Sans ça, boot prod = `exit(1)`.

### File List

- `backend/config/requireEnv.js` (NEW)
- `backend/server.js` (EDIT)
- `backend/config/config.js` (EDIT)
- `backend/controllers/usercontroller.js` (EDIT)
- `backend/middleware/authsess.js` (EDIT)
- `backend/package.json` (EDIT — retrait jsonwebtoken)
- `backend/package-lock.json` (EDIT — lockfile régénéré)
- `backend/.env.example` (EDIT)
- `backend/__tests__/requireEnv.test.js` (NEW)
- `backend/__tests__/usercontroller.test.js` (EDIT)
- `src/services/authService.ts` (EDIT — retrait champ `token?`)

### Change Log

- 2026-06-23 — Implémentation story 7.1 : secret fail-fast au boot (`SESSION_SECRET` obligatoire, fin des fallbacks), retrait total du JWT vestigial (`jsonwebtoken` désinstallé), `trust proxy` confirmé. Tests back (140) + front (236) verts.

## Open Questions — RÉSOLUES (2026-06-23)

1. ✅ **Valeur de `SESSION_SECRET` en prod** → reprendre la **valeur actuelle de `JWT_SECRET`** (préserve les sessions, pas de déconnexion). Action Fly.io avant merge.
2. ✅ **`JWT_SECRET` après cette story** → le **laisser dormant** ; marqué obsolète dans `.env.example`, nettoyage Fly différé (no-op).
