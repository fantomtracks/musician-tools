---
baseline_commit: be6c8922ad79a11bd8af55accd23d3e5f03f7a9d
---

# Story 7.11: Changer d'email en verify-before-switch

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur vérifié,
I want changer mon email avec confirmation par lien sur la nouvelle adresse,
so that personne ne détourne mon compte via un email non possédé.

## Acceptance Criteria

1. **Demande (verify-before-switch)** — un user **vérifié** (`requireVerified` de 7.9) demande un changement d'email → `pendingEmail` est stocké (l'`email` n'est **jamais** écrasé directement) et un token `change_email` (1 h, usage unique) est envoyé à la **nouvelle** adresse via `emailService`. Le token porte la cible dans son **payload** (`{ pendingEmail }`). Route montée `authsess` + `requireVerified` + rate-limit email (`emailSendLimiter`) (+ CSRF global). [Source: epics.md#Story 7.11 ; architecture.md#L274-275]
2. **Confirmation au clic** — un lien valide (`VerifyEmailPage`, **partagée** avec la vérif d'inscription) → bascule `pendingEmail → email`, `pendingEmail = null`, token marqué `usedAt`. [Source: epics.md#Story 7.11]
3. **Anti-énumération** — une nouvelle adresse **déjà prise** (par un autre compte) ou indisponible → réponse **générique** identique, jamais « email déjà pris » ; le token/email n'est émis que si la nouvelle adresse est libre. [Source: epics.md#Story 7.11 L826-827]
4. **Transition** — tant que le nouveau n'est pas confirmé, le **login reste sur l'ancien email** (`pendingEmail` n'est jamais utilisé pour l'authentification). [Source: epics.md#Story 7.11 L829-830]
5. **Rejet générique** — token expiré/réutilisé/invalide → **400 générique** ; collision d'unicité au moment de la bascule (l'adresse a été prise entre-temps) → générique aussi. [Source: epics.md#Story 7.11 L832]
6. **Tests** — demande → `pendingEmail` posé + email envoyé + `email` **inchangé** ; nouvelle adresse prise → générique sans envoi ni `pendingEmail` ; clic valide → bascule `pendingEmail→email` + `pendingEmail=null` ; token réutilisé → rejet ; `requireVerified` bloque un user non vérifié.

## Tasks / Subtasks

- [x] **Task 1 — `authEmails.sendChangeEmail`** (AC: 1)
  - [x] `backend/services/authEmails.js` : `async function sendChangeEmail(newEmail, token)` → lien `appLink(\`/verify-email?token=${token}&flow=change-email\`)` (réutilise le helper `appLink` de 7.10) ; sujet + html EN (« confirm your new email », expire 1 h). Export.
- [x] **Task 2 — `accountcontroller.requestEmailChange`** (AC: 1, 3, 4)
  - [x] Garde `req.body || {}` ; `newEmail` string, format valide (sinon 400 d'input — pas un oracle d'existence). Charger le user (`User.findByPk(req.session.user)`).
  - [x] **Anti-énumération** : vérifier si `newEmail` est **libre** (`User.findOne({ where: { email: newEmail.trim() } })`). **Si libre** : `user.update({ pendingEmail: newEmail.trim() })` + `issueToken(user.uid, 'change_email', { pendingEmail: newEmail.trim() })` + `authEmails.sendChangeEmail(newEmail, token)` (best-effort). **Si prise** (par un autre compte ou soi-même) : ne rien faire. **Dans les deux cas** : réponse **générique identique** `res.json({ message: CHECK_YOUR_INBOX })`. Ne **jamais** écrire `email` directement.
- [x] **Task 3 — `usercontroller.confirmEmailChange`** (AC: 2, 5)
  - [x] Public, token-based. Garde `req.body || {}` ; `token` requis (sinon 400 générique). `const result = await authTokenService.verifyToken(token, 'change_email')` ; `null` → **400 générique** (`Invalid or expired link`). Récupérer la cible : `const pendingEmail = result.payload && result.payload.pendingEmail` ; si absent → 400 générique. `try { await User.update({ email: pendingEmail, pendingEmail: null }, { where: { uid: result.userUid } }) } catch (uniqueErr) { → 400 générique }` (collision si l'adresse a été prise entre-temps). `res.json({ success: true })`.
- [x] **Task 4 — Routes** (AC: 1, 2)
  - [x] `backend/routes/account.js` : `router.put('/email', authsess, requireVerified, emailSendLimiter, accountController.requestEmailChange)`. Importer `requireVerified` (`../middleware/requireverified`) et `emailSendLimiter`. **(1ᵉʳ montage réel de `requireVerified`.)**
  - [x] `backend/routes/auth.js` : `router.post('/change-email/confirm', uc.confirmEmailChange)` (public ; CSRF global).
- [x] **Task 5 — Front : Profil éditable + VerifyEmailPage partagée** (AC: 1, 2)
  - [x] `src/services/profileService.ts` : `requestEmailChange(newEmail)` (PUT `/account/email`) via `apiFetch`.
  - [x] `src/services/verificationService.ts` : `confirmEmailChange(token)` (POST `/auth/change-email/confirm`) via `apiFetch`.
  - [x] `src/pages/ProfilePage.tsx` : section **email** devient **éditable** (remplace le « managed separately / coming soon » de 7.8) — input nouvelle adresse + bouton → `requestEmailChange` → message **générique** (« If that address is available, we sent a confirmation link to it »), jamais « email pris ». Afficher `pendingEmail` s'il existe (« Pending change to … — check that inbox »). (Le `getProfile` renvoie déjà `email` ; ajouter `pendingEmail` à la réponse `getProfile` + au type `Profile`.)
  - [x] `src/pages/VerifyEmailPage.tsx` : lire `flow = searchParams.get('flow')` ; si `flow === 'change-email'` → `verificationService.confirmEmailChange(token)` (message « Email updated ») ; sinon flux verify-signup inchangé. Garde run-once conservée.
- [x] **Task 6 — Tests** (AC: 6)
  - [x] **Back** `accountcontroller.test.js` : requestEmailChange **adresse libre** → `user.update({pendingEmail})` + `issueToken('change_email', {pendingEmail})` + `sendChangeEmail` + générique ; **adresse prise** → générique, **pas** de update/issue/send ; **`email` jamais modifié** ; format invalide → 400. `usercontroller`/nouveau test : confirmEmailChange token valide → `User.update({email: payload.pendingEmail, pendingEmail: null}, {where:{uid}})` + `{success:true}` ; `verifyToken`→null → 400 ; collision update → 400 générique. (mock models/authTokenService/authEmails ; `requireVerified` déjà testé en 7.9.)
  - [x] **Front** : `profileService.requestEmailChange` / `verificationService.confirmEmailChange` (mock apiFetch) ; `ProfilePage` (soumission email → message générique, `pendingEmail` affiché) ; `VerifyEmailPage` (flow=change-email → confirmEmailChange appelé).
  - [x] Suites back + front + lint, husky vert sans `--no-verify`.

## Dev Notes

### Contexte & design retenu

Change-email **verify-before-switch** : on ne bascule l'`email` qu'après preuve de possession de la **nouvelle** adresse (clic sur le lien qui y est envoyé). Entre-temps, la cible vit dans `pendingEmail` (jamais dans `email`) → le login reste sur l'ancienne adresse. **Dernier consommateur** du socle 7.6 : type ENUM `change_email`, **payload** du token (`{pendingEmail}`), `pendingEmail` (colonne 7.2). **1ᵉʳ montage réel de `requireVerified`** (7.9). [Source: epics.md#Story 7.11 ; architecture.md#L274-275]

> ⚠️ **VerifyEmailPage partagée** : le lien change-email pointe sur `/verify-email?token=…&flow=change-email`. La page branche sur `flow` : `change-email` → `confirmEmailChange`, sinon le flux verify-signup (7.9). Même UI (verifying/success/error).

### Briques réutilisées (lues 2026-06-25)

- **`authTokenService`** : `issueToken(uid, 'change_email', { pendingEmail })` (1 h) ; `verifyToken(clear, 'change_email')` → `{ userUid, payload }`/`null` (atomique, usage unique). **Le payload porte la cible** → la bascule utilise `payload.pendingEmail` (autoritatif pour CE token, robuste si l'utilisateur a redemandé un changement entre-temps).
- **`requireVerified`** (7.9) : à **monter** sur la route de demande (`authsess` d'abord). 403 normalisé si non vérifié.
- **`emailSendLimiter`** (7.4) : par compte (5/h) — la demande de change-email.
- **`authEmails.appLink`** (7.10) : helper de lien (strip slash final) — réutiliser.
- **`User`** : `email` `citext` unique (7.2/7.7) ; `pendingEmail` (`field: pending_email`, 7.2) ; `getHandle` (7.8). Login email-only sur `email` (jamais `pendingEmail`) → AC4 satisfait par construction.
- **`CHECK_YOUR_INBOX`** (7.6) : réponse générique de la demande.
- **Front** : `apiFetch`, `AuthContext.patchUser`, `ProfilePage` (section email en lecture seule à rendre éditable), `VerifyEmailPage` (run-once guard), pattern toast/`input-base`, routes publiques déjà en place (`/verify-email`).

### Pièges à éviter

- **Ne JAMAIS écrire `email` directement à la demande** : seulement `pendingEmail`. La bascule `pendingEmail→email` n'arrive qu'à la confirmation.
- **Anti-énumération à la demande** : réponse **générique identique** que la nouvelle adresse soit libre ou prise ; n'émettre token+email que si libre. Ne jamais renvoyer « email déjà pris ».
- **Payload autoritatif** : la bascule prend `result.payload.pendingEmail` (pas forcément `user.pendingEmail`, qui pourrait avoir été ré-écrasé par une 2ᵉ demande). Garder `user.pendingEmail` pour l'**affichage** seulement.
- **Collision à la confirmation** : `User.update({email})` peut lever une `SequelizeUniqueConstraintError` si l'adresse a été prise entre la demande et le clic → **400 générique** (try/catch).
- **Confirm public** : pas d'`authsess` (le token autorise) ; sous CSRF global → `apiFetch` injecte le token. Rejet générique sur token invalide.
- **Best-effort** sur l'envoi (la demande) ; un échec ne change pas la réponse générique.
- **requireVerified monté APRÈS authsess** sur `PUT /account/email`. (account.js applique `authsess` par route, pas via `router.use`.)
- Backend **CommonJS**, `http-errors`, EN ; front **TS strict** (`import type`) ; modèles mockés. [Source: project-context.md]

### Project Structure Notes

- **EDIT** : `backend/services/authEmails.js` (sendChangeEmail), `backend/controllers/accountcontroller.js` (requestEmailChange + getProfile renvoie pendingEmail), `backend/controllers/usercontroller.js` (confirmEmailChange + export), `backend/routes/account.js` (PUT /email + requireVerified), `backend/routes/auth.js` (confirm route), `src/services/profileService.ts` (requestEmailChange + Profile.pendingEmail), `src/services/verificationService.ts` (confirmEmailChange), `src/pages/ProfilePage.tsx` (email éditable), `src/pages/VerifyEmailPage.tsx` (flow=change-email), tests back + front.
- **Pas de migration** (`pending_email` + ENUM `change_email` existent), **pas de nouvelle dépendance**.
- ⚠️ Envoie réellement des emails → secrets Resend requis sur Fly.
- Conventions : contrôleur/route minuscules, service camelCase. [Source: project-context.md]

### References

- [Source: epics.md#Story 7.11] — ACs (verify-before-switch, pendingEmail, anti-énum, transition, rejet générique)
- [Source: architecture.md#L270-275] — soft gate / requireVerified, verify-before-switch (`pendingEmail` + token `change_email`, bascule au clic)
- [Source: services/authTokenService.js (payload), authEmails.js (appLink 7.10), middleware/requireverified.js (7.9), ratelimiters.js (emailSendLimiter 7.4), constants/messages.js]
- [Source: models/user.js (pendingEmail, email citext), controllers/accountcontroller.js (7.8), usercontroller.js (verifyEmail 7.9)]
- [Source: src/pages/ProfilePage.tsx (email read-only 7.8), VerifyEmailPage.tsx (7.9), services/profileService.ts/verificationService.ts]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

- Dernier consommateur du socle 7.6 : type `change_email`, **payload** du token (`{pendingEmail}` autoritatif), `pendingEmail` (colonne 7.2). **1ᵉʳ montage réel de `requireVerified`** (7.9) sur `PUT /account/email`.
- `email` jamais écrit à la demande (seulement `pendingEmail`) ; bascule `payload.pendingEmail → email` à la confirmation. Login reste sur `email` → AC4 par construction.
- Anti-énum : réponse générique `CHECK_YOUR_INBOX` que l'adresse soit libre ou prise ; token/email émis seulement si libre. Collision d'unicité à la bascule → 400 générique (try/catch).
- `VerifyEmailPage` partagée : branche sur `?flow=change-email`. Tests : back 212 (+8 changeemail), front 265 (+2). tsc + lints OK.

### Completion Notes List

- **AC1** : `PUT /account/email` (authsess + `requireVerified` + `emailSendLimiter`) → `pendingEmail` posé + token `change_email` (1 h, payload `{pendingEmail}`) envoyé à la nouvelle adresse (best-effort). `email` jamais touché.
- **AC2** : `POST /auth/change-email/confirm` (public) → `verifyToken('change_email')` → `User.update({email: payload.pendingEmail, pendingEmail: null})`. `VerifyEmailPage` confirme via `?flow=change-email`.
- **AC3** : adresse prise (ou propre) → même réponse générique, aucun token/email/`pendingEmail` ; jamais « email pris » (back + UI).
- **AC4** : login lit `email` (jamais `pendingEmail`) → ancien email actif jusqu'à confirmation.
- **AC5** : token invalide/expiré/réutilisé/sans payload → 400 générique ; collision d'unicité à la bascule → 400 générique.
- **AC6** : tests back (request libre/prise/format ; confirm valide/null/no-payload/collision/missing) + front (services, ProfilePage générique, VerifyEmailPage flow).
- **Front** : `ProfilePage` section email **éditable** (+ bandeau `pendingEmail`), `profileService.requestEmailChange`, `verificationService.confirmEmailChange`, `getProfile` renvoie `pendingEmail`.

### File List

- `backend/services/authEmails.js` (EDIT — sendChangeEmail)
- `backend/controllers/accountcontroller.js` (EDIT — requestEmailChange + getProfile pendingEmail + imports)
- `backend/controllers/usercontroller.js` (EDIT — confirmEmailChange + export)
- `backend/routes/account.js` (EDIT — PUT /email + requireVerified + emailSendLimiter)
- `backend/routes/auth.js` (EDIT — POST /change-email/confirm)
- `backend/__tests__/changeemail.test.js` (NEW)
- `src/services/profileService.ts` (EDIT — requestEmailChange + Profile.pendingEmail)
- `src/services/verificationService.ts` (EDIT — confirmEmailChange)
- `src/pages/ProfilePage.tsx` (EDIT — email éditable)
- `src/pages/VerifyEmailPage.tsx` (EDIT — flow=change-email)
- `src/__tests__/ProfilePage.test.tsx` (EDIT — change-email + pendingEmail mock)
- `src/__tests__/VerifyEmailPage.test.tsx` (EDIT — flow=change-email)

### Change Log

- 2026-06-25 — Suivi code review : 4 fixes. (1) Oracle d'énumération fermé — `pendingEmail` posé **toujours** (validé par le modèle), token/email seulement si l'adresse est libre → `getProfile` ne fuit plus la disponibilité. (2) `isEmail` ajouté à la colonne `pendingEmail` (pas de migration) + validation à la demande → fini le « lien mort » (valeur acceptée à la demande mais rejetée à la bascule, token déjà consommé) ; `EMAIL_RE` retiré. (3) `VerifyEmailPage` flow change-email : copie dédiée « Email updated » + `confirmEmailChange` renvoie le nouvel email → `patchUser({email})` (plus d'email périmé). (4) `ProfilePage` masque le formulaire email si non vérifié (plus de 403 opaque). 1 deferred (invalidation des tokens périmés). Back 212 / front 265 verts.
- 2026-06-25 — Story 7.11 : change-email verify-before-switch. `PUT /account/email` (authsess+requireVerified+emailSendLimiter, `pendingEmail` + token `change_email` payload, anti-énum générique) + `POST /auth/change-email/confirm` (bascule `payload.pendingEmail→email`, collision→400). `ProfilePage` email éditable, `VerifyEmailPage` partagée (`?flow=change-email`). Réutilise le socle 7.4/7.6/7.9/7.10 ; pas de migration. Back 212 / front 265 verts. ⚠️ Envoie réellement des emails → secrets Resend requis sur Fly.
