---
baseline_commit: 5bb3794e1d7e967ed692154d3111a42ef9d4fe47
---

# Story 7.10: Réinitialiser un mot de passe oublié par email

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur qui a oublié son mot de passe,
I want le réinitialiser par email,
so that je récupère l'accès seul, sans support.

## Acceptance Criteria

1. **Forgot — réponse générique + token si l'email existe** — `ForgotPasswordPage` (pré-auth, via `apiFetch`/CSRF) → `POST /api/auth/forgot-password` : la réponse est **toujours** générique (`CHECK_YOUR_INBOX`) quel que soit l'existence du compte (anti-énumération) ; **si l'email existe**, un token `password_reset` (1 h, usage unique) est émis + envoyé via `emailService`. Rate-limit **5 / h / IP** (`forgotPasswordLimiter` de 7.4). Envoi **best-effort**. [Source: epics.md#Story 7.10 ; architecture.md#L258]
2. **Reset — nouveau mot de passe** — `ResetPasswordPage` (lien email, lit `?token=`) → `POST /api/auth/reset-password` : token valide + nouveau mdp (**≥ 10**, confirmé) → mot de passe changé (**setter bcryptjs**), token marqué `usedAt`, et les **autres sessions du user sont invalidées** (helper unique `sessionService` de 7.8). [Source: epics.md#Story 7.10 ; architecture.md#L153-158]
3. **Rejet générique** — token expiré, réutilisé ou invalide → **400 générique** (`verifyToken` renvoie `null` pour tous ces cas — indistinguables). [Source: epics.md#Story 7.10]
4. **Tests** — forgot sur email inexistant → **200 générique sans envoi** ; forgot sur email existant → 200 générique + token `password_reset` émis + envoyé ; reset token valide → mdp changé + sessions invalidées ; token réutilisé/invalide → rejet 400 ; nouveau mdp < 10 → 400.

## Tasks / Subtasks

- [x] **Task 1 — `authEmails.sendPasswordResetEmail`** (AC: 1)
  - [x] `backend/services/authEmails.js` : `async function sendPasswordResetEmail(email, token)` → lien `${process.env.APP_BASE_URL}/reset-password?token=${token}` ; sujet + html EN (« reset your password », expire 1 h). Export.
- [x] **Task 2 — `forgotPassword` (anti-énumération)** (AC: 1, 3)
  - [x] `backend/controllers/usercontroller.js` `forgotPassword` : garde `req.body || {}` ; `User.findOne({ where: { email: (login.trim) } })` (citext, defaultScope OK). **Si user trouvé**, best-effort : `issueToken(user.uid, 'password_reset')` + `authEmails.sendPasswordResetEmail(user.email, token)`. **Toujours** `res.json({ message: CHECK_YOUR_INBOX })` (jamais d'info sur l'existence ; pas de 4xx selon l'existence). Importer `CHECK_YOUR_INBOX` (`constants/messages`).
- [x] **Task 3 — `resetPassword`** (AC: 2, 3)
  - [x] `usercontroller.resetPassword` : garde `req.body || {}` ; exiger `token` (sinon 400 générique) ; `newPassword` string **≥ 10** (sinon 400) ; `newPassword === confirmPassword` (sinon 400) ; `const result = await authTokenService.verifyToken(token, 'password_reset')` ; `null` → **400 générique** (`Invalid or expired reset link`) ; sinon `User.scope(null).findByPk(result.userUid)` ; `user.update({ password: newPassword })` (setter) ; `await sessionService.invalidateOtherSessions(result.userUid, req.sessionID)` (reset = pré-auth → `req.sessionID` est une session anonyme ≠ session du user → **toutes** les sessions du user sont supprimées, ce qui est voulu) ; `res.json({ success: true })` (jamais le hash).
- [x] **Task 4 — Routes** (AC: 1, 2)
  - [x] `backend/routes/auth.js` : `router.post('/forgot-password', forgotPasswordLimiter, uc.forgotPassword)` ; `router.post('/reset-password', uc.resetPassword)`. Tous deux **publics** (CSRF global). Importer `forgotPasswordLimiter`.
- [x] **Task 5 — Front : service + pages + lien** (AC: 1, 2)
  - [x] `src/services/passwordResetService.ts` : `requestReset(email)` (POST `/auth/forgot-password`) + `reset(token, newPassword, confirmPassword)` (POST `/auth/reset-password`), via `apiFetch` (CSRF auto, `credentials:'include'`), `if(!res.ok) throw`.
  - [x] `src/pages/ForgotPasswordPage.tsx` (route **publique** `/forgot-password`) : champ email → `requestReset` → afficher le **message générique** (« If an account matches… check your inbox »), sans révéler l'existence. Lien retour vers `/login`.
  - [x] `src/pages/ResetPasswordPage.tsx` (route **publique** `/reset-password`) : lit `?token=` (`useSearchParams`) ; champs new password + confirm (miroir `≥10` + match) → `reset(token, …)` → succès : message + `Link` vers `/login` ; échec : message générique. (Pas de token dans l'URL → message d'erreur.)
  - [x] Routes dans `App.tsx` : `/forgot-password` et `/reset-password` **publiques**. `src/pages/LoginPage.tsx` : ajouter un lien **« Forgot password? »** (vers `/forgot-password`).
- [x] **Task 6 — Tests** (AC: 4)
  - [x] **Back** (mock `../models`, `../services/authTokenService`, `../services/authEmails`, `../services/sessionService`) : forgot **email inexistant** (`User.findOne`→null) → 200 `{message: CHECK_YOUR_INBOX}` + **aucun** `issueToken`/`sendPasswordResetEmail` ; forgot **email existant** → 200 même message + `issueToken('password_reset')` + `sendPasswordResetEmail` ; reset token valide → `user.update({password})` + `invalidateOtherSessions(uid, sessionID)` + `{success:true}` ; `verifyToken`→null → 400 ; newPassword < 10 → 400 ; mismatch → 400.
  - [x] **Front** : `passwordResetService` (mock apiFetch) ; `ForgotPasswordPage` (submit → message générique) ; `ResetPasswordPage` (token+mdp valides → reset appelé ; <10 → erreur client ; pas de token → erreur). (Testing Library.)
  - [x] Suites back + front + lint, husky vert sans `--no-verify`.

## Dev Notes

### Contexte & design retenu

Reset self-service par email, **anti-énumération** : la réponse forgot est **identique** que l'email existe ou non (`CHECK_YOUR_INBOX`) — c'est enfin le **consommateur** prévu de ce constant (7.6). Réutilise **tout** le socle : `authTokenService` (`password_reset`, 1 h, usage unique), `authEmails`, `emailService`, `forgotPasswordLimiter` (7.4), `sessionService.invalidateOtherSessions` (7.8), `verifyToken` (rejet générique des tokens used/expirés). Flux **pré-auth** (forgot/reset publics). [Source: epics.md#Story 7.10 ; architecture.md#Format Patterns]

**Différentiel résiduel assumé** : seul un email existant déclenche un envoi → léger oracle de **timing/délivrance**, accepté à l'échelle beta (cohérent avec 7.7). La réponse HTTP, elle, est strictement identique.

### Briques réutilisées (lues 2026-06-25)

- **`authTokenService`** : `issueToken(uid, 'password_reset')` (1 h) ; `verifyToken(clear, 'password_reset')` → `{userUid}`/`null` (atomique, usage unique, marque `usedAt`).
- **`authEmails`** : `sendSignupAttemptNotice`, `sendVerifyEmail` existent ; **ajouter** `sendPasswordResetEmail`. emailService = seul point d'envoi.
- **`forgotPasswordLimiter`** (7.4) : 5/h/**IP** (keyGenerator par défaut), 429 générique — exactement le forgot (pré-auth, pas de compte → clé IP).
- **`sessionService.invalidateOtherSessions(userUid, currentSid)`** (7.8) : prod-only (table `session` Postgres ; no-op dev). En reset pré-auth, `req.sessionID` est anonyme → supprime **toutes** les sessions du user (aucune ne match l'anonyme) = déconnexion globale voulue après reset.
- **`CHECK_YOUR_INBOX`** (`constants/messages`, 7.6) : message générique unique — l'utiliser ici.
- **`User`** : login email-only `citext` (7.7) → `findOne({where:{email}})` insensible à la casse ; setter bcryptjs ; `scope(null)` pour charger le hash (mais reset n'a pas besoin de comparer — on **écrit** juste le nouveau ; `scope(null)` ou défaut indifférent pour l'update, prendre le défaut suffit pour `findByPk` puis `update({password})`).
- **Front** : `apiFetch` (CSRF auto + 401), routes publiques dans `App.tsx` (cf. `/verify-email` 7.9), `LoginPage` pour le lien, pattern toast/`input-base`.

### Pièges à éviter

- **Anti-énumération STRICTE** : `forgotPassword` renvoie **toujours** 200 `{message: CHECK_YOUR_INBOX}` — jamais un 404/400 selon l'existence, jamais « email inconnu ». Le rate-limit/validation d'input ne doit pas créer d'oracle (un email malformé peut renvoyer le même message générique, ou un 400 d'input neutre — privilégier le message générique).
- **Best-effort** sur l'émission/envoi : un échec ne change pas la réponse générique.
- **Reset générique** : token invalide/expiré/réutilisé → 400 générique unique (`verifyToken`→null couvre tout).
- **Invalidation après reset** : déconnecter toutes les sessions du user (sécurité — le mdp a changé). `invalidateOtherSessions(userUid, req.sessionID)` avec un `req.sessionID` anonyme supprime bien toutes les sessions du user.
- **Pages publiques** : `/forgot-password` et `/reset-password` accessibles **déconnecté** (comme `/verify-email`). Ne pas les gater derrière `isAuthenticated`.
- **`scope(null)` pour update password** : le setter hashe ; ne jamais renvoyer le hash. (Pour l'`update`, charger l'instance suffit ; `findByPk` défaut convient — on n'a pas besoin de lire l'ancien hash.)
- Backend **CommonJS**, `http-errors`, EN ; front **TS strict + verbatimModuleSyntax** (`import type`) ; modèles mockés dans les tests. [Source: project-context.md]

### Project Structure Notes

- **NEW** : `src/services/passwordResetService.ts`, `src/pages/ForgotPasswordPage.tsx`, `src/pages/ResetPasswordPage.tsx`, tests front, tests back (dans `usercontroller.test.js` ou un nouveau fichier).
- **EDIT** : `backend/services/authEmails.js` (sendPasswordResetEmail), `backend/controllers/usercontroller.js` (forgotPassword/resetPassword + export), `backend/routes/auth.js` (routes), `src/App.tsx` (2 routes publiques), `src/pages/LoginPage.tsx` (lien Forgot password).
- **Pas de migration, pas de nouvelle dépendance.** ⚠️ Envoie réellement des emails (comme 7.9) → secrets Resend requis sur Fly avant déploiement.
- Conventions : contrôleur/route minuscules, service front camelCase, pages PascalCase. [Source: project-context.md]

### References

- [Source: epics.md#Story 7.10] — ACs (forgot générique, reset, invalidation, rejet générique)
- [Source: architecture.md#L153-158 (invalidation/bcryptjs), #L258 (anti-énumération CHECK_YOUR_INBOX)]
- [Source: services/authTokenService.js (7.6), authEmails.js (7.7/7.9), sessionService.js (7.8), middleware/ratelimiters.js (7.4 forgotPasswordLimiter), constants/messages.js (7.6)]
- [Source: controllers/usercontroller.js (7.7 login citext), models/user.js (setter bcryptjs)]
- [Source: src/services/apiFetch.ts, App.tsx (/verify-email public 7.9), pages/LoginPage.tsx]
- [Source: story 7.9] — patterns front pages publiques + service email

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context)

### Debug Log References

- Réutilise le socle : `authTokenService` (`password_reset` 1 h), `authEmails`, `forgotPasswordLimiter` (7.4, 5/h/IP), `sessionService.invalidateOtherSessions` (7.8), `CHECK_YOUR_INBOX` (7.6, 1ᵉʳ consommateur). Pas de migration, pas de dépendance.
- Anti-énumération stricte : `forgotPassword` renvoie toujours `{ message: CHECK_YOUR_INBOX }` (même corps que le compte existe ou non).
- Reset pré-auth : `invalidateOtherSessions(userUid, req.sessionID)` avec `req.sessionID` anonyme → supprime **toutes** les sessions du user (voulu). Best-effort.
- Tests : back 204 (+8 passwordreset), front 263 (+4 pages). tsc + lints OK.

### Completion Notes List

- **AC1 (forgot)** : `POST /auth/forgot-password` (public, `forgotPasswordLimiter`) → toujours `CHECK_YOUR_INBOX` ; si l'email existe (`User.findOne` citext), token `password_reset` (1 h) émis + envoyé (best-effort). `ForgotPasswordPage` (public) affiche le message générique.
- **AC2 (reset)** : `POST /auth/reset-password` (public, token) → `verifyToken` → `user.update({password})` (setter bcryptjs) + invalidation des sessions ; jamais le hash. `ResetPasswordPage` (public, `?token=`, miroir ≥10 + confirm).
- **AC3 (rejet générique)** : token invalide/expiré/réutilisé → 400 unique (`verifyToken`→null) ; mdp<10 / mismatch / token absent → 400.
- **AC4 (tests)** : forgot inexistant → 200 sans envoi ; existant → 200 + token+email ; reset valide → update + invalidate(uid,sid) + pas de hash ; token invalide/réutilisé → 400 ; <10/mismatch/missing → 400 ; front (forgot générique, reset valide/<10/no-token).
- **Front** : `passwordResetService` (apiFetch) ; lien « Forgot password? » dans `LoginPage` ; routes publiques `/forgot-password` + `/reset-password`.

### File List

- `backend/services/authEmails.js` (EDIT — sendPasswordResetEmail)
- `backend/controllers/usercontroller.js` (EDIT — forgotPassword/resetPassword + imports sessionService/CHECK_YOUR_INBOX)
- `backend/routes/auth.js` (EDIT — routes forgot/reset + forgotPasswordLimiter)
- `backend/__tests__/passwordreset.test.js` (NEW)
- `src/services/passwordResetService.ts` (NEW)
- `src/pages/ForgotPasswordPage.tsx` (NEW)
- `src/pages/ResetPasswordPage.tsx` (NEW)
- `src/App.tsx` (EDIT — routes publiques forgot/reset)
- `src/pages/LoginPage.tsx` (EDIT — lien Forgot password)
- `src/__tests__/ForgotPasswordPage.test.tsx` (NEW)
- `src/__tests__/ResetPasswordPage.test.tsx` (NEW)

### Change Log

- 2026-06-25 — Suivi code review : 3 fixes ciblés. (1) `resetPassword` repasse en `User.findByPk` defaultScope (ne plus copier l'exception `scope(null)` réservée au login — il n'écrit que le mdp). (2) `authEmails` : helper `appLink(path)` qui strip le slash final d'`APP_BASE_URL` (plus de `app//…`) et centralise la construction des liens (verify/reset/login). (3) `passwordResetService.reset` ne parse plus le body d'erreur (convention front `if(!res.ok) throw`). 1 deferred (validation mdp triplée + paire issueToken+send, cross-story). Back 204 / front 263 verts.
- 2026-06-25 — Story 7.10 : reset mot de passe par email. `POST /auth/forgot-password` (anti-énum strict `CHECK_YOUR_INBOX`, forgotPasswordLimiter, token password_reset 1 h best-effort) + `POST /auth/reset-password` (verifyToken → setter bcryptjs → invalidation des sessions). Front `ForgotPasswordPage`/`ResetPasswordPage` (publiques) + `passwordResetService` + lien LoginPage. Réutilise le socle 7.4/7.6/7.8 ; pas de migration. Back 204 / front 263 verts. ⚠️ Envoie réellement des emails → secrets Resend requis sur Fly.
