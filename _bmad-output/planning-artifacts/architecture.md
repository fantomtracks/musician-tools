---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
completedAt: '2026-06-21'
inputDocuments:
  - '_bmad-output/planning-artifacts/briefs/brief-musician-tools-2026-06-21/brief.md'
  - '_bmad-output/planning-artifacts/briefs/brief-musician-tools-2026-06-21/addendum.md'
  - '_bmad-output/project-context.md'
  - '_bmad-output/planning-artifacts/epics.md'
workflowType: 'architecture'
project_name: 'musician-tools'
user_name: 'northwood'
date: '2026-06-21'
scope: 'Epic 7 — Compte utilisateur + design sécurité app-wide'
prdStatus: 'no-dedicated-prd — Epic 7 hors PRD initial ; source = brief + addendum (validé northwood 2026-06-21)'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

**Scope:** Epic 7 — Compte utilisateur (gestion de profil, reset/vérification email, identité Discord-style) **et** design sécurité app-wide (account takeover, IDOR, CSRF, énumération de comptes).

## Project Context Analysis

### Requirements Overview

**Functional Requirements (dérivés du brief Epic 7 — pas de PRD formel) :**
- Page Profil (authentifiée, accès Header) : édition nom d'affichage, email, mot de passe.
- Changement d'email en *verify-before-switch* (lien de confirmation, `pendingEmail` + token signé/expirant).
- Vérification d'email obligatoire à l'inscription.
- Reset de mot de passe par email (« mot de passe oublié »).
- Login *email-only* (retrait du `Op.or` name/email).
- Identité Discord-style : `name` non-unique + `discriminator #NNNN` → handle unique partageable (`name#NNNN`).
- Infra email transactionnel (socle commun des 3 flux email).

