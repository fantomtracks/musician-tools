# Story 7.6: Monter l'infra email transactionnel (Resend) + table AuthTokens

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a produit,
I want une brique d'envoi d'email et une table de tokens à usage unique,
so that les trois flux email (verify-signup, password-reset, change-email) reposent sur un socle sûr et partagé.

## Acceptance Criteria

1. **emailService (seul point d'envoi)** — `backend/services/emailService.js` : wrapper **Resend** (`const { Resend } = require('resend')`), configuré par `RESEND_API_KEY` / `EMAIL_FROM` / `APP_BASE_URL`. C'est le **seul** endroit qui envoie un email. [Source: epics.md#Story 7.6 ; architecture.md#Structure Patterns L245,#L389]
2. **Fail-fast au boot** — `RESEND_API_KEY`, `EMAIL_FROM`, `APP_BASE_URL` sont **obligatoires au démarrage** (comme `SESSION_SECRET` en 7.1) : `server.js` les ajoute à `requireEnv([...])` → `process.exit(1)` si absents. [Source: epics.md#Story 7.6 ; architecture.md#L163,#L234]
3. **Table AuthTokens** — migration `create-auth-tokens` (**idempotente** : garde `showAllTables()`) + modèle `backend/models/authtoken.js` (auto-chargé par `models/index.js`). Colonnes : `uid` (PK UUID v4), `userUid` (FK → `user_uid`, CASCADE), `type` **ENUM** `verify_email | password_reset | change_email`, `tokenHash` (sha256 hex), `payload` (JSONB nullable, ex. `pendingEmail`), `expiresAt`, `usedAt` (nullable) ; **pattern `Songs`** (camelCase JS + `field:'snake_case'` DB), `timestamps:true`. [Source: epics.md#Story 7.6 ; architecture.md#L129-131,#L226]
4. **Émission / vérification de token (usage unique, expirant)** — `backend/services/authTokenService.js` : `issueToken(userUid, type, payload?)` génère un **token opaque** `crypto.randomBytes(32).toString('base64url')`, **stocke son sha256** (`tokenHash`, jamais le clair), pose `expiresAt` selon le type (**verify_email 24 h, password_reset 1 h, change_email 1 h**) et **renvoie le token en clair** (pour l'email). `verifyToken(clearToken, type)` : retrouve par hash, rejette si `usedAt` non-null (déjà utilisé) ou `expiresAt` dépassé, sinon **marque `usedAt`** (usage unique) et renvoie `{ userUid, payload }`. [Source: epics.md#Story 7.6 ; architecture.md#Format Patterns L254-255]
5. **Messages anti-énumération centralisés** — `backend/constants/messages.js` : source unique (`CHECK_YOUR_INBOX`, …), réutilisée par tous les flux email. [Source: epics.md#Story 7.6 ; architecture.md#L258-259]
6. **Tests** — émission + vérification d'un token : hash match (le clair n'est jamais stocké), **usage unique** (2ᵉ vérif rejetée), **expiration** respectée ; emailService appelle Resend avec `from/to/subject/html` et propage une erreur Resend.

> ⚠️ **PRÉREQUIS DE DÉPLOIEMENT (risque crash-loop prod)** : l'AC2 rend `RESEND_API_KEY`/`EMAIL_FROM`/`APP_BASE_URL` obligatoires au boot. **Provisionner ces 3 secrets sur Fly AVANT de merger 7.6** (sinon prod crash-loop, comme l'aurait fait 7.1 sans `SESSION_SECRET`). En local : les ajouter à `backend/.env`. Le domaine d'envoi Resend doit être vérifié (SPF/DKIM) pour que les emails partent — mais l'envoi réel n'est exercé qu'à partir de 7.9.

## Tasks / Subtasks

- [ ] **Task 1 — Dépendance Resend** (AC: 1)
  - [ ] `cd backend && npm install resend@^6` (dernière 6.x). Vérifier `backend/package.json` + committer `package-lock.json`. Dépendance **pré-approuvée** (epics + archi) — pas de HALT.
- [ ] **Task 2 — `emailService.js`** (AC: 1)
  - [ ] `backend/services/emailService.js` (CommonJS, commentaires EN) : `const { Resend } = require('resend')` ; `const resend = new Resend(process.env.RESEND_API_KEY)`. Exporter `async function sendEmail({ to, subject, html })` → `const { data, error } = await resend.emails.send({ from: process.env.EMAIL_FROM, to, subject, html })` ; si `error` → `logger.error` + `throw createError(502, 'Email delivery failed')` (ne jamais laisser un échec passer silencieusement). Retourner `data` sinon. **Seul** point d'envoi (les flux 7.9–7.11 l'appelleront).
  - [ ] Ne PAS construire d'URL ici en dur : exposer/realyer `APP_BASE_URL` (les liens email seront formés par les flux consommateurs à partir de `process.env.APP_BASE_URL`).
- [ ] **Task 3 — Modèle + migration AuthTokens** (AC: 3)
  - [ ] `backend/models/authtoken.js` : `sequelize.define('AuthToken', {...}, { tableName: 'AuthTokens', timestamps: true })`. Colonnes : `uid` UUID/UUIDV4/PK ; `userUid` UUID notNull `field:'user_uid'` `references:{model:'Users',key:'uid'} onDelete:'CASCADE'` ; `type` `DataTypes.ENUM('verify_email','password_reset','change_email')` notNull ; `tokenHash` STRING notNull `field:'token_hash'` ; `payload` JSONB nullable ; `expiresAt` DATE notNull `field:'expires_at'` ; `usedAt` DATE nullable `field:'used_at'`. `associate`: `belongsTo(models.User, { foreignKey: 'userUid' })`.
  - [ ] Migration `migrations/20260623000200-create-auth-tokens.js` : **idempotente** — `const tables = await queryInterface.showAllTables(); if (!tables.map(t=>t.toLowerCase?t.toLowerCase():t).includes('authtokens')) { await queryInterface.createTable('AuthTokens', {...colonnes snake_case..., createdAt/updatedAt}); await queryInterface.addIndex('AuthTokens', ['token_hash']); }`. Colonnes en **snake_case** (`user_uid`, `token_hash`, `expires_at`, `used_at`). `down`: `dropTable('AuthTokens')` (+ commentaire : le type ENUM Postgres survit au drop ; rollback non utilisé en prod — migrate up only).
  - [ ] Tester la migration en local (`make migrate` / NODE_ENV=development) avant merge — toute migration part en prod.
- [ ] **Task 4 — `authTokenService.js`** (AC: 4)
  - [ ] `backend/services/authTokenService.js` (CommonJS) : `const crypto = require('crypto')` ; `const { AuthToken } = require('../models')`. Constantes d'expiration par type (ms) : `verify_email` 24 h, `password_reset` 1 h, `change_email` 1 h.
  - [ ] `hashToken(clear)` = `crypto.createHash('sha256').update(clear).digest('hex')` (helper privé).
  - [ ] `async issueToken(userUid, type, payload = null)` : token clair `crypto.randomBytes(32).toString('base64url')` ; `expiresAt = new Date(Date.now() + EXPIRY[type])` ; `AuthToken.create({ userUid, type, tokenHash: hashToken(clear), payload, expiresAt })` ; **return le token clair** (jamais persisté en clair).
  - [ ] `async verifyToken(clearToken, type)` : `AuthToken.findOne({ where: { tokenHash: hashToken(clearToken), type } })` ; si absent → `null` ; si `usedAt` non-null → `null` (usage unique) ; si `expiresAt <= now` → `null` ; sinon `await token.update({ usedAt: new Date() })` et `return { userUid: token.userUid, payload: token.payload }`. (Comparaison par hash, jamais d'égalité sur le clair.)
- [ ] **Task 5 — `constants/messages.js`** (AC: 5)
  - [ ] `backend/constants/messages.js` (pattern `constants/topics.js`) : `module.exports = { CHECK_YOUR_INBOX: 'If an account matches, we sent an email with the next steps.' }` (message générique anti-énumération, EN). Étoffable par les flux suivants ; ne pas y mettre de message révélateur.
- [ ] **Task 6 — Fail-fast ENV au boot** (AC: 2)
  - [ ] `backend/server.js` : étendre `requireEnv(['SESSION_SECRET'])` → `requireEnv(['SESSION_SECRET', 'RESEND_API_KEY', 'EMAIL_FROM', 'APP_BASE_URL'])`. (Le bloc try/catch existant fait déjà `process.exit(1)`.)
  - [ ] (Optionnel, cohérent 7.1) étendre la cible Makefile `check-env` pour signaler ces clés manquantes en dev.
- [ ] **Task 7 — Tests** (AC: 6)
  - [ ] `backend/__tests__/authTokenService.test.js` (mock `../models` : `AuthToken.create/findOne` + instance `update`) : `issueToken` stocke un `tokenHash` = sha256 du clair retourné (le clair n'apparaît pas dans `create`) et un `expiresAt` futur conforme au type ; `verifyToken` valide → marque `usedAt` + renvoie `{userUid,payload}` ; **2ᵉ appel (usedAt non-null) → null** ; **expiré → null** ; **hash inconnu → null**.
  - [ ] `backend/__tests__/emailService.test.js` (`jest.mock('resend')`) : `sendEmail` appelle `resend.emails.send` avec `from=EMAIL_FROM`, `to/subject/html` ; un `{ error }` Resend → throw 502.
  - [ ] Suites back + lint backend verts ; husky vert sans `--no-verify`.

## Dev Notes

### Contexte & design retenu

7.6 = **socle partagé** des 3 flux email à venir (7.9 verify-signup, 7.10 reset, 7.11 change-email) : un point d'envoi unique (`emailService`), une table de tokens **opaques, hashés, à usage unique et expirants** (`AuthTokens` + `authTokenService`), et une source unique de messages anti-énumération. **Aucune route/flux email n'est branché ici** — uniquement l'infra réutilisable. [Source: epics.md#Story 7.6 ; architecture.md#L207,#L212]

> ⚠️ **Scope** : pas de contrôleur ni de route email dans 7.6. Ne pas anticiper 7.9/7.10/7.11. Livrables = service email + modèle/migration + service token + constantes + fail-fast ENV + tests.

### Resend SDK (recherche web 2026-06-23)

- Paquet `resend`, dernière **6.x** (~6.14) ; `npm i resend@^6`. CommonJS : `const { Resend } = require('resend')`.
- `const resend = new Resend(apiKey)` ; `const { data, error } = await resend.emails.send({ from, to, subject, html })`. **Ne throw pas** sur erreur API → l'erreur est dans `error` : il FAUT la tester et la propager (sinon échec silencieux).
- Nécessite une **clé API** + un **domaine vérifié** (SPF/DKIM) côté Resend pour un envoi réel. L'envoi n'est exercé qu'à partir de 7.9 ; 7.6 ne fait que monter le wrapper.
- [Source: https://resend.com/docs/send-with-nodejs ; https://www.npmjs.com/package/resend]

### Patterns existants à suivre (lus 2026-06-23)

- **`requireEnv`** (`config/requireEnv.js`, 7.1) : `requireEnv(keys)` throw si une clé est absente/vide ; `server.js` l'appelle dans un try/catch → `process.exit(1)`. Étendre la liste (Task 6).
- **Modèle** (`models/song.js`) : `sequelize.define(...)`, `uid` UUID/UUIDV4/PK, FK avec `field:'user_uid'` + `references` + `onDelete`, `field:'snake_case'` pour le mapping DB, `tableName` + `timestamps:true`, `associate` via `belongsTo`. Auto-chargé : **créer le fichier dans `models/` suffit** (`models/index.js` lit le dossier).
- **Migration** (`migrations/20251220000001-create-users.js`) : `queryInterface.createTable('X', { uid, …, createdAt/updatedAt: Sequelize.DATE defaultValue CURRENT_TIMESTAMP })` + `addIndex`. Y AJOUTER la **garde d'idempotence** `showAllTables()` (obligatoire pour toute nouvelle migration — project-context).
- **Service** (`services/songMetadataService.js`) : camelCase, CommonJS, fonctions exportées. → `emailService.js`, `authTokenService.js` même style.
- **Constantes** (`constants/topics.js`) : `'use strict'` + `module.exports = { … }`. → `constants/messages.js`.
- **Config env** (`config/config.js`) : `dotenv` chargé hors prod ; les ENV viennent de `backend/.env` en local. `EMAIL_FROM`/`RESEND_API_KEY`/`APP_BASE_URL` y seront lus via `process.env`.

### Pièges à éviter

- **Backend CommonJS** : `require`/`module.exports`, jamais d'ESM. Le SDK Resend s'importe en `const { Resend } = require('resend')`. Commentaires **EN**. [Source: project-context.md]
- **Jamais le token en clair en base** : stocker `sha256(clear)` ; comparer par hash. Le clair n'existe que dans la valeur retournée (→ email) et n'est jamais loggé.
- **Usage unique** : `verifyToken` doit poser `usedAt` AVANT de considérer le token consommé ; un 2ᵉ appel doit échouer. (Course concurrente possible mais hors-scope beta — report assumé si besoin.)
- **Resend `{data,error}`** : tester `error` et propager (502) ; ne pas supposer un throw.
- **Migration idempotente + prod** : garde `showAllTables()` ; tester en local avant merge ; le type ENUM Postgres n'est pas nettoyé par `dropTable` (rollback non utilisé — migrate up only). [Source: project-context.md, deferred-work]
- **Fail-fast = prérequis de déploiement** : provisionner les 3 ENV sur Fly **avant** le merge (sinon crash-loop). En dev, sans ces clés l'app ne démarre plus → les mettre dans `backend/.env`. Les **tests** ne bootent pas `server.js` (ils ciblent services/modèles avec mocks) → pas bloqués par le fail-fast ; `emailService` est testé via `jest.mock('resend')`.
- **Modèles mockés dans les tests** (`jest.mock('../models')`) — suivre ce pattern pour `authTokenService.test.js`. [Source: project-context.md#Testing Rules]

### Project Structure Notes

- **NEW** : `backend/services/emailService.js`, `backend/services/authTokenService.js`, `backend/models/authtoken.js`, `backend/migrations/20260623000200-create-auth-tokens.js`, `backend/constants/messages.js`, `backend/__tests__/authTokenService.test.js`, `backend/__tests__/emailService.test.js`.
- **EDIT** : `backend/server.js` (requireEnv +3 clés), `backend/package.json` + `package-lock.json` (dep `resend`), éventuellement `Makefile` (check-env).
- **Risque déploiement** : migration (idempotente, testée local) + nouveaux ENV obligatoires (provisionner avant merge). Pas de front.
- Conventions : modèle/migration minuscules, service camelCase, table `AuthTokens` pattern `Songs`. [Source: architecture.md#Structure Patterns, project-context.md]

### References

- [Source: epics.md#Story 7.6] — ACs (emailService, AuthTokens, token opaque hashé/usage unique/expirant, messages)
- [Source: architecture.md#L129-133 (AuthTokens), #L226 (pattern Songs), #L245/#L389 (emailService camelCase), #L254-259 (token format + messages), #L163/#L234/#L372 (ENV fail-fast + provisioning Fly)]
- [Source: config/requireEnv.js, server.js] — fail-fast 7.1 à étendre
- [Source: models/song.js, models/index.js, migrations/20251220000001-create-users.js] — patterns modèle/migration
- [Source: services/songMetadataService.js, constants/topics.js] — style service/constantes
- [Source: story 7.1] — secret fail-fast ; [Source: story 7.2] — migration idempotente testée avant merge
- [Web 2026-06-23: Resend Node SDK ^6, emails.send → {data,error}]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

### Change Log
