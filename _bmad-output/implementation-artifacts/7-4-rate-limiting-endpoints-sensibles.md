---
baseline_commit: 629c43b4249c344323697167a7698e5c03106277
---

# Story 7.4: Plafonner les endpoints sensibles (rate-limiting)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a mainteneur,
I want plafonner login, reset et envois d'email,
so that le brute-force et l'abus d'email transactionnel sont contenus.

## Acceptance Criteria

1. **Limiteurs nommés réutilisables** — `backend/middleware/ratelimiters.js` (CommonJS, commentaires EN) expose des limiteurs `express-rate-limit ^8` **nommés et réutilisables** (jamais réimplémentés localement, cf. brique transverse obligatoire) : `loginLimiter` **10 / 15 min / IP** ; `forgotPasswordLimiter` **5 / h / IP** ; `emailSendLimiter` **5 / h / compte** (resend-verification, change-email). [Source: epics.md#Story 7.4 ; architecture.md#Process Patterns]
2. **Montage effectif sur l'existant** — `loginLimiter` est **monté maintenant** sur `POST /api/auth/login` (seul endpoint cible existant à ce stade). `forgotPasswordLimiter` et `emailSendLimiter` sont **définis + exportés** mais **pas montés** ici (leurs routes naissent en 7.6/7.9/7.10/7.11) — ne PAS tenter de les brancher sur des routes inexistantes ; documenter qu'ils sont prêts à l'emploi pour ces stories.
3. **Rejet 429 générique** — au-delà du plafond, réponse **429 sans détail** (anti-oracle, cohérent avec le collapse 403→404 et le rejet CSRF générique). Pas de fuite du seuil ni du temps restant dans le corps.
4. **Clé par IP réelle** — les limiteurs par IP s'appuient sur `req.ip` réel grâce à `app.set('trust proxy', 1)` **déjà posé en 7.1** (server.js) ; ne pas le re-poser. `emailSendLimiter` est clé **par compte** (`req.session.user`), pas par IP.
5. **Store mémoire conscient** — store en mémoire (défaut `MemoryStore`, **par instance, remis à zéro au deploy**) — documenté comme **acceptable en beta** ; store persistant (Redis/PG) = futur (Areas for Future Enhancement). [Source: architecture.md#L432, #L472]
6. **Test** — un appel **au-delà du seuil** `loginLimiter` renvoie **429** (les N premiers passent au handler suivant, le N+1 est rejeté).

## Tasks / Subtasks

- [x] **Task 1 — Dépendance `express-rate-limit ^8`** (AC: 1)
  - [x] `cd backend && npm install express-rate-limit@^8` → **8.5.2** installé (≥8.3.0, donc CVE bypass + faux positif `ERR_ERL_KEY_GEN_IPV6` corrigés). Dep déclarée `^8.5.2` dans `backend/package.json` ; `package-lock.json` mis à jour.
  - [x] Nouvelle dépendance **pré-approuvée** (mandatée par epics.md#Story 7.4 + architecture.md#Process Patterns) — pas de HALT.
- [x] **Task 2 — Middleware `ratelimiters.js`** (AC: 1, 3, 4, 5)
  - [x] Créé `backend/middleware/ratelimiters.js` (CommonJS) : `{ rateLimit, ipKeyGenerator } = require('express-rate-limit')` + `http-errors`.
  - [x] Handler 429 **générique partagé** `tooMany` : `next(createError(429, 'Too Many Requests'))` → error handler global (`{status, message}`), zéro détail.
  - [x] Config commune `base` : `standardHeaders: true`, `legacyHeaders: false`, param **`limit`**.
  - [x] `loginLimiter` : `windowMs 15min`, `limit 10` — **keyGenerator par défaut** (IP/IPv6).
  - [x] `forgotPasswordLimiter` : `windowMs 1h`, `limit 5` — keyGenerator par défaut (IP).
  - [x] `emailSendLimiter` : `windowMs 1h`, `limit 5`, **clé par compte** `(req) => (req.session && req.session.user) || ipKeyGenerator(req.ip)` (repli IP sûr + satisfait le validateur v8.2+ : `req.ip` accompagné de `ipKeyGenerator`).
  - [x] `module.exports = { loginLimiter, forgotPasswordLimiter, emailSendLimiter }`, commentaires EN (window/limite/clé/story consommatrice).
- [x] **Task 3 — Monter `loginLimiter` sur le login** (AC: 2)
  - [x] `backend/routes/auth.js` : `router.post('/login', loginLimiter, uc.loginUser)`. Ordre effectif `csrf` (global `/api`) → `loginLimiter` → `loginUser`, documenté en commentaire.
  - [x] `forgotPasswordLimiter` / `emailSendLimiter` **non montés** (routes absentes) — commentaires dans `ratelimiters.js` pointant les stories 7.9/7.10/7.11.
- [x] **Task 4 — Test** (AC: 6)
  - [x] `backend/__tests__/ratelimiters.test.js` (supertest `^7`) : mini-app express + `loginLimiter` → 10×200 puis 429 ; corps `{status:429, message:'Too Many Requests'}` (aucun détail).
  - [x] `emailSendLimiter` testé : user-A épuise 5 → 429, user-B indépendant → 200 (clé par compte prouvée).
  - [x] Suites back (150) + lint backend verts ; smoke de boot OK (chargement sans `ERR_ERL_KEY_GEN_IPV6`).

## Dev Notes

### Contexte & design retenu

Rate-limiting **app-wide sur les endpoints sensibles** = défense ① account-takeover (NFR-S1) et anti-abus d'email transactionnel. Brique **transverse réutilisable obligatoire** (`ratelimiters.js`), consommée par les stories suivantes — **jamais réimplémentée localement**. [Source: epics.md#L129, #L143 ; architecture.md#Process Patterns, #Component-to-File Map]

Cette story est **parallélisable avec 7.3** (déjà done) et **précède 7.5**. À ce stade, **seul `/login` existe** parmi les cibles ; les autres limiteurs sont préparés pour leurs routes futures :
- `forgotPasswordLimiter` → story **7.10** (reset password par email)
- `emailSendLimiter` → stories **7.9** (resend-verification) et **7.11** (change-email)

> ⚠️ **Piège de scope** : ne pas inventer/monter les routes forgot-password / resend / change-email ici. Cette story livre le **module de limiteurs** + le **montage sur login**. Les routes futures se contenteront d'`require` le limiteur et de l'insérer dans leur chaîne.

### `express-rate-limit ^8` — spécificités version (recherche web 2026-06-23)

- Dernière 8.x ≈ **8.5.1** ; `^8` résout vers la dernière 8.x. Param **`limit`** (le `max` de v6 est déprécié).
- **Default keyGenerator = IP** avec masquage de sous-réseau IPv6 (`/56`) via `ipKeyGenerator` interne → **rien à faire** pour les limiteurs par IP.
- **`ERR_ERL_KEY_GEN_IPV6` (v8.2+)** : validation au boot qui inspecte le **texte source** de tout `keyGenerator` custom. Si elle voit `req.ip` SANS le mot `ipKeyGenerator`, elle **throw au démarrage**. → On **n'écrit aucun keyGenerator custom basé sur `req.ip`** (login/forgot utilisent le défaut). `emailSendLimiter` clé sur `req.session.user` (aucun `req.ip`) → safe.
- **CVE bypass** (IPv4-mapped IPv6) corrigée en **8.3.0** (backports 8.0.2 / 8.1.1 / 8.2.2) → installer une version patchée.
- Compatible **Express 4** (le projet est en `express ~4.16.1`, pas Express 5).
- Store par défaut **MemoryStore** = exactement le comportement « par instance, reset au deploy » voulu (AC5). Ne pas ajouter de store externe.
- [Source: https://express-rate-limit.mintlify.app/reference/configuration ; GHSA-46wh-pxpv-q5gq ; wiki Error-Codes]

### État actuel des fichiers touchés (lu 2026-06-23)

- **`backend/routes/auth.js`** — `router.use(bodyParser.json())` ; `post('/register')`, `post('/login', uc.loginUser)`, `post('/logout')` (logout déjà passé POST + CSRF en 7.3). C'est ici que `loginLimiter` s'insère : `router.post('/login', loginLimiter, uc.loginUser)`. (Note : `bodyParser` est transitif ; ne pas l'étendre — hors scope, déjà en place.)
- **`backend/server.js`** — `app.set('trust proxy', 1)` **déjà posé** (L81, story 7.1) → `req.ip` est l'IP client réelle (Fly.io). Le error handler global (L149-163) renvoie `{status, message}` → le handler 429 `next(createError(429))` y aboutit proprement. **Rien à modifier dans server.js** (le rate-limit se monte par route, pas globalement).
- **`backend/middleware/`** — contient `authsess.js`, `csrf.js`. Convention : minuscules collées (`ratelimiters.js`), cf. `csrf.js`/`authsess.js`. [Source: architecture.md#Structure Patterns]
- **`backend/routes/index.js`** — `router.use(csrf)` global sur `/api` (7.3) : le CSRF s'applique donc **avant** tout limiteur monté au niveau route. Ne pas y toucher.

### Pièges à éviter

- **Ne PAS re-poser `trust proxy`** (déjà en 7.1) ni de store externe (MemoryStore voulu).
- **Pas de keyGenerator custom avec `req.ip`** → `ERR_ERL_KEY_GEN_IPV6` au boot. Laisser le défaut pour les limiteurs IP.
- **429 générique** : aucun détail (ni seuil, ni `retryAfter` dans le corps) — `legacyHeaders:false`. Les en-têtes `RateLimit-*` standard (`standardHeaders:true`) sont OK (informatifs, non-oracle métier).
- **Ordre CSRF → rate-limit** : le CSRF (router-level) court avant le limiteur (route-level). Conséquence assumée : une requête sans token CSRF est coupée en 403 avant d'incrémenter le compteur. Acceptable (le front légitime envoie toujours le token ; un attaquant doit d'abord obtenir un token, puis tombe sous le plafond). Documenté.
- **Backend CommonJS** : `require`/`module.exports`, jamais d'ESM. Commentaires **EN**. Erreurs via `http-errors`. [Source: project-context.md#Language-Specific Rules]
- **Test isolation** : les limiteurs `MemoryStore` gardent un état **au niveau module** → dans les tests, instancier la mini-app/le limiteur **frais par test** (ou `limiter.resetKey`/recréer) pour éviter les fuites de compteur entre tests.

### Project Structure Notes

- **NEW** : `backend/middleware/ratelimiters.js`, `backend/__tests__/ratelimiters.test.js`.
- **EDIT** : `backend/routes/auth.js` (montage `loginLimiter`), `backend/package.json` + `package-lock.json` (dep).
- **Pas de migration**, pas de changement front, pas de changement `server.js`. Risque de déploiement **faible** (cf. revue 7.3 : déploiement atomique, aucune donnée touchée).
- Convention middleware minuscules collées, alignée sur `csrf.js`/`authsess.js`. [Source: architecture.md#Structure Patterns, #Component-to-File Map L330,L356]

### References

- [Source: epics.md#Story 7.4] — ACs (seuils, 429 générique, store mémoire beta)
- [Source: epics.md#L129] — briques transverses réutilisables obligatoires (`ratelimiters` jamais réimplémenté)
- [Source: epics.md#L143, #L119] — NFR-S1 (account takeover), seuils login/forgot/email
- [Source: architecture.md#Process Patterns L265-269] — valeurs de départ, 429 générique, `trust proxy`
- [Source: architecture.md#Structure Patterns L243-244, #Component-to-File Map L330,L356] — emplacement `ratelimiters.js`
- [Source: architecture.md#L432, #L472] — store mémoire acceptable beta ; store persistant = futur
- [Source: story 7.1] — `trust proxy` déjà posé ; [Source: story 7.3] — CSRF global `/api`, logout POST, error handler générique
- [Source: backend/routes/auth.js, server.js:81,149] — point de montage et error handler
- [Web 2026-06-23: express-rate-limit v8 config, ERR_ERL_KEY_GEN_IPV6, GHSA-46wh-pxpv-q5gq]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

- Install : `express-rate-limit@8.5.2` (≥8.3.0 → CVE bypass IPv4-mapped-IPv6 + `ERR_ERL_KEY_GEN_IPV6` corrigés). L'`npm install` sort en code 1 à cause de `npm audit` (vulnérabilités pré-existantes dans d'autres deps), pas du paquet installé — install confirmée via `npm ls express-rate-limit`.
- RED→GREEN : test écrit d'abord (module absent → fail), puis `ratelimiters.js` (pass).
- Smoke boot : `require('./routes/auth')` + `require('./middleware/ratelimiters')` chargent sans erreur de validation (le keyGenerator d'`emailSendLimiter` mentionne `req.ip` + `ipKeyGenerator` → validateur v8.2+ satisfait). L'erreur Sequelize au smoke = absence de Postgres local, sans rapport.
- Tests : backend 150 (+2 ratelimiters) ✓ ; lint backend ✓ (warning eslint-disable inutile retiré).

### Completion Notes List

- **AC1 (limiteurs nommés)** : `backend/middleware/ratelimiters.js` expose `loginLimiter` (10/15min/IP), `forgotPasswordLimiter` (5/h/IP), `emailSendLimiter` (5/h/compte). Brique transverse réutilisable.
- **AC2 (montage)** : `loginLimiter` monté sur `POST /api/auth/login`. Les 2 autres définis+exportés mais non montés (routes nées en 7.9/7.10/7.11) — commentaires de pointage.
- **AC3 (429 générique)** : handler partagé `tooMany` → `createError(429, 'Too Many Requests')` via le error handler global ; `legacyHeaders:false` (pas de fuite seuil/retry).
- **AC4 (IP réelle)** : `trust proxy` déjà posé en 7.1 ; limiteurs IP en keyGenerator par défaut ; `emailSendLimiter` clé par `req.session.user`.
- **AC5 (store mémoire beta)** : MemoryStore par défaut (par instance, reset au deploy) — documenté acceptable beta dans le module.
- **AC6 (test)** : `ratelimiters.test.js` — 429 au 11ᵉ login (corps sans détail) + isolation par compte d'`emailSendLimiter`.
- **Décisions** : `express-rate-limit@8.5.2` (paramètre `limit`, store mémoire) ; aucun changement `server.js` (montage par route) ; aucune migration, aucun front.
- **Hors scope assumé (documenté dans la story)** : `forgotPasswordLimiter`/`emailSendLimiter` non montés ici (leurs routes n'existent pas encore).
- **Revue de code (2026-06-23)** : 1 finding sécurité corrigé + 2 nettoyages. [Sécu] `standardHeaders:true` faisait fuiter le seuil/fenêtre/reset dans les en-têtes `RateLimit-*`/`Retry-After` du 429 (contredisait l'AC3 « sans détail ») → passé à `standardHeaders:false` (limiteurs anti-abus, pas des quotas ; rien ne lit ces en-têtes côté front) ; test complété pour asserter l'absence d'en-têtes de fuite. [Nettoyages] `createError(429)` (message par défaut, arg redondant retiré) ; densité de commentaires réduite (project-context « commentaires rares »). Back 150 verts.

### File List

- `backend/middleware/ratelimiters.js` (NEW)
- `backend/__tests__/ratelimiters.test.js` (NEW)
- `backend/routes/auth.js` (EDIT — montage `loginLimiter` sur `/login`)
- `backend/package.json` (EDIT — dep `express-rate-limit ^8.5.2`)
- `backend/package-lock.json` (EDIT — lockfile)

### Change Log

- 2026-06-23 — Story 7.4 : rate-limiting des endpoints sensibles (`express-rate-limit ^8`). Middleware `ratelimiters.js` (3 limiteurs nommés réutilisables : login 10/15min/IP, forgot 5/h/IP, email 5/h/compte), 429 générique, store mémoire (beta). `loginLimiter` monté sur `POST /login` ; les 2 autres prêts pour 7.9/7.10/7.11. Backend 150 verts.
- 2026-06-23 — Suivi code review : finding sécurité corrigé (`standardHeaders:false` — plus de fuite seuil/fenêtre dans les en-têtes du 429, conforme AC3) + 2 nettoyages (message 429 redondant, commentaires allégés). Test du 429 renforcé (assertion anti-fuite d'en-têtes). Back 150 verts.