**Non-Functional Requirements (sécurité = bloqueur de l'épic) :**
- ① Account takeover : mdp ≥ 10 car., mdp actuel exigé (`validPassword`), invalidation des autres sessions au change-mdp (store Postgres), rate-limiting (`express-rate-limit`) sur login + change-password.
- ② IDOR / ownership : audit systématique vs pattern canonique ; corriger `getSong` (aucun ownership) et la non-validation d'`instrumentUid` dans `markSongPlayed`.
- ③ CSRF : token (synchronizer ou double-submit) sur toutes les mutations, `logout` GET→POST, retrait du JWT vestigial, secret(s) obligatoire(s) au boot (fin du fallback `'MUSICIAN_SECRET'`).
- ④ Énumération : collapse 403→404 partout (requêtes scopées `where:{uid,userUid}`), réponses email génériques + notification du vrai propriétaire, nom jamais refusé, email normalisé + unique insensible à la casse (`citext`/`LOWER()`).

**Scale & Complexity :**
- Primary domain : full-stack web (React 19 + Express 4 / Sequelize 6 / PostgreSQL).
- Complexity level : moyenne (techniquement), risque élevé (sécurité + migration de prod sans staging).
- Composants architecturaux estimés : ~6 (infra email, middleware CSRF, middleware rate-limit, refonte session/secret, modèle/migration Users, page Profil + flux front).

### Technical Constraints & Dependencies

- Backend JavaScript **CommonJS** strict (pas de TS, pas d'ESM dans `backend/`).
- Pattern contrôleur ownership canonique obligatoire ; nouvelles routes ne doivent pas copier `getSong`.
- Sessions par cookie via `express-session` + `connect-pg-simple` (store Postgres, table `session`) — support de l'invalidation ciblée.
- Migrations **idempotentes** (sequelize-cli) ; `main` → déploiement **prod** automatique, **aucun staging** → toute migration testée localement avant merge.
- Secrets via env (`JWT_SECRET` existant ; nouveau(x) secret(s) email/CSRF à formaliser, obligatoires au boot).
- Modèle `Users` actuel : contrainte `unique` sur `name` (`user.js:14-21`) à retirer ; CORS mono-origine (`server.js:104-112`).
- **Nouvelle dépendance externe** : fournisseur d'email transactionnel (à choisir) — point d'intégration et de configuration sortant.

### Cross-Cutting Concerns Identified

- **Auth & session** : cycle de vie session, invalidation multi-session, secret(s) au boot.
- **Sécurité transverse** : CSRF (toutes mutations), rate-limiting (endpoints sensibles), normalisation 403→404 (toutes routes).
- **Identité** : modèle `name#discriminator`, unicité, normalisation email — impacte register, login, profil, et le futur partage de songlist.
- **Email/notifications** : brique partagée par change-email, signup-verification, password-reset.
- **Migration de données** : backfill discriminant + normalisation email sur comptes beta existants, en prod, sans staging.

## Starter Template Evaluation

### Primary Technology Domain

Full-stack web — **brownfield, déjà en production (v1.4.0)**. Aucune évaluation de starter
template : l'Epic 7 se greffe sur une fondation existante, établie et déployée.

### Decision: N/A — fondation existante conservée

Aucun nouveau starter. La stack en place fait foi (cf. `project-context.md`) :

**Frontend**
- React 19.1 + react-router-dom 6.28, TypeScript ~5.8 (strict, verbatimModuleSyntax)
- Vite 7 (proxy `/api` → :3001), Tailwind 3.4 (darkMode class), Jest 29 + Testing Library
- Pas de state lib : useState/useMemo + Context (auth only) ; persistance UI via localStorage

**Backend**
- Node 22 + Express ~4.16 (pas 5), JavaScript **CommonJS** (pas de TS)
- Sequelize 6 + sequelize-cli, PostgreSQL (pg)
- express-session + connect-pg-simple (store Postgres prod), bcryptjs, winston

**Déploiement**
- Push `main` → GitHub Action → `flyctl deploy` (app `musician-tools`, port 3001)
- Migrations idempotentes via release_command + `sync({alter:false})` au boot
- `both.Dockerfile` multi-stage (Vite → `backend/public/`, Express sert le SPA)
- Dev local : docker-compose (Postgres 15 @ 5433) + Makefile

**Conséquence pour l'Epic 7 :** pas de story d'init. Les seules briques *nouvelles* sont
internes à cette fondation : infra email transactionnel, middleware CSRF, middleware
rate-limit — traitées comme des décisions d'architecture dans les étapes suivantes,
pas comme un changement de fondation.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical (bloquent l'implémentation) :**
- Infra email Resend, modèle d'identité `(name, discriminator)`, tokens auth en DB hashés,
  secret fail-fast au boot, migration `Users` idempotente.

**Important (façonnent l'archi) :**
- Soft gate de vérification, CSRF synchronizer token, rate-limiting, collapse 403→404.

**Différées (hors Epic 7, dette consciente) :**
- Partage de songlist, verrous de concurrence app-wide (cf. `deferred-work.md`),
  SSO/OAuth/2FA.

### Data Architecture

**Modèle `Users` (migration idempotente, testée local avant merge — `main` = prod) :**
- Drop `unique` sur `name` ; ajout `discriminator` (STRING `0001`–`9999`).
- **Index unique sur la paire `(name, discriminator)`** (collation cohérente avec email).
- Ajout `emailVerified` (BOOLEAN, default false) et `pendingEmail` (STRING null, verify-before-switch).
- **Email en `citext`** : `CREATE EXTENSION IF NOT EXISTS citext` + `ALTER COLUMN email TYPE citext`
  → unicité et comparaisons insensibles à la casse par construction ; `loginUser` n'a plus
  besoin de `iLike`. Valeurs existantes normalisées (lowercase/trim) à la migration.

**Discriminant :**
- Attribution à l'inscription : random `0001`–`9999` **libre pour ce nom**, retry sur collision.
- **Stabilité au rename : garder le discriminant courant si `(nouveau_nom, disc)` libre, sinon réattribuer un libre** (comportement Discord historique).
- Garde-fou d'épuisement : si les 9999 sont pris (hors d'atteinte beta), refuser le nom (« ce nom est plein »).

**Table `AuthTokens` (verify-signup / password-reset / change-email) :**
- Colonnes : `uid` (PK), `userUid` (FK), `type` (ENUM), `tokenHash` (sha256 du token opaque,
  jamais le token en clair), `payload` (ex. `pendingEmail` pour change-email), `expiresAt`, `usedAt`.
- **Token opaque aléatoire** (crypto.randomBytes), envoyé en clair par email, **stocké hashé**,
  **usage unique** (`usedAt`) et **expirant**. Pas de JWT.

**Migration des users beta (idempotente) :**
- Backfill `discriminator` (random libre par nom), normalisation `email` (lowercase),
  `emailVerified = true` pour les comptes existants (**grandfathering** — connus/de confiance),
  `pendingEmail = null`.

### Authentication & Security

**Identité & login :**
- Login **email-only** : retrait du `Op.or` name/email dans `loginUser` (le handle n'est pas
  un identifiant de connexion).
- Register : nom **jamais refusé** (désambiguïsation par discriminant) ; plus de réponse
  « already taken » → réponse générique + notification au vrai propriétaire si l'email existe.

**Vérification d'email — soft gate :**
- L'inscription connecte directement (flux actuel préservé) ; bandeau persistant « vérifie ton email ».
- Actions **sensibles bloquées tant que non vérifié** : changement d'email, futur partage de songlist.
- Endpoint « renvoyer le lien de vérification » (rate-limité).

**Account takeover :**
- Mot de passe **≥ 10 caractères** (validé serveur + miroir front), setter bcryptjs (jamais de hash manuel).
- Changement de mdp : **mot de passe actuel exigé** (`validPassword`).
- **Invalidation des autres sessions** au change-mdp : suppression des lignes du user dans la
  table `session` (connect-pg-simple) sauf `req.sessionID` courant.
- **Rate-limiting** (express-rate-limit ^8) sur `/login`, change-password, forgot-password,
  endpoints d'envoi d'email. ⚠️ **`app.set('trust proxy', 1)`** (Fly.io) sinon une seule IP vue.

**Secrets :**
- **Fail-fast au boot** : suppression des fallbacks `'musician-secret'` / `'MUSICIAN_SECRET'` ;
  `SESSION_SECRET` (+ clé API Resend) obligatoires sinon `process.exit(1)`.
- **Retrait total du JWT vestigial** : plus de `jwt.sign`, plus de `token` en session/réponse ;
  dépendance `jsonwebtoken` retirable.

### API & Communication Patterns

**CSRF — synchronizer token en session :**
- Token généré par session (stocké côté session Postgres), exposé au front via endpoint
  `GET /api/csrf-token` (ou cookie lisible) ; front renvoie `X-CSRF-Token` sur **toute mutation**.
- Middleware de vérification sur **toutes les routes non-GET** ; rejet 403→**normalisé** si invalide.
- **`logout` GET→POST** (dernier state-changing GET) ; audit : aucune autre mutation en GET.

**Ownership / énumération (toutes routes) :**
- **`getSong`** : requête scopée `where:{uid,userUid}` → 404 si pas à soi (plus d'IDOR).
- **`markSongPlayed`** : valider que `instrumentUid` appartient au user.
- **Collapse 403→404 partout** : « pas à toi » indistinguable de « n'existe pas ».
- Réponses email **génériques** (« vérifie ta boîte ») ; jamais « email déjà pris ».

**Conventions héritées conservées :** réponses JSON brutes (pas d'enveloppe), `http-errors`,
contrôleurs CommonJS, pattern ownership canonique.

### Frontend Architecture

- **Page Profil** (route authentifiée, accès Header) : sections nom d'affichage / email / mot de passe.
- Service `profileService` (`src/services/`, `fetch` brut, `credentials:'include'`) + helper CSRF
  (lecture du token, injection `X-CSRF-Token` sur les mutations — centralisé pour tous les services).
- Pages **forgot-password / reset-password / verify-email** (flux par lien email).
- Pas de nouvelle lib state ; useState/useMemo + AuthContext étendu (`emailVerified`, `handle`).
- Bandeau de vérification (soft gate) : composant global lisant `emailVerified` depuis AuthContext.

### Infrastructure & Deployment

- **Resend** : clé API en env (obligatoire au boot), domaine d'envoi à vérifier (SPF/DKIM).
- Variables d'env nouvelles : `RESEND_API_KEY`, `APP_BASE_URL` (liens email), `SESSION_SECRET`
  (renommé/durci). CORS mono-origine conservé (`server.js`).
- Aucune nouvelle infra de déploiement : tout passe par le pipeline Fly.io existant.

### Decision Impact Analysis

**Séquence d'implémentation (dépendances) :**
1. Durcissement socle sans dépendance externe : secret fail-fast, retrait JWT, `trust proxy`.
2. Migration `Users` (citext, discriminator, emailVerified, pendingEmail) + backfill beta.
3. CSRF (middleware + endpoint + helper front) et rate-limiting (transverses).
4. Audit ownership + collapse 403→404 + fix `getSong`/`markSongPlayed`.
5. Infra email Resend + table `AuthTokens`.
6. Flux métier : login email-only, register handle, page Profil, change-email verify-before-switch,
   reset, verify-signup + soft gate.

**Dépendances croisées :**
- Les flux email (5/6) dépendent de l'infra Resend + `AuthTokens`.
- Le soft gate dépend de `emailVerified` (migration 2).
- Le handle/identité (register, login) dépend de la migration `Users` (2).
- CSRF (3) est un prérequis transverse de toutes les mutations des flux (6).

## Implementation Patterns & Consistency Rules

_Base : les 46 règles de `project-context.md` s'appliquent telles quelles (nommage,
pattern contrôleur ownership, migrations idempotentes, double suite Jest, langue anglaise,
réponses JSON brutes). Ci-dessous, uniquement les patterns NOUVEAUX de l'Epic 7 — points
où des agents pourraient diverger._

### Naming Patterns (nouveaux)

**Table `AuthTokens`** — suit le pattern `Songs` (camelCase JS + `field: 'snake_case'` DB,
PK `uid` UUID, `timestamps:true`). Colonne `userUid` → `user_uid`. ENUM `type` avec valeurs
**exactes** : `'verify_email' | 'password_reset' | 'change_email'`.

**Colonnes `Users` ajoutées** : `discriminator` (`discriminator`), `emailVerified`
(`email_verified`), `pendingEmail` (`pending_email`).

**Variables d'env** (noms figés, obligatoires au boot sauf mention) :
`SESSION_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_BASE_URL`.

**Handle** : affiché **`${name}#${discriminator}`** ; `discriminator` stocké en STRING
zero-paddée 4 chiffres (`'0042'`, jamais `42`).

**En-tête CSRF** : `X-CSRF-Token` (exact) ; endpoint `GET /api/csrf-token` → `{ csrfToken }`.

### Structure Patterns (où va le code nouveau)

- Middlewares transverses → `backend/middleware/` : `csrf.js`, `ratelimiters.js`,
  `requireverified.js` (minuscules collées, cf. convention contrôleurs).
- Service email → `backend/services/emailservice.js` (wrapper Resend ; seul point d'envoi).
- Messages génériques (anti-énumération) → `backend/constants/messages.js`
  (source unique, ex. `CHECK_YOUR_INBOX`).
- Front : helper CSRF → `src/services/csrf.ts` ; wrapper fetch partagé injectant
  `X-CSRF-Token` sur les mutations ; `profileService.ts` + pages
  `ForgotPassword.tsx` / `ResetPassword.tsx` / `VerifyEmail.tsx`.

### Format Patterns

- **Tokens** : `crypto.randomBytes(32).toString('base64url')` en clair (email) ;
  **`sha256` hex** stocké dans `tokenHash`. Comparaison par hash, usage unique (`usedAt`).
- **Durées d'expiration** (figées, cohérentes) :
  `verify_email` = **24 h**, `password_reset` = **1 h**, `change_email` = **1 h**.
- **Réponses anti-énumération** : message **identique** partout (`CHECK_YOUR_INBOX`),
  même statut, quel que soit l'existence du compte. Jamais « email déjà pris ».
- **Collapse 403→404** : ownership = requête scopée `where:{ uid, userUid }` ;
  si `null` → `next(createError(404))`. **Aucune nouvelle route ne renvoie 403 pour de l'ownership.**

### Process Patterns

- **Rate-limit** (`express-rate-limit ^8`, `app.set('trust proxy', 1)`) — valeurs de départ :
  - `/login` : **10 / 15 min / IP**
  - `forgot-password` (demande de reset) : **5 / heure / IP**
  - envoi d'email (resend-verification, change-email) : **5 / heure / compte**
  - Réponse 429 générique, sans détail.
- **Soft gate** : middleware `requireVerified` posé UNIQUEMENT sur les routes sensibles
  (change-email, futur partage) ; le reste de l'app reste accessible non vérifié.
- **Invalidation de sessions** : helper unique supprimant les lignes `session` du user
  sauf `req.sessionID` (jamais de SQL ad hoc dupliqué).
- **Verify-before-switch** : ne JAMAIS écrire `email` directement ; passer par `pendingEmail`
  + token `change_email` ; bascule `pendingEmail → email` au clic, puis `pendingEmail = null`.

### Enforcement Guidelines

**Tout agent DOIT :**
- Réutiliser `emailservice`, le helper CSRF front, le helper d'invalidation de session,
  et `CHECK_YOUR_INBOX` — jamais réimplémenter localement.
- Respecter les noms d'env, d'en-tête, de type ENUM et le format de handle **à la lettre**.
- Renvoyer 404 (jamais 403) pour tout échec d'ownership ; toute mutation passe le middleware CSRF.
- Suivre les 46 règles de `project-context.md` (ce fichier ne les remplace pas).

**Anti-patterns à proscrire :**
- Stocker un token en clair, ou un token réutilisable / sans expiration.
- Écraser `email` sans passer par `pendingEmail`.
- Message d'erreur révélant l'existence d'un email/compte (oracle d'énumération).
- Copier le `getSong` actuel (sans ownership) comme modèle.

## Project Structure & Boundaries

_Brownfield : structure existante conservée. Fichiers Epic 7 marqués `[NEW]`,
extensions de fichiers existants marquées `[EXT]`._

### Arborescence (extrait pertinent Epic 7)

```
musician-tools/
├── src/                                  # Frontend React/Vite
│   ├── pages/
│   │   ├── LoginPage.tsx                  [EXT] login email-only
│   │   ├── RegisterPage.tsx              [EXT] handle, mdp ≥10, plus de « name taken »
│   │   ├── ProfilePage.tsx              [NEW] nom / email / mot de passe
│   │   ├── ForgotPasswordPage.tsx       [NEW] demande de reset
│   │   ├── ResetPasswordPage.tsx        [NEW] reset via lien
│   │   └── VerifyEmailPage.tsx          [NEW] confirmation (signup + change-email)
│   ├── services/
│   │   ├── apiFetch.ts                   [EXT] injection X-CSRF-Token + fetch CSRF token
│   │   ├── authService.ts               [EXT] login/register/logout (POST), me()
│   │   └── profileService.ts            [NEW] update name/email/password, reset, verify
│   ├── contexts/
│   │   └── AuthContext.tsx              [EXT] emailVerified, handle (name#NNNN)
│   └── components/
│       ├── Header.tsx                   [EXT] lien Profil
│       └── VerifyEmailBanner.tsx        [NEW] bandeau soft gate (lit emailVerified)
│
├── backend/                              # Express/Sequelize (CommonJS)
│   ├── server.js                        [EXT] trust proxy, secret fail-fast, CSRF+rate-limit mount
│   ├── routes/
│   │   ├── auth.js                      [EXT] logout POST, forgot/reset, verify, resend
│   │   └── account.js                  [NEW] routes profil (name/email/password) — montées authsess
│   ├── controllers/
│   │   ├── usercontroller.js           [EXT] login email-only, register handle, retrait JWT, réponses génériques
│   │   └── accountcontroller.js        [NEW] update profil, change-email (verify-before-switch), change-password
│   ├── middleware/
│   │   ├── authsess.js                  (existant)
│   │   ├── csrf.js                      [NEW] synchronizer token (session)
│   │   ├── ratelimiters.js             [NEW] express-rate-limit (login, forgot, email)
│   │   └── requireverified.js          [NEW] soft gate routes sensibles
│   ├── services/
│   │   └── emailService.js             [NEW] wrapper Resend (seul point d'envoi)
│   ├── constants/
│   │   └── messages.js                 [NEW] CHECK_YOUR_INBOX, etc.
│   ├── models/
│   │   ├── user.js                     [EXT] discriminator, emailVerified, pendingEmail ; drop unique(name)
│   │   └── authtoken.js                [NEW] AuthTokens (type, tokenHash, payload, expiresAt, usedAt)
│   └── migrations/
│       ├── ...-alter-users-identity.js [NEW] citext email, discriminator, emailVerified, pendingEmail, index (name,disc)
│       ├── ...-backfill-users-beta.js  [NEW] discriminant + email lowercase + emailVerified=true (grandfather)
│       └── ...-create-auth-tokens.js   [NEW] table AuthTokens
└── ...
```

### Requirements → Structure (mapping Epic 7)

| Bloc | Emplacement |
|------|-------------|
| Identité (handle, login email-only) | `models/user.js`, `controllers/usercontroller.js`, migration alter-users |
| Page Profil | `src/pages/ProfilePage.tsx`, `src/services/profileService.ts`, `routes/account.js`, `controllers/accountcontroller.js` |
| Change-email verify-before-switch | `accountcontroller.js` + `emailService.js` + `models/authtoken.js` (`type=change_email`) |
| Reset mot de passe | `ForgotPasswordPage/ResetPasswordPage`, `usercontroller.js`, `authtoken.js` (`password_reset`) |
| Vérif inscription + soft gate | `VerifyEmailPage`, `VerifyEmailBanner`, `requireverified.js`, `authtoken.js` (`verify_email`) |
| CSRF | `middleware/csrf.js` + `server.js` + `src/services/apiFetch.ts` |
| Rate-limit | `middleware/ratelimiters.js` + `server.js` (trust proxy) |
| IDOR / 403→404 | audit `controllers/*.js` (fix `songcontroller.js` getSong, `practicesessioncontroller.js` markSongPlayed) |

### Architectural Boundaries

- **API** : routes existantes sous `/api` (proxy Vite → :3001). Auth/compte sous `routes/auth.js`
  + `routes/account.js`. Toutes les mutations passent CSRF + (selon route) rate-limit + `authsess`.
- **Données** : un modèle par fichier dans `models/` (auto-chargés par `models/index.js`).
  `AuthTokens` isolé des données métier ; ownership via `userUid` + scope `where:{uid,userUid}`.
- **Frontend** : pages → services (`apiFetch`) → API. État via AuthContext (auth + emailVerified + handle).
  Aucune nouvelle lib de state.
- **Externe** : Resend (sortant, via `emailService.js` uniquement). Aucune autre intégration.

### Intégration & déploiement

- Migrations exécutées par le pipeline Fly.io existant (release_command + sync au boot) — idempotentes.
- Nouvelles env à provisionner sur Fly : `SESSION_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_BASE_URL`.
- Tests : backend dans `backend/__tests__/` (modèles mockés), frontend dans `src/__tests__/` (Testing Library).

### Note de nettoyage (dette croisée)

`backend/reset-password.js` (script top-level) et `backend/test-*.js` (fichiers morts, cf.
project-context) à auditer/retirer lors du chantier auth — ne pas s'en inspirer.

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility :** stack cohérente — express-rate-limit ^8, csrf maison (synchronizer
sur session existante), Resend, citext/Sequelize, AuthTokens. Aucun conflit de version ni de
décision contradictoire. Tout réutilise l'infra en place (sessions pg, bcryptjs, http-errors).

**Pattern Consistency :** les patterns nouveaux suivent les conventions établies (modèle façon
Songs, contrôleurs/middlewares minuscules, service camelCase `emailService.js`, réponses JSON
brutes). Aucune divergence avec les 46 règles de project-context.

**Structure Alignment :** chaque décision a un emplacement précis (mapping Epic 7 → fichiers).
Les nouvelles briques transverses (csrf, ratelimiters, requireverified, emailService) sont isolées
dans `middleware/` et `services/`. AuthTokens isolé des données métier.

### Requirements Coverage Validation ✅

**Success Criteria du brief (7/7) :** édition autonome profil/email/mdp, handle unique sans refus
de nom, reset par email, 404 partout (getSong inclus), aucune fuite d'existence d'email, CSRF sur
mutations, secret obligatoire au boot + fin du JWT.

**Open Questions (6/6) tranchées :** soft gate ; Resend ; synchronizer token ; rate-limit
(login 10/15min, forgot 5/h, email 5/h) ; migration backfill + grandfather ; discriminant
`0001`–`9999`, stable au rename si possible.

**NFR sécurité (4 menaces) :** ① takeover (mdp≥10, mdp actuel, invalidation sessions, rate-limit)
② IDOR (audit + getSong + markSongPlayed) ③ CSRF (token + logout POST + JWT out + secret boot)
④ énumération (404 collapse, email générique, nom jamais refusé, citext).

### Implementation Readiness Validation ✅

**Decision Completeness :** décisions critiques documentées avec versions et valeurs concrètes
(expirations tokens, seuils rate-limit, format discriminant).

**Structure Completeness :** arborescence complète avec marquage [NEW]/[EXT] et mapping
exigence→fichier. Points d'intégration (Resend, CSRF front/back) spécifiés.

**Pattern Completeness :** nommage, structure, formats (tokens, anti-énumération), process
(rate-limit, soft gate, verify-before-switch) couverts, avec anti-patterns explicites.

### Gap Analysis Results

**Critical Gaps :** aucun.

**Important Gaps :**
- CSRF pré-auth : le front doit récupérer le token avant les POST non authentifiés
  (login/register/forgot-password). Détail d'intégration à expliciter dans les stories.
- Flux « notifier le vrai propriétaire » au register sur email existant : story dédiée
  (utilise `emailService`).

**Nice-to-Have / Limites conscientes :**
- Rate-limit en mémoire (par instance, reset au deploy) — acceptable beta ; store persistant = futur.
- Invalidation de session réelle en prod uniquement (MemoryStore en dev).
- `accountcontroller` : penser `scope(null)` pour accéder au hash (`validPassword`).

### Architecture Completeness Checklist

**Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**Architectural Decisions**
- [x] Critical decisions documented with versions
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed

**Implementation Patterns**
- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented

**Project Structure**
- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status :** READY FOR IMPLEMENTATION (aucun Critical Gap ; gaps « important » = détails
d'intégration cadrés, à reprendre au niveau story ; limites consciences assumées).

**Confidence Level :** high.

**Key Strengths :** s'appuie sur une fondation prod éprouvée ; sécurité traitée à fond (4 menaces) ;
décisions concrètes et chiffrées ; cohérence totale avec les conventions existantes.

**Areas for Future Enhancement :** store de rate-limit persistant ; partage de songlist (le handle
en est le socle) ; durcissement concurrence app-wide (dette consciente, deferred-work.md).

### Implementation Handoff

**AI Agent Guidelines :** suivre les décisions et patterns à la lettre ; réutiliser les briques
partagées (emailService, helper CSRF, helper invalidation session, CHECK_YOUR_INBOX) ; 404 jamais
403 pour l'ownership ; respecter project-context.md.

**First Implementation Priority :** chantier 1 « durcissement socle » sans dépendance externe —
secret fail-fast au boot, retrait du JWT vestigial, `app.set('trust proxy', 1)` — avant toute
migration ou flux email.
