---
baseline_commit: 8e890f86dbcfbe870a10ff45edc3540fd2f5d234
---

# Story 7.9: Vérification d'email à l'inscription (soft gate)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur,
I want vérifier mon email après inscription sans être bloqué dans l'usage courant,
so that mon compte est confirmé tout en restant utilisable immédiatement.

## Acceptance Criteria

1. **Register envoie un token verify_email** — un register **réussi sur un email neuf** (7.7) émet un token `verify_email` (24 h) via `authTokenService` + `authEmails`/`emailService`, et connecte l'utilisateur **directement** (`emailVerified=false`, flux préservé — soft gate). **Best-effort** : un échec d'envoi ne fait pas échouer l'inscription. [Source: epics.md#Story 7.9 ; architecture.md#L270]
2. **Bandeau persistant** — un user non vérifié voit `VerifyEmailBanner` (lit `emailVerified` depuis `AuthContext`) : « vérifie ton email » + bouton **« renvoyer le lien »** (rate-limité **5 / h / compte** via `emailSendLimiter` de 7.4). [Source: epics.md#Story 7.9]
3. **Vérification au clic** — `VerifyEmailPage` (lit le `token` dans l'URL ; **partagée** avec la future confirmation change-email 7.11) appelle l'endpoint de vérification : token valide → `emailVerified=true`, token marqué `usedAt`, bandeau disparaît (AuthContext rafraîchi). [Source: epics.md#Story 7.9]
4. **Middleware `requireVerified` (créé ici)** — bloque les **actions sensibles** (change-email 7.11, futur partage) pour un user non vérifié, avec un **statut normalisé** (403 générique) ; le **reste de l'app reste accessible** non vérifié. Monté APRÈS `authsess`. **Non monté sur une route réelle en 7.9** (aucune route sensible n'existe encore) — créé + testé, consommé par 7.11. [Source: epics.md#Story 7.9 ; architecture.md#L270-271]
5. **Token expiré → resend** — « renvoyer le lien » génère et envoie un **nouveau** token `verify_email` (un token déjà utilisé/expiré est rejeté par `verifyToken`). [Source: epics.md#Story 7.9]
6. **Tests** — register → `emailVerified=false` + token `verify_email` créé ; clic valide → `emailVerified=true` + token consommé ; `requireVerified` bloque (403) un user non vérifié et laisse passer un user vérifié.

## Tasks / Subtasks

- [x] **Task 1 — `authEmails.sendVerifyEmail`** (AC: 1)
  - [x] `backend/services/authEmails.js` : ajouter `async function sendVerifyEmail(email, token)` → lien `${process.env.APP_BASE_URL}/verify-email?token=${token}` ; sujet + html EN (« confirm your email »). Export. (emailService = seul point d'envoi.)
- [x] **Task 2 — Register émet le token verify_email** (AC: 1)
  - [x] `backend/controllers/usercontroller.js` `createUser` : sur le succès (email neuf), **après** le seed Free practice, **best-effort** : `const token = await authTokenService.issueToken(newUser.uid, 'verify_email'); await authEmails.sendVerifyEmail(newUser.email, token);` dans un `try/catch` (log) — l'inscription réussit même si l'envoi échoue. `emailVerified` reste `false` (défaut modèle). Importer `authTokenService`.
- [x] **Task 3 — Endpoints verify + resend** (AC: 3, 5)
  - [x] `usercontroller.verifyEmail` (public, token-based) : garde `req.body || {}` ; `const result = await authTokenService.verifyToken(token, 'verify_email')` ; si `null` → **400 générique** (`Invalid or expired verification link`) ; sinon `await User.update({ emailVerified: true }, { where: { uid: result.userUid } })` → `res.json({ success: true })`.
  - [x] `usercontroller.resendVerification` (authsess) : `User.findByPk(req.session.user)` ; si déjà `emailVerified` → `res.json({ success: true })` (no-op générique) ; sinon **best-effort** : `issueToken(user.uid, 'verify_email')` + `sendVerifyEmail(user.email, token)` → `res.json({ success: true })`.
  - [x] `backend/routes/auth.js` : `router.post('/verify-email', uc.verifyEmail)` (public ; CSRF global) ; `router.post('/verify-email/resend', authsess, emailSendLimiter, uc.resendVerification)`. Importer `authsess` (déjà importé) + `emailSendLimiter`.
- [x] **Task 4 — Middleware `requireverified.js`** (AC: 4)
  - [x] `backend/middleware/requireverified.js` (minuscules collées) : `const user = await User.findByPk(req.session.user)` ; `!user` → 401 ; `!user.emailVerified` → `next(createError(403, 'Email verification required'))` (générique, légitime non-ownership) ; sinon `next()`. À monter APRÈS `authsess`. **Ne pas le monter** sur une route en 7.9 (commentaire : consommé par 7.11).
- [x] **Task 5 — emailVerified dans login + AuthContext** (AC: 2, 3)
  - [x] `usercontroller.loginUser` : ajouter `emailVerified: user.emailVerified` à l'objet `user` de la réponse (register le renvoie déjà via `userWithoutPassword`).
  - [x] `src/services/authService.ts` : `User` type → `emailVerified?: boolean`.
  - [x] (AuthContext expose déjà `user` + `patchUser` de 7.8 ; rien à ajouter sauf usage.)
- [x] **Task 6 — Front : `verificationService` + `VerifyEmailBanner` + `VerifyEmailPage`** (AC: 2, 3)
  - [x] `src/services/verificationService.ts` : `verify(token)` (POST `/api/auth/verify-email`) + `resend()` (POST `/api/auth/verify-email/resend`), via `apiFetch` (CSRF auto, `credentials:'include'`), `if(!res.ok) throw`.
  - [x] `src/components/VerifyEmailBanner.tsx` : si `isAuthenticated && user && user.emailVerified === false` → bandeau (couleurs thème + `dark:`) « Please verify your email » + bouton « Resend link » → `verificationService.resend()` + toast (pattern `setTimeout(2500)`). Rendu de façon **persistante** dans `App.tsx` (au-dessus du `main`, sous le Header).
  - [x] `src/pages/VerifyEmailPage.tsx` (route **publique** `/verify-email`) : lit `token` via `useSearchParams` ; au montage, `verificationService.verify(token)` → succès : message + si connecté `patchUser({ emailVerified: true })` + lien vers l'app ; échec : message générique + lien « resend » / login. Enregistrer la route dans `App.tsx` (accessible connecté **ou non**).
- [x] **Task 7 — Tests** (AC: 6)
  - [x] **Back** : `usercontroller`/`accountcontroller`-style — register → `emailVerified` non forcé à true + `authTokenService.issueToken` appelé avec `'verify_email'` (mock `authTokenService`/`authEmails`) ; `verifyEmail` token valide → `User.update({emailVerified:true}, {where:{uid}})` + `{success:true}` ; token invalide (`verifyToken`→null) → 400 ; `resendVerification` non vérifié → issue+send, déjà vérifié → no-op 200. `backend/__tests__/requireverified.test.js` : non vérifié → 403, vérifié → next().
  - [x] **Front** : `verificationService` (mock apiFetch) ; `VerifyEmailBanner` (affiché si emailVerified false, resend appelle le service) ; `VerifyEmailPage` (token → verify appelé, succès patchUser). (Testing Library.)
  - [x] Suites back + front + lint, husky vert sans `--no-verify`.

## Dev Notes

### Contexte & design retenu

Premier flux email **réellement envoyé** au user : confirmation d'inscription en **soft gate** (inscription utilisable immédiatement, `emailVerified=false`). Réutilise **tout** le socle 7.6 (`authTokenService.issueToken/verifyToken`, `authEmails`, `emailService`, type ENUM `verify_email`) et le `emailSendLimiter` (7.4). Crée le middleware `requireVerified` que **7.11** (change-email) consommera. [Source: epics.md#Story 7.9 ; architecture.md#L270-275]

> ⚠️ **`requireVerified` n'est monté sur AUCUNE route en 7.9** (pas de route sensible avant 7.11). On le crée + le teste ; 7.11 le montera sur le change-email. Ne pas le poser sur les routes courantes (l'app reste utilisable non vérifié — c'est le soft gate).

### Briques réutilisées (lues 2026-06-25)

- **`authTokenService`** (7.6) : `issueToken(userUid, type, payload?)` → token clair (à envoyer) ; `verifyToken(clearToken, type)` → `{ userUid, payload }` ou `null` (rejette used/expiré, marque `usedAt` atomiquement). Type `'verify_email'` (expiry 24 h déjà câblée).
- **`authEmails`** (7.7) : `sendSignupAttemptNotice` existe ; **ajouter** `sendVerifyEmail`. emailService = seul point d'envoi.
- **`emailSendLimiter`** (7.4) : par compte, 5/h, clé `req.session.user` — exactement le resend.
- **`User`** : `emailVerified` (BOOLEAN, défaut false, `field: email_verified`) existe déjà (migration 7.2). `getHandle()` (7.8). Login response à compléter avec `emailVerified` ; register le renvoie déjà.
- **`authsess`** : `req.session.loggedIn === true` → next, sinon 401. `requireVerified` se monte APRÈS.
- **Front** : `AuthContext` expose `user` + `patchUser` (7.8) ; `apiFetch` (CSRF auto + 401) ; pattern toast `setTimeout(2500)` ; routes dans `App.tsx` (`isAuthenticated ? ... : <Navigate/>` pour les protégées — `/verify-email` doit être **publique**).

### Pièges à éviter

- **Best-effort** sur l'envoi (register + resend) : un échec `emailService` (502) ne doit jamais faire échouer l'inscription ni le resend (réponse générique). `try/catch` + log (comme le seed Free practice / la notif 7.7).
- **`verifyEmail` public mais sous CSRF global** : la `VerifyEmailPage` fait une mutation POST → `apiFetch` injecte `X-CSRF-Token` (récupéré via `GET /csrf-token`). Pas d'`authsess` (le token EST l'autorisation).
- **Rejet générique** : token invalide/expiré/réutilisé → 400 générique (`verifyToken` renvoie `null` pour tous ces cas — indistinguables, anti-oracle).
- **`requireVerified` = 403 normalisé** (légitime non-ownership, comme le « system topic » 403) — ne PAS le collapser en 404.
- **`/verify-email` route publique** : le lien est cliqué depuis l'email, potentiellement **déconnecté**. La page ne doit pas exiger d'auth ; si connecté, rafraîchir `emailVerified` via `patchUser`.
- **emailVerified dans AuthContext** : login doit le renvoyer (sinon le bandeau ne sait pas) ; un user stocké avant 7.9 (sans `emailVerified`) → `undefined` → `=== false` est faux → bandeau non affiché (acceptable ; au prochain login il l'aura). Ne pas afficher le bandeau si `emailVerified === undefined` (seulement `=== false`).
- **Backend CommonJS**, `http-errors`, commentaires EN ; front **TS strict + verbatimModuleSyntax** (`import type`) ; modèles mockés dans les tests. [Source: project-context.md]

### Project Structure Notes

- **NEW** : `backend/middleware/requireverified.js`, `backend/__tests__/requireverified.test.js`, `src/services/verificationService.ts`, `src/components/VerifyEmailBanner.tsx`, `src/pages/VerifyEmailPage.tsx`, tests front.
- **EDIT** : `backend/services/authEmails.js` (sendVerifyEmail), `backend/controllers/usercontroller.js` (register émet le token ; verifyEmail/resendVerification ; emailVerified au login), `backend/routes/auth.js` (routes verify/resend), `src/services/authService.ts` (User.emailVerified), `src/App.tsx` (banner + route /verify-email), tests usercontroller.
- **Pas de migration** (`email_verified` existe), **pas de nouvelle dépendance**.
- ⚠️ **Déploiement** : c'est la story qui **envoie réellement** des emails → les secrets `RESEND_API_KEY`/`EMAIL_FROM`/`APP_BASE_URL` (fail-fast 7.6) doivent être provisionnés sur Fly + domaine Resend vérifié (SPF/DKIM) avant que les emails partent en prod.
- Conventions : middleware/contrôleur minuscules, service front camelCase, page/composant PascalCase. [Source: project-context.md]

### References

- [Source: epics.md#Story 7.9] — ACs (verify_email, soft gate, banner, requireVerified, resend)
- [Source: architecture.md#L270-275] — soft gate, requireVerified sur routes sensibles uniquement, verify flow
- [Source: services/authTokenService.js (7.6), authEmails.js (7.7), middleware/ratelimiters.js (7.4 emailSendLimiter)]
- [Source: models/user.js] — emailVerified (default false), getHandle
- [Source: controllers/usercontroller.js (7.7/7.8)] — createUser/loginUser à étendre
- [Source: src/contexts/AuthContext.tsx (7.8 patchUser), services/apiFetch.ts, App.tsx]
- [Source: story 7.11 (à venir)] — consomme requireVerified + partage VerifyEmailPage

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

- Réutilise intégralement le socle 7.6 (`authTokenService.issueToken/verifyToken` type `verify_email`, `authEmails`, `emailService`) + `emailSendLimiter` (7.4) + `patchUser` (7.8). Pas de migration, pas de dépendance.
- `requireVerified` créé + testé, **non monté** sur une route (consommé par 7.11).
- Best-effort partout (register/resend) : un échec d'envoi/token n'échoue jamais l'inscription ni le resend.
- Tests : back 196 (+11 : verify/resend/register-token/requireverified), front 258 (+7 : banner/page). tsc + lints OK.

### Completion Notes List

- **AC1 (register → token)** : `createUser` émet un token `verify_email` (24 h) + `authEmails.sendVerifyEmail` (best-effort) ; user connecté direct, `emailVerified=false`.
- **AC2 (banner)** : `VerifyEmailBanner` (rendu persistant dans `App` sous le Header) si `emailVerified === false` ; bouton « Resend link » → `verificationService.resend()` (rate-limit `emailSendLimiter`).
- **AC3 (verify)** : `POST /api/auth/verify-email` (public, token) → `User.update({emailVerified:true})` ; `VerifyEmailPage` (route publique `/verify-email`, lit `?token=`) → succès + `patchUser({emailVerified:true})` si connecté → bandeau disparaît.
- **AC4 (requireVerified)** : `middleware/requireverified.js` → 403 normalisé si non vérifié ; créé/testé, non monté (7.11).
- **AC5 (resend/expiré)** : `POST /api/auth/verify-email/resend` (authsess) → nouveau token (best-effort) ; un token used/expiré est rejeté par `verifyToken`.
- **AC6 (tests)** : back (register émet le token, verify valide/invalide/missing, resend non-vérifié/vérifié/401, requireVerified 403/next/401) ; front (banner affiché/masqué + resend, page verify succès/erreur/missing).
- `emailVerified` ajouté à la réponse login + au type `User` front.

### File List

- `backend/services/authEmails.js` (EDIT — sendVerifyEmail)
- `backend/middleware/requireverified.js` (NEW)
- `backend/controllers/usercontroller.js` (EDIT — register émet token, verifyEmail, resendVerification, emailVerified au login)
- `backend/routes/auth.js` (EDIT — routes verify-email + resend)
- `backend/__tests__/usercontroller.test.js` (EDIT — mocks authEmails/authTokenService + tests verify/resend)
- `backend/__tests__/requireverified.test.js` (NEW)
- `src/services/authService.ts` (EDIT — User.emailVerified)
- `src/services/verificationService.ts` (NEW)
- `src/components/VerifyEmailBanner.tsx` (NEW)
- `src/pages/VerifyEmailPage.tsx` (NEW)
- `src/App.tsx` (EDIT — banner + route publique /verify-email)
- `src/__tests__/VerifyEmailBanner.test.tsx` (NEW)
- `src/__tests__/VerifyEmailPage.test.tsx` (NEW)

### Change Log

- 2026-06-25 — Suivi code review : 1 fix (UX). `VerifyEmailPage` — garde **run-once** (`useRef`) pour ne lancer `verify` qu'une fois (neutralise le double-run StrictMode qui rejouait le token consommé → faux « link invalid ») ; sur erreur, si l'utilisateur connecté est **déjà vérifié** → afficher succès (refresh/2ᵉ clic gracieux) + test. Autres findings examinés et écartés (défendables) ; zéro deferred. Front 259 verts.
- 2026-06-25 — Story 7.9 : vérif email + soft gate. Register émet un token `verify_email` (24 h, best-effort) ; user connecté direct `emailVerified=false`. Endpoints `POST /auth/verify-email` (public) + `/verify-email/resend` (authsess + emailSendLimiter). Middleware `requireVerified` (403 normalisé, créé/non monté → 7.11). Front : `VerifyEmailBanner` persistant, `VerifyEmailPage` (route publique), `verificationService`, `emailVerified` dans AuthContext/login. Réutilise le socle 7.6 ; pas de migration. Back 196 / front 258 verts. ⚠️ 1ᵉʳ flux email réellement envoyé → secrets Resend requis sur Fly avant déploiement.
